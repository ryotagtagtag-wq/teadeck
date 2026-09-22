import { spawnSync } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { requireToolchain, runYarn } from './toolchain.mjs';
import { assertBuilt, assertPrepared } from './build_state.mjs';

const root = path.resolve(import.meta.dirname, '..');
const playwright = path.join(root, '.work/upstream/node_modules/playwright');
requireToolchain();
await assertPrepared(root);
await assertBuilt(root);

await stat(path.join(root, 'dist/index.html')).catch(() => {
  throw new Error('Run node scripts/build.mjs first');
});
await stat(playwright).catch(() => {
  throw new Error('Run npm run build first (installs Playwright via the upstream yarn install)');
});

// Type-check upstream plus patches and integration/ first (vite build does not type-check).
runYarn(['tsc', '--noEmit'], path.join(root, '.work/upstream'));

// Mastodon's own web client tests, run against the patched client: regressions in
// imported code (including security fixes that come with tests) show up here.
// One file at a time and with retries: some measure their own run time against a fixed
// limit (e.g. utils/__tests__/html-test.ts), which a busy CI runner exceeds when files run in parallel.
runYarn(['vitest', '--project=legacy-tests', 'run', '--no-file-parallelism', '--retry=2'], path.join(root, '.work/upstream'));

// tests/browser.mjs and tests/accounts.test.mjs need a Chromium build; if
// none is installed yet, `chromium.launch()` fails with Playwright's own
// clear instructions to run `node .work/upstream/node_modules/playwright/cli.js install chromium`.
const concurrency = process.env.TEADECK_TEST_CONCURRENCY ?? '2';
if (!/^[1-9]\d*$/.test(concurrency)) throw new Error('TEADECK_TEST_CONCURRENCY must be a positive integer.');
const files = (await readdir(path.join(root, 'tests'))).filter(name => name.endsWith('.test.mjs') || name === 'browser.mjs').sort();
const result = spawnSync(process.execPath, ['--test', `--test-concurrency=${concurrency}`, ...files.map(name => `tests/${name}`)], { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
