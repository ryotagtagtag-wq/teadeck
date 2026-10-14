import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import { account, status, timelineText } from './fixtures.mjs';
import { mockMastodon, openPreferences, signIn } from './mastodon_mock.mjs';
import { engines, launchBrowser } from './browsers.mjs';
import { browser, collectPageErrors, origin, useApp, useMultiColumnLayout } from './harness.mjs';

const replyText = 'A reply shown in the thread 5c1e';
const longParagraphs = Array.from({ length: 60 }, (_, index) => `<p>Line ${index} of a long reply</p>`).join('');
const reply = { ...status, id: '101', in_reply_to_id: status.id, in_reply_to_account_id: account.id, content: `<p>${replyText}</p>${longParagraphs}` };

useApp();

test('a post opens with its thread in an overlay, from its own button or, when chosen, from its time', { timeout: 120_000 }, async () => {
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
  await mockMastodon(context, origin, {
    [`/api/v1/statuses/${status.id}`]: status,
    [`/api/v1/statuses/${status.id}/context`]: { ancestors: [], descendants: [reply] },
    [`/api/v1/statuses/${reply.id}`]: reply,
    [`/api/v1/statuses/${reply.id}/context`]: { ancestors: [status], descendants: [] },
  });

  const page = await context.newPage();
  const pageErrors = collectPageErrors(page);
  await signIn(page, origin);
  const home = new URL(page.url()).pathname;
  const post = page.locator('article').filter({ hasText: timelineText }).first();
  const time = (article) => article.locator(`header a[href$="/${status.id}"]`).last();
  const overlay = page.locator('.teadeck-status-overlay');

  // Off (the default): the time opens the post view as before; a button of its own opens the overlay.
  await post.getByRole('button', { name: 'Open in overlay' }).click();
  await overlay.getByText(replyText).waitFor();
  assert.equal(await overlay.getByText(timelineText).count() > 0, true);
  assert.equal(new URL(page.url()).pathname, home);

  // A long reply in the thread is shown in full in the overlay, not in the post view behind it.
  await overlay.getByRole('button', { name: 'View full post' }).first().click();
  await overlay.locator('article[data-variant="page"]').getByText('Line 59 of a long reply').waitFor();
  assert.equal(new URL(page.url()).pathname, home);

  await overlay.getByRole('button', { name: 'Close' }).click();
  await overlay.waitFor({ state: 'detached' });
  assert.equal(new URL(page.url()).pathname, home);

  await time(post).click();
  await page.waitForURL(`${origin}/@${account.acct}/${status.id}`);
  assert.equal(await overlay.count(), 0);

  // Opened from a post view that is already on screen: both show a thread.
  await page.locator('article').filter({ hasText: replyText }).getByRole('button', { name: 'Open in overlay' }).click();
  await overlay.locator('article[data-variant="page"]').getByText(replyText).waitFor();
  await page.keyboard.press('Escape');
  await overlay.waitFor({ state: 'detached' });

  // On: the time opens the overlay, and the extra button is gone.
  await openPreferences(page);
  await page.locator('#teadeck-settings-status-overlay').check();
  await page.locator('a[href="/home"]').first().click();
  await page.getByText(timelineText).first().waitFor();
  assert.equal(await post.getByRole('button', { name: 'Open in overlay' }).count(), 0);
  await time(post).click();
  await overlay.getByText(replyText).waitFor();
  assert.equal(new URL(page.url()).pathname, home);
  await page.keyboard.press('Escape');
  await overlay.waitFor({ state: 'detached' });

  // Remembered for this account.
  await page.reload();
  await page.getByText(timelineText).first().waitFor();
  await time(post).click();
  await overlay.getByText(replyText).waitFor();

  // Replying leaves the overlay: the post opens in the main view and the composer takes the reply.
  await overlay.getByRole('button', { name: 'Reply', exact: true }).first().click();
  await overlay.waitFor({ state: 'detached' });
  await page.waitForURL(`${origin}/@${account.acct}/${status.id}`);
  await page.waitForFunction(() => document.activeElement?.closest('form[role="dialog"]') !== null);

  assert.deepEqual(pageErrors, []);
  await context.close();
});

for (const engine of engines) {
  test(`in the multi-column layout and a low window, the overlay shows the post, not just its header (${engine})`, { timeout: 60_000 }, async () => {
    const browser = await launchBrowser(engine);
    // Upstream's multi-column rule for columns (fixed width, no growing) once left the
    // overlay's post list without any height.
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1600, height: 450 } });
    await useMultiColumnLayout(context);
    await mockMastodon(context, origin, {
      [`/api/v1/statuses/${status.id}`]: status,
      [`/api/v1/statuses/${status.id}/context`]: { ancestors: [], descendants: [reply] },
    });
    const page = await context.newPage();
    await signIn(page, origin);
    await page.locator('article').filter({ hasText: timelineText }).first().getByRole('button', { name: 'Open in overlay' }).click();
    const overlay = page.locator('.teadeck-status-overlay');
    const post = overlay.locator('article[data-variant="page"]').getByText(timelineText);
    await post.waitFor();

    const [box, postBox] = [await overlay.boundingBox(), await post.boundingBox()];
    assert.ok(postBox.y >= box.y && postBox.y + postBox.height <= box.y + box.height, `post at ${postBox.y}, overlay ${box.y}–${box.y + box.height}`);
    // And the list scrolls within the overlay, as tall as the space it has left.
    const list = await overlay.locator('.scrollable').first().boundingBox();
    assert.ok(list.height > 100, `list is ${list.height}px high`);
    await context.close();
  });
}
