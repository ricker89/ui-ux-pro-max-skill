/* boot.js — loaded fresh every time, no cache issues */
console.log('[boot.js] loaded');

async function bootWelcomePage() {
  const bar = document.getElementById('edb');
  function log(msg) {
    console.log('[boot]', msg);
    if (bar) { bar.innerHTML += msg + ' | '; bar.scrollLeft = 99999; }
    try {
      const prev = JSON.parse(localStorage.getItem('hc_debug_log') || '[]');
      prev.push('[' + new Date().toLocaleTimeString() + '] ' + msg);
      if (prev.length > 80) prev.splice(0, prev.length - 80);
      localStorage.setItem('hc_debug_log', JSON.stringify(prev));
    } catch(e) {}
  }

  log('boot.js running');

  // 1. Get session token directly from localStorage
  const SUPA_URL = 'https://dbbryatmoxlzifsurxrm.supabase.co';
  const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRiYnJ5YXRtb3hsemlmc3VyeHJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NDUzNTMsImV4cCI6MjA4ODUyMTM1M30.b_Ge4bNFu3nCxXuP10ZEdmFbdVtTn2ZS98nyXoBRfAk';

  // Find the session — try every possible key format
  let token = null;
  let userId = null;
  let userEmail = null;

  const allKeys = Object.keys(localStorage);
  log('localStorage keys: ' + allKeys.filter(k => k.includes('sb') || k.includes('supa')).join(', '));

  for (const key of allKeys) {
    if (!key.includes('auth')) continue;
    try {
      const val = JSON.parse(localStorage.getItem(key));
      if (val && val.access_token) {
        token     = val.access_token;
        userId    = val.user?.id || null;
        userEmail = val.user?.email || null;
        log('found token in key: ' + key.slice(0,40));
        break;
      }
    } catch(e) {}
  }

  if (!token) {
    log('❌ NO TOKEN FOUND — redirecting to login');
    window.location.replace('login.html?next=dashboard.html');
    return;
  }

  log('user: ' + userEmail + ' | userId: ' + (userId || '').slice(0,8));

  // 2. Fetch business data directly
  try {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/businesses?select=*&limit=1`,
      {
        headers: {
          'apikey':        SUPA_KEY,
          'Authorization': `Bearer ${token}`,
          'Accept':        'application/json'
        }
      }
    );
    log('businesses fetch: ' + res.status);

    if (!res.ok) {
      const txt = await res.text();
      log('DB error: ' + txt.slice(0, 150));
      return;
    }

    const rows = await res.json();
    log('rows returned: ' + rows.length);

    if (!rows || rows.length === 0) {
      log('⚠️ No business row found for this user');
      return;
    }

    const bizRow = rows[0];
    log('bizRow: ' + bizRow.biz_name + ' | slug: ' + bizRow.slug);

    const biz = {
      bizName:     bizRow.biz_name        || 'Your Business',
      googleUrl:   bizRow.google_url      || '',
      incentive:   bizRow.incentive       || 'Scan to share your experience',
      email:       userEmail              || '',
      phone:       bizRow.phone           || '',
      slug:        bizRow.slug            || 'your-business',
      placeId:     bizRow.google_place_id || '',
      rating:      bizRow.rating          || '',
      ratingCount: bizRow.rating_count    || ''
    };

    window._biz = biz;
    log('calling renderPage: ' + biz.bizName);

    // ✅ Auth confirmed — reveal the page
    document.body.classList.add('auth-ready');

    if (typeof renderPage === 'function') {
      renderPage(biz);
      log('✅ renderPage called');
    } else {
      log('❌ renderPage not defined yet — retrying in 500ms');
      setTimeout(() => {
        if (typeof renderPage === 'function') {
          renderPage(biz);
          log('✅ renderPage called (delayed)');
        } else {
          log('❌ renderPage still not defined');
        }
      }, 500);
    }

  } catch(e) {
    log('❌ fetch exception: ' + String(e));
  }
}

document.addEventListener('DOMContentLoaded', bootWelcomePage);
