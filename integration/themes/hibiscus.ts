/**
 * Hibiskus (dark) and Rooibos (light): ovenblack and blood red. Chamfered
 * corners, condensed capitals, borderless cards on the column's ground and a
 * fine grain; the same type in both halves (Metal Mania for the server's name,
 * Big Shoulders Display, Barlow Condensed, Barlow).
 */
import { files, stacks } from './fonts.ts';
import type { Half } from './tokens.ts';
import { defineDesign } from './tokens.ts';

const look = {
  fonts: { brand: stacks.metalMania, heading: stacks.bigShouldersDisplay, title: stacks.bigShouldersDisplay, label: stacks.barlowCondensed, body: stacks.barlow, bold: stacks.barlow, code: stacks.ibmPlexMono },
  type: {
    caps: true, headingWeight: 800, titleWeight: 800, labelWeight: 700, boldWeight: 700,
    headingSizes: ['36px', '24px', '17px'], headingTracking: '0.01em', titleTracking: '0.02em', labelTracking: '0.04em',
    bodyLeading: '1.55',
  },
  shape: 'chamfered',
  posts: 'cards',
  columns: 'spaced',
  titles: 'marked',
  footerNav: 'icons',
  icons: 'bold',
  grain: true,
  avatars: 'plain',
} as const satisfies Partial<Half>;

/** The cup in cast iron, in both halves. */
const castIron = { tea: '#7d1a26', teaDark: '#5c121c', teaLight: '#9c2e3a', line: '#0b0708', steam: '#7a6866', body: '#6a5856', bodyDark: '#45383a' };

const darkNeutral = ['#f8f3f2', '#ece2df', '#d8ccc8', '#a89995', '#857674', '#5e5051', '#3a2c2d', '#2a2223', '#1b1718', '#141112', '#0c0a0b'] as const;
const lightNeutral = ['#fbf8f7', '#f3ecea', '#e5dad7', '#cbbcb8', '#a19390', '#7a6c69', '#5c4f4d', '#463b3a', '#322928', '#221b1a', '#160f0f'] as const;

export default defineDesign({
  id: 'hibiscus',
  names: { dark: { en: 'Hibiscus', de: 'Hibiskus' }, light: { en: 'Rooibos' } },
  fonts: [...files.metalMania, ...files.bigShouldersDisplay, ...files.barlowCondensed, ...files.barlow, ...files.ibmPlexMono],
  dark: {
    ...look,
    neutral: darkNeutral,
    // 300 is the interface's accent (links, active icons); 600 fills the main button.
    accent: ['#fdeceb', '#fbd5d1', '#f0a89e', '#ec5a4c', '#d0312c', '#cc2b26', '#b8221f', '#8f1b18', '#6a2423', '#2a1416', '#1a0c0d'],
    ground: { surface: '#1b1718', page: '#141112', desktop: '#0c0a0b', text: '#ece2df' },
    logo: castIron,
    frame: '#3a2c2d',
    mainButton: { background: '#b8221f', text: '#f4ece9', hover: '#cc2b26' },
    secondaryButtons: { background: '#2a1416', text: '#f0a89e' },
    hashtags: { look: { background: 'rgb(208 49 44 / 18%)', text: '#f0a89e' }, face: 'label', weight: 700 },
    content: {
      heading: '#ece2df', text: '#d8ccc8', muted: '#a89995', accent: '#d0312c', link: '#ec5a4c', border: '#3a2c2d', raised: '#2a2223',
      inlineCode: '#f0a89e', inlineCodeBackground: 'rgb(208 49 44 / 18%)', codeBackground: '#0c0a0b',
      keyword: '#ec5a4c', function: '#ece2df', string: '#e8917c', number: '#f07a6e', comment: '#857674',
    },
  },
  light: {
    ...look,
    neutral: lightNeutral,
    // 600 is the interface's accent in the light; the main button fills a shade deeper than in the dark.
    accent: ['#fcedeb', '#f8d4d0', '#efaaa3', '#e27c73', '#d2544b', '#c0302b', '#a8231d', '#8b241e', '#6e1d19', '#551815', '#330e0c'],
    ground: { surface: '#fffbfa', page: '#f6efed', desktop: '#ebe0dd', text: '#1d1414' },
    logo: castIron,
    frame: '#dccbc7',
    mainButton: { background: '#a51d1a', text: '#fbf3f1', hover: '#8f1b18' },
    secondaryButtons: { background: '#f6e1dd', text: '#8b241e' },
    hashtags: { look: { background: 'rgb(192 48 43 / 12%)', text: '#8b241e' }, face: 'label', weight: 700 },
    content: {
      heading: '#1d1414', text: '#3d3130', muted: '#6f6260', accent: '#c0302b', link: '#a8231d', border: '#dccbc7', raised: '#eadfdc',
      inlineCode: '#8b1f19', inlineCodeBackground: 'rgb(192 48 43 / 12%)', codeBackground: '#faf3f1',
      keyword: '#b3261e', function: '#3d3130', string: '#9a4a1c', number: '#b3261e', comment: '#7a6c69',
    },
  },
});
