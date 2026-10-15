#!/bin/sh
# Entry point of compose.test.yml: what the CI image lacks, then the command as user node.
set -e
run() { su node -s /bin/sh -c 'cd /repo && "$@"' -- sh "$@"; }

# The production web server for its tests, as in CI.
command -v nginx >/dev/null || { apt-get update -qq && apt-get install -y -qq --no-install-recommends nginx >/dev/null; }
# Mastodon's Yarn; Node 26 no longer ships Corepack.
npm install --global corepack@0.36.0 >/dev/null
mkdir -p /home/node/.cache /home/node/.npm
chown node:node /home/node/.cache /home/node/.npm

# Playwright comes with Mastodon's dependencies, so a fresh checkout builds first.
[ -x .work/upstream/node_modules/.bin/playwright ] || run npm run build:fresh
# Without Firefox's system libraries its tests hang instead of failing.
.work/upstream/node_modules/.bin/playwright install-deps chromium firefox >/dev/null
run node .work/upstream/node_modules/playwright/cli.js install chromium firefox >/dev/null

run "$@"
