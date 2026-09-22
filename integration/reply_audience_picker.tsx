import { useMemo } from 'react';

import ReplyIcon from '@/material-icons/400-24px/reply.svg?react';
import { Dropdown } from '@/mastodon/components/dropdown_menu';
import { Icon } from '@/mastodon/components/icon';
import { useAppSelector } from '@/mastodon/store';

import type { ReplyAudience } from './gotosocial';
import { effectiveReplyAudience, isReplyAudienceFeasible, replyAudiences } from './gotosocial';
import { saveReplyAudience } from './reply_audience';
import type { UiTextLocale } from './settings_strings';
import { uiTextLocale } from './settings_strings';

// Follows the interface language like the settings page (German or English; see settings_strings.ts).
// GoToSocial always lets mentioned accounts reply, whatever the policy says.
const labels: Record<UiTextLocale, Record<ReplyAudience, { short: string; long: string }>> = {
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

const texts = {
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
  return texts[uiTextLocale(document.documentElement.lang || 'en')].defaultsUnavailable;
}

/** Same pill-and-menu look as the visibility and language buttons next to it. */
export const ReplyAudiencePicker: React.FC<{
  value: ReplyAudience;
  onChange: (value: ReplyAudience) => void;
}> = ({ value, onChange }) => {
  const visibility = useAppSelector((state) => state.compose.get('privacy') as string);
  const locale = uiTextLocale(document.documentElement.lang || 'en');
  // Shown and sent: the remembered choice, or its fallback while the visibility rules it out.
  const effective = effectiveReplyAudience(value, visibility);
  const items = useMemo(
    () => replyAudiences.map((audience) => {
      const feasible = isReplyAudienceFeasible(audience, visibility);
      return {
        text: labels[locale][audience].long,
        description: feasible ? undefined : texts[locale][audience === 'public' ? 'onlyPublic' : 'notDirect'],
        disabled: !feasible,
        highlighted: audience === effective,
        action: () => {
          saveReplyAudience(audience);
          onChange(audience);
        },
      };
    }),
    [visibility, effective, onChange, locale],
  );
  const title = `${texts[locale].title}: ${labels[locale][effective].long}`;

  return (
    <Dropdown items={items} placement='bottom-start' title={title}>
      <button type='button' className='dropdown-button teadeck-reply-audience-picker' title={title} data-value={effective}>
        <Icon id='reply' icon={ReplyIcon} />
        <span className='dropdown-button__label'>{labels[locale][effective].short}</span>
      </button>
    </Dropdown>
  );
};
