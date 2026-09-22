import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { adoptSession, apiUrl, finishLogin, getSession, login, logout, normalizeOrigin, request, switchAccounts } from '../integration/session.ts';

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

const originalFetch = globalThis.fetch;
const transactionKey = 'teadeck.oauth.v1';
const sessionKey = 'teadeck.session.v1';
let assigned;
let replaced;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function transaction(overrides = {}) {
  return {
    origin: 'https://social.example',
    redirectUri: 'https://app.example/oauth/callback',
    verifier: 'verifier',
    state: 'expected',
    createdAt: Date.now(),
    clientId: 'client',
    clientSecret: 'secret',
    ...overrides,
  };
}

beforeEach(() => {
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.location = {
    origin: 'https://app.example', pathname: '/', search: '',
    assign(value) { assigned = value; },
    replace(value) { replaced = value; },
  };
  globalThis.history = { replaceState(_state, _unused, value) { replaced = value; } };
  assigned = undefined;
  replaced = undefined;
});

afterEach(() => { globalThis.fetch = originalFetch; });

test('login registers a local OAuth app and sends a valid PKCE challenge', async () => {
  let registration;
  globalThis.fetch = async (url, init) => {
    registration = { url, init };
    return json({ client_id: 'client', client_secret: 'secret' });
  };

  await login('social.example');
  const saved = JSON.parse(sessionStorage.getItem(transactionKey));
  const authorization = new URL(assigned);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(saved.verifier));
  const expected = Buffer.from(digest).toString('base64url');

  assert.equal(registration.url, 'https://social.example/api/v1/apps');
  assert.equal(registration.init.credentials, 'omit');
  assert.equal(registration.init.redirect, 'error');
  assert.equal(authorization.origin, saved.origin);
  assert.equal(authorization.pathname, '/oauth/authorize');
  assert.equal(authorization.searchParams.get('state'), saved.state);
  assert.equal(authorization.searchParams.get('code_challenge'), expected);
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
});

test('callback consumes a transaction once and rejects a mismatched state without token exchange', async () => {
  sessionStorage.setItem(transactionKey, JSON.stringify(transaction()));
  location.search = '?code=code&state=wrong';
  let calls = 0;
  globalThis.fetch = async () => { calls++; return json({}); };

  await assert.rejects(finishLogin(), /could not be verified/);
  await assert.rejects(finishLogin(), /has expired/);
  assert.equal(calls, 0);
  assert.equal(sessionStorage.getItem(transactionKey), null);
});

test('callback rejects expired and future transactions before token exchange', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return json({}); };
  location.search = '?code=code&state=expected';
  for (const createdAt of [Date.now() - 600_001, Date.now() + 60_000]) {
    sessionStorage.setItem(transactionKey, JSON.stringify(transaction({ createdAt })));
    await assert.rejects(finishLogin(), /could not be verified/);
  }
  assert.equal(calls, 0);
});

test('successful callback stores a session and cannot exchange the code twice', async () => {
  sessionStorage.setItem(transactionKey, JSON.stringify(transaction()));
  location.search = '?code=code&state=expected';
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://social.example/oauth/token');
    assert.equal(init.redirect, 'error');
    return json({ access_token: 'token', token_type: 'Bearer' });
  };

  await finishLogin();
  assert.deepEqual(getSession(), {
    origin: 'https://social.example', accessToken: 'token',
    clientId: 'client', clientSecret: 'secret', remember: false,
  });
  await assert.rejects(finishLogin(), /has expired/);
  assert.equal(calls, 1);
});

test('login persists the "remember" choice through the callback', async () => {
  globalThis.fetch = async () => json({ client_id: 'client', client_secret: 'secret' });
  await login('social.example', { remember: true });
  assert.equal(JSON.parse(sessionStorage.getItem(transactionKey)).remember, true);

  location.search = '?code=code&state=' + JSON.parse(sessionStorage.getItem(transactionKey)).state;
  globalThis.fetch = async () => json({ access_token: 'token', token_type: 'Bearer' });
  await finishLogin();
  assert.equal(getSession().remember, true);
});

test('callback rejects malformed token responses', async () => {
  for (const token of [{}, { access_token: '', token_type: 'Bearer' }, { access_token: 'token', token_type: 'MAC' }]) {
    sessionStorage.setItem(transactionKey, JSON.stringify(transaction()));
    location.search = '?code=code&state=expected';
    globalThis.fetch = async () => json(token);
    await assert.rejects(finishLogin(), /no valid access token/);
    assert.equal(getSession(), null);
  }
});

test('callback cannot exchange a token outside a normalized instance origin', async () => {
  sessionStorage.setItem(transactionKey, JSON.stringify(transaction({ origin: 'https://social.example/path' })));
  location.search = '?code=code&state=expected';
  let calls = 0;
  globalThis.fetch = async () => { calls++; return json({}); };

  // ShellError: its message is the English text, the page shows it translated.
  await assert.rejects(finishLogin(), /Enter an HTTPS address/);
  assert.equal(calls, 0);
});

test('origins and API paths cannot escape their HTTPS security boundaries', () => {
  assert.equal(normalizeOrigin('social.example'), 'https://social.example');
  for (const value of ['http://social.example', 'https://user@social.example', 'https://social.example/path', 'https://social.example/?x=1']) {
    assert.throws(() => normalizeOrigin(value));
  }
  sessionStorage.setItem(sessionKey, JSON.stringify({
    origin: 'https://social.example', accessToken: 'token', clientId: 'client', clientSecret: 'secret', remember: false,
  }));
  assert.equal(apiUrl('/api/v1/timelines/home'), 'https://social.example/api/v1/timelines/home');
  for (const path of ['https://evil.example/api/v1/accounts/1', '//evil.example/api/v1/accounts/1', '/oauth/token', '/api/v3/test']) {
    assert.throws(() => apiUrl(path), /does not support this API address/);
  }
});

test('authenticated requests omit credentials, reject redirects, and overwrite authorization', async () => {
  sessionStorage.setItem(sessionKey, JSON.stringify({
    origin: 'https://social.example', accessToken: 'token', clientId: 'client', clientSecret: 'secret', remember: false,
  }));
  let captured;
  globalThis.fetch = async (url, init) => { captured = { url, init }; return json({ ok: true }); };

  await request('/api/v2/instance', { headers: { Authorization: 'Bearer attacker' } });
  assert.equal(captured.url, 'https://social.example/api/v2/instance');
  assert.equal(captured.init.credentials, 'omit');
  assert.equal(captured.init.redirect, 'error');
  assert.equal(captured.init.headers.get('Authorization'), 'Bearer token');
});

test('logout clears local credentials and records a notice if revocation fails', async () => {
  sessionStorage.setItem(sessionKey, JSON.stringify({
    origin: 'https://social.example', accessToken: 'token', clientId: 'client', clientSecret: 'secret', remember: false,
  }));
  sessionStorage.setItem(transactionKey, '{}');
  globalThis.fetch = async () => { throw new TypeError('offline'); };

  await logout();
  assert.equal(getSession(), null);
  assert.equal(sessionStorage.getItem(transactionKey), null);
  // The notice is stored as a message id; the sign-in page shows it translated.
  assert.equal(sessionStorage.getItem('teadeck.notice'), 'noticeRevokedLocally');
  assert.equal(replaced, '/');
});

test('adoptSession activates a remembered account without any network call', () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return json({}); };

  adoptSession({ origin: 'https://social.example', accessToken: 'token', clientId: 'client', clientSecret: 'secret' });
  assert.deepEqual(getSession(), {
    origin: 'https://social.example', accessToken: 'token', clientId: 'client', clientSecret: 'secret', remember: true,
  });
  assert.equal(calls, 0);
});

test('switchAccounts clears only the tab session, without revoking or contacting the instance', () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return json({}); };
  sessionStorage.setItem(sessionKey, JSON.stringify({
    origin: 'https://social.example', accessToken: 'token', clientId: 'client', clientSecret: 'secret', remember: true,
  }));

  switchAccounts();
  assert.equal(getSession(), null);
  assert.equal(calls, 0);
  assert.equal(replaced, '/');
});
