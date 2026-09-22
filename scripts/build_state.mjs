import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

// Explicit list: deployments must never archive .env, network captures or private logos.
export const sourceEntries = [
  'README.md', 'LICENSE', 'NOTICE', 'CONTRIBUTING.md', 'SECURITY.md',
  'package.json', 'upstream.lock.json', 'scripts', 'integration', 'patches',
  'compose.yml.example', 'compose.build.yml', '.dockerignore', '.gitignore', '.env.example',
  '.forgejo', 'container', 'tests', 'docs', 'security',
];

export async function fingerprint(root, entries) {
  const hash = createHash('sha256');
  async function visit(name) {
    const file = path.join(root, name);
    const info = await stat(file);
    if (info.isDirectory()) {
      for (const child of (await readdir(file)).sort()) await visit(`${name}/${child}`);
    } else {
      const content = await readFile(file);
      hash.update(`${name}\0${content.length}\0`);
      hash.update(content);
    }
  }
  for (const name of [...entries].sort()) await visit(name);
  return hash.digest('hex');
}

export const preparationFingerprint = root => fingerprint(root, ['upstream.lock.json', 'patches', 'scripts/prepare.mjs']);

export async function assertPrepared(root) {
  const expected = await preparationFingerprint(root);
  const actual = await readFile(path.join(root, '.work/prepared.sha256'), 'utf8').catch(() => '');
  if (actual.trim() !== expected) throw new Error('Upstream checkout is missing or its patches/lock changed. Run npm run prepare:upstream before building.');
}

export async function assertBuilt(root) {
  const expected = await fingerprint(root, sourceEntries);
  const actual = await readFile(path.join(root, '.work/built.sha256'), 'utf8').catch(() => '');
  if (actual.trim() !== expected) throw new Error('dist/ does not match the current sources. Run npm run build before verifying.');
}
