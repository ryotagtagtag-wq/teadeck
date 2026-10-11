import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { instance, postedStatus, timelineText } from './fixtures.mjs';
import { composerText, mockMastodon, openComposer, respond, waitUntil } from './mastodon_mock.mjs';
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

// GoToSocial account defaults: here boosts of followers-only posts are open to followers.
const interactionDefaults = {
  private: {
    can_favourite: { automatic_approval: ['author', 'followers', 'mentioned'], manual_approval: [] },
    can_reply: { automatic_approval: ['author', 'followers', 'mentioned'], manual_approval: [] },
    can_reblog: { automatic_approval: ['author', 'followers'], manual_approval: [] },
  },
};

function mockMastodonRest(context, { instanceFixture, onStatusPosted, failDefaults = false }) {
  return mockMastodon(context, origin, {
    '/api/v2/instance': instanceFixture,
    '/api/v1/markers': {},
    '/api/v1/interaction_policies/defaults': failDefaults ? respond(500, { error: 'unavailable' }) : interactionDefaults,
    'POST /api/v1/statuses': ({ body }) => { onStatusPosted(body); return postedStatus(body); },
  });
}

// The redesigned composer opens from its button; "Who can reply" sits in its settings menu.
const submit = (page) => page.locator('form[role="dialog"]').getByRole('button', { name: 'Veröffentlichen' }).click();
const settingsButton = (page) => page.locator('form[role="dialog"]').getByRole('button', { name: 'Einstellungen' });
/** Opens the settings menu, runs `inMenu` on the reply-audience group (or null), and closes the menu again. */
async function withReplyAudience(page, inMenu) {
  await settingsButton(page).click();
  const group = page.locator('.teadeck-reply-audience-picker');
  await page.getByRole('menuitemcheckbox').first().waitFor();
  const result = await inMenu((await group.count()) ? group : null);
  await settingsButton(page).click();
  await page.getByRole('menuitemcheckbox').first().waitFor({ state: 'detached' });
  return result;
}

test('the GoToSocial reply-audience picker stays hidden on a plain Mastodon instance', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  let posted;

  await mockMastodonRest(context, { instanceFixture: instance, onStatusPosted: (status) => { posted = status; } });

  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).waitFor();
  await openComposer(page);

  assert.equal(await withReplyAudience(page, (group) => group), null);

  await composerText(page).fill('Teadeck plain-instance post 3f0a');
  await submit(page);
  await waitUntil(() => posted, { message: 'the status was never posted' });
  assert.equal('interaction_policy' in posted, false);

  await context.close();
});

test('on a detected GoToSocial instance, restricting replies sends the matching interaction_policy', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  const gotosocialInstance = { ...instance, version: '0.17.0 abcdef1', source_url: 'https://codeberg.org/superseriousbusiness/gotosocial' };
  let posted;

  await mockMastodonRest(context, { instanceFixture: gotosocialInstance, onStatusPosted: (status) => { posted = status; } });

  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).waitFor();

  await openComposer(page);
  const audience = () => withReplyAudience(page, (group) => group.getAttribute('data-value'));
  // Until something is chosen: the account default (no interaction policy sent).
  assert.equal(await audience(), 'default');

  await withReplyAudience(page, async (group) => {
    await group.getByRole('menuitemradio', { name: 'Nur Follower und Erwähnte' }).click();
    assert.equal(await group.getAttribute('data-value'), 'followers');
  });
  await composerText(page).fill('Teadeck GoToSocial reply-restricted post 6b2d');
  await submit(page);
  await waitUntil(() => posted, { message: 'the status was never posted' });
  // Only replies are restricted; favourites and boosts keep the account's defaults for
  // followers-only posts (here: boosts by followers), not hardcoded rules.
  assert.equal(posted.visibility, 'private');
  assert.deepEqual(posted.interaction_policy, {
    can_favourite: { automatic_approval: ['author', 'followers', 'mentioned'], manual_approval: [] },
    can_reply: { automatic_approval: ['followers'], manual_approval: [] },
    can_reblog: { automatic_approval: ['author', 'followers'], manual_approval: [] },
  });

  // The last choice sticks: for the next post, and after reloading the page.
  await openComposer(page);
  assert.equal(await composerText(page).inputValue(), '');
  assert.equal(await audience(), 'followers');
  await page.reload();
  await page.getByText(timelineText).waitFor();
  await openComposer(page);
  assert.equal(await audience(), 'followers');

  await context.close();
});

test('without the account defaults a reply-restricted post is held back with a message, not sent with wider rules', { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  const gotosocialInstance = { ...instance, version: '0.17.0 abcdef1', source_url: 'https://codeberg.org/superseriousbusiness/gotosocial' };
  let posted;

  await mockMastodonRest(context, { instanceFixture: gotosocialInstance, failDefaults: true, onStatusPosted: (status) => { posted = status; } });

  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).waitFor();

  await openComposer(page);
  await withReplyAudience(page, (group) => group.getByRole('menuitemradio', { name: 'Nur erwähnte Accounts' }).click());
  await composerText(page).fill('Teadeck held-back post 9c1e');
  await submit(page);
  await page.getByText('Die Interaktions-Standards deines Kontos ließen sich nicht laden', { exact: false }).waitFor();
  assert.equal(posted, undefined);
  // The text stays for another attempt.
  assert.equal(await composerText(page).inputValue(), 'Teadeck held-back post 9c1e');

  await context.close();
});
