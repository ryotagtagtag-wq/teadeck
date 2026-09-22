import { isRtlLocale } from './ui_locale';
import { updateFavicon } from './favicon';

import type { Contrast, ColorScheme, FrontendSettings } from './frontend_settings';

/**
 * Same `data-color-scheme`/`data-contrast` attributes and `<html>` classes
 * upstream's `app/javascript/inline/theme-selection.js` and
 * `ApplicationHelper#html_classes` produce server-side; the compiled CSS
 * (`styles/application.scss`, the only theme this build ships, see
 * `config/themes.yml`) already keys off exactly these. We only compute them
 * ourselves, from our own stored preference instead of a Rails-rendered one.
 *
 * Applied once account and settings are known inside `boot()`, not before:
 * `#mastodon` stays hidden until then anyway, so only the loading spinner and
 * (for a fresh sign-in) the login shell can briefly show the wrong scheme.
 *
 * Called again by the settings page whenever one of these changes, so the
 * interface follows immediately. Calling it repeatedly is safe: the watchers for
 * the operating system's own settings are registered once and always read the
 * values from the last call.
 */
const colorSchemeMediaWatcher = matchMedia('(prefers-color-scheme: dark)');
const contrastMediaWatcher = matchMedia('(prefers-contrast: more)');
let watching = false;

let current: { settings: FrontendSettings; locale: string };

/**
 * The design and language last shown, kept outside any account: the sign-in
 * page has no account and therefore no stored preference of its own, but it
 * should not greet someone in a design or a language they did not choose.
 */
export const lastAppearanceKey = 'teadeck.appearance';

function rememberAppearance(settings: FrontendSettings, locale: string) {
  try {
    localStorage.setItem(lastAppearanceKey, JSON.stringify({ theme: settings.theme, colorScheme: settings.colorScheme, locale }));
  } catch { /* storage blocked: the sign-in page falls back to what this installation configured */ }
}

/**
 * The appearance the interface is actually running with, including what this
 * installation configured. The settings page starts from this, so its fields
 * show what is on screen rather than the client's own defaults.
 */
export function appliedAppearance(): FrontendSettings | undefined {
  return current?.settings;
}

/** What the sign-in page should look like: the design last used, else nothing. */
export function lastAppearance(): unknown {
  try {
    return JSON.parse(localStorage.getItem(lastAppearanceKey) ?? 'null');
  } catch { return null; }
}

/** The interface language last used here; the sign-in page falls back to the browser's. */
export function lastLocale(): unknown {
  const stored = lastAppearance();
  return stored && typeof stored === 'object' ? (stored as { locale?: unknown }).locale : null;
}

export function applyAppearance(settings: FrontendSettings, locale: string) {
  const root = document.documentElement;

  const updateColorScheme = () => {
    const useDarkMode = resolveColorScheme(settings.colorScheme, colorSchemeMediaWatcher.matches);
    root.dataset.colorScheme = useDarkMode ? 'dark' : 'light';
  };
  const updateContrast = () => {
    const useHighContrast = resolveContrast(settings.contrast, contrastMediaWatcher.matches);
    root.dataset.contrast = useHighContrast ? 'high' : 'default';
  };

  if (settings.colorScheme === 'auto') root.dataset.systemTheme = 'true';
  else delete root.dataset.systemTheme;

  // Teadeck's own designs (themes.css) replace Mastodon's two colour ramps, its
  // fonts and radii; dark or light still follows the colour scheme above.
  if (settings.theme === 'mastodon') delete root.dataset.teadeckTheme;
  else root.dataset.teadeckTheme = settings.theme;

  updateColorScheme();
  updateContrast();
  if (!watching) {
    watching = true;
    // Always applies the settings of the most recent call (`current` below).
    colorSchemeMediaWatcher.addEventListener('change', () => { applyAppearance(current.settings, current.locale); });
    contrastMediaWatcher.addEventListener('change', () => { applyAppearance(current.settings, current.locale); });
  }
  current = { settings, locale };
  rememberAppearance(settings, locale);

  root.classList.toggle('system-font', settings.useSystemFont);
  // Inverted like upstream's own html_classes: the custom scrollbar styling
  // is the default, "use system scrollbars" turns it back off.
  root.classList.toggle('custom-scrollbars', !settings.useSystemScrollbars);
  root.classList.toggle('reduce-motion', settings.reduceMotion);
  root.classList.toggle('no-reduce-motion', !settings.reduceMotion);
  root.classList.toggle('rtl', isRtlLocale(locale));
  root.dir = isRtlLocale(locale) ? 'rtl' : 'ltr';
  updateFavicon();
}

function resolveColorScheme(colorScheme: ColorScheme, systemPrefersDark: boolean): boolean {
  return colorScheme === 'auto' ? systemPrefersDark : colorScheme === 'dark';
}

function resolveContrast(contrast: Contrast, systemPrefersMore: boolean): boolean {
  return contrast === 'high' || systemPrefersMore;
}
