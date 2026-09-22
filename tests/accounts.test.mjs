import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { account, instance, status, timelineText } from './fixtures.mjs';
import { createStaticServer } from './server.mjs';

let server;
let origin;
let browser;

before(async () => {
  ({ server, origin } = await createStaticServer());
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

test('"stay signed in" resumes the account in a new tab without OAuth; signing out from the compose column forgets it', { timeout: 60_000 }, async () => {
  const context = await browser.newContext();
  let tokenExchanges = 0;
  let revocations = 0;
  const pageErrors = [];

  await context.route('https://mastodon.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/oauth/authorize') {
      const callback = new URL('/oauth/callback', origin);
      callback.search = new URLSearchParams({ code: 'code-for-token-alice', state: url.searchParams.get('state') ?? '' });
      return route.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(callback.href)})</script>` });
    }
    let body;
    if (url.pathname === '/api/v1/apps') body = { client_id: 'browser-client', client_secret: 'browser-secret' };
    else if (url.pathname === '/oauth/token') {
      tokenExchanges++;
      const code = new URLSearchParams(request.postData() ?? '').get('code') ?? '';
      body = { access_token: code.replace('code-for-', ''), token_type: 'Bearer', scope: 'read write follow' };
    }
    else if (url.pathname === '/oauth/revoke') { revocations++; body = {}; }
    else if (url.pathname === '/api/v2/instance') body = instance;
    else if (url.pathname === '/api/v1/accounts/verify_credentials') body = account;
    else if (url.pathname === '/api/v1/preferences') body = {};
    else if (url.pathname === '/api/v1/timelines/home') body = [status];
    else if (url.pathname === '/api/v2/notifications') body = { notification_groups: [], accounts: [], statuses: [] };
    else if (url.pathname === '/api/v2/notifications/policy') body = {
      for_not_following: 'accept', for_not_followers: 'accept', for_new_accounts: 'accept',
      for_private_mentions: 'accept', for_limited_accounts: 'filter', for_bots: 'accept',
      summary: { pending_requests_count: 0, pending_notifications_count: 0 },
    };
    else body = [];
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  });

  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // Log in as alice with "Angemeldet bleiben" checked.
  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-remember').check();
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).waitFor();
  assert.equal(tokenExchanges, 1);

  // A brand-new tab with no session yet silently resumes the remembered account.
  const freshPage = await context.newPage();
  freshPage.on('pageerror', (error) => pageErrors.push(error.message));
  await freshPage.goto(origin);
  await freshPage.getByText(timelineText).waitFor();
  assert.equal(tokenExchanges, 1);
  await freshPage.close();

  // Signing out ("Abmelden" below "Einstellungen" and "Mehr", then confirm) revokes the token and forgets the account.
  await page.locator('.teadeck-logout').click();
  await page.locator('.modal-root').getByRole('button', { name: /^(Abmelden|Log out)$/ }).click();
  await page.waitForURL(`${origin}/login`);
  await page.locator('#teadeck-login').waitFor();
  assert.equal(revocations, 1);
  assert.deepEqual(await page.locator('#teadeck-account-list li').allTextContents(), []);

  const afterLogout = await context.newPage();
  await afterLogout.goto(origin);
  await afterLogout.locator('#teadeck-login').waitFor();
  assert.equal(await afterLogout.getByText(timelineText).count(), 0);
  await afterLogout.close();

  assert.deepEqual(pageErrors, []);
  await context.close();
});
