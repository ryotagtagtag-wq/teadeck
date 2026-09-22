// Lists Mastodon security advisories that have not been assessed for Teadeck yet.
//
// A green upstream build says nothing about security fixes: a fix in code
// Teadeck imports unchanged arrives with the next upstream update, but one in
// a component Teadeck replaces (login, API layer, service worker, the web
// server's security headers) or one that relies on Mastodon's server (HTML
// sanitizing, its CSP) needs its own assessment. Every advisory therefore gets
// an entry in security/mastodon-advisories.json; this script fails while an
// advisory has no entry, while an entry says Teadeck is affected, and when an
// advisory changed after it was assessed (advisories are edited, e.g. details
// added after admins had time to update).
// Run daily by .forgejo/workflows/security-advisories.yml.
//
// Usage: node scripts/check_advisories.mjs [--from-file advisories.json]
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const assessmentsFile = path.join(root, 'security/mastodon-advisories.json');
const api = 'https://api.github.com/repos/mastodon/mastodon/security-advisories';

export const verdicts = ['server-only', 'mitigated', 'fixed-upstream', 'fixed-in-teadeck', 'affected'];

async function fetchAll() {
  const advisories = [];
  let url = `${api}?per_page=100&sort=published&direction=desc`;
  while (url) {
    const response = await fetch(url, { headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' } });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    advisories.push(...await response.json());
    url = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get('link') ?? '')?.[1];
  }
  return advisories;
}

/**
 * What still needs work: advisories with no entry, entries that are incomplete,
 * advisories edited since they were assessed, and those Teadeck is affected by.
 */
export function unassessed(advisories, assessments) {
  const problems = [];
  for (const [id, entry] of Object.entries(assessments)) {
    if (!verdicts.includes(entry.verdict) || typeof entry.note !== 'string' || !entry.note.trim()) {
      problems.push(`${id}: needs a verdict (${verdicts.join(', ')}) and a note`);
    } else if (!entry.updated) {
      problems.push(`${id}: needs the advisory's updated_at it was assessed against`);
    }
  }
  const missing = advisories.filter((advisory) => !assessments[advisory.ghsa_id]);
  const changed = advisories.filter((advisory) => {
    const entry = assessments[advisory.ghsa_id];
    return entry?.updated && advisory.updated_at && advisory.updated_at !== entry.updated;
  });
  const affected = advisories.filter((advisory) => assessments[advisory.ghsa_id]?.verdict === 'affected');
  return { missing, problems, changed, affected };
}

function describe(advisory) {
  const ranges = (advisory.vulnerabilities ?? []).map((v) => `${v.vulnerable_version_range ?? '?'} → ${v.patched_versions ?? '?'}`).join('; ');
  return `- ${advisory.ghsa_id} (${advisory.severity}, published ${advisory.published_at?.slice(0, 10)}): ${advisory.summary}\n  ${advisory.html_url}\n  affected: ${ranges}`;
}

if (import.meta.main) {
  const fromFile = process.argv.indexOf('--from-file');
  const advisories = fromFile > 0 ? JSON.parse(await readFile(process.argv[fromFile + 1], 'utf8')) : await fetchAll();
  const { assessments } = JSON.parse(await readFile(assessmentsFile, 'utf8'));
  const { missing, problems, changed, affected } = unassessed(advisories, assessments);
  for (const problem of problems) console.error(problem);
  if (affected.length) {
    console.error(`Teadeck is recorded as affected by ${affected.length} advisor${affected.length === 1 ? 'y' : 'ies'}; act on ${affected.length === 1 ? 'it' : 'them'}:\n`);
    console.error(affected.map((advisory) => `${describe(advisory)}\n  note: ${assessments[advisory.ghsa_id].note}`).join('\n'));
  }
  if (changed.length) {
    console.error(`\n${changed.length} advisor${changed.length === 1 ? 'y was' : 'ies were'} edited after being assessed; re-read and update the entry (including "updated"):\n`);
    console.error(changed.map((advisory) => `${describe(advisory)}\n  assessed against: ${assessments[advisory.ghsa_id].updated}, now: ${advisory.updated_at}`).join('\n'));
  }
  if (missing.length) {
    console.error(`${missing.length} Mastodon security advisor${missing.length === 1 ? 'y has' : 'ies have'} not been assessed for Teadeck:\n`);
    console.error(missing.map(describe).join('\n'));
    console.error(`\nAssess each (does it affect imported web client code, a component Teadeck replaces, container/nginx.conf, or only Mastodon's server?), act on it, and record the result in security/mastodon-advisories.json.`);
  }
  if (missing.length || problems.length || changed.length || affected.length) process.exit(1);
  console.log(`All ${advisories.length} Mastodon security advisories are assessed.`);
}
