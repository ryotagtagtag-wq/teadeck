import { cp, mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { writeOfflineFiles } from './offline_manifest.mjs';
import { writeTexts } from './texts.mjs';
import { requireToolchain, runYarn } from './toolchain.mjs';
import { assertPrepared, fingerprint, sourceEntries } from './build_state.mjs';
import { designsCss } from '../integration/themes/css.ts';
import { designIds, designs } from '../integration/themes/index.ts';

const root = path.resolve(import.meta.dirname, '..');
const upstream = path.join(root, '.work/upstream');
const dist = path.join(root, 'dist');
requireToolchain();
await assertPrepared(root);
await stat(path.join(upstream, 'teadeck.vite.config.mts')).catch(() => {
  throw new Error('Run node scripts/prepare.mjs first');
});
// Integration edits must reach the bundle without a destructive upstream re-import.
await rm(path.join(upstream, 'app/javascript/teadeck'), { recursive: true, force: true });
await cp(path.join(root, 'integration'), path.join(upstream, 'app/javascript/teadeck'), {
  recursive: true, filter: source => path.basename(source) !== 'vite.config.mts',
});
await cp(path.join(root, 'integration/vite.config.mts'), path.join(upstream, 'teadeck.vite.config.mts'));
// The designs' variables and fonts, from integration/themes/*.ts.
await writeFile(path.join(upstream, 'app/javascript/teadeck/themes/designs.css'), designsCss(designs));
const inputs = await fingerprint(root, sourceEntries);
await rm(path.join(root, '.work/built.sha256'), { force: true });
const run = (args, env) => runYarn(args, upstream, env);
run(['install', '--immutable']);
run(['vite', 'build', '--config', 'teadeck.vite.config.mts', '--mode', 'production'], {
  NODE_ENV: 'production', RAILS_ENV: 'production',
});
const manifest = JSON.parse(await readFile(path.join(dist, '.vite/manifest.json'), 'utf8'));
const theme = manifest['styles/application.scss'];
if (!theme?.file?.endsWith('.css')) throw new Error('Missing upstream default theme in Vite manifest');
const nestedIndex = path.join(dist, 'teadeck/index.html');
let html = await readFile(nestedIndex, 'utf8');
html = html.replace('<!-- TEADECK_THEME -->', `<link rel="stylesheet" href="/${theme.file}" integrity="${theme.integrity ?? ''}" crossorigin="anonymous">`);
// Mastodon's modules, which app_start.ts imports only once the server answered:
// bootstrap.ts preloads them meanwhile for a signed-in account.
const starter = Object.values(manifest).find((chunk) => chunk.dynamicImports?.includes('mastodon/main.tsx'));
if (!starter) throw new Error('Missing the chunk that starts Mastodon in Vite manifest');
const appModules = new Set();
const visit = (key) => {
  const file = manifest[key]?.file;
  if (!file || appModules.has(file)) return;
  appModules.add(file);
  for (const next of manifest[key].imports ?? []) visit(next);
};
for (const key of starter.dynamicImports) visit(key);
html = html.replace('<!-- TEADECK_ASSETS -->', `<script id="teadeck-app-modules" type="application/json">${JSON.stringify([...appModules].sort())}</script>`);
await writeFile(nestedIndex, html);
await rename(nestedIndex, path.join(dist, 'index.html'));
await rm(path.join(dist, 'teadeck'), { recursive: true, force: true });
// Files the client requests by absolute path, served by Rails from public/ upstream:
// notification sounds, Twemoji images and sprite sheet, OCR language data, status GIFs.
for (const item of ['sounds', 'emoji', 'ocr', 'loading.gif', 'loading.png', 'oops.gif', 'oops.png']) {
  await cp(path.join(upstream, 'public', item), path.join(dist, item), { recursive: true });
}
const sourceStage = path.join(root, '.work/source-archive');
await rm(sourceStage, { recursive: true, force: true });
await mkdir(path.join(sourceStage, 'teadeck-source'), { recursive: true });
await cp(upstream, path.join(sourceStage, 'teadeck-source/upstream'), {
  recursive: true,
  filter: source => !['.git', 'node_modules'].includes(path.basename(source)),
});
for (const item of sourceEntries) {
  const source = path.join(root, item);
  await cp(source, path.join(sourceStage, 'teadeck-source', item), { recursive: true });
}
const archive = spawnSync('tar', [
  '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner',
  '-czf', path.join(dist, 'source.tar.gz'), '-C', sourceStage, 'teadeck-source',
], { stdio: 'inherit' });
if (archive.status !== 0) throw new Error('Source archive creation failed');
await rm(sourceStage, { recursive: true, force: true });
// What the image packages besides dist/: the logos the container picks from at
// startup, including Mastodon's own for TEADECK_LOGO=mastodon.
const imageAssets = path.join(root, '.work/image');
await rm(imageAssets, { recursive: true, force: true });
await mkdir(imageAssets, { recursive: true });
await cp(path.join(root, 'integration/logos'), path.join(imageAssets, 'logos'), { recursive: true });
await cp(path.join(upstream, 'app/javascript/images/logo-symbol-wordmark.svg'), path.join(imageAssets, 'logo-default.svg'));
// The designs TEADECK_THEME may name, one per line, for the container's entrypoint.
await writeFile(path.join(imageAssets, 'designs'), `${designIds.join('\n')}\n`);
// Teadeck's own texts per interface language, from upstream's translations plus
// Teadeck's own sentences; the sign-in page runs before Mastodon's own are loaded.
const textFiles = await writeTexts(dist, upstream);
console.log(`Teadeck texts: ${textFiles.locales} languages, ${textFiles.withUpstreamTranslations} of them with upstream translations`);
// Last, so the offline file list covers the finished dist/.
// The nginx configuration sets index.html's security headers, which the service worker stores with it.
const offline = await writeOfflineFiles(dist, manifest, path.join(root, 'integration/sw.js'), [path.join(root, 'container/nginx.conf')]);
console.log(`Offline version ${offline.version}: ${offline.lists.core.length} core, ${offline.lists.background.length} background, ${offline.lists.onDemand.length} on demand`);
console.log(`Static client written to ${dist}`);
if (inputs !== await fingerprint(root, sourceEntries)) throw new Error('Sources changed during the build. Build again before verifying or deploying.');
await writeFile(path.join(root, '.work/built.sha256'), inputs);
