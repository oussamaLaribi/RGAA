import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const root = join(import.meta.dirname, 'dist/fixture-app/browser');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ico': 'image/x-icon' };

createServer(async (req, res) => {
  const requested = (req.url ?? '/').split('?')[0];
  // Derive the content type from the file actually served, not from the URL:
  // "/" has no extension and would otherwise be sent as a download.
  const path = requested === '/' ? '/index.html' : requested;
  try {
    const file = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(200, { 'content-type': types['.html'] });
    res.end(await readFile(join(root, 'index.html')));
  }
}).listen(4200, () => console.log('fixture served on http://localhost:4200'));
