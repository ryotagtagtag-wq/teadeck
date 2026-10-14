import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { designsCss, halfVariables } from '../integration/themes/css.ts';
import { designAttributeNames, designIds, designs, halfAttributes } from '../integration/themes/index.ts';
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

test('only Hibiscus and Rooibos choose angular steam, and only the cup of blood has none and drips', () => {
  const steam = { hibiscus: 'angular', lapsang: 'none' };
  for (const design of designs) for (const scheme of ['dark', 'light']) {
    const attributes = halfAttributes(design[scheme]);
    assert.equal(attributes.teadeckLogoSteam, steam[design.id] ?? 'soft', `${design.id}/${scheme}`);
    assert.equal(attributes.teadeckLogoBlood, design.id === 'lapsang' ? 'drips' : 'none', `${design.id}/${scheme}: drips`);
  }
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

test('only Lapsang Souchong and Earl Grey have fangs, and only their cup has an opaque tea', () => {
  for (const design of designs) for (const scheme of ['dark', 'light']) {
    const half = design[scheme];
    assert.equal(halfAttributes(half).teadeckBrandFangs, design.id === 'lapsang' ? 'fangs' : 'none', `${design.id}/${scheme}`);
    const variables = Object.fromEntries(halfVariables(half));
    assert.equal(variables['--td-logo-tea-opacity'], design.id === 'lapsang' ? '1' : '0.94', `${design.id}/${scheme}: tea`);
  }
  const lapsang = designs.find((design) => design.id === 'lapsang');
  assert.ok(lapsang.fonts.some((font) => font.family === 'Teadeck UnifrakturMaguntia'));
  assert.equal(designLabel(lapsang, 'en'), 'Lapsang Souchong & Earl Grey');
});

test('only Lapsang Souchong and Earl Grey have gothic corners, ornaments, arch avatars, cross titles and drops', () => {
  for (const design of designs) for (const scheme of ['dark', 'light']) {
    const half = design[scheme];
    const gothic = design.id === 'lapsang';
    const attributes = halfAttributes(half);
    const name = `${design.id}/${scheme}`;
    assert.equal(half.shape === 'gothic', gothic, `${name}: shape`);
    assert.equal(attributes.teadeckOrnaments, gothic ? 'gothic' : 'none', `${name}: ornaments`);
    assert.equal(attributes.teadeckAvatars === 'arch', gothic, `${name}: avatars`);
    assert.equal(attributes.teadeckTitles === 'cross', gothic, `${name}: titles`);
    assert.equal(attributes.teadeckBadges === 'drop', gothic, `${name}: badges`);
  }
});

test('gothic corners are straight: no clips, no radii and a frame of its own colour', () => {
  const lapsang = designs.find((design) => design.id === 'lapsang');
  for (const scheme of ['dark', 'light']) {
    const variables = Object.fromEntries(halfVariables(lapsang[scheme]));
    assert.ok(Object.entries(variables).filter(([name]) => name.startsWith('--td-clip-')).every(([, value]) => value === 'none'), scheme);
    assert.ok(Object.entries(variables).filter(([name]) => name.startsWith('--td-radius-')).every(([, value]) => value === '0'), scheme);
    assert.match(variables['--td-ornament'], /^#[0-9a-f]{6}$/, scheme);
    assert.match(variables['--td-main-line'], /^rgb\(/, scheme);
  }
});

test('each of the new choices changes only its own attribute', () => {
  const base = halfAttributes(assam);
  for (const [choice, value, attribute] of [['avatars', 'arch', 'teadeckAvatars'], ['ornaments', '#7e1a22', 'teadeckOrnaments']]) {
    const changed = halfAttributes({ ...assam, [choice]: value });
    const differing = Object.keys(base).filter((name) => base[name] !== changed[name]);
    assert.deepEqual(differing, [attribute], choice);
  }
});

test('mastodon.css gives the new values their rules, and no other design\'s', async () => {
  const css = withoutComments(await read('integration/themes/mastodon.css'));
  for (const selector of ["data-teadeck-titles='cross'", "data-teadeck-avatars='arch'", "data-teadeck-badges='drop'", "data-teadeck-ornaments='gothic'"]) {
    assert.ok(css.includes(selector), selector);
  }
  // Layered masks, not mask-border: Firefox has no mask-border.
  assert.match(css, /--td-ornament-tl:\s*url\(/);
  assert.doesNotMatch(css, /mask-border/);
});

test('the Markdown details of the chamfered and gothic designs are scoped to their shape or ornaments', async () => {
  const css = withoutComments(await read('integration/themes/mastodon.css'));
  const rules = allRules(css);
  const find = (...parts) => rules.filter(([selector]) => parts.every((part) => selector.includes(part)));
  // Code blocks and inline code: the callout cut and the tag cut when chamfered, straight corners when chamfered or gothic.
  assert.ok(find("data-teadeck-shape='chamfered'", '.teadeck-code').some(([, body]) => /clip-path:\s*var\(--td-clip-callout\)/.test(body)), 'chamfered code block');
  assert.ok(find("data-teadeck-shape='chamfered'", ':not(pre)').some(([, body]) => /clip-path:\s*var\(--td-clip-tag\)/.test(body)), 'chamfered inline code');
  assert.ok(find("data-teadeck-shape='gothic'", '.teadeck-code').some(([, body]) => /border-radius:\s*0/.test(body)), 'gothic code block');
  assert.ok(find("data-teadeck-shape='gothic'", ':not(pre)').some(([, body]) => /border-radius:\s*0/.test(body)), 'gothic inline code');
  // The frame along the cut of a chamfered code block.
  assert.ok(css.includes(".status__content__text .teadeck-code,"), 'chamfered frame lists code blocks');
  // Quotes: square ends on both shapes, 3px in the accent only when chamfered.
  assert.ok(find("data-teadeck-shape='chamfered'", 'blockquote', '::before').some(([, body]) => /width:\s*3px/.test(body)), 'chamfered quote bar');
  assert.ok(find("data-teadeck-shape", 'blockquote', '::before').some(([selector, body]) => selector.includes("'gothic'") && /border-radius:\s*0/.test(body)), 'gothic quote bar');
  // Gothic titles and the rule's ornament: only where the gothic ornaments are chosen.
  const titles = find("data-teadeck-ornaments='gothic'", 'h1');
  assert.ok(titles.some(([, body]) => /font-family:\s*var\(--td-font-title\)/.test(body) && /text-transform:\s*none/.test(body) && /letter-spacing:\s*0/.test(body)), 'gothic titles');
  assert.ok(find("data-teadeck-ornaments='gothic'", 'hr::before').length === 1, 'gothic rule ornament');
  // Blackletter in post text is used only by the gothic titles.
  for (const [selector, body] of rules.filter(([selector, body]) => selector.includes('status__content__text') && /font-family:\s*var\(--td-font-title\)/.test(body))) {
    assert.ok(selector.includes("data-teadeck-ornaments='gothic'") || selector.includes('data-teadeck-titles'), `blackletter outside its design: ${selector}`);
  }
});

test('the blackletter is bundled with its licence and is a real woff2', async () => {
  const font = await readFile(path.join(root, 'integration/fonts/unifraktur-maguntia-latin.woff2'));
  assert.equal(font.subarray(0, 4).toString('latin1'), 'wOF2');
  assert.match(await read('integration/fonts/OFL-unifrakturmaguntia.txt'), /SIL Open Font License/);
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

// A design that combines choices no shipped design combines, so a rule that
// quietly ties one choice to another shows up.
const assam = designs.find((design) => design.id === 'assam').dark;
const hibiscus = designs.find((design) => design.id === 'hibiscus').dark;
const synthetic = {
  ...assam,
  shape: 'chamfered',
  type: { ...assam.type, caps: false },
  secondaryButtons: { background: '#123456', text: '#abcdef' },
  posts: 'cards',
  titles: 'centered',
  icons: 'bold',
  logo: { tea: '#100001', teaDark: '#100002', teaLight: '#100003', teaShade: '#100004', line: '#100005', steam: '#100006', body: '#100007', bodyDark: '#100008', highlight: '#100009' },
};

test('each design choice is its own: changing one changes only its own attribute', () => {
  const choices = ['shape', 'posts', 'columns', 'titles', 'navFooter', 'brandName', 'selection', 'badges', 'captions', 'controls', 'links'];
  const base = halfAttributes(assam);
  assert.deepEqual(Object.keys(base).sort(), [...designAttributeNames].sort());
  for (const choice of choices) {
    assert.notDeepEqual(assam[choice], hibiscus[choice], `${choice}: Assam and Hibiscus should differ to test it`);
    const changed = halfAttributes({ ...assam, [choice]: hibiscus[choice] });
    const differing = Object.keys(base).filter((name) => base[name] !== changed[name]);
    assert.equal(differing.length, 1, `${choice} changes ${differing.join(', ')}`);
  }
});

test('a synthetic design keeps every value it sets, whatever else it chooses', () => {
  const variables = Object.fromEntries(halfVariables(synthetic));
  // Chamfered corners without capitals.
  assert.equal(variables['--td-cut-overlay'], '28px');
  assert.equal(variables['--td-cut-panel'], '18px');
  assert.match(variables['--td-clip-card'], /^polygon/);
  assert.equal(variables['--td-caps'], 'none');
  // Secondary buttons in colours of their own.
  assert.equal(variables['--td-secondary-bg'], '#123456');
  assert.equal(variables['--td-secondary-fg'], '#abcdef');
  assert.equal(variables['--td-secondary-fill'], '100%');
  // Every role of the teacup.
  for (const [role, value] of Object.entries(synthetic.logo)) {
    assert.equal(variables[`--td-logo-${role.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`], value, role);
  }
  // Cards with centred titles.
  const attributes = halfAttributes(synthetic);
  assert.equal(attributes.teadeckPosts, 'cards');
  assert.equal(attributes.teadeckTitles, 'centered');
  assert.equal(attributes.teadeckLogoSteam, 'soft');
  // A rounded design gets no clips at all.
  assert.ok(halfVariables(assam).filter(([name]) => name.startsWith('--td-clip-')).every(([, value]) => value === 'none'));
});

test('in mastodon.css a choice\'s rules do only that choice\'s job', async () => {
  const css = withoutComments(await read('integration/themes/mastodon.css'));
  const known = new Set(designAttributeNames.map((name) => `data-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`));
  // The shape is geometry: corners, the width of a quote's bar and where focus rings sit, nothing about type or colour.
  const geometry = new Set([
    'clip-path', 'outline', 'outline-offset', 'border-radius', 'border-color', 'width',
    'background-image', 'background-position', 'background-size', 'background-repeat',
  ]);
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const [, attribute] of selector.matchAll(/\[(data-teadeck-[a-z-]+)=/g)) {
      assert.ok(known.has(attribute), `${attribute} is not one of designAttributeNames`);
    }
    if (selector.includes('data-teadeck-shape')) {
      for (const [, property] of body.matchAll(/([a-z-]+)\s*:/g)) {
        assert.ok(property.startsWith('--td-chamfer-') || geometry.has(property), `shape rule sets ${property}: ${selector.trim()}`);
      }
    }
  }
});

test('spaced columns keep the same navigation gutter as the other designs', async () => {
  const css = withoutComments(await read('integration/themes/mastodon.css'));
  const rule = allRules(css).find(([selector]) => selector.includes("data-teadeck-columns='spaced'") && selector.includes('multi_column__root'));
  assert.ok(rule, 'the spaced column role has no layout rule');
  assert.match(rule[1], /gap:\s*var\(--space-1\)/);
});

test('the shape framework reaches the visible composer and its component roles', async () => {
  const css = withoutComments(await read('integration/themes/mastodon.css'));
  const expected = [
    ['form.teadeck-large-composer', '--td-clip-overlay'],
    ['form.teadeck-composer:not(.teadeck-large-composer)', '--td-clip-panel'],
    ['._compose_redesign_attachments__mediaUpload', '--td-clip-panel'],
    ['._comp_callout_redesign__rootLarge', '--td-clip-callout'],
    ['form.teadeck-large-composer textarea', '--td-clip-panel'],
    ['textarea', '--td-clip-field'],
    ['._comp_button_redesign__base', '--td-clip-secondary'],
    ['._comp_button_redesign__base._comp_button_redesign__md', '--td-clip-field'],
    ['._comp_button_redesign__base._comp_button_redesign__lg', '--td-clip-main'],
  ];
  for (const [selector, variable] of expected) {
    const rule = allRules(css).find(([selectors, body]) => selectors.includes(selector) && body.includes(variable));
    assert.ok(rule, `${selector} has no shape rule`);
    assert.match(rule[1], new RegExp(`clip-path\\s*:\\s*var\\(${variable.replaceAll('-', '\\-')}\\)`), selector);
  }
  assert.match(css, /background-image:\s*linear-gradient\(/, 'chamfered frames draw their diagonal edges');
  assert.match(await read('integration/large_composer.css'), /clip-path:\s*var\(--td-clip-overlay/);
  assert.match(await read('integration/shell.css'), /clip-path:\s*var\(--td-clip-overlay/);
});

test('the copy button of a code block keeps its muted colour inside posts', async () => {
  const css = withoutComments(await read('integration/themes/mastodon.css'));
  const rule = allRules(css).find(([selector]) => selector.trim() === '.status__content__text .teadeck-code__copy');
  assert.ok(rule, 'the copy button has no rule inside the post');
  assert.match(rule[1], /color:\s*var\(--td-content-muted/);
});
