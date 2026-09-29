// Explicit extension: lets tests import this module directly under plain
// `node --test`, which (unlike Vite) does not resolve extensionless .ts specifiers.
import { getSession } from './session.ts';
import { ShellError } from './shell_strings.ts';

let accountId = '';
export function setAccountId(id: string) { accountId = id; }
export function getAccountId() { return accountId; }

/** Namespaces also isolate equal numeric account IDs on different servers. */
export function storageKey(key: string) {
  const session = getSession();
  if (!session || !accountId) throw new ShellError('errorNoSession');
  return `teadeck.v1:${session.origin}:${accountId}:${key}`;
}

export function readPreference<T>(key: string, fallback: T): T {
  const value = localStorage.getItem(storageKey(key));
  if (value === null) return fallback;
  try { return JSON.parse(value) as T; }
  catch { return fallback; }
}

export function writePreference(key: string, value: unknown) {
  localStorage.setItem(storageKey(key), JSON.stringify(value));
}

export function readSettings(): Record<string, unknown> {
  const settings = readPreference<unknown>('settings', {});
  return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings as Record<string, unknown> : {};
}
export function saveSettings(settings: unknown) { writePreference('settings', settings); }

/**
 * Opt-in "stay signed in" account store. One IndexedDB row per (origin, accountId),
 * holding the same OAuth credentials as the tab-scoped session. Never written to
 * unless the user checks "Angemeldet bleiben" during login.
 */
export interface RememberedAccount {
  origin: string;
  accountId: string;
  acct: string;
  accessToken: string;
  clientId: string;
  clientSecret: string;
  addedAt: number;
}

const accountsDbName = 'teadeck-accounts';
const accountsStoreName = 'accounts';

export function accountKey(origin: string, id: string) {
  return `${origin}::${id}`;
}

function openAccountsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(accountsDbName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(accountsStoreName, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new ShellError('errorAccountStore'));
  });
}

async function withAccountsStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openAccountsDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(accountsStoreName, mode);
      const request = run(tx.objectStore(accountsStoreName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new ShellError('errorAccountStoreAccess'));
    });
  } finally {
    db.close();
  }
}

export async function rememberAccount(account: RememberedAccount): Promise<void> {
  await withAccountsStore('readwrite', store => store.put({ key: accountKey(account.origin, account.accountId), ...account }));
}

export async function forgetAccount(origin: string, id: string): Promise<void> {
  await withAccountsStore('readwrite', store => store.delete(accountKey(origin, id)));
}

/**
 * Rejects when the store cannot be read. Callers must not take that for "no
 * accounts": the account is still there, it just could not be read this time.
 */
export async function listRememberedAccounts(): Promise<RememberedAccount[]> {
  return withAccountsStore<RememberedAccount[]>('readonly', store => store.getAll());
}

const activeAccountKeyName = 'teadeck.activeAccount';
export function getActiveAccountKey(): string | null { return localStorage.getItem(activeAccountKeyName); }
export function setActiveAccountKey(key: string) { localStorage.setItem(activeAccountKeyName, key); }
export function clearActiveAccountKey() { localStorage.removeItem(activeAccountKeyName); }
