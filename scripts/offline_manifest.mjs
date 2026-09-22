import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

/**
 * Vite minifies everything it bundles, but the service worker is copied rather
 * than bundled, so its comments would otherwise be served to every browser.
 * terser comes from the pinned upstream, like playwright in scripts/verify.mjs.
 * Only comments and whitespace go: no renaming or rewriting in the one file
 * that decides whether the app starts offline at all.
 */
async function stripComments(source) {
  const upstream = path.resolve(import.meta.dirname, '../.work/upstream/package.json');
  const { minify } = createRequire(upstream)('terser');
  const { code } = await minify(source, { compress: false, mangle: false, format: { comments: false } });
  if (!code) throw new Error('The service worker came back empty from terser');
  return code;
}

/** Never cached by the service worker. */
function isExcluded(file) {
  // Precompressed copies (x.js.gz next to x.js); not data that is gzip by format (OCR models).
  return /\.(js|css|json|svg|html|txt|map)\.gz$/.test(file) || file.startsWith('.vite/') || file === 'source.tar.gz'
    || file === 'sw.js' || /^offline-[0-9a-f]+\.json$/.test(file);
}

/**
 * Sorts a dist file into the service worker's lists:
 * - core: everything needed to start and use the app, cached at install.
 * - background: large but commonly shown (emoji images, illustrations),
 *   cached asynchronously after the app started.
 * - onDemand: per interface language (translations of the application and of
 *   the sign-in page, emoji data; the UI offers ~100 languages but uses one)
 *   or rarely used (OCR, legacy font formats), cached when first requested,
 *   i.e. the language in use is cached on the first start.
 * `emojiDataFiles` are the emoji data files from Vite's manifest.
 */
export function classifyOfflineFile(file, emojiDataFiles) {
  if (isExcluded(file)) return null;
  if (emojiDataFiles.has(file) || file.startsWith('intl/') || file.startsWith('shell-locales/')) return 'onDemand';
  if (file.startsWith('emoji/')) return 'background';
  if (file.startsWith('ocr/') || /(^|\/)tesseract-core/.test(file)) return 'onDemand';
  if (/\.(woff|ttf|eot)$/.test(file) || /webfont-[^/]*\.svg$/.test(file)) return 'onDemand';
  if (/^assets\/.*\.(png|jpe?g|webp)$/.test(file)) return 'background';
  return 'core';
}

/** Emoji data files (per-locale emojibase JSON), whose built names don't reveal what they are. */
export function emojiDataFiles(viteManifest) {
  return new Set(Object.entries(viteManifest)
    .filter(([source]) => source.includes('emojibase-data/'))
    .map(([, { file }]) => file));
}

async function listFiles(dir, prefix = '') {
  const files = [];
  for (const entry of await readdir(path.join(dir, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(dir, relative));
    else files.push(relative);
  }
  return files;
}

const contentHash = (data) => createHash('sha256').update(data).digest('hex').slice(0, 16);

/**
 * Writes dist/offline-<version>.json and dist/sw.js. The version hashes every
 * listed file, the service worker source and `releaseInputs` (the web server's
 * header configuration): any of them changing installs a new service worker,
 * which also re-fetches index.html with its current response headers.
 * The manifest carries each file's content hash, so the worker can replace a
 * changed file whose name stayed the same.
 */
export async function writeOfflineFiles(dist, viteManifest, serviceWorkerSource, releaseInputs = []) {
  const emojiData = emojiDataFiles(viteManifest);
  const lists = { core: [], background: [], onDemand: [] };
  const hashes = {};
  const hash = createHash('sha256');
  for (const file of (await listFiles(dist)).sort()) {
    const list = classifyOfflineFile(file, emojiData);
    if (!list) continue;
    lists[list].push(file);
    const content = await readFile(path.join(dist, file));
    hashes[file] = contentHash(content);
    hash.update(`${file}\0${hashes[file]}\0`);
  }
  const serviceWorkerTemplate = await stripComments(await readFile(serviceWorkerSource, 'utf8'));
  // The shipped file decides the version, so editing a comment no longer makes
  // every browser install a new worker.
  hash.update(`sw.js\0${contentHash(serviceWorkerTemplate)}\0`);
  for (const input of releaseInputs) hash.update(`${path.basename(input)}\0${contentHash(await readFile(input))}\0`);
  const version = hash.digest('hex').slice(0, 16);
  await writeFile(path.join(dist, `offline-${version}.json`), JSON.stringify({ ...lists, hashes }));
  const serviceWorker = serviceWorkerTemplate.replaceAll('__TEADECK_OFFLINE_VERSION__', version);
  await writeFile(path.join(dist, 'sw.js'), serviceWorker);
  return { version, lists };
}
