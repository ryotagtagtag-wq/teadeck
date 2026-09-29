import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { account, instance, status, timelineText } from './fixtures.mjs';
import { createStaticServer } from './server.mjs';

let browser;

before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const policy = {
  for_not_following: 'accept', for_not_followers: 'accept', for_new_accounts: 'accept',
  for_private_mentions: 'accept', for_limited_accounts: 'filter', for_bots: 'accept',
  summary: { pending_requests_count: 0, pending_notifications_count: 0 },
};

async function signedInPage(origin) {
  const context = await browser.newContext({ locale: 'de-DE' });
  await context.route('https://mastodon.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/oauth/authorize') {
      const callback = new URL('/oauth/callback', origin);
      callback.search = new URLSearchParams({ code: 'browser-code', state: url.searchParams.get('state') ?? '' });
      return route.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(callback.href)})</script>` });
    }
    let body = [];
    if (url.pathname === '/api/v1/apps') body = { client_id: 'browser-client', client_secret: 'browser-secret' };
    else if (url.pathname === '/oauth/token') body = { access_token: 'browser-token', token_type: 'Bearer', scope: 'read write follow' };
    else if (url.pathname === '/api/v2/instance') body = instance;
    else if (['/api/v1/accounts/verify_credentials', '/api/v1/accounts/lookup', `/api/v1/accounts/${account.id}`].includes(url.pathname)) body = account;
    else if (url.pathname === '/api/v1/preferences') body = {};
    else if (url.pathname === '/api/v1/timelines/home') body = [status];
    else if (url.pathname === '/api/v2/notifications') body = { notification_groups: [], accounts: [], statuses: [] };
    else if (url.pathname === '/api/v2/notifications/policy') body = policy;
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).waitFor();
  return { context, page };
}

/** Polls an async page function; Playwright's waitForFunction treats the returned promise itself as truthy. */
async function waitUntil(page, predicate, arg, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (!(await page.evaluate(predicate, arg))) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${predicate}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** Waits until the service worker controls the page, i.e. installation (caching the app) has completed. */
async function waitForOfflineReady(page, version) {
  await waitUntil(page, async (expected) => {
    const registration = await navigator.serviceWorker.getRegistration();
    const scriptVersion = registration?.active && navigator.serviceWorker.controller
      ? (await caches.keys()).find((name) => name.startsWith('teadeck-core-'))
      : undefined;
    return expected ? scriptVersion === `teadeck-core-${expected}` : Boolean(scriptVersion);
  }, version);
}

async function stop(server) {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

test('after the first start the app runs without the Teadeck web server', { timeout: 120_000 }, async () => {
  const { server, origin } = await createStaticServer();
  const { context, page } = await signedInPage(origin);
  try {
    await waitForOfflineReady(page);

    // Emoji images arrive in the background, without holding up the start.
    await waitUntil(page, async () => Boolean(await (await caches.open('teadeck-background')).match('/emoji/1f600.svg')));

    await stop(server);

    // Reload and open a view whose code is loaded lazily, both with the web server gone.
    await page.reload();
    await page.getByText(timelineText).waitFor();
    await page.locator(`a[href="/@${account.acct}"]`).first().click();
    await page.getByText('Test account').first().waitFor();
    const emojiStatus = await page.evaluate(() => fetch('/emoji/1f600.svg').then((response) => response.status));
    assert.equal(emojiStatus, 200);

    // A new tab starts offline as well (without "Stay signed in" it has no session: the sign-in page).
    const secondTab = await context.newPage();
    await secondTab.goto(`${origin}/home`);
    await secondTab.locator('#teadeck-login').waitFor();
  } finally {
    await context.close();
    server.closeAllConnections();
    server.close();
  }
});

test('a new deploy is offered during the session and used after the reload button', { timeout: 120_000 }, async () => {
  const dist = join(import.meta.dirname, '..', 'dist');
  const currentManifest = (await readdir(dist)).find((file) => /^offline-[0-9a-f]+\.json$/.test(file));
  const currentVersion = currentManifest.slice('offline-'.length, -'.json'.length);
  const nextVersion = 'feedfacefeedface';
  let deployed = false;
  const { server, origin } = await createStaticServer({
    // Simulated deploy: same files, new version number.
    override: async (pathname, read) => {
      if (!deployed) return undefined;
      if (pathname === '/sw.js') return { type: 'text/javascript', body: (await read('sw.js')).toString().replaceAll(currentVersion, nextVersion) };
      if (pathname === `/offline-${nextVersion}.json`) return { type: 'application/json', body: await read(currentManifest) };
      return undefined;
    },
  });
  const { context, page } = await signedInPage(origin);
  try {
    await waitForOfflineReady(page);

    deployed = true;
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
    const reload = page.locator('#teadeck-update-reload');
    await reload.waitFor({ timeout: 60_000 });
    // Stays visible (Mastodon's own alerts disappear after 5 seconds).
    await page.waitForTimeout(6_000);
    assert.equal(await reload.isVisible(), true);
    await Promise.all([page.waitForEvent('load'), reload.click()]);
    await page.getByText(timelineText).waitFor();

    const cacheNames = await page.evaluate(() => caches.keys());
    assert.ok(cacheNames.includes(`teadeck-core-${nextVersion}`));
    assert.ok(!cacheNames.includes(`teadeck-core-${currentVersion}`), 'the previous version\'s cache is removed');
    assert.equal(await page.locator('#teadeck-update').isHidden(), true);
  } finally {
    await context.close();
    await stop(server);
  }
});
