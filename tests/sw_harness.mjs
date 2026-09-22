import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';

/**
 * Runs integration/sw.js outside a browser: enough of the service worker and
 * Cache APIs to test installing, updating and cleaning up, including two
 * worker generations (an old one still running while a new one installs)
 * against the same caches.
 */

const origin = 'https://teadeck.test';
const urlOf = (request) => new URL(typeof request === 'string' ? request : request.url, origin).href;

class FakeCache {
  constructor() { this.entries = new Map(); }
  async put(request, response) { this.entries.set(urlOf(request), response); }
  async match(request) { return this.entries.get(urlOf(request))?.clone(); }
  async keys() { return [...this.entries.keys()].map((url) => ({ url })); }
  async delete(request) { return this.entries.delete(urlOf(request)); }
}

export class FakeCacheStorage {
  constructor() { this.caches = new Map(); }
  async open(name) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache());
    return this.caches.get(name);
  }
  async keys() { return [...this.caches.keys()]; }
  async delete(name) { return this.caches.delete(name); }
  async has(name) { return this.caches.has(name); }
  async match(request) {
    for (const cache of this.caches.values()) {
      const response = await cache.match(request);
      if (response) return response;
    }
    return undefined;
  }
  /** The paths stored in a cache, without the bookkeeping entries. */
  paths(name) {
    return [...(this.caches.get(name)?.entries.keys() ?? [])].map((url) => new URL(url).pathname).filter((path) => !path.startsWith('/__teadeck/'));
  }
}

/**
 * A minimal web server for the worker: `files` maps a path to its content.
 * Replace it to simulate a deploy. Requests are recorded in `requests`.
 */
export class FakeServer {
  constructor(files = {}) { this.files = files; this.requests = []; this.offline = false; }
  fetch = async (request, init) => {
    const path = new URL(urlOf(request)).pathname;
    this.requests.push({ path, cache: init?.cache });
    if (this.offline) throw new Error(`offline: ${path}`);
    const body = this.files[path];
    if (body === undefined) return new Response('not found', { status: 404 });
    return new Response(body, { status: 200, headers: { 'content-type': path.endsWith('.json') ? 'application/json' : 'text/javascript' } });
  };
}

/** One service worker generation: its own global scope, sharing caches, clients and server. */
export class FakeWorker {
  constructor({ code, version, caches: cacheStorage, clients, server, clock }) {
    this.version = version;
    this.listeners = new Map();
    this.claimed = false;
    this.skippedWaiting = false;
    const self = {
      addEventListener: (type, handler) => { this.listeners.set(type, handler); },
      location: { origin },
      skipWaiting: async () => { this.skippedWaiting = true; },
      clients: {
        matchAll: async () => clients.windows.map((id) => ({ id })),
        claim: async () => { this.claimed = true; },
      },
      registration: {},
    };
    const sandbox = {
      self, caches: cacheStorage, fetch: server.fetch, crypto, Response, Request, Headers, URL, Set, Map,
      console, Date: clock ? new Proxy(Date, { get: (target, key) => (key === 'now' ? clock : Reflect.get(target, key)) }) : Date,
      Promise, Array, Object, JSON, Error, Number, Boolean, String, RegExp, Uint8Array, ArrayBuffer, isNaN, parseInt,
    };
    sandbox.globalThis = sandbox;
    this.context = createContext(sandbox);
    runInContext(code.replaceAll('__TEADECK_OFFLINE_VERSION__', version), this.context);
  }

  /** Dispatches an event and waits for everything the worker registered with waitUntil. */
  async dispatch(type, event = {}) {
    const pending = [];
    const handler = this.listeners.get(type);
    if (!handler) throw new Error(`no ${type} listener`);
    let responded;
    handler({ ...event, waitUntil: (promise) => pending.push(promise), respondWith: (promise) => { responded = promise; } });
    await Promise.all(pending);
    return responded ? await responded : undefined;
  }

  install(event) { return this.dispatch('install', event); }
  activate() { return this.dispatch('activate'); }
  /** What a page sends after it started; also triggers the cleanup. */
  start(used = []) { return this.dispatch('message', { data: { type: 'fill-background', used } }); }
  fetchEvent(url, { mode = 'no-cors', resultingClientId } = {}) {
    return this.dispatch('fetch', { request: { url: urlOf(url), method: 'GET', mode }, resultingClientId });
  }
}

export async function loadServiceWorker() {
  return readFile(join(import.meta.dirname, '..', 'integration', 'sw.js'), 'utf8');
}

/** A build: the files a version serves, plus its offline manifest and content hashes. */
export async function buildFiles({ core = {}, background = {}, onDemand = {} }) {
  const { createHash } = await import('node:crypto');
  const hash = (content) => createHash('sha256').update(content).digest('hex').slice(0, 16);
  const files = { ...core, ...background, ...onDemand };
  const hashes = Object.fromEntries(Object.entries(files).map(([path, content]) => [path.slice(1), hash(content)]));
  const version = hash(JSON.stringify(hashes));
  const manifest = {
    core: Object.keys(core).map((path) => path.slice(1)),
    background: Object.keys(background).map((path) => path.slice(1)),
    onDemand: Object.keys(onDemand).map((path) => path.slice(1)),
    hashes,
  };
  return { version, files: { ...files, [`/offline-${version}.json`]: JSON.stringify(manifest) }, manifest };
}
