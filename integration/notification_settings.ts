/**
 * Which notification types create an entry in the Notifications column at
 * all. This is upstream's own `settings.notifications.shows` local state
 * (`selectSettingsNotificationsExcludedTypes` turns the ones set to `false`
 * into `exclude_types` when fetching notifications) — nothing server-side,
 * so it belongs next to `frontend_settings.ts` rather than needing a patch.
 * Restricted here to the types a non-admin account can actually receive.
 */
export type NotificationType = 'follow' | 'follow_request' | 'reblog' | 'favourite' | 'mention' | 'quote';

export const notificationTypes: NotificationType[] = ['follow', 'follow_request', 'reblog', 'favourite', 'mention', 'quote'];

export type NotificationShows = Record<NotificationType, boolean>;

/** Upstream's own defaults (`reducers/settings.js`'s initial `notifications.shows`). */
export const defaultNotificationShows: NotificationShows = {
  follow: true,
  follow_request: false,
  reblog: true,
  favourite: true,
  mention: true,
  quote: true,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads out of the same `settings` blob `readSettings()`/`saveSettings()` handle. */
export function readNotificationShows(settings: Record<string, unknown>): NotificationShows {
  const notifications = isPlainObject(settings.notifications) ? settings.notifications : {};
  const shows = isPlainObject(notifications.shows) ? notifications.shows : {};
  const resolved = { ...defaultNotificationShows };
  for (const type of notificationTypes) {
    const value = shows[type];
    if (typeof value === 'boolean') resolved[type] = value;
  }
  return resolved;
}

/** Merges into the `settings` blob without touching its other keys (columns, home filters, …). */
export function withNotificationShows(settings: Record<string, unknown>, shows: NotificationShows): Record<string, unknown> {
  const notifications = isPlainObject(settings.notifications) ? settings.notifications : {};
  const existingShows = isPlainObject(notifications.shows) ? notifications.shows : {};
  return {
    ...settings,
    notifications: {
      ...notifications,
      shows: { ...existingShows, ...shows },
    },
  };
}

/**
 * Teadeck shows every filter category in the notifications column from the
 * start. Upstream keeps all but "All" and "Mentions" behind a switch ("Show all
 * filter categories" in the column settings), which fits a page where
 * notifications are one view among many. Here the column usually stands open
 * next to the timeline, and sorting by kind is what it is there for.
 *
 * A stored `advanced: false` does not mean someone turned the bar off: upstream
 * saves its whole settings state on every change, its own defaults included.
 * So the full bar is switched on once, and a marker stored alongside it lets
 * every later choice - the short bar included - win from then on.
 */
const fullBarApplied = 'teadeckFullBar';

export function withFilterBarDefault(settings: Record<string, unknown>): Record<string, unknown> {
  const notifications = isPlainObject(settings.notifications) ? settings.notifications : {};
  const quickFilter = isPlainObject(notifications.quickFilter) ? notifications.quickFilter : {};
  if (quickFilter[fullBarApplied] === true) return settings;
  return {
    ...settings,
    notifications: { ...notifications, quickFilter: { ...quickFilter, advanced: true, [fullBarApplied]: true } },
  };
}
