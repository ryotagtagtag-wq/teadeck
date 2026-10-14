import assert from 'node:assert/strict';
import { test } from 'node:test';

import { account, instance, timelineText } from './fixtures.mjs';
import { mockMastodon, respond, waitUntil } from './mastodon_mock.mjs';
import { browser, collectPageErrors, origin, submitSignIn, useApp } from './harness.mjs';

useApp();

test('"Profil bearbeiten" works on GoToSocial through verify_credentials and update_credentials', { timeout: 90_000 }, async () => {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  const pageErrors = collectPageErrors(page);

  // A GoToSocial-shaped account that remembers updates. No /api/v1/profile on this server.
  const {
    hide_collections: _h, show_media: _m, show_media_replies: _r, show_featured: _f, feature_approval: _a, roles: _roles, ...base
  } = account;
  let current = { ...base, bot: false, fields: [], source: { note: 'Test account', fields: [], privacy: 'private', language: 'de' } };
  const gtsInstance = { ...instance, version: '3.5.3+0.22.1', source_url: 'https://codeberg.org/superseriousbusiness/gotosocial' };
  const updates = [];

  const notFound = respond(404, { error: 'Not Found' });
  const server = await mockMastodon(context, origin, {
    '/api/v2/instance': gtsInstance,
    '/api/v1/interaction_policies/defaults': {},
    '/api/v1/profile': notFound,
    'PATCH /api/v1/accounts/update_credentials': ({ body }) => {
      updates.push(body);
      const { fields_attributes: fieldsAttributes, note, ...simple } = body;
      current = { ...current, ...simple };
      if (note !== undefined) current = { ...current, note: `<p>${note}</p>`, source: { ...current.source, note } };
      if (fieldsAttributes) {
        const fields = Object.keys(fieldsAttributes).sort().map((key) => ({ name: fieldsAttributes[key].name, value: fieldsAttributes[key].value }));
        current = { ...current, fields: fields.map((f) => ({ ...f, verified_at: null })), source: { ...current.source, fields } };
      }
      return current;
    },
    '/api/v1/accounts/verify_credentials': () => current,
    '/api/v1/accounts/lookup': () => current,
    [`/api/v1/accounts/${account.id}`]: () => current,
    '/api/v2/notifications': notFound,
    '/api/v2/notifications/policy': notFound,
    '/api/v1/instance/translation_languages': notFound,
    '/api/v1/featured_tags/suggestions': notFound,
  });
  const profileRequests = () => server.requests.filter((request) => request.path.startsWith('/api/v1/profile')).map((request) => `${request.method} ${request.path}`);
  const waitFor = (predicate, what) => waitUntil(predicate, { message: what });

  await submitSignIn(page, origin);
  await page.getByText(timelineText).waitFor();

  await page.evaluate(() => { history.pushState(null, '', '/profile/edit'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByRole('button', { name: 'Anzeigenamen bearbeiten' }).waitFor();
  // GoToSocial has no featured hashtags: the section is left out.
  assert.equal(await page.getByText('Vorgestellte Hashtags').count(), 0);

  // Controlled toggle: it flips once the server answered, so click and wait for the request.
  await page.getByLabel('Automatisiertes Konto').click();
  await waitFor(() => updates.some((body) => body.bot === true), 'bot flag sent to update_credentials');

  await page.getByRole('button', { name: 'Zusatzfeld hinzufügen' }).click();
  await page.locator('.modal-root').getByLabel('Beschriftung', { exact: true }).fill('Web');
  await page.locator('.modal-root').getByLabel('Inhalt', { exact: true }).fill('https://a.test');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await waitFor(() => updates.some((body) => body.fields_attributes?.['0']?.name === 'Web'), 'field sent in GoToSocial\'s indexed form');
  await page.getByText('https://a.test').first().waitFor();

  await page.getByRole('button', { name: 'Anzeigenamen bearbeiten' }).click();
  const nameInput = page.locator('.modal-root input, .modal-root [contenteditable="true"]').first();
  await nameInput.fill('Alice Neu');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await waitFor(() => updates.some((body) => body.display_name === 'Alice Neu'), 'display name sent to update_credentials');

  // Reading and writing the missing /api/v1/profile were each tried once, not on every change; no "Oops" toasts.
  assert.deepEqual(profileRequests().sort(), ['GET /api/v1/profile', 'PATCH /api/v1/profile']);
  assert.equal(await page.getByText('Ups!').count(), 0);
  assert.deepEqual(pageErrors, []);
  await context.close();
});
