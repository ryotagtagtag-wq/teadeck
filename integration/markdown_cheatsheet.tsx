/**
 * The Markdown cheat sheet, opened from the large composer's preview: what to
 * type, and next to it what it becomes, rendered like a post in the current design.
 */

import { forwardRef, useCallback } from 'react';

import { XIcon } from '@phosphor-icons/react';

import { IconButton } from '@/mastodon/components/button/redesign';

import { MarkdownView } from './large_composer.tsx';
import { t } from './i18n.ts';
import type { TextId } from './texts.ts';

// What each row is called, and the example typed in it.
const examples: [TextId, TextId][] = [
  ['markdownHelpHeading', 'markdownExampleHeading'],
  ['markdownHelpEmphasis', 'markdownExampleEmphasis'],
  ['markdownHelpLink', 'markdownExampleLink'],
  ['markdownHelpList', 'markdownExampleList'],
  ['markdownHelpNumbered', 'markdownExampleNumbered'],
  ['markdownHelpQuote', 'markdownExampleQuote'],
  ['markdownHelpCode', 'markdownExampleCode'],
  ['markdownHelpCodeBlock', 'markdownExampleCodeBlock'],
  ['markdownHelpRule', 'markdownExampleRule'],
  ['markdownHelpEscape', 'markdownExampleEscape'],
];

const MarkdownCheatsheet = forwardRef<HTMLDivElement, { onClose: (ignoreFocus?: boolean) => void }>(({ onClose }, ref) => {
  const close = useCallback(() => { onClose(); }, [onClose]);
  return (
    <div ref={ref} className='modal-root__modal teadeck-markdown-help' role='dialog' aria-modal='true' aria-labelledby='teadeck-markdown-help-title'>
      <header className='teadeck-markdown-help__header'>
        <h2 id='teadeck-markdown-help-title'>{t('markdownHelp')}</h2>
        <IconButton size='sm' variant='ghost' icon={XIcon} onClick={close}>{t('close')}</IconButton>
      </header>
      <div className='teadeck-markdown-help__body'>
        <p>{t('markdownHelpIntro')}</p>
        <dl>
          {examples.map(([label, example]) => (
            <div key={label} className='teadeck-markdown-help__row'>
              <dt>{t(label)}</dt>
              <dd><pre className='teadeck-markdown-help__source'>{t(example)}</pre></dd>
              <dd><MarkdownView source={t(example)} /></dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
});

MarkdownCheatsheet.displayName = 'MarkdownCheatsheet';

// eslint-disable-next-line import/no-default-export -- loaded through upstream's modal bundles
export default MarkdownCheatsheet;
