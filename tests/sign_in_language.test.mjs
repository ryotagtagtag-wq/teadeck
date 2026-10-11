import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { timelineText } from './fixtures.mjs';
import { mockMastodon } from './mastodon_mock.mjs';
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

test('the sign-in page offers its languages, switches at once, and an account without a language of its own takes the choice', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ locale: 'en-US' });
  await mockMastodon(context, origin);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(origin);

  // In the browser's language at first; every language named in itself.
  const picker = page.locator('#teadeck-shell-language');
  assert.equal(await picker.inputValue(), 'en');
  assert.equal(await page.locator('#teadeck-login h1').textContent(), 'Log in');
  const names = await picker.locator('option').allTextContents();
  assert.ok(names.includes('Deutsch') && names.includes('Français') && names.includes('日本語'), names.slice(0, 10).join(' | '));

  // Switches the page at once and is remembered.
  await picker.selectOption('de');
  await page.getByText('Angemeldet bleiben', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'de');
  assert.equal(await page.locator('.teadeck-shell-language span').textContent(), 'Sprache');
  await page.reload();
  await page.getByText('Angemeldet bleiben', { exact: true }).waitFor();
  assert.equal(await picker.inputValue(), 'de');

  // An account without a language setting of its own starts in the chosen one.
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'de');
  await page.getByRole('button', { name: 'Neuer Beitrag' }).first().waitFor();
  assert.deepEqual(pageErrors, []);
  await context.close();
});
