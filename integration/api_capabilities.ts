/**
 * Whether the server offers an optional API: known from its metadata, or from
 * the first request (404 means unsupported). Stored per server and version; a
 * stored `unsupported` expires after a day.
 */

import { readStored, storageKeys, writeStored } from './browser_storage.ts';

export type Support = 'unknown' | 'supported' | 'unsupported';

export type Capability =
  | 'notifications.grouped'
  | 'notifications.policy'
  | 'translation.languages'
  | 'accounts.familiarFollowers'
  | 'featuredTags.suggestions'
  | 'profile.read'
  | 'profile.write'
  | 'profile.featuredTags'
  | 'profile.tabSettings'
  | 'interactionPolicies.defaults'
  | 'instance.extendedDescription'
  | 'instance.domainBlocks'
  | 'instance.termsOfService'
  | 'collections';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface InstanceLike {
  version?: string;
  api_versions?: { mastodon?: number };
  configuration?: { translation?: { enabled?: boolean } };
}

const unsupportedTtlMs = 24 * 60 * 60 * 1000;

interface Known { value: Exclude<Support, 'unknown'>; checkedAt: number }

let known = new Map<Capability, Known>();
let now: () => number = Date.now;
let storageKey: string | undefined;
let storage: StorageLike | undefined;

function persist() {
  if (!storage || !storageKey) return;
  try { storage.setItem(storageKey, JSON.stringify(Object.fromEntries(known))); } catch { /* storage full or blocked */ }
}

const browserStore: StorageLike = {
  getItem: (key) => readStored('local', key),
  setItem: (key, value) => { writeStored('local', key, value); },
};

export function initCapabilities(origin: string, instance: InstanceLike, store: StorageLike | undefined = browserStore, clock: () => number = Date.now) {
  storage = store;
  storageKey = `${storageKeys.capabilitiesPrefix}${origin}|${instance.version ?? ''}`;
  now = clock;
  known = new Map();
  try {
    const saved = JSON.parse(store?.getItem(storageKey) ?? '{}') as Record<string, Partial<Known>>;
    for (const [name, entry] of Object.entries(saved)) {
      const checkedAt = typeof entry.checkedAt === 'number' ? entry.checkedAt : 0;
      if (entry.value === 'supported') known.set(name as Capability, { value: 'supported', checkedAt });
      // Expired negatives are dropped, i.e. probed again on next use.
      else if (entry.value === 'unsupported' && now() - checkedAt < unsupportedTtlMs) known.set(name as Capability, { value: 'unsupported', checkedAt });
    }
  } catch { /* unreadable: start over */ }

  // API version 2 (Mastodon 4.3) brought grouped notifications and the notification policy.
  if ((instance.api_versions?.mastodon ?? 0) >= 2) {
    known.set('notifications.grouped', { value: 'supported', checkedAt: now() });
    known.set('notifications.policy', { value: 'supported', checkedAt: now() });
  }
  const translation = instance.configuration?.translation?.enabled;
  if (translation === false) known.set('translation.languages', { value: 'unsupported', checkedAt: now() });
  else if (translation === true && known.get('translation.languages')?.value === 'unsupported') known.delete('translation.languages');
  persist();
}

export function support(capability: Capability): Support {
  const entry = known.get(capability);
  if (!entry) return 'unknown';
  if (entry.value === 'unsupported' && now() - entry.checkedAt >= unsupportedTtlMs) return 'unknown';
  return entry.value;
}

export function setSupport(capability: Capability, value: Exclude<Support, 'unknown'>) {
  const previous = known.get(capability);
  if (previous?.value === value && value === 'supported') return;
  known.set(capability, { value, checkedAt: now() });
  persist();
}

function isNotFound(error: unknown): boolean {
  return (error as { response?: { status?: number } } | null)?.response?.status === 404;
}

/** Uses `fallback` once `request` answered 404; other errors are passed on. */
export async function withCapability<T>(capability: Capability, request: () => Promise<T>, fallback: () => T | Promise<T>): Promise<T> {
  if (support(capability) === 'unsupported') return fallback();
  try {
    const result = await request();
    setSupport(capability, 'supported');
    return result;
  } catch (error) {
    if (!isNotFound(error)) throw error;
    setSupport(capability, 'unsupported');
    return fallback();
  }
}
