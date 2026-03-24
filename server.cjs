// server.cjs — static file server + API proxy for sandbox preview
// Serves files from public/ with correct MIME types
// Proxies /api/* routes for local development

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT    = process.env.PORT || 3000;
const ROOT    = path.join(__dirname, 'public');

// ─── API Keys (local dev only — production uses Cloudflare secrets) ──
const PRODIGI_API_KEY = process.env.PRODIGI_API_KEY || '3a10599e-8d15-4d07-8006-a9ba60ee003f';
const FAL_API_KEY     = process.env.FAL_API_KEY     || '5b2e2e48-a9fb-4a98-b213-fbf32cb48740:cf580383fe02519d6c4ecec2441c79d0';
const PRODIGI_API     = 'api.prodigi.com';
const SUPABASE_URL    = 'https://dbbryatmoxlzifsurxrm.supabase.co';

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
  '/admin':          'admin.html',
  '/print-studio':   'print-studio.html',
};

// ─── Helpers ──────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode, body: text });
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getSupabaseUserId(req) {
  const auth = req.headers['authorization'];
  if (!auth) return null;
  try {
    const r = await httpsRequest({
      hostname: 'dbbryatmoxlzifsurxrm.supabase.co',
      path: '/auth/v1/user',
      method: 'GET',
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRiYnJ5YXRtb3hsemloZnN1cnhybSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzcyOTQ1MzUzLCJleHAiOjIwODg1MjEzNTN9.mEhRKq-nY4lrpHTUrVJXNRdvFWjmN_B76SDjKuPlxbE',
        'Authorization': auth,
      }
    });
    if (r.status !== 200) return null;
    const user = JSON.parse(r.body);
    return user.id || null;
  } catch(e) {
    return null;
  }
}

function jsonResponse(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}

// ─── API Route Handlers ───────────────────────────────────────────────
async function handleGenerateDesign(req, res) {
  const userId = await getSupabaseUserId(req);
  if (!userId) return jsonResponse(res, 401, { error: 'Unauthorized' });

  const bodyStr = await readBody(req);
  let body;
  try { body = JSON.parse(bodyStr); } catch(e) { return jsonResponse(res, 400, { error: 'Invalid JSON' }); }

  const { prompt, count = 4 } = body;
  if (!prompt) return jsonResponse(res, 400, { error: 'prompt is required' });

  const numImages = Math.min(count, 4);

  try {
    const falBody = JSON.stringify({
      prompt,
      num_images: numImages,
      image_size: 'square_hd',
      num_inference_steps: 4,
      enable_safety_checker: false,
    });

    const r = await httpsRequest({
      hostname: 'fal.run',
      path: '/fal-ai/flux/schnell',
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(falBody),
      }
    }, falBody);

    if (r.status !== 200) {
      console.error('[generate-design] fal.ai error:', r.status, r.body.slice(0,300));
      return jsonResponse(res, 500, { error: 'Image generation failed', detail: r.body.slice(0,500) });
    }

    const data = JSON.parse(r.body);
    const images = (data.images || []).map(img => img.url);
    return jsonResponse(res, 200, { images });
  } catch(e) {
    console.error('[generate-design] error:', e.message);
    return jsonResponse(res, 500, { error: 'Generation service error' });
  }
}

async function handleCreatePrintOrder(req, res) {
  const userId = await getSupabaseUserId(req);
  if (!userId) return jsonResponse(res, 401, { error: 'Unauthorized' });

  const bodyStr = await readBody(req);
  let body;
  try { body = JSON.parse(bodyStr); } catch(e) { return jsonResponse(res, 400, { error: 'Invalid JSON' }); }

  const { sku, copies, shippingMethod, imageUrl, businessName, locationName, qrUrl, recipient } = body;
  if (!sku || !imageUrl || !recipient) return jsonResponse(res, 400, { error: 'sku, imageUrl, and recipient are required' });

  const merchantRef = `hc-${userId.slice(0,8)}-${Date.now()}`;
  const orderPayload = JSON.stringify({
    merchantReference: merchantRef,
    shippingMethod: shippingMethod || 'Budget',
    recipient: { name: recipient.name, email: recipient.email, address: recipient.address },
    items: [{
      merchantReference: `${businessName || 'HC'}-${locationName || 'Loc'}`,
      sku,
      copies: copies || 1,
      sizing: 'fillPrintArea',
      assets: [{ printArea: 'default', url: imageUrl }]
    }],
    metadata: { userId, businessName: businessName || '', locationName: locationName || '', qrUrl: qrUrl || '', source: 'happyclientele-print-studio' }
  });

  try {
    const r = await httpsRequest({
      hostname: PRODIGI_API,
      path: '/v4.0/orders',
      method: 'POST',
      headers: {
        'X-API-Key': PRODIGI_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(orderPayload),
      }
    }, orderPayload);

    const data = JSON.parse(r.body);
    if (r.status !== 200 || !['Created','OnHold','CreatedWithIssues'].includes(data.outcome)) {
      console.error('[create-print-order] Prodigi error:', r.status, JSON.stringify(data).slice(0,500));
      return jsonResponse(res, 500, { error: 'Prodigi order failed', detail: data });
    }

    const orderId = data.order?.id || 'unknown';
    console.log(`[create-print-order] Order created: ${orderId}`);
    return jsonResponse(res, 200, { orderId, outcome: data.outcome, merchantReference: merchantRef });
  } catch(e) {
    console.error('[create-print-order] error:', e.message);
    return jsonResponse(res, 500, { error: 'Print order service error' });
  }
}

async function handlePrintOrders(req, res) {
  const userId = await getSupabaseUserId(req);
  if (!userId) return jsonResponse(res, 401, { error: 'Unauthorized' });

  try {
    const r = await httpsRequest({
      hostname: PRODIGI_API,
      path: '/v4.0/orders?top=50',
      method: 'GET',
      headers: { 'X-API-Key': PRODIGI_API_KEY }
    });
    const data = JSON.parse(r.body);
    const allOrders = data.orders || [];
    const userOrders = allOrders.filter(o => o.merchantReference?.startsWith(`hc-${userId.slice(0,8)}-`));
    return jsonResponse(res, 200, { orders: userOrders });
  } catch(e) {
    return jsonResponse(res, 200, { orders: [] });
  }
}

async function handlePrintProduct(req, res, sku) {
  try {
    const r = await httpsRequest({
      hostname: PRODIGI_API,
      path: `/v4.0/products/${sku}`,
      method: 'GET',
      headers: { 'X-API-Key': PRODIGI_API_KEY }
    });
    const data = JSON.parse(r.body);
    return jsonResponse(res, r.status, data);
  } catch(e) {
    return jsonResponse(res, 500, { error: 'Product lookup failed' });
  }
}

// ─── Main Server ──────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  let urlPath = req.url.split('?')[0].replace(/\/+$/, '') || '/';

  // ─── API Routes ───────────────────────────────────────────────
  if (urlPath.startsWith('/api/')) {
    if (req.method === 'POST' && urlPath === '/api/generate-design') {
      return handleGenerateDesign(req, res);
    }
    if (req.method === 'POST' && urlPath === '/api/create-print-order') {
      return handleCreatePrintOrder(req, res);
    }
    if (req.method === 'GET' && urlPath === '/api/print-orders') {
      return handlePrintOrders(req, res);
    }
    const productMatch = urlPath.match(/^\/api\/print-product\/(.+)$/);
    if (req.method === 'GET' && productMatch) {
      return handlePrintProduct(req, res, productMatch[1]);
    }
    // For other API routes (Stripe, Supabase admin, health) — just pass 404
    // since they require the full Cloudflare Worker environment
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'API route not available in sandbox mode' }));
  }

  // ─── Static Files ─────────────────────────────────────────────

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
  console.log('[HappyClientele] Serving on http://0.0.0.0:' + PORT);
});
