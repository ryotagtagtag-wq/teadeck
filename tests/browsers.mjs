import { chromium, firefox } from '../.work/upstream/node_modules/playwright/index.mjs';

/**
 * Engines for the layout-sensitive tests: Firefox lays out some things
 * differently from Chromium (an empty status overlay once went unnoticed).
 */
export const engines = ['chromium', 'firefox'];

const launched = new Map();

/** One headless browser per engine, shared within a test file. */
export function launchBrowser(engine) {
  if (!launched.has(engine)) launched.set(engine, ({ chromium, firefox })[engine].launch({ headless: true }));
  return launched.get(engine);
}

export async function closeBrowsers() {
  await Promise.all([...launched.values()].map(async (browser) => (await browser).close()));
  launched.clear();
}
