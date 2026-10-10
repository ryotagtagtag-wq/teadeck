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

// Response shapes as sent by a real GoToSocial 0.22 instance: statuses without
// Mastodon-only fields, accounts without Mastodon's profile-tab settings.
const {
  hide_collections: _hideCollections, show_media: _showMedia, show_media_replies: _showMediaReplies,
  show_featured: _showFeatured, feature_approval: _featureApproval, roles: _roles, ...gtsAccount
} = account;
const { tagged_collections: _taggedCollections, quotes_count: _quotesCount, filtered: _filtered, ...gtsStatus } = { ...status, account: gtsAccount };
// Like the real instance: no `api_versions`, translation disabled.
const { api_versions: _apiVersions, ...instanceWithoutApiVersions } = instance;
const gtsInstance = { ...instanceWithoutApiVersions, version: '3.5.3+0.22.1', source_url: 'https://codeberg.org/superseriousbusiness/gotosocial' };
const fan = { ...gtsAccount, id: '77', username: 'fan', acct: 'fan@elsewhere.test', display_name: 'Teadeck GtS fan 91c2' };

test('works against a GoToSocial-shaped API: missing status fields, v1-only notifications, authenticated custom emoji', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  const pageErrors = [];
  const requests = [];
  let customEmojiAuthorization;
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await context.route('https://mastodon.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,content-type,if-none-match', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    requests.push(url.pathname);
    if (url.pathname === '/oauth/authorize') {
      const callback = new URL('/oauth/callback', origin);
      callback.search = new URLSearchParams({ code: 'browser-code', state: url.searchParams.get('state') ?? '' });
      return route.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(callback.href)})</script>` });
    }
    const json = (body, statusCode = 200) => route.fulfill({ status: statusCode, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    if (url.pathname === '/api/v1/apps') return json({ client_id: 'browser-client', client_secret: 'browser-secret' });
    if (url.pathname === '/oauth/token') return json({ access_token: 'browser-token', token_type: 'Bearer', scope: 'read write follow' });
    if (url.pathname === '/api/v2/instance') return json(gtsInstance);
    if (['/api/v1/accounts/verify_credentials', '/api/v1/accounts/lookup', `/api/v1/accounts/${account.id}`].includes(url.pathname)) return json(account);
    if (url.pathname === '/api/v1/preferences') return json({});
    if (url.pathname === '/api/v1/timelines/home') return json([gtsStatus]);
    if (url.pathname === '/api/v2/search') {
      // GoToSocial's search response has no `collections` list.
      // A "#tag" query returns hashtags only on GoToSocial, never posts. Tag `history` is a stub (empty or absent).
      requests.push(`search:${url.searchParams.get('type') ?? 'all'}`);
      return json({ accounts: [], statuses: [], hashtags: [{ name: 'teadecktag', url: 'https://mastodon.test/tags/teadecktag', history: [] }] });
    }
    if (url.pathname === '/api/v1/tags/teadecktag') {
      return json({ name: 'teadecktag', url: 'https://mastodon.test/tags/teadecktag', following: false });
    }
    if (url.pathname === '/api/v1/timelines/tag/teadecktag') return json([gtsStatus]);
    if (url.pathname === '/api/v1/followed_tags') {
      return json([{ name: 'followedgtstag', url: 'https://mastodon.test/tags/followedgtstag', following: true }]);
    }
    if (url.pathname === '/api/v1/notifications') {
      return json([{ id: '900', type: 'favourite', created_at: '2026-09-14T09:00:00.000Z', account: fan, status: gtsStatus }]);
    }
    if (url.pathname === '/api/v1/custom_emojis') {
      customEmojiAuthorization = request.headers().authorization;
      return customEmojiAuthorization ? json([]) : json({ error: 'Unauthorized: token not supplied' }, 401);
    }
    // Mastodon-only endpoints GoToSocial does not have.
    if (['/api/v2/notifications', '/api/v2/notifications/policy', '/api/v1/instance/translation_languages',
      '/api/v1/profile', '/api/v1/featured_tags/suggestions'].includes(url.pathname)) {
      return json({ error: 'Not Found' }, 404);
    }
    return json([]);
  });

  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).waitFor();

  await page.evaluate(() => { history.pushState(null, '', '/notifications'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByText('Teadeck GtS fan 91c2').first().waitFor();

  for (let attempt = 0; attempt < 50 && !customEmojiAuthorization; attempt++) await new Promise(r => setTimeout(r, 20));
  assert.equal(customEmojiAuthorization, 'Bearer browser-token');
  // Without api_versions the grouped notifications and the policy are unknown, not absent: each is tried
  // once (404), then the fallback is used. Translation is ruled out by the instance metadata and never tried.
  const count = (path) => requests.filter((p) => p === path).length;
  assert.equal(count('/api/v2/notifications'), 1);
  assert.ok(count('/api/v2/notifications/policy') <= 1);
  assert.equal(count('/api/v1/instance/translation_languages'), 0);
  assert.ok(requests.includes('/api/v1/notifications'));

  // No policy API, so no policy controls that could not be saved.
  await page.getByRole('button', { name: 'Benachrichtigungseinstellungen öffnen' }).first().click();
  await page.waitForTimeout(300);
  assert.equal(await page.getByText('Benachrichtigungen verwalten von').count(), 0);
  // Searching for a hashtag renders the results instead of crashing on the missing `collections` and tag history.
  await page.keyboard.press('Escape');
  await page.evaluate(() => { history.pushState(null, '', '/search?q=%23teadecktag'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.locator('.trends__item__name', { hasText: 'teadecktag' }).waitFor();
  assert.equal(await page.getByText('Oh nein!').count(), 0);
  // Posts for the hashtag come from its timeline, since the search itself returns none.
  await page.getByText(timelineText).first().waitFor();
  assert.ok(requests.includes('/api/v1/timelines/tag/teadecktag'));

  // The hashtag timeline opens too, despite the missing history.
  await page.evaluate(() => { history.pushState(null, '', '/tags/teadecktag'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByRole('button', { name: '#teadecktag', exact: true }).waitFor();
  assert.equal(await page.getByText('Oh nein!').count(), 0);

  // The own profile asks for featured tag suggestions, which GoToSocial lacks; no error, and no profile request.
  await page.evaluate(() => { history.pushState(null, '', '/@alice'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByText('Test account').first().waitFor();
  for (let attempt = 0; attempt < 50 && !requests.includes('/api/v1/featured_tags/suggestions'); attempt++) await new Promise(r => setTimeout(r, 20));
  assert.ok(requests.includes('/api/v1/featured_tags/suggestions'));
  await page.waitForTimeout(500);
  assert.equal(requests.includes('/api/v1/profile'), false);
  assert.equal(await page.locator('#mastodon .notification-bar').count(), 0);

  // Followed hashtags come without history as well.
  await page.evaluate(() => { history.pushState(null, '', '/followed_tags'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.locator('.trends__item__name', { hasText: 'followedgtstag' }).waitFor();
  assert.equal(await page.getByText('Oh nein!').count(), 0);

  // Missing optional endpoints must not surface as "Oops" error toasts.
  assert.equal(await page.locator('#mastodon .notification-bar').count(), 0);

  // What was found missing is remembered for this server version: no new 404s after a reload.
  const grouped = count('/api/v2/notifications');
  const policy = count('/api/v2/notifications/policy');
  await page.goto(origin);
  await page.getByText(timelineText).first().waitFor();
  await page.evaluate(() => { history.pushState(null, '', '/notifications'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByText('Teadeck GtS fan 91c2').first().waitFor();
  assert.equal(count('/api/v2/notifications'), grouped);
  assert.equal(count('/api/v2/notifications/policy'), policy);

  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('serves the static files the client requests by absolute path', async () => {
  for (const [file, type] of [['/sounds/boop.ogg', 'application/octet-stream'], ['/sounds/boop.mp3', 'application/octet-stream'], ['/emoji/1f600.svg', 'image/svg+xml'], ['/oops.png', 'image/png']]) {
    const response = await fetch(new URL(file, origin));
    // The test server falls back to index.html for unknown paths, so check the type, not only the status.
    assert.equal(response.headers.get('content-type').split(';')[0], type, file);
  }
  const html = await (await fetch(origin)).text();
  assert.match(html, /<link rel="icon" href="\/assets\/favicon-[^"]+\.svg"/);
});
