// server.cjs — simple static file server for sandbox preview
// Serves files from public/ with correct MIME types, no redirect quirks

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT    = process.env.PORT || 3000;
const ROOT    = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ttf':  'font/ttf',
};

// Clean URL map (same as Hono worker)
const CLEAN_URLS = {
  '/login':          'login.html',
  '/signup':         'signup.html',
  '/dashboard':      'dashboard.html',
  '/account':        'account.html',
  '/welcome':        'welcome.html',
  '/funnel':         'funnel.html',
  '/menu':           'menu.html',
  '/wifi':           'wifi.html',
  '/feedback':       'feedback.html',
  '/thankyou':       'thankyou.html',
  '/debug':          'debug.html',
  '/funnel-preview': 'funnel-preview.html',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0].replace(/\/+$/, '') || '/';

  // /r/:slug → funnel.html?biz=slug
  const rMatch = urlPath.match(/^\/r\/(.+)$/);
  if (rMatch) urlPath = '/funnel.html';

  // Clean URL rewrite
  if (CLEAN_URLS[urlPath]) urlPath = '/' + CLEAN_URLS[urlPath];

  // Default to index.html
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  const filePath = path.join(ROOT, urlPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Try appending .html
      fs.readFile(filePath + '.html', (err2, data2) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found: ' + urlPath);
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(data2);
        }
      });
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('[HappyClientele] Serving public/ on http://0.0.0.0:' + PORT);
});
