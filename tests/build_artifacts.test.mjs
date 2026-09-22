import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import path from 'node:path';

test('the published source archive contains the build, license, security and deployment files', () => {
  const result = spawnSync('tar', ['-tzf', path.join(import.meta.dirname, '../dist/source.tar.gz')], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  const files = new Set(result.stdout.trim().split('\n'));
  for (const file of [
    'LICENSE', 'NOTICE', 'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'package.json',
    '.env.example', 'compose.yml.example', 'compose.build.yml', 'upstream.lock.json',
    'scripts/prepare.mjs', 'scripts/build.mjs', '.forgejo/workflows/build.yml',
    'security/mastodon-advisories.json', 'upstream/package.json', 'upstream/yarn.lock',
  ]) assert.ok(files.has(`teadeck-source/${file}`), file);
  assert.ok(![...files].some(file => /(?:^|\/)node_modules\//.test(file)), 'dependencies are installed from the lockfile, not archived');
  assert.ok(![...files].some(file => /\.har$|(?:^|\/)\.env$|(?:^|\/)\.git\//.test(file)), 'no local secrets, network captures or Git metadata');
});

test('the image packages the build instead of repeating it', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(path.join(import.meta.dirname, '../container/Dockerfile'), 'utf8');
  const dockerfile = source.split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n');
  // A build stage here would mean the shipped image is a second, independent
  // build of the same sources - and CI would build the client twice per push.
  assert.equal(dockerfile.match(/^FROM /gm).length, 1, 'the image has one stage');
  assert.match(dockerfile, /^COPY dist \/usr\/share\/nginx\/html$/m);
  assert.doesNotMatch(dockerfile, /scripts\/(prepare|build)\.mjs/);
});
