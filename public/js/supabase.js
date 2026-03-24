/* ════════════════════════════════════════════════════════════════
   js/supabase.js  — Official Supabase SDK wrapper
   ─────────────────────────────────────────────────────────────
   Uses the official @supabase/supabase-js v2 SDK loaded from CDN.
   Exposes the same  sb.auth.*  and  sb.db.*  API that all pages use,
   plus the same top-level helpers: requireAuth, loadBusiness,
   loadAccount, saveBusiness.

   The SDK handles localStorage key naming, token refresh, and RLS
   correctly — no more hand-rolled session management.
════════════════════════════════════════════════════════════════ */

const SUPABASE_URL      = 'https://dbbryatmoxlzifsurxrm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRiYnJ5YXRtb3hsemlmc3VyeHJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NDUzNTMsImV4cCI6MjA4ODUyMTM1M30.b_Ge4bNFu3nCxXuP10ZEdmFbdVtTn2ZS98nyXoBRfAk';

/* ── Load the official Supabase SDK from CDN synchronously ──
   We use a module-style import shim so it works in plain <script> tags. */
/* ════════════════════════════════════════════════════════════════
   BOOTSTRAP — create the client immediately when this script runs.
   Both CDN script tags are in <head> so window.supabase is available.
════════════════════════════════════════════════════════════════ */
window._supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
    storageKey: `sb-${SUPABASE_URL.split('//')[1]}-auth-token`  // matches SDK default
  }
});

function _getClient() {
  return window._supabaseClient;
}

/* ════════════════════════════════════════════════════════════════
   HELPER — get current access token for raw REST calls
════════════════════════════════════════════════════════════════ */
async function _getToken() {
  const client = _getClient();
  if (!client) return SUPABASE_ANON_KEY;
  const { data } = await client.auth.getSession();
  return data?.session?.access_token || SUPABASE_ANON_KEY;
}

/* ════════════════════════════════════════════════════════════════
   sb  — drop-in replacement, same API as the old hand-rolled client
════════════════════════════════════════════════════════════════ */
const sb = {

  /* ── AUTH ─────────────────────────────────────────────────── */
  auth: {

    async signUp(email, password) {
      const { data, error } = await _getClient().auth.signUp({ email, password });
      if (error) return { error: error.message };
      return data;
    },

    async signIn(email, password) {
      const { data, error } = await _getClient().auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      return data;   // { user, session }
    },

    async sendMagicLink(email, redirectTo) {
      // Carry ?next= through the magic link so the user lands on the right page
      const dest = redirectTo || `${location.origin}/dashboard.html`;
      const { error } = await _getClient().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: dest }
      });
      return error ? { error: error.message } : {};
    },

    async resetPassword(email) {
      const { error } = await _getClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/account.html`
      });
      return error ? { error: error.message } : {};
    },

    async updatePassword(newPassword) {
      const { data, error } = await _getClient().auth.updateUser({ password: newPassword });
      return error ? { error: error.message } : data;
    },

    async updateUser(attrs) {
      const { data, error } = await _getClient().auth.updateUser(attrs);
      return error ? { error: error.message } : data;
    },

    /* Returns session object synchronously from cache */
    getSession() {
      try {
        // SDK v2 default key: sb-{hostname}-auth-token
        const key = `sb-${SUPABASE_URL.split('//')[1]}-auth-token`;
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.access_token) return parsed;
        }
        // Fallback: scan all localStorage keys
        for (const k of Object.keys(localStorage)) {
          if (!k.startsWith('sb-') || !k.includes('auth')) continue;
          try {
            const p = JSON.parse(localStorage.getItem(k));
            if (p?.access_token) return p;
          } catch {}
        }
      } catch {}
      return null;
    },

    /* Returns user object synchronously */
    getUser() {
      const s = this.getSession();
      if (s?.user) return s.user;
      // Decode from JWT sub claim as last resort
      const token = s?.access_token;
      if (!token) return null;
      try {
        const p = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
        if (p.sub) return { id: p.sub, email: p.email || '' };
      } catch {}
      return null;
    },

    async signOut() {
      await _getClient().auth.signOut();
      // Belt-and-suspenders: clear everything supabase-related
      Object.keys(localStorage)
        .filter(k => k.startsWith('sb-') || k.includes('supabase'))
        .forEach(k => localStorage.removeItem(k));
    },

    async handleAuthRedirect() {
      // SDK handles this automatically via detectSessionInUrl
      const { data, error } = await _getClient().auth.getSession();
      if (data?.session) return { session: data.session };
      return null;
    }
  },

  /* ── DATABASE (raw REST, identical API to old client) ─────── */
  db: {
    async select(table, { filter, single, order, limit } = {}) {
      let q = _getClient().from(table).select('*');
      if (filter) {
        // filter is a raw PostgREST string like "user_id=eq.xxx"
        const [col, val] = filter.split('=eq.');
        if (col && val !== undefined) q = q.eq(col, val);
      }
      if (order) q = q.order(order);
      if (limit) q = q.limit(limit);
      if (single) q = q.single();
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data;
    },

    async insert(table, data) {
      const { data: result, error } = await _getClient().from(table).insert(data).select().single();
      if (error) throw new Error(error.message);
      return result;
    },

    async update(table, filter, data) {
      const [col, val] = filter.split('=eq.');
      const { data: result, error } = await _getClient().from(table).update(data).eq(col, val).select().single();
      if (error) throw new Error(error.message);
      return result;
    },

    async upsert(table, data, onConflict = 'id') {
      const { data: result, error } = await _getClient()
        .from(table).upsert(data, { onConflict }).select().single();
      if (error) throw new Error(error.message);
      return result;
    },

    async delete(table, filter) {
      const [col, val] = filter.split('=eq.');
      const { error } = await _getClient().from(table).delete().eq(col, val);
      if (error) throw new Error(error.message);
      return true;
    }
  }
};

/* ════════════════════════════════════════════════════════════════
   HIGH-LEVEL HELPERS
════════════════════════════════════════════════════════════════ */

async function requireAuth(redirectTo = 'login.html') {
  // Let SDK process magic link / OAuth token in URL hash first
  if (window.location.hash.includes('access_token')) {
    await _getClient().auth.getSession();
  }
  const user = sb.auth.getUser();
  if (!user) {
    window.location.replace(redirectTo);
    return null;
  }
  return user;
}

/* Load current user's business row — RLS filters to auth.uid() automatically */
async function loadBusiness() {
  try {
    const { data, error } = await _getClient()
      .from('businesses').select('*').limit(1).maybeSingle();
    if (error) { console.warn('[loadBusiness]', error.message); return null; }
    console.log('[loadBusiness] got:', data?.biz_name || '(none)');
    return data || null;
  } catch(e) {
    console.warn('[loadBusiness] exception:', e);
    return null;
  }
}

/* Load current user's account row — RLS filters to auth.uid() automatically */
async function loadAccount() {
  try {
    const { data, error } = await _getClient()
      .from('accounts').select('*').limit(1).maybeSingle();
    if (error) { console.warn('[loadAccount]', error.message); return null; }
    return data || null;
  } catch(e) {
    return null;
  }
}

/* Save / update business profile */
async function saveBusiness(userId, data) {
  return sb.db.upsert('businesses', { user_id: userId, ...data }, 'user_id');
}

/* ════════════════════════════════════════════════════════════════
   LOCATIONS HELPERS (multi-location)
════════════════════════════════════════════════════════════════ */

/* Load all locations for current user */
async function loadLocations() {
  try {
    const { data, error } = await _getClient()
      .from('locations')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) { console.warn('[loadLocations]', error.message); return []; }
    return data || [];
  } catch(e) {
    console.warn('[loadLocations] exception:', e);
    return [];
  }
}

/* Save / upsert a location row */
async function saveLocation(data) {
  if (data.id) {
    const { data: result, error } = await _getClient()
      .from('locations')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return result;
  } else {
    const { data: result, error } = await _getClient()
      .from('locations')
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return result;
  }
}

/* Soft-delete a location */
async function deleteLocation(locationId) {
  const { error } = await _getClient()
    .from('locations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', locationId);
  if (error) throw new Error(error.message);
  return true;
}
