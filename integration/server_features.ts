/**
 * What the signed-in server offers beyond what every Mastodon-compatible server
 * has. Known from its instance data at start (bootstrap.ts calls
 * setServerFeatures), or from the API itself (api_capabilities.ts). Everything
 * else asks here.
 */

import { support } from './api_capabilities.ts';

interface InstanceLike {
  version?: string;
  source_url?: string;
  configuration?: {
    statuses?: { supported_mime_types?: unknown };
    urls?: { privacy_policy?: unknown };
  };
}

export interface ServerFeatures {
  /** GoToSocial: its "who can reply" policies, and no Mastodon-only features. */
  goToSocial: boolean;
  /** Posts can be written as plain text or Markdown (`content_type`). */
  statusFormat: boolean;
  /** What this account writes posts in unless a post says otherwise (GoToSocial). */
  accountContentType: string;
  /** The server has a privacy policy to link to. */
  privacyPolicy: boolean;
}

/**
 * Whether the server is GoToSocial. `source_url` is checked too, since
 * GoToSocial can report a Mastodon version.
 */
export function detectGoToSocial(instance: InstanceLike): boolean {
  const haystack = `${instance.source_url ?? ''} ${instance.version ?? ''}`.toLowerCase();
  return haystack.includes('gotosocial');
}

/** The format switch needs both formats advertised. */
export function supportsStatusFormat(instance: InstanceLike): boolean {
  const types = instance.configuration?.statuses?.supported_mime_types;
  return Array.isArray(types) && types.includes('text/markdown') && types.includes('text/plain');
}

export function detectServerFeatures(instance: InstanceLike, account: { source?: { status_content_type?: unknown } }): ServerFeatures {
  const contentType = account.source?.status_content_type;
  return {
    goToSocial: detectGoToSocial(instance),
    statusFormat: supportsStatusFormat(instance),
    accountContentType: typeof contentType === 'string' ? contentType : '',
    privacyPolicy: Boolean(instance.configuration?.urls?.privacy_policy),
  };
}

let current: ServerFeatures = { goToSocial: false, statusFormat: false, accountContentType: '', privacyPolicy: false };

export function setServerFeatures(features: ServerFeatures) {
  current = features;
}

export const isGoToSocial = () => current.goToSocial;
export const statusFormatAvailable = () => current.statusFormat;
export const accountStatusContentType = () => current.accountContentType;
export const privacyPolicyAvailable = () => current.privacyPolicy;

/** Collections of accounts (Mastodon 4.6): GoToSocial is known not to have them; elsewhere a 404 tells. */
export function collectionsAvailable(): boolean {
  return !current.goToSocial && support('collections') !== 'unsupported';
}
