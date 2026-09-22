# Contributing to Teadeck

## Set up

Use Linux with Node.js 24.2 or newer, npm, Corepack, Git and GNU tar. CI uses Node 24. On Windows, use a Linux environment such as WSL. On macOS, GNU tar must be available as `tar` on your PATH. The project Dockerfile packages an existing build; it is not a replacement for the build tools.

If Corepack is missing, install it first:

```sh
npm install --global corepack
```

Then, from a full checkout:

```sh
npm run doctor
npm run build:fresh
```

The root project has no npm dependencies, so you do not need to run `npm install` here. The build uses the Yarn version in `upstream.lock.json` and Mastodon's dependency lockfile. The first build needs internet access and several GB of free disk space.

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

Those lines name the hashes of the file contents a diff was taken from. `git apply` matches patches by their context lines and ignores them, so they only go stale as Mastodon moves on. `tests/ci_scripts.test.mjs` keeps them out.

`build` copies the current integration files, installs dependencies with `yarn install --immutable`, and creates `dist/`, the source archive and `.work/image/` assets. Changes to the patch set require a fresh preparation. The test command rejects a build whose recorded inputs no longer match the source files.

## Tests

After the first build, install Playwright's Chromium and its system dependencies:

```sh
npm run test:install
```

Installing system dependencies may require administrator privileges. If those dependencies are already installed, download only the browser:

```sh
node .work/upstream/node_modules/playwright/cli.js install chromium
```

The production web-server tests also need nginx or a working Docker daemon. With Docker, they use `git.knubbel.me/knubbel/teadeck:latest` by default; set `TEADECK_NGINX_IMAGE` to test another compatible image. Without nginx or Docker, these tests are skipped locally. To require them:

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

Browser tests use simulated server APIs. They do not replace testing with a real account on a known server version. Never include access tokens, private posts or unredacted network captures in fixtures or issues.

## Package an image

After a successful build and test run:

```sh
docker build -f container/Dockerfile -t teadeck:local .
```

Keep both `dist/` and `.work/image/` in the checkout: the Dockerfile needs both. It does not run the build or tests itself. Rebuild after source changes before packaging an image.

## Submit a change

Describe the problem, the resulting behaviour and the tests you ran. Optional server features should use evidence from the API; a server name alone is not enough to enable a posting option.

See [SECURITY.md](SECURITY.md) for security reports.
