import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mockMastodon, signIn } from './mastodon_mock.mjs';
import { browser, collectPageErrors, origin, useApp } from './harness.mjs';

useApp();

test('creating a feed (list) sends it to the server and opens its members, without reloading the page', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 1400, height: 900 } });
  const created = [];
  await mockMastodon(context, origin, {
    '/api/v1/markers': {},
    '/api/v1/lists': ({ request }) => {
      if (request.method() !== 'POST') return [];
      const list = JSON.parse(request.postData());
      created.push(list);
      return { id: '7', title: list.title, exclusive: list.exclusive, replies_policy: list.replies_policy };
    },
    '/api/v1/lists/7': { id: '7', title: 'Teeliste', exclusive: false, replies_policy: 'list' },
  });
  const page = await context.newPage();
  const pageErrors = collectPageErrors(page);
  await signIn(page, origin);

  let loads = 0;
  page.on('load', () => loads++);
  await page.evaluate(() => { history.pushState(null, '', '/lists/new'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.locator('form.app-form input[type="text"]').first().fill('Teeliste');
  await page.locator('form.app-form button[type="submit"]').click();

  await page.waitForURL(`${origin}/lists/7/members`);
  assert.deepEqual(created.map((list) => list.title), ['Teeliste']);
  assert.equal(loads, 0, 'the page was reloaded');
  assert.deepEqual(pageErrors, []);
  await context.close();
});
