/**
 * The typefaces Teadeck ships (integration/fonts, all under the OFL), as files
 * for @font-face and as stacks for a design's fonts.
 */
import type { FontFile } from './tokens.ts';

export const files = {
  spaceGrotesk: [{ family: 'Teadeck Space Grotesk', file: 'space-grotesk-latin.woff2', weight: [400, 700], variable: true }],
  ibmPlexSans: [{ family: 'Teadeck IBM Plex Sans', file: 'ibm-plex-sans-latin.woff2', weight: [400, 600], variable: true }],
  newsreader: [{ family: 'Teadeck Newsreader', file: 'newsreader-latin.woff2', weight: [400, 700], variable: true }],
  publicSans: [{ family: 'Teadeck Public Sans', file: 'public-sans-latin.woff2', weight: [400, 700], variable: true }],
  ibmPlexMono: [
    { family: 'Teadeck IBM Plex Mono', file: 'ibm-plex-mono-latin-400.woff2', weight: 400 },
    { family: 'Teadeck IBM Plex Mono', file: 'ibm-plex-mono-latin-500.woff2', weight: 500 },
  ],
  bigShouldersDisplay: [{ family: 'Teadeck Big Shoulders Display', file: 'big-shoulders-display-latin.woff2', weight: [100, 900], variable: true }],
  barlowCondensed: [
    { family: 'Teadeck Barlow Condensed', file: 'barlow-condensed-latin-500.woff2', weight: 500 },
    { family: 'Teadeck Barlow Condensed', file: 'barlow-condensed-latin-600.woff2', weight: 600 },
    { family: 'Teadeck Barlow Condensed', file: 'barlow-condensed-latin-700.woff2', weight: 700 },
  ],
  metalMania: [{ family: 'Teadeck Metal Mania', file: 'metal-mania-latin.woff2', weight: 400 }],
  barlow: [
    { family: 'Teadeck Barlow', file: 'barlow-latin-400.woff2', weight: 400 },
    { family: 'Teadeck Barlow', file: 'barlow-latin-400-italic.woff2', weight: 400, style: 'italic' },
    { family: 'Teadeck Barlow', file: 'barlow-latin-600.woff2', weight: [500, 600] },
    { family: 'Teadeck Barlow', file: 'barlow-latin-700.woff2', weight: 700 },
  ],
} satisfies Record<string, readonly FontFile[]>;

export const stacks = {
  spaceGrotesk: "'Teadeck Space Grotesk', system-ui, sans-serif",
  ibmPlexSans: "'Teadeck IBM Plex Sans', system-ui, sans-serif",
  newsreader: "'Teadeck Newsreader', Georgia, serif",
  publicSans: "'Teadeck Public Sans', system-ui, sans-serif",
  ibmPlexMono: "'Teadeck IBM Plex Mono', monospace",
  bigShouldersDisplay: "'Teadeck Big Shoulders Display', 'Teadeck Barlow Condensed', system-ui, sans-serif",
  barlowCondensed: "'Teadeck Barlow Condensed', 'Teadeck Barlow', system-ui, sans-serif",
  barlow: "'Teadeck Barlow', system-ui, sans-serif",
  metalMania: "'Teadeck Metal Mania', 'Teadeck Big Shoulders Display', system-ui, sans-serif",
};
