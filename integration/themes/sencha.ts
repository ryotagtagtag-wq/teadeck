/** Sencha (dark) and Jasmine (light): green tea, from deep to pale. */
import { classicDark, classicFonts, classicLight } from './classic.ts';
import { defineDesign, mix } from './tokens.ts';

const darkNeutral = ['#f3f8f4', '#e7efe9', '#d3ddd6', '#b3bfb6', '#8a978d', '#5f6d64', '#445049', '#313a36', '#232a27', '#1a201d', '#121614'] as const;
const darkAccent = ['#eef7ea', '#dbefd3', '#bcdfae', '#9ccd8b', '#82b971', '#6ca25c', '#57874a', '#466c3c', '#385631', '#2c4427', '#1a2a17'] as const;
const lightNeutral = ['#faf7ef', '#f2ece0', '#e3dccb', '#c5bda8', '#9c9480', '#756e5c', '#595345', '#433f34', '#312e26', '#21201a', '#161511'] as const;
const lightAccent = ['#eef5ec', '#dcebd8', '#b9d5b2', '#94bd8b', '#71a468', '#5b8f51', '#4a7a42', '#3f6b3a', '#33552f', '#2a4527', '#182b17'] as const;

export default defineDesign({
  id: 'sencha',
  names: { dark: { en: 'Sencha' }, light: { en: 'Jasmine' } },
  fonts: classicFonts,
  dark: {
    ...classicDark,
    neutral: darkNeutral,
    accent: darkAccent,
    ground: { surface: darkNeutral[10], page: darkNeutral[10], desktop: mix(darkNeutral[10], 'black', 60), text: darkNeutral[1] },
    logoTea: '#a8b23f',
    frame: '#2e3833',
    content: {
      heading: '#e8ece6', text: '#c9d3c8', muted: '#9aa89c', accent: '#9cc17c', link: '#b2d295', border: '#2e3833', raised: '#242d29',
      inlineCode: '#c5dda8', inlineCodeBackground: 'rgb(156 193 124 / 14%)', codeBackground: '#101413',
      keyword: '#b2d295', function: '#9cc4c0', string: '#d9c07f', number: '#d89a78', comment: '#76887c',
    },
  },
  light: {
    ...classicLight,
    neutral: lightNeutral,
    accent: lightAccent,
    ground: { surface: '#fbf8ef', page: '#ffffff', desktop: lightNeutral[1], text: lightNeutral[10] },
    logoTea: '#cbbd62',
    frame: '#ded9c6',
    content: {
      heading: '#25281f', text: '#414436', muted: '#6b6d5c', accent: '#5f7d4e', link: '#4a6a3c', border: '#ded9c6', raised: '#ebe8d8',
      inlineCode: '#3a5730', inlineCodeBackground: 'rgb(95 125 78 / 12%)', codeBackground: '#f3f1e6',
      keyword: '#4a6a3c', function: '#3d5f7a', string: '#7f6118', number: '#a24f3a', comment: '#737562',
    },
  },
});
