import assert from 'node:assert/strict';
import { test } from 'node:test';

import { account } from './fixtures.mjs';
import { mockMastodon } from './mastodon_mock.mjs';
import { withFilterBarDefault } from '../integration/notification_settings.ts';
import { browser, collectPageErrors, origin, preferenceKey, submitSignIn, useApp, useMultiColumnLayout } from './harness.mjs';

/**
 * The notifications column sorts by kind from the start: upstream hides every
 * category but "All" and "Mentions" behind a switch, Teadeck shows them and
 * leaves the switch in place.
 */

const advancedFilters = [
  'Erwähnungen', 'Favoriten', 'Geteilte Beiträge', 'Umfrageergebnisse',
  'Neue Beiträge von abonnierten Profilen', 'Neue Follower',
];

test('the full bar is switched on once, and every later choice wins', () => {
  const fresh = withFilterBarDefault({});
  assert.equal(fresh.notifications.quickFilter.advanced, true);

  // Upstream stores its own default along with any other change: that is not a choice.
  const persistedDefault = { notifications: { quickFilter: { active: 'all', show: true, advanced: false } } };
  const upgraded = withFilterBarDefault(persistedDefault);
  assert.equal(upgraded.notifications.quickFilter.advanced, true);
  assert.equal(upgraded.notifications.quickFilter.active, 'all');

  // Once applied, turning the short bar back on is kept.
  const chosen = { notifications: { quickFilter: { ...upgraded.notifications.quickFilter, advanced: false } } };
  assert.equal(withFilterBarDefault(chosen).notifications.quickFilter.advanced, false);

  // Other settings are left untouched.
  const withColumns = { columns: [{ id: 'HOME' }], notifications: { shows: { follow: false } } };
  const merged = withFilterBarDefault(withColumns);
  assert.deepEqual(merged.columns, withColumns.columns);
  assert.deepEqual(merged.notifications.shows, { follow: false });
});

useApp();

async function signedInDeck({ storedSettings } = {}) {
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 1400, height: 800 } });
  await useMultiColumnLayout(context);
  await context.addInitScript(({ key, settings }) => {
    if (settings && !sessionStorage.getItem('seeded')) {
      localStorage.setItem(key, JSON.stringify(settings));
      sessionStorage.setItem('seeded', '1');
    }
  }, { key: preferenceKey('settings'), settings: storedSettings ?? null });
  await mockMastodon(context, origin);
  const page = await context.newPage();
  const pageErrors = collectPageErrors(page);
  await submitSignIn(page, origin);
  const filters = page.locator('.notification__filter-bar button');
  await filters.first().waitFor({ timeout: 30_000 });
  const titles = () => filters.evaluateAll((buttons) => buttons.map((button) => button.title || button.textContent.trim()));
  return { page, filters, titles, pageErrors, stop: async () => { await context.close(); } };
}

test('the notifications column sorts by kind without being switched on first', { timeout: 60_000 }, async () => {
  const deck = await signedInDeck();
  try {
    const shown = await deck.titles();
    assert.equal(shown[0], 'Alles');
    for (const filter of advancedFilters) assert.ok(shown.includes(filter), `${filter} fehlt: ${shown.join(' | ')}`);
    assert.deepEqual(deck.pageErrors, []);
  } finally { await deck.stop(); }
});

test('the switch for the short bar still works and is remembered', { timeout: 60_000 }, async () => {
  const deck = await signedInDeck();
  try {
    await deck.page.getByRole('button', { name: 'Benachrichtigungseinstellungen öffnen' }).first().click();
    await deck.page.getByLabel('Alle Filterkategorien anzeigen').first().uncheck({ force: true });
    await deck.page.waitForFunction(() => document.querySelectorAll('.notification__filter-bar button').length === 2);

    await deck.page.reload();
    await deck.filters.first().waitFor({ timeout: 30_000 });
    assert.deepEqual(await deck.titles(), ['Alles', 'Erwähnungen'], 'the choice survives a reload');
  } finally { await deck.stop(); }
});

test('an account that already stored upstream\'s short bar gets the full one', { timeout: 60_000 }, async () => {
  // What any earlier change of settings left behind, without the reader choosing it.
  const deck = await signedInDeck({ storedSettings: { notifications: { quickFilter: { active: 'all', show: true, advanced: false } } } });
  try {
    const shown = await deck.titles();
    for (const filter of advancedFilters) assert.ok(shown.includes(filter), `${filter} fehlt: ${shown.join(' | ')}`);
  } finally { await deck.stop(); }
});
