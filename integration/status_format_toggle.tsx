/**
 * Markdown on or off for the post being written. Starts on the account's
 * setting; a different choice is remembered per account. A plain button
 * rather than IconButton, so it can carry `aria-pressed`.
 */

import { useCallback } from 'react';

import MarkdownIcon from './icons/markdown.svg?react';
import { setComposeContentType } from '@/mastodon/actions/compose_typed';
import { ToggleIconButton } from '@/mastodon/components/button/redesign';
import { Icon } from '@/mastodon/components/icon';
import { initialState } from '@/mastodon/initial_state';
import { useAppDispatch, useAppSelector } from '@/mastodon/store';

import type { StatusFormat } from './gotosocial';
import { accountStatusFormat, effectiveStatusFormat, statusFormatChoice } from './gotosocial';
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

/** What both switches show and do: the format in effect, its label, and the switch to the other one. */
function useStatusFormatSwitch(value: StatusFormat, accountDefault: 'plain' | 'markdown', onChange: (value: StatusFormat) => void) {
  const locale = currentUiTextLocale();
  const format = effectiveStatusFormat(value, accountDefault);
  const markdown = format === 'markdown';
  const title = `${texts[locale][markdown ? 'on' : 'off']} · ${texts[locale][value === 'default' ? 'accountDefault' : 'own']}`;
  const toggle = useCallback(() => {
    const chosen = statusFormatChoice(markdown ? 'plain' : 'markdown', accountDefault);
    saveStatusFormat(chosen);
    onChange(chosen);
  }, [markdown, accountDefault, onChange]);
  return { format, markdown, title, toggle };
}

export const StatusFormatToggle: React.FC<{
  value: StatusFormat;
  accountDefault: 'plain' | 'markdown';
  onChange: (value: StatusFormat) => void;
}> = ({ value, accountDefault, onChange }) => {
  const { format, markdown, title, toggle } = useStatusFormatSwitch(value, accountDefault, onChange);

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

/** The redesigned composer's version, next to its emoji button; reads and sets the form's state itself. */
export const StatusFormatToggleButton: React.FC = () => {
  const value = useAppSelector((state) => state.compose.get('content_type', 'default') as StatusFormat);
  const dispatch = useAppDispatch();
  const onChange = useCallback((chosen: StatusFormat) => { dispatch(setComposeContentType(chosen)); }, [dispatch]);
  const meta = initialState?.meta as { teadeck_status_format?: boolean; teadeck_status_content_type?: unknown } | undefined;
  const { format, markdown, title, toggle } = useStatusFormatSwitch(value, accountStatusFormat(meta?.teadeck_status_content_type), onChange);
  if (!meta?.teadeck_status_format) return null;

  return (
    <ToggleIconButton
      size='sm'
      active={markdown}
      icon={MarkdownIcon}
      className='teadeck-status-format-toggle'
      data-value={format}
      onClick={toggle}
    >
      {title}
    </ToggleIconButton>
  );
};
