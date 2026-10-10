import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

// Serve the exact Pages artifact under its real prefix for portability checks.
// This is a development server, not an account API or production backend.
const root = resolve(process.env.ANCHOR_SERVE_ROOT || 'web');
const base = process.env.ANCHOR_BASE_PATH || '/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('Invalid preview base path.');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const port = Number(process.env.ANCHOR_PORT || 4317);
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (base !== '/' && url.pathname === base.slice(0, -1)) {
        res.writeHead(302, { Location: base + url.search });
        res.end();
        return;
      }
      if (!url.pathname.startsWith(base)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      let path = resolve(root, decodeURIComponent(url.pathname.slice(base.length)) || '.');
      if (path !== root && !path.startsWith(root + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
      const content = await readFile(path);
      res.writeHead(200, {
        'Content-Type': types[extname(path)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      });
      res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  })
  .listen(port, '127.0.0.1', () => console.log(`Anchor preview: http://localhost:${port}${base}`));
