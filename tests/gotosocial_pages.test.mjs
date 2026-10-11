import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { instance } from './fixtures.mjs';
import { mockMastodon, openAccountMenu, signIn } from './mastodon_mock.mjs';
import { createStaticServer } from './server.mjs';

// GoToSocial: terms linked from its instance, no pages API, no collections.
const gtsInstance = {
  ...instance,
  version: '3.5.3+0.22.1',
  source_url: 'https://codeberg.org/superseriousbusiness/gotosocial',
  configuration: { ...instance.configuration, urls: { ...instance.configuration.urls, terms_of_service: 'https://mastodon.test/about/terms' } },
};
const gtsInstanceV1 = { description: '<p>Teadeck test about text 4b1e</p>', terms: '<p>Teadeck test terms 7d2a</p>' };
const notFound = ({ route, cors }) => route.fulfill({ status: 404, contentType: 'application/json', headers: cors, body: '{"error":"Not Found"}' });

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

test('on GoToSocial, About and the terms show the server\'s texts without an error, and collections are not offered', { timeout: 90_000 }, async () => {
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 1400, height: 900 } });
  const missing = [];
  await mockMastodon(context, origin, {
    '/api/v2/instance': gtsInstance,
    '/api/v1/instance': gtsInstanceV1,
    '/api/v1/markers': {},
    '/api/v1/instance/extended_description': (args) => { missing.push('extended_description'); return notFound(args); },
    '/api/v1/instance/terms_of_service': (args) => { missing.push('terms_of_service'); return notFound(args); },
    '/api/v1/instance/domain_blocks': (args) => { missing.push('domain_blocks'); return notFound(args); },
    '/api/v1/accounts/42/collections': notFound,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await signIn(page, origin);

  await page.evaluate(() => { history.pushState(null, '', '/about'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByText('Teadeck test about text 4b1e').waitFor();

  await page.evaluate(() => { history.pushState(null, '', '/terms-of-service'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByText('Teadeck test terms 7d2a').waitFor();

  // The 404s were handled, not shown: no error alert anywhere.
  assert.ok(missing.includes('extended_description') && missing.includes('terms_of_service'), missing.join(' '));
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.notification-bar, [role="alert"]').filter({ hasText: /404|Fehler|error/i }).count(), 0);

  // Collections are Mastodon's: not in the account menu.
  await openAccountMenu(page);
  await page.getByRole('link', { name: 'Einstellungen', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Sammlungen' }).count(), 0);
  assert.deepEqual(pageErrors, []);
  await context.close();
});
