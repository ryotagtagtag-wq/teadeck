import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pinnedColumnIndexForPath } from '../integration/pinned_columns.ts';

const defaultColumns = ['COMPOSE', 'HOME', 'NOTIFICATIONS'];

test('finds the pinned column a deck route would duplicate', () => {
  assert.equal(pinnedColumnIndexForPath('/deck/home', defaultColumns), 1);
  assert.equal(pinnedColumnIndexForPath('/deck/timelines/home', defaultColumns), 1);
  assert.equal(pinnedColumnIndexForPath('/deck/notifications/', defaultColumns), 2);
  assert.equal(pinnedColumnIndexForPath('/notifications', defaultColumns), 2);
  assert.equal(pinnedColumnIndexForPath('/deck/public', [...defaultColumns, 'PUBLIC']), 3);
});

test('leaves routes alone that are not pinned or are not column views', () => {
  assert.equal(pinnedColumnIndexForPath('/deck/public', defaultColumns), -1);
  assert.equal(pinnedColumnIndexForPath('/deck/getting-started', defaultColumns), -1);
  assert.equal(pinnedColumnIndexForPath('/deck/preferences', defaultColumns), -1);
  assert.equal(pinnedColumnIndexForPath('/deck/public/local', [...defaultColumns, 'PUBLIC']), -1);
  assert.equal(pinnedColumnIndexForPath('/deckhome', defaultColumns), -1);
});
