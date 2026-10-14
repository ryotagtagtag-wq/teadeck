/** Teadeck's designs, in the order the settings offer them. */
import assam from './assam.ts';
import hibiscus from './hibiscus.ts';
import sencha from './sencha.ts';

export const designs = [assam, sencha, hibiscus] as const;
export type DesignId = (typeof designs)[number]['id'];
export const designIds = designs.map((design) => design.id) as DesignId[];

type Scheme = 'dark' | 'light';
const half = (id: string, scheme: Scheme) => designs.find((design) => design.id === id)?.[scheme];

/**
 * A half's structural choices as attributes on <html>, for mastodon.css: rules
 * for a choice apply only where a design makes it, so Mastodon's own layout
 * stays untouched elsewhere. Mastodon's design (no Teadeck design) has none.
 */
export const designAttributeNames = ['teadeckShape', 'teadeckPosts', 'teadeckColumns', 'teadeckTitles', 'teadeckFooterNav'] as const;

export function designAttributes(id: string, scheme: Scheme): Partial<Record<(typeof designAttributeNames)[number], string>> {
  const chosen = half(id, scheme);
  if (!chosen) return {};
  return { teadeckShape: chosen.shape, teadeckPosts: chosen.posts, teadeckColumns: chosen.columns, teadeckTitles: chosen.titles, teadeckFooterNav: chosen.footerNav };
}

/** The stroke of the line icons; Mastodon's own is regular. */
export const designIcons = (id: string, scheme: Scheme) => half(id, scheme)?.icons ?? 'regular';
