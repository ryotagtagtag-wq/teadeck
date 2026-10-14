import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import { currentDigest, pinImage } from '../scripts/node_image.mjs';
import { unassessed } from '../scripts/check_advisories.mjs';
import { parseChallenge, promotionDecision } from '../scripts/promote_image.mjs';
import { buildReport, isUpstreamTest, matches, patchedFiles } from '../scripts/upstream_report.mjs';

test('latest only moves to the build of the current head of main', () => {
  const head = 'a'.repeat(40);
  assert.equal(promotionDecision(head, head), 'promote');
  assert.equal(promotionDecision('b'.repeat(40), head), 'skip');
  assert.throws(() => promotionDecision('abc123', head));
  assert.deepEqual(parseChallenge('Bearer realm="https://git.knubbel.me/v2/token",service="container_registry",scope="*"'),
    { realm: 'https://git.knubbel.me/v2/token', service: 'container_registry', scope: '*' });
  assert.equal(parseChallenge('Basic realm="x"'), null);
});

test('every published advisory needs an assessment with verdict, note and the version it was assessed against', () => {
  const advisories = [{ ghsa_id: 'GHSA-1', updated_at: '2026-01-01T00:00:00Z' }, { ghsa_id: 'GHSA-2' }];
  const { missing, problems } = unassessed(advisories, {
    'GHSA-1': { verdict: 'mitigated', note: 'CSP blocks it', updated: '2026-01-01T00:00:00Z' },
    'GHSA-3': { verdict: 'maybe', note: '' },
    'GHSA-4': { verdict: 'server-only', note: 'not in Teadeck' },
  });
  assert.deepEqual(missing.map((a) => a.ghsa_id), ['GHSA-2']);
  assert.equal(problems.length, 2, problems.join(' | '));
});

test('a known open exposure and an advisory edited after being assessed both fail the check', () => {
  const assessments = {
    'GHSA-open': { verdict: 'affected', note: 'no fix yet', updated: '2026-01-01T00:00:00Z' },
    'GHSA-edited': { verdict: 'server-only', note: 'server side', updated: '2026-01-01T00:00:00Z' },
    'GHSA-quiet': { verdict: 'mitigated', note: 'CSP', updated: '2026-01-01T00:00:00Z' },
  };
  const { missing, problems, changed, affected } = unassessed([
    { ghsa_id: 'GHSA-open', updated_at: '2026-01-01T00:00:00Z' },
    { ghsa_id: 'GHSA-edited', updated_at: '2026-03-05T00:00:00Z' },
    { ghsa_id: 'GHSA-quiet', updated_at: '2026-01-01T00:00:00Z' },
  ], assessments);
  assert.deepEqual(affected.map((a) => a.ghsa_id), ['GHSA-open']);
  assert.deepEqual(changed.map((a) => a.ghsa_id), ['GHSA-edited']);
  assert.deepEqual(missing, []);
  assert.deepEqual(problems, []);
});

test('the upstream report flags patched files, watched paths and changed upstream tests', () => {
  const patched = patchedFiles(['diff --git a/app/javascript/mastodon/api.ts b/app/javascript/mastodon/api.ts\n--- a\n']);
  assert.deepEqual([...patched], ['app/javascript/mastodon/api.ts']);
  assert.equal(matches('lib/sanitize_ext/**', 'lib/sanitize_ext/sanitize_config.rb'), true);
  assert.equal(matches('app/lib/text_formatter.rb', 'app/lib/text_formatter_v2.rb'), false);
  assert.equal(isUpstreamTest('app/javascript/mastodon/utils/__tests__/html-test.ts'), true);
  assert.equal(isUpstreamTest('app/javascript/mastodon/utils/html.test.ts'), true);

  const watch = { groups: [{ reason: 'Security headers: mirrored in nginx.conf', paths: ['config/initializers/content_security_policy.rb'] }] };
  const changes = [
    { status: 'M', file: 'app/javascript/mastodon/api.ts' },
    { status: 'M', file: 'config/initializers/content_security_policy.rb' },
    { status: 'A', file: 'app/javascript/mastodon/utils/html.test.ts' },
    { status: 'M', file: 'README.md' },
  ];
  const { text, reviewCount } = buildReport({ oldCommit: '1'.repeat(40), newCommit: '2'.repeat(40), changes, patched, watch });
  assert.equal(reviewCount, 2);
  assert.match(text, /## Files Teadeck patches \(1\)\n[\s\S]*- M app\/javascript\/mastodon\/api\.ts/);
  assert.match(text, /## Security headers \(1\)[\s\S]*content_security_policy\.rb/);
  assert.match(text, /## Upstream tests changed \(1\)/);
  assert.doesNotMatch(text, /README/);
});

test('patches carry no blob hashes, which only go stale', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const directory = join(import.meta.dirname, '..', 'patches');
  const files = (await readdir(directory)).filter((name) => name.endsWith('.patch'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = await readFile(join(directory, file), 'utf8');
    // `git apply` matches by context, so these lines say nothing and age badly.
    // Regenerate a patch with: git -C .work/upstream diff -- <file> | grep -v '^index '
    const stale = source.split('\n').filter((line) => /^index [0-9a-f]+\.\.[0-9a-f]+/.test(line));
    assert.deepEqual(stale, [], `${file} carries blob hashes`);
  }
});

const oldDigest = `sha256:${'a'.repeat(64)}`;
const newDigest = `sha256:${'b'.repeat(64)}`;
const workflowNames = ['build.yml', 'upstream-update.yml', 'security-advisories.yml'];
const workflowPath = (name) => join(import.meta.dirname, '..', '.forgejo', 'workflows', name);

test('pinning rewrites the Node 26 image line of every workflow and leaves the rest alone', () => {
  for (const [name, indent] of [['build', '      '], ['upstream', '      '], ['advisories', '      ']]) {
    const text = [
      'jobs:',
      `${indent}# Pinned by digest.`,
      `${indent}container:`,
      `${indent}  image: node:26-bookworm@${oldDigest}`,
      `${indent}steps:`,
      `${indent}  - run: echo image: node:26-bookworm@sha256:not-an-image-line`,
      '',
    ].join('\n');
    const next = pinImage(text, newDigest);
    assert.equal(currentDigest(next), newDigest, name);
    assert.equal(next.split('\n').length, text.split('\n').length);
    assert.match(next, /# Pinned by digest\./);
    assert.match(next, /run: echo image: node:26-bookworm@sha256:not-an-image-line/);
  }
  // An unpinned line gets pinned too.
  assert.equal(currentDigest(pinImage('    image: node:26-bookworm\n', newDigest)), newDigest);
});

test('a malformed digest or a text without the image line is refused', () => {
  const text = `    image: node:26-bookworm@${oldDigest}\n`;
  for (const digest of ['sha256:abc', `sha512:${'b'.repeat(64)}`, `sha256:${'B'.repeat(64)}`, undefined]) {
    assert.throws(() => pinImage(text, digest), /Not a sha256 digest/);
  }
  assert.throws(() => pinImage('    image: node:24-bookworm\n', newDigest), /No node:26-bookworm image line/);
  assert.throws(() => currentDigest('    image: node:26-bookworm\n'), /not pinned/);
  assert.throws(() => currentDigest(`    image: node:26-bookworm@${oldDigest}\n    image: node:26-bookworm@${newDigest}\n`), /different digests/);
});

test('build, upstream update and advisories pin the same digest; node-image uses the moving tag', async () => {
  const digests = [];
  for (const name of workflowNames) {
    const text = await readFile(workflowPath(name), 'utf8');
    assert.match(text, /^\s*image: node:26-bookworm@sha256:[0-9a-f]{64}\s*$/m, `${name} is not pinned`);
    digests.push(currentDigest(text));
  }
  assert.equal(new Set(digests).size, 1, digests.join(', '));

  const moving = await readFile(workflowPath('node-image.yml'), 'utf8');
  assert.match(moving, /^\s*image: node:26-bookworm\s*$/m);
  assert.doesNotMatch(moving, /@sha256:/);
});
