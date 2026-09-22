import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { keepStreamingAlive, reconnectDelay } from '../integration/stream_keepalive.ts';
import { instance, status, timelineText } from './fixtures.mjs';
import { createStaticServer } from './server.mjs';

test('reconnect delays grow exponentially from 1 s but never exceed 30 s', () => {
  assert.equal(reconnectDelay(1, 0.999), 1_998);
  assert.equal(reconnectDelay(3, 0.5), 4_000);
  assert.equal(reconnectDelay(20, 0.999), 30_000);
  assert.equal(reconnectDelay(40, 1), 30_000);
});

function fakeWindow() {
  const target = new EventTarget();
  target.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  return target;
}

function fakeClient() {
  const closed = [];
  globalThis.WebSocket ??= { OPEN: 1 };
  const client = {
    ws: { readyState: 1, close: (code) => closed.push(code) },
    reconnectEnabled: true,
    backoff: { attempts: 7, func: () => 0 },
    onOpenCallback() { this.opened = true; },
  };
  return { client, closed };
}

test('a successful reconnect starts the delays over', () => {
  const { client } = fakeClient();
  keepStreamingAlive(client, fakeWindow());
  assert.equal(client.backoff.func(30, 100) <= 30_000, true);
  client.onOpenCallback();
  assert.equal(client.backoff.attempts, 0);
  assert.equal(client.opened, true);
});

test('reconnects when the network comes back, but never just because the tab was hidden', () => {
  const { client, closed } = fakeClient();
  const win = fakeWindow();
  keepStreamingAlive(client, win);

  win.dispatchEvent(new Event('online'));
  assert.equal(closed.length, 1);

  // Switching tabs, even for a long time, keeps the working connection.
  const realNow = Date.now;
  win.document.visibilityState = 'hidden';
  win.document.dispatchEvent(new Event('visibilitychange'));
  Date.now = () => realNow() + 10 * 60_000;
  try {
    win.document.visibilityState = 'visible';
    win.document.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('blur'));
    win.dispatchEvent(new Event('focus'));
  } finally {
    Date.now = realNow;
  }
  assert.equal(closed.length, 1);

  // Not while intentionally closed.
  client.reconnectEnabled = false;
  win.dispatchEvent(new Event('online'));
  assert.equal(closed.length, 1);
});

let server;
let origin;
let browser;

before(async () => {
  ({ server, origin } = await createStaticServer());
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

test('after the streaming connection drops or the network returns, Teadeck reconnects, resubscribes and catches up', { timeout: 90_000 }, async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const streamingInstance = { ...instance, configuration: { ...instance.configuration, urls: { ...instance.configuration.urls, streaming: 'wss://mastodon.test' } } };
  const sockets = [];
  const subscriptions = [];
  let homeRequests = 0;
  const policy = {
    for_not_following: 'accept', for_not_followers: 'accept', for_new_accounts: 'accept',
    for_private_mentions: 'accept', for_limited_accounts: 'filter', for_bots: 'accept',
    summary: { pending_requests_count: 0, pending_notifications_count: 0 },
  };

  await context.route('https://mastodon.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/oauth/authorize') {
      const callback = new URL('/oauth/callback', origin);
      callback.search = new URLSearchParams({ code: 'browser-code', state: url.searchParams.get('state') ?? '' });
      return route.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(callback.href)})</script>` });
    }
    let body = [];
    if (url.pathname === '/api/v1/apps') body = { client_id: 'browser-client', client_secret: 'browser-secret' };
    else if (url.pathname === '/oauth/token') body = { access_token: 'browser-token', token_type: 'Bearer', scope: 'read write follow' };
    else if (url.pathname === '/api/v2/instance') body = streamingInstance;
    else if (url.pathname === '/api/v1/accounts/verify_credentials') body = (await import('./fixtures.mjs')).account;
    else if (url.pathname === '/api/v1/preferences') body = {};
    else if (url.pathname === '/api/v1/timelines/home') { homeRequests++; body = [status]; }
    else if (url.pathname === '/api/v2/notifications') body = { notification_groups: [], accounts: [], statuses: [] };
    else if (url.pathname === '/api/v2/notifications/policy') body = policy;
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  });
  await context.routeWebSocket('wss://mastodon.test/**', (ws) => {
    sockets.push(ws);
    ws.onMessage((raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'subscribe') subscriptions.push({ socket: sockets.length, stream: message.stream });
    });
  });
  const waitFor = async (predicate, what) => {
    for (let attempt = 0; attempt < 300 && !predicate(); attempt++) await new Promise(r => setTimeout(r, 50));
    assert.ok(predicate(), what);
  };

  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).waitFor();
  await waitFor(() => subscriptions.some((s) => s.socket === 1 && s.stream === 'user'), 'subscribed on the first connection');

  // The server goes away (e.g. restart): a new connection within the first backoff step (≤ 2 s).
  const homeBeforeDrop = homeRequests;
  await sockets[0].close({ code: 1001, reason: 'going away' });
  await waitFor(() => sockets.length === 2, 'reconnected after the server closed the connection');
  await waitFor(() => subscriptions.some((s) => s.socket === 2 && s.stream === 'user'), 'resubscribed after reconnecting');
  await waitFor(() => homeRequests > homeBeforeDrop, 'caught up on posts missed while disconnected');

  const liveText = 'Teadeck update after reconnect 5c1e';
  sockets[1].send(JSON.stringify({ stream: ['user'], event: 'update', payload: JSON.stringify({ ...status, id: '1001', content: `<p>${liveText}</p>` }) }));
  await page.getByText(liveText).waitFor();

  // Network came back after a change the socket did not notice: reconnect proactively.
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => sockets.length === 3, 'reconnected after the online event');
  await waitFor(() => subscriptions.some((s) => s.socket === 3 && s.stream === 'user'), 'resubscribed after the online event');

  await context.close();
});
