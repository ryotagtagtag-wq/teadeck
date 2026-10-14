/** Teadeck's designs, in the order the settings offer them. */
import assam from './assam.ts';
import hibiscus from './hibiscus.ts';
import lapsang from './lapsang.ts';
import sencha from './sencha.ts';
import type { Half } from './tokens.ts';

export const designs = [assam, sencha, hibiscus, lapsang] as const;
export type DesignId = (typeof designs)[number]['id'];
export const designIds = designs.map((design) => design.id) as DesignId[];

type Scheme = 'dark' | 'light';
const half = (id: string, scheme: Scheme) => designs.find((design) => design.id === id)?.[scheme];

/**
 * A half's structural choices as attributes on <html>, for mastodon.css: rules
 * for a choice apply only where a design makes it, so Mastodon's own layout
 * stays untouched elsewhere. Mastodon's design (no Teadeck design) has none.
 */
export const designAttributeNames = [
  'teadeckShape', 'teadeckPosts', 'teadeckColumns', 'teadeckTitles', 'teadeckNavFooter', 'teadeckBrandName',
  'teadeckSelection', 'teadeckBadges', 'teadeckCaptions', 'teadeckControls', 'teadeckLinks',
  'teadeckLogoSteam', 'teadeckBrandFangs', 'teadeckAvatars', 'teadeckOrnaments',
] as const;

/** The attributes one half sets. */
export function halfAttributes(half: Half): Partial<Record<(typeof designAttributeNames)[number], string>> {
  return {
    teadeckShape: half.shape, teadeckPosts: half.posts, teadeckColumns: half.columns, teadeckTitles: half.titles,
    teadeckNavFooter: half.navFooter, teadeckBrandName: half.brandName === 'plain' ? 'plain' : 'display',
    teadeckSelection: half.selection, teadeckBadges: half.badges, teadeckCaptions: half.captions === 'plain' ? 'plain' : 'small',
    teadeckControls: half.controls, teadeckLinks: half.links, teadeckLogoSteam: half.logo.steamShape ?? 'soft',
    teadeckBrandFangs: half.fangs ? 'fangs' : 'none', teadeckAvatars: half.avatars,
    teadeckOrnaments: half.ornaments ? 'gothic' : 'none',
  };
}

export function designAttributes(id: string, scheme: Scheme): Partial<Record<(typeof designAttributeNames)[number], string>> {
  const chosen = half(id, scheme);
  return chosen ? halfAttributes(chosen) : {};
}

/** The stroke of the line icons; Mastodon's own is regular. */
export const designIcons = (id: string, scheme: Scheme) => half(id, scheme)?.icons ?? 'regular';
