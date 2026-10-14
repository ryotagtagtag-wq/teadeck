import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

// Conventions of Teadeck's own code (integration/), so it reads the same everywhere.
const root = path.resolve(import.meta.dirname, '..');
const integration = path.join(root, 'integration');

async function sources(extensions) {
  const found = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (extensions.some((extension) => entry.name.endsWith(extension))) found.push(full);
    }
  };
  await walk(integration);
  return Promise.all(found.map(async (file) => ({ file: path.relative(root, file), text: await readFile(file, 'utf8') })));
}

test('relative imports name their file with its extension, and Mastodon is imported through @/mastodon', async () => {
  for (const { file, text } of await sources(['.ts', '.tsx'])) {
    for (const [, specifier] of text.matchAll(/(?:from\s+|import\s*\(?\s*)'([^']+)'/g)) {
      if (specifier.startsWith('.')) {
        assert.match(specifier, /\.(ts|tsx|css|svg|json|mts)(\?[\w&=]+)?$/, `${file}: '${specifier}' without extension`);
        assert.doesNotMatch(specifier, /\/mastodon\//, `${file}: '${specifier}' reaches into Mastodon by path; use @/mastodon`);
      }
    }
  }
});

test('components style through CSS classes; an inline style only passes a value as a --teadeck- variable', async () => {
  for (const { file, text } of await sources(['.tsx'])) {
    for (const [, body] of text.matchAll(/\bstyle=\{\{([^}]*)\}\}/g)) {
      for (const [, property] of body.matchAll(/['"]?([\w-]+)['"]?\s*:/g)) {
        assert.match(property, /^--teadeck-/, `${file}: inline style sets ${property}`);
      }
    }
    assert.doesNotMatch(text, /\bstyle=\{(?!\{)/, `${file}: passes a style object; use a class`);
  }
});

test('localStorage and sessionStorage are used through browser_storage.ts only, with its key names', async () => {
  for (const { file, text } of await sources(['.ts', '.tsx'])) {
    if (file === 'integration/browser_storage.ts') continue;
    const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\b(localStorage|sessionStorage)\b/, `${file} uses the browser's storage directly`);
    assert.doesNotMatch(code, /['"`]teadeck\.[a-zA-Z]/, `${file} names a storage key of its own`);
  }
});

test('what the server offers is asked of server_features.ts, not read from Mastodon\'s initial state', async () => {
  const patches = path.join(root, 'patches');
  const files = [
    ...(await sources(['.ts', '.tsx'])),
    ...await Promise.all((await readdir(patches)).map(async (name) => ({ file: `patches/${name}`, text: await readFile(path.join(patches, name), 'utf8') }))),
  ];
  for (const { file, text } of files) {
    const added = file.startsWith('patches/') ? text.split('\n').filter((line) => line.startsWith('+')).join('\n') : text;
    assert.doesNotMatch(added, /initialState\??\.meta\b[^;\n]*teadeck_|meta\??\.teadeck_/, `${file} reads a teadeck_ field of initialState.meta`);
  }
});

test('texts live in texts.ts and are shown through t(); no component keeps a table of its own', async () => {
  for (const { file, text } of await sources(['.ts', '.tsx'])) {
    if (file === 'integration/texts.ts' || file.startsWith('integration/themes/')) continue;
    assert.doesNotMatch(text, /\bde:\s*['"`]/, `${file} keeps German texts of its own`);
  }
});
