import { useMemo } from 'react';

import ReplyIcon from '@/material-icons/400-24px/reply.svg?react';
import { Dropdown } from '@/mastodon/components/dropdown_menu';
import { Icon } from '@/mastodon/components/icon';
import { useAppSelector } from '@/mastodon/store';

import type { ReplyAudience } from './gotosocial';
import { effectiveReplyAudience, isReplyAudienceFeasible, replyAudiences } from './gotosocial';
import { saveReplyAudience } from './reply_audience';
import type { UiTextLocale } from './settings_strings';
import { currentUiTextLocale } from './settings_strings';

// GoToSocial always lets mentioned accounts reply, whatever the policy says.
export const replyAudienceLabels: Record<UiTextLocale, Record<ReplyAudience, { short: string; long: string }>> = {
  de: {
    default: { short: 'Standard', long: 'Kontostandard (in GoToSocial eingestellt)' },
    public: { short: 'Alle', long: 'Alle' },
    followers: { short: 'Follower', long: 'Nur Follower und Erwähnte' },
    following: { short: 'Folge ich', long: 'Nur Accounts, denen ich folge, und Erwähnte' },
    mutuals: { short: 'Gegenseitig', long: 'Nur gegenseitige Follower und Erwähnte' },
    mentioned: { short: 'Erwähnte', long: 'Nur erwähnte Accounts' },
  },
  en: {
    default: { short: 'Default', long: 'Account default (set in GoToSocial)' },
    public: { short: 'Everyone', long: 'Everyone' },
    followers: { short: 'Followers', long: 'Only followers and mentioned accounts' },
    following: { short: 'Following', long: 'Only accounts I follow, and mentioned accounts' },
    mutuals: { short: 'Mutuals', long: 'Only mutual followers and mentioned accounts' },
    mentioned: { short: 'Mentioned', long: 'Only mentioned accounts' },
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
      label: replyAudienceLabels[locale][audience].long,
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

export const ReplyAudiencePicker: React.FC<{
  value: ReplyAudience;
  onChange: (value: ReplyAudience) => void;
}> = ({ value, onChange }) => {
  const { effective, options, locale } = useReplyAudienceOptions(value);
  const items = useMemo(() => options.map((option) => ({
    text: option.label,
    description: option.hint,
    disabled: option.disabled,
    highlighted: option.selected,
    action: () => { chooseReplyAudience(option.audience, onChange); },
  })), [options, onChange]);
  const title = `${replyAudienceTexts[locale].title}: ${replyAudienceLabels[locale][effective].long}`;

  return (
    <Dropdown items={items} placement='bottom-start' title={title}>
      <button type='button' className='dropdown-button teadeck-reply-audience-picker' title={title} data-value={effective}>
        <Icon id='reply' icon={ReplyIcon} />
        <span className='dropdown-button__label'>{replyAudienceLabels[locale][effective].short}</span>
      </button>
    </Dropdown>
  );
};
