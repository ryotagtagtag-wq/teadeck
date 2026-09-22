import { spawn, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';

export const productionConfig = join(import.meta.dirname, '..', 'container', 'nginx.conf');

function has(command, args) {
  return spawnSync(command, args, { stdio: 'ignore' }).status === 0;
}

/**
 * How to run the production web server: the `nginx` binary (CI installs it)
 * or, where Docker is available, the published image's own nginx
 * (TEADECK_NGINX_IMAGE). `null` if neither is available.
 */
export function nginxRunner() {
  if (has(process.env.TEADECK_NGINX ?? 'nginx', ['-v'])) return 'binary';
  if (has('docker', ['info'])) return 'docker';
  return null;
}

/** Skips a test without a web server, except where TEADECK_REQUIRE_NGINX is set (CI). */
export function nginxSkipReason() {
  if (nginxRunner()) return false;
  if (process.env.TEADECK_REQUIRE_NGINX) throw new Error('TEADECK_REQUIRE_NGINX is set, but neither nginx nor Docker is available');
  return 'needs nginx or Docker (set TEADECK_REQUIRE_NGINX in CI to fail instead)';
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    }).on('error', reject);
  });
}

/** container/nginx.conf, changed only where a test run needs other paths or a free port. */
function adapt(config, { port, siteRoot, runDir }) {
  const replace = (text, from, to) => {
    if (!text.includes(from)) throw new Error(`nginx.conf no longer contains ${from}`);
    return text.replaceAll(from, to);
  };
  let result = replace(config, 'listen 8080;', `listen 127.0.0.1:${port};`);
  result = replace(result, 'root /usr/share/nginx/html;', `root ${siteRoot};`);
  result = replace(result, 'pid /tmp/nginx.pid;', `pid ${runDir}/nginx.pid;`);
  // Log files instead of /dev/stdout and /dev/stderr, which cannot be opened where they are sockets (CI runner).
  result = replace(result, 'error_log /dev/stderr warn;', `error_log ${runDir}/error.log warn;`);
  // What container/entrypoint.sh writes from TEADECK_LOGO.
  result = replace(result, 'root /tmp/logo;', `root ${runDir}/logo;`);
  result = replace(result, 'access_log /dev/stdout static;', `access_log ${runDir}/access.log static;`);
  return result.replaceAll(/(\w+_temp_path) \/tmp\//g, `$1 ${runDir}/`);
}

/**
 * Starts nginx with the production configuration, serving `site/current`
 * (a symlink `use()` points at one of the given builds).
 */
export async function startNginx({ builds, config = productionConfig, logo }) {
  const runner = nginxRunner();
  // Not in /tmp: the Docker daemon may have a private /tmp.
  await mkdir(join(import.meta.dirname, '..', '.work'), { recursive: true });
  const dir = await mkdtemp(join(import.meta.dirname, '..', '.work', 'nginx-'));
  await chmod(dir, 0o755); // The image's nginx runs as its own user.
  await mkdir(join(dir, 'site'));
  await mkdir(join(dir, 'run'));
  await chmod(join(dir, 'run'), 0o777);
  if (logo) {
    await mkdir(join(dir, 'run', 'logo'));
    await writeFile(join(dir, 'run', 'logo', 'logo.svg'), logo);
    await chmod(join(dir, 'run', 'logo'), 0o755);
  }
  // Paths as nginx sees them: the same on the host, fixed mount points in a container.
  const inContainer = runner === 'docker';
  const base = inContainer ? '/teadeck-test' : dir;
  const buildPath = (name) => (inContainer ? `/teadeck-builds/${name}` : builds[name]);
  for (const name of Object.keys(builds)) await symlink(buildPath(name), join(dir, 'site', name));
  const port = await freePort();

  const settings = { port, siteRoot: `${base}/site/current`, runDir: `${base}/run` };
  const configPath = join(dir, 'nginx.conf');
  const writeConfig = async (source) => writeFile(configPath, adapt(await readFile(source, 'utf8'), settings));

  const use = async (name, configSource = config) => {
    await rm(join(dir, 'site', 'current'), { force: true });
    await symlink(name, join(dir, 'site', 'current'));
    await writeConfig(configSource);
  };
  await use(Object.keys(builds)[0]);

  let process_;
  let container;
  const mounts = ['-v', `${dir}:${base}`, ...Object.entries(builds).flatMap(([name, path]) => ['-v', `${path}:${buildPath(name)}:ro`])];
  if (runner === 'binary') {
    process_ = spawn(process.env.TEADECK_NGINX ?? 'nginx', ['-p', dir, '-c', configPath, '-e', 'stderr', '-g', 'daemon off;'], { stdio: ['ignore', 'ignore', 'inherit'] });
  } else {
    const image = process.env.TEADECK_NGINX_IMAGE ?? 'git.knubbel.me/knubbel/teadeck:latest';
    const run = spawnSync('docker', ['run', '-d', '--rm', '--network', 'host', ...mounts, image, '-c', `${base}/nginx.conf`], { encoding: 'utf8' }); // Appended to the image's entrypoint.
    if (run.status !== 0) throw new Error(`docker run failed: ${run.stderr}`);
    container = run.stdout.trim();
  }

  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await fetch(`${origin}/healthz`)).ok) break;
    } catch { /* not listening yet */ }
    if (attempt > 100) {
      const log = await readFile(join(dir, 'run', 'error.log'), 'utf8').catch(() => '(no error.log)');
      throw new Error(`nginx did not start:\n${log}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return {
    origin,
    /** Serves another build (and optionally another configuration), like a deploy. */
    async deploy(name, configSource = config) {
      await use(name, configSource);
      const signal = runner === 'binary'
        ? spawnSync(process.env.TEADECK_NGINX ?? 'nginx', ['-p', dir, '-c', configPath, '-s', 'reload'], { encoding: 'utf8' })
        : spawnSync('docker', ['exec', container, 'nginx', '-c', `${base}/nginx.conf`, '-s', 'reload'], { encoding: 'utf8' });
      if (signal.status !== 0) throw new Error(`nginx reload failed: ${signal.stderr}`);

      // During a reload the old worker processes still answer with the old configuration
      // while the new files are already served. Wait until only the new one answers,
      // otherwise a test can be handed a mixture of both builds.
      const expected = /add_header Content-Security-Policy "([^"]+)"/.exec(await readFile(configSource, 'utf8'))?.[1];
      let inARow = 0;
      for (let attempt = 0; expected && inARow < 5; attempt++) {
        const served = (await fetch(`${origin}/healthz`)).headers.get('content-security-policy');
        inARow = served === expected ? inARow + 1 : 0;
        if (attempt > 200) throw new Error('nginx kept serving the previous configuration');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    },
    async stop() {
      if (process_) {
        process_.kill();
        await new Promise((resolve) => process_.once('exit', resolve));
      }
      if (container) spawnSync('docker', ['stop', '-t', '1', container], { stdio: 'ignore' });
      await rm(dir, { recursive: true, force: true });
    },
  };
}
