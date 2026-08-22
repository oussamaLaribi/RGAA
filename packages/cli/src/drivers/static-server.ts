import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import type { AddressInfo } from 'node:net';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export interface StaticSite {
  origin: string;
  close(): Promise<void>;
}

/**
 * Serves a built single-page app so the scanner has something to load.
 *
 * Binds an ephemeral port rather than a fixed one: a developer's own dev server
 * is very often already sitting on the obvious ports, and a scan must not fail
 * over a port clash.
 */
export async function serveDirectory(root: string): Promise<StaticSite> {
  const server: Server = createServer((request, response) => {
    void (async () => {
      const requested = (request.url ?? '/').split('?')[0] ?? '/';
      // Resolve the file first, then derive its type: "/" has no extension and
      // would otherwise be sent as a download rather than rendered.
      const path = requested === '/' ? '/index.html' : requested;
      // Keep traversal inside the served directory.
      const safePath = normalize(path).replace(/^(\.\.[/\\])+/, '');

      try {
        const file = await readFile(join(root, safePath));
        response.writeHead(200, {
          'content-type': CONTENT_TYPES[extname(safePath)] ?? 'application/octet-stream',
        });
        response.end(file);
      } catch {
        // Client-side routes have no file of their own; hand back the shell.
        try {
          response.writeHead(200, { 'content-type': CONTENT_TYPES['.html'] as string });
          response.end(await readFile(join(root, 'index.html')));
        } catch {
          response.writeHead(404).end('not found');
        }
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
