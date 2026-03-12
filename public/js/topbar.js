/* ════════════════════════════════════════════════════════════════
   js/topbar.js  v3.0
   ─────────────────────────────────────────────────────────────
   Universal authenticated topbar pill menu.
   Works on: dashboard.html, account.html, and any page.

   USAGE: Add inside <head> of any page:
     <script src="js/supabase.js"></script>
     <script src="js/topbar.js"></script>

   Place inside .topbar:
     <div id="topbarUserArea"></div>

   Locations are loaded here and injected into the dropdown
   automatically on every page. On dashboard.html, renderLocSelector()
   is called after boot to update the active-location highlight.
════════════════════════════════════════════════════════════════ */

(function() {

  /* ── CSS injected once ────────────────────────────────────── */
  const TOPBAR_CSS = `
    .tb-user-wrap { position: relative; }

    .tb-user-btn {
      display: flex;
      align-items: center;
      gap: 9px;
      background: #f5f5f7;
      border: 1.5px solid #e8e8e8;
      border-radius: 999px;
      padding: 5px 14px 5px 5px;
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      font-size: .84rem;
      font-weight: 600;
      color: #1a1a1a;
      transition: all .15s;
      white-space: nowrap;
      line-height: 1;
    }
    .tb-user-btn:hover { border-color: #c0c0c0; background: #ececec; }

    .tb-avatar {
      width: 28px; height: 28px;
      border-radius: 50%;
      background: #1a1a1a;
      color: #fff;
      font-size: .72rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      letter-spacing: 0;
    }

    .tb-caret { font-size: .6rem; color: #9ca3af; margin-left: 2px; }

    .tb-dropdown {
      position: absolute;
      right: 0;
      top: calc(100% + 8px);
      background: #fff;
      border: 1.5px solid #e8e8e8;
      border-radius: 14px;
      box-shadow: 0 8px 40px rgba(0,0,0,.11);
      min-width: 240px;
      padding: 6px;
      z-index: 9999;
      display: none;
      animation: tb-in .14s ease both;
    }
    @keyframes tb-in {
      from { opacity: 0; transform: translateY(-6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .tb-dropdown.open { display: block; }

    .tb-menu-email {
      padding: 8px 12px 10px;
      font-size: .73rem;
      color: #9ca3af;
      border-bottom: 1px solid #e8e8e8;
      margin-bottom: 4px;
      word-break: break-all;
    }

    .tb-menu-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border-radius: 8px;
      font-size: .84rem;
      font-weight: 500;
      color: #1a1a1a;
      text-decoration: none;
      cursor: pointer;
      transition: background .1s;
      border: none;
      background: none;
      width: 100%;
      font-family: inherit;
      text-align: left;
    }
    .tb-menu-item:hover   { background: #f5f5f7; }
    .tb-menu-item.tb-active { background: #f5f5f7; font-weight: 700; }
    .tb-menu-item.tb-danger { color: #dc2626; }
    .tb-menu-item.tb-danger:hover { background: #fef2f2; }

    .tb-menu-divider { height: 1px; background: #e8e8e8; margin: 5px 0; }

    /* ── Location items inside the dropdown ─────────────────── */
    .tb-loc-section-label {
      padding: 6px 12px 2px;
      font-size: .68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: #9ca3af;
    }
    .tb-loc-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: background .1s;
      text-decoration: none;
    }
    .tb-loc-item:hover { background: #f5f5f7; }
    .tb-loc-item.tb-loc-active { background: #f0fdf4; cursor: default; }
    .tb-loc-item-info { flex: 1; min-width: 0; }
    .tb-loc-item-name {
      font-size: .84rem; font-weight: 600; color: #1a1a1a;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .tb-loc-item-addr {
      font-size: .73rem; color: #6b7280;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .tb-loc-badge {
      font-size: .68rem; font-weight: 700; padding: 2px 7px;
      border-radius: 20px; flex-shrink: 0;
    }
    .tb-loc-badge.badge-active   { background:#d1fae5; color:#065f46; }
    .tb-loc-badge.badge-pending  { background:#fef3c7; color:#92400e; }
    .tb-loc-badge.badge-inactive { background:#f3f4f6; color:#6b7280; }
    .tb-loc-add {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; border-radius: 8px;
      font-size: .84rem; font-weight: 600; color: #1a1a1a;
      text-decoration: none; transition: background .1s;
    }
    .tb-loc-add:hover { background: #f5f5f7; }

    .tb-signin-link {
      font-size: .82rem;
      font-weight: 600;
      color: #1a1a1a;
      text-decoration: none;
      border: 1.5px solid #e8e8e8;
      border-radius: 8px;
      padding: 7px 16px;
      transition: all .15s;
    }
    .tb-signin-link:hover { border-color: #1a1a1a; }
  `;

  if (!document.getElementById('tb-styles')) {
    const style = document.createElement('style');
    style.id = 'tb-styles';
    style.textContent = TOPBAR_CSS;
    document.head.appendChild(style);
  }

  /* ── Boot ────────────────────────────────────────────────── */
  function boot() {
    const target = document.getElementById('topbarUserArea');
    if (!target) return;

    const hashPromise = window.location.hash.includes('access_token')
      ? sb.auth.handleAuthRedirect().catch(() => null)
      : Promise.resolve(null);

    hashPromise.then(() => {
      const user = sb.auth.getUser();
      if (user) renderAuthed(target, user);
      else renderGuest(target);
    });
  }

  /* ── Authenticated menu ─────────────────────────────────── */
  function renderAuthed(target, user) {
    const email = user.email || '';
    const page  = location.pathname.split('/').pop() || 'dashboard.html';

    const getBizLabel = () => {
      const b = window._biz;
      if (!b) return email.split('@')[0];
      return b.bizName || b.biz_name || email.split('@')[0];
    };

    const initial = () => (getBizLabel()[0] || '?').toUpperCase();

    target.innerHTML = `
      <div class="tb-user-wrap" id="tbUserWrap">
        <button class="tb-user-btn" id="tbUserBtn" type="button" aria-label="Account menu">
          <div class="tb-avatar" id="tbAvatar">${escTb(initial())}</div>
          <span id="tbUsername">${escTb(getBizLabel())}</span>
          <span class="tb-caret">▾</span>
        </button>
        <div class="tb-dropdown" id="tbDropdown" role="menu">
          <div class="tb-menu-email" id="tbMenuEmail">${escTb(email)}</div>
          <!-- Dashboard overview link -->
          <a href="dashboard.html" class="tb-menu-item ${page === 'dashboard.html' ? 'tb-active' : ''}" role="menuitem">
            📊 Dashboard
          </a>
          <div class="tb-menu-divider"></div>
          <!-- Locations injected here — populated by loadAndRenderLocations() -->
          <div id="tbLocationsSlot"></div>
          <!-- Nav items below locations -->
          <a href="account.html" class="tb-menu-item ${page === 'account.html' ? 'tb-active' : ''}" role="menuitem">
            ⚙️ Account Settings
          </a>
          <div class="tb-menu-divider"></div>
          <button class="tb-menu-item tb-danger" id="tbSignOutBtn" role="menuitem">
            ↪️ Sign Out
          </button>
        </div>
      </div>
    `;

    // Poll for biz name — updates avatar + label once _biz loads
    let polls = 0;
    const poll = setInterval(() => {
      polls++;
      const label    = getBizLabel();
      const labelEl  = document.getElementById('tbUsername');
      const avatarEl = document.getElementById('tbAvatar');
      if (labelEl)  labelEl.textContent  = label;
      if (avatarEl) avatarEl.textContent = (label[0] || '?').toUpperCase();
      const bizLoaded = window._biz && (window._biz.bizName || window._biz.biz_name);
      if (bizLoaded || polls > 20) clearInterval(poll);
    }, 250);

    // Toggle dropdown
    document.getElementById('tbUserBtn').addEventListener('click', e => {
      e.stopPropagation();
      document.getElementById('tbDropdown').classList.toggle('open');
    });

    // Close on outside click
    document.addEventListener('click', () => {
      document.getElementById('tbDropdown')?.classList.remove('open');
    });

    // Sign out
    document.getElementById('tbSignOutBtn').addEventListener('click', async () => {
      try { await sb.auth.signOut(); } catch(e) {}
      localStorage.clear();
      window.location.href = 'login.html';
    });

    // Load locations and populate the slot on every page
    loadAndRenderLocations(user);
  }

  /* ── Load locations + fill #tbLocationsSlot ─────────────── */
  async function loadAndRenderLocations(user) {
    // dashboard.html manages the slot itself (knows the active location)
    // so we skip the fetch here and let it call window.tbRenderLocSlot()
    const page = location.pathname.split('/').pop() || '';
    // dashboard.html (overview) and location.html (per-location) both call tbRenderLocSlot() themselves
    if (page === 'dashboard.html' || page === 'location.html') return;

    try {
      const session = await window._supabaseClient.auth.getSession();
      const token   = session?.data?.session?.access_token;
      if (!token) return;

      const res = await fetch(
        `https://dbbryatmoxlzifsurxrm.supabase.co/rest/v1/locations` +
        `?user_id=eq.${user.id}&deleted_at=is.null&order=created_at.asc&select=*`,
        { headers: {
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRiYnJ5YXRtb3hsemlmc3VyeHJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NDUzNTMsImV4cCI6MjA4ODUyMTM1M30.b_Ge4bNFu3nCxXuP10ZEdmFbdVtTn2ZS98nyXoBRfAk',
            'Authorization': `Bearer ${token}`,
          }
        }
      );
      const locs = res.ok ? await res.json() : [];
      tbRenderLocSlot(locs, null);
    } catch(e) {
      console.warn('[topbar] location fetch failed', e);
    }
  }

  /* ── Render location items into #tbLocationsSlot ─────────── */
  // activeLocId = ID of the currently-active location (dashboard only),
  //               null on other pages — all items are plain links
  // onSelect    = callback(loc) for in-page switching (dashboard only),
  //               null on other pages — items navigate to dashboard URL
  window.tbRenderLocSlot = function(locations, activeLocId, onSelect) {
    const slot = document.getElementById('tbLocationsSlot');
    if (!slot) return;
    slot.innerHTML = '';

    if (!locations || !locations.length) return;

    // Section label
    const label = document.createElement('div');
    label.className = 'tb-loc-section-label';
    label.textContent = 'Locations';
    slot.appendChild(label);

    locations.forEach(loc => {
      const status = loc.subscription_status || 'pending';
      const bCls = status === 'active' || status === 'trialing' ? 'badge-active'
                 : status.startsWith('pending') ? 'badge-pending' : 'badge-inactive';
      const bLbl = {
        active: 'Active', trialing: 'Trial', canceled: 'Cancelled',
        pending_payment: 'Activate', pending: 'Pending'
      }[status] || status;

      const isSel = activeLocId && loc.id === activeLocId;

      // Use <a> so it's a real link (navigates to dashboard for that location)
      const el = document.createElement('a');
      el.className = 'tb-loc-item' + (isSel ? ' tb-loc-active' : '');
      el.href = `location.html?loc=${loc.id}`;
      el.innerHTML = `
        <div class="tb-loc-item-info">
          <div class="tb-loc-item-name">${escTb(loc.biz_name || 'Unnamed')}</div>
          ${loc.address ? `<div class="tb-loc-item-addr">${escTb(loc.address)}</div>` : ''}
        </div>
        <span class="tb-loc-badge ${bCls}">${escTb(bLbl)}</span>
      `;

      // On dashboard: if a callback is provided AND it's not already selected,
      // intercept the click for in-page switching instead of full navigation
      if (onSelect && !isSel) {
        el.addEventListener('click', e => {
          e.preventDefault();
          onSelect(loc);
          document.getElementById('tbDropdown')?.classList.remove('open');
        });
      }

      slot.appendChild(el);
    });

    // Add Location link
    const addLink = document.createElement('a');
    addLink.href = 'account.html';
    addLink.className = 'tb-loc-add';
    addLink.innerHTML = '<span style="color:#16a34a;font-size:1rem;">＋</span> Add Location';
    slot.appendChild(addLink);

    // Trailing divider before nav items
    const divider = document.createElement('div');
    divider.className = 'tb-menu-divider';
    slot.appendChild(divider);
  };

  /* ── Guest ──────────────────────────────────────────────── */
  function renderGuest(target) {
    target.innerHTML = `<a href="login.html" class="tb-signin-link">Sign In</a>`;
  }

  function escTb(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
