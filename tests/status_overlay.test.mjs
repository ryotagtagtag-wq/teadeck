import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { account, status, timelineText } from './fixtures.mjs';
import { mockMastodon, signIn } from './mastodon_mock.mjs';
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
  await mockMastodon(context, origin, {
    [`/api/v1/statuses/${status.id}`]: status,
    [`/api/v1/statuses/${status.id}/context`]: { ancestors: [], descendants: [reply] },
    [`/api/v1/statuses/${reply.id}`]: reply,
    [`/api/v1/statuses/${reply.id}/context`]: { ancestors: [status], descendants: [] },
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await signIn(page, origin);
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

  // Opened from a post view that is already on screen: both show a thread.
  await page.locator('.status').filter({ hasText: replyText }).getByRole('button', { name: 'Open in overlay' }).click();
  await overlay.locator('.detailed-status').getByText(replyText).waitFor();
  await page.keyboard.press('Escape');
  await overlay.waitFor({ state: 'detached' });

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

  // Replying leaves the overlay: the post opens in the main view and the compose form takes the reply.
  await overlay.getByRole('button', { name: 'Reply', exact: true }).first().click();
  await overlay.waitFor({ state: 'detached' });
  await page.waitForURL(`${origin}/@${account.acct}/${status.id}`);
  await page.waitForFunction(() => document.activeElement?.closest('.compose-form') !== null);

  assert.deepEqual(pageErrors, []);
  await context.close();
});
