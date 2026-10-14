/**
 * Teadeck's own sign-in page ("shell", index.html): its texts, messages and
 * errors, the remembered accounts, the logo and the update offer. Shown until
 * app_start.ts hands over to Mastodon.
 */
import { takeNotice } from './browser_storage.ts';
import { adoptSession, getSession, login } from './session.ts';
import { accountKey, setActiveAccountKey } from './storage.ts';
import type { RememberedAccount } from './storage.ts';
import { forgetAndLogout } from './logout.ts';
import { enableOffline } from './offline.ts';
import { applyAppearance, lastAppearance, lastLocale, rememberLocale } from './appearance.ts';
import { defaultFrontendSettings, readDeploymentDefaults } from './frontend_settings.ts';
import { brandLogoMarkup, setBrandLogo } from './brand_logo.tsx';
import { shellLocale, t, translateShell } from './i18n.ts';
import { setUpLanguagePicker } from './shell_language.ts';
import { ShellError } from './texts.ts';
import type { TextId } from './texts.ts';
import type { UiLocale } from './ui_locale.ts';

const shell = document.getElementById('teadeck-shell')!;
const status = document.getElementById('teadeck-status')!;
const form = document.getElementById('teadeck-login') as HTMLFormElement;
const instanceInput = document.getElementById('teadeck-instance') as HTMLInputElement;
const rememberInput = document.getElementById('teadeck-remember') as HTMLInputElement;
const accountList = document.getElementById('teadeck-account-list')!;
const accountItems = accountList.querySelector('ul')!;
const loading = document.getElementById('teadeck-loading')!;
export const loginPath = '/login';

/** The page's texts in the reader's language; awaited before the shell is shown. */
let shellText: Promise<void> = Promise.resolve();

/** Translates the page's texts; the shell waits for them before it is shown. */
export function translateShellPage(locale: UiLocale) {
  shellText = translateShell(locale);
}

/** Resolves once the page's texts in the latest language are loaded. */
export function shellTextReady(): Promise<void> {
  return shellText;
}

/** Offers a downloaded new version until the user reloads. */
export function offerUpdate(apply: () => void) {
  document.getElementById('teadeck-update')!.hidden = false;
  document.getElementById('teadeck-update-reload')!.onclick = apply;
}

/** What this installation configured. */
export const deploymentLogo = () => fetch('/logo.svg').then((response) => (response.ok ? response.text() : null), () => null);
export const deploymentDefaults = () => fetch('/teadeck.json')
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

/** Shows Mastodon's frame while the app starts. */
export function showMastodonFrame() {
  document.getElementById('mastodon')!.hidden = false;
}

/** Hides the sign-in page once the app is running. */
export function hideShell() {
  loading.hidden = true;
  shell.hidden = true;
}

function setStatus(text: string, kind: 'alert' | 'warning' | 'notice') {
  status.className = `flash-message ${kind}`;
  status.textContent = text;
  delete status.dataset.teadeckText;
}

/** Marked with its message id, so it is translated once the language has loaded. */
function setStatusMessage(id: TextId, kind: 'alert' | 'warning' | 'notice', detail?: string) {
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

export function failStart(error: unknown) {
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

/** Sets up the sign-in page's language and shows a notice left by the last visit. */
export function initShell() {
  // Awaited where something is shown; a signed-in account's language replaces it later.
  translateShellPage(shellLocale(lastLocale()));
  setUpLanguagePicker(document.getElementById('teadeck-shell-language') as HTMLSelectElement, shellLocale(lastLocale()), (chosen) => {
    rememberLocale(chosen);
    translateShellPage(chosen);
  });
  const notice = takeNotice();
  if (notice) setStatusMessage(notice as TextId, 'warning');
}

/** The sign-in page for a visitor without a session. */
export async function showSignIn(remembered: RememberedAccount[] | null) {
  const [deployment, logo] = await Promise.all([deploymentDefaults(), deploymentLogo()]);
  setBrandLogo(logo);
  showShellLogo();
  // The design last used here, otherwise the one this installation starts with.
  const appearance = { ...deployment, ...readDeploymentDefaults(lastAppearance()) };
  applyAppearance(defaultFrontendSettings({}, matchMedia('(prefers-reduced-motion: reduce)').matches, appearance), shellLocale(lastLocale()));
  renderAccountList(remembered ?? []);
  await showLogin();
  void enableOffline(offerUpdate).catch(() => {});
}
