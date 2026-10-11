import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { status, timelineText } from './fixtures.mjs';
import { composerText, mockMastodon, openComposer, respond, waitUntil } from './mastodon_mock.mjs';
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

  await mockMastodon(context, origin, {
    '/api/v2/notifications/policy': respond(404, null),
    // Like GoToSocial: a "#" query yields hashtags, never posts.
    '/api/v2/search': { accounts: [], statuses: [], hashtags: [{ name: 'teadecktag', url: 'https://mastodon.test/tags/teadecktag', history: [] }] },
    '/api/v1/timelines/tag/teadecktag': ({ url }) => {
      const limit = Number(url.searchParams.get('limit'));
      const maxId = url.searchParams.get('max_id');
      tagRequests.push({ limit, maxId });
      return tagPosts.filter((post) => !maxId || Number(post.id) < Number(maxId)).slice(0, limit);
    },
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
  await waitUntil(() => tagRequests.length >= 2, { message: 'the second page was never requested' });
  assert.deepEqual(tagRequests[1], { limit: 10, maxId: '1015' });

  // The list renders offscreen posts as placeholders with their id: one entry per post, newest first,
  // without duplicates or gaps across the page boundary.
  const ids = page.locator('.item-list > article[data-id]');
  await page.waitForFunction(() => document.querySelectorAll('.item-list > article[data-id]').length > 11);
  const shownIds = (await ids.evaluateAll((els) => els.map((el) => el.getAttribute('data-id')))).map(Number);
  assert.equal(new Set(shownIds).size, shownIds.length, 'no duplicates');
  shownIds.forEach((id, index) => assert.equal(id, 1025 - index, 'no gaps'));
  assert.ok(shownIds.includes(1014), 'second page shown');
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('a link pasted into the compose form is looked up without an error', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Exceptions only: 404s for resources the fake server doesn't have are expected.
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text());
  });
  const searches = [];

  await mockMastodon(context, origin, {
    '/api/v2/notifications/policy': respond(404, null),
    '/api/v2/search': ({ url }) => {
      searches.push(url.searchParams.get('q'));
      return { accounts: [], statuses: [], hashtags: [] };
    },
  });

  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).waitFor();

  // Upstream's compose form hands the search a URL object, not a string.
  const link = 'https://git.knubbel.me/teadeck/teadeck';
  await openComposer(page);
  const compose = composerText(page);
  await compose.click();
  await compose.evaluate((field, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    field.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, link);

  await waitUntil(() => searches.length > 0, { message: 'the link was never looked up' });
  assert.deepEqual(searches, [link]);
  await page.waitForTimeout(1000); // the answer is processed after the request
  assert.deepEqual(errors, []);
  await context.close();
});
