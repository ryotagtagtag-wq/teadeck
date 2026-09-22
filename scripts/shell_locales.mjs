import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { shellMessages } from '../integration/shell_strings.ts';
import { availableLocales } from '../integration/ui_locale.ts';

/**
 * Writes the sign-in page's texts for every interface language to
 * dist/shell-locales/<locale>.json.
 *
 * Each text is either one Mastodon already translates - then it is read out of
 * upstream's own locale files, so it reads like the rest of the interface and
 * follows upstream when it changes its wording - or one of Teadeck's own, which
 * exist in German and English (integration/shell_strings.ts). Anything without
 * a translation for a language stays English; the page never shows an empty
 * label. Every language gets a file, so the page's own request either finds its
 * language or is a plain 404 for one Teadeck does not offer.
 */

/** js-yaml comes with upstream; Node has no YAML parser of its own. */
function loadYamlParser(upstream) {
  const require = createRequire(path.join(upstream, 'package.json'));
  return require('js-yaml');
}

function fromPath(tree, dotted) {
  let current = tree;
  for (const key of dotted.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return typeof current === 'string' ? current : undefined;
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function readYaml(yaml, file, locale) {
  try {
    const tree = yaml.load(await readFile(file, 'utf8'));
    // Rails locale files are keyed by the locale itself; some ship it lower-cased.
    return tree?.[locale] ?? tree?.[locale.toLowerCase()] ?? Object.values(tree ?? {})[0] ?? null;
  } catch {
    return null;
  }
}

/** The English texts upstream ships, used to check the keys in the catalogue still exist. */
export async function upstreamEnglish(upstream) {
  const yaml = loadYamlParser(upstream);
  const js = await readJson(path.join(upstream, 'app/javascript/mastodon/locales/en.json'));
  const rails = await readYaml(yaml, path.join(upstream, 'config/locales/en.yml'), 'en');
  return (reference) => lookup(reference, js, rails);
}

function lookup(reference, js, rails) {
  const [source, key] = [reference.slice(0, reference.indexOf(':')), reference.slice(reference.indexOf(':') + 1)];
  if (source === 'js') return typeof js?.[key] === 'string' && js[key] !== '' ? js[key] : undefined;
  if (source === 'yml') return fromPath(rails, key);
  throw new Error(`Unknown translation source in "${reference}"`);
}

/** The texts of one language, filled from upstream first, then Teadeck's own. */
export function shellMessagesFor(locale, js, rails) {
  const own = locale.toLowerCase().startsWith('de') ? 'de' : 'en';
  const texts = {};
  for (const [id, message] of Object.entries(shellMessages)) {
    texts[id] = (message.upstream && lookup(message.upstream, js, rails)) || message[own] || message.en;
  }
  return texts;
}

export async function writeShellLocales(dist, upstream) {
  const yaml = loadYamlParser(upstream);
  const directory = path.join(dist, 'shell-locales');
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });

  const translated = [];
  for (const locale of availableLocales) {
    const js = await readJson(path.join(upstream, `app/javascript/mastodon/locales/${locale}.json`));
    const rails = await readYaml(yaml, path.join(upstream, `config/locales/${locale}.yml`), locale);
    if (js || rails) translated.push(locale);
    const texts = shellMessagesFor(locale, js, rails);
    await writeFile(path.join(directory, `${locale}.json`), JSON.stringify(texts));
  }
  return { locales: availableLocales.length, withUpstreamTranslations: translated.length };
}

/** Locales upstream ships translations for; kept in sync with `availableLocales`. */
export async function upstreamLocales(upstream) {
  const files = await readdir(path.join(upstream, 'app/javascript/mastodon/locales'));
  return files.filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -'.json'.length)).sort();
}
