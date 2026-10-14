import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { designsCss, halfVariables } from '../integration/themes/css.ts';
import { designIds, designs } from '../integration/themes/index.ts';
import { designLabel } from '../integration/themes/tokens.ts';

// The design framework (integration/themes/): designs are values in Teadeck's
// own terms; mastodon.css alone applies them to Mastodon.
const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

test('every half of every design yields the same variables, all with a value', () => {
  const [reference, ...others] = designs.flatMap((design) => ['dark', 'light'].map((scheme) => ({ name: `${design.id}/${scheme}`, variables: halfVariables(design[scheme]) })));
  for (const { name, variables } of [reference, ...others]) {
    assert.deepEqual(variables.map(([variable]) => variable), reference.variables.map(([variable]) => variable), name);
    for (const [variable, value] of variables) assert.ok(typeof value === 'string' && value.trim() !== '' && !value.includes('undefined'), `${name} ${variable}`);
  }
  const css = designsCss(designs);
  for (const id of designIds) for (const scheme of ['dark', 'light']) assert.ok(css.includes(`html[data-teadeck-theme='${id}'][data-color-scheme='${scheme}'] {`), `${id}/${scheme}`);
});

test('the designs name nothing of Mastodon: no CSS variables, classes or selectors in their files', async () => {
  const dir = path.join(root, 'integration/themes');
  const sources = (await readdir(dir)).filter((file) => file.endsWith('.ts') && !['css.ts', 'tokens.ts', 'index.ts'].includes(file));
  assert.ok(sources.length >= designs.length);
  for (const file of sources) {
    const text = (await read(`integration/themes/${file}`)).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(text, /var\(|--[a-z]|_comp_|data-teadeck-theme|\.status__|\.account__/, file);
  }
});

test('mastodon.css is the only stylesheet that sets Mastodon\'s design variables or names a design', async () => {
  const integration = path.join(root, 'integration');
  const sheets = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.css')) sheets.push(path.relative(root, full));
    }
  };
  await walk(integration);
  assert.ok(sheets.includes('integration/themes/mastodon.css'));
  for (const sheet of sheets.filter((file) => file !== 'integration/themes/mastodon.css')) {
    const css = withoutComments(await read(sheet));
    assert.doesNotMatch(css, /(^|[\s;{])--(color-grey|color-indigo|base-color|radius|font-heading|font-body|font-monospace)-?[\w-]*\s*:/m, `${sheet} sets a variable of Mastodon's design`);
    assert.doesNotMatch(css, /data-teadeck-theme=['"]/, `${sheet} names a design`);
  }
  // mastodon.css itself never names a design either: it reads their variables.
  assert.doesNotMatch(withoutComments(await read('integration/themes/mastodon.css')), /data-teadeck-theme=['"]/);
});

/** Every rule's selector and body, also inside @media and other at-rules. */
function allRules(css) {
  const found = [];
  let depth = 0;
  let start = 0;
  const stack = [];
  for (let index = 0; index < css.length; index++) {
    if (css[index] === '{') {
      stack.push(css.slice(start, index).trim());
      start = index + 1;
      depth++;
    } else if (css[index] === '}') {
      const selector = stack.pop();
      if (!selector.startsWith('@')) found.push([selector, css.slice(start, index)]);
      start = index + 1;
      depth--;
    }
  }
  return found;
}

test('outside mastodon.css, stylesheets read only Teadeck\'s variables and name only Teadeck\'s own markup', async () => {
  const integration = path.join(root, 'integration');
  const sheets = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.css') && full !== path.join(integration, 'themes/mastodon.css')) sheets.push(path.relative(root, full));
    }
  };
  await walk(integration);
  assert.ok(sheets.includes('integration/shell.css') && sheets.includes('integration/large_composer.css'), sheets.join(' '));
  const bridge = withoutComments(await read('integration/themes/mastodon.css'));
  const provided = new Set([
    ...halfVariables(designs[0].dark).map(([variable]) => variable),
    ...[...bridge.matchAll(/(--td-[\w-]+)\s*:/g)].map((match) => match[1]),
  ]);
  for (const sheet of sheets) {
    const css = withoutComments(await read(sheet));
    for (const [, name] of css.matchAll(/var\((--[\w-]+)/g)) {
      assert.match(name, /^--(td|teadeck)-/, `${sheet} reads ${name}`);
      if (name.startsWith('--td-')) assert.ok(provided.has(name), `${sheet} reads ${name}, which nothing sets`);
    }
    for (const [selector] of allRules(css)) {
      // The last line before the brace is the selector (declarations of an enclosing rule end with ';').
      const own = selector.split(';').at(-1).replace(/::?[\w-]+(\([^)]*\))?/g, '').replace(/\[hidden\]/g, '');
      assert.doesNotMatch(own, /\[/, `${sheet}: ${selector} selects by an attribute of Mastodon's markup`);
      for (const [, token] of own.matchAll(/[.#]([\w-]+)/g)) {
        assert.match(token, /^teadeck-/, `${sheet}: ${selector} names ${token}`);
      }
    }
  }
});

test('every Teadeck variable mastodon.css reads is set by each design or by mastodon.css itself', async () => {
  const css = withoutComments(await read('integration/themes/mastodon.css'));
  const provided = new Set([
    ...halfVariables(designs[0].dark).map(([variable]) => variable),
    ...[...css.matchAll(/(--td-[\w-]+)\s*:/g)].map((match) => match[1]),
  ]);
  const used = new Set([...css.matchAll(/var\((--td-[\w-]+)/g)].map((match) => match[1]));
  for (const variable of used) assert.ok(provided.has(variable), `${variable} is read but never set`);
  // And the designs' values only lean on aliases mastodon.css provides.
  const aliases = new Set([...css.matchAll(/(--td-[\w-]+)\s*:/g)].map((match) => match[1]));
  for (const design of designs) for (const scheme of ['dark', 'light']) {
    const own = new Set(halfVariables(design[scheme]).map(([variable]) => variable));
    for (const [, value] of halfVariables(design[scheme])) {
      for (const [, variable] of value.matchAll(/var\((--[\w-]+)/g)) assert.ok(own.has(variable) || aliases.has(variable), `${design.id}/${scheme}: ${variable}`);
    }
  }
});

test('the configuration docs and .env.example list every design with its names', async () => {
  const docs = await read('docs/configuration.md');
  const env = await read('.env.example');
  for (const design of designs) {
    const [dark, light] = [design.names.dark.en, design.names.light.en];
    assert.match(docs, new RegExp(`\\| \`${design.id}\` \\| ${dark}[^|]*\\| ${light} \\|`), `docs: ${design.id}`);
    assert.match(env, new RegExp(`#\\s+${design.id}\\s+${dark}[^\\n]*/ ${light}`), `.env.example: ${design.id}`);
  }
  assert.match(docs, new RegExp(`\`${designIds.join('`, `')}\` or \`mastodon\``));
  assert.equal(designLabel(designs.find((design) => design.id === 'hibiscus'), 'de'), 'Hibiskus & Rooibos');
});
