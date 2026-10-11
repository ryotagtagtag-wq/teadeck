export const timelineText = 'Teadeck browser test timeline entry 7f3a';

export const account = {
  id: '42', username: 'alice', acct: 'alice', display_name: 'Alice',
  locked: false, bot: false, discoverable: true, indexable: true, group: false,
  created_at: '2024-01-01T00:00:00.000Z', note: '<p>Test account</p>',
  url: 'https://mastodon.test/@alice', uri: 'https://mastodon.test/users/alice',
  avatar: 'https://mastodon.test/avatar.png', avatar_static: 'https://mastodon.test/avatar.png',
  avatar_description: '', header: '', header_static: '', header_description: '',
  followers_count: 1, following_count: 1, statuses_count: 1,
  last_status_at: '2026-09-13', fields: [], emojis: [], roles: [],
  hide_collections: false, show_media: true, show_media_replies: true,
  show_featured: true,
  feature_approval: { automatic: [], manual: [], current_user: 'automatic' },
  source: { privacy: 'private', sensitive: false, language: 'de', note: '', fields: [] },
};

export const secondAccount = {
  ...account, id: '43', username: 'bob', acct: 'bob',
  url: 'https://mastodon.test/@bob', uri: 'https://mastodon.test/users/bob',
};

export const instance = {
  domain: 'mastodon.test', title: 'Test Mastodon', version: '4.6.0-nightly',
  source_url: 'https://github.com/mastodon/mastodon', description: '', languages: ['de', 'en'],
  usage: { users: { active_month: 1 } },
  thumbnail: { url: '', description: '' }, icon: [],
  contact: { email: null, account: null }, api_versions: { mastodon: 11 },
  registrations: { enabled: false, approval_required: false, reason_required: false, message: null, min_age: null, url: null },
  rules: [],
  configuration: {
    urls: { streaming: '', status: null, about: '', privacy_policy: null, terms_of_service: null },
    vapid: { public_key: '' },
    accounts: {
      max_display_name_length: 30, max_note_length: 500, max_avatar_description_length: 1500,
      max_header_description_length: 1500, max_featured_tags: 10, max_pinned_statuses: 5,
      max_profile_fields: 4, profile_field_name_limit: 255, profile_field_value_limit: 255,
    },
    statuses: { max_characters: 500, max_media_attachments: 4, characters_reserved_per_url: 23 },
    media_attachments: {
      description_limit: 1500, image_matrix_limit: 16777216, image_size_limit: 16777216,
      supported_mime_types: ['image/jpeg', 'image/png'], video_frame_rate_limit: 120,
      video_matrix_limit: 2304000, video_size_limit: 103809024,
    },
    polls: { max_options: 4, max_characters_per_option: 50, min_expiration: 300, max_expiration: 2629746 },
    translation: { enabled: false }, limited_federation: false,
    timeline_access: {
      live_feeds: { local: 'authenticated', remote: 'authenticated' },
      hashtag_feeds: { local: 'authenticated', remote: 'authenticated' },
      trending_link_feeds: { local: 'authenticated', remote: 'authenticated' },
    },
  },
};

export const status = {
  id: '100', created_at: '2026-09-13T12:00:00.000Z', sensitive: false,
  spoiler_text: '', visibility: 'public', language: 'de',
  uri: 'https://mastodon.test/users/alice/statuses/100',
  url: 'https://mastodon.test/@alice/100',
  replies_count: 0, reblogs_count: 0, favourites_count: 0, quotes_count: 0,
  favourited: false, reblogged: false, muted: false, bookmarked: false, pinned: false,
  content: `<p>${timelineText}</p>`, account, media_attachments: [], mentions: [],
  tags: [], emojis: [], tagged_collections: [], filtered: [],
};

/** The server's answer to a new post: `status` with what was sent (`sent` as posted to /api/v1/statuses). */
export function postedStatus(sent, overrides = {}) {
  return {
    ...status, id: 'posted-1', created_at: new Date().toISOString(),
    visibility: sent.visibility ?? 'public', content: `<p>${sent.status}</p>`,
    in_reply_to_id: sent.in_reply_to_id ?? null, ...overrides,
  };
}
