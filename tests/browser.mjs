import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { timelineText } from './fixtures.mjs';
import { mockMastodon, openPreferences, signOut } from './mastodon_mock.mjs';
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

test('static SPA completes OAuth and renders the Mastodon home timeline', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  const localApiRequests = [];
  const pageErrors = [];

  await page.addInitScript(() => {
    window.__teadeckServiceWorkers = [];
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register = (...args) => {
        window.__teadeckServiceWorkers.push(args);
        return Promise.reject(new Error('Unexpected service worker registration'));
      };
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === origin && url.pathname.startsWith('/api/')) localApiRequests.push(url.href);
  });

  const server = await mockMastodon(page, origin, {
    '/api/v1/preferences': { 'posting:default:visibility': 'private', 'posting:default:language': 'de' },
    '/api/v1/markers': {},
  });
  const tokenExchanges = () => server.requests.filter((request) => request.path === '/oauth/token').length;

  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).waitFor();
  assert.equal(tokenExchanges(), 1);

  await page.reload();
  await page.getByText(timelineText).waitFor();
  // The former top bar is gone: layout lives in the settings page, sign-out in the navigation list.
  assert.equal(await page.locator('#teadeck-bar').count(), 0);
  await openPreferences(page);
  await page.getByLabel('Layout').selectOption('advanced');
  // Layout is saved immediately and takes effect through the offered reload.
  await page.locator('#teadeck-settings-reload').getByRole('button').click();
  await page.waitForURL(`${origin}/deck/preferences`);
  await page.goto(origin);
  await page.waitForURL(`${origin}/deck/home`);
  await page.getByText(timelineText).first().waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage[Object.keys(localStorage).find((key) => key.endsWith(':advancedLayout'))]).valueOf()), true);
  assert.equal(await page.locator('a[href="https://git.knubbel.me/teadeck/teadeck"]').count() > 0, true);

  await signOut(page);
  await page.waitForURL(`${origin}/login`);
  await page.locator('#teadeck-login').waitFor();
  assert.deepEqual(localApiRequests, []);
  // Only Teadeck's own offline service worker, not upstream's (which targets a Rails server).
  assert.deepEqual((await page.evaluate(() => window.__teadeckServiceWorkers)).map(([url]) => url).filter(url => url !== '/sw.js'), []);
  assert.deepEqual(pageErrors, []);
  await context.close();
});
