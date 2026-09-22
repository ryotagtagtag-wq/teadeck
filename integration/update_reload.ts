const reloadKey = 'teadeck.reloadedForUpdate';
const retryAfterMs = 30_000;

/**
 * After a redeploy an open tab still references the previous build's lazily
 * loaded chunks (e.g. the profile view), which no longer exist on the server:
 * nginx answers with its HTML 404 page and the dynamic import fails. Vite
 * reports that as `vite:preloadError`; reloading picks up the new build.
 * At most one reload per 30 seconds, so a chunk that is really missing shows
 * the upstream error instead of reloading forever.
 */
export function shouldReloadForUpdate(lastReloadAt: number, now: number) {
  return now - lastReloadAt >= retryAfterMs;
}

export function reloadOnStaleChunks() {
  window.addEventListener('vite:preloadError', () => {
    const lastReloadAt = Number(sessionStorage.getItem(reloadKey) ?? 0);
    if (!shouldReloadForUpdate(lastReloadAt, Date.now())) return;
    sessionStorage.setItem(reloadKey, String(Date.now()));
    // Not preventDefault(): the import still fails normally until the reload
    // replaces the page, instead of resolving to an empty module.
    location.reload();
  });
}
