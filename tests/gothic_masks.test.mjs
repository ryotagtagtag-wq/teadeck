import assert from 'node:assert/strict';
import { test } from 'node:test';

import { engines } from './browsers.mjs';
import { signedInPage, useApp } from './harness.mjs';

// Lapsang's ornaments and fangs are CSS masks in several layers. A browser that
// cannot draw them shows nothing at all, so they are checked in each engine.

useApp();

const hidden = '* { --td-ornament: transparent !important; --td-fang: transparent !important; --td-fang-blood: transparent !important; }';

for (const engine of engines) {
  test(`the gothic corners and the fangs are drawn (${engine})`, { timeout: 90_000 }, async () => {
    const { context, page, pageErrors } = await signedInPage({
      engine, locale: 'en-US', layout: 'multi', viewport: { width: 1400, height: 900 },
      deployment: { theme: 'lapsang', colorScheme: 'dark' },
    });
    try {
      const card = page.locator('._comp_status__variantFeed').first();
      await card.waitFor();
      const header = page.locator('._navigation_panel_redesign_header__root');
      const cardBox = await card.boundingBox();
      const headerBox = await header.boundingBox();
      // A card's top left corner, and the strip below the server's name where the fangs hang.
      const corner = { x: cardBox.x, y: cardBox.y, width: 24, height: 24 };
      const fangs = { x: headerBox.x, y: headerBox.y + headerBox.height - 60, width: headerBox.width, height: 60 };
      const shoot = () => Promise.all([page.screenshot({ clip: corner }), page.screenshot({ clip: fangs })]);

      const drawn = await shoot();
      await page.addStyleTag({ content: hidden });
      await page.waitForTimeout(100);
      const bare = await shoot();
      assert.notDeepEqual(drawn[0], bare[0], 'the corner ornament');
      assert.notDeepEqual(drawn[1], bare[1], 'the fangs');
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  });
}
