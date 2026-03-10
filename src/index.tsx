import { Hono } from 'hono'
import { cors } from 'hono/cors'

// $97/mo Stripe Price ID (safe to hardcode — not a secret)
const STRIPE_PRICE_ID = 'price_1T8ZWZBf4cpCOXU3NlmAq5am'

// Stripe webhook signing secret
const STRIPE_WEBHOOK_SECRET = 'whsec_lTZPfk65gJkD1PDg0yWGUhu3dReZtEWF'

type Bindings = {
  ASSETS: Fetcher
  STRIPE_SECRET_KEY: string
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
//  HELPERS
// ══════════════════════════════════════════════════════════════════

/** Verify caller JWT, return their Supabase user id */
async function getUserId(c: any): Promise<string | null> {
  const auth = c.req.header('Authorization')
  if (!auth) return null
  const res = await fetch(`${c.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey':        c.env.SUPABASE_SERVICE_KEY,
      'Authorization': auth,
    }
  })
  if (!res.ok) return null
  const user = await res.json() as { id?: string }
  return user.id || null
}

/** Stripe helper: create or retrieve a customer for an email */
async function getOrCreateStripeCustomer(
  email: string,
  stripeKey: string
): Promise<string> {
  // Search for existing customer
  const search = await fetch(
    `https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=1`,
    { headers: { 'Authorization': `Bearer ${stripeKey}` } }
  )
  const searched = await search.json() as { data?: { id: string }[] }
  if (searched.data && searched.data.length > 0) return searched.data[0].id

  // Create new customer
  const create = await fetch('https://api.stripe.com/v1/customers', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ email }).toString()
  })
  const customer = await create.json() as { id: string }
  return customer.id
}

// ══════════════════════════════════════════════════════════════════
//  API ROUTES
// ══════════════════════════════════════════════════════════════════

// ── 1. Create Stripe Checkout Session (per-location subscription) ─
// Called from account.html "Add Location" flow after business is saved
app.post('/api/create-checkout', async (c) => {
  const userId = await getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const { location_id, email, success_url, cancel_url } = await c.req.json<{
    location_id: string
    email: string
    success_url: string
    cancel_url: string
  }>()

  if (!location_id || !email) {
    return c.json({ error: 'location_id and email are required' }, 400)
  }

  const customerId = await getOrCreateStripeCustomer(email, c.env.STRIPE_SECRET_KEY)

  // Create Checkout session for $97/mo subscription
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      customer:               customerId,
      'line_items[0][price]': STRIPE_PRICE_ID,
      'line_items[0][quantity]': '1',
      mode:                   'subscription',
      success_url:            success_url || `https://happyclientele.com/dashboard?loc=${location_id}&paid=1`,
      cancel_url:             cancel_url  || `https://happyclientele.com/account`,
      'metadata[location_id]': location_id,
      'metadata[user_id]':     userId,
      'subscription_data[metadata][location_id]': location_id,
      'subscription_data[metadata][user_id]':     userId,
    }).toString()
  })

  const session = await res.json() as { url?: string; error?: { message: string } }

  if (!res.ok || !session.url) {
    console.error('[create-checkout] Stripe error:', session)
    return c.json({ error: session.error?.message || 'Failed to create checkout session' }, 500)
  }

  // Save the pending subscription reference to the location row
  await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/locations?id=eq.${location_id}`,
    {
      method: 'PATCH',
      headers: {
        'apikey':       c.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${c.env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer':       'return=minimal',
      },
      body: JSON.stringify({
        subscription_status: 'pending_payment',
        updated_at: new Date().toISOString(),
      })
    }
  )

  return c.json({ url: session.url })
})

// ── 2. Stripe: Create Billing Portal Session ──────────────────────
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
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      customer:   stripe_customer_id,
      return_url: return_url || 'https://happyclientele.com/account',
    }).toString(),
  })

  const session = await res.json() as { url?: string; error?: { message: string } }

  if (!res.ok || !session.url) {
    console.error('[portal-session] Stripe error:', session)
    return c.json({ error: session.error?.message || 'Failed to create portal session' }, 500)
  }

  return c.json({ url: session.url })
})

// ── 3. Stripe Webhook (subscription status sync per-location) ─────
app.post('/api/webhook-stripe', async (c) => {
  const sig     = c.req.header('stripe-signature')
  const rawBody = await c.req.text()

  if (!sig) {
    return c.json({ error: 'Missing signature' }, 400)
  }

  const verified = await verifyStripeSignature(rawBody, sig, STRIPE_WEBHOOK_SECRET)
  if (!verified) return c.json({ error: 'Invalid signature' }, 401)

  const event = JSON.parse(rawBody) as { type: string; data: { object: any } }
  const sub   = event.data.object

  const handled = [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'checkout.session.completed',
  ]

  if (!handled.includes(event.type)) return c.json({ received: true })

  // checkout.session.completed → link subscription to location
  if (event.type === 'checkout.session.completed') {
    const locationId    = sub.metadata?.location_id
    const subscriptionId = sub.subscription

    if (locationId && subscriptionId) {
      // Fetch the subscription details
      const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
        headers: { 'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}` }
      })
      const subData = await subRes.json() as {
        status: string
        id: string
        items: { data: { price: { id: string } }[] }
        current_period_end: number
      }

      await fetch(
        `${c.env.SUPABASE_URL}/rest/v1/locations?id=eq.${locationId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey':        c.env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${c.env.SUPABASE_SERVICE_KEY}`,
            'Content-Type':  'application/json',
            'Prefer':        'return=minimal',
          },
          body: JSON.stringify({
            stripe_subscription_id: subData.id,
            stripe_price_id:        subData.items?.data[0]?.price?.id || '',
            subscription_status:    subData.status,
            current_period_end:     subData.current_period_end,
            updated_at:             new Date().toISOString(),
          })
        }
      )
    }
    return c.json({ received: true })
  }

  // subscription.created / updated / deleted — match by subscription id
  const locationId = sub.metadata?.location_id
  if (locationId) {
    await fetch(
      `${c.env.SUPABASE_URL}/rest/v1/locations?id=eq.${locationId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey':        c.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${c.env.SUPABASE_SERVICE_KEY}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify({
          stripe_subscription_id: sub.id,
          subscription_status:    sub.status,
          current_period_end:     sub.current_period_end,
          updated_at:             new Date().toISOString(),
        })
      }
    )
  } else {
    // Fallback: update accounts table by email (old single-biz flow)
    let email = sub.customer_email
    if (!email && sub.customer) {
      const custRes = await fetch(`https://api.stripe.com/v1/customers/${sub.customer}`, {
        headers: { 'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}` }
      })
      const cust = await custRes.json() as { email?: string }
      email = cust.email
    }
    if (email) {
      await fetch(`${c.env.SUPABASE_URL}/rest/v1/accounts?email=eq.${encodeURIComponent(email)}`, {
        method: 'PATCH',
        headers: {
          'apikey':        c.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${c.env.SUPABASE_SERVICE_KEY}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
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

// ── 4. Delete Account ─────────────────────────────────────────────
app.post('/api/delete-account', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader) return c.json({ error: 'Unauthorized' }, 401)

  const verifyRes = await fetch(`${c.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey':        c.env.SUPABASE_SERVICE_KEY,
      'Authorization': authHeader,
    }
  })
  if (!verifyRes.ok) return c.json({ error: 'Invalid session' }, 401)
  const user = await verifyRes.json() as { id?: string }
  if (!user.id) return c.json({ error: 'Could not identify user' }, 401)

  const delRes = await fetch(`${c.env.SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'DELETE',
    headers: {
      'apikey':        c.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${c.env.SUPABASE_SERVICE_KEY}`,
    }
  })
  if (!delRes.ok) {
    const err = await delRes.json().catch(() => ({})) as { message?: string }
    return c.json({ error: err.message || 'Delete failed' }, 500)
  }
  return c.json({ success: true })
})

// ── 5. Health check ───────────────────────────────────────────────
app.get('/api/health', (c) => c.json({ status: 'ok', version: '6.0' }))

// ══════════════════════════════════════════════════════════════════
//  CLEAN URL ROUTING
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
  const url  = new URL(c.req.url)
  const path = url.pathname.replace(/\/$/, '')

  // /r/:slug  →  funnel.html?biz=slug
  const rMatch = path.match(/^\/r\/(.+)$/)
  if (rMatch) {
    const rewriteUrl = new URL(c.req.url)
    rewriteUrl.pathname = '/funnel.html'
    rewriteUrl.searchParams.set('biz', rMatch[1])
    return c.env.ASSETS.fetch(new Request(rewriteUrl.toString(), c.req.raw))
  }

  if (cleanUrls[path]) {
    const rewriteUrl = new URL(c.req.url)
    rewriteUrl.pathname = cleanUrls[path]
    return c.env.ASSETS.fetch(new Request(rewriteUrl.toString(), c.req.raw))
  }

  return c.env.ASSETS.fetch(c.req.raw)
})

// ══════════════════════════════════════════════════════════════════
//  STRIPE HMAC VERIFICATION
// ══════════════════════════════════════════════════════════════════
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  try {
    const parts    = Object.fromEntries(sigHeader.split(',').map(p => p.split('='))) as { t?: string; v1?: string }
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
    const computed = Array.from(new Uint8Array(sigBytes))
      .map(b => b.toString(16).padStart(2, '0')).join('')
    return computed === signature
  } catch {
    return false
  }
}

export default app
