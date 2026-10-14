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

## Code conventions

`tests/conventions.test.mjs` checks these:

- Relative imports name the file with its extension (`./storage.ts`); Mastodon is imported through `@/mastodon/…`.
- Texts go into `integration/texts.ts` with `en` and, where it differs, `de`; name a Mastodon message as `upstream` to reuse its translations. Components show them with `t(id)` from `i18n.ts`.
- `localStorage` and `sessionStorage` are used through `browser_storage.ts`, which names every key.
- What the server offers is asked of `server_features.ts`.
- Components style through CSS classes; an inline style only passes a value as a `--teadeck-` variable.
- A module exports only what another file (code, patch, test or script) uses; its own helpers stay private.
- Browser network exports (`.har`) carry access tokens and never enter the repository; `.gitignore` keeps them out, the test catches a forced add.

## Designs

Designs live in `integration/themes/`:

- `tokens.ts` defines what a design describes, per dark and light half: colour ramps, ground, fonts and their case and weight, shape (rounded, square, chamfered or gothic corners, nothing else), main and secondary buttons, posts (divided or cards), columns, column titles, the navigation's footer, the server's name, selected tabs and items, badges, notification captions, settings controls, links in posts, icon stroke, grain, avatars, hashtags, the teacup's colours and steam shape, and the colours of post content. Each choice does one thing; `tests/theme_contract.test.mjs` checks that with a synthetic design and checks that rules for the shape only touch geometry.
- One file per design (`assam.ts`, `sencha.ts`, `hibiscus.ts`, `lapsang.ts`) contains only values in these terms. It never names Mastodon's variables or classes. `index.ts` lists the designs in the order the settings offer them.
- `css.ts` turns the designs into `--td-*` variables and `@font-face` rules. The build writes them to `designs.css` and writes the list of design names for the container. Choices of layout and look (shape, posts, columns, titles, navigation footer, …) become attributes on `<html>` instead (`designAttributes` in `index.ts`), so their rules in `mastodon.css` apply only where a design makes them and Mastodon's own layout stays untouched elsewhere; the icon stroke reaches Mastodon's Phosphor icons through `icon_weight.tsx`.
- `mastodon.css` is the only stylesheet that knows Mastodon: it applies the designs, offers Teadeck's own pages and parts (`shell.css`, `large_composer.css`) a few `--td-ui-*` variables for surfaces, text, lines, radii and fonts, and holds every rule that relies on Mastodon's markup. When Mastodon renames a variable or a class, change it there.

Other stylesheets read only `--td-*` and `--teadeck-*` variables and name only Teadeck's own classes and ids (`teadeck-*`).

To add a design, add its file, put it in `index.ts`, and add its row to the theme table in `docs/configuration.md` and its line to `.env.example`. The settings, the container's `TEADECK_THEME` check, the design tests and `npm run screenshots` pick it up from the registry. `tests/theme_contract.test.mjs` checks these rules.

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

## Screenshots

The README's screenshots in `docs/images` come from the built client against a made-up GoToSocial server. After `npm run build`, retake all of them or only some:

```sh
npm run screenshots
npm run screenshots -- composer themes
```

The names are `overview`, `composer`, `reply`, `overlay` and `themes`. The script writes full-colour PNGs; reduce them to a palette (for example with `pngquant`) before committing to keep the repository small.

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
