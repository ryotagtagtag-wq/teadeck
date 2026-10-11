import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { account, instance, status, timelineText } from './fixtures.mjs';
import { composerText, openComposer } from './mastodon_mock.mjs';
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

async function mockMastodonRest(context, { instanceFixture, onStatusPosted, failDefaults = false }) {
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
    if (failDefaults && url.pathname === '/api/v1/interaction_policies/defaults') {
      return route.fulfill({ status: 500, contentType: 'application/json', headers: cors, body: '{"error":"unavailable"}' });
    }
    let body;
    if (url.pathname === '/api/v1/apps') body = { client_id: 'browser-client', client_secret: 'browser-secret' };
    else if (url.pathname === '/oauth/token') body = { access_token: 'browser-token', token_type: 'Bearer', scope: 'read write follow' };
    else if (url.pathname === '/oauth/revoke') body = {};
    else if (url.pathname === '/api/v2/instance') body = instanceFixture;
    else if (url.pathname === '/api/v1/accounts/verify_credentials') body = account;
    else if (url.pathname === '/api/v1/preferences') body = {};
    else if (url.pathname === '/api/v1/timelines/home') body = [status];
    else if (url.pathname === '/api/v1/markers') body = {};
    // GoToSocial account defaults: here boosts of followers-only posts are open to followers.
    else if (url.pathname === '/api/v1/interaction_policies/defaults') body = {
      private: {
        can_favourite: { automatic_approval: ['author', 'followers', 'mentioned'], manual_approval: [] },
        can_reply: { automatic_approval: ['author', 'followers', 'mentioned'], manual_approval: [] },
        can_reblog: { automatic_approval: ['author', 'followers'], manual_approval: [] },
      },
    };
    else if (url.pathname === '/api/v2/notifications') body = { notification_groups: [], accounts: [], statuses: [] };
    else if (url.pathname === '/api/v2/notifications/policy') body = {
      for_not_following: 'accept', for_not_followers: 'accept', for_new_accounts: 'accept',
      for_private_mentions: 'accept', for_limited_accounts: 'filter', for_bots: 'accept',
      summary: { pending_requests_count: 0, pending_notifications_count: 0 },
    };
    else if (url.pathname === '/api/v1/statuses' && request.method() === 'POST') {
      const posted = JSON.parse(request.postData());
      onStatusPosted(posted);
      body = {
        id: 'status-1', created_at: new Date().toISOString(), account, visibility: 'public',
        content: `<p>${posted.status}</p>`, spoiler_text: '', sensitive: false, language: 'de',
        uri: 'https://mastodon.test/users/alice/statuses/1', url: 'https://mastodon.test/@alice/1',
        replies_count: 0, reblogs_count: 0, favourites_count: 0, quotes_count: 0,
        favourited: false, reblogged: false, muted: false, bookmarked: false, pinned: false,
        media_attachments: [], mentions: [], tags: [], emojis: [], tagged_collections: [], filtered: [],
      };
    }
    else body = [];
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
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
  for (let attempt = 0; attempt < 50 && !posted; attempt++) await new Promise(r => setTimeout(r, 20));
  assert.ok(posted, 'the status was never posted');
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
  for (let attempt = 0; attempt < 50 && !posted; attempt++) await new Promise(r => setTimeout(r, 20));
  assert.ok(posted, 'the status was never posted');
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
