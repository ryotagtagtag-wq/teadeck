import assert from 'node:assert/strict';
import { test } from 'node:test';

import { origin, signedInPage, useApp } from './harness.mjs';

// About and terms on a Mastodon server: what GoToSocial leaves out
// (gotosocial_pages.test.mjs) stays where Mastodon runs.
useApp();

const notFound = ({ route, cors }) => route.fulfill({ status: 404, contentType: 'application/json', headers: cors, body: '{"error":"Not Found"}' });
const navigate = (page, path) => page.evaluate((to) => { history.pushState(null, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path);

test('on Mastodon, About keeps "powered by Mastodon" and Mastodon\'s disclaimer', { timeout: 60_000 }, async () => {
  const { context, page } = await signedInPage({
    routes: { '/api/v1/instance/extended_description': { updated_at: null, content: '<p>About 9c1e</p>' } },
  });
  try {
    await navigate(page, '/about');
    await page.getByText('About 9c1e').waitFor();
    assert.equal(await page.locator('a[href="https://joinmastodon.org"]').count(), 1);
    assert.equal(await page.getByText('Mastodon ist eine freie, quelloffene Software').count(), 1);
  } finally { await context.close(); }
});

test('a missing earlier version of the terms leaves the current terms to the server', { timeout: 60_000 }, async () => {
  const requested = [];
  const { context, page } = await signedInPage({
    routes: {
      '/api/v1/instance/terms_of_service': (args) => {
        requested.push('current');
        return args.route.fulfill({ contentType: 'application/json', headers: args.cors, body: JSON.stringify({ effective_date: '2026-01-01', effective: true, succeeded_by: null, content: '<p>Current terms 51c3</p>' }) });
      },
      '/api/v1/instance/terms_of_service/2025-01-01': notFound,
      '/api/v1/instance': (args) => { requested.push('v1 instance'); return args.route.fulfill({ contentType: 'application/json', headers: args.cors, body: JSON.stringify({ terms: '<p>Fallback terms</p>' }) }); },
    },
  });
  try {
    await navigate(page, '/terms-of-service/2025-01-01');
    await page.waitForTimeout(1500);
    await navigate(page, '/terms-of-service');
    await page.getByText('Current terms 51c3').waitFor();
    assert.deepEqual(requested, ['current']);
    assert.equal(await page.getByText('Fallback terms').count(), 0);
  } finally { await context.close(); }
});
