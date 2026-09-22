import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { account, instance, status, timelineText } from './fixtures.mjs';
import { createStaticServer } from './server.mjs';

// The configured logo is put into the page (not loaded as an image), so a drawing
// whose colours are CSS variables follows the chosen design.
const flatCup = await readFile(join(import.meta.dirname, '..', 'integration/logos/teacup-flat.svg'), 'utf8');

let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function signedInPage(logo, { advancedLayout = false } = {}) {
  const { server, origin } = await createStaticServer({
    override: async (pathname) => (pathname === '/logo.svg' && logo ? { body: logo, type: 'image/svg+xml' } : undefined),
  });
  const context = await browser.newContext({ locale: 'de-DE' });
  if (advancedLayout) {
    await context.addInitScript(() => localStorage.setItem('teadeck.v1:https://mastodon.test:42:advancedLayout', 'true'));
  }
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
    else if (url.pathname === '/api/v1/timelines/home') body = [status];
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
  await page.getByText(timelineText).waitFor();
  return { context, page, origin, pageErrors, stop: async () => { await context.close(); server.closeAllConnections(); server.close(); } };
}

/**
 * What the drawing is painted in right now, next to the theme colours it should
 * follow. `probe` resolves a theme variable the way the interface uses it.
 */
function paintedWith(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('.navigation-panel__logo .teadeck-logo svg');
    const probe = (token) => {
      const element = document.createElement('span');
      element.style.color = `var(${token})`;
      document.body.append(element);
      const value = getComputedStyle(element).color;
      element.remove();
      return value;
    };
    return {
      tea: getComputedStyle(svg.querySelector('rect')).fill,
      body: getComputedStyle([...svg.querySelectorAll('ellipse')][0]).fill,
      line: getComputedStyle([...svg.querySelectorAll('ellipse')].at(-1)).stroke,
      theme: {
        brand: probe('--color-text-brand'), surface: probe('--color-bg-secondary'),
        text: probe('--color-text-primary'), accentDeep: probe('--color-indigo-600'),
      },
    };
  });
}

async function choose(page, origin, { theme, colorScheme }) {
  await page.locator('a[href="/preferences"]').first().click();
  await page.locator('#teadeck-settings-theme').waitFor();
  await page.locator('#teadeck-settings-theme').selectOption(theme);
  await page.locator('#teadeck-settings-color-scheme').selectOption(colorScheme);
  // Appearance settings are saved and applied immediately.
  await page.goto(origin);
  await page.getByText(timelineText).waitFor();
}

test('the cup takes its colours from the theme, not from its own palette', { timeout: 120_000 }, async () => {
  const { page, origin, pageErrors, stop } = await signedInPage(flatCup);
  try {
    // In the page, not in an <img>: only then can it be coloured at all.
    await page.locator('.navigation-panel__logo .teadeck-logo svg').waitFor();
    assert.equal(await page.locator('.navigation-panel__logo img').count(), 0);

    await choose(page, origin, { theme: 'mastodon', colorScheme: 'dark' });
    const dark = await paintedWith(page);
    assert.equal(dark.body, dark.theme.surface, 'the body is a surface of the theme');
    assert.equal(dark.line, dark.theme.text, 'the contour is the theme\'s text colour');

    await choose(page, origin, { theme: 'mastodon', colorScheme: 'light' });
    const light = await paintedWith(page);
    assert.equal(light.body, light.theme.surface);
    assert.notEqual(light.body, dark.body, 'light and dark no longer look the same');
    assert.notEqual(light.line, dark.line);
    // The tea keeps its own warm colour where the accent is not tea.
    assert.equal(light.tea, dark.tea);
    assert.notEqual(light.tea, light.theme.brand);

    // In Schwarztee the accent is the tea itself, so the design hands it to the cup.
    await choose(page, origin, { theme: 'assam', colorScheme: 'dark' });
    const blackTea = await paintedWith(page);
    assert.equal(blackTea.tea, blackTea.theme.accentDeep, 'the cup follows the design\'s accent');
    assert.notEqual(blackTea.tea, dark.tea, 'and not the default tea colour');
    assert.equal(blackTea.body, blackTea.theme.surface);
    assert.notEqual(blackTea.body, dark.body, 'a warm ground instead of the blue-grey one');

    await choose(page, origin, { theme: 'assam', colorScheme: 'light' });
    // Each tea brews its own colour; none of them is the default amber any more.
    const whiteTea = await paintedWith(page);
    assert.equal(whiteTea.body, whiteTea.theme.surface);
    assert.notEqual(whiteTea.tea, dark.tea, 'a white tea brews paler than the default');
    assert.notEqual(whiteTea.tea, blackTea.tea);

    await choose(page, origin, { theme: 'sencha', colorScheme: 'dark' });
    const greenTea = await paintedWith(page);
    assert.equal(greenTea.body, greenTea.theme.surface, 'the charcoal ground of this design');
    assert.notEqual(greenTea.tea, blackTea.tea, 'green tea is not black tea');

    // The design survives a reload, like the other settings.
    await page.reload();
    await page.getByText(timelineText).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.teadeckTheme), 'sencha');
    assert.deepEqual(pageErrors, []);
  } finally {
    await stop();
  }
});

test('a logo that did not ask to be put into the page is shown as an image, untouched', { timeout: 60_000 }, async () => {
  // A drawing without the data-teadeck-logo mark: an administrator's own file.
  const own = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>.status { display: none }</style><rect width="10" height="10" fill="#123456"/></svg>';
  const { page, stop } = await signedInPage(own);
  try {
    await page.locator('.navigation-panel__logo img.teadeck-logo').waitFor();
    assert.equal(await page.locator('.navigation-panel__logo svg').count(), 0);
    // Its style rules therefore cannot reach the application: statuses are still shown.
    assert.ok(await page.locator('.status').first().isVisible());
  } finally {
    await stop();
  }
});

test('nothing executable or page-wide from a marked drawing ends up in the page', { timeout: 60_000 }, async () => {
  const hostile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" data-teadeck-logo="teacup">
    <script>window.teadeckLogoRanScript = true;</script>
    <style>.status { display: none !important }</style>
    <rect width="10" height="10" fill="var(--teadeck-logo-tea, #b85c1e)" onload="window.teadeckLogoRanHandler = true"/>
    <a href="javascript:void(window.teadeckLogoRanLink = true)"><circle r="1"/></a>
  </svg>`;
  const { page, pageErrors, stop } = await signedInPage(hostile);
  try {
    const logo = page.locator('.navigation-panel__logo .teadeck-logo svg');
    await logo.waitFor();
    const markup = await logo.evaluate((svg) => svg.outerHTML);
    assert.doesNotMatch(markup, /script|onload|javascript:|<style/i, markup);
    assert.deepEqual(await page.evaluate(() => [window.teadeckLogoRanScript, window.teadeckLogoRanHandler, window.teadeckLogoRanLink]), [undefined, undefined, undefined]);
    // The drawing itself survives, links and all; only what could act does not.
    assert.equal(await page.locator('.navigation-panel__logo .teadeck-logo svg rect').count(), 1);
    assert.equal(await page.locator('.navigation-panel__logo .teadeck-logo svg circle').count(), 1);
    // The style rule never applied: statuses are still visible.
    assert.ok(await page.locator('.status').first().isVisible());
    assert.deepEqual(pageErrors, []);
  } finally {
    await stop();
  }
});

test('two copies of the same drawing keep their own gradients and clip paths', { timeout: 120_000 }, async () => {
  const { page, stop } = await signedInPage(flatCup, { advancedLayout: true });
  try {
    await page.waitForURL(/\/deck\//);
    await page.locator('.drawer__inner__mastodon .teadeck-logo svg').waitFor();
    const copies = await page.locator('.teadeck-logo svg').evaluateAll((svgs) => svgs.map((svg) => ({
      ids: [...svg.querySelectorAll('[id]')].map((element) => element.id),
      references: [...svg.querySelectorAll('[clip-path], [fill^="url("]')].map((element) => element.getAttribute('clip-path') ?? element.getAttribute('fill')),
    })));
    assert.ok(copies.length >= 2, `${copies.length} copies`);
    const allIds = copies.flatMap((copy) => copy.ids);
    assert.equal(new Set(allIds).size, allIds.length, `duplicate ids: ${allIds.join(' ')}`);
    // Each copy only refers to its own names.
    for (const copy of copies) {
      for (const reference of copy.references) {
        const name = /#([^)]+)\)/.exec(reference)?.[1];
        if (name) assert.ok(copy.ids.includes(name), `${reference} does not belong to this copy`);
      }
    }
  } finally {
    await stop();
  }
});

test('a logo the page cannot colour is still shown as an image', { timeout: 60_000 }, async () => {
  const { page, stop } = await signedInPage('not an svg at all');
  try {
    // Attached, though a file that is not a drawing has no size to show.
    await page.locator('.navigation-panel__logo').waitFor();
    assert.equal(await page.locator('.navigation-panel__logo img.teadeck-logo').count(), 1);
    assert.equal(await page.locator('.navigation-panel__logo svg').count(), 0);
  } finally {
    await stop();
  }
});

test('in the compose column the cup stands at the bottom, without a decorative band', { timeout: 120_000 }, async () => {
  const { page, origin, pageErrors, stop } = await signedInPage(flatCup, { advancedLayout: true });
  try {
    await page.waitForURL(/\/deck\//);
    const cup = page.locator('.drawer__inner__mastodon .teadeck-logo svg');
    await cup.waitFor();

    // Mastodon's zig-zag band at the bottom of the column is gone, in every design.
    assert.equal(await page.locator('.with-zig-zag-decoration').count(), 0);

    for (const [theme, colorScheme] of [['assam', 'dark'], ['sencha', 'dark'], ['sencha', 'light'], ['mastodon', 'dark']]) {
      await choose(page, origin, { theme, colorScheme });
      const drawing = await cup.boundingBox();
      const column = await page.locator('.drawer__inner').boundingBox();
      const gap = column.y + column.height - drawing.y - drawing.height;
      assert.ok(gap >= 0 && gap < 8, `${theme}/${colorScheme}: ${gap}px below the cup`);
      assert.ok(drawing.width > column.width * 0.7, `${theme}/${colorScheme}: the cup is ${Math.round(drawing.width)}px wide`);
      assert.equal(await page.locator('.with-zig-zag-decoration').count(), 0, `${theme}/${colorScheme}`);
    }
    assert.deepEqual(pageErrors, []);
  } finally {
    await stop();
  }
});
