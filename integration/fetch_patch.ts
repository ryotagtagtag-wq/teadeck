/**
 * axios's fetch adapter sets a User-Agent header on every request. In the
 * browser that is a custom header, which triggers a CORS preflight that most
 * servers reject. Removing it lets the browser send its own User-Agent.
 */
export function stripAxiosUserAgent(target: typeof fetch): typeof fetch {
  return (input, init) => {
    const request = new Request(input, init);
    request.headers.delete('User-Agent');
    return target(request);
  };
}
