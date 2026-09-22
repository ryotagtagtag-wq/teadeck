import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';

test('favicon resolves theme colours and updates without leaving DOM nodes', async () => {
  const source = stripTypeScriptTypes(await readFile(new URL('../integration/favicon.ts', import.meta.url), 'utf8'));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<html><head><link rel="icon" href="/favicon.svg"></head><body></body></html>');
    await page.addScriptTag({ type: 'module', content: `${source}\nwindow.updateFavicon = updateFavicon;` });
    await page.waitForFunction(() => typeof window.updateFavicon === 'function');
    const results = await page.evaluate(() => {
      const root = document.documentElement;
      const before = root.childElementCount;
      root.style.setProperty('--teadeck-logo-body', '#112233');
      root.style.setProperty('--teadeck-logo-line', '#ddeeff');
      root.style.setProperty('--teadeck-logo-tea', '#bb6600');
      window.updateFavicon();
      const first = document.querySelector('link').href;
      root.style.setProperty('--teadeck-logo-body', '#ffffff');
      window.updateFavicon();
      const second = document.querySelector('link').href;
      window.updateFavicon();
      return { first: decodeURIComponent(first), second: decodeURIComponent(second), stable: second === document.querySelector('link').href, clean: before === root.childElementCount };
    });
    assert.match(results.first, /rgb\(17, 34, 51\)/);
    assert.match(results.first, /rgb\(221, 238, 255\)/);
    assert.match(results.second, /rgb\(255, 255, 255\)/);
    assert.equal(results.stable, true);
    assert.equal(results.clean, true);
  } finally {
    await browser.close();
  }
});
