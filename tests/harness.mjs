import { after, before } from 'node:test';

import { storageKeys } from '../integration/browser_storage.ts';
import { closeBrowsers, launchBrowser } from './browsers.mjs';
import { mockMastodon, signIn } from './mastodon_mock.mjs';
import { createStaticServer } from './server.mjs';

export { submitSignIn } from './mastodon_mock.mjs';

/**
 * What most browser tests share: dist/ served locally and a headless browser,
 * set up once per test file by useApp(). `origin` and `browser` are live
 * bindings, filled in before the first test runs.
 */
export let origin;
export let browser;
let server;

export function useApp() {
  before(async () => {
    ({ server, origin } = await createStaticServer());
    browser = await launchBrowser('chromium');
  });
  after(async () => {
    await closeBrowsers();
    await new Promise((resolve) => server?.close(resolve));
  });
}

/** Errors thrown in the page, collected for an assertion at the end. */
export function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Where Teadeck keeps a setting of a mock account (storage.ts). */
export function preferenceKey(name, accountId = '42') {
  return `${storageKeys.accountPrefix}https://mastodon.test:${accountId}:${name}`;
}

/** Starts the mock account in the multi-column layout, as its setting would. */
export async function useMultiColumnLayout(context) {
  await context.addInitScript((key) => localStorage.setItem(key, 'true'), preferenceKey('advancedLayout'));
}

/**
 * A page signed in to the mock server (mastodon_mock.mjs) with `routes` on top
 * of its defaults; `deployment` is served as /teadeck.json (TEADECK_THEME, …).
 */
export async function signedInPage({
  locale = 'de-DE', viewport, colorScheme, layout = 'single', deployment, routes = {}, engine = 'chromium',
} = {}) {
  const context = await (engine === 'chromium' ? browser : await launchBrowser(engine)).newContext({
    locale, ...(viewport ? { viewport } : {}), ...(colorScheme ? { colorScheme } : {}),
  });
  if (layout === 'multi') await useMultiColumnLayout(context);
  if (deployment) {
    await context.route(`${origin}/teadeck.json`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(deployment) }));
  }
  const { requests } = await mockMastodon(context, origin, routes);
  const page = await context.newPage();
  const pageErrors = collectPageErrors(page);
  await signIn(page, origin);
  return { context, page, pageErrors, requests };
}
