/** Wait for an installation, releasing the listener on completion or timeout. */
export function waitForInstallation(worker: ServiceWorker, timeoutMs = 120_000): Promise<void> {
  if (worker.state === 'installed' || worker.state === 'activated' || worker.state === 'redundant') return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', changed);
      resolve();
    };
    const changed = () => {
      if (worker.state === 'installed' || worker.state === 'activated' || worker.state === 'redundant') finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    worker.addEventListener('statechange', changed);
    changed();
  });
}

/** Recheck on click: the worker captured when a banner appeared may be obsolete. */
export async function latestWaitingWorker(registration: ServiceWorkerRegistration, checkTimeoutMs = 10_000): Promise<ServiceWorker | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      registration.update().catch(() => undefined), // Offline: use an already downloaded update.
      new Promise<void>((resolve) => { timer = setTimeout(resolve, checkTimeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  if (registration.installing) await waitForInstallation(registration.installing);
  return registration.waiting;
}
