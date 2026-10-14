import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFiles, FakeCacheStorage, FakeServer, FakeWorker, loadServiceWorker } from './sw_harness.mjs';

const code = await loadServiceWorker();

const buildA = await buildFiles({
  core: { '/index.html': '<html>A</html>', '/app-AAAAAAAA.js': 'console.log("A")' },
  background: { '/emoji/1f600.svg': '<svg>A</svg>' },
  onDemand: { '/intl/de-AAAAAAAA.js': 'de A' },
});
const buildB = await buildFiles({
  core: { '/index.html': '<html>B</html>', '/app-BBBBBBBB.js': 'console.log("B")' },
  background: { '/emoji/1f600.svg': '<svg>B</svg>' },
  onDemand: { '/intl/de-BBBBBBBB.js': 'de B' },
});

function world(build) {
  const caches = new FakeCacheStorage();
  const clients = { windows: [] };
  const server = new FakeServer({ ...build.files });
  let now = Date.UTC(2026, 8, 16);
  const clock = () => now;
  const newWorker = (version) => new FakeWorker({ code, version, caches, clients, server, clock });
  return { caches, clients, server, newWorker, advance: (ms) => { now += ms; } };
}

/** A worker that installed, activated and has a page running on it. */
async function running(build) {
  const scope = world(build);
  const worker = scope.newWorker(build.version);
  await worker.install();
  await worker.activate();
  scope.clients.windows.push('tab-1');
  await worker.fetchEvent('/home', { mode: 'navigate', resultingClientId: 'tab-1' });
  await worker.start();
  return { ...scope, worker };
}

test('a version that is still installing is not cleaned away by the running one', async () => {
  const scope = await running(buildA);
  // The new version is deployed and its worker starts installing.
  scope.server.files = { ...buildB.files };
  const next = scope.newWorker(buildB.version);
  await next.install();

  // Meanwhile a page starts on the old version, which cleans up.
  await scope.worker.start();
  assert.ok(await scope.caches.has(`teadeck-core-${buildB.version}`), 'the waiting version keeps its offline copy');
  assert.deepEqual(scope.caches.paths(`teadeck-core-${buildB.version}`).sort(), ['/app-BBBBBBBB.js', '/index.html', `/offline-${buildB.version}.json`].sort());

  // Only once it takes over does the old version go (no tab uses it any more).
  await next.activate();
  scope.clients.windows.length = 0;
  scope.clients.windows.push('tab-2');
  await next.fetchEvent('/home', { mode: 'navigate', resultingClientId: 'tab-2' });
  // Past the grace period that covers a tab which is still starting up.
  scope.advance(60_000);
  await next.start();
  assert.equal(await scope.caches.has(`teadeck-core-${buildA.version}`), false);
});

test('the cache of an install that never finished is cleaned up after a day', async () => {
  const scope = await running(buildA);
  scope.server.files = { ...buildB.files, '/app-BBBBBBBB.js': undefined };
  const next = scope.newWorker(buildB.version);
  await assert.rejects(next.install(), /HTTP 404/);

  scope.advance(60 * 60 * 1000);
  await scope.worker.start();
  assert.ok(await scope.caches.has(`teadeck-core-${buildB.version}`), 'kept while the browser may still retry it');

  scope.advance(25 * 60 * 60 * 1000);
  await scope.worker.start();
  assert.equal(await scope.caches.has(`teadeck-core-${buildB.version}`), false);
});

test('a deploy during the install is noticed instead of mixing two builds', async () => {
  const scope = await running(buildA);
  const next = scope.newWorker(buildB.version);
  // The manifest is from build B, but index.html is already served by an even newer deploy.
  scope.server.files = { ...buildB.files, '/index.html': '<html>C</html>' };
  await assert.rejects(next.install(), /index\.html: content .* does not match/);
  // Nothing of the half-installed version claims to be complete: the next attempt starts over.
  assert.equal(scope.caches.paths(`teadeck-core-${buildB.version}`).includes('/index.html'), false);

  scope.server.files = { ...buildB.files };
  await next.install();
  assert.deepEqual(scope.caches.paths(`teadeck-core-${buildB.version}`).sort(), ['/app-BBBBBBBB.js', '/index.html', `/offline-${buildB.version}.json`].sort());
});

test('a file that changed under the same name is replaced, not kept from the manifest hash', async () => {
  const scope = await running(buildA);
  const background = 'teadeck-background';
  assert.equal(await (await (await scope.caches.open(background)).match('/emoji/1f600.svg')).text(), '<svg>A</svg>');

  // Build B has the same emoji path with new content.
  scope.server.files = { ...buildB.files };
  const next = scope.newWorker(buildB.version);
  await next.install();
  await next.activate();
  scope.clients.windows.length = 0;
  scope.clients.windows.push('tab-2');
  await next.fetchEvent('/home', { mode: 'navigate', resultingClientId: 'tab-2' });
  await next.start();
  assert.equal(await (await (await scope.caches.open(background)).match('/emoji/1f600.svg')).text(), '<svg>B</svg>');
});

test('pages are served from the cache of the version their tab started with', async () => {
  const scope = await running(buildA);
  scope.server.files = { ...buildB.files };
  const next = scope.newWorker(buildB.version);
  await next.install();
  await next.activate();
  scope.clients.windows.push('tab-2');
  await next.fetchEvent('/home', { mode: 'navigate', resultingClientId: 'tab-2' });
  await next.start();

  // The old tab is open, so the file of build A is still served, although the server dropped it.
  scope.server.offline = true;
  const old = await next.fetchEvent('/app-AAAAAAAA.js');
  assert.equal(await old.text(), 'console.log("A")');
  const current = await next.fetchEvent('/app-BBBBBBBB.js');
  assert.equal(await current.text(), 'console.log("B")');
});

test('a changed shared asset is rejected before reaching the page', async () => {
  const scope = world(buildA);
  const fetch = scope.server.fetch;
  scope.server.fetch = async (...args) => {
    const response = await fetch(...args);
    Object.defineProperty(response, 'type', { value: 'basic' });
    return response;
  };
  const worker = scope.newWorker(buildA.version);
  await worker.install();
  await worker.activate();
  scope.server.files['/intl/de-AAAAAAAA.js'] = 'unexpected new content';
  await assert.rejects(worker.fetchEvent('/intl/de-AAAAAAAA.js'), /does not match/);
});

test('activation repairs a waiting cache removed by an older worker', async () => {
  const scope = await running(buildA);
  scope.server.files = { ...buildB.files };
  const next = scope.newWorker(buildB.version);
  await next.install();
  await scope.caches.delete(`teadeck-core-${buildB.version}`);
  await next.activate();
  scope.server.offline = true;
  assert.equal(await (await next.fetchEvent('/home', { mode: 'navigate' })).text(), '<html>B</html>');
  assert.equal(await (await next.fetchEvent('/app-BBBBBBBB.js')).text(), 'console.log("B")');
});

test('cleanup preserves an installation that starts during cache enumeration', async () => {
  const scope = await running(buildA);
  scope.server.files = { ...buildB.files };
  const next = scope.newWorker(buildB.version);
  const keys = scope.caches.keys.bind(scope.caches);
  let interleave = true;
  scope.caches.keys = async () => {
    if (interleave) {
      interleave = false;
      await next.install();
    }
    return keys();
  };
  await scope.worker.start();
  assert.ok(await scope.caches.has(`teadeck-core-${buildB.version}`));
});

test('the background fill gives way to a newer version, whose activation would wait for it', async () => {
  const scope = world(buildA);
  const worker = scope.newWorker(buildA.version);
  await worker.install();
  await worker.activate();

  // A newer version waits: the browser activates it ("Refresh") only once this worker is idle.
  worker.context.self.registration.waiting = {};
  scope.server.requests.length = 0;
  await worker.start();
  assert.deepEqual(scope.server.requests.filter(({ path }) => path.startsWith('/emoji/')), [], 'nothing downloaded for a version on its way out');

  // Without one, the next start fills what was left.
  delete worker.context.self.registration.waiting;
  await worker.start();
  assert.ok(scope.server.requests.some(({ path }) => path === '/emoji/1f600.svg'));
});
