/**
 * Starting Mastodon for a signed-in session: the account, its server and its
 * settings, the initial state Mastodon's server would render, then Mastodon
 * itself.
 */
import type { InitialState } from '@/mastodon/initial_state';

import { request } from './session.ts';
import type { Session } from './session.ts';
import {
  accountKey, readPreference, readSettings, rememberAccount, setAccountId, setActiveAccountKey,
} from './storage.ts';
import { startHomeTimelinePolling } from './polling.ts';
import { loadAccountInteractionDefaults } from './reply_audience.ts';
import type { DefaultInteractionPolicies } from './reply_audience.ts';
import { detectServerFeatures, setServerBranding, setServerFeatures } from './server_features.ts';
import { initCapabilities, setSupport, support, withCapability } from './api_capabilities.ts';
import { defaultFrontendSettings, frontendSettingsKey, frontendSettingsMeta, layoutStartPath, resolveFrontendSettings } from './frontend_settings.ts';
import { withFilterBarDefault } from './notification_settings.ts';
import { applyAppearance, lastLocale } from './appearance.ts';
import { setBrandLogo } from './brand_logo.tsx';
import { resolveLocale } from './ui_locale.ts';
import { applyDocumentLanguage } from './i18n.ts';
import { enableOffline } from './offline.ts';
import { ShellError } from './texts.ts';
import {
  deploymentDefaults, deploymentLogo, hideShell, loginPath, offerUpdate, shellTextReady,
  showMastodonFrame, translateShellPage,
} from './shell.ts';

/** Starts Mastodon for a signed-in session. */
export async function startApp(session: Session) {
  document.getElementById('teadeck-reset')!.hidden = false;

  const [instance, account, preferences, logo, deployment] = await Promise.all([
    request('/api/v2/instance'),
    request('/api/v1/accounts/verify_credentials'),
    request('/api/v1/preferences').catch(() => ({})),
    deploymentLogo(),
    deploymentDefaults(),
  ]);
  if (typeof account.id !== 'string' || typeof account.acct !== 'string' ||
      typeof instance.version !== 'string') {
    throw new ShellError('errorAccountData');
  }
  setAccountId(account.id);
  const activeKey = accountKey(session.origin, account.id);
  if (session.remember) {
    await rememberAccount({
      origin: session.origin, accountId: account.id, acct: account.acct,
      accessToken: session.accessToken, clientId: session.clientId, clientSecret: session.clientSecret,
      addedAt: Date.now(),
    });
    setActiveAccountKey(activeKey);
  }
  const advancedLayout = readPreference('advancedLayout', false);
  const frontendSettings = resolveFrontendSettings(
    readPreference(frontendSettingsKey, {}),
    defaultFrontendSettings(preferences, matchMedia('(prefers-reduced-motion: reduce)').matches, deployment),
  );
  // An account without a language of its own takes the one chosen on the sign-in page.
  const locale = resolveLocale(readPreference('locale', null) ?? lastLocale(), navigator.languages ?? [navigator.language]);
  applyDocumentLanguage(locale);
  // The update notice is shown in the running app too, so it follows the account's language.
  translateShellPage(locale);
  applyAppearance(frontendSettings, locale);
  setBrandLogo(logo);

  initCapabilities(session.origin, instance);
  setServerBranding(instance);
  setServerFeatures(detectServerFeatures(instance, account));
  // Probed, not read from the server's name: a post restricting replies copies the other
  // defaults from these. Not waited for; the reply audience menu follows the answer.
  if (support('interactionPolicies.defaults') !== 'unsupported') {
    loadAccountInteractionDefaults(() => request('/api/v1/interaction_policies/defaults').then((defaults: DefaultInteractionPolicies) => {
      setSupport('interactionPolicies.defaults', 'supported');
      return defaults;
    }, (error: unknown) => {
      // A missing endpoint means the server has no such defaults; other failures are retried.
      if (!(error instanceof ShellError && error.status === 404)) throw error;
      setSupport('interactionPolicies.defaults', 'unsupported');
      return null;
    }));
  }
  // Collections decide the account menu, which renders early, so they are probed here too.
  if (support('collections') === 'unknown') {
    void withCapability('collections', () => request(`/api/v1/accounts/${account.id}/collections`), () => null)
      .catch((error: unknown) => console.warn('Collections unavailable', error));
  }
  let streamingUrl = '';
  if (instance.configuration?.urls?.streaming) {
    const url = new URL(instance.configuration.urls.streaming);
    if (url.protocol === 'wss:' && !url.username && !url.password && !url.search && !url.hash) {
      streamingUrl = url.href.replace(/\/$/, '');
    }
  }

  const state: InitialState & {
    settings: Record<string, unknown>;
    media_attachments: unknown;
  } = {
    accounts: { [account.id]: account },
    languages: [['en', 'English', 'English'], ['de', 'German', 'Deutsch']],
    compose: {
      text: '', me: account.id,
      default_privacy: preferences['posting:default:visibility'] ?? account.source?.privacy ?? 'private',
      default_sensitive: preferences['posting:default:sensitive'] ?? account.source?.sensitive ?? false,
      default_language: preferences['posting:default:language'] ?? account.source?.language ?? locale,
    },
    settings: withFilterBarDefault(readSettings()),
    media_attachments: { accept_content_types: instance.configuration?.media_attachments?.supported_mime_types ?? [] },
    features: [],
    meta: {
      access_token: session.accessToken, me: account.id,
      domain: instance.domain ?? new URL(session.origin).host,
      title: instance.title ?? 'Teadeck', version: instance.version,
      locale, advanced_layout: advancedLayout,
      streaming_api_base_url: streamingUrl,
      activity_api_enabled: false, admin: '',
      ...frontendSettingsMeta(frontendSettings),
      limited_federation_mode: false, mascot: null, profile_directory: true,
      registrations_open: instance.registrations?.enabled ?? false,
      repository: 'teadeck/teadeck', source_url: 'https://git.knubbel.me/teadeck/teadeck',
      search_enabled: true, trends_enabled: true, show_trends: true,
      single_user_mode: false, custom_app_icon: null, landing_page: 'about',
      local_live_feed_access: 'authenticated', remote_live_feed_access: 'authenticated',
      local_topic_feed_access: 'authenticated', remote_topic_feed_access: 'authenticated',
      sso_redirect: '', status_page_url: '', terms_of_service_enabled: Boolean(instance.configuration?.urls?.terms_of_service),
    },
  };
  document.getElementById('initial-state')!.textContent = JSON.stringify(state);
  if (location.pathname === '/' || location.pathname === '/oauth/callback' || location.pathname === loginPath) {
    history.replaceState(null, '', layoutStartPath(advancedLayout));
  }
  document.querySelector('meta[name="initialPath"]')!.setAttribute('content', location.pathname);

  // Initial state is read when upstream modules are evaluated, so import only now.
  const [{ loadPolyfills }, { loadLocale }, { default: main }, { store }, { expandHomeTimeline }] = await Promise.all([
    import('@/mastodon/polyfills'), import('@/mastodon/locales'), import('@/mastodon/main'),
    import('@/mastodon/store'), import('@/mastodon/actions/timelines'),
  ]);
  await loadPolyfills();
  await loadLocale();
  // Teadeck's own texts in the account's language, before anything shows them.
  await shellTextReady();
  document.body.classList.add('app-body', 'teadeck-connected');
  showMastodonFrame();
  await main();
  hideShell();
  if (!streamingUrl) startHomeTimelinePolling(store.dispatch, expandHomeTimeline);
  void enableOffline(offerUpdate).catch((error: unknown) => console.warn('Offline mode unavailable', error));
}
