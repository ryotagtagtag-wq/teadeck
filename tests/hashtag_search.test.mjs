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

test('posts for a "#tag" search come from the hashtag timeline and page by max_id', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const tagRequests = [];
  // 25 posts, newest first (ids 1025 … 1001).
  const tagPosts = Array.from({ length: 25 }, (_, i) => {
    const id = String(1025 - i);
    return { ...status, id, uri: `https://mastodon.test/users/alice/statuses/${id}`, url: `https://mastodon.test/@alice/${id}`, content: `<p>Tagpost ${id}</p>` };
  });

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
    const json = (body, statusCode = 200) => route.fulfill({ status: statusCode, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    if (url.pathname === '/api/v1/apps') return json({ client_id: 'browser-client', client_secret: 'browser-secret' });
    if (url.pathname === '/oauth/token') return json({ access_token: 'browser-token', token_type: 'Bearer', scope: 'read write follow' });
    if (url.pathname === '/api/v2/instance') return json(instance);
    if (url.pathname === '/api/v1/accounts/verify_credentials') return json(account);
    if (url.pathname === '/api/v1/preferences') return json({});
    if (url.pathname === '/api/v1/timelines/home') return json([status]);
    if (url.pathname === '/api/v2/notifications') return json({ notification_groups: [], accounts: [], statuses: [] });
    if (url.pathname === '/api/v2/notifications/policy') return json(null, 404);
    // Like GoToSocial: a "#" query yields hashtags, never posts.
    if (url.pathname === '/api/v2/search') return json({ accounts: [], statuses: [], hashtags: [{ name: 'teadecktag', url: 'https://mastodon.test/tags/teadecktag', history: [] }] });
    if (url.pathname === '/api/v1/timelines/tag/teadecktag') {
      const limit = Number(url.searchParams.get('limit'));
      const maxId = url.searchParams.get('max_id');
      tagRequests.push({ limit, maxId });
      return json(tagPosts.filter((post) => !maxId || Number(post.id) < Number(maxId)).slice(0, limit));
    }
    return json([]);
  });

  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).waitFor();

  await page.evaluate(() => { history.pushState(null, '', '/search?q=%23teadecktag&type=statuses'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByText('Tagpost 1025').waitFor();
  assert.deepEqual(tagRequests, [{ limit: 11, maxId: null }]);

  // Dispatched, not clicked: under load the virtualised feed briefly overlaps the button while it re-renders.
  await page.getByRole('button', { name: 'Mehr laden' }).dispatchEvent('click');
  // Continued after the last post of the first page, not by offset.
  for (let attempt = 0; attempt < 100 && tagRequests.length < 2; attempt++) await new Promise(r => setTimeout(r, 50));
  assert.deepEqual(tagRequests[1], { limit: 10, maxId: '1015' });

  // The list renders offscreen posts as placeholders with their id: one entry per post, newest first,
  // without duplicates or gaps across the page boundary.
  const ids = page.locator('.explore__search-results article');
  await page.waitForFunction(() => document.querySelectorAll('.explore__search-results article').length > 11);
  const shownIds = (await ids.evaluateAll((els) => els.map((el) => el.getAttribute('data-id')))).map(Number);
  assert.equal(new Set(shownIds).size, shownIds.length, 'no duplicates');
  shownIds.forEach((id, index) => assert.equal(id, 1025 - index, 'no gaps'));
  assert.ok(shownIds.includes(1014), 'second page shown');
  assert.deepEqual(pageErrors, []);
  await context.close();
});
