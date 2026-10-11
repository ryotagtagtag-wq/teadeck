import { isRtlLocale } from './ui_locale';
import { updateFavicon } from './favicon';

import type { Contrast, ColorScheme, FrontendSettings } from './frontend_settings';

// Sets the <html> attributes and classes that Mastodon's server would render.
const colorSchemeMediaWatcher = matchMedia('(prefers-color-scheme: dark)');
const contrastMediaWatcher = matchMedia('(prefers-contrast: more)');
let watching = false;

let current: { settings: FrontendSettings; locale: string };

// Kept outside any account, for the sign-in page.
const lastAppearanceKey = 'teadeck.appearance';

function rememberAppearance(settings: FrontendSettings, locale: string) {
  try {
    localStorage.setItem(lastAppearanceKey, JSON.stringify({ theme: settings.theme, colorScheme: settings.colorScheme, locale }));
  } catch { /* storage blocked */ }
}

/** What is on screen, including the deployment's defaults. */
export function appliedAppearance(): FrontendSettings | undefined {
  return current?.settings;
}

export function lastAppearance(): unknown {
  try {
    return JSON.parse(localStorage.getItem(lastAppearanceKey) ?? 'null');
  } catch { return null; }
}

/** The language chosen on the sign-in page, kept with the last appearance. */
export function rememberLocale(locale: string) {
  try {
    const stored = lastAppearance();
    localStorage.setItem(lastAppearanceKey, JSON.stringify({ ...(stored && typeof stored === 'object' ? stored : {}), locale }));
  } catch { /* storage blocked */ }
}

export function lastLocale(): unknown {
  const stored = lastAppearance();
  return stored && typeof stored === 'object' ? (stored as { locale?: unknown }).locale : null;
}

export function applyAppearance(settings: FrontendSettings, locale: string) {
  const root = document.documentElement;

  if (settings.colorScheme === 'auto') root.dataset.systemTheme = 'true';
  else delete root.dataset.systemTheme;

  if (settings.theme === 'mastodon') delete root.dataset.teadeckTheme;
  else root.dataset.teadeckTheme = settings.theme;

  root.dataset.colorScheme = resolveColorScheme(settings.colorScheme, colorSchemeMediaWatcher.matches) ? 'dark' : 'light';
  root.dataset.contrast = resolveContrast(settings.contrast, contrastMediaWatcher.matches) ? 'high' : 'default';
  if (!watching) {
    watching = true;
    colorSchemeMediaWatcher.addEventListener('change', () => { applyAppearance(current.settings, current.locale); });
    contrastMediaWatcher.addEventListener('change', () => { applyAppearance(current.settings, current.locale); });
  }
  current = { settings, locale };
  rememberAppearance(settings, locale);

  root.classList.toggle('system-font', settings.useSystemFont);
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
