/**
 * Whether a post is written as plain text or Markdown (`content_type`), and
 * the choice kept per account.
 */
import { readPreference, writePreference } from './storage.ts';

/**
 * Plain text or Markdown (`content_type`). `default` sends nothing, so the
 * account's setting (`source.status_content_type`) applies.
 */
export type StatusFormat = 'default' | 'plain' | 'markdown';

const contentTypes: Record<'plain' | 'markdown', string> = {
  plain: 'text/plain',
  markdown: 'text/markdown',
};

export function statusFormatFromStored(stored: unknown): StatusFormat {
  return stored === 'plain' || stored === 'markdown' || stored === 'default' ? stored : 'default';
}

export function accountStatusFormat(contentType: unknown): 'plain' | 'markdown' {
  return contentType === contentTypes.markdown ? 'markdown' : 'plain';
}

export function effectiveStatusFormat(chosen: StatusFormat, accountDefault: 'plain' | 'markdown'): 'plain' | 'markdown' {
  return chosen === 'default' ? accountDefault : chosen;
}

/** Nothing is remembered while the choice matches the account's setting. */
export function statusFormatChoice(format: 'plain' | 'markdown', accountDefault: 'plain' | 'markdown'): StatusFormat {
  return format === accountDefault ? 'default' : format;
}

export function statusContentType(chosen: StatusFormat, supported: boolean): string | undefined {
  if (!supported) return undefined;
  return chosen === 'default' ? undefined : contentTypes[chosen];
}

export function statusFormatOfSource(contentType: unknown): StatusFormat {
  if (contentType === contentTypes.markdown) return 'markdown';
  if (contentType === contentTypes.plain) return 'plain';
  return 'default';
}

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
