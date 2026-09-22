import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { account, instance, secondAccount, status, timelineText } from './fixtures.mjs';
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

test('favouriting, boosting and replying to a status all go through Teadeck\'s patched API layer', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // Reply to someone else's post, not your own, to keep the reply's prefilled
  // mention meaningful.
  const otherStatus = { ...status, account: secondAccount, uri: 'https://mastodon.test/users/bob/statuses/100', url: 'https://mastodon.test/@bob/100' };
  const favouriteCalls = [];
  const reblogCalls = [];
  let publishedStatus;

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
    let body;
    if (url.pathname === '/api/v1/apps') body = { client_id: 'browser-client', client_secret: 'browser-secret' };
    else if (url.pathname === '/oauth/token') body = { access_token: 'browser-token', token_type: 'Bearer', scope: 'read write follow' };
    else if (url.pathname === '/oauth/revoke') body = {};
    else if (url.pathname === '/api/v2/instance') body = instance;
    else if (url.pathname === '/api/v1/accounts/verify_credentials') body = account;
    else if (url.pathname === '/api/v1/preferences') body = {};
    else if (url.pathname === '/api/v1/timelines/home') body = [otherStatus];
    else if (url.pathname === '/api/v1/markers') body = {};
    else if (url.pathname === '/api/v2/notifications') body = { notification_groups: [], accounts: [], statuses: [] };
    else if (url.pathname === '/api/v2/notifications/policy') body = {
      for_not_following: 'accept', for_not_followers: 'accept', for_new_accounts: 'accept',
      for_private_mentions: 'accept', for_limited_accounts: 'filter', for_bots: 'accept',
      summary: { pending_requests_count: 0, pending_notifications_count: 0 },
    };
    else if (url.pathname === '/api/v1/statuses/100/favourite') { favouriteCalls.push(request.method()); body = { ...otherStatus, favourited: true }; }
    else if (url.pathname === '/api/v1/statuses/100/reblog') { reblogCalls.push(request.method()); body = { reblog: { ...otherStatus, id: '200' } }; }
    else if (url.pathname === '/api/v1/statuses' && request.method() === 'POST') {
      publishedStatus = JSON.parse(request.postData());
      body = {
        id: 'status-reply-1', created_at: new Date().toISOString(), account, visibility: 'public',
        content: `<p>${publishedStatus.status}</p>`, spoiler_text: '', sensitive: false, language: 'de',
        uri: 'https://mastodon.test/users/alice/statuses/2', url: 'https://mastodon.test/@alice/2',
        replies_count: 0, reblogs_count: 0, favourites_count: 0, quotes_count: 0,
        favourited: false, reblogged: false, muted: false, bookmarked: false, pinned: false,
        media_attachments: [], mentions: [], tags: [], emojis: [], tagged_collections: [], filtered: [],
      };
    }
    else body = [];
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  });

  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).waitFor();

  // Favourite.
  const favouriteButton = page.locator('button.star-icon');
  await favouriteButton.click();
  for (let attempt = 0; attempt < 50 && favouriteCalls.length < 1; attempt++) await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(favouriteCalls, ['POST']);
  await page.locator('button.star-icon.active').waitFor();

  // Boost: shift-click skips the boost/quote menu and reblogs directly.
  const boostButton = page.getByRole('button', { name: 'Teilen oder zitieren' });
  await boostButton.click({ modifiers: ['Shift'] });
  for (let attempt = 0; attempt < 50 && reblogCalls.length < 1; attempt++) await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(reblogCalls, ['POST']);
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Teilen oder zitieren');
    return button?.classList.contains('active');
  });

  // Reply: prefills the compose form with the mention and the original status id.
  await page.getByRole('button', { name: 'Antworten' }).click();
  const composeInput = page.getByPlaceholder('Was gibts Neues?');
  await page.waitForFunction(() => {
    const textarea = document.querySelector('textarea[placeholder="Was gibts Neues?"]');
    return textarea instanceof HTMLTextAreaElement && textarea.value.includes('@bob');
  });
  await composeInput.press('End');
  await composeInput.pressSequentially('Teadeck reply test e5c1');
  // The submit button's label changes to "Reply" while in-reply-to is set, so
  // target it structurally instead of by (now different) accessible name.
  await page.locator('.compose-form__submit button').click();

  for (let attempt = 0; attempt < 50 && !publishedStatus; attempt++) await new Promise(r => setTimeout(r, 20));
  assert.ok(publishedStatus, 'the reply was never posted to /api/v1/statuses');
  assert.equal(publishedStatus.in_reply_to_id, '100');
  assert.ok(publishedStatus.status.includes('@bob'), 'the reply should keep the prefilled mention');
  assert.ok(publishedStatus.status.includes('Teadeck reply test e5c1'));

  assert.deepEqual(pageErrors, []);
  await context.close();
});
