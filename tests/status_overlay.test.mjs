import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { account, instance, status, timelineText } from './fixtures.mjs';
import { createStaticServer } from './server.mjs';

const replyText = 'A reply shown in the thread 5c1e';
const longParagraphs = Array.from({ length: 60 }, (_, index) => `<p>Line ${index} of a long reply</p>`).join('');
const reply = { ...status, id: '101', in_reply_to_id: status.id, in_reply_to_account_id: account.id, content: `<p>${replyText}</p>${longParagraphs}` };

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

test('a post opens with its thread in an overlay, from its own button or, when chosen, from its time', { timeout: 120_000 }, async () => {
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
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
    else if (url.pathname === '/api/v1/accounts/verify_credentials') body = account;
    else if (url.pathname === '/api/v1/preferences') body = {};
    else if (url.pathname === '/api/v1/timelines/home') body = [status];
    else if (url.pathname === `/api/v1/statuses/${status.id}`) body = status;
    else if (url.pathname === `/api/v1/statuses/${status.id}/context`) body = { ancestors: [], descendants: [reply] };
    else if (url.pathname === `/api/v1/statuses/${reply.id}`) body = reply;
    else if (url.pathname === `/api/v1/statuses/${reply.id}/context`) body = { ancestors: [status], descendants: [] };
    else if (url.pathname === '/api/v2/notifications') body = { notification_groups: [], accounts: [], statuses: [] };
    else if (url.pathname === '/api/v2/notifications/policy') body = {
      for_not_following: 'accept', for_not_followers: 'accept', for_new_accounts: 'accept',
      for_private_mentions: 'accept', for_limited_accounts: 'filter', for_bots: 'accept',
      summary: { pending_requests_count: 0, pending_notifications_count: 0 },
    };
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).first().waitFor();
  const home = new URL(page.url()).pathname;
  const post = page.locator('.status').filter({ hasText: timelineText }).first();
  const overlay = page.locator('.teadeck-status-overlay');

  // Off (the default): the time opens the post view as before; a button of its own opens the overlay.
  await post.getByRole('button', { name: 'Open in overlay' }).click();
  await overlay.getByText(replyText).waitFor();
  assert.equal(await overlay.getByText(timelineText).count() > 0, true);
  assert.equal(new URL(page.url()).pathname, home);

  // A long reply in the thread is shown in full in the overlay, not in the post view behind it.
  await overlay.locator('.status__content__read-more-button').first().click();
  await overlay.locator('.detailed-status').getByText('Line 59 of a long reply').waitFor();
  assert.equal(new URL(page.url()).pathname, home);

  await overlay.getByRole('button', { name: 'Close' }).click();
  await overlay.waitFor({ state: 'detached' });
  assert.equal(new URL(page.url()).pathname, home);

  await post.locator('.status__relative-time').click();
  await page.waitForURL(`${origin}/@${account.acct}/${status.id}`);
  assert.equal(await overlay.count(), 0);

  // On: the time opens the overlay, and the extra button is gone.
  await page.locator('a[href="/preferences"]').first().click();
  await page.locator('#teadeck-settings-status-overlay').check();
  await page.locator('a[href="/home"]').first().click();
  await page.getByText(timelineText).first().waitFor();
  assert.equal(await post.getByRole('button', { name: 'Open in overlay' }).count(), 0);
  await post.locator('.status__relative-time').click();
  await overlay.getByText(replyText).waitFor();
  assert.equal(new URL(page.url()).pathname, home);
  await page.keyboard.press('Escape');
  await overlay.waitFor({ state: 'detached' });

  // Remembered for this account.
  await page.reload();
  await page.getByText(timelineText).first().waitFor();
  await post.locator('.status__relative-time').click();
  await overlay.getByText(replyText).waitFor();

  assert.deepEqual(pageErrors, []);
  await context.close();
});
