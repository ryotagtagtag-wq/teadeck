import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { account, instance, status } from './fixtures.mjs';
import { mockMastodon, waitUntil } from './mastodon_mock.mjs';
import { supportsStatusFormat } from '../integration/server_features.ts';
import {
  accountStatusFormat, effectiveStatusFormat, statusContentType, statusFormatChoice,
  statusFormatFromStored, statusFormatOfSource,
} from '../integration/status_format.ts';
import { browser, collectPageErrors, origin, preferenceKey, submitSignIn, useApp } from './harness.mjs';

/**
 * GoToSocial parses a post as plain text or as Markdown, with a default per
 * account (`source.status_content_type`) that a single post may override
 * (`content_type`). The switch in the compose box shows that default and
 * overrides it; the override is remembered.
 */

const gtsInstance = {
  ...instance,
  version: '3.5.3+0.22.1',
  source_url: 'https://codeberg.org/superseriousbusiness/gotosocial',
  configuration: { ...instance.configuration, statuses: { ...instance.configuration.statuses, supported_mime_types: ['text/plain', 'text/markdown'] } },
};
const markdownAccount = { ...account, source: { ...account.source, status_content_type: 'text/markdown' } };
const plainAccount = { ...account, source: { ...account.source, status_content_type: 'text/plain' } };

test('Markdown needs an explicit advertisement of both post formats', () => {
  assert.equal(supportsStatusFormat(gtsInstance), true);
  for (const types of [undefined, null, 'text/plain,text/markdown', [], ['text/plain'], ['text/markdown']]) {
    assert.equal(supportsStatusFormat({ configuration: { statuses: { supported_mime_types: types } } }), false);
  }
  assert.equal(supportsStatusFormat({}), false);
  assert.equal(statusContentType('markdown', false), undefined);
  assert.equal(statusContentType('plain', false), undefined);
});

test('a stored choice is only kept while it differs from the account setting', () => {
  assert.equal(statusFormatFromStored('markdown'), 'markdown');
  assert.equal(statusFormatFromStored('html'), 'default');
  assert.equal(statusFormatFromStored(null), 'default');

  assert.equal(accountStatusFormat('text/markdown'), 'markdown');
  assert.equal(accountStatusFormat('text/plain'), 'plain');
  assert.equal(accountStatusFormat(undefined), 'plain');

  // Choosing what the account already does stores nothing, so a later change there still arrives.
  assert.equal(statusFormatChoice('markdown', 'markdown'), 'default');
  assert.equal(statusFormatChoice('plain', 'markdown'), 'plain');

  assert.equal(effectiveStatusFormat('default', 'markdown'), 'markdown');
  assert.equal(effectiveStatusFormat('plain', 'markdown'), 'plain');
});

test('only an override is sent; the account setting sends nothing', () => {
  assert.equal(statusContentType('default', true), undefined);
  assert.equal(statusContentType('markdown', true), 'text/markdown');
  assert.equal(statusContentType('plain', true), 'text/plain');

  assert.equal(statusFormatOfSource('text/markdown'), 'markdown');
  assert.equal(statusFormatOfSource('text/plain'), 'plain');
  // Older GoToSocial versions omit it when editing: keep the account's setting.
  assert.equal(statusFormatOfSource(undefined), 'default');
});

useApp();

/** A signed-in page against an instance of the given shape, recording what it posts. */
async function signedInPage({ instance: instanceBody, account: accountBody, statusSource, savedFormat }) {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  const pageErrors = collectPageErrors(page);
  const posted = [];

  const ownStatus = { ...status, account: accountBody };
  await mockMastodon(context, origin, {
    '/api/v2/instance': instanceBody,
    '/api/v1/interaction_policies/defaults': {},
    '/api/v1/accounts/verify_credentials': accountBody,
    '/api/v1/timelines/home': [ownStatus],
    '/api/v1/markers': {},
    [`/api/v1/statuses/${ownStatus.id}/source`]: { id: ownStatus.id, text: 'geschrieben in Markdown', spoiler_text: '', ...statusSource },
    'POST /api/v1/statuses': ({ body }) => { posted.push(body); return { ...ownStatus, id: `posted-${posted.length}`, content: `<p>${body.status}</p>` }; },
    [`PUT /api/v1/statuses/${ownStatus.id}`]: ({ body }) => { posted.push(body); return ownStatus; },
  });

  await submitSignIn(page, origin);
  // The redesigned composer opens from its button and closes again after posting.
  const textarea = page.getByPlaceholder('Was möchtest du mitteilen?');
  const openComposer = async () => {
    await page.getByRole('button', { name: 'Neuer Beitrag' }).or(textarea).first().waitFor();
    if (!(await textarea.isVisible())) await page.getByRole('button', { name: 'Neuer Beitrag' }).first().click();
    await textarea.waitFor();
  };
  await openComposer();
  if (savedFormat) {
    await page.evaluate(({ key, format }) => {
      localStorage.setItem(key, JSON.stringify(format));
    }, { key: preferenceKey('statusFormat.v1', accountBody.id), format: savedFormat });
    await page.reload();
    await openComposer();
  }
  return {
    page, posted, pageErrors, openComposer,
    toggle: page.locator('.teadeck-status-format-toggle'),
    async post(text) {
      const before = posted.length;
      await openComposer();
      await textarea.fill(text);
      await page.getByRole('button', { name: 'Veröffentlichen' }).click();
      await waitUntil(() => posted.length === before + 1, { message: 'the status was never posted' });
      // Closing follows the server's answer; reopening before it would catch the old composer.
      await textarea.waitFor({ state: 'hidden' });
      await openComposer();
      return posted[posted.length - 1];
    },
    stop: async () => { await context.close(); },
  };
}

test('the switch shows the account setting, and a post follows it without saying so', { timeout: 60_000 }, async () => {
  const app = await signedInPage({ instance: gtsInstance, account: markdownAccount });
  try {
    await app.toggle.waitFor();
    assert.equal(await app.toggle.getAttribute('aria-pressed'), 'true', 'the account writes Markdown');
    const sent = await app.post('Teadeck Markdown-Standard');
    // Nothing is sent: whatever the account is set to applies, including a change made since.
    assert.equal(sent.content_type, undefined);
    assert.deepEqual(app.pageErrors, []);
  } finally { await app.stop(); }
});

test('the switch sits with the compose buttons, right after the emoji picker', { timeout: 60_000 }, async () => {
  const app = await signedInPage({ instance: gtsInstance, account: markdownAccount });
  try {
    await app.toggle.waitFor();
    // Same row as the upload, emoji and poll buttons - and directly after the emoji button.
    const footer = app.page.locator('form[role="dialog"] footer');
    const emojiButton = footer.getByRole('button', { name: 'Emoji hinzufügen' });
    const position = (button) => button.evaluate((element) => [...element.closest('footer').children].findIndex((child) => child.contains(element)));
    const emoji = await position(emojiButton);
    assert.ok(emoji >= 0, 'no emoji button in the row');
    assert.equal(await position(app.toggle), emoji + 1, 'the switch is not next to the emoji button');

    // And it is one of them to look at: the same size.
    const [emojiBox, toggleBox] = [await emojiButton.boundingBox(), await app.toggle.boundingBox()];
    assert.ok(Math.abs(emojiBox.height - toggleBox.height) <= 2, `heights differ: ${emojiBox.height} vs ${toggleBox.height}`);
    assert.ok(Math.abs(emojiBox.width - toggleBox.width) <= 2, `widths differ: ${emojiBox.width} vs ${toggleBox.width}`);
    assert.deepEqual(app.pageErrors, []);
  } finally { await app.stop(); }
});

test('a click overrides the account setting for the posts that follow, and is remembered', { timeout: 60_000 }, async () => {
  const app = await signedInPage({ instance: gtsInstance, account: markdownAccount });
  try {
    await app.toggle.click();
    assert.equal(await app.toggle.getAttribute('aria-pressed'), 'false');
    assert.equal((await app.post('ohne Markdown')).content_type, 'text/plain');

    // Remembered: a fresh start of the app keeps the choice.
    await app.page.reload();
    await app.openComposer();
    assert.equal(await app.toggle.getAttribute('aria-pressed'), 'false');
    assert.equal((await app.post('immer noch ohne Markdown')).content_type, 'text/plain');

    // Back to what the account does: nothing is remembered and nothing is sent.
    await app.toggle.click();
    assert.equal(await app.toggle.getAttribute('aria-pressed'), 'true');
    assert.equal((await app.post('wieder Kontostandard')).content_type, undefined);
    await app.page.reload();
    await app.openComposer();
    assert.equal(await app.toggle.getAttribute('aria-pressed'), 'true');
    assert.deepEqual(app.pageErrors, []);
  } finally { await app.stop(); }
});

test('an account that writes plain text starts with the switch off', { timeout: 60_000 }, async () => {
  const app = await signedInPage({ instance: gtsInstance, account: plainAccount });
  try {
    await app.toggle.waitFor();
    assert.equal(await app.toggle.getAttribute('aria-pressed'), 'false');
    assert.equal((await app.post('einfacher Text')).content_type, undefined);

    await app.toggle.click();
    assert.equal((await app.post('**fett**')).content_type, 'text/markdown');
  } finally { await app.stop(); }
});

test('a server without this setting shows no switch', { timeout: 60_000 }, async () => {
  const app = await signedInPage({ instance, account });
  try {
    assert.equal(await app.toggle.count(), 0);
    assert.equal((await app.post('Mastodon kennt das nicht')).content_type, undefined);
  } finally { await app.stop(); }
});

test('GoToSocial without advertised support hides Markdown and suppresses a remembered override', { timeout: 60_000 }, async () => {
  const app = await signedInPage({
    instance: { ...gtsInstance, configuration: instance.configuration },
    account: markdownAccount,
    savedFormat: 'markdown',
  });
  try {
    assert.equal(await app.toggle.count(), 0);
    assert.equal((await app.post('no unsupported parameter')).content_type, undefined);
  } finally { await app.stop(); }
});

test('another implementation can advertise the same API without a GoToSocial name', { timeout: 60_000 }, async () => {
  const app = await signedInPage({ instance: { ...instance, configuration: gtsInstance.configuration }, account: plainAccount });
  try {
    await app.toggle.click();
    assert.equal((await app.post('**Markdown**')).content_type, 'text/markdown');
  } finally { await app.stop(); }
});

test('editing a post keeps the format it was written in', { timeout: 60_000 }, async () => {
  const app = await signedInPage({
    instance: gtsInstance, account: plainAccount,
    statusSource: { content_type: 'text/markdown' },
  });
  try {
    // This account writes plain text, so the switch starts off.
    assert.equal(await app.toggle.getAttribute('aria-pressed'), 'false');

    await app.page.locator('article').getByRole('button', { name: 'Mehr' }).click();
    await app.page.getByRole('menuitem', { name: 'Beitrag bearbeiten', exact: true }).click();
    await app.page.waitForFunction(() => [...document.querySelectorAll('form[role="dialog"] textarea')]
      .some((textarea) => textarea instanceof HTMLTextAreaElement && textarea.value.includes('Markdown')));
    // The post was written in Markdown: editing it must not turn it into plain text.
    assert.equal(await app.toggle.getAttribute('aria-pressed'), 'true');

    await app.page.locator('form[role="dialog"]').getByRole('button', { name: 'Speichern' }).click();
    await waitUntil(() => app.posted.length === 1, { message: 'the edit was never sent' });
    assert.equal(app.posted[0].content_type, 'text/markdown');
  } finally { await app.stop(); }
});
