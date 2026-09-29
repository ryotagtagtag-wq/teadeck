/*
 * Offline service worker: once installed, the app starts without the Teadeck
 * web server. scripts/offline_manifest.mjs decides which files are cached when:
 * - core: during install; a new version takes over only once complete.
 * - background: emoji and illustrations, after the app has started.
 * - onDemand: languages, emoji data, OCR; cached on first use.
 * Every file is checked against its hash in the manifest, so two builds are
 * never mixed. Open tabs keep the version they started with until reloaded.
 */

const VERSION = '__TEADECK_OFFLINE_VERSION__';
const MANIFEST_URL = `/offline-${VERSION}.json`;
const CORE_PREFIX = 'teadeck-core-';
const CORE_CACHE = `${CORE_PREFIX}${VERSION}`;
const BACKGROUND_CACHE = 'teadeck-background';
const ON_DEMAND_CACHE = 'teadeck-on-demand';
// Which version each open tab started with, and bookkeeping; never served.
const META_CACHE = 'teadeck-meta';
const HASH_HEADER = 'x-teadeck-hash';
const NETWORK_ONLY = new Set(['/sw.js', '/source.tar.gz', '/healthz']);
// Not part of a build: what the deployment configured (container/entrypoint.sh).
// Always fetched fresh, with the stored copy as the offline fallback.
const RUNTIME_FILES = new Set(['/logo.svg', '/teadeck.json']);
const CONCURRENCY = 6;
// A tab that just navigated may not be listed among the open windows yet.
const CLIENT_START_GRACE_MS = 10_000;
// Upper bound for browsers that cannot tell which tab got which version.
const MAX_CORE_VERSIONS = 3;
// How long the cache of an install that never finished is kept (browser closed, downloads failed).
const ABANDONED_INSTALL_MS = 24 * 60 * 60 * 1000;
// Names with a content hash (Vite output); the same rule as `immutable` in container/nginx.conf.
const HASHED_NAME = /-[A-Za-z0-9_-]{8}\.(js|css|woff2?|png|svg|jpg|webp|json)$/;

async function inBatches(items, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  });
  await Promise.all(runners);
}

/** A file under an unchanged name may be stale in the HTTP cache; revalidate it. */
function requestInitFor(path) {
  return { cache: HASHED_NAME.test(path) ? 'default' : 'no-cache' };
}

async function hashOf(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/**
 * The response with its content hash attached, after checking that it is the
 * content this version's manifest lists. Without that check a deploy between
 * the manifest and a file (or a file whose name did not change) would be
 * stored under the previous version's hash and mix two builds.
 */
async function verified(response, path, hash) {
  if (!hash) return response;
  const buffer = await response.arrayBuffer();
  const actual = await hashOf(buffer);
  if (actual !== hash) throw new Error(`${path}: content ${actual} does not match ${hash} from the manifest (deployed while loading?)`);
  const headers = new Headers(response.headers);
  headers.set(HASH_HEADER, hash);
  return new Response(buffer, { status: response.status, statusText: response.statusText, headers });
}

async function storeResponse(cache, path, hash, requestInit = requestInitFor(path)) {
  const response = await fetch(path, requestInit);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  await cache.put(path, await verified(response, path, hash));
}

function hashMatches(response, hash) {
  return Boolean(response) && (!hash || response.headers.get(HASH_HEADER) === hash);
}

function withSets(manifest) {
  return { ...manifest, backgroundSet: new Set(manifest.background), onDemandSet: new Set(manifest.onDemand) };
}

let manifestLoad = null;
function loadManifest() {
  manifestLoad ??= (async () => {
    const cached = await (await caches.open(CORE_CACHE)).match(MANIFEST_URL);
    return withSets(await (cached ?? await fetch(MANIFEST_URL)).json());
  })().catch((error) => { manifestLoad = null; throw error; });
  return manifestLoad;
}

async function manifestIn(cacheName) {
  const version = cacheName.slice(CORE_PREFIX.length);
  const response = await (await caches.open(cacheName)).match(`/offline-${version}.json`);
  return response ? response.json().catch(() => null) : null;
}

/** The same file (by name and content hash) from another version's cache, to avoid downloading it again. */
async function cachedElsewhere(path, hash) {
  if (!hash) return undefined;
  for (const name of await caches.keys()) {
    if (!name.startsWith(CORE_PREFIX) || name === CORE_CACHE) continue;
    const response = await (await caches.open(name)).match(path);
    if (hashMatches(response, hash)) return response;
  }
  return undefined;
}

function versionRecordUrl(version) {
  return `/__teadeck/version/${version}`;
}

const SEQUENCE_URL = '/__teadeck/sequence';

/**
 * The next install number. Timestamps can tie (two installs in the same
 * millisecond), and the order is what decides whether another version's cache
 * belongs to a newer worker or to an old version nothing needs any more.
 */
async function nextInstallOrder() {
  const meta = await caches.open(META_CACHE);
  const order = (Number(await (await meta.match(SEQUENCE_URL))?.text()) || 0) + 1;
  await meta.put(SEQUENCE_URL, new Response(String(order)));
  return order;
}

async function recordVersion(state) {
  const meta = await caches.open(META_CACHE);
  const previous = await (await meta.match(versionRecordUrl(VERSION)))?.json().catch(() => ({}));
  await meta.put(versionRecordUrl(VERSION), new Response(JSON.stringify({ ...previous, ...state })));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const startedAt = Date.now();
    // Before anything is stored: the older worker, which is still serving pages,
    // must not clean this version's cache away while it is being filled.
    await recordVersion({ order: await nextInstallOrder(), startedAt });
    const cache = await caches.open(CORE_CACHE);
    await storeResponse(cache, MANIFEST_URL, undefined, { cache: 'no-cache' });
    const manifest = await (await cache.match(MANIFEST_URL)).json();
    const hashes = manifest.hashes ?? {};
    // Always from the server: the page's response headers (CSP etc.) may have changed on their own.
    await storeResponse(cache, '/index.html', hashes['index.html'], { cache: 'no-cache' });
    await inBatches(manifest.core.filter((path) => path !== 'index.html'), async (path) => {
      const existing = await cachedElsewhere(`/${path}`, hashes[path]);
      if (existing) await cache.put(`/${path}`, existing);
      else await storeResponse(cache, `/${path}`, hashes[path]);
    });
    await recordVersion({ startedAt, completedAt: Date.now() });
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Older deployed workers could delete a waiting worker's cache. Repair it
    // before claiming pages, rather than serve a new page with missing chunks.
    const cache = await caches.open(CORE_CACHE);
    if (!await cache.match(MANIFEST_URL)) await storeResponse(cache, MANIFEST_URL, undefined, { cache: 'no-cache' });
    const manifest = await (await cache.match(MANIFEST_URL)).json();
    await inBatches(manifest.core, async (path) => {
      if (!hashMatches(await cache.match(`/${path}`), manifest.hashes?.[path])) {
        await storeResponse(cache, `/${path}`, manifest.hashes?.[path]);
      }
    });
    await self.clients.claim();
    await cleanUp();
  })());
});

function clientRecordUrl(clientId) {
  return `/__teadeck/clients/${encodeURIComponent(clientId)}`;
}

async function recordClient(clientId) {
  if (!clientId) return;
  const meta = await caches.open(META_CACHE);
  await meta.put(clientRecordUrl(clientId), new Response(JSON.stringify({ version: VERSION, at: Date.now() })));
}

/** Core versions still needed: this one, and those open tabs started with. */
async function versionsInUse() {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const open = new Set(windows.map((client) => client.id));
  const meta = await caches.open(META_CACHE);
  const versions = new Set([VERSION]);
  const recorded = new Set();
  for (const request of await meta.keys()) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/__teadeck/clients/')) continue;
    const id = decodeURIComponent(pathname.slice('/__teadeck/clients/'.length));
    const record = await (await meta.match(request)).json().catch(() => ({}));
    if (open.has(id)) {
      recorded.add(id);
      versions.add(record.version);
    } else if (Date.now() - (record.at ?? 0) < CLIENT_START_GRACE_MS) {
      versions.add(record.version);
    } else {
      await meta.delete(request);
    }
  }
  // A tab without a record started under an older worker (or the browser has
  // no resultingClientId): it may need any version.
  return { versions, unknownTabs: windows.some((client) => !recorded.has(client.id)) };
}

/** When each version started and finished installing; versions from before this record exist as 0. */
async function versionRecords() {
  const meta = await caches.open(META_CACHE);
  const records = new Map();
  for (const request of await meta.keys()) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/__teadeck/version/')) continue;
    const record = await (await meta.match(request)).json().catch(() => null);
    if (record) records.set(pathname.slice('/__teadeck/version/'.length), record);
  }
  return records;
}

let cleaning = null;
function cleanUp() {
  cleaning ??= removeUnusedVersions().finally(() => { cleaning = null; });
  return cleaning;
}

async function removeUnusedVersions() {
  for (const name of await caches.keys()) {

  }
  const { versions, unknownTabs } = await versionsInUse();
  // Enumerate caches first: a cache created later cannot accidentally be
  // judged using an older snapshot of the installation records.
  const coreCaches = (await caches.keys()).filter((name) => name.startsWith(CORE_PREFIX));
  const records = await versionRecords();
  const startedAt = (version) => records.get(version)?.startedAt ?? 0;
  const order = (version) => records.get(version)?.order ?? 0;
  const ours = order(VERSION);
  const newestFirst = coreCaches.sort((a, b) => order(b.slice(CORE_PREFIX.length)) - order(a.slice(CORE_PREFIX.length)));
  const retained = [];
  for (const name of newestFirst) {
    const version = name.slice(CORE_PREFIX.length);
    // A version that started installing after this one is a newer worker: installing,
    // waiting, or about to activate. Its cache is its offline copy of the app, so it
    // stays - unless that install never finished and has been lying around for a day.
    const record = records.get(version);
    const newer = order(version) > ours;
    const abandoned = newer && !record?.completedAt && Date.now() - startedAt(version) > ABANDONED_INSTALL_MS;
    const needed = !record || version === VERSION || (newer && !abandoned) || versions.has(version) || (unknownTabs && retained.length < MAX_CORE_VERSIONS);
    if (needed) retained.push(name);
    else await caches.delete(name);
  }
  // Do not delete records here: another worker may have written its record
  // but not opened its cache yet. It needs that record throughout installation.
  await pruneSharedCaches(retained);
}

/** Drops shared entries no retained version lists with that content. Skipped while the retained versions are unchanged. */
async function pruneSharedCaches(retained) {
  const meta = await caches.open(META_CACHE);
  const key = JSON.stringify([...retained].sort());
  const previous = await (await meta.match('/__teadeck/pruned-for'))?.text();
  if (previous === key) return;

  const allowed = new Map();
  for (const name of retained) {
    const manifest = await manifestIn(name);
    if (!manifest) continue;
    for (const path of [...manifest.background, ...manifest.onDemand]) {
      const hashes = allowed.get(`/${path}`) ?? new Set();
      hashes.add(manifest.hashes?.[path] ?? '*');
      allowed.set(`/${path}`, hashes);
    }
  }
  for (const cacheName of [BACKGROUND_CACHE, ON_DEMAND_CACHE]) {
    const cache = await caches.open(cacheName);
    for (const request of await cache.keys()) {
      const { pathname } = new URL(request.url);
      if (RUNTIME_FILES.has(pathname)) continue; // Belongs to no build.
      const hashes = allowed.get(pathname);
      if (hashes?.has('*')) continue;
      const hash = hashes && (await cache.match(request))?.headers.get(HASH_HEADER);
      if (!hashes || !hashes.has(hash)) await cache.delete(request);
    }
  }
  await meta.put('/__teadeck/pruned-for', new Response(key));
}

let backgroundFill = null;

async function cacheMissing(cacheName, paths, hashes) {
  const cache = await caches.open(cacheName);
  const missing = [];
  for (const path of paths) {
    if (!hashMatches(await cache.match(`/${path}`), hashes[path])) missing.push(path);
  }
  // Failures are left for the next start instead of retrying now.
  let failed = 0;
  await inBatches(missing, (path) => storeResponse(cache, `/${path}`, hashes[path]).catch(() => { failed++; }));
  return failed;
}

async function fillBackground(used) {
  const manifest = await loadManifest();
  const hashes = manifest.hashes ?? {};
  // First what the page already uses but loaded before this worker controlled it
  // (on the first start), e.g. the interface language: needed for the next offline start.
  await cacheMissing(ON_DEMAND_CACHE, used.filter((path) => manifest.onDemandSet.has(path)), hashes);
  // Checking thousands of entries on every start is wasted once they are all in place.
  const meta = await caches.open(META_CACHE);
  const completeUrl = `/__teadeck/background-complete-${VERSION}`;
  if (await meta.match(completeUrl)) return;
  if (await cacheMissing(BACKGROUND_CACHE, manifest.background, hashes) === 0) await meta.put(completeUrl, new Response('1'));
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'fill-background') {
    const used = Array.isArray(event.data.used) ? event.data.used.filter((path) => typeof path === 'string') : [];
    // Sent by every page after it started: a good moment to drop versions no tab uses any more.
    backgroundFill ??= cleanUp().then(() => fillBackground(used)).finally(() => { backgroundFill = null; });
    event.waitUntil(backgroundFill);
  } else if (event.data?.type === 'skip-waiting') {
    void self.skipWaiting();
  }
});

async function serveAsset(event) {
  const { request } = event;
  const { pathname } = new URL(request.url);
  if (RUNTIME_FILES.has(pathname)) return serveRuntimeFile(event);
  const current = await (await caches.open(CORE_CACHE)).match(request);
  if (current) return current;

  const path = pathname.slice(1);
  const manifest = await loadManifest().catch(() => null);
  const sharedCache = manifest?.backgroundSet.has(path) ? BACKGROUND_CACHE : manifest?.onDemandSet.has(path) ? ON_DEMAND_CACHE : null;
  if (sharedCache) {
    const cache = await caches.open(sharedCache);
    const cached = await cache.match(request);
    const hash = manifest.hashes?.[path];
    if (hashMatches(cached, hash)) return cached;
    try {
      const response = await fetch(request.url, requestInitFor(path));
      // Never keep the SPA fallback page or errors under an asset URL.
      const type = response.headers.get('content-type') ?? '';
      if (response.ok && response.type === 'basic' && !type.startsWith('text/html')) {
        // Do not return mismatched content either: that would still mix builds
        // in the page, even if we refused to keep it in the cache.
        const checked = await verified(response, path, hash);
        event.waitUntil(cache.put(request, checked.clone()));
        return checked;
      }
      return response;
    } catch (error) {
      // Offline: an older copy is better than none.
      if (cached) return cached;
      throw error;
    }
  }

  // Files of an older version a tab that started with it still uses (see cleanUp), then the network.
  return (await caches.match(request)) ?? fetch(request);
}

/** Configuration the deployment may change at any time, so the network decides; offline the last copy is used. */
async function serveRuntimeFile(event) {
  const cache = await caches.open(ON_DEMAND_CACHE);
  try {
    const response = await fetch(event.request.url, { cache: 'no-cache' });
    // A file that is gone (no logo configured any more) is dropped rather than kept.
    event.waitUntil(response.ok ? cache.put(event.request, response.clone()) : cache.delete(event.request));
    return response;
  } catch (error) {
    const cached = await cache.match(event.request);
    if (cached) return cached;
    throw error;
  }
}

async function serveApp(event) {
  const cached = await (await caches.open(CORE_CACHE)).match('/index.html');
  if (!cached) return fetch(event.request);
  event.waitUntil(recordClient(event.resultingClientId));
  return cached;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Instance API, streaming and media stay untouched.
  if (url.origin !== self.location.origin || NETWORK_ONLY.has(url.pathname) || url.pathname.startsWith('/__teadeck/')) return;
  event.respondWith(request.mode === 'navigate' ? serveApp(event) : serveAsset(event));
});
