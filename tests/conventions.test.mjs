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
