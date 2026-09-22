/**
 * The logo of this deployment, in place of Mastodon's own logo and its
 * elephant illustrations.
 *
 * The container serves it at /logo.svg when a logo is configured (see
 * container/entrypoint.sh). Without one there is no such file: `hasBrandLogo()`
 * is false and the places that would show it render nothing, not an empty frame.
 *
 * Two ways of showing it, decided by the drawing itself:
 *
 * - A drawing marked `data-teadeck-logo` (Teadeck's own teacups, and any file
 *   written for it) is put into the page. Only then can its colour roles
 *   (`var(--teadeck-logo-…)`, see shell.css) follow the chosen design; an image
 *   loaded through `src` is sealed off from the page's CSS.
 * - Everything else - any logo an administrator drops in - is shown as an image,
 *   exactly as it is. Nothing of it reaches the page's CSS or DOM.
 */

import { useId, useMemo } from 'react';

let template: string | null = null;
let configured = false;

/** Whether this deployment has a logo at all; false before startup read it. */
export function hasBrandLogo() {
  return configured;
}

/** Whether the drawing asked to be put into the page (and can therefore be coloured). */
export function isThemeableLogo(text: string): boolean {
  return /<svg[^>]*\sdata-teadeck-logo\b/.test(text);
}

const referenceAttributes = ['clip-path', 'fill', 'stroke', 'mask', 'filter', 'href', 'xlink:href', 'marker-start', 'marker-mid', 'marker-end', 'style'];

/**
 * The drawing, ready to be put into the page: nothing executable, and its
 * internal names made unique for this copy.
 *
 * `prefix` keeps two copies of the same drawing apart - the navigation and the
 * compose column show one each. Without it the second copy's gradients and clip
 * paths would resolve to the first copy's.
 *
 * Scripts, event handlers and javascript: links are dropped even though the file
 * comes from this deployment's own container (the CSP blocks them too), and so
 * are `<style>` rules, which would otherwise apply to the whole application.
 * Returns `null` when the text is not an SVG drawing.
 */
export function inlinableSvg(text: string, prefix: string): string | null {
  const document_ = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = document_.documentElement;
  if (svg.localName !== 'svg' || document_.querySelector('parsererror')) return null;

  for (const element of svg.querySelectorAll('script, foreignObject, metadata, style')) {
    element.remove();
  }
  for (const element of [svg, ...svg.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.replace(/\s+/g, '').toLowerCase();
      if (name.startsWith('on') || value.includes('javascript:')) element.removeAttributeNode(attribute);
    }
  }

  // Rename every internal name, then every reference to one.
  const names = new Map<string, string>();
  for (const element of svg.querySelectorAll('[id]')) {
    const id = element.getAttribute('id');
    if (!id) continue;
    names.set(id, `${prefix}-${id}`);
    element.setAttribute('id', `${prefix}-${id}`);
  }
  if (names.size > 0) {
    for (const element of [svg, ...svg.querySelectorAll('*')]) {
      for (const name of referenceAttributes) {
        const value = element.getAttribute(name);
        if (!value) continue;
        const rewritten = value
          .replace(/url\(#([^)\s]+)\)/g, (match, id: string) => `url(#${names.get(id) ?? id})`)
          .replace(/^#(\S+)$/, (match, id: string) => `#${names.get(id) ?? id}`);
        if (rewritten !== value) element.setAttribute(name, rewritten);
      }
    }
  }

  // The page decides the size; where a box is larger than the drawing, the drawing
  // sits at the bottom of it: that is where the mascot belongs in the compose column.
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('focusable', 'false');
  if (!svg.hasAttribute('preserveAspectRatio')) svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
  return new XMLSerializer().serializeToString(svg);
}

/** Called once at startup with the file's content (bootstrap.ts), before anything renders. */
export function setBrandLogo(text: string | null) {
  configured = Boolean(text);
  template = text && isThemeableLogo(text) ? text : null;
}

/**
 * The drawing for a place outside React - the sign-in page, which is plain DOM.
 * `null` when no logo is configured or it is not one this page may put in.
 */
export function brandLogoMarkup(prefix: string): string | null {
  return template ? inlinableSvg(template, prefix) : null;
}

export const BrandLogo: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = 'teadeck-logo', style }) => {
  // One prefix per copy on the page, so their gradients and clip paths stay apart.
  const instance = useId().replace(/[^\w-]/g, '');
  const markup = useMemo(() => (template ? inlinableSvg(template, `teadeck-logo-${instance}`) : null), [instance]);

  if (!configured) return null;
  if (markup) {
    return <span className={className} style={style} dangerouslySetInnerHTML={{ __html: markup }} />;
  }
  // Any other logo: shown as it is, untouched.
  return <img src='/logo.svg' alt='' draggable='false' className={className} style={style} />;
};
