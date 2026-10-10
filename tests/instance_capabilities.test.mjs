import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { instance } from './fixtures.mjs';
import { mockMastodon, signIn, composerText, openComposer, publishButton } from './mastodon_mock.mjs';
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

  await mockMastodon(context, origin, {
    '/oauth/revoke': {},
    '/api/v2/instance': smallLimitInstance,
    '/api/v1/markers': {},
    '/api/v1/custom_emojis': [customEmoji],
  });

  await signIn(page, origin);

  const posted = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/statuses') posted.push(request);
  });
  await openComposer(page);
  const composeInput = composerText(page);
  const counter = page.locator('form[role="dialog"] footer');

  // The counter shows the instance's limit (upstream loads it a few seconds after the start).
  await composeInput.fill('short');
  await counter.getByText('5/20').waitFor();

  // Over the real (small, non-default) limit the post is not sent.
  // A hardcoded 500-character fallback would let this through silently.
  await composeInput.fill('this text is deliberately longer than twenty characters');
  await counter.getByText('55/20').waitFor();
  await publishButton(page).click();
  await page.waitForTimeout(500);
  assert.equal(posted.length, 0);
  assert.equal(await composeInput.inputValue(), 'this text is deliberately longer than twenty characters');

  // The instance's custom emoji is fetched and offered while composing.
  await composeInput.fill('short :teadeck_te');
  await page.locator('button[data-type="emoji"][data-id="teadeck_test"]').waitFor();

  await context.close();
});
