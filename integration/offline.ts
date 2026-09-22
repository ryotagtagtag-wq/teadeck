/**
 * Page side of integration/sw.js: after the first visit the app starts from
 * the browser's cache, independent of the Teadeck web server.
 */

import { latestWaitingWorker } from './offline_update';

const updateCheckIntervalMs = 60 * 60 * 1000;

/**
 * Same-origin files this page loaded, including those fetched before the
 * service worker took control on the first start (e.g. the interface
 * language), which it would otherwise never have seen.
 */
function loadedPaths() {
  return performance.getEntriesByType('resource')
    .map((entry) => new URL(entry.name))
    .filter((url) => url.origin === location.origin)
    .map((url) => url.pathname.slice(1));
}

function supported() {
  return 'serviceWorker' in navigator && window.isSecureContext;
}

let activatedHere = false;
let applying: Promise<void> | undefined;

function applyLatest(registration: ServiceWorkerRegistration): Promise<void> {
  applying ??= (async () => {
    const worker = await latestWaitingWorker(registration);
    if (worker) activate(worker);
    else location.reload(); // Another tab may already have activated it.
  })().finally(() => { applying = undefined; });
  return applying;
}

/** Activates `worker` and reloads once it controls the page. */
function activate(worker: ServiceWorker) {
  if (activatedHere) return;
  activatedHere = true;
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  worker.postMessage({ type: 'skip-waiting' });
}

/**
 * Called before the app starts: if a new version finished installing while
 * an older tab was open, switch to it now instead of starting the old one.
 * Resolves `true` when the page is about to reload.
 */
export async function applyWaitingUpdate(): Promise<boolean> {
  if (!supported()) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.waiting || !navigator.serviceWorker.controller) return false;
  await applyLatest(registration);
  return true;
}

/**
 * Called after the app started, so none of this delays it: registers the
 * service worker (which caches the app), asks it to fill the background
 * cache (emoji etc.), and reports updates found during the session.
 */
export async function enableOffline(onUpdateReady: (apply: () => void) => void) {
  if (!supported()) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  // Another tab activated a new version. This tab keeps working on the version
  // it started with (the worker keeps those files while it is open) and offers
  // the reload instead of forcing it, so nothing typed here is lost.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !activatedHere) onUpdateReady(() => { void applyLatest(registration); });
  });
  const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
  // Ask the browser not to evict the cache under storage pressure; no prompt in most browsers.
  void navigator.storage?.persist?.();

  const offered = new WeakSet<ServiceWorker>();
  const offerUpdate = (worker: ServiceWorker) => {
    if (offered.has(worker) || activatedHere) return;
    offered.add(worker);
    onUpdateReady(() => { void applyLatest(registration); });
  };
  if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      // Without a controller this is the very first install, not an update.
      if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
    });
  });
  // A suspended tab may have missed timers for days. Check when it returns,
  // throttled so switching tabs repeatedly does not repeatedly fetch sw.js.
  let lastCheck = Date.now();
  const check = () => {
    if (Date.now() - lastCheck < 60_000) return;
    lastCheck = Date.now();
    void registration.update().catch(() => {});
  };
  setInterval(check, updateCheckIntervalMs);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('online', check);

  const ready = await navigator.serviceWorker.ready;
  ready.active?.postMessage({ type: 'fill-background', used: loadedPaths() });
}
