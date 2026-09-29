/**
 * The overlay itself: upstream's post view with its thread, in a large panel
 * in the middle of the window. Opened through status_overlay.tsx.
 */

import { forwardRef, useCallback, useEffect, useState } from 'react';

import { useHistory } from 'react-router-dom';

import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import { IconButton } from '@/mastodon/components/icon_button';
import Status from '@/mastodon/features/status';

import { currentUiTextLocale, t } from './settings_strings';
import { registerStatusOverlay } from './status_overlay';

// Upstream's post view takes the post from its route; here it is given directly.
const StatusView = Status as unknown as React.ComponentType<{ params: { statusId: string }; multiColumn: boolean }>;

const StatusOverlayModal = forwardRef<HTMLDivElement, { statusId: string; onClose: () => void }>(({ statusId: openedId, onClose }, ref) => {
  const history = useHistory();
  // Posts opened from inside the overlay ("Read more", the thread) are shown here too.
  const [statusId, setStatusId] = useState(openedId);
  useEffect(() => registerStatusOverlay(setStatusId), []);

  // Modals close by themselves only when going back; following a link leaves the overlay too.
  useEffect(() => {
    const opened = history.location.pathname;
    return history.listen((location) => {
      if (location.pathname !== opened) onClose();
    });
  }, [history, onClose]);

  // Without the click event: upstream's onClose takes its first argument as "ignore focus".
  const close = useCallback(() => { onClose(); }, [onClose]);

  return (
    <div ref={ref} className='modal-root__modal teadeck-status-overlay' role='dialog' aria-modal='true'>
      <StatusView params={{ statusId }} multiColumn />
      <IconButton className='teadeck-status-overlay__close' title={t('close', currentUiTextLocale())} icon='times' iconComponent={CloseIcon} onClick={close} />
    </div>
  );
});

StatusOverlayModal.displayName = 'StatusOverlayModal';

// eslint-disable-next-line import/no-default-export -- loaded through upstream's modal bundles
export default StatusOverlayModal;
