import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { account, instance } from './fixtures.mjs';
import { composerText, openComposer, publishButton } from './mastodon_mock.mjs';
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

const media = {
  id: 'media-1', type: 'image',
  url: 'https://mastodon.test/media/1.png', preview_url: 'https://mastodon.test/media/1-small.png',
  // Non-empty on purpose: an empty description makes Mastodon's own compose
  // form open a "missing alt text" confirmation modal instead of submitting.
  description: 'a test photo', blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
  meta: {
    original: { width: 100, height: 100, size: '100x100', aspect: 1 },
    small: { width: 100, height: 100, size: '100x100', aspect: 1 },
  },
};

test('posting a status with an attached image goes through Teadeck\'s patched compose/upload path', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  let mediaUploads = 0;
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
    else if (url.pathname === '/api/v1/timelines/home') body = [];
    else if (url.pathname === '/api/v1/markers') body = {};
    else if (url.pathname === '/api/v2/notifications') body = { notification_groups: [], accounts: [], statuses: [] };
    else if (url.pathname === '/api/v2/notifications/policy') body = {
      for_not_following: 'accept', for_not_followers: 'accept', for_new_accounts: 'accept',
      for_private_mentions: 'accept', for_limited_accounts: 'filter', for_bots: 'accept',
      summary: { pending_requests_count: 0, pending_notifications_count: 0 },
    };
    else if (url.pathname === '/api/v2/media' && request.method() === 'POST') {
      mediaUploads++;
      body = media;
    }
    else if (url.pathname === '/api/v1/statuses' && request.method() === 'POST') {
      publishedStatus = JSON.parse(request.postData());
      body = {
        id: 'status-1', created_at: new Date().toISOString(), account, visibility: 'public',
        content: `<p>${publishedStatus.status}</p>`, spoiler_text: '', sensitive: false, language: 'de',
        uri: 'https://mastodon.test/users/alice/statuses/1', url: 'https://mastodon.test/@alice/1',
        replies_count: 0, reblogs_count: 0, favourites_count: 0, quotes_count: 0,
        favourited: false, reblogged: false, muted: false, bookmarked: false, pinned: false,
        media_attachments: publishedStatus.media_ids?.length ? [media] : [], mentions: [], tags: [], emojis: [],
        tagged_collections: [], filtered: [],
      };
    }
    else body = [];
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  });

  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await openComposer(page);

  const composeText = 'Teadeck compose test 9c2f';
  await composerText(page).fill(composeText);
  await page.locator('form[role="dialog"] input[type="file"]').setInputFiles({
    name: 'photo.png', mimeType: 'image/png',
    buffer: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
  });
  for (let attempt = 0; attempt < 100 && mediaUploads === 0; attempt++) await new Promise(r => setTimeout(r, 50));
  // The attachment is listed in the composer once its upload has been processed.
  await page.locator('form[role="dialog"]').getByRole('button', { name: 'Bild entfernen' }).waitFor();

  await publishButton(page).click();
  for (let attempt = 0; attempt < 50 && !publishedStatus; attempt++) await new Promise(r => setTimeout(r, 50));
  assert.ok(publishedStatus, 'the composed status was never posted to /api/v1/statuses');

  assert.equal(mediaUploads, 1);
  assert.equal(publishedStatus.status, composeText);
  assert.deepEqual(publishedStatus.media_ids, [media.id]);
  // The route handler above resolving doesn't imply the page has already
  // processed the response and re-rendered; wait for the composer to reset.
  await openComposer(page);
  await page.waitForFunction(() => document.querySelector('form[role="dialog"] textarea')?.value === '');
  assert.deepEqual(pageErrors, []);

  await context.close();
});
