import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = join(import.meta.dirname, '..', 'dist');
const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

async function staticResponse(request, response, override) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const replaced = await override?.(pathname, (file) => readFile(join(root, file)));
  if (replaced) {
    response.writeHead(200, { 'content-type': `${replaced.type}; charset=utf-8`, 'cache-control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : replaced.body);
    return;
  }
  let path = normalize(join(root, pathname));
  if (!path.startsWith(`${root}/`)) path = join(root, 'index.html');
  try {
    if (!(await stat(path)).isFile()) throw new Error();
  } catch {
    // Like nginx: only routes fall back to the app, a missing file stays missing.
    if (extname(path)) {
      response.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end('not found');
      return;
    }
    path = join(root, 'index.html');
  }
  const body = await readFile(path);
  response.writeHead(200, { 'content-type': `${types[extname(path)] ?? 'application/octet-stream'}; charset=utf-8`, 'cache-control': 'no-store' });
  response.end(request.method === 'HEAD' ? undefined : body);
}

/**
 * Serves the built `dist/` static client, mirroring the production nginx SPA fallback.
 * `override(pathname, readDistFile)` may return `{ body, type }` to replace a response (e.g. a new deploy).
 */
export function createStaticServer({ override } = {}) {
  const server = createServer((request, response) => { void staticResponse(request, response, override); });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, origin: `http://127.0.0.1:${server.address().port}` });
    });
  });
}
