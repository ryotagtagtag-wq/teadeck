/**
 * What Teadeck keeps in localStorage and sessionStorage (IndexedDB holds the
 * remembered accounts, storage.ts), and how it is read and written:
 *
 * - Reading never throws: blocked or broken storage reads as nothing.
 * - Writing throws when storage is blocked or full; a caller that can do
 *   without catches it.
 * - Removing never throws.
 *
 * The names stay as they are: a renamed key would drop what browsers already
 * store, and sign people out.
 */
export const storageKeys = {
  /** Per server and account: `teadeck.v1:<origin>:<account id>:<key>` (storage.ts). */
  accountPrefix: 'teadeck.v1:',
  /** The remembered account this browser opens with. */
  activeAccount: 'teadeck.activeAccount',
  /** Design and language of the last account, for the sign-in page. */
  appearance: 'teadeck.appearance',
  /** Per server and version: what its API offers (api_capabilities.ts). */
  capabilitiesPrefix: 'teadeck.capabilities.v2:',
  /** This tab's sign-in (session.ts). */
  session: 'teadeck.session.v1',
  /** A sign-in in progress, until the server sends the browser back. */
  oauth: 'teadeck.oauth.v1',
  /** A message for the next page, e.g. after signing out. */
  notice: 'teadeck.notice',
  /** When this tab last reloaded for a new deploy (update_reload.ts). */
  reloadedForUpdate: 'teadeck.reloadedForUpdate',
} as const;

/** `local` lasts across tabs and restarts, `session` only for this tab. */
export type StorageArea = 'local' | 'session';

function area(name: StorageArea): Storage | undefined {
  try { return name === 'local' ? globalThis.localStorage : globalThis.sessionStorage; }
  catch { return undefined; }
}

export function readStored(name: StorageArea, key: string): string | null {
  try { return area(name)?.getItem(key) ?? null; }
  catch { return null; }
}

/** The stored value parsed as JSON, or `null` when there is none or it is not JSON. */
export function readStoredJson(name: StorageArea, key: string): unknown {
  const value = readStored(name, key);
  if (value === null) return null;
  try { return JSON.parse(value); }
  catch { return null; }
}

export function writeStored(name: StorageArea, key: string, value: string) {
  const storage = area(name);
  if (!storage) throw new Error(`${name}Storage is not available`);
  storage.setItem(key, value);
}

export function writeStoredJson(name: StorageArea, key: string, value: unknown) {
  writeStored(name, key, JSON.stringify(value));
}

export function removeStored(name: StorageArea, key: string) {
  try { area(name)?.removeItem(key); }
  catch { /* nothing to remove from */ }
}

/** Leaves a message id for the next page of this tab (shown once). */
export function leaveNotice(id: string) {
  try { writeStored('session', storageKeys.notice, id); }
  catch { /* the message is a courtesy */ }
}

/** The message left for this page, if any; it is gone afterwards. */
export function takeNotice(): string | null {
  const notice = readStored('session', storageKeys.notice);
  if (notice !== null) removeStored('session', storageKeys.notice);
  return notice;
}
