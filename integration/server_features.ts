/**
 * What the signed-in server offers beyond what every Mastodon-compatible server
 * has. Known from its instance data at start (app_start.ts calls
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
  /** Posts can be written as plain text or Markdown (`content_type`). */
  statusFormat: boolean;
  /** What this account writes posts in unless a post says otherwise (GoToSocial). */
  accountContentType: string;
  /** The server has a privacy policy to link to. */
  privacyPolicy: boolean;
}

/**
 * Whether the server calls itself GoToSocial. `source_url` is checked too, since
 * GoToSocial can report a Mastodon version. Only for branding texts (isGoToSocial);
 * what the server can do is asked of the API (api_capabilities.ts), so a fork or
 * another server with the same API gets the same features.
 */
function detectGoToSocial(instance: InstanceLike): boolean {
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
    statusFormat: supportsStatusFormat(instance),
    accountContentType: typeof contentType === 'string' ? contentType : '',
    privacyPolicy: Boolean(instance.configuration?.urls?.privacy_policy),
  };
}

let current: ServerFeatures = { statusFormat: false, accountContentType: '', privacyPolicy: false };
let branded = false;

export function setServerFeatures(features: ServerFeatures) {
  current = features;
}

/**
 * Branding only: whether the server names itself GoToSocial, for the texts that
 * say Mastodon or GoToSocial (patches/08-brand-logo.patch). Features never depend on it.
 */
export function setServerBranding(instance: InstanceLike) {
  branded = detectGoToSocial(instance);
}
export const isGoToSocial = () => branded;
export const statusFormatAvailable = () => current.statusFormat;
export const accountStatusContentType = () => current.accountContentType;
export const privacyPolicyAvailable = () => current.privacyPolicy;

/** Collections of accounts (Mastodon 4.6): app_start.ts probes them; a 404 means the server has none. */
export function collectionsAvailable(): boolean {
  return support('collections') !== 'unsupported';
}

/** Whether the server publishes which servers it restricts; a 404 says it does not (api_fallbacks.ts). */
export function domainBlocksAvailable(): boolean {
  return support('instance.domainBlocks') !== 'unsupported';
}
