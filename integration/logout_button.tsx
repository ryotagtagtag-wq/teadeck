import { useCallback } from 'react';

import { FormattedMessage } from 'react-intl';

import LogoutIcon from '@/material-icons/400-24px/logout.svg?react';
import { openModal } from '@/mastodon/actions/modal';
import { Icon } from '@/mastodon/components/icon';
import { useAppDispatch } from '@/mastodon/store';

/**
 * "Abmelden" in the navigation list, below "Einstellungen" and "Mehr", in both
 * layouts; looks like the entries above it and confirms first, like upstream's
 * own sign-out item in the "Mehr" menu.
 */
export const LogoutNavigationLink: React.FC = () => {
  const dispatch = useAppDispatch();
  const handleClick = useCallback(() => {
    dispatch(openModal({ modalType: 'CONFIRM_LOG_OUT', modalProps: {} }));
  }, [dispatch]);

  return (
    <button type='button' className='column-link column-link--transparent teadeck-logout' onClick={handleClick}>
      <Icon id='sign-out' icon={LogoutIcon} className='column-link__icon' />
      <FormattedMessage id='navigation_bar.logout' defaultMessage='Logout' />
    </button>
  );
};
