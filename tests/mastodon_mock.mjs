import { account, instance, status, timelineText } from './fixtures.mjs';

export const notificationPolicy = {
  for_not_following: 'accept', for_not_followers: 'accept', for_new_accounts: 'accept',
  for_private_mentions: 'accept', for_limited_accounts: 'filter', for_bots: 'accept',
  summary: { pending_requests_count: 0, pending_notifications_count: 0 },
};

/** Signs in on the authorize page right away, with `code` as the code. */
export const authorizeWith = (origin, code = 'browser-code') => ({ route, url }) => {
  const callback = new URL('/oauth/callback', origin);
  callback.search = new URLSearchParams({ code, state: url.searchParams.get('state') ?? '' });
  return route.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(callback.href)})</script>` });
};

/**
 * Answers requests to https://mastodon.test like a Mastodon server with one
 * post on the home timeline. `routes` adds or replaces answers by path: a value
 * is sent as JSON; a function gets `{ route, request, url, cors }` and returns
 * the value to send, or nothing once it has answered itself. Any other path
 * gets an empty list.
 */
export async function mockMastodon(target, origin, routes = {}) {
  const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
  const answers = {
    '/oauth/authorize': authorizeWith(origin),
    '/api/v1/apps': { client_id: 'browser-client', client_secret: 'browser-secret' },
    '/oauth/token': { access_token: 'browser-token', token_type: 'Bearer', scope: 'read write follow' },
    '/api/v2/instance': instance,
    '/api/v1/accounts/verify_credentials': account,
    '/api/v1/preferences': {},
    '/api/v1/timelines/home': [status],
    '/api/v2/notifications': { notification_groups: [], accounts: [], statuses: [] },
    '/api/v2/notifications/policy': notificationPolicy,
    ...routes,
  };
  await target.route('https://mastodon.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const answer = answers[url.pathname] ?? [];
    const body = typeof answer === 'function' ? await answer({ route, request, url, cors }) : answer;
    if (body === undefined) return;
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  });
}

/** Signs in to mastodon.test and waits for the home timeline. */
export async function signIn(page, origin, { remember = false } = {}) {
  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  if (remember) await page.locator('#teadeck-remember').check();
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText(timelineText).first().waitFor();
}

/** Opens the account menu at the bottom of the navigation (English or German UI). */
export async function openAccountMenu(page) {
  await page.getByRole('button', { name: /^(Account settings|Kontoeinstellungen)$/ }).first().click();
}

/** Teadeck's settings, through the account menu as in Mastodon's redesign. */
export async function openPreferences(page) {
  await openAccountMenu(page);
  await page.getByRole('link', { name: /^(Settings|Einstellungen)$/ }).click();
}

/** Signs out through the account menu and confirms. */
export async function signOut(page) {
  await openAccountMenu(page);
  const name = /^(Sign Out|Abmelden)$/;
  // A button in the navigation menu, a menu item elsewhere.
  await page.getByRole('menuitem', { name }).or(page.getByRole('button', { name })).first().click();
  await page.locator('.modal-root').getByRole('button', { name: /^(Abmelden|Log out)$/ }).click();
}

/** The redesigned composer's text field (German or English UI). */
export const composerText = (page) => page.getByPlaceholder(/^(Was möchtest du mitteilen\?|What would you like to say\?)$/);

/** Opens the composer from its button, unless it is already open. */
export async function openComposer(page) {
  const newPost = page.getByRole('button', { name: /^(Neuer Beitrag|New Post)$/ }).first();
  await newPost.or(composerText(page)).first().waitFor();
  if (!(await composerText(page).isVisible())) await newPost.click();
  await composerText(page).waitFor();
}

export const publishButton = (page) => page.locator('form[role="dialog"]').getByRole('button', { name: /^(Veröffentlichen|Publish)$/ });
