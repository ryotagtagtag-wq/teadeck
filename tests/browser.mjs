import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { account, instance, status, timelineText } from './fixtures.mjs';
import { openPreferences, signOut } from './mastodon_mock.mjs';
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

test('static SPA completes OAuth and renders the Mastodon home timeline', { timeout: 60_000 }, async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const localApiRequests = [];
  const pageErrors = [];
  let tokenExchanges = 0;

  await page.addInitScript(() => {
    window.__teadeckServiceWorkers = [];
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register = (...args) => {
        window.__teadeckServiceWorkers.push(args);
        return Promise.reject(new Error('Unexpected service worker registration'));
      };
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === origin && url.pathname.startsWith('/api/')) localApiRequests.push(url.href);
  });

  await page.route('https://mastodon.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/oauth/authorize') {
      const callback = new URL('/oauth/callback', origin);
      callback.search = new URLSearchParams({ code: 'browser-code', state: url.searchParams.get('state') ?? '' });
      return route.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(callback.href)})</script>` });
    }
    let body;
    if (url.pathname === '/api/v1/apps') body = { client_id: 'browser-client', client_secret: 'browser-secret' };
    else if (url.pathname === '/oauth/token') { tokenExchanges++; body = { access_token: 'browser-token', token_type: 'Bearer', scope: 'read write follow' }; }
    else if (url.pathname === '/oauth/revoke') body = {};
    else if (url.pathname === '/api/v2/instance') body = instance;
    else if (url.pathname === '/api/v1/accounts/verify_credentials') body = account;
    else if (url.pathname === '/api/v1/preferences') body = { 'posting:default:visibility': 'private', 'posting:default:language': 'de' };
    else if (url.pathname === '/api/v1/timelines/home') body = [status];
    else if (url.pathname === '/api/v1/markers') body = {};
    else if (url.pathname === '/api/v2/notifications') body = { notification_groups: [], accounts: [], statuses: [] };
    else if (url.pathname === '/api/v2/notifications/policy') body = {
      for_not_following: 'accept', for_not_followers: 'accept', for_new_accounts: 'accept',
      for_private_mentions: 'accept', for_limited_accounts: 'filter', for_bots: 'accept',
      summary: { pending_requests_count: 0, pending_notifications_count: 0 },
    };
    else body = [];
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  });

  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).waitFor();
  assert.equal(tokenExchanges, 1);

  await page.reload();
  await page.getByText(timelineText).waitFor();
  // The former top bar is gone: layout lives in the settings page, sign-out in the navigation list.
  assert.equal(await page.locator('#teadeck-bar').count(), 0);
  await openPreferences(page);
  await page.getByLabel('Layout').selectOption('advanced');
  // Layout is saved immediately and takes effect through the offered reload.
  await page.locator('#teadeck-settings-reload').getByRole('button').click();
  await page.waitForURL(`${origin}/deck/preferences`);
  await page.goto(origin);
  await page.waitForURL(`${origin}/deck/home`);
  await page.getByText(timelineText).first().waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage[Object.keys(localStorage).find((key) => key.endsWith(':advancedLayout'))]).valueOf()), true);
  assert.equal(await page.locator('a[href="https://git.knubbel.me/Teadeck/teadeck"]').count() > 0, true);

  await signOut(page);
  await page.waitForURL(`${origin}/login`);
  await page.locator('#teadeck-login').waitFor();
  assert.deepEqual(localApiRequests, []);
  // Only Teadeck's own offline service worker, not upstream's (which targets a Rails server).
  assert.deepEqual((await page.evaluate(() => window.__teadeckServiceWorkers)).map(([url]) => url).filter(url => url !== '/sw.js'), []);
  assert.deepEqual(pageErrors, []);
  await context.close();
});
