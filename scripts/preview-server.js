'use strict';
/**
 * Browser preview for the NeverBrowser chrome.
 *
 *   npm run web   → http://0.0.0.0:4173
 *
 * Serves the real renderer with a fake window.nb (scripts/preview/mock-nb.js),
 * so the UI can be reviewed without Electron. The Electron app itself is
 * `npm start`.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 4173);
const HOST = '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2'
};

function send(res, status, type, body) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function renderChrome() {
  const file = path.join(ROOT, 'src', 'renderer', 'index.html');
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(/(src|href)="\.\.\/\.\.\/([^"]+)"/g, (_m, attr, file) => `${attr}="/${file}"`);
  html = html.replace('href="styles.css"', 'href="/src/renderer/styles.css"');
  html = html.replace('<script src="app.js"></script>', () => '<script src="/scripts/preview/mock-nb.js"></script>\n  <script src="/src/renderer/app.js"></script>');
  return html;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/' || pathname === '/index.html') {
    return send(res, 200, MIME['.html'], renderChrome());
  }
  if (pathname === '/newtab' || pathname === '/start') {
    return send(res, 200, MIME['.html'], fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'newtab.html')));
  }

  const rel = pathname.replace(/^\/+/, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) return send(res, 403, 'text/plain', 'forbidden');

  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'text/plain', `not found: ${pathname}`);
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    send(res, 200, type, data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`NeverBrowser preview → http://localhost:${PORT}`);
  console.log(`(Electron app: npm start)`);
});
