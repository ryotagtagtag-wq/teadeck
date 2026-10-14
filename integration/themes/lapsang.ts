/**
 * Lapsang Souchong (dark) and Earl Grey (light): smoky ash-black and cool slate,
 * blood red as the accent. Hibiscus's type and frame (spaced columns, framed
 * controls, grain), with the server's name and the column titles in blackletter.
 * Straight corners with gothic ornaments on the cards, pointed arch avatars, a
 * Latin cross before the titles and a drop for unread counts. A faint red glow
 * sits in the top left, the tea is opaque and the cup has fangs.
 */
import { files, stacks } from './fonts.ts';
import type { Half } from './tokens.ts';
import { defineDesign } from './tokens.ts';

const look = {
  fonts: { brand: stacks.unifrakturMaguntia, heading: stacks.bigShouldersDisplay, title: stacks.unifrakturMaguntia, label: stacks.barlowCondensed, body: stacks.barlow, bold: stacks.barlow, code: stacks.ibmPlexMono },
  type: {
    caps: true, titleCaps: false, headingWeight: 800, titleWeight: 400, labelWeight: 700, boldWeight: 700,
    headingSizes: ['36px', '24px', '17px'], headingTracking: '0.01em', titleTracking: '0.01em', labelTracking: '0.04em',
    bodyLeading: '1.55',
  },
  shape: 'gothic',
  posts: 'cards',
  columns: 'spaced',
  titles: 'cross',
  navFooter: 'tiles',
  brandName: 'plain',
  selection: 'marked',
  badges: 'drop',
  captions: { size: '12px', tracking: '0.1em' },
  controls: 'framed',
  links: 'bare',
  icons: 'bold',
  grain: true,
  avatars: 'arch',
  fangs: { fang: '#f4ece9', blood: '#9e1420' },
} as const satisfies Partial<Half>;

/** The cup in dark iron with a blood red tea that covers the wall of the glass. */
const cup = { tea: '#8d0404', teaDark: '#4e0000', teaLight: '#b01818', teaShade: '#3a0000', steam: '#7a6866', opaqueTea: true } as const;

const darkNeutral = ['#f7f1ee', '#ece0db', '#d0c3bd', '#9d8d87', '#7a6c67', '#5a4d49', '#3a302e', '#2a2224', '#1b1517', '#120e0f', '#0a0708'] as const;
const lightNeutral = ['#f3f2f6', '#dcdbe3', '#b7b7c5', '#8a8a94', '#70707e', '#5c5c6a', '#4b4b58', '#424351', '#373845', '#2b2c37', '#1f2028'] as const;

export default defineDesign({
  id: 'lapsang',
  names: { dark: { en: 'Lapsang Souchong' }, light: { en: 'Earl Grey' } },
  fonts: [...files.unifrakturMaguntia, ...files.bigShouldersDisplay, ...files.barlowCondensed, ...files.barlow, ...files.ibmPlexMono],
  dark: {
    ...look,
    neutral: darkNeutral,
    // 300 is the interface's accent (links, active icons); 600 fills the main button.
    accent: ['#fdeceb', '#fad3d1', '#f29a96', '#e0454c', '#c5303a', '#b4242f', '#910f17', '#7a1119', '#5e0d14', '#2a1014', '#1a0a0c'],
    ground: { surface: '#181213', page: '#100c0c', desktop: '#080607', text: '#ece0db', glow: 'radial-gradient(circle at 0 0, rgb(150 14 20 / 11%), transparent 42%)' },
    logo: { ...cup, line: '#080607', body: '#3a2e30', bodyDark: '#1b1517', highlight: '#f4ece9' },
    frame: '#3b2f31',
    ornaments: '#7e1a22',
    mainButton: { background: '#910f17', text: '#f4ece9', hover: '#a8141e', line: 'rgb(255 236 234 / 30%)' },
    secondaryButtons: { background: '#2e1316', text: '#f08a86' },
    hashtags: { look: { background: 'rgb(145 15 23 / 22%)', text: '#eca09c' }, face: 'label', weight: 700 },
    content: {
      heading: '#ece0db', text: '#d0c3bd', muted: '#9d8d87', accent: '#c5303a', link: '#e0454c', border: '#3b2f31', raised: '#2a2224',
      inlineCode: '#f29a96', inlineCodeBackground: 'rgb(145 15 23 / 22%)', codeBackground: '#080607',
      keyword: '#e0454c', function: '#ece0db', string: '#e8a08c', number: '#f07a6e', comment: '#7a6c67',
    },
  },
  light: {
    ...look,
    neutral: lightNeutral,
    // 300 is the interface's accent in the light; the main button fills at 600.
    accent: ['#ffecec', '#ffd3d4', '#ffb0b3', '#ff7d82', '#f35a62', '#d8343f', '#9e111a', '#84101a', '#6a0d15', '#3c0a0f', '#22080b'],
    ground: { surface: '#424351', page: '#373845', desktop: '#2b2c37', text: '#f3f2f6', glow: 'radial-gradient(circle at 0 0, rgb(170 30 50 / 12%), transparent 42%)' },
    logo: { ...cup, line: '#1f2028', body: '#5c5c6a', bodyDark: '#2b2c37', steam: '#b7b7c5', highlight: '#f3f2f6' },
    frame: '#5b5c6e',
    ornaments: '#a33a42',
    mainButton: { background: '#9e111a', text: '#f4ece9', hover: '#b51b25', line: 'rgb(255 255 255 / 35%)' },
    secondaryButtons: { background: '#5c2530', text: '#ffd0d2' },
    hashtags: { look: { background: 'rgb(158 17 26 / 30%)', text: '#ffc4c6' }, face: 'label', weight: 700 },
    content: {
      heading: '#f3f2f6', text: '#dcdbe3', muted: '#b7b7c5', accent: '#ff7d82', link: '#ff7d82', border: '#5b5c6e', raised: '#4b4b58',
      inlineCode: '#ffb0b3', inlineCodeBackground: 'rgb(158 17 26 / 30%)', codeBackground: '#2b2c37',
      keyword: '#ff7d82', function: '#f3f2f6', string: '#ffb89e', number: '#ff9a94', comment: '#8a8a94',
    },
  },
});
