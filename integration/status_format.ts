/**
 * The text format last chosen for posts, kept per account like the reply
 * audience next to it (reply_audience.ts).
 *
 * Only an actual override is stored: while the choice matches what the account
 * is set to in GoToSocial, nothing of its own is kept ("default"), so changing
 * the setting there still reaches new posts here.
 */

import type { StatusFormat } from './gotosocial.ts';
import { statusFormatFromStored } from './gotosocial.ts';
import { readPreference, writePreference } from './storage.ts';

const key = 'statusFormat.v1';

/** The format new posts start in; the account's own setting until something was chosen. */
export function loadStatusFormat(): StatusFormat {
  try {
    return statusFormatFromStored(readPreference<unknown>(key, null));
  } catch {
    return 'default'; // No account session (yet).
  }
}

export function saveStatusFormat(format: StatusFormat) {
  writePreference(key, format);
}
