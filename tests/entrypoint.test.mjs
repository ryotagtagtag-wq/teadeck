import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// container/entrypoint.sh decides which logo the container serves. A logo is decoration:
// nothing about it may stop nginx from starting (a broken setting once took the site down).
const script = join(import.meta.dirname, '..', 'container', 'entrypoint.sh');
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><title>Test</title></svg>';

function run(logo, { files = {}, file, environment = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'teadeck-entrypoint-'));
  try {
    const logoDir = join(dir, 'config');
    const target = join(dir, 'target');
    const config = join(dir, 'deployment');
    const stub = join(dir, 'bin');
    mkdirSync(logoDir);
    mkdirSync(stub);
    for (const [name, content] of Object.entries(files)) writeFileSync(join(logoDir, name), content);
    writeFileSync(join(dir, 'default.svg'), '<svg><title>Default</title></svg>');
    const bundled = join(dir, 'bundled');
    mkdirSync(bundled);
    for (const name of ['flat', 'glass', 'ceramic']) {
      writeFileSync(join(bundled, `teacup-${name}.svg`), `<svg><title>${name}</title></svg>`);
    }
    // Stands in for nginx: records that it was started, with which arguments.
    writeFileSync(join(stub, 'nginx'), `#!/bin/sh\nprintf '%s\\n' "$*" > ${join(dir, 'started')}\n`);
    chmodSync(join(stub, 'nginx'), 0o755);

    const result = spawnSync('sh', [script, '-c', '/nginx.conf'], {
      encoding: 'utf8',
      env: {
        PATH: `${stub}:${process.env.PATH}`,
        ...(logo === undefined ? {} : { TEADECK_LOGO: logo }),
        ...(file === undefined ? {} : { TEADECK_LOGO_FILE: file }),
        ...environment,
        TEADECK_LOGO_DIR: logoDir,
        TEADECK_LOGO_DEFAULT: join(dir, 'default.svg'),
        TEADECK_LOGO_BUNDLED: bundled,
        TEADECK_LOGO_TARGET: target,
        TEADECK_CONFIG_TARGET: config,
      },
    });
    const served = join(target, 'logo.svg');
    const deployment = join(config, 'teadeck.json');
    return {
      status: result.status,
      stderr: result.stderr,
      started: existsSync(join(dir, 'started')) ? readFileSync(join(dir, 'started'), 'utf8').trim() : null,
      logo: existsSync(served) ? readFileSync(served, 'utf8') : null,
      config: existsSync(deployment) ? JSON.parse(readFileSync(deployment, 'utf8')) : null,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('without TEADECK_LOGO nginx starts and serves no logo', () => {
  const result = run(undefined);
  assert.equal(result.status, 0);
  assert.equal(result.started, '-e stderr -g daemon off; -c /nginx.conf');
  assert.equal(result.logo, null);
});

test('an own file and one of the bundled logos are put in place', () => {
  const own = run(undefined, { file: 'mein-logo.svg', files: { 'mein-logo.svg': svg } });
  assert.equal(own.logo, svg);
  assert.equal(own.started !== null, true);

  assert.match(run('mastodon').logo, /Default/);
  // The previous name for it still works.
  assert.match(run('default').logo, /Default/);
});

test('an own file wins over a bundled one, with a note', () => {
  const result = run('glass', { file: 'mein-logo.svg', files: { 'mein-logo.svg': svg } });
  assert.equal(result.logo, svg);
  assert.match(result.stderr, /both set/);
});

test('a bundled name that does not exist is reported, not guessed', () => {
  const result = run('mein-logo.svg', { files: { 'mein-logo.svg': svg } });
  assert.equal(result.logo, null, 'a file name is not a bundled logo');
  assert.match(result.stderr, /not one of flat, glass, ceramic, mastodon/);
  assert.match(result.stderr, /TEADECK_LOGO_FILE/);
  assert.equal(result.started !== null, true);
});

test('a missing, unreadable or mistyped logo never stops the container', () => {
  for (const [file, options, expected] of [
    ['fehlt.svg', {}, /does not exist/],
    ['kaputt.txt', { files: { 'kaputt.txt': 'kein svg' } }, /not an SVG/],
    ['/etc/passwd', {}, /is a path/],
  ]) {
    const name = file;
    const result = run(undefined, { ...options, file });
    assert.equal(result.status, 0, `${name}: exit status`);
    assert.equal(result.started !== null, true, `${name}: nginx started anyway`);
    assert.equal(result.logo, null, `${name}: no logo served`);
    assert.match(result.stderr, expected);
    assert.match(result.stderr, /Starting without a logo/);
  }
});

test('the teacups shipped in the image are selectable by material', () => {
  for (const name of ['flat', 'glass', 'ceramic']) {
    const result = run(name);
    assert.match(result.logo, new RegExp(`<title>${name}</title>`));
    assert.equal(result.stderr, '');
  }
});

test('a path whose file name does exist in the logo directory is still found', () => {
  const result = run(undefined, { file: '/woanders/mein-logo.svg', files: { 'mein-logo.svg': svg } });
  assert.equal(result.logo, svg);
  assert.match(result.stderr, /is a path/);
});

test('the design this deployment starts with is written for the interface to read', () => {
  assert.equal(run(undefined).config, null, 'nothing configured, nothing served');

  assert.deepEqual(run(undefined, { environment: { TEADECK_THEME: 'assam' } }).config, { theme: 'assam' });
  assert.deepEqual(run(undefined, { environment: { TEADECK_COLOR_SCHEME: 'dark' } }).config, { colorScheme: 'dark' });
  assert.deepEqual(run(undefined, { environment: { TEADECK_THEME: 'sencha', TEADECK_COLOR_SCHEME: 'light' } }).config,
    { theme: 'sencha', colorScheme: 'light' });
});

test('an unknown design is reported and left out, and never stops the container', () => {
  const result = run(undefined, { environment: { TEADECK_THEME: 'earlgrey', TEADECK_COLOR_SCHEME: 'dunkel' } });
  assert.equal(result.status, 0);
  assert.equal(result.started !== null, true);
  assert.equal(result.config, null);
  assert.match(result.stderr, /TEADECK_THEME=earlgrey is not mastodon, assam or sencha/);
  assert.match(result.stderr, /TEADECK_COLOR_SCHEME=dunkel is not auto, light or dark/);
});


