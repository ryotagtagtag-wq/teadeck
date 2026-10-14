import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { account, instance, postedStatus } from './fixtures.mjs';
import { mockMastodon, signIn, waitUntil } from './mastodon_mock.mjs';
import { closeBrowsers, engines, launchBrowser } from './browsers.mjs';
import { createStaticServer } from './server.mjs';

// GoToSocial with Markdown, for an account that writes Markdown.
const gtsInstance = {
  ...instance,
  version: '3.5.3+0.22.1',
  source_url: 'https://codeberg.org/superseriousbusiness/gotosocial',
  configuration: { ...instance.configuration, statuses: { ...instance.configuration.statuses, max_characters: 5000, supported_mime_types: ['text/plain', 'text/markdown'] } },
};
const markdownAccount = { ...account, source: { ...account.source, status_content_type: 'text/markdown' } };
const text = '# Teekanne\n\nEin **längerer** Beitrag.\n\n```js\nconst tea = "Assam";\n```';

let server;
let origin;
let browser;

before(async () => {
  ({ server, origin } = await createStaticServer());
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await closeBrowsers();
  await new Promise((resolve) => server?.close(resolve));
});

async function signedInPage({ instanceFixture = gtsInstance, accountFixture = markdownAccount, engine = 'chromium' } = {}) {
  const context = await (engine === 'chromium' ? browser : await launchBrowser(engine)).newContext({ locale: 'de-DE', viewport: { width: 1400, height: 900 } });
  const posted = [];
  await mockMastodon(context, origin, {
    '/api/v2/instance': instanceFixture,
    '/api/v1/accounts/verify_credentials': accountFixture,
    '/api/v1/markers': {},
    'POST /api/v1/statuses': ({ body }) => { posted.push(body); return postedStatus(body); },
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await signIn(page, origin);
  return { context, page, posted, pageErrors };
}

const form = (page) => page.locator('form[role="dialog"]');
const textarea = (page) => form(page).locator('textarea').first();

for (const engine of engines) {
  test(`the large composer opens from the right part of "New post", previews Markdown and switches size without losing the post (${engine})`, { timeout: 90_000 }, async () => {
    const { context, page, posted, pageErrors } = await signedInPage({ engine });
    try {
      await page.getByRole('button', { name: 'Neuer Beitrag im großen Eingabefeld' }).click();
      await textarea(page).fill(text);

      // As large as the status overlay: in the middle of the window, nearly its full height.
      const box = await form(page).boundingBox();
      // Centred in the page, which leaves room for a scrollbar (scrollbar-gutter).
      const middle = await page.evaluate(() => document.body.getBoundingClientRect().width / 2);
      assert.ok(Math.abs(box.x + box.width / 2 - middle) < 2, `centred: ${box.x}+${box.width} in ${middle * 2}`);
      assert.ok(box.height > 800, `height ${box.height}`);

      // The preview follows the text, rendered like a post, code blocks included.
      const preview = form(page).locator('.teadeck-markdown-preview');
      await preview.locator('h1', { hasText: 'Teekanne' }).waitFor();
      assert.equal(await preview.locator('strong').textContent(), 'längerer');
      await preview.locator('.teadeck-code__keyword', { hasText: 'const' }).waitFor();
      const [textBox, previewBox] = [await textarea(page).boundingBox(), await preview.boundingBox()];
      assert.ok(previewBox.y >= textBox.y + textBox.height, 'below the text');

      // The cheat sheet opens over it and closes again, leaving the post as it was.
      await page.getByRole('button', { name: 'Markdown-Spickzettel' }).click();
      const help = page.locator('.teadeck-markdown-help');
      await help.locator('h1', { hasText: 'Überschrift' }).waitFor();
      await page.keyboard.press('Escape');
      await help.waitFor({ state: 'detached' });

      // To the regular composer and back: same text, the preview only in the large one.
      await page.getByRole('button', { name: 'Normales Eingabefeld' }).click();
      assert.ok((await form(page).boundingBox()).height < 800);
      assert.equal(await textarea(page).inputValue(), text);
      assert.equal(await page.locator('.teadeck-markdown-preview').count(), 0);
      await page.getByRole('button', { name: 'Großes Eingabefeld' }).click();
      await form(page).locator('.teadeck-markdown-preview h1').waitFor();

      // Posting works as from the regular composer.
      await form(page).getByRole('button', { name: 'Veröffentlichen' }).click();
      await waitUntil(() => posted.length > 0, { message: 'the post was never sent' });
      assert.equal(posted[0]?.status, text);
      // And closes afterwards, backdrop included.
      await form(page).waitFor({ state: 'detached', timeout: 5_000 });
      assert.equal(await page.locator('.teadeck-large-composer__backdrop').count(), 0);
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  });
}

test('the left part of "New post" opens the regular composer, and without Markdown there is no preview', { timeout: 60_000 }, async () => {
  const { context, page, pageErrors } = await signedInPage({ instanceFixture: instance, accountFixture: account });
  try {
    await page.locator('.teadeck-new-post').getByRole('button', { name: 'Neuer Beitrag', exact: true }).click();
    await textarea(page).fill(text);
    assert.ok((await form(page).boundingBox()).height < 800);

    // Large, but this server knows no Markdown: nothing to preview.
    await page.getByRole('button', { name: 'Großes Eingabefeld' }).click();
    assert.ok((await form(page).boundingBox()).height > 800);
    assert.equal(await page.locator('.teadeck-markdown-preview').count(), 0);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('in the multi-column layout the large composer lies above the columns, and a click beside it makes it the regular one', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 1400, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('teadeck.v1:https://mastodon.test:42:advancedLayout', 'true'));
  await mockMastodon(context, origin, { '/api/v2/instance': gtsInstance, '/api/v1/accounts/verify_credentials': markdownAccount, '/api/v1/markers': {} });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await signIn(page, origin);

  await page.getByRole('button', { name: 'Neuer Beitrag im großen Eingabefeld' }).click();
  await textarea(page).fill(text);
  // Nothing of the columns shows through: every corner of the window is the window.
  const box = await form(page).boundingBox();
  const points = [[box.x + 24, box.y + 24], [box.x + box.width - 24, box.y + 24], [box.x + 24, box.y + box.height - 24], [box.x + box.width - 24, box.y + box.height - 24], [box.x + box.width / 2, box.y + 80]];
  for (const [x, y] of points) {
    assert.ok(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('form[role="dialog"]'), [x, y]), `covered at ${Math.round(x)},${Math.round(y)}`);
  }

  // A click beside it: the regular composer, with the post as it was.
  await page.mouse.click(box.x / 2, box.y + box.height / 2);
  await waitUntil(async () => (await form(page).boundingBox()).height < 800, { message: 'the composer stayed large' });
  assert.equal(await textarea(page).inputValue(), text);
  assert.equal(await page.locator('.teadeck-large-composer__backdrop').count(), 0);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('in the multi-column layout, /deck/publish shows the redesigned composer, not the legacy form', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 1400, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('teadeck.v1:https://mastodon.test:42:advancedLayout', 'true'));
  await mockMastodon(context, origin, { '/api/v2/instance': gtsInstance, '/api/v1/accounts/verify_credentials': markdownAccount, '/api/v1/markers': {} });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await signIn(page, origin);

  await page.evaluate(() => { history.pushState(null, '', '/deck/publish'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByPlaceholder('Was möchtest du mitteilen?').waitFor();
  assert.equal(await page.locator('.compose-form, .drawer').count(), 0);
  // With the GoToSocial controls of the redesigned composer.
  await page.locator('.teadeck-status-format-toggle').waitFor();
  assert.deepEqual(pageErrors, []);
  await context.close();
});
