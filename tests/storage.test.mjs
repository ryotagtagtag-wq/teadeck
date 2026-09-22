import '../.work/upstream/node_modules/fake-indexeddb/auto/index.mjs';

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import {
  accountKey, clearActiveAccountKey, forgetAccount, getAccountId, getActiveAccountKey,
  listRememberedAccounts, readPreference, rememberAccount, setAccountId, setActiveAccountKey,
  storageKey, writePreference,
} from '../integration/storage.ts';

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

const sessionKey = 'teadeck.session.v1';

function account(overrides = {}) {
  return {
    origin: 'https://social.example', accountId: '1', acct: 'alice',
    accessToken: 'token-1', clientId: 'client', clientSecret: 'secret', addedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(async () => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  setAccountId('');
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('teadeck-accounts');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});

test('storageKey requires an active session and account', () => {
  assert.throws(() => storageKey('settings'), /No active account session/);
  sessionStorage.setItem(sessionKey, JSON.stringify({
    origin: 'https://social.example', accessToken: 't', clientId: 'c', clientSecret: 's', remember: false,
  }));
  assert.throws(() => storageKey('settings'), /No active account session/);
  setAccountId('42');
  assert.equal(getAccountId(), '42');
  assert.equal(storageKey('settings'), 'teadeck.v1:https://social.example:42:settings');
});

test('preferences round-trip through the namespaced storage key', () => {
  sessionStorage.setItem(sessionKey, JSON.stringify({
    origin: 'https://social.example', accessToken: 't', clientId: 'c', clientSecret: 's', remember: false,
  }));
  setAccountId('42');
  assert.equal(readPreference('advancedLayout', false), false);
  writePreference('advancedLayout', true);
  assert.equal(readPreference('advancedLayout', false), true);
  assert.equal(localStorage.getItem('teadeck.v1:https://social.example:42:advancedLayout'), 'true');
});

test('remembered accounts round-trip through IndexedDB and are isolated per origin/account', async () => {
  assert.deepEqual(await listRememberedAccounts(), []);

  await rememberAccount(account());
  await rememberAccount(account({ accountId: '2', acct: 'bob', accessToken: 'token-2' }));
  await rememberAccount(account({ origin: 'https://other.example', accountId: '1', acct: 'alice', accessToken: 'token-3' }));

  const stored = await listRememberedAccounts();
  assert.equal(stored.length, 3);
  assert.deepEqual(stored.map(a => accountKey(a.origin, a.accountId)).sort(), [
    'https://other.example::1', 'https://social.example::1', 'https://social.example::2',
  ]);

  await forgetAccount('https://social.example', '1');
  const remaining = await listRememberedAccounts();
  assert.equal(remaining.length, 2);
  assert.ok(!remaining.some(a => a.origin === 'https://social.example' && a.accountId === '1'));
});

test('remembering an account again overwrites its stored credentials', async () => {
  await rememberAccount(account({ accessToken: 'old-token' }));
  await rememberAccount(account({ accessToken: 'new-token' }));
  const stored = await listRememberedAccounts();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].accessToken, 'new-token');
});

test('the active-account pointer is a plain, non-sensitive localStorage key', () => {
  assert.equal(getActiveAccountKey(), null);
  setActiveAccountKey(accountKey('https://social.example', '1'));
  assert.equal(getActiveAccountKey(), 'https://social.example::1');
  clearActiveAccountKey();
  assert.equal(getActiveAccountKey(), null);
});
