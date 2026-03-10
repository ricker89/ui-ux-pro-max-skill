/* ════════════════════════════════════════════════════════════════
   js/supabase.js
   ─────────────────────────────────────────────────────────────
   Shared Supabase client + auth/data helpers.
   Include this BEFORE any page-specific scripts.

   SETUP:
   1. Create a free project at https://supabase.com
   2. Go to Project Settings → API
   3. Replace SUPABASE_URL and SUPABASE_ANON_KEY below
   4. Run the SQL in README.md to create the tables
════════════════════════════════════════════════════════════════ */

const SUPABASE_URL      = 'https://dbbryatmoxlzifsurxrm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRiYnJ5YXRtb3hsemlmc3VyeHJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NDUzNTMsImV4cCI6MjA4ODUyMTM1M30.b_Ge4bNFu3nCxXuP10ZEdmFbdVtTn2ZS98nyXoBRfAk';

/* ── Lightweight Supabase REST client (no npm needed) ── */
const sb = (() => {
  const headers = () => ({
    'apikey':        SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${_getToken() || SUPABASE_ANON_KEY}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation'
  });

  function _sessionKey() {
    return `sb-${SUPABASE_URL.split('//')[1].split('.')[0]}-auth-token`;
  }

  // Decode user ID from JWT sub claim — reliable fallback when session.user is missing
  function _jwtDecode(token) {
    try {
      return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    } catch { return {}; }
  }

  function _getToken() {
    try {
      // Try exact key first (matches _saveSession)
      const exact = localStorage.getItem(_sessionKey());
      if (exact) {
        const s = JSON.parse(exact);
        if (s?.access_token) return s.access_token;
      }
      // Fallback: search for any supabase-like auth key
      const key = Object.keys(localStorage).find(k =>
        (k.includes('supabase') || k.startsWith('sb-')) && k.includes('auth')
      );
      if (!key) return null;
      const s = JSON.parse(localStorage.getItem(key));
      return s?.access_token || null;
    } catch { return null; }
  }

  /* ── AUTH ── */
  const auth = {
    /* Sign up with email + password */
    async signUp(email, password) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      return r.json();
    },

    /* Sign in with email + password */
    async signIn(email, password) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await r.json();
      if (data.access_token) _saveSession(data);
      return data;
    },

    /* Send magic link (passwordless) */
    async sendMagicLink(email) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/magiclink`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      return r.json();
    },

    /* Send password reset email */
    async resetPassword(email) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirectTo: `${location.origin}/account.html` })
      });
      return r.json();
    },

    /* Update password (when user is logged in) */
    async updatePassword(newPassword) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      });
      return r.json();
    },

    /* Get current session from localStorage */
    getSession() {
      try {
        // Try exact key first
        let s = null;
        const exact = localStorage.getItem(_sessionKey());
        if (exact) s = JSON.parse(exact);
        if (!s) {
          const key = Object.keys(localStorage).find(k =>
            (k.includes('supabase') || k.startsWith('sb-')) && k.includes('auth')
          );
          if (!key) return null;
          s = JSON.parse(localStorage.getItem(key));
        }
        if (!s?.access_token) return null;
        // Check expiry
        if (s.expires_at && Date.now() / 1000 > s.expires_at) {
          this.signOut();
          return null;
        }
        return s;
      } catch { return null; }
    },

    /* Get current user object */
    getUser() {
      const s = this.getSession();
      if (s?.user) return s.user;
      // Fall back: decode user ID from JWT sub claim and return minimal user object
      const token = _getToken();
      if (!token) return null;
      const payload = _jwtDecode(token);
      return payload.sub ? { id: payload.sub, email: payload.email || '' } : null;
    },

    /* Sign out — clear local session */
    async signOut() {
      const token = _getToken();
      if (token) {
        try {
          await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
          });
        } catch {}
      }
      // Clear all supabase/sb- auth keys
      Object.keys(localStorage)
        .filter(k => k.includes('supabase') || (k.startsWith('sb-') && k.includes('auth')))
        .forEach(k => localStorage.removeItem(k));
    },

    /* Handle magic link / OAuth token in URL hash on page load */
    handleAuthRedirect() {
      const hash = window.location.hash;
      if (!hash) return false;
      const params = new URLSearchParams(hash.replace('#', '?'));
      const token  = params.get('access_token');
      const refresh= params.get('refresh_token');
      const type   = params.get('type');
      if (token) {
        const session = {
          access_token:  token,
          refresh_token: refresh,
          token_type:    params.get('token_type') || 'bearer',
          expires_in:    parseInt(params.get('expires_in') || '3600'),
          expires_at:    Math.floor(Date.now() / 1000) + parseInt(params.get('expires_in') || '3600'),
          user:          null // will be fetched below
        };
        // Fetch user info
        return fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
        })
        .then(r => r.json())
        .then(user => {
          session.user = user;
          _saveSession(session);
          // Clean hash from URL
          history.replaceState(null, '', location.pathname + location.search);
          return { session, type };
        });
      }
      return Promise.resolve(null);
    }
  };

  /* ── INTERNAL: persist session ── */
  function _saveSession(data) {
    const key = `sb-${SUPABASE_URL.split('//')[1].split('.')[0]}-auth-token`;
    const session = {
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      token_type:    data.token_type || 'bearer',
      expires_in:    data.expires_in || 3600,
      expires_at:    data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      user:          data.user
    };
    localStorage.setItem(key, JSON.stringify(session));
  }

  /* ── DATABASE helpers ── */
  const db = {
    /* SELECT */
    async select(table, { filter, single, order, limit } = {}) {
      let url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
      if (filter)  url += `&${filter}`;
      if (order)   url += `&order=${order}`;
      if (limit)   url += `&limit=${limit}`;
      const opts = { headers: headers() };
      if (single) opts.headers['Accept'] = 'application/vnd.pgrst.object+json';
      const r = await fetch(url, opts);
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.message || `DB select failed: ${r.status}`);
      }
      return r.json();
    },

    /* INSERT */
    async insert(table, data) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method:  'POST',
        headers: headers(),
        body:    JSON.stringify(data)
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.message || `DB insert failed: ${r.status}`);
      }
      const result = await r.json();
      return Array.isArray(result) ? result[0] : result;
    },

    /* UPDATE */
    async update(table, filter, data) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
        method:  'PATCH',
        headers: headers(),
        body:    JSON.stringify(data)
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.message || `DB update failed: ${r.status}`);
      }
      const result = await r.json();
      return Array.isArray(result) ? result[0] : result;
    },

    /* UPSERT */
    async upsert(table, data, onConflict = 'id') {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
        method:  'POST',
        headers: { ...headers(), 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body:    JSON.stringify(data)
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.message || `DB upsert failed: ${r.status}`);
      }
      const result = await r.json();
      return Array.isArray(result) ? result[0] : result;
    },

    /* DELETE */
    async delete(table, filter) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
        method:  'DELETE',
        headers: headers()
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.message || `DB delete failed: ${r.status}`);
      }
      return true;
    }
  };

  return { auth, db };
})();

/* ════════════════════════════════════════════════════════════════
   HIGH-LEVEL HELPERS — used across pages
════════════════════════════════════════════════════════════════ */

/* Require auth — redirects to login if not signed in.
   Call at top of any protected page. */
async function requireAuth(redirectTo = 'login.html') {
  if (window.location.hash.includes('access_token')) {
    await sb.auth.handleAuthRedirect();
  }
  const user = sb.auth.getUser();
  if (!user) {
    window.location.replace(redirectTo);
    return null;
  }
  return user;
}

/* Load the current user's business profile from Supabase */
async function loadBusiness(userId) {
  try {
    // Use array mode to avoid 406 when row is missing
    const url = `${SUPABASE_URL}/rest/v1/businesses?select=*&user_id=eq.${userId}&limit=1`;
    const r = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${_getToken() || SUPABASE_ANON_KEY}`,
        'Accept': 'application/json'
      }
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return (rows && rows.length > 0) ? rows[0] : null;
  } catch {
    return null;
  }
}

/* Save / update business profile */
async function saveBusiness(userId, data) {
  return sb.db.upsert('businesses', { user_id: userId, ...data }, 'user_id');
}

/* Load current user's account row */
async function loadAccount(userId) {
  try {
    // Use array mode (no single header) to avoid 406 when row is missing
    const url = `${SUPABASE_URL}/rest/v1/accounts?select=*&user_id=eq.${userId}&limit=1`;
    const r = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${_getToken() || SUPABASE_ANON_KEY}`,
        'Accept': 'application/json'
      }
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return (rows && rows.length > 0) ? rows[0] : null;
  } catch {
    return null;
  }
}
