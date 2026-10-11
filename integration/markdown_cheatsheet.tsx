/**
 * The Markdown cheat sheet, opened from the large composer's preview: what to
 * type, and next to it what it becomes, rendered like a post in the current design.
 */

import { forwardRef, useCallback } from 'react';

import { XIcon } from '@phosphor-icons/react';

import { IconButton } from '@/mastodon/components/button/redesign';

import { MarkdownView } from './large_composer';
import type { SettingsStringKey, UiTextLocale } from './settings_strings';
import { currentUiTextLocale, t } from './settings_strings';

const examples: Record<UiTextLocale, [SettingsStringKey, string][]> = {
  de: [
    ['markdownHelpHeading', '# Überschrift\n## Kleinere Überschrift'],
    ['markdownHelpEmphasis', '**fett**, *kursiv*, ~~durchgestrichen~~'],
    ['markdownHelpLink', '[Teadeck](https://teadeck.de)\nhttps://teadeck.de'],
    ['markdownHelpList', '- Tee\n- Kanne\n  - Deckel'],
    ['markdownHelpNumbered', '1. Wasser kochen\n2. Tee ziehen lassen'],
    ['markdownHelpQuote', '> Ein Zitat'],
    ['markdownHelpCode', 'Mit `npm test` prüfen'],
    ['markdownHelpCodeBlock', '```js\nconst tea = "Assam";\n```'],
    ['markdownHelpRule', 'oben\n\n---\n\nunten'],
    ['markdownHelpEscape', '\\*kein Stern\\*'],
  ],
  en: [
    ['markdownHelpHeading', '# Heading\n## Smaller heading'],
    ['markdownHelpEmphasis', '**bold**, *italic*, ~~struck through~~'],
    ['markdownHelpLink', '[Teadeck](https://teadeck.de)\nhttps://teadeck.de'],
    ['markdownHelpList', '- Tea\n- Pot\n  - Lid'],
    ['markdownHelpNumbered', '1. Boil water\n2. Let the tea steep'],
    ['markdownHelpQuote', '> A quote'],
    ['markdownHelpCode', 'Check with `npm test`'],
    ['markdownHelpCodeBlock', '```js\nconst tea = "Assam";\n```'],
    ['markdownHelpRule', 'above\n\n---\n\nbelow'],
    ['markdownHelpEscape', '\\*no star\\*'],
  ],
};

const MarkdownCheatsheet = forwardRef<HTMLDivElement, { onClose: (ignoreFocus?: boolean) => void }>(({ onClose }, ref) => {
  const locale = currentUiTextLocale();
  const close = useCallback(() => { onClose(); }, [onClose]);
  return (
    <div ref={ref} className='modal-root__modal teadeck-markdown-help' role='dialog' aria-modal='true' aria-labelledby='teadeck-markdown-help-title'>
      <header className='teadeck-markdown-help__header'>
        <h2 id='teadeck-markdown-help-title'>{t('markdownHelp', locale)}</h2>
        <IconButton size='sm' variant='ghost' icon={XIcon} onClick={close}>{t('close', locale)}</IconButton>
      </header>
      <div className='teadeck-markdown-help__body'>
        <p>{t('markdownHelpIntro', locale)}</p>
        <dl>
          {examples[locale].map(([label, source]) => (
            <div key={label} className='teadeck-markdown-help__row'>
              <dt>{t(label, locale)}</dt>
              <dd><pre className='teadeck-markdown-help__source'>{source}</pre></dd>
              <dd><MarkdownView source={source} /></dd>
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
