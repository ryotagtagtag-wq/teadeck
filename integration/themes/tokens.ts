/**
 * Teadeck's design vocabulary. A design describes each of its halves (dark and
 * light) in these terms only; it never names Mastodon's variables or classes.
 * css.ts turns a design into `--td-*` variables, and mastodon.css, the only
 * file that knows Mastodon, applies them to Mastodon's interface.
 */

/** A colour scale from light (50) to dark (950), as Mastodon's ramps have it. */
export type Ramp = readonly [string, string, string, string, string, string, string, string, string, string, string];
export const rampSteps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** How tightly the interface is set: chosen by the reader, not by a design. */
export const densities = ['default', 'compact'] as const;
export type Density = (typeof densities)[number];

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
  /**
   * Whether the ground is dark or light, where that differs from the half:
   * Earl Grey is the light half of its design but still dark. Mastodon picks
   * its colour roles (brand text, form controls, scroll bars) by this.
   */
  tone?: 'dark' | 'light';
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
    /** A faint light spread over the top left of the ground, e.g. behind the logo; a CSS background-image. */
    glow?: string;
  };
  /**
   * The teacup logo's colours and steam shape. The tea is the design's own; the cup's roles
   * left out follow the interface (line from the text, body from a raised
   * surface) and the tea's shades from the tea.
   */
  logo: {
    tea: string;
    /** Soft wisps by default; angular steam belongs to designs such as Hibiscus, none to a cup of blood. */
    steamShape?: 'soft' | 'angular' | 'none';
    teaDark?: string;
    teaLight?: string;
    teaShade?: string;
    line?: string;
    steam?: string;
    body?: string;
    bodyDark?: string;
    highlight?: string;
    /** The tea is opaque: it covers the wall of a glass cup instead of showing through it. */
    opaqueTea?: boolean;
    /** The tea runs over the rim and drips down the cup. */
    drips?: boolean;
  };
  fonts: {
    /** The server's name at the top of the navigation. */
    brand: string;
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
    /** Column and settings titles in capitals, where they differ from the rest (blackletter cannot be set in capitals). */
    titleCaps?: boolean;
    headingWeight: number;
    titleWeight: number;
    labelWeight: number;
    boldWeight: number;
    /** h1, h2 and h3 in posts. */
    headingSizes: readonly [string, string, string];
    headingTracking: string;
    titleTracking: string;
    labelTracking: string;
    /** Line height of post text. */
    bodyLeading: string;
  };
  /**
   * Corners: round, square, square with two cut off at 45° (top right, bottom left), or
   * gothic: straight like square, with the ornaments that `ornaments` sets.
   */
  shape: 'rounded' | 'square' | 'chamfered' | 'gothic';
  /** The line around framed things (framed buttons, avatars, fields). */
  frame: string;
  /** "New post" and other main buttons: in the accent, an outline, or colours of their own. */
  mainButton: 'filled' | 'outlined' | { background: string; text: string; hover: string; line?: string };
  /** Secondary buttons ("Unfollow"): a faint tint, a frame, or colours of their own. */
  secondaryButtons: 'tinted' | 'framed' | { background: string; text: string };
  /** Posts divided by a line, or each on a card of its own on the column's ground. */
  posts: 'divided' | 'cards';
  /** Columns side by side, or apart with the desktop's ground between them. */
  columns: 'joined' | 'spaced';
  /** Column titles centred, or at the start behind an accent marker: a bar, or a Latin cross. */
  titles: 'centered' | 'marked' | 'cross';
  /**
   * The navigation's footer: Mastodon's labelled links and framed account
   * card, or icon tiles (names for screen readers) and the account on a tile.
   */
  navFooter: 'labelled' | 'tiles';
  /** The server's name at the top: as Mastodon sets it, or in the brand face at a size of its own. */
  brandName: 'plain' | { size: string; tracking: string };
  /** The selected tab and navigation item: Mastodon's tint, or underlined and on a card in the accent. */
  selection: 'tinted' | 'marked';
  /** Unread counts: a number, a small square, or a drop of blood. */
  badges: 'count' | 'dot' | 'drop';
  /** A notification's kind ("Mention"): as Mastodon sets it, or a small caption in the label face. */
  captions: 'plain' | { size: string; tracking: string };
  /** Settings fields: Mastodon's look, or labels in the label face and switches as a framed track. */
  controls: 'standard' | 'framed';
  /** Links in posts: underlined, or bare in the link colour until hovered. */
  links: 'underlined' | 'bare';
  /** Vampire fangs hanging below the logo, with their blood; the colours of the fangs and of the blood. */
  fangs?: { fang: string; blood: string };
  /** Stroke of the line icons. */
  icons: 'regular' | 'bold';
  /** A fine grain over the whole interface. */
  grain: boolean;
  /** Avatars: square, framed, or in a pointed arch as in a church window. */
  avatars: 'plain' | 'framed' | 'arch';
  /** Gothic ornaments in the four corners of posts, notifications and the account card: their colour. */
  ornaments?: string;
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
