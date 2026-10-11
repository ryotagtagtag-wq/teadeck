import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { postedStatus, secondAccount, status, timelineText } from './fixtures.mjs';
import { mockMastodon, signIn, waitUntil } from './mastodon_mock.mjs';
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
  const server = await mockMastodon(context, origin, {
    '/api/v1/timelines/home': [otherStatus],
    '/api/v1/markers': {},
    'POST /api/v1/statuses/100/favourite': { ...otherStatus, favourited: true },
    'POST /api/v1/statuses/100/reblog': { reblog: { ...otherStatus, id: '200' } },
    'POST /api/v1/statuses': ({ body }) => postedStatus(body),
  });
  const calls = (method, path) => server.requests.filter((request) => request.method === method && request.path === path);

  await signIn(page, origin);

  const post = page.locator('article').filter({ hasText: timelineText }).last();

  // Favourite.
  const favouriteButton = post.getByRole('button', { name: 'Favorisieren' });
  await favouriteButton.click();
  await waitUntil(() => calls('POST', '/api/v1/statuses/100/favourite').length === 1, { message: 'never favourited' });
  await post.locator('button[aria-pressed="true"]').first().waitFor();

  // Boost, from the boost-or-quote menu.
  await post.getByRole('button', { name: 'Teilen oder zitieren' }).click();
  await page.getByRole('menuitem', { name: /^Teilen/ }).first().click();
  await waitUntil(() => calls('POST', '/api/v1/statuses/100/reblog').length === 1, { message: 'never boosted' });

  // Reply: opens the composer with the mention and the original status id.
  await post.getByRole('button', { name: 'Antworten' }).click();
  const composeInput = page.locator('form[role="dialog"] textarea');
  await page.waitForFunction(() => document.querySelector('form[role="dialog"] textarea')?.value.includes('@bob'));
  await composeInput.press('End');
  await composeInput.pressSequentially('Teadeck reply test e5c1');
  // The submit button's label depends on the kind of post, so target it structurally.
  await page.locator('form[role="dialog"] button[type="submit"]').click();

  const [{ body: publishedStatus }] = await waitUntil(() => calls('POST', '/api/v1/statuses').length && calls('POST', '/api/v1/statuses'), { message: 'the reply was never posted' });
  assert.equal(publishedStatus.in_reply_to_id, '100');
  assert.ok(publishedStatus.status.includes('@bob'), 'the reply should keep the prefilled mention');
  assert.ok(publishedStatus.status.includes('Teadeck reply test e5c1'));

  assert.deepEqual(pageErrors, []);
  await context.close();
});
