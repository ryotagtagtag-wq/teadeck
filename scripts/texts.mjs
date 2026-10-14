import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { texts } from '../integration/texts.ts';
import { availableLocales } from '../integration/ui_locale.ts';

/**
 * Writes Teadeck's texts for every interface language to
 * dist/texts/<locale>.json, from Mastodon's translations and
 * integration/texts.ts. Missing translations stay English.
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
export function textsFor(locale, js, rails) {
  const own = locale.toLowerCase().startsWith('de') ? 'de' : 'en';
  const result = {};
  for (const [id, message] of Object.entries(texts)) {
    result[id] = (message.upstream && lookup(message.upstream, js, rails)) || message[own] || message.en;
  }
  return result;
}

export async function writeTexts(dist, upstream) {
  const yaml = loadYamlParser(upstream);
  const directory = path.join(dist, 'texts');
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });

  const translated = [];
  for (const locale of availableLocales) {
    const js = await readJson(path.join(upstream, `app/javascript/mastodon/locales/${locale}.json`));
    const rails = await readYaml(yaml, path.join(upstream, `config/locales/${locale}.yml`), locale);
    if (js || rails) translated.push(locale);
    await writeFile(path.join(directory, `${locale}.json`), JSON.stringify(textsFor(locale, js, rails)));
  }
  return { locales: availableLocales.length, withUpstreamTranslations: translated.length };
}

/** Locales upstream ships translations for; kept in sync with `availableLocales`. */
export async function upstreamLocales(upstream) {
  const files = await readdir(path.join(upstream, 'app/javascript/mastodon/locales'));
  return files.filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -'.json'.length)).sort();
}
