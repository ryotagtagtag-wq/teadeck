import { getSession, logout } from './session';
import { accountKey, clearActiveAccountKey, forgetAccount, getAccountId, getActiveAccountKey, listRememberedAccounts } from './storage';

/** Signs this account out everywhere in Teadeck: forgets it if it was remembered ("Stay signed in"), then revokes the token and clears the tab session. */
export async function forgetAndLogout() {
  const session = getSession();
  // Before the start has finished, the account ID is known only to the remembered account holding this token.
  const id = getAccountId() || (session && (await listRememberedAccounts().catch(() => []))
    .find(account => account.origin === session.origin && account.accessToken === session.accessToken)?.accountId);
  if (session && id) {
    await forgetAccount(session.origin, id).catch(() => {});
    if (getActiveAccountKey() === accountKey(session.origin, id)) clearActiveAccountKey();
  }
  await logout();
}
