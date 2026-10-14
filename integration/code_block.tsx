/**
 * A code block in a post: the language it names and a copy button above,
 * line numbers beside the code, long lines wrapped under their number, and
 * the code highlighted when its language is known (code_highlight.ts).
 * Replaces the `<pre>` of the post's HTML.
 */

import { useEffect, useState } from 'react';

import ContentCopyIcon from '@/material-icons/400-24px/content_copy.svg?react';
import { Icon } from '@/mastodon/components/icon';

import { codeLanguage, highlightCode, splitTokenLines } from './code_highlight.ts';
import { currentUiTextLocale, t } from './settings_strings.ts';

export const CodeBlock: React.FC<{ element: HTMLPreElement }> = ({ element }) => {
  const language = codeLanguage(element.querySelector('code')?.className);
  // A trailing line break ends the last line; it does not start another one.
  const code = (element.textContent ?? '').replace(/\n$/, '');
  const lines = splitTokenLines(highlightCode(code, language));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    void navigator.clipboard.writeText(code).then(() => setCopied(true), () => {});
  };

  return (
    <div className='teadeck-code'>
      <div className='teadeck-code__header'>
        <span className='teadeck-code__language monospace'>{language}</span>
        <button type='button' className='teadeck-code__copy' onClick={copy}>
          <Icon id='copy' icon={ContentCopyIcon} />
          {t(copied ? 'copied' : 'copy', currentUiTextLocale())}
        </button>
      </div>
      {/* One element per line, so a long line wraps under its own number. The numbers are
          CSS counters: generated content, which selecting and copying the code leaves out. */}
      <pre className='teadeck-code__body' style={{ '--teadeck-code-digits': String(lines.length).length } as React.CSSProperties}><code>
        {lines.map((tokens, line) => (
          <span key={line} className='teadeck-code__line'>
            {tokens.map((token, index) => (
              token.role === 'plain' ? token.text : <span key={index} className={`teadeck-code__${token.role}`}>{token.text}</span>
            ))}
            {line < lines.length - 1 && '\n'}
          </span>
        ))}
      </code></pre>
    </div>
  );
};
