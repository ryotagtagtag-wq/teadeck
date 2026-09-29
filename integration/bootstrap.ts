import type { InitialState } from '../mastodon/initial_state';

import { adoptSession, finishLogin, getSession, login, logout, request } from './session';
import {
  accountKey, clearActiveAccountKey, getActiveAccountKey, listRememberedAccounts, readPreference,
  readSettings, rememberAccount, setAccountId, setActiveAccountKey,
} from './storage';
import { forgetAndLogout } from './logout';
import type { RememberedAccount } from './storage';
import { startHomeTimelinePolling } from './polling';
import { detectGoToSocial, loadAccountInteractionDefaults, supportsStatusFormat } from './gotosocial';
import type { DefaultInteractionPolicies } from './gotosocial';
import { initCapabilities, setSupport, support } from './api_capabilities';
import { defaultFrontendSettings, frontendSettingsKey, frontendSettingsMeta, layoutStartPath, readDeploymentDefaults, resolveFrontendSettings } from './frontend_settings';
import { withFilterBarDefault } from './notification_settings';
import { applyAppearance, lastAppearance, lastLocale } from './appearance';
import { brandLogoMarkup, setBrandLogo } from './brand_logo';
import { resolveLocale } from './ui_locale';
import { applyDocumentLanguage, shellLocale, t, translateShell } from './shell_i18n';
import { ShellError } from './shell_strings';
import type { ShellMessageId } from './shell_strings';
import { stripAxiosUserAgent } from './fetch_patch';
import { reloadOnStaleChunks } from './update_reload';
import { applyWaitingUpdate, enableOffline } from './offline';
import './shell.css';
// Teadeck's own designs; only active with data-teadeck-theme (see appearance.ts).
import './themes.css';

// Before the first API request.
window.fetch = stripAxiosUserAgent(window.fetch.bind(window));
reloadOnStaleChunks();

const shell = document.getElementById('teadeck-shell')!;
const status = document.getElementById('teadeck-status')!;
const form = document.getElementById('teadeck-login') as HTMLFormElement;
const instanceInput = document.getElementById('teadeck-instance') as HTMLInputElement;
const rememberInput = document.getElementById('teadeck-remember') as HTMLInputElement;
const accountList = document.getElementById('teadeck-account-list')!;
const accountItems = accountList.querySelector('ul')!;
const loading = document.getElementById('teadeck-loading')!;
const loginPath = '/login';

/** The page's texts in the reader's language; awaited before the shell is shown. */
let shellText: Promise<void> = Promise.resolve();

/** Offers a downloaded new version until the user reloads. */
function offerUpdate(apply: () => void) {
  document.getElementById('teadeck-update')!.hidden = false;
  document.getElementById('teadeck-update-reload')!.onclick = apply;
}

/** What this installation configured. */
const deploymentLogo = () => fetch('/logo.svg').then((response) => (response.ok ? response.text() : null), () => null);
const deploymentDefaults = () => fetch('/teadeck.json')
  .then((response) => (response.ok ? response.json() : null), () => null)
  .then((value: unknown) => readDeploymentDefaults(value));

function showShellLogo() {
  const container = document.getElementById('teadeck-shell-logo');
  const markup = brandLogoMarkup('teadeck-shell-logo');
  if (!container || !markup) return;
  container.innerHTML = markup;
  container.hidden = false;
}

/** The sign-in page, at its own address like Mastodon's /auth/sign_in. */
async function showLogin() {
  await shellText;
  if (location.pathname !== loginPath) history.replaceState(null, '', loginPath);
  loading.hidden = true;
  document.getElementById('mastodon')!.hidden = true;
  shell.hidden = false;
}

function setStatus(text: string, kind: 'alert' | 'warning' | 'notice') {
  status.className = `flash-message ${kind}`;
  status.textContent = text;
  delete status.dataset.teadeckText;
}

/** Marked with its message id, so it is translated once the language has loaded. */
function setStatusMessage(id: ShellMessageId, kind: 'alert' | 'warning' | 'notice', detail?: string) {
  setStatus(detail ? `${t(id)} (${detail})` : t(id), kind);
  if (!detail) status.dataset.teadeckText = id;
}

function showError(error: unknown) {
  if (error instanceof ShellError) setStatusMessage(error.id, 'alert', error.detail);
  else setStatus(error instanceof Error ? error.message : String(error), 'alert');
  form.querySelector('button')!.disabled = false;
  void showLogin();
}

/** The sign-in is still valid, only the server failed: offer to try again. */
async function showStartFailed(error: unknown) {
  setStatusMessage('errorStartFailed', 'alert', error instanceof ShellError ? error.detail : undefined);
  await shellText;
  form.hidden = true;
  accountList.hidden = true;
  document.getElementById('teadeck-start-failed')!.hidden = false;
  loading.hidden = true;
  document.getElementById('mastodon')!.hidden = true;
  shell.hidden = false;
}

function failStart(error: unknown) {
  // Unreachable, timed out or a server error; a rejected token is errorSessionInvalid.
  const serverFailed = !(error instanceof ShellError) || error.id === 'errorServer';
  if (getSession() && serverFailed) void showStartFailed(error);
  else showError(error);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  form.querySelector('button')!.disabled = true;
  setStatusMessage('connecting', 'notice');
  void login(instanceInput.value, { remember: rememberInput.checked }).catch(showError);
});

for (const button of document.querySelectorAll('.teadeck-sign-out')) {
  button.addEventListener('click', () => { void forgetAndLogout().catch(showError); });
}
document.getElementById('teadeck-retry')!.addEventListener('click', () => location.reload());

/** One-click entries for remembered accounts. */
function renderAccountList(accounts: RememberedAccount[]) {
  accountItems.replaceChildren();
  accountList.hidden = accounts.length === 0;
  for (const account of accounts) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn button-secondary';
    button.textContent = `${account.acct} · ${new URL(account.origin).host}`;
    button.addEventListener('click', () => {
      adoptSession(account);
      setActiveAccountKey(accountKey(account.origin, account.accountId));
      location.assign('/');
    });
    item.append(button);
    accountItems.append(item);
  }
}

async function boot() {
  if (location.pathname === '/logout') return logout();
  if (await applyWaitingUpdate().catch(() => false)) return;
  // Awaited where something is shown; a signed-in account's language replaces it below.
  shellText = translateShell(shellLocale(lastLocale()));
  const notice = sessionStorage.getItem('teadeck.notice');
  if (notice) { setStatusMessage(notice as ShellMessageId, 'warning'); sessionStorage.removeItem('teadeck.notice'); }
  if (location.pathname === '/oauth/callback') await finishLogin();

  let session = getSession();
  // null: the store could not be read, which says nothing about which accounts it holds.
  const remembered = await listRememberedAccounts()
    .catch(() => new Promise((resolve) => setTimeout(resolve, 250)).then(listRememberedAccounts))
    .catch(() => null);
  if (!session) {
    // A new tab: resume a "stay signed in" account.
    const activeKey = getActiveAccountKey();
    const account = activeKey ? remembered?.find(a => accountKey(a.origin, a.accountId) === activeKey) : undefined;
    if (account) {
      adoptSession(account);
      session = getSession();
    } else if (activeKey && remembered) {
      // Only an account that is really gone is forgotten.
      clearActiveAccountKey();
    }
  }
  if (!session) {
    const [deployment, logo] = await Promise.all([deploymentDefaults(), deploymentLogo()]);
    setBrandLogo(logo);
    showShellLogo();
    // The design last used here, otherwise the one this installation starts with.
    const appearance = { ...deployment, ...readDeploymentDefaults(lastAppearance()) };
    applyAppearance(defaultFrontendSettings({}, matchMedia('(prefers-reduced-motion: reduce)').matches, appearance), shellLocale(lastLocale()));
    renderAccountList(remembered ?? []);
    await showLogin();
    void enableOffline(offerUpdate).catch(() => {});
    return;
  }
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
  const locale = resolveLocale(readPreference('locale', null), navigator.languages ?? [navigator.language]);
  applyDocumentLanguage(locale);
  // The update notice is shown in the running app too, so it follows the account's language.
  shellText = translateShell(locale);
  applyAppearance(frontendSettings, locale);
  setBrandLogo(logo);

  initCapabilities(session.origin, instance);
  // GoToSocial: a post restricting replies copies the other defaults from these.
  if (detectGoToSocial(instance) && support('interactionPolicies.defaults') !== 'unsupported') {
    loadAccountInteractionDefaults(() => request('/api/v1/interaction_policies/defaults').then((defaults: DefaultInteractionPolicies) => {
      setSupport('interactionPolicies.defaults', 'supported');
      return defaults;
    }, (error: unknown) => {
      if (!(error instanceof Error && error.message.includes('HTTP 404'))) throw error;
      setSupport('interactionPolicies.defaults', 'unsupported');
      return null;
    }));
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
    // Read by patches (compose_form_container.js) to show GoToSocial-only controls.
    meta: InitialState['meta'] & { teadeck_gotosocial: boolean; teadeck_privacy_policy: boolean; teadeck_status_content_type: string; teadeck_status_format: boolean };
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
      repository: 'knubbel/teadeck', source_url: 'https://git.knubbel.me/knubbel/teadeck',
      search_enabled: true, trends_enabled: true, show_trends: true,
      single_user_mode: false, custom_app_icon: null, landing_page: 'about',
      local_live_feed_access: 'authenticated', remote_live_feed_access: 'authenticated',
      local_topic_feed_access: 'authenticated', remote_topic_feed_access: 'authenticated',
      sso_redirect: '', status_page_url: '', terms_of_service_enabled: Boolean(instance.configuration?.urls?.terms_of_service),
      teadeck_gotosocial: detectGoToSocial(instance),
      teadeck_status_format: supportsStatusFormat(instance),
      // GoToSocial: what this account writes posts in unless a post says otherwise.
      teadeck_status_content_type: typeof account.source?.status_content_type === 'string' ? account.source.status_content_type : '',
      // Only link to pages the instance has.
      teadeck_privacy_policy: Boolean(instance.configuration?.urls?.privacy_policy),
    },
  };
  document.getElementById('initial-state')!.textContent = JSON.stringify(state);
  if (location.pathname === '/' || location.pathname === '/oauth/callback' || location.pathname === loginPath) {
    history.replaceState(null, '', layoutStartPath(advancedLayout));
  }
  document.querySelector('meta[name="initialPath"]')!.setAttribute('content', location.pathname);

  // Initial state is read when upstream modules are evaluated, so import only now.
  const [{ loadPolyfills }, { loadLocale }, { default: main }, { store }, { expandHomeTimeline }] = await Promise.all([
    import('../mastodon/polyfills'), import('../mastodon/locales'), import('../mastodon/main'),
    import('../mastodon/store'), import('../mastodon/actions/timelines'),
  ]);
  await loadPolyfills();
  await loadLocale();
  document.body.classList.add('app-body', 'teadeck-connected');
  document.getElementById('mastodon')!.hidden = false;
  await main();
  loading.hidden = true;
  shell.hidden = true;
  if (!streamingUrl) startHomeTimelinePolling(store.dispatch, expandHomeTimeline);
  void enableOffline(offerUpdate).catch((error: unknown) => console.warn('Offline mode unavailable', error));
}

void boot().catch(failStart);
