/**
 * What Assam and Sencha share apart from their colours: rounded shapes, filled
 * main buttons, posts divided by a line, and type that follows the half
 * (Space Grotesk and IBM Plex in the dark, Newsreader and Public Sans in the light).
 */
import { files, stacks } from './fonts.ts';
import type { Half } from './tokens.ts';

export const classicFonts = [...files.spaceGrotesk, ...files.ibmPlexSans, ...files.newsreader, ...files.publicSans, ...files.ibmPlexMono];

type Look = Pick<Half, 'fonts' | 'type' | 'shape' | 'mainButton' | 'secondaryButtons' | 'posts' | 'columns' | 'titles' | 'navFooter' | 'brandName' | 'selection' | 'badges' | 'captions' | 'controls' | 'links' | 'icons' | 'grain' | 'avatars' | 'hashtags'>;

const common = {
  shape: 'rounded',
  mainButton: 'filled',
  secondaryButtons: 'tinted',
  posts: 'divided',
  columns: 'joined',
  titles: 'centered',
  navFooter: 'labelled',
  brandName: 'plain',
  selection: 'tinted',
  badges: 'count',
  captions: 'plain',
  controls: 'standard',
  links: 'underlined',
  icons: 'regular',
  grain: false,
  avatars: 'plain',
  hashtags: { look: 'tinted', face: 'label', weight: 700 },
} as const;

const typeBase = { caps: false, titleWeight: 500, labelWeight: 700, boldWeight: 600, headingTracking: '-0.015em', titleTracking: 'normal', labelTracking: 'normal', bodyLeading: '22px' } as const;

export const classicDark: Look = {
  ...common,
  fonts: { brand: stacks.spaceGrotesk, heading: stacks.spaceGrotesk, title: stacks.spaceGrotesk, label: stacks.ibmPlexSans, body: stacks.ibmPlexSans, bold: stacks.spaceGrotesk, code: stacks.ibmPlexMono },
  type: { ...typeBase, headingWeight: 500, headingSizes: ['26px', '20px', '16px'] },
};

export const classicLight: Look = {
  ...common,
  fonts: { brand: stacks.newsreader, heading: stacks.newsreader, title: stacks.newsreader, label: stacks.publicSans, body: stacks.publicSans, bold: stacks.newsreader, code: stacks.ibmPlexMono },
  type: { ...typeBase, headingWeight: 400, headingSizes: ['30px', '23px', '18px'] },
};
