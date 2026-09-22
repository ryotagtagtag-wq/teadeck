/**
 * API normalizations and fallbacks for Mastodon-API servers that implement
 * less than the pinned Mastodon web client expects (found against GoToSocial,
 * useful for any server): fill fields the client dereferences without checks,
 * convert between API generations (v1 notifications → v2 groups, profile API →
 * account credentials), and turn server-specific stubs into "no data".
 *
 * Pure functions. Whether a server offers an optional API is decided in
 * api_capabilities.ts; GoToSocial-only extensions live in gotosocial.ts.
 */

interface AccountLike { id: string }
interface StatusLike { id: string; account: AccountLike; tagged_collections?: unknown[]; quotes_count?: number }
interface NotificationLike {
  id: string;
  type: string;
  created_at: string;
  group_key?: string;
  account: AccountLike;
  status?: StatusLike | null;
}

interface AccountFieldLike { name: string; value: string; verified_at?: string | null }
interface CredentialAccountLike {
  id: string;
  display_name: string;
  note: string;
  fields?: AccountFieldLike[];
  avatar: string;
  avatar_static: string;
  avatar_description?: string;
  header: string;
  header_static: string;
  header_description?: string;
  locked: boolean;
  bot: boolean;
  discoverable?: boolean;
  indexable?: boolean;
  hide_collections?: boolean;
  source?: { note?: string; fields?: AccountFieldLike[] };
}

/**
 * Mastodon's `/api/v1/profile` (used by its "Edit profile" page) built from
 * `/api/v1/accounts/verify_credentials`, for servers without it (GoToSocial).
 * Bio and field values come from `source` (the editable plain text, not
 * rendered HTML). Mastodon-only settings get Mastodon's defaults; the page
 * hides their controls (capabilities profile.featuredTags / profile.tabSettings).
 */
export function profileFromCredentialAccount(account: CredentialAccountLike) {
  const rendered = account.fields ?? [];
  const fields = (account.source?.fields ?? rendered).map((field, index) => ({
    name: field.name, value: field.value, verified_at: rendered[index]?.verified_at ?? null,
  }));
  return {
    id: account.id,
    display_name: account.display_name,
    note: account.source?.note ?? account.note,
    fields,
    avatar: account.avatar,
    avatar_static: account.avatar_static,
    avatar_description: account.avatar_description ?? '',
    header: account.header,
    header_static: account.header_static,
    header_description: account.header_description ?? '',
    locked: account.locked,
    bot: account.bot,
    hide_collections: account.hide_collections ?? false,
    discoverable: account.discoverable ?? false,
    indexable: account.indexable ?? false,
    show_media: true,
    show_media_replies: true,
    show_featured: true,
    attribution_domains: [] as string[],
    featured_tags: [] as never[],
  };
}

const credentialsUpdateKeys = ['display_name', 'note', 'locked', 'bot', 'discoverable', 'indexable', 'hide_collections', 'avatar_description', 'header_description'];

/**
 * `PATCH /api/v1/profile` parameters as a `PATCH /api/v1/accounts/update_credentials`
 * JSON body for GoToSocial: its JSON binding wants `fields_attributes` as an
 * index-keyed object (`{"0": {name, value}}`, internal/api/model/account.go),
 * Mastodon's page sends a list. Settings GoToSocial doesn't have are dropped;
 * `null` when nothing is left (GoToSocial rejects an empty update).
 */
export function credentialsUpdateFromProfileParams(params: Record<string, unknown>) {
  const body: Record<string, unknown> = {};
  for (const key of credentialsUpdateKeys) {
    if (params[key] !== undefined) body[key] = params[key];
  }
  if (Array.isArray(params.fields_attributes)) {
    body.fields_attributes = Object.fromEntries(
      (params.fields_attributes as AccountFieldLike[]).map((field, index) => [String(index), { name: field.name, value: field.value }]),
    );
  }
  return Object.keys(body).length > 0 ? body : null;
}

/** Fills in status fields the Mastodon client reads unconditionally. Mutates and returns `status`. */
export function applyStatusDefaults<T extends StatusLike>(status: T): T {
  status.tagged_collections ??= [];
  status.quotes_count ??= 0;
  return status;
}

interface TagHistoryDay { accounts?: unknown; uses?: unknown }

/**
 * Usage numbers for a hashtag row. Mastodon sends at least a week of daily
 * history; GoToSocial's `history` is a stub (empty or absent). Without data,
 * `people` is `null` ("no statistics", nothing shown) instead of 0 or a
 * loading placeholder, and no graph is drawn.
 */
export function hashtagStats(history: TagHistoryDay[] | null | undefined) {
  if (!Array.isArray(history) || history.length === 0) return { people: null, history: undefined, withGraph: false };
  const count = (value: unknown) => Number(value ?? 0);
  return {
    people: count(history[0]?.accounts) + count(history[1]?.accounts),
    history: history.map((day) => count(day.uses)).reverse(),
    withGraph: true,
  };
}

interface SearchResultsLike { accounts?: unknown[]; statuses?: unknown[]; hashtags?: unknown[]; collections?: unknown[] }

/**
 * Search results: Mastodon added `collections`, which GoToSocial does not
 * send, and the client reads every list's length. Missing lists are empty.
 * Mutates and returns `results`.
 */
export function applySearchDefaults<T extends SearchResultsLike>(results: T): T {
  results.accounts ??= [];
  results.statuses ??= [];
  results.hashtags ??= [];
  results.collections ??= [];
  return results;
}

/**
 * The tag name if a search query is exactly one hashtag (`#neuhier`), else undefined.
 * GoToSocial (and Mastodon without full-text search) answer such a query with
 * hashtags only, never with posts; see apiGetSearch.
 */
export function hashtagFromQuery(query: string) {
  const match = /^#([\p{L}\p{M}\p{N}_]+)$/u.exec(query.trim());
  return match?.[1];
}

/** Notifications without a server-side group key are shown individually, as Mastodon does for ungrouped types. */
export function applyNotificationDefaults<T extends NotificationLike>(notification: T): T {
  notification.group_key ??= `ungrouped-${notification.id}`;
  return notification;
}

/**
 * Builds a `/api/v2/notifications` (grouped) response body from a plain
 * `/api/v1/notifications` list, with every notification as its own group.
 * Mirrors app/serializers/rest/notification_group_serializer.rb for a group
 * of one; the v1 `status` object is replaced by `status_id` plus the
 * top-level `statuses` list, exactly like the v2 endpoint does.
 */
export function notificationGroupsFromNotifications<T extends NotificationLike>(notifications: T[]) {
  const accounts = new Map<string, AccountLike>();
  const statuses = new Map<string, StatusLike>();
  const notificationGroups = notifications.map(notification => {
    const { id, type, created_at: createdAt, account, status, group_key: _groupKey, ...rest } = notification;
    accounts.set(account.id, account);
    if (status) {
      statuses.set(status.id, status);
      accounts.set(status.account.id, status.account);
    }
    return {
      ...rest,
      type,
      group_key: `ungrouped-${id}`,
      notifications_count: 1,
      sample_account_ids: [account.id],
      latest_page_notification_at: createdAt,
      most_recent_notification_id: id,
      page_min_id: id,
      page_max_id: id,
      status_id: status?.id ?? null,
    };
  });
  return { accounts: [...accounts.values()], statuses: [...statuses.values()], notification_groups: notificationGroups };
}

/** The v1 endpoint takes the same filters minus grouping. */
export function notificationParamsForV1<T extends { grouped_types?: string[] }>(params: T | undefined) {
  if (!params) return undefined;
  const { grouped_types: _groupedTypes, ...v1Params } = params;
  return v1Params;
}

interface IdLike { id: string }

/**
 * Remembers which "#tag" searches are answered from the hashtag's timeline, so
 * the source is fixed per search: decided on its first page (the server's
 * search returned no posts), never switched by a later empty page. Further
 * pages continue with `max_id` after the last post shown, so new posts
 * arriving in the meantime cannot shift pages (no duplicates or gaps).
 */
export function createHashtagSearchPages() {
  const searches = new Map<string, { tag: string; maxId?: string; done: boolean }>();
  const record = (query: string, tag: string, statuses: IdLike[], limit: number) => {
    searches.set(query, { tag, maxId: statuses.at(-1)?.id, done: statuses.length < limit });
  };
  return {
    /** A new search starts: forget whatever was decided for this query before. */
    reset(query: string) { searches.delete(query); },
    /** The first page came from the hashtag timeline. */
    start(query: string, tag: string, statuses: IdLike[], limit: number) { record(query, tag, statuses, limit); },
    /** Where the next page of this search comes from: undefined = the server's search. */
    next(query: string) { return searches.get(query); },
    /** A further page from the hashtag timeline arrived. */
    continue(query: string, statuses: IdLike[], limit: number) {
      const search = searches.get(query);
      if (search) record(query, search.tag, statuses, limit);
    },
  };
}
