/* ═══════════════════════════════════════════════════════════════════════════
   Policies component  —  Insurance Policies (spec section 8)
   ═══════════════════════════════════════════════════════════════════════════ */

const Policies = (() => {

  // ── Centred modal helpers (matches claims pattern) ────────────────────────
  function _openModal(title, bodyHtml, footerHtml) {
    const modal    = document.getElementById('global-modal');
    const titleEl  = document.getElementById('global-modal-title');
    const bodyEl   = document.getElementById('global-modal-body');
    const footerEl = document.getElementById('global-modal-footer');
    if (!modal || !titleEl || !bodyEl) return;
    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHtml;
    if (footerEl) footerEl.innerHTML = (footerHtml || '') + ` <button class="btn btn-secondary" onclick="document.getElementById('global-modal').style.display='none'">Close</button>`;
    modal.style.display = 'flex';
    const closeBtn = document.getElementById('global-modal-close');
    if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; };
    /* backdrop-close disabled */
  }
  function _closeModal() {
    const modal = document.getElementById('global-modal');
    if (modal) modal.style.display = 'none';
  }

  // ── Constants ────────────────────────────────────────────────────────────

  const POLICY_STATUSES = ['Pending', 'Active', 'Amended', 'Cancelled', 'Lapsed', 'Expired'];

  const PRODUCT_CATEGORIES = [
    'Personal Lines',
    'Commercial Lines',
    'Agri',
    'Transport',
    'Engineering',
    'Marine',
    'Liability',
    'Motor Fleet',
    'Other',
  ];

  const POLICY_TYPES = ['Personal', 'Commercial', 'Agri', 'Transport', 'Mixed'];

  const CANCELLATION_REASONS = ['Client Request', 'Non-Payment', 'Replaced', 'Risk Unacceptable', 'Other'];

  // Comprehensive section type picklist – matches ASSET_SECTION_TYPES in assets.js
  const SECTION_TYPES = [
    // Motor
    'Motor',
    'Motor \u2013 Light motor vehicle',
    'Motor \u2013 Heavy motor vehicle',
    'Motor \u2013 Commercial vehicle',
    'Motor \u2013 Fleet',
    'Motor \u2013 Motorcycles',
    'Motor \u2013 Trailers / caravans',
    'Motor \u2013 Agricultural vehicles',
    'Motor \u2013 Plant / mobile machinery',
    // Property
    'Property',
    'Property \u2013 Buildings',
    'Property \u2013 Household contents',
    'Property \u2013 Office contents',
    'Property \u2013 Business contents',
    'Property \u2013 Stock',
    'Property \u2013 Portable possessions / all risks',
    'Property \u2013 Theft',
    'Property \u2013 Money',
    'Property \u2013 Glass',
    'Property \u2013 Business interruption / loss of income',
    // Agriculture
    'Agriculture',
    'Agriculture \u2013 Crops',
    'Agriculture \u2013 Livestock',
    'Agriculture \u2013 Farm buildings',
    'Agriculture \u2013 Farm contents',
    'Agriculture \u2013 Farm vehicles',
    'Agriculture \u2013 Farm machinery / implements',
    'Agriculture \u2013 Game',
    'Agriculture \u2013 Guesthouse / agritourism risks',
    'Agriculture \u2013 Produce in storage',
    'Agriculture \u2013 Produce in transit',
    // Engineering
    'Engineering',
    'Engineering \u2013 Contractors all risks',
    'Engineering \u2013 Erection all risks',
    'Engineering \u2013 Plant all risks',
    'Engineering \u2013 Machinery breakdown',
    'Engineering \u2013 Electronic equipment',
    'Engineering \u2013 Deterioration of stock',
    'Engineering \u2013 Boilers / pressure vessels',
    'Engineering \u2013 Civil engineering completed risks',
    // Marine / Transport
    'Marine \u2013 Goods in transit',
    'Marine \u2013 Marine cargo',
    'Marine \u2013 Hauliers liability',
    'Marine \u2013 Hull',
    'Transport \u2013 Goods in transit',
    'Transport \u2013 Carrier / transporter risks',
    'Transport \u2013 Courier / logistics risks',
    'Rail',
    // Liability
    'Liability',
    'Liability \u2013 Public liability',
    'Liability \u2013 Products liability',
    'Liability \u2013 Employers liability',
    'Liability \u2013 Professional indemnity',
    'Liability \u2013 Directors and officers',
    'Liability \u2013 Cyber liability',
    'Liability \u2013 Environmental liability',
    'Liability \u2013 Motor liability',
    'Liability \u2013 Transport liability',
    'Liability \u2013 Engineering liability',
    'Liability \u2013 Personal liability',
    // Accident and Health
    'Personal accident',
    'Group personal accident',
    'Disability / income protection style accident cover',
    'Medical top-up / emergency event cover',
    // Travel
    'Travel \u2013 Personal',
    'Travel \u2013 Business',
    'Travel \u2013 Group',
    'Travel \u2013 Local',
    'Travel \u2013 International',
    // Consumer Credit / Guarantee
    'Credit shortfall',
    'Trade credit',
    'Consumer credit',
    'Guarantees',
    'Fidelity guarantee',
    // Miscellaneous / Specialist
    'Sasria',
    'Fidelity insurance',
    'Business all risks',
    'Accidental damage',
    'Loss of documents',
    'Event cancellation',
    'Kidnap and ransom',
    'Prize indemnity',
    'Pet insurance',
    'Motor mechanical warranty',
    // Aviation
    'Aircraft hull',
    'Aircraft liability',
    'Passenger liability',
    'Aviation ground risks',
  ];

  // Module-level state: pending assets (held in memory until policy is saved)
  let _pendingAssets        = [];
  let _pendingAssetNextId   = 0;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function statusBadgeHtml(status) {
    const safe = esc(status || '—');
    const slug = (status || '').toLowerCase().replace(/\s+/g, '-');
    return `<span class="badge badge-status badge-status--${slug}">${safe}</span>`;
  }

  function selectOpts(items, selected, emptyLabel = '— Select —') {
    return [`<option value="">${emptyLabel}</option>`,
      ...items.map(i => `<option value="${esc(i)}" ${selected === i ? 'selected' : ''}>${esc(i)}</option>`)
    ].join('');
  }

  function userOptions(users, selectedId) {
    return [{ id: '', display_name: '— Select —' }, ...users].map(u =>
      `<option value="${esc(u.id)}" ${String(u.id) === String(selectedId) ? 'selected' : ''}>${esc(u.full_name || u.username || '')}</option>`
    ).join('');
  }

  function contactOptions(contacts, selectedId) {
    return [{ id: '', full_name: '— None —' }, ...contacts].map(c =>
      `<option value="${esc(c.id)}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${esc([c.first_name, c.last_name].filter(Boolean).join(' ') || c.full_name || '')}</option>`
    ).join('');
  }

  function accountOptions(accounts, selectedId) {
    return [{ id: '', account_name: '— None —' }, ...accounts].map(a =>
      `<option value="${esc(a.id)}" ${String(a.id) === String(selectedId) ? 'selected' : ''}>${esc(a.account_name || a.name || '')}</option>`
    ).join('');
  }

  function engagementOptions(engagements, selectedId) {
    return [{ id: '', engagement_name: '— None —' }, ...engagements].map(e =>
      `<option value="${esc(e.id)}" ${String(e.id) === String(selectedId) ? 'selected' : ''}>${esc(e.engagement_name || '')}</option>`
    ).join('');
  }

  function policyOptions(policies, selectedId, emptyLabel = '— None —') {
    return [{ id: '', policy_name: emptyLabel }, ...policies].map(p =>
      `<option value="${esc(p.id)}" ${String(p.id) === String(selectedId) ? 'selected' : ''}>${esc(p.policy_name || '')}</option>`
    ).join('');
  }

  function getFiltersFromHash() {
    const hash = window.location.hash || '';
    const qIdx = hash.indexOf('?');
    if (qIdx === -1) return {};
    const params = new URLSearchParams(hash.slice(qIdx));
    const result = {};
    params.forEach((v, k) => { result[k] = v; });
    return result;
  }

  function serializeForm(formEl) {
    const fd = new FormData(formEl);
    const data = {};
    formEl.querySelectorAll('input[type="checkbox"]').forEach(cb => { data[cb.name] = 0; });
    for (const [key, val] of fd.entries()) {
      const input = formEl.querySelector(`[name="${key}"]`);
      if (input && input.type === 'checkbox') {
        data[key] = 1;
      } else {
        data[key] = sanitiseInput(val);
      }
    }
    return data;
  }

  // ── List ─────────────────────────────────────────────────────────────────

  // ── Cell renderers for the catalog ───────────────────────────────────────
  const POL_CELLS = {
    policy_name:      p => `<a href="#/policies/${p.id}">${esc(p.policy_name || '—')}</a>`,
    policy_number:    p => esc(p.policy_number || '—'),
    insurer:          p => esc(p.insurer || '—'),
    product_category: p => esc(p.product_category || '—'),
    policy_type:      p => esc(p.policy_type || '—'),
    policy_status:    p => statusBadgeHtml(p.policy_status),
    inception_date:   p => p.inception_date ? formatDate(p.inception_date) : '—',
    renewal_date:     p => p.renewal_date ? formatDate(p.renewal_date) : '—',
    premium:          p => (p.total_premium != null ? formatCurrency(p.total_premium) : (p.premium != null ? formatCurrency(p.premium) : '—')),
    party_name:       p => esc(p.contact_name || p.account_name || '—'),
    broker_name:      p => esc(p.broker_name || '—'),
    claims_count:     p => p.claims_count != null ? String(p.claims_count) : '0',
    last_review_date: p => p.last_review_date ? formatDate(p.last_review_date) : '—',
    next_review_date: p => p.next_review_date ? formatDate(p.next_review_date) : '—',
    created_at:       p => p.created_at ? formatDate(p.created_at) : '—',
    updated_at:       p => p.updated_at ? formatDate(p.updated_at) : '—',
    actions:          p => `
      <a href="#/policies/${p.id}" class="btn btn-sm btn-secondary">View</a>
      <a href="#/policies/${p.id}/edit" class="btn btn-sm btn-primary">Edit</a>
      <button class="btn btn-sm btn-danger" data-delete-id="${p.id}" data-delete-name="${esc(p.policy_name || '')}">Delete</button>`,
  };

  let _polCatalog = null;
  let _polConfig  = null;

  async function list() {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    setPageTitle('Policies');
    setBreadcrumb(['Policies']);

    const ctrlStyle = 'height:28px;padding:.15rem .4rem;font-size:.78rem;line-height:1;';
    const headerActions = document.getElementById('header-actions');
    if (headerActions) {
      headerActions.innerHTML = `<a href="#/policies/new" class="btn btn-primary" style="${ctrlStyle}">+ New Policy</a>`;
    }

    const filters = getFiltersFromHash();

    try {
      const prefs = await ViewPrefs.load('policies');
      _polCatalog = prefs.catalog;
      _polConfig  = prefs.config;

      const listParams = {
        ...filters,
        limit: 200,
        sort: _polConfig.sortBy,
        dir:  _polConfig.sortDir,
      };

      const [polRes, usersRes] = await Promise.all([
        Api.policies.list(listParams),
        Api.admin.users(),
      ]);

      const policies = polRes.data || polRes || [];
      const users    = usersRes.data || usersRes || [];

      const statusFilter   = filters.status       || '';
      const typeFilter     = filters.type         || '';
      const brokerFilter   = filters.broker_id    || '';
      const searchFilter   = filters.q            || '';

      const visibleCols = ViewPrefs.visibleColumns(_polCatalog, _polConfig);
      const colCount = visibleCols.length || 1;

      const headCells = visibleCols.map(col => {
        const active = _polConfig.sortBy === col.id;
        const arrow  = active ? (_polConfig.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
        const classes = col.sortable
          ? `class="sortable${active ? ' sort-active' : ''}" data-sort="${col.id}" style="cursor:pointer;"`
          : 'class="not-sortable"';
        return `<th ${classes}>${esc(col.label)}${arrow}</th>`;
      }).join('');

      el.innerHTML = `
        <div class="list-page">

          <!-- Table -->
          <div class="card">
            <div class="table-responsive">
              <table class="table">
                <thead><tr id="pol-thead-row">${headCells}</tr></thead>
                <tbody id="pol-tbody">
                  <tr><td colspan="${colCount}" class="table-empty">Loading…</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      document.getElementById('policies-center-filters')?.remove();
      const topHeader = document.getElementById('top-header');
      if (topHeader) {
        topHeader.style.position = 'relative';
        const wrap = document.createElement('div');
        wrap.id = 'policies-center-filters';
        wrap.setAttribute('data-header-widget', '1');
        wrap.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;gap:.5rem;align-items:center;z-index:2;background:var(--bg);padding:.3rem .55rem;border-radius:6px;';
        wrap.innerHTML = `
          <input type="search" id="pol-search" class="form-control" placeholder="Search…"
            value="${esc(searchFilter)}"
            style="${ctrlStyle}width:160px;">
          <select id="pol-filter-status" class="form-control" style="${ctrlStyle}max-width:140px;">
            <option value="">Status</option>
            ${POLICY_STATUSES.map(s => `<option value="${esc(s)}" ${statusFilter === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
          </select>
          <select id="pol-filter-type" class="form-control" style="${ctrlStyle}max-width:140px;">
            <option value="">Type</option>
            ${POLICY_TYPES.map(t => `<option value="${esc(t)}" ${typeFilter === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
          </select>
          <select id="pol-filter-broker" class="form-control" style="${ctrlStyle}max-width:140px;">
            <option value="">Broker</option>
            ${users.map(u => `<option value="${esc(u.id)}" ${String(brokerFilter) === String(u.id) ? 'selected' : ''}>${esc(u.full_name || u.username)}</option>`).join('')}
          </select>
          <button id="pol-filter-clear" class="btn btn-secondary" style="${ctrlStyle}">Clear</button>`;
        topHeader.appendChild(wrap);
      }

      // ⚙ Columns button
      ViewPrefs.attachButton({
        moduleKey: 'policies',
        catalog:   _polCatalog,
        current:   _polConfig,
        onChange:  (newCfg) => { _polConfig = newCfg; list(); },
      });

      renderTableRows(policies, searchFilter);
      bindFilterEvents(users);

      el.querySelectorAll('#pol-thead-row th.sortable').forEach(th => {
        th.addEventListener('click', async () => {
          const col = th.dataset.sort;
          if (_polConfig.sortBy === col) {
            _polConfig.sortDir = _polConfig.sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            _polConfig.sortBy = col;
            _polConfig.sortDir = 'asc';
          }
          try { const r = await Api.viewPrefs.save('policies', _polConfig); _polConfig = r.config; } catch (_) {}
          list();
        });
      });

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load policies: ${esc(err.message)}</div>`;
    }
  }

  function renderTableRows(policies, search) {
    const tbody = document.getElementById('pol-tbody');
    if (!tbody) return;
    const visibleCols = _polCatalog ? ViewPrefs.visibleColumns(_polCatalog, _polConfig) : [];
    const colCount = visibleCols.length || 1;

    let rows = policies;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(p =>
        (p.policy_name   || '').toLowerCase().includes(q) ||
        (p.policy_number || '').toLowerCase().includes(q) ||
        (p.insurer       || '').toLowerCase().includes(q) ||
        (p.contact_name  || '').toLowerCase().includes(q) ||
        (p.account_name  || '').toLowerCase().includes(q)
      );
    }

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${colCount}" class="table-empty">No policies found.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(p => `<tr>${visibleCols.map(col => {
      const fn = POL_CELLS[col.id];
      return `<td${col.id === 'actions' ? ' class="actions-cell"' : ''}>${fn ? fn(p) : esc(String(p[col.id] ?? '—'))}</td>`;
    }).join('')}</tr>`).join('');

    tbody.querySelectorAll('[data-delete-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id   = btn.dataset.deleteId;
        const name = btn.dataset.deleteName;
        if (!confirmDialog(`Delete policy "${name}"? This cannot be undone.`)) return;
        try {
          await Api.policies.delete(id);
          showToast('Policy deleted.', 'success');
          list();
        } catch (err) {
          showToast('Delete failed: ' + err.message, 'error');
        }
      });
    });
  }

  function bindFilterEvents(users) {
    const searchEl  = document.getElementById('pol-search');
    const statusEl  = document.getElementById('pol-filter-status');
    const typeEl    = document.getElementById('pol-filter-type');
    const brokerEl  = document.getElementById('pol-filter-broker');
    const clearEl   = document.getElementById('pol-filter-clear');

    const applyFilters = debounce(async () => {
      const params = {};
      if (searchEl.value.trim()) params.q         = searchEl.value.trim();
      if (statusEl.value)        params.status    = statusEl.value;
      if (typeEl.value)          params.type      = typeEl.value;
      if (brokerEl.value)        params.broker_id = brokerEl.value;
      if (_polConfig) { params.sort = _polConfig.sortBy; params.dir = _polConfig.sortDir; }
      try {
        const res = await Api.policies.list({ ...params, limit: 200 });
        renderTableRows(res.data || res || [], params.q || '');
      } catch (err) {
        showToast('Filter error: ' + err.message, 'error');
      }
    }, 350);

    if (searchEl) searchEl.addEventListener('input', applyFilters);
    if (statusEl) statusEl.addEventListener('change', applyFilters);
    if (typeEl)   typeEl.addEventListener('change', applyFilters);
    if (brokerEl) brokerEl.addEventListener('change', applyFilters);

    if (clearEl) {
      clearEl.addEventListener('click', () => {
        if (searchEl) searchEl.value = '';
        if (statusEl) statusEl.value = '';
        if (typeEl)   typeEl.value   = '';
        if (brokerEl) brokerEl.value = '';
        applyFilters();
      });
    }
  }

  // ── Form ─────────────────────────────────────────────────────────────────

  async function form(id = null) {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    const isEdit = Boolean(id);
    setPageTitle(isEdit ? 'Edit Policy' : 'New Policy');
    setBreadcrumb(['Policies', isEdit ? 'Edit' : 'New']);

    const headerActions = document.getElementById('header-actions');
    if (headerActions) headerActions.innerHTML = '';

    // Pre-fill from hash params (e.g. ?engagement_id=X)
    const hashParams = getFiltersFromHash();

    try {
      const [usersRes, contactsRes, accountsRes, engsRes, allPoliciesRes, polData] = await Promise.all([
        Api.admin.users(),
        Api.contacts.list({ limit: 500 }),
        Api.accounts.list({ limit: 500 }),
        Api.engagements.list({ limit: 500 }),
        Api.policies.list({ limit: 500 }),
        isEdit ? Api.policies.get(id) : Promise.resolve({}),
      ]);

      const users       = usersRes.data       || usersRes       || [];
      const contacts    = contactsRes.data    || contactsRes    || [];
      const accounts    = accountsRes.data    || accountsRes    || [];
      const engagements = engsRes.data        || engsRes        || [];
      const allPolicies = allPoliciesRes.data || allPoliciesRes || [];
      const d           = polData.data        || polData        || {};

      // Apply hash pre-fills for new records
      if (!isEdit) {
        if (hashParams.engagement_id) d.engagement_id = hashParams.engagement_id;
        if (hashParams.contact_id)    d.contact_id    = hashParams.contact_id;
        if (hashParams.account_id)    d.account_id    = hashParams.account_id;
      }

      const isCancelled = d.policy_status === 'Cancelled';

      el.innerHTML = `
        <div class="form-page">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">${isEdit ? 'Edit Policy' : 'New Policy'}</h3>
            </div>
            <form id="policy-form" novalidate>

              <!-- ── Core Details ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Core Details</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label required">Policy Name</label>
                    <input type="text" name="policy_name" class="form-control" required
                      value="${esc(d.policy_name || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Policy Number</label>
                    <input type="text" name="policy_number" class="form-control" required
                      value="${esc(d.policy_number || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Insurer</label>
                    <input type="text" name="insurer" class="form-control" required
                      value="${esc(d.insurer || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Product Category</label>
                    <select name="product_category" class="form-control" required>
                      ${selectOpts(PRODUCT_CATEGORIES, d.product_category, '— Select Category —')}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Policy Type</label>
                    <select name="policy_type" class="form-control">
                      ${selectOpts(POLICY_TYPES, d.policy_type, '— Select Type —')}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Policy Status</label>
                    <select name="policy_status" id="pol-status" class="form-control" required>
                      ${selectOpts(POLICY_STATUSES, d.policy_status, '— Select Status —')}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Currency</label>
                    ${currencySelectHtml(d.currency, 'currency')}
                  </div>

                  <div class="form-group">
                    <label class="form-label">Contact</label>
                    <select name="contact_id" class="form-control">
                      ${contactOptions(contacts, d.contact_id)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Account</label>
                    <select name="account_id" class="form-control">
                      ${accountOptions(accounts, d.account_id)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Client Engagement</label>
                    <select name="engagement_id" class="form-control">
                      ${engagementOptions(engagements, d.engagement_id)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Cover Description</label>
                    <textarea name="cover_description" class="form-control" rows="2">${esc(d.cover_description || '')}</textarea>
                  </div>

                  <div class="form-group">
                    <label class="form-label">
                      Total Premium
                      <span id="pol-premium-hint" style="font-size:.75rem;color:var(--text-muted);font-weight:normal;margin-left:.4rem;">auto-calculated from linked assets (premium + SASRIA + extras + additional covers)</span>
                    </label>
                    <div class="input-prefix-group">
                      <span class="input-prefix cur-label">R</span>
                      <input type="number" name="premium" id="pol-premium-input" class="form-control" step="0.01" min="0" readonly
                        value="${esc(d.total_premium != null ? d.total_premium : (d.premium || ''))}" />
                    </div>
                  </div>

                </div>
              </fieldset>

              <!-- ── Dates ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Dates</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label required">Inception Date</label>
                    <input type="date" name="inception_date" class="form-control" required
                      value="${esc(d.inception_date ? d.inception_date.slice(0,10) : '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Renewal Date</label>
                    <input type="date" name="renewal_date" class="form-control"
                      value="${esc(d.renewal_date ? d.renewal_date.slice(0,10) : '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Last Review Date</label>
                    <input type="date" name="last_review_date" class="form-control"
                      value="${esc(d.last_review_date ? d.last_review_date.slice(0,10) : '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Next Review Date</label>
                    <input type="date" name="next_review_date" class="form-control"
                      value="${esc(d.next_review_date ? d.next_review_date.slice(0,10) : '')}" />
                  </div>

                </div>
              </fieldset>

              <!-- ── Policy Assets ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Policy Assets</legend>
                <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 .75rem;">
                  Add insured items (vehicles, buildings, equipment, etc.) to this policy.
                  ${isEdit ? 'Assets can also be added or edited from the Assets tab on the policy detail page.' : 'These will be saved when you create the policy.'}
                </p>
                <div id="pol-assets-panel">
                  <div style="text-align:center;padding:.75rem;color:var(--text-muted);font-size:.85rem;">Loading…</div>
                </div>
              </fieldset>

              <!-- ── Assignment & Compliance ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Assignment &amp; Compliance</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label required">Assigned Broker</label>
                    <select name="assigned_broker_id" id="pol-broker-select" class="form-control" required>
                      ${userOptions(users, d.assigned_broker_id)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Broker Code</label>
                    <select name="broker_code_id" id="pol-broker-code-select" class="form-control" required
                            data-current="${esc(d.broker_code_id || '')}">
                      <option value="">— Select broker first —</option>
                    </select>
                    <span class="field-hint" style="font-size:.78rem;color:var(--text-muted);">The insurer-issued code under which this policy is written.</span>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Assigned Admin</label>
                    <select name="assigned_admin_id" class="form-control">
                      ${userOptions(users, d.assigned_admin_id)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="checklist-item">
                      <input type="checkbox" name="disclosure_completed"
                        ${d.disclosure_completed ? 'checked' : ''} />
                      <span>Disclosure Completed</span>
                    </label>
                  </div>

                </div>
              </fieldset>

              <!-- ── Co-Insured & Other Contacts ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Co-Insured &amp; Other Contacts</legend>
                <div class="form-grid form-grid-2">
                  <div class="form-group">
                    <label class="form-label">Co-Insured</label>
                    <select id="co-insured-contact-select" class="form-control">
                      ${contactOptions(contacts, d.co_insured_contact_id)}
                    </select>
                    <input type="hidden" name="co_insured_contact_id" id="co-insured-contact-id"
                      value="${esc(d.co_insured_contact_id != null ? d.co_insured_contact_id : '')}" />
                    <input type="hidden" name="co_insured" id="co-insured-name"
                      value="${esc(d.co_insured || '')}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Co-Insured ID Number</label>
                    <input type="text" name="co_insured_id_number" class="form-control"
                      value="${esc(d.co_insured_id_number || '')}" maxlength="13" />
                  </div>
                  <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">Other Contacts</label>
                    <div style="display:flex;gap:.5rem;align-items:center;">
                      <select id="other-contact-select" class="form-control" style="flex:1;">
                        ${contactOptions(contacts, '')}
                      </select>
                      <button type="button" class="btn btn-secondary btn-sm" id="add-other-contact-btn">+ Add</button>
                    </div>
                    <div id="other-contacts-tags" style="display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.5rem;"></div>
                    <input type="hidden" name="other_contact_ids" id="other-contact-ids"
                      value="${esc(d.other_contact_ids || '')}" />
                  </div>
                </div>
              </fieldset>

              <!-- ── Banking / Payment Details ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Banking / Payment Details</legend>
                <div class="form-grid form-grid-2">
                  <div class="form-group">
                    <label class="form-label">Payment Method</label>
                    <select name="payment_method" class="form-control">
                      <option value="">— Select —</option>
                      ${['Debit Order','EFT','Credit Card','Cash','Cheque'].map(v => `<option value="${v}" ${d.payment_method === v ? 'selected' : ''}>${v}</option>`).join('')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Premium Frequency</label>
                    <select name="premium_frequency" class="form-control">
                      <option value="">— Select —</option>
                      ${['Monthly','Quarterly','Bi-Annual','Annual'].map(v => `<option value="${v}" ${d.premium_frequency === v ? 'selected' : ''}>${v}</option>`).join('')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Debit Order Date</label>
                    <input type="text" name="debit_order_date" class="form-control"
                      value="${esc(d.debit_order_date || '')}" placeholder="e.g. 1st, 15th, 25th" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Bank Name</label>
                    <input type="text" name="bank_name" class="form-control"
                      value="${esc(d.bank_name || '')}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Branch Code</label>
                    <input type="text" name="branch_code" class="form-control"
                      value="${esc(d.branch_code || '')}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Account Number</label>
                    <div style="position:relative;">
                      <input type="password" name="account_number_enc" id="pol-acct-num-input" class="form-control"
                        value="${esc(d.account_number_enc || '')}" autocomplete="off"
                        style="padding-right:2.5rem;"
                        placeholder="Admin password required to view" />
                      <button type="button" id="pol-acct-toggle" tabindex="-1"
                        style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:1.1rem;padding:2px 4px;opacity:.6;"
                        title="Show/hide account number">👁</button>
                    </div>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Account Type</label>
                    <input type="text" name="account_type" class="form-control"
                      value="${esc(d.account_type || '')}" placeholder="e.g. Cheque, Savings, Transmission" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Account Holder Name</label>
                    <input type="text" name="account_holder_name" class="form-control"
                      value="${esc(d.account_holder_name || '')}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Mandate Status</label>
                    <select name="mandate_status" class="form-control">
                      <option value="">— Select —</option>
                      ${['Active','Pending','Cancelled','Expired'].map(v => `<option value="${v}" ${d.mandate_status === v ? 'selected' : ''}>${v}</option>`).join('')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Mandate Auth Date</label>
                    <input type="date" name="mandate_auth_date" class="form-control"
                      value="${esc(d.mandate_auth_date ? d.mandate_auth_date.slice(0,10) : '')}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Debit Order Reference</label>
                    <input type="text" name="debit_order_reference" class="form-control"
                      value="${esc(d.debit_order_reference || '')}" />
                  </div>
                </div>
              </fieldset>

              <!-- ── Read-only Counters ── -->
              ${isEdit ? `
              <fieldset class="form-section">
                <legend class="form-section-title">Counters (read-only)</legend>
                <div class="form-grid form-grid-2">
                  <div class="form-group">
                    <label class="form-label">Amendment Count</label>
                    <input type="text" class="form-control" readonly
                      value="${esc(d.amendment_count != null ? d.amendment_count : '0')}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Claims Count</label>
                    <input type="text" class="form-control" readonly
                      value="${esc(d.claims_count != null ? d.claims_count : '0')}" />
                  </div>
                </div>
              </fieldset>` : ''}

              <!-- ── Cancellation (conditional) ── -->
              <fieldset class="form-section" id="pol-cancel-section"
                style="${isCancelled ? '' : 'display:none;'}">
                <legend class="form-section-title">Cancellation Details</legend>
                <div class="form-grid form-grid-2">
                  <div class="form-group">
                    <label class="form-label">Cancellation Date</label>
                    <input type="date" name="cancellation_date" class="form-control"
                      value="${esc(d.cancellation_date ? d.cancellation_date.slice(0,10) : '')}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Cancellation Reason</label>
                    <textarea name="cancellation_reason" class="form-control" rows="2">${esc(d.cancellation_reason || '')}</textarea>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Replacement Policy</label>
                    <select name="replacement_policy_id" class="form-control">
                      ${policyOptions(allPolicies.filter(p => String(p.id) !== String(id)), d.replacement_policy_id, '— None —')}
                    </select>
                  </div>
                </div>
              </fieldset>

              <!-- ── Notes ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Notes</legend>
                <div class="form-group">
                  <textarea name="notes" class="form-control" rows="4">${esc(d.notes || '')}</textarea>
                </div>
              </fieldset>

              <!-- ── Form Actions ── -->
              <div class="form-actions">
                <button type="submit" class="btn btn-primary" id="pol-submit-btn">
                  ${isEdit ? 'Save Changes' : 'Create Policy'}
                </button>
                <a href="${isEdit ? `#/policies/${id}` : '#/policies'}" class="btn btn-secondary">Cancel</a>
              </div>

            </form>
          </div>
        </div>
      `;

      wireContactPickers(contacts, d);

      bindFormEvents(id, isEdit, { contacts, accounts });

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load form: ${esc(err.message)}</div>`;
    }
  }

  // ── Co-Insured & Other Contacts pickers ─────────────────────────────
  function wireContactPickers(contacts, d) {
    const contactName = (c) => [c.first_name, c.last_name].filter(Boolean).join(' ') || String(c.id);
    const contactNameById = new Map(contacts.map(c => [String(c.id), contactName(c)]));

    const coSel  = document.getElementById('co-insured-contact-select');
    const coIdIn = document.getElementById('co-insured-contact-id');
    const coNmIn = document.getElementById('co-insured-name');
    if (coSel && coIdIn && coNmIn) {
      coSel.addEventListener('change', () => {
        const id = coSel.value;
        coIdIn.value = id || '';
        coNmIn.value = id ? (contactNameById.get(String(id)) || '') : '';
      });
    }

    const otherSel    = document.getElementById('other-contact-select');
    const otherIdsIn  = document.getElementById('other-contact-ids');
    const otherTags   = document.getElementById('other-contacts-tags');
    const addOtherBtn = document.getElementById('add-other-contact-btn');

    function getIds() {
      if (!otherIdsIn) return [];
      try { const a = JSON.parse(otherIdsIn.value || '[]'); return Array.isArray(a) ? a : []; }
      catch(_) { return []; }
    }
    function setIds(ids) {
      if (!otherIdsIn) return;
      otherIdsIn.value = ids.length ? JSON.stringify(ids) : '';
    }
    function renderTags() {
      if (!otherTags) return;
      const ids = getIds();
      otherTags.innerHTML = ids.map(cid => {
        const nm = contactNameById.get(String(cid)) || `#${cid}`;
        return `<span class="badge" style="display:inline-flex;align-items:center;gap:.3rem;padding:.3rem .6rem;background:#e9ecef;border-radius:1rem;">
          ${esc(nm)}
          <button type="button" class="remove-other-contact-btn" data-id="${esc(cid)}"
            style="background:none;border:none;color:#dc3545;cursor:pointer;padding:0;font-weight:700;line-height:1;">&times;</button>
        </span>`;
      }).join('');
    }
    function addOther() {
      if (!otherSel) return;
      const id = otherSel.value;
      if (!id) return;
      const ids = getIds();
      if (ids.some(x => String(x) === String(id))) { otherSel.value = ''; return; }
      ids.push(id);
      setIds(ids);
      otherSel.value = '';
      renderTags();
    }
    if (addOtherBtn) addOtherBtn.addEventListener('click', addOther);
    if (otherTags) otherTags.addEventListener('click', e => {
      const btn = e.target.closest('.remove-other-contact-btn');
      if (!btn) return;
      setIds(getIds().filter(x => String(x) !== String(btn.dataset.id)));
      renderTags();
    });
    renderTags();
  }

  // ── Inline assets panel (policy form) ─────────────────────────────────────

  function renderAssetsInForm(policyId, isEdit) {
    const panel = document.getElementById('pol-assets-panel');
    if (!panel) return;

    const renderTable = (rows, isLive) => {
      const curEl = document.querySelector('[name="currency"]');
      const sym   = currencySymbol(curEl ? curEl.value : 'ZAR');
      const cur = (v) => v != null && v !== '' ? sym + ' ' + Number(v).toLocaleString('en-ZA', {minimumFractionDigits:2}) : '—';
      const tableHtml = rows.length ? `
        <div class="table-responsive" style="margin-bottom:.5rem;">
          <table class="table" style="font-size:.82rem;">
            <thead><tr>
              <th>Asset Name</th><th>Type</th><th>Section</th>
              <th style="text-align:right;">Value</th>
              <th style="text-align:right;">Premium</th>
              <th style="text-align:right;">SASRIA</th>
              <th></th>
            </tr></thead>
            <tbody>
              ${rows.map((a, i) => `
                <tr>
                  <td style="font-weight:500;">${esc(a.asset_name || '—')}</td>
                  <td style="font-size:.78rem;">${esc(a.asset_type || '—')}</td>
                  <td style="font-size:.78rem;">${esc(a.asset_section || '—')}</td>
                  <td style="text-align:right;">${cur(a.asset_value)}</td>
                  <td style="text-align:right;">${cur(a.premium)}</td>
                  <td style="text-align:right;">${cur(a.sasria)}</td>
                  <td style="white-space:nowrap;">
                    ${isLive
                      ? `<a href="#/assets/${a.id}/edit" class="btn btn-xs btn-outline">Edit</a>`
                      : `<button class="btn btn-xs btn-outline pa-edit-btn" data-idx="${i}" style="margin-right:.2rem;">Edit</button>
                         <button class="btn btn-xs btn-danger pa-del-btn" data-idx="${i}">Del</button>`}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : '';

      panel.innerHTML = `
        <div style="margin-bottom:.5rem;">
          <button type="button" class="btn btn-sm btn-primary" id="pol-add-asset-btn">+ Add Asset</button>
        </div>
        ${tableHtml}
        ${!rows.length ? '<p style="font-size:.82rem;color:var(--text-muted);margin:.25rem 0 0;">No assets yet. Click "+ Add Asset" to add one.</p>' : ''}`;

      document.getElementById('pol-add-asset-btn')?.addEventListener('click', () => {
        if (isLive) {
          openAssetChoiceModal(policyId);
        } else {
          openLocalAssetModal(null, null, null, false);
        }
      });

      if (!isLive) {
        panel.querySelectorAll('.pa-edit-btn').forEach(btn => {
          const idx = parseInt(btn.dataset.idx, 10);
          btn.addEventListener('click', () => openLocalAssetModal(_pendingAssets[idx], idx, null, false));
        });
        panel.querySelectorAll('.pa-del-btn').forEach(btn => {
          const idx = parseInt(btn.dataset.idx, 10);
          btn.addEventListener('click', () => {
            _pendingAssets.splice(idx, 1);
            renderAssetsInForm(policyId, isEdit);
          });
        });
      }
    };

    if (isEdit && policyId) {
      Api.assets.list({ policy_id: policyId, limit: 200 }).then(res => {
        renderTable(res.data || res || [], true);
      }).catch(() => renderTable([], true));
    } else {
      renderTable(_pendingAssets, false);
    }
  }

  // ── Asset choice modal: Link Existing or Create New ────────────────────
  function openAssetChoiceModal(policyId) {
    const existing = document.getElementById('pol-asset-choice-overlay');
    if (existing) existing.remove();

    // Read the current policy's contact & account from the form or the detail view
    const contactSel = document.querySelector('[name="contact_id"]');
    const accountSel = document.querySelector('[name="account_id"]');
    const contactId  = contactSel ? contactSel.value : '';
    const accountId  = accountSel ? accountSel.value : '';

    const div = document.createElement('div');
    div.innerHTML = `
      <div class="modal-overlay" id="pol-asset-choice-overlay">
        <div class="modal" style="max-width:500px;" role="dialog">
          <div class="modal-header">
            <span class="modal-title">Add Asset to Policy</span>
            <button class="modal-close" id="pac-close" type="button">&times;</button>
          </div>
          <div class="modal-body" style="padding:1.5rem;">
            <p style="margin:0 0 1.25rem;color:var(--text-muted);font-size:.88rem;">Choose how you'd like to add an asset to this policy:</p>
            <div style="display:flex;flex-direction:column;gap:.75rem;">
              <button type="button" class="btn btn-primary btn-lg" id="pac-create-new" style="padding:.75rem 1rem;font-size:.95rem;">
                + Create New Asset
                <span style="display:block;font-size:.76rem;font-weight:normal;opacity:.8;margin-top:.15rem;">Opens the full asset form with this policy pre-selected</span>
              </button>
              <button type="button" class="btn btn-secondary btn-lg" id="pac-link-existing" style="padding:.75rem 1rem;font-size:.95rem;">
                Link Existing Asset
                <span style="display:block;font-size:.76rem;font-weight:normal;opacity:.8;margin-top:.15rem;">Search and link an asset that already exists</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;

    const overlay = div.firstElementChild;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#pac-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { /* click-outside-to-close disabled */ void e; });

    overlay.querySelector('#pac-create-new').addEventListener('click', () => {
      close();
      const params = [`policy_id=${policyId}`];
      if (contactId) params.push(`contact_id=${contactId}`);
      if (accountId) params.push(`account_id=${accountId}`);
      navigate(`assets/new?${params.join('&')}`);
    });

    overlay.querySelector('#pac-link-existing').addEventListener('click', () => {
      close();
      openLinkAssetModal(policyId);
    });
  }

  // ── Link existing asset modal ─────────────────────────────────────────
  function openLinkAssetModal(policyId) {
    const existing = document.getElementById('pol-link-asset-overlay');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.innerHTML = `
      <div class="modal-overlay" id="pol-link-asset-overlay">
        <div class="modal modal--lg" style="max-height:90vh;overflow-y:auto;" role="dialog">
          <div class="modal-header">
            <span class="modal-title">Link Existing Asset</span>
            <button class="modal-close" id="pla-close" type="button">&times;</button>
          </div>
          <div class="modal-body" style="padding:1.25rem;">
            <div style="margin-bottom:1rem;">
              <input type="text" id="pla-search" class="form-control" placeholder="Search assets by name, registration, make, model…" autofocus />
            </div>
            <div id="pla-results" style="min-height:100px;">
              <p style="color:var(--text-muted);font-size:.85rem;">Loading assets…</p>
            </div>
          </div>
        </div>
      </div>`;

    const overlay = div.firstElementChild;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#pla-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { /* click-outside-to-close disabled */ void e; });

    const resultsEl = overlay.querySelector('#pla-results');
    const searchEl  = overlay.querySelector('#pla-search');
    let allAssets = [];

    // Load all assets that are NOT already linked to this policy
    Api.assets.list({ limit: 500 }).then(res => {
      const all = res.data || res || [];
      allAssets = all.filter(a => !a.policy_id || String(a.policy_id) !== String(policyId));
      renderLinkResults('');
    }).catch(() => {
      resultsEl.innerHTML = '<p style="color:var(--danger);">Failed to load assets.</p>';
    });

    function renderLinkResults(query) {
      const q = query.toLowerCase().trim();
      const filtered = q
        ? allAssets.filter(a =>
            (a.asset_name || '').toLowerCase().includes(q) ||
            (a.registration_number || '').toLowerCase().includes(q) ||
            (a.make || '').toLowerCase().includes(q) ||
            (a.model || '').toLowerCase().includes(q) ||
            (a.serial_number || '').toLowerCase().includes(q) ||
            (a.vin_number || '').toLowerCase().includes(q)
          )
        : allAssets;

      const shown = filtered.slice(0, 50);

      if (!shown.length) {
        resultsEl.innerHTML = `<p style="color:var(--text-muted);font-size:.85rem;">
          ${q ? 'No matching assets found.' : 'No unlinked assets available.'}
        </p>`;
        return;
      }

      resultsEl.innerHTML = `
        ${filtered.length > 50 ? `<p style="font-size:.8rem;color:var(--text-muted);margin-bottom:.5rem;">Showing 50 of ${filtered.length} results. Type to narrow down.</p>` : ''}
        <div class="table-responsive"><table class="table" style="font-size:.85rem;">
          <thead><tr>
            <th>Asset Name</th><th>Type</th><th>Make / Model</th><th>Reg #</th>
            <th>Contact</th><th></th>
          </tr></thead>
          <tbody>${shown.map(a => `
            <tr>
              <td style="font-weight:500;">${esc(a.asset_name || '—')}</td>
              <td style="font-size:.8rem;">${esc(a.asset_type || '—')}</td>
              <td style="font-size:.8rem;">${[a.make, a.model, a.year].filter(Boolean).map(esc).join(' ') || '—'}</td>
              <td style="font-size:.8rem;">${esc(a.registration_number || a.serial_number || '—')}</td>
              <td style="font-size:.8rem;">${esc(a.contact_name || '—')}</td>
              <td><button class="btn btn-xs btn-primary pla-link-btn" data-id="${a.id}">Link</button></td>
            </tr>`).join('')}
          </tbody>
        </table></div>`;

      resultsEl.querySelectorAll('.pla-link-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = '…';
          try {
            await Api.assets.update(btn.dataset.id, { policy_id: policyId });
            showToast('Asset linked to policy.', 'success');
            close();
            renderAssetsInForm(policyId, true);
            // Also refresh the Assets tab if visible
            const tabEl = document.getElementById('tab-content');
            const activeBtn = document.querySelector('.tab-btn.active');
            if (activeBtn && (activeBtn.dataset.tab === 'assets' || activeBtn.dataset.tab === 'sections')) {
              activeBtn.click();
            }
          } catch (err) {
            showToast('Failed to link asset: ' + (err.message || err), 'error');
            btn.disabled = false;
            btn.textContent = 'Link';
          }
        });
      });
    }

    let debounce;
    searchEl.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => renderLinkResults(searchEl.value), 200);
    });
  }

  function openLocalAssetModal(assetData, editIdx, policyId, isLive) {
    const existing = document.getElementById('pol-asset-modal-overlay');
    if (existing) existing.remove();

    const v = assetData || {};
    const isEditAsset = editIdx !== null && editIdx !== undefined;
    const cur = (n) => v[n] != null ? Number(v[n]).toFixed(2) : '';

    const div = document.createElement('div');
    div.innerHTML = `
      <div class="modal-overlay" id="pol-asset-modal-overlay">
        <div class="modal modal--lg" style="max-height:90vh;overflow-y:auto;" role="dialog">
          <div class="modal-header">
            <span class="modal-title">${isEditAsset ? 'Edit Asset' : 'Add Asset'}</span>
            <button class="modal-close" id="pa-modal-close" type="button">&times;</button>
          </div>
          <div class="modal-body" style="padding:1.25rem;">
            <form id="pa-modal-form" novalidate>
              <div class="form-grid form-grid-2">
                <div class="form-group" style="grid-column:1/-1;">
                  <label class="form-label required">Asset Name</label>
                  <input type="text" name="asset_name" class="form-control" required
                    value="${esc(v.asset_name || '')}" placeholder="e.g. 2022 Scania R500 Truck" />
                </div>
                <div class="form-group">
                  <label class="form-label required">Asset Type</label>
                  <select name="asset_type" class="form-control" required>
                    <option value="">— Select Type —</option>
                    ${['Motor Vehicle','Motorcycle / Scooter','Caravan / Trailer','Watercraft / Boat','Aircraft',
                       'Plant & Equipment','Electronic Equipment','Portable Possessions',
                       'Building / Structure','Stock / Inventory','Other']
                      .map(t => `<option value="${esc(t)}" ${v.asset_type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Policy Section
                    <span style="font-size:.72rem;color:var(--text-muted);font-weight:normal;margin-left:.3rem;">type to search</span>
                  </label>
                  <input type="text" name="asset_section" class="form-control"
                    list="pa-section-datalist" autocomplete="off"
                    placeholder="e.g. Motor – Light motor vehicle"
                    value="${esc(v.asset_section || '')}" />
                  <datalist id="pa-section-datalist">
                    ${SECTION_TYPES.map(s => `<option value="${esc(s)}"></option>`).join('')}
                  </datalist>
                </div>
                <div class="form-group">
                  <label class="form-label">Make</label>
                  <input type="text" name="make" class="form-control" value="${esc(v.make || '')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Model</label>
                  <input type="text" name="model" class="form-control" value="${esc(v.model || '')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Year</label>
                  <input type="number" name="year" class="form-control" min="1900" max="2100" value="${esc(v.year || '')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Registration / Serial Number</label>
                  <input type="text" name="registration_number" class="form-control" value="${esc(v.registration_number || '')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Asset Value (R)</label>
                  <input type="number" name="asset_value" class="form-control" min="0" step="0.01"
                    placeholder="0.00" value="${cur('asset_value')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Premium (R)</label>
                  <input type="number" name="premium" class="form-control" min="0" step="0.01"
                    placeholder="0.00" value="${cur('premium')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">SASRIA (R)</label>
                  <input type="number" name="sasria" class="form-control" min="0" step="0.01"
                    placeholder="0.00" value="${cur('sasria')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Excess (R)</label>
                  <input type="number" name="excess" class="form-control" min="0" step="0.01"
                    placeholder="0.00" value="${cur('excess')}" />
                </div>
                <div class="form-group" style="grid-column:1/-1;">
                  <label class="form-label">Notes</label>
                  <textarea name="notes" class="form-control" rows="2">${esc(v.notes || '')}</textarea>
                </div>
              </div>
              <div class="form-actions" style="margin-top:1rem;justify-content:flex-end;gap:.5rem;display:flex;">
                <button type="button" id="pa-modal-cancel" class="btn btn-secondary">Cancel</button>
                <button type="submit" class="btn btn-primary" id="pa-modal-save">
                  ${isEditAsset ? 'Save Changes' : 'Add Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>`;

    const overlay = div.firstElementChild;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#pa-modal-close').addEventListener('click', close);
    overlay.querySelector('#pa-modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { /* click-outside-to-close disabled */ void e; });

    overlay.querySelector('#pa-modal-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = overlay.querySelector('#pa-modal-save');
      btn.disabled = true;

      const data = serializeForm(e.target);

      if (isLive && policyId) {
        // Editing an existing policy: save directly to DB
        data.policy_id = policyId;
        data.asset_status = data.asset_status || 'Active';
        try {
          if (isEditAsset && assetData && assetData.id) {
            await Api.assets.update(assetData.id, data);
            showToast('Asset updated.', 'success');
          } else {
            await Api.assets.create(data);
            showToast('Asset added.', 'success');
          }
          close();
          renderAssetsInForm(policyId, true);
        } catch (err) {
          showToast('Save failed: ' + (err.message || err), 'error');
          btn.disabled = false;
        }
      } else {
        // New policy: store in pending array
        if (isEditAsset) {
          _pendingAssets[editIdx] = { ..._pendingAssets[editIdx], ...data, _id: _pendingAssets[editIdx]._id };
        } else {
          data._id = ++_pendingAssetNextId;
          _pendingAssets.push(data);
        }
        close();
        renderAssetsInForm(null, false);
      }
    });
  }

  // ── Inline FICA / POPIA check on contact/account selection ──────────────
  function wireFicaPopiaCheck(formEl, contacts, accounts) {
    if (!formEl) return;
    const contactSel = formEl.querySelector('[name="contact_id"]');
    const accountSel = formEl.querySelector('[name="account_id"]');
    if (!contactSel && !accountSel) return;

    let warnEl = formEl.querySelector('#pol-compliance-warn');
    if (!warnEl) {
      warnEl = document.createElement('div');
      warnEl.id = 'pol-compliance-warn';
      warnEl.style.cssText = `
        margin:.5rem 0 .75rem; padding:.6rem .85rem;
        background:#fff4e5; border-left:3px solid #e67e22;
        color:#7a4a10; font-size:.83rem; border-radius:4px;
        display:none;
      `;
      const target = contactSel || accountSel;
      target.closest('.form-group')?.parentNode?.insertBefore(warnEl, target.closest('.form-group'));
    }

    const update = () => {
      const issues = [];
      if (contactSel?.value) {
        const c = contacts.find(x => String(x.id) === String(contactSel.value));
        if (c) {
          if (c.fica_status !== 'Verified') issues.push(`FICA not verified for ${c.first_name || ''} ${c.last_name || ''}`.trim() + ` (status: ${c.fica_status || 'unknown'})`);
          if (!c.popia_consent_obtained)    issues.push(`POPIA consent not obtained for ${c.first_name || ''} ${c.last_name || ''}`.trim());
        }
      }
      if (accountSel?.value) {
        const a = accounts.find(x => String(x.id) === String(accountSel.value));
        if (a && a.fica_status !== 'Verified') {
          issues.push(`FICA not verified for ${a.account_name} (status: ${a.fica_status || 'unknown'})`);
        }
      }
      if (issues.length) {
        warnEl.innerHTML = `⚠️ <strong>Compliance gate:</strong> the policy cannot be saved until these are resolved:<ul style="margin:.3rem 0 0 1.2rem;">${issues.map(i => `<li>${Utils.esc(i)}</li>`).join('')}</ul>`;
        warnEl.style.display = '';
      } else {
        warnEl.style.display = 'none';
      }
    };

    contactSel?.addEventListener('change', update);
    accountSel?.addEventListener('change', update);
    update();
  }

  // Populate the broker-code dropdown from the assigned broker's codes.
  // Codes are attached to each user row by the /api/admin/users response.
  let _brokerCodesByUserId = null;
  async function _loadBrokerCodesIndex() {
    if (_brokerCodesByUserId) return _brokerCodesByUserId;
    try {
      const res = await Api.admin.users();
      const users = res.data || res || [];
      _brokerCodesByUserId = new Map(users.map(u => [String(u.id), u.broker_codes || []]));
    } catch (_) {
      _brokerCodesByUserId = new Map();
    }
    return _brokerCodesByUserId;
  }

  function wireBrokerCodeSelect(formEl) {
    if (!formEl) return;
    const brokerSel = formEl.querySelector('#pol-broker-select');
    const codeSel   = formEl.querySelector('#pol-broker-code-select');
    if (!brokerSel || !codeSel) return;

    const initialBrokerCodeId = codeSel.dataset.current || '';

    const repopulate = async (preferId) => {
      const map = await _loadBrokerCodesIndex();
      const codes = map.get(String(brokerSel.value)) || [];
      if (!codes.length) {
        codeSel.innerHTML = `<option value="">— No broker codes available —</option>`;
        codeSel.disabled = true;
        return;
      }
      codeSel.disabled = false;
      const opts = ['<option value="">— Select broker code —</option>']
        .concat(codes.map(c => {
          const label = c.description ? `${c.code} — ${c.description}` : c.code;
          const sel = String(c.id) === String(preferId) ? ' selected' : '';
          return `<option value="${esc(c.id)}"${sel}>${esc(label)}</option>`;
        }));
      codeSel.innerHTML = opts.join('');
    };

    brokerSel.addEventListener('change', () => repopulate(''));
    // Initial load — preserve existing selection (edit mode)
    repopulate(initialBrokerCodeId);
  }

  function bindFormEvents(id, isEdit, ctx = {}) {
    const contacts = ctx.contacts || [];
    const accounts = ctx.accounts || [];
    const formEl      = document.getElementById('policy-form');
    const statusEl    = document.getElementById('pol-status');
    const cancelSection = document.getElementById('pol-cancel-section');

    // Reset pending state for new forms
    if (!isEdit) {
      _pendingSections      = [];
      _pendingSectionNextId = 0;
      _pendingAssets        = [];
      _pendingAssetNextId   = 0;
    }

    // Show/hide cancellation section based on status
    if (statusEl && cancelSection) {
      statusEl.addEventListener('change', () => {
        cancelSection.style.display = statusEl.value === 'Cancelled' ? '' : 'none';
      });
    }

    // Account number eye toggle
    const acctInput = document.getElementById('pol-acct-num-input');
    const acctToggle = document.getElementById('pol-acct-toggle');
    if (acctInput && acctToggle) {
      acctToggle.addEventListener('click', () => {
        const isHidden = acctInput.type === 'password';
        acctInput.type = isHidden ? 'text' : 'password';
        acctToggle.style.opacity = isHidden ? '1' : '.6';
      });
    }

    // Render inline assets panel
    renderAssetsInForm(id, isEdit);

    wireContactAccountToggle(formEl);
    wireCurrencySelector(formEl);
    wireFicaPopiaCheck(formEl, contacts, accounts);
    wireBrokerCodeSelect(formEl);

    if (formEl) {
      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('pol-submit-btn');
        if (btn) btn.disabled = true;

        const data = serializeForm(formEl);

        // Wrapper that retries once with `_compliance_override` when the
        // server returns COMPLIANCE_GATE. Reuses the EditLock prompt so
        // brokers can enter an admin password or a 6-digit PIN.
        const tryWith = async (extra) => {
          const payload = extra ? { ...data, ...extra } : data;
          if (isEdit) return Api.policies.update(id, payload);
          return Api.policies.create(payload);
        };
        const handleComplianceGate = async (firstErr) => {
          if (!firstErr || firstErr.code !== 'COMPLIANCE_GATE') throw firstErr;
          const reasons = (firstErr.body && firstErr.body.reasons) || [];
          const intent  = `bypass POPIA / FICA gate (${reasons.join('; ') || firstErr.message})`;
          const pw = await EditLock.requestUnlock({
            module: 'policies',
            recordId: id || 'new',
            subject: 'this client',
            intent,
          });
          if (!pw) {
            const cancel = new Error('Compliance override cancelled — policy not saved.');
            cancel.code = 'COMPLIANCE_OVERRIDE_CANCELLED';
            throw cancel;
          }
          return tryWith({ _compliance_override: pw });
        };

        try {
          let result;
          try {
            result = await tryWith();
          } catch (err) {
            result = await handleComplianceGate(err);
          }

          if (isEdit) {
            showToast('Policy updated.', 'success');
            navigate(`policies/${id}`);
          } else {
            const newId = (result.data || result).id;

            // Save pending assets now that we have the policy ID
            if (_pendingAssets.length) {
              await Promise.all(_pendingAssets.map(a => {
                const assetData = { ...a };
                delete assetData._id;
                assetData.policy_id    = newId;
                assetData.asset_status = assetData.asset_status || 'Active';
                return Api.assets.create(assetData).catch(err =>
                  console.warn('Asset save failed:', err.message)
                );
              }));
              _pendingAssets = [];
            }

            showToast('Policy created.', 'success');
            navigate(`policies/${newId}?openCommission=1`);
          }
        } catch (err) {
          showToast('Save failed: ' + err.message, 'error');
          if (btn) btn.disabled = false;
        }
      });
    }
  }

  // ── Detail ────────────────────────────────────────────────────────────────

  async function detail(id) {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    const headerActions = document.getElementById('header-actions');
    if (headerActions) {
      headerActions.innerHTML = `
        <button class="btn btn-secondary" onclick="Policies._amendmentMail(${id})">Create Amendment Mail</button>
        <a href="#/policies/${id}/edit" class="btn btn-primary">Edit</a>
        <a href="#/schedule/policy/${id}" class="btn btn-primary">Show Schedule</a>`;
    }

    try {
      const [res, historyRes] = await Promise.all([
        Api.policies.get(id),
        Api.policies.assetHistory(id).catch(() => []),
      ]);
      const d       = res.data || res || {};
      const history = Array.isArray(historyRes) ? historyRes : (historyRes?.data || []);

      setPageTitle(esc(d.policy_name || 'Policy'));
      setBreadcrumb(['Policies', d.policy_name || 'Detail']);

      const field = (label, value) => `<div class="detail-field"><span class="detail-label">${label}</span><span class="detail-value">${value || '—'}</span></div>`;
      const bool  = (v) => v ? `<span class="bool-yes">&#10003; Yes</span>` : `<span class="bool-no">&#10007; No</span>`;

      el.innerHTML = `
        <div class="detail-view">

          <!-- Commission Missing Banner -->
          ${d.commission_entry_missing ? `
          <div id="commission-missing-banner" class="alert alert-danger" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.75rem 1rem;margin-bottom:1rem;">
            <div>
              <strong>⚠ Commission entry missing</strong> — No commission has been logged for this policy yet.
              Please record the commission type, rate, and arrangement.
            </div>
            <button type="button" class="btn btn-sm btn-light" id="banner-go-commission"
              style="background:#fff;color:#a71d2a;font-weight:600;white-space:nowrap;">Add commission →</button>
          </div>` : ''}

          <!-- Policy Details -->
          <div class="detail-section card">
            <div class="detail-section-title">Policy Details</div>
            <div class="detail-grid">
              ${field('Policy Number', esc(d.policy_number || '—'))}
              ${field('Policy Name', esc(d.policy_name || '—'))}
              ${field('Status', statusBadgeHtml(d.policy_status))}
              ${field('Policy Type', esc(d.policy_type || '—'))}
              ${field('Product Category', esc(d.product_category || '—'))}
              ${field('Insurer', esc(d.insurer || '—'))}
            </div>
          </div>

          <!-- Parties -->
          <div class="detail-section card">
            <div class="detail-section-title">Parties</div>
            <div class="detail-grid">
              ${field('Contact', d.contact_id ? `<a href="#/contacts/${d.contact_id}">${esc(d.contact_name || '—')}</a>` : esc(d.contact_name || '—'))}
              ${field('Account', d.account_id ? `<a href="#/accounts/${d.account_id}">${esc(d.account_name || '—')}</a>` : esc(d.account_name || '—'))}
              ${field('Broker', esc(d.broker_name || '—'))}
            </div>
          </div>

          <!-- Financial & Dates -->
          <div class="detail-section card" id="pol-fin-card">
            <div class="detail-section-title" style="display:flex;align-items:center;gap:.75rem;">
              <span>Financial &amp; Dates</span>
              <span style="flex:1;"></span>
              <label style="display:flex;align-items:center;gap:.35rem;font-size:.78rem;font-weight:400;color:var(--text-muted);cursor:pointer;">
                <input type="checkbox" id="pol-fin-breakdown-cb" ${Assets.getBreakdownPref('policy') ? 'checked' : ''} />
                Show premium breakdown
              </label>
            </div>
            <div class="detail-grid">
              ${field('Total Premium', (d.total_premium != null ? formatCurrency(d.total_premium) : (d.premium ? formatCurrency(d.premium) : '—')))}
              ${field('Inception Date', d.inception_date ? formatDate(d.inception_date) : '—')}
              ${field('Renewal Date', d.renewal_date ? formatDate(d.renewal_date) : '—')}
              ${field('Last Review Date', d.last_review_date ? formatDate(d.last_review_date) : '—')}
              ${field('Next Review Date', d.next_review_date ? formatDate(d.next_review_date) : '—')}
              ${field('Amendment Count', esc(d.amendment_count != null ? String(d.amendment_count) : '0'))}
              ${field('Claims Count', esc(d.claims_count != null ? String(d.claims_count) : '0'))}
              ${field('Disclosure Completed', bool(d.disclosure_completed))}
            </div>
            <div id="pol-fin-breakdown" style="margin-top:.75rem;padding-top:.75rem;border-top:1px solid var(--border-color,#dee2e6);${Assets.getBreakdownPref('policy') ? '' : 'display:none;'}">
              <div style="font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);margin-bottom:.4rem;">
                Premium &amp; Sum Insured Breakdown
                <span style="font-weight:normal;text-transform:none;letter-spacing:0;">— aggregated across all linked assets</span>
              </div>
              <div id="pol-fin-breakdown-body">
                <div class="loading-spinner-wrapper" style="padding:.75rem;"><div class="loading-spinner"></div></div>
              </div>
            </div>
          </div>

          <!-- Asset History (assets that were on this policy when it was cancelled) -->
          ${history.length ? `
          <div class="detail-section card">
            <div class="detail-section-title">Previously Linked Assets <span style="font-size:.75rem;color:var(--text-muted);font-weight:normal;margin-left:.4rem;">(snapshot at policy cancellation)</span></div>
            <table class="table" style="margin:0;">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Type</th>
                  <th>Make / Model / Year</th>
                  <th>Reg / VIN</th>
                  <th style="text-align:right;">Value</th>
                  <th style="text-align:right;">Premium</th>
                  <th>Cancelled</th>
                </tr>
              </thead>
              <tbody>
                ${history.map(h => `
                  <tr>
                    <td>${h.asset_id ? `<a href="#/assets/${h.asset_id}">${esc(h.asset_name || '—')}</a>` : esc(h.asset_name || '—')}</td>
                    <td>${esc(h.asset_type || '—')}</td>
                    <td>${[h.make, h.model, h.year].filter(Boolean).map(esc).join(' ') || '—'}</td>
                    <td>${esc(h.registration_number || h.vin_number || h.serial_number || '—')}</td>
                    <td style="text-align:right;">${h.asset_value != null ? formatCurrency(h.asset_value) : '—'}</td>
                    <td style="text-align:right;">${h.premium != null ? formatCurrency(h.premium) : '—'}</td>
                    <td>${h.cancelled_at ? formatDate(h.cancelled_at) : '—'}${h.cancelled_by_name ? ` <span style="color:var(--text-muted);font-size:.75rem;">by ${esc(h.cancelled_by_name)}</span>` : ''}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : ''}

          <!-- Co-Insured & Other Contacts -->
          ${(d.co_insured || d.co_insured_contact_id || (d.other_contacts && d.other_contacts.length)) ? `
          <div class="detail-section card">
            <div class="detail-section-title">Co-Insured &amp; Other Contacts</div>
            <div class="detail-grid">
              ${d.co_insured_contact_id
                ? field('Co-Insured', `<a href="#/contacts/${d.co_insured_contact_id}">${esc(d.co_insured_name || d.co_insured || '—')}</a>`)
                : (d.co_insured ? field('Co-Insured Name', esc(d.co_insured)) : '')}
              ${field('Co-Insured ID Number', esc(d.co_insured_id_number))}
              ${(d.other_contacts && d.other_contacts.length) ? field('Other Contacts',
                d.other_contacts.map(oc => `<a href="#/contacts/${oc.id}">${esc(oc.name)}</a>`).join(', ')
              ) : ''}
            </div>
          </div>` : ''}

          <!-- Banking / Payment Details -->
          ${d.payment_method || d.bank_name || d.account_holder_name || d.account_number_enc || d.mandate_status ? `
          <div class="detail-section card">
            <div class="detail-section-title">Banking / Payment Details</div>
            <div class="detail-grid">
              ${field('Payment Method', esc(d.payment_method || '—'))}
              ${field('Premium Frequency', esc(d.premium_frequency || '—'))}
              ${field('Debit Order Date', esc(d.debit_order_date || '—'))}
              ${field('Bank Name', esc(d.bank_name || '—'))}
              ${field('Branch Code', esc(d.branch_code || '—'))}
              ${field('Account Number', d.account_number_enc
                ? EncryptedField.render({
                    module:   'policies',
                    recordId: d.id,
                    field:    'account_number_enc',
                    masked:   '••••••••' + String(d.account_number_enc).slice(-4),
                    label:    'Bank Account Number',
                  })
                : '—')}
              ${field('Account Type', esc(d.account_type || '—'))}
              ${field('Account Holder', esc(d.account_holder_name || '—'))}
              ${field('Mandate Status', esc(d.mandate_status || '—'))}
              ${field('Mandate Auth Date', d.mandate_auth_date ? formatDate(d.mandate_auth_date) : '—')}
              ${field('Debit Order Reference', esc(d.debit_order_reference || '—'))}
            </div>
          </div>` : ''}

          <!-- Cover & Notes -->
          ${d.cover_description || d.notes ? `
          <div class="detail-section card">
            <div class="detail-section-title">Cover &amp; Notes</div>
            <div class="detail-text-fields">
              ${d.cover_description ? `<div class="detail-text-item"><strong>Cover Description</strong><p>${esc(d.cover_description)}</p></div>` : ''}
              ${d.notes ? `<div class="detail-text-item"><strong>Notes</strong><p>${esc(d.notes)}</p></div>` : ''}
            </div>
          </div>` : ''}

          <!-- Cancelled Banner -->
          ${d.policy_status === 'Cancelled' ? `
          <div class="alert alert-warning">
            <strong>Cancelled</strong>
            ${d.cancellation_date ? ` on ${formatDate(d.cancellation_date)}` : ''}
            ${d.cancellation_reason ? ` — ${esc(d.cancellation_reason)}` : ''}
          </div>` : ''}

          <!-- Tabs -->
          <div class="detail-tabs card">
            <div class="tabs-header" id="pol-tabs-header">
              <button class="tab-btn active" data-tab="sections">Sections</button>
              <button class="tab-btn"        data-tab="assets">Assets</button>
              <button class="tab-btn"        data-tab="claims">Claims</button>
              <button class="tab-btn"        data-tab="commission">Commission</button>
              <button class="tab-btn"        data-tab="post-sale">Post-Sale Events</button>
              <button class="tab-btn"        data-tab="documents">Documents</button>
              <button class="tab-btn"        data-tab="timeline">Timeline</button>
              <button class="tab-btn"        data-tab="versions">Versions</button>
              <button class="tab-btn"        data-tab="quotes">Quotes</button>
            </div>
            <div class="tab-content" id="pol-tab-content">
              <div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>
            </div>
          </div>

        </div>
      `;

      // Account-number reveal is now handled by the global EncryptedField
      // delegated click handler in utils.js — admin password is collected via
      // the centred modal and verified by /api/admin/reveal-encrypted.

      loadPolicyTab(id, 'sections');
      document.getElementById('pol-tabs-header').querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#pol-tabs-header .tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          loadPolicyTab(id, btn.dataset.tab);
        });
      });

      // Premium breakdown toggle (Financial & Dates card)
      (function wirePolicyFinBreakdown() {
        const cb       = document.getElementById('pol-fin-breakdown-cb');
        const panel    = document.getElementById('pol-fin-breakdown');
        const bodyEl   = document.getElementById('pol-fin-breakdown-body');
        if (!cb || !panel || !bodyEl) return;
        const polSym   = currencySymbol(d.currency || 'ZAR');
        const fmtCur   = (v) => v != null
          ? polSym + ' ' + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : '—';
        let loaded = false;

        async function loadBreakdown() {
          if (loaded) return;
          loaded = true;
          try {
            const res = await Api.assets.list({ policy_id: id, limit: 500 });
            const assets = (res.data || res || []).filter(a =>
              !['Sold', 'Decommissioned', 'Inactive', 'Cancelled'].includes(a.asset_status));
            const agg = Assets.calcAggregateBreakdown(assets);
            bodyEl.innerHTML = Assets.renderAggregateBreakdownHtml(agg, fmtCur);
          } catch (err) {
            bodyEl.innerHTML = `<p class="text-danger" style="padding:.5rem;">Could not load breakdown: ${esc(err.message || String(err))}</p>`;
          }
        }

        cb.addEventListener('change', () => {
          Assets.setBreakdownPref('policy', cb.checked);
          panel.style.display = cb.checked ? '' : 'none';
          if (cb.checked) loadBreakdown();
        });
        if (cb.checked) loadBreakdown();
      })();

      // Commission-missing banner deep-link → switch to the commission tab.
      document.getElementById('banner-go-commission')?.addEventListener('click', () => {
        const header = document.getElementById('pol-tabs-header');
        if (!header) return;
        header.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'commission'));
        loadPolicyTab(id, 'commission');
        document.querySelector('.detail-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      // Fresh-create flow: navigate() lands here with ?openCommission=1 right
      // after a new policy is saved. Switch to the commission tab and pop the
      // same modal the "+ Add Commission Entry" button shows, so the broker
      // captures remuneration immediately instead of bouncing through tabs.
      if (getFiltersFromHash().openCommission === '1') {
        const header = document.getElementById('pol-tabs-header');
        if (header) {
          header.querySelectorAll('.tab-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.tab === 'commission'));
        }
        await loadPolicyTab(id, 'commission');
        document.getElementById('add-commission-btn')?.click();
        // Strip the flag so a refresh (or back-then-forward) doesn't re-pop.
        if (typeof window.history?.replaceState === 'function') {
          try {
            const baseUrl = window.location.href.split('#')[0];
            window.history.replaceState(null, '', baseUrl + '#/policies/' + id);
          } catch (_) {}
        }
      }

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load policy: ${esc(err.message)}</div>`;
    }
  }

  // ── Section Assets view (inline in tab content) ─────────────────────────

  function showSectionAssets(policyId, sectionType, tabEl, allAssets) {
    if (!tabEl) tabEl = document.getElementById('pol-tab-content');
    if (!tabEl) return;

    const sAssets = allAssets.filter(a => (a.asset_section || '') === sectionType);
    const polCurrency = (sAssets[0] && sAssets[0].currency) || 'ZAR';
    const sym = currencySymbol(polCurrency);
    const fmtCur = (v) => v != null
      ? sym + ' ' + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '—';
    const cur = (v, code) => v != null && v !== '' && v !== 0
      ? currencySymbol(code || polCurrency) + ' ' + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : null;

    const agg = Assets.calcAggregateBreakdown(sAssets);
    const initialBreakdown = Assets.getBreakdownPref('section-assets');

    tabEl.innerHTML = `
      <div style="margin-bottom:.75rem;display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;">
        <button class="btn btn-sm btn-secondary" id="sec-back-btn">← Back to Sections</button>
        <span style="flex:1;"></span>
        <label style="display:flex;align-items:center;gap:.35rem;font-size:.82rem;color:var(--text-muted);cursor:pointer;">
          <input type="checkbox" id="sec-breakdown-cb" ${initialBreakdown ? 'checked' : ''} /> Show breakdown
        </label>
      </div>

      <div class="detail-section card" style="margin-bottom:.75rem;" id="sec-totals-card">
        <div class="detail-section-title">${esc(sectionType || 'Uncategorised')}</div>
        <div id="sec-totals-body"></div>
      </div>

      <div class="card">
        <div class="card-header" style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;">
          <h3 class="card-title" style="margin:0;">Assets in this Section</h3>
          <span style="flex:1;"></span>
          <input type="text" id="sec-asset-search" class="form-control"
            placeholder="Search by name, registration, make, model…"
            style="max-width:320px;font-size:.85rem;" />
        </div>
        <div id="sec-assets-table-host"></div>
      </div>`;

    document.getElementById('sec-back-btn')?.addEventListener('click', () => loadPolicyTab(policyId, 'sections'));

    const host         = document.getElementById('sec-assets-table-host');
    const searchEl     = document.getElementById('sec-asset-search');
    const totalsBody   = document.getElementById('sec-totals-body');
    const breakdownCb  = document.getElementById('sec-breakdown-cb');

    function drawTotals() {
      if (!totalsBody) return;
      const showBreakdown = breakdownCb ? breakdownCb.checked : false;
      if (!showBreakdown) {
        totalsBody.innerHTML = `
          <div class="detail-grid">
            <div class="detail-field"><span class="detail-label">Total Assets</span><span class="detail-value">${sAssets.length}</span></div>
            <div class="detail-field"><span class="detail-label">Total Insured Value</span><span class="detail-value">${cur(agg.assetValue) || '—'}</span></div>
            <div class="detail-field"><span class="detail-label">Total Premium</span><span class="detail-value">${cur(agg.premium) || '—'}</span></div>
            ${agg.sasria ? `<div class="detail-field"><span class="detail-label">Total SASRIA</span><span class="detail-value">${cur(agg.sasria)}</span></div>` : ''}
            ${agg.excess ? `<div class="detail-field"><span class="detail-label">Total Excess</span><span class="detail-value">${cur(agg.excess)}</span></div>` : ''}
          </div>`;
      } else {
        totalsBody.innerHTML = `
          <div class="detail-grid">
            <div class="detail-field"><span class="detail-label">Total Assets</span><span class="detail-value">${sAssets.length}</span></div>
            <div class="detail-field"><span class="detail-label">Sum Insured</span><span class="detail-value">${fmtCur(agg.sumInsured)}</span></div>
            ${agg.additionalCoversAmountIncluded ? `<div class="detail-field"><span class="detail-label">Add'l Covers (in total)</span><span class="detail-value">${fmtCur(agg.additionalCoversAmountIncluded)}</span></div>` : ''}
            ${agg.additionalCoversAmountExcluded ? `<div class="detail-field"><span class="detail-label">Add'l Covers (excluded)</span><span class="detail-value" style="color:var(--text-muted);">${fmtCur(agg.additionalCoversAmountExcluded)}</span></div>` : ''}
            ${agg.extrasAmountIncluded ? `<div class="detail-field"><span class="detail-label">Vehicle Extras (in total)</span><span class="detail-value">${fmtCur(agg.extrasAmountIncluded)}</span></div>` : ''}
            ${agg.extrasAmountExcluded ? `<div class="detail-field"><span class="detail-label">Vehicle Extras (excluded)</span><span class="detail-value" style="color:var(--text-muted);">${fmtCur(agg.extrasAmountExcluded)}</span></div>` : ''}
            <div class="detail-field" style="font-weight:600;border-top:1px solid #dee2e6;padding-top:.4rem;margin-top:.2rem;"><span class="detail-label">Total Asset Value</span><span class="detail-value">${fmtCur(agg.assetValue)}</span></div>
            <div class="detail-field"><span class="detail-label">Sum Insured Premium</span><span class="detail-value">${fmtCur(agg.sumInsuredPremium)}</span></div>
            ${agg.extrasPremium           ? `<div class="detail-field"><span class="detail-label">Vehicle Extras Premium</span><span class="detail-value">${fmtCur(agg.extrasPremium)}</span></div>` : ''}
            ${agg.additionalCoversPremium ? `<div class="detail-field"><span class="detail-label">Add'l Covers Premium</span><span class="detail-value">${fmtCur(agg.additionalCoversPremium)}</span></div>` : ''}
            ${agg.excessesPremium         ? `<div class="detail-field"><span class="detail-label">Excesses Premium</span><span class="detail-value">${fmtCur(agg.excessesPremium)}</span></div>` : ''}
            <div class="detail-field"><span class="detail-label">SASRIA</span><span class="detail-value">${fmtCur(agg.sasria)}</span></div>
            <div class="detail-field" style="font-weight:600;border-top:1px solid #dee2e6;padding-top:.4rem;margin-top:.2rem;"><span class="detail-label">Total Premium</span><span class="detail-value">${fmtCur(agg.premium)}</span></div>
            ${agg.excess ? `<div class="detail-field"><span class="detail-label">Total Basic Excess</span><span class="detail-value">${fmtCur(agg.excess)}</span></div>` : ''}
          </div>`;
      }
    }

    function filterRows(query) {
      const q = (query || '').toLowerCase().trim();
      if (!q) return sAssets;
      return sAssets.filter(a =>
        (a.asset_name          || '').toLowerCase().includes(q) ||
        (a.asset_type          || '').toLowerCase().includes(q) ||
        (a.registration_number || '').toLowerCase().includes(q) ||
        (a.make                || '').toLowerCase().includes(q) ||
        (a.model               || '').toLowerCase().includes(q) ||
        (a.serial_number       || '').toLowerCase().includes(q) ||
        (a.vin_number          || '').toLowerCase().includes(q) ||
        (a.contact_name        || '').toLowerCase().includes(q) ||
        (a.account_name        || '').toLowerCase().includes(q) ||
        String(a.year || '').toLowerCase().includes(q)
      );
    }

    function drawTable(query) {
      const rows = filterRows(query);
      Assets.renderAssetsTab(host, rows, {
        addLabel:  '+ Add Asset to Section',
        onAddClick: () => openAssetChoiceModal(policyId),
        emptyMsg:  query ? 'No assets match your search.' : 'No assets in this section.',
      });
    }

    drawTotals();
    drawTable('');
    if (breakdownCb) {
      breakdownCb.addEventListener('change', () => {
        Assets.setBreakdownPref('section-assets', breakdownCb.checked);
        drawTotals();
      });
    }
    if (searchEl) {
      const onSearch = debounce(() => drawTable(searchEl.value), 250);
      searchEl.addEventListener('input', onSearch);
    }
  }

  async function loadPolicyTab(policyId, tab) {
    const tabEl = document.getElementById('pol-tab-content');
    if (!tabEl) return;
    tabEl.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    try {
      switch (tab) {
        case 'sections': {
          const assetRes = await Api.assets.list({ policy_id: policyId, limit: 200 }).catch(() => ({ data: [] }));
          const _allSectionAssets = assetRes.data || assetRes || [];
          const SECTION_INACTIVE = ['Sold', 'Decommissioned', 'Inactive', 'Cancelled'];
          const secHiddenCount = _allSectionAssets.filter(a => SECTION_INACTIVE.includes(a.asset_status)).length;
          const polRes = await Api.policies.get(policyId).catch(() => null);
          const polSym = currencySymbol((polRes && (polRes.data || polRes).currency) || 'ZAR');
          const cur = (v) => v != null && Number(v) !== 0
            ? polSym + ' ' + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2 }) : '—';

          function renderSectionsTab(showInactive, showBreakdown) {
            const allAssets = showInactive ? _allSectionAssets : _allSectionAssets.filter(a => !SECTION_INACTIVE.includes(a.asset_status));
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
            const grandAgg = Assets.calcAggregateBreakdown(allAssets);

            const summaryHtml = showBreakdown
              ? `<div class="pol-sections-summary" style="display:flex;gap:1.5rem;padding:0 .25rem .75rem;flex-wrap:wrap;font-size:.85rem;color:var(--text-muted);">
                   <span><strong>${sectionKeys.length}</strong> section${sectionKeys.length !== 1 ? 's' : ''} (${allAssets.length} asset${allAssets.length !== 1 ? 's' : ''})</span>
                   <span>Sum Insured: <strong>${cur(grandAgg.sumInsured)}</strong></span>
                   ${grandAgg.additionalCoversAmountIncluded ? `<span>Add'l Covers (in): <strong>${cur(grandAgg.additionalCoversAmountIncluded)}</strong></span>` : ''}
                   ${grandAgg.additionalCoversAmountExcluded ? `<span>Add'l Covers (excl): <strong>${cur(grandAgg.additionalCoversAmountExcluded)}</strong></span>` : ''}
                   ${grandAgg.extrasAmountIncluded ? `<span>Extras (in total): <strong>${cur(grandAgg.extrasAmountIncluded)}</strong></span>` : ''}
                   ${grandAgg.extrasAmountExcluded ? `<span>Extras (excluded): <strong>${cur(grandAgg.extrasAmountExcluded)}</strong></span>` : ''}
                   <span>Total Asset Value: <strong>${cur(grandAgg.assetValue)}</strong></span>
                   <span>Sum Insured Premium: <strong>${cur(grandAgg.sumInsuredPremium)}</strong></span>
                   ${grandAgg.extrasPremium           ? `<span>Extras Premium: <strong>${cur(grandAgg.extrasPremium)}</strong></span>` : ''}
                   ${grandAgg.additionalCoversPremium ? `<span>Add'l Covers Premium: <strong>${cur(grandAgg.additionalCoversPremium)}</strong></span>` : ''}
                   ${grandAgg.excessesPremium         ? `<span>Excesses Premium: <strong>${cur(grandAgg.excessesPremium)}</strong></span>` : ''}
                   <span>SASRIA: <strong>${cur(grandAgg.sasria)}</strong></span>
                   <span>Total Premium: <strong>${cur(grandAgg.premium)}</strong></span>
                 </div>`
              : `<div class="pol-sections-summary" style="display:flex;gap:1.5rem;padding:0 .25rem .75rem;flex-wrap:wrap;font-size:.85rem;color:var(--text-muted);">
                   <span><strong>${sectionKeys.length}</strong> section${sectionKeys.length !== 1 ? 's' : ''} (${allAssets.length} asset${allAssets.length !== 1 ? 's' : ''})</span>
                   <span>Total Value: <strong>${cur(grandAgg.assetValue)}</strong></span>
                   <span>Total Premium: <strong>${cur(grandAgg.premium)}</strong></span>
                   ${grandAgg.sasria ? `<span>SASRIA: <strong>${cur(grandAgg.sasria)}</strong></span>` : ''}
                 </div>`;

            const tableHtml = showBreakdown
              ? `<div class="table-responsive pol-sections-table-breakdown"><table class="table">
                  <thead><tr>
                    <th>Section</th>
                    <th style="text-align:right;">Assets</th>
                    <th style="text-align:right;">Sum Insured</th>
                    <th style="text-align:right;" title="Additional covers with In-total ticked">Add'l Cov (in)</th>
                    <th style="text-align:right;" title="Additional covers NOT in Asset Value">Add'l Cov (excl)</th>
                    <th style="text-align:right;" title="Vehicle extras with In-total ticked">Extras (in)</th>
                    <th style="text-align:right;" title="Vehicle extras NOT in Asset Value">Extras (excl)</th>
                    <th style="text-align:right;">Asset Value</th>
                    <th style="text-align:right;">Sum Ins. Prem</th>
                    <th style="text-align:right;">Extras Prem</th>
                    <th style="text-align:right;">Add'l Cov Prem</th>
                    <th style="text-align:right;">Excesses Prem</th>
                    <th style="text-align:right;">SASRIA</th>
                    <th style="text-align:right;">Total Premium</th>
                    <th style="text-align:right;">Excess</th>
                  </tr></thead>
                  <tbody>
                    ${sectionKeys.map(key => {
                      const items = sectionMap.get(key);
                      const sb = Assets.calcAggregateBreakdown(items);
                      return `<tr>
                        <td style="font-weight:500;">
                          <button class="btn-link sec-view-btn" data-section-key="${esc(key)}"
                            style="background:none;border:none;padding:0;cursor:pointer;color:var(--color-primary,#0066cc);text-decoration:underline;font-weight:500;">
                            ${esc(key || 'Uncategorised')}
                          </button>
                        </td>
                        <td style="text-align:right;">${items.length}</td>
                        <td style="text-align:right;font-variant-numeric:tabular-nums;">${cur(sb.sumInsured)}</td>
                        <td style="text-align:right;font-variant-numeric:tabular-nums;">${sb.additionalCoversAmountIncluded ? cur(sb.additionalCoversAmountIncluded) : '—'}</td>
                        <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--text-muted);">${sb.additionalCoversAmountExcluded ? cur(sb.additionalCoversAmountExcluded) : '—'}</td>
                        <td style="text-align:right;font-variant-numeric:tabular-nums;">${sb.extrasAmountIncluded ? cur(sb.extrasAmountIncluded) : '—'}</td>
                        <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--text-muted);">${sb.extrasAmountExcluded ? cur(sb.extrasAmountExcluded) : '—'}</td>
                        <td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;">${cur(sb.assetValue)}</td>
                        <td style="text-align:right;font-variant-numeric:tabular-nums;">${cur(sb.sumInsuredPremium)}</td>
                        <td style="text-align:right;font-variant-numeric:tabular-nums;">${sb.extrasPremium ? cur(sb.extrasPremium) : '—'}</td>
                        <td style="text-align:right;font-variant-numeric:tabular-nums;">${sb.additionalCoversPremium ? cur(sb.additionalCoversPremium) : '—'}</td>
                        <td style="text-align:right;font-variant-numeric:tabular-nums;">${sb.excessesPremium ? cur(sb.excessesPremium) : '—'}</td>
                        <td style="text-align:right;font-variant-numeric:tabular-nums;">${sb.sasria ? cur(sb.sasria) : '—'}</td>
                        <td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;">${cur(sb.premium)}</td>
                        <td style="text-align:right;font-variant-numeric:tabular-nums;">${sb.excess ? cur(sb.excess) : '—'}</td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                  <tfoot>
                    <tr style="font-weight:600;background:var(--surface-secondary,#f8f9fa);">
                      <td>Totals</td>
                      <td style="text-align:right;">${allAssets.length}</td>
                      <td style="text-align:right;">${cur(grandAgg.sumInsured)}</td>
                      <td style="text-align:right;">${grandAgg.additionalCoversAmountIncluded ? cur(grandAgg.additionalCoversAmountIncluded) : '—'}</td>
                      <td style="text-align:right;color:var(--text-muted);">${grandAgg.additionalCoversAmountExcluded ? cur(grandAgg.additionalCoversAmountExcluded) : '—'}</td>
                      <td style="text-align:right;">${grandAgg.extrasAmountIncluded ? cur(grandAgg.extrasAmountIncluded) : '—'}</td>
                      <td style="text-align:right;color:var(--text-muted);">${grandAgg.extrasAmountExcluded ? cur(grandAgg.extrasAmountExcluded) : '—'}</td>
                      <td style="text-align:right;">${cur(grandAgg.assetValue)}</td>
                      <td style="text-align:right;">${cur(grandAgg.sumInsuredPremium)}</td>
                      <td style="text-align:right;">${grandAgg.extrasPremium ? cur(grandAgg.extrasPremium) : '—'}</td>
                      <td style="text-align:right;">${grandAgg.additionalCoversPremium ? cur(grandAgg.additionalCoversPremium) : '—'}</td>
                      <td style="text-align:right;">${grandAgg.excessesPremium ? cur(grandAgg.excessesPremium) : '—'}</td>
                      <td style="text-align:right;">${grandAgg.sasria ? cur(grandAgg.sasria) : '—'}</td>
                      <td style="text-align:right;">${cur(grandAgg.premium)}</td>
                      <td style="text-align:right;">${grandAgg.excess ? cur(grandAgg.excess) : '—'}</td>
                    </tr>
                  </tfoot>
                </table></div>`
              : `<div class="table-responsive pol-sections-table-simple"><table class="table">
                  <thead><tr>
                    <th>Section</th>
                    <th style="text-align:right;">Assets</th>
                    <th style="text-align:right;">Total Value</th>
                    <th style="text-align:right;">Total Premium</th>
                    <th style="text-align:right;">SASRIA</th>
                    <th style="text-align:right;">Excess</th>
                  </tr></thead>
                  <tbody>
                    ${sectionKeys.map(key => {
                      const items = sectionMap.get(key);
                      const sb = Assets.calcAggregateBreakdown(items);
                      return `<tr>
                        <td style="font-weight:500;">
                          <button class="btn-link sec-view-btn" data-section-key="${esc(key)}"
                            style="background:none;border:none;padding:0;cursor:pointer;color:var(--color-primary,#0066cc);text-decoration:underline;font-weight:500;">
                            ${esc(key || 'Uncategorised')}
                          </button>
                        </td>
                        <td style="text-align:right;">${items.length}</td>
                        <td style="text-align:right;font-variant-numeric:tabular-nums;">${cur(sb.assetValue)}</td>
                        <td style="text-align:right;font-variant-numeric:tabular-nums;">${cur(sb.premium)}</td>
                        <td style="text-align:right;font-variant-numeric:tabular-nums;">${sb.sasria ? cur(sb.sasria) : '—'}</td>
                        <td style="text-align:right;font-variant-numeric:tabular-nums;">${sb.excess ? cur(sb.excess) : '—'}</td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                  <tfoot>
                    <tr style="font-weight:600;background:var(--surface-secondary,#f8f9fa);">
                      <td>Totals</td>
                      <td style="text-align:right;">${allAssets.length}</td>
                      <td style="text-align:right;">${cur(grandAgg.assetValue)}</td>
                      <td style="text-align:right;">${cur(grandAgg.premium)}</td>
                      <td style="text-align:right;">${grandAgg.sasria ? cur(grandAgg.sasria) : '—'}</td>
                      <td style="text-align:right;">${grandAgg.excess ? cur(grandAgg.excess) : '—'}</td>
                    </tr>
                  </tfoot>
                </table></div>`;

            tabEl.innerHTML = `
              <div style="margin-bottom:.75rem;display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;">
                <button type="button" class="btn btn-sm btn-primary pol-add-asset-choice">+ Add Asset</button>
                ${secHiddenCount > 0 ? `<label style="display:flex;align-items:center;gap:.35rem;font-size:.82rem;color:var(--text-muted);cursor:pointer;"><input type="checkbox" id="pol-sec-show-inactive" ${showInactive ? 'checked' : ''} /> Show sold/inactive (${secHiddenCount})</label>` : ''}
                <label style="display:flex;align-items:center;gap:.35rem;font-size:.82rem;color:var(--text-muted);cursor:pointer;">
                  <input type="checkbox" id="pol-sec-breakdown-cb" ${showBreakdown ? 'checked' : ''} /> Show breakdown
                </label>
                <span style="font-size:.8rem;color:var(--text-muted);">Assets grouped by their Section field. Totals derived from each asset's parts (sum insured, extras, additional covers, excesses, SASRIA).</span>
              </div>
              ${sectionKeys.length ? summaryHtml + tableHtml : '<p class="tab-empty">No assets found for this policy. Add assets and assign them a Section to see groupings here.</p>'}`;

            const inactiveCb = document.getElementById('pol-sec-show-inactive');
            if (inactiveCb) inactiveCb.addEventListener('change', () =>
              renderSectionsTab(inactiveCb.checked, document.getElementById('pol-sec-breakdown-cb')?.checked || false));
            const breakdownCb = document.getElementById('pol-sec-breakdown-cb');
            if (breakdownCb) breakdownCb.addEventListener('change', () => {
              Assets.setBreakdownPref('sections', breakdownCb.checked);
              renderSectionsTab(document.getElementById('pol-sec-show-inactive')?.checked || false, breakdownCb.checked);
            });
            tabEl.querySelectorAll('.sec-view-btn').forEach(btn => {
              btn.addEventListener('click', () =>
                showSectionAssets(policyId, btn.dataset.sectionKey, tabEl, allAssets));
            });
            tabEl.querySelectorAll('.pol-add-asset-choice').forEach(btn => {
              btn.addEventListener('click', () => openAssetChoiceModal(policyId));
            });
          }
          renderSectionsTab(false, Assets.getBreakdownPref('sections'));
          break;
        }
        case 'assets': {
          const assetRes = await Api.assets.list({ policy_id: policyId, limit: 200 }).catch(() => ({ data: [] }));
          const allAssetRows = assetRes.data || assetRes || [];
          await Assets.renderAssetsTab(tabEl, allAssetRows, {
            addLabel: '+ Add Asset',
            onAddClick: () => openAssetChoiceModal(policyId),
            emptyMsg: 'No assets linked to this policy.',
          });
          break;
        }
        case 'claims': {
          const res = await Api.policies.claims(policyId).catch(() => ({ data: [] }));
          const rows = res.data || res || [];
          tabEl.innerHTML = `
            <div style="margin-bottom:.75rem;"><a href="#/claims/new?policy_id=${policyId}" class="btn btn-sm btn-primary">+ Add Claim</a></div>
            <div class="table-responsive"><table class="table">
              <thead><tr><th>Claim Number</th><th>Type</th><th>Status</th><th>Date</th><th>Est. Value</th><th></th></tr></thead>
              <tbody>${rows.length ? rows.map(c => `
                <tr>
                  <td><a href="#/claims/${c.id}">${esc(c.claim_number || '—')}</a></td>
                  <td>${esc(c.claim_type || '—')}</td>
                  <td>${statusBadgeHtml(c.claim_status)}</td>
                  <td>${c.claim_date ? formatDate(c.claim_date) : '—'}</td>
                  <td>${c.estimated_value ? formatCurrency(c.estimated_value) : '—'}</td>
                  <td><a href="#/claims/${c.id}/edit" class="btn btn-sm btn-primary">Edit</a></td>
                </tr>`).join('') : '<tr><td colspan="6" class="table-empty">No claims.</td></tr>'}
              </tbody>
            </table></div>`;
          break;
        }
        case 'documents': {
          const res = await Api.documents.list({ module: 'policies', record_id: policyId }).catch(() => ({ data: [] }));
          const docs = res.data || res || [];
          tabEl.innerHTML = `
            <div style="margin-bottom:.75rem;">
              <label class="btn btn-sm btn-primary" for="policy-doc-upload">+ Upload Document</label>
              <input type="file" id="policy-doc-upload" style="display:none;" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.csv" />
            </div>
            ${docs.length ? `<div class="table-responsive"><table class="table">
              <thead><tr><th>File Name</th><th>Size</th><th>Uploaded By</th><th>Date</th><th></th></tr></thead>
              <tbody>${docs.map(doc => `
                <tr>
                  <td>${esc(doc.original_name || doc.file_name || '—')}</td>
                  <td>${formatBytes(doc.file_size)}</td>
                  <td>${esc(doc.uploaded_by_name || '—')}</td>
                  <td>${doc.uploaded_at ? formatDate(doc.uploaded_at) : '—'}</td>
                  <td style="white-space:nowrap;">
                    <a href="${Api.documents.viewUrl(doc.id)}" target="_blank" class="btn btn-xs btn-outline">View</a>
                    <button class="btn btn-xs btn-danger doc-del-btn" data-doc-id="${doc.id}" data-doc-name="${esc(doc.original_name)}">Delete</button>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table></div>` : '<p class="tab-empty">No documents uploaded yet.</p>'}`;
          const inp = document.getElementById('policy-doc-upload');
          if (inp) inp.addEventListener('change', async e => {
            const file = e.target.files[0]; if (!file) return;
            try {
              const fd = new FormData(); fd.append('file', file); fd.append('module', 'policies'); fd.append('record_id', policyId);
              await Api.documents.upload(fd); showToast('Document uploaded.', 'success'); loadPolicyTab(policyId, 'documents');
            } catch (err) { showToast('Upload failed: ' + (err.message || err), 'error'); }
          });
          tabEl.querySelectorAll('.doc-del-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
              const docName = btn.dataset.docName;
              if (!confirm(`Delete document "${docName}"? This cannot be undone.`)) return;
              try {
                await Api.documents.delete(btn.dataset.docId);
                showToast('Document deleted.', 'success');
                loadPolicyTab(policyId, 'documents');
              } catch (err) {
                showToast('Delete failed: ' + (err.message || err), 'error');
              }
            });
          });
          break;
        }
        case 'timeline': {
          const entries = await Api.timeline.forRecord('policies', policyId);
          const rows = Array.isArray(entries) ? entries : (entries.data || []);
          tabEl.innerHTML = `<div style="padding:.75rem 1rem;">${renderTimeline(rows, 'No activity recorded yet.')}</div>`;
          break;
        }
        case 'versions': {
          await renderVersionsTab(tabEl, 'policies', policyId, { useTimeline: true });
          break;
        }
        case 'commission': {
          const [rows, opts, roas] = await Promise.all([
            Api.commissionLog.list({ policy_id: policyId }),
            Api.commissionLog.options(),
            Api.adviceRecords.list({ policy_id: policyId, limit: 10 }).then(r => r.data || []).catch(() => []),
          ]);
          const latestRoa = roas[0];

          tabEl.innerHTML = `
            <div class="tab-toolbar" style="display:flex;justify-content:space-between;align-items:center;padding:.75rem 1rem;border-bottom:1px solid var(--border,#dee2e6);">
              <div style="font-size:.85rem;color:#666;">
                COFI remuneration + FAIS GCC 3A.
                ${latestRoa ? ` Latest ROA: <a href="#/advice-records/${latestRoa.id}">${esc(latestRoa.advice_record_number)}</a> — COI: <strong>${esc(latestRoa.conflict_of_interest_flag || 'Not declared')}</strong>` : ' No linked ROA.'}
              </div>
              <button class="btn btn-primary btn-sm" id="add-commission-btn">+ Add Commission Entry</button>
            </div>
            ${rows.length ? `
            <div class="table-responsive"><table class="table">
              <thead><tr>
                <th>Type</th><th>Rate / Amount</th><th>Calculated amount</th><th>Insurer arrangement</th>
                <th>Compliance</th><th>Last review</th><th></th>
              </tr></thead>
              <tbody>${rows.map(r => {
                const hasRate   = r.commission_rate   != null && r.commission_rate   !== '';
                const hasAmount = r.commission_amount != null && r.commission_amount !== '';
                const rateAmtCell = hasRate
                  ? `<span style="font-weight:600;">${esc(r.commission_rate)}%</span>`
                  : (hasAmount
                      ? `<span style="font-weight:600;">R ${Number(r.commission_amount).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
                      : '—');
                const calcCell = hasRate && hasAmount
                  ? formatCurrency(r.commission_amount)
                  : (hasRate ? '<span style="color:#888;">auto</span>' : '—');
                return `
                <tr>
                  <td>${esc(r.commission_type || '—')}</td>
                  <td>${rateAmtCell}</td>
                  <td>${calcCell}</td>
                  <td>${esc(r.insurer_arrangement || '—')}</td>
                  <td>${esc(r.remuneration_compliant || '—')}</td>
                  <td>${esc(r.last_review_date || '—')}</td>
                  <td style="white-space:nowrap;">
                    <button class="btn btn-xs btn-outline js-edit-commission" data-id="${r.id}">Edit</button>
                    <button class="btn btn-xs btn-danger js-delete-commission" data-id="${r.id}" data-type="${esc(r.commission_type || 'commission entry')}">Delete</button>
                  </td>
                </tr>`;
              }).join('')}</tbody>
            </table></div>` : `<p class="tab-empty">No commission entries logged yet.</p>`}
          `;

          function openCommissionModal(entry = {}) {
            const isEdit = !!entry.id;
            // Initial mode: if existing entry has commission_amount but no rate → R, else %.
            const initialMode = (entry.commission_amount != null && entry.commission_amount !== ''
                                 && (entry.commission_rate == null || entry.commission_rate === ''))
              ? 'R' : '%';
            const initialValue = initialMode === 'R'
              ? (entry.commission_amount ?? '')
              : (entry.commission_rate ?? '');

            const dd = (name, values, selected) => `
              <select name="${name}" class="form-control"${name === 'commission_type' ? ' id="cl-commission-type"' : ''}>
                <option value="">—</option>
                ${values.map(v => `<option value="${esc(v)}" ${selected === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
              </select>`;
            const body = `
              <form id="cl-modal-form">
                <input type="hidden" name="policy_id" value="${policyId}">
                <div class="form-grid form-grid-2">
                  <div class="form-group">
                    <label class="form-label required">Commission type *</label>
                    ${dd('commission_type', opts.commission_type, entry.commission_type)}
                  </div>
                  <div class="form-group">
                    <label class="form-label">Insurer arrangement</label>
                    ${dd('insurer_arrangement', opts.insurer_arrangement, entry.insurer_arrangement)}
                  </div>
                  <div class="form-group">
                    <label class="form-label" id="cl-rate-label">Commission ${initialMode === 'R' ? 'amount (R)' : 'rate (%)'}</label>
                    <div style="display:flex;gap:.5rem;align-items:stretch;">
                      <div id="cl-rate-toggle"
                        style="display:inline-flex;border:1px solid var(--border,#dee2e6);border-radius:6px;overflow:hidden;flex:0 0 auto;font-size:.85rem;">
                        <button type="button" data-mode="%" class="${initialMode === '%' ? 'active' : ''}"
                          style="padding:.4rem .8rem;border:0;background:${initialMode === '%' ? '#1a5276' : '#fff'};color:${initialMode === '%' ? '#fff' : '#333'};cursor:pointer;font-weight:600;">%</button>
                        <button type="button" data-mode="R" class="${initialMode === 'R' ? 'active' : ''}"
                          style="padding:.4rem .8rem;border:0;background:${initialMode === 'R' ? '#1a5276' : '#fff'};color:${initialMode === 'R' ? '#fff' : '#333'};cursor:pointer;font-weight:600;border-left:1px solid var(--border,#dee2e6);">R</button>
                      </div>
                      <input type="number" step="0.01" min="0" class="form-control" id="cl-rate-input"
                        value="${esc(initialValue)}" placeholder="${initialMode === 'R' ? 'e.g. 1500.00' : 'e.g. 12.5'}" style="flex:1;">
                    </div>
                    <input type="hidden" name="commission_rate"   id="cl-commission-rate"   value="${initialMode === '%' ? esc(initialValue) : ''}">
                    <input type="hidden" name="commission_amount" id="cl-commission-amount" value="${initialMode === 'R' ? esc(initialValue) : ''}">
                    <small id="cl-rate-help" style="color:#666;">${initialMode === 'R' ? 'Flat-rand commission. The system will not auto-calculate from premium.' : 'Percentage of annual premium — amount auto-calculates from policy premium.'}</small>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Compliance flag</label>
                    <input type="text" class="form-control" value="${esc(entry.remuneration_compliant || 'auto')}" disabled>
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Business class</label>
                  <div style="display:flex;gap:1.25rem;align-items:center;flex-wrap:wrap;">
                    <label style="display:flex;gap:.4rem;align-items:center;cursor:pointer;font-weight:400;margin:0;">
                      <input type="checkbox" name="class_motor" value="1" id="cl-class-motor"
                             ${entry.class_motor ? 'checked' : ''}> Motor
                    </label>
                    <label style="display:flex;gap:.4rem;align-items:center;cursor:pointer;font-weight:400;margin:0;">
                      <input type="checkbox" name="class_non_motor" value="1" id="cl-class-non-motor"
                             ${entry.class_non_motor ? 'checked' : ''}> Non-Motor
                    </label>
                    <label style="display:flex;gap:.4rem;align-items:center;cursor:pointer;font-weight:400;margin:0;">
                      <input type="checkbox" name="class_other" value="1" id="cl-class-other"
                             ${entry.class_other ? 'checked' : ''}> Other
                    </label>
                  </div>
                  <div id="cl-class-other-wrap" style="margin-top:.5rem;${entry.class_other ? '' : 'display:none;'}">
                    <input type="text" class="form-control" name="class_other_text" id="cl-class-other-text"
                           placeholder="Specify other class…"
                           value="${esc(entry.class_other_text || '')}">
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Volume override details</label>
                  <textarea class="form-control" name="volume_override_details" rows="2">${esc(entry.volume_override_details || '')}</textarea>
                </div>
                <div class="form-group">
                  <label class="form-label">Notes</label>
                  <textarea class="form-control" name="notes" rows="2">${esc(entry.notes || '')}</textarea>
                </div>
              </form>`;
            const footerBtns = isEdit
              ? `<button class="btn btn-primary" id="save-cl-btn">Update</button>`
              : `<button class="btn btn-secondary" id="add-more-cl-btn" style="margin-right:auto;">+ Add More</button>
                 <button class="btn btn-primary" id="save-cl-btn">Save</button>`;
            _openModal(isEdit ? 'Edit Commission Entry' : 'Add Commission Entry', body, footerBtns);

            // ── R / % toggle wiring ──
            let rateMode = initialMode;
            const rateInput  = document.getElementById('cl-rate-input');
            const rateLabel  = document.getElementById('cl-rate-label');
            const rateHelp   = document.getElementById('cl-rate-help');
            const hiddenRate = document.getElementById('cl-commission-rate');
            const hiddenAmt  = document.getElementById('cl-commission-amount');
            const typeSel    = document.getElementById('cl-commission-type');

            function applyRateMode(mode, opts = {}) {
              rateMode = mode;
              rateLabel.textContent = mode === 'R' ? 'Commission amount (R)' : 'Commission rate (%)';
              rateInput.placeholder  = mode === 'R' ? 'e.g. 1500.00' : 'e.g. 12.5';
              rateHelp.textContent   = mode === 'R'
                ? 'Flat-rand commission. The system will not auto-calculate from premium.'
                : 'Percentage of annual premium — amount auto-calculates from policy premium.';
              document.querySelectorAll('#cl-rate-toggle button').forEach(btn => {
                const on = btn.dataset.mode === mode;
                btn.style.background = on ? '#1a5276' : '#fff';
                btn.style.color      = on ? '#fff'    : '#333';
              });
              if (opts.preserveValue !== true) rateInput.value = '';
              syncHidden();
            }
            function syncHidden() {
              const v = rateInput.value;
              if (rateMode === 'R') { hiddenAmt.value = v; hiddenRate.value = ''; }
              else                  { hiddenRate.value = v; hiddenAmt.value = ''; }
            }
            document.querySelectorAll('#cl-rate-toggle button').forEach(btn => {
              btn.addEventListener('click', () => applyRateMode(btn.dataset.mode));
            });
            rateInput.addEventListener('input', syncHidden);

            // Auto-switch to R when a flat-amount commission type is selected.
            if (typeSel) {
              typeSel.addEventListener('change', () => {
                const v = typeSel.value || '';
                if (/flat fee|flat amount|fee-based/i.test(v) && rateMode !== 'R') {
                  applyRateMode('R');
                }
              });
              // Apply on initial render too if entry was created with such a type.
              if (typeSel.value && /flat fee|flat amount|fee-based/i.test(typeSel.value) && rateMode !== 'R') {
                applyRateMode('R', { preserveValue: true });
              }
            }

            // ── Business-class checkbox wiring ──
            // "Other" reveals a free-text input where the broker types a class
            // not covered by Motor / Non-Motor.
            const otherChk     = document.getElementById('cl-class-other');
            const otherWrap    = document.getElementById('cl-class-other-wrap');
            const otherTextEl  = document.getElementById('cl-class-other-text');
            if (otherChk) {
              const sync = () => {
                if (otherChk.checked) {
                  otherWrap.style.display = '';
                  otherTextEl.focus();
                } else {
                  otherWrap.style.display = 'none';
                  otherTextEl.value = '';
                }
              };
              otherChk.addEventListener('change', sync);
            }

            async function performSave({ keepOpen }) {
              syncHidden();
              const form = document.getElementById('cl-modal-form');
              const fd = new FormData(form);
              const payload = Object.fromEntries(fd.entries());
              // Always send BOTH fields. The server uses pick() (b[k] ?? existing[k])
              // which would otherwise keep the previous value when one is omitted.
              // Sending '' explicitly clears the field that doesn't apply to the
              // selected R/% mode.
              if (rateMode === 'R') { payload.commission_rate = ''; }
              else                  { payload.commission_amount = ''; }
              // FormData omits unchecked checkboxes — explicitly send 0 so the
              // server toggles the flag off when the user unticks a class.
              payload.class_motor     = document.getElementById('cl-class-motor').checked     ? 1 : 0;
              payload.class_non_motor = document.getElementById('cl-class-non-motor').checked ? 1 : 0;
              payload.class_other     = document.getElementById('cl-class-other').checked     ? 1 : 0;
              if (!payload.class_other) payload.class_other_text = '';
              try {
                if (isEdit) await Api.commissionLog.update(entry.id, payload);
                else        await Api.commissionLog.create(payload);
                showToast(isEdit ? 'Commission entry updated.' : 'Commission entry added.', 'success');
                // The "Commission entry missing" banner above the tabs is rendered
                // from a server-computed flag at detail-load time; clear it now
                // that an entry exists so the broker doesn't see a stale warning.
                document.getElementById('commission-missing-banner')?.remove();
                loadPolicyTab(policyId, 'commission');
                if (keepOpen) {
                  // Reset for the next entry without tearing down the modal.
                  form.reset();
                  applyRateMode('%');                 // also clears rateInput + syncs hidden fields
                  if (otherWrap) otherWrap.style.display = 'none';
                  if (typeSel) typeSel.focus();
                } else {
                  _closeModal();
                }
              } catch (err) { showToast(err.message, 'error'); }
            }
            document.getElementById('save-cl-btn').addEventListener('click', () => performSave({ keepOpen: false }));
            document.getElementById('add-more-cl-btn')?.addEventListener('click', () => performSave({ keepOpen: true }));
          }

          document.getElementById('add-commission-btn').addEventListener('click', () => openCommissionModal());
          tabEl.querySelectorAll('.js-edit-commission').forEach(btn => {
            btn.addEventListener('click', () => {
              const entry = rows.find(r => String(r.id) === btn.dataset.id);
              if (entry) openCommissionModal(entry);
            });
          });
          tabEl.querySelectorAll('.js-delete-commission').forEach(btn => {
            btn.addEventListener('click', async () => {
              const id   = btn.dataset.id;
              const type = btn.dataset.type || 'commission entry';
              const ok = await confirmDialogAsync(
                `Delete the ${type} commission entry? This cannot be undone.`,
                { title: 'Delete commission entry', okLabel: 'Delete', cancelLabel: 'Cancel', variant: 'danger' }
              );
              if (!ok) return;
              try {
                await Api.commissionLog.delete(id);
                showToast('Commission entry deleted.', 'success');
                loadPolicyTab(policyId, 'commission');
              } catch (err) {
                showToast('Delete failed: ' + (err.message || String(err)), 'error');
              }
            });
          });
          break;
        }
        case 'post-sale': {
          const [rows, opts] = await Promise.all([
            Api.postSaleEvents.list({ policy_id: policyId }),
            Api.postSaleEvents.options(),
          ]);
          const canDeletePostSale = window.currentUser?.role === 'admin';

          tabEl.innerHTML = `
            <div class="tab-toolbar" style="display:flex;justify-content:space-between;align-items:center;padding:.75rem 1rem;border-bottom:1px solid var(--border,#dee2e6);">
              <div style="font-size:.85rem;color:#666;">
                TCF Outcome 6 — track cancellations, switches, lapses, amendments.
                Events with days-to-action &gt; 5 or outcome = Refused are auto-flagged as a barrier.
              </div>
              <button class="btn btn-primary btn-sm" id="add-post-sale-btn">+ Log Post-Sale Event</button>
            </div>
            ${rows.length ? `
            <div class="table-responsive"><table class="table">
              <thead><tr>
                <th>Date</th><th>Type</th><th>Outcome</th><th>Days</th><th>Barrier</th><th></th>
              </tr></thead>
              <tbody>${rows.map(r => `
                <tr style="${r.barrier_flagged ? 'background:#fff4e5;' : ''}">
                  <td>${esc(r.event_date)}</td>
                  <td>${esc(r.event_type)}</td>
                  <td>${esc(r.outcome || '—')}</td>
                  <td>${r.days_to_action != null ? r.days_to_action : '—'}</td>
                  <td>${r.barrier_flagged ? '<span style="color:#c0392b;font-weight:600;">⚠ Yes</span>' : 'No'}</td>
                  <td style="white-space:nowrap;">
                    <button class="btn btn-xs btn-outline js-edit-post-sale" data-id="${r.id}">Edit</button>
                    ${canDeletePostSale ? `<button class="btn btn-xs btn-danger js-delete-post-sale" data-id="${r.id}">Delete</button>` : ''}
                  </td>
                </tr>`).join('')}</tbody>
            </table></div>` : `<p class="tab-empty">No post-sale events logged.</p>`}
          `;

          function openPostSaleModal(event = {}) {
            const isEdit = !!event.id;
            const today  = new Date().toISOString().slice(0, 10);
            const dd = (name, values, selected) => `
              <select name="${name}" class="form-control">
                <option value="">—</option>
                ${values.map(v => `<option value="${esc(v)}" ${selected === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
              </select>`;
            const body = `
              <form id="pse-modal-form">
                <input type="hidden" name="policy_id" value="${policyId}">
                <div class="form-grid form-grid-2">
                  <div class="form-group">
                    <label class="form-label required">Event type *</label>
                    ${dd('event_type', opts.event_type, event.event_type)}
                  </div>
                  <div class="form-group">
                    <label class="form-label required">Event date *</label>
                    <input type="date" class="form-control" name="event_date" value="${esc(event.event_date || today)}" required>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Request method</label>
                    ${dd('request_method', opts.request_method, event.request_method)}
                  </div>
                  <div class="form-group">
                    <label class="form-label">Date actioned</label>
                    <input type="date" class="form-control" name="date_actioned" value="${esc(event.date_actioned || '')}">
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Outcome</label>
                  ${dd('outcome', opts.outcome, event.outcome)}
                </div>
                <div class="form-group">
                  <label class="form-label">Notes</label>
                  <textarea class="form-control" name="outcome_notes" rows="3">${esc(event.outcome_notes || '')}</textarea>
                </div>
              </form>`;
            _openModal(isEdit ? 'Edit Post-Sale Event' : 'Log Post-Sale Event', body,
              `<button class="btn btn-primary" id="save-pse-btn">${isEdit ? 'Update' : 'Log Event'}</button>`);

            document.getElementById('save-pse-btn').addEventListener('click', async () => {
              const form = document.getElementById('pse-modal-form');
              const fd = new FormData(form);
              const payload = Object.fromEntries(fd.entries());
              if (!payload.event_type || !payload.event_date) {
                showToast('Event type and event date are required.', 'error');
                return;
              }
              try {
                if (isEdit && Api.postSaleEvents.update) await Api.postSaleEvents.update(event.id, payload);
                else                                     await Api.postSaleEvents.create(payload);
                _closeModal();
                showToast(isEdit ? 'Event updated.' : 'Event logged.', 'success');
                loadPolicyTab(policyId, 'post-sale');
              } catch (err) { showToast(err.message, 'error'); }
            });
          }

          document.getElementById('add-post-sale-btn').addEventListener('click', () => openPostSaleModal());
          tabEl.querySelectorAll('.js-edit-post-sale').forEach(btn => {
            btn.addEventListener('click', () => {
              const event = rows.find(r => String(r.id) === btn.dataset.id);
              if (event) openPostSaleModal(event);
            });
          });
          if (canDeletePostSale) {
            tabEl.querySelectorAll('.js-delete-post-sale').forEach(btn => {
              btn.addEventListener('click', async () => {
                if (!confirm('Delete this post-sale event? This cannot be undone.')) return;
                try {
                  await Api.postSaleEvents.delete(btn.dataset.id);
                  showToast('Event deleted.', 'success');
                  loadPolicyTab(policyId, 'post-sale');
                } catch (err) { showToast(err.message, 'error'); }
              });
            });
          }
          break;
        }
        case 'quotes': {
          await renderQuotesTab(tabEl, policyId);
          break;
        }
      }
    } catch (err) {
      tabEl.innerHTML = `<div class="alert alert-danger">Failed to load tab: ${esc(err.message)}</div>`;
    }
  }

  // ── Quotes tab: upload, list, approve, delete ────────────────────────────
  async function renderQuotesTab(tabEl, policyId) {
    const res = await Api.policies.quotesList(policyId).catch(() => ({ data: [] }));
    const quotes = res.data || res || [];
    const anyApproved = quotes.some(q => !!q.approved_at);

    tabEl.innerHTML = `
      <div style="padding:.85rem 1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:.85rem;">
          <div style="font-size:.85rem;color:var(--text-light);">
            ${anyApproved
              ? '✅ At least one Quote or Existing Schedule is approved — this policy can be set to <strong>Active</strong>.'
              : '⚠ Upload either a Quote or an Existing Schedule and mark it approved before this policy can be set to <strong>Active</strong>.'}
          </div>
          <div style="display:flex;gap:.4rem;">
            <label class="btn btn-sm btn-primary" for="quote-upload-input" style="margin:0;">+ Upload Quote</label>
            <input type="file" id="quote-upload-input" style="display:none;"
              accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.doc,.xls,.txt" />
            <label class="btn btn-sm btn-secondary" for="schedule-upload-input" style="margin:0;">+ Upload Existing Schedule</label>
            <input type="file" id="schedule-upload-input" style="display:none;"
              accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.doc,.xls,.txt" />
          </div>
        </div>

        ${quotes.length ? `
        <div class="table-responsive">
          <table class="table" style="font-size:.85rem;">
            <thead><tr>
              <th>Uploaded</th><th>Type</th><th>File</th><th>Size</th><th>Approved</th><th></th>
            </tr></thead>
            <tbody>
              ${quotes.map(q => {
                const docType = (q.document_type === 'schedule') ? 'schedule' : 'quote';
                const typeBadge = docType === 'schedule'
                  ? '<span class="badge badge-info">Existing Schedule</span>'
                  : '<span class="badge badge-secondary">Quote</span>';
                const approveLabel = docType === 'schedule' ? 'Schedule approved' : 'Quote approved';
                const docLabel = docType === 'schedule' ? 'existing schedule' : 'quote';
                return `
                <tr>
                  <td>${q.uploaded_at ? formatDate(q.uploaded_at) : '—'}</td>
                  <td>${typeBadge}</td>
                  <td>
                    <a href="${Api.policies.quoteViewUrl(q.id)}" target="_blank" rel="noopener">
                      ${esc(q.original_name || q.file_name)}
                    </a>
                  </td>
                  <td>${formatBytes(q.file_size)}</td>
                  <td>
                    ${q.approved_at
                      ? `<span style="color:var(--success);font-weight:600;">✓ ${formatDate(q.approved_at)}</span>${q.approved_by_name ? `<br><span style="font-size:.75rem;color:var(--text-light);">by ${esc(q.approved_by_name)}</span>` : ''}`
                      : '<span style="color:var(--text-muted);">Pending</span>'}
                  </td>
                  <td style="white-space:nowrap;text-align:right;">
                    <a class="btn btn-xs btn-outline" href="${Api.policies.quoteViewUrl(q.id)}" target="_blank" rel="noopener">View</a>
                    ${!q.approved_at
                      ? `<button class="btn btn-xs btn-success js-quote-approve" data-id="${q.id}" data-name="${esc(q.original_name || q.file_name)}" data-doctype="${docType}">${approveLabel}</button>`
                      : ''}
                    <button class="btn btn-xs btn-danger js-quote-del" data-id="${q.id}" data-name="${esc(q.original_name || q.file_name)}" data-doc-label="${docLabel}">Delete</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>` : '<p class="tab-empty" style="padding:.5rem 0;">No quotes or schedules uploaded yet.</p>'}
      </div>`;

    // Upload — quote
    const inp = document.getElementById('quote-upload-input');
    inp?.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('document_type', 'quote');
        await Api.policies.quoteUpload(policyId, fd);
        showToast('Quote uploaded.', 'success');
        renderQuotesTab(tabEl, policyId);
      } catch (err) {
        showToast('Upload failed: ' + (err.message || err), 'error');
      }
    });

    // Upload — existing schedule (same endpoint, document_type=schedule)
    const sched = document.getElementById('schedule-upload-input');
    sched?.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('document_type', 'schedule');
        await Api.policies.quoteUpload(policyId, fd);
        showToast('Existing schedule uploaded.', 'success');
        renderQuotesTab(tabEl, policyId);
      } catch (err) {
        showToast('Upload failed: ' + (err.message || err), 'error');
      }
    });

    // Approve
    tabEl.querySelectorAll('.js-quote-approve').forEach(btn => {
      btn.addEventListener('click', () => openQuoteApproveModal(btn.dataset.id, btn.dataset.name, () => renderQuotesTab(tabEl, policyId)));
    });

    // Delete
    tabEl.querySelectorAll('.js-quote-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const label = btn.dataset.docLabel || 'quote';
        if (!confirm(`Delete ${label} "${btn.dataset.name}"?`)) return;
        try {
          await Api.policies.quoteDelete(btn.dataset.id);
          showToast(`${label.charAt(0).toUpperCase()}${label.slice(1)} deleted.`, 'success');
          renderQuotesTab(tabEl, policyId);
        } catch (err) {
          showToast('Delete failed: ' + (err.message || err), 'error');
        }
      });
    });
  }

  // Centred approval modal asking for the date the quote was approved.
  function openQuoteApproveModal(quoteId, quoteName, onDone) {
    document.getElementById('quote-approve-overlay')?.remove();

    const today = new Date().toISOString().slice(0, 10);
    const overlay = document.createElement('div');
    overlay.id = 'quote-approve-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="width:420px;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title">Approve Quote</h3>
          <button class="modal-close" id="qa-close" type="button">×</button>
        </div>
        <div class="modal-body">
          <p style="font-size:.85rem;color:var(--text-light);margin-bottom:1rem;">
            ${esc(quoteName)}
          </p>
          <div class="form-group" style="margin:0;">
            <label class="form-label required">Date approved</label>
            <input type="date" id="qa-date" class="form-control" value="${today}" max="${today}" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="qa-cancel" type="button">Cancel</button>
          <button class="btn btn-success" id="qa-confirm" type="button">Mark Approved</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { /* click-outside-to-close disabled */ void e; });
    overlay.querySelector('#qa-close').addEventListener('click', close);
    overlay.querySelector('#qa-cancel').addEventListener('click', close);
    overlay.querySelector('#qa-confirm').addEventListener('click', async () => {
      const dateEl = overlay.querySelector('#qa-date');
      const approved_at = dateEl?.value;
      if (!approved_at) {
        showToast('Please pick a date.', 'error');
        return;
      }
      try {
        await Api.policies.quoteApprove(quoteId, { approved_at });
        showToast('Quote marked as approved.', 'success');
        close();
        if (typeof onDone === 'function') onDone();
      } catch (err) {
        showToast('Approve failed: ' + (err.message || err), 'error');
      }
    });
  }

  // ── Amendment Mail ────────────────────────────────────────────────────────

  async function _amendmentMail(policyId) {
    let data = {};
    try {
      const res = await fetch(`/api/policies/${policyId}/amendment-changes`, { credentials: 'same-origin' });
      if (res.ok) data = await res.json();
    } catch (_) {}

    const clientName = data.client_name || '';
    const policyNum = data.policy_number || '';
    const brokerCode = data.broker_code || '';
    const brokerName = data.broker_name || window.currentUser?.full_name || '';
    const today = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
    const changes = data.changes || [];

    const changeLines = changes.length
      ? changes.map((c, i) => `${i + 1}. ${c.description}`).join('\n')
      : '1. (No changes recorded in the last 24 hours — please describe the amendment manually)';

    const policyLine = brokerCode
      ? `Policy Number: ${policyNum}, Broker Code: ${brokerCode}`
      : `Policy Number: ${policyNum}`;

    const emailBody =
`Good Day,

Please do the following Amendments to the Policy of ${clientName}, ${policyLine} with effect of Today ${today}:

${changeLines}

Please confirm the Amendment.

Regards,

${brokerName}`;

    const subject = brokerCode
      ? `Amendments to Policy ${policyNum} (Broker Code ${brokerCode})`
      : `Amendments to Policy ${policyNum}`;

    const modal = document.createElement('div');
    modal.id = 'amendment-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="width:600px;max-height:90vh;display:flex;flex-direction:column;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>Send Amendment Notification</h3>
          <button class="btn-close" onclick="document.getElementById('amendment-modal').remove()">×</button>
        </div>
        <div class="modal-body" style="overflow-y:auto;">
          <div id="amend-error" style="display:none;color:var(--danger);margin-bottom:.75rem;"></div>
          <div class="form-group">
            <label class="form-label">To (Insurer Email)</label>
            <input class="form-control" id="amend-to" placeholder="insurer@example.com">
          </div>
          <div class="form-group">
            <label class="form-label">Subject</label>
            <input class="form-control" id="amend-subject" value="${esc(subject)}">
          </div>
          <div class="form-group">
            <label class="form-label">Email Body <span style="font-size:.75rem;color:var(--text-muted);font-weight:normal;">(editable)</span></label>
            <textarea class="form-control" id="amend-body" rows="14" style="font-family:inherit;white-space:pre-wrap;">${esc(emailBody)}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('amendment-modal').remove()">Cancel</button>
          <button class="btn btn-primary" id="amend-send-btn" onclick="Policies._sendAmendment()">Send Amendment</button>
        </div>
      </div>`;
    modal.dataset.policyId = policyId;
    /* backdrop-close disabled */
    document.body.appendChild(modal);
  }

  async function _sendAmendment() {
    const modal = document.getElementById('amendment-modal');
    const amendPolicyId = modal ? parseInt(modal.dataset.policyId, 10) : null;
    const to = document.getElementById('amend-to')?.value?.trim();
    const subject = document.getElementById('amend-subject')?.value?.trim();
    const body = document.getElementById('amend-body')?.value?.trim();
    const errEl = document.getElementById('amend-error');
    const btn = document.getElementById('amend-send-btn');

    if (!to || !subject || !body) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'To, Subject and Body are required.'; }
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
    try {
      const htmlBody = body.replace(/\n/g, '<br>');
      await Api.settings.sendEmail({ to, subject, html: htmlBody, text: body, audit_module: 'policies', audit_record_id: amendPolicyId });
      document.getElementById('amendment-modal')?.remove();
      showToast('Amendment notification sent successfully', 'success');
    } catch (e) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = e.message; }
      if (btn) { btn.disabled = false; btn.textContent = 'Send Amendment'; }
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return { list, form, detail, _amendmentMail, _sendAmendment };

})();
