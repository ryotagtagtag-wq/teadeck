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

const customEmoji = {
  shortcode: 'teadeck_test', static_url: 'https://mastodon.test/emoji/test.png',
  url: 'https://mastodon.test/emoji/test.png', category: 'Test', visible_in_picker: true,
};

test('compose enforces the real instance character limit, not a hardcoded default, and surfaces its custom emoji', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  const smallLimitInstance = { ...instance, configuration: { ...instance.configuration, statuses: { ...instance.configuration.statuses, max_characters: 20 } } };

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
    else if (url.pathname === '/api/v2/instance') body = smallLimitInstance;
    else if (url.pathname === '/api/v1/accounts/verify_credentials') body = account;
    else if (url.pathname === '/api/v1/preferences') body = {};
    else if (url.pathname === '/api/v1/timelines/home') body = [status];
    else if (url.pathname === '/api/v1/markers') body = {};
    else if (url.pathname === '/api/v1/custom_emojis') body = [customEmoji];
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

  const composeInput = page.getByPlaceholder('Was gibts Neues?');
  const submitButton = page.locator('.compose-form__submit button');

  // Under the real (small) limit: counter shows remaining characters and submit is enabled.
  await composeInput.fill('short');
  await page.locator('.character-counter').getByText('15').waitFor();
  assert.equal(await submitButton.isDisabled(), false);

  // Over the real (small, non-default) limit: counter goes negative and submit is blocked.
  // A hardcoded 500-character fallback would let this through silently.
  await composeInput.fill('this text is deliberately longer than twenty characters');
  await page.locator('.character-counter--over').waitFor();
  assert.equal(await submitButton.isDisabled(), true);

  // The instance's custom emoji is fetched and offered while composing.
  await composeInput.fill('short :teadeck_te');
  await page.locator('.autosuggest-emoji__name', { hasText: ':teadeck_test:' }).waitFor();

  await context.close();
});
