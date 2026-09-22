import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { assertBuilt, assertPrepared, fingerprint, preparationFingerprint, sourceEntries } from '../scripts/build_state.mjs';

test('a changed or failed preparation cannot be built as if it succeeded', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'teadeck-build-state-'));
  try {
    for (const dir of ['.work', 'patches', 'scripts']) await mkdir(path.join(root, dir));
    await writeFile(path.join(root, 'upstream.lock.json'), '{}');
    await writeFile(path.join(root, 'scripts/prepare.mjs'), 'prepare');
    await writeFile(path.join(root, 'patches/01.patch'), 'old');
    await assert.rejects(assertPrepared(root), /prepare:upstream/);
    await writeFile(path.join(root, '.work/prepared.sha256'), await preparationFingerprint(root));
    await assertPrepared(root);
    await writeFile(path.join(root, 'patches/01.patch'), 'new');
    await assert.rejects(assertPrepared(root), /prepare:upstream/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('verification rejects bundles from before source changes, including deleted files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'teadeck-build-state-'));
  try {
    await mkdir(path.join(root, '.work'));
    for (const name of sourceEntries) await writeFile(path.join(root, name), name);
    await rm(path.join(root, 'integration'));
    await mkdir(path.join(root, 'integration'));
    await writeFile(path.join(root, 'integration/example.ts'), 'old');
    await writeFile(path.join(root, '.work/built.sha256'), await fingerprint(root, sourceEntries));
    await assertBuilt(root);
    await writeFile(path.join(root, 'integration/example.ts'), 'new');
    await assert.rejects(assertBuilt(root), /npm run build/);
    await rm(path.join(root, 'integration/example.ts'));
    await assert.rejects(assertBuilt(root), /npm run build/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
