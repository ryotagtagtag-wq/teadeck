/**
 * In the multi-column layout upstream always renders the current route as an
 * extra column on the right, and prefixes every in-app link with `/deck`. So
 * following e.g. "Startseite" in the navigation panel opened `/deck/home` next
 * to the pinned home column: the same column twice.
 */

// Routes from features/ui/index.jsx that render the same component as a pinned column type
// (see componentMap in multi_column_content.tsx). Columns needing params (hashtag, list) are left out.
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
