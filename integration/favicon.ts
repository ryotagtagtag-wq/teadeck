/** A small cup, coloured from the same computed roles as the large drawing. */
export function faviconSvg(body: string, line: string, tea: string): string {
  const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g stroke="${escape(line)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M24 12h2c6 0 4 10-3 10" fill="none"/><path d="M6 12h18c0 9-3 13-9 13S6 21 6 12Z" fill="${escape(body)}"/><path d="M7 14h16" stroke="${escape(tea)}" stroke-width="3"/><path d="M4 27h22M12 8c-3-3 3-3 0-6M19 8c-3-3 3-3 0-6" fill="none"/></g></svg>`;
}

let previous = '';
export function updateFavicon() {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;
  // Resolve var() and color-mix() as a real CSS colour, not an unresolved
  // custom-property string: an external favicon cannot inherit page styles.
  const probe = document.createElement('span');
  probe.style.display = 'none';
  document.documentElement.append(probe);
  const colour = (role: string, fallback: string) => {
    probe.style.color = `var(--teadeck-logo-${role}, ${fallback})`;
    return getComputedStyle(probe).color;
  };
  try {
    const svg = faviconSvg(colour('body', '#272733'), colour('line', '#b7b7cd'), colour('tea', '#b85c1e'));
    if (svg === previous) return;
    previous = svg;
    link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    link.type = 'image/svg+xml';
  } finally {
    probe.remove();
  }
}
