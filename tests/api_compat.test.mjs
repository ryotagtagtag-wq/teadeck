import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyNotificationDefaults,
  applySearchDefaults,
  hashtagStats,
  applyStatusDefaults,
  notificationGroupsFromNotifications,
  notificationParamsForV1,
  extendedDescriptionFromInstance,
  termsOfServiceFromInstance,
} from '../integration/api_compat.ts';

const alice = { id: 'alice' };
const me = { id: 'me' };
const myStatus = { id: 's1', account: me };

test('fills status fields GoToSocial omits, without overwriting ones the server sent', () => {
  assert.deepEqual(applyStatusDefaults({ id: '1', account: me }), { id: '1', account: me, tagged_collections: [], quotes_count: 0 });
  const mastodonStatus = { id: '2', account: me, tagged_collections: [{ id: 'c' }], quotes_count: 3 };
  assert.deepEqual(applyStatusDefaults({ ...mastodonStatus }), mastodonStatus);
});

test('streamed notifications without a group key stay ungrouped instead of all sharing `undefined`', () => {
  assert.equal(applyNotificationDefaults({ id: 'n1', type: 'favourite', created_at: '', account: alice }).group_key, 'ungrouped-n1');
  assert.equal(applyNotificationDefaults({ id: 'n2', type: 'favourite', created_at: '', account: alice, group_key: 'grouped-7' }).group_key, 'grouped-7');
});

test('turns a v1 notification list into a v2 grouped response with one group per notification', () => {
  const result = notificationGroupsFromNotifications([
    { id: 'n2', type: 'favourite', created_at: '2026-09-14T09:00:00Z', account: alice, status: myStatus },
    { id: 'n1', type: 'follow', created_at: '2026-09-13T09:00:00Z', account: alice },
  ]);
  assert.deepEqual(result.accounts, [alice, me]);
  assert.deepEqual(result.statuses, [myStatus]);
  assert.deepEqual(result.notification_groups, [
    {
      type: 'favourite', group_key: 'ungrouped-n2', notifications_count: 1, sample_account_ids: ['alice'],
      latest_page_notification_at: '2026-09-14T09:00:00Z', most_recent_notification_id: 'n2',
      page_min_id: 'n2', page_max_id: 'n2', status_id: 's1',
    },
    {
      type: 'follow', group_key: 'ungrouped-n1', notifications_count: 1, sample_account_ids: ['alice'],
      latest_page_notification_at: '2026-09-13T09:00:00Z', most_recent_notification_id: 'n1',
      page_min_id: 'n1', page_max_id: 'n1',
    },
  ]);
});

test('keeps type-specific payloads such as reports on the synthesized group', () => {
  const report = { id: 'r1', target_account: alice };
  const [group] = notificationGroupsFromNotifications([{ id: 'n3', type: 'admin.report', created_at: '', account: alice, report }]).notification_groups;
  assert.equal(group.report, report);
});

test('drops only the grouping parameter when falling back to v1', () => {
  assert.deepEqual(
    notificationParamsForV1({ grouped_types: ['favourite'], exclude_types: ['follow_request'], max_id: 'n9' }),
    { exclude_types: ['follow_request'], max_id: 'n9' },
  );
  assert.equal(notificationParamsForV1(undefined), undefined);
});

test('search results without Mastodon-only lists get empty ones, keeping what the server sent', () => {
  const hashtags = [{ name: 'teadeck' }];
  assert.deepEqual(applySearchDefaults({ accounts: [], statuses: [], hashtags }), { accounts: [], statuses: [], hashtags, collections: [] });
  assert.deepEqual(applySearchDefaults({}), { accounts: [], statuses: [], hashtags: [], collections: [] });
});

test('hashtags without usage history (GoToSocial) show no statistics instead of crashing', () => {
  assert.deepEqual(hashtagStats([]), { people: null, history: undefined, withGraph: false });
  assert.deepEqual(hashtagStats(undefined), { people: null, history: undefined, withGraph: false });
  // Mastodon: newest day first, counts as strings; people over the last two days, graph oldest to newest.
  assert.deepEqual(hashtagStats([{ day: '2', accounts: '3', uses: '5' }, { day: '1', accounts: '2', uses: '4' }]), { people: 5, history: [4, 5], withGraph: true });
});

test('builds the edit-profile data from verify_credentials, with the editable source texts', async () => {
  const { profileFromCredentialAccount } = await import('../integration/api_compat.ts');
  const profile = profileFromCredentialAccount({
    id: '42', display_name: 'Alice', note: '<p>Hi <a href="x">there</a></p>',
    fields: [{ name: 'Web', value: '<a href="https://a.test">a.test</a>', verified_at: '2026-01-01T00:00:00Z' }],
    avatar: 'a.png', avatar_static: 'a.png', header: 'h.png', header_static: 'h.png',
    locked: true, bot: false, discoverable: true,
    source: { note: 'Hi there', fields: [{ name: 'Web', value: 'https://a.test' }] },
  });
  assert.equal(profile.note, 'Hi there');
  assert.deepEqual(profile.fields, [{ name: 'Web', value: 'https://a.test', verified_at: '2026-01-01T00:00:00Z' }]);
  assert.equal(profile.avatar_description, '');
  assert.equal(profile.indexable, false);
  assert.deepEqual(profile.featured_tags, []);
});

test('turns edit-profile changes into a GoToSocial update_credentials body', async () => {
  const { credentialsUpdateFromProfileParams } = await import('../integration/api_compat.ts');
  assert.deepEqual(
    credentialsUpdateFromProfileParams({ display_name: 'Alice', fields_attributes: [{ name: 'Web', value: 'https://a.test' }, { name: 'Pronomen', value: 'sie' }] }),
    { display_name: 'Alice', fields_attributes: { 0: { name: 'Web', value: 'https://a.test' }, 1: { name: 'Pronomen', value: 'sie' } } },
  );
  assert.deepEqual(credentialsUpdateFromProfileParams({ fields_attributes: [] }), { fields_attributes: {} });
  assert.deepEqual(credentialsUpdateFromProfileParams({ bot: false }), { bot: false });
  // Only Mastodon-specific settings: nothing to send.
  assert.equal(credentialsUpdateFromProfileParams({ show_media: false, show_featured: true }), null);
});

test('recognizes a search for exactly one hashtag', async () => {
  const { hashtagFromQuery } = await import('../integration/api_compat.ts');
  assert.equal(hashtagFromQuery('#neuhier'), 'neuhier');
  assert.equal(hashtagFromQuery('  #Fediverse_DE '), 'Fediverse_DE');
  assert.equal(hashtagFromQuery('#café'), 'café');
  assert.equal(hashtagFromQuery('neuhier'), undefined);
  assert.equal(hashtagFromQuery('#neu hier'), undefined);
  assert.equal(hashtagFromQuery('#'), undefined);
});

test('a hashtag search keeps its source and pages by max_id', async () => {
  const { createHashtagSearchPages } = await import('../integration/api_compat.ts');
  const pages = createHashtagSearchPages();
  const ids = (...list) => list.map((id) => ({ id }));

  // Native search had posts: nothing is recorded, later pages stay native.
  assert.equal(pages.next('#neuhier'), undefined);

  // Native search had none: the timeline answers, the next page continues after the last post.
  pages.start('#neuhier', 'neuhier', ids('30', '29', '28'), 3);
  assert.deepEqual(pages.next('#neuhier'), { tag: 'neuhier', maxId: '28', done: false });
  pages.continue('#neuhier', ids('27', '26'), 3);
  assert.deepEqual(pages.next('#neuhier'), { tag: 'neuhier', maxId: '26', done: true });

  // A new search for the same query decides again.
  pages.reset('#neuhier');
  assert.equal(pages.next('#neuhier'), undefined);
});

test('the about and terms pages of servers without these APIs come from their v1 instance', () => {
  const gts = { description: '<p>Ein Server für Tee</p>', terms: '<p>Sei nett.</p>' };
  assert.deepEqual(extendedDescriptionFromInstance(gts), { updated_at: '', content: '<p>Ein Server für Tee</p>' });
  assert.deepEqual(termsOfServiceFromInstance(gts), { effective_date: '', effective: true, succeeded_by: null, content: '<p>Sei nett.</p>' });
  assert.equal(termsOfServiceFromInstance({}).content, '');
});
