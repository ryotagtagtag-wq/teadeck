import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { instance, status, timelineText } from './fixtures.mjs';
import { mockMastodon, waitUntil } from './mastodon_mock.mjs';
import { browser, origin, submitSignIn, useApp } from './harness.mjs';

useApp();

/** Mocks the REST endpoints Teadeck's boot/login/timeline flow needs, shared by both tests below. */
async function mockMastodonRest(context, { instanceFixture, onHomeTimelineRequest }) {
  await mockMastodon(context, origin, {
    '/api/v2/instance': instanceFixture,
    '/api/v1/timelines/home': () => { onHomeTimelineRequest?.(); return [status]; },
    '/api/v1/markers': {},
  });
}

/**
 * Resolves with the request count once it has not changed for `quietMs`. Startup may load the home
 * timeline twice: when the first response is in before the home column mounts, the column asks for
 * newer posts (since_id), a Mastodon race that shows up under load.
 */
async function settledCount(getCount, quietMs = 1_000) {
  let count = getCount();
  let since = Date.now();
  while (Date.now() - since < quietMs) {
    await new Promise(r => setTimeout(r, 50));
    if (getCount() !== count) { count = getCount(); since = Date.now(); }
  }
  return count;
}

test('without a streaming endpoint, the home timeline is refreshed by polling instead', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  const wsConnections = [];
  page.on('websocket', (ws) => wsConnections.push(ws.url()));
  let homeTimelineRequests = 0;

  // instance fixture's configuration.urls.streaming is already '' (no streaming endpoint).
  await mockMastodonRest(context, { instanceFixture: instance, onHomeTimelineRequest: () => homeTimelineRequests++ });

  await page.clock.install();
  await submitSignIn(page, origin);
  await page.getByText(timelineText).waitFor();
  assert.deepEqual(wsConnections, []);

  // Freeze page time so waiting for startup requests to settle doesn't move the poll interval.
  // (2 s ahead: pauseAt must not lie in the past once the call arrives.)
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 2_000));
  const afterStartup = await settledCount(() => homeTimelineRequests);
  assert.ok(afterStartup >= 1 && afterStartup <= 2, `startup requests: ${afterStartup}`);

  // How long polling already ran before the clock was paused depends on the machine's speed,
  // so find the first poll second by second (it must come within one interval)…
  let seconds = 0;
  while (homeTimelineRequests === afterStartup && seconds < 31) {
    await page.clock.runFor(1_000);
    seconds++;
    await settledCount(() => homeTimelineRequests, 100);
  }
  assert.equal(homeTimelineRequests, afterStartup + 1, `a poll within 30 s (after ${seconds} s)`);

  // …then the interval is exact: nothing for the next 29 s, one poll in the 2 s after.
  await page.clock.runFor('00:29');
  assert.equal(await settledCount(() => homeTimelineRequests, 300), afterStartup + 1);
  await page.clock.runFor('00:02');
  for (let attempt = 0; attempt < 100 && homeTimelineRequests === afterStartup + 1; attempt++) await new Promise(r => setTimeout(r, 20));
  assert.equal(homeTimelineRequests, afterStartup + 2);

  assert.deepEqual(wsConnections, []);
  await context.close();
});

test('with a streaming endpoint, a real WebSocket delivers a live update instead of polling', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  const streamingInstance = { ...instance, configuration: { ...instance.configuration, urls: { ...instance.configuration.urls, streaming: 'wss://mastodon.test' } } };
  let homeTimelineRequests = 0;
  let wsRoute;
  const wsUrls = [];
  const wsProtocols = [];
  let subscribedToUserStream = false;

  await mockMastodonRest(context, { instanceFixture: streamingInstance, onHomeTimelineRequest: () => homeTimelineRequests++ });
  await context.routeWebSocket('wss://mastodon.test/**', (ws) => {
    wsRoute = ws;
    wsUrls.push(ws.url());
    wsProtocols.push(ws.protocols());
    ws.onMessage((raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'subscribe' && message.stream === 'user') subscribedToUserStream = true;
    });
  });

  await page.clock.install();
  await submitSignIn(page, origin);
  await page.getByText(timelineText).waitFor();

  // The access token travels as the WebSocket subprotocol, per Mastodon's streaming
  // auth, never as a query-string parameter that could end up logged somewhere.
  assert.equal(wsUrls.length, 1);
  assert.equal(new URL(wsUrls[0]).pathname, '/api/v1/streaming');
  assert.deepEqual(wsProtocols[0], ['browser-token']);

  await waitUntil(() => subscribedToUserStream, { message: 'never subscribed to the user stream' });

  // Streaming is active: the polling fallback must stay off even well past its interval.
  const afterStartup = await settledCount(() => homeTimelineRequests);
  await page.clock.fastForward('00:45');
  assert.equal(await settledCount(() => homeTimelineRequests, 300), afterStartup);

  // The server pushes a live update over the same connection; with Mastodon's
  // default settings it appears in the timeline right away, without a click.
  const liveText = 'Teadeck live streaming update 4d7e';
  const liveStatus = { ...status, id: '999', content: `<p>${liveText}</p>` };
  wsRoute.send(JSON.stringify({ stream: ['user'], event: 'update', payload: JSON.stringify(liveStatus) }));

  await page.getByText(liveText).waitFor();
  assert.equal(await page.locator('button.load-gap').count(), 0);

  await context.close();
});
