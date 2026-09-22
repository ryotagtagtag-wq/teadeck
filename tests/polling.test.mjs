import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import { startHomeTimelinePolling } from '../integration/polling.ts';

test('polls on a fixed interval and stops when told to', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  const dispatched = [];
  const action = { type: 'EXPAND_HOME_TIMELINE' };

  const stop = startHomeTimelinePolling((a) => dispatched.push(a), () => action, 30_000);
  assert.deepEqual(dispatched, []);

  mock.timers.tick(30_000);
  assert.deepEqual(dispatched, [action]);

  mock.timers.tick(30_000);
  mock.timers.tick(30_000);
  assert.deepEqual(dispatched, [action, action, action]);

  stop();
  mock.timers.tick(60_000);
  assert.deepEqual(dispatched, [action, action, action]);

  mock.timers.reset();
});

test('defaults to a 30 second interval', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  let calls = 0;

  startHomeTimelinePolling(() => calls++, () => ({}));
  mock.timers.tick(29_999);
  assert.equal(calls, 0);
  mock.timers.tick(1);
  assert.equal(calls, 1);

  mock.timers.reset();
});
