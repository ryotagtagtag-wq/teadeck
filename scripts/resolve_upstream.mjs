/**
 * Resolves Mastodon's `nightly` image to the source commit it was built from.
 *
 *   node scripts/resolve_upstream.mjs            # print the candidate as JSON
 *   node scripts/resolve_upstream.mjs --write    # also update upstream.lock.json
 *
 * Exits 0 in both cases; the output's `changed` says whether the lock moves.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const lockPath = path.join(root, 'upstream.lock.json');
const image = 'mastodon/mastodon';
const tag = process.env.UPSTREAM_TAG ?? 'nightly';

async function get(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

/** Picks what the build needs from an image config; a missing commit is a hard error (never fall back to main). */
export function candidateFromImageConfig(config, digest) {
  const env = Object.fromEntries((config.config?.Env ?? []).map((entry) => {
    const index = entry.indexOf('=');
    return [entry.slice(0, index), entry.slice(index + 1)];
  }));
  const labels = config.config?.Labels ?? {};
  const commit = env.SOURCE_COMMIT || labels['org.opencontainers.image.revision'];
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) throw new Error(`Image ${digest} does not name a source commit`);
  // Ends up in a branch name and an image tag, so only allow what both accept.
  const release = env.MASTODON_VERSION_PRERELEASE || undefined;
  if (release !== undefined && !/^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/.test(release)) {
    throw new Error(`Image ${digest} names an unexpected release`);
  }
  return { commit, release, imageDigest: digest };
}

async function resolve() {
  const { token } = await (await get(`https://ghcr.io/token?service=ghcr.io&scope=repository:${image}:pull`)).json();
  const auth = { Authorization: `Bearer ${token}` };
  const index = await (await get(`https://ghcr.io/v2/${image}/manifests/${tag}`, {
    ...auth, Accept: 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json',
  })).json();
  const platform = index.manifests?.find((m) => m.platform?.os === 'linux' && m.platform?.architecture === 'amd64');
  if (!platform) throw new Error(`No linux/amd64 image for ${image}:${tag}`);
  const manifest = await (await get(`https://ghcr.io/v2/${image}/manifests/${platform.digest}`, {
    ...auth, Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
  })).json();
  const config = await (await get(`https://ghcr.io/v2/${image}/blobs/${manifest.config.digest}`, auth)).json();
  const candidate = candidateFromImageConfig(config, platform.digest);
  const pkg = await (await get(`https://raw.githubusercontent.com/mastodon/mastodon/${candidate.commit}/package.json`)).json();
  return { ...candidate, packageManager: pkg.packageManager };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  const candidate = await resolve();
  const changed = candidate.commit !== lock.commit;
  if (changed && process.argv.includes('--write')) {
    const next = { ...lock, commit: candidate.commit, packageManager: candidate.packageManager, release: candidate.release, imageDigest: candidate.imageDigest };
    await writeFile(lockPath, `${JSON.stringify(next, null, 2)}\n`);
  }
  console.log(JSON.stringify({ ...candidate, previousCommit: lock.commit, changed }));
}
