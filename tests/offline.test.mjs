import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import { account, timelineText } from './fixtures.mjs';
import { signedInPage, useApp } from './harness.mjs';
import { createStaticServer } from './server.mjs';

useApp();

/** A signed-in page against the server of this test, with the timeline loaded. */
async function openTimeline(origin) {
  const session = await signedInPage({
    origin,
    routes: {
      '/api/v1/accounts/lookup': account,
      [`/api/v1/accounts/${account.id}`]: account,
    },
  });
  await session.page.getByText(timelineText).waitFor();
  return session;
}

/** Polls an async page function; Playwright's waitForFunction treats the returned promise itself as truthy. */
async function waitUntil(page, predicate, arg, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (!(await page.evaluate(predicate, arg))) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${predicate}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** Waits until the service worker controls the page, i.e. installation (caching the app) has completed. */
async function waitForOfflineReady(page, version) {
  await waitUntil(page, async (expected) => {
    const registration = await navigator.serviceWorker.getRegistration();
    const scriptVersion = registration?.active && navigator.serviceWorker.controller
      ? (await caches.keys()).find((name) => name.startsWith('teadeck-core-'))
      : undefined;
    return expected ? scriptVersion === `teadeck-core-${expected}` : Boolean(scriptVersion);
  }, version);
}

async function stop(server) {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

test('after the first start the app runs without the Teadeck web server', { timeout: 120_000 }, async () => {
  const { server, origin } = await createStaticServer();
  const { context, page } = await openTimeline(origin);
  try {
    await waitForOfflineReady(page);

    // Emoji images arrive in the background, without holding up the start.
    await waitUntil(page, async () => Boolean(await (await caches.open('teadeck-background')).match('/emoji/1f600.svg')));

    await stop(server);

    // Reload and open a view whose code is loaded lazily, both with the web server gone.
    await page.reload();
    await page.getByText(timelineText).waitFor();
    await page.locator(`a[href="/@${account.acct}"]`).first().click();
    await page.getByText('Test account').first().waitFor();
    const emojiStatus = await page.evaluate(() => fetch('/emoji/1f600.svg').then((response) => response.status));
    assert.equal(emojiStatus, 200);

    // A new tab starts offline as well (without "Stay signed in" it has no session: the sign-in page).
    const secondTab = await context.newPage();
    await secondTab.goto(`${origin}/home`);
    await secondTab.locator('#teadeck-login').waitFor();
  } finally {
    await context.close();
    server.closeAllConnections();
    server.close();
  }
});

test('a new deploy is offered during the session and used after the reload button', { timeout: 120_000 }, async () => {
  const dist = join(import.meta.dirname, '..', 'dist');
  const currentManifest = (await readdir(dist)).find((file) => /^offline-[0-9a-f]+\.json$/.test(file));
  const currentVersion = currentManifest.slice('offline-'.length, -'.json'.length);
  const nextVersion = 'feedfacefeedface';
  let deployed = false;
  const { server, origin } = await createStaticServer({
    // Simulated deploy: same files, new version number.
    override: async (pathname, read) => {
      if (!deployed) return undefined;
      if (pathname === '/sw.js') return { type: 'text/javascript', body: (await read('sw.js')).toString().replaceAll(currentVersion, nextVersion) };
      if (pathname === `/offline-${nextVersion}.json`) return { type: 'application/json', body: await read(currentManifest) };
      return undefined;
    },
  });
  const { context, page } = await openTimeline(origin);
  try {
    await waitForOfflineReady(page);

    deployed = true;
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
    const reload = page.locator('#teadeck-update-reload');
    await reload.waitFor({ timeout: 60_000 });
    // Stays visible (Mastodon's own alerts disappear after 5 seconds).
    await page.waitForTimeout(6_000);
    assert.equal(await reload.isVisible(), true);
    // Activating the new worker and reloading can take long while other test files run.
    await Promise.all([page.waitForEvent('load', { timeout: 90_000 }), reload.click()]);
    await page.getByText(timelineText).waitFor();

    const cacheNames = await page.evaluate(() => caches.keys());
    assert.ok(cacheNames.includes(`teadeck-core-${nextVersion}`));
    assert.ok(!cacheNames.includes(`teadeck-core-${currentVersion}`), 'the previous version\'s cache is removed');
    assert.equal(await page.locator('#teadeck-update').isHidden(), true);
  } finally {
    await context.close();
    await stop(server);
  }
});
