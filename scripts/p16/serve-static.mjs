import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const host = process.env.P16_HOST || '127.0.0.1';
const port = Number(process.env.P16_PORT || 4173);

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.csv', 'text/csv; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8']
]);

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const resolved = path.resolve(root, relative);
  return resolved.startsWith(path.resolve(root) + path.sep) || resolved === path.resolve(root, 'index.html')
    ? resolved
    : null;
}

const server = http.createServer((req, res) => {
  const requested = safePath(req.url || '/');
  if (!requested) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  let target = requested;
  try {
    if (fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }

  const ext = path.extname(target).toLowerCase();
  res.setHeader('content-type', mime.get(ext) || 'application/octet-stream');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  fs.createReadStream(target)
    .on('error', () => res.writeHead(500).end('Read error'))
    .pipe(res);
});

server.listen(port, host, () => {
  console.log(`P16_STATIC_SERVER_READY http://${host}:${port}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
