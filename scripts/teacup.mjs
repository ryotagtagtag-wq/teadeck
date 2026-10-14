// Draws Teadeck's teacup in one geometry and two materials, and writes them to
// integration/logos/:
//
//   glass     a glass cup: the tea shows through the wall
//   ceramic   an opaque cup: the tea shows at the surface
//
// Colours are CSS variables set in integration/shell.css, with fallbacks so the
// files also work on their own.
//
// Run `node scripts/teacup.mjs --write` after changing anything here;
// tests/teacup.test.mjs checks the files match.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
export const logoDir = path.join(root, 'integration/logos');

/** A colour role of the drawing; the fallback applies where the page defines nothing. */
const colour = (role, fallback) => `var(--teadeck-logo-${role}, ${fallback})`;

const c = {
  line: colour('line', '#a6abc4'),
  steam: colour('steam', '#a6abc4'),
  body: colour('body', '#c8c6ff'),
  bodyDark: colour('body-dark', '#15161e'),
  highlight: colour('highlight', '#ffffff'),
  tea: colour('tea', '#9a4312'),
  teaDark: colour('tea-dark', '#6e2a08'),
  teaLight: colour('tea-light', '#c8671f'),
  teaShade: colour('tea-shade', '#5c2206'),
};

/**
 * The two materials. Glass shows the tea through its wall and needs a translucent
 * body; the opaque cup shows only the surface. That is the whole difference.
 */
const materials = {
  glass: { label: 'A steaming cup of tea in a glass', opaque: false, wallOpacity: '0.16', wallOpacitySoft: '0.02' },
  ceramic: { label: 'A steaming cup of tea', opaque: true },
};

/** The liquid: through the whole wall in glass, only its surface otherwise. */
function tea(material, id) {
  if (!material.opaque) {
    return `  <g clip-path="${id('bowl')}" opacity="0.94">
    <rect x="80" y="224" width="240" height="110" fill="${id('tea')}"/>
    <rect x="80" y="224" width="240" height="110" fill="${id('teaSides')}"/>
    <ellipse cx="200" cy="224" rx="106" ry="16" fill="${id('teaTop')}"/>
    <path d="M94 226 A106 16 0 0 0 306 226" fill="none" stroke="${c.teaLight}" stroke-opacity="0.55" stroke-width="5"/>
    <ellipse cx="178" cy="220" rx="36" ry="4" fill="${c.highlight}" fill-opacity="0.25"/>
    <ellipse cx="205" cy="318" rx="48" ry="10" fill="${c.teaLight}" fill-opacity="0.25"/>
  </g>`;
  }
  // Only what the rim opening shows, drawn over the wall and clipped to that opening.
  return `  <g clip-path="${id('surface')}">
    <ellipse cx="200" cy="191" rx="103" ry="17" fill="${id('teaTop')}"/>
    <path d="M97 189 A103 17 0 0 1 303 189" fill="none" stroke="${c.teaShade}" stroke-opacity="0.35" stroke-width="7"/>
    <path d="M99 194 A103 17 0 0 0 301 194" fill="none" stroke="${c.teaLight}" stroke-opacity="0.5" stroke-width="4"/>
    <ellipse cx="176" cy="187" rx="34" ry="5" fill="${c.highlight}" fill-opacity="0.22"/>
  </g>`;
}

/** The handle, drawn three times over each other: rim, body, inner shade. */
const handlePath = 'M303 218 C356 206 362 288 288 298';
/** How thick the handle is drawn; the rim sits 3.5 outside it, the inner shade scales with it. */
const handleWidth = 18.5;

export function teacup(name) {
  const material = materials[name];
  if (!material) throw new Error(`Unknown teacup material: ${name}`);
  // Suffixed per material; BrandLogo additionally prefixes them per copy on the page.
  const id = (base) => `url(#${base}-${name})`;
  const wall = material.opaque ? '' : `
  <g clip-path="${id('bowl')}">
    <rect x="80" y="180" width="240" height="160" fill="${id('wall')}"/>
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400" role="img"
     aria-label="${material.label}" data-teadeck-logo="teacup">
  <defs>
    <linearGradient id="tea-${name}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.teaDark}"/>
      <stop offset="0.55" stop-color="${c.tea}"/>
      <stop offset="1" stop-color="${c.teaLight}"/>
    </linearGradient>
    <linearGradient id="teaSides-${name}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${c.teaShade}" stop-opacity="0.55"/>
      <stop offset="0.25" stop-color="${c.teaShade}" stop-opacity="0"/>
      <stop offset="0.6" stop-color="${c.teaShade}" stop-opacity="0"/>
      <stop offset="1" stop-color="${c.teaShade}" stop-opacity="0.6"/>
    </linearGradient>
    <radialGradient id="teaTop-${name}" cx="0.42" cy="0.4" r="0.65">
      <stop offset="0" stop-color="${c.teaLight}"/>
      <stop offset="0.7" stop-color="${c.tea}"/>
      <stop offset="1" stop-color="${c.teaDark}"/>
    </radialGradient>
    <linearGradient id="wall-${name}" x1="0" y1="0" x2="1" y2="0">
${material.opaque ? `      <stop offset="0" stop-color="${c.body}"/>
      <stop offset="0.5" stop-color="${c.body}"/>
      <stop offset="1" stop-color="${c.bodyDark}"/>` : `      <stop offset="0" stop-color="${c.body}" stop-opacity="${material.wallOpacity}"/>
      <stop offset="0.25" stop-color="${c.highlight}" stop-opacity="${material.wallOpacitySoft}"/>
      <stop offset="0.8" stop-color="${c.highlight}" stop-opacity="${material.wallOpacitySoft}"/>
      <stop offset="1" stop-color="${c.body}" stop-opacity="0.12"/>`}
    </linearGradient>
    <radialGradient id="glow-${name}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${c.teaLight}" stop-opacity="0.3"/>
      <stop offset="1" stop-color="${c.teaLight}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="shadow-${name}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${c.bodyDark}" stop-opacity="0.4"/>
      <stop offset="1" stop-color="${c.bodyDark}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="steam-${name}" gradientUnits="userSpaceOnUse" x1="0" y1="50" x2="0" y2="180">
      <stop offset="0" stop-color="${c.steam}" stop-opacity="0"/>
      <stop offset="0.55" stop-color="${c.steam}" stop-opacity="0.45"/>
      <stop offset="1" stop-color="${c.steam}" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="bowl-${name}">
      <path d="M95 190 C95 254 117 310 161 325 L239 325 C283 310 305 254 305 190 Z"/>
    </clipPath>
    <clipPath id="surface-${name}">
      <ellipse cx="200" cy="191" rx="103" ry="17"/>
    </clipPath>
    <mask id="handleRim-${name}" maskUnits="userSpaceOnUse" x="270" y="190" width="120" height="130">
      <rect x="270" y="190" width="120" height="130" fill="#ffffff"/>
      <path d="${handlePath}" fill="none" stroke="#000000" stroke-width="${handleWidth}" stroke-linecap="round"/>
    </mask>
  </defs>

  <g transform="translate(0 8)" fill="none" stroke="${id('steam')}" stroke-width="11" stroke-linecap="round" stroke-linejoin="miter">
    <path d="M176 176 L165 144 L187 136 L171 102 L195 70"/>
    <path d="M205 170 L193 133 L221 123 L203 88 L235 58"/>
    <path d="M233 176 L225 152 L246 144 L238 114"/>
  </g>

  <path d="M50 336 C62 378 338 378 350 336 Z" fill="${c.bodyDark}" fill-opacity="0.18"/>
  <ellipse cx="200" cy="336" rx="150" ry="24" fill="${c.body}" fill-opacity="${material.opaque ? '0.9' : '0.07'}" stroke="${c.line}" stroke-opacity="0.5" stroke-width="3.75"/>
  <path d="M50 336 C62 378 338 378 350 336" fill="none" stroke="${c.line}" stroke-opacity="0.55" stroke-width="5"/>
  <ellipse cx="200" cy="339" rx="92" ry="13" fill="${c.bodyDark}" fill-opacity="0.12" stroke="${c.line}" stroke-opacity="0.25" stroke-width="2.5"/>

  <ellipse cx="200" cy="338" rx="72" ry="10" fill="${id('shadow')}"/>
  <ellipse cx="208" cy="340" rx="78" ry="11" fill="${id('glow')}"/>
  <path d="M70 332 C88 324 112 319 135 317" fill="none" stroke="${c.highlight}" stroke-opacity="0.099" stroke-width="5" stroke-linecap="round"/>

  <g transform="translate(0 8)">
  <g fill="none" stroke-linecap="round">
    <path d="${handlePath}" stroke="${c.line}" stroke-opacity="0.6" stroke-width="${handleWidth + 3.5}" mask="${id('handleRim')}"/>
    <path d="${handlePath}" stroke="${material.opaque ? c.body : c.steam}" stroke-opacity="${material.opaque ? '1' : '0.3'}" stroke-width="${handleWidth}"/>
    <path d="${handlePath}" stroke="${c.bodyDark}" stroke-opacity="${material.opaque ? '0.18' : '0.22'}" stroke-width="${(handleWidth * 0.55).toFixed(1)}"/>
    <path d="M320 216 C344 219 351 243 343 263" stroke="${c.highlight}" stroke-opacity="0.19" stroke-width="3.5"/>
  </g>

  <path d="M92 190 A108 19 0 0 1 308 190" fill="none" stroke="${c.line}" stroke-opacity="0.35" stroke-width="3.75"/>
${material.opaque ? '' : `
${tea(material, id)}`}${wall}
  <path d="M92 190 C92 255 115 312 160 328 L240 328 C285 312 308 255 308 190"
        fill="${material.opaque ? id('wall') : 'none'}" stroke="${c.line}" stroke-opacity="0.7" stroke-width="6.25"/>
${material.opaque ? `${tea(material, id)}\n` : ''}
  <path d="M92 190 A108 19 0 0 0 308 190" fill="none" stroke="${c.highlight}" stroke-opacity="${material.opaque ? '0.8' : '0.47'}" stroke-width="7.5"/>
  <path d="M100 196 A100 15 0 0 0 300 196" fill="none" stroke="${c.highlight}" stroke-opacity="0.066" stroke-width="3.75"/>

  <path d="M106 208 C108 246 120 280 140 304" fill="none" stroke="${c.highlight}" stroke-opacity="0.22" stroke-width="12.5" stroke-linecap="round"/>
  <path d="M118 214 C120 232 124 246 130 258" fill="none" stroke="${c.highlight}" stroke-opacity="0.11" stroke-width="5" stroke-linecap="round"/>
  <path d="M294 222 C291 246 284 266 274 281" fill="none" stroke="${c.body}" stroke-opacity="0.14" stroke-width="7.5" stroke-linecap="round"/>
  </g>
</svg>
`;
}

export const teacupMaterials = Object.keys(materials);
export const fileFor = (name) => path.join(logoDir, `teacup-${name}.svg`);

/** True when every file on disk matches what this script produces. */
export async function checkFiles() {
  const differences = [];
  for (const name of teacupMaterials) {
    const expected = teacup(name);
    const actual = await readFile(fileFor(name), 'utf8').catch(() => null);
    if (actual !== expected) differences.push(name);
  }
  return differences;
}

if (import.meta.main) {
  await mkdir(logoDir, { recursive: true });
  for (const name of teacupMaterials) {
    await writeFile(fileFor(name), teacup(name));
    console.log(`${path.relative(root, fileFor(name))} written`);
  }
}
