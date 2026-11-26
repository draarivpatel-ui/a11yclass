// Ephemeral localhost server for the static app. Node standard library only.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HOST = '127.0.0.1';
const PORT = process.env.PORT ? Number(process.env.PORT) : 0;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function resolvePath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const clean = decoded.replace(/^\/+/, '') || 'index.html';
  const full = resolve(join(ROOT, clean));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
  return full;
}

const server = createServer(async (req, res) => {
  const headers = {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store'
  };
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, headers).end('Method not allowed');
      return;
    }
    const url = new URL(req.url, `http://${HOST}`);
    let full = resolvePath(url.pathname);
    if (!full) {
      res.writeHead(400, headers).end('Bad path');
      return;
    }
    let info = await stat(full).catch(() => null);
    if (info?.isDirectory()) {
      full = join(full, 'index.html');
      info = await stat(full).catch(() => null);
    }
    if (!info?.isFile()) {
      res.writeHead(404, headers).end('Not found');
      return;
    }
    const body = await readFile(full);
    res.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(full).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': body.length });
    if (req.method === 'HEAD') res.end();
    else res.end(body);
  } catch (error) {
    res.writeHead(500, headers).end('Server error');
    process.stderr.write(`serve error: ${error.message}\n`);
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`A11yClass serving http://${HOST}:${server.address().port}/\n`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
