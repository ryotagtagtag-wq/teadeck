/**
 * Markdown on or off for the post being written. Starts on the account's
 * setting; a different choice is remembered per account. A plain button
 * rather than IconButton, so it can carry `aria-pressed`.
 */

import MarkdownIcon from './icons/markdown.svg?react';
import { Icon } from '@/mastodon/components/icon';

import type { StatusFormat } from './gotosocial';
import { effectiveStatusFormat, statusFormatChoice } from './gotosocial';
import { saveStatusFormat } from './status_format';
import type { UiTextLocale } from './settings_strings';
import { currentUiTextLocale } from './settings_strings';

const texts: Record<UiTextLocale, { on: string; off: string; accountDefault: string; own: string }> = {
  de: {
    on: 'Text als Markdown: an',
    off: 'Text als Markdown: aus',
    accountDefault: 'Kontostandard',
    own: 'eigene Wahl, wird gemerkt',
  },
  en: {
    on: 'Text as Markdown: on',
    off: 'Text as Markdown: off',
    accountDefault: 'account default',
    own: 'your own choice, remembered',
  },
};

export const StatusFormatToggle: React.FC<{
  value: StatusFormat;
  accountDefault: 'plain' | 'markdown';
  onChange: (value: StatusFormat) => void;
}> = ({ value, accountDefault, onChange }) => {
  const locale = currentUiTextLocale();
  const format = effectiveStatusFormat(value, accountDefault);
  const markdown = format === 'markdown';
  const title = `${texts[locale][markdown ? 'on' : 'off']} · ${texts[locale][value === 'default' ? 'accountDefault' : 'own']}`;

  const toggle = () => {
    const chosen = statusFormatChoice(markdown ? 'plain' : 'markdown', accountDefault);
    saveStatusFormat(chosen);
    onChange(chosen);
  };

  return (
    <button
      type='button'
      className={`icon-button inverted teadeck-status-format-toggle${markdown ? ' active' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={markdown}
      data-value={format}
      onClick={toggle}
    >
      <Icon id='markdown' icon={MarkdownIcon} />
    </button>
  );
};
