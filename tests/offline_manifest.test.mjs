import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyOfflineFile, emojiDataFiles } from '../scripts/offline_manifest.mjs';

const viteManifest = {
  '../../node_modules/emojibase-data/de/compact.json': { file: 'assets/compact-C3-puptT.json' },
  '../../node_modules/emojibase-data/en/shortcodes/iamcal.json': { file: 'assets/iamcal-DP8KB4yM.json' },
  'app/javascript/teadeck/index.html': { file: 'teadeck/index.html' },
};
const emojiData = emojiDataFiles(viteManifest);
const classify = (file) => classifyOfflineFile(file, emojiData);

test('everything needed to start and use the app is cached at install', () => {
  for (const file of ['index.html', 'main-BxVV_sC8.js', 'assets/themes/default-Rwi0K8PX.css', 'assets/inter-regular-COLGFB3M.woff2',
    'assets/elephant_ui_plane-Cfmrathl.svg', 'sounds/boop.ogg', 'loading.gif', 'emoji_picker-Bc2AoK40.js']) {
    assert.equal(classify(file), 'core', file);
  }
});

test('emoji images and illustrations load in the background after start', () => {
  for (const file of ['emoji/1f600.svg', 'emoji/sheet_16_0.png', 'assets/oracle-FU_DivV9.png']) {
    assert.equal(classify(file), 'background', file);
  }
});

test('per-language and rarely used files are cached when first used', () => {
  for (const file of ['intl/de-Abc123.js', 'intl/de-intl-pluralrules-X.js', 'texts/de.json', 'texts/zh-CN.json',
    'assets/compact-C3-puptT.json', 'assets/iamcal-DP8KB4yM.json',
    'ocr/lang-data/eng.traineddata.gz', 'assets/tesseract-core.wasm-DJna89ck.js', 'tesseract-core.wasm-DTqDpzeW.js',
    'assets/roboto-regular-webfont-BCB7oXd3.ttf', 'assets/roboto-regular-webfont-IvmaNTIq.svg']) {
    assert.equal(classify(file), 'onDemand', file);
  }
});

test('never caches the service worker, its file list, source archive or precompressed copies', () => {
  for (const file of ['sw.js', 'offline-5c698f2947ea67b9.json', 'source.tar.gz', 'main-BxVV_sC8.js.gz', '.vite/manifest.json']) {
    assert.equal(classify(file), null, file);
  }
});

test('the offline version changes with the header configuration alone; the manifest carries content hashes', async () => {
  const { mkdtemp, mkdir, rm, writeFile, readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { writeOfflineFiles } = await import('../scripts/offline_manifest.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'teadeck-manifest-'));
  try {
    const site = join(dir, 'dist');
    await mkdir(join(site, 'emoji'), { recursive: true });
    await writeFile(join(site, 'index.html'), '<html></html>');
    await writeFile(join(site, 'emoji/1f600.svg'), '<svg>a</svg>');
    const worker = join(dir, 'sw.js');
    await writeFile(worker, "const VERSION = '__TEADECK_OFFLINE_VERSION__';");
    const config = join(dir, 'nginx.conf');
    const build = async () => {
      for (const file of await (await import('node:fs/promises')).readdir(site)) if (file.startsWith('offline-') || file === 'sw.js') await rm(join(site, file));
      return writeOfflineFiles(site, {}, worker, [config]);
    };

    await writeFile(config, "add_header Content-Security-Policy \"default-src 'none'\";");
    const first = await build();
    await writeFile(config, "add_header Content-Security-Policy \"default-src 'none'; frame-src https:\";");
    const headersOnly = await build();
    assert.notEqual(headersOnly.version, first.version);

    await writeFile(join(site, 'emoji/1f600.svg'), '<svg>b</svg>');
    const emojiChanged = await build();
    assert.notEqual(emojiChanged.version, headersOnly.version);
    const manifest = JSON.parse(await readFile(join(site, `offline-${emojiChanged.version}.json`), 'utf8'));
    assert.deepEqual(manifest.background, ['emoji/1f600.svg']);
    assert.match(manifest.hashes['emoji/1f600.svg'], /^[0-9a-f]{16}$/);
    assert.match(await readFile(join(site, 'sw.js'), 'utf8'), new RegExp(emojiChanged.version));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
