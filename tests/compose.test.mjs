import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { postedStatus } from './fixtures.mjs';
import { composerText, mockMastodon, openComposer, publishButton, waitUntil } from './mastodon_mock.mjs';
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

const media = {
  id: 'media-1', type: 'image',
  url: 'https://mastodon.test/media/1.png', preview_url: 'https://mastodon.test/media/1-small.png',
  // Non-empty on purpose: an empty description makes Mastodon's own compose
  // form open a "missing alt text" confirmation modal instead of submitting.
  description: 'a test photo', blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
  meta: {
    original: { width: 100, height: 100, size: '100x100', aspect: 1 },
    small: { width: 100, height: 100, size: '100x100', aspect: 1 },
  },
};

test('posting a status with an attached image goes through Teadeck\'s patched compose/upload path', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const server = await mockMastodon(context, origin, {
    '/api/v1/timelines/home': [],
    'POST /api/v2/media': media,
    'POST /api/v1/statuses': ({ body }) => postedStatus(body, { media_attachments: body.media_ids?.length ? [media] : [] }),
  });
  const sent = (path) => server.requests.filter((request) => request.method === 'POST' && request.path === path);

  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await openComposer(page);

  const composeText = 'Teadeck compose test 9c2f';
  await composerText(page).fill(composeText);
  await page.locator('form[role="dialog"] input[type="file"]').setInputFiles({
    name: 'photo.png', mimeType: 'image/png',
    buffer: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
  });
  // The attachment is listed in the composer once its upload has been processed.
  await page.locator('form[role="dialog"]').getByRole('button', { name: 'Bild entfernen' }).waitFor();

  await publishButton(page).click();
  const [published] = await waitUntil(() => sent('/api/v1/statuses').length && sent('/api/v1/statuses'), { message: 'the composed status was never posted' });

  assert.equal(sent('/api/v2/media').length, 1);
  assert.equal(published.body.status, composeText);
  assert.deepEqual(published.body.media_ids, [media.id]);
  // The route handler above resolving doesn't imply the page has already
  // processed the response and re-rendered; wait for the composer to reset.
  await openComposer(page);
  await page.waitForFunction(() => document.querySelector('form[role="dialog"] textarea')?.value === '');
  assert.deepEqual(pageErrors, []);

  await context.close();
});

test('posting without alt text after the confirmation closes the composer, as posting directly does', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const undescribed = { ...media, description: '' };
  const server = await mockMastodon(context, origin, {
    '/api/v1/timelines/home': [],
    'POST /api/v2/media': undescribed,
    'POST /api/v1/statuses': ({ body }) => postedStatus(body, { media_attachments: [undescribed] }),
  });
  const sent = (path) => server.requests.filter((request) => request.method === 'POST' && request.path === path);

  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await openComposer(page);
  await composerText(page).fill('Ohne Bildbeschreibung 4e1d');
  await page.locator('form[role="dialog"] input[type="file"]').setInputFiles({
    name: 'photo.png', mimeType: 'image/png',
    buffer: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
  });
  await page.locator('form[role="dialog"]').getByRole('button', { name: 'Bild entfernen' }).waitFor();

  // Mastodon asks first; posting anyway sends the post and closes the composer.
  await publishButton(page).click();
  await page.getByRole('button', { name: 'Trotzdem veröffentlichen' }).click();
  await waitUntil(() => sent('/api/v1/statuses').length, { message: 'the post was never sent' });
  await page.locator('form[role="dialog"]').waitFor({ state: 'detached', timeout: 5_000 });
  assert.deepEqual(pageErrors, []);
  await context.close();
});
