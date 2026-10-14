/**
 * The README's screenshots (docs/images), taken from the built client in
 * dist/ against a made-up GoToSocial server. Run after `npm run build`:
 *
 *   node scripts/screenshots.mjs [overview|composer|reply|overlay|themes ...]
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from '../.work/upstream/node_modules/playwright/index.mjs';
import { storageKeys } from '../integration/browser_storage.ts';
import { designs } from '../integration/themes/index.ts';
import { account as baseAccount, instance } from '../tests/fixtures.mjs';
import { mockMastodon, respond } from '../tests/mastodon_mock.mjs';
import { createStaticServer } from '../tests/server.mjs';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'docs/images');
const logo = await readFile(path.join(root, 'integration/logos/teacup-glass.svg'), 'utf8');

const avatar = (letter, colour) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${colour}"/><text x="32" y="42" font-family="sans-serif" font-size="30" font-weight="600" text-anchor="middle" fill="#fff">${letter}</text></svg>`;
const avatars = { mira: avatar('M', '#a4632a'), jun: avatar('J', '#4f7a3a'), ines: avatar('I', '#6a4c93'), sam: avatar('S', '#2f6f85') };

const person = (id, username, displayName) => ({
  ...baseAccount, id, username, display_name: displayName,
  acct: id === '42' ? username : `${username}@tea.example`,
  url: `https://tea.example/@${username}`,
  avatar: `https://mastodon.test/avatars/${username}.svg`, avatar_static: `https://mastodon.test/avatars/${username}.svg`,
  note: '<p>Tea, code and the fediverse.</p>', followers_count: 128, following_count: 96, statuses_count: 512,
});
const me = { ...person('42', 'mira', 'Mira'), source: { privacy: 'public', sensitive: false, language: 'en', note: '', fields: [], status_content_type: 'text/markdown' } };
const jun = person('43', 'jun', 'Jun Sencha');
const ines = person('44', 'ines', 'Ines');
const sam = person('45', 'sam', 'Sam Oolong');

const server = {
  ...instance, domain: 'tea.example', title: 'Tea Rocks', version: '3.5.3+0.22.1',
  source_url: 'https://codeberg.org/superseriousbusiness/gotosocial', api_versions: undefined,
  configuration: { ...instance.configuration, statuses: { ...instance.configuration.statuses, max_characters: 5000, supported_mime_types: ['text/plain', 'text/markdown'] } },
};

let count = 0;
const post = (account, content, extra = {}) => {
  count++;
  return {
    id: String(500 - count), created_at: new Date(Date.now() - count * 23 * 60_000).toISOString(),
    sensitive: false, spoiler_text: '', visibility: 'public', language: 'en',
    uri: `https://tea.example/statuses/${count}`, url: `https://tea.example/@${account.username}/${count}`,
    replies_count: 2, reblogs_count: 4, favourites_count: 11, quotes_count: 0,
    favourited: false, reblogged: false, muted: false, bookmarked: false, pinned: false,
    content, account, media_attachments: [], mentions: [], tags: [], emojis: [], tagged_collections: [], filtered: [], ...extra,
  };
};

const notes = '## Brewing notes\n\nThree things I learned this week about **green tea**:\n\n- 70–80 °C, never boiling\n- Short steeps, many infusions\n- *Glass* pots show the colour\n\n```js\n// Each infusion steeps a little longer\nconst steepSeconds = (infusion) => 30 + infusion * 15;\n```';
const brewing = post(jun, '<h2>Brewing notes</h2><p>Three things I learned this week about <strong>green tea</strong>:</p><ul><li>70–80 °C, never boiling</li><li>Short steeps, many infusions</li><li><em>Glass</em> pots show the colour</li></ul><pre><code class="language-js">// Each infusion steeps a little longer\nconst steepSeconds = (infusion) =&gt; 30 + infusion * 15;\n</code></pre>', { replies_count: 1 });
const reply = post(me, '<p>Glass pots are the best. Watching the leaves unfold is half the fun.</p>', { in_reply_to_id: brewing.id, in_reply_to_account_id: jun.id, replies_count: 0 });
const timeline = [
  brewing,
  post(ines, '<p>Morning cup is ready. Who else starts the day with an Assam? ☕ <a href="https://tea.example/tags/tea" class="mention hashtag">#<span>tea</span></a></p>'),
  post(sam, '<blockquote><p>Tea is quiet, and our thirst for tea is never far from our craving for beauty.</p></blockquote><p>— Kakuzō Okakura, <em>The Book of Tea</em></p>'),
];
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const notifications = [
  { id: '9001', type: 'favourite', created_at: minutesAgo(5), account: jun, status: reply },
  { id: '9002', type: 'follow', created_at: minutesAgo(40), account: sam },
  { id: '9003', type: 'mention', created_at: minutesAgo(90), account: ines, status: post(ines, '<p><span class="h-card"><a href="https://tea.example/@mira" class="u-url mention">@<span>mira</span></a></span> any tips for a first oolong?</p>', { mentions: [{ id: '42', username: 'mira', acct: 'mira', url: 'https://tea.example/@mira' }] }) },
];
const relationship = (id) => ({ id, following: true, followed_by: true, showing_reblogs: true, notifying: false, languages: null, blocking: false, blocked_by: false, muting: false, muting_notifications: false, requested: false, requested_by: false, domain_blocking: false, endorsed: false, note: '' });

const { server: web, origin } = await createStaticServer({ override: async (pathname) => (pathname === '/logo.svg' ? { body: logo, type: 'image/svg+xml' } : undefined) });
const browser = await chromium.launch({ headless: true });

async function open({ theme = 'assam', scheme = 'dark', advanced = false, width = 1440, height = 900 } = {}) {
  const context = await browser.newContext({ locale: 'en-US', colorScheme: scheme, viewport: { width, height } });
  await context.route(`${origin}/teadeck.json`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ theme, colorScheme: scheme }) }));
  if (advanced) await context.addInitScript((key) => localStorage.setItem(key, 'true'), `${storageKeys.accountPrefix}https://mastodon.test:42:advancedLayout`);
  const notFound = respond(404, { error: 'Not Found' });
  await mockMastodon(context, origin, {
    '/api/v2/instance': server, '/api/v1/accounts/verify_credentials': me, '/api/v1/markers': {},
    '/api/v1/timelines/home': timeline,
    '/api/v2/notifications': notFound, '/api/v2/notifications/policy': notFound, '/api/v1/notifications': notifications,
    [`/api/v1/statuses/${brewing.id}`]: brewing, [`/api/v1/statuses/${brewing.id}/context`]: { ancestors: [], descendants: [reply] },
    '/api/v1/interaction_policies/defaults': { public: { can_favourite: { automatic_approval: ['public'] }, can_reblog: { automatic_approval: ['public'] } } },
    '/api/v1/accounts/relationships': ({ url }) => url.searchParams.getAll('id[]').map(relationship),
  });
  // After the mock, so it answers first.
  await context.route('https://mastodon.test/avatars/**', (route) => route.fulfill({
    contentType: 'image/svg+xml', body: avatars[path.basename(new URL(route.request().url()).pathname, '.svg')] ?? avatars.sam,
  }));
  const page = await context.newPage();
  await page.goto(origin);
  await page.locator('#teadeck-instance').fill('mastodon.test');
  await page.locator('#teadeck-login button[type=submit]').click();
  await page.getByText('Brewing notes').first().waitFor();
  await page.waitForTimeout(3500); // avatars and the server's information
  return { context, page };
}

async function save(page, name) {
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  console.log(`docs/images/${name}.png`);
}

const shots = {
  async overview() {
    const { context, page } = await open({ advanced: true });
    await save(page, 'overview');
    await context.close();
  },
  async composer() {
    const { context, page } = await open({ theme: 'sencha', scheme: 'light' });
    await page.getByRole('button', { name: 'New post in the large composer' }).click();
    await page.locator('form[role="dialog"] textarea').first().fill(`${notes}\n\n> Tea is quiet.`);
    await page.waitForTimeout(600);
    await save(page, 'large-composer');
    await context.close();
  },
  async reply() {
    const { context, page } = await open();
    await page.locator('.teadeck-new-post').getByRole('button', { name: 'New Post', exact: true }).click();
    await page.locator('form[role="dialog"] textarea').first().fill('Thoughts on cold brew? Only people I follow can reply to this one.');
    await page.locator('form[role="dialog"]').getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('menuitemradio', { name: 'Only accounts I follow, and mentioned accounts' }).click();
    await page.waitForTimeout(400);
    await save(page, 'who-can-reply');
    await context.close();
  },
  async overlay() {
    const { context, page } = await open({ advanced: true });
    await page.locator('article').filter({ hasText: 'Brewing notes' }).last().getByRole('button', { name: 'Open in overlay' }).click();
    await page.locator('.teadeck-status-overlay').getByText('Glass pots are the best').waitFor();
    await page.waitForTimeout(800);
    await save(page, 'post-overlay');
    await context.close();
  },
  /** Every design of the registry: one tea per row, dark and light side by side, laid out by the browser itself. */
  async themes() {
    const images = [];
    for (const { id: theme } of designs) {
      for (const scheme of ['dark', 'light']) {
        const { context, page } = await open({ theme, scheme, width: 1100, height: 700 });
        images.push((await page.screenshot()).toString('base64'));
        await context.close();
      }
    }
    const context = await browser.newContext({ viewport: { width: 1448, height: designs.length * 458 + (designs.length - 1) * 8 } });
    const page = await context.newPage();
    await page.setContent(`<body style="margin:0;background:#fff;display:grid;grid-template-columns:720px 720px;gap:8px">${images.map((image) => `<img src="data:image/png;base64,${image}" style="width:720px;height:458px">`).join('')}</body>`);
    await save(page, 'themes');
    await context.close();
  },
};

const wanted = process.argv.slice(2);
try {
  for (const [name, take] of Object.entries(shots)) {
    if (!wanted.length || wanted.includes(name)) await take();
  }
} finally {
  await browser.close();
  web.close();
}
