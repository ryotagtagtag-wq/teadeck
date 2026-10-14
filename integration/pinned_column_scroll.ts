import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { getColumnSkipLinkId } from '@/mastodon/features/ui/components/skip_links';

import { pinnedColumnIndexForPath } from './pinned_columns.ts';

/**
 * In the multi-column layout: the pinned column for the current route (or -1),
 * scrolled into view instead of opening the route as an extra column.
 */
export function usePinnedColumnIndex(pinnedColumnIds: string[]): number {
  const { pathname } = useLocation();
  const pinnedIndex = pinnedColumnIndexForPath(pathname, pinnedColumnIds);

  useEffect(() => {
    if (pinnedIndex < 0) return;
    document
      .getElementById(getColumnSkipLinkId(pinnedIndex))
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [pinnedIndex]);

  return pinnedIndex;
}
