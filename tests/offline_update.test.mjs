import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latestWaitingWorker, waitForInstallation } from '../integration/offline_update.ts';

test('an old update banner selects the newest installation on click', async () => {
  const old = { state: 'installed' };
  const next = new EventTarget();
  next.state = 'installing';
  const registration = {
    waiting: old,
    installing: null,
    async update() {
      this.installing = next;
      setTimeout(() => {
        this.installing = null;
        this.waiting = next;
        next.state = 'installed';
        next.dispatchEvent(new Event('statechange'));
      }, 5);
    },
  };
  assert.equal(await latestWaitingWorker(registration), next);
});

test('offline, an already downloaded update remains usable', async () => {
  const waiting = { state: 'installed' };
  assert.equal(await latestWaitingWorker({ waiting, update: async () => { throw new Error('offline'); } }), waiting);
});

test('a stalled update check has a bounded wait', async () => {
  const waiting = { state: 'installed' };
  assert.equal(await latestWaitingWorker({ waiting, update: () => new Promise(() => {}) }, 5), waiting);
});

test('failed installation and timeout release state listeners', async () => {
  const worker = new EventTarget();
  worker.state = 'installing';
  let removed = 0;
  const remove = worker.removeEventListener.bind(worker);
  worker.removeEventListener = (...args) => { removed++; remove(...args); };
  const pending = waitForInstallation(worker);
  worker.state = 'redundant';
  worker.dispatchEvent(new Event('statechange'));
  await pending;
  worker.state = 'installing';
  await waitForInstallation(worker, 5);
  assert.equal(removed, 2);
});
