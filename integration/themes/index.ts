/** Teadeck's designs, in the order the settings offer them. */
import assam from './assam.ts';
import hibiscus from './hibiscus.ts';
import sencha from './sencha.ts';

export const designs = [assam, sencha, hibiscus] as const;
export type DesignId = (typeof designs)[number]['id'];
export const designIds = designs.map((design) => design.id) as DesignId[];
