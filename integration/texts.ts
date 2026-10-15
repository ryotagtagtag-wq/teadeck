/**
 * Every text of Teadeck's own interface: the sign-in page, which runs before
 * Mastodon's translations load, and Teadeck's parts of the app. `en` is the
 * text and the fallback, `de` Teadeck's own German, and `upstream` names a
 * message Mastodon already translates (`js:<key>` in its locales/*.json,
 * `yml:<key>` in config/locales/*.yml), which then wins in every language.
 * scripts/texts.mjs writes them per language to /texts/<locale>.json; i18n.ts
 * loads that file and answers t(id). index.html carries the English texts.
 */

export type TextMessage = {
  en: string;
  de?: string;
  upstream?: string;
};

export const texts = {
  // The sign-in page and starting up.
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
  sourceCode: { en: 'Source Code', upstream: 'js:footer.source_code' },
  language: { en: 'Language', upstream: 'js:about.language_label' },

  connecting: { en: 'Connecting…', de: 'Verbinde …' },
  retry: { en: 'Try again', upstream: 'js:bundle_column_error.retry' },

  updateTitle: { en: 'New version', de: 'Neue Version' },
  updateBody: { en: 'A new version of Teadeck is ready.', de: 'Eine neue Version von Teadeck ist bereit.' },
  updateReload: { en: 'Refresh', upstream: 'js:refresh' },
  updating: { en: 'Updating…', de: 'Wird aktualisiert …' },

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

  // The app: settings, post overlay, large composer, Markdown.
  title: { en: 'Settings', de: 'Einstellungen' },
  serverSettings: { en: 'Settings on the server', de: 'Einstellungen auf dem Server' },
  intro: {
    en: 'These settings apply only to Teadeck in this browser, for this account. Nothing here is sent to the instance.',
    de: 'Diese Einstellungen gelten nur für Teadeck in diesem Browser und für dieses Konto. An die Instanz wird nichts übertragen.',
  },
  save: { en: 'Save', de: 'Speichern' },
  layout: { en: 'Layout' },
  layoutSimple: { en: 'Single column', de: 'Einspaltig' },
  layoutAdvanced: { en: 'Multiple columns', de: 'Mehrspaltig' },
  statusOverlay: { en: 'Open posts in an overlay', de: 'Beiträge im Overlay öffnen' },
  statusOverlayHint: {
    en: 'Clicking a post\'s time shows it and its thread large in the middle of the window. When off, the time opens the post view as before, and each post gets a button of its own for the overlay.',
    de: 'Ein Klick auf die Zeit eines Beitrags zeigt ihn mit seinem Verlauf groß in der Fenstermitte. Ausgeschaltet öffnet die Zeit die Beitragsansicht wie bisher, und jeder Beitrag bekommt einen eigenen Knopf für das Overlay.',
  },
  openInOverlay: { en: 'Open in overlay', de: 'Im Overlay öffnen' },
  close: { en: 'Close', de: 'Schließen' },
  copy: { en: 'Copy', de: 'Kopieren' },
  copied: { en: 'Copied', de: 'Kopiert' },
  newPostLarge: { en: 'New post in the large composer', de: 'Neuer Beitrag im großen Eingabefeld' },
  composerLarge: { en: 'Large composer', de: 'Großes Eingabefeld' },
  composerNormal: { en: 'Regular composer', de: 'Normales Eingabefeld' },
  markdownPreview: { en: 'Preview', de: 'Vorschau' },
  markdownPreviewHint: {
    en: 'Roughly how your server will show the post.',
    de: 'So zeigt dein Server den Beitrag ungefähr an.',
  },
  markdownPreviewEmpty: {
    en: 'The preview appears here once you write.',
    de: 'Hier erscheint die Vorschau, sobald du schreibst.',
  },
  markdownHelp: { en: 'Markdown cheat sheet', de: 'Markdown-Spickzettel' },
  markdownHelpIntro: {
    en: 'You write the Markdown yourself. What you type on the left, the result on the right.',
    de: 'Markdown schreibst du selbst. Links die Eingabe, rechts das Ergebnis.',
  },
  markdownHelpHeading: { en: 'Heading', de: 'Überschrift' },
  markdownHelpEmphasis: { en: 'Emphasis', de: 'Hervorhebung' },
  markdownHelpLink: { en: 'Link' },
  markdownHelpList: { en: 'List', de: 'Liste' },
  markdownHelpNumbered: { en: 'Numbered list', de: 'Nummerierte Liste' },
  markdownHelpQuote: { en: 'Quote', de: 'Zitat' },
  markdownHelpCode: { en: 'Code' },
  markdownHelpCodeBlock: { en: 'Code block', de: 'Codeblock' },
  markdownHelpRule: { en: 'Horizontal rule', de: 'Trennlinie' },
  markdownHelpEscape: { en: 'Literal characters', de: 'Zeichen ohne Wirkung' },
  displayMedia: { en: 'Media', de: 'Medien' },
  displayMediaDefault: { en: 'Hide media marked as sensitive', de: 'Als heikel markierte ausblenden' },
  displayMediaShowAll: { en: 'Always show', de: 'Immer anzeigen' },
  displayMediaHideAll: { en: 'Always hide', de: 'Immer ausblenden' },
  expandSpoilers: { en: 'Always expand posts marked with content warnings', de: 'Inhaltswarnungen immer ausklappen' },
  autoPlayGif: { en: 'Auto-play animated GIFs', de: 'Animierte GIFs automatisch abspielen' },
  useBlurhash: {
    en: 'Show blurred colour gradients for hidden media',
    de: 'Farbverlauf als Vorschau ausgeblendeter Medien',
  },
  reduceMotion: { en: 'Reduce motion in animations', de: 'Animationen reduzieren' },
  usePendingItems: { en: 'Do not auto-refresh timelines', de: 'Neue Beiträge erst nach Klick einblenden' },
  usePendingItemsHint: {
    en: 'Otherwise new posts slide straight into the timeline.',
    de: 'Sonst rutschen sie sofort oben in die Timeline.',
  },
  boostModal: { en: 'Show a confirmation dialog before boosting', de: 'Vor dem Teilen nachfragen' },
  deleteModal: { en: 'Show a confirmation dialog before deleting a post', de: 'Vor dem Löschen nachfragen' },
  missingAltTextModal: {
    en: 'Warn about missing media descriptions before posting',
    de: 'Bei fehlender Bildbeschreibung warnen',
  },
  appearance: { en: 'Appearance', de: 'Erscheinungsbild' },
  reloadHint: {
    en: 'Saved. Some settings are only read when the interface starts, so they appear after a reload.',
    de: 'Gespeichert. Einige Einstellungen liest die Oberfläche nur beim Start, sie erscheinen also erst nach einem Neuladen.',
  },
  reloadNow: { en: 'Reload now', de: 'Jetzt neu laden' },
  theme: { en: 'Design' },
  themeHint: {
    en: 'Each tea has a dark and a light half; which one you see follows the colour scheme below.',
    de: 'Jede Teesorte hat eine dunkle und eine helle Fassung; welche erscheint, entscheidet das Farbschema darunter.',
  },
  themeMastodon: { en: 'Mastodon' },
  colorScheme: { en: 'Color scheme', de: 'Farbschema' },
  colorSchemeAuto: { en: 'Automatic', de: 'Automatisch' },
  colorSchemeLight: { en: 'Light', de: 'Hell' },
  colorSchemeDark: { en: 'Dark', de: 'Dunkel' },
  contrast: { en: 'Contrast', de: 'Kontrast' },
  contrastAuto: { en: 'Normal', de: 'Standard' },
  contrastHigh: { en: 'High', de: 'Hoch' },
  density: { en: 'Density', de: 'Dichte' },
  densityDefault: { en: 'Default', de: 'Standard' },
  densityCompact: { en: 'Compact', de: 'Kompakt' },
  emojiStyle: { en: 'Emoji style', de: 'Emoji-Stil' },
  emojiStyleAuto: { en: 'Automatic (system default)', de: 'Automatisch (systemabhängig)' },
  emojiStyleNative: { en: 'Native system emoji', de: 'Systemeigene Emojis' },
  emojiStyleTwemoji: { en: 'Twemoji (Mastodon style)', de: 'Twemoji (Mastodon-Stil)' },
  disableSwiping: { en: 'Disable swipe gestures', de: 'Wischgesten deaktivieren' },
  disableHoverCards: { en: 'Disable profile preview cards', de: 'Profilvorschau deaktivieren' },
  useSystemFont: { en: 'Use the browser\'s default font', de: 'Standardschriftart des Browsers verwenden' },
  useSystemScrollbars: {
    en: 'Use the operating system\'s scrollbars',
    de: 'Bildlaufleiste des Betriebssystems verwenden',
  },
  notifications: { en: 'Notifications', de: 'Benachrichtigungen' },
  notificationsHint: {
    en: 'Controls which notifications appear in the Notifications column.',
    de: 'Bestimmt, welche Benachrichtigungen in der Benachrichtigungs-Spalte erscheinen.',
  },
  notifyFollow: { en: 'Someone followed me', de: 'Ein neues Profil folgt mir' },
  notifyFollowRequest: { en: 'Someone requested to follow me', de: 'Jemand möchte mir folgen' },
  notifyReblog: { en: 'Someone boosted my post', de: 'Jemand teilte meinen Beitrag' },
  notifyFavourite: { en: 'Someone favourited my post', de: 'Jemand favorisierte meinen Beitrag' },
  notifyMention: { en: 'Someone mentioned me', de: 'Jemand erwähnte mich' },
  notifyQuote: { en: 'Someone quoted my post', de: 'Jemand zitierte meinen Beitrag' },

  // About this server, where it does not run Mastodon (upstream's text names Mastodon).
  domainBlocksPreamble: {
    en: 'You can generally view content from and interact with users from any other server in the fediverse. These are the exceptions that have been made on this particular server.',
    de: 'Grundsätzlich kannst du alle Inhalte von allen Nutzer*innen auf allen Servern im Fediverse sehen und mit ihnen interagieren. Für diesen Server gibt es aber ein paar Ausnahmen.',
  },

  // Who can reply (GoToSocial).
  replyAudienceDefault: { en: 'Account default (set in GoToSocial)', de: 'Kontostandard (in GoToSocial eingestellt)' },
  replyAudiencePublic: { en: 'Everyone', de: 'Alle' },
  replyAudienceFollowers: { en: 'Only followers and mentioned accounts', de: 'Nur Follower und Erwähnte' },
  replyAudienceFollowing: {
    en: 'Only accounts I follow, and mentioned accounts',
    de: 'Nur Accounts, denen ich folge, und Erwähnte',
  },
  replyAudienceMutuals: {
    en: 'Only mutual followers and mentioned accounts',
    de: 'Nur gegenseitige Follower und Erwähnte',
  },
  replyAudienceMentioned: { en: 'Only mentioned accounts', de: 'Nur erwähnte Accounts' },
  replyAudienceTitle: { en: 'Who can reply', de: 'Wer darf antworten' },
  replyAudienceOnlyPublic: {
    en: 'Only for public or unlisted posts',
    de: 'Nur bei öffentlichen oder nicht gelisteten Beiträgen',
  },
  replyAudienceNotDirect: { en: 'Not possible for direct messages', de: 'Bei direkten Nachrichten nicht möglich' },
  replyAudienceDefaultsUnavailable: {
    en: 'Your account\'s default interaction settings could not be loaded. The post was not sent, so favourites and boosts are not opened up beyond your settings. Please try again.',
    de: 'Die Interaktions-Standards deines Kontos ließen sich nicht laden. Der Beitrag wurde nicht gesendet, damit Favorisieren und Teilen nicht weiter erlaubt werden als eingestellt. Bitte erneut versuchen.',
  },

  // Plain text or Markdown for the post being written.
  statusFormatOn: { en: 'Text as Markdown: on', de: 'Text als Markdown: an' },
  statusFormatOff: { en: 'Text as Markdown: off', de: 'Text als Markdown: aus' },
  statusFormatAccountDefault: { en: 'account default', de: 'Kontostandard' },
  statusFormatOwn: { en: 'your own choice, remembered', de: 'eigene Wahl, wird gemerkt' },

  // The Markdown cheat sheet's examples, typed as shown.
  markdownExampleHeading: { en: '# Heading\n## Smaller heading', de: '# Überschrift\n## Kleinere Überschrift' },
  markdownExampleEmphasis: {
    en: '**bold**, *italic*, ~~struck through~~',
    de: '**fett**, *kursiv*, ~~durchgestrichen~~',
  },
  markdownExampleLink: { en: '[Teadeck](https://teadeck.de)\nhttps://teadeck.de' },
  markdownExampleList: { en: '- Tea\n- Pot\n  - Lid', de: '- Tee\n- Kanne\n  - Deckel' },
  markdownExampleNumbered: { en: '1. Boil water\n2. Let the tea steep', de: '1. Wasser kochen\n2. Tee ziehen lassen' },
  markdownExampleQuote: { en: '> A quote', de: '> Ein Zitat' },
  markdownExampleCode: { en: 'Check with `npm test`', de: 'Mit `npm test` prüfen' },
  markdownExampleCodeBlock: { en: '```js\nconst tea = "Assam";\n```' },
  markdownExampleRule: { en: 'above\n\n---\n\nbelow', de: 'oben\n\n---\n\nunten' },
  markdownExampleEscape: { en: '\\*no star\\*', de: '\\*kein Stern\\*' },
} satisfies Record<string, TextMessage>;

export type TextId = keyof typeof texts;

/** The catalogue in English: what is shown until a translation is loaded. */
export function englishTexts(): Record<string, string> {
  return Object.fromEntries(Object.entries(texts).map(([id, message]) => [id, message.en]));
}

/**
 * An error whose text the sign-in page can show in the reader's language.
 * `message` stays English, so logs and test output stay readable; `detail`
 * carries what is the same in every language (a status code) and is appended
 * to both.
 */
export class ShellError extends Error {
  readonly id: TextId;
  readonly detail?: string;
  /** The HTTP status of a failed request to the server. */
  readonly status?: number;

  constructor(id: TextId, detail?: string, status?: number) {
    super(detail ? `${texts[id].en} (${detail})` : texts[id].en);
    this.id = id;
    this.detail = detail;
    this.status = status;
    this.name = 'ShellError';
  }
}
