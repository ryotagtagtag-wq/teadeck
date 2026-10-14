import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

// The designs follow one set of rules: every half sets the same variables, and
// only the six blocks that set them name a design (themes.css).
const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Top-level rules as [selector, body]; @font-face and other at-rules are left out. */
function rules(css) {
  const found = [];
  let depth = 0;
  let start = 0;
  let selector = '';
  for (let index = 0; index < css.length; index++) {
    if (css[index] === '{') {
      if (depth === 0) { selector = css.slice(start, index).trim(); start = index + 1; }
      depth++;
    } else if (css[index] === '}') {
      depth--;
      if (depth === 0) { if (!selector.startsWith('@')) found.push([selector, css.slice(start, index)]); start = index + 1; }
    }
  }
  return found;
}

const declared = (body) => [...body.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]);

test('every design half sets the same variables, in the same order, and nothing else', async () => {
  const css = withoutComments(await read('integration/themes.css'));
  const blocks = rules(css).filter(([selector]) => selector.includes("data-teadeck-theme='"));
  const halves = blocks.map(([selector]) => selector);
  assert.deepEqual(halves, ['assam', 'sencha', 'hibiscus'].flatMap((theme) => ['dark', 'light'].map((scheme) => `html[data-teadeck-theme='${theme}'][data-color-scheme='${scheme}']`)));

  const [reference, ...others] = blocks.map(([selector, body]) => ({ selector, names: declared(body), body }));
  for (const { selector, names } of others) assert.deepEqual(names, reference.names, selector);
  for (const { selector, body } of blocks.map(([selector, body]) => ({ selector, body }))) {
    // Only variables: a block that also styled an element would be a rule of its own.
    const plain = body.split(';').map((part) => part.trim()).filter(Boolean).filter((part) => !part.startsWith('--'));
    assert.deepEqual(plain, [], selector);
  }
});

test('no other rule names a design, and every variable the shared rules read is set by the designs', async () => {
  const css = withoutComments(await read('integration/themes.css'));
  const all = rules(css);
  const blocks = all.filter(([selector]) => selector.includes("data-teadeck-theme='"));
  const contract = new Set(declared(blocks[0][1]));
  for (const file of ['integration/themes.css', 'integration/shell.css', 'integration/large_composer.css']) {
    const sheet = withoutComments(await read(file));
    const naming = rules(sheet).filter(([selector]) => /data-teadeck-theme=['"]/.test(selector)).length;
    assert.equal(naming, file === 'integration/themes.css' ? 6 : 0, file);
  }
  // Shared rules read Teadeck's own variables only from the contract.
  const shared = all.filter(([selector]) => selector.includes('html[data-teadeck-theme]')).map(([, body]) => body).join('\n');
  const read_ = new Set([...shared.matchAll(/var\((--(?:teadeck|font|md)-[\w-]+)/g)].map((match) => match[1]));
  for (const name of read_) assert.ok(contract.has(name), `${name} is read but not set by every design`);
});

test('the designs offered in the settings are exactly the ones themes.css defines', async () => {
  const settings = await read('integration/frontend_settings.ts');
  const values = JSON.parse(settings.match(/const themeValues: Theme\[\] = (\[[^\]]*\])/)[1].replaceAll("'", '"'));
  const css = withoutComments(await read('integration/themes.css'));
  const designs = [...new Set([...css.matchAll(/data-teadeck-theme='(\w+)'/g)].map((match) => match[1]))];
  assert.deepEqual(values.filter((value) => value !== 'mastodon'), designs);
});
