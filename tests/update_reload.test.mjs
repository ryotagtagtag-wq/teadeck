import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { shouldReloadForUpdate } from '../integration/update_reload.ts';
import { account, status, timelineText } from './fixtures.mjs';
import { mockMastodon } from './mastodon_mock.mjs';
import { createStaticServer } from './server.mjs';

test('reloads at most once per 30 seconds', () => {
  assert.equal(shouldReloadForUpdate(0, Date.now()), true);
  assert.equal(shouldReloadForUpdate(1_000, 20_000), false);
  assert.equal(shouldReloadForUpdate(1_000, 31_000), true);
});

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

test('a lazily loaded view missing after a redeploy reloads the page instead of failing', { timeout: 60_000 }, async () => {
  // The last resort when a chunk is nowhere, not even in the offline cache (which would otherwise
  // serve it; see production.test.mjs): without a service worker.
  const context = await browser.newContext({ locale: 'de-DE', serviceWorkers: 'block' });
  const page = await context.newPage();

  await mockMastodon(context, origin, {
    '/api/v1/accounts/lookup': account,
    [`/api/v1/accounts/${account.id}`]: account,
  });

  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).waitFor();

  // Like nginx after a redeploy: the old chunk is gone, the server answers with an HTML 404 page.
  let staleChunkRequests = 0;
  await context.route(/\/account_timeline-[^/]+\.js$/, async (route) => {
    staleChunkRequests++;
    if (staleChunkRequests === 1) return route.fulfill({ status: 404, contentType: 'text/html', body: '<html>404 Not Found</html>' });
    return route.continue();
  });
  let loads = 0;
  page.on('load', () => loads++);

  await page.locator(`a[href="/@${account.acct}"]`).first().click();
  await page.waitForURL(`${origin}/@${account.acct}`);
  await page.getByText('Test account').first().waitFor();
  assert.equal(staleChunkRequests >= 2, true);
  assert.equal(loads, 1);

  await context.close();
});
