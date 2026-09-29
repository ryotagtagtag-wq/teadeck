/** Mastodon's interface languages (app/javascript/mastodon/locales); update with upstream. */
export const availableLocales = [
  'af', 'an', 'ar', 'ast', 'az', 'be', 'bg', 'bn', 'br', 'bs', 'ca', 'ckb', 'co',
  'cs', 'cy', 'da', 'de', 'el', 'en', 'en-GB', 'eo', 'es', 'es-AR', 'es-MX', 'et',
  'eu', 'fa', 'fi', 'fil', 'fo', 'fr', 'fr-CA', 'fy', 'ga', 'gd', 'gl', 'he', 'hi',
  'hr', 'hu', 'hy', 'ia', 'id', 'ie', 'ig', 'io', 'is', 'it', 'ja', 'ka', 'kab',
  'kk', 'kn', 'ko', 'ku', 'kw', 'la', 'lad', 'lt', 'lv', 'mk', 'ml', 'mr', 'ms',
  'my', 'nan-TW', 'ne', 'nl', 'nn', 'no', 'oc', 'pa', 'pl', 'pt-BR', 'pt-PT',
  'ro', 'ru', 'ry', 'sa', 'sc', 'sco', 'si', 'sk', 'sl', 'sq', 'sr', 'sr-Latn',
  'sv', 'szl', 'ta', 'tai', 'te', 'th', 'tlh', 'tok', 'tr', 'tt', 'ug', 'uk',
  'ur', 'uz', 'vi', 'zgh', 'zh-CN', 'zh-HK', 'zh-TW',
] as const;

export type UiLocale = (typeof availableLocales)[number];

/** Mirrors Rails' `ApplicationHelper::RTL_LOCALES`. */
const rtlLocales: UiLocale[] = ['ar', 'ckb', 'fa', 'he'];

export function isRtlLocale(locale: string): boolean {
  return rtlLocales.includes(locale as UiLocale);
}

function findLocale(tag: string): UiLocale | undefined {
  const lower = tag.toLowerCase();
  const exact = availableLocales.find(code => code.toLowerCase() === lower);
  if (exact) return exact;
  const base = lower.split('-')[0];
  return availableLocales.find(code => code.toLowerCase() === base);
}

/** First browser-preferred language with a matching translation, else English. */
export function detectLocale(preferredLanguages: readonly string[]): UiLocale {
  for (const tag of preferredLanguages) {
    const match = findLocale(tag);
    if (match) return match;
  }
  return 'en';
}

/** The stored choice if it is still available, otherwise the browser's preference. */
export function resolveLocale(stored: unknown, preferredLanguages: readonly string[]): UiLocale {
  if (typeof stored === 'string' && (availableLocales as readonly string[]).includes(stored)) {
    return stored as UiLocale;
  }
  return detectLocale(preferredLanguages);
}
