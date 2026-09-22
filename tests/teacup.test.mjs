import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { checkFiles, fileFor, teacup, teacupMaterials } from '../scripts/teacup.mjs';

test('the teacups are in sync with the drawing they are generated from', async () => {
  assert.deepEqual(await checkFiles(), [], 'run node scripts/teacup.mjs --write');
  assert.deepEqual(teacupMaterials, ['glass', 'ceramic']);
});

test('the drawing decides the material, the page decides the colours', async () => {
  for (const name of [...teacupMaterials, 'flat']) {
    const svg = await readFile(fileFor(name), 'utf8');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /<\/svg>\n$/);
    // Marked as belonging to Teadeck, which is what lets it be put into the page.
    assert.match(svg, /data-teadeck-logo="teacup"/);

    // Every colour names a role and carries a fallback, so the file also works on its own.
    // Masks are left out: their black and white are coverage, not colour.
    const withoutMasks = svg.replace(/<mask[\s\S]*?<\/mask>/g, '');
    const colours = [...withoutMasks.matchAll(/(?:fill|stroke|stop-color)="([^"]+)"/g)].map((m) => m[1]);
    const fixed = colours.filter((value) => !value.startsWith('var(--teadeck-logo-') && !value.startsWith('url(#') && value !== 'none');
    assert.deepEqual(fixed, [], `${name}: colours that ignore the design`);
    for (const value of colours.filter((v) => v.startsWith('var('))) {
      assert.match(value, /^var\(--teadeck-logo-[a-z-]+, #[0-9a-f]{6}\)$/, `${name}: ${value}`);
    }
  }
});

test('only the glass cup shows the tea through its wall', () => {
  // Same geometry, one structural difference: where the liquid is drawn.
  assert.match(teacup('glass'), /clip-path="url\(#bowl-glass\)" opacity="0\.94"/);
  assert.doesNotMatch(teacup('ceramic'), /opacity="0\.94"/);
  assert.match(teacup('ceramic'), /clip-path="url\(#surface-ceramic\)"/);
});

test('every referenced gradient and clip path is defined in the same file', async () => {
  for (const name of [...teacupMaterials, 'flat']) {
    const svg = await readFile(fileFor(name), 'utf8');
    const ids = new Set([...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    for (const reference of new Set([...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]))) {
      assert.ok(ids.has(reference), `${name}: ${reference} is referenced but not defined`);
    }
  }
});

test('the steam stands still: a logo does not animate', async () => {
  for (const name of [...teacupMaterials, 'flat']) {
    const svg = await readFile(fileFor(name), 'utf8');
    assert.doesNotMatch(svg, /<(animate|animateTransform|animateMotion|set)\b/i, `${name}: something moves`);
  }
});
