/**
 * Hibiskus (dark) and Rooibos (light): ovenblack and blood red. Square, in
 * condensed capitals, with outlined buttons and framed posts; the same type in
 * both halves (Big Shoulders Display, Barlow Condensed, Barlow).
 */
import { files, stacks } from './fonts.ts';
import type { Half } from './tokens.ts';
import { defineDesign } from './tokens.ts';

const look = {
  fonts: { heading: stacks.bigShouldersDisplay, title: stacks.barlowCondensed, label: stacks.barlowCondensed, body: stacks.barlow, bold: stacks.barlow, code: stacks.ibmPlexMono },
  type: {
    caps: true, headingWeight: 800, titleWeight: 700, labelWeight: 700, boldWeight: 700,
    headingSizes: ['36px', '24px', '17px'], headingTracking: '0.01em', titleTracking: '0.08em', labelTracking: '0.05em',
  },
  shape: 'square',
  mainButton: 'outlined',
  secondaryButtons: 'framed',
  posts: 'cards',
  avatars: 'framed',
} as const satisfies Partial<Half>;

const darkNeutral = ['#f8f3f2', '#ece4e2', '#d6cbc9', '#b3a8a6', '#8e8a8f', '#66595a', '#463838', '#2f2424', '#221919', '#181111', '#0f0b0b'] as const;
const lightNeutral = ['#fbf8f7', '#f3ecea', '#e5dad7', '#cbbcb8', '#a19390', '#7a6c69', '#5c4f4d', '#463b3a', '#322928', '#221b1a', '#160f0f'] as const;

export default defineDesign({
  id: 'hibiscus',
  names: { dark: { en: 'Hibiscus', de: 'Hibiskus' }, light: { en: 'Rooibos' } },
  fonts: [...files.bigShouldersDisplay, ...files.barlowCondensed, ...files.barlow, ...files.ibmPlexMono],
  dark: {
    ...look,
    neutral: darkNeutral,
    accent: ['#fdeceb', '#f9d2cf', '#f2a7a2', '#ea7a73', '#e0544d', '#d63b34', '#c22f29', '#9c2520', '#761d19', '#551715', '#330d0c'],
    ground: { surface: '#161011', page: '#0e0a0b', desktop: '#0a0707', text: darkNeutral[1] },
    logoTea: '#9c2228',
    frame: '#3f1b1a',
    hashtags: { look: { background: '#3a1716', text: '#ef9f98' }, face: 'body', weight: 500 },
    content: {
      heading: '#f1e8e6', text: '#d9cfcd', muted: '#9a8f8d', accent: '#d63b34', link: '#e8665f', border: '#3f1b1a', raised: '#1d1414',
      inlineCode: '#f2b1ab', inlineCodeBackground: '#3a1716', codeBackground: '#0a0707',
      keyword: '#e0544d', function: '#ece4e2', string: '#e8917c', number: '#f07a6e', comment: '#857876',
    },
  },
  light: {
    ...look,
    neutral: lightNeutral,
    accent: ['#fcedeb', '#f8d4d0', '#efaaa3', '#e27c73', '#d2544b', '#bf3a31', '#a82d25', '#8b241e', '#6e1d19', '#551815', '#330e0c'],
    ground: { surface: '#fffbfa', page: '#ffffff', desktop: '#f1e7e4', text: lightNeutral[10] },
    logoTea: '#b3262b',
    frame: '#e6cdc8',
    hashtags: { look: { background: '#f6e1dd', text: '#8b241e' }, face: 'body', weight: 500 },
    content: {
      heading: '#1d1414', text: '#3d3130', muted: '#6f6260', accent: '#b3261e', link: '#9c211a', border: '#e6cdc8', raised: '#f6ebe8',
      inlineCode: '#8b1f19', inlineCodeBackground: '#f6e1dd', codeBackground: '#faf3f1',
      keyword: '#b3261e', function: '#3d3130', string: '#9a4a1c', number: '#b3261e', comment: '#7a6c69',
    },
  },
});
