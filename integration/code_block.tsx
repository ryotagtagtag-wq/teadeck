/**
 * A code block in a post: the language it names and a copy button above,
 * line numbers beside the code, and the code highlighted when its language
 * is known (code_highlight.ts). Replaces the `<pre>` of the post's HTML.
 */

import { useEffect, useState } from 'react';

import ContentCopyIcon from '@/material-icons/400-24px/content_copy.svg?react';
import { Icon } from '@/mastodon/components/icon';

import { codeLanguage, highlightCode } from './code_highlight';
import { currentUiTextLocale, t } from './settings_strings';

export const CodeBlock: React.FC<{ element: HTMLPreElement }> = ({ element }) => {
  const language = codeLanguage(element.querySelector('code')?.className);
  // A trailing line break ends the last line; it does not start another one.
  const code = (element.textContent ?? '').replace(/\n$/, '');
  const lines = code.split('\n').length;
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
      <div className='teadeck-code__body'>
        <span className='teadeck-code__lines monospace' aria-hidden='true'>
          {Array.from({ length: lines }, (_, index) => index + 1).join('\n')}
        </span>
        <pre><code>
          {highlightCode(code, language).map((token, index) => (
            token.role === 'plain' ? token.text : <span key={index} className={`teadeck-code__${token.role}`}>{token.text}</span>
          ))}
        </code></pre>
      </div>
    </div>
  );
};
