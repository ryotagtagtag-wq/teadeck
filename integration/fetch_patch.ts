/**
 * axios's fetch adapter (used by mastodon/api.ts via `adapter: 'fetch'`, needed
 * for `fetchOptions: { redirect: 'error' }`, which the XHR adapter can't do)
 * unconditionally sets a `User-Agent` header on every request — a workaround
 * for Node's undici defaulting to "node", irrelevant in the browser:
 * https://github.com/axios/axios/blob/v1/lib/adapters/fetch.js (search
 * "Set User-Agent header if not already set").
 *
 * Unlike the legacy XHR adapter, the current Fetch spec no longer forbids
 * scripts from setting this header, so it becomes a real custom header that
 * triggers a CORS preflight. Real Mastodon-family CORS configs generally
 * don't allow it, which breaks every authenticated API call against a real
 * instance with "header 'user-agent' is not allowed according to header
 * 'Access-Control-Allow-Headers'". Our own mocked tests never caught this:
 * the mocked CORS preflight response echoes a fixed Access-Control-Allow-Headers
 * regardless of what was actually requested, which a real server does not do.
 *
 * Deleting the header here restores the browser's own native User-Agent,
 * which is attached at the network layer and is never subject to CORS
 * preflight — matching what a same-origin Rails-served client would send.
 */
export function stripAxiosUserAgent(target: typeof fetch): typeof fetch {
  return (input, init) => {
    const request = new Request(input, init);
    request.headers.delete('User-Agent');
    return target(request);
  };
}
