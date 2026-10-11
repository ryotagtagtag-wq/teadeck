import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { keepStreamingAlive, reconnectDelay } from '../integration/stream_keepalive.ts';
import { instance, status, timelineText } from './fixtures.mjs';
import { mockMastodon, waitUntil } from './mastodon_mock.mjs';
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

  await mockMastodon(context, origin, {
    '/api/v2/instance': streamingInstance,
    '/api/v1/timelines/home': () => { homeRequests++; return [status]; },
  });
  await context.routeWebSocket('wss://mastodon.test/**', (ws) => {
    sockets.push(ws);
    ws.onMessage((raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'subscribe') subscriptions.push({ socket: sockets.length, stream: message.stream });
    });
  });
  const waitFor = (predicate, what) => waitUntil(predicate, { timeout: 15_000, message: what });

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
