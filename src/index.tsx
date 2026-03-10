import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  // Cloudflare Pages ASSETS binding (static file serving)
  ASSETS: Fetcher

  // Secrets — set via: wrangler pages secret put SECRET_NAME
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  STRIPE_PORTAL_FALLBACK: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

// ── CORS for all API routes ────────────────────────────────────────
app.use('/api/*', cors({
  origin: ['https://happyclientele.com', 'https://*.pages.dev'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

// ══════════════════════════════════════════════════════════════════
//  API ROUTES
// ══════════════════════════════════════════════════════════════════

// ── 1. Stripe: Create Billing Portal Session ──────────────────────
// Called from account.html "Manage Billing" button
// Replaces the current direct fallback link
app.post('/api/create-portal-session', async (c) => {
  const { stripe_customer_id, return_url } = await c.req.json<{
    stripe_customer_id: string
    return_url: string
  }>()

  if (!stripe_customer_id) {
    return c.json({ error: 'stripe_customer_id is required' }, 400)
  }

  const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      customer: stripe_customer_id,
      return_url: return_url || 'https://happyclientele.com/account.html',
    }).toString(),
  })

  const session = await res.json() as { url?: string; error?: { message: string } }

  if (!res.ok || !session.url) {
    console.error('[portal-session] Stripe error:', session)
    return c.json({ error: session.error?.message || 'Failed to create portal session' }, 500)
  }

  return c.json({ url: session.url })
})

// ── 2. Stripe: Webhook (subscription status sync) ────────────────
// Receives events from Stripe → updates Supabase accounts table
app.post('/api/webhook-stripe', async (c) => {
  const sig = c.req.header('stripe-signature')
  const rawBody = await c.req.text()

  if (!sig || !c.env.STRIPE_WEBHOOK_SECRET) {
    return c.json({ error: 'Missing signature or secret' }, 400)
  }

  // Stripe webhook signature verification (HMAC-SHA256 via Web Crypto)
  const verified = await verifyStripeSignature(rawBody, sig, c.env.STRIPE_WEBHOOK_SECRET)
  if (!verified) {
    return c.json({ error: 'Invalid signature' }, 401)
  }

  const event = JSON.parse(rawBody) as { type: string; data: { object: any } }
  const sub = event.data.object

  const handledEvents = [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
  ]

  if (handledEvents.includes(event.type)) {
    // Look up customer email from Stripe if not on the object
    let email = sub.customer_email
    if (!email && sub.customer) {
      const custRes = await fetch(`https://api.stripe.com/v1/customers/${sub.customer}`, {
        headers: { 'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}` }
      })
      const cust = await custRes.json() as { email?: string }
      email = cust.email
    }

    if (email) {
      // Update Supabase accounts table
      await fetch(`${c.env.SUPABASE_URL}/rest/v1/accounts?email=eq.${encodeURIComponent(email)}`, {
        method: 'PATCH',
        headers: {
          'apikey': c.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${c.env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          subscription_status:    sub.status,
          stripe_customer_id:     sub.customer,
          stripe_subscription_id: sub.id,
          current_period_end:     sub.current_period_end,
          updated_at:             new Date().toISOString(),
        })
      })
    }
  }

  return c.json({ received: true })
})

// ── 3. Delete Account ────────────────────────────────────────────
// Deletes Supabase auth user — requires service_role key (can't do client-side)
app.post('/api/delete-account', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader) return c.json({ error: 'Unauthorized' }, 401)

  // Verify the caller's JWT with Supabase to get their user_id
  const verifyRes = await fetch(`${c.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey': c.env.SUPABASE_SERVICE_KEY,
      'Authorization': authHeader,
    }
  })

  if (!verifyRes.ok) return c.json({ error: 'Invalid session' }, 401)
  const user = await verifyRes.json() as { id?: string }
  if (!user.id) return c.json({ error: 'Could not identify user' }, 401)

  // Delete the auth user (cascades to businesses + accounts via FK)
  const delRes = await fetch(`${c.env.SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'DELETE',
    headers: {
      'apikey': c.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${c.env.SUPABASE_SERVICE_KEY}`,
    }
  })

  if (!delRes.ok) {
    const err = await delRes.json().catch(() => ({})) as { message?: string }
    return c.json({ error: err.message || 'Delete failed' }, 500)
  }

  return c.json({ success: true })
})

// ── 4. Health check ──────────────────────────────────────────────
app.get('/api/health', (c) => c.json({ status: 'ok', version: '5.8' }))

// ══════════════════════════════════════════════════════════════════
//  CLEAN URL ROUTING
//  /login → login.html, /dashboard → dashboard.html etc.
//  Handled as 200 rewrites (URL stays clean, no redirect loop)
// ══════════════════════════════════════════════════════════════════
const cleanUrls: Record<string, string> = {
  '/login':          '/login.html',
  '/signup':         '/signup.html',
  '/dashboard':      '/dashboard.html',
  '/account':        '/account.html',
  '/welcome':        '/welcome.html',
  '/funnel':         '/funnel.html',
  '/menu':           '/menu.html',
  '/wifi':           '/wifi.html',
  '/feedback':       '/feedback.html',
  '/thankyou':       '/thankyou.html',
  '/debug':          '/debug.html',
  '/funnel-preview': '/funnel-preview.html',
}

app.use('/*', async (c) => {
  const url = new URL(c.req.url)
  const path = url.pathname.replace(/\/$/, '') // strip trailing slash

  // /r/:slug  →  funnel.html?biz=slug  (QR short links)
  const rMatch = path.match(/^\/r\/(.+)$/)
  if (rMatch) {
    const rewriteUrl = new URL(c.req.url)
    rewriteUrl.pathname = '/funnel.html'
    rewriteUrl.searchParams.set('biz', rMatch[1])
    return c.env.ASSETS.fetch(new Request(rewriteUrl.toString(), c.req.raw))
  }

  // Clean URL rewrite (200, not redirect)
  if (cleanUrls[path]) {
    const rewriteUrl = new URL(c.req.url)
    rewriteUrl.pathname = cleanUrls[path]
    return c.env.ASSETS.fetch(new Request(rewriteUrl.toString(), c.req.raw))
  }

  // Everything else — serve as-is from ASSETS
  return c.env.ASSETS.fetch(c.req.raw)
})

// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════

// Stripe webhook HMAC-SHA256 verification (no npm stripe SDK needed)
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('='))) as {
      t?: string; v1?: string
    }
    const timestamp = parts.t
    const signature = parts.v1
    if (!timestamp || !signature) return false

    const signedPayload = `${timestamp}.${payload}`
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload))
    const computed = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('')
    return computed === signature
  } catch {
    return false
  }
}

export default app
