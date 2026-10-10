/**
 * Opening a post with its thread in an overlay in the middle of the window.
 *
 * With the setting on, a click on a post's time opens the overlay instead of
 * the post view. With it off, the time behaves as upstream's does, and each
 * post's action bar gets a button for the overlay. The setting takes effect at
 * once, in every post already on screen.
 */

import { useCallback, useSyncExternalStore } from 'react';

import { CornersOutIcon } from '@phosphor-icons/react';

import { openModal } from '@/mastodon/actions/modal';
import { IconButton } from '@/mastodon/components/button/redesign';
import { useAppDispatch } from '@/mastodon/store';

import { currentUiTextLocale, t } from './settings_strings';
import { readPreference, writePreference } from './storage';

const preferenceKey = 'statusOverlay';
const listeners = new Set<() => void>();

function readSetting(): boolean {
  try { return readPreference<unknown>(preferenceKey, false) === true; }
  catch { return false; }
}

let current: boolean | undefined;

export function statusOverlayEnabled(): boolean {
  current ??= readSetting();
  return current;
}

export function setStatusOverlayEnabled(enabled: boolean) {
  writePreference(preferenceKey, enabled);
  current = enabled;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function useStatusOverlayEnabled(): boolean {
  return useSyncExternalStore(subscribe, statusOverlayEnabled);
}

// Set while an overlay is open: posts opened meanwhile are shown in it.
let showInOverlay: ((statusId: string) => void) | undefined;

export function registerStatusOverlay(show: (statusId: string) => void) {
  showInOverlay = show;
  return () => { if (showInOverlay === show) showInOverlay = undefined; };
}

/** Shows the post in the open overlay; `false` when none is open. */
export function openInActiveStatusOverlay(statusId: string): boolean {
  if (!showInOverlay) return false;
  showInOverlay(statusId);
  return true;
}

function useOpenStatusOverlay() {
  const dispatch = useAppDispatch();
  return useCallback((statusId: string) => {
    if (openInActiveStatusOverlay(statusId)) return;
    dispatch(openModal({ modalType: 'TEADECK_STATUS', modalProps: { statusId } }));
  }, [dispatch]);
}

/**
 * For the link on a post's time: opens the overlay on a plain click while the
 * setting is on. A click with a modifier key or the middle button still opens
 * the link, in a new tab as before.
 */
export function useStatusTimeClick(statusId: string) {
  const enabled = useStatusOverlayEnabled();
  const open = useOpenStatusOverlay();
  return useCallback((event: React.MouseEvent) => {
    if (!enabled || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    open(statusId);
  }, [enabled, open, statusId]);
}

/** The action bar's button for the overlay; shown only while the setting is off. */
export const StatusOverlayButton: React.FC<{ statusId: string }> = ({ statusId }) => {
  const enabled = useStatusOverlayEnabled();
  const open = useOpenStatusOverlay();
  const handleClick = useCallback(() => { open(statusId); }, [open, statusId]);
  if (enabled) return null;
  return (
    <IconButton size='sm' variant='ghost' className='teadeck-status-overlay-button' icon={CornersOutIcon} onClick={handleClick}>
      {t('openInOverlay', currentUiTextLocale())}
    </IconButton>
  );
};
