/**
 * Display and behaviour settings, stored per account in this browser. Mastodon
 * renders them into its page from the server; a standalone client keeps them itself.
 */

export type DisplayMedia = 'default' | 'show_all' | 'hide_all';
export type ColorScheme = 'auto' | 'light' | 'dark';
export type Contrast = 'auto' | 'high';
export type EmojiStyle = 'auto' | 'native' | 'twemoji';
/**
 * Teadeck's own designs, each with a dark and a light half (themes.css), named
 * after the tea whose brewed colour they carry: `assam` is Assam (dark) and
 * Silver Needle (light), `sencha` is Sencha (dark) and Jasmine (light). Which
 * half appears follows the colour scheme.
 */
export type Theme = 'mastodon' | 'assam' | 'sencha';

export interface FrontendSettings {
  autoPlayGif: boolean;
  displayMedia: DisplayMedia;
  expandSpoilers: boolean;
  reduceMotion: boolean;
  useBlurhash: boolean;
  usePendingItems: boolean;
  boostModal: boolean;
  deleteModal: boolean;
  missingAltTextModal: boolean;
  /** Applied directly to `<html>` by `appearance.ts`, not part of `frontendSettingsMeta`. */
  theme: Theme;
  colorScheme: ColorScheme;
  contrast: Contrast;
  useSystemFont: boolean;
  useSystemScrollbars: boolean;
  /** These three do go through `frontendSettingsMeta`, like the fields above them. */
  emojiStyle: EmojiStyle;
  disableSwiping: boolean;
  disableHoverCards: boolean;
}

export const frontendSettingsKey = 'frontendSettings';

const displayMediaValues: DisplayMedia[] = ['default', 'show_all', 'hide_all'];
const colorSchemeValues: ColorScheme[] = ['auto', 'light', 'dark'];
const contrastValues: Contrast[] = ['auto', 'high'];
const emojiStyleValues: EmojiStyle[] = ['auto', 'native', 'twemoji'];
const themeValues: Theme[] = ['mastodon', 'assam', 'sencha'];
/** What this deployment starts with (TEADECK_THEME, TEADECK_COLOR_SCHEME; served as /teadeck.json). */
export interface DeploymentDefaults {
  theme?: Theme;
  colorScheme?: ColorScheme;
}

/** A plain object, or an empty one for anything else stored or received. */
export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Only values this client knows; anything else is ignored. */
export function readDeploymentDefaults(value: unknown): DeploymentDefaults {
  const source = asRecord(value);
  const defaults: DeploymentDefaults = {};
  if (themeValues.includes(source.theme as Theme)) defaults.theme = source.theme as Theme;
  if (colorSchemeValues.includes(source.colorScheme as ColorScheme)) defaults.colorScheme = source.colorScheme as ColorScheme;
  return defaults;
}

/**
 * Defaults before the user saved anything: the account's reading preferences
 * from `/api/v1/preferences` where the server has them, otherwise Mastodon's
 * own web defaults (`namespace :web` in app/models/user_settings.rb), with
 * motion following the operating system. `deployment` is what this installation
 * chose as its starting design; a reader's own choice is stored and wins over it.
 */
export function defaultFrontendSettings(
  serverPreferences: Record<string, unknown>,
  prefersReducedMotion: boolean,
  deployment: DeploymentDefaults = {},
): FrontendSettings {
  const media = serverPreferences['reading:expand:media'];
  const spoilers = serverPreferences['reading:expand:spoilers'];
  return {
    autoPlayGif: false,
    displayMedia: displayMediaValues.includes(media as DisplayMedia) ? media as DisplayMedia : 'default',
    expandSpoilers: typeof spoilers === 'boolean' ? spoilers : false,
    reduceMotion: prefersReducedMotion,
    useBlurhash: true,
    usePendingItems: false,
    boostModal: false,
    deleteModal: true,
    missingAltTextModal: true,
    // Teadeck's own look is the default; an installation can choose another in its .env,
    // and a reader can always pick Mastodon's on the settings page.
    theme: deployment.theme ?? 'assam',
    colorScheme: deployment.colorScheme ?? 'auto',
    contrast: 'auto',
    useSystemFont: false,
    useSystemScrollbars: false,
    emojiStyle: 'auto',
    disableSwiping: false,
    disableHoverCards: false,
  };
}

const enumFields: { [K in keyof FrontendSettings]?: readonly FrontendSettings[K][] } = {
  displayMedia: displayMediaValues,
  theme: themeValues,
  colorScheme: colorSchemeValues,
  contrast: contrastValues,
  emojiStyle: emojiStyleValues,
};

/** Stored values win field by field; anything missing or malformed falls back to the default. */
export function resolveFrontendSettings(stored: unknown, defaults: FrontendSettings): FrontendSettings {
  const source = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored as Record<string, unknown> : {};
  const resolved = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof FrontendSettings)[]) {
    const value = source[key];
    const allowedValues = enumFields[key];
    if (allowedValues) {
      if ((allowedValues as unknown[]).includes(value)) resolved[key] = value as never;
    } else if (typeof value === 'boolean') {
      resolved[key] = value as never;
    }
  }
  return resolved;
}

/** The upstream initial-state `meta` fields these settings replace. */
export function frontendSettingsMeta(settings: FrontendSettings) {
  return {
    auto_play_gif: settings.autoPlayGif,
    display_media: settings.displayMedia,
    expand_spoilers: settings.expandSpoilers,
    reduce_motion: settings.reduceMotion,
    use_blurhash: settings.useBlurhash,
    use_pending_items: settings.usePendingItems,
    boost_modal: settings.boostModal,
    delete_modal: settings.deleteModal,
    missing_alt_text_modal: settings.missingAltTextModal,
    emoji_style: settings.emojiStyle,
    disable_swiping: settings.disableSwiping,
    disable_hover_cards: settings.disableHoverCards,
  };
}

/** Where Mastodon itself opens each layout; `/deck/home` would show the home column twice. */
export function layoutStartPath(advancedLayout: boolean) {
  return advancedLayout ? '/deck/getting-started' : '/home';
}
