/**
 * One place to decide whether the chosen server offers an optional API.
 *
 * Every capability is `unknown` until there is evidence:
 * - the instance's own metadata, where it is explicit (e.g. `api_versions`,
 *   `configuration.translation.enabled`);
 * - otherwise the first real use: a successful response means `supported`,
 *   a 404 means `unsupported`, and the caller's fallback is used from then on.
 * Missing metadata is not evidence of absence: other implementations need not
 * report everything Mastodon does.
 *
 * Results are kept per server origin and software version in localStorage, so
 * a missing endpoint costs one 404 per server version, not one per page load,
 * and a server upgrade re-checks everything. Current explicit metadata always
 * wins over what was stored, and a stored `unsupported` expires after a day:
 * an admin can enable a feature (or a proxy can briefly answer 404) without
 * the version string changing.
 */

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
  | 'interactionPolicies.defaults';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface InstanceLike {
  version?: string;
  api_versions?: { mastodon?: number };
  configuration?: { translation?: { enabled?: boolean } };
}

const storagePrefix = 'teadeck.capabilities.v2:';
/** How long a 404 keeps a capability switched off before it is probed again. */
export const unsupportedTtlMs = 24 * 60 * 60 * 1000;

interface Known { value: Exclude<Support, 'unknown'>; checkedAt: number }

let known = new Map<Capability, Known>();
let now: () => number = Date.now;
let storageKey: string | undefined;
let storage: StorageLike | undefined;

function persist() {
  if (!storage || !storageKey) return;
  try { storage.setItem(storageKey, JSON.stringify(Object.fromEntries(known))); } catch { /* storage full or blocked */ }
}

/** Loads what is known about this server and adds what its metadata states explicitly. */
export function initCapabilities(origin: string, instance: InstanceLike, store: StorageLike | undefined = globalThis.localStorage, clock: () => number = Date.now) {
  storage = store;
  storageKey = `${storagePrefix}${origin}|${instance.version ?? ''}`;
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

  // Mastodon 4.3 introduced api_versions and, as API version 2, grouped
  // notifications and the notification policy. A reported version is evidence
  // of support; its absence says nothing.
  if ((instance.api_versions?.mastodon ?? 0) >= 2) {
    known.set('notifications.grouped', { value: 'supported', checkedAt: now() });
    known.set('notifications.policy', { value: 'supported', checkedAt: now() });
  }
  const translation = instance.configuration?.translation?.enabled;
  if (translation === false) known.set('translation.languages', { value: 'unsupported', checkedAt: now() });
  // Enabled now: whatever was stored before (e.g. while it was disabled) no longer holds; probe on use.
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

export function isNotFound(error: unknown): boolean {
  return (error as { response?: { status?: number } } | null)?.response?.status === 404;
}

/**
 * Uses `request` unless the capability is known to be missing. A 404 marks it
 * `unsupported` and returns `fallback()`; success marks it `supported`; other
 * errors are passed on and prove nothing.
 */
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
