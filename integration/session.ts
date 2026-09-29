import { ShellError } from './shell_strings.ts';

/** Browser-only OAuth. No shared application credentials or server session. */
export interface Session {
  origin: string;
  accessToken: string;
  clientId: string;
  clientSecret: string;
  /** Whether this session was also persisted to the opt-in account store. */
  remember: boolean;
}

const sessionKey = 'teadeck.session.v1';
const transactionKey = 'teadeck.oauth.v1';
const scope = 'read write follow';

export function normalizeOrigin(input: string): string {
  const url = new URL(input.includes('://') ? input : `https://${input}`);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new ShellError('errorInstanceUrl');
  }
  return url.origin;
}

export function getSession(): Session | null {
  const stored = sessionStorage.getItem(sessionKey);
  if (!stored) return null;
  try {
    const session = JSON.parse(stored) as Session;
    if (normalizeOrigin(session.origin) !== session.origin ||
        ![session.accessToken, session.clientId, session.clientSecret].every(value => typeof value === 'string' && value.length > 0) ||
        typeof session.remember !== 'boolean') throw new Error();
    return session;
  } catch {
    sessionStorage.removeItem(sessionKey);
    return null;
  }
}

export function apiUrl(path: string): string {
  const session = getSession();
  if (!session) throw new ShellError('errorSignInAgain');
  const url = new URL(path, session.origin);
  if (url.origin !== session.origin || url.username || url.password ||
      !/^\/api\/v(?:1(?:_alpha)?|2)\//.test(url.pathname)) {
    throw new ShellError('errorApiUnsupported');
  }
  return url.href;
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init, credentials: 'omit', redirect: 'error',
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    // The status stays in the message: callers recognise "HTTP 404" to tell a
    // missing endpoint from a real failure (see bootstrap.ts).
    if (response.status === 401) throw new ShellError('errorSessionInvalid');
    throw new ShellError('errorServer', `HTTP ${response.status}`);
  }
  if (response.status === 204) return undefined;
  return response.json();
}

export function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${getSession()?.accessToken ?? ''}`);
  return fetchJson(apiUrl(path), { ...init, headers });
}

function randomString() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function login(input: string, options: { remember?: boolean } = {}) {
  const origin = normalizeOrigin(input.trim());
  const redirectUri = `${location.origin}/oauth/callback`;
  const verifier = randomString();
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const app = await fetchJson(`${origin}/api/v1/apps`, {
    method: 'POST',
    body: new URLSearchParams({ client_name: 'Teadeck', redirect_uris: redirectUri, scopes: scope }),
  });
  if (typeof app.client_id !== 'string' || typeof app.client_secret !== 'string') {
    throw new ShellError('errorAppRegistration');
  }
  const state = randomString();
  sessionStorage.setItem(transactionKey, JSON.stringify({
    origin, redirectUri, verifier, state, createdAt: Date.now(),
    clientId: app.client_id, clientSecret: app.client_secret, remember: options.remember ?? false,
  }));
  const authorize = new URL('/oauth/authorize', origin);
  authorize.search = new URLSearchParams({
    client_id: app.client_id, redirect_uri: redirectUri, response_type: 'code',
    scope, state, code_challenge: challenge, code_challenge_method: 'S256',
  }).toString();
  location.assign(authorize.href);
}

export async function finishLogin() {
  const params = new URLSearchParams(location.search);
  // Consume once, including failed/denied callbacks. Never trust a callback-supplied origin.
  const stored = sessionStorage.getItem(transactionKey);
  sessionStorage.removeItem(transactionKey);
  history.replaceState(null, '', '/');
  if (!stored) throw new ShellError('errorLoginExpired');
  const transaction = JSON.parse(stored);
  if (!transaction.state || params.get('state') !== transaction.state ||
      !Number.isFinite(transaction.createdAt) || Date.now() - transaction.createdAt > 600_000 ||
      transaction.createdAt > Date.now() || transaction.redirectUri !== `${location.origin}/oauth/callback`) {
    throw new ShellError('errorLoginUnverified');
  }
  if (params.has('error')) throw new ShellError('errorLoginCancelled');
  const code = params.get('code');
  if (!code || !transaction.verifier || !transaction.clientId || !transaction.clientSecret) {
    throw new ShellError('errorLoginCodeMissing');
  }
  const origin = normalizeOrigin(transaction.origin);
  const token = await fetchJson(`${origin}/oauth/token`, {
    method: 'POST', body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: transaction.redirectUri,
      client_id: transaction.clientId, client_secret: transaction.clientSecret, code_verifier: transaction.verifier,
    }),
  });
  if (typeof token.access_token !== 'string' || !token.access_token || token.token_type?.toLowerCase() !== 'bearer') {
    throw new ShellError('errorNoToken');
  }
  sessionStorage.setItem(sessionKey, JSON.stringify({ origin, accessToken: token.access_token,
    clientId: transaction.clientId, clientSecret: transaction.clientSecret,
    remember: !!transaction.remember } satisfies Session));
}

/** Makes a remembered account this tab's session. */
export function adoptSession(account: { origin: string; accessToken: string; clientId: string; clientSecret: string }) {
  sessionStorage.setItem(sessionKey, JSON.stringify({ ...account, remember: true } satisfies Session));
}

/** Clears this tab's session and keeps remembered accounts. */
export function switchAccounts() {
  sessionStorage.removeItem(sessionKey);
  sessionStorage.removeItem(transactionKey);
  location.replace('/');
}

export async function logout() {
  const session = getSession();
  // Clear locally first: network failure must never leave a usable local session behind.
  sessionStorage.removeItem(sessionKey);
  sessionStorage.removeItem(transactionKey);
  let revoked = true;
  if (session) {
    try {
      await fetchJson(`${session.origin}/oauth/revoke`, { method: 'POST', body: new URLSearchParams({
        client_id: session.clientId, client_secret: session.clientSecret, token: session.accessToken,
      }) });
    } catch { revoked = false; }
  }
  if (!revoked) sessionStorage.setItem('teadeck.notice', 'noticeRevokedLocally');
  location.replace('/');
}
