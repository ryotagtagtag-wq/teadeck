/** The text format last chosen for posts, per account. */

import type { StatusFormat } from './gotosocial.ts';
import { statusFormatFromStored } from './gotosocial.ts';
import { readPreference, writePreference } from './storage.ts';

const key = 'statusFormat.v1';

export function loadStatusFormat(): StatusFormat {
  try {
    return statusFormatFromStored(readPreference<unknown>(key, null));
  } catch {
    return 'default';
  }
}

export function saveStatusFormat(format: StatusFormat) {
  writePreference(key, format);
}
