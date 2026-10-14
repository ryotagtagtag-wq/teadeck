/**
 * Turns the designs into CSS: @font-face rules for their fonts and, per half, a
 * block of `--td-*` variables on <html>. Choices such as `mainButton:
 * 'outlined'` become values here. Where a value needs one of the interface's
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
} as const;

/** Every variable of one half, in a fixed order. */
export function halfVariables(half: Half): [string, string][] {
  const outlined = half.mainButton === 'outlined';
  const framedButtons = half.secondaryButtons === 'framed';
  const cards = half.posts === 'cards';
  const tags = half.hashtags.look;
  const [r1, r2, r3, r4, r5, full] = radii[half.shape];
  const { type, fonts, content } = half;
  return [
    ...half.neutral.map((value, index): [string, string] => [`--td-neutral-${rampSteps[index]}`, value]),
    ...half.accent.map((value, index): [string, string] => [`--td-accent-${rampSteps[index]}`, value]),
    ['--td-surface', half.ground.surface],
    ['--td-page', half.ground.page],
    ['--td-desktop', half.ground.desktop],
    ['--td-text', half.ground.text],
    ['--td-logo-tea', half.logoTea],

    ['--td-font-heading', fonts.heading],
    ['--td-font-title', fonts.title],
    ['--td-font-label', fonts.label],
    ['--td-font-body', fonts.body],
    ['--td-font-bold', fonts.bold],
    ['--td-font-code', fonts.code],
    ['--td-caps', type.caps ? 'uppercase' : 'none'],
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

    ['--td-radius-1', r1],
    ['--td-radius-2', r2],
    ['--td-radius-3', r3],
    ['--td-radius-4', r4],
    ['--td-radius-5', r5],
    ['--td-radius-full', full],

    ['--td-frame', half.frame],
    ['--td-main-bg', outlined ? 'transparent' : 'var(--td-brand)'],
    ['--td-main-fg', outlined ? 'var(--td-brand-text)' : 'var(--td-on-brand)'],
    ['--td-main-edge', outlined ? '2px' : '0px'],
    ['--td-secondary-fill', framedButtons ? '0%' : '4%'],
    ['--td-secondary-ring', framedButtons ? 'inset 0 0 0 1px var(--td-frame)' : 'none'],
    ['--td-post-gap', cards ? '8px 12px' : '0'],
    ['--td-post-frame', cards ? '1px solid var(--td-frame)' : '0 solid transparent'],
    ['--td-post-divider', cards ? '1px solid var(--td-frame)' : 'var(--td-divider)'],
    ['--td-avatar-ring', half.avatars === 'framed' ? '0 0 0 1px var(--td-frame)' : 'none'],
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
    return `html[data-teadeck-theme='${design.id}'][data-color-scheme='${scheme}'] {\n${variables}\n}`;
  }));
  return [
    '/* Generated from integration/themes/*.ts by scripts/build.mjs; do not edit. */',
    ...[...fonts.values()].map(fontFace),
    ...blocks,
    '',
  ].join('\n\n');
}
