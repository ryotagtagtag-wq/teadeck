import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { writeOfflineFiles } from '../scripts/offline_manifest.mjs';
import { account, instance, status, timelineText } from './fixtures.mjs';
import { nginxSkipReason, productionConfig, startNginx } from './nginx.mjs';

// Runs the built client behind the real nginx configuration (CSP, cache headers),
// and deploys a second, different build while tabs of the first are open.
const skip = nginxSkipReason();
const root = join(import.meta.dirname, '..');
const dist = join(root, 'dist');
// Same file system as dist/, for hard links.
const work = join(root, '.work', 'production-test');

let browser;
let buildA;
let buildB;
let configB;
let versionA;
let versionB;
let oldChunk;
let newChunk;

const offlineVersion = async (dir) => (await readdir(dir)).find((file) => /^offline-[0-9a-f]+\.json$/.test(file)).slice('offline-'.length, -'.json'.length);

function hardLinkCopy(from, to) {
  const copy = spawnSync('cp', ['-al', from, to]);
  if (copy.status !== 0) throw new Error(`cp -al failed: ${copy.stderr}`);
}

/** Replaces a file in a hard-linked copy without touching the original. */
async function replaceFile(path, content) {
  await rm(path);
  await writeFile(path, content);
}

before(async () => {
  if (skip) return;
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  buildA = join(work, 'a');
  buildB = join(work, 'b');
  hardLinkCopy(dist, buildA);
  hardLinkCopy(dist, buildB);
  versionA = await offlineVersion(buildA);

  // Build B: a later deploy, complete in itself. The profile view's chunk got a new
  // name, as it would after a change (so build A's file is gone from the server),
  // every file referring to it was rewritten, the page and an emoji image changed
  // under their own names, and the CSP differs.
  oldChunk = (await readdir(buildB)).find((file) => /^account_timeline-[^.]+\.js$/.test(file));
  assert.ok(oldChunk, 'the profile view is a separate chunk');
  newChunk = oldChunk.replace(/-[^.]+\.js$/, '-b0000001.js');
  await rename(join(buildB, oldChunk), join(buildB, newChunk));
  for (const file of await readdir(buildB, { recursive: true })) {
    if (!/\.(js|css|html)$/.test(file)) continue;
    const content = await readFile(join(buildB, file), 'utf8');
    if (!content.includes(oldChunk)) continue;
    await replaceFile(join(buildB, file), content.replaceAll(oldChunk, newChunk));
    await rm(join(buildB, `${file}.gz`), { force: true }); // Stale copy; nginx serves the plain file.
  }
  await replaceFile(join(buildB, 'index.html'), `${await readFile(join(buildB, 'index.html'), 'utf8')}\n<!-- build b -->\n`);
  await replaceFile(join(buildB, 'emoji/1f600.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><!-- build b --></svg>');
  await rm(join(buildB, `${oldChunk}.gz`), { force: true });
  await rm(join(buildB, 'sw.js'));
  await rm(join(buildB, `offline-${versionA}.json`));
  configB = join(work, 'nginx-b.conf');
  await writeFile(configB, (await readFile(productionConfig, 'utf8')).replace("form-action 'self'", "form-action 'self'; manifest-src 'self'"));
  const viteManifest = JSON.parse(await readFile(join(dist, '.vite/manifest.json'), 'utf8'));
  ({ version: versionB } = await writeOfflineFiles(buildB, viteManifest, join(root, 'integration/sw.js'), [configB]));

  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  if (!skip) await rm(work, { recursive: true, force: true });
});

async function mockInstance(context, origin) {
  await context.route('https://mastodon.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/oauth/authorize') {
      const callback = new URL('/oauth/callback', origin);
      callback.search = new URLSearchParams({ code: 'browser-code', state: url.searchParams.get('state') ?? '' });
      return route.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(callback.href)})</script>` });
    }
    let body = [];
    if (url.pathname === '/api/v1/apps') body = { client_id: 'browser-client', client_secret: 'browser-secret' };
    else if (url.pathname === '/oauth/token') body = { access_token: 'browser-token', token_type: 'Bearer', scope: 'read write follow' };
    else if (url.pathname === '/api/v2/instance') body = instance;
    else if (['/api/v1/accounts/verify_credentials', '/api/v1/accounts/lookup', `/api/v1/accounts/${account.id}`].includes(url.pathname)) body = account;
    else if (url.pathname === '/api/v1/preferences') body = {};
    else if (url.pathname === '/api/v1/timelines/home') body = [status];
    else if (url.pathname === '/api/v2/notifications') body = { notification_groups: [], accounts: [], statuses: [] };
    else if (url.pathname === '/api/v2/notifications/policy') body = {
      for_not_following: 'accept', for_not_followers: 'accept', for_new_accounts: 'accept',
      for_private_mentions: 'accept', for_limited_accounts: 'filter', for_bots: 'accept',
      summary: { pending_requests_count: 0, pending_notifications_count: 0 },
    };
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  });
}

/** Polls an async page function; Playwright's waitForFunction treats the returned promise itself as truthy. */
async function waitUntil(page, predicate, arg, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (!(await page.evaluate(predicate, arg))) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${predicate}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

const cacheNames = (page) => page.evaluate(() => caches.keys());

async function signIn(page, origin) {
  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).waitFor();
}

/** Opens a signed-in tab's own profile: a view whose code is loaded lazily. */
async function openProfile(page) {
  await page.locator(`a[href="/@${account.acct}"]`).first().click();
  await page.getByText('Test account').first().waitFor();
  await page.goBack();
  await page.getByText(timelineText).first().waitFor();
}

test('nginx sends the production headers: CSP allowing embedded previews, immutable only for hashed names', { skip, timeout: 60_000 }, async () => {
  const server = await startNginx({ builds: { a: buildA } });
  try {
    const page = await fetch(`${server.origin}/home`);
    assert.equal(page.headers.get('cache-control'), 'no-cache');
    const csp = page.headers.get('content-security-policy');
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /frame-src https:/);

    const hashed = (await readdir(buildA)).find((file) => /^main-[A-Za-z0-9_-]{8}\.js$/.test(file));
    assert.equal((await fetch(`${server.origin}/${hashed}`)).headers.get('cache-control'), 'public, max-age=31536000, immutable');
    for (const path of ['/emoji/1f600.svg', '/sw.js', `/offline-${versionA}.json`, '/loading.png', '/index.html']) {
      assert.equal((await fetch(`${server.origin}${path}`)).headers.get('cache-control'), 'no-cache', path);
    }

    // No logo is configured (no TEADECK_LOGO), so there is no file to show.
    assert.equal((await fetch(`${server.origin}/logo.svg`)).status, 404);

    // A video preview card embeds an https iframe; the CSP must not block it.
    const context = await browser.newContext();
    const tab = await context.newPage();
    await tab.goto(server.origin);
    const violations = await tab.evaluate(() => new Promise((resolve) => {
      const seen = [];
      document.addEventListener('securitypolicyviolation', (event) => seen.push(event.violatedDirective));
      const frame = document.createElement('iframe');
      frame.src = 'https://www.youtube-nocookie.com/embed/teadeck-test';
      document.body.append(frame);
      setTimeout(() => resolve(seen), 1_000);
    }));
    assert.deepEqual(violations, []);
    await context.close();
  } finally {
    await server.stop();
  }
});

test('a deploy while two tabs are open: the other tab keeps working, headers and renamed-in-place files are updated', { skip, timeout: 240_000 }, async () => {
  const server = await startNginx({ builds: { a: buildA, b: buildB } });
  const { origin } = server;
  const context = await browser.newContext({ locale: 'de-DE' });
  try {
    await mockInstance(context, origin);
    const oldTab = await context.newPage();
    await signIn(oldTab, origin);
    await waitUntil(oldTab, async (version) => Boolean(navigator.serviceWorker.controller)
      && (await caches.keys()).includes(`teadeck-core-${version}`), versionA);
    // The service worker now serves this tab; reload so it records the version the tab started with.
    await oldTab.reload();
    await oldTab.getByText(timelineText).waitFor();
    assert.equal(await oldTab.evaluate(async () => (await (await caches.open((await caches.keys()).find((n) => n.startsWith('teadeck-core-')))).match('/index.html'))?.headers.get('content-security-policy')?.includes('manifest-src')), false);

    const otherTab = await context.newPage();
    await signIn(otherTab, origin);

    await server.deploy('b', configB);

    // The other tab finds the update and switches (what the reload button does).
    await otherTab.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
    await waitUntil(otherTab, async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting));
    await otherTab.evaluate(async () => { (await navigator.serviceWorker.getRegistration()).waiting.postMessage({ type: 'skip-waiting' }); });
    await waitUntil(otherTab, async (version) => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated'
      && (await caches.keys()).includes(`teadeck-core-${version}`) && !(await navigator.serviceWorker.getRegistration()).waiting, versionB);
    await otherTab.reload();
    await otherTab.getByText(timelineText).waitFor();

    // New headers arrived with the new version, although they are stored with the cached page.
    const storedCsp = await otherTab.evaluate(async (version) => (await (await caches.open(`teadeck-core-${version}`)).match('/index.html')).headers.get('content-security-policy'), versionB);
    assert.match(storedCsp, /manifest-src 'self'/);
    assert.match((await otherTab.evaluate(() => fetch('/').then((r) => r.text()))), /<!-- build b -->/);

    // The new version is complete: the same lazily loaded view opens there too.
    await openProfile(otherTab);

    // The old tab is told, not forced; its view, whose chunk the server replaced, still opens.
    await oldTab.locator('#teadeck-update-reload').waitFor({ timeout: 30_000 });
    assert.equal((await fetch(`${origin}/${oldChunk}`)).status, 404, 'build A\'s chunk is gone from the server');
    assert.equal((await fetch(`${origin}/${newChunk}`)).status, 200);
    let loads = 0;
    oldTab.on('load', () => loads++);
    await openProfile(oldTab);
    assert.equal(loads, 0, 'no reload needed');
    assert.ok((await cacheNames(oldTab)).includes(`teadeck-core-${versionA}`), 'kept while a tab uses it');

    // The emoji image with the same name but new content replaces the old one.
    await waitUntil(otherTab, async () => (await (await (await caches.open('teadeck-background')).match('/emoji/1f600.svg'))?.text())?.includes('build b'));

    // Once no tab uses build A any more, its files go (checked when a page starts).
    await oldTab.close();
    const deadline = Date.now() + 60_000;
    while ((await cacheNames(otherTab)).includes(`teadeck-core-${versionA}`)) {
      assert.ok(Date.now() < deadline, 'the old version\'s cache was never removed');
      await otherTab.reload();
      await otherTab.getByText(timelineText).waitFor();
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }

    // And still complete after the old version's files are gone.
    await otherTab.reload();
    await otherTab.getByText(timelineText).waitFor();
    await openProfile(otherTab);
  } finally {
    await context.close();
    await server.stop();
  }
});

test('a configured logo is served and shown; without one the interface has no logo at all', { skip, timeout: 120_000 }, async () => {
  // Marked as belonging to Teadeck, so it is put into the page and can be coloured.
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" data-teadeck-logo="test"><title>Teadeck test logo</title><rect width="10" height="10" fill="var(--teadeck-logo-tea, #4a3)"/></svg>';
  const server = await startNginx({ builds: { a: buildA }, logo: svg });
  const context = await browser.newContext({ locale: 'de-DE' });
  try {
    const response = await fetch(`${server.origin}/logo.svg`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/svg+xml');
    assert.equal(response.headers.get('cache-control'), 'no-cache', 'a changed logo must not be stuck in caches');

    await mockInstance(context, server.origin);
    // The multi-column layout, which also has the place beside the compose form.
    await context.addInitScript(() => localStorage.setItem('teadeck.v1:https://mastodon.test:42:advancedLayout', 'true'));
    const page = await context.newPage();
    await signIn(page, server.origin);
    // Put into the page (so it can follow the design), and actually drawn.
    const logo = page.locator('.navigation-panel .teadeck-logo svg').first();
    await logo.waitFor();
    assert.ok((await logo.boundingBox()).height > 4, 'the logo is displayed');
    // It also stands in for Mastodon's mascot beside the compose form.
    assert.equal(await page.locator('.drawer__inner__mastodon .teadeck-logo svg').count(), 1);
    // Mastodon's own logo and elephants are gone from the interface.
    assert.equal(await page.locator('.logo--wordmark, .logo--icon, img[alt="Mastodon"]').count(), 0);
    assert.equal(await page.locator('img[src*="elephant"]').count(), 0);
  } finally {
    await context.close();
    await server.stop();
  }
});
