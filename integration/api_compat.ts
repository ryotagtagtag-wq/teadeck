/**
 * Fallbacks for servers that implement less of the Mastodon API than the web
 * client expects, such as GoToSocial: missing fields, older API versions and
 * stub responses.
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
 * `/api/v1/profile` built from `verify_credentials`, for servers without it.
 * Bio and fields come from `source`, the editable plain text.
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
 * Profile parameters as an `update_credentials` body. GoToSocial wants
 * `fields_attributes` keyed by index and rejects an empty update, hence `null`.
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

/** Usage numbers for a hashtag row; `people` is `null` when the server sends no history. */
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

/** Missing result lists are empty. Mutates and returns `results`. */
export function applySearchDefaults<T extends SearchResultsLike>(results: T): T {
  results.accounts ??= [];
  results.statuses ??= [];
  results.hashtags ??= [];
  results.collections ??= [];
  return results;
}

/**
 * The tag name if the query is exactly one hashtag. Servers without full-text
 * search answer such a query without posts; see apiGetSearch.
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

/** A grouped v2 notifications response built from a v1 list, one group per notification. */
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
 * Which "#tag" searches are answered from the hashtag timeline. Decided on the
 * first page; later pages continue after the last post shown.
 */
export function createHashtagSearchPages() {
  const searches = new Map<string, { tag: string; maxId?: string; done: boolean }>();
  const record = (query: string, tag: string, statuses: IdLike[], limit: number) => {
    searches.set(query, { tag, maxId: statuses.at(-1)?.id, done: statuses.length < limit });
  };
  return {
    reset(query: string) { searches.delete(query); },
    start(query: string, tag: string, statuses: IdLike[], limit: number) { record(query, tag, statuses, limit); },
    /** `undefined`: the next page comes from the server's search. */
    next(query: string) { return searches.get(query); },
    continue(query: string, statuses: IdLike[], limit: number) {
      const search = searches.get(query);
      if (search) record(query, search.tag, statuses, limit);
    },
  };
}

interface InstanceV1Like { description?: string | null; terms?: string | null }

/**
 * `/api/v1/instance/extended_description` for servers without it (GoToSocial):
 * their v1 instance carries the long description itself.
 */
export function extendedDescriptionFromInstance(instance: InstanceV1Like) {
  return { updated_at: '', content: instance.description ?? '' };
}

/** `/api/v1/instance/terms_of_service` for servers without it: GoToSocial's v1 instance has `terms`. */
export function termsOfServiceFromInstance(instance: InstanceV1Like) {
  return { effective_date: '', effective: true, succeeded_by: null, content: instance.terms ?? '' };
}
