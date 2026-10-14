import { useSyncExternalStore } from 'react';

/**
 * A small piece of state outside Redux that components follow. `initial` is
 * read on first use, so it may depend on things set up later (the account).
 */
export function createExternalState<T>(initial: () => T) {
  let value: T;
  let loaded = false;
  const listeners = new Set<() => void>();

  const get = (): T => {
    if (!loaded) {
      value = initial();
      loaded = true;
    }
    return value;
  };
  const set = (next: T) => {
    if (loaded && Object.is(value, next)) return;
    value = next;
    loaded = true;
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };
  const use = (): T => useSyncExternalStore(subscribe, get);

  return { get, set, use };
}
