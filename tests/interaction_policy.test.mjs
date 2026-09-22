import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildInteractionPolicy,
  InteractionDefaultsUnavailableError,
  interactionPolicyFor,
  loadAccountInteractionDefaults,
  effectiveReplyAudience,
  isReplyAudienceFeasible,
  replyAudienceFromStored,
  replyAudiences,
  setAccountInteractionDefaults,
} from '../integration/gotosocial.ts';

// Transcribed from GoToSocial's PolicyValue.FeasibleForVisibility
// (internal/gtsmodel/interactionpolicy.go); API visibility names map as
// public→public, unlisted→unlocked, private→followers-only, direct→direct.
function feasibleForGoToSocial(value, visibility) {
  switch (value) {
    case 'author': case 'mentioned': return true;
    case 'followers': case 'following': return ['private', 'public', 'unlisted'].includes(visibility);
    case 'public': return ['unlisted', 'public'].includes(visibility);
    default: return true;
  }
}

const visibilities = ['public', 'unlisted', 'private', 'direct'];

test('every policy Teadeck sends passes GoToSocial\'s visibility check (the 400 "not feasible for visibility")', () => {
  for (const visibility of visibilities) {
    for (const audience of replyAudiences) {
      const policy = buildInteractionPolicy(audience, visibility);
      if (!policy) continue;
      for (const [rule, { automatic_approval: automatic, manual_approval: manual }] of Object.entries(policy)) {
        for (const value of [...automatic, ...manual]) {
          assert.ok(feasibleForGoToSocial(value, visibility), `${audience}/${visibility}: ${rule} contains ${value}`);
        }
      }
    }
  }
});

test('the reported case: followers-only post where only mentioned accounts may reply', () => {
  assert.deepEqual(buildInteractionPolicy('mentioned', 'private'), {
    can_favourite: { automatic_approval: ['author', 'followers', 'mentioned'], manual_approval: [] },
    can_reply: { automatic_approval: ['mentioned'], manual_approval: [] },
    can_reblog: { automatic_approval: ['author'], manual_approval: [] },
  });
});

test('public posts keep favourites and boosts open to everyone', () => {
  assert.deepEqual(buildInteractionPolicy('followers', 'public'), {
    can_favourite: { automatic_approval: ['public'], manual_approval: [] },
    can_reply: { automatic_approval: ['followers'], manual_approval: [] },
    can_reblog: { automatic_approval: ['public'], manual_approval: [] },
  });
});

test('"account default" sends no policy; "everyone" is explicit where it fits', () => {
  for (const visibility of visibilities) assert.equal(buildInteractionPolicy('default', visibility), undefined);
  assert.deepEqual(buildInteractionPolicy('public', 'public').can_reply.automatic_approval, ['public']);
  // Not possible for followers-only or direct posts: the account default is used instead.
  assert.equal(effectiveReplyAudience('public', 'private'), 'default');
  assert.equal(buildInteractionPolicy('public', 'direct'), undefined);
});

test('favourites and boosts follow the account defaults, keeping only values a post may send', () => {
  setAccountInteractionDefaults({
    private: {
      can_favourite: { automatic_approval: ['author', 'followers', 'me'], manual_approval: ['mentioned'] },
      can_reply: { automatic_approval: ['author'], manual_approval: [] },
      can_reblog: { automatic_approval: ['author', 'public'], manual_approval: [] },
    },
  });
  try {
    assert.deepEqual(buildInteractionPolicy('mutuals', 'private'), {
      can_favourite: { automatic_approval: ['author', 'followers'], manual_approval: ['mentioned'] },
      can_reply: { automatic_approval: ['mutuals'], manual_approval: [] },
      can_reblog: { automatic_approval: ['author'], manual_approval: [] },
    });
    // No account defaults for this visibility: GoToSocial's own defaults.
    assert.deepEqual(buildInteractionPolicy('followers', 'public').can_favourite.automatic_approval, ['public']);
  } finally {
    setAccountInteractionDefaults(undefined);
  }
});

test('only a choice this client knows is used; anything else means the account defaults', () => {
  assert.equal(replyAudienceFromStored('public'), 'public');
  assert.equal(replyAudienceFromStored('followers'), 'followers');
  assert.equal(replyAudienceFromStored(null), 'default');
  assert.equal(replyAudienceFromStored('bogus'), 'default');
});

test('followers/following are ruled out for direct messages and fall back to mentioned accounts', () => {
  assert.equal(isReplyAudienceFeasible('followers', 'direct'), false);
  assert.equal(isReplyAudienceFeasible('following', 'direct'), false);
  assert.equal(isReplyAudienceFeasible('mutuals', 'direct'), true);
  assert.equal(effectiveReplyAudience('followers', 'direct'), 'mentioned');
  assert.equal(effectiveReplyAudience('followers', 'private'), 'followers');
  assert.deepEqual(buildInteractionPolicy('following', 'direct').can_reply.automatic_approval, ['mentioned']);
});

const accountDefaults = {
  public: {
    can_favourite: { automatic_approval: ['public', 'me'], manual_approval: [] },
    can_reply: { automatic_approval: ['public', 'me'], manual_approval: [] },
    can_reblog: { automatic_approval: ['author', 'me'], manual_approval: [] },
  },
};

test('a restricting policy waits for the account defaults instead of using wider built-in rules', async () => {
  let resolve;
  loadAccountInteractionDefaults(() => new Promise((done) => { resolve = done; }));
  let settled;
  const pending = interactionPolicyFor('followers', 'public').then((policy) => { settled = policy; });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(settled, undefined, 'not built before the defaults arrived');
  resolve(accountDefaults);
  await pending;
  // Account default for public posts: only the author boosts (GoToSocial's own default would be everyone).
  assert.deepEqual(settled.can_reblog, { automatic_approval: ['author'], manual_approval: [] });
  // "Account default" sends nothing and never waits.
  loadAccountInteractionDefaults(() => new Promise(() => {}));
  assert.equal(await interactionPolicyFor('default', 'public'), undefined);
});

test('if the account defaults cannot be loaded, nothing is sent; the next post tries again', async () => {
  let attempts = 0;
  loadAccountInteractionDefaults(async () => { attempts++; if (attempts < 3) throw new Error('HTTP 502'); return accountDefaults; });
  await assert.rejects(interactionPolicyFor('mentioned', 'public'), InteractionDefaultsUnavailableError);
  await assert.rejects(interactionPolicyFor('mentioned', 'public'), InteractionDefaultsUnavailableError);
  const policy = await interactionPolicyFor('mentioned', 'public');
  assert.equal(attempts, 3);
  assert.deepEqual(policy.can_reblog.automatic_approval, ['author']);
});

test('a server without account defaults (endpoint missing) uses GoToSocial\'s defaults', async () => {
  loadAccountInteractionDefaults(async () => null);
  const policy = await interactionPolicyFor('mentioned', 'private');
  assert.deepEqual(policy.can_reblog.automatic_approval, ['author']);
  setAccountInteractionDefaults(undefined);
});
