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
    // The design's tea opacity (--teadeck-logo-tea-opacity): 1 where the tea is opaque, 0.94 by default.
    return `  <g clip-path="${id('bowl')}" style="opacity: var(--teadeck-logo-tea-opacity, 0.94)">
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

/**
 * The runs of blood over the rim, each outlined the same way: points 0–10 down the
 * left edge, 11–18 round the drop, 19–29 back up the right edge, 30–37 over the rim.
 */
const bloodRuns = [
  'M124.9 203.7 L125.3 214.3 L126.0 224.8 L127.0 234.9 L128.2 244.8 L129.7 254.3 L131.5 263.5 L133.5 272.3 L135.9 280.6 L138.5 288.5 L141.3 295.9 L141.6 298.8 L142.6 300.6 L144.1 301.9 L145.9 302.3 L147.7 301.9 L149.2 300.6 L150.2 298.8 L150.5 297.1 L148.4 289.9 L146.7 282.1 L145.1 273.9 L143.9 265.2 L142.8 256.2 L142.0 246.7 L141.4 236.9 L141.1 226.9 L141.0 216.5 L141.1 205.9 L141.1 203.8 L139.1 202.3 L137.1 200.9 L135.1 199.8 L133.0 199.3 L131.0 199.3 L129.0 199.7 L127.0 200.6 L124.9 201.6 Z',
  'M187.0 208.9 L187.2 211.2 L187.3 213.5 L187.4 215.8 L187.6 218.1 L187.7 220.4 L187.9 222.7 L188.0 225.0 L188.1 227.2 L188.3 229.5 L188.4 231.7 L188.7 233.2 L189.3 234.4 L190.3 235.2 L191.4 235.5 L192.6 235.2 L193.6 234.4 L194.2 233.2 L194.4 231.8 L194.6 229.6 L194.7 227.3 L194.8 225.1 L194.9 222.8 L195.0 220.5 L195.2 218.3 L195.3 216.0 L195.4 213.6 L195.6 211.3 L195.7 209.0 L195.7 207.5 L194.6 206.5 L193.5 205.7 L192.4 205.1 L191.4 204.9 L190.3 205.1 L189.2 205.6 L188.1 206.4 L187.0 207.4 Z',
  'M249.1 206.9 L249.3 213.1 L249.4 219.2 L249.5 225.2 L249.5 231.2 L249.4 237.0 L249.2 242.7 L249.0 248.4 L248.7 253.9 L248.3 259.2 L247.9 264.5 L248.2 266.2 L249.2 268.1 L250.7 269.4 L252.5 269.8 L254.3 269.4 L255.8 268.1 L256.8 266.2 L257.1 263.5 L258.1 258.2 L258.9 252.8 L259.7 247.2 L260.5 241.5 L261.1 235.7 L261.7 229.9 L262.2 223.9 L262.6 217.8 L262.9 211.6 L263.2 205.4 L263.2 203.3 L261.4 202.2 L259.7 201.3 L257.9 200.7 L256.2 200.6 L254.4 201.1 L252.6 202.0 L250.9 203.3 L249.1 204.8 Z',
];

/**
 * One run of blood: filled flat, then shaded and lit along its own course rather
 * than across its bounding box, so the shine stays on the run where it bends.
 */
function blood(d) {
  const p = [...d.matchAll(/([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const rows = Array.from({ length: 11 }, (_, i) => [p[i], p[29 - i]]);
  const width = rows.reduce((sum, [l, r]) => sum + r[0] - l[0], 0) / rows.length;
  /** A line down the run, at t of its width from the left edge. */
  const along = (t, from, to) => 'M' + rows.slice(from, to)
    .map(([l, r]) => `${(l[0] + (r[0] - l[0]) * t).toFixed(1)} ${(l[1] + (r[1] - l[1]) * t).toFixed(1)}`)
    .join(' L');
  const drop = { x: (p[11][0] + p[18][0]) / 2, y: p[14][1], r: (p[18][0] - p[11][0]) / 2 };
  return `    <path d="${d}" fill="${c.tea}" stroke="${c.teaShade}" stroke-width="3"/>
    <path d="${along(0.74, 1, 11)}" fill="none" stroke="${c.teaDark}" stroke-opacity="0.7" stroke-width="${(width * 0.3).toFixed(1)}"/>
    <path d="${along(0.34, 1, 10)}" fill="none" stroke="${c.highlight}" stroke-opacity="0.14" stroke-width="${(width * 0.34).toFixed(1)}"/>
    <path d="${along(0.3, 1, 9)}" fill="none" stroke="${c.highlight}" stroke-opacity="0.5" stroke-width="${(width * 0.12).toFixed(1)}"/>
    <circle cx="${(drop.x - drop.r * 0.35).toFixed(1)}" cy="${(drop.y - drop.r * 1.05).toFixed(1)}" r="${(drop.r * 0.3).toFixed(1)}" fill="${c.highlight}" fill-opacity="0.5"/>`;
}

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

  <g class="teadeck-logo-steam--soft" transform="translate(0 8)" fill="none" stroke="${id('steam')}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">
    <path d="M176 176 C151 151 190 133 173 108 C154 80 187 67 181 43"/>
    <path d="M205 170 C181 143 225 126 205 97 C187 70 230 54 224 27"/>
    <path d="M233 176 C215 153 252 139 239 114 C228 92 251 78 248 57"/>
  </g>
  <g class="teadeck-logo-steam--angular" transform="translate(0 8)" fill="none" stroke="${id('steam')}" stroke-width="11" stroke-linecap="round" stroke-linejoin="miter">
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

  <!-- Tea run over the rim and dripping: hidden unless a design shows it (data-teadeck-logo-blood).
       The runs follow the rim's ellipse and the wall's meridians down towards the foot. -->
  <g class="teadeck-logo-blood" display="none" stroke-linecap="round" stroke-linejoin="round">
${bloodRuns.map(blood).join('\n')}
  </g>
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
