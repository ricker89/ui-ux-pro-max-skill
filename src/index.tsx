import { Hono } from 'hono'
import { cors } from 'hono/cors'

// $97/mo Stripe Price ID (safe to hardcode — not a secret)
const STRIPE_PRICE_ID = 'price_1T8ZWZBf4cpCOXU3NlmAq5am'

// Stripe webhook signing secret
const STRIPE_WEBHOOK_SECRET = 'whsec_lTZPfk65gJkD1PDg0yWGUhu3dReZtEWF'

// Supabase constants — URL and anon key are public (safe to hardcode)
const SUPA_URL  = 'https://dbbryatmoxlzifsurxrm.supabase.co'
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRiYnJ5YXRtb3hsemlmc3VyeHJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NDUzNTMsImV4cCI6MjA4ODUyMTM1M30.b_Ge4bNFu3nCxXuP10ZEdmFbdVtTn2ZS98nyXoBRfAk'

// Third-party API keys — overridden by env secrets in production
const FAL_KEY_DEFAULT     = '5b2e2e48-a9fb-4a98-b213-fbf32cb48740:cf580383fe02519d6c4ecec2441c79d0'
const PRODIGI_KEY_DEFAULT = '3a10599e-8d15-4d07-8006-a9ba60ee003f'

type Bindings = {
  ASSETS: Fetcher
  STRIPE_SECRET_KEY: string
  STRIPE_PORTAL_FALLBACK: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
  PRODIGI_API_KEY: string
  FAL_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

// Prodigi live API base URL
const PRODIGI_API = 'https://api.prodigi.com/v4.0'

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

/** Verify caller JWT against Supabase, return their user id.
 *  Uses hardcoded public URL + anon key so it works even when
 *  SUPABASE_URL / SUPABASE_SERVICE_KEY env secrets aren't set. */
async function getUserId(c: any): Promise<string | null> {
  const auth = c.req.header('Authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  // Use env secrets when available, fall back to public constants
  const supaUrl  = c.env.SUPABASE_URL  || SUPA_URL
  const supaKey  = c.env.SUPABASE_SERVICE_KEY || SUPA_ANON
  try {
    const res = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: {
        'apikey':        supaKey,
        'Authorization': auth,
      }
    })
    if (!res.ok) return null
    const user = await res.json() as { id?: string }
    return user.id || null
  } catch(e) {
    console.error('[getUserId] error:', e)
    return null
  }
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

  // Create Checkout session for $97/mo subscription.
  // We use customer_email (not customer ID) so Stripe always shows the
  // card-entry / signup form instead of the returning-customer login page.
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      customer_email:             email,
      'line_items[0][price]':     STRIPE_PRICE_ID,
      'line_items[0][quantity]':  '1',
      mode:                       'subscription',
      payment_method_collection:  'always',
      success_url:                success_url || `https://happyclientele.com/location.html?loc=${location_id}&paid=1`,
      cancel_url:                 cancel_url  || `https://happyclientele.com/account.html`,
      'metadata[location_id]':    location_id,
      'metadata[user_id]':        userId,
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
    `${c.env.SUPABASE_URL || SUPA_URL}/rest/v1/locations?id=eq.${location_id}`,
    {
      method: 'PATCH',
      headers: {
        'apikey':       c.env.SUPABASE_SERVICE_KEY || SUPA_ANON,
        'Authorization': `Bearer ${c.env.SUPABASE_SERVICE_KEY || SUPA_ANON}`,
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
        `${c.env.SUPABASE_URL || SUPA_URL}/rest/v1/locations?id=eq.${locationId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey':        c.env.SUPABASE_SERVICE_KEY || SUPA_ANON,
            'Authorization': `Bearer ${c.env.SUPABASE_SERVICE_KEY || SUPA_ANON}`,
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
      `${c.env.SUPABASE_URL || SUPA_URL}/rest/v1/locations?id=eq.${locationId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey':        c.env.SUPABASE_SERVICE_KEY || SUPA_ANON,
          'Authorization': `Bearer ${c.env.SUPABASE_SERVICE_KEY || SUPA_ANON}`,
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
      await fetch(`${c.env.SUPABASE_URL || SUPA_URL}/rest/v1/accounts?email=eq.${encodeURIComponent(email)}`, {
        method: 'PATCH',
        headers: {
          'apikey':        c.env.SUPABASE_SERVICE_KEY || SUPA_ANON,
          'Authorization': `Bearer ${c.env.SUPABASE_SERVICE_KEY || SUPA_ANON}`,
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

  const verifyRes = await fetch(`${c.env.SUPABASE_URL || SUPA_URL}/auth/v1/user`, {
    headers: {
      'apikey':        c.env.SUPABASE_SERVICE_KEY || SUPA_ANON,
      'Authorization': authHeader,
    }
  })
  if (!verifyRes.ok) return c.json({ error: 'Invalid session' }, 401)
  const user = await verifyRes.json() as { id?: string }
  if (!user.id) return c.json({ error: 'Could not identify user' }, 401)

  const delRes = await fetch(`${c.env.SUPABASE_URL || SUPA_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'DELETE',
    headers: {
      'apikey':        c.env.SUPABASE_SERVICE_KEY || SUPA_ANON,
      'Authorization': `Bearer ${c.env.SUPABASE_SERVICE_KEY || SUPA_ANON}`,
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
// ── 6. Admin: Summary Stats (service-role bypass of RLS) ──────────
app.get('/api/admin/stats', async (c) => {
  const adminKey = c.req.header('X-Admin-Key')
  if (adminKey !== 'hc-admin-2025') {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const supa = c.env.SUPABASE_URL || SUPA_URL
  const key  = c.env.SUPABASE_SERVICE_KEY || SUPA_ANON

  const headers = {
    'apikey':        key,
    'Authorization': `Bearer ${key}`,
    'Accept':        'application/json',
  }

  try {
    const [bizRes, locRes, leadRes] = await Promise.all([
      fetch(`${supa}/rest/v1/businesses?select=id,business_name,email,subscription_status,created_at&order=created_at.desc&limit=500`, { headers }),
      fetch(`${supa}/rest/v1/locations?select=id,business_id,name,city,state,subscription_status,created_at&order=created_at.desc&limit=2000`, { headers }),
      fetch(`${supa}/rest/v1/leads?select=id,email,name,source,business_id,location_id,business_name,location_name,created_at&order=created_at.desc&limit=5000`, { headers }),
    ])

    const [businesses, locations, leads] = await Promise.all([
      bizRes.json(),
      locRes.json(),
      leadRes.json(),
    ])

    return c.json({ businesses, locations, leads })
  } catch (err) {
    return c.json({ error: 'Failed to fetch admin stats' }, 500)
  }
})

// ══════════════════════════════════════════════════════════════════
//  PRINT STUDIO — fal.ai + Prodigi
// ══════════════════════════════════════════════════════════════════

// ── 6. Generate AI Designs via fal.ai ────────────────────────
app.post('/api/generate-design', async (c) => {
  const userId = await getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const { prompt, count = 4 } = await c.req.json<{ prompt: string; count?: number }>()
  if (!prompt) return c.json({ error: 'prompt is required' }, 400)

  const falKey = c.env.FAL_API_KEY || '5b2e2e48-a9fb-4a98-b213-fbf32cb48740:cf580383fe02519d6c4ecec2441c79d0'

  // Generate all variants in parallel via fal.ai FLUX model
  const numImages = Math.min(count || 4, 4)

  try {
    // Use fal.ai REST API directly — fal-ai/flux/schnell is fast and cheap
    const falRes = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        num_images: numImages,
        image_size: 'square_hd',  // 1024×1024 — good for stickers
        num_inference_steps: 4,
        enable_safety_checker: false,
      })
    })

    if (!falRes.ok) {
      const errText = await falRes.text()
      console.error('[generate-design] fal.ai error:', errText)
      return c.json({ error: 'Image generation failed', detail: errText }, 500)
    }

    const falData = await falRes.json() as { images?: { url: string }[] }
    const images = (falData.images || []).map((img: { url: string }) => img.url)

    return c.json({ images })
  } catch (err) {
    console.error('[generate-design] error:', err)
    return c.json({ error: 'Generation service error' }, 500)
  }
})

// ── 7. Create Prodigi Print Order ─────────────────────────────
app.post('/api/create-print-order', async (c) => {
  const userId = await getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json<{
    sku: string
    copies: number
    shippingMethod: string
    imageUrl: string
    businessName?: string
    locationName?: string
    qrUrl?: string
    recipient: {
      name: string
      email: string
      address: {
        line1: string
        line2?: string
        postalOrZipCode: string
        countryCode: string
        townOrCity: string
        stateOrCounty?: string
      }
    }
  }>()

  if (!body.sku || !body.imageUrl || !body.recipient) {
    return c.json({ error: 'sku, imageUrl, and recipient are required' }, 400)
  }

  const prodigiKey = c.env.PRODIGI_API_KEY || PRODIGI_KEY_DEFAULT
  const merchantRef = `hc-${userId.slice(0,8)}-${Date.now()}`

  const orderPayload = {
    merchantReference: merchantRef,
    shippingMethod: body.shippingMethod || 'Budget',
    recipient: {
      name: body.recipient.name,
      email: body.recipient.email,
      address: body.recipient.address
    },
    items: [
      {
        merchantReference: `${body.businessName || 'HappyClientele'}-${body.locationName || 'Location'}`,
        sku: body.sku,
        copies: body.copies || 1,
        sizing: 'fillPrintArea',
        assets: [
          {
            printArea: 'default',
            url: body.imageUrl
          }
        ]
      }
    ],
    metadata: {
      userId,
      businessName: body.businessName || '',
      locationName: body.locationName || '',
      qrUrl: body.qrUrl || '',
      source: 'happyclientele-print-studio'
    }
  }

  try {
    const res = await fetch(`${PRODIGI_API}/orders`, {
      method: 'POST',
      headers: {
        'X-API-Key': prodigiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload)
    })

    const data = await res.json() as { outcome?: string; order?: { id: string }; debugDetails?: unknown }

    if (!res.ok || (data.outcome && !['Created', 'OnHold', 'CreatedWithIssues'].includes(data.outcome))) {
      console.error('[create-print-order] Prodigi error:', data)
      return c.json({ error: 'Prodigi order failed', detail: data }, 500)
    }

    const orderId = data.order?.id || 'unknown'
    console.log(`[create-print-order] Order created: ${orderId} for user ${userId}`)

    return c.json({ orderId, outcome: data.outcome, merchantReference: merchantRef })
  } catch (err) {
    console.error('[create-print-order] error:', err)
    return c.json({ error: 'Print order service error' }, 500)
  }
})

// ── 8. List Prodigi Print Orders ──────────────────────────────
app.get('/api/print-orders', async (c) => {
  const userId = await getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const prodigiKey = c.env.PRODIGI_API_KEY || PRODIGI_KEY_DEFAULT

  try {
    const res = await fetch(`${PRODIGI_API}/orders?top=50`, {
      headers: { 'X-API-Key': prodigiKey }
    })
    const data = await res.json() as { outcome?: string; orders?: unknown[] }

    if (!res.ok) {
      return c.json({ orders: [] })
    }

    // Filter to orders matching this user's merchant references
    const allOrders = (data.orders || []) as Array<{ merchantReference?: string }>
    const userOrders = allOrders.filter((o) =>
      o.merchantReference?.startsWith(`hc-${userId.slice(0,8)}-`)
    )

    return c.json({ orders: userOrders })
  } catch (err) {
    console.error('[print-orders] error:', err)
    return c.json({ orders: [] })
  }
})

// ── 9. Prodigi Product Details ────────────────────────────────
app.get('/api/print-product/:sku', async (c) => {
  const sku = c.req.param('sku')
  const prodigiKey = c.env.PRODIGI_API_KEY || PRODIGI_KEY_DEFAULT

  const res = await fetch(`${PRODIGI_API}/products/${sku}`, {
    headers: { 'X-API-Key': prodigiKey }
  })
  const data = await res.json()
  return c.json(data)
})

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
  '/admin':          '/admin.html',
  '/print-studio':   '/print-studio.html',
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
