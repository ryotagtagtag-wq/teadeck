import assert from 'node:assert/strict';
import { test } from 'node:test';

import { stripAxiosUserAgent } from '../integration/fetch_patch.ts';

test('strips a User-Agent header before delegating, regardless of call shape', async () => {
  const calls = [];
  const fakeTarget = async (request) => {
    calls.push(request);
    return new Response('ok');
  };
  const patched = stripAxiosUserAgent(fakeTarget);

  await patched('https://mastodon.test/api/v1/timelines/home', {
    method: 'GET',
    headers: { Authorization: 'Bearer token', 'User-Agent': 'axios/1.2.3' },
  });
  assert.equal(calls[0].headers.has('User-Agent'), false);
  assert.equal(calls[0].headers.get('Authorization'), 'Bearer token');
  assert.equal(calls[0].method, 'GET');

  // Also handles being called with a pre-built Request object, as axios's fetch adapter does.
  const preBuilt = new Request('https://mastodon.test/api/v1/statuses', {
    method: 'POST',
    headers: { 'User-Agent': 'axios/1.2.3', 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'hi' }),
  });
  await patched(preBuilt);
  assert.equal(calls[1].headers.has('User-Agent'), false);
  assert.equal(calls[1].headers.get('Content-Type'), 'application/json');
  assert.equal(calls[1].method, 'POST');
});

test('leaves requests without a User-Agent header untouched', async () => {
  const calls = [];
  const fakeTarget = async (request) => { calls.push(request); return new Response('ok'); };
  const patched = stripAxiosUserAgent(fakeTarget);

  await patched('https://mastodon.test/api/v2/instance', { headers: { Accept: 'application/json' } });
  assert.equal(calls[0].headers.has('User-Agent'), false);
  assert.equal(calls[0].headers.get('Accept'), 'application/json');
});
