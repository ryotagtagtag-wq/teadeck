/**
 * The texts of the sign-in page, in every interface language Teadeck offers.
 *
 * The page runs before Mastodon's application - and therefore before its
 * translations - is loaded, so it carries its own small catalogue. Two sources
 * fill it (scripts/shell_locales.mjs, at build time):
 *
 * - `upstream`: the key of a message Mastodon itself already ships translated
 *   into every one of its locales ("Log in", "Domain", "Refresh", …). Anything
 *   that exists there is taken from there, so these words read exactly as they
 *   do in the rest of the interface and follow upstream when it changes.
 * - `de`/`en`: the sentences that are Teadeck's own. English is the source text
 *   and also the fallback: a language without a translation shows English
 *   rather than an empty page.
 *
 * `en` is what index.html contains literally, so the page reads correctly
 * before any translation is loaded (and without JavaScript at all).
 */

export type ShellMessage = {
  /** Source text; also the fallback for every language without a translation. */
  en: string;
  /** Teadeck's own German translation, where the text is not upstream's. */
  de?: string;
  /**
   * A message upstream already translates, as `js:<key>` for
   * app/javascript/mastodon/locales/*.json or `yml:<key>` for
   * config/locales/*.yml. Checked against upstream's English files by
   * tests/shell_i18n.test.mjs, so a renamed key fails the tests instead of
   * silently leaving the page English.
   */
  upstream?: string;
};

export const shellMessages = {
  loading: { en: 'Loading…', upstream: 'js:loading_indicator.label' },
  signIn: { en: 'Log in', upstream: 'yml:auth.login' },
  lead: {
    en: 'Sign in with your account on a Mastodon or GoToSocial server.',
    de: 'Melde dich mit deinem Konto auf einer Mastodon- oder GoToSocial-Instanz an.',
  },
  domain: { en: 'Domain', upstream: 'yml:admin.accounts.domain' },
  staySignedIn: { en: 'Stay signed in', de: 'Angemeldet bleiben' },
  staySignedInHint: {
    en: 'Stay signed in in new tabs and after closing the browser.',
    de: 'Auch in neuen Tabs und nach dem Schließen des Browsers angemeldet bleiben.',
  },
  signOut: { en: 'Logout', upstream: 'yml:auth.logout' },
  continueAs: { en: 'Continue as', de: 'Weiter als' },
  sourceCode: { en: 'View source code', upstream: 'js:footer.source_code' },

  connecting: { en: 'Connecting…', de: 'Verbinde …' },
  retry: { en: 'Try again', upstream: 'js:bundle_column_error.retry' },

  updateTitle: { en: 'New version', de: 'Neue Version' },
  updateBody: { en: 'A new version of Teadeck is ready.', de: 'Eine neue Version von Teadeck ist bereit.' },
  updateReload: { en: 'Refresh', upstream: 'js:refresh' },

  errorInstanceUrl: {
    en: 'Enter an HTTPS address of a server, without a path or credentials.',
    de: 'Bitte eine HTTPS-Instanz ohne Pfad oder Zugangsdaten angeben.',
  },
  errorSignInAgain: { en: 'Please sign in again.', de: 'Bitte erneut anmelden.' },
  errorApiUnsupported: {
    en: 'Teadeck does not support this API address.',
    de: 'Diese API-Adresse wird von Teadeck nicht unterstützt.',
  },
  errorSessionInvalid: {
    en: 'This login is no longer valid. Please sign out and sign in again.',
    de: 'Die Anmeldung ist ungültig. Bitte abmelden und erneut anmelden.',
  },
  errorAppRegistration: {
    en: 'The server could not register an application.',
    de: 'Die Instanz konnte keine Anwendung registrieren.',
  },
  errorLoginExpired: {
    en: 'The login has expired. Please start again.',
    de: 'Die Anmeldung ist abgelaufen. Bitte erneut beginnen.',
  },
  errorLoginUnverified: {
    en: 'The login could not be verified. Please start again.',
    de: 'Die Anmeldung konnte nicht bestätigt werden. Bitte erneut beginnen.',
  },
  errorLoginCancelled: { en: 'The login was cancelled.', de: 'Die Anmeldung wurde abgebrochen.' },
  errorLoginCodeMissing: {
    en: 'The login code is missing. Please start again.',
    de: 'Der Anmeldecode fehlt. Bitte erneut beginnen.',
  },
  errorNoToken: {
    en: 'The server returned no valid access token.',
    de: 'Die Instanz hat kein gültiges Zugangstoken geliefert.',
  },
  errorAccountData: {
    en: 'The server returned incomplete account data.',
    de: 'Die Instanz lieferte unvollständige Kontodaten.',
  },
  errorServer: {
    en: 'The server answered with an error. Please try again.',
    de: 'Die Instanz antwortete mit einem Fehler. Bitte erneut versuchen.',
  },
  errorStartFailed: {
    en: 'Your server could not be reached. You are still signed in.',
    de: 'Deine Instanz ist nicht erreichbar. Du bist weiterhin angemeldet.',
  },
  errorNoSession: { en: 'No active account session.', de: 'Keine aktive Kontositzung.' },
  errorAccountStore: { en: 'Account storage unavailable.', de: 'Kontospeicher nicht verfügbar.' },
  errorAccountStoreAccess: { en: 'Account storage access failed.', de: 'Kontospeicherzugriff fehlgeschlagen.' },

  noticeRevokedLocally: {
    en: 'Signed out locally. The server could not be reached to revoke the token; remove Teadeck under Settings → Authorized apps on your server if you want to.',
    de: 'Lokal abgemeldet. Der Widerruf war nicht erreichbar; entziehe Teadeck bei Bedarf unter Einstellungen → Autorisierte Apps deiner Instanz.',
  },
} satisfies Record<string, ShellMessage>;

export type ShellMessageId = keyof typeof shellMessages;

/** The catalogue in English: what the page shows until a translation is loaded. */
export function englishShellMessages(): Record<string, string> {
  return Object.fromEntries(Object.entries(shellMessages).map(([id, message]) => [id, message.en]));
}

/**
 * An error whose text the sign-in page can show in the reader's language.
 * `message` stays English, so logs and test output stay readable; `detail`
 * carries what is the same in every language (a status code) and is appended
 * to both.
 */
export class ShellError extends Error {
  readonly id: ShellMessageId;
  readonly detail?: string;

  constructor(id: ShellMessageId, detail?: string) {
    super(detail ? `${shellMessages[id].en} (${detail})` : shellMessages[id].en);
    this.id = id;
    this.detail = detail;
    this.name = 'ShellError';
  }
}
