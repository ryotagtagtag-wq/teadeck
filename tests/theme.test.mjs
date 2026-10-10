import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { timelineText } from './fixtures.mjs';
import { mockMastodon, signIn, openPreferences } from './mastodon_mock.mjs';
import { createStaticServer } from './server.mjs';

// Teadeck's own designs (Assam, Sencha) are a layer of CSS variables over
// Mastodon's theme, chosen on the settings page.
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

async function signedInPage() {
  const context = await browser.newContext({ locale: 'de-DE' });
  await mockMastodon(context, origin);
  const page = await context.newPage();
  await signIn(page, origin);
  return { context, page };
}

/** Chooses design and colour scheme on the settings page and returns what the interface looks like afterwards. */
async function choose(page, { theme, colorScheme }) {
  await openPreferences(page);
  await page.locator('#teadeck-settings-theme').waitFor();
  await page.locator('#teadeck-settings-theme').selectOption(theme);
  await page.locator('#teadeck-settings-color-scheme').selectOption(colorScheme);
  // Appearance settings are saved and applied immediately.
  await page.goto(origin);
  await page.getByText(timelineText).waitFor();
  return page.evaluate(() => {
    const styles = getComputedStyle(document.body);
    const publish = [...document.querySelectorAll('button')].find((element) => /^(Neuer Beitrag|New Post)$/.test(element.textContent.trim()));
    const button = publish ? getComputedStyle(publish) : null;
    return {
      theme: document.documentElement.dataset.teadeckTheme ?? null,
      colorScheme: document.documentElement.dataset.colorScheme,
      font: styles.fontFamily,
      surface: getComputedStyle(document.documentElement).getPropertyValue('--color-bg-primary').trim(),
      brand: getComputedStyle(document.documentElement).getPropertyValue('--color-indigo-500').trim(),
      button: button && { background: button.backgroundColor, border: button.borderTopColor, radius: button.borderTopLeftRadius },
    };
  });
}

test('each tea design replaces colours, fonts and radii; Mastodon\'s design stays available', { timeout: 180_000 }, async () => {
  const { context, page } = await signedInPage();
  try {
    const mastodon = await choose(page, { theme: 'mastodon', colorScheme: 'dark' });
    assert.equal(mastodon.theme, null);
    assert.match(mastodon.font, /Inter/);
    assert.equal(mastodon.brand, '#705dd6');

    // Every design of Teadeck's own: its ground and accent differ from Mastodon's
    // and from each other, the typeface follows the half, and the main button takes the accent.
    const grounds = new Map([['mastodon/dark', mastodon.surface]]);
    const accents = new Map([['mastodon/dark', mastodon.brand]]);
    const buttons = new Map([['mastodon/dark', mastodon.button.background]]);
    for (const [theme, colorScheme, font] of [
      ['assam', 'dark', /Teadeck IBM Plex Sans/],
      ['assam', 'light', /Teadeck Public Sans/],
      ['sencha', 'dark', /Teadeck IBM Plex Sans/],
      ['sencha', 'light', /Teadeck Public Sans/],
    ]) {
      const design = await choose(page, { theme, colorScheme });
      const name = `${theme}/${colorScheme}`;
      assert.equal(design.theme, theme, name);
      assert.equal(design.colorScheme, colorScheme, name);
      assert.match(design.font, font, name);
      for (const [other, background] of buttons) assert.notEqual(design.button.background, background, `${name} and ${other} share a button colour`);
      buttons.set(name, design.button.background);
      for (const [other, ground] of grounds) assert.notEqual(design.surface, ground, `${name} and ${other} share a ground`);
      for (const [other, accent] of accents) assert.notEqual(design.brand, accent, `${name} and ${other} share an accent`);
      grounds.set(name, design.surface);
      accents.set(name, design.brand);
    }

    // The two halves of one tea: same tea, different brightness.
    const [assamDark, assamLight] = [grounds.get('assam/dark'), grounds.get('assam/light')];
    assert.notEqual(assamDark, assamLight);

    // The design survives a reload, like the other settings.
    await page.reload();
    await page.getByText(timelineText).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.teadeckTheme), 'sencha');

    // The fonts really come from this deployment, not from a remote service.
    const fonts = await page.evaluate(() => performance.getEntriesByType('resource')
      .map((entry) => entry.name).filter((name) => name.endsWith('.woff2')));
    assert.ok(fonts.some((name) => name.includes('public-sans')), fonts.join(' '));
    assert.ok(fonts.every((name) => new URL(name).origin === origin), fonts.join(' '));
  } finally {
    await context.close();
  }
});
