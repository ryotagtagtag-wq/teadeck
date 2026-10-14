import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { createStaticServer } from './server.mjs';
import { texts } from '../integration/texts.ts';
import { availableLocales } from '../integration/ui_locale.ts';
import { textsFor, upstreamEnglish, upstreamLocales } from '../scripts/texts.mjs';

/**
 * Teadeck speaks the reader's language: words Mastodon itself translates come
 * from upstream's own locale files, Teadeck's own sentences from its catalogue
 * (integration/texts.ts), and anything a language is missing stays English.
 */

const upstream = join(import.meta.dirname, '..', '.work/upstream');
const distLocale = async (locale) => JSON.parse(await readFile(join(import.meta.dirname, '..', 'dist/texts', `${locale}.json`), 'utf8'));

test('every upstream message the catalogue points at still exists, with the same English text', async () => {
  const english = await upstreamEnglish(upstream);
  for (const [id, message] of Object.entries(texts)) {
    if (!message.upstream) continue;
    const text = english(message.upstream);
    assert.ok(text, `${id}: upstream no longer has ${message.upstream}`);
    // index.html carries the English text literally; a changed upstream wording
    // has to be copied there, or the page would change language on load.
    assert.equal(message.en, text, `${id} (${message.upstream})`);
  }
});

test('a language takes upstream words from upstream and Teadeck sentences from its catalogue', async () => {
  const german = await distLocale('de');
  assert.equal(german.signIn, 'Anmelden'); // upstream's own auth.login
  assert.equal(german.domain, 'Domain');
  assert.equal(german.lead, texts.lead.de); // Teadeck's own sentence
  assert.equal(german.staySignedIn, 'Angemeldet bleiben');

  const french = await distLocale('fr');
  assert.notEqual(french.signIn, texts.signIn.en);
  assert.equal(french.lead, texts.lead.en); // no French translation of Teadeck's own text
});

test('every offered language has a file, and nothing in it is empty', async () => {
  const offered = await upstreamLocales(upstream);
  assert.deepEqual([...availableLocales].sort(), offered,
    'availableLocales no longer matches upstream/app/javascript/mastodon/locales');
  for (const locale of availableLocales) {
    const file = await distLocale(locale);
    assert.deepEqual(Object.keys(file).sort(), Object.keys(texts).sort(), locale);
    for (const [id, text] of Object.entries(file)) assert.ok(text.length > 0, `${locale}/${id}`);
  }
});

test('a language upstream does not translate falls back to English', () => {
  const english = textsFor('xx', null, null);
  assert.equal(english.signIn, texts.signIn.en);
  assert.equal(english.lead, texts.lead.en);
});

let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

/** The sign-in page as a browser with these languages (and optionally a stored choice) sees it. */
async function signInPage({ locale, stored }) {
  const { server, origin } = await createStaticServer();
  const context = await browser.newContext({ locale });
  if (stored) {
    await context.addInitScript((value) => {
      localStorage.setItem('teadeck.appearance', JSON.stringify({ theme: 'assam', colorScheme: 'auto', locale: value }));
    }, stored);
  }
  const page = await context.newPage();
  await page.goto(`${origin}/login`);
  await page.locator('#teadeck-login').waitFor();
  return { page, stop: async () => { await context.close(); server.closeAllConnections(); server.close(); } };
}

test('the page greets in the browser language, and marks the document with it', async () => {
  const french = await distLocale('fr');
  const { page, stop } = await signInPage({ locale: 'fr-FR' });
  try {
    assert.equal(await page.locator('#teadeck-login .title').textContent(), french.signIn);
    assert.equal(await page.locator('#teadeck-login button[type=submit]').textContent(), french.signIn);
    assert.equal(await page.locator('label[for=teadeck-instance]').textContent(), french.domain);
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'fr');
    assert.equal(await page.evaluate(() => document.documentElement.dir), 'ltr');
  } finally { await stop(); }
});

test('German gets Teadeck\'s own sentences as well', async () => {
  const { page, stop } = await signInPage({ locale: 'de-DE' });
  try {
    assert.equal(await page.locator('#teadeck-login .title').textContent(), 'Anmelden');
    assert.equal(await page.locator('#teadeck-login .lead').textContent(), texts.lead.de);
    assert.equal(await page.locator('label[for=teadeck-remember]').textContent(), texts.staySignedIn.de);
  } finally { await stop(); }
});

test('a language Teadeck does not offer reads English, not an empty page', async () => {
  const { page, stop } = await signInPage({ locale: 'xh-ZA' });
  try {
    assert.equal(await page.locator('#teadeck-login .title').textContent(), texts.signIn.en);
    assert.equal(await page.locator('#teadeck-login .lead').textContent(), texts.lead.en);
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  } finally { await stop(); }
});

test('a right-to-left language turns the page around', async () => {
  const arabic = await distLocale('ar');
  const { page, stop } = await signInPage({ locale: 'ar-EG' });
  try {
    assert.equal(await page.locator('#teadeck-login .title').textContent(), arabic.signIn);
    assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('rtl')), true);
  } finally { await stop(); }
});

test('the language chosen in the settings wins over the browser preference', async () => {
  const japanese = await distLocale('ja');
  const { page, stop } = await signInPage({ locale: 'de-DE', stored: 'ja' });
  try {
    assert.equal(await page.locator('#teadeck-login .title').textContent(), japanese.signIn);
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'ja');
  } finally { await stop(); }
});

test('an error names its cause in the reader\'s language', async () => {
  const { page, stop } = await signInPage({ locale: 'de-DE' });
  try {
    // Not an address of a server: the message is Teadeck's own, shown in German.
    await page.locator('#teadeck-instance').fill('http://not-https.test/path');
    await page.locator('#teadeck-login button[type=submit]').click();
    await page.locator('#teadeck-status.alert').waitFor();
    assert.equal(await page.locator('#teadeck-status').textContent(), texts.errorInstanceUrl.de);
  } finally { await stop(); }
});
