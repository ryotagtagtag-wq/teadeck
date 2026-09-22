import assert from 'node:assert/strict';
import { test } from 'node:test';

import { initCapabilities, setSupport, support, withCapability } from '../integration/api_capabilities.ts';

function memoryStorage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data };
}
const notFound = () => Object.assign(new Error('Not Found'), { response: { status: 404 } });

test('missing metadata is unknown, not unsupported; explicit metadata counts', () => {
  initCapabilities('https://gts.test', { version: '0.22.1' }, memoryStorage());
  assert.equal(support('notifications.grouped'), 'unknown');
  assert.equal(support('notifications.policy'), 'unknown');
  assert.equal(support('translation.languages'), 'unknown');

  initCapabilities('https://mastodon.test', { version: '4.6.0', api_versions: { mastodon: 11 }, configuration: { translation: { enabled: false } } }, memoryStorage());
  assert.equal(support('notifications.grouped'), 'supported');
  assert.equal(support('notifications.policy'), 'supported');
  assert.equal(support('translation.languages'), 'unsupported');
});

test('the first use decides; each capability on its own', async () => {
  initCapabilities('https://gts.test', { version: '0.22.1' }, memoryStorage());
  let calls = 0;
  assert.equal(await withCapability('notifications.grouped', async () => { calls++; throw notFound(); }, () => 'v1'), 'v1');
  assert.equal(await withCapability('notifications.grouped', async () => { calls++; return 'v2'; }, () => 'v1'), 'v1');
  assert.equal(calls, 1);
  assert.equal(support('notifications.grouped'), 'unsupported');
  // A separate capability is still probed.
  assert.equal(await withCapability('notifications.policy', async () => 'policy', () => null), 'policy');
  assert.equal(support('notifications.policy'), 'supported');
});

test('other errors prove nothing', async () => {
  initCapabilities('https://gts.test', { version: '0.22.1' }, memoryStorage());
  const unauthorized = Object.assign(new Error('Unauthorized'), { response: { status: 401 } });
  await assert.rejects(withCapability('profile.read', async () => { throw unauthorized; }, () => 'fallback'), unauthorized);
  assert.equal(support('profile.read'), 'unknown');
});

test('results persist per server and version; an upgrade re-checks', () => {
  const storage = memoryStorage();
  initCapabilities('https://gts.test', { version: '0.22.1' }, storage);
  setSupport('notifications.grouped', 'unsupported');

  initCapabilities('https://gts.test', { version: '0.22.1' }, storage);
  assert.equal(support('notifications.grouped'), 'unsupported');

  initCapabilities('https://other.test', { version: '0.22.1' }, storage);
  assert.equal(support('notifications.grouped'), 'unknown');

  initCapabilities('https://gts.test', { version: '0.23.0' }, storage);
  assert.equal(support('notifications.grouped'), 'unknown');
});

test('current explicit metadata overrides a stored result', () => {
  const storage = memoryStorage();
  initCapabilities('https://mastodon.test', { version: '4.6.0', configuration: { translation: { enabled: false } } }, storage);
  assert.equal(support('translation.languages'), 'unsupported');

  // The admin enables translation; same server version.
  initCapabilities('https://mastodon.test', { version: '4.6.0', configuration: { translation: { enabled: true } } }, storage);
  assert.equal(support('translation.languages'), 'unknown');
});

test('a 404 switches a capability off for a day, then it is probed again', async () => {
  const storage = memoryStorage();
  let time = 1_000_000;
  const clock = () => time;
  initCapabilities('https://gts.test', { version: '0.22.1' }, storage, clock);
  await withCapability('accounts.familiarFollowers', async () => { throw notFound(); }, () => []);
  assert.equal(support('accounts.familiarFollowers'), 'unsupported');

  time += 23 * 60 * 60 * 1000;
  initCapabilities('https://gts.test', { version: '0.22.1' }, storage, clock);
  assert.equal(support('accounts.familiarFollowers'), 'unsupported');

  time += 2 * 60 * 60 * 1000;
  assert.equal(support('accounts.familiarFollowers'), 'unknown', 'expires within a running session too');
  initCapabilities('https://gts.test', { version: '0.22.1' }, storage, clock);
  assert.equal(support('accounts.familiarFollowers'), 'unknown');
  assert.equal(await withCapability('accounts.familiarFollowers', async () => ['someone'], () => []).then((r) => r.length), 1);
  assert.equal(support('accounts.familiarFollowers'), 'supported');
});
