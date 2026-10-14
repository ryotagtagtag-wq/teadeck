/**
 * Features of Mastodon that other servers do not have, so Teadeck does not
 * offer them there. GoToSocial is known not to; elsewhere a 404 tells.
 */

import { initialState } from '@/mastodon/initial_state';

import { support } from './api_capabilities.ts';

function isGoToSocial(): boolean {
  return Boolean((initialState?.meta as { teadeck_gotosocial?: boolean } | undefined)?.teadeck_gotosocial);
}

/** Collections of accounts (Mastodon 4.6). */
export function collectionsAvailable(): boolean {
  return !isGoToSocial() && support('collections') !== 'unsupported';
}
