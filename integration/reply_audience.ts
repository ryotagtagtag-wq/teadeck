import type { ReplyAudience } from './gotosocial.ts';
import { replyAudienceFromStored } from './gotosocial.ts';
import { readPreference, writePreference } from './storage.ts';

const key = 'replyAudience.v2';

/** The reply audience last picked for this account, so new posts keep it; the account default until something was chosen. */
export function loadReplyAudience(): ReplyAudience {
  try {
    return replyAudienceFromStored(readPreference<unknown>(key, null));
  } catch { return 'default'; } // No account session (yet).
}

export function saveReplyAudience(audience: ReplyAudience) {
  writePreference(key, audience);
}
