/**
 * The language picker of the sign-in page. Each language is named in itself,
 * so it can be found whatever language the page is in.
 */

import { availableLocales } from './ui_locale';
import type { UiLocale } from './ui_locale';

function ownName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    return name ? name.charAt(0).toLocaleUpperCase(code) + name.slice(1) : code;
  } catch { return code; }
}

export function setUpLanguagePicker(select: HTMLSelectElement, current: UiLocale, onChange: (locale: UiLocale) => void) {
  const options = availableLocales.map((code) => ({ code, name: ownName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  select.replaceChildren(...options.map(({ code, name }) => new Option(name, code, false, code === current)));
  select.addEventListener('change', () => { onChange(select.value as UiLocale); });
}
