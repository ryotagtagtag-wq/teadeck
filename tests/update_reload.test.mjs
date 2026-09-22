import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { shouldReloadForUpdate } from '../integration/update_reload.ts';
import { account, instance, status, timelineText } from './fixtures.mjs';
import { createStaticServer } from './server.mjs';

test('reloads at most once per 30 seconds', () => {
  assert.equal(shouldReloadForUpdate(0, Date.now()), true);
  assert.equal(shouldReloadForUpdate(1_000, 20_000), false);
  assert.equal(shouldReloadForUpdate(1_000, 31_000), true);
});

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

test('a lazily loaded view missing after a redeploy reloads the page instead of failing', { timeout: 60_000 }, async () => {
  // The last resort when a chunk is nowhere, not even in the offline cache (which would otherwise
  // serve it; see production.test.mjs): without a service worker.
  const context = await browser.newContext({ locale: 'de-DE', serviceWorkers: 'block' });
  const page = await context.newPage();
  const policy = {
    for_not_following: 'accept', for_not_followers: 'accept', for_new_accounts: 'accept',
    for_private_mentions: 'accept', for_limited_accounts: 'filter', for_bots: 'accept',
    summary: { pending_requests_count: 0, pending_notifications_count: 0 },
  };

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

  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).waitFor();

  // Like nginx after a redeploy: the old chunk is gone, the server answers with an HTML 404 page.
  let staleChunkRequests = 0;
  await context.route(/\/account_timeline-[^/]+\.js$/, async (route) => {
    staleChunkRequests++;
    if (staleChunkRequests === 1) return route.fulfill({ status: 404, contentType: 'text/html', body: '<html>404 Not Found</html>' });
    return route.continue();
  });
  let loads = 0;
  page.on('load', () => loads++);

  await page.locator(`a[href="/@${account.acct}"]`).first().click();
  await page.waitForURL(`${origin}/@${account.acct}`);
  await page.getByText('Test account').first().waitFor();
  assert.equal(staleChunkRequests >= 2, true);
  assert.equal(loads, 1);

  await context.close();
});
