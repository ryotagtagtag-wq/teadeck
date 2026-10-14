/**
 * "Who can reply" in the redesigned composer: a group in its settings menu,
 * next to "Who can quote". Only for GoToSocial. Kept apart from
 * reply_audience_picker.tsx, which actions/compose.js imports: the menu
 * components must not enter the store's module graph.
 */

import { useCallback } from 'react';

import { setComposeReplyAudience } from '@/mastodon/actions/compose_typed';
import { MenuItemDivider, MenuItemGroup, MenuItemRadio } from '@/mastodon/components/menu';
import { useAppDispatch, useAppSelector } from '@/mastodon/store';

import type { ReplyAudience } from './reply_audience.ts';
import { isGoToSocial } from './server_features.ts';
import { t } from './i18n.ts';
import { chooseReplyAudience, useReplyAudienceOptions } from './reply_audience_picker.tsx';

export const ReplyAudienceMenuGroup: React.FC = () => {
  const value = useAppSelector((state) => state.compose.get('reply_audience', 'default') as ReplyAudience);
  const dispatch = useAppDispatch();
  const onChange = useCallback(({ value: audience }: { value: string }) => {
    chooseReplyAudience(audience as ReplyAudience, (chosen) => dispatch(setComposeReplyAudience(chosen)));
  }, [dispatch]);
  const { effective, options } = useReplyAudienceOptions(value);
  if (!isGoToSocial()) return null;

  return (
    <div className='teadeck-reply-audience-picker' data-value={effective}>
      <MenuItemGroup label={t('replyAudienceTitle')}>
        {options.map((option) => (
          <MenuItemRadio
            key={option.audience}
            name='teadeck_reply_audience'
            value={option.audience}
            checked={option.selected}
            disabled={option.disabled}
            description={option.hint}
            onChange={onChange}
            keepMenuOpenOnClick
          >
            {option.label}
          </MenuItemRadio>
        ))}
      </MenuItemGroup>
      <MenuItemDivider />
    </div>
  );
};
