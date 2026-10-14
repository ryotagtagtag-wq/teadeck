/**
 * The overlay itself: upstream's post view with its thread, in a large panel
 * in the middle of the window. Opened through status_overlay.tsx.
 */

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';

import { useHistory } from 'react-router-dom';

import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import { IconButton } from '@/mastodon/components/icon_button';
import { StatusPage } from '@/mastodon/features/status/redesign';
import { useAppSelector } from '@/mastodon/store';

import { t } from './i18n.ts';
import { registerStatusOverlay } from './status_overlay.tsx';

type ComposeState = { get: (key: string) => unknown };
type StatusesState = { getIn: (path: string[]) => unknown };

const StatusOverlayModal = forwardRef<HTMLDivElement, { statusId: string; onClose: (ignoreFocus?: boolean) => void }>(({ statusId: openedId, onClose }, ref) => {
  const history = useHistory();
  // Posts opened from inside the overlay ("Read more", the thread) are shown here too.
  const [statusId, setStatusId] = useState(openedId);
  useEffect(() => registerStatusOverlay(setStatusId), []);

  // Modals close by themselves only when going back; following a link leaves the overlay too.
  useEffect(() => {
    const opened = history.location.pathname;
    return history.listen((location) => {
      if (location.pathname !== opened) onClose(true);
    });
  }, [history, onClose]);

  // A reply (or mention) started here goes to the compose form behind the
  // overlay: leave the overlay, show the replied-to post and focus the form.
  const composeFocus = useAppSelector((state) => (state.compose as ComposeState).get('focusDate'));
  const replyTo = useAppSelector((state) => (state.compose as ComposeState).get('in_reply_to') as string | null);
  const replyAcct = useAppSelector((state) => {
    if (!replyTo) return undefined;
    const accountId = (state.statuses as StatusesState).getIn([replyTo, 'account']) as string | undefined;
    return accountId ? (state.accounts as StatusesState).getIn([accountId, 'acct']) as string | undefined : undefined;
  });
  const focusAtOpen = useRef(composeFocus);
  useEffect(() => {
    if (composeFocus === focusAtOpen.current) return;
    const path = replyTo && replyAcct ? `/@${replyAcct}/${replyTo}` : undefined;
    // No focus target: the composer keeps the focus, not the page's heading.
    if (path && history.location.pathname.replace(/^\/deck(?=\/)/, '') !== path) history.push(path, { focusTarget: false });
    else onClose(true);
    focusComposerAfterOverlay();
  }, [composeFocus, replyTo, replyAcct, history, onClose]);

  // Without the click event: onClose takes its first argument as "ignore focus".
  const close = useCallback(() => { onClose(); }, [onClose]);

  return (
    <div ref={ref} className='modal-root__modal teadeck-status-overlay' role='dialog' aria-modal='true'>
      {/* Its own scroll key: a post view may already be open behind the overlay. */}
      <StatusPage statusId={statusId} multiColumn scrollKey='teadeck-status-overlay' withBackButton={false} />
      <IconButton className='teadeck-status-overlay__close' title={t('close')} icon='times' iconComponent={CloseIcon} onClick={close} />
    </div>
  );
});

StatusOverlayModal.displayName = 'StatusOverlayModal';

/**
 * The redesigned composer is already open (it focused itself while the page
 * was inert) and doesn't follow focusCompose(), so its text field is focused
 * once the overlay is gone, after the modal root has restored the old focus.
 */
function focusComposerAfterOverlay(tries = 30) {
  const field = document.querySelector<HTMLTextAreaElement>('form[role="dialog"] textarea');
  if (field && !document.querySelector('.teadeck-status-overlay')) {
    setTimeout(() => { field.focus(); }, 0);
  } else if (tries > 0) {
    setTimeout(() => { focusComposerAfterOverlay(tries - 1); }, 30);
  }
}

// eslint-disable-next-line import/no-default-export -- loaded through upstream's modal bundles
export default StatusOverlayModal;
