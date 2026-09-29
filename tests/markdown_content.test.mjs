import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { instance, status, timelineText } from './fixtures.mjs';
import { mockMastodon } from './mastodon_mock.mjs';
import { createStaticServer } from './server.mjs';

// A post as GoToSocial renders Markdown: headings, rules, footnotes and a fenced code block.
const content = [
  `<h1>Release notes</h1><p>${timelineText}: run <code>npm test</code>, <strong>bold</strong>, <del>gone</del>,`,
  ' <a href="https://example.com/x" rel="nofollow noreferrer noopener" target="_blank">a link</a>',
  '<sup id="fnref:1"><a href="#fn:1" class="footnote-ref" role="doc-noteref">1</a></sup></p>',
  '<hr><ul><li>one</li><li>two</li></ul><blockquote><p>quoted</p></blockquote>',
  '<pre><code class="language-js">const a = 1; // note\nfetch(a)\n</code></pre>',
  '<div class="footnotes" role="doc-endnotes"><hr><ol><li id="fn:1"><p>Footnote text</p></li></ol></div>',
].join('');

let server;
let origin;
let browser;

before(async () => {
  ({ server, origin } = await createStaticServer());
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

/** Signs in with the given design and returns the page with the post on screen. */
async function openPost(design) {
  const context = await browser.newContext({ locale: 'en-US', colorScheme: 'dark', viewport: { width: 1280, height: 900 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await context.route(`${origin}/teadeck.json`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(design) }));
  await mockMastodon(context, origin, {
    '/api/v1/timelines/home': [{ ...status, content }],
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  const post = page.locator('.status__content__text').filter({ hasText: timelineText }).first();
  await post.waitFor();
  return { context, page, pageErrors, post };
}

const style = (locator, property) => locator.evaluate((element, name) => getComputedStyle(element)[name], property);

test('Markdown in a post keeps its structure and follows the theme', { timeout: 90_000 }, async () => {
  const { context, page, pageErrors, post } = await openPost({ theme: 'assam', colorScheme: 'dark' });

  // Headings, rules and footnotes are no longer dropped along with their text.
  assert.equal(await post.locator('h1').textContent(), 'Release notes');
  assert.equal(await post.locator('hr').count(), 2);
  assert.equal(await post.getByText('Footnote text').count(), 1);

  // Inline code in the theme's colours, not Mastodon's pink.
  assert.equal(await style(post.locator('p > code'), 'color'), 'rgb(236, 195, 154)');
  assert.equal(await style(post.locator('p > code'), 'backgroundColor'), 'rgba(194, 129, 79, 0.16)');
  assert.equal(await style(post.locator('h1'), 'color'), 'rgb(236, 227, 218)');
  assert.equal(await style(post.locator('del'), 'color'), 'rgb(161, 144, 127)');

  // The code block: its language, line numbers, highlighting and a copy button.
  const block = post.locator('.teadeck-code');
  assert.equal(await block.locator('.teadeck-code__language').textContent(), 'js');
  assert.equal(await block.locator('.teadeck-code__lines').textContent(), '1\n2');
  assert.equal(await block.locator('.teadeck-code__keyword').first().textContent(), 'const');
  assert.equal(await block.locator('.teadeck-code__comment').textContent(), '// note');
  assert.equal(await style(block.locator('.teadeck-code__keyword').first(), 'color'), 'rgb(221, 162, 116)');
  assert.match(await style(block.locator('code'), 'fontFamily'), /Teadeck IBM Plex Mono/);

  const address = page.url();
  await block.getByRole('button', { name: 'Copy' }).click();
  await block.getByRole('button', { name: 'Copied' }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'const a = 1; // note\nfetch(a)');
  assert.equal(page.url(), address);

  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('Mastodon\'s dark theme shows Markdown in colours of its own', { timeout: 90_000 }, async () => {
  const { context, pageErrors, post } = await openPost({ theme: 'mastodon', colorScheme: 'dark' });
  assert.equal(await style(post.locator('p > code'), 'color'), 'rgb(205, 198, 240)');
  assert.equal(await style(post.locator('h1'), 'color'), 'rgb(233, 233, 237)');
  const block = post.locator('.teadeck-code');
  assert.equal(await style(block, 'backgroundColor'), 'rgb(18, 20, 31)');
  assert.equal(await style(block.locator('.teadeck-code__keyword').first(), 'color'), 'rgb(167, 156, 223)');
  assert.match(await style(block.locator('code'), 'fontFamily'), /Teadeck JetBrains Mono/);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('Mastodon\'s light theme shows Markdown in colours of its own, not pink', { timeout: 90_000 }, async () => {
  const { context, pageErrors, post } = await openPost({ theme: 'mastodon', colorScheme: 'light' });
  assert.equal(await style(post.locator('p > code'), 'color'), 'rgb(67, 56, 158)');
  assert.equal(await style(post.locator('.teadeck-code'), 'backgroundColor'), 'rgb(242, 242, 249)');
  assert.deepEqual(pageErrors, []);
  await context.close();
});
