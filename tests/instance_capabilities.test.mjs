import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { instance } from './fixtures.mjs';
import { mockMastodon, signIn } from './mastodon_mock.mjs';
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

  const composeInput = page.getByPlaceholder('Was gibts Neues?');
  const submitButton = page.locator('.compose-form__submit button');

  // Under the real (small) limit: counter shows remaining characters and submit is enabled.
  await composeInput.fill('short');
  await page.locator('.character-counter').getByText('15').waitFor();
  assert.equal(await submitButton.isDisabled(), false);

  // Over the real (small, non-default) limit: counter goes negative and submit is blocked.
  // A hardcoded 500-character fallback would let this through silently.
  await composeInput.fill('this text is deliberately longer than twenty characters');
  await page.locator('.character-counter--over').waitFor();
  assert.equal(await submitButton.isDisabled(), true);

  // The instance's custom emoji is fetched and offered while composing.
  await composeInput.fill('short :teadeck_te');
  await page.locator('.autosuggest-emoji__name', { hasText: ':teadeck_test:' }).waitFor();

  await context.close();
});
