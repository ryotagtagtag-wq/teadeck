/**
 * The deployment's logo (/logo.svg, if configured) in place of Mastodon's.
 * An SVG marked `data-teadeck-logo` is inlined so its colours can follow the
 * theme; any other logo is shown as a plain image.
 */

import { useId, useMemo } from 'react';

let template: string | null = null;
let configured = false;

export function hasBrandLogo() {
  return configured;
}

export function isThemeableLogo(text: string): boolean {
  return /<svg[^>]*\sdata-teadeck-logo\b/.test(text);
}

const referenceAttributes = ['clip-path', 'fill', 'stroke', 'mask', 'filter', 'href', 'xlink:href', 'marker-start', 'marker-mid', 'marker-end', 'style'];

/**
 * The SVG without scripts, event handlers, javascript: links and styles, with
 * its IDs prefixed so several copies on one page do not clash. `null` if the
 * text is not an SVG.
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

  // Sized by the page; aligned to the bottom, where the compose column shows it.
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('focusable', 'false');
  if (!svg.hasAttribute('preserveAspectRatio')) svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
  return new XMLSerializer().serializeToString(svg);
}

export function setBrandLogo(text: string | null) {
  configured = Boolean(text);
  template = text && isThemeableLogo(text) ? text : null;
}

/** For the sign-in page, which is plain DOM. */
export function brandLogoMarkup(prefix: string): string | null {
  return template ? inlinableSvg(template, prefix) : null;
}

export const BrandLogo: React.FC<{ className?: string }> = ({ className = 'teadeck-logo' }) => {
  const instance = useId().replace(/[^\w-]/g, '');
  const markup = useMemo(() => (template ? inlinableSvg(template, `teadeck-logo-${instance}`) : null), [instance]);

  if (!configured) return null;
  if (markup) {
    return <span className={className} dangerouslySetInnerHTML={{ __html: markup }} />;
  }
  return <img src='/logo.svg' alt='' draggable='false' className={className} />;
};
