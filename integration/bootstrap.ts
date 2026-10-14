import { startApp } from './app_start.ts';
import { adoptSession, finishLogin, getSession, logout } from './session.ts';
import { accountKey, clearActiveAccountKey, getActiveAccountKey, listRememberedAccounts } from './storage.ts';
import { applyWaitingUpdate } from './offline.ts';
import { failStart, initShell, showSignIn } from './shell.ts';
import { stripAxiosUserAgent } from './fetch_patch.ts';
import { reloadOnStaleChunks } from './update_reload.ts';
import './shell.css';
// Teadeck's own designs; only active with data-teadeck-theme (see appearance.ts).
import './themes/designs.css';
import './themes/mastodon.css';

// Before the first API request.
window.fetch = stripAxiosUserAgent(window.fetch.bind(window));
reloadOnStaleChunks();

async function boot() {
  if (location.pathname === '/logout') return logout();
  if (await applyWaitingUpdate().catch(() => false)) return;
  initShell();
  if (location.pathname === '/oauth/callback') await finishLogin();

  let session = getSession();
  // null: the store could not be read, which says nothing about which accounts it holds.
  const remembered = await listRememberedAccounts()
    .catch(() => new Promise((resolve) => setTimeout(resolve, 250)).then(listRememberedAccounts))
    .catch(() => null);
  if (!session) {
    // A new tab: resume a "stay signed in" account.
    const activeKey = getActiveAccountKey();
    const account = activeKey ? remembered?.find(a => accountKey(a.origin, a.accountId) === activeKey) : undefined;
    if (account) {
      adoptSession(account);
      session = getSession();
    } else if (activeKey && remembered) {
      // Only an account that is really gone is forgotten.
      clearActiveAccountKey();
    }
  }
  if (!session) return showSignIn(remembered);
  await startApp(session);
}

void boot().catch(failStart);
