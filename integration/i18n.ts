/**
 * Teadeck's texts in the interface language: the account's, or on the sign-in
 * page the one last chosen here, else the browser's. Translations come from
 * /texts/<locale>.json (scripts/texts.mjs); English is built in and used
 * whenever a translation cannot be loaded. The app starts only once they are
 * loaded (bootstrap.ts), so t() always answers in the current language.
 */

import { englishTexts, texts } from './texts.ts';
import type { TextId } from './texts.ts';
import { isRtlLocale, resolveLocale } from './ui_locale.ts';
import type { UiLocale } from './ui_locale.ts';

let messages: Record<string, string> = englishTexts();

export function t(id: TextId): string {
  return messages[id] ?? texts[id]?.en ?? id;
}

/** The interface language, e.g. for names given per language. */
export function currentLocale(): string {
  return document.documentElement.lang || 'en';
}

export function shellLocale(lastChosen: unknown): UiLocale {
  return resolveLocale(lastChosen, navigator.languages ?? [navigator.language]);
}

/** Never rejects: on any failure the page stays in English. */
export async function loadShellMessages(locale: UiLocale): Promise<void> {
  if (locale === 'en') return;
  try {
    const response = await fetch(`/texts/${locale}.json`);
    if (!response.ok) return;
    const loaded: unknown = await response.json();
    if (!loaded || typeof loaded !== 'object') return;
    const translated: Record<string, string> = {};
    for (const [id, text] of Object.entries(loaded as Record<string, unknown>)) {
      if (id in texts && typeof text === 'string' && text !== '') translated[id] = text;
    }
    messages = { ...englishTexts(), ...translated };
  } catch { /* English stays */ }
}

/** `data-teadeck-text` names the message, `data-teadeck-text-attr` an attribute to fill instead of the text. */
export function applyShellText(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-teadeck-text]')) {
    const id = element.dataset.teadeckText as TextId;
    const attribute = element.dataset.teadeckTextAttr;
    if (attribute) element.setAttribute(attribute, t(id));
    else element.textContent = t(id);
  }
}

export function applyDocumentLanguage(locale: UiLocale): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = isRtlLocale(locale) ? 'rtl' : 'ltr';
}

export async function translateShell(locale: UiLocale): Promise<void> {
  await loadShellMessages(locale);
  applyDocumentLanguage(locale);
  applyShellText();
}
