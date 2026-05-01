// ================================================================
// ADMIN COMPONENT
// ================================================================
const Admin = (() => {
  function esc(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }

  function _chromeHtml() {
    const isFullAdmin = window.currentUser?.role === 'admin';
    return `
      <div class="tab-bar" style="margin-bottom:1.5rem;">
        ${isFullAdmin ? '<button class="tab-btn" id="tab-audit" onclick="Admin.auditLog()">Audit Log</button>' : ''}
        <button class="tab-btn" id="tab-settings" onclick="Admin.settings()">Settings</button>
        <button class="tab-btn" id="tab-broker-profiles" onclick="Admin.brokerFitness()">Broker Fitness</button>
        ${isFullAdmin ? '<button class="tab-btn" id="tab-products" onclick="Admin.productsTab()">Product Library</button>' : ''}
        ${isFullAdmin ? '<button class="tab-btn" id="tab-data-breaches" onclick="Admin.dataBreachesTab()">Data Breach Log</button>' : ''}
      </div>
      <div id="admin-content"></div>`;
  }

  function _ensureChrome() {
    if (document.getElementById('admin-content')) return;
    document.getElementById('content-area').innerHTML = _chromeHtml();
  }

  function _activateTab(tabId) {
    const tabEl = document.querySelector('.tab-bar');
    if (!tabEl) return;
    tabEl.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId)?.classList.add('active');
  }

  function render() {
    setPageTitle('Administration');
    setBreadcrumb(['Admin']);
    document.getElementById('content-area').innerHTML = _chromeHtml();
    settings();
  }

  async function brokerFitness() {
    _ensureChrome();
    setPageTitle('Broker Fitness');
    setBreadcrumb(['Admin', 'Broker Fitness']);
    _activateTab('tab-broker-profiles');
    if (window.BrokerProfiles?.list) {
      await window.BrokerProfiles.list({ embedded: true });
    }
  }

  async function productsTab() {
    _ensureChrome();
    setPageTitle('Product Library');
    setBreadcrumb(['Admin', 'Product Library']);
    _activateTab('tab-products');
    if (window.Products?.list) {
      await window.Products.list({ embedded: true });
    }
  }

  async function dataBreachesTab() {
    _ensureChrome();
    setPageTitle('Data Breach Log');
    setBreadcrumb(['Admin', 'Data Breach Log']);
    _activateTab('tab-data-breaches');
    if (window.DataBreaches?.list) {
      await window.DataBreaches.list({ embedded: true });
    }
  }

  async function users(opts = {}) {
    const target = opts.target ||
      document.getElementById('users-pane-container') ||
      document.getElementById('admin-content') ||
      document.getElementById('content-area');
    if (!target) return;
    showLoading(target);
    try {
      const userData = await Api.admin.users();
      const userList = userData.data || userData || [];
      target.innerHTML = `
        <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
          <h2 style="margin:0;">User Management</h2>
          <button class="btn btn-primary" onclick="Admin._openUserModal(null)">+ New User</button>
        </div>
        <div class="card">
          <table class="table">
            <thead><tr>
              <th>Full Name</th><th>Username</th><th>Email</th><th>Role</th><th>2FA</th><th>Status</th><th>Created</th><th>Actions</th>
            </tr></thead>
            <tbody>
              ${userList.map(u => `
                <tr>
                  <td><strong>${esc(u.full_name)}</strong></td>
                  <td>${esc(u.username)}</td>
                  <td>${esc(u.email)}</td>
                  <td>${statusBadge(u.role)}</td>
                  <td>${u.two_factor_enabled
                    ? '<span class="badge badge-success">On</span>'
                    : '<span class="badge badge-secondary">Off</span>'}</td>
                  <td>${statusBadge(u.active ? 'Active' : 'Inactive')}</td>
                  <td>${formatDate(u.created_at)}</td>
                  <td style="white-space:nowrap;">
                    <button class="btn btn-secondary btn-sm" onclick="Admin._openUserModal(${u.id})">Edit</button>
                    <button class="btn btn-secondary btn-sm" onclick="Admin._open2faModal(${u.id})">2FA</button>
                    ${u.id !== (window.currentUser?.id) ? `<button class="btn btn-danger btn-sm" onclick="Admin._deleteUser(${u.id},'${esc(u.full_name)}')">Delete</button>` : '<button class="btn btn-sm" disabled title="Cannot delete own account">Delete</button>'}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div id="user-modal-container"></div>`;
    } catch (e) { target.innerHTML = `<p style="color:var(--danger);">Failed to load users: ${esc(e.message)}</p>`; }
  }

  let _usersPaneInited = false;
  function _initUsersPane() {
    if (_usersPaneInited) return;
    _usersPaneInited = true;
    const target = document.getElementById('users-pane-container');
    if (target) users({ target });
  }

  async function _openUserModal(id) {
    let user = null;
    if (id) { try { const all = await Api.admin.users(); const list = all.data || all; user = list.find(u => u.id === id); } catch (e) {} }
    const container = document.getElementById('user-modal-container') || document.body;
    // Render INTO document.body (not the users-pane container) so clicking
    // anywhere within the page chrome does not bubble back up through a
    // backdrop ancestor. Using body also keeps the modal alive across
    // user-list refreshes (e.g. after a save by another tab).
    let host = document.getElementById('user-modal-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'user-modal-host';
      document.body.appendChild(host);
    }
    host.innerHTML = `
      <div class="modal-overlay" id="user-modal">
        <div class="modal" style="width:560px;">
          <div class="modal-header">
            <h3>${user ? 'Edit User' : 'New User'}</h3>
            <button class="btn-close" onclick="Admin._closeModal()">×</button>
          </div>
          <div class="modal-body">
            <div id="modal-error" style="display:none;color:var(--danger);margin-bottom:.75rem;"></div>
            <div class="form-group"><label>Full Name *</label><input class="form-control" id="u-fullname" value="${esc(user?.full_name||'')}"></div>
            <div class="form-group"><label>Username *</label><input class="form-control" id="u-username" value="${esc(user?.username||'')}"></div>
            <div class="form-group"><label>Email *</label><input class="form-control" type="email" id="u-email" value="${esc(user?.email||'')}"></div>
            <div class="form-group"><label>Password ${user ? '(leave blank to keep current)' : '*'}</label><input class="form-control" type="password" id="u-password" autocomplete="new-password"></div>
            <div class="form-group"><label>Role *</label>
              <select class="form-control" id="u-role">
                <option value="admin" ${user?.role==='admin'?'selected':''}>Admin (full access)</option>
                <option value="broker" ${user?.role==='broker'?'selected':''}>Broker</option>
                <option value="admin_only" ${user?.role==='admin_only'?'selected':''}>Admin Only (data entry, no delete)</option>
              </select></div>
            ${user ? `<div class="form-group"><label>Active</label>
              <select class="form-control" id="u-active">
                <option value="1" ${user.active?'selected':''}>Active</option>
                <option value="0" ${!user.active?'selected':''}>Inactive</option>
              </select></div>` : ''}
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="Admin._closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="Admin._saveUser(${id||'null'})">Save</button>
          </div>
        </div>
      </div>`;
  }

  // ── Broker codes (rendered inside the Broker Fitness profile detail) ─────
  async function _renderBrokerCodes(userId) {
    const slot = document.getElementById('bc-list');
    if (!slot) return;
    slot.innerHTML = '<div style="font-size:.82rem;color:#888;">Loading…</div>';
    try {
      const res = await Api.admin.listBrokerCodes(userId);
      const codes = res.data || res || [];
      if (!codes.length) {
        slot.innerHTML = '<div style="font-size:.82rem;color:#888;font-style:italic;">No broker codes yet — add one below.</div>';
        return;
      }
      slot.innerHTML = codes.map(c => `
        <div style="display:grid;grid-template-columns:1fr 2fr auto;gap:.5rem;align-items:center;margin-bottom:.4rem;">
          <input class="form-control" data-bc-code="${c.id}" value="${esc(c.code)}">
          <input class="form-control" data-bc-desc="${c.id}" value="${esc(c.description || '')}" placeholder="Description (optional)">
          <span style="display:flex;gap:.3rem;">
            <button class="btn btn-xs btn-outline" type="button" onclick="Admin._updateBrokerCode(${c.id}, ${userId})">Save</button>
            <button class="btn btn-xs btn-danger"  type="button" onclick="Admin._deleteBrokerCode(${c.id}, ${userId})">×</button>
          </span>
        </div>`).join('');
    } catch (e) {
      slot.innerHTML = `<div style="color:var(--danger);font-size:.82rem;">Failed to load: ${esc(e.message)}</div>`;
    }
  }

  async function _addBrokerCode(userId) {
    const codeEl = document.getElementById('bc-new-code');
    const descEl = document.getElementById('bc-new-desc');
    const errEl = document.getElementById('bc-error');
    errEl.style.display = 'none';
    const code = (codeEl.value || '').trim();
    if (!code) { errEl.style.display = 'block'; errEl.textContent = 'Code is required.'; return; }
    try {
      await Api.admin.createBrokerCode(userId, { code, description: (descEl.value || '').trim() });
      codeEl.value = ''; descEl.value = '';
      await _renderBrokerCodes(userId);
    } catch (e) {
      errEl.style.display = 'block'; errEl.textContent = e.message;
    }
  }

  async function _updateBrokerCode(id, userId) {
    const codeEl = document.querySelector(`[data-bc-code="${id}"]`);
    const descEl = document.querySelector(`[data-bc-desc="${id}"]`);
    const errEl = document.getElementById('bc-error');
    errEl.style.display = 'none';
    try {
      await Api.admin.updateBrokerCode(id, {
        code: (codeEl.value || '').trim(),
        description: (descEl.value || '').trim(),
      });
      showToast('Broker code saved');
      await _renderBrokerCodes(userId);
    } catch (e) {
      errEl.style.display = 'block'; errEl.textContent = e.message;
    }
  }

  async function _deleteBrokerCode(id, userId) {
    if (!confirmDialog('Delete this broker code? Policies that already reference it keep their snapshot.')) return;
    try {
      await Api.admin.deleteBrokerCode(id);
      await _renderBrokerCodes(userId);
    } catch (e) {
      const errEl = document.getElementById('bc-error');
      errEl.style.display = 'block'; errEl.textContent = e.message;
    }
  }

  async function _saveUser(id) {
    const fullName = document.getElementById('u-fullname')?.value?.trim();
    const username = document.getElementById('u-username')?.value?.trim();
    const email = document.getElementById('u-email')?.value?.trim();
    const password = document.getElementById('u-password')?.value;
    const role = document.getElementById('u-role')?.value;
    const active = document.getElementById('u-active')?.value;
    const errEl = document.getElementById('modal-error');

    if (!fullName || !username || !email || !role) { errEl.style.display='block'; errEl.textContent='Full Name, Username, Email and Role are required.'; return; }
    if (!id && !password) { errEl.style.display='block'; errEl.textContent='Password is required for new users.'; return; }

    const data = { full_name: fullName, username, email, role };
    if (password) data.password = password;
    if (active !== undefined) data.active = parseInt(active);

    try {
      if (id) await Api.admin.updateUser(id, data);
      else await Api.admin.createUser(data);
      _closeModal();
      showToast(id ? 'User updated' : 'User created');
      const target = document.getElementById('users-pane-container');
      users(target ? { target } : {});
    } catch (e) { errEl.style.display='block'; errEl.textContent = e.message; }
  }

  async function _deleteUser(id, name) {
    if (!confirmDialog(`Delete user "${name}"? This cannot be undone.`)) return;
    try {
      await Api.admin.deleteUser(id);
      showToast('User deleted');
      const target = document.getElementById('users-pane-container');
      users(target ? { target } : {});
    } catch (e) { showToast('Delete failed: ' + e.message, 'error'); }
  }

  function _closeModal() {
    const m = document.getElementById('user-modal');
    if (m) m.remove();
    // The body-level host stays in place but is wiped so any future
    // open() starts from a clean DOM tree.
    const host = document.getElementById('user-modal-host');
    if (host) host.innerHTML = '';
  }

  // ── Audit detail modal ────────────────────────────────────────────────────
  // Pretty-prints an audit_log row's old_value / new_value (both stored as JSON
  // strings) into a centred side-by-side diff popup. Fields that did not change
  // are de-emphasised; changed fields are highlighted on each side.
  function openAuditDetailModal(r) {
    document.getElementById('audit-detail-overlay')?.remove();

    const parse = (s) => {
      if (s === null || s === undefined || s === '') return null;
      if (typeof s !== 'string') return s;
      try { return JSON.parse(s); } catch (_) { return s; }
    };
    const oldObj = parse(r.old_value);
    const newObj = parse(r.new_value);

    const fmtCell = (v) => {
      if (v === null || v === undefined || v === '') return '<span style="color:#aaa;">—</span>';
      if (typeof v === 'object') return `<pre style="margin:0;font-size:.78rem;white-space:pre-wrap;">${esc(JSON.stringify(v, null, 2))}</pre>`;
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      return esc(String(v));
    };
    const prettyLabel = (k) => String(k)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

    let body = '';
    if (isObj(oldObj) || isObj(newObj)) {
      // Build a unified key list so removed/added fields both show up.
      const keys = Array.from(new Set([
        ...(isObj(oldObj) ? Object.keys(oldObj) : []),
        ...(isObj(newObj) ? Object.keys(newObj) : []),
      ]));
      body = `
        <table class="table" style="font-size:.85rem;width:100%;border-collapse:collapse;">
          <thead><tr style="background:#f4f6f8;">
            <th style="text-align:left;padding:.5rem;width:30%;">Field</th>
            <th style="text-align:left;padding:.5rem;width:35%;">Before</th>
            <th style="text-align:left;padding:.5rem;width:35%;">After</th>
          </tr></thead>
          <tbody>
            ${keys.map(k => {
              const oldV = isObj(oldObj) ? oldObj[k] : undefined;
              const newV = isObj(newObj) ? newObj[k] : undefined;
              const changed = JSON.stringify(oldV) !== JSON.stringify(newV);
              const rowBg = changed ? '#fff8e1' : '';
              return `
                <tr style="border-bottom:1px solid #eee;background:${rowBg};">
                  <td style="padding:.45rem .5rem;font-weight:${changed ? '600' : '500'};color:${changed ? '#7a4a00' : '#444'};">${esc(prettyLabel(k))}</td>
                  <td style="padding:.45rem .5rem;color:${changed ? '#a71d2a' : '#666'};vertical-align:top;">${fmtCell(oldV)}</td>
                  <td style="padding:.45rem .5rem;color:${changed ? '#1a7a3a' : '#666'};vertical-align:top;">${fmtCell(newV)}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>`;
    } else {
      // Non-object payloads (rare) — just show side-by-side blocks.
      body = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
          <div>
            <div style="font-weight:600;margin-bottom:.35rem;color:#a71d2a;">Before</div>
            <div style="padding:.6rem;border:1px solid #eee;border-radius:6px;background:#fffbfb;">${fmtCell(oldObj)}</div>
          </div>
          <div>
            <div style="font-weight:600;margin-bottom:.35rem;color:#1a7a3a;">After</div>
            <div style="padding:.6rem;border:1px solid #eee;border-radius:6px;background:#fafff8;">${fmtCell(newObj)}</div>
          </div>
        </div>`;
    }

    const overlay = document.createElement('div');
    overlay.id = 'audit-detail-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.45);' +
      'display:flex;align-items:center;justify-content:center;z-index:9999;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:10px;width:min(960px,94vw);max-height:88vh;
                  display:flex;flex-direction:column;box-shadow:0 18px 48px rgba(0,0,0,.3);">
        <div style="padding:.9rem 1.2rem;border-bottom:1px solid #eee;display:flex;align-items:center;gap:.75rem;">
          <span class="badge" data-status="${esc(r.action)}" style="font-size:.75rem;">${esc(r.action)}</span>
          <strong style="font-size:.95rem;">${esc(r.module)}</strong>
          <span style="color:#888;font-size:.8rem;">record #${esc(r.record_id || '—')}</span>
          <span style="margin-left:auto;color:#888;font-size:.8rem;">${esc(formatDateTime(r.timestamp))} · ${esc(r.user_full_name || r.user_id || 'System')}</span>
          <button id="audit-detail-close"
                  style="margin-left:.5rem;background:transparent;border:none;font-size:1.4rem;cursor:pointer;color:#666;line-height:1;">×</button>
        </div>
        ${r.description ? `<div style="padding:.75rem 1.2rem;background:#fafbfc;color:#333;font-size:.85rem;border-bottom:1px solid #eee;">${esc(r.description)}</div>` : ''}
        <div style="padding:1rem 1.2rem;overflow:auto;">
          ${body}
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    // Click-outside-to-close intentionally disabled — only the × / Escape close.
    overlay.querySelector('#audit-detail-close')?.addEventListener('click', close);
    document.addEventListener('keydown', function escClose(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escClose); }
    });
  }

  async function auditLog() {
    setPageTitle('Audit Log');
    setBreadcrumb(['Admin', 'Audit Log']);
    const tabEl = document.querySelector('.tab-bar');
    if (tabEl) {
      tabEl.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('tab-audit')?.classList.add('active');
    }
    const el = document.getElementById('admin-content') || document.getElementById('content-area');
    let filters = { page: 1, limit: 50 };

    async function loadLog() {
      showLoading(el);
      try {
        const data = await Api.admin.auditLog(filters);
        const rows = data.data || data;
        const total = data.total || rows.length;
        const pages = data.pages || 1;

        el.innerHTML = `
          <div class="page-header"><h2>Audit Log</h2></div>
          <div class="card" style="padding:1rem;margin-bottom:1rem;">
            <div class="filter-bar">
              <select class="form-control" id="f-module" onchange="auditFilters('module',this.value)" style="width:200px;">
                <option value="">All Modules</option>
                ${(() => {
                  // Audit module values mapped to the labels users see in the sidebar
                  // (or, where there is no sidebar entry, the label used in-app).
                  const MODULE_LABELS = [
                    ['accounts',                'Accounts'],
                    ['admin_reveal',            'Admin Reveal'],
                    ['advice_records',          'Records of Advice'],
                    ['assets',                  'Covers'],
                    ['auth',                    'Auth'],
                    ['broker_profiles',         'Broker Profiles'],
                    ['claims',                  'Claims'],
                    ['client_engagements',      'Client Engagements'],
                    ['commission_log',          'Commission Log'],
                    ['complaints',              'Complaints'],
                    ['contacts',                'Contacts'],
                    ['cpd_activities',          'CPD Activities'],
                    ['dashboard_config',        'Dashboard Config'],
                    ['data_breach',             'Data Breach'],
                    ['documents',               'Documents'],
                    ['emails',                  'Emails'],
                    ['fica_account',            'FICA (Account)'],
                    ['fica_contact',            'FICA (Contact)'],
                    ['notifications',           'Notifications'],
                    ['policies',                'Policies'],
                    ['policy_quotes',           'Policy Quotes / Schedules'],
                    ['policy_sections',         'Policy Sections'],
                    ['popia_account',           'POPIA (Account)'],
                    ['popia_compliance_report', 'POPIA Compliance Report'],
                    ['popia_contact',           'POPIA (Contact)'],
                    ['popia_request',           'POPIA Request'],
                    ['post_sale_events',        'Post-Sale Events'],
                    ['products',                'Products'],
                    ['reports',                 'Reports'],
                    ['reviews',                 'Reviews'],
                    ['risk_details',            'Risk Details'],
                    ['tcf_evidence_pack',       'TCF Evidence Pack'],
                    ['users',                   'Users'],
                    ['workflows',               'Workflows'],
                  ].sort((a, b) => a[1].localeCompare(b[1]));
                  return MODULE_LABELS.map(([v, label]) =>
                    `<option value="${v}" ${filters.module === v ? 'selected' : ''}>${label}</option>`
                  ).join('');
                })()}
              </select>
              <select class="form-control" id="f-action" onchange="auditFilters('action',this.value)" style="width:130px;">
                <option value="">All Actions</option>
                ${['CREATE','UPDATE','DELETE','LOGIN','LOGOUT','EXPORT','REVEAL','REVEAL_DENIED'].map(a=>`<option value="${a}" ${filters.action===a?'selected':''}>${a}</option>`).join('')}
              </select>
              <input type="date" class="form-control" id="f-from" value="${filters.from||''}" onchange="auditFilters('from',this.value)" style="width:150px;">
              <input type="date" class="form-control" id="f-to" value="${filters.to||''}" onchange="auditFilters('to',this.value)" style="width:150px;">
              <button class="btn btn-secondary btn-sm" onclick="auditFilters('reset')">Clear</button>
            </div>
          </div>
          <div class="card">
            <table class="table" style="font-size:.85rem;">
              <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Module</th><th>Record ID</th><th>Description</th><th>Detail</th></tr></thead>
              <tbody>
                ${rows.map((r,i) => `
                  <tr>
                    <td style="white-space:nowrap;">${formatDateTime(r.timestamp)}</td>
                    <td>${esc(r.user_full_name||r.user_id||'System')}</td>
                    <td><span class="badge" data-status="${r.action}">${esc(r.action)}</span></td>
                    <td>${esc(r.module)}</td>
                    <td>${esc(r.record_id||'')}</td>
                    <td>${esc(r.description||'')}</td>
                    <td>
                      ${(r.old_value || r.new_value)
                        ? `<button class="btn btn-xs btn-outline js-audit-view" data-idx="${i}">View</button>`
                        : '<span style="color:var(--text-light);font-size:.75rem;">—</span>'}
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
            ${rows.length === 0 ? '<div class="empty-state"><p>No audit log entries found.</p></div>' : ''}
          </div>
          <div class="pagination">
            ${filters.page > 1 ? `<button class="btn btn-secondary btn-sm" onclick="auditPage(${filters.page-1})">← Prev</button>` : ''}
            <span style="font-size:.85rem;padding:0 .75rem;">Page ${filters.page} / ${pages} (${total} entries)</span>
            ${filters.page < pages ? `<button class="btn btn-secondary btn-sm" onclick="auditPage(${filters.page+1})">Next →</button>` : ''}
          </div>`;

        window.auditFilters = (key, val) => {
          if (key === 'reset') { filters = { page: 1, limit: 50 }; }
          else { filters[key] = val || undefined; filters.page = 1; }
          loadLog();
        };
        window.auditPage = (p) => { filters.page = p; loadLog(); };

        // Wire up View buttons → centred diff modal.
        el.querySelectorAll('.js-audit-view').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx, 10);
            const r = rows[idx];
            if (r) openAuditDetailModal(r);
          });
        });
      } catch (e) { el.innerHTML = `<p style="color:var(--danger);">Failed to load audit log: ${esc(e.message)}</p>`; }
    }

    loadLog();
  }

  async function settings() {
    setPageTitle('Settings');
    setBreadcrumb(['Admin', 'Settings']);
    const tabEl = document.querySelector('.tab-bar');
    if (tabEl) {
      tabEl.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('tab-settings')?.classList.add('active');
    }
    // Reset lazy-init flags so each pane refreshes its data when the
    // user re-enters Settings.
    _usersPaneInited    = false;
    _securityPaneInited = false;
    _dashDefaultInited  = false;
    _companyPaneInited  = false;
    const el = document.getElementById('admin-content') || document.getElementById('content-area');
    const theme = (typeof localStorage !== 'undefined' && localStorage.getItem('theme')) || 'light';
    const isFullAdmin = window.currentUser?.role === 'admin';
    const canSendNotifications = isFullAdmin || window.currentUser?.role === 'admin_only';

    // Sidebar items: Export sits at the bottom. Hidden for non-full-admin users.
    const sections = [
      { id: 'appearance',        label: 'Appearance',            icon: '◐', show: true,        bottom: false },
      { id: 'company',           label: 'Company Details',       icon: '◫', show: isFullAdmin, bottom: false },
      { id: 'users',             label: 'User Management',       icon: '●', show: isFullAdmin, bottom: false },
      { id: 'broker-fitness',    label: 'Broker Fitness Alerts', icon: '⚑', show: isFullAdmin, bottom: false },
      { id: 'email',             label: 'Email Settings',        icon: '✉', show: isFullAdmin, bottom: false },
      { id: 'notifications',     label: 'Notifications',         icon: '◔', show: canSendNotifications, bottom: false },
      { id: 'security',          label: 'Security',              icon: '⚿', show: isFullAdmin, bottom: false },
      { id: 'dashboard-default', label: 'Dashboard Default',     icon: '▣', show: isFullAdmin, bottom: false },
      { id: 'system-update',     label: 'System Update',         icon: '⟳', show: isFullAdmin, bottom: true  },
      { id: 'backup',            label: 'Backup & Restore',      icon: '⛁', show: isFullAdmin, bottom: true  },
      { id: 'export',            label: 'Export',                icon: '↧', show: isFullAdmin, bottom: true  },
    ].filter(s => s.show);

    const sidebarItem = (s, isActive) => `
      <button class="settings-nav-item ${isActive ? 'active' : ''}" data-section="${s.id}"
        style="
          display:flex;align-items:center;gap:.6rem;width:100%;padding:.6rem .85rem;
          border:none;background:${isActive ? 'var(--primary, #2980b9)' : 'transparent'};
          color:${isActive ? '#fff' : 'var(--text)'};
          text-align:left;cursor:pointer;border-radius:6px;font-size:.88rem;
          font-weight:${isActive ? '600' : '500'};
          transition:background var(--transition);
        ">
        <span style="font-size:1rem;">${s.icon}</span>
        <span>${s.label}</span>
      </button>`;

    const topItems    = sections.filter(s => !s.bottom);
    const bottomItems = sections.filter(s =>  s.bottom);

    el.innerHTML = `
      <div style="display:flex;gap:1.25rem;align-items:flex-start;min-height:520px;">

        <!-- Sub-sidebar — sized by its own contents, sticky so it stays
             visible when the active pane is taller than the viewport.
             align-items:flex-start on the flex parent stops it from
             stretching to match the pane height. -->
        <nav id="settings-subnav" style="
          width:230px;flex:none;background:var(--card-bg);
          border:1px solid var(--border);border-radius:var(--border-radius);
          padding:.75rem;display:flex;flex-direction:column;gap:.25rem;
          position:sticky;top:1rem;align-self:flex-start;
        ">
          ${topItems.map((s, i) => sidebarItem(s, i === 0)).join('')}
          ${bottomItems.length ? `
            <div style="flex:1;"></div>
            <div style="border-top:1px solid var(--border);margin:.5rem 0;"></div>
            ${bottomItems.map(s => sidebarItem(s, false)).join('')}
          ` : ''}
        </nav>

        <!-- Section pane -->
        <div style="flex:1;min-width:0;">

          <!-- Appearance -->
          <section data-section-pane="appearance">
            <div class="detail-section card" style="max-width:600px;">
              <div class="detail-section-title">Appearance</div>
              <div class="form-group">
                <label class="form-label">Theme</label>
                <div style="display:flex;gap:.75rem;margin-top:.35rem;">
                  <button class="btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}" onclick="window.setTheme('dark');Admin.settings()">🌙 Dark Mode</button>
                  <button class="btn ${theme === 'dark' ? 'btn-secondary' : 'btn-primary'}" onclick="window.setTheme('light');Admin.settings()">☀️ Light Mode</button>
                </div>
              </div>
            </div>
          </section>

          ${isFullAdmin ? `
          <!-- Broker Fitness Alerts -->
          <section data-section-pane="broker-fitness" style="display:none;">
            <div class="detail-section card" style="max-width:680px;">
              <div class="detail-section-title">Broker Fitness Alerts</div>
              <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 .75rem;">
                Background scanner that fires RE5, CPD, CoB and debarment alerts (spec 4.15).
                Cadence is read live — no restart needed.
              </p>
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Scan interval (hours)</label>
                  <input class="form-control" id="alert-scan-hours" type="number" min="0.5" step="0.5" placeholder="6">
                </div>
                <div class="form-group">
                  <label class="form-label">Weekly digest day</label>
                  <select class="form-control" id="alert-digest-day">
                    ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
                      .map((d, i) => `<option value="${i}">${d}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Weekly digest hour (0–23)</label>
                  <input class="form-control" id="alert-digest-hour" type="number" min="0" max="23" step="1" placeholder="7">
                </div>
              </div>
              <div style="display:flex;gap:.5rem;margin-top:1rem;flex-wrap:wrap;">
                <button class="btn btn-primary btn-sm" onclick="Admin._saveAlertCadence()">Save cadence</button>
                <button class="btn btn-secondary btn-sm" onclick="Admin._runAlertScanNow()">Run scan now</button>
                <button class="btn btn-secondary btn-sm" onclick="Admin._runDigestNow()">Send digest now</button>
              </div>
              <div id="alert-cadence-result" style="margin-top:.5rem;font-size:.85rem;"></div>
            </div>
          </section>

          <!-- Email Settings (SMTP + From addresses + Templates) -->
          <section data-section-pane="email" style="display:none;">
            <div class="detail-section card" style="max-width:760px;">
              <div class="detail-section-title">SMTP Settings</div>
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">SMTP Host</label>
                  <input class="form-control" id="smtp-host" placeholder="smtp.gmail.com">
                </div>
                <div class="form-group">
                  <label class="form-label">SMTP Port</label>
                  <input class="form-control" id="smtp-port" placeholder="587">
                </div>
                <div class="form-group">
                  <label class="form-label">Username / Email</label>
                  <input class="form-control" id="smtp-user" placeholder="your@email.com">
                </div>
                <div class="form-group">
                  <label class="form-label">Password</label>
                  <input class="form-control" type="password" id="smtp-pass" placeholder="••••••••">
                </div>
                <div class="form-group form-grid-span-2">
                  <label class="form-label">From Address (display name)</label>
                  <input class="form-control" id="smtp-from" placeholder="Inexpro CRM &lt;noreply@yourdomain.com&gt;">
                </div>
              </div>
              <div style="display:flex;gap:.75rem;margin-top:1rem;">
                <button class="btn btn-primary" onclick="Admin._saveSmtp()">Save SMTP Settings</button>
                <button class="btn btn-secondary" onclick="Admin._testSmtp()">Test Connection</button>
              </div>
              <div id="smtp-result" style="margin-top:.75rem;"></div>
            </div>

            <div class="detail-section card" style="max-width:760px;margin-top:1.25rem;">
              <div class="detail-section-title">From Email Addresses (per user)</div>
              <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 .75rem;">
                Map a From address to each user. When that user sends an email through the CRM,
                it will be sent from their assigned address. Users without a mapping will use the
                default SMTP From Address above.
              </p>
              <div id="from-list-rows"></div>
              <div style="margin-top:.75rem;display:flex;gap:.5rem;">
                <button class="btn btn-secondary btn-sm" onclick="Admin._addFromRow()">+ Add From Address</button>
                <button class="btn btn-primary btn-sm" onclick="Admin._saveFromList()">Save From Addresses</button>
              </div>
              <div id="from-list-result" style="margin-top:.5rem;"></div>
            </div>

            <div class="detail-section card" style="max-width:760px;margin-top:1.25rem;">
              <div class="detail-section-title" style="display:flex;align-items:center;gap:.5rem;">
                Email Templates
                <span id="placeholder-info-toggle" title="Show available placeholders"
                  style="cursor:pointer;font-size:.9rem;color:var(--color-primary,#1a73e8);user-select:none;"
                  onclick="document.getElementById('placeholder-info').style.display=document.getElementById('placeholder-info').style.display==='none'?'':'none'">&#9432;</span>
              </div>
              <div id="placeholder-info" style="display:none;background:var(--surface-secondary,#f8f9fa);border:1px solid var(--border-color,#dee2e6);border-radius:6px;padding:.75rem 1rem;margin-bottom:.75rem;font-size:.82rem;">
                <strong style="display:block;margin-bottom:.4rem;">Available Placeholders</strong>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:.2rem .75rem;">
                  <span><code>{{client_name}}</code> — Full name</span>
                  <span><code>{{first_name}}</code> — First name</span>
                  <span><code>{{last_name}}</code> — Last name</span>
                  <span><code>{{email}}</code> — Email address</span>
                  <span><code>{{mobile}}</code> — Mobile number</span>
                  <span><code>{{phone}}</code> — Phone number</span>
                  <span><code>{{id_number}}</code> — SA ID number</span>
                  <span><code>{{date_of_birth}}</code> — Date of birth</span>
                  <span><code>{{client_category}}</code> — Client category</span>
                  <span><code>{{client_segment}}</code> — Client segment</span>
                  <span><code>{{contact_status}}</code> — Contact status</span>
                  <span><code>{{account_name}}</code> — Account name</span>
                  <span><code>{{registration_number}}</code> — Company reg no.</span>
                  <span><code>{{vat_number}}</code> — VAT number</span>
                  <span><code>{{account_type}}</code> — Account type</span>
                  <span><code>{{policy_number}}</code> — Policy number(s)</span>
                  <span><code>{{policy_name}}</code> — Policy name(s)</span>
                  <span><code>{{broker_name}}</code> — Current user name</span>
                  <span><code>{{recipient_name}}</code> - Breach email recipient</span>
                  <span><code>{{breach_date}}</code> - Breach date</span>
                  <span><code>{{discovered_date}}</code> - Discovery date</span>
                  <span><code>{{nature}}</code> - Breach nature</span>
                  <span><code>{{data_affected}}</code> - Data affected</span>
                  <span><code>{{remediation}}</code> - Remediation steps</span>
                  <span><code>{{today}}</code> — Today's date</span>
                </div>
                <p style="margin:.5rem 0 0;color:var(--text-muted);font-size:.78rem;">Placeholders are replaced with actual data when a template is applied in the email composer.</p>
              </div>
              <div class="form-group">
                <label class="form-label">Template</label>
                <div style="display:flex;gap:.5rem;">
                  <select class="form-control" id="template-select" onchange="Admin._selectTemplate(this.value)" style="flex:1;"></select>
                  <button class="btn btn-secondary btn-sm" onclick="Admin._addTemplate()" title="Add new template">+ New</button>
                </div>
              </div>
              <div id="template-editor" style="display:none;">
                <div class="form-group">
                  <label class="form-label">Subject</label>
                  <input class="form-control" id="template-subject" placeholder="Email subject...">
                </div>
                <div class="form-group">
                  <label class="form-label">Body (HTML allowed)</label>
                  <textarea class="form-control" id="template-body" rows="8" placeholder="Email body..."></textarea>
                </div>
                <div style="display:flex;gap:.5rem;">
                  <button class="btn btn-primary" onclick="Admin._saveTemplate()">Save Template</button>
                  <button class="btn btn-danger btn-sm" id="template-delete-btn" onclick="Admin._deleteTemplate()" style="margin-left:auto;">Delete Template</button>
                </div>
              </div>
            </div>
          </section>

          <!-- Notifications -->
          <section data-section-pane="notifications" style="display:none;">
            <div class="detail-section card" style="max-width:560px;">
              <div class="detail-section-title">Send Notification</div>
              <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 .75rem;">
                Push a custom in-app notification to a user (or all users). Optionally
                attach a contact + module so the recipient knows where to look.
              </p>
              <div class="form-group">
                <label class="form-label required">Subject</label>
                <input type="text" id="notif-subject" class="form-control" maxlength="200" />
              </div>
              <div class="form-group">
                <label class="form-label required">Message</label>
                <textarea id="notif-message" class="form-control" rows="4" maxlength="2000"></textarea>
              </div>
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Severity</label>
                  <select id="notif-severity" class="form-control">
                    <option value="info" selected>Info</option>
                    <option value="warning">Warning</option>
                    <option value="danger">Danger</option>
                    <option value="success">Success</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label required">Recipient</label>
                  <select id="notif-recipient" class="form-control">
                    <option value="all">All Users</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Module (optional)</label>
                  <select id="notif-module" class="form-control">
                    <option value="">— None —</option>
                    <option value="contacts">Contacts</option>
                    <option value="accounts">Accounts</option>
                    <option value="policies">Policies</option>
                    <option value="claims">Claims</option>
                    <option value="complaints">Complaints</option>
                    <option value="reviews">Reviews</option>
                    <option value="advice_records">Records of Advice</option>
                    <option value="client_engagements">Client Engagements</option>
                    <option value="assets">Assets</option>
                    <option value="popia">POPIA</option>
                    <option value="fica">FICA</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Contact / Account (optional)</label>
                  <select id="notif-contact" class="form-control">
                    <option value="">— None —</option>
                  </select>
                </div>
              </div>
              <button class="btn btn-primary" id="notif-send-btn" onclick="Admin._sendNotification()" style="margin-top:.5rem;">
                Send Notification
              </button>
              <div id="notif-send-result" style="margin-top:.5rem;font-size:.82rem;"></div>
            </div>
          </section>

          <!-- Company Details — CIPC, VAT, addresses, contact persons, documents -->
          <section data-section-pane="company" style="display:none;">
            <div id="company-pane-container">
              <div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>
            </div>
          </section>

          <!-- User Management — moved here from a top-level tab -->
          <section data-section-pane="users" style="display:none;">
            <div id="users-pane-container">
              <div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>
            </div>
          </section>

          <!-- Security: OTP issuance + bypass toggle -->
          <section data-section-pane="security" style="display:none;">
            <div class="detail-section card" style="max-width:780px;">
              <div class="detail-section-title">Edit-Password Bypass</div>
              <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 .75rem;">
                When enabled, users can edit any record in any module <strong>without
                entering an admin password or PIN</strong>. The bypass is logged in
                the audit trail every time a record is saved.
              </p>
              <label style="display:flex;align-items:center;gap:.6rem;cursor:pointer;">
                <input type="checkbox" id="sec-bypass-toggle" style="width:18px;height:18px;cursor:pointer;">
                <span style="font-size:.9rem;font-weight:500;">Disable password requirement for edits (all modules)</span>
              </label>
              <div id="sec-bypass-result" style="margin-top:.5rem;font-size:.82rem;"></div>
            </div>

            <div class="detail-section card" style="max-width:780px;margin-top:1.25rem;">
              <div class="detail-section-title">Issue One-Time PIN</div>
              <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 .75rem;">
                Generate a 6-digit PIN a broker can enter <em>instead of</em> an admin
                password to authorise an edit on a locked record. PINs are single-use,
                expire after the time you set, and every issue + redemption is
                audit-logged with the issuing admin's name.
              </p>
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Target user</label>
                  <select id="sec-otp-user" class="form-control">
                    <option value="">Any user</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Valid for (minutes)</label>
                  <input type="number" id="sec-otp-ttl" class="form-control" min="1" max="1440" value="60">
                </div>
                <div class="form-group form-grid-span-2">
                  <label class="form-label">Notes (optional)</label>
                  <input type="text" id="sec-otp-notes" class="form-control" maxlength="500"
                         placeholder="e.g. amend ROA for client X">
                </div>
              </div>
              <div style="display:flex;gap:.5rem;margin-top:.5rem;align-items:center;">
                <button class="btn btn-primary" onclick="Admin._generateOtp()">Generate PIN</button>
                <span id="sec-otp-result" style="font-size:.85rem;"></span>
              </div>
              <div id="sec-otp-issued" style="margin-top:.85rem;display:none;
                   padding:.85rem 1rem;border:1px dashed #b6c9e6;border-radius:8px;background:#f4f8fd;">
                <div style="font-size:.78rem;color:#555;margin-bottom:.25rem;">Generated PIN — share securely with the user</div>
                <div style="display:flex;align-items:center;gap:.75rem;">
                  <span id="sec-otp-code" style="font-family:Menlo,Consolas,monospace;font-size:1.6rem;font-weight:700;letter-spacing:.4rem;color:#1a5276;"></span>
                  <button class="btn btn-secondary btn-sm" onclick="Admin._copyOtp()">Copy</button>
                </div>
                <div id="sec-otp-meta" style="margin-top:.35rem;font-size:.78rem;color:#666;"></div>
              </div>
            </div>

            <div class="detail-section card" style="max-width:780px;margin-top:1.25rem;">
              <div class="detail-section-title" style="display:flex;align-items:center;gap:.5rem;">
                Active &amp; Recent PINs
                <button class="btn btn-secondary btn-sm" style="margin-left:auto;font-size:.75rem;" onclick="Admin._refreshOtps()">↻ Refresh</button>
              </div>
              <div id="sec-otp-list">
                <p style="color:var(--text-muted);font-size:.85rem;">Loading…</p>
              </div>
            </div>
          </section>

          <!-- Dashboard Default — moved here from a top-level tab -->
          <section data-section-pane="dashboard-default" style="display:none;">
            <div id="dashboard-default-container">
              <div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>
            </div>
          </section>

          <!-- System Update -->
          <section data-section-pane="system-update" style="display:none;">
            <div class="detail-section card" style="max-width:780px;">
              <div class="detail-section-title">System Update</div>
              <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 .75rem;">
                Pulls the latest tagged release from GitHub, snapshots the
                database, installs dependencies, and runs any pending schema
                migrations. The server restarts automatically once the update
                is applied. If anything goes wrong, use <strong>Rollback</strong>
                to restore the most recent snapshot. Every action is recorded
                in the audit log.
              </p>
              <div id="sys-update-status" style="font-size:.85rem;color:var(--text-muted);margin-bottom:.75rem;">
                Loading status…
              </div>
              <div id="sys-update-changelog" style="margin-bottom:.75rem;"></div>
              <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;">
                <button class="btn btn-secondary btn-sm" id="sys-update-check"
                  onclick="Admin._systemCheckUpdates()">Check for Updates</button>
                <button class="btn btn-primary btn-sm" id="sys-update-apply"
                  onclick="Admin._systemApplyUpdate()" disabled>Apply Update</button>
                <button class="btn btn-danger btn-sm" id="sys-update-rollback"
                  onclick="Admin._systemRollback()" disabled
                  style="margin-left:auto;">Rollback to Last Snapshot</button>
              </div>
              <div id="sys-update-result" style="margin-top:.75rem;font-size:.85rem;"></div>

              <div class="detail-section-title" style="margin-top:1.5rem;font-size:.9rem;">Database Snapshots</div>
              <p style="font-size:.78rem;color:var(--text-muted);margin:0 0 .5rem;">
                Most recent snapshot is restored by Rollback. Last 5 snapshots
                are retained automatically.
              </p>
              <div id="sys-update-snapshots" style="font-size:.82rem;">Loading…</div>
            </div>
          </section>

          <!-- Backup & Restore -->
          <section data-section-pane="backup" style="display:none;">
            <div class="detail-section card" style="max-width:640px;">
              <div class="detail-section-title">Backup</div>
              <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 .75rem;">
                Download a consistent point-in-time copy of the live database
                to your computer. The server keeps no copy of the file. Use
                this before large data imports, or as a periodic offline
                safety net — separate from the automatic snapshots taken on
                each system update.
              </p>
              <p style="font-size:.78rem;color:var(--text-muted);margin:0 0 .75rem;">
                <strong>POPIA reminder:</strong> the downloaded file contains
                client PII (names, IDs, contact details, claims). Store it
                encrypted, transfer it via secure channels only, and delete
                local copies once they're no longer needed.
              </p>
              <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
                <button class="btn btn-primary btn-sm" id="sys-backup-btn"
                  onclick="Admin._systemDownloadBackup()">↧ Download Database Backup</button>
                <span id="sys-backup-result" style="font-size:.8rem;color:var(--text-muted);"></span>
              </div>
            </div>

            <div class="detail-section card" style="max-width:640px;margin-top:1.25rem;border-color:var(--danger,#c0392b);">
              <div class="detail-section-title" style="color:var(--danger,#c0392b);">Restore from Backup</div>
              <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 .5rem;">
                Replace the live database with a previously downloaded
                <code>.db</code> file. <strong>This wipes any data added or
                changed since that backup was taken.</strong>
              </p>
              <p style="font-size:.78rem;color:var(--text-muted);margin:0 0 .75rem;">
                Before any swap, the current database is snapshotted to the
                update-snapshots store, so you can undo a restore via
                <em>System Update → Rollback</em> if you change your mind.
                The server restarts automatically once the restore is
                applied.
              </p>
              <div class="form-group">
                <label class="form-label">Select <code>.db</code> file</label>
                <input type="file" id="sys-restore-file" accept=".db,.sqlite,.sqlite3,application/x-sqlite3,application/vnd.sqlite3"
                  class="form-control" style="padding:.4rem;">
              </div>
              <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
                <button class="btn btn-danger btn-sm" id="sys-restore-btn"
                  onclick="Admin._systemRestore()">⟲ Restore Database</button>
                <span id="sys-restore-result" style="font-size:.8rem;"></span>
              </div>
            </div>
          </section>

          <!-- Export -->
          <section data-section-pane="export" style="display:none;">
            <div class="detail-section card" style="max-width:480px;">
              <div class="detail-section-title">Export Data</div>
              <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 .75rem;">
                Download a CSV snapshot of a module.
              </p>
              <div class="form-group">
                <label class="form-label">Module</label>
                <select id="export-module-select" class="form-control">
                  <option value="">Loading…</option>
                </select>
              </div>
              <div style="display:flex;gap:.5rem;margin-top:.5rem;flex-wrap:wrap;">
                <button class="btn btn-primary" id="export-module-btn" onclick="Admin._exportModule('csv')">
                  Export as CSV
                </button>
                <button class="btn btn-secondary" id="export-module-xlsx-btn" onclick="Admin._exportModule('xlsx')">
                  Export as Excel
                </button>
              </div>
              <div id="export-module-result" style="margin-top:.5rem;font-size:.82rem;"></div>
            </div>
          </section>
          ` : ''}

          ${canSendNotifications && !isFullAdmin ? `
          <!-- Notifications -->
          <section data-section-pane="notifications" style="display:none;">
            <div class="detail-section card" style="max-width:560px;">
              <div class="detail-section-title">Send Notification</div>
              <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 .75rem;">
                Push a custom in-app notification to a user (or all users). Optionally
                attach a contact + module so the recipient knows where to look.
              </p>
              <div class="form-group">
                <label class="form-label required">Subject</label>
                <input type="text" id="notif-subject" class="form-control" maxlength="200" />
              </div>
              <div class="form-group">
                <label class="form-label required">Message</label>
                <textarea id="notif-message" class="form-control" rows="4" maxlength="2000"></textarea>
              </div>
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Severity</label>
                  <select id="notif-severity" class="form-control">
                    <option value="info" selected>Info</option>
                    <option value="warning">Warning</option>
                    <option value="danger">Danger</option>
                    <option value="success">Success</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label required">Recipient</label>
                  <select id="notif-recipient" class="form-control">
                    <option value="all">All Users</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Module (optional)</label>
                  <select id="notif-module" class="form-control">
                    <option value="">None</option>
                    <option value="contacts">Contacts</option>
                    <option value="accounts">Accounts</option>
                    <option value="policies">Policies</option>
                    <option value="claims">Claims</option>
                    <option value="complaints">Complaints</option>
                    <option value="reviews">Reviews</option>
                    <option value="advice_records">Records of Advice</option>
                    <option value="client_engagements">Client Engagements</option>
                    <option value="assets">Assets</option>
                    <option value="popia">POPIA</option>
                    <option value="fica">FICA</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Contact / Account (optional)</label>
                  <select id="notif-contact" class="form-control">
                    <option value="">None</option>
                  </select>
                </div>
              </div>
              <button class="btn btn-primary" id="notif-send-btn" onclick="Admin._sendNotification()" style="margin-top:.5rem;">
                Send Notification
              </button>
              <div id="notif-send-result" style="margin-top:.5rem;font-size:.82rem;"></div>
            </div>
          </section>
          ` : ''}

        </div>
      </div>
    `;

    // Wire sidebar nav: clicking an item shows the matching <section>
    const subnav = document.getElementById('settings-subnav');
    if (subnav) {
      subnav.querySelectorAll('.settings-nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const target = btn.dataset.section;
          // Toggle active styles on nav items
          subnav.querySelectorAll('.settings-nav-item').forEach(b => {
            const active = b === btn;
            b.classList.toggle('active', active);
            b.style.background = active ? 'var(--primary, #2980b9)' : 'transparent';
            b.style.color      = active ? '#fff' : 'var(--text)';
            b.style.fontWeight = active ? '600' : '500';
          });
          // Show only the matching pane
          el.querySelectorAll('[data-section-pane]').forEach(p => {
            p.style.display = p.dataset.sectionPane === target ? '' : 'none';
          });
          // Lazy-init panes that need data on first reveal
          if (target === 'company')           Admin._initCompanyPane();
          if (target === 'users')             Admin._initUsersPane();
          if (target === 'security')          Admin._initSecurityPane();
          if (target === 'dashboard-default') Admin._initDashboardDefaultPane();
          if (target === 'system-update')     Admin._initSystemUpdatePane();
        });
      });
    }

    // Populate the export-module select
    if (isFullAdmin) {
      (async () => {
        try {
          const res = await Api.admin.exportableModules();
          const mods = res.data || res || [];
          const sel = document.getElementById('export-module-select');
          if (sel) {
            sel.innerHTML = '<option value="">— Select module —</option>' +
              mods.map(m => `<option value="${m.key}">${m.label}</option>`).join('');
          }
        } catch (err) {
          const sel = document.getElementById('export-module-select');
          if (sel) sel.innerHTML = '<option value="">Failed to load modules</option>';
        }
      })();

    }

    if (canSendNotifications) {
      // Populate the Send Notification recipient + contact/account lists
      (async () => {
        try {
          const [usersRes, contactsRes, accountsRes] = await Promise.all([
            Api.admin.users(),
            Api.contacts.list({ limit: 1000 }).catch(() => ({ data: [] })),
            Api.accounts.list({ limit: 1000 }).catch(() => ({ data: [] })),
          ]);
          const users    = usersRes.data    || usersRes    || [];
          const contacts = contactsRes.data || contactsRes || [];
          const accounts = accountsRes.data || accountsRes || [];

          const recSel = document.getElementById('notif-recipient');
          if (recSel) {
            recSel.innerHTML = `<option value="all">All Users</option>` +
              users.filter(u => u.active !== 0).map(u =>
                `<option value="${u.id}">${esc(u.full_name || u.username)}</option>`
              ).join('');
          }
          const cSel = document.getElementById('notif-contact');
          if (cSel) {
            const contactOpts = contacts
              .map(c => {
                const nm = `${c.first_name || ''} ${c.last_name || ''}`.trim() || `Contact #${c.id}`;
                return { label: nm, value: `contact:${c.id}`, sortKey: nm.toLowerCase() };
              });
            const accountOpts = accounts
              .map(a => {
                const nm = a.account_name || `Account #${a.id}`;
                return { label: `${nm} (Account)`, value: `account:${a.id}`, sortKey: nm.toLowerCase() };
              });
            const merged = [...contactOpts, ...accountOpts]
              .sort((x, y) => x.sortKey.localeCompare(y.sortKey));
            cSel.innerHTML = `<option value="">— None —</option>` +
              merged.map(o => `<option value="${o.value}">${esc(o.label)}</option>`).join('');
            if (typeof makeSearchable === 'function') makeSearchable(cSel);
          }
        } catch (_) {}
      })();
    }

    // Load current SMTP settings (admin only)
    if (isFullAdmin) {
      try {
        const s = await Api.settings.get();
        if (s.smtp_host) document.getElementById('smtp-host').value = s.smtp_host;
        if (s.smtp_port) document.getElementById('smtp-port').value = s.smtp_port;
        if (s.smtp_user) document.getElementById('smtp-user').value = s.smtp_user;
        if (s.smtp_from) document.getElementById('smtp-from').value = s.smtp_from;
        // Broker fitness alert cadence
        const cadenceMap = {
          'alert-scan-hours':  s.alert_scan_interval_hours ?? 6,
          'alert-digest-day':  s.weekly_digest_day ?? 1,
          'alert-digest-hour': s.weekly_digest_hour ?? 7,
        };
        for (const [id, v] of Object.entries(cadenceMap)) {
          const el = document.getElementById(id);
          if (el) el.value = v;
        }
        // Load users + signatures + from-list for per-user From addresses UI
        try {
          const userData = await Api.admin.users();
          _usersCache = userData.data || userData || [];
        } catch (_) { _usersCache = []; }
        try {
          _signaturesCache = await Api.settings.signatures();
          if (!Array.isArray(_signaturesCache)) _signaturesCache = [];
        } catch (_) { _signaturesCache = []; }
        const fromList = Array.isArray(s.smtp_from_list) ? s.smtp_from_list : [];
        _renderFromList(fromList);
      } catch (_) {}
    }

    // Load templates list
    Admin._refreshTemplateList();
  }

  function _exportModule(format) {
    const fmt = format === 'xlsx' ? 'xlsx' : 'csv';
    const sel = document.getElementById('export-module-select');
    const resultEl = document.getElementById('export-module-result');
    const key = sel && sel.value;
    if (!key) {
      if (resultEl) resultEl.innerHTML = '<span style="color:var(--danger)">Please choose a module.</span>';
      return;
    }
    const label = sel.options[sel.selectedIndex].text;
    if (resultEl) {
      resultEl.innerHTML = `<span style="color:var(--text-muted)">Downloading ${esc(label)} (${fmt.toUpperCase()})…</span>`;
    }
    // Use a hidden iframe so the page doesn't navigate away — works for
    // both CSV and binary .xlsx and keeps the user on the Export pane.
    const url = fmt === 'xlsx'
      ? Api.admin.exportModuleXlsxUrl(key)
      : Api.admin.exportModuleUrl(key);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    setTimeout(() => { iframe.remove(); }, 60 * 1000);
    setTimeout(() => {
      if (resultEl) resultEl.innerHTML = `<span style="color:var(--success)">✓ ${fmt.toUpperCase()} download started</span>`;
    }, 500);
  }

  async function _sendNotification() {
    const subjectEl   = document.getElementById('notif-subject');
    const messageEl   = document.getElementById('notif-message');
    const severityEl  = document.getElementById('notif-severity');
    const recipientEl = document.getElementById('notif-recipient');
    const moduleEl    = document.getElementById('notif-module');
    const contactEl   = document.getElementById('notif-contact');
    const btn         = document.getElementById('notif-send-btn');
    const resultEl    = document.getElementById('notif-send-result');

    const subject = (subjectEl?.value  || '').trim();
    const message = (messageEl?.value  || '').trim();
    if (!subject || !message) {
      if (resultEl) resultEl.innerHTML = '<span style="color:var(--danger)">Subject and message are required.</span>';
      return;
    }

    const recVal = recipientEl?.value || 'all';
    const payload = {
      subject,
      message,
      severity:        severityEl?.value || 'info',
      target_user_ids: recVal === 'all' ? 'all' : [parseInt(recVal, 10)],
      contact_module:  moduleEl?.value  || null,
      // Carries the `contact:<id>` or `account:<id>` prefix so the server
      // links to the right detail page.
      contact_id:      contactEl?.value || null,
    };

    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    if (resultEl) resultEl.innerHTML = '';

    try {
      const res = await Api.notifications.adminBroadcast(payload);
      if (resultEl) {
        resultEl.innerHTML = `<span style="color:var(--success)">✓ Sent to ${res.inserted} user(s).</span>`;
      }
      // Clear the form for the next send
      if (subjectEl) subjectEl.value = '';
      if (messageEl) messageEl.value = '';
    } catch (err) {
      if (resultEl) {
        resultEl.innerHTML = `<span style="color:var(--danger)">Send failed: ${esc(err.message || 'Unknown error')}</span>`;
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Send Notification'; }
    }
  }

  async function _loadAlertCadence() {
    try {
      const settings = await Api.settings.get();
      const get = (k, fb) => {
        const v = settings && (settings[k] ?? settings.data?.[k]);
        return v === undefined || v === null || v === '' ? fb : v;
      };
      const h  = document.getElementById('alert-scan-hours');
      const dd = document.getElementById('alert-digest-day');
      const dh = document.getElementById('alert-digest-hour');
      if (h)  h.value  = get('alert_scan_interval_hours', 6);
      if (dd) dd.value = get('weekly_digest_day', 1);
      if (dh) dh.value = get('weekly_digest_hour', 7);
    } catch (_) {}
  }

  async function _saveAlertCadence() {
    const data = {
      alert_scan_interval_hours: parseFloat(document.getElementById('alert-scan-hours')?.value) || 6,
      weekly_digest_day:         parseInt(document.getElementById('alert-digest-day')?.value, 10),
      weekly_digest_hour:        parseInt(document.getElementById('alert-digest-hour')?.value, 10),
    };
    try {
      await Api.settings.save(data);
      document.getElementById('alert-cadence-result').innerHTML =
        '<span style="color:var(--success)">✓ Cadence saved (applies within 1 minute)</span>';
    } catch (e) {
      document.getElementById('alert-cadence-result').innerHTML =
        `<span style="color:var(--danger)">${esc(e.message)}</span>`;
    }
  }

  async function _runAlertScanNow() {
    const out = document.getElementById('alert-cadence-result');
    out.innerHTML = '<span style="color:var(--text-muted)">Running scan…</span>';
    try {
      const r = await Api.brokerProfiles.runAlerts();
      out.innerHTML = `<span style="color:var(--success)">✓ Scan complete — fired ${r.summary?.fired ?? 0}, suppressed ${r.summary?.suppressed ?? 0}, brokers ${r.summary?.evaluated ?? 0}</span>`;
    } catch (e) {
      out.innerHTML = `<span style="color:var(--danger)">${esc(e.message)}</span>`;
    }
  }

  async function _runDigestNow() {
    const out = document.getElementById('alert-cadence-result');
    out.innerHTML = '<span style="color:var(--text-muted)">Sending digest…</span>';
    try {
      const r = await Api.brokerProfiles.runDigest();
      out.innerHTML = `<span style="color:var(--success)">✓ Digest sent — ${r.brokers || 0} broker(s), ${r.alerts || 0} alert(s)</span>`;
    } catch (e) {
      out.innerHTML = `<span style="color:var(--danger)">${esc(e.message)}</span>`;
    }
  }

  async function _saveSmtp() {
    const data = {
      smtp_host: document.getElementById('smtp-host')?.value?.trim(),
      smtp_port: document.getElementById('smtp-port')?.value?.trim() || '587',
      smtp_user: document.getElementById('smtp-user')?.value?.trim(),
      smtp_pass: document.getElementById('smtp-pass')?.value,
      smtp_from: document.getElementById('smtp-from')?.value?.trim(),
    };
    try {
      await Api.settings.save(data);
      document.getElementById('smtp-result').innerHTML = '<span style="color:var(--success)">✓ SMTP settings saved</span>';
    } catch (e) {
      document.getElementById('smtp-result').innerHTML = `<span style="color:var(--danger)">${esc(e.message)}</span>`;
    }
  }

  async function _testSmtp() {
    const resultEl = document.getElementById('smtp-result');
    resultEl.textContent = 'Testing...';
    try {
      await Api.settings.testEmail();
      resultEl.innerHTML = '<span style="color:var(--success)">✓ SMTP connection successful!</span>';
    } catch (e) {
      resultEl.innerHTML = `<span style="color:var(--danger)">✗ ${esc(e.message)}</span>`;
    }
  }

  // ── From Address List (per-user) ───────────────────────────────

  let _usersCache = [];
  let _signaturesCache = [];

  function _renderFromList(entries) {
    const container = document.getElementById('from-list-rows');
    if (!container) return;
    const safe = Array.isArray(entries) ? entries : [];
    if (!safe.length) {
      container.innerHTML = '<p style="font-size:.85rem;color:var(--text-muted);margin:.25rem 0;">No From addresses configured yet. Click "+ Add From Address" below to map a user to a From address.</p>';
      return;
    }
    container.innerHTML = safe.map((f, i) => _fromRowHtml(f, i)).join('');
  }

  function _fromRowHtml(entry, i) {
    const userOpts = _usersCache.map(u =>
      `<option value="${esc(u.id)}"${String(u.id) === String(entry.user_id) ? ' selected' : ''}>${esc(u.full_name)} (${esc(u.email)})</option>`
    ).join('');
    const sigOpts = (_signaturesCache || []).map(f =>
      `<option value="${esc(f)}"${String(f) === String(entry.signature || '') ? ' selected' : ''}>${esc(f)}</option>`
    ).join('');
    return `
      <div class="from-row" data-idx="${i}" style="display:flex;gap:.5rem;margin-bottom:.5rem;align-items:center;flex-wrap:wrap;">
        <select class="form-control from-user" style="flex:2;min-width:180px;">
          <option value="">— Select User —</option>
          ${userOpts}
        </select>
        <input type="text" class="form-control from-name" placeholder="Display name (e.g. John Smith)"
          value="${esc(entry.name || '')}" style="flex:2;min-width:160px;" />
        <input type="email" class="form-control from-email" placeholder="name@domain.com"
          value="${esc(entry.email || '')}" style="flex:2;min-width:180px;" />
        <select class="form-control from-signature" style="flex:1.5;min-width:150px;" title="Signature image">
          <option value="">— No Signature —</option>
          ${sigOpts}
        </select>
        <button type="button" class="btn btn-sm btn-danger" onclick="Admin._removeFromRow(${i})">✕</button>
      </div>`;
  }

  function _collectFromList() {
    const rows = document.querySelectorAll('#from-list-rows .from-row');
    const list = [];
    rows.forEach(row => {
      const user_id   = row.querySelector('.from-user')?.value || '';
      const name      = row.querySelector('.from-name')?.value?.trim() || '';
      const email     = row.querySelector('.from-email')?.value?.trim() || '';
      const signature = row.querySelector('.from-signature')?.value || '';
      if (user_id && email) list.push({ user_id: parseInt(user_id, 10), name, email, signature });
    });
    return list;
  }

  function _addFromRow() {
    const current = _collectFromList();
    current.push({ user_id: '', name: '', email: '' });
    _renderFromList(current);
  }

  function _removeFromRow(idx) {
    const current = _collectFromList();
    // _collectFromList drops incomplete rows; rebuild from raw DOM to preserve in-progress edits
    const rows = document.querySelectorAll('#from-list-rows .from-row');
    const raw = [];
    rows.forEach(row => {
      raw.push({
        user_id:   row.querySelector('.from-user')?.value || '',
        name:      row.querySelector('.from-name')?.value || '',
        email:     row.querySelector('.from-email')?.value || '',
        signature: row.querySelector('.from-signature')?.value || '',
      });
    });
    raw.splice(idx, 1);
    _renderFromList(raw);
  }

  async function _saveFromList() {
    const list = _collectFromList();
    const resultEl = document.getElementById('from-list-result');
    try {
      await Api.settings.save({ smtp_from_list: list });
      if (resultEl) resultEl.innerHTML = '<span style="color:var(--success)">✓ From addresses saved</span>';
    } catch (e) {
      if (resultEl) resultEl.innerHTML = `<span style="color:var(--danger)">${esc(e.message)}</span>`;
    }
  }

  // ── Template management ────────────────────────────────────────

  let _templateCache = [];

  async function _refreshTemplateList() {
    try {
      _templateCache = await Api.settings.listTemplates();
    } catch (_) { _templateCache = []; }
    const sel = document.getElementById('template-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select Template —</option>' +
      _templateCache.map(t => `<option value="${esc(t.key)}">${esc(t.label)}</option>`).join('');
    document.getElementById('template-editor').style.display = 'none';
  }

  function _selectTemplate(key) {
    const tpl = _templateCache.find(t => t.key === key);
    const editor = document.getElementById('template-editor');
    if (!tpl || !key) { if (editor) editor.style.display = 'none'; return; }
    document.getElementById('template-subject').value = tpl.subject || '';
    document.getElementById('template-body').value = tpl.body || '';
    if (editor) editor.style.display = '';
    // Hide delete button for default templates
    const delBtn = document.getElementById('template-delete-btn');
    if (delBtn) delBtn.style.display = (key === 'policy_summary' || key === 'general') ? 'none' : '';
  }

  async function _addTemplate() {
    const name = prompt('Enter a name for the new template:');
    if (!name || !name.trim()) return;
    const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    // Check for duplicates
    if (_templateCache.some(t => t.key === key)) {
      showToast('A template with that name already exists.', 'warning');
      return;
    }
    try {
      await Api.settings.saveTemplate(key, { label: name.trim(), subject: '', body: '' });
      showToast('Template created', 'success');
      await _refreshTemplateList();
      // Auto-select the new template
      const sel = document.getElementById('template-select');
      if (sel) { sel.value = key; _selectTemplate(key); }
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function _saveTemplate() {
    const key = document.getElementById('template-select')?.value;
    const subject = document.getElementById('template-subject')?.value;
    const body = document.getElementById('template-body')?.value;
    if (!key) return;
    const tpl = _templateCache.find(t => t.key === key);
    try {
      await Api.settings.saveTemplate(key, { subject, body, label: tpl?.label || key });
      showToast('Template saved', 'success');
      // Update cache
      if (tpl) { tpl.subject = subject; tpl.body = body; }
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function _deleteTemplate() {
    const key = document.getElementById('template-select')?.value;
    if (!key) return;
    const tpl = _templateCache.find(t => t.key === key);
    if (!confirmDialog(`Delete template "${tpl?.label || key}"? This cannot be undone.`)) return;
    try {
      await Api.settings.deleteTemplate(key);
      showToast('Template deleted', 'success');
      await _refreshTemplateList();
    } catch (e) { showToast(e.message, 'error'); }
  }

  // ═════════════════════════════════════════════════════════════════════
  // SECURITY pane — bypass toggle + OTP issuance + active OTP list
  // ═════════════════════════════════════════════════════════════════════

  let _securityPaneInited = false;
  let _lastIssuedOtp      = null;

  async function _initSecurityPane() {
    if (_securityPaneInited) return;
    _securityPaneInited = true;

    // Populate the target-user dropdown
    try {
      const res = await Api.admin.users();
      const users = res.data || res || [];
      const sel = document.getElementById('sec-otp-user');
      if (sel) {
        sel.innerHTML = '<option value="">Any user</option>' +
          users.filter(u => u.active !== 0)
               .map(u => `<option value="${u.id}">${esc(u.full_name || u.username)}</option>`)
               .join('');
      }
    } catch (_) {}

    // Load current bypass state
    try {
      const s = await Api.settings.get();
      const tog = document.getElementById('sec-bypass-toggle');
      if (tog) tog.checked = !!s.bypass_edit_password;
    } catch (_) {}

    const tog = document.getElementById('sec-bypass-toggle');
    if (tog) {
      tog.addEventListener('change', async () => {
        const result = document.getElementById('sec-bypass-result');
        try {
          await Api.settings.save({ bypass_edit_password: !!tog.checked });
          if (typeof EditLock !== 'undefined' && EditLock.invalidateBypassCache) {
            EditLock.invalidateBypassCache();
          }
          if (result) {
            result.innerHTML = tog.checked
              ? '<span style="color:var(--warning,#b07b1c);">⚠ Edit-password gate is now disabled — every save is logged with the bypass flag.</span>'
              : '<span style="color:var(--success);">✓ Edit-password gate restored.</span>';
          }
        } catch (e) {
          if (result) result.innerHTML = `<span style="color:var(--danger);">${esc(e.message || 'Save failed')}</span>`;
          tog.checked = !tog.checked; // revert on failure
        }
      });
    }

    _refreshOtps();
  }

  async function _generateOtp() {
    const userId = document.getElementById('sec-otp-user')?.value || null;
    const ttl    = parseInt(document.getElementById('sec-otp-ttl')?.value, 10);
    const notes  = document.getElementById('sec-otp-notes')?.value?.trim() || null;
    const result = document.getElementById('sec-otp-result');
    const card   = document.getElementById('sec-otp-issued');
    if (!ttl || ttl < 1 || ttl > 1440) {
      if (result) result.innerHTML = '<span style="color:var(--danger);">Validity must be 1–1440 minutes.</span>';
      return;
    }
    if (result) result.innerHTML = '<span style="color:var(--text-muted);">Generating…</span>';
    try {
      const otp = await Api.admin.createOtp({
        target_user_id: userId ? parseInt(userId, 10) : null,
        valid_minutes:  ttl,
        notes,
      });
      _lastIssuedOtp = otp;
      const codeEl = document.getElementById('sec-otp-code');
      const metaEl = document.getElementById('sec-otp-meta');
      if (codeEl) codeEl.textContent = otp.code;
      if (metaEl) {
        const target = otp.target_user_name ? esc(otp.target_user_name) : 'any user';
        const exp = otp.expires_at ? new Date(otp.expires_at).toLocaleString('en-ZA') : '—';
        metaEl.textContent = `For ${target} · expires ${exp}`;
      }
      if (card) card.style.display = '';
      if (result) result.innerHTML = '<span style="color:var(--success);">✓ PIN issued and audit-logged</span>';
      // Clear the form so admin can issue another
      const notesEl = document.getElementById('sec-otp-notes');
      if (notesEl) notesEl.value = '';
      _refreshOtps();
    } catch (e) {
      if (result) result.innerHTML = `<span style="color:var(--danger);">${esc(e.message || 'Failed')}</span>`;
    }
  }

  function _copyOtp() {
    if (!_lastIssuedOtp) return;
    try {
      navigator.clipboard.writeText(_lastIssuedOtp.code);
      showToast('PIN copied to clipboard', 'success');
    } catch (_) {
      showToast('Copy failed — select the PIN manually', 'warning');
    }
  }

  async function _refreshOtps() {
    const list = document.getElementById('sec-otp-list');
    if (!list) return;
    try {
      const res = await Api.admin.listOtps();
      const rows = res.data || res || [];
      if (!rows.length) {
        list.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;">No PINs issued yet.</p>';
        return;
      }
      const statusBadgeFor = (s) => {
        if (s === 'active')   return '<span class="badge badge-success">Active</span>';
        if (s === 'used')     return '<span class="badge badge-secondary">Used</span>';
        if (s === 'expired')  return '<span class="badge badge-warning">Expired</span>';
        if (s === 'revoked')  return '<span class="badge badge-danger">Revoked</span>';
        return esc(s);
      };
      const fmt = (v) => v ? new Date(v).toLocaleString('en-ZA') : '—';
      list.innerHTML = `
        <table class="table" style="font-size:.82rem;">
          <thead><tr>
            <th>PIN</th><th>For user</th><th>Issued by</th>
            <th>Expires</th><th>Status</th><th>Used by</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td style="font-family:Menlo,Consolas,monospace;font-weight:600;">${esc(r.code)}</td>
                <td>${esc(r.target_user_name || r.target_user_username || 'Any user')}</td>
                <td>${esc(r.created_by_name || r.created_by_username || '—')}</td>
                <td>${fmt(r.expires_at)}</td>
                <td>${statusBadgeFor(r.status)}</td>
                <td>${esc(r.used_by_name || r.used_by_username || '—')}${r.used_at ? `<br><span style="color:#888;font-size:.75rem;">${fmt(r.used_at)}</span>` : ''}</td>
                <td>${r.status === 'active'
                  ? `<button class="btn btn-xs btn-danger" onclick="Admin._revokeOtp(${r.id})">Revoke</button>`
                  : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    } catch (e) {
      list.innerHTML = `<p style="color:var(--danger);font-size:.85rem;">Failed to load PINs: ${esc(e.message || '')}</p>`;
    }
  }

  async function _revokeOtp(id) {
    if (!confirmDialog('Revoke this PIN? Once revoked it can no longer be used.')) return;
    try {
      await Api.admin.revokeOtp(id);
      showToast('PIN revoked', 'success');
      _refreshOtps();
    } catch (e) {
      showToast('Revoke failed: ' + (e.message || ''), 'error');
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // COMPANY DETAILS — CIPC / VAT / addresses / contact persons / documents
  // ═════════════════════════════════════════════════════════════════════
  let _companyPaneInited = false;
  let _companyDocsCache  = [];

  async function _initCompanyPane() {
    if (_companyPaneInited) return;
    _companyPaneInited = true;
    const target = document.getElementById('company-pane-container');
    if (!target) return;
    let data = {};
    try { data = await Api.settings.companyGet(); } catch (_) { data = {}; }
    target.innerHTML = `
      <div class="detail-section card" style="max-width:920px;">
        <div class="detail-section-title">Company Details</div>
        <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 .85rem;">
          These details appear on letterheads, ROAs, schedules and other generated
          documents. Anything left blank is simply omitted from the output.
        </p>
        <form id="company-form">
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label class="form-label">Legal entity name</label>
              <input class="form-control" name="legal_name" value="${esc(data.legal_name || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Trading as</label>
              <input class="form-control" name="trading_name" value="${esc(data.trading_name || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">CIPC / Registration #</label>
              <input class="form-control" name="cipc_number" value="${esc(data.cipc_number || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">VAT number</label>
              <input class="form-control" name="vat_number" value="${esc(data.vat_number || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">FSP licence number</label>
              <input class="form-control" name="fsp_number" value="${esc(data.fsp_number || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Tax / Income tax #</label>
              <input class="form-control" name="tax_number" value="${esc(data.tax_number || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Phone</label>
              <input class="form-control" name="phone" value="${esc(data.phone || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input class="form-control" type="email" name="email" value="${esc(data.email || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Website</label>
              <input class="form-control" name="website" value="${esc(data.website || '')}">
            </div>
          </div>

          <div class="detail-section-title" style="margin-top:1rem;">Physical Address</div>
          <div class="form-grid form-grid-2">
            <div class="form-group form-grid-span-2">
              <label class="form-label">Street address</label>
              <input class="form-control" name="address_street" value="${esc(data.address_street || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Suburb</label>
              <input class="form-control" name="address_suburb" value="${esc(data.address_suburb || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">City</label>
              <input class="form-control" name="address_city" value="${esc(data.address_city || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Province</label>
              <input class="form-control" name="address_province" value="${esc(data.address_province || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Postal code</label>
              <input class="form-control" name="address_postal_code" value="${esc(data.address_postal_code || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Country</label>
              <input class="form-control" name="address_country" value="${esc(data.address_country || 'South Africa')}">
            </div>
          </div>

          <div class="detail-section-title" style="margin-top:1rem;">Postal Address (if different)</div>
          <div class="form-grid form-grid-2">
            <div class="form-group form-grid-span-2">
              <label class="form-label">Postal line 1</label>
              <input class="form-control" name="postal_line1" value="${esc(data.postal_line1 || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Postal line 2</label>
              <input class="form-control" name="postal_line2" value="${esc(data.postal_line2 || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Postal code</label>
              <input class="form-control" name="postal_code" value="${esc(data.postal_code || '')}">
            </div>
          </div>

          <div class="detail-section-title" style="margin-top:1rem;display:flex;align-items:center;gap:.5rem;">
            Contact Persons
            <button type="button" class="btn btn-secondary btn-sm" style="margin-left:auto;font-size:.75rem;" onclick="Admin._addCompanyContact()">+ Add</button>
          </div>
          <div id="company-contacts"></div>

          <div style="display:flex;gap:.5rem;margin-top:1rem;align-items:center;">
            <button type="submit" class="btn btn-primary">Save Company Details</button>
            <span id="company-save-result" style="font-size:.85rem;"></span>
          </div>
        </form>
      </div>

      <div class="detail-section card" style="max-width:920px;margin-top:1.25rem;">
        <div class="detail-section-title" style="display:flex;align-items:center;gap:.5rem;">
          Company Documents
          <span style="font-size:.78rem;color:var(--text-muted);font-weight:400;">(uploads/company/)</span>
        </div>
        <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 .85rem;">
          Upload registration certificates, FSP authorisation letters, BBBEE certificates,
          insurer agreements, letterhead PDFs etc. — kept separate from client documents.
        </p>
        <div style="display:flex;gap:.5rem;margin-bottom:.75rem;flex-wrap:wrap;align-items:center;">
          <input id="company-doc-file" type="file" class="form-control" style="flex:1;min-width:200px;">
          <button class="btn btn-primary" onclick="Admin._uploadCompanyDoc()">Upload</button>
        </div>
        <div id="company-doc-list"></div>
      </div>
    `;

    // Render contact-person rows
    _renderCompanyContacts(Array.isArray(data.contacts) ? data.contacts : []);

    // Wire submit
    document.getElementById('company-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {};
      for (const [k, v] of fd.entries()) {
        if (k === 'contact_name' || k === 'contact_role' || k === 'contact_email' || k === 'contact_phone') continue;
        payload[k] = (v || '').trim() || null;
      }
      payload.contacts = _collectCompanyContacts();
      const result = document.getElementById('company-save-result');
      try {
        await Api.settings.companySave(payload);
        if (result) result.innerHTML = '<span style="color:var(--success);">✓ Saved</span>';
      } catch (err) {
        if (result) result.innerHTML = `<span style="color:var(--danger);">${esc(err.message || 'Save failed')}</span>`;
      }
    });

    _refreshCompanyDocs();
  }

  function _renderCompanyContacts(rows) {
    const host = document.getElementById('company-contacts');
    if (!host) return;
    if (!rows.length) {
      host.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;margin:.25rem 0;">No contact persons added.</p>';
      return;
    }
    host.innerHTML = rows.map((c, i) => _companyContactRowHtml(c, i)).join('');
  }

  function _companyContactRowHtml(c, i) {
    return `
      <div class="company-contact-row" data-idx="${i}"
           style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem;align-items:center;">
        <input type="text" class="form-control cc-name"  placeholder="Name"
               value="${esc(c.name || '')}"  style="flex:2;min-width:140px;">
        <input type="text" class="form-control cc-role"  placeholder="Role / Title"
               value="${esc(c.role || '')}"  style="flex:2;min-width:120px;">
        <input type="email" class="form-control cc-email" placeholder="Email"
               value="${esc(c.email || '')}" style="flex:2;min-width:160px;">
        <input type="text" class="form-control cc-phone" placeholder="Phone"
               value="${esc(c.phone || '')}" style="flex:1.5;min-width:120px;">
        <button type="button" class="btn btn-sm btn-danger" onclick="Admin._removeCompanyContact(${i})">✕</button>
      </div>`;
  }

  function _collectCompanyContacts() {
    const rows = document.querySelectorAll('#company-contacts .company-contact-row');
    const out = [];
    rows.forEach(row => {
      const c = {
        name:  row.querySelector('.cc-name')?.value?.trim()  || '',
        role:  row.querySelector('.cc-role')?.value?.trim()  || '',
        email: row.querySelector('.cc-email')?.value?.trim() || '',
        phone: row.querySelector('.cc-phone')?.value?.trim() || '',
      };
      if (c.name || c.role || c.email || c.phone) out.push(c);
    });
    return out;
  }

  function _addCompanyContact() {
    const current = _collectCompanyContacts();
    current.push({});
    _renderCompanyContacts(current);
  }

  function _removeCompanyContact(idx) {
    const rows = document.querySelectorAll('#company-contacts .company-contact-row');
    const raw = [];
    rows.forEach(row => {
      raw.push({
        name:  row.querySelector('.cc-name')?.value  || '',
        role:  row.querySelector('.cc-role')?.value  || '',
        email: row.querySelector('.cc-email')?.value || '',
        phone: row.querySelector('.cc-phone')?.value || '',
      });
    });
    raw.splice(idx, 1);
    _renderCompanyContacts(raw);
  }

  async function _refreshCompanyDocs() {
    const list = document.getElementById('company-doc-list');
    if (!list) return;
    try {
      _companyDocsCache = await Api.settings.companyDocs();
    } catch (_) { _companyDocsCache = []; }
    if (!_companyDocsCache.length) {
      list.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;">No documents uploaded yet.</p>';
      return;
    }
    const fmtSize = (b) => {
      if (b == null) return '—';
      if (b < 1024) return b + ' B';
      if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
      return (b / 1024 / 1024).toFixed(1) + ' MB';
    };
    const fmtDate = (s) => s ? new Date(s).toLocaleString('en-ZA') : '—';
    list.innerHTML = `
      <table class="table" style="font-size:.85rem;">
        <thead><tr><th>Filename</th><th>Size</th><th>Uploaded</th><th>Actions</th></tr></thead>
        <tbody>
          ${_companyDocsCache.map(f => `
            <tr>
              <td><a href="${esc(f.view_url || (f.url + '/view'))}" target="_blank" rel="noopener">${esc(f.filename)}</a></td>
              <td>${esc(fmtSize(f.size))}</td>
              <td>${esc(fmtDate(f.uploaded_at))}</td>
              <td>
                <a href="${esc(f.view_url || (f.url + '/view'))}" class="btn btn-xs btn-secondary" target="_blank" rel="noopener">View</a>
                <button class="btn btn-xs btn-danger" onclick="Admin._deleteCompanyDoc('${esc(f.filename)}')">Delete</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  async function _uploadCompanyDoc() {
    const input = document.getElementById('company-doc-file');
    if (!input || !input.files || !input.files[0]) {
      showToast('Select a file first', 'warning');
      return;
    }
    const fd = new FormData();
    fd.append('file', input.files[0]);
    try {
      await Api.settings.companyDocUpload(fd);
      showToast('File uploaded', 'success');
      input.value = '';
      _refreshCompanyDocs();
    } catch (e) {
      showToast('Upload failed: ' + (e.message || ''), 'error');
    }
  }

  async function _deleteCompanyDoc(name) {
    if (!confirmDialog(`Delete company document "${name}"? This cannot be undone.`)) return;
    try {
      await Api.settings.companyDocDelete(name);
      showToast('File deleted', 'success');
      _refreshCompanyDocs();
    } catch (e) {
      showToast('Delete failed: ' + (e.message || ''), 'error');
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // 2FA — admin manages two-factor authentication per user
  // ═════════════════════════════════════════════════════════════════════

  function _renderQr(text, container) {
    if (!container) return;
    if (typeof qrcode !== 'function') {
      container.innerHTML = `<div style="color:var(--danger);font-size:.8rem;">QR library failed to load — share the secret string manually.</div>`;
      return;
    }
    // Auto type/level — error correction M, content fits comfortably
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    // Render as SVG (crisp, no canvas needed)
    container.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
    const svg = container.querySelector('svg');
    if (svg) {
      svg.style.width  = '220px';
      svg.style.height = '220px';
      svg.style.background = '#fff';
      svg.style.padding    = '8px';
      svg.style.border     = '1px solid #e5e7eb';
      svg.style.borderRadius = '6px';
    }
  }

  async function _open2faModal(userId) {
    document.getElementById('twofa-modal-overlay')?.remove();
    let status, userLabel = `User #${userId}`;
    try {
      status = await Api.admin.twoFaStatus(userId);
      userLabel = status.user_label || userLabel;
    } catch (e) {
      showToast('Failed to load 2FA status: ' + (e.message || ''), 'error');
      return;
    }
    const overlay = document.createElement('div');
    overlay.id = 'twofa-modal-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;' +
      'display:flex;align-items:center;justify-content:center;';
    const enrolled = !!status.enrolled;
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:10px;width:560px;max-width:94vw;max-height:90vh;overflow:auto;
                  box-shadow:0 18px 48px rgba(0,0,0,.3);">
        <div style="padding:1rem 1.25rem;border-bottom:1px solid #eee;display:flex;align-items:center;gap:.75rem;">
          <strong style="font-size:1rem;">2FA — ${esc(userLabel)}</strong>
          <span style="margin-left:auto;">
            ${enrolled ? '<span class="badge badge-success">Enabled</span>' : '<span class="badge badge-secondary">Disabled</span>'}
          </span>
          <button id="twofa-close" style="background:transparent;border:none;font-size:1.4rem;cursor:pointer;color:#666;">×</button>
        </div>
        <div id="twofa-body" style="padding:1.1rem 1.25rem;"></div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#twofa-close').addEventListener('click', close);
    // Click-outside-to-close intentionally disabled — only the × closes.

    _render2faBody(userId, status);
  }

  function _render2faBody(userId, status) {
    const body = document.getElementById('twofa-body');
    if (!body) return;
    if (status.enrolled) {
      body.innerHTML = `
        <p style="font-size:.85rem;color:#555;line-height:1.4;">
          2FA is <strong>enabled</strong> for this user. They will be prompted for
          a 6-digit code from their authenticator app every time they sign in.
        </p>
        ${status.last_used_at ? `<p style="font-size:.78rem;color:#666;">Last used: ${esc(new Date(status.last_used_at).toLocaleString('en-ZA'))}</p>` : ''}
        <div style="display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.85rem;">
          <button class="btn btn-secondary" onclick="Admin._viewRecoveryCodes(${userId})">View recovery codes</button>
          <button class="btn btn-secondary" onclick="Admin._regen2faCodes(${userId})">Regenerate codes</button>
          <button class="btn btn-danger" style="margin-left:auto;" onclick="Admin._disable2fa(${userId})">Disable 2FA</button>
        </div>
        <div id="twofa-recovery-list" style="margin-top:.85rem;"></div>
      `;
    } else {
      body.innerHTML = `
        <p style="font-size:.85rem;color:#555;line-height:1.4;">
          Enabling 2FA will require this user to enter a 6-digit code from an
          authenticator app (Google Authenticator, Authy, 1Password, Microsoft
          Authenticator, etc.) on every sign-in.
        </p>
        <div style="display:flex;justify-content:flex-end;">
          <button class="btn btn-primary" onclick="Admin._enable2fa(${userId})">Start enrollment</button>
        </div>
      `;
    }
  }

  async function _enable2fa(userId) {
    const body = document.getElementById('twofa-body');
    if (!body) return;
    body.innerHTML = '<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>';
    try {
      const r = await Api.admin.twoFaEnroll(userId);
      body.innerHTML = `
        <p style="font-size:.85rem;color:#555;line-height:1.4;">
          Scan this QR code with the authenticator app, <em>or</em> enter the
          secret manually. Once a 6-digit code appears, type it below to
          confirm — that activates 2FA and reveals the recovery codes.
        </p>
        <div style="display:flex;gap:1.2rem;align-items:flex-start;flex-wrap:wrap;margin:.85rem 0;">
          <div id="twofa-qr"></div>
          <div style="flex:1;min-width:200px;">
            <div style="font-size:.78rem;color:#666;margin-bottom:.25rem;">Manual secret</div>
            <code style="display:block;background:#f4f6f8;padding:.55rem .65rem;border-radius:6px;
                         font-size:.85rem;word-break:break-all;letter-spacing:.05em;">${esc(r.secret)}</code>
            <div style="font-size:.72rem;color:#888;margin-top:.4rem;">Account: ${esc(r.account)} · Issuer: ${esc(r.issuer)}</div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Enter the 6-digit code shown in the app</label>
          <input id="twofa-verify-input" class="form-control" inputmode="numeric"
                 pattern="\\d{6}" maxlength="6" placeholder="123456" autocomplete="off"
                 style="font-family:Menlo,Consolas,monospace;font-size:1.1rem;letter-spacing:.4rem;text-align:center;width:160px;">
        </div>
        <div id="twofa-verify-err" style="display:none;color:var(--danger);font-size:.82rem;margin:.4rem 0;"></div>
        <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:.5rem;">
          <button class="btn btn-secondary" onclick="Admin._open2faModal(${userId})">Back</button>
          <button class="btn btn-primary" onclick="Admin._verify2faEnroll(${userId})">Confirm &amp; activate</button>
        </div>
      `;
      _renderQr(r.otpauth_uri, document.getElementById('twofa-qr'));
      const input = document.getElementById('twofa-verify-input');
      if (input) {
        input.focus();
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') Admin._verify2faEnroll(userId);
        });
      }
    } catch (e) {
      body.innerHTML = `<div class="alert alert-danger">${esc(e.message || 'Failed to start enrollment')}</div>`;
    }
  }

  async function _verify2faEnroll(userId) {
    const input = document.getElementById('twofa-verify-input');
    const errEl = document.getElementById('twofa-verify-err');
    const code = (input?.value || '').trim();
    if (!/^\d{6}$/.test(code)) {
      if (errEl) { errEl.textContent = 'Enter the 6-digit code from the app.'; errEl.style.display = 'block'; }
      return;
    }
    try {
      const r = await Api.admin.twoFaVerify(userId, code);
      const codes = r.recovery_codes || [];
      const body = document.getElementById('twofa-body');
      if (body) {
        body.innerHTML = `
          <div class="alert alert-success" style="margin-bottom:.85rem;">
            ✓ 2FA enabled. Save these recovery codes somewhere safe — each can be used once
            in place of a 2FA code if the user loses their phone.
          </div>
          <div style="background:#f4f6f8;padding:.75rem;border-radius:6px;font-family:Menlo,Consolas,monospace;font-size:.95rem;">
            ${codes.map(c => esc(c)).join('<br>')}
          </div>
          <div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:.85rem;">
            <button class="btn btn-secondary" onclick="Admin._copy2faCodes(${JSON.stringify(codes).replace(/"/g, '&quot;')})">Copy</button>
            <button class="btn btn-primary" onclick="Admin._open2faModal(${userId})">Done</button>
          </div>`;
      }
      // Refresh the user list 2FA badge
      _usersPaneInited = false;
      _initUsersPane();
    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'Verification failed.'; errEl.style.display = 'block'; }
    }
  }

  function _copy2faCodes(codes) {
    try {
      navigator.clipboard.writeText((codes || []).join('\n'));
      showToast('Recovery codes copied', 'success');
    } catch (_) {
      showToast('Copy failed — select the codes manually', 'warning');
    }
  }

  async function _disable2fa(userId) {
    if (!confirmDialog('Disable 2FA for this user? They will no longer be prompted for a 2FA code at sign-in.')) return;
    try {
      await Api.admin.twoFaDisable(userId);
      showToast('2FA disabled', 'success');
      _open2faModal(userId);
      _usersPaneInited = false;
      _initUsersPane();
    } catch (e) {
      showToast('Disable failed: ' + (e.message || ''), 'error');
    }
  }

  async function _viewRecoveryCodes(userId) {
    try {
      const r = await Api.admin.twoFaRecoveryCodes(userId);
      const codes = r.recovery_codes || [];
      const list = document.getElementById('twofa-recovery-list');
      if (!list) return;
      if (!codes.length) {
        list.innerHTML = '<div class="alert alert-warning" style="font-size:.82rem;">All recovery codes have been used. Click <em>Regenerate codes</em> to issue a new set.</div>';
        return;
      }
      list.innerHTML = `
        <div style="font-size:.82rem;color:#555;margin-bottom:.4rem;">${codes.length} recovery code${codes.length === 1 ? '' : 's'} remaining:</div>
        <div style="background:#f4f6f8;padding:.75rem;border-radius:6px;font-family:Menlo,Consolas,monospace;font-size:.92rem;">
          ${codes.map(c => esc(c)).join('<br>')}
        </div>
        <div style="margin-top:.4rem;text-align:right;">
          <button class="btn btn-secondary btn-sm" onclick="Admin._copy2faCodes(${JSON.stringify(codes).replace(/"/g, '&quot;')})">Copy</button>
        </div>`;
    } catch (e) {
      showToast('Failed to load recovery codes: ' + (e.message || ''), 'error');
    }
  }

  async function _regen2faCodes(userId) {
    if (!confirmDialog('Replace existing recovery codes? Old codes will stop working immediately.')) return;
    try {
      const r = await Api.admin.twoFaRegenCodes(userId);
      const codes = r.recovery_codes || [];
      const list = document.getElementById('twofa-recovery-list');
      if (list) {
        list.innerHTML = `
          <div class="alert alert-success" style="font-size:.82rem;">New recovery codes issued — share them with the user securely.</div>
          <div style="background:#f4f6f8;padding:.75rem;border-radius:6px;font-family:Menlo,Consolas,monospace;font-size:.92rem;">
            ${codes.map(c => esc(c)).join('<br>')}
          </div>
          <div style="margin-top:.4rem;text-align:right;">
            <button class="btn btn-secondary btn-sm" onclick="Admin._copy2faCodes(${JSON.stringify(codes).replace(/"/g, '&quot;')})">Copy</button>
          </div>`;
      }
    } catch (e) {
      showToast('Regenerate failed: ' + (e.message || ''), 'error');
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // DASHBOARD DEFAULT — admin-managed company-wide dashboard layout
  // ═════════════════════════════════════════════════════════════════════

  let _dashCatalog        = null;
  let _dashWorking        = null;   // { chips: [...], charts: [...], tables: [...] }
  let _dashDefaultInited  = false;

  // Renders the Dashboard Default editor into a target element. The
  // settings sidebar passes its own container; the legacy entry point
  // (kept for compatibility) renders into the standalone admin-content.
  async function dashboardDefault(opts = {}) {
    const target = opts.target ||
      document.getElementById('dashboard-default-container') ||
      document.getElementById('admin-content') ||
      document.getElementById('content-area');
    if (!target) return;
    target.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    try {
      const [cat, def] = await Promise.all([
        Api.dashboard.catalog(),
        Api.dashboard.getDefault(),
      ]);
      _dashCatalog = cat;
      _dashWorking = JSON.parse(JSON.stringify(def.config || { chips: [], charts: [], tables: [] }));

      target.innerHTML = `
        <div class="detail-section card" style="max-width:1000px;">
          <div class="detail-section-title">Company Default Dashboard Layout</div>
          <p style="font-size:.85rem;color:var(--text-muted);margin:.25rem 0 1rem;">
            This is the layout new users see on first login, and the fallback when a user
            resets their dashboard. Users can still customize their own view via the
            <em>Edit Dashboard</em> button on the dashboard page.
          </p>
          <div class="dash-edit">
            <div class="dash-edit-tabs">
              <button type="button" class="tab-btn active" data-admindash="chips">Chips (KPIs)</button>
              <button type="button" class="tab-btn" data-admindash="charts">Charts</button>
              <button type="button" class="tab-btn" data-admindash="tables">Tables</button>
            </div>
            <div id="admin-dash-panel"></div>
          </div>
          <div style="display:flex;gap:.5rem;margin-top:1rem;">
            <button class="btn btn-primary" onclick="Admin._saveDashDefault()">Save Company Default</button>
            <span id="admin-dash-result" style="align-self:center;font-size:.82rem;color:var(--text-muted);"></span>
          </div>
        </div>
      `;

      target.querySelectorAll('[data-admindash]').forEach(btn => {
        btn.addEventListener('click', () => {
          target.querySelectorAll('[data-admindash]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          _renderAdminDashTab(btn.dataset.admindash);
        });
      });
      _renderAdminDashTab('chips');
    } catch (err) {
      target.innerHTML = `<div class="alert alert-danger">${esc(err.message || String(err))}</div>`;
    }
  }

  function _initDashboardDefaultPane() {
    if (_dashDefaultInited) return;
    const target = document.getElementById('dashboard-default-container');
    if (!target) return;
    _dashDefaultInited = true;
    dashboardDefault({ target });
  }

  function _renderAdminDashTab(section) {
    const panel = document.getElementById('admin-dash-panel');
    if (!panel || !_dashCatalog) return;
    const categoryFor = section === 'chips' ? 'metric' : (section === 'charts' ? 'chart' : 'table');
    const catalogById = Object.fromEntries((_dashCatalog.widgets || []).map(w => [w.id, w]));
    const available = (_dashCatalog.widgets || []).filter(w => w.category === categoryFor);
    const selected  = _dashWorking[section] || [];
    const selectedIds = new Set(selected.map(s => s.widgetId));

    const groups = {};
    for (const w of available) (groups[w.group] = groups[w.group] || []).push(w);

    const selectedRow = (entry, idx) => {
      const w = catalogById[entry.widgetId];
      if (!w) return '';
      const modes = w.displayModes || [];
      const modeSel = modes.length > 1 ? `
        <select class="form-control form-control-sm" data-dashmode="${w.id}" style="width:auto;">
          ${modes.map(m => `<option value="${m}" ${entry.mode === m ? 'selected' : ''}>${m}</option>`).join('')}
        </select>` : `<span class="muted" style="font-size:.75rem;">${modes[0] || ''}</span>`;
      return `
        <div class="dash-edit-row" draggable="true" data-id="${w.id}">
          <span class="dash-edit-handle">⋮⋮</span>
          <span class="dash-edit-row-label">
            <strong>${esc(w.label)}</strong>
            <span class="muted" style="font-size:.72rem;">${esc(w.group)}</span>
          </span>
          ${modeSel}
          <button class="btn btn-sm btn-secondary" type="button" data-dashmove="up"   data-widget="${w.id}" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-sm btn-secondary" type="button" data-dashmove="down" data-widget="${w.id}">↓</button>
          <button class="btn btn-sm btn-danger"    type="button" data-dashremove="${w.id}">✕</button>
        </div>`;
    };

    panel.innerHTML = `
      <div class="dash-edit-grid">
        <div class="dash-edit-col">
          <div class="dash-edit-col-title">Default layout <span class="muted">(drag to reorder)</span></div>
          <div id="admin-dash-selected">
            ${selected.length ? selected.map(selectedRow).join('') : `<div class="dash-edit-empty">Empty.</div>`}
          </div>
        </div>
        <div class="dash-edit-col">
          <div class="dash-edit-col-title">Available widgets</div>
          <input type="text" class="form-control" id="admin-dash-search" placeholder="Filter…" style="margin-bottom:.6rem;">
          <div>
            ${Object.keys(groups).sort().map(g => `
              <div class="dash-edit-group">
                <div class="dash-edit-group-title">${esc(g)}</div>
                ${groups[g].map(w => `
                  <label class="dash-edit-item ${selectedIds.has(w.id) ? 'is-selected' : ''}">
                    <input type="checkbox" ${selectedIds.has(w.id) ? 'checked' : ''} data-dashadd="${w.id}">
                    <span class="dash-edit-item-body">
                      <span class="dash-edit-item-label">${esc(w.label)}</span>
                      <span class="dash-edit-item-desc">${esc(w.description || '')}</span>
                    </span>
                  </label>
                `).join('')}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    panel.querySelectorAll('input[data-dashadd]').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.dashadd;
        const w = catalogById[id];
        if (!w) return;
        const arr = _dashWorking[section];
        const idx = arr.findIndex(x => x.widgetId === id);
        if (cb.checked && idx === -1) arr.push({ widgetId: id, mode: w.defaultMode });
        else if (!cb.checked && idx !== -1) arr.splice(idx, 1);
        _renderAdminDashTab(section);
      });
    });
    panel.querySelectorAll('select[data-dashmode]').forEach(sel => {
      sel.addEventListener('change', () => {
        const entry = _dashWorking[section].find(x => x.widgetId === sel.dataset.dashmode);
        if (entry) entry.mode = sel.value;
      });
    });
    panel.querySelectorAll('button[data-dashremove]').forEach(btn => {
      btn.addEventListener('click', () => {
        _dashWorking[section] = _dashWorking[section].filter(x => x.widgetId !== btn.dataset.dashremove);
        _renderAdminDashTab(section);
      });
    });
    panel.querySelectorAll('button[data-dashmove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.widget;
        const dir = btn.dataset.dashmove === 'up' ? -1 : 1;
        const arr = _dashWorking[section];
        const from = arr.findIndex(x => x.widgetId === id);
        const to = from + dir;
        if (from < 0 || to < 0 || to >= arr.length) return;
        const tmp = arr[from]; arr[from] = arr[to]; arr[to] = tmp;
        _renderAdminDashTab(section);
      });
    });

    // Drag-and-drop
    const container = document.getElementById('admin-dash-selected');
    if (container) {
      let dragId = null;
      container.querySelectorAll('.dash-edit-row').forEach(row => {
        row.addEventListener('dragstart', e => { dragId = row.dataset.id; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
        row.addEventListener('dragend',   ()  => { row.classList.remove('dragging'); dragId = null; });
        row.addEventListener('dragover',  e  => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
        row.addEventListener('drop',      e  => {
          e.preventDefault();
          const over = row.dataset.id;
          if (!dragId || dragId === over) return;
          const arr = _dashWorking[section];
          const from = arr.findIndex(x => x.widgetId === dragId);
          const to   = arr.findIndex(x => x.widgetId === over);
          if (from < 0 || to < 0) return;
          const [moved] = arr.splice(from, 1);
          arr.splice(to, 0, moved);
          _renderAdminDashTab(section);
        });
      });
    }

    // Filter
    const search = document.getElementById('admin-dash-search');
    if (search) {
      search.addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        panel.querySelectorAll('.dash-edit-item').forEach(it => {
          it.style.display = (it.textContent || '').toLowerCase().includes(q) ? '' : 'none';
        });
        panel.querySelectorAll('.dash-edit-group').forEach(g => {
          const any = Array.from(g.querySelectorAll('.dash-edit-item')).some(it => it.style.display !== 'none');
          g.style.display = any ? '' : 'none';
        });
      });
    }
  }

  // ── System Update pane ────────────────────────────────────────────────
  let _sysUpdateLastStatus = null;

  async function _initSystemUpdatePane() {
    await _systemRefresh();
    await _systemRefreshSnapshots();
  }

  function _systemRenderStatus(s) {
    _sysUpdateLastStatus = s;
    const el = document.getElementById('sys-update-status');
    const apply = document.getElementById('sys-update-apply');
    if (!el) return;
    _systemRenderChangelog(s);
    if (s.error) {
      el.innerHTML = `<span style="color:var(--danger);">${esc(s.error)}</span>`;
      if (apply) apply.disabled = true;
      return;
    }
    const cur = s.current_tag || (s.current_commit ? s.current_commit.slice(0,7) : 'unknown');
    const lat = s.latest_tag || '—';
    const dirty = s.working_tree_dirty
      ? `<span style="color:var(--danger);">⚠ uncommitted local changes</span>` : '';
    const pend = s.pending_migrations?.length
      ? ` · ${s.pending_migrations.length} pending DB migration${s.pending_migrations.length === 1 ? '' : 's'}`
      : '';
    const updateBadge = s.update_available
      ? `<span style="background:var(--warning, #f39c12);color:#fff;padding:2px 8px;border-radius:10px;font-size:.72rem;font-weight:600;margin-left:.5rem;">Update available</span>`
      : `<span style="background:var(--success, #27ae60);color:#fff;padding:2px 8px;border-radius:10px;font-size:.72rem;font-weight:600;margin-left:.5rem;">Up to date</span>`;
    const lockNote = s.locked
      ? `<div style="color:var(--danger);margin-top:.4rem;">Update in progress (started ${esc(s.lock_info?.started_at || '')}).</div>`
      : '';
    el.innerHTML = `
      <div><strong>Running:</strong> ${esc(cur)}${updateBadge}</div>
      <div><strong>Latest release:</strong> ${esc(lat)}${pend}</div>
      ${dirty ? `<div style="margin-top:.4rem;">${dirty}</div>` : ''}
      ${lockNote}
    `;
    if (apply) {
      apply.disabled = !s.update_available || s.locked || s.working_tree_dirty;
    }
    const rb = document.getElementById('sys-update-rollback');
    if (rb) rb.disabled = !(s.snapshots && s.snapshots.length) || s.locked;
  }

  function _systemRenderChangelog(s) {
    const wrap = document.getElementById('sys-update-changelog');
    if (!wrap) return;
    const cl = s && s.changelog;
    if (!cl || (!cl.to_tag_message && (!cl.commits || !cl.commits.length))) {
      wrap.innerHTML = '';
      return;
    }
    const isUpdate = !!s.update_available;
    const headerLabel = isUpdate
      ? `What's in ${esc(cl.to_tag)}`
      : `Release notes — ${esc(cl.to_tag)}`;
    const dateBit = cl.to_tag_date ? ` <span style="color:var(--text-muted);font-weight:400;">· ${esc(cl.to_tag_date)}</span>` : '';
    const messageBlock = cl.to_tag_message
      ? `<pre style="white-space:pre-wrap;word-wrap:break-word;margin:.4rem 0 .6rem;padding:.6rem .8rem;background:var(--surface-secondary,#f8f9fa);border:1px solid var(--border,#dee2e6);border-radius:6px;font-family:inherit;font-size:.82rem;line-height:1.45;">${esc(cl.to_tag_message)}</pre>`
      : '';
    const commitsBlock = (cl.commits && cl.commits.length)
      ? `<details style="margin-top:.4rem;">
           <summary style="cursor:pointer;font-size:.82rem;color:var(--text-muted);">
             ${cl.commits.length}${cl.truncated ? '+' : ''} commit${cl.commits.length === 1 ? '' : 's'}${isUpdate && cl.from_ref ? ` since ${esc(cl.from_ref.slice ? cl.from_ref.slice(0,7) : cl.from_ref)}` : ''}
           </summary>
           <ul style="margin:.4rem 0 0 .25rem;padding-left:1.1rem;font-size:.8rem;line-height:1.45;">
             ${cl.commits.map(c => `
               <li>
                 <code style="color:var(--text-muted);">${esc((c.sha||'').slice(0,7))}</code>
                 <span style="color:var(--text-muted);margin:0 .3rem;">${esc(c.date || '')}</span>
                 ${esc(c.subject || '')}
               </li>`).join('')}
           </ul>
           ${cl.truncated ? `<p style="color:var(--text-muted);font-size:.78rem;margin:.3rem 0 0;">List capped — older commits not shown.</p>` : ''}
         </details>`
      : '';
    const errBlock = cl.error
      ? `<div style="color:var(--danger);font-size:.78rem;margin-top:.3rem;">Changelog unavailable: ${esc(cl.error)}</div>`
      : '';
    wrap.innerHTML = `
      <div style="border-left:3px solid ${isUpdate ? 'var(--warning, #f39c12)' : 'var(--border, #dee2e6)'};padding:.4rem 0 .4rem .85rem;">
        <div style="font-weight:600;font-size:.88rem;">${headerLabel}${dateBit}</div>
        ${messageBlock}
        ${commitsBlock}
        ${errBlock}
      </div>
    `;
  }

  async function _systemRefresh() {
    try {
      const s = await Api.admin.systemStatus();
      _systemRenderStatus(s);
    } catch (e) {
      const el = document.getElementById('sys-update-status');
      if (el) el.innerHTML = `<span style="color:var(--danger);">Failed to load: ${esc(e.message)}</span>`;
    }
  }

  async function _systemRefreshSnapshots() {
    const el = document.getElementById('sys-update-snapshots');
    if (!el) return;
    try {
      const r = await Api.admin.systemSnapshots();
      const snaps = r.data || [];
      if (!snaps.length) {
        el.innerHTML = '<em style="color:var(--text-muted);">No snapshots yet — first update will create one.</em>';
        return;
      }
      el.innerHTML = `
        <table class="data-table" style="width:100%;font-size:.8rem;">
          <thead><tr><th>Snapshot ID</th><th>Created</th><th>From → To</th><th>Size</th><th></th></tr></thead>
          <tbody>
            ${snaps.map((s, i) => `
              <tr>
                <td><code>${esc(s.id)}</code>${i === 0 ? ' <span style="font-size:.7rem;color:var(--text-muted);">(latest)</span>' : ''}${s.reason === 'pre-restore' ? ' <span style="font-size:.7rem;color:var(--text-muted);">(pre-restore)</span>' : ''}</td>
                <td>${esc(s.created_at || '—')}</td>
                <td>${esc((s.from_commit || '').slice(0,7) || '—')} → ${esc(s.to_tag || '—')}</td>
                <td>${s.db_size_bytes ? (Math.round(s.db_size_bytes / 1024 / 1024 * 10) / 10) + ' MB' : '—'}</td>
                <td style="text-align:right;">
                  <button class="btn btn-secondary btn-sm js-snap-restore"
                    data-snap-id="${esc(s.id)}"
                    style="font-size:.72rem;padding:.2rem .55rem;">Restore</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      el.querySelectorAll('.js-snap-restore').forEach(btn => {
        btn.addEventListener('click', () => {
          Admin._systemRollback(btn.dataset.snapId);
        });
      });
    } catch (e) {
      el.innerHTML = `<span style="color:var(--danger);">Failed: ${esc(e.message)}</span>`;
    }
  }

  async function _systemCheckUpdates() {
    const result = document.getElementById('sys-update-result');
    if (result) result.textContent = 'Checking GitHub for new releases…';
    try {
      const s = await Api.admin.systemCheckUpdates();
      _systemRenderStatus(s);
      if (result) {
        result.innerHTML = s.update_available
          ? `<span style="color:var(--success);">New release ${esc(s.latest_tag)} is available.</span>`
          : `<span style="color:var(--text-muted);">No new release. You're on the latest version.</span>`;
      }
    } catch (e) {
      if (result) result.innerHTML = `<span style="color:var(--danger);">Check failed: ${esc(e.message)}</span>`;
    }
  }

  async function _systemApplyUpdate() {
    const s = _sysUpdateLastStatus;
    if (!s || !s.update_available) return;
    const pending = s.pending_migrations?.length || 0;
    const msg = `Update from ${s.current_tag || (s.current_commit||'').slice(0,7)} to ${s.latest_tag}?\n\n` +
                `• Database will be snapshotted first\n` +
                `• ${pending} schema migration${pending === 1 ? '' : 's'} will run\n` +
                `• Server will restart — users will be briefly disconnected\n\n` +
                `Continue?`;
    if (!confirm(msg)) return;

    const result = document.getElementById('sys-update-result');
    const apply  = document.getElementById('sys-update-apply');
    if (apply) apply.disabled = true;
    if (result) result.textContent = 'Snapshotting DB, fetching release, installing dependencies, running migrations…';
    try {
      const r = await Api.admin.systemApplyUpdate();
      if (r.error) {
        if (result) result.innerHTML = `<span style="color:var(--danger);">Update failed: ${esc(r.error)}</span>`;
        if (apply) apply.disabled = false;
        return;
      }
      const restartNote = r.needs_manual_restart
        ? '<br><strong>Restart the server manually</strong> for the new code to load.'
        : '<br>Server is restarting — this page will reload in a few seconds.';
      if (result) {
        result.innerHTML = `
          <div style="color:var(--success);">
            ✅ Updated to ${esc(r.to_tag)} (snapshot <code>${esc(r.snapshot_id)}</code>).
            ${r.migrations_applied?.length ? `Applied ${r.migrations_applied.length} migration(s).` : ''}
            ${restartNote}
          </div>`;
      }
      // If the orchestrator restarts the process, the next fetch will fail
      // briefly. Polling reload after 6s gives the new container time to come
      // up.
      if (r.will_restart && !r.needs_manual_restart) {
        setTimeout(() => window.location.reload(), 6000);
      }
    } catch (e) {
      if (result) result.innerHTML = `<span style="color:var(--danger);">Update request failed: ${esc(e.message)}</span>`;
      if (apply) apply.disabled = false;
    }
  }

  async function _systemRestore() {
    const input = document.getElementById('sys-restore-file');
    const result = document.getElementById('sys-restore-result');
    const btn = document.getElementById('sys-restore-btn');
    if (!input || !input.files || !input.files.length) {
      if (result) result.innerHTML = `<span style="color:var(--danger);">Choose a .db file first.</span>`;
      return;
    }
    const file = input.files[0];
    const sizeMb = Math.round(file.size / 1024 / 1024 * 10) / 10;
    const msg = `Restore from "${file.name}" (${sizeMb} MB)?\n\n` +
                `• Current database will be snapshotted first (revert via System Update → Rollback)\n` +
                `• All data added or changed since the backup was taken will be REPLACED\n` +
                `• Server will restart\n\n` +
                `Continue?`;
    if (!confirm(msg)) return;
    if (btn) btn.disabled = true;
    if (result) result.innerHTML = `<span style="color:var(--text-muted);">Uploading and validating ${esc(file.name)}…</span>`;
    try {
      const r = await Api.admin.systemRestore(file);
      if (r.error) {
        if (result) result.innerHTML = `<span style="color:var(--danger);">Restore failed: ${esc(r.error)}</span>`;
        if (btn) btn.disabled = false;
        return;
      }
      const restartNote = r.needs_manual_restart
        ? '<br><strong>Restart the server manually</strong> for the restored DB to load.'
        : '<br>Server is restarting — this page will reload in a few seconds.';
      if (result) {
        result.innerHTML = `
          <span style="color:var(--success);">
            ✅ Restored from ${esc(r.source_filename)}.
            Pre-restore snapshot: <code>${esc(r.snapshot_id)}</code>${restartNote}
          </span>`;
      }
      if (r.will_restart && !r.needs_manual_restart) {
        setTimeout(() => window.location.reload(), 6000);
      }
    } catch (e) {
      if (result) result.innerHTML = `<span style="color:var(--danger);">Restore request failed: ${esc(e.message)}</span>`;
      if (btn) btn.disabled = false;
    }
  }

  function _systemDownloadBackup() {
    // Streams a freshly VACUUM-INTO'd copy of the DB. The browser
    // handles the file save dialog. The server audit-logs the download.
    const result = document.getElementById('sys-backup-result');
    if (result) result.textContent = 'Preparing snapshot…';
    // Using a hidden iframe avoids navigating away from the admin page
    // when the response is a binary download. Works the same as a
    // direct link click for download responses.
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = Api.admin.systemBackupUrl();
    document.body.appendChild(iframe);
    setTimeout(() => {
      if (result) result.textContent = 'Download started — check your browser.';
      // Clean up the iframe a bit later; the download will already have
      // been initiated by the browser.
      setTimeout(() => iframe.remove(), 60_000);
    }, 1500);
  }

  async function _systemRollback(snapshotId) {
    const which = snapshotId ? `snapshot ${snapshotId}` : 'the most recent snapshot';
    const msg = `Roll back to ${which}?\n\n` +
                `• The database will be replaced with the snapshot copy\n` +
                `• Any data changes since that snapshot will be LOST\n` +
                `• The commit recorded with the snapshot will be checked out\n` +
                `• Server will restart\n\n` +
                `Continue?`;
    if (!confirm(msg)) return;
    const result = document.getElementById('sys-update-result');
    if (result) result.textContent = `Rolling back to ${which}…`;
    try {
      const r = await Api.admin.systemRollback(snapshotId || null);
      if (r.error) {
        if (result) result.innerHTML = `<span style="color:var(--danger);">Rollback failed: ${esc(r.error)}</span>`;
        return;
      }
      const restartNote = r.needs_manual_restart
        ? '<br><strong>Restart the server manually</strong> for the rolled-back code to load.'
        : '<br>Server is restarting — this page will reload in a few seconds.';
      if (result) {
        result.innerHTML = `<div style="color:var(--success);">✅ Rolled back to snapshot <code>${esc(r.snapshot_id)}</code>.${restartNote}</div>`;
      }
      if (r.will_restart && !r.needs_manual_restart) {
        setTimeout(() => window.location.reload(), 6000);
      }
    } catch (e) {
      if (result) result.innerHTML = `<span style="color:var(--danger);">Rollback request failed: ${esc(e.message)}</span>`;
    }
  }

  async function _saveDashDefault() {
    try {
      await Api.dashboard.saveDefault(_dashWorking);
      const result = document.getElementById('admin-dash-result');
      if (result) result.textContent = 'Saved.';
      showToast('Company dashboard default saved');
    } catch (e) {
      showToast('Failed to save: ' + (e.message || e), 'error');
    }
  }

  return { render, users, auditLog, settings, dashboardDefault, brokerFitness, productsTab, dataBreachesTab, _openUserModal, _saveUser, _deleteUser, _closeModal,
    _addBrokerCode, _updateBrokerCode, _deleteBrokerCode, _renderBrokerCodes, _saveSmtp, _testSmtp, _refreshTemplateList, _selectTemplate, _addTemplate, _saveTemplate, _deleteTemplate, _addFromRow, _removeFromRow, _saveFromList, _saveDashDefault, _exportModule, _sendNotification, _saveAlertCadence, _runAlertScanNow, _runDigestNow, _initSecurityPane, _initDashboardDefaultPane, _initUsersPane, _initCompanyPane, _addCompanyContact, _removeCompanyContact, _uploadCompanyDoc, _deleteCompanyDoc, _generateOtp, _copyOtp, _refreshOtps, _revokeOtp, _open2faModal, _enable2fa, _verify2faEnroll, _disable2fa, _viewRecoveryCodes, _regen2faCodes, _copy2faCodes, _initSystemUpdatePane, _systemCheckUpdates, _systemApplyUpdate, _systemRollback, _systemDownloadBackup, _systemRestore };
})();
// Expose on window so cross-component callers (e.g. BrokerProfiles in
// compliance.js) can access Admin._renderBrokerCodes — top-level `const` does
// not auto-attach to window in classic <script> tags.
window.Admin = Admin;
