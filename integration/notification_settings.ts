import { asRecord } from './frontend_settings.ts';

/** Which notification types the Notifications column shows (upstream's `settings.notifications.shows`). */
export type NotificationType = 'follow' | 'follow_request' | 'reblog' | 'favourite' | 'mention' | 'quote';

const notificationTypes: NotificationType[] = ['follow', 'follow_request', 'reblog', 'favourite', 'mention', 'quote'];

export type NotificationShows = Record<NotificationType, boolean>;

/** Upstream's defaults. */
export const defaultNotificationShows: NotificationShows = {
  follow: true,
  follow_request: false,
  reblog: true,
  favourite: true,
  mention: true,
  quote: true,
};

export function readNotificationShows(settings: Record<string, unknown>): NotificationShows {
  const shows = asRecord(asRecord(settings.notifications).shows);
  const resolved = { ...defaultNotificationShows };
  for (const type of notificationTypes) {
    const value = shows[type];
    if (typeof value === 'boolean') resolved[type] = value;
  }
  return resolved;
}

/**
 * Shows all notification filter categories by default. Upstream stores its
 * defaults along with every change, so a stored `advanced: false` is no choice;
 * the full bar is switched on once and a marker lets later choices win.
 */
const fullBarApplied = 'teadeckFullBar';

export function withFilterBarDefault(settings: Record<string, unknown>): Record<string, unknown> {
  const notifications = asRecord(settings.notifications);
  const quickFilter = asRecord(notifications.quickFilter);
  if (quickFilter[fullBarApplied] === true) return settings;
  return {
    ...settings,
    notifications: { ...notifications, quickFilter: { ...quickFilter, advanced: true, [fullBarApplied]: true } },
  };
}
