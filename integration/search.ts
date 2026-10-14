/**
 * Search, made to work on servers whose search finds no posts by hashtag
 * (GoToSocial before 0.23): a "#tag" search without posts shows the hashtag
 * timeline instead, and its further pages continue there. From GoToSocial 0.23
 * the search finds those posts itself and pages by `max_id`, so the timeline is
 * not used. Wraps Mastodon's own apiGetSearch (patch 07).
 */

import { apiRequestGet } from '@/mastodon/api';
import type { ApiSearchResultsJSON, ApiSearchType } from '@/mastodon/api_types/search';
import type { ApiStatusJSON } from '@/mastodon/api_types/statuses';

import { applySearchDefaults, createHashtagSearchPages, hashtagFromQuery, withSearchIdPages } from './api_compat.ts';
import { fullTextSearchAvailable } from './server_features.ts';

interface SearchParams {
  q: string;
  resolve?: boolean;
  type?: ApiSearchType;
  limit?: number;
  offset?: number;
}
type SearchOptions = { signal?: AbortSignal };

const tagTimeline = (tag: string, params: { limit: number; max_id?: string }, options: SearchOptions) =>
  apiRequestGet<ApiStatusJSON[]>(`v1/timelines/tag/${encodeURIComponent(tag)}`, params, options);

export function withHashtagTimeline(upstream: (params: SearchParams, options?: SearchOptions) => Promise<ApiSearchResultsJSON>) {
  const hashtagSearches = createHashtagSearchPages();
  const idPaged = withSearchIdPages(upstream);

  return async (params: SearchParams, options: SearchOptions = {}): Promise<ApiSearchResultsJSON> => {
    if (fullTextSearchAvailable()) return idPaged(params, options);

    // Pasting a link into the compose form passes a URL object, not a string.
    const query = String(params.q);
    const limit = params.limit ?? 20;
    const isFirstPage = !params.offset;
    const wantsStatuses = !params.type || params.type === 'statuses';

    // Further post pages of a search answered from the hashtag timeline.
    const timelineSearch = hashtagSearches.next(query);
    if (!isFirstPage && params.type === 'statuses' && timelineSearch) {
      const statuses = timelineSearch.done ? [] : await tagTimeline(timelineSearch.tag, { limit, max_id: timelineSearch.maxId }, options);
      hashtagSearches.continue(query, statuses, limit);
      return applySearchDefaults({ statuses } as Partial<ApiSearchResultsJSON>) as ApiSearchResultsJSON;
    }

    const results = applySearchDefaults(await upstream(params, options));

    if (isFirstPage) {
      hashtagSearches.reset(query);
      const tag = hashtagFromQuery(query);
      if (tag && wantsStatuses && results.statuses.length === 0) {
        // If the timeline fails, keep the accounts and hashtags the search found.
        const statuses = await tagTimeline(tag, { limit }, options).catch(() => undefined);
        if (statuses) {
          results.statuses = statuses;
          hashtagSearches.start(query, tag, statuses, limit);
        }
      }
    }

    return results;
  };
}
