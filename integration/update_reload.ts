import { readStored, storageKeys, writeStored } from './browser_storage.ts';

const retryAfterMs = 30_000;

/**
 * After a redeploy, an open tab may request chunks of the previous build that
 * are gone. Reloading picks up the new build; at most once per 30 seconds, so a
 * really missing chunk does not reload forever.
 */
export function shouldReloadForUpdate(lastReloadAt: number, now: number) {
  return now - lastReloadAt >= retryAfterMs;
}

export function reloadOnStaleChunks() {
  window.addEventListener('vite:preloadError', () => {
    const lastReloadAt = Number(readStored('session', storageKeys.reloadedForUpdate) ?? 0);
    if (!shouldReloadForUpdate(lastReloadAt, Date.now())) return;
    // Without storage the limit cannot hold, so no reload either.
    try { writeStored('session', storageKeys.reloadedForUpdate, String(Date.now())); }
    catch { return; }
    location.reload();
  });
}
