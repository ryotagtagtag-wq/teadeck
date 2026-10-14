/** Assam (dark) and Silver Needle (light): black tea amber, white tea gold. */
import { classicDark, classicFonts, classicLight } from './classic.ts';
import { defineDesign, mix } from './tokens.ts';

const darkNeutral = ['#f7efe3', '#ece0d0', '#dccbb8', '#bda995', '#97826f', '#6d5b4c', '#4f4136', '#3a2f26', '#2b221b', '#1f1813', '#17110d'] as const;
const darkAccent = ['#fdf3e6', '#f8e2c4', '#efc492', '#e2a668', '#d18d4a', '#c07a34', '#a4632a', '#864e21', '#6b3e1c', '#533018', '#351d0f'] as const;
const lightNeutral = ['#faf8f2', '#f1ece0', '#e2dbcb', '#c6bda9', '#9e9481', '#776e5d', '#5b5346', '#453f35', '#322e27', '#22201b', '#171512'] as const;
const lightAccent = ['#fbf8e8', '#f4edcc', '#e8dc9c', '#d8c674', '#c3ad50', '#ab9339', '#8f7a2c', '#736224', '#5c4e1e', '#473c19', '#2c2510'] as const;

export default defineDesign({
  id: 'assam',
  names: { dark: { en: 'Assam' }, light: { en: 'Silver Needle' } },
  fonts: classicFonts,
  dark: {
    ...classicDark,
    neutral: darkNeutral,
    accent: darkAccent,
    ground: { surface: darkNeutral[10], page: darkNeutral[10], desktop: mix(darkNeutral[10], 'black', 60), text: darkNeutral[1] },
    logoTea: darkAccent[6],
    frame: '#33261f',
    content: {
      heading: '#ece3da', text: '#d6c8bb', muted: '#a1907f', accent: '#c2814f', link: '#dda274', border: '#33261f', raised: '#251c17',
      inlineCode: '#ecc39a', inlineCodeBackground: 'rgb(194 129 79 / 16%)', codeBackground: '#0d0a08',
      keyword: '#dda274', function: '#d6b877', string: '#b9c08a', number: '#d98a7a', comment: '#86705f',
    },
  },
  light: {
    ...classicLight,
    neutral: lightNeutral,
    accent: lightAccent,
    ground: { surface: '#fffdf7', page: '#ffffff', desktop: lightNeutral[1], text: lightNeutral[10] },
    logoTea: '#c9ac4e',
    frame: '#ddd8cd',
    content: {
      heading: '#262520', text: '#454138', muted: '#6a655a', accent: '#8a7d52', link: '#5f5636', border: '#ddd8cd', raised: '#eae5da',
      inlineCode: '#4e4630', inlineCodeBackground: 'rgb(138 125 82 / 14%)', codeBackground: '#f3f0e9',
      keyword: '#5f5636', function: '#3f5a6e', string: '#66652a', number: '#9a4f3a', comment: '#77726a',
    },
  },
});
