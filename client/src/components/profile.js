// ================================================================
// PROFILE — signed-in user's own account page
// ================================================================
//
// Routed via #/profile (clicked from the sidebar user-name). Shows the
// current user's identity (read-only — only an admin can change those
// fields from User Management) plus self-service controls for changing
// their own password and managing their own 2FA.
const Profile = (() => {
  function esc(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }

  async function render() {
    setPageTitle('My Profile');
    setBreadcrumb(['My Profile']);
    const headerActions = document.getElementById('header-actions');
    if (headerActions) headerActions.innerHTML = '';
    const headerCenter = document.getElementById('header-center');
    if (headerCenter) headerCenter.innerHTML = '';

    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    try {
      const me = await Api.auth.profile();
      _renderProfile(el, me);
    } catch (e) {
      el.innerHTML = `<div class="alert alert-danger">${esc(e.message || 'Failed to load profile.')}</div>`;
    }
  }

  function _renderProfile(el, me) {
    const tfBadge = me.two_factor_enabled
      ? '<span class="badge badge-success">Enabled</span>'
      : '<span class="badge badge-secondary">Disabled</span>';

    el.innerHTML = `
      <div style="max-width:780px;">

        <div class="detail-section card">
          <div class="detail-section-title">Account Details</div>
          <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 .85rem;">
            These fields are managed by an administrator. Contact an admin if any
            of them need to change.
          </p>
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label class="form-label">Full Name</label>
              <input class="form-control" value="${esc(me.full_name || '')}" disabled>
            </div>
            <div class="form-group">
              <label class="form-label">Username</label>
              <input class="form-control" value="${esc(me.username || '')}" disabled>
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input class="form-control" value="${esc(me.email || '')}" disabled>
            </div>
            <div class="form-group">
              <label class="form-label">Role</label>
              <input class="form-control" value="${esc(me.role || '')}" disabled>
            </div>
            <div class="form-group">
              <label class="form-label">Status</label>
              <input class="form-control" value="${me.active ? 'Active' : 'Inactive'}" disabled>
            </div>
            <div class="form-group">
              <label class="form-label">Member since</label>
              <input class="form-control" value="${esc((me.created_at || '').slice(0, 10))}" disabled>
            </div>
          </div>
        </div>

        <div class="detail-section card" style="margin-top:1.25rem;">
          <div class="detail-section-title">Change Password</div>
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label class="form-label required">Current password</label>
              <input id="prof-cur-pw" type="password" class="form-control" autocomplete="current-password">
            </div>
            <div class="form-group">
              <label class="form-label required">New password</label>
              <input id="prof-new-pw" type="password" class="form-control" autocomplete="new-password">
            </div>
            <div class="form-group">
              <label class="form-label required">Confirm new password</label>
              <input id="prof-new-pw2" type="password" class="form-control" autocomplete="new-password">
            </div>
          </div>
          <div style="display:flex;gap:.5rem;align-items:center;margin-top:.5rem;">
            <button class="btn btn-primary" onclick="Profile._changePassword()">Update password</button>
            <span id="prof-pw-result" style="font-size:.85rem;"></span>
          </div>
          <p style="font-size:.78rem;color:var(--text-muted);margin:.5rem 0 0;">Minimum 8 characters.</p>
        </div>

        <div class="detail-section card" style="margin-top:1.25rem;">
          <div class="detail-section-title" style="display:flex;align-items:center;gap:.5rem;">
            Two-Factor Authentication
            <span style="margin-left:auto;">${tfBadge}</span>
          </div>
          <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 .85rem;">
            Adds a 6-digit code from an authenticator app (Google Authenticator,
            Authy, 1Password, Microsoft Authenticator) to your sign-in.
          </p>
          ${me.two_factor_enabled
            ? `<button class="btn btn-danger" onclick="Profile._beginDisable2fa()">Disable 2FA</button>`
            : `<button class="btn btn-primary" onclick="Profile._beginEnroll2fa()">Activate 2FA</button>`}
        </div>

      </div>`;
  }

  async function _changePassword() {
    const cur  = document.getElementById('prof-cur-pw')?.value || '';
    const next = document.getElementById('prof-new-pw')?.value || '';
    const conf = document.getElementById('prof-new-pw2')?.value || '';
    const out  = document.getElementById('prof-pw-result');
    if (!cur || !next || !conf) {
      if (out) out.innerHTML = '<span style="color:var(--danger);">Fill in all three password fields.</span>';
      return;
    }
    if (next !== conf) {
      if (out) out.innerHTML = '<span style="color:var(--danger);">New password and confirmation do not match.</span>';
      return;
    }
    if (next.length < 8) {
      if (out) out.innerHTML = '<span style="color:var(--danger);">New password must be at least 8 characters.</span>';
      return;
    }
    try {
      await Api.auth.changePassword(cur, next);
      if (out) out.innerHTML = '<span style="color:var(--success);">✓ Password updated</span>';
      ['prof-cur-pw', 'prof-new-pw', 'prof-new-pw2'].forEach(id => {
        const e = document.getElementById(id); if (e) e.value = '';
      });
    } catch (e) {
      if (out) out.innerHTML = `<span style="color:var(--danger);">${esc(e.message || 'Update failed')}</span>`;
    }
  }

  // ── 2FA modal (centred popup, same pattern as Admin._open2faModal) ──
  function _open2faModal(html) {
    document.getElementById('prof-2fa-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'prof-2fa-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="width:560px;max-width:94vw;max-height:90vh;overflow:auto;">
        <div class="modal-header" style="padding:1rem 1.25rem;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:.75rem;">
          <strong style="font-size:1rem;">Two-Factor Authentication</strong>
          <button id="prof-2fa-close" class="modal-close" type="button" style="margin-left:auto;">×</button>
        </div>
        <div id="prof-2fa-body" style="padding:1.1rem 1.25rem;">${html}</div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#prof-2fa-close').addEventListener('click', _close2faModal);
    return overlay;
  }

  function _close2faModal() {
    document.getElementById('prof-2fa-overlay')?.remove();
  }

  async function _beginEnroll2fa() {
    _open2faModal('<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>');
    try {
      const r = await Api.auth.profile2faEnroll();
      const body = document.getElementById('prof-2fa-body');
      if (!body) return;
      body.innerHTML = `
        <p style="font-size:.85rem;color:var(--text-light);line-height:1.4;margin:0 0 .85rem;">
          Scan the QR code with your authenticator app, <em>or</em> enter the
          secret manually. Once a 6-digit code appears, type it below to
          activate 2FA — that reveals your one-time recovery codes.
        </p>
        <div style="display:flex;gap:1.2rem;align-items:flex-start;flex-wrap:wrap;">
          <div id="prof-2fa-qr"></div>
          <div style="flex:1;min-width:200px;">
            <div style="font-size:.78rem;color:var(--text-light);margin-bottom:.25rem;">Manual secret</div>
            <code style="display:block;background:var(--bg-alt,#f4f6f8);color:var(--text);border:1px solid var(--border);padding:.55rem .65rem;border-radius:6px;
                         font-size:.85rem;word-break:break-all;letter-spacing:.05em;">${esc(r.secret)}</code>
            <div style="font-size:.72rem;color:var(--text-muted);margin-top:.4rem;">Account: ${esc(r.account)} · Issuer: ${esc(r.issuer)}</div>
          </div>
        </div>
        <div class="form-group" style="margin-top:1rem;">
          <label class="form-label">Enter the 6-digit code from the app</label>
          <input id="prof-2fa-code" class="form-control" inputmode="numeric"
                 maxlength="6" pattern="\\d{6}" autocomplete="off" placeholder="123456"
                 style="font-family:Menlo,Consolas,monospace;font-size:1.1rem;letter-spacing:.4rem;text-align:center;width:160px;">
        </div>
        <div id="prof-2fa-err" style="display:none;color:var(--danger);font-size:.82rem;margin:.4rem 0;"></div>
        <div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:.5rem;">
          <button class="btn btn-secondary" onclick="Profile._close2faModal()">Cancel</button>
          <button class="btn btn-primary" onclick="Profile._verify2faEnroll()">Confirm &amp; activate</button>
        </div>`;
      _renderQr(r.otpauth_uri, document.getElementById('prof-2fa-qr'));
      const inp = document.getElementById('prof-2fa-code');
      if (inp) {
        inp.focus();
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') Profile._verify2faEnroll(); });
      }
    } catch (e) {
      const body = document.getElementById('prof-2fa-body');
      if (body) body.innerHTML = `<div class="alert alert-danger">${esc(e.message || 'Enrollment failed')}</div>`;
    }
  }

  async function _verify2faEnroll() {
    const errEl = document.getElementById('prof-2fa-err');
    const code = (document.getElementById('prof-2fa-code')?.value || '').trim();
    if (!/^\d{6}$/.test(code)) {
      if (errEl) { errEl.textContent = 'Enter the 6-digit code.'; errEl.style.display = 'block'; }
      return;
    }
    try {
      const r = await Api.auth.profile2faVerify(code);
      const codes = r.recovery_codes || [];
      const body = document.getElementById('prof-2fa-body');
      if (body) {
        body.innerHTML = `
          <div class="alert alert-success" style="margin-bottom:.85rem;">
            ✓ 2FA is now active. Save these recovery codes somewhere safe — each
            can be used once if you lose access to your authenticator app.
          </div>
          <div style="background:var(--bg-alt,#f4f6f8);color:var(--text);border:1px solid var(--border);padding:.75rem;border-radius:6px;font-family:Menlo,Consolas,monospace;font-size:.95rem;">
            ${codes.map(c => esc(c)).join('<br>')}
          </div>
          <div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:.85rem;">
            <button class="btn btn-secondary" onclick="Profile._copyCodes(${JSON.stringify(codes).replace(/"/g, '&quot;')})">Copy</button>
            <button class="btn btn-primary" onclick="Profile._close2faModal();Profile.render();">Done</button>
          </div>`;
      }
    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'Verification failed.'; errEl.style.display = 'block'; }
    }
  }

  function _copyCodes(codes) {
    try {
      navigator.clipboard.writeText((codes || []).join('\n'));
      showToast('Recovery codes copied', 'success');
    } catch (_) {
      showToast('Copy failed — select the codes manually', 'warning');
    }
  }

  function _beginDisable2fa() {
    _open2faModal(`
      <div class="alert alert-warning" style="font-size:.85rem;">
        Disabling 2FA removes the second-step prompt at sign-in. Enter your
        current password to confirm.
      </div>
      <div class="form-group">
        <label class="form-label required">Current password</label>
        <input id="prof-2fa-disable-pw" type="password" class="form-control" autocomplete="current-password">
      </div>
      <div id="prof-2fa-disable-err" style="display:none;color:var(--danger);font-size:.82rem;margin-bottom:.4rem;"></div>
      <div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:.5rem;">
        <button class="btn btn-secondary" onclick="Profile._close2faModal()">Cancel</button>
        <button class="btn btn-danger" onclick="Profile._disable2fa()">Disable 2FA</button>
      </div>`);
    document.getElementById('prof-2fa-disable-pw')?.focus();
  }

  async function _disable2fa() {
    const errEl = document.getElementById('prof-2fa-disable-err');
    const pw = (document.getElementById('prof-2fa-disable-pw')?.value || '').trim();
    if (!pw) {
      if (errEl) { errEl.textContent = 'Current password required.'; errEl.style.display = 'block'; }
      return;
    }
    try {
      await Api.auth.profile2faDisable(pw);
      showToast('2FA disabled', 'success');
      _close2faModal();
      render();
    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'Disable failed.'; errEl.style.display = 'block'; }
    }
  }

  function _renderQr(text, container) {
    if (!container) return;
    if (typeof qrcode !== 'function') {
      container.innerHTML = `<div style="color:var(--danger);font-size:.8rem;">QR library failed to load — type the secret into the app manually.</div>`;
      return;
    }
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    container.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
    const svg = container.querySelector('svg');
    if (svg) {
      svg.style.width  = '200px';
      svg.style.height = '200px';
      svg.style.background = '#fff';
      svg.style.padding    = '8px';
      svg.style.border     = '1px solid #e5e7eb';
      svg.style.borderRadius = '6px';
    }
  }

  return { render, _changePassword, _beginEnroll2fa, _verify2faEnroll, _close2faModal, _copyCodes, _beginDisable2fa, _disable2fa };
})();

window.Profile = Profile;
