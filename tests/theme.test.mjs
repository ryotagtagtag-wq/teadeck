import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { designs } from '../integration/themes/index.ts';
import { timelineText } from './fixtures.mjs';
import { mockMastodon, signIn, openPreferences } from './mastodon_mock.mjs';
import { createStaticServer } from './server.mjs';

// Teadeck's own designs (Assam, Sencha, Hibiscus) are a layer of CSS variables
// over Mastodon's theme, chosen on the settings page; Hibiscus restyles a few
// components too.
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
      button: button && { background: button.backgroundColor, color: button.color, border: button.borderTopColor, radius: button.borderTopLeftRadius },
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
    // Every design of the registry, with the body face its half names.
    for (const [theme, colorScheme, font] of designs.flatMap((design) => ['dark', 'light'].map((scheme) => [
      design.id, scheme, new RegExp(design[scheme].fonts.body.split(',')[0].replaceAll("'", '').trim()),
    ]))) {
      const design = await choose(page, { theme, colorScheme });
      const name = `${theme}/${colorScheme}`;
      assert.equal(design.theme, theme, name);
      assert.equal(design.colorScheme, colorScheme, name);
      assert.match(design.font, font, name);
      // Outlined buttons (Hibiscus) are told apart by their text colour.
      const paint = design.button.background === 'rgba(0, 0, 0, 0)' ? design.button.color : design.button.background;
      for (const [other, colour] of buttons) assert.notEqual(paint, colour, `${name} and ${other} share a button colour`);
      buttons.set(name, paint);
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
    assert.equal(await page.evaluate(() => document.documentElement.dataset.teadeckTheme), designs.at(-1).id);

    // The fonts really come from this deployment, not from a remote service.
    const fonts = await page.evaluate(() => performance.getEntriesByType('resource')
      .map((entry) => entry.name).filter((name) => name.endsWith('.woff2')));
    assert.ok(fonts.some((name) => designs.at(-1).fonts.some((font) => name.includes(font.file.replace('.woff2', '')))), fonts.join(' '));
    assert.ok(fonts.every((name) => new URL(name).origin === origin), fonts.join(' '));
  } finally {
    await context.close();
  }
});

test('Hibiscus is square and speaks in condensed capitals: column titles, names, headings and an outlined main button', { timeout: 90_000 }, async () => {
  const { context, page } = await signedInPage();
  try {
    await choose(page, { theme: 'hibiscus', colorScheme: 'dark' });
    const look = await page.evaluate(() => {
      const style = (selector) => { const element = document.querySelector(selector); return element && getComputedStyle(element); };
      const title = style('._comp_column_header__title button');
      const name = style('._comp_status_header__nameLink .display-name');
      const avatar = style('.account__avatar');
      const publish = [...document.querySelectorAll('button')].find((element) => element.textContent.trim() === 'Neuer Beitrag');
      const button = getComputedStyle(publish);
      return {
        title: [title.fontFamily, title.textTransform],
        name: [name.fontFamily, name.textTransform],
        avatarRadius: avatar.borderTopLeftRadius,
        // The split "New post" button carries one frame around both parts.
        button: [button.backgroundColor, getComputedStyle(publish.closest('.teadeck-new-post')).boxShadow, button.textTransform, button.borderTopLeftRadius],
      };
    });
    assert.match(look.title[0], /Teadeck Barlow Condensed/);
    assert.equal(look.title[1], 'uppercase');
    assert.match(look.name[0], /Teadeck Barlow Condensed/);
    assert.equal(look.name[1], 'uppercase');
    assert.equal(look.avatarRadius, '0px');
    const [background, outline, transform, radius] = look.button;
    assert.equal(background, 'rgba(0, 0, 0, 0)');
    assert.match(outline, /inset/);
    assert.equal(transform, 'uppercase');
    assert.equal(radius, '0px');

    // Post headings in the display face.
    await page.evaluate(() => {
      const heading = document.createElement('h1');
      heading.textContent = 'Teekanne';
      document.querySelector('.status__content__text').prepend(heading);
    });
    const heading = await page.locator('.status__content__text h1').evaluate((element) => getComputedStyle(element).fontFamily);
    assert.match(heading, /Teadeck Big Shoulders Display/);
  } finally {
    await context.close();
  }
});
