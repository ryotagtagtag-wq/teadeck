import assert from 'node:assert/strict';
import { test } from 'node:test';

import { designs } from '../integration/themes/index.ts';
import { account, status, timelineText } from './fixtures.mjs';
import { openPreferences } from './mastodon_mock.mjs';
import { origin, signedInPage, useApp } from './harness.mjs';

// Teadeck's own designs (Assam, Sencha, Hibiscus) are a layer of CSS variables
// over Mastodon's theme, chosen on the settings page; Hibiscus restyles a few
// components too.
useApp();

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

test('Hibiscus is chamfered and speaks in condensed capitals: marked column titles, names, a filled main button, icon-only bottom links', { timeout: 90_000 }, async () => {
  const { context, page } = await signedInPage();
  try {
    await choose(page, { theme: 'hibiscus', colorScheme: 'dark' });
    const look = await page.evaluate(() => {
      const style = (selector, pseudo) => { const element = document.querySelector(selector); return element && getComputedStyle(element, pseudo); };
      const title = style('._comp_column_header__title');
      const marker = style('._comp_column_header__title', '::before');
      const name = style('._comp_status_header__nameLink .display-name');
      const avatar = style('.account__avatar');
      const publish = [...document.querySelectorAll('button')].find((element) => element.textContent.trim() === 'Neuer Beitrag');
      const button = getComputedStyle(publish);
      const label = style('._navigation_panel_redesign__footerNav ._navigation_panel_redesign_navigation_link__label');
      return {
        layout: { ...document.documentElement.dataset },
        title: [title.fontFamily, title.textTransform, title.justifyContent || title.textAlign],
        marker: [marker.width, marker.backgroundColor],
        name: [name.fontFamily, name.textTransform],
        avatar: avatar.clipPath,
        button: [button.backgroundColor, button.textTransform, getComputedStyle(publish.closest('.teadeck-new-post')).clipPath],
        footerLabel: label.clipPath,
        grain: getComputedStyle(document.body, '::after').opacity,
      };
    });
    assert.equal(look.layout.teadeckShape, 'chamfered');
    assert.equal(look.layout.teadeckTitles, 'marked');
    assert.match(look.title[0], /Teadeck Big Shoulders Display/);
    assert.equal(look.title[1], 'uppercase');
    assert.deepEqual(look.marker, ['4px', 'rgb(208, 49, 44)']);
    assert.match(look.name[0], /Teadeck Barlow Condensed/);
    assert.equal(look.name[1], 'uppercase');
    assert.match(look.avatar, /^polygon/);
    const [background, transform, clip] = look.button;
    assert.equal(background, 'rgb(184, 34, 31)');
    assert.equal(transform, 'uppercase');
    assert.match(clip, /^polygon/);
    // The bottom links show icons; their names stay for screen readers.
    assert.equal(look.footerLabel, 'inset(50%)');
    assert.equal(await page.getByRole('link', { name: 'Benachrichtigungen' }).count() > 0, true);
    assert.equal(look.grain, '0.09');

    // Post headings in the display face.
    await page.evaluate(() => {
      const heading = document.createElement('h1');
      heading.textContent = 'Teekanne';
      document.querySelector('.status__content__text').prepend(heading);
    });
    const heading = await page.locator('.status__content__text h1').evaluate((element) => getComputedStyle(element).fontFamily);
    assert.match(heading, /Teadeck Big Shoulders Display/);

    // Mastodon's own design takes none of it.
    await choose(page, { theme: 'mastodon', colorScheme: 'dark' });
    const mastodon = await page.evaluate(() => ({ ...document.documentElement.dataset }));
    assert.equal(mastodon.teadeckShape, undefined);
    assert.equal(mastodon.teadeckTitles, undefined);
  } finally {
    await context.close();
  }
});

test('in notifications, a post on a card keeps its heading on the card', { timeout: 60_000 }, async () => {
  const other = { ...account, id: '7', username: 'tek', acct: 'tek@freeradical.zone', display_name: 'Tek' };
  const notifications = {
    notification_groups: [{
      group_key: 'ungrouped-1', notifications_count: 1, type: 'mention', most_recent_notification_id: '11',
      page_min_id: '11', page_max_id: '11', latest_page_notification_at: '2026-10-14T10:00:00Z', sample_account_ids: ['7'], status_id: '900',
    }],
    accounts: [other], statuses: [{ ...status, id: '900', account: other }],
  };
  const { context, page } = await signedInPage({ deployment: { theme: 'hibiscus', colorScheme: 'dark' }, routes: { '/api/v2/notifications': notifications } });
  try {
    await page.evaluate(() => { history.pushState(null, '', '/notifications'); dispatchEvent(new PopStateEvent('popstate')); });
    const entry = page.locator('.notification-ungrouped').first();
    await entry.waitFor();
    // The card is the whole notification; the post inside lies on it without a card of its own.
    const grounds = await entry.evaluate((element) => ({
      entry: getComputedStyle(element).backgroundColor,
      post: getComputedStyle(element.querySelector('._comp_status__variantFeed')).backgroundColor,
    }));
    assert.deepEqual(grounds, { entry: 'rgb(27, 23, 24)', post: 'rgba(0, 0, 0, 0)' });
  } finally { await context.close(); }
});
