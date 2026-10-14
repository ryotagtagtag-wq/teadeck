import { useMemo } from 'react';

import { useAppSelector } from '@/mastodon/store';

import type { ReplyAudience } from './reply_audience.ts';
import { effectiveReplyAudience, isReplyAudienceFeasible, replyAudiences, saveReplyAudience } from './reply_audience.ts';
import { t } from './i18n.ts';
import type { TextId } from './texts.ts';

// GoToSocial always lets mentioned accounts reply, whatever the policy says.
const replyAudienceLabels: Record<ReplyAudience, TextId> = {
  default: 'replyAudienceDefault',
  public: 'replyAudiencePublic',
  followers: 'replyAudienceFollowers',
  following: 'replyAudienceFollowing',
  mutuals: 'replyAudienceMutuals',
  mentioned: 'replyAudienceMentioned',
};

/** Shown when a post restricting replies was held back (see interactionPolicyFor). */
export function interactionDefaultsUnavailableMessage() {
  return t('replyAudienceDefaultsUnavailable');
}

/** The options for the post being written: which fit its visibility, and the one in effect. */
export function useReplyAudienceOptions(value: ReplyAudience) {
  const visibility = useAppSelector((state) => state.compose.get('privacy') as string);
  // The remembered choice, or its fallback while the visibility rules it out.
  const effective = effectiveReplyAudience(value, visibility);
  const options = useMemo(() => replyAudiences.map((audience) => {
    const feasible = isReplyAudienceFeasible(audience, visibility);
    return {
      audience,
      label: t(replyAudienceLabels[audience]),
      hint: feasible ? undefined : t(audience === 'public' ? 'replyAudienceOnlyPublic' : 'replyAudienceNotDirect'),
      disabled: !feasible,
      selected: audience === effective,
    };
  }), [visibility, effective]);
  return { effective, options };
}

/** Remembers the choice for the next posts and hands it to the form. */
export function chooseReplyAudience(audience: ReplyAudience, onChange: (value: ReplyAudience) => void) {
  saveReplyAudience(audience);
  onChange(audience);
}
