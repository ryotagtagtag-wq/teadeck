/**
 * Markdown on or off for the post being written. Starts on the account's
 * setting; a different choice is remembered per account.
 */

import { useCallback } from 'react';

import MarkdownIcon from './icons/markdown.svg?react';
import { setComposeContentType } from '@/mastodon/actions/compose_typed';
import { ToggleIconButton } from '@/mastodon/components/button/redesign';
import { useAppDispatch, useAppSelector } from '@/mastodon/store';

import { accountStatusContentType, statusFormatAvailable } from './server_features.ts';
import type { StatusFormat } from './status_format.ts';
import { accountStatusFormat, effectiveStatusFormat, saveStatusFormat, statusFormatChoice } from './status_format.ts';
import type { UiTextLocale } from './settings_strings.ts';
import { currentUiTextLocale } from './settings_strings.ts';

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

/** Next to the composer's emoji button; reads and sets the form's state itself. */
export const StatusFormatToggleButton: React.FC = () => {
  const value = useAppSelector((state) => state.compose.get('content_type', 'default') as StatusFormat);
  const dispatch = useAppDispatch();
  const accountDefault = accountStatusFormat(accountStatusContentType());
  const markdown = effectiveStatusFormat(value, accountDefault) === 'markdown';
  const toggle = useCallback(() => {
    const chosen = statusFormatChoice(markdown ? 'plain' : 'markdown', accountDefault);
    saveStatusFormat(chosen);
    dispatch(setComposeContentType(chosen));
  }, [markdown, accountDefault, dispatch]);
  if (!statusFormatAvailable()) return null;
  const locale = currentUiTextLocale();

  return (
    <ToggleIconButton
      size='sm'
      active={markdown}
      icon={MarkdownIcon}
      className='teadeck-status-format-toggle'
      data-value={markdown ? 'markdown' : 'plain'}
      onClick={toggle}
    >
      {`${texts[locale][markdown ? 'on' : 'off']} · ${texts[locale][value === 'default' ? 'accountDefault' : 'own']}`}
    </ToggleIconButton>
  );
};
