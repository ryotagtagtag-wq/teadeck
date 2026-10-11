# Contributing to Teadeck

## Set up

Use Linux with Node.js 24.2 or newer, npm, Corepack, Git and GNU tar. On Windows, use WSL. On macOS, GNU tar must be available as `tar` on your PATH.

If Corepack is missing, install it first:

```sh
npm install --global corepack
```

Then, from a full checkout:

```sh
npm run doctor
npm run build:fresh
```

The first build needs internet access and several GB of free disk space.

## Make changes

| What changed | What to run |
|---|---|
| First checkout | `npm run build:fresh` |
| Integration code, documentation, tests or most build scripts | `npm run check` |
| Patches, `upstream.lock.json` or `scripts/prepare.mjs` | `npm run build:fresh`, then `npm test` |

`prepare:upstream` replaces `.work/upstream`, including its installed dependencies. Do not keep work there that you have not saved elsewhere. Put Teadeck code in `integration/` and changes to Mastodon's code in `patches/`. Patches are applied in filename order and grouped by feature: fix a behaviour in the patch that owns it, and give a new feature a patch of its own.

To write or update a patch, change the file in `.work/upstream`, then save the diff without its `index` lines:

```sh
git -C .work/upstream diff -- <file> | grep -v '^index ' > patches/<nn>-<name>.patch
```

`git apply` does not need those lines, and they go stale as Mastodon moves on.

## Tests

After the first build, install Playwright's Chromium and Firefox and their system dependencies:

```sh
npm run test:install
```

Installing system dependencies may require administrator privileges. If those dependencies are already installed, download only the browser:

```sh
node .work/upstream/node_modules/playwright/cli.js install chromium firefox
```

Most browser tests run in Chromium; those that depend on layout run in Firefox too.

The production web-server tests also need nginx or a working Docker daemon. With Docker, they use `git.knubbel.me/teadeck/teadeck:latest` by default; set `TEADECK_NGINX_IMAGE` to test another compatible image. Without nginx or Docker, these tests are skipped locally. To require them:

```sh
TEADECK_REQUIRE_NGINX=1 npm test
```

`npm test` runs TypeScript checks, Mastodon's frontend tests, and Teadeck's unit and browser tests. Two Teadeck test files run at a time by default. On smaller machines, use `TEADECK_TEST_CONCURRENCY=1 npm test`.

For a focused check after building:

```sh
node tests/status_content_type.test.mjs
node tests/service_worker.test.mjs
node tests/production.test.mjs
```

Never include access tokens, private posts or unredacted network captures in fixtures or issues.

## Package an image

After a successful build and test run:

```sh
docker build -f container/Dockerfile -t teadeck:local .
```

The Dockerfile packages the existing build, so build and test first.

## Submit a change

Describe the problem, the resulting behaviour and the tests you ran. Detect optional server features from the API, not from the server's name.

See [SECURITY.md](SECURITY.md) for security reports.
