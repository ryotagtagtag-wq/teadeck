import { readStored, removeStored, storageKeys, writeStored, writeStoredJson } from './browser_storage.ts';
import { asRecord } from './frontend_settings.ts';
import { getSession } from './session.ts';
import { ShellError } from './texts.ts';

let accountId = '';
export function setAccountId(id: string) { accountId = id; }
export function getAccountId() { return accountId; }

/** Namespaces also isolate equal numeric account IDs on different servers. */
export function storageKey(key: string) {
  const session = getSession();
  if (!session || !accountId) throw new ShellError('errorNoSession');
  return `${storageKeys.accountPrefix}${session.origin}:${accountId}:${key}`;
}

export function readPreference<T>(key: string, fallback: T): T {
  const value = readStored('local', storageKey(key));
  if (value === null) return fallback;
  try { return JSON.parse(value) as T; }
  catch { return fallback; }
}

export function writePreference(key: string, value: unknown) {
  writeStoredJson('local', storageKey(key), value);
}

/** A stored object, or an empty one if what is stored is not an object. */
export function readObjectPreference(key: string): Record<string, unknown> {
  return asRecord(readPreference<unknown>(key, {}));
}

export function readSettings(): Record<string, unknown> {
  return readObjectPreference('settings');
}
export function saveSettings(settings: unknown) { writePreference('settings', settings); }

/** Accounts signed in with "Stay signed in", one IndexedDB row per origin and account. */
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
      // A successful request is not yet a stored change: the transaction can
      // still abort. Only its completion counts.
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? request.error ?? new ShellError('errorAccountStoreAccess'));
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

export function getActiveAccountKey(): string | null { return readStored('local', storageKeys.activeAccount); }
export function setActiveAccountKey(key: string) { writeStored('local', storageKeys.activeAccount, key); }
export function clearActiveAccountKey() { removeStored('local', storageKeys.activeAccount); }
