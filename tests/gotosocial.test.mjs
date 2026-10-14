import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import { account, instance, status, timelineText } from './fixtures.mjs';
import { mockMastodon, respond, waitUntil } from './mastodon_mock.mjs';
import { browser, origin, submitSignIn, useApp } from './harness.mjs';

useApp();

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
  let customEmojiAuthorization;
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const notFound = respond(404, { error: 'Not Found' });
  const server = await mockMastodon(context, origin, {
    '/api/v2/instance': gtsInstance,
    '/api/v1/accounts/lookup': account,
    [`/api/v1/accounts/${account.id}`]: account,
    '/api/v1/timelines/home': [gtsStatus],
    // GoToSocial's search response has no `collections` list. A "#tag" query returns hashtags
    // only on GoToSocial, never posts. Tag `history` is a stub (empty or absent).
    '/api/v2/search': { accounts: [], statuses: [], hashtags: [{ name: 'teadecktag', url: 'https://mastodon.test/tags/teadecktag', history: [] }] },
    '/api/v1/tags/teadecktag': { name: 'teadecktag', url: 'https://mastodon.test/tags/teadecktag', following: false },
    '/api/v1/timelines/tag/teadecktag': [gtsStatus],
    '/api/v1/followed_tags': [{ name: 'followedgtstag', url: 'https://mastodon.test/tags/followedgtstag', following: true }],
    '/api/v1/notifications': [{ id: '900', type: 'favourite', created_at: '2026-09-14T09:00:00.000Z', account: fan, status: gtsStatus }],
    '/api/v1/custom_emojis': ({ request }) => {
      customEmojiAuthorization = request.headers().authorization;
      return customEmojiAuthorization ? [] : respond(401, { error: 'Unauthorized: token not supplied' });
    },
    // Mastodon-only endpoints GoToSocial does not have.
    '/api/v2/notifications': notFound,
    '/api/v2/notifications/policy': notFound,
    '/api/v1/instance/translation_languages': notFound,
    '/api/v1/profile': notFound,
    '/api/v1/featured_tags/suggestions': notFound,
  });
  const paths = () => server.requests.map((request) => request.path);

  await submitSignIn(page, origin);
  await page.getByText(timelineText).waitFor();

  await page.evaluate(() => { history.pushState(null, '', '/notifications'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByText('Teadeck GtS fan 91c2').first().waitFor();

  await waitUntil(() => customEmojiAuthorization, { message: 'custom emoji were never requested' });
  assert.equal(customEmojiAuthorization, 'Bearer browser-token');
  // Without api_versions the grouped notifications and the policy are unknown, not absent: each is tried
  // once (404), then the fallback is used. Translation is ruled out by the instance metadata and never tried.
  const count = (path) => paths().filter((p) => p === path).length;
  assert.equal(count('/api/v2/notifications'), 1);
  assert.ok(count('/api/v2/notifications/policy') <= 1);
  assert.equal(count('/api/v1/instance/translation_languages'), 0);
  assert.ok(paths().includes('/api/v1/notifications'));

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
  assert.ok(paths().includes('/api/v1/timelines/tag/teadecktag'));

  // The hashtag timeline opens too, despite the missing history.
  await page.evaluate(() => { history.pushState(null, '', '/tags/teadecktag'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByRole('button', { name: '#teadecktag', exact: true }).waitFor();
  assert.equal(await page.getByText('Oh nein!').count(), 0);

  // The own profile asks for featured tag suggestions, which GoToSocial lacks; no error, and no profile request.
  await page.evaluate(() => { history.pushState(null, '', '/@alice'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByText('Test account').first().waitFor();
  await waitUntil(() => paths().includes('/api/v1/featured_tags/suggestions'), { message: 'featured tag suggestions were never tried' });
  await page.waitForTimeout(500);
  assert.equal(paths().includes('/api/v1/profile'), false);
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
