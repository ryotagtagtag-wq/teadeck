/**
 * Best-effort detection of a GoToSocial instance, used only to decide whether
 * to show the GoToSocial-specific "who can reply" compose control below.
 * Vanilla Mastodon has no such setting; sending it to a server that doesn't
 * understand it is harmless (an unknown JSON field), but showing the control
 * on non-GoToSocial servers would be misleading, hence the gate.
 *
 * Based on reading GoToSocial's source (`internal/api/model/instancev2.go`,
 * `internal/api/model/interactionpolicy.go`, `internal/api/model/status.go`
 * at github.com/superseriousbusiness/gotosocial), not verified against a
 * live GoToSocial instance. `source_url` is preferred over `version` because
 * GoToSocial can be configured to report a Mastodon-compatible version
 * string for client compatibility (`instance-inject-mastodon-version`),
 * which would otherwise defeat detection.
 */
export function detectGoToSocial(instance: { version?: string; source_url?: string }): boolean {
  const haystack = `${instance.source_url ?? ''} ${instance.version ?? ''}`.toLowerCase();
  return haystack.includes('gotosocial');
}

// `default`: send no interaction policy, so the account's own defaults apply (set in
// GoToSocial's settings); every other value restricts replies explicitly. No separate
// "only me": GoToSocial adds the author and mentioned accounts to every reply policy,
// so `author` would behave exactly like `mentioned`.
export type ReplyAudience = 'default' | 'public' | 'followers' | 'following' | 'mutuals' | 'mentioned';

export const replyAudiences: ReplyAudience[] = ['default', 'public', 'followers', 'following', 'mutuals', 'mentioned'];

/** Validates a stored choice; anything else means the account's own defaults. */
export function replyAudienceFromStored(stored: unknown): ReplyAudience {
  return replyAudiences.includes(stored as ReplyAudience) ? stored as ReplyAudience : 'default';
}

/**
 * Whether GoToSocial accepts `audience` in a policy for a post of `visibility`,
 * mirroring `PolicyValue.FeasibleForVisibility` in GoToSocial's
 * `internal/gtsmodel/interactionpolicy.go`: `public` needs a public or unlisted
 * post, followers/following at least followers-only; everything else always
 * fits. `default` sends nothing, so it always fits. A value that does not fit
 * makes GoToSocial reject the whole post with 400 ("policyURI … is not
 * feasible for visibility …").
 */
export function isReplyAudienceFeasible(audience: ReplyAudience, visibility: string): boolean {
  if (audience === 'public') return visibility === 'public' || visibility === 'unlisted';
  if (audience === 'followers' || audience === 'following') return visibility !== 'direct';
  return true;
}

/**
 * What is actually used while the visibility rules the choice out: "everyone"
 * becomes the account default, followers/following on a direct message the
 * accounts mentioned in it (the widest audience that still fits).
 */
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

/** Remembers the account's default interaction policies (tests; the app uses loadAccountInteractionDefaults). */
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

/**
 * Starts loading the account's default interaction policies (GoToSocial, at
 * startup; reload after changing them). `loader` resolves `null` when the
 * server has no such endpoint: then GoToSocial's own defaults are used.
 */
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
 * defaults: sending before they arrived would fill favourites and boosts with
 * GoToSocial's defaults, which can be wider than the account's. If they cannot
 * be loaded, this rejects with InteractionDefaultsUnavailableError instead of
 * guessing, and the post is not sent.
 */
export async function interactionPolicyFor(replyAudience: ReplyAudience, visibility: string) {
  if (effectiveReplyAudience(replyAudience, visibility) === 'default') return undefined;
  if (defaultsLoader) {
    defaultsRequest ??= requestDefaults(defaultsLoader);
    try { await defaultsRequest; } catch (error) { throw new InteractionDefaultsUnavailableError(error); }
  }
  return buildInteractionPolicy(replyAudience, visibility);
}

// Values GoToSocial accepts when creating a post (APIPolicyValueToPolicyValue); e.g. `me`,
// which it adds in responses, is rejected, and any value must fit the post's visibility.
const policyValues = ['public', 'followers', 'following', 'mutuals', 'mentioned', 'author'];
function sendableValues(values: unknown, visibility: string): string[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is string => policyValues.includes(value)
    && (value !== 'public' || visibility === 'public' || visibility === 'unlisted')
    && (!['followers', 'following'].includes(value) || visibility !== 'direct'));
}

/**
 * GoToSocial's own default favourite/boost rules per visibility
 * (`DefaultCanLikeFor`/`DefaultCanAnnounceFor` in the same file), used when
 * the server offers no account defaults. Unknown visibilities get the
 * strictest (direct) rules.
 */
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
 * GoToSocial's `interaction_policy` request shape for POST /api/v1/statuses
 * (`internal/api/model/interactionpolicy.go`: `can_favourite`/`can_reply`/
 * `can_reblog`, each `{ automatic_approval, manual_approval }`). GoToSocial
 * needs all three rules once a policy is sent; only replies are changed here,
 * favourites and boosts are taken from the account's defaults for the post's
 * visibility. Returns `undefined` for `default`: nothing is sent and the
 * account's defaults apply entirely.
 *
 * GoToSocial always lets mentioned accounts and the author reply
 * (`APIInteractionPolicyToInteractionPolicy` in `internal/typeutils/frontendtointernal.go`
 * adds both), whatever is sent.
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

/**
 * How GoToSocial parses the text of a post: as plain text or as Markdown
 * (`content_type` on POST/PUT /api/v1/statuses, values `text/plain` and
 * `text/markdown`; `internal/api/model/status.go`). Each account has its own
 * default, which GoToSocial reports as `source.status_content_type`
 * (`internal/api/model/source.go`) and applies when nothing is sent.
 *
 * `default` therefore means: send nothing, whatever the account is set to
 * applies - including a change made in GoToSocial's own settings after this
 * page was loaded. The other two values are an explicit choice for this post.
 */
export type StatusFormat = 'default' | 'plain' | 'markdown';

const contentTypes: Record<'plain' | 'markdown', string> = {
  plain: 'text/plain',
  markdown: 'text/markdown',
};

/** Validates a remembered choice; anything unknown falls back to the account's own setting. */
export function statusFormatFromStored(stored: unknown): StatusFormat {
  return stored === 'plain' || stored === 'markdown' || stored === 'default' ? stored : 'default';
}

/** The account's own setting, from `source.status_content_type`; plain text where it says nothing. */
export function accountStatusFormat(contentType: unknown): 'plain' | 'markdown' {
  return contentType === contentTypes.markdown ? 'markdown' : 'plain';
}

/** What a post is actually written in: the choice, or the account's setting where there is none. */
export function effectiveStatusFormat(chosen: StatusFormat, accountDefault: 'plain' | 'markdown'): 'plain' | 'markdown' {
  return chosen === 'default' ? accountDefault : chosen;
}

/**
 * The choice to remember for `format`: nothing of its own while it matches the
 * account's setting, so a later change there still comes through.
 */
export function statusFormatChoice(format: 'plain' | 'markdown', accountDefault: 'plain' | 'markdown'): StatusFormat {
  return format === accountDefault ? 'default' : format;
}

/** Explicit API advertisement, independent of the server's product/version name.
 * Both formats are required because the control switches between them.
 * Source: GoToSocial's InstanceConfigurationStatuses.supported_mime_types.
 */
export function supportsStatusFormat(instance: { configuration?: { statuses?: { supported_mime_types?: unknown } } }): boolean {
  const types = instance.configuration?.statuses?.supported_mime_types;
  return Array.isArray(types) && types.includes('text/markdown') && types.includes('text/plain');
}

/** `content_type` for a post; `undefined` for the account's own setting, which sends nothing. */
export function statusContentType(chosen: StatusFormat, supported: boolean): string | undefined {
  if (!supported) return undefined;
  return chosen === 'default' ? undefined : contentTypes[chosen];
}

/** The format an existing post was written in, from `GET /api/v1/statuses/:id/source`. */
export function statusFormatOfSource(contentType: unknown): StatusFormat {
  if (contentType === contentTypes.markdown) return 'markdown';
  if (contentType === contentTypes.plain) return 'plain';
  return 'default'; // Older GoToSocial versions omit it; keep the account's setting.
}
