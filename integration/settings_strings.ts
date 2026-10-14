/** Texts of Teadeck's own interface in German and English; other languages get English. */

export type UiTextLocale = 'de' | 'en';

export function uiTextLocale(locale: string): UiTextLocale {
  return locale.toLowerCase().startsWith('de') ? 'de' : 'en';
}

/** The language the interface is shown in right now. */
export function currentUiTextLocale(): UiTextLocale {
  return uiTextLocale(document.documentElement.lang || 'en');
}

type Text = Record<UiTextLocale, string>;

export const settingsStrings = {
  title: { de: 'Einstellungen', en: 'Settings' },
  serverSettings: { de: 'Einstellungen auf dem Server', en: 'Settings on the server' },
  intro: { de: 'Diese Einstellungen gelten nur für Teadeck in diesem Browser und für dieses Konto. An die Instanz wird nichts übertragen.', en: 'These settings apply only to Teadeck in this browser, for this account. Nothing here is sent to the instance.' },
  save: { de: 'Speichern', en: 'Save' },

  layout: { de: 'Layout', en: 'Layout' },
  layoutSimple: { de: 'Einspaltig', en: 'Single column' },
  layoutAdvanced: { de: 'Mehrspaltig', en: 'Multiple columns' },
  statusOverlay: { de: 'Beiträge im Overlay öffnen', en: 'Open posts in an overlay' },
  statusOverlayHint: {
    de: 'Ein Klick auf die Zeit eines Beitrags zeigt ihn mit seinem Verlauf groß in der Fenstermitte. Ausgeschaltet öffnet die Zeit die Beitragsansicht wie bisher, und jeder Beitrag bekommt einen eigenen Knopf für das Overlay.',
    en: "Clicking a post's time shows it and its thread large in the middle of the window. When off, the time opens the post view as before, and each post gets a button of its own for the overlay.",
  },
  openInOverlay: { de: 'Im Overlay öffnen', en: 'Open in overlay' },
  close: { de: 'Schließen', en: 'Close' },
  copy: { de: 'Kopieren', en: 'Copy' },
  copied: { de: 'Kopiert', en: 'Copied' },

  newPostLarge: { de: 'Neuer Beitrag im großen Eingabefeld', en: 'New post in the large composer' },
  composerLarge: { de: 'Großes Eingabefeld', en: 'Large composer' },
  composerNormal: { de: 'Normales Eingabefeld', en: 'Regular composer' },
  markdownPreview: { de: 'Vorschau', en: 'Preview' },
  markdownPreviewHint: { de: 'So zeigt dein Server den Beitrag ungefähr an.', en: 'Roughly how your server will show the post.' },
  markdownPreviewEmpty: { de: 'Hier erscheint die Vorschau, sobald du schreibst.', en: 'The preview appears here once you write.' },
  markdownHelp: { de: 'Markdown-Spickzettel', en: 'Markdown cheat sheet' },
  markdownHelpIntro: { de: 'Markdown schreibst du selbst. Links die Eingabe, rechts das Ergebnis.', en: 'You write the Markdown yourself. What you type on the left, the result on the right.' },
  markdownHelpHeading: { de: 'Überschrift', en: 'Heading' },
  markdownHelpEmphasis: { de: 'Hervorhebung', en: 'Emphasis' },
  markdownHelpLink: { de: 'Link', en: 'Link' },
  markdownHelpList: { de: 'Liste', en: 'List' },
  markdownHelpNumbered: { de: 'Nummerierte Liste', en: 'Numbered list' },
  markdownHelpQuote: { de: 'Zitat', en: 'Quote' },
  markdownHelpCode: { de: 'Code', en: 'Code' },
  markdownHelpCodeBlock: { de: 'Codeblock', en: 'Code block' },
  markdownHelpRule: { de: 'Trennlinie', en: 'Horizontal rule' },
  markdownHelpEscape: { de: 'Zeichen ohne Wirkung', en: 'Literal characters' },

  displayMedia: { de: 'Medien', en: 'Media' },
  displayMediaDefault: { de: 'Als heikel markierte ausblenden', en: 'Hide media marked as sensitive' },
  displayMediaShowAll: { de: 'Immer anzeigen', en: 'Always show' },
  displayMediaHideAll: { de: 'Immer ausblenden', en: 'Always hide' },

  expandSpoilers: { de: 'Inhaltswarnungen immer ausklappen', en: 'Always expand posts marked with content warnings' },
  autoPlayGif: { de: 'Animierte GIFs automatisch abspielen', en: 'Auto-play animated GIFs' },
  useBlurhash: { de: 'Farbverlauf als Vorschau ausgeblendeter Medien', en: 'Show blurred colour gradients for hidden media' },
  reduceMotion: { de: 'Animationen reduzieren', en: 'Reduce motion in animations' },
  usePendingItems: { de: 'Neue Beiträge erst nach Klick einblenden', en: 'Do not auto-refresh timelines' },
  usePendingItemsHint: { de: 'Sonst rutschen sie sofort oben in die Timeline.', en: 'Otherwise new posts slide straight into the timeline.' },
  boostModal: { de: 'Vor dem Teilen nachfragen', en: 'Show a confirmation dialog before boosting' },
  deleteModal: { de: 'Vor dem Löschen nachfragen', en: 'Show a confirmation dialog before deleting a post' },
  missingAltTextModal: { de: 'Bei fehlender Bildbeschreibung warnen', en: 'Warn about missing media descriptions before posting' },

  appearance: { de: 'Erscheinungsbild', en: 'Appearance' },
  reloadHint: {
    de: 'Gespeichert. Einige Einstellungen liest die Oberfläche nur beim Start, sie erscheinen also erst nach einem Neuladen.',
    en: 'Saved. Some settings are only read when the interface starts, so they appear after a reload.',
  },
  reloadNow: { de: 'Jetzt neu laden', en: 'Reload now' },
  theme: { de: 'Design', en: 'Design' },
  themeHint: {
    de: 'Jede Teesorte hat eine dunkle und eine helle Fassung; welche erscheint, entscheidet das Farbschema darunter.',
    en: 'Each tea has a dark and a light half; which one you see follows the colour scheme below.',
  },
  themeMastodon: { de: 'Mastodon', en: 'Mastodon' },
  // The designs carry the names of the teas whose brewed colour they show; the
  // names stay the same in every language, like the teas themselves.
  themeAssam: { de: 'Assam & Silver Needle', en: 'Assam & Silver Needle' },
  themeSencha: { de: 'Sencha & Jasmine', en: 'Sencha & Jasmine' },
  themeHibiscus: { de: 'Hibiskus & Rooibos', en: 'Hibiscus & Rooibos' },
  colorScheme: { de: 'Farbschema', en: 'Color scheme' },
  colorSchemeAuto: { de: 'Automatisch', en: 'Automatic' },
  colorSchemeLight: { de: 'Hell', en: 'Light' },
  colorSchemeDark: { de: 'Dunkel', en: 'Dark' },
  contrast: { de: 'Kontrast', en: 'Contrast' },
  contrastAuto: { de: 'Standard', en: 'Normal' },
  contrastHigh: { de: 'Hoch', en: 'High' },
  emojiStyle: { de: 'Emoji-Stil', en: 'Emoji style' },
  emojiStyleAuto: { de: 'Automatisch (systemabhängig)', en: 'Automatic (system default)' },
  emojiStyleNative: { de: 'Systemeigene Emojis', en: 'Native system emoji' },
  emojiStyleTwemoji: { de: 'Twemoji (Mastodon-Stil)', en: 'Twemoji (Mastodon style)' },
  disableSwiping: { de: 'Wischgesten deaktivieren', en: 'Disable swipe gestures' },
  disableHoverCards: { de: 'Profilvorschau deaktivieren', en: 'Disable profile preview cards' },
  useSystemFont: { de: 'Standardschriftart des Browsers verwenden', en: "Use the browser's default font" },
  useSystemScrollbars: { de: 'Bildlaufleiste des Betriebssystems verwenden', en: "Use the operating system's scrollbars" },

  language: { de: 'Sprache', en: 'Language' },

  notifications: { de: 'Benachrichtigungen', en: 'Notifications' },
  notificationsHint: { de: 'Bestimmt, welche Benachrichtigungen in der Benachrichtigungs-Spalte erscheinen.', en: 'Controls which notifications appear in the Notifications column.' },
  notifyFollow: { de: 'Ein neues Profil folgt mir', en: 'Someone followed me' },
  notifyFollowRequest: { de: 'Jemand möchte mir folgen', en: 'Someone requested to follow me' },
  notifyReblog: { de: 'Jemand teilte meinen Beitrag', en: 'Someone boosted my post' },
  notifyFavourite: { de: 'Jemand favorisierte meinen Beitrag', en: 'Someone favourited my post' },
  notifyMention: { de: 'Jemand erwähnte mich', en: 'Someone mentioned me' },
  notifyQuote: { de: 'Jemand zitierte meinen Beitrag', en: 'Someone quoted my post' },
} satisfies Record<string, Text>;

export type SettingsStringKey = keyof typeof settingsStrings;

export function t(key: SettingsStringKey, locale: UiTextLocale): string {
  return settingsStrings[key][locale];
}
