/**
 * Who may reply to a post (GoToSocial's interaction policies): the choices,
 * which fit a visibility, the policy sent with a post, and the choice kept
 * per account.
 */
import { readPreference, writePreference } from './storage.ts';

// `default` sends no policy, so the account's defaults apply. There is no "only me":
// GoToSocial always lets the author and mentioned accounts reply.
export type ReplyAudience = 'default' | 'public' | 'followers' | 'following' | 'mutuals' | 'mentioned';

export const replyAudiences: ReplyAudience[] = ['default', 'public', 'followers', 'following', 'mutuals', 'mentioned'];

export function replyAudienceFromStored(stored: unknown): ReplyAudience {
  return replyAudiences.includes(stored as ReplyAudience) ? stored as ReplyAudience : 'default';
}

/**
 * Whether GoToSocial accepts a policy value for a post of `visibility`; it
 * rejects the whole post otherwise.
 */
export function isReplyAudienceFeasible(value: string, visibility: string): boolean {
  if (value === 'public') return visibility === 'public' || visibility === 'unlisted';
  if (value === 'followers' || value === 'following') return visibility !== 'direct';
  return true;
}

/** The widest audience that fits the visibility. */
export function effectiveReplyAudience(audience: ReplyAudience, visibility: string): ReplyAudience {
  if (isReplyAudienceFeasible(audience, visibility)) return audience;
  return audience === 'public' ? 'default' : 'mentioned';
}

type PolicyRules = { automatic_approval?: unknown; manual_approval?: unknown };
type InteractionPolicyJSON = { can_favourite?: PolicyRules; can_reply?: PolicyRules; can_reblog?: PolicyRules };
/** `GET /api/v1/interaction_policies/defaults` (GoToSocial): the account's defaults per visibility. */
export type DefaultInteractionPolicies = Partial<Record<'public' | 'unlisted' | 'private' | 'direct', InteractionPolicyJSON>>;

let accountDefaults: DefaultInteractionPolicies | undefined;
let defaultsLoader: (() => Promise<DefaultInteractionPolicies | null>) | undefined;
let defaultsRequest: Promise<void> | undefined;

/** For tests; the app uses loadAccountInteractionDefaults. */
export function setAccountInteractionDefaults(defaults: DefaultInteractionPolicies | undefined) {
  accountDefaults = defaults;
  defaultsLoader = undefined;
  defaultsRequest = undefined;
}

function requestDefaults(loader: () => Promise<DefaultInteractionPolicies | null>) {
  const request = loader().then((defaults) => { accountDefaults = defaults ?? undefined; });
  // A failed load is retried by the next post that needs it.
  request.catch(() => { if (defaultsRequest === request) defaultsRequest = undefined; });
  return request;
}

/** `loader` resolves `null` when the server has no such endpoint; GoToSocial's own defaults apply then. */
export function loadAccountInteractionDefaults(loader: () => Promise<DefaultInteractionPolicies | null>) {
  accountDefaults = undefined;
  defaultsLoader = loader;
  defaultsRequest = requestDefaults(loader);
}

/** The account's defaults could not be loaded, so a restricting policy was not sent. */
export class InteractionDefaultsUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Could not load the account\'s default interaction policies', { cause });
    this.name = 'InteractionDefaultsUnavailableError';
  }
}

/**
 * The policy to send with a post. A restriction waits for the account's
 * defaults, since favourites and boosts are copied from them; without them the
 * post is not sent.
 */
export async function interactionPolicyFor(replyAudience: ReplyAudience, visibility: string) {
  if (effectiveReplyAudience(replyAudience, visibility) === 'default') return undefined;
  if (defaultsLoader) {
    defaultsRequest ??= requestDefaults(defaultsLoader);
    try { await defaultsRequest; } catch (error) { throw new InteractionDefaultsUnavailableError(error); }
  }
  return buildInteractionPolicy(replyAudience, visibility);
}

// Values GoToSocial accepts when creating a post; `me`, which it returns, is not one of them.
const policyValues = ['public', 'followers', 'following', 'mutuals', 'mentioned', 'author'];
function sendableValues(values: unknown, visibility: string): string[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is string => policyValues.includes(value) && isReplyAudienceFeasible(value, visibility));
}

/** GoToSocial's own favourite and boost defaults, for servers without account defaults. */
function serverDefaultRules(visibility: string) {
  switch (visibility) {
    case 'public':
    case 'unlisted':
      return { can_favourite: ['public'], can_reblog: ['public'] };
    case 'private':
      return { can_favourite: ['author', 'followers', 'mentioned'], can_reblog: ['author'] };
    default:
      return { can_favourite: ['author', 'mentioned'], can_reblog: ['author'] };
  }
}

function otherRules(visibility: string) {
  const own = accountDefaults?.[visibility as keyof DefaultInteractionPolicies];
  if (own?.can_favourite && own.can_reblog) {
    return {
      can_favourite: { automatic_approval: sendableValues(own.can_favourite.automatic_approval, visibility), manual_approval: sendableValues(own.can_favourite.manual_approval, visibility) },
      can_reblog: { automatic_approval: sendableValues(own.can_reblog.automatic_approval, visibility), manual_approval: sendableValues(own.can_reblog.manual_approval, visibility) },
    };
  }
  const fallback = serverDefaultRules(visibility);
  return {
    can_favourite: { automatic_approval: fallback.can_favourite, manual_approval: [] as string[] },
    can_reblog: { automatic_approval: fallback.can_reblog, manual_approval: [] as string[] },
  };
}

/**
 * `interaction_policy` for POST /api/v1/statuses. GoToSocial needs all three
 * rules once a policy is sent; only replies change, the rest follows the
 * account's defaults.
 */
export function buildInteractionPolicy(replyAudience: ReplyAudience, visibility: string) {
  const audience = effectiveReplyAudience(replyAudience, visibility);
  if (audience === 'default') return undefined;
  const rules = otherRules(visibility);
  return {
    can_favourite: rules.can_favourite,
    can_reply: { automatic_approval: [audience], manual_approval: [] as string[] },
    can_reblog: rules.can_reblog,
  };
}

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
