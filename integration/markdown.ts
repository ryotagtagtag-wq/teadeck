/**
 * A small Markdown renderer for the large composer's preview. The server turns
 * the post into HTML itself (GoToSocial: CommonMark with strikethrough, links
 * from bare addresses and line breaks kept); this is a close approximation of
 * that, not the real thing. Everything typed is escaped: no HTML gets through,
 * and links only point to http(s) and mailto addresses.
 */

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function unescapeHtml(text: string): string {
  return text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

const safeUrl = /^(https?:\/\/|mailto:)/i;

function link(href: string, text: string): string {
  return `<a href="${href}" rel="nofollow noopener noreferrer" target="_blank">${text}</a>`;
}

/** Inline syntax of one block's text: code, links, emphasis, strikethrough. */
export function renderInline(source: string): string {
  const kept: string[] = [];
  const keep = (html: string) => `\u0000${kept.push(html) - 1}\u0000`;

  let text = source
    // Code first: nothing inside it is Markdown.
    .replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (_, _ticks: string, code: string) => keep(`<code>${escapeHtml(code.trim() ? code.replace(/^ (.*) $/, '$1') : code)}</code>`))
    .replace(/\\([\\`*_{}[\]()#+\-.!~>|])/g, (_, char: string) => keep(escapeHtml(char)));
  text = escapeHtml(text)
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match: string, label: string, href: string) => {
      const url = unescapeHtml(href);
      return safeUrl.test(url) ? keep(link(escapeHtml(url), label)) : match;
    })
    .replace(/(^|[\s(])((?:https?:\/\/)[^\s<]+?)(?=[.,;:!?)]*(?:\s|$))/g, (_, before: string, href: string) => `${before}${keep(link(href, href))}`)
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
    .replace(/\*(?=\S)([\s\S]*?\S)\*/g, '<em>$1</em>')
    .replace(/(^|[^\w])_(?=\S)([\s\S]*?\S)_(?!\w)/g, '$1<em>$2</em>');
  // Kept parts may contain others (a link's label with code), so restore until none are left.
  while (text.includes('\u0000')) text = text.replace(/\u0000(\d+)\u0000/g, (_, index: string) => kept[Number(index)] ?? '');
  return text;
}

const fence = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/;
const heading = /^ {0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/;
const rule = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const quote = /^ {0,3}> ?/;
const listItem = /^( {0,3})([-*+]|\d{1,9}[.)])\s+(.*)$/;

function isBlockStart(line: string): boolean {
  return fence.test(line) || heading.test(line) || rule.test(line) || quote.test(line) || listItem.test(line);
}

function renderBlocks(lines: string[]): string {
  const out: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (!line.trim()) { index++; continue; }

    const opening = fence.exec(line);
    if (opening) {
      const marker = opening[1]!;
      const code: string[] = [];
      index++;
      while (index < lines.length && !new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`).test(lines[index]!)) code.push(lines[index++]!);
      index++;
      const language = opening[2] ? ` class="language-${escapeHtml(opening[2])}"` : '';
      out.push(`<pre><code${language}>${escapeHtml(code.join('\n'))}\n</code></pre>`);
      continue;
    }

    const title = heading.exec(line);
    if (title) {
      out.push(`<h${title[1]!.length}>${renderInline(title[2] ?? '')}</h${title[1]!.length}>`);
      index++;
      continue;
    }

    if (rule.test(line)) { out.push('<hr>'); index++; continue; }

    if (quote.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && (quote.test(lines[index]!) || (lines[index]!.trim() && !isBlockStart(lines[index]!) && quoted.length))) {
        quoted.push(lines[index]!.replace(quote, ''));
        index++;
      }
      out.push(`<blockquote>${renderBlocks(quoted)}</blockquote>`);
      continue;
    }

    const first = listItem.exec(line);
    if (first) {
      const ordered = /\d/.test(first[2]!);
      const items: string[][] = [];
      while (index < lines.length) {
        const current = lines[index]!;
        const item = listItem.exec(current);
        if (item && /\d/.test(item[2]!) === ordered && item[1]!.length <= first[1]!.length + 1) {
          items.push([item[3]!]);
        } else if (current.trim() && /^\s{2,}/.test(current) && items.length) {
          // Indented lines continue the item; a nested list among them is rendered inside it.
          items.at(-1)!.push(current.replace(/^\s{2,4}/, ''));
        } else if (!current.trim() && listItem.test(lines[index + 1] ?? '')) {
          // A blank line between items keeps the list going.
        } else {
          break;
        }
        index++;
      }
      const start = ordered && parseInt(first[2]!, 10) !== 1 ? ` start="${parseInt(first[2]!, 10)}"` : '';
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}${start}>${items.map((item) => {
        const [text, ...rest] = item;
        const nested = rest.length ? renderBlocks(rest) : '';
        return `<li>${renderInline(text!)}${nested}</li>`;
      }).join('')}</${tag}>`);
      continue;
    }

    // A paragraph: its lines keep their breaks, as on the server.
    const paragraph: string[] = [];
    while (index < lines.length && lines[index]!.trim() && !(paragraph.length && isBlockStart(lines[index]!))) {
      paragraph.push(lines[index]!.trim());
      index++;
    }
    out.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
  }
  return out.join('');
}

/** The post's text as HTML, the way the server will most likely show it. */
export function renderMarkdown(source: string): string {
  return renderBlocks(source.replace(/\r\n?/g, '\n').split('\n'));
}
