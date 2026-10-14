import { useMemo } from 'react';

import { useAppSelector } from '@/mastodon/store';

import type { ReplyAudience } from './gotosocial.ts';
import { effectiveReplyAudience, isReplyAudienceFeasible, replyAudiences } from './gotosocial.ts';
import { saveReplyAudience } from './reply_audience.ts';
import type { UiTextLocale } from './settings_strings.ts';
import { currentUiTextLocale } from './settings_strings.ts';

// GoToSocial always lets mentioned accounts reply, whatever the policy says.
const replyAudienceLabels: Record<UiTextLocale, Record<ReplyAudience, string>> = {
  de: {
    default: 'Kontostandard (in GoToSocial eingestellt)',
    public: 'Alle',
    followers: 'Nur Follower und Erwähnte',
    following: 'Nur Accounts, denen ich folge, und Erwähnte',
    mutuals: 'Nur gegenseitige Follower und Erwähnte',
    mentioned: 'Nur erwähnte Accounts',
  },
  en: {
    default: 'Account default (set in GoToSocial)',
    public: 'Everyone',
    followers: 'Only followers and mentioned accounts',
    following: 'Only accounts I follow, and mentioned accounts',
    mutuals: 'Only mutual followers and mentioned accounts',
    mentioned: 'Only mentioned accounts',
  },
};

export const replyAudienceTexts = {
  de: {
    title: 'Wer darf antworten', onlyPublic: 'Nur bei öffentlichen oder nicht gelisteten Beiträgen', notDirect: 'Bei direkten Nachrichten nicht möglich',
    defaultsUnavailable: 'Die Interaktions-Standards deines Kontos ließen sich nicht laden. Der Beitrag wurde nicht gesendet, damit Favorisieren und Teilen nicht weiter erlaubt werden als eingestellt. Bitte erneut versuchen.',
  },
  en: {
    title: 'Who can reply', onlyPublic: 'Only for public or unlisted posts', notDirect: 'Not possible for direct messages',
    defaultsUnavailable: 'Your account\'s default interaction settings could not be loaded. The post was not sent, so favourites and boosts are not opened up beyond your settings. Please try again.',
  },
};

/** Shown when a post restricting replies was held back (see interactionPolicyFor). */
export function interactionDefaultsUnavailableMessage() {
  return replyAudienceTexts[currentUiTextLocale()].defaultsUnavailable;
}

/** The options for the post being written: which fit its visibility, and the one in effect. */
export function useReplyAudienceOptions(value: ReplyAudience) {
  const visibility = useAppSelector((state) => state.compose.get('privacy') as string);
  const locale = currentUiTextLocale();
  // The remembered choice, or its fallback while the visibility rules it out.
  const effective = effectiveReplyAudience(value, visibility);
  const options = useMemo(() => replyAudiences.map((audience) => {
    const feasible = isReplyAudienceFeasible(audience, visibility);
    return {
      audience,
      label: replyAudienceLabels[locale][audience],
      hint: feasible ? undefined : replyAudienceTexts[locale][audience === 'public' ? 'onlyPublic' : 'notDirect'],
      disabled: !feasible,
      selected: audience === effective,
    };
  }), [visibility, effective, locale]);
  return { effective, options, locale };
}

/** Remembers the choice for the next posts and hands it to the form. */
export function chooseReplyAudience(audience: ReplyAudience, onChange: (value: ReplyAudience) => void) {
  saveReplyAudience(audience);
  onChange(audience);
}
