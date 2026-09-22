import path from 'node:path';
import { defineConfig } from 'vite';
import { config as mastodonConfig } from './vite.config.mts';

// Keep the pinned upstream compiler, CSS rules, locale processing, themes,
// asset manifest, SVG handling, and code splitting. Rails entries and SW are omitted.
export default defineConfig(async environment => {
  const upstream = await mastodonConfig(environment);
  const plugins = (upstream.plugins ?? []).flat(Infinity).filter(plugin =>
    !plugin || !('name' in plugin) || ![
      'mastodon-sw-locales', 'mastodon-sw-chunk-paths',
      // Emits every file under images/ for Rails' own views, including
      // Mastodon's elephant illustrations, which this client never shows.
      // Images the client imports are part of the bundle anyway.
      'mastodon-assets-manifest',
    ].includes(plugin.name),
  );
  return {
    ...upstream,
    base: '/',
    publicDir: false,
    plugins,
    build: {
      ...upstream.build,
      outDir: path.resolve(import.meta.dirname, '../../dist'),
      emptyOutDir: true,
      sourcemap: false,
      rolldownOptions: {
        ...upstream.build?.rolldownOptions,
        input: { teadeck: path.resolve(import.meta.dirname, 'app/javascript/teadeck/index.html') },
      },
    },
  };
});
