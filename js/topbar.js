/* ════════════════════════════════════════════════════════════════
   js/topbar.js  v2.0
   ─────────────────────────────────────────────────────────────
   Universal authenticated topbar pill menu.
   Works on: dashboard.html, welcome.html, account.html, any page.

   USAGE: Add inside <head> of any page:
     <script src="js/supabase.js"></script>
     <script src="js/topbar.js"></script>

   Place inside .topbar:
     <div id="topbarUserArea"></div>

   After login, boot.js sets window._biz with the business row.
   topbar.js polls for it and updates the label automatically.
════════════════════════════════════════════════════════════════ */

(function() {

  const STRIPE_PORTAL = 'https://billing.stripe.com/p/login/28EeVc1KCaAQbrg3eR38400';

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
      min-width: 220px;
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

    // Handle magic link redirect first
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
    const email   = user.email || '';
    const page    = location.pathname.split('/').pop() || 'dashboard.html';

    // Business name: support both _biz.bizName (welcome.html boot.js shape)
    // and _biz.biz_name (raw Supabase row shape used by dashboard.html)
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
          <a href="dashboard.html" class="tb-menu-item ${page === 'dashboard.html' ? 'tb-active' : ''}" role="menuitem">
            🏠 Dashboard
          </a>
          <a href="account.html" class="tb-menu-item ${page === 'account.html' ? 'tb-active' : ''}" role="menuitem">
            ⚙️ Account Settings
          </a>
          <button class="tb-menu-item" id="tbBillingBtn" role="menuitem">
            💳 Manage Billing
          </button>
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
      const label   = getBizLabel();
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

    // Manage Billing → Stripe portal (direct fallback link)
    document.getElementById('tbBillingBtn').addEventListener('click', () => {
      window.open(STRIPE_PORTAL, '_blank');
    });

    // Sign out
    document.getElementById('tbSignOutBtn').addEventListener('click', async () => {
      try { await sb.auth.signOut(); } catch(e) {}
      localStorage.clear();
      window.location.href = 'login.html';
    });
  }

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
