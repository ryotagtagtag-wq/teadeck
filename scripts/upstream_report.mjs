// Lists upstream changes between two Mastodon commits that need review: files
// the patches modify, files in security/upstream-watch.json and changed tests.
//
// Usage: node scripts/upstream_report.mjs <old-commit> <new-commit> [repository]
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

export function matches(pattern, file) {
  return pattern.endsWith('/**') ? file.startsWith(pattern.slice(0, -2)) : file === pattern;
}

/** Upstream files the patches modify (from their `diff --git a/… b/…` headers). */
export function patchedFiles(patchTexts) {
  const files = new Set();
  for (const text of patchTexts) {
    for (const match of text.matchAll(/^diff --git a\/(\S+) b\//gm)) files.add(match[1]);
  }
  return files;
}

export function isUpstreamTest(file) {
  return /(^|\/)__tests__\//.test(file) || /\.test\.[cm]?[jt]sx?$/.test(file);
}

/** `changes`: [{ status, file }] from `git diff --name-status`. */
export function buildReport({ oldCommit, newCommit, changes, patched, watch }) {
  const lines = [`Upstream ${oldCommit.slice(0, 12)} → ${newCommit.slice(0, 12)}: ${changes.length} changed files.`, ''];
  const list = (entries) => entries.map(({ status, file }) => `- ${status} ${file}`);
  const patchedChanges = changes.filter(({ file }) => patched.has(file));
  const reviewCount = patchedChanges.length + watch.groups.reduce((count, group) => count + changes.filter(({ file }) => group.paths.some((p) => matches(p, file))).length, 0);

  lines.push(`## Files Teadeck patches (${patchedChanges.length})`, '',
    patchedChanges.length ? 'The patches still apply, but check that the upstream change does not alter what the patch relies on, especially security fixes.' : 'None.', ...list(patchedChanges), '');
  for (const group of watch.groups) {
    const hits = changes.filter(({ file }) => group.paths.some((p) => matches(p, file)));
    lines.push(`## ${group.reason.split(':')[0]} (${hits.length})`, '', group.reason, ...(hits.length ? list(hits) : ['', 'No changes.']), '');
  }
  const tests = changes.filter(({ file }) => isUpstreamTest(file));
  lines.push(`## Upstream tests changed (${tests.length})`, '', 'Run by scripts/verify.mjs against the patched client.', ...list(tests), '');
  return { text: lines.join('\n'), reviewCount };
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

if (import.meta.main) {
  const [oldCommit, newCommit, repository] = process.argv.slice(2);
  if (!oldCommit || !newCommit) throw new Error('Usage: node scripts/upstream_report.mjs <old-commit> <new-commit> [repository]');
  const lock = JSON.parse(await readFile(path.join(root, 'upstream.lock.json'), 'utf8'));
  const dir = await mkdtemp(path.join(tmpdir(), 'teadeck-upstream-report-'));
  try {
    git(['init', '--quiet'], dir);
    // Trees only: enough for the list of changed files.
    git(['fetch', '--quiet', '--filter=blob:none', '--depth=1', repository ?? lock.repository, oldCommit, newCommit], dir);
    const changes = git(['diff', '--no-renames', '--name-status', oldCommit, newCommit], dir).trim().split('\n').filter(Boolean)
      .map((line) => { const [status, file] = line.split('\t'); return { status, file }; });
    const patchDir = path.join(root, 'patches');
    const patched = patchedFiles(await Promise.all((await readdir(patchDir)).filter((f) => f.endsWith('.patch')).map((f) => readFile(path.join(patchDir, f), 'utf8'))));
    const watch = JSON.parse(await readFile(path.join(root, 'security/upstream-watch.json'), 'utf8'));
    const { text, reviewCount } = buildReport({ oldCommit, newCommit, changes, patched, watch });
    console.log(text);
    console.error(`review-count=${reviewCount}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
