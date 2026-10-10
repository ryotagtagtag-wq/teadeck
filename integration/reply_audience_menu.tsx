/**
 * "Who can reply" in the redesigned composer: a group in its settings menu,
 * next to "Who can quote". Only for GoToSocial. Kept apart from
 * reply_audience_picker.tsx, which actions/compose.js imports: the menu
 * components must not enter the store's module graph.
 */

import { useCallback } from 'react';

import { setComposeReplyAudience } from '@/mastodon/actions/compose_typed';
import { MenuItemDivider, MenuItemGroup, MenuItemRadio } from '@/mastodon/components/menu';
import { initialState } from '@/mastodon/initial_state';
import { useAppDispatch, useAppSelector } from '@/mastodon/store';

import type { ReplyAudience } from './gotosocial';
import { effectiveReplyAudience, isReplyAudienceFeasible, replyAudiences } from './gotosocial';
import { saveReplyAudience } from './reply_audience';
import { replyAudienceLabels, replyAudienceTexts } from './reply_audience_picker';
import { currentUiTextLocale } from './settings_strings';

export const ReplyAudienceMenuGroup: React.FC = () => {
  const visibility = useAppSelector((state) => state.compose.get('privacy') as string);
  const value = useAppSelector((state) => state.compose.get('reply_audience', 'default') as ReplyAudience);
  const dispatch = useAppDispatch();
  const onChange = useCallback(({ value: audience }: { value: string }) => {
    saveReplyAudience(audience as ReplyAudience);
    dispatch(setComposeReplyAudience(audience as ReplyAudience));
  }, [dispatch]);
  if (!(initialState?.meta as { teadeck_gotosocial?: boolean } | undefined)?.teadeck_gotosocial) return null;
  const locale = currentUiTextLocale();
  const effective = effectiveReplyAudience(value, visibility);

  return (
    <div className='teadeck-reply-audience-picker' data-value={effective} style={{ display: 'contents' }}>
      <MenuItemGroup label={replyAudienceTexts[locale].title}>
        {replyAudiences.map((audience) => {
          const feasible = isReplyAudienceFeasible(audience, visibility);
          return (
            <MenuItemRadio
              key={audience}
              name='teadeck_reply_audience'
              value={audience}
              checked={audience === effective}
              disabled={!feasible}
              description={feasible ? undefined : replyAudienceTexts[locale][audience === 'public' ? 'onlyPublic' : 'notDirect']}
              onChange={onChange}
              keepMenuOpenOnClick
            >
              {replyAudienceLabels[locale][audience].long}
            </MenuItemRadio>
          );
        })}
      </MenuItemGroup>
      <MenuItemDivider />
    </div>
  );
};
