import { getSession } from './session';

/** Rewrite server-rendered pages explicitly, including middle-click/new tabs. */
export function serverUrl(path: string): string {
  if (path === '/auth/sign_out') return '/logout';
  if (path === '/auth/sign_in') return '/';
  const session = getSession();
  if (!session) return '/';
  return new URL(path, session.origin).href;
}
