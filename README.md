# HappyClientele — Full Stack Architecture

## Current Status (dashboard v1.0 / funnel v3.0 / menu v1.0 / wifi v1.0)

### ✅ Completed & Working
| Feature | Status | Notes |
|---------|--------|-------|
| Supabase signup (user + businesses + accounts rows) | ✅ | Direct `fetch` upsert bypasses broken `_getToken` |
| Stripe checkout redirect with pre-filled email | ✅ | `client_reference_id` = slug |
| Login via `login.html` | ✅ | Session saved to `sb-xxx-auth-token` key; redirects to `dashboard.html` |
| **New: `dashboard.html`** | ✅ | Full operating dashboard — replaces `welcome.html` as primary post-login destination |
| `welcome.html` | 🗄️ Preserved | Kept as reference; no longer the active dashboard |
| `boot.js` | ✅ | Now redirects authenticated users to `dashboard.html` |
| QR code generation | ✅ | Per-feature QR blocks (Funnel / Menu / Wi-Fi) with Download, Print, Order buttons |
| **Google Business stats bar** | ✅ | Fetches live rating + review count from Places API; shows "Started at X / Now Y" with delta badge |
| **Starting stats baseline** | ✅ | `starting_rating` + `starting_review_count` saved on first dashboard load (one-time write to Supabase) |
| **Feature toggles** | ✅ | ON/OFF per feature; saved as `feature_flags` JSON to Supabase `businesses` table |
| **Collapsible sections** | ✅ | Each feature card expands/collapses with chevron; toggle is independent of expand |
| **Customer Emails card** | ✅ | Live feed, filter dropdown, 20-row pagination, source badges (QR / Menu / Wi-Fi), Date & Time |
| **Review Incentive Funnel section** | ✅ | Incentive input + chips, live QR preview, funnel URL + Google URL |
| **Super Menu section** | ✅ | Menu URL, timer chips, optional incentive toggle, QR preview |
| **Super Wi-Fi section** | ✅ | Network name, password, timer chips, skip/name toggles, QR preview |
| **Printed Materials section** | ✅ | PDF-first placeholder; Prodigi physical fulfillment coming soon |
| Leads source tracking | ✅ | `source` field: `funnel` / `menu` / `wifi`; colour-coded badges in table |
| Make.com webhook | ✅ | All three funnels send typed payloads; Routes 1/2/3 for reward_code / menu_review_prompt / welcome |
| OG / Social preview cards | ✅ | `images/og-preview.png` for index + signup |
| Topbar shows business name | ✅ | `topbar.js` polls `window._biz.bizName`; falls back to email username |
| Clean URLs | ✅ | `_redirects` (Netlify) + `vercel.json` — `/login`, `/signup`, `/dashboard`, `/r/:slug` |
| Auth guard on welcome.html | ✅ | `boot.js` redirects to `login.html?next=welcome.html` if no token |
| **Debug bars hidden by default** | ✅ | Both bars invisible in production; press **Alt+D** to reveal |

### ❌ Root Cause Fixed (2025-03-08)
A **stray `link.click();` and extra `}`** appeared after the `downloadQR()` function in `welcome.html`. This created a **JavaScript syntax error** in the entire `<script>` block, which caused the browser to discard ALL functions (`renderPage`, `bindActions`, `generateQR`, `initWelcomeGBP`, etc.) — leaving `boot.js` unable to call `renderPage` even after successfully fetching the business data.

**Fix**: Removed the duplicate `link.click()` and extra `}` at lines 2285–2286.

---

## Funnel Flow (v3.0)

```
QR Scan
 └→ Step 1: Star rating (1–5)
 └→ Step 2: "Would you recommend [Business]?" (Definitely / Not Sure)
 └→ Routing:
     ├── 4–5★ + Definitely → Step 3 (email capture, incentive offer)
     │    └→ Step 4: "Leave a Review" button (opens Google in new tab)
     │         └→ On tap: save review_tapped flag in Supabase
     │              └→ If email + webhook configured: show "Check your inbox"
     │                   └→ After 60s: POST to Make.com → send code email
     │              └→ No email / no webhook: show on-screen code (HC-XXXX)
     └── <4★ OR Not Sure → Negative path: "Send Private Feedback"
          └→ Redirect to feedback.html
```

### Routing table
| Stars | Recommend | Result |
|-------|-----------|--------|
| 4–5 ⭐ | Definitely 👍 | Step 3 (email) → Step 4 (Google review button) |
| 4–5 ⭐ | Not Sure 🤔 | Negative path → Private feedback |
| 1–3 ⭐ | Either | Negative path → Private feedback |

---

## Customer Leads (Email Capture)

Every funnel interaction that reaches Step 3 saves a row in the **Supabase `leads` table**:

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Row ID |
| `business_slug` | text | Links to `businesses.slug` |
| `email` | text | Customer email (nullable if skipped) |
| `incentive` | text | Incentive text shown at time of capture |
| `code` | text | Generated code e.g. `HC-4F2A` |
| `stars` | int | 1–5 star rating |
| `review_tapped` | bool | True if "Leave a Review" was tapped |
| `code_sent` | bool | True if email was sent via webhook |
| `created_at` | timestamptz | Auto-set by Supabase |

**Required RLS policies** (run in Supabase SQL Editor):
```sql
-- Allow anonymous INSERT (customer funnel — no auth)
CREATE POLICY "leads_insert_anon" ON leads FOR INSERT WITH CHECK (true);

-- Allow authenticated owner to read their own business leads
CREATE POLICY "leads_owner_read" ON leads FOR SELECT USING (
  business_slug IN (SELECT slug FROM businesses WHERE user_id = auth.uid())
);
```

---

## Webhook Integration (Make.com)

To send reward codes via email, set `WEBHOOK_URL` at the top of `funnel.html`:

```js
const WEBHOOK_URL = 'https://hook.us1.make.com/YOUR_WEBHOOK_ID';
```

**Payload sent to webhook:**
```json
{
  "email":     "customer@gmail.com",
  "code":      "HC-4F2A",
  "bizName":   "Bocashi CoffeeHouse",
  "incentive": "Free coffee ☕",
  "bizSlug":   "bocashi-coffeehouse",
  "stars":     5
}
```

If `WEBHOOK_URL` is empty string `''`, the funnel shows the code on-screen instead.

---

## Debug Bars

Both debug bars (green monospace bars at the bottom of `welcome.html`) are **hidden by default** in production.

Press **Alt+D** on any keyboard to show/hide them. They log every step of the boot, DB fetch, renderPage, and QR generation cycle.

---

## Clean URLs (No .html)

Two config files handle this — Genspark/Netlify uses `_redirects`, Vercel uses `vercel.json`:

| Clean URL | Resolves to |
|-----------|------------|
| `/login` | `login.html` |
| `/signup` | `signup.html` |
| `/dashboard` | `welcome.html` |
| `/account` | `account.html` |
| `/r/bocashi-coffeehouse` | `funnel.html?biz=bocashi-coffeehouse` |

---

## Social Preview Cards

When someone shares `https://happyclientele.com` in iMessage, WhatsApp, Slack, or Twitter, they'll see:

- **Image**: `images/og-preview.png` (1365×768 — black card, yellow star, white headline)
- **Title**: "HappyClientele — Turn Every Customer Into a 5-Star Review"
- **Description**: "Print. Place. Watch reviews grow."

---

## Version System

`welcome.html` uses a **single source of truth**:
```js
const APP_VERSION = '5.7';  // ← change only here
```
This constant automatically updates the page title, version stamp, and debug bar label.

---

## ⚠️ Required Supabase SQL: Public Read Policy

`funnel.html` and `feedback.html` are scanned by **unauthenticated customers** (QR code scans). Without a public read policy, Supabase RLS blocks the anon lookup and shows "Page not found."

Run this once in **Supabase → SQL Editor**:

```sql
-- Allow anyone to read a business row by slug (funnel.html QR scans)
CREATE POLICY "businesses_public_read" ON businesses
  FOR SELECT USING (true);
```

---

## File Reference

| File | Purpose |
|------|---------|
| `index.html` | Marketing landing page |
| `signup.html` | Onboarding form → Stripe checkout |
| `login.html` | Auth page — password or magic link sign in |
| `welcome.html` | **Owner dashboard** — QR code, review links, incentive editor, stats, leads table |
| `account.html` | Account settings — business profile, billing portal, password, danger zone |
| `funnel.html` | Customer-facing review funnel v3.0 (4-step flow) |
| `feedback.html` | Private feedback capture page |
| `thankyou.html` | Post-feedback thank you page |
| `menu.html` | Customer-facing Super Menu page (email capture → PDF link → timed review prompt) |
| `funnel-preview.html` | **Internal preview** — pixel-perfect funnel demo with step controls |
| `debug.html` | Debug log viewer (reads `hc_debug_log` from localStorage) |
| `js/supabase.js` | Shared Supabase client + auth + DB helpers |
| `js/topbar.js` | Injects authenticated user menu into any page |
| `js/boot.js` | Fetches business data + calls renderPage; enforces auth guard |

---

## Tech Stack

| Layer | Tool | Notes |
|-------|------|-------|
| **Hosting** | Genspark / Vercel / Netlify | Deploy as static site |
| **Database + Auth** | [Supabase](https://supabase.com) | Free tier, Postgres + auth |
| **Payments** | [Stripe](https://stripe.com) | Subscriptions + Customer Portal |
| **QR Codes** | Google Charts API + qrserver.com fallback | Client-side, no JS lib |
| **Maps / Places** | Google Places API (New) | Business search + rating lookup |
| **Email delivery** | Make.com webhook (pending) | Reward code emails; can swap for Netlify function |

---

## ⚠️ Required Supabase SQL: New businesses columns (run once)

```sql
-- Rich Google Business Profile data + mailing address + social links
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS address          text,
  ADD COLUMN IF NOT EXISTS google_phone     text,
  ADD COLUMN IF NOT EXISTS google_website   text,
  ADD COLUMN IF NOT EXISTS google_rating    numeric(3,1),
  ADD COLUMN IF NOT EXISTS google_review_count integer,
  ADD COLUMN IF NOT EXISTS google_menu_url  text,
  ADD COLUMN IF NOT EXISTS website          text,
  ADD COLUMN IF NOT EXISTS social_facebook  text,
  ADD COLUMN IF NOT EXISTS social_instagram text,
  ADD COLUMN IF NOT EXISTS social_twitter   text,
  ADD COLUMN IF NOT EXISTS social_youtube   text,
  ADD COLUMN IF NOT EXISTS social_tiktok    text;

-- Menu source toggle on menus (the actual table name)
ALTER TABLE menus
  ADD COLUMN IF NOT EXISTS menu_source text DEFAULT 'custom';
```

**What each column is for:**

| Column | Source | Usage |
|--------|--------|-------|
| `address` | Auto-pulled from Google Places on business save | Displayed in Account Settings confirmed card; used for print shipments |
| `google_phone` | Auto-pulled from Google Places | Shown read-only in Account Settings detail panel |
| `google_website` | Auto-pulled from Google Places | Shown read-only; auto-fills `website` field if empty |
| `google_rating` | Auto-pulled from Google Places | Shown read-only in Account Settings detail panel |
| `google_review_count` | Auto-pulled from Google Places | Shown read-only in Account Settings detail panel |
| `google_menu_url` | Manual (owner pastes from Google) | Used by `menu.html` when `menu_source = 'google'` |
| `website` | Editable by owner (pre-filled from Google) | Footer of emails, future use |
| `social_facebook` | Editable by owner | Email footers, future use |
| `social_instagram` | Editable by owner | Email footers, future use |
| `social_twitter` | Editable by owner | Email footers, future use |
| `social_youtube` | Editable by owner | Email footers, future use |
| `social_tiktok` | Editable by owner | Email footers, future use |
| `menu_settings.menu_source` | Owner toggle | `'custom'` = PDF/URL tab; `'google'` = Google Menu URL |

---

## What's Still Needed (Next Steps)

- [ ] **Run the SQL above** to add the new businesses columns + menu_source column
- [ ] **Make.com webhook** — configure scenario + paste URL into `funnel.html` AND `menu.html` `WEBHOOK_URL` constant
- [ ] **Supabase `menus` table** — run SQL above to create table + RLS policies
- [ ] **Supabase Storage bucket `menus`** — create public bucket for PDF uploads (Dashboard → Storage → New Bucket → name: `menus`, Public: on)
- [ ] **`source` column on `leads`** — run `ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'funnel';`
- [ ] **Serverless webhook handler** (`api/webhook-stripe.js`) — syncs Stripe subscription status to Supabase
- [ ] **Serverless portal session creator** (`api/create-portal-session.js`) — dynamic Stripe billing portal sessions
- [ ] **Printful integration** — serverless function to POST orders (key must stay server-side)
- [ ] **Session refresh** — auto-refresh Supabase tokens on long sessions

---

*Last updated: March 2026 — v5.8 account rich GBP / dashboard menu source toggle*


### ✅ Completed & Working
| Feature | Status | Notes |
|---------|--------|-------|
| Supabase signup (user + businesses + accounts rows) | ✅ | Direct `fetch` upsert bypasses broken `_getToken` |
| Stripe checkout redirect with pre-filled email | ✅ | `client_reference_id` = slug |
| Login via `login.html` | ✅ | Session saved to `sb-xxx-auth-token` key |
| Owner dashboard (`welcome.html`) loads biz from DB | ✅ | `boot.js` direct-fetch pattern |
| `renderPage` null-safe DOM writes | ✅ | `_set()` helper; all element writes guarded |
| QR code generation | ✅ | Google Charts API (no JS lib), fallback to qrserver.com |
| QR URL simplified | ✅ | `funnel.html?biz=slug` only — no incentive in URL |
| Google Business picker pre-populated | ✅ | `initWelcomeGBP` uses `biz.placeId` from DB |
| Account settings page | ✅ | Reads from DB via `js/supabase.js` |
| Version consistency | ✅ | Single `APP_VERSION` constant in welcome.html drives title + debug bar + stamp |
| Funnel v2.4 — direct Google review link | ✅ | `btnGoogle` is an `<a>` tag, single tap on mobile |
| Funnel v2.4 — Back button | ✅ | `‹ Back` shown on steps 2 & 3 |
| Funnel v2.4 — Smart routing | ✅ | 5★ + "Definitely" → Google; anything else → private feedback |
| Funnel v2.4 — `#negNote` crash fixed | ✅ | `handleFeedbackRedirect` now null-checks the element |
| funnel-preview.html — pixel-perfect preview | ✅ | Rebuilt to exactly mirror live funnel; hardcoded demo data; no fetches |
| **Favicon** | ✅ | `images/favicon.png` — yellow star on black, applied to all pages |
| **OG / Social preview cards** | ✅ | `images/og-preview.png` — iMessage, WhatsApp, Twitter preview on index + signup |
| **Topbar shows business name** | ✅ | `topbar.js` polls `window._biz.bizName`; falls back to email username |
| **Clean URLs** | ✅ | `_redirects` (Netlify) + `vercel.json` — `/login`, `/signup`, `/dashboard`, `/r/:slug` |

### ❌ Root Cause Fixed (2025-03-08)
A **stray `link.click();` and extra `}`** appeared after the `downloadQR()` function in `welcome.html`. This created a **JavaScript syntax error** in the entire `<script>` block, which caused the browser to discard ALL functions (`renderPage`, `bindActions`, `generateQR`, `initWelcomeGBP`, etc.) — leaving `boot.js` unable to call `renderPage` even after successfully fetching the business data.

**Fix**: Removed the duplicate `link.click()` and extra `}` at lines 2285–2286.

---

## Clean URLs (No .html)

Two config files handle this — Genspark/Netlify uses `_redirects`, Vercel uses `vercel.json`:

| Clean URL | Resolves to |
|-----------|------------|
| `/login` | `login.html` |
| `/signup` | `signup.html` |
| `/dashboard` | `welcome.html` |
| `/account` | `account.html` |
| `/r/bocashi-coffeehouse` | `funnel.html?biz=bocashi-coffeehouse` |

> **Note**: The `/r/:slug` shortlink is a convenience alias. QR codes already use `funnel.html?biz=slug` directly, which works without the redirect config.

---

## Social Preview Cards

When someone shares `https://happyclientele.com` in iMessage, WhatsApp, Slack, or Twitter, they'll see:

- **Image**: `images/og-preview.png` (1365×768 — black card, yellow star, white headline)
- **Title**: "HappyClientele — Turn Every Customer Into a 5-Star Review"
- **Description**: "Print. Place. Watch reviews grow."

The `signup.html` page also has its own OG card for when a sales link gets shared.

---

## Favicon

`images/favicon.png` — yellow ⭐ star on black background.
Applied to all HTML pages via:
```html
<link rel="icon" type="image/png" href="images/favicon.png" />
<link rel="apple-touch-icon" href="images/favicon.png" />
```

---

| Stars | Recommend? | Step 3 shows |
|-------|-----------|--------------|
| 4–5 ⭐ | Definitely 👍 | ⭐ Leave a Review (Google) + private feedback link |
| 4–5 ⭐ | Not Sure 🤔 | Private Feedback only |
| 1–3 ⭐ | Either | Private Feedback only |

The Google review button is a direct `<a href target="_blank">` — one tap, no extra redirect screen.

---

## Version System

`welcome.html` now uses a **single source of truth**:
```js
const APP_VERSION = '5.5';  // ← change only here
```
This constant automatically updates:
- `<title>HC Dashboard v5.5</title>`
- The on-page version stamp (`#versionStamp`)
- The green debug bar (`v5.5 DEBUG BAR`)
- The `dbgLog` startup message

---

## ⚠️ Required Supabase SQL: Public Read Policy

`funnel.html` and `feedback.html` are scanned by **unauthenticated customers** (QR code scans). Without a public read policy, Supabase RLS blocks the anon lookup and shows "Page not found."

Run this once in **Supabase → SQL Editor**:

```sql
-- Allow anyone to read a business row by slug (funnel.html QR scans)
CREATE POLICY "businesses_public_read" ON businesses
  FOR SELECT USING (true);
```

---



| File | Purpose |
|------|---------|
| `index.html` | Marketing landing page |
| `signup.html` | Onboarding form → Stripe checkout |
| `thankyou.html` | Post-feedback thank you page |
| `funnel.html` | Customer-facing review funnel (star rating → Google or private feedback) |
| `feedback.html` | Private feedback capture page |
| `welcome.html` | **Owner dashboard** — QR code, review links, incentive editor, stats |
| `login.html` | Auth page — password or magic link sign in |
| `account.html` | Account settings — business profile, billing portal, password, danger zone |
| `js/supabase.js` | Shared Supabase client + auth + DB helpers |
| `js/topbar.js` | Injects authenticated user menu into any topbar |
| `js/main.js` | Landing page interactions |

---

## Tech Stack

| Layer | Tool | Notes |
|-------|------|-------|
| **Hosting** | Vercel / Netlify | Deploy as static site |
| **Database + Auth** | [Supabase](https://supabase.com) | Free tier, Postgres + auth |
| **Payments** | [Stripe](https://stripe.com) | Subscriptions + Customer Portal |
| **QR Codes** | qrcodejs (CDN) | Client-side, no backend needed |
| **Maps / Places** | Google Places API (New) | Business search + rating lookup |

---

## Setup Guide

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project
2. Go to **Project Settings → API**
3. Copy your **Project URL** and **anon public key**
4. Open `js/supabase.js` and replace:
   ```js
   const SUPABASE_URL      = 'https://YOUR_PROJECT.supabase.co';
   const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';
   ```

### 2. Run the database migrations

In your Supabase project → **SQL Editor**, run:

```sql
-- ── Users / Accounts table ──────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT,
  phone                 TEXT,
  stripe_customer_id    TEXT DEFAULT '',
  stripe_subscription_id TEXT DEFAULT '',
  subscription_status   TEXT DEFAULT 'pending',
  current_period_end    BIGINT,         -- Unix timestamp from Stripe webhook
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ── Business Profiles table ──────────────────────────────
CREATE TABLE IF NOT EXISTS businesses (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  biz_name          TEXT,
  slug              TEXT UNIQUE,
  google_url        TEXT,
  google_place_id   TEXT DEFAULT '',
  incentive         TEXT DEFAULT '',
  phone             TEXT DEFAULT '',
  rating            NUMERIC(3,1),
  rating_count      INTEGER,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ── Row Level Security ───────────────────────────────────
ALTER TABLE accounts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own rows
CREATE POLICY "accounts: own rows" ON accounts
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "businesses: own rows" ON businesses
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 3. Configure Stripe

1. Create a **Subscription Product** at $97/month in Stripe dashboard
2. Create a **Payment Link** for that product
3. Set the **Success URL** to: `https://yourdomain.com/welcome.html?signup=1`
4. Open `signup.html` and replace:
   ```js
   const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/REPLACE_WITH_YOUR_LINK';
   ```
5. Enable the **Stripe Customer Portal** in:
   Stripe Dashboard → Settings → Billing → Customer Portal
6. Open `account.html` and replace the fallback portal link:
   ```js
   const STRIPE_PORTAL_FALLBACK = 'https://billing.stripe.com/p/login/REPLACE_WITH_YOURS';
   ```

### 4. Set up Stripe Webhooks (for subscription status sync)

Create a serverless function (Vercel/Netlify) at `POST /api/webhook-stripe` that:
- Verifies the Stripe signature
- On `customer.subscription.updated` / `deleted` / `created`:
  - Updates `accounts.subscription_status` and `accounts.current_period_end`
  - Updates `accounts.stripe_customer_id` and `stripe_subscription_id`

Example Node.js handler (Vercel):
```js
// api/webhook-stripe.js
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe    = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase  = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  const sig    = req.headers['stripe-signature'];
  const event  = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);

  const sub = event.data.object;
  const customerEmail = sub.customer_email || 
    (await stripe.customers.retrieve(sub.customer)).email;

  await supabase.from('accounts')
    .update({
      subscription_status:    sub.status,
      stripe_customer_id:     sub.customer,
      stripe_subscription_id: sub.id,
      current_period_end:     sub.current_period_end,
      updated_at:             new Date().toISOString()
    })
    .eq('email', customerEmail);

  res.json({ received: true });
}
```

### 5. Configure Supabase Auth

In Supabase dashboard → **Authentication → URL Configuration**:
- **Site URL**: `https://yourdomain.com`
- **Redirect URLs**: `https://yourdomain.com/welcome.html`, `https://yourdomain.com/login.html`

In **Authentication → Email Templates**, customize the magic link and password reset emails with your branding.

---

## User Flows

### New Signup
```
signup.html
  → User fills form (biz name, email, password)
  → Supabase account created
  → Business row saved to DB
  → Redirect to Stripe Payment Link
  → Stripe charges card
  → Redirect to welcome.html?signup=1
  → Stripe webhook fires → account.subscription_status = 'active'
```

### Returning Login
```
login.html
  → Email + password  OR  magic link email
  → On success → redirect to welcome.html
  → welcome.html loads biz data from Supabase (not localStorage)
```

### Billing Management
```
account.html → "Manage Billing" button
  → POST /api/create-portal-session (sends stripe_customer_id)
  → Stripe creates portal session → redirect URL returned
  → User lands on Stripe Customer Portal (hosted by Stripe)
  → Can: update card, cancel, view invoices, reactivate
  → On cancel: Stripe webhook fires → subscription_status = 'canceled'
```

### Password Reset
```
login.html → "Forgot password?" link
  → User enters email
  → Supabase sends reset email
  → User clicks link → redirected to account.html with token in hash
  → account.html detects token → user can set new password
```

---

## Environment Variables (for serverless functions)

| Variable | Where to get it |
|----------|----------------|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → Signing secret |
| `SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API (service_role key) |

---

## What's Still Needed (Next Steps)

- [ ] **Serverless webhook handler** (`api/webhook-stripe.js`) — syncs Stripe subscription status to Supabase
- [ ] **Serverless portal session creator** (`api/create-portal-session.js`) — creates dynamic Stripe billing portal sessions per customer
- [ ] **Serverless account delete** (`api/delete-account.js`) — deletes Supabase auth user (requires service role key, can't be done client-side)
- [ ] **Email on signup** — send welcome email via Supabase Auth or Resend.com
- [ ] **funnel.html + feedback.html** — update to load business data from Supabase by slug (public endpoint, no auth required)
- [ ] **Password field styling** in signup.html — add pw strength meter
- [ ] **Session refresh** — auto-refresh Supabase tokens on long sessions

---

## Pages & Routes

| URL | Auth Required | Description |
|-----|--------------|-------------|
| `/index.html` | No | Marketing landing page |
| `/signup.html` | No | New account onboarding |
| `/login.html` | No | Sign in / magic link |
| `/welcome.html` | Soft (falls back to localStorage) | Owner dashboard |
| `/account.html` | Yes | Account settings |
| `/funnel.html?biz=slug` | No | Customer review funnel |
| `/feedback.html?biz=slug` | No | Private feedback form |
| `/thankyou.html` | No | Post-feedback confirmation |

---

*Last updated: March 2026*
