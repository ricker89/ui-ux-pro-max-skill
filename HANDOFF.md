# HappyClientele — Session Handoff Notes
## Saved: March 2026

---

## 🎯 The Goal
**$97,000/month ARR = 1,000 paying users at $97/mo**

---

## 📍 Where We Left Off — Active Action Items

### Immediate (do these first when back):

| # | Task | File | Notes |
|---|------|------|-------|
| 1 | Create `menus` Supabase table | SQL Editor | SQL is in README.md |
| 2 | Create `menus` storage bucket (public) | Supabase → Storage → New Bucket → name: `menus`, toggle Public ON | For PDF uploads |
| 3 | Add `source` column to `leads` table | SQL Editor | `ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'funnel';` |
| 4 | Create Make.com account + webhook scenario | make.com | Free tier works. Webhook → Router (on `type` field) → Sleep(delayMinutes) → Send Email |
| 5 | Paste Make.com webhook URL | `funnel.html` line ~420 AND `menu.html` line ~35 | `const WEBHOOK_URL = 'YOUR_URL';` |
| 6 | Run leads RLS policies in Supabase | SQL Editor | See README.md — `leads_insert_anon` + `leads_owner_read` policies |
| 7 | Run menus RLS policies in Supabase | SQL Editor | `menus_owner` + `menus_public_read` — SQL in README.md |
| 8 | Test full funnel flow end-to-end | Browser | Scan QR → enter email → tap Leave Review → confirm lead appears in dashboard |
| 9 | Test Super Menu flow | Browser | `menu.html?biz=your-slug` → enter email → open menu → wait for timer overlay |

---

## 🏗️ What's Built (Current State)

### Files
| File | Status | Purpose |
|------|--------|---------|
| `index.html` | ✅ Live | Marketing landing page |
| `signup.html` | ✅ Live | Onboarding + Stripe redirect |
| `login.html` | ✅ Live | Auth, handles `?next=` redirect |
| `welcome.html` | ✅ Live v5.7 | Owner dashboard — QR, leads table, Super Menu card |
| `account.html` | ✅ Live | Settings — biz profile (slug/URL locked), billing |
| `funnel.html` | ✅ Live v3.0 | 4-step customer funnel — stars → recommend → email → review |
| `menu.html` | ✅ NEW v1.0 | Super Menu — email capture → PDF link → timed review prompt |
| `feedback.html` | ✅ Live | Private feedback capture |
| `funnel-preview.html` | ✅ Rebuilt | Internal preview of all 4 steps + all screens |
| `js/boot.js` | ✅ | Auth guard + DB fetch + renderPage caller |
| `js/topbar.js` | ✅ | User menu — shows business name |

### Features Working
- Supabase auth (signup, login, session, auth guard)
- Dashboard loads business data from DB
- QR code generation + download
- Review funnel v3.0 (4 steps)
- Email capture → Supabase `leads` table
- Leads card in dashboard (stats + table + CSV export)
- Super Menu card in dashboard (URL/PDF upload, incentive, timer chips, QR)
- `menu.html` customer page (fully built, needs DB tables + webhook to go live)
- Single `WEBHOOK_URL` constant in both `funnel.html` and `menu.html`
- Debug bars hidden by default (Alt+D to reveal)
- Favicon + OG social preview cards
- Clean URL config (_redirects + vercel.json)

### Not Yet Wired (built but waiting on external setup)
- Make.com webhook (reward code emails + menu review prompts)
- Supabase `menus` table (SQL not yet run)
- Supabase Storage `menus` bucket (not yet created)
- Printful integration (needs serverless function — identified blocker)
- Stripe webhook (subscription status sync — needs serverless function)

---

## 🔑 Single Most Important Thing To Do First
**Make.com setup** — it unblocks reward code emails (funnel) AND menu review prompts simultaneously. One 15-minute setup, two features go live.

---

## 💡 Conversation Context — Scaling Discussion (March 2026)

### The goal: $97k/mo = 1,000 users
- Current hosting: Genspark static deploy (CDN only, no serverless)
- Current architecture: Static frontend + Supabase (DB/auth) + Stripe (payments)
- Identified scaling constraints being discussed at time of save

### Make.com
- Account: us2.make.com (organization 6837642)
- Webhook URL: `https://hook.us2.make.com/71c6bp3dkpejjip6aklpnwrtijst1iee`
- Status: URL wired into funnel.html + menu.html ✅
- Scenario: needs Router + Sleep + Email modules (in progress)
1. **Stay static** for now — Supabase handles auth + DB, no Node server needed
2. **Serverless functions needed for**: Printful API key, Stripe webhooks, account deletion
3. **Make.com as middleware** for all email automation (vs. Netlify functions)
4. **Genspark → Vercel/Netlify migration** needed before serverless functions can be added

---

## 📋 Backlog (Prioritized)

### High Priority
- [ ] All 9 action items above (wire Make.com, run SQL migrations)
- [ ] Welcome email on signup (Make.com `welcome` webhook type — already in payload spec)
- [ ] Stripe webhook → subscription status sync (needs Vercel/Netlify serverless)
- [ ] Billing portal session creator (needs serverless)

### Medium Priority  
- [ ] Printful integration (needs serverless + Make.com migration to Vercel)
- [ ] Password strength meter on signup
- [ ] Session token auto-refresh on long sessions
- [ ] Funnel preview — add Super Menu preview page

### Lower Priority / Future
- [ ] Multi-location support (one owner, multiple business slugs)
- [ ] Analytics dashboard (scan counts, conversion rate, review count delta)
- [ ] White-label / agency tier pricing
- [ ] SMS review prompts (Twilio) as alternative to email
- [ ] Google review count polling (track growth over time)

---

## 🧱 Tech Stack Summary
| Layer | Tool | Notes |
|-------|------|-------|
| Hosting | Genspark static (→ migrate to Vercel) | |
| DB + Auth | Supabase (free tier) | |
| Payments | Stripe ($97/mo subscription) | |
| Email automation | Make.com (pending setup) | |
| QR codes | Google Charts API | |
| Places API | Google Places (New) | |
| Print fulfillment | Printful (planned) | Needs serverless |

---

## 🔐 Credentials Reminder (check your password manager)
- Supabase project: `dbbryatmoxlzifsurxrm`
- Google Places API key: stored in `welcome.html` as `GBIZ_API_KEY`
- Stripe payment link: in `signup.html` as `STRIPE_PAYMENT_LINK`
- Supabase anon key: in `js/supabase.js`, `boot.js`, `funnel.html`, `menu.html`

---

*Saved end of session — March 2026. Resume from "Action Items" section above.*
