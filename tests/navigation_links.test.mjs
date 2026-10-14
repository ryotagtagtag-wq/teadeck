import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { instance, timelineText } from './fixtures.mjs';
import { mockMastodon, openAccountMenu, signIn, signOut } from './mastodon_mock.mjs';
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

async function signedInPage({ instanceFixture, advancedLayout }) {
  const context = await browser.newContext({ locale: 'de-DE' });
  const pageErrors = [];
  await mockMastodon(context, origin, {
    '/api/v2/instance': instanceFixture,
    '/api/v1/instance/privacy_policy': { updated_at: '2026-01-01T00:00:00.000Z', content: '<p>Teadeck test privacy policy 51d0</p>' },
    '/api/v1/instance/extended_description': { updated_at: '2026-01-01T00:00:00.000Z', content: '' },
  });
  if (advancedLayout) {
    await context.addInitScript(() => localStorage.setItem('teadeck.v1:https://mastodon.test:42:advancedLayout', 'true'));
  }
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await signIn(page, origin);
  return { context, page, pageErrors };
}

/** The account menu: Teadeck's settings, pages of the server on the server, and sign-out. */
async function assertAccountMenu(page) {
  await openAccountMenu(page);
  assert.equal(await page.getByRole('link', { name: 'Einstellungen', exact: true }).getAttribute('href'), '/preferences');
  assert.equal(await page.getByRole('link', { name: 'Einstellungen auf dem Server' }).getAttribute('href'), 'https://mastodon.test/settings');
  // The account's own lists, not the server's /relationships page.
  assert.equal(await page.getByRole('link', { name: 'Followers', exact: true }).getAttribute('href'), '/@alice/followers');
  assert.equal(await page.getByRole('link', { name: 'Following', exact: true }).getAttribute('href'), '/@alice/following');
  // Nothing about Mastodon in a client that may well talk to GoToSocial.
  assert.equal(await page.locator('a[href*="joinmastodon.org"]').count(), 0);
  assert.equal(await page.getByText(/^Mastodon v/).count(), 0);
  const signOutEntry = page.getByRole('menuitem', { name: 'Abmelden' }).or(page.getByRole('button', { name: 'Abmelden' }));
  await signOutEntry.first().waitFor();
  await page.keyboard.press('Escape');
  await signOutEntry.first().waitFor({ state: 'detached' });
}

test('advanced layout: About and the privacy policy open in the column, not in a new tab', { timeout: 90_000 }, async () => {
  const instanceFixture = {
    ...instance,
    rules: [{ id: '1', text: 'Teadeck test rule 8e2c', hint: '', translations: {} }],
    configuration: { ...instance.configuration, urls: { ...instance.configuration.urls, privacy_policy: 'https://mastodon.test/privacy-policy' } },
  };
  const { context, page, pageErrors } = await signedInPage({ instanceFixture, advancedLayout: true });
  try {
    await page.waitForURL(/\/deck\//);
    await assertAccountMenu(page);
    // Nothing branded: no Mastodon logo, and no mascot or empty frame without a configured logo.
    assert.equal(await page.locator('.logo--wordmark, .logo--icon, img[alt="Mastodon"]').count(), 0);
    assert.equal(await page.locator('img[src*="elephant"], .drawer__inner__mastodon, .navigation-panel__logo').count(), 0);

    // The first "Über" is this server's (the second, external one is about Mastodon).
    await page.locator('footer').first().getByRole('link', { name: /^Über/ }).first().click();
    // Server rules are a collapsible section of the About column, as in Mastodon.
    await page.getByRole('button', { name: 'Serverregeln' }).click();
    await page.getByText('Teadeck test rule 8e2c').waitFor();
    assert.equal(context.pages().length, 1, 'no new tab');
    await page.waitForURL(/\/deck\/about$/);
    // Still the column layout: the home timeline is next to it.
    assert.equal(await page.getByText(timelineText).first().isVisible(), true);

    // The About column took the place of the start column (like settings do); back to it.
    await page.goBack();
    await page.waitForURL(/\/deck\/home$/);
    await page.locator('footer a[href="/privacy-policy"]').first().click();
    await page.getByText('Teadeck test privacy policy 51d0').waitFor();
    assert.equal(context.pages().length, 1, 'no new tab');
    assert.equal(await page.getByText(timelineText).first().isVisible(), true);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('single column: no privacy policy link where the instance has none; sign-out in the account menu', { timeout: 60_000 }, async () => {
  // Like GoToSocial: configuration.urls without privacy_policy / terms_of_service.
  const instanceFixture = { ...instance, configuration: { ...instance.configuration, urls: { streaming: '' } } };
  const { context, page, pageErrors } = await signedInPage({ instanceFixture, advancedLayout: false });
  try {
    await assertAccountMenu(page);
    await page.getByRole('link', { name: /^Über/ }).first().waitFor();
    assert.equal(await page.getByRole('link', { name: /^(Datenschutzerklärung|Datenschutz)$/ }).count(), 0);
    assert.equal(await page.getByRole('link', { name: /^Nutzungsbedingungen$/ }).count(), 0);

    // Nothing branded where Mastodon shows its logo, and no broken image without a configured one.
    assert.equal(await page.locator('.logo--wordmark, .logo--icon, img[alt="Mastodon"]').count(), 0);
    assert.equal(await page.locator('img.teadeck-logo').count(), 0);

    await signOut(page);
    await page.waitForURL(`${origin}/login`);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});
