import { spawnSync } from 'node:child_process';

export function requireToolchain() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 24 || (major === 24 && minor < 2)) throw new Error('Node.js >= 24.2 is required. Use Node 24 LTS or newer; the project Dockerfile requires a prebuilt client.');
  for (const [command, args, hint] of [
    ['git', ['--version'], 'Install Git.'],
    ['tar', ['--version'], 'Install GNU tar (the source archive uses GNU tar options).'],
    ['corepack', ['--version'], 'Install Corepack, for example: npm install --global corepack'],
  ]) {
    const result = spawnSync(command, args, { encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error(`${command} is unavailable. ${hint}`);
    if (command === 'tar' && !result.stdout.includes('GNU tar')) throw new Error('GNU tar is required for the source archive. On macOS make GNU tar available as tar on PATH, or use a Linux build environment.');
  }
}

export function runYarn(args, cwd, env = {}) {
  const result = spawnSync('corepack', ['yarn', ...args], {
    cwd, stdio: 'inherit',
    env: {
      ...process.env,
      COREPACK_HOME: process.env.COREPACK_HOME ?? '/tmp/teadeck-corepack',
      YARN_CACHE_FOLDER: process.env.YARN_CACHE_FOLDER ?? '/tmp/teadeck-yarn-cache',
      HUSKY: '0', ...env,
    },
  });
  if (result.error) throw new Error(`Cannot start Corepack: ${result.error.message}. Install it with npm install --global corepack.`);
  if (result.status !== 0) throw new Error(`corepack yarn ${args.join(' ')} failed (${result.signal ?? result.status})`);
}

if (import.meta.main) {
  requireToolchain();
  console.log(`Build prerequisites available (Node ${process.versions.node}, Git, GNU tar, Corepack).`);
  console.log('Browser tests additionally need Playwright Chromium; production tests need nginx or Docker. See CONTRIBUTING.md.');
}
