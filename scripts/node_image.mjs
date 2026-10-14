/**
 * Keeps the CI workflows on one digest of Node 26's base image.
 *
 *   node scripts/node_image.mjs --resolve          # print the digest node:26-bookworm points to now
 *   node scripts/node_image.mjs --current          # print the digest the workflows pin (all must agree)
 *   node scripts/node_image.mjs --write <digest>   # pin <digest> in the workflows; say whether anything changed
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const workflowDir = path.join(root, '.forgejo', 'workflows');
// node-image.yml is not listed: it runs the moving tag on purpose, to test the newest image.
const pinnedWorkflows = ['build.yml', 'upstream-update.yml', 'security-advisories.yml'];
const repository = 'library/node';
const tag = '26-bookworm';
const digestPattern = /^sha256:[0-9a-f]{64}$/;
// The image line of a workflow; group 2 holds the digest when the line is pinned.
const imageLine = /^([ \t]*image: node:26-bookworm)(@sha256:[0-9a-f]{64})?[ \t]*$/gm;

function checkDigest(digest) {
  if (!digestPattern.test(digest ?? '')) throw new Error(`Not a sha256 digest: ${digest}`);
}

/** Pins every node:26-bookworm image line to `digest`. A text without one is an error, not a silent no-op. */
export function pinImage(text, digest) {
  checkDigest(digest);
  let lines = 0;
  const next = text.replace(imageLine, (_, image) => {
    lines += 1;
    return `${image}@${digest}`;
  });
  if (lines === 0) throw new Error('No node:26-bookworm image line');
  return next;
}

/** The digest a workflow pins. Throws on an unpinned line, a missing line, or lines that disagree. */
export function currentDigest(text) {
  const digests = [...text.matchAll(imageLine)].map((match) => match[2]?.slice(1) ?? null);
  if (digests.length === 0) throw new Error('No node:26-bookworm image line');
  if (digests.includes(null)) throw new Error('An image line is not pinned');
  if (new Set(digests).size !== 1) throw new Error(`Image lines pin different digests: ${digests.join(', ')}`);
  return digests[0];
}

async function get(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

/** The index digest is what the registry names in its response header; a body hash would be a second opinion. */
async function resolveDigest() {
  const { token } = await (await get(`https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repository}:pull`)).json();
  const response = await get(`https://registry-1.docker.io/v2/${repository}/manifests/${tag}`, {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json',
  });
  await response.text();
  const digest = response.headers.get('docker-content-digest');
  if (!digestPattern.test(digest ?? '')) throw new Error(`${repository}:${tag} has no valid Docker-Content-Digest`);
  return digest;
}

async function readWorkflows() {
  return Promise.all(pinnedWorkflows.map(async (name) => {
    const file = path.join(workflowDir, name);
    return { name, file, text: await readFile(file, 'utf8') };
  }));
}

async function pinnedDigest() {
  const digests = (await readWorkflows()).map(({ name, text }) => {
    try {
      return currentDigest(text);
    } catch (error) {
      throw new Error(`${name}: ${error.message}`);
    }
  });
  if (new Set(digests).size !== 1) throw new Error(`Workflows pin different digests: ${digests.join(', ')}`);
  return digests[0];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [flag, value] = process.argv.slice(2);
  if (flag === '--resolve') {
    console.log(await resolveDigest());
  } else if (flag === '--current') {
    console.log(await pinnedDigest());
  } else if (flag === '--write') {
    checkDigest(value);
    const changed = [];
    for (const { name, file, text } of await readWorkflows()) {
      const next = pinImage(text, value);
      if (next !== text) {
        await writeFile(file, next);
        changed.push(name);
      }
    }
    console.log(changed.length > 0 ? `changed: ${changed.join(', ')}` : 'unchanged');
  } else {
    console.error('usage: node scripts/node_image.mjs --resolve | --current | --write <sha256:digest>');
    process.exit(2);
  }
}
