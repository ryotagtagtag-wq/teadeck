import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { account, instance, timelineText } from './fixtures.mjs';
import { mockMastodon, signIn, openAccountMenu, openPreferences, signOut } from './mastodon_mock.mjs';
import { createStaticServer } from './server.mjs';

// The settings page keeps and applies a change the moment it is made: no reload,
// no losing the page, no jumping scroll position.
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

async function signedInPage({ deployment } = {}) {
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 620 } });
  if (deployment) {
    // What container/entrypoint.sh writes from TEADECK_THEME / TEADECK_COLOR_SCHEME.
    await context.route(`${origin}/teadeck.json`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(deployment) }));
  }
  await mockMastodon(context, origin);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await signIn(page, origin);
  return { context, page, pageErrors };
}

test('a changed setting takes effect at once, and the page stays where it was', { timeout: 120_000 }, async () => {
  const { context, page, pageErrors } = await signedInPage();
  try {
    let loads = 0;
    page.on('load', () => loads++);
    await openPreferences(page);
    await page.locator('#teadeck-settings-theme').waitFor();

    // The single-column settings bind scrolling to the document, not the
    // inner .scrollable element (which is used in the multi-column layout).
    const scroller = page.locator('html');
    await page.locator('#teadeck-settings-color-scheme').scrollIntoViewIfNeeded();
    await scroller.evaluate((element) => element.scrollBy(0, 200));
    const scrolledTo = await scroller.evaluate((element) => element.scrollTop);
    assert.ok(scrolledTo > 0, 'the page is scrolled');

    await page.locator('#teadeck-settings-color-scheme').selectOption('light');
    await page.locator('#teadeck-settings-theme').selectOption('assam');

    // Applied immediately: the attributes on <html> and the stored preference.
    assert.equal(await page.evaluate(() => document.documentElement.dataset.colorScheme), 'light');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.teadeckTheme), 'assam');
    const stored = await page.evaluate(() => JSON.parse(localStorage[Object.keys(localStorage).find((key) => key.endsWith(':frontendSettings'))]));
    assert.equal(stored.colorScheme, 'light');
    assert.equal(stored.theme, 'assam');

    // Without a reload, without leaving the settings, without a jump.
    assert.equal(loads, 0);
    await page.locator('#teadeck-settings-theme').waitFor();
    assert.equal(new URL(page.url()).pathname, '/preferences');
    assert.equal(await scroller.evaluate((element) => element.scrollTop), scrolledTo);
    // These settings need no reload at all, so nothing is offered.
    assert.equal(await page.locator('#teadeck-settings-reload').count(), 0);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('a setting the interface only reads at startup is kept and offers a reload', { timeout: 120_000 }, async () => {
  const { context, page, pageErrors } = await signedInPage();
  try {
    let loads = 0;
    page.on('load', () => loads++);
    await openPreferences(page);
    await page.locator('#teadeck-settings-autoPlayGif').waitFor();
    await page.locator('#teadeck-settings-autoPlayGif').check();

    // Stored at once; the hint appears instead of reloading under the reader's hands.
    const stored = await page.evaluate(() => JSON.parse(localStorage[Object.keys(localStorage).find((key) => key.endsWith(':frontendSettings'))]));
    assert.equal(stored.autoPlayGif, true);
    assert.equal(loads, 0);
    const hint = page.locator('#teadeck-settings-reload');
    await hint.waitFor();

    // Only when asked for.
    await Promise.all([page.waitForEvent('load'), hint.getByRole('button').click()]);
    await page.locator('#teadeck-settings-autoPlayGif').waitFor();
    assert.equal(await page.locator('#teadeck-settings-autoPlayGif').isChecked(), true);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('which notifications appear takes effect without a reload', { timeout: 120_000 }, async () => {
  const { context, page, pageErrors } = await signedInPage();
  try {
    let loads = 0;
    page.on('load', () => loads++);
    await openPreferences(page);
    await page.locator('#teadeck-settings-notify-favourite').waitFor();
    await page.locator('#teadeck-settings-notify-favourite').uncheck();

    // Upstream's own setting, so its own store holds it right away.
    const excluded = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((name) => name.endsWith(':settings'));
      return JSON.parse(localStorage[key]).notifications.shows.favourite;
    });
    assert.equal(excluded, false);
    assert.equal(loads, 0);
    assert.equal(await page.locator('#teadeck-settings-reload').count(), 0, 'no reload needed for this one');
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('the account menu sends server-only pages to the instance and keeps local views in Teadeck', { timeout: 60_000 }, async () => {
  const { context, page, pageErrors } = await signedInPage();
  try {
    await openAccountMenu(page);
    const links = await page.locator('a[href]').filter({ visible: true }).evaluateAll((items) => items.map((item) => ({ text: item.textContent.trim(), href: item.href })));
    const href = (text) => links.find((link) => link.text === text)?.href;
    // Teadeck's settings stay local; the account's own settings are on the server.
    assert.equal(href('Einstellungen'), `${origin}/preferences`, links.map((link) => link.text).join(' | '));
    assert.equal(href('Einstellungen auf dem Server'), 'https://mastodon.test/settings');
    // Server-only pages use the instance; supported local views stay in Teadeck.
    assert.equal(href('Follower und Folge ich'), 'https://mastodon.test/relationships');
    assert.equal(href('Blockierte Konten'), `${origin}/blocks`);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});
test('the design this deployment starts with applies, and a reader\'s own choice wins over it', { timeout: 120_000 }, async () => {
  const { context, page, pageErrors } = await signedInPage({ deployment: { theme: 'sencha', colorScheme: 'dark' } });
  try {
    // Nothing chosen yet: the interface starts in the design of this installation.
    assert.equal(await page.evaluate(() => document.documentElement.dataset.teadeckTheme), 'sencha');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.colorScheme), 'dark');

    // Choosing something else keeps it, here and after a reload.
    await openPreferences(page);
    await page.locator('#teadeck-settings-theme').waitFor();
    await page.locator('#teadeck-settings-theme').selectOption('mastodon');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.teadeckTheme), undefined);
    await page.reload();
    await page.locator('#teadeck-settings-theme').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.teadeckTheme), undefined, 'the choice survives');
    assert.equal(await page.locator('#teadeck-settings-theme').inputValue(), 'mastodon');
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('an installation that configured nothing starts in Teadeck\'s own design', { timeout: 120_000 }, async () => {
  const { context, page } = await signedInPage();
  try {
    assert.equal(await page.evaluate(() => document.documentElement.dataset.teadeckTheme), 'assam');
  } finally {
    await context.close();
  }
});

test('the sign-in page shows the configured logo and follows the design of this installation', { timeout: 120_000 }, async () => {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const logo = await readFile(join(import.meta.dirname, '..', 'integration/logos/teacup-flat.svg'), 'utf8');
  const { server: ownServer, origin: ownOrigin } = await createStaticServer({
    override: async (pathname) => {
      if (pathname === '/logo.svg') return { body: logo, type: 'image/svg+xml' };
      if (pathname === '/teadeck.json') return { body: JSON.stringify({ theme: 'sencha', colorScheme: 'light' }), type: 'application/json' };
      return undefined;
    },
  });
  const context = await browser.newContext({ locale: 'de-DE' });
  try {
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`${ownOrigin}/login`);
    await page.locator('#teadeck-login').waitFor();

    // No account yet, so the page follows what this installation configured.
    assert.equal(await page.evaluate(() => document.documentElement.dataset.teadeckTheme), 'sencha');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.colorScheme), 'light');

    // The logo, large and in the page (so it is coloured by the design).
    const drawing = page.locator('#teadeck-shell-logo svg');
    await drawing.waitFor();
    assert.ok((await drawing.boundingBox()).height > 80);
    const tea = await page.locator('#teadeck-shell-logo svg rect').first().evaluate((element) => getComputedStyle(element).fill);
    assert.notEqual(tea, 'rgb(184, 92, 30)', 'the tea of this design, not the drawing\'s own');

    // The heading is the largest thing after the logo, and the button is outlined.
    const heading = await page.locator('#teadeck-login .title').evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    assert.ok(heading >= 28, `${heading}px`);
    const button = await page.locator('#teadeck-login button[type=submit]').evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.equal(button, 'rgba(0, 0, 0, 0)');
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
    ownServer.closeAllConnections();
    ownServer.close();
  }
});

test('after signing out, the sign-in page greets in the design that was last used', { timeout: 120_000 }, async () => {
  const { context, page } = await signedInPage({ deployment: { theme: 'assam', colorScheme: 'dark' } });
  try {
    // Someone who prefers Mastodon's look picks it, then signs out.
    await openPreferences(page);
    await page.locator('#teadeck-settings-theme').waitFor();
    await page.locator('#teadeck-settings-theme').selectOption('mastodon');
    await signOut(page);
    await page.waitForURL(`${origin}/login`);
    await page.locator('#teadeck-login').waitFor();

    // Not the design of this installation, but the one they were last looking at.
    assert.equal(await page.evaluate(() => document.documentElement.dataset.teadeckTheme), undefined);

    // A browser that has not been here before does follow the installation.
    const fresh = await browser.newContext({ locale: 'de-DE' });
    try {
      await fresh.route(`${origin}/teadeck.json`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ theme: 'sencha' }) }));
      const page2 = await fresh.newPage();
      await page2.goto(`${origin}/login`);
      await page2.locator('#teadeck-login').waitFor();
      assert.equal(await page2.evaluate(() => document.documentElement.dataset.teadeckTheme), 'sencha');
    } finally {
      await fresh.close();
    }
  } finally {
    await context.close();
  }
});

test('the settings page shows the design that is on screen, not the client\'s own default', { timeout: 120_000 }, async () => {
  const { context, page } = await signedInPage({ deployment: { theme: 'sencha', colorScheme: 'dark' } });
  try {
    // Nothing chosen yet, so this installation's design is running …
    assert.equal(await page.evaluate(() => document.documentElement.dataset.teadeckTheme), 'sencha');
    await openPreferences(page);
    await page.locator('#teadeck-settings-theme').waitFor();
    // … and that is what the fields say.
    assert.equal(await page.locator('#teadeck-settings-theme').inputValue(), 'sencha');
    assert.equal(await page.locator('#teadeck-settings-color-scheme').inputValue(), 'dark');
  } finally {
    await context.close();
  }
});

test('a setting changed after reopening the settings keeps the one changed before', { timeout: 120_000 }, async () => {
  const { context, page, pageErrors } = await signedInPage({ deployment: { theme: 'sencha' } });
  try {
    await openPreferences(page);
    await page.locator('#teadeck-settings-theme').selectOption('assam');
    await page.locator('a[href="/home"]').first().click();
    await page.getByText(timelineText).first().waitFor();

    // Opened again, it shows the earlier choice and saving another setting keeps it.
    await openPreferences(page);
    assert.equal(await page.locator('#teadeck-settings-theme').inputValue(), 'assam');
    await page.locator('#teadeck-settings-contrast').selectOption('high');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.teadeckTheme), 'assam');

    // Only what was chosen is stored, so later deployment defaults still apply to the rest.
    const stored = await page.evaluate(() => JSON.parse(localStorage[Object.keys(localStorage).find((key) => key.endsWith(':frontendSettings'))]));
    assert.deepEqual(stored, { theme: 'assam', contrast: 'high' });

    await page.reload();
    await page.locator('#teadeck-settings-theme').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.teadeckTheme), 'assam');
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});
