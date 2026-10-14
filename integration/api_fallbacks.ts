/**
 * What Teadeck asks instead when a server lacks one of Mastodon's API calls
 * (GoToSocial, older Mastodon). The patches leave Mastodon's own functions as
 * they are and export them wrapped: `withFallback(capability, upstream,
 * fallback)` calls upstream's, and the fallback where the server is known not
 * to have it or answers 404 (api_capabilities.ts).
 */

import api, { apiRequestGet, apiRequestPatch, getLinks } from '@/mastodon/api';
import type {
  ApiExtendedDescriptionJSON,
  ApiTermsOfServiceJSON,
  ApiTranslationLanguagesJSON,
  ApiDomainBlockJSON,
} from '@/mastodon/api_types/instance';
import type { ApiAccountJSON, ApiFamiliarFollowersJSON } from '@/mastodon/api_types/accounts';
import type { ApiCollectionsJSON } from '@/mastodon/api_types/collections';
import type { ApiNotificationGroupsResultJSON, ApiNotificationJSON } from '@/mastodon/api_types/notifications';
import type { ApiProfileJSON, ApiProfileUpdateParams } from '@/mastodon/api_types/profile';
import type { ApiHashtagJSON } from '@/mastodon/api_types/tags';

import type { Capability } from './api_capabilities.ts';
import { setSupport, withCapability } from './api_capabilities.ts';
import {
  credentialsUpdateFromProfileParams,
  extendedDescriptionFromInstance,
  notificationGroupsFromNotifications,
  notificationParamsForV1,
  profileFromCredentialAccount,
  termsOfServiceFromInstance,
} from './api_compat.ts';

/** `upstream` with the same signature, falling back to `fallback` where the server lacks it. */
export function withFallback<A extends unknown[], R, F = R>(
  capability: Capability,
  upstream: (...args: A) => Promise<R>,
  fallback: (...args: NoInfer<A>) => F | Promise<F>,
): (...args: A) => Promise<R | F> {
  return (...args: A) => withCapability<R | F>(capability, () => upstream(...args), () => fallback(...args));
}

// api/instance.ts: servers without these pages (GoToSocial) carry their texts in the v1 instance.

export const termsOfServiceFallback = async (): Promise<ApiTermsOfServiceJSON> =>
  termsOfServiceFromInstance(await apiRequestGet<{ terms?: string }>('v1/instance'));

export const extendedDescriptionFallback = async (): Promise<ApiExtendedDescriptionJSON> =>
  extendedDescriptionFromInstance(await apiRequestGet<{ description?: string }>('v1/instance'));

export const noTranslationLanguages = (): ApiTranslationLanguagesJSON => ({});

export const noDomainBlocks = (): ApiDomainBlockJSON[] => [];

// api/notifications.ts: servers without grouped notifications (GoToSocial) get
// their v1 list, grouped here, one group per notification.

export const ungroupedNotifications = async (params?: { grouped_types?: string[] }) => {
  const response = await api().request<ApiNotificationJSON[]>({
    method: 'GET',
    url: '/api/v1/notifications',
    params: notificationParamsForV1(params),
  });
  const { statuses, accounts, notification_groups } = notificationGroupsFromNotifications(response.data) as unknown as ApiNotificationGroupsResultJSON;
  return { statuses, accounts, notifications: notification_groups, links: getLinks(response) };
};

// api/notification_policies.ts: without the policy API there is no policy;
// `null` keeps the policy controls and the filtered-notifications banner hidden
// instead of showing settings that cannot be saved.
export const noNotificationPolicy = () => null;

// api/collections.ts: servers without collections have none to list.
export const noCollections = (): ApiCollectionsJSON => ({ collections: [] });

// api/accounts.ts: featured tag suggestions and familiar followers are
// Mastodon's; elsewhere there are none to show.
export const noTagSuggestions = (): ApiHashtagJSON[] => [];
export const noFamiliarFollowers = (): ApiFamiliarFollowersJSON => [];

// api/accounts.ts: servers without /api/v1/profile edit it through
// update_credentials (api_compat.ts); which parts the profile API has is noted
// for the edit page.

const noteProfileParts = (profile: ApiProfileJSON) => {
  setSupport('profile.featuredTags', Array.isArray(profile.featured_tags) ? 'supported' : 'unsupported');
  setSupport('profile.tabSettings', typeof profile.show_media === 'boolean' ? 'supported' : 'unsupported');
  return profile;
};

const profileFromCredentials = async () => {
  setSupport('profile.featuredTags', 'unsupported');
  setSupport('profile.tabSettings', 'unsupported');
  return profileFromCredentialAccount(await apiRequestGet<ApiAccountJSON>('v1/accounts/verify_credentials')) as ApiProfileJSON;
};

const patchCredentials = async (params: ApiProfileUpdateParams | FormData) => {
  const body = params instanceof FormData ? params : credentialsUpdateFromProfileParams(params);
  if (!body) return profileFromCredentials();
  return profileFromCredentialAccount(await apiRequestPatch<ApiAccountJSON>('v1/accounts/update_credentials', body)) as ApiProfileJSON;
};

export const withProfileFallback = (upstream: () => Promise<ApiProfileJSON>) =>
  withFallback('profile.read', async () => noteProfileParts(await upstream()), profileFromCredentials);

export const withProfileUpdateFallback = (upstream: (params: ApiProfileUpdateParams | FormData) => Promise<ApiProfileJSON>) =>
  withFallback('profile.write', async (params: ApiProfileUpdateParams | FormData) => noteProfileParts(await upstream(params)), patchCredentials);
