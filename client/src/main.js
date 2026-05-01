/* =============================================================
   main.js  —  Application bootstrap for Inexpro CRM
   Loaded as a plain <script> tag; runs after all other scripts.

   Responsibilities:
   1. On DOMContentLoaded: check session via Api.auth.me()
   2. Show app or login screen accordingly
   3. Wire up the login form
   4. Wire up the logout button
   5. Expose window.handleLogout (called by Api on 401)
   6. Store current user in window.currentUser
   ============================================================= */

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Show the main application shell and hide the login screen.
 * Populates the sidebar with the user's name and manages admin nav visibility.
 *
 * @param {{ id, username, role, full_name }} user
 */
function _showApp(user) {
  // Normalise field names — server may return fullName (camelCase) or full_name (snake_case)
  const displayName = user.full_name || user.fullName || user.username || 'User';

  // Store globally so all components can access it
  window.currentUser = {
    id        : user.id,
    username  : user.username || user.id,
    role      : user.role,
    full_name : displayName,
  };

  // Swap screens
  const loginScreen = document.getElementById('login-screen');
  const app         = document.getElementById('app');
  if (loginScreen) loginScreen.style.display = 'none';
  if (app)         app.style.display = '';

  // Sidebar user name + avatar initial
  const nameEl   = document.getElementById('sidebar-user-name');
  const avatarEl = document.getElementById('sidebar-user-avatar');
  if (nameEl)   nameEl.textContent   = displayName;
  if (avatarEl) avatarEl.textContent = (displayName[0] || '?').toUpperCase();

  // Show or hide admin nav item based on role
  const adminNav = document.getElementById('nav-admin');
  if (adminNav) {
    // All roles can access admin (broker/admin_only see limited tabs)
    adminNav.style.display = '';
  }

  // Toggle no-delete class on body for admin_only users (hides delete buttons via CSS)
  document.body.classList.toggle('no-delete', window.currentUser.role === 'admin_only');

  // Start in-app notifications poller (sidebar bell badge).
  if (window.Notifications) window.Notifications.startPolling();
}

/**
 * Tear down the application shell and show the login screen.
 * Clears the current user from memory.
 */
function _showLogin() {
  window.currentUser = null;
  if (window.Notifications) window.Notifications.stopPolling();

  const loginScreen = document.getElementById('login-screen');
  const app         = document.getElementById('app');
  if (app)         app.style.display = 'none';
  if (loginScreen) loginScreen.style.display = '';

  // Clear the login form and any previous error message
  const form     = document.getElementById('login-form');
  const errorBox = document.getElementById('login-error');
  if (form)     form.reset();
  if (errorBox) {
    errorBox.style.display = 'none';
    errorBox.textContent   = '';
  }

  // Clear the address bar hash so re-login starts fresh
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

/**
 * Display an error message in the login form's error box.
 * @param {string} message
 */
function _showLoginError(message) {
  const errorBox = document.getElementById('login-error');
  if (!errorBox) return;
  errorBox.textContent   = message;
  errorBox.style.display = '';
}

// ── window.handleLogout (called by Api on 401) ──────────────────

/**
 * Perform a clean logout:
 *  - Attempt to invalidate the server session (best-effort)
 *  - Show the login screen
 */
window.handleLogout = async function handleLogout() {
  try {
    await Api.auth.logout();
  } catch (_) {
    // Ignore errors — session may already be invalid
  }
  _showLogin();
};

// ── Login form handler ──────────────────────────────────────────

function _initLoginForm() {
  const form      = document.getElementById('login-form');
  const loginBtn  = document.getElementById('login-btn');
  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const username = (document.getElementById('login-username')?.value || '').trim();
    const password = (document.getElementById('login-password')?.value || '').trim();

    if (!username || !password) {
      _showLoginError('Please enter your username and password.');
      return;
    }

    // Disable button to prevent double-submit
    if (loginBtn) {
      loginBtn.disabled    = true;
      loginBtn.textContent = 'Signing in…';
    }

    const errorBox = document.getElementById('login-error');
    if (errorBox) errorBox.style.display = 'none';

    try {
      const result = await Api.auth.login(username, password);

      // 2FA path — server kept the candidate user pending; show the
      // second-step prompt before granting access.
      if (result && result.twofa_required) {
        if (loginBtn) {
          loginBtn.disabled    = false;
          loginBtn.textContent = 'Sign In';
        }
        await _prompt2faAndPromote();
        return;
      }

      // The login endpoint should return the user object; if not, fetch it
      let user = result && result.id ? result : null;
      if (!user) {
        user = await Api.auth.me();
      }

      _showApp(user);
      navigate('dashboard');
    } catch (err) {
      _showLoginError(err.message || 'Sign in failed. Please try again.');
    } finally {
      if (loginBtn) {
        loginBtn.disabled    = false;
        loginBtn.textContent = 'Sign In';
      }
    }
  });
}

// Show a centred 2FA step on the login screen; resolves once the code is
// accepted and the session is fully authenticated.
async function _prompt2faAndPromote() {
  const card = document.querySelector('#login-screen .login-card');
  if (!card) return;
  // Save original card HTML so we can restore on cancel
  const originalHtml = card.innerHTML;
  card.innerHTML = `
    <div class="login-logo">
      <img src="/logo-login.png?v=1" alt="Inexpro" class="login-logo-img"
        onerror="this.style.display='none';document.getElementById('login-2fa-logo-fallback').style.display='flex';">
      <span id="login-2fa-logo-fallback" style="display:none;align-items:center;gap:.75rem;">
        <span class="login-logo-icon">✦</span>
        <span class="login-logo-text">Inexpro CRM</span>
      </span>
    </div>
    <p class="login-subtitle" style="margin-bottom:1rem;">Two-factor verification</p>
    <p style="font-size:.85rem;color:#555;margin-bottom:1rem;line-height:1.4;">
      Enter the 6-digit code from your authenticator app, or one of your
      single-use recovery codes if you've lost access.
    </p>
    <div id="login-2fa-error" class="alert alert-danger" style="display:none;margin-bottom:.5rem;"></div>
    <form id="login-2fa-form" novalidate>
      <div class="form-group">
        <input type="text" id="login-2fa-code" name="code" class="form-control"
               inputmode="numeric" maxlength="20" autocomplete="one-time-code"
               placeholder="6-digit code or recovery code"
               style="font-size:1.1rem;text-align:center;letter-spacing:.2rem;"
               required>
      </div>
      <label style="display:flex;align-items:center;gap:.5rem;font-size:.85rem;margin:.5rem 0 .8rem;cursor:pointer;color:#555;">
        <input type="checkbox" id="login-2fa-remember" style="width:16px;height:16px;cursor:pointer;">
        Remember this device for 30 days
      </label>
      <button type="submit" class="btn btn-primary btn-login" id="login-2fa-btn">Verify</button>
      <button type="button" class="btn btn-secondary btn-login" id="login-2fa-cancel" style="margin-top:.5rem;">Cancel</button>
    </form>
  `;
  const codeInput = document.getElementById('login-2fa-code');
  const btn       = document.getElementById('login-2fa-btn');
  const errBox    = document.getElementById('login-2fa-error');
  if (codeInput) codeInput.focus();

  document.getElementById('login-2fa-cancel')?.addEventListener('click', () => {
    card.innerHTML = originalHtml;
    document.getElementById('login-year').textContent = new Date().getFullYear();
    _initLoginForm();
  });

  document.getElementById('login-2fa-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = (codeInput?.value || '').trim();
    if (!code) {
      errBox.textContent = 'Code required.';
      errBox.style.display = 'block';
      return;
    }
    const remember = !!document.getElementById('login-2fa-remember')?.checked;
    if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }
    errBox.style.display = 'none';
    try {
      const r = await Api.auth.login2fa(code, remember);
      let user = r && r.id ? r : null;
      if (!user) user = await Api.auth.me();
      _showApp(user);
      navigate('dashboard');
    } catch (err) {
      errBox.textContent = err.message || '2FA verification failed.';
      errBox.style.display = 'block';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Verify'; }
    }
  });
}

// ── Logout button handler ───────────────────────────────────────

function _initLogoutButton() {
  const logoutBtn = document.getElementById('logout-btn');
  if (!logoutBtn) return;

  logoutBtn.addEventListener('click', async function () {
    logoutBtn.disabled = true;
    try {
      await Api.auth.logout();
    } catch (_) { /* session already gone */ }
    // Hard reload on explicit logout to clear every in-memory cache
    // (ViewPrefs configs, etc.) so the next user's session starts clean.
    window.location.reload();
  });
}

// ── Mobile table labels ─────────────────────────────────────────
//
// Copies each table's <th> text to `data-label` on the corresponding <td>
// after any render. Coupled with the card-layout CSS below 640px, this
// produces "key: value" stacked rows on mobile without each module having
// to emit data-label attributes itself.
function _initMobileTableLabels() {
  const contentArea = document.getElementById('content-area');
  if (!contentArea) return;

  function applyLabels() {
    contentArea.querySelectorAll('table.table').forEach(table => {
      const thead = table.querySelector('thead');
      if (!thead) return;
      const headers = Array.from(thead.querySelectorAll('th')).map(th => th.textContent.trim());
      table.querySelectorAll('tbody tr').forEach(tr => {
        tr.querySelectorAll(':scope > td').forEach((td, idx) => {
          const label = headers[idx] || '';
          if (td.getAttribute('data-label') !== label) {
            td.setAttribute('data-label', label);
          }
        });
      });
    });
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; applyLabels(); });
  }

  schedule();
  const obs = new MutationObserver(schedule);
  obs.observe(contentArea, { childList: true, subtree: true });
}

// ── Mobile filter drawer ────────────────────────────────────────
//
// Watches for per-module filter widgets (elements with data-header-widget)
// and, at mobile widths, injects a "🔎 Filters" toggle button that opens the
// widget as a bottom-sheet drawer. Desktop behaviour is unchanged (CSS hides
// the toggle and keeps the pill absolutely centered).
function _initMobileFilterDrawer() {
  const topHeader     = document.getElementById('top-header');
  const headerActions = document.getElementById('header-actions');
  if (!topHeader || !headerActions) return;

  let backdrop = null;

  function ensureBackdrop() {
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'filter-drawer-backdrop';
      backdrop.addEventListener('click', closeDrawer);
      document.body.appendChild(backdrop);
    }
    return backdrop;
  }

  function openDrawer() {
    const widget = document.querySelector('[data-header-widget]');
    if (!widget) return;
    widget.classList.add('drawer-open');
    document.body.classList.add('filter-drawer-open');
    ensureBackdrop().classList.add('visible');
  }

  function closeDrawer() {
    document.querySelectorAll('[data-header-widget].drawer-open')
      .forEach(w => w.classList.remove('drawer-open'));
    document.body.classList.remove('filter-drawer-open');
    if (backdrop) backdrop.classList.remove('visible');
  }

  function syncToggleButton() {
    const widget       = document.querySelector('[data-header-widget]');
    const existingBtn  = document.getElementById('filter-drawer-toggle');
    const drawerIsOpen = backdrop && backdrop.classList.contains('visible');

    if (widget) {
      if (!existingBtn) {
        const btn = document.createElement('button');
        btn.id        = 'filter-drawer-toggle';
        btn.type      = 'button';
        btn.className = 'btn btn-secondary filter-drawer-toggle';
        btn.textContent = '🔎 Filters';
        btn.addEventListener('click', openDrawer);
        headerActions.insertBefore(btn, headerActions.firstChild);
      }
      if (drawerIsOpen && !widget.classList.contains('drawer-open')) {
        widget.classList.add('drawer-open');
      }
    } else if (existingBtn) {
      existingBtn.remove();
      // Do not close the drawer here — the widget may be mid-rerender.
      // hashchange listener handles navigation-driven closes.
    }
  }

  syncToggleButton();

  const observer = new MutationObserver(syncToggleButton);
  observer.observe(topHeader,     { childList: true });
  observer.observe(headerActions, { childList: true });

  window.addEventListener('hashchange', closeDrawer);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDrawer();
  });
}

// ── Mobile sidebar (hamburger) ──────────────────────────────────

function _initMobileSidebar() {
  const hamburger = document.getElementById('hamburger-btn');
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebar-overlay');
  const closeBtn  = document.getElementById('sidebar-close');

  function openSidebar() {
    if (sidebar) sidebar.classList.add('open');
    if (overlay) overlay.classList.add('visible');
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('visible');
  }

  if (hamburger) hamburger.addEventListener('click', openSidebar);
  if (closeBtn)  closeBtn.addEventListener('click', closeSidebar);
  if (overlay)   overlay.addEventListener('click', closeSidebar);

  // Close sidebar on nav-link click (mobile UX)
  const navLinks = document.querySelectorAll('#sidebar-nav .nav-link');
  navLinks.forEach(link => link.addEventListener('click', closeSidebar));
}

// ── Bootstrap ───────────────────────────────────────────────────

// ── Theme management ────────────────────────────────────────────

/**
 * Apply and persist theme. Call with 'dark' or 'light'.
 * @param {'dark'|'light'} theme
 */
window.setTheme = function setTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
  try { localStorage.setItem('theme', theme); } catch (_) {}
};

document.addEventListener('DOMContentLoaded', async function () {
  // Restore saved theme before anything renders
  try {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.body.classList.add('dark-mode');
    }
  } catch (_) {}

  _initLoginForm();
  _initLogoutButton();
  _initMobileSidebar();
  _initMobileFilterDrawer();
  _initMobileTableLabels();

  // Check if there is an active session
  try {
    const user = await Api.auth.me();

    if (user && user.id) {
      // Valid session — show the app
      _showApp(user);
      // Start the router (defined in router.js, exposed as window.initRouter)
      if (typeof window.initRouter === 'function') {
        window.initRouter();
      }
    } else {
      _showLogin();
    }
  } catch (err) {
    // 401 is handled inside apiFetch (calls handleLogout),
    // but any other error also means we can't access the app.
    _showLogin();
  }
});
