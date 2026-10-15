/**
 * Turns the designs into CSS: @font-face rules for their fonts and, per half, a
 * block of `--td-*` variables on <html>. Choices such as `mainButton:
 * 'outlined'` become values here; choices of layout (posts, titles, …) are
 * attributes on <html> instead (designAttributes in index.ts). Where a value needs one of the interface's
 * own colours it names the `--td-*` alias that mastodon.css provides
 * (`--td-brand`, `--td-text-primary`, …), so nothing here knows Mastodon.
 *
 * The build writes the result to themes/designs.css (scripts/build.mjs).
 */
import type { Design, FontFile, Half } from './tokens.ts';
import { rampSteps } from './tokens.ts';

const radii = {
  rounded: ['8px', '12px', '16px', '20px', '24px', 'calc(1px * infinity)'],
  square: ['0', '0', '0', '0', '0', '0'],
  chamfered: ['0', '0', '0', '0', '0', '0'],
  gothic: ['0', '0', '0', '0', '0', '0'],
} as const;

/** Chamfer sizes by kind of element; the larger the element, the larger the cut. */
const chamfers = { overlay: 28, panel: 18, card: 14, callout: 12, main: 10, field: 8, avatar: 7, secondary: 6, tag: 5 } as const;

/** Top right and bottom left cut off at 45°. */
const chamfer = (size: number) =>
  `polygon(0 0, calc(100% - ${size}px) 0, 100% ${size}px, 100% 100%, ${size}px 100%, 0 calc(100% - ${size}px))`;

/** Every variable of one half, in a fixed order. */
export function halfVariables(half: Half): [string, string][] {
  const main = half.mainButton;
  const outlined = main === 'outlined';
  const secondary = half.secondaryButtons;
  const framedButtons = secondary === 'framed';
  const cards = half.posts === 'cards';
  const tags = half.hashtags.look;
  const [r1, r2, r3, r4, r5, full] = radii[half.shape];
  const clip = (size: number) => (half.shape === 'chamfered' ? chamfer(size) : 'none');
  const { type, fonts, content } = half;
  return [
    ...half.neutral.map((value, index): [string, string] => [`--td-neutral-${rampSteps[index]}`, value]),
    ...half.accent.map((value, index): [string, string] => [`--td-accent-${rampSteps[index]}`, value]),
    ['--td-surface', half.ground.surface],
    ['--td-page', half.ground.page],
    ['--td-desktop', half.ground.desktop],
    ['--td-text', half.ground.text],
    ['--td-glow', half.ground.glow ?? 'none'],
    ['--td-logo-tea', half.logo.tea],
    ['--td-logo-tea-dark', half.logo.teaDark ?? 'color-mix(in oklab, var(--td-logo-tea), black 28%)'],
    ['--td-logo-tea-light', half.logo.teaLight ?? 'color-mix(in oklab, var(--td-logo-tea), white 18%)'],
    ['--td-logo-tea-shade', half.logo.teaShade ?? 'color-mix(in oklab, var(--td-logo-tea), black 52%)'],
    ['--td-logo-line', half.logo.line ?? 'var(--td-ui-text)'],
    ['--td-logo-steam', half.logo.steam ?? 'var(--td-ui-text-muted)'],
    ['--td-logo-body', half.logo.body ?? 'var(--td-ui-surface-raised)'],
    ['--td-logo-body-dark', half.logo.bodyDark ?? 'color-mix(in oklab, var(--td-logo-body), var(--td-logo-line) 22%)'],
    ['--td-logo-highlight', half.logo.highlight ?? 'color-mix(in oklab, var(--td-logo-body), white 45%)'],
    // The glass cup's tea shows through its wall unless the design makes it opaque.
    ['--td-logo-tea-opacity', half.logo.opaqueTea ? '1' : '0.94'],

    ['--td-font-brand', fonts.brand],
    ['--td-font-heading', fonts.heading],
    ['--td-font-title', fonts.title],
    ['--td-font-label', fonts.label],
    ['--td-font-body', fonts.body],
    ['--td-font-bold', fonts.bold],
    ['--td-font-code', fonts.code],
    ['--td-caps', type.caps ? 'uppercase' : 'none'],
    ['--td-title-caps', type.titleCaps === undefined ? 'var(--td-caps)' : type.titleCaps ? 'uppercase' : 'none'],
    ['--td-heading-weight', String(type.headingWeight)],
    ['--td-title-weight', String(type.titleWeight)],
    ['--td-label-weight', String(type.labelWeight)],
    ['--td-bold-weight', String(type.boldWeight)],
    ['--td-h1', type.headingSizes[0]],
    ['--td-h2', type.headingSizes[1]],
    ['--td-h3', type.headingSizes[2]],
    ['--td-heading-tracking', type.headingTracking],
    ['--td-title-tracking', type.titleTracking],
    ['--td-label-tracking', type.labelTracking],
    ['--td-body-leading', type.bodyLeading],

    ['--td-radius-1', r1],
    ['--td-radius-2', r2],
    ['--td-radius-3', r3],
    ['--td-radius-4', r4],
    ['--td-radius-5', r5],
    ['--td-radius-full', full],

    ['--td-frame', half.frame],
    // Main buttons: the accent filled or outlined, or colours of the design's own.
    ['--td-main-bg', typeof main === 'object' ? main.background : outlined ? 'transparent' : 'var(--td-brand)'],
    ['--td-main-fg', typeof main === 'object' ? main.text : outlined ? 'var(--td-brand-text)' : 'var(--td-on-brand)'],
    ['--td-main-hover', typeof main === 'object' ? main.hover : 'color-mix(in srgb, var(--td-main-bg) 90%, var(--td-main-fg))'],
    ['--td-main-edge', outlined ? '2px' : '0px'],
    ['--td-main-edge-color', typeof main === 'object' ? main.background : 'var(--td-brand)'],
    ['--td-main-line', typeof main === 'object' ? main.line ?? 'transparent' : 'transparent'],
    ['--td-secondary-bg', typeof secondary === 'object' ? secondary.background : 'var(--td-text-primary)'],
    ['--td-secondary-fg', typeof secondary === 'object' ? secondary.text : 'var(--td-text-primary)'],
    ['--td-secondary-fill', typeof secondary === 'object' ? '100%' : framedButtons ? '0%' : '4%'],
    ['--td-secondary-ring', framedButtons ? 'inset 0 0 0 1px var(--td-frame)' : 'none'],
    // Posts: divided by a line, or cards apart on the column's ground.
    ['--td-post-gap', cards ? '0 0 6px' : '0'],
    ['--td-post-divider', cards ? '0 solid transparent' : 'var(--td-divider)'],
    // Cards lie on the page's ground; divided posts share the surface with the column.
    ['--td-column-ground', cards ? 'var(--td-page)' : 'var(--td-surface)'],
    ['--td-post-bg', cards ? 'var(--td-surface)' : 'transparent'],
    ['--td-grain-opacity', half.grain ? '0.09' : '0'],
    // Fangs and their blood, for the design that has them (attribute teadeckBrandFangs).
    ['--td-fang', half.fangs?.fang ?? 'transparent'],
    ['--td-fang-blood', half.fangs?.blood ?? 'transparent'],
    // Sizes for the brand name and captions where a design sets them (attributes in index.ts switch them on).
    ['--td-brand-size', half.brandName === 'plain' ? 'inherit' : half.brandName.size],
    ['--td-brand-tracking', half.brandName === 'plain' ? 'normal' : half.brandName.tracking],
    ['--td-caption-size', half.captions === 'plain' ? 'inherit' : half.captions.size],
    ['--td-caption-tracking', half.captions === 'plain' ? 'normal' : half.captions.tracking],
    ...Object.entries(chamfers).flatMap(([role, size]): [string, string][] => [
      [`--td-cut-${role}`, `${size}px`],
      [`--td-clip-${role}`, clip(size)],
    ]),
    ['--td-avatar-ring', half.avatars === 'framed' ? '0 0 0 1px var(--td-frame)' : 'none'],
    // Gothic ornaments in the corners of cards (attribute teadeckOrnaments).
    ['--td-ornament', half.ornaments ?? 'transparent'],
    ['--td-hashtag-bg', tags === 'tinted' ? 'rgb(from var(--td-text-primary) r g b / 4%)' : tags.background],
    ['--td-hashtag-fg', tags === 'tinted' ? 'var(--td-text-primary)' : tags.text],
    ['--td-hashtag-font', half.hashtags.face === 'label' ? 'var(--td-font-label)' : 'var(--td-font-body)'],
    ['--td-hashtag-weight', String(half.hashtags.weight)],

    ['--td-content-heading', content.heading],
    ['--td-content-text', content.text],
    ['--td-content-muted', content.muted],
    ['--td-content-accent', content.accent],
    ['--td-content-link', content.link],
    ['--td-content-border', content.border],
    ['--td-content-raised', content.raised],
    ['--td-content-inline-code', content.inlineCode],
    ['--td-content-inline-code-background', content.inlineCodeBackground],
    ['--td-content-code-background', content.codeBackground],
    ['--td-content-keyword', content.keyword],
    ['--td-content-function', content.function],
    ['--td-content-string', content.string],
    ['--td-content-number', content.number],
    ['--td-content-comment', content.comment],
  ];
}

function fontFace(font: FontFile) {
  const weight = typeof font.weight === 'number' ? String(font.weight) : font.weight.join(' ');
  return [
    '@font-face {',
    `  font-family: '${font.family}';`,
    `  src: url('../fonts/${font.file}') format('${font.variable ? 'woff2-variations' : 'woff2'}');`,
    `  font-weight: ${weight};`,
    ...(font.style === 'italic' ? ['  font-style: italic;'] : []),
    '  font-display: swap;',
    '}',
  ].join('\n');
}

export function designsCss(designs: readonly Design[]) {
  const fonts = new Map<string, FontFile>();
  for (const design of designs) for (const font of design.fonts) fonts.set(font.file, font);
  const blocks = designs.flatMap((design) => (['dark', 'light'] as const).map((scheme) => {
    const variables = halfVariables(design[scheme]).map(([name, value]) => `  ${name}: ${value};`).join('\n');
    return `html[data-teadeck-theme='${design.id}'][data-teadeck-half='${scheme}'] {\n${variables}\n}`;
  }));
  return [
    '/* Generated from integration/themes/*.ts by scripts/build.mjs; do not edit. */',
    ...[...fonts.values()].map(fontFace),
    ...blocks,
    '',
  ].join('\n\n');
}
