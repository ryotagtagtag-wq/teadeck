import { getSession, logout } from './session';
import { accountKey, clearActiveAccountKey, forgetAccount, getAccountId, getActiveAccountKey } from './storage';

/** Signs this account out everywhere in Teadeck: forgets it if it was remembered ("Angemeldet bleiben"), then revokes the token and clears the tab session. */
export async function forgetAndLogout() {
  const session = getSession();
  const id = getAccountId();
  if (session && id) {
    await forgetAccount(session.origin, id).catch(() => {});
    if (getActiveAccountKey() === accountKey(session.origin, id)) clearActiveAccountKey();
  }
  await logout();
}
