/* ═══════════════════════════════════════════════════════════════════════════
   Accounts component
   ═══════════════════════════════════════════════════════════════════════════ */

const Accounts = (() => {

  // ── Enum option sets ────────────────────────────────────────────────────
  const BUSINESS_TYPES   = ['Company', 'Close Corporation', 'Sole Proprietor', 'Partnership', 'Trust', 'NPO', 'School', 'Church', 'Body Corporate', 'Other'];
  const INDUSTRIES       = ['Agriculture', 'Transport', 'Construction', 'Retail', 'Manufacturing',
                            'Professional Services', 'Hospitality', 'Property', 'Logistics', 'Other'];
  const TURNOVER_BANDS   = ['Under R1m', 'R1m-R5m', 'R5m-R10m', 'R10m-R50m', 'Above R50m', 'Not Disclosed'];
  const CLIENT_STATUSES  = ['Prospect', 'Active Client', 'Inactive Client', 'Former Client', 'Do Not Service'];
  const FICA_STATUSES    = ['Not Started', 'Pending Documents', 'In Review', 'Verified', 'Expired', 'Exempt'];

  // ── Shared: load users for broker / admin dropdowns ────────────────────
  async function loadUsers() {
    try {
      const res = await Api.admin.users();
      return res.data || [];
    } catch (_) {
      return [];
    }
  }

  // ── POPIA pill — Compliant / Needs Attention / Non-Compliant ───────────
  function popiaPill(status) {
    if (status === 'Green') return `<span class="badge badge-success" title="POPIA — all required fields complete">Compliant</span>`;
    if (status === 'Amber') return `<span class="badge badge-warning" title="POPIA — incomplete fields">Needs Attention</span>`;
    return `<span class="badge badge-danger" title="POPIA — basis missing, retention expired, or pending erasure">Non-Compliant</span>`;
  }

  // ── FICA pill — Verified / Not Verified ─────────────────────────────────
  function ficaPill(derived) {
    if (derived === 'Verified') return `<span class="badge badge-success">Verified</span>`;
    return `<span class="badge badge-danger" title="FICA — verification missing or expired">Not Verified</span>`;
  }

  // ── Build option HTML helper ────────────────────────────────────────────
  function opts(arr, selected = '', blank = '— Select —') {
    const blankOpt = blank ? `<option value="">${blank}</option>` : '';
    return blankOpt + arr.map(v => {
      const sel = v === selected ? ' selected' : '';
      return `<option value="${Utils.esc(v)}"${sel}>${Utils.esc(v)}</option>`;
    }).join('');
  }

  function userOpts(users, selectedId, blank = '— Select —') {
    const blankOpt = blank ? `<option value="">${blank}</option>` : '';
    return blankOpt + users.map(u => {
      const sel = String(u.id) === String(selectedId) ? ' selected' : '';
      return `<option value="${u.id}"${sel}>${Utils.esc(u.full_name)}</option>`;
    }).join('');
  }

  // ── Pagination controls ─────────────────────────────────────────────────
  function paginationHtml(page, pages) {
    if (pages <= 1) return '';
    const prev = page > 1
      ? `<button class="btn btn-sm btn-outline" data-page="${page - 1}">← Prev</button>`
      : `<button class="btn btn-sm btn-outline" disabled>← Prev</button>`;
    const next = page < pages
      ? `<button class="btn btn-sm btn-outline" data-page="${page + 1}">Next →</button>`
      : `<button class="btn btn-sm btn-outline" disabled>Next →</button>`;
    return `
      <div class="pagination">
        ${prev}
        <span class="pagination-info">Page ${page} of ${pages}</span>
        ${next}
      </div>`;
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── Cell renderers keyed by catalog column id ─────────────────────────
  const ACCOUNT_CELLS = {
    account_name:         a => `<a href="#/accounts/${a.id}">${Utils.esc(a.account_name || '—')}</a>`,
    business_type:        a => Utils.esc(a.business_type || '—'),
    industry:             a => Utils.esc(a.industry || '—'),
    client_status:        a => `<span class="badge badge-status">${Utils.esc(a.client_status || '—')}</span>`,
    popia:                a => popiaPill(a.popia_status),
    fica_status:          a => ficaPill(a.fica_status_derived),
    registration_number:  a => Utils.esc(a.registration_number || '—'),
    vat_number:           a => Utils.esc(a.vat_number || '—'),
    annual_turnover_band: a => Utils.esc(a.annual_turnover_band || '—'),
    number_of_employees:  a => a.number_of_employees != null ? String(a.number_of_employees) : '—',
    main_contact_name:    a => Utils.esc(a.main_contact_name || '—'),
    broker_full_name:     a => Utils.esc(a.broker_full_name || '—'),
    last_review_date:     a => a.last_review_date ? Utils.formatDate(a.last_review_date) : '—',
    next_review_date:     a => a.next_review_date ? Utils.formatDate(a.next_review_date) : '—',
    created_at:           a => a.created_at ? Utils.formatDate(a.created_at) : '—',
    updated_at:           a => a.updated_at ? Utils.formatDate(a.updated_at) : '—',
    actions:              a => `
      <a href="#/accounts/${a.id}"        class="btn btn-sm btn-secondary">View</a>
      <a href="#/accounts/${a.id}/edit"   class="btn btn-sm btn-primary">Edit</a>
      <button class="btn btn-sm btn-danger js-delete" data-id="${a.id}" data-name="${Utils.esc(a.account_name || '')}">Delete</button>`,
  };

  let _acctCatalog = null;
  let _acctConfig  = null;

  // LIST
  // ════════════════════════════════════════════════════════════════════════
  async function list(params = {}) {
    setPageTitle('Accounts');
    setBreadcrumb(['Accounts']);
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    try {
      const prefs = await ViewPrefs.load('accounts');
      _acctCatalog = prefs.catalog;
      _acctConfig  = prefs.config;

      // Default the broker filter to the logged-in admin so they land on
      // *their own* accounts first — admins can see everyone but the day-to-day
      // working set is their own book. The Clear button passes broker_id:''
      // explicitly to override the default and show every broker.
      // Brokers fall through unchanged (broker-isolated server-side); admin_only
      // isn't in the broker dropdown so a self-filter would return zero.
      const isAdmin = window.currentUser?.role === 'admin';
      const defaultBroker = (isAdmin && params.broker_id === undefined && window.currentUser?.id)
        ? String(window.currentUser.id)
        : '';

      let state = {
        search:    params.search    || '',
        status:    params.status    || '',
        broker_id: params.broker_id !== undefined ? params.broker_id : defaultBroker,
        page:      params.page      || 1,
        sort:      _acctConfig.sortBy,
        dir:       _acctConfig.sortDir,
      };

      const [users, res] = await Promise.all([
        loadUsers(),
        Api.accounts.list(state),
      ]);

      const accounts = res.data  || [];
      const total    = res.total || 0;
      const page     = res.page  || 1;
      const pages    = res.pages || 1;

      const brokers   = users.filter(u => u.role === 'broker' || u.role === 'admin');
      const brokerOps = `<option value="">All Brokers</option>` + brokers.map(u => {
        const sel = String(u.id) === String(state.broker_id) ? ' selected' : '';
        return `<option value="${u.id}"${sel}>${Utils.esc(u.full_name)}</option>`;
      }).join('');

      const visibleCols = ViewPrefs.visibleColumns(_acctCatalog, _acctConfig);
      const colCount = visibleCols.length || 1;

      const headCells = visibleCols.map(col => {
        const active = _acctConfig.sortBy === col.id;
        const arrow  = active ? (_acctConfig.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
        const classes = col.sortable
          ? `class="sortable${active ? ' sort-active' : ''}" data-sort="${col.id}" style="cursor:pointer;"`
          : 'class="not-sortable"';
        return `<th ${classes}>${Utils.esc(col.label)}${arrow}</th>`;
      }).join('');

      const rows = accounts.length
        ? accounts.map(a => `<tr>${visibleCols.map(col => {
            const fn = ACCOUNT_CELLS[col.id];
            return `<td${col.id === 'actions' ? ' class="table-actions"' : ''}>${fn ? fn(a) : Utils.esc(String(a[col.id] ?? '—'))}</td>`;
          }).join('')}</tr>`).join('')
        : `<tr><td colspan="${colCount}" class="table-empty">No accounts found.</td></tr>`;

      el.innerHTML = `
        <div class="list-view">

          <!-- Summary -->
          <div class="list-summary">${total} account${total !== 1 ? 's' : ''} found</div>

          <!-- Table -->
          <div class="table-responsive card">
            <table class="table table-hover">
              <thead><tr>${headCells}</tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>

          ${paginationHtml(page, pages)}
        </div>
      `;

      const ctrlStyle = 'height:28px;padding:.15rem .4rem;font-size:.78rem;line-height:1;';
      const headerActions = document.getElementById('header-actions');
      if (headerActions) {
        headerActions.innerHTML = `<a href="#/accounts/new" class="btn btn-primary" style="${ctrlStyle}">+ New Account</a>`;
      }

      document.getElementById('accounts-center-filters')?.remove();
      const topHeader = document.getElementById('top-header');
      if (topHeader) {
        topHeader.style.position = 'relative';
        const wrap = document.createElement('div');
        wrap.id = 'accounts-center-filters';
        wrap.setAttribute('data-header-widget', '1');
        wrap.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;gap:.5rem;align-items:center;z-index:2;background:var(--bg);padding:.3rem .55rem;border-radius:6px;';
        wrap.innerHTML = `
          <input type="search" id="accounts-search" class="form-control" placeholder="Search…"
            value="${Utils.esc(state.search)}"
            style="${ctrlStyle}width:160px;">
          <select id="filter-status" class="form-control" style="${ctrlStyle}max-width:140px;">
            <option value="">Status</option>
            ${opts(CLIENT_STATUSES, state.status, '')}
          </select>
          <select id="filter-broker" class="form-control" style="${ctrlStyle}max-width:140px;">
            ${brokerOps.replace('All Brokers', 'Broker')}
          </select>
          <button id="accounts-filter-clear" class="btn btn-secondary" style="${ctrlStyle}">Clear</button>`;
        topHeader.appendChild(wrap);
      }
      ViewPrefs.attachButton({
        moduleKey: 'accounts',
        catalog:   _acctCatalog,
        current:   _acctConfig,
        onChange:  (newCfg) => { _acctConfig = newCfg; list(state); },
      });

      // ── Event wiring ───────────────────────────────────────────────────
      let searchTimer;
      document.getElementById('accounts-search').addEventListener('input', e => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          state.search = e.target.value;
          state.page   = 1;
          list(state);
        }, 350);
      });

      ['filter-status', 'filter-broker'].forEach(id => {
        document.getElementById(id).addEventListener('change', e => {
          const key = { 'filter-status': 'status', 'filter-broker': 'broker_id' }[id];
          state[key] = e.target.value;
          state.page = 1;
          list(state);
        });
      });

      const accountsClearEl = document.getElementById('accounts-filter-clear');
      if (accountsClearEl) {
        accountsClearEl.addEventListener('click', () => {
          list({ search: '', status: '', broker_id: '', page: 1 });
        });
      }

      el.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', async () => {
          const col = th.dataset.sort;
          if (_acctConfig.sortBy === col) {
            _acctConfig.sortDir = _acctConfig.sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            _acctConfig.sortBy = col;
            _acctConfig.sortDir = 'asc';
          }
          try { const r = await Api.viewPrefs.save('accounts', _acctConfig); _acctConfig = r.config; } catch (_) {}
          list(state);
        });
      });

      el.querySelectorAll('[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
          state.page = parseInt(btn.dataset.page, 10);
          list(state);
        });
      });

      el.querySelectorAll('.js-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const { id, name } = btn.dataset;
          if (!confirm(`Delete account "${name}"? This cannot be undone.`)) return;
          try {
            await Api.accounts.delete(id);
            showToast('Account deleted.', 'success');
            list(state);
          } catch (err) {
            showToast('Failed to delete account: ' + (err.message || err), 'error');
          }
        });
      });

    } catch (err) {
      el.innerHTML = Utils.errorHtml('Failed to load accounts.', err);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // FORM (new / edit)
  // ════════════════════════════════════════════════════════════════════════
  async function form(id = null) {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    try {
      const [users, contactsRes, account] = await Promise.all([
        loadUsers(),
        Api.contacts.list({ limit: 200 }),
        id ? Api.accounts.get(id) : Promise.resolve(null),
      ]);

      const a       = account || {};
      const isEdit  = !!id;
      const title   = isEdit
        ? `Edit Account: ${Utils.esc(a.account_name || '')}`
        : 'New Account';

      const brokers  = users.filter(u => u.role === 'broker' || u.role === 'admin');
      const admins   = users.filter(u => u.role === 'admin'  || u.role === 'admin_only');
      const contacts = (contactsRes.data || []);

      // Update header title
      const headerTitle = document.getElementById('header-title');
      if (headerTitle) headerTitle.textContent = isEdit ? 'Edit Account' : 'New Account';

      const headerActions = document.getElementById('header-actions');
      if (headerActions) headerActions.innerHTML = '';

      el.innerHTML = `
        <div class="form-view">
          <div class="form-view-header">
            <h2 class="form-view-title">${title}</h2>
          </div>

          <form id="account-form" novalidate>

            <!-- 1. Account Details -->
            <div class="form-section card">
              <div class="form-section-title">Account Details</div>
              <div class="form-grid form-grid-2">
                <div class="form-group form-grid-full">
                  <label class="form-label required">Account Name</label>
                  <input type="text" class="form-control" name="account_name"
                    value="${Utils.esc(a.account_name || '')}" required />
                  <span class="field-error" data-field="account_name"></span>
                </div>
                <div class="form-group">
                  <label class="form-label">Registration Number</label>
                  <input type="text" class="form-control" name="registration_number"
                    value="${Utils.esc(a.registration_number || '')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">VAT Number</label>
                  <input type="text" class="form-control" name="vat_number"
                    value="${Utils.esc(a.vat_number || '')}" />
                </div>
                <div class="form-group">
                  <label class="form-label required">Business Type</label>
                  <select class="form-control" name="business_type" required>
                    ${opts(BUSINESS_TYPES, a.business_type)}
                  </select>
                  <span class="field-error" data-field="business_type"></span>
                </div>
                <div class="form-group">
                  <label class="form-label">Industry</label>
                  <select class="form-control" name="industry">
                    ${opts(INDUSTRIES, a.industry)}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Number of Employees</label>
                  <input type="number" class="form-control" name="number_of_employees" min="0"
                    value="${Utils.esc(a.number_of_employees != null ? a.number_of_employees : '')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Annual Turnover Band</label>
                  <select class="form-control" name="annual_turnover_band">
                    ${opts(TURNOVER_BANDS, a.annual_turnover_band)}
                  </select>
                </div>
              </div>
            </div>

            <!-- 2. Physical Address -->
            <div class="form-section card">
              <div class="form-section-title" style="display:flex;align-items:center;gap:.5rem;">
                Physical Address
                <button type="button" class="btn btn-secondary btn-sm" style="margin-left:auto;font-size:.75rem;"
                  data-maps-from="phys" title="Open address in Google Maps">📍 Open in Google Maps</button>
                <button type="button" class="btn btn-secondary btn-sm" style="font-size:.75rem;"
                  data-maps-from-gps="phys" title="Open GPS coords in Google Maps">🌐 Open GPS</button>
              </div>
              <div class="form-grid form-grid-2">
                <div class="form-group"><label class="form-label">Street Address</label><input type="text" class="form-control" name="phys_street_address" value="${Utils.esc(a.phys_street_address || '')}" /></div>
                <div class="form-group"><label class="form-label">Complex / Building</label><input type="text" class="form-control" name="phys_complex_building" value="${Utils.esc(a.phys_complex_building || '')}" /></div>
                <div class="form-group"><label class="form-label">Suburb</label><input type="text" class="form-control" name="phys_suburb" value="${Utils.esc(a.phys_suburb || '')}" /></div>
                <div class="form-group"><label class="form-label">City</label><input type="text" class="form-control" name="phys_city" value="${Utils.esc(a.phys_city || '')}" /></div>
                <div class="form-group"><label class="form-label">Province</label><select class="form-control" name="phys_province"><option value="">— Select —</option>${['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','Northern Cape','North West','Western Cape'].map(p => `<option value="${p}" ${a.phys_province === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
                <div class="form-group"><label class="form-label">Postal Code</label><input type="text" class="form-control" name="phys_postal_code" value="${Utils.esc(a.phys_postal_code || '')}" /></div>
                <div class="form-group"><label class="form-label">Country</label><input type="text" class="form-control" name="phys_country" value="${Utils.esc(a.phys_country || 'South Africa')}" /></div>
                <div class="form-group"><label class="form-label">GPS Latitude</label><input type="text" class="form-control" name="phys_gps_lat" value="${Utils.esc(a.phys_gps_lat || '')}" placeholder="e.g. -25.7461" /></div>
                <div class="form-group"><label class="form-label">GPS Longitude</label><input type="text" class="form-control" name="phys_gps_lng" value="${Utils.esc(a.phys_gps_lng || '')}" placeholder="e.g. 28.1881" /></div>
              </div>
            </div>

            <!-- 2b. Postal Address -->
            <div class="form-section card">
              <div class="form-section-title">Postal Address</div>
              <div class="form-grid form-grid-2">
                <div class="form-group"><label class="form-label">Street Address</label><input type="text" class="form-control" name="post_street_address" value="${Utils.esc(a.post_street_address || '')}" /></div>
                <div class="form-group"><label class="form-label">Complex / Building</label><input type="text" class="form-control" name="post_complex_building" value="${Utils.esc(a.post_complex_building || '')}" /></div>
                <div class="form-group"><label class="form-label">Suburb</label><input type="text" class="form-control" name="post_suburb" value="${Utils.esc(a.post_suburb || '')}" /></div>
                <div class="form-group"><label class="form-label">City</label><input type="text" class="form-control" name="post_city" value="${Utils.esc(a.post_city || '')}" /></div>
                <div class="form-group"><label class="form-label">Province</label><select class="form-control" name="post_province"><option value="">— Select —</option>${['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','Northern Cape','North West','Western Cape'].map(p => `<option value="${p}" ${a.post_province === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
                <div class="form-group"><label class="form-label">Postal Code</label><input type="text" class="form-control" name="post_postal_code" value="${Utils.esc(a.post_postal_code || '')}" /></div>
                <div class="form-group"><label class="form-label">Country</label><input type="text" class="form-control" name="post_country" value="${Utils.esc(a.post_country || 'South Africa')}" /></div>
              </div>
            </div>

            <!-- 3. Relationships -->
            <div class="form-section card">
              <div class="form-section-title">Relationships &amp; Assignments</div>
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Main Contact</label>
                  <select class="form-control" name="main_contact_id">
                    <option value="">— None —</option>
                    ${contacts.map(c => {
                      const sel = String(c.id) === String(a.main_contact_id) ? ' selected' : '';
                      return `<option value="${c.id}"${sel}>${Utils.esc(c.first_name + ' ' + c.last_name)}</option>`;
                    }).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label required">Assigned Broker</label>
                  <select class="form-control" name="assigned_broker_id" required>
                    ${userOpts(brokers, a.assigned_broker_id)}
                  </select>
                  <span class="field-error" data-field="assigned_broker_id"></span>
                </div>
                <div class="form-group">
                  <label class="form-label">Assigned Admin</label>
                  <select class="form-control" name="assigned_admin_id">
                    ${userOpts(admins, a.assigned_admin_id)}
                  </select>
                </div>
              </div>
            </div>

            <!-- 4. Compliance -->
            <div class="form-section card compliance-section">
              <div class="form-section-title">Compliance &amp; Status</div>
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label required">Client Status</label>
                  <select class="form-control" name="client_status" required>
                    ${opts(CLIENT_STATUSES, a.client_status)}
                  </select>
                  <span class="field-error" data-field="client_status"></span>
                </div>
                <div class="form-group compliance-field">
                  <label class="form-label required">FICA Status</label>
                  <select class="form-control" name="fica_status" required>
                    ${opts(FICA_STATUSES, a.fica_status)}
                  </select>
                  <span class="field-error" data-field="fica_status"></span>
                </div>
                <div class="form-group">
                  <label class="form-label">Date Became Client</label>
                  <input type="date" class="form-control" name="date_became_client"
                    value="${Utils.esc(a.date_became_client || '')}" />
                </div>
              </div>
            </div>

            <!-- 5. Reviews -->
            <div class="form-section card">
              <div class="form-section-title">Reviews</div>
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Last Review Date</label>
                  <input type="date" class="form-control" name="last_review_date"
                    value="${Utils.esc(a.last_review_date || '')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Next Review Date</label>
                  <input type="date" class="form-control" name="next_review_date"
                    value="${Utils.esc(a.next_review_date || '')}" />
                </div>
              </div>
            </div>

            <!-- 6. Notes -->
            <div class="form-section card">
              <div class="form-section-title">Notes</div>
              <div class="form-group">
                <textarea class="form-control" name="notes" rows="4">${Utils.esc(a.notes || '')}</textarea>
              </div>
            </div>

            <!-- Form Actions -->
            <div class="form-actions">
              <button type="submit" class="btn btn-primary" id="account-save-btn">
                ${isEdit ? 'Save Changes' : 'Create Account'}
              </button>
              <button type="button" class="btn btn-outline" id="account-cancel-btn">Cancel</button>
            </div>

          </form>
        </div>
      `;

      // ── Cancel ──────────────────────────────────────────────────────────
      document.getElementById('account-cancel-btn').addEventListener('click', () => {
        navigate(id ? `accounts/${id}` : 'accounts');
      });

      // ── Google Maps shortcuts (per-section: phys / post) ────────────────
      el.querySelectorAll('[data-maps-from]').forEach(btn => {
        btn.addEventListener('click', () => {
          const prefix = btn.dataset.mapsFrom;
          const f = el.querySelector('#account-form');
          if (!f) return;
          const parts = [
            `${prefix}_street_address`, `${prefix}_complex_building`,
            `${prefix}_suburb`, `${prefix}_city`, `${prefix}_province`,
            `${prefix}_postal_code`, `${prefix}_country`,
          ].map(n => f.querySelector(`[name="${n}"]`)?.value?.trim()).filter(Boolean);
          if (!parts.length) {
            showToast('Fill in at least one address line first.', 'warning');
            return;
          }
          window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`, '_blank', 'noopener');
        });
      });
      el.querySelectorAll('[data-maps-from-gps]').forEach(btn => {
        btn.addEventListener('click', () => {
          const prefix = btn.dataset.mapsFromGps;
          const f = el.querySelector('#account-form');
          if (!f) return;
          const lat = f.querySelector(`[name="${prefix}_gps_lat"]`)?.value?.trim();
          const lng = f.querySelector(`[name="${prefix}_gps_lng"]`)?.value?.trim();
          if (!lat || !lng) {
            showToast('Enter GPS latitude and longitude first.', 'warning');
            return;
          }
          window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lat + ',' + lng)}`, '_blank', 'noopener');
        });
      });

      // ── Submit ──────────────────────────────────────────────────────────
      document.getElementById('account-form').addEventListener('submit', async e => {
        e.preventDefault();
        clearErrors(el);

        const data   = collectForm(e.target);
        const errors = validateAccount(data);
        if (errors.length) {
          showErrors(el, errors);
          return;
        }

        const btn = document.getElementById('account-save-btn');
        btn.disabled    = true;
        btn.textContent = 'Saving…';

        try {
          if (isEdit) {
            await Api.accounts.update(id, data);
            showToast('Account updated successfully.', 'success');
            navigate(`accounts/${id}`);
          } else {
            const created = await Api.accounts.create(data);
            showToast('Account created successfully.', 'success');
            navigate(`accounts/${created.id}`);
          }
        } catch (err) {
          btn.disabled    = false;
          btn.textContent = isEdit ? 'Save Changes' : 'Create Account';
          showToast('Save failed: ' + (err.message || 'Unknown error'), 'error');
        }
      });

    } catch (err) {
      el.innerHTML = Utils.errorHtml('Failed to load account form.', err);
    }
  }

  // ── Collect form data ───────────────────────────────────────────────────
  function collectForm(formEl) {
    const fd  = new FormData(formEl);
    const out = {};
    for (const [k, v] of fd.entries()) {
      out[k] = v;
    }
    // Convert numeric fields
    if (out.number_of_employees !== undefined && out.number_of_employees !== '') {
      out.number_of_employees = parseInt(out.number_of_employees, 10);
    }
    return out;
  }

  // ── Client-side validation ──────────────────────────────────────────────
  function validateAccount(data) {
    const errors = [];
    if (!data.account_name)       errors.push({ field: 'account_name',       msg: 'Account name is required.' });
    if (!data.business_type)      errors.push({ field: 'business_type',      msg: 'Business type is required.' });
    if (!data.assigned_broker_id) errors.push({ field: 'assigned_broker_id', msg: 'Assigned broker is required.' });
    if (!data.client_status)      errors.push({ field: 'client_status',      msg: 'Client status is required.' });
    if (!data.fica_status)        errors.push({ field: 'fica_status',        msg: 'FICA status is required.' });
    return errors;
  }

  function clearErrors(el) {
    el.querySelectorAll('.field-error').forEach(s => { s.textContent = ''; });
    el.querySelectorAll('.form-control.is-invalid').forEach(i => i.classList.remove('is-invalid'));
  }

  function showErrors(el, errors) {
    errors.forEach(({ field, msg }) => {
      const span = el.querySelector(`[data-field="${field}"]`);
      if (span) span.textContent = msg;
      const input = el.querySelector(`[name="${field}"]`);
      if (input) input.classList.add('is-invalid');
    });
    const first = el.querySelector('.is-invalid');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ════════════════════════════════════════════════════════════════════════
  // DETAIL (read-only view)
  // ════════════════════════════════════════════════════════════════════════
  async function detail(id) {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    try {
      const a = await Api.accounts.get(id);

      // Update header
      const headerTitle = document.getElementById('header-title');
      if (headerTitle) headerTitle.textContent = a.account_name || 'Account';

      const headerActions = document.getElementById('header-actions');
      if (headerActions) {
        headerActions.innerHTML = `
          <a href="#/schedule/account/${id}" class="btn btn-secondary">📋 Policy Schedule</a>
          <button class="btn btn-secondary" onclick="Accounts._openMailModal(${id})">📧 Email</button>
          <a href="#/accounts/${id}/edit" class="btn btn-primary">Edit</a>`;
      }

      // ── Read-only field helper ─────────────────────────────────────────
      const field = (label, value, isCompliance = false) => {
        const cls = isCompliance ? ' compliance-field' : '';
        return `
          <div class="detail-field${cls}">
            <span class="detail-label">${label}</span>
            <span class="detail-value">${Utils.esc(value || '—')}</span>
          </div>`;
      };

      // ── Compliance banners (FICA + POPIA) ──
      const _today = new Date().toISOString().slice(0, 10);
      const _ficaBad = !a.fica_status
        || a.fica_status === 'Not Started' || a.fica_status === 'Pending Documents'
        || a.fica_status === 'In Review'   || a.fica_status === 'Expired'
        || (a.fica_five_year_expiry && a.fica_five_year_expiry < _today);
      const _popiaBad = !a.data_processing_basis
        || (a.retention_expiry_date && a.retention_expiry_date < _today)
        || (a.data_processing_basis === 'Consent' && (!a.popia_consent_date || !a.consent_method));
      const _bannerHtml = (_ficaBad || _popiaBad) ? `
        <div style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:1rem;">
          ${_ficaBad ? `
            <div class="alert alert-danger" style="padding:.75rem 1rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;">
              <div>
                <strong>⚠ FICA Not Verified</strong> — This account lacks a valid FICA verification (FICA s23).
                Verification records must be retained for at least 5 years.
              </div>
              <a href="#/fica/account/${a.id}" class="btn btn-sm btn-light" style="background:#fff;color:#a71d2a;font-weight:600;white-space:nowrap;">Open FICA →</a>
            </div>` : ''}
          ${_popiaBad ? `
            <div class="alert alert-danger" style="padding:.75rem 1rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;">
              <div>
                <strong>⚠ POPIA Incomplete</strong> — ${!a.data_processing_basis ? 'Data Processing Basis is missing.' : (a.retention_expiry_date && a.retention_expiry_date < _today) ? 'Retention period has expired.' : 'Consent date / method is missing.'}
              </div>
              <a href="#/popia/account/${a.id}" class="btn btn-sm btn-light" style="background:#fff;color:#a71d2a;font-weight:600;white-space:nowrap;">Open POPIA →</a>
            </div>` : ''}
        </div>` : '';

      el.innerHTML = `
        <div class="detail-view">

          ${_bannerHtml}

          <!-- Account Details -->
          <div class="detail-section card">
            <div class="detail-section-title">Account Details</div>
            <div class="detail-grid">
              ${field('Account Name',        a.account_name)}
              ${field('Registration Number', a.registration_number)}
              ${field('VAT Number',          a.vat_number)}
              ${field('Business Type',       a.business_type)}
              ${field('Industry',            a.industry)}
              ${field('No. of Employees',    a.number_of_employees != null ? String(a.number_of_employees) : null)}
              ${field('Annual Turnover Band',a.annual_turnover_band)}
            </div>
          </div>

          <!-- Physical Address -->
          <div class="detail-section card">
            <div class="detail-section-title" style="display:flex;align-items:center;gap:.5rem;">
              Physical Address
              ${(() => {
                const addrParts = [a.phys_street_address, a.phys_complex_building, a.phys_suburb, a.phys_city, a.phys_province, a.phys_postal_code, a.phys_country].filter(Boolean);
                const addrUrl = addrParts.length ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrParts.join(', '))}` : null;
                const gpsUrl  = (a.phys_gps_lat && a.phys_gps_lng) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.phys_gps_lat + ',' + a.phys_gps_lng)}` : null;
                return `
                  ${addrUrl ? `<a href="${addrUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="margin-left:auto;font-size:.75rem;">📍 Open in Google Maps</a>` : ''}
                  ${gpsUrl  ? `<a href="${gpsUrl}"  target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="${addrUrl ? '' : 'margin-left:auto;'}font-size:.75rem;">🌐 Open GPS</a>` : ''}`;
              })()}
            </div>
            <div class="detail-grid">
              ${field('Street Address',    a.phys_street_address)}
              ${field('Complex / Building',a.phys_complex_building)}
              ${field('Suburb',            a.phys_suburb)}
              ${field('City',              a.phys_city)}
              ${field('Province',          a.phys_province)}
              ${field('Postal Code',       a.phys_postal_code)}
              ${field('Country',           a.phys_country)}
              ${field('GPS Latitude',      a.phys_gps_lat)}
              ${field('GPS Longitude',     a.phys_gps_lng)}
            </div>
          </div>

          <!-- Postal Address -->
          <div class="detail-section card">
            <div class="detail-section-title">Postal Address</div>
            <div class="detail-grid">
              ${field('Street Address',    a.post_street_address)}
              ${field('Complex / Building',a.post_complex_building)}
              ${field('Suburb',            a.post_suburb)}
              ${field('City',              a.post_city)}
              ${field('Province',          a.post_province)}
              ${field('Postal Code',       a.post_postal_code)}
              ${field('Country',           a.post_country)}
            </div>
          </div>

          <!-- Relationships -->
          <div class="detail-section card">
            <div class="detail-section-title">Relationships &amp; Assignments</div>
            <div class="detail-grid">
              ${field('Main Contact',     a.main_contact_name)}
              ${field('Assigned Broker',  a.broker_full_name)}
              ${field('Assigned Admin',   a.admin_full_name)}
            </div>
          </div>

          <!-- Compliance -->
          ${(() => {
            const today = new Date().toISOString().slice(0, 10);
            const retentionExpired = a.retention_expiry_date && a.retention_expiry_date < today;
            const hasBasis      = !!a.data_processing_basis;
            const consentOk     = a.data_processing_basis === 'Consent'
              ? !!(a.popia_consent_date && a.consent_method)
              : true;
            const hasSource     = !!a.data_source;
            const hasCategories = !!(a.data_categories_held && a.data_categories_held !== '[]');
            const hasIO         = !!a.information_officer_id;
            const hasNotice     = !!a.privacy_notice_provided;
            let popiaStatus = 'amber';
            if (retentionExpired || !hasBasis) popiaStatus = 'red';
            else if (hasBasis && consentOk && hasSource && hasCategories && hasIO && hasNotice) popiaStatus = 'green';
            const popiaImg = popiaStatus === 'green' ? '/popia.jpg'
                          : popiaStatus === 'amber' ? '/popia_amber.jpg'
                          : '/popia_red.jpg';
            const popiaTitle = popiaStatus === 'green' ? 'POPIA — Compliant'
                           : popiaStatus === 'amber' ? 'POPIA — Incomplete fields'
                           : 'POPIA — Consent missing or retention expired';
            window.__acctPopiaImg = `<img src="${popiaImg}" alt="${popiaTitle}" title="${popiaTitle}" style="position:absolute;top:.5rem;right:.5rem;width:64px;height:auto;opacity:.95;">`;
            return '';
          })()}
          <div class="detail-section card compliance-section" style="position:relative;">
            ${window.__acctPopiaImg || ''}
            <div class="detail-section-title">Compliance &amp; Status</div>
            <div class="detail-grid">
              ${field('Client Status',     a.client_status)}
              <div class="detail-field compliance-field">
                <span class="detail-label">POPIA</span>
                <span class="detail-value">${popiaPill(a.popia_status)}</span>
              </div>
              <div class="detail-field compliance-field">
                <span class="detail-label">FICA</span>
                <span class="detail-value">${ficaPill(a.fica_status_derived)}</span>
              </div>
              ${field('Date Became Client', a.date_became_client ? Utils.formatDate(a.date_became_client) : null)}
              <div class="detail-field compliance-field">
                <span class="detail-label">Data Processing Basis</span>
                <span class="detail-value">${Utils.esc(a.data_processing_basis || '— missing —')}</span>
              </div>
              ${field('POPIA Consent Date', a.popia_consent_date ? Utils.formatDate(a.popia_consent_date) : null)}
              ${field('Retention Expires', a.retention_expiry_date ? Utils.formatDate(a.retention_expiry_date) : null)}
            </div>
            ${!a.data_processing_basis ? `
              <div class="alert alert-warning" style="margin-top:.5rem;font-size:.82rem;">
                ⚠ POPIA: a Data Processing Basis must be recorded before this account can be set to Active Client.
              </div>` : ''}
            <div style="margin-top:.75rem;display:flex;gap:.5rem;flex-wrap:wrap;">
              <a href="#/popia/account/${a.id}" class="btn btn-sm btn-outline">Open POPIA Record →</a>
              <a href="#/fica/account/${a.id}"  class="btn btn-sm btn-outline">Open FICA Record →</a>
            </div>
          </div>

          <!-- Reviews -->
          <div class="detail-section card">
            <div class="detail-section-title">Reviews</div>
            <div class="detail-grid">
              ${field('Last Review Date', a.last_review_date ? Utils.formatDate(a.last_review_date) : null)}
              ${field('Next Review Date', a.next_review_date ? Utils.formatDate(a.next_review_date) : null)}
            </div>
          </div>

          <!-- Notes -->
          ${a.notes ? `
          <div class="detail-section card">
            <div class="detail-section-title">Notes</div>
            <div class="detail-notes">${Utils.esc(a.notes)}</div>
          </div>` : ''}

          <!-- Tabs -->
          <div class="detail-tabs card">
            <div class="tabs-header" id="account-tabs-header">
              <button class="tab-btn active" data-tab="contacts">Contacts</button>
              <button class="tab-btn"        data-tab="policies">Policies</button>
              <button class="tab-btn"        data-tab="assets">Assets</button>
              <button class="tab-btn"        data-tab="claims">Claims</button>
              <button class="tab-btn"        data-tab="engagements">Engagements</button>
              <button class="tab-btn"        data-tab="reviews">Reviews</button>
              <button class="tab-btn"        data-tab="complaints">Complaints</button>
              <button class="tab-btn"        data-tab="advice-records">Records of Advice</button>
              <button class="tab-btn"        data-tab="sections">Sections</button>
              <button class="tab-btn"        data-tab="documents">Documents</button>
              <button class="tab-btn"        data-tab="timeline">Timeline</button>
            </div>
            <div class="tab-content" id="account-tab-content">
              <div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>
            </div>
          </div>

        </div><!-- /.detail-view -->
      `;

      // Load default tab
      loadAccountTab(id, 'contacts');

      // Tab switching
      document.getElementById('account-tabs-header').querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#account-tabs-header .tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          loadAccountTab(id, btn.dataset.tab);
        });
      });

    } catch (err) {
      el.innerHTML = Utils.errorHtml('Failed to load account.', err);
    }
  }

  // ── Tab content loader for detail view ─────────────────────────────────
  async function loadAccountTab(accountId, tab) {
    const tabEl = document.getElementById('account-tab-content');
    if (!tabEl) return;
    tabEl.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    try {
      switch (tab) {

        case 'contacts': {
          const res = await Api.accounts.contacts(accountId);
          const rows = Array.isArray(res) ? res : (res.data || []);
          tabEl.innerHTML = rows.length ? `
            <table class="table">
              <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Email</th><th>Mobile</th><th></th></tr></thead>
              <tbody>${rows.map(c => `
                <tr>
                  <td><a href="#/contacts/${c.id}">${Utils.esc(c.first_name + ' ' + c.last_name)}</a></td>
                  <td>${Utils.esc(c.contact_type   || '—')}</td>
                  <td><span class="badge badge-status">${Utils.esc(c.contact_status || '—')}</span></td>
                  <td>${Utils.esc(c.email  || '—')}</td>
                  <td>${Utils.esc(c.mobile || '—')}</td>
                  <td><a href="#/contacts/${c.id}" class="btn btn-xs btn-outline">View</a></td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No contacts linked to this account.</p>`;
          break;
        }

        case 'policies': {
          const res = await Api.policies.list({ account_id: accountId, limit: 50 });
          const rows = (res.data || []);
          tabEl.innerHTML = rows.length ? `
            <table class="table">
              <thead><tr><th>Policy Name</th><th>Number</th><th>Insurer</th><th>Status</th><th>Renewal</th><th></th></tr></thead>
              <tbody>${rows.map(p => `
                <tr>
                  <td><a href="#/policies/${p.id}">${Utils.esc(p.policy_name || '—')}</a></td>
                  <td>${Utils.esc(p.policy_number || '—')}</td>
                  <td>${Utils.esc(p.insurer       || '—')}</td>
                  <td><span class="badge badge-status">${Utils.esc(p.policy_status || '—')}</span></td>
                  <td>${p.renewal_date ? Utils.formatDate(p.renewal_date) : '—'}</td>
                  <td><a href="#/policies/${p.id}" class="btn btn-xs btn-outline">View</a></td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No policies linked to this account.</p>`;
          break;
        }

        case 'documents': {
          const res = await Api.documents.list({ module: 'accounts', record_id: accountId });
          const docs = (res.data || []);
          tabEl.innerHTML = `
            <div class="tab-toolbar">
              <label class="btn btn-primary btn-sm" for="account-doc-upload">+ Upload Document</label>
              <input type="file" id="account-doc-upload" style="display:none;"
                accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.csv" />
            </div>
            ${docs.length ? `
            <table class="table">
              <thead><tr><th>File Name</th><th>Type</th><th>Size</th><th>Uploaded By</th><th>Date</th><th></th></tr></thead>
              <tbody>${docs.map(d => `
                <tr>
                  <td>${Utils.esc(d.original_name)}</td>
                  <td>${Utils.esc(d.file_type || '—')}</td>
                  <td>${Utils.formatBytes ? Utils.formatBytes(d.file_size) : d.file_size}</td>
                  <td>${Utils.esc(d.uploaded_by_name || '—')}</td>
                  <td>${d.uploaded_at ? Utils.formatDate(d.uploaded_at) : '—'}</td>
                  <td style="white-space:nowrap;">
                    <a href="/api/documents/${d.id}/view" target="_blank" class="btn btn-xs btn-outline">View</a>
                    <button class="btn btn-xs btn-danger doc-del-btn" data-doc-id="${d.id}" data-doc-name="${Utils.esc(d.original_name)}">Delete</button>
                  </td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No documents uploaded yet.</p>`}
          `;

          document.getElementById('account-doc-upload').addEventListener('change', async e => {
            const file = e.target.files[0];
            if (!file) return;
            try {
              const fd = new FormData();
              fd.append('file', file);
              fd.append('module', 'accounts');
              fd.append('record_id', accountId);
              await Api.documents.upload(fd);
              showToast('Document uploaded.', 'success');
              loadAccountTab(accountId, 'documents');
            } catch (err) {
              showToast('Upload failed: ' + (err.message || err), 'error');
            }
          });
          tabEl.querySelectorAll('.doc-del-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
              const docName = btn.dataset.docName;
              if (!confirm(`Delete document "${docName}"? This cannot be undone.`)) return;
              try {
                await Api.documents.delete(btn.dataset.docId);
                showToast('Document deleted.', 'success');
                loadAccountTab(accountId, 'documents');
              } catch (err) {
                showToast('Delete failed: ' + (err.message || err), 'error');
              }
            });
          });
          break;
        }

        case 'assets': {
          const res = await Api.assets.list({ account_id: accountId, limit: 200 });
          const allAcctAssets = (res.data || []);
          await Assets.renderAssetsTab(tabEl, allAcctAssets, {
            addHref: `#/assets/new?account_id=${accountId}`,
            emptyMsg: 'No active assets linked to this account.',
          });
          break;
        }

        case 'claims': {
          const res = await Api.claims.list({ account_id: accountId, limit: 50 });
          const rows = (res.data || []);
          const addBtn = `<div class="tab-toolbar"><a href="#/claims/new?account_id=${accountId}" class="btn btn-sm btn-primary">+ New Claim</a></div>`;
          tabEl.innerHTML = addBtn + (rows.length ? `
            <table class="table">
              <thead><tr><th>Claim Ref</th><th>Type</th><th>Status</th><th>Date</th><th></th></tr></thead>
              <tbody>${rows.map(cl => `
                <tr>
                  <td><a href="#/claims/${cl.id}">${Utils.esc(cl.claim_reference || cl.id)}</a></td>
                  <td>${Utils.esc(cl.claim_type   || '—')}</td>
                  <td><span class="badge badge-status">${Utils.esc(cl.claim_status || '—')}</span></td>
                  <td>${cl.date_of_loss ? Utils.formatDate(cl.date_of_loss) : '—'}</td>
                  <td><a href="#/claims/${cl.id}" class="btn btn-xs btn-outline">View</a></td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No claims linked to this account.</p>`);
          break;
        }

        case 'engagements': {
          const res = await Api.engagements.list({ account_id: accountId, limit: 50 });
          const rows = (res.data || []);
          const addBtn = `<div class="tab-toolbar"><a href="#/engagements/new?account_id=${accountId}" class="btn btn-sm btn-primary">+ New Engagement</a></div>`;
          tabEl.innerHTML = addBtn + (rows.length ? `
            <table class="table">
              <thead><tr><th>Name</th><th>Stage</th><th>Type</th><th>Updated</th><th></th></tr></thead>
              <tbody>${rows.map(e => `
                <tr>
                  <td><a href="#/engagements/${e.id}">${Utils.esc(e.engagement_name || '—')}</a></td>
                  <td><span class="badge badge-stage">${Utils.esc(e.stage || '—')}</span></td>
                  <td>${Utils.esc(e.engagement_type || '—')}</td>
                  <td>${e.updated_at ? Utils.formatDate(e.updated_at) : '—'}</td>
                  <td><a href="#/engagements/${e.id}" class="btn btn-xs btn-outline">View</a></td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No engagements linked to this account.</p>`);
          break;
        }

        case 'reviews': {
          const res = await Api.reviews.list({ account_id: accountId, limit: 50 });
          const rows = (res.data || []);
          const addBtn = `<div class="tab-toolbar"><a href="#/reviews/new?account_id=${accountId}" class="btn btn-sm btn-primary">+ New Review</a></div>`;
          tabEl.innerHTML = addBtn + (rows.length ? `
            <table class="table">
              <thead><tr><th>Review Date</th><th>Type</th><th>Completed</th><th>Notes</th><th></th></tr></thead>
              <tbody>${rows.map(r => `
                <tr>
                  <td>${r.review_date ? Utils.formatDate(r.review_date) : '—'}</td>
                  <td>${Utils.esc(r.review_type || '—')}</td>
                  <td>${r.review_completed ? '<span class="badge badge-success">Yes</span>' : '<span class="badge badge-warning">No</span>'}</td>
                  <td>${Utils.esc(r.notes || '—')}</td>
                  <td><a href="#/reviews/${r.id}" class="btn btn-xs btn-outline">View</a></td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No reviews linked to this account.</p>`);
          break;
        }

        case 'complaints': {
          const res = await Api.complaints.list({ account_id: accountId, limit: 50 });
          const rows = (res.data || []);
          const addBtn = `<div class="tab-toolbar"><a href="#/complaints/new?account_id=${accountId}" class="btn btn-sm btn-primary">+ New Complaint</a></div>`;
          tabEl.innerHTML = addBtn + (rows.length ? `
            <table class="table">
              <thead><tr><th>Complaint #</th><th>Category</th><th>Status</th><th>Date</th><th></th></tr></thead>
              <tbody>${rows.map(c => `
                <tr>
                  <td><a href="#/complaints/${c.id}">${Utils.esc(c.complaint_number || c.id)}</a></td>
                  <td>${Utils.esc(c.complaint_category  || '—')}</td>
                  <td><span class="badge badge-status">${Utils.esc(c.complaint_status || '—')}</span></td>
                  <td>${c.complaint_date ? Utils.formatDate(c.complaint_date) : (c.date_received ? Utils.formatDate(c.date_received) : '—')}</td>
                  <td><a href="#/complaints/${c.id}" class="btn btn-xs btn-outline">View</a></td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No complaints linked to this account.</p>`);
          break;
        }

        case 'advice-records': {
          const res  = await Api.adviceRecords.list({ account_id: accountId, limit: 50 });
          const rows = res.data || [];
          tabEl.innerHTML = rows.length ? `
            <table class="table">
              <thead><tr><th>Reference</th><th>Type</th><th>Date</th><th>Status</th><th>Broker</th><th></th></tr></thead>
              <tbody>${rows.map(ar => `
                <tr>
                  <td><a href="#/advice-records/${ar.id}">${Utils.esc(ar.advice_record_number || ar.roa_reference || ar.id)}</a></td>
                  <td>${Utils.esc(ar.advice_type || '—')}</td>
                  <td>${ar.advice_date ? Utils.formatDate(ar.advice_date) : '—'}</td>
                  <td><span class="badge badge-status">${Utils.esc(ar.status || '—')}</span></td>
                  <td>${Utils.esc(ar.broker_name || '—')}</td>
                  <td><a href="#/advice-records/${ar.id}" class="btn btn-xs btn-outline">View</a></td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No advice records linked to this account.</p>`;
          break;
        }

        case 'sections': {
          const assetRes = await Api.assets.list({ account_id: accountId, limit: 500 }).catch(() => ({ data: [] }));
          const _allAcctSecAssets = assetRes.data || assetRes || [];
          const _ACCT_SEC_INACTIVE = ['Sold', 'Decommissioned', 'Inactive', 'Cancelled'];
          const allAssets = _allAcctSecAssets.filter(a => !_ACCT_SEC_INACTIVE.includes(a.asset_status));
          const sectionMap = new Map();
          allAssets.forEach(a => {
            const key = a.asset_section || '';
            if (!sectionMap.has(key)) sectionMap.set(key, []);
            sectionMap.get(key).push(a);
          });
          const sectionKeys = [...sectionMap.keys()].sort((a, b) => {
            if (!a && b) return 1;
            if (a && !b) return -1;
            return a.localeCompare(b);
          });
          const fmtCur = (v) => v != null && Number(v) !== 0 ? 'R ' + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2 }) : '—';
          const grandVal  = allAssets.reduce((s, a) => s + (Number(a.asset_value) || 0), 0);
          const grandPrem = allAssets.reduce((s, a) => s + (Number(a.premium)     || 0), 0);
          const grandSas  = allAssets.reduce((s, a) => s + (Number(a.sasria)      || 0), 0);
          tabEl.innerHTML = sectionKeys.length ? `
            <div style="padding:.5rem .25rem .75rem;display:flex;gap:1.5rem;flex-wrap:wrap;">
              <span style="font-size:.85rem;color:var(--text-muted);"><strong>${sectionKeys.length}</strong> section${sectionKeys.length !== 1 ? 's' : ''} (${allAssets.length} asset${allAssets.length !== 1 ? 's' : ''})</span>
              <span style="font-size:.85rem;color:var(--text-muted);">Total Value: <strong>${fmtCur(grandVal)}</strong></span>
              <span style="font-size:.85rem;color:var(--text-muted);">Total Premium: <strong>${fmtCur(grandPrem)}</strong></span>
              ${grandSas ? `<span style="font-size:.85rem;color:var(--text-muted);">SASRIA: <strong>${fmtCur(grandSas)}</strong></span>` : ''}
            </div>
            <div class="table-responsive"><table class="table">
              <thead><tr>
                <th>Section</th><th>Policy</th>
                <th style="text-align:right;">Assets</th>
                <th style="text-align:right;">Total Value</th>
                <th style="text-align:right;">Total Premium</th>
                <th style="text-align:right;">SASRIA</th>
              </tr></thead>
              <tbody>${sectionKeys.map(key => {
                const items = sectionMap.get(key);
                const secVal  = items.reduce((s, a) => s + (Number(a.asset_value) || 0), 0);
                const secPrem = items.reduce((s, a) => s + (Number(a.premium)     || 0), 0);
                const secSas  = items.reduce((s, a) => s + (Number(a.sasria)      || 0), 0);
                const policyNames = [...new Set(items.map(a => a.policy_name || a.policy_number || '').filter(Boolean))].join(', ');
                return `<tr>
                  <td style="font-weight:500;">${Utils.esc(key || 'Uncategorised')}</td>
                  <td style="font-size:.8rem;">${Utils.esc(policyNames || '—')}</td>
                  <td style="text-align:right;">${items.length}</td>
                  <td style="text-align:right;font-variant-numeric:tabular-nums;">${fmtCur(secVal)}</td>
                  <td style="text-align:right;font-variant-numeric:tabular-nums;">${fmtCur(secPrem)}</td>
                  <td style="text-align:right;font-variant-numeric:tabular-nums;">${secSas ? fmtCur(secSas) : '—'}</td>
                </tr>`;
              }).join('')}</tbody>
            </table></div>`
          : `<p class="tab-empty">No policy sections found for this account. Assets need an "Asset Section" value to appear here.</p>`;
          break;
        }

        case 'timeline': {
          const entries = await Api.timeline.forAccount(accountId);
          const rows = Array.isArray(entries) ? entries : (entries.data || []);
          tabEl.innerHTML = `
            <div style="padding:.75rem 1rem;">
              ${renderTimeline(rows, 'No activity recorded for this account yet.')}
            </div>`;
          break;
        }

        default:
          tabEl.innerHTML = '';
      }
    } catch (err) {
      tabEl.innerHTML = `<p class="tab-empty text-danger">Failed to load tab: ${Utils.esc(err.message || String(err))}</p>`;
    }
  }

  // ── Email Modal ──────────────────────────────────────────────────────────
  async function _openMailModal(id) {
    let account = null;
    let contact = null;
    let email = '';
    let name = '';
    let policies = [];
    try {
      account = await Api.accounts.get(id);
      name = account.account_name || '';
      if (account.main_contact_id) {
        try {
          contact = await Api.contacts.get(account.main_contact_id);
          email = contact.email || '';
        } catch (_) {}
      }
    } catch (_) {}
    try {
      const pRes = await Api.policies.list({ account_id: id, limit: 100 });
      policies = pRes.data || pRes || [];
    } catch (_) {}

    let templates = [];
    try { templates = await Api.settings.listTemplates(); } catch (_) {}

    let claimForms = [];
    try { claimForms = await Api.settings.claimForms(); } catch (_) {}

    // Load advice records for attachments
    let adviceRecords = [];
    try {
      const arRes = await Api.adviceRecords.list({ account_id: id, limit: 100 });
      adviceRecords = arRes.data || arRes || [];
    } catch (_) {}

    const modal = document.createElement('div');
    modal.id = 'mail-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="width:560px;max-height:90vh;display:flex;flex-direction:column;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>Send Email — ${Utils.esc(name)}</h3>
          <button class="btn-close" onclick="document.getElementById('mail-modal').remove()">×</button>
        </div>
        <div class="modal-body" style="overflow-y:auto;">
          <div id="mail-error" style="display:none;color:var(--danger);margin-bottom:.75rem;"></div>
          <div class="form-group">
            <label class="form-label">To</label>
            <input class="form-control" id="mail-to" value="${Utils.esc(email)}" placeholder="recipient@email.com">
          </div>
          <div class="form-group">
            <label class="form-label">Template</label>
            <select class="form-control" id="mail-template" onchange="Accounts._applyMailTemplate(this.value)">
              <option value="">— No Template —</option>
              ${templates.map(t => `<option value="${Utils.esc(t.key)}">${Utils.esc(t.label)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Subject</label>
            <input class="form-control" id="mail-subject" placeholder="Email subject...">
          </div>
          <div class="form-group">
            <label class="form-label">Body</label>
            <textarea class="form-control" id="mail-body" rows="8" placeholder="Email body..."></textarea>
          </div>

          <!-- Attachments -->
          <div class="form-group" style="border-top:1px solid var(--border-color,#dee2e6);padding-top:.75rem;margin-top:.5rem;">
            <label class="form-label">Attachments</label>

            <!-- Add from library (covers Policy Schedule, ROAs, claim forms,
                 plus every uploaded doc) OR upload a fresh file from disk. -->
            <div style="display:flex;gap:.4rem;flex-wrap:wrap;">
              <button type="button" class="btn btn-secondary btn-sm" id="mail-attach-library-btn">+ Add Attachment</button>
              <button type="button" class="btn btn-secondary btn-sm" id="mail-attach-file-btn">+ Upload from Computer</button>
              <input type="file" id="mail-attach-file-input" multiple style="display:none;" />
            </div>

            <!-- Attached files list -->
            <div id="mail-attachment-list" style="margin-top:.5rem;display:flex;flex-direction:column;gap:.25rem;"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('mail-modal').remove()">Cancel</button>
          <button class="btn btn-primary" id="mail-send-btn" onclick="Accounts._sendMail()">Send Email</button>
        </div>
      </div>`;
    /* backdrop-close disabled */
    document.body.appendChild(modal);

    const contactName = contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : '';
    modal._templates = templates;
    modal._accountId = id;
    modal._placeholders = {
      client_name: contactName || name,
      first_name: contact?.first_name || '',
      last_name: contact?.last_name || '',
      email: email,
      mobile: contact?.mobile || '',
      phone: contact?.phone || '',
      id_number: contact?.sa_id_number || '',
      account_name: name,
      registration_number: account?.registration_number || '',
      vat_number: account?.vat_number || '',
      account_type: account?.account_type || '',
      broker_name: window.currentUser?.full_name || '',
      policy_number: policies.length ? policies.map(p => p.policy_number).filter(Boolean).join(', ') : '',
      policy_name: policies.length ? policies.map(p => p.policy_name).filter(Boolean).join(', ') : '',
      today: new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' }),
    };
    modal._userAttachments = [];
    modal._libraryDocs = []; // [{ id, filename, group, type, value }]

    // Context the library picker needs to inject synthetic entries.
    modal._parentModule  = 'accounts';
    modal._claimForms    = claimForms || [];
    modal._policies      = policies   || [];
    modal._adviceRecords = adviceRecords || [];

    _wireMailAttachments(modal);
  }

  function _wireMailAttachments(modal) {
    const listEl = modal.querySelector('#mail-attachment-list');
    const renderList = () => {
      if (!listEl) return;
      const rows = [];
      (modal._libraryDocs || []).forEach((d, i) => {
        const icon = d.type && d.type !== 'doc' ? '🧾' : '📁';
        rows.push(`<div style="display:flex;align-items:center;gap:.5rem;font-size:.85rem;padding:.25rem .5rem;background:var(--bg-alt,#f4f5f7);border-radius:4px;">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;">${icon} ${Utils.esc(d.filename)}${d.group ? ` <span style="color:var(--text-muted);font-size:.78rem;">(${Utils.esc(d.group)})</span>` : ''}</span>
          <button type="button" class="btn btn-sm btn-danger" data-remove-lib="${i}" style="padding:0 .4rem;">✕</button>
        </div>`);
      });
      (modal._userAttachments || []).forEach((f, i) => {
        rows.push(`<div style="display:flex;align-items:center;gap:.5rem;font-size:.85rem;padding:.25rem .5rem;background:var(--bg-alt,#f4f5f7);border-radius:4px;">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;">📎 ${Utils.esc(f.filename)}</span>
          <button type="button" class="btn btn-sm btn-danger" data-remove-file="${i}" style="padding:0 .4rem;">✕</button>
        </div>`);
      });
      listEl.innerHTML = rows.join('');
    };

    const libBtn = modal.querySelector('#mail-attach-library-btn');
    if (libBtn) {
      libBtn.addEventListener('click', async () => {
        await _openAttachmentLibrary({
          parentModule:  modal._parentModule || 'accounts',
          parentId:      modal._accountId,
          claimForms:    modal._claimForms || [],
          policies:      modal._policies || [],
          adviceRecords: modal._adviceRecords || [],
        }, modal._libraryDocs, (picked) => {
          modal._libraryDocs = picked;
          renderList();
        });
      });
    }

    const fileBtn = modal.querySelector('#mail-attach-file-btn');
    const fileInput = modal.querySelector('#mail-attach-file-input');
    if (fileBtn && fileInput) {
      fileBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const files = Array.from(fileInput.files || []);
        for (const file of files) {
          const b64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const res = String(reader.result || '');
              const commaIdx = res.indexOf(',');
              resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          });
          modal._userAttachments.push({
            filename: file.name,
            content_base64: b64,
            content_type: file.type || 'application/octet-stream',
          });
        }
        fileInput.value = '';
        renderList();
      });
    }

    if (listEl) {
      listEl.addEventListener('click', (e) => {
        const rl = e.target.closest('[data-remove-lib]');
        const rf = e.target.closest('[data-remove-file]');
        if (rl) {
          const i = parseInt(rl.dataset.removeLib, 10);
          modal._libraryDocs.splice(i, 1);
          renderList();
        } else if (rf) {
          const i = parseInt(rf.dataset.removeFile, 10);
          modal._userAttachments.splice(i, 1);
          renderList();
        }
      });
    }
  }

  /**
   * Open the document-library picker — same UX as the contacts picker.
   * Lists every real document related to this account, grouped by source.
   * Synthetic entries are merged in for claim-form templates, the Policy
   * Schedule PDF generator, and ROA generators (one per advice record).
   * Each picked item is returned with a `type` so _sendMail routes it to the
   * correct field on the email payload.
   */
  async function _openAttachmentLibrary(opts, alreadyPicked, onApply) {
    const { parentModule, parentId } = opts;
    const claimForms    = opts.claimForms    || [];
    const policiesCtx   = opts.policies      || [];
    const adviceRecords = opts.adviceRecords || [];

    if (!parentId) {
      showToast('Save this record before attaching documents.', 'warning');
      return;
    }

    const existing = document.getElementById('mail-attach-library-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'mail-attach-library-modal';
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
      <div class="modal" style="width:640px;max-width:95vw;max-height:85vh;display:flex;flex-direction:column;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title">Add From Document Library</h3>
          <button class="modal-close" id="lib-close">×</button>
        </div>
        <div class="modal-body" style="overflow:auto;flex:1;">
          <div style="margin-bottom:.75rem;">
            <input type="search" id="lib-search" class="form-control" placeholder="Search filename or description…" style="font-size:.9rem;" />
          </div>
          <div id="lib-content">
            <div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>
          </div>
        </div>
        <div class="modal-footer" style="justify-content:space-between;">
          <span id="lib-selected-count" style="font-size:.85rem;color:var(--text-muted);">0 selected</span>
          <div style="display:flex;gap:.5rem;">
            <button class="btn btn-secondary" id="lib-cancel">Cancel</button>
            <button class="btn btn-primary" id="lib-apply" disabled>Add Selected</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#lib-close').addEventListener('click', close);
    overlay.querySelector('#lib-cancel').addEventListener('click', close);

    // Fetch real documents AND advice records in parallel so the picker is
    // authoritative regardless of what the email modal preloaded.
    let res;
    let liveAdviceRecords = adviceRecords;
    try {
      const arQuery = parentModule === 'accounts' ? { account_id: parentId } : { contact_id: parentId };
      const [docsRes, arRes] = await Promise.all([
        Api.documents.related(parentModule, parentId),
        Api.adviceRecords.list({ ...arQuery, limit: 100 }).catch(() => null),
      ]);
      res = docsRes;
      if (arRes) {
        const list = arRes.data || arRes || [];
        if (Array.isArray(list) && list.length) liveAdviceRecords = list;
      }
    } catch (err) {
      overlay.querySelector('#lib-content').innerHTML =
        `<div class="alert alert-danger">Failed to load related documents: ${Utils.esc(err.message || err)}</div>`;
      return;
    }

    // ── Canonical group order ───────────────────────────────────────────────
    // Always show every standard group so users see the full categorisation
    // even when a group is empty.
    const directLabel = parentModule === 'contacts' ? 'Contact Documents' : 'Account Documents';
    const STANDARD_LABELS = [directLabel, 'Policies', 'Claims', 'Engagements', 'Complaints', 'Reviews', 'Assets'];
    const groupMap = new Map();
    STANDARD_LABELS.forEach(label => groupMap.set(label, { label, count: 0, docs: [] }));
    (res.groups || []).forEach(g => {
      const existing = groupMap.get(g.label);
      if (existing) {
        existing.docs = (g.docs || []).slice();
        existing.count = existing.docs.length;
      } else {
        groupMap.set(g.label, g);
      }
    });

    // ── Inject synthetic entries ────────────────────────────────────────────
    if (claimForms.length) {
      const g = groupMap.get('Claims');
      claimForms.forEach(f => g.docs.push({
        id:            'claim-form:' + f.filename,
        original_name: f.label || f.filename,
        description:   'Default claim-form template',
        file_type:     'application/pdf',
        synthetic_type: 'claim_form',
        synthetic_value: f.filename,
      }));
      g.count = g.docs.length;
    }

    // Policy Schedule synthetic — always offered.
    {
      const g = groupMap.get('Policies');
      const policyCount = policiesCtx.length;
      g.docs.unshift({
        id:            'policy-schedule:' + parentId,
        original_name: 'Policy Schedule (generated PDF)',
        description:   policyCount
          ? `Live schedule for all ${policyCount} polic${policyCount === 1 ? 'y' : 'ies'}`
          : 'Generated from current policy data',
        file_type:     'application/pdf',
        synthetic_type: parentModule === 'accounts' ? 'schedule_account' : 'schedule_contact',
        synthetic_value: parentId,
      });
      g.count = g.docs.length;
    }

    if (liveAdviceRecords && liveAdviceRecords.length) {
      const g = groupMap.get('Engagements');
      liveAdviceRecords.forEach(ar => g.docs.push({
        id:            'roa:' + ar.id,
        original_name: `Record of Advice — ${ar.advice_record_number || 'ROA-' + ar.id}`,
        description:   [ar.advice_type, ar.advice_date ? formatDate(ar.advice_date) : ''].filter(Boolean).join(' · '),
        file_type:     'application/pdf',
        synthetic_type: 'roa',
        synthetic_value: ar.id,
      }));
      g.count = g.docs.length;
    }

    const groups = Array.from(groupMap.values());

    const preselectedIds = new Set((alreadyPicked || []).map(d => String(d.id)));

    const renderGroups = (filterTerm) => {
      const term = (filterTerm || '').trim().toLowerCase();
      const html = groups.map(g => {
        const visibleDocs = term
          ? (g.docs || []).filter(d =>
              (d.original_name || '').toLowerCase().includes(term) ||
              (d.description || '').toLowerCase().includes(term))
          : (g.docs || []);

        // Keep empty categories visible by default; suppress them during
        // searches so the result set stays tight.
        if (!visibleDocs.length && term) return '';

        const hasSelectAll = visibleDocs.length > 0;
        const rows = visibleDocs.length
          ? visibleDocs.map(d => {
              const sizeKb = d.file_size ? Math.round(d.file_size / 1024) + ' KB' : '';
              const uploaded = d.uploaded_at ? formatDate(d.uploaded_at) : '';
              const checked = preselectedIds.has(String(d.id)) ? 'checked' : '';
              const isSynth = !!d.synthetic_type;
              const icon = isSynth ? '🧾' : '📁';
              const type = isSynth ? d.synthetic_type : 'doc';
              const value = isSynth ? d.synthetic_value : d.id;
              const viewLink = !isSynth && d.view_url
                ? `<a href="${Utils.esc(d.view_url)}" target="_blank" rel="noopener" title="View" style="font-size:.85rem;text-decoration:none;" onclick="event.stopPropagation()">👁</a>`
                : '';
              return `
                <label class="lib-row" style="display:flex;align-items:center;gap:.5rem;padding:.35rem .5rem;border-bottom:1px solid var(--border-color,#eee);cursor:pointer;">
                  <input type="checkbox" class="lib-doc-cb" value="${Utils.esc(String(d.id))}"
                    data-name="${Utils.esc(d.original_name || d.file_name || '')}"
                    data-group="${Utils.esc(g.label)}"
                    data-type="${Utils.esc(type)}"
                    data-value="${Utils.esc(String(value))}"
                    ${checked} />
                  <span style="flex:1;font-size:.85rem;line-height:1.3;">
                    <span style="color:var(--text);">${icon} ${Utils.esc(d.original_name || d.file_name || '—')}</span>
                    ${d.description ? `<br><span style="color:var(--text-muted);font-size:.78rem;">${Utils.esc(d.description)}</span>` : ''}
                  </span>
                  <span style="font-size:.75rem;color:var(--text-muted);text-align:right;white-space:nowrap;">
                    ${sizeKb}${sizeKb && uploaded ? ' · ' : ''}${uploaded}
                  </span>
                  ${viewLink}
                </label>`;
            }).join('')
          : `<div style="padding:.5rem .75rem;font-size:.82rem;color:var(--text-muted);font-style:italic;">No documents in this category yet.</div>`;

        return `
          <details ${visibleDocs.length ? 'open' : ''} style="margin-bottom:.75rem;border:1px solid var(--border-color,#dee2e6);border-radius:6px;background:var(--card-bg,#fff);">
            <summary style="padding:.5rem .75rem;cursor:pointer;font-weight:600;font-size:.88rem;display:flex;justify-content:space-between;align-items:center;">
              <span>${Utils.esc(g.label)} <span style="color:var(--text-muted);font-weight:400;">(${visibleDocs.length}${term && visibleDocs.length !== (g.docs || []).length ? '/' + (g.docs || []).length : ''})</span></span>
              ${hasSelectAll ? `<button type="button" class="btn btn-sm btn-link lib-group-toggle" data-group-label="${Utils.esc(g.label)}" style="font-size:.78rem;padding:0;">Select all</button>` : ''}
            </summary>
            <div>${rows}</div>
          </details>`;
      }).join('') || `<p style="color:var(--text-muted);font-size:.9rem;padding:.5rem 0;">No documents match your search.</p>`;

      overlay.querySelector('#lib-content').innerHTML = html;

      overlay.querySelectorAll('.lib-group-toggle').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const det = btn.closest('details');
          if (!det) return;
          const cbs = det.querySelectorAll('.lib-doc-cb');
          const anyUnchecked = Array.from(cbs).some(cb => !cb.checked);
          cbs.forEach(cb => { cb.checked = anyUnchecked; });
          btn.textContent = anyUnchecked ? 'Deselect all' : 'Select all';
          updateCount();
        });
      });

      overlay.querySelectorAll('.lib-doc-cb').forEach(cb => {
        cb.addEventListener('change', updateCount);
      });
      updateCount();
    };

    const updateCount = () => {
      const n = overlay.querySelectorAll('.lib-doc-cb:checked').length;
      const countEl = overlay.querySelector('#lib-selected-count');
      if (countEl) countEl.textContent = `${n} selected`;
      const applyBtn = overlay.querySelector('#lib-apply');
      if (applyBtn) applyBtn.disabled = n === 0;
    };

    renderGroups('');

    const searchEl = overlay.querySelector('#lib-search');
    if (searchEl) {
      let t;
      searchEl.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => renderGroups(searchEl.value), 200);
      });
    }

    overlay.querySelector('#lib-apply').addEventListener('click', () => {
      const picked = [];
      overlay.querySelectorAll('.lib-doc-cb:checked').forEach(cb => {
        picked.push({
          id:       cb.value,
          filename: cb.dataset.name || `Document ${cb.value}`,
          group:    cb.dataset.group || '',
          type:     cb.dataset.type  || 'doc',
          value:    cb.dataset.value || cb.value,
        });
      });
      onApply(picked);
      close();
    });
  }

  function _replacePlaceholders(text, placeholders) {
    if (!text) return '';
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return placeholders[key] !== undefined ? placeholders[key] : match;
    });
  }

  async function _applyMailTemplate(key) {
    if (!key) return;
    const modal = document.getElementById('mail-modal');
    const templates = modal?._templates || [];
    const ph = modal?._placeholders || {};
    const tpl = templates.find(t => t.key === key);
    if (!tpl) return;
    const subjectEl = document.getElementById('mail-subject');
    const bodyEl = document.getElementById('mail-body');
    if (subjectEl && tpl.subject) subjectEl.value = _replacePlaceholders(tpl.subject, ph);
    if (bodyEl && tpl.body) bodyEl.value = _replacePlaceholders(tpl.body, ph);
  }

  async function _sendMail() {
    const to = document.getElementById('mail-to')?.value?.trim();
    const subject = document.getElementById('mail-subject')?.value?.trim();
    const body = document.getElementById('mail-body')?.value?.trim();
    const errEl = document.getElementById('mail-error');
    const sendBtn = document.getElementById('mail-send-btn');
    const modal = document.getElementById('mail-modal');

    if (!to || !subject || !body) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'To, Subject and Body are required.'; }
      return;
    }

    const payload = { to, subject, html: body, text: body, audit_module: 'accounts', audit_record_id: modal?._accountId };

    if (modal?._userAttachments?.length) payload.user_attachments = modal._userAttachments;

    // Library picks now cover docs, claim-form templates, the Policy Schedule
    // generator, and ROA generators — route each by `type`.
    const docIds = [];
    const roaIds = [];
    const claimFormNames = [];
    (modal?._libraryDocs || []).forEach(d => {
      switch (d.type) {
        case 'doc':              docIds.push(parseInt(d.value, 10)); break;
        case 'roa':              roaIds.push(parseInt(d.value, 10)); break;
        case 'schedule_contact': payload.schedule_contact_id = parseInt(d.value, 10); break;
        case 'schedule_account': payload.schedule_account_id = parseInt(d.value, 10); break;
        case 'claim_form':       claimFormNames.push(String(d.value)); break;
        default:                 docIds.push(parseInt(d.value, 10));
      }
    });
    if (docIds.length)         payload.document_ids     = docIds;
    if (roaIds.length)         payload.roa_ids          = roaIds;
    if (claimFormNames.length) payload.claim_form_names = claimFormNames;

    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending...'; }
    try {
      await Api.settings.sendEmail(payload);
      document.getElementById('mail-modal')?.remove();
      showToast('Email sent successfully', 'success');
    } catch (e) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = e.message; }
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send Email'; }
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────
  return { list, form, detail, _openMailModal, _applyMailTemplate, _sendMail };

})();
