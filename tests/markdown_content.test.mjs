import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { account, instance, status, timelineText } from './fixtures.mjs';
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

test('Markdown in a post keeps its structure and follows the theme', { timeout: 90_000 }, async () => {
  const context = await browser.newContext({ locale: 'en-US', colorScheme: 'dark', viewport: { width: 1280, height: 900 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await context.route(`${origin}/teadeck.json`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ theme: 'assam', colorScheme: 'dark' }) }));
  await context.route('https://mastodon.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/oauth/authorize') {
      const callback = new URL('/oauth/callback', origin);
      callback.search = new URLSearchParams({ code: 'browser-code', state: url.searchParams.get('state') ?? '' });
      return route.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(callback.href)})</script>` });
    }
    let body = [];
    if (url.pathname === '/api/v1/apps') body = { client_id: 'browser-client', client_secret: 'browser-secret' };
    else if (url.pathname === '/oauth/token') body = { access_token: 'browser-token', token_type: 'Bearer', scope: 'read write follow' };
    else if (url.pathname === '/api/v2/instance') body = instance;
    else if (url.pathname === '/api/v1/accounts/verify_credentials') body = account;
    else if (url.pathname === '/api/v1/preferences') body = {};
    else if (url.pathname === '/api/v1/timelines/home') body = [{ ...status, content }];
    else if (url.pathname === '/api/v2/notifications') body = { notification_groups: [], accounts: [], statuses: [] };
    else if (url.pathname === '/api/v2/notifications/policy') body = {
      for_not_following: 'accept', for_not_followers: 'accept', for_new_accounts: 'accept',
      for_private_mentions: 'accept', for_limited_accounts: 'filter', for_bots: 'accept',
      summary: { pending_requests_count: 0, pending_notifications_count: 0 },
    };
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  const post = page.locator('.status__content__text').filter({ hasText: timelineText }).first();
  await post.waitFor();

  // Headings, rules and footnotes are no longer dropped along with their text.
  assert.equal(await post.locator('h1').textContent(), 'Release notes');
  assert.equal(await post.locator('hr').count(), 2);
  assert.equal(await post.getByText('Footnote text').count(), 1);

  const style = (locator, property) => locator.evaluate((element, name) => getComputedStyle(element)[name], property);
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
