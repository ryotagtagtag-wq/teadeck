/** Registers sw.js, which lets the app start from the browser's cache. */

import { latestWaitingWorker } from './offline_update.ts';

const updateCheckIntervalMs = 60 * 60 * 1000;

/** Same-origin files loaded before the service worker took control. */
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

/** Switches to a new version installed meanwhile; `true` when the page reloads. */
export async function applyWaitingUpdate(): Promise<boolean> {
  if (!supported()) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.waiting || !navigator.serviceWorker.controller) return false;
  await applyLatest(registration);
  return true;
}

/** Registers the service worker and reports updates found during the session. */
export async function enableOffline(onUpdateReady: (apply: () => void) => void) {
  if (!supported()) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  // Another tab activated a new version: offer the reload rather than force it.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !activatedHere) onUpdateReady(() => { void applyLatest(registration); });
  });
  const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
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
  // A suspended tab misses timers, so also check when it returns (at most once a minute).
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
