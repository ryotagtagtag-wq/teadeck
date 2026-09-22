import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { account, instance, status, timelineText } from './fixtures.mjs';
import { createStaticServer } from './server.mjs';

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

async function signIn({ instanceFixture, advancedLayout }) {
  const context = await browser.newContext({ locale: 'de-DE' });
  const pageErrors = [];
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
    else if (url.pathname === '/api/v2/instance') body = instanceFixture;
    else if (url.pathname === '/api/v1/accounts/verify_credentials') body = account;
    else if (url.pathname === '/api/v1/preferences') body = {};
    else if (url.pathname === '/api/v1/timelines/home') body = [status];
    else if (url.pathname === '/api/v1/instance/privacy_policy') body = { updated_at: '2026-01-01T00:00:00.000Z', content: '<p>Teadeck test privacy policy 51d0</p>' };
    else if (url.pathname === '/api/v1/instance/extended_description') body = { updated_at: '2026-01-01T00:00:00.000Z', content: '' };
    else if (url.pathname === '/api/v2/notifications') body = { notification_groups: [], accounts: [], statuses: [] };
    else if (url.pathname === '/api/v2/notifications/policy') body = {
      for_not_following: 'accept', for_not_followers: 'accept', for_new_accounts: 'accept',
      for_private_mentions: 'accept', for_limited_accounts: 'filter', for_bots: 'accept',
      summary: { pending_requests_count: 0, pending_notifications_count: 0 },
    };
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  });
  if (advancedLayout) {
    await context.addInitScript(() => localStorage.setItem('teadeck.v1:https://mastodon.test:42:advancedLayout', 'true'));
  }
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).first().waitFor();
  return { context, page, pageErrors };
}

/** "Abmelden" directly follows "Einstellungen" and "Mehr" in the navigation list. */
async function assertLogoutAfterSettingsAndMore(page) {
  const logout = page.locator('.navigation-panel .teadeck-logout').first();
  await logout.waitFor();
  const entries = await page.locator('.navigation-panel').first().locator('li').evaluateAll((items) => items.map((item) => item.textContent.trim()).filter(Boolean));
  const at = entries.indexOf('Abmelden');
  assert.ok(at >= 2, `navigation entries: ${entries.join(' | ')}`);
  assert.deepEqual(entries.slice(at - 2, at + 1), ['Einstellungen', 'Mehr', 'Abmelden']);
  assert.equal(await page.locator('.compose-form .teadeck-logout, .compose-panel .teadeck-logout').count(), 0, 'no longer in the compose column');
}

test('advanced layout: About and the privacy policy open in the column, not in a new tab', { timeout: 90_000 }, async () => {
  const instanceFixture = {
    ...instance,
    rules: [{ id: '1', text: 'Teadeck test rule 8e2c', hint: '', translations: {} }],
    configuration: { ...instance.configuration, urls: { ...instance.configuration.urls, privacy_policy: 'https://mastodon.test/privacy-policy' } },
  };
  const { context, page, pageErrors } = await signIn({ instanceFixture, advancedLayout: true });
  try {
    await page.waitForURL(/\/deck\//);
    await assertLogoutAfterSettingsAndMore(page);
    // Nothing branded: no Mastodon logo, and no mascot or empty frame without a configured logo.
    assert.equal(await page.locator('.logo--wordmark, .logo--icon, img[alt="Mastodon"]').count(), 0);
    assert.equal(await page.locator('img[src*="elephant"], .drawer__inner__mastodon, .navigation-panel__logo').count(), 0);

    // The first "Über" is this server's (the second, external one is about Mastodon).
    await page.locator('footer').first().getByRole('link', { name: /^Über/ }).first().click();
    // Server rules are a collapsible section of the About column, as in Mastodon.
    await page.getByRole('button', { name: 'Serverregeln' }).click();
    await page.getByText('Teadeck test rule 8e2c').waitFor();
    assert.equal(context.pages().length, 1, 'no new tab');
    await page.waitForURL(/\/deck\/about$/);
    // Still the column layout: the home timeline is next to it.
    assert.equal(await page.getByText(timelineText).first().isVisible(), true);

    // The About column took the place of the start column (like settings do); back to it.
    await page.goBack();
    await page.waitForURL(/\/deck\/getting-started$/);
    await page.locator('footer a[href="/privacy-policy"]').first().click();
    await page.getByText('Teadeck test privacy policy 51d0').waitFor();
    assert.equal(context.pages().length, 1, 'no new tab');
    assert.equal(await page.getByText(timelineText).first().isVisible(), true);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('single column: no privacy policy link where the instance has none; sign-out below settings and more', { timeout: 60_000 }, async () => {
  // Like GoToSocial: configuration.urls without privacy_policy / terms_of_service.
  const instanceFixture = { ...instance, configuration: { ...instance.configuration, urls: { streaming: '' } } };
  const { context, page, pageErrors } = await signIn({ instanceFixture, advancedLayout: false });
  try {
    await assertLogoutAfterSettingsAndMore(page);
    await page.getByRole('link', { name: /^Über/ }).first().waitFor();
    assert.equal(await page.getByRole('link', { name: /^(Datenschutzerklärung|Datenschutz)$/ }).count(), 0);
    assert.equal(await page.getByRole('link', { name: /^Nutzungsbedingungen$/ }).count(), 0);

    // Nothing branded where Mastodon shows its logo, and no broken image without a configured one.
    assert.equal(await page.locator('.logo--wordmark, .logo--icon, img[alt="Mastodon"]').count(), 0);
    assert.equal(await page.locator('img.teadeck-logo').count(), 0);

    await page.locator('.navigation-panel .teadeck-logout').first().click();
    await page.locator('.modal-root').getByRole('button', { name: /^(Abmelden|Log out)$/ }).click();
    await page.waitForURL(`${origin}/login`);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});
