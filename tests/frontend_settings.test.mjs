import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import {
  defaultFrontendSettings,
  frontendSettingsMeta,
  layoutStartPath,
  resolveFrontendSettings,
} from '../integration/frontend_settings.ts';
import { defaultNotificationShows, readNotificationShows } from '../integration/notification_settings.ts';
import { detectLocale, isRtlLocale, resolveLocale } from '../integration/ui_locale.ts';
import { account, instance, timelineText } from './fixtures.mjs';
import { mockMastodon, openPreferences } from './mastodon_mock.mjs';
import { browser, collectPageErrors, origin, useApp } from './harness.mjs';

test('defaults follow the account reading preferences and the system motion setting', () => {
  const defaults = defaultFrontendSettings({ 'reading:expand:media': 'hide_all', 'reading:expand:spoilers': true }, true);
  assert.equal(defaults.displayMedia, 'hide_all');
  assert.equal(defaults.expandSpoilers, true);
  assert.equal(defaults.reduceMotion, true);
  // Mastodon's web defaults: new posts slide in live, boosting doesn't ask first.
  assert.equal(defaults.usePendingItems, false);
  assert.equal(defaults.boostModal, false);
  assert.equal(defaults.deleteModal, true);

  const withoutServerPreferences = defaultFrontendSettings({ 'reading:expand:media': 'bogus' }, false);
  assert.equal(withoutServerPreferences.displayMedia, 'default');
  assert.equal(withoutServerPreferences.expandSpoilers, false);
});

test('stored settings win field by field, malformed values fall back to defaults', () => {
  const defaults = defaultFrontendSettings({}, false);
  const resolved = resolveFrontendSettings({ autoPlayGif: true, displayMedia: 'show_all', boostModal: 'yes', unknown: 1 }, defaults);
  assert.deepEqual(resolved, { ...defaults, autoPlayGif: true, displayMedia: 'show_all' });
  assert.deepEqual(resolveFrontendSettings(null, defaults), defaults);
  assert.deepEqual(resolveFrontendSettings([true], defaults), defaults);
});

test('maps onto the initial-state fields upstream reads', () => {
  const defaults = defaultFrontendSettings({}, false);
  assert.equal(defaults.colorScheme, 'auto');
  assert.equal(defaults.contrast, 'auto');
  assert.equal(defaults.emojiStyle, 'auto');
  assert.equal(defaults.disableSwiping, false);
  assert.equal(defaults.disableHoverCards, false);
  assert.equal(defaults.useSystemFont, false);
  assert.equal(defaults.useSystemScrollbars, false);

  const meta = frontendSettingsMeta(defaults);
  assert.deepEqual(Object.keys(meta).sort(), [
    'auto_play_gif', 'boost_modal', 'delete_modal', 'disable_hover_cards', 'disable_swiping',
    'display_media', 'emoji_style', 'expand_spoilers', 'missing_alt_text_modal', 'reduce_motion',
    'use_blurhash', 'use_pending_items',
  ]);
  assert.equal(layoutStartPath(true), '/deck/home');
  assert.equal(layoutStartPath(false), '/home');
});

test('resolveFrontendSettings validates the new enum fields the same way as displayMedia', () => {
  const defaults = defaultFrontendSettings({}, false);
  const resolved = resolveFrontendSettings({ colorScheme: 'dark', contrast: 'high', emojiStyle: 'bogus', useSystemFont: true }, defaults);
  assert.equal(resolved.colorScheme, 'dark');
  assert.equal(resolved.contrast, 'high');
  assert.equal(resolved.emojiStyle, 'auto');
  assert.equal(resolved.useSystemFont, true);
});

test('the UI language list resolves the closest available translation, else English', () => {
  assert.equal(detectLocale(['de-DE', 'en']), 'de');
  assert.equal(detectLocale(['pt-BR']), 'pt-BR');
  assert.equal(detectLocale(['zz-ZZ']), 'en');
  assert.equal(resolveLocale('fr', []), 'fr');
  assert.equal(resolveLocale('not-a-locale', ['de-DE']), 'de');
  assert.equal(resolveLocale(null, ['ja']), 'ja');
  assert.equal(isRtlLocale('ar'), true);
  assert.equal(isRtlLocale('de'), false);
});

test('notification shows default to upstream\'s own local settings', () => {
  assert.deepEqual(readNotificationShows({}), defaultNotificationShows);
  assert.deepEqual(readNotificationShows({ notifications: { shows: { follow: false, bogus: true } } }), {
    ...defaultNotificationShows, follow: false,
  });
});

useApp();

// The longest browser test here: it signs in, switches layout and reloads twice.
// 120 s, because the whole suite runs its files concurrently and this one is the
// first to overrun when the machine is busy.
test('settings buttons open a local frontend settings page; the multi-column layout shows home once', { timeout: 120_000 }, async () => {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  const pageErrors = collectPageErrors(page);

  await mockMastodon(context, origin);

  // Records whether the sign-in page ever becomes visible on a page load.
  await page.addInitScript(() => {
    window.__shellShown = false;
    document.addEventListener('DOMContentLoaded', () => {
      const shell = document.getElementById('teadeck-shell');
      const check = () => { if (!shell.hidden) window.__shellShown = true; };
      check();
      new MutationObserver(check).observe(shell, { attributes: true, attributeFilter: ['hidden'] });
    });
  });

  // Without a session every address leads to the separate sign-in page.
  await page.goto(`${origin}/deck/home`);
  await page.waitForURL(`${origin}/login`);
  await page.locator('#teadeck-login').waitFor();
  assert.equal(await page.locator('#teadeck-loading').isHidden(), true);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).waitFor();

  // No settings entry leads to the instance's server-rendered settings any more.
  assert.equal(await page.locator('a[href*="/settings/preferences"]').count(), 0);
  await openPreferences(page);
  await page.waitForURL(`${origin}/preferences`);
  await page.getByText('An die Instanz wird nichts übertragen.').waitFor();

  await page.getByLabel('Inhaltswarnungen immer ausklappen').check();
  await page.getByLabel('Layout').selectOption('advanced');
  await page.locator('#teadeck-settings-reload').getByRole('button').click();
  await page.waitForURL(`${origin}/deck/preferences`);
  await page.getByText('An die Instanz wird nichts übertragen.').waitFor();
  // Reloading while signed in shows a loading indicator, never the sign-in page.
  assert.equal(await page.evaluate(() => window.__shellShown), false);
  assert.equal(await page.locator('#teadeck-loading').isHidden(), true);

  const meta = await page.evaluate(() => JSON.parse(document.getElementById('initial-state').textContent).meta);
  assert.equal(meta.expand_spoilers, true);
  assert.equal(meta.advanced_layout, true);
  assert.equal(await page.getByLabel('Inhaltswarnungen immer ausklappen').isChecked(), true);

  // Its column has a back arrow, also right after the reload (no in-app history to go back to).
  await page.locator('.column-header__back-button').click();
  // Back to the start of the layout: Mastodon's redesign opens it at /deck/.
  await page.waitForURL(`${origin}/deck/`);
  assert.equal(await page.getByText('An die Instanz wird nichts übertragen.').count(), 0);

  await page.goto(origin);
  await page.waitForURL(`${origin}/deck/home`);
  await page.getByText(timelineText).first().waitFor();
  // Home is pinned, so its route shows Mastodon's placeholder beside it, not a second copy.
  const homePosts = page.locator('article:not(:has(article))').filter({ hasText: timelineText });
  assert.equal(await homePosts.count(), 1);

  // Links in the navigation to already pinned columns must not open them a second time.
  const notificationTitles = page.locator('[id^="skip-link-target-content-"]').filter({ hasText: /^Benachrichtigungen$/ });
  assert.equal(await notificationTitles.count(), 1);
  for (const [label, path] of [['Startseite', '/deck/home'], ['Benachrichtigungen', '/deck/notifications']]) {
    await page.getByRole('link', { name: label, exact: true }).first().click();
    await page.waitForURL(`${origin}${path}`);
    await page.getByText('Beiträge und andere Seiten werden in dieser Spalte geöffnet.').or(page.getByText('Posts and other pages will open in this column.')).waitFor();
    assert.equal(await homePosts.count(), 1, label);
    assert.equal(await notificationTitles.count(), 1, label);
  }

  assert.deepEqual(pageErrors, []);
  await context.close();
});
