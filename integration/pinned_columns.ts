// In the multi-column layout the current route is shown as an extra column, so
// following a link to a pinned column's route showed that column twice.
// Routes per pinned column type; columns with parameters (hashtag, list) are left out.
const columnRoutes: Record<string, string[]> = {
  HOME: ['/home', '/timelines/home'],
  NOTIFICATIONS: ['/notifications'],
  PUBLIC: ['/public'],
  COMMUNITY: ['/public/local'],
  REMOTE: ['/public/remote'],
  DIRECT: ['/conversations', '/timelines/direct'],
  FAVOURITES: ['/favourites'],
  BOOKMARKS: ['/bookmarks'],
  DIRECTORY: ['/directory'],
};

/** Index of the pinned column the route would duplicate, or -1. */
export function pinnedColumnIndexForPath(pathname: string, pinnedColumnIds: string[]): number {
  const route = pathname.replace(/^\/deck(?=\/|$)/, '').replace(/\/+$/, '') || '/';
  return pinnedColumnIds.findIndex(id => columnRoutes[id]?.includes(route));
}
