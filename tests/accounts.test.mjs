import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { account, timelineText } from './fixtures.mjs';
import { authorizeWith, mockMastodon, respond, signOut } from './mastodon_mock.mjs';
import { createStaticServer } from './server.mjs';
import { collectPageErrors } from './harness.mjs';

let staticServer;
let origin;
let browser;

before(async () => {
  ({ server: staticServer, origin } = await createStaticServer());
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => staticServer?.close(resolve));
});

/** The server: `server.verifyCredentials` makes the start fail with a status, or with no answer at all ('offline'). */
async function mockServer(context) {
  const server = { tokenExchanges: 0, revocations: 0, verifyCredentials: 200 };
  await mockMastodon(context, origin, {
    '/oauth/authorize': authorizeWith(origin, 'code-for-token-alice'),
    '/oauth/token': ({ body }) => {
      server.tokenExchanges++;
      const code = new URLSearchParams(typeof body === 'string' ? body : '').get('code') ?? '';
      return { access_token: code.replace('code-for-', ''), token_type: 'Bearer', scope: 'read write follow' };
    },
    '/oauth/revoke': () => { server.revocations++; return {}; },
    '/api/v1/accounts/verify_credentials': async ({ route }) => {
      if (server.verifyCredentials === 'offline') return void await route.abort('internetdisconnected');
      if (server.verifyCredentials !== 200) return respond(server.verifyCredentials, { error: 'failed' });
      return account;
    },
  });

  return server;
}

/** Signs in with "stay signed in" checked. */
async function signIn(page) {
  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-remember').check();
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).waitFor();
}

test('"stay signed in" resumes the account in a new tab without OAuth; signing out from the account menu forgets it', { timeout: 60_000 }, async () => {
  const context = await browser.newContext();
  const pageErrors = [];

  const server = await mockServer(context);

  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // Log in as alice with "Stay signed in" checked.
  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-remember').check();
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).waitFor();
  assert.equal(server.tokenExchanges, 1);

  // A brand-new tab with no session yet silently resumes the remembered account.
  const freshPage = await context.newPage();
  freshPage.on('pageerror', (error) => pageErrors.push(error.message));
  await freshPage.goto(origin);
  await freshPage.getByText(timelineText).waitFor();
  assert.equal(server.tokenExchanges, 1);
  await freshPage.close();

  // Signing out from the account menu revokes the token and forgets the account.
  await signOut(page);
  await page.waitForURL(`${origin}/login`);
  await page.locator('#teadeck-login').waitFor();
  assert.equal(server.revocations, 1);
  assert.deepEqual(await page.locator('#teadeck-account-list li').allTextContents(), []);

  const afterLogout = await context.newPage();
  await afterLogout.goto(origin);
  await afterLogout.locator('#teadeck-login').waitFor();
  assert.equal(await afterLogout.getByText(timelineText).count(), 0);
  await afterLogout.close();

  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('a tab that cannot read the account store keeps the remembered account for the next one', { timeout: 60_000 }, async () => {
  const context = await browser.newContext();
  await mockServer(context);
  const page = await context.newPage();
  await signIn(page);
  const activeKey = await page.evaluate(() => localStorage.getItem('teadeck.activeAccount'));
  assert.ok(activeKey);

  const broken = await context.newPage();
  await broken.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, ...rest) {
      if (name !== 'teadeck-accounts') return open.call(this, name, ...rest);
      const request = {};
      setTimeout(() => request.onerror?.());
      return request;
    };
  });
  await broken.goto(origin);
  await broken.locator('#teadeck-login').waitFor();
  assert.equal(await broken.evaluate(() => localStorage.getItem('teadeck.activeAccount')), activeKey);
  await broken.close();

  const fresh = await context.newPage();
  await fresh.goto(origin);
  await fresh.getByText(timelineText).waitFor();
  await context.close();
});

test('a server that fails while starting leaves the account signed in and offers to try again', { timeout: 90_000 }, async () => {
  const context = await browser.newContext({ locale: 'en-US' });
  const server = await mockServer(context);
  const page = await context.newPage();
  const pageErrors = collectPageErrors(page);
  await signIn(page);
  const path = new URL(page.url()).pathname;

  for (const failure of [502, 'offline']) {
    server.verifyCredentials = failure;
    await page.reload();
    await page.locator('#teadeck-retry').waitFor();
    assert.equal(new URL(page.url()).pathname, path);
    assert.match(await page.locator('#teadeck-status').textContent(), /could not be reached\. You are still signed in/);
    assert.equal(await page.locator('#teadeck-login').isVisible(), false);
  }
  server.verifyCredentials = 200;
  await page.locator('#teadeck-retry').click();
  await page.getByText(timelineText).waitFor();

  // Signing out while the server is unreachable still forgets the remembered account.
  server.verifyCredentials = 'offline';
  await page.reload();
  await page.locator('#teadeck-start-failed .teadeck-sign-out').click();
  await page.locator('#teadeck-login').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('teadeck.activeAccount')), null);
  assert.deepEqual(await page.locator('#teadeck-account-list li').allTextContents(), []);

  // A token the server rejects means signing in again.
  server.verifyCredentials = 200;
  await signIn(page);
  server.verifyCredentials = 401;
  await page.reload();
  await page.locator('#teadeck-login').waitFor();
  assert.equal(new URL(page.url()).pathname, '/login');
  assert.equal(await page.locator('#teadeck-start-failed').isVisible(), false);
  assert.equal(await page.locator('#teadeck-reset').isVisible(), true);

  assert.deepEqual(pageErrors, []);
  await context.close();
});
