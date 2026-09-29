/**
 * The sign-in page in the language last chosen here, else the browser's.
 * Translations come from /shell-locales/<locale>.json (scripts/shell_locales.mjs);
 * English is built in and used whenever a translation cannot be loaded.
 */

import { englishShellMessages, shellMessages } from './shell_strings.ts';
import type { ShellMessageId } from './shell_strings.ts';
import { isRtlLocale, resolveLocale } from './ui_locale.ts';
import type { UiLocale } from './ui_locale.ts';

let messages: Record<string, string> = englishShellMessages();

export function t(id: ShellMessageId): string {
  return messages[id] ?? shellMessages[id]?.en ?? id;
}

export function shellLocale(lastChosen: unknown): UiLocale {
  return resolveLocale(lastChosen, navigator.languages ?? [navigator.language]);
}

/** Never rejects: on any failure the page stays in English. */
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
  } catch { /* English stays */ }
}

/** `data-teadeck-text` names the message, `data-teadeck-text-attr` an attribute to fill instead of the text. */
export function applyShellText(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-teadeck-text]')) {
    const id = element.dataset.teadeckText as ShellMessageId;
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
