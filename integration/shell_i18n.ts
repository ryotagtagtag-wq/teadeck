/**
 * The sign-in page in the reader's language.
 *
 * Which language: the one chosen in Teadeck's settings when this browser has
 * already been signed in (remembered next to the design, see appearance.ts),
 * otherwise the browser's own preference - the same rule the application
 * itself follows once it runs (`resolveLocale`).
 *
 * The texts come from `/shell-locales/<locale>.json`, written at build time
 * from Mastodon's own translations plus Teadeck's own sentences
 * (scripts/shell_locales.mjs). English is compiled in, so the page is readable
 * before that file arrives, if it cannot be loaded at all, and offline on the
 * very first start; the service worker caches the language in use afterwards,
 * exactly as it does for the application's own translations.
 *
 * Applied to the markup through `data-teadeck-text` attributes, so index.html
 * stays a readable English page rather than a set of empty placeholders.
 */

import { englishShellMessages, shellMessages } from './shell_strings.ts';
import type { ShellMessageId } from './shell_strings.ts';
import { isRtlLocale, resolveLocale } from './ui_locale.ts';
import type { UiLocale } from './ui_locale.ts';

let messages: Record<string, string> = englishShellMessages();

/** One text of the sign-in page; English where the language has no translation. */
export function t(id: ShellMessageId): string {
  return messages[id] ?? shellMessages[id]?.en ?? id;
}

/** The language the sign-in page should use: the one last chosen here, else the browser's. */
export function shellLocale(lastChosen: unknown): UiLocale {
  return resolveLocale(lastChosen, navigator.languages ?? [navigator.language]);
}

/**
 * Loads the translations for `locale`. Never rejects: any failure leaves the
 * page in English rather than without text.
 */
export async function loadShellMessages(locale: UiLocale): Promise<void> {
  if (locale === 'en') return;
  try {
    const response = await fetch(`/shell-locales/${locale}.json`);
    if (!response.ok) return;
    const loaded: unknown = await response.json();
    if (!loaded || typeof loaded !== 'object') return;
    const translated: Record<string, string> = {};
    for (const [id, text] of Object.entries(loaded as Record<string, unknown>)) {
      if (id in shellMessages && typeof text === 'string' && text !== '') translated[id] = text;
    }
    messages = { ...englishShellMessages(), ...translated };
  } catch {
    /* offline or blocked: English stays */
  }
}

/**
 * Puts the loaded texts into the page: `data-teadeck-text` names the message,
 * `data-teadeck-text-attr` the attribute to fill instead of the element's text.
 */
export function applyShellText(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-teadeck-text]')) {
    const id = element.dataset.teadeckText as ShellMessageId;
    const attribute = element.dataset.teadeckTextAttr;
    if (attribute) element.setAttribute(attribute, t(id));
    else element.textContent = t(id);
  }
}

/** The language of the document, for screen readers, hyphenation and RTL scripts. */
export function applyDocumentLanguage(locale: UiLocale): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = isRtlLocale(locale) ? 'rtl' : 'ltr';
}

/** Everything the sign-in page needs, in one step: load, translate, mark the document. */
export async function translateShell(locale: UiLocale): Promise<void> {
  await loadShellMessages(locale);
  applyDocumentLanguage(locale);
  applyShellText();
}
