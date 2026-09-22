// Points an image tag (e.g. `latest`) at the image already pushed for a commit
// (`sha-<12>`), but only while that commit is still the head of the branch.
//
// Builds of successive pushes can finish in any order; without this check a
// slower build of an older commit could move `latest` back after a newer one
// (say, a security fix) was published. The registry copy is one manifest PUT,
// right after the check. Deployments that must not move at all can use the
// printed digest (image@sha256:…) or the sha tag instead of `latest`.
//
// Usage (CI, in a checkout of the repository): node scripts/promote_image.mjs
//   --image git.knubbel.me/knubbel/teadeck --from sha-<12> --to latest --commit <sha> --branch main
// Environment: REGISTRY_USER, REGISTRY_TOKEN (push to the image).
import { spawnSync } from 'node:child_process';

const manifestTypes = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
];

/** Parses `Bearer realm="…",service="…",scope="…"`. */
export function parseChallenge(header) {
  if (!header?.startsWith('Bearer ')) return null;
  return Object.fromEntries([...header.slice(7).matchAll(/(\w+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
}

/** Only the head of the branch may move the tag. */
export function promotionDecision(commit, head) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`Not a full commit id: ${commit}`);
  return head === commit ? 'promote' : 'skip';
}

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing --${name}`);
  return process.argv[index + 1];
}

/** The branch head on the server (not the local checkout), with the checkout's credentials. */
function branchHead(branch) {
  const result = spawnSync('git', ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ls-remote: ${result.stderr}`);
  return result.stdout.split('\t')[0].trim();
}

async function registryAuthorization(registry, name, user, password) {
  const probe = await fetch(`https://${registry}/v2/`);
  const challenge = parseChallenge(probe.headers.get('www-authenticate'));
  const basic = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  if (!challenge?.realm) return basic;
  const url = new URL(challenge.realm);
  if (challenge.service) url.searchParams.set('service', challenge.service);
  url.searchParams.set('scope', `repository:${name}:pull,push`);
  const response = await fetch(url, { headers: { authorization: basic } });
  if (!response.ok) throw new Error(`Registry token: HTTP ${response.status}`);
  const { token, access_token: accessToken } = await response.json();
  return `Bearer ${token ?? accessToken}`;
}

if (import.meta.main) {
  const image = option('image');
  const [registry, ...nameParts] = image.split('/');
  const name = nameParts.join('/');
  const from = option('from');
  const to = option('to');
  const commit = option('commit');
  const branch = option('branch');

  const isCurrent = async () => promotionDecision(commit, branchHead(branch)) === 'promote';
  if (!await isCurrent()) {
    console.log(`${commit.slice(0, 12)} is no longer the head of ${branch}; ${image}:${to} stays where a newer build put it.`);
    process.exit(0);
  }

  const authorization = await registryAuthorization(registry, name, process.env.REGISTRY_USER ?? '', process.env.REGISTRY_TOKEN ?? '');
  const source = await fetch(`https://${registry}/v2/${name}/manifests/${from}`, { headers: { authorization, accept: manifestTypes.join(', ') } });
  if (!source.ok) throw new Error(`Manifest ${from}: HTTP ${source.status}`);
  const body = Buffer.from(await source.arrayBuffer());
  const digest = source.headers.get('docker-content-digest');

  // Checked again right before moving the tag: the build of a newer commit may have finished meanwhile.
  if (!await isCurrent()) {
    console.log(`${commit.slice(0, 12)} stopped being the head of ${branch} while promoting; ${image}:${to} left unchanged.`);
    process.exit(0);
  }
  const put = await fetch(`https://${registry}/v2/${name}/manifests/${to}`, {
    method: 'PUT', headers: { authorization, 'content-type': source.headers.get('content-type') }, body,
  });
  if (!put.ok) throw new Error(`Tag ${to}: HTTP ${put.status} ${await put.text()}`);
  console.log(`${image}:${to} → ${image}:${from} (${image}@${digest}), commit ${commit}`);
}
