/**
 * Markdown on or off for the post being written (when advertised by the instance).
 *
 * The switch starts on what the account is set to in GoToSocial
 * (`source.status_content_type`) and shows that state; a click overrides it for
 * this post. The override is remembered per account (status_format.ts), so the
 * next post starts the same way - unless it matches the account setting again,
 * in which case nothing is remembered and the setting keeps coming through.
 *
 * It sits in the row of compose buttons, next to the emoji picker, and looks
 * like the buttons around it: upstream's `.icon-button.inverted` with its
 * `active` state, so nothing is restyled here. Written out rather than using
 * `IconButton` because this one is a switch and says so (`aria-pressed`).
 */

import MarkdownIcon from './icons/markdown.svg?react';
import { Icon } from '@/mastodon/components/icon';

import type { StatusFormat } from './gotosocial';
import { effectiveStatusFormat, statusFormatChoice } from './gotosocial';
import { saveStatusFormat } from './status_format';
import type { UiTextLocale } from './settings_strings';
import { uiTextLocale } from './settings_strings';

// Follows the interface language like the settings page (German or English).
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
  const locale = uiTextLocale(document.documentElement.lang || 'en');
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
