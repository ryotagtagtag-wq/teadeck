/**
 * Teadeck's design vocabulary. A design describes each of its halves (dark and
 * light) in these terms only; it never names Mastodon's variables or classes.
 * css.ts turns a design into `--td-*` variables, and mastodon.css, the only
 * file that knows Mastodon, applies them to Mastodon's interface.
 */

/** A colour scale from light (50) to dark (950), as Mastodon's ramps have it. */
export type Ramp = readonly [string, string, string, string, string, string, string, string, string, string, string];
export const rampSteps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** A font file in integration/fonts, declared by the designs that use it. */
export interface FontFile {
  family: string;
  file: string;
  /** A single weight, or the range the file covers. */
  weight: number | readonly [number, number];
  /** One file for the whole weight range. */
  variable?: boolean;
  style?: 'normal' | 'italic';
}

export interface Half {
  /** Greys for text, lines and surfaces. */
  neutral: Ramp;
  /** The design's colour: buttons, links, highlights. */
  accent: Ramp;
  ground: {
    /** Behind posts and panels. */
    surface: string;
    /** The column's own ground. */
    page: string;
    /** Behind the columns in the wide layout. */
    desktop: string;
    /** Text on the ground. */
    text: string;
  };
  /** The tea in the teacup logo. */
  logoTea: string;
  fonts: {
    /** Headings in posts and pages. */
    heading: string;
    /** Column and dialog titles. */
    title: string;
    /** Names and buttons. */
    label: string;
    body: string;
    /** Bold text in posts. */
    bold: string;
    code: string;
  };
  type: {
    /** Titles, names, buttons and headings in capitals. */
    caps: boolean;
    headingWeight: number;
    titleWeight: number;
    labelWeight: number;
    boldWeight: number;
    /** h1, h2 and h3 in posts. */
    headingSizes: readonly [string, string, string];
    headingTracking: string;
    titleTracking: string;
    labelTracking: string;
  };
  shape: 'rounded' | 'square';
  /** The line around framed things (cards, framed buttons and avatars). */
  frame: string;
  mainButton: 'filled' | 'outlined';
  secondaryButtons: 'tinted' | 'framed';
  posts: 'divided' | 'cards';
  avatars: 'plain' | 'framed';
  hashtags: {
    look: 'tinted' | { background: string; text: string };
    face: 'label' | 'body';
    weight: number;
  };
  /** Post content: Markdown and code. */
  content: {
    heading: string;
    text: string;
    muted: string;
    accent: string;
    link: string;
    border: string;
    raised: string;
    inlineCode: string;
    inlineCodeBackground: string;
    codeBackground: string;
    keyword: string;
    function: string;
    string: string;
    number: string;
    comment: string;
  };
}

/** A name in English, and in other interface languages where it differs. */
export type Name = { en: string } & Partial<Record<string, string>>;

export interface Design {
  /** The value of TEADECK_THEME and of the setting. */
  id: string;
  /** Named after the tea whose brewed colour each half carries. */
  names: { dark: Name; light: Name };
  fonts: readonly FontFile[];
  dark: Half;
  light: Half;
}

export const defineDesign = <const D extends Design>(design: D): D => design;

/** A colour between two others, mixed by the browser. */
export const mix = (color: string, other: string, percent: number) => `color-mix(in oklab, ${color} ${percent}%, ${other})`;

/** A design's name in an interface language, e.g. "Assam & Silver Needle". */
export function designLabel(design: Design, locale: string) {
  const name = (part: Name) => part[locale] ?? part.en;
  return `${name(design.names.dark)} & ${name(design.names.light)}`;
}
