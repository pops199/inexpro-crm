/* ═══════════════════════════════════════════════════════════════════════════
   Claims component  —  Insurance Claims (spec section 13)
   ═══════════════════════════════════════════════════════════════════════════ */

const Claims = (() => {

  // ── Global modal helpers ─────────────────────────────────────────────────
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

  const CLAIM_TYPES = [
    'Motor',
    'Property',
    'Liability',
    'GIT',
    'Theft',
    'Fire',
    'Other',
  ];

  const CLAIM_STATUSES = [
    'Notified',
    'In Progress',
    'Awaiting Documents',
    'Settled',
    'Rejected',
    'Closed',
    'Disputed',
  ];

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
    return [{ id: '', full_name: '— Select —' }, ...users].map(u =>
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

  function policyOptions(policies, selectedId) {
    return [{ id: '', policy_name: '— Select Policy —' }, ...policies].map(p =>
      `<option value="${esc(p.id)}" ${String(p.id) === String(selectedId) ? 'selected' : ''}>${esc(p.policy_name || '')}</option>`
    ).join('');
  }


  function assetOptions(assets, selectedId) {
    return [{ id: '', asset_name: '— None —' }, ...assets].map(a =>
      `<option value="${esc(a.id)}" ${String(a.id) === String(selectedId) ? 'selected' : ''}>${esc(a.asset_name || '')}</option>`
    ).join('');
  }

  function adviceRecordOptions(records, selectedId) {
    return [{ id: '', name: '— None —' }, ...records].map(r =>
      `<option value="${esc(r.id)}" ${String(r.id) === String(selectedId) ? 'selected' : ''}>${esc(r.name || r.advice_name || r.id || '')}</option>`
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

  function readClaimContacts(host) {
    if (!host) return [];
    return Array.from(host.querySelectorAll('.claim-contact-row')).map(r => ({
      contact_type: r.querySelector('.claim-contact-type')?.value || '',
      name:         r.querySelector('.claim-contact-name')?.value?.trim() || '',
      cell:         r.querySelector('.claim-contact-cell')?.value?.trim() || '',
      email:        r.querySelector('.claim-contact-email')?.value?.trim() || '',
    })).filter(c => c.contact_type || c.name || c.cell || c.email);
  }

  // ── List ─────────────────────────────────────────────────────────────────

  // ── Catalog cell renderers ──────────────────────────────────────────────
  const CLAIM_CELLS = {
    claim_number:        c => `<a href="#/claims/${c.id}">${esc(c.claim_number || '—')}</a>`,
    policy_name:         c => c.policy_id ? `<a href="#/policies/${c.policy_id}">${esc(c.policy_name || '—')}</a>` : esc(c.policy_name || '—'),
    party_name:          c => esc(c.contact_name || c.account_name || '—'),
    claim_type:          c => esc(c.claim_type || '—'),
    claim_status:        c => statusBadgeHtml(c.claim_status),
    claim_date:          c => c.claim_date ? formatDate(c.claim_date) : '—',
    date_reported:       c => c.date_reported ? formatDate(c.date_reported) : '—',
    estimated_value:     c => c.estimated_value != null ? formatCurrency(c.estimated_value) : '—',
    settlement_amount:   c => c.settlement_amount != null ? formatCurrency(c.settlement_amount) : '—',
    delay_flag:          c => c.delay_flag ? '<span title="Delay Flagged" style="color:#c62828;font-size:16px;">&#128681;</span>' : '—',
    fair_process_concern: c => c.fair_process_concern ? '<span style="color:#c0392b;font-weight:600;">⚑</span>' : '—',
    dispute_raised:      c => c.dispute_raised ? 'Yes' : 'No',
    client_kept_informed: c => c.client_kept_informed ? 'Yes' : 'No',
    broker_name:         c => esc(c.broker_name || '—'),
    claims_handler_name: c => esc(c.claims_handler_name || '—'),
    last_client_update_date: c => c.last_client_update_date ? formatDate(c.last_client_update_date) : '—',
    created_at:          c => c.created_at ? formatDate(c.created_at) : '—',
    updated_at:          c => c.updated_at ? formatDate(c.updated_at) : '—',
    actions:             c => `
      <a href="#/claims/${c.id}" class="btn btn-sm btn-secondary">View</a>
      <a href="#/claims/${c.id}/edit" class="btn btn-sm btn-primary">Edit</a>
      <button class="btn btn-sm btn-danger" data-delete-id="${c.id}" data-delete-name="${esc(c.claim_number || '')}">Delete</button>`,
  };

  let _claimCatalog = null;
  let _claimConfig  = null;

  async function list() {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    setPageTitle('Claims');
    setBreadcrumb(['Claims']);

    const ctrlStyle = 'height:28px;padding:.15rem .4rem;font-size:.78rem;line-height:1;';
    const headerActions = document.getElementById('header-actions');
    if (headerActions) {
      headerActions.innerHTML = `<a href="#/claims/new" class="btn btn-primary" style="${ctrlStyle}">+ New Claim</a>`;
    }

    const filters = getFiltersFromHash();

    // Default the broker filter to the logged-in admin so they land on
    // *their own* claims first. The dropdown still lets them pick another
    // broker, and the Clear button resets the in-page dropdown to All Brokers.
    // Brokers fall through unchanged (broker-isolated server-side); admin_only
    // isn't in the broker dropdown so a self-filter would return zero.
    const isAdmin = window.currentUser?.role === 'admin';
    if (isAdmin && filters.broker_id === undefined && window.currentUser?.id) {
      filters.broker_id = String(window.currentUser.id);
    }

    try {
      const prefs = await ViewPrefs.load('claims');
      _claimCatalog = prefs.catalog;
      _claimConfig  = prefs.config;

      const [claimsRes, usersRes] = await Promise.all([
        Api.claims.list({
          ...filters,
          limit: 200,
          sort: _claimConfig.sortBy,
          dir:  _claimConfig.sortDir,
        }),
        Api.admin.users(),
      ]);

      const claims = claimsRes.data || claimsRes || [];
      const users  = usersRes.data  || usersRes  || [];

      const typeFilter    = filters.claim_type  || '';
      const statusFilter  = filters.status      || '';
      const brokerFilter  = filters.broker_id   || '';
      const searchFilter  = filters.q           || '';

      const visibleCols = ViewPrefs.visibleColumns(_claimCatalog, _claimConfig);
      const colCount = visibleCols.length || 1;

      const headCells = visibleCols.map(col => {
        const active = _claimConfig.sortBy === col.id;
        const arrow  = active ? (_claimConfig.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
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
                <thead><tr id="claim-thead-row">${headCells}</tr></thead>
                <tbody id="claim-tbody">
                  <tr><td colspan="${colCount}" class="table-empty">Loading…</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      document.getElementById('claims-center-filters')?.remove();
      const topHeader = document.getElementById('top-header');
      if (topHeader) {
        topHeader.style.position = 'relative';
        const wrap = document.createElement('div');
        wrap.id = 'claims-center-filters';
        wrap.setAttribute('data-header-widget', '1');
        wrap.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;gap:.5rem;align-items:center;z-index:2;background:var(--bg);padding:.3rem .55rem;border-radius:6px;';
        wrap.innerHTML = `
          <input type="search" id="claim-search" class="form-control" placeholder="Search…"
            value="${esc(searchFilter)}"
            style="${ctrlStyle}width:160px;">
          <select id="claim-filter-type" class="form-control" style="${ctrlStyle}max-width:140px;">
            <option value="">Type</option>
            ${CLAIM_TYPES.map(t => `<option value="${esc(t)}" ${typeFilter === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
          </select>
          <select id="claim-filter-status" class="form-control" style="${ctrlStyle}max-width:140px;">
            <option value="">Status</option>
            ${CLAIM_STATUSES.map(s => `<option value="${esc(s)}" ${statusFilter === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
          </select>
          <select id="claim-filter-broker" class="form-control" style="${ctrlStyle}max-width:140px;">
            <option value="">Broker</option>
            ${users.map(u => `<option value="${esc(u.id)}" ${String(brokerFilter) === String(u.id) ? 'selected' : ''}>${esc(u.full_name || u.username)}</option>`).join('')}
          </select>
          <button id="claim-filter-clear" class="btn btn-secondary" style="${ctrlStyle}">Clear</button>`;
        topHeader.appendChild(wrap);
      }

      // ⚙ Columns button
      ViewPrefs.attachButton({
        moduleKey: 'claims',
        catalog:   _claimCatalog,
        current:   _claimConfig,
        onChange:  (newCfg) => { _claimConfig = newCfg; list(); },
      });

      renderTableRows(claims, searchFilter);
      bindFilterEvents(users);

      el.querySelectorAll('#claim-thead-row th.sortable').forEach(th => {
        th.addEventListener('click', async () => {
          const col = th.dataset.sort;
          if (_claimConfig.sortBy === col) {
            _claimConfig.sortDir = _claimConfig.sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            _claimConfig.sortBy = col;
            _claimConfig.sortDir = 'asc';
          }
          try { const r = await Api.viewPrefs.save('claims', _claimConfig); _claimConfig = r.config; } catch (_) {}
          list();
        });
      });

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load claims: ${esc(err.message)}</div>`;
    }
  }

  function renderTableRows(claims, search) {
    const tbody = document.getElementById('claim-tbody');
    if (!tbody) return;
    const visibleCols = _claimCatalog ? ViewPrefs.visibleColumns(_claimCatalog, _claimConfig) : [];
    const colCount = visibleCols.length || 1;

    let rows = claims;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(c =>
        (c.claim_number  || '').toLowerCase().includes(q) ||
        (c.policy_name   || '').toLowerCase().includes(q) ||
        (c.contact_name  || '').toLowerCase().includes(q) ||
        (c.account_name  || '').toLowerCase().includes(q)
      );
    }

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${colCount}" class="table-empty">No claims found.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(c => `<tr${c.delay_flag ? ' class="row-flagged"' : ''}>${visibleCols.map(col => {
      const fn = CLAIM_CELLS[col.id];
      const extraClass = col.id === 'actions' ? ' class="actions-cell"' :
                         col.id === 'delay_flag' ? ' style="text-align:center;"' : '';
      return `<td${extraClass}>${fn ? fn(c) : esc(String(c[col.id] ?? '—'))}</td>`;
    }).join('')}</tr>`).join('');

    tbody.querySelectorAll('[data-delete-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id   = btn.dataset.deleteId;
        const name = btn.dataset.deleteName;
        if (!confirmDialog(`Delete claim "${name}"? This cannot be undone.`)) return;
        try {
          await Api.claims.delete(id);
          showToast('Claim deleted.', 'success');
          list();
        } catch (err) {
          showToast('Delete failed: ' + err.message, 'error');
        }
      });
    });
  }

  function bindFilterEvents(users) {
    const searchEl  = document.getElementById('claim-search');
    const typeEl    = document.getElementById('claim-filter-type');
    const statusEl  = document.getElementById('claim-filter-status');
    const brokerEl  = document.getElementById('claim-filter-broker');
    const clearEl   = document.getElementById('claim-filter-clear');

    const applyFilters = debounce(async () => {
      const params = {};
      if (searchEl.value.trim()) params.q          = searchEl.value.trim();
      if (typeEl.value)          params.claim_type = typeEl.value;
      if (statusEl.value)        params.status     = statusEl.value;
      if (brokerEl.value)        params.broker_id  = brokerEl.value;
      if (_claimConfig) { params.sort = _claimConfig.sortBy; params.dir = _claimConfig.sortDir; }
      try {
        const res = await Api.claims.list({ ...params, limit: 200 });
        renderTableRows(res.data || res || [], params.q || '');
      } catch (err) {
        showToast('Filter error: ' + err.message, 'error');
      }
    }, 350);

    if (searchEl) searchEl.addEventListener('input', applyFilters);
    if (typeEl)   typeEl.addEventListener('change', applyFilters);
    if (statusEl) statusEl.addEventListener('change', applyFilters);
    if (brokerEl) brokerEl.addEventListener('change', applyFilters);

    if (clearEl) {
      clearEl.addEventListener('click', () => {
        if (searchEl) searchEl.value = '';
        if (typeEl)   typeEl.value   = '';
        if (statusEl) statusEl.value = '';
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
    setPageTitle(isEdit ? 'Edit Claim' : 'New Claim');
    setBreadcrumb(['Claims', isEdit ? 'Edit' : 'New']);

    const headerActions = document.getElementById('header-actions');
    if (headerActions) headerActions.innerHTML = '';

    const hashParams = getFiltersFromHash();

    try {
      const [usersRes, contactsRes, accountsRes, policiesRes, assetsRes, adviceRes, claimData] = await Promise.all([
        Api.admin.users(),
        Api.contacts.list({ limit: 500 }),
        Api.accounts.list({ limit: 500 }),
        Api.policies.list({ limit: 500 }),
        Api.assets.list({ limit: 500 }),
        Api.adviceRecords.list({ limit: 500 }).catch(() => ({ data: [] })),
        isEdit ? Api.claims.get(id) : Promise.resolve({}),
      ]);

      const users    = usersRes.data    || usersRes    || [];
      const contacts = contactsRes.data || contactsRes || [];
      const accounts = accountsRes.data || accountsRes || [];
      const policies = policiesRes.data || policiesRes || [];
      const assets   = assetsRes.data   || assetsRes   || [];
      const advice   = adviceRes.data   || adviceRes   || [];
      const d        = claimData.data   || claimData   || {};

      // Block editing settled claims — redirect to detail view
      if (isEdit && d.claim_status === 'Settled') {
        showToast('This claim is settled and locked for editing.', 'error');
        navigate(`claims/${id}`);
        return;
      }

      if (!isEdit) {
        if (hashParams.policy_id)  d.policy_id  = hashParams.policy_id;
        if (hashParams.contact_id) d.contact_id = hashParams.contact_id;
        if (hashParams.account_id) d.account_id = hashParams.account_id;
        if (hashParams.asset_id)   d.asset_id   = hashParams.asset_id;
      }

      el.innerHTML = `
        <div class="form-page">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">${isEdit ? 'Edit Claim' : 'New Claim'}</h3>
            </div>
            <form id="claim-form" novalidate>

              <!-- ── Core Details ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Core Details</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label required">Claim Number</label>
                    <input type="text" name="claim_number" class="form-control" required
                      value="${esc(d.claim_number || '')}" placeholder="e.g. CLM-2024-0001" />
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Claim Status</label>
                    <select name="claim_status" class="form-control" required>
                      ${selectOpts(CLAIM_STATUSES, d.claim_status, '— Select Status —')}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Policy</label>
                    <select name="policy_id" class="form-control" required>
                      ${policyOptions(policies, d.policy_id)}
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
                    <label class="form-label required">Asset</label>
                    <select name="asset_id" class="form-control" id="claim-asset-select" required>
                      ${assetOptions(assets, d.asset_id)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Broker</label>
                    <select name="broker_id" class="form-control">
                      ${userOptions(users, d.broker_id)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Claim Type</label>
                    <select name="claim_type" class="form-control" required>
                      ${selectOpts(CLAIM_TYPES, d.claim_type, '— Select Type —')}
                    </select>
                  </div>

                </div>
              </fieldset>

              <!-- ── Claim Related Contacts ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Claim Related Contacts</legend>
                <div id="claim-related-contacts-rows"></div>
                <div style="margin-top:.5rem;">
                  <button type="button" class="btn btn-secondary btn-sm" id="add-claim-contact-btn">+ Add Contact</button>
                </div>
              </fieldset>

              <!-- ── Dates & Incident ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Dates &amp; Incident</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label required">Claim Date</label>
                    <input type="date" name="claim_date" class="form-control" required
                      value="${esc(d.claim_date ? d.claim_date.slice(0,10) : '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Date Reported</label>
                    <input type="date" name="date_reported" class="form-control" required
                      value="${esc(d.date_reported ? d.date_reported.slice(0,10) : '')}" />
                  </div>

                  <div class="form-group form-group-full">
                    <label class="form-label required">Incident Description</label>
                    <textarea name="incident_description" class="form-control" rows="4" required>${esc(d.incident_description || '')}</textarea>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Estimated Value</label>
                    <div class="input-prefix-group">
                      <span class="input-prefix cur-label">R</span>
                      <input type="number" name="estimated_value" class="form-control" step="0.01" min="0"
                        value="${esc(d.estimated_value || '')}" />
                    </div>
                  </div>

                </div>
              </fieldset>

              <!-- ── Driver Details (vehicle claim types) ── -->
              <fieldset class="form-section" id="claim-driver-details-block"
                style="${['Motor','GIT'].includes(d.claim_type) ? '' : 'display:none;'}">
                <legend class="form-section-title">Driver Details</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label">Driver Name</label>
                    <input type="text" name="driver_name" class="form-control"
                      value="${esc(d.driver_name || '')}" placeholder="Full name" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">ID Number</label>
                    <input type="text" name="driver_id_number" class="form-control"
                      value="${esc(d.driver_id_number || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Licence Number</label>
                    <input type="text" name="driver_licence_number" class="form-control"
                      value="${esc(d.driver_licence_number || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Licence Code</label>
                    <select name="driver_licence_code" class="form-control">
                      ${selectOpts(['A','A1','B','EB','C1','C','EC1','EC'], d.driver_licence_code, '— Select —')}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Cell Number</label>
                    <input type="text" name="driver_cell" class="form-control"
                      value="${esc(d.driver_cell || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Relationship to Insured</label>
                    <select name="driver_relationship" class="form-control">
                      ${selectOpts(['Insured','Spouse','Family Member','Employee','Authorised Driver','Other'], d.driver_relationship, '— Select —')}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Date of Birth</label>
                    <input type="date" name="driver_date_of_birth" class="form-control"
                      value="${esc(d.driver_date_of_birth ? d.driver_date_of_birth.slice(0,10) : '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Years of Experience</label>
                    <input type="number" name="driver_years_experience" class="form-control" min="0" max="100" step="1"
                      value="${esc(d.driver_years_experience != null ? d.driver_years_experience : '')}" />
                  </div>

                </div>
              </fieldset>

              <!-- ── Client Communication ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Client Communication</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="checklist-item">
                      <input type="checkbox" name="client_kept_informed"
                        ${d.client_kept_informed ? 'checked' : ''} />
                      <span>Client Kept Informed</span>
                    </label>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Last Client Update Date</label>
                    <input type="date" name="last_client_update_date" class="form-control"
                      value="${esc(d.last_client_update_date ? d.last_client_update_date.slice(0,10) : '')}" />
                  </div>

                </div>
              </fieldset>

              <!-- ── Conduct & Dispute ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Conduct &amp; Dispute</legend>

                <div id="delay-warning" class="alert alert-warning" style="${d.delay_flag ? '' : 'display:none;'}">
                  &#9888; <strong>Delay Flag Active</strong> — This claim has been flagged for processing delay. Ensure the client has been informed and the file is escalated.
                </div>

                <div class="checklist-grid">

                  <label class="checklist-item">
                    <input type="checkbox" name="delay_flag" id="claim-delay-flag"
                      ${d.delay_flag ? 'checked' : ''} />
                    <span class="text-danger"><strong>Delay Flag</strong></span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="fair_process_concern" id="claim-fair-process"
                      ${d.fair_process_concern ? 'checked' : ''} />
                    <span class="text-danger"><strong>Fair Process Concern</strong></span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="dispute_raised" id="claim-dispute"
                      ${d.dispute_raised ? 'checked' : ''} />
                    <span>Dispute Raised</span>
                  </label>

                </div>

                <div class="form-group" id="claim-dispute-details-group"
                  style="margin-top:12px; ${d.dispute_raised ? '' : 'display:none;'}">
                  <label class="form-label">Dispute Details</label>
                  <textarea name="dispute_details" class="form-control" rows="3">${esc(d.dispute_details || '')}</textarea>
                </div>

              </fieldset>

              <!-- ── Excess ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Excess</legend>
                <input type="hidden" id="claim-asset-value-hidden" value="${esc(d.asset_value != null ? d.asset_value : '')}" />
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label">Basic Excess (<span class="cur-label">R</span>)</label>
                    <input type="number" name="excess" id="claim-excess" class="form-control" min="0" step="0.01"
                      placeholder="0.00" value="${esc(d.excess != null ? d.excess : '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Excess % of Claim Value <span style="font-weight:400;color:var(--text-muted);">(optional)</span></label>
                    <input type="number" name="excess_pct_claim" id="claim-excess-pct-claim" class="form-control"
                      min="0" max="100" step="0.01" placeholder="e.g. 10"
                      value="${esc(d.excess_pct_claim != null ? d.excess_pct_claim : '')}" />
                    <small id="claim-excess-pct-claim-calc" style="color:var(--text-muted);margin-top:.2rem;display:block;"></small>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Excess % of Insured Value <span style="font-weight:400;color:var(--text-muted);">(optional)</span></label>
                    <input type="number" name="excess_pct_insured" id="claim-excess-pct-insured" class="form-control"
                      min="0" max="100" step="0.01" placeholder="e.g. 2.5"
                      value="${esc(d.excess_pct_insured != null ? d.excess_pct_insured : '')}" />
                    <small id="claim-excess-pct-insured-calc" style="color:var(--text-muted);margin-top:.2rem;display:block;"></small>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Minimum Excess (<span class="cur-label">R</span>)</label>
                    <input type="number" name="minimum_excess" id="claim-minimum-excess" class="form-control"
                      min="0" step="0.01" placeholder="0.00"
                      value="${esc(d.minimum_excess != null ? d.minimum_excess : '')}" />
                  </div>

                </div>
              </fieldset>

              <!-- ── Settlement ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Settlement &amp; Outcome</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label">Settlement Amount</label>
                    <div class="input-prefix-group">
                      <span class="input-prefix cur-label">R</span>
                      <input type="number" name="settlement_amount" class="form-control" step="0.01" min="0"
                        value="${esc(d.settlement_amount || '')}" />
                    </div>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Settlement Date</label>
                    <input type="date" name="settlement_date" class="form-control"
                      value="${esc(d.settlement_date ? d.settlement_date.slice(0,10) : '')}" />
                  </div>

                  <div class="form-group form-group-full">
                    <label class="form-label">Rejection Reason</label>
                    <textarea name="rejection_reason" class="form-control" rows="2">${esc(d.rejection_reason || '')}</textarea>
                  </div>

                  <div class="form-group form-group-full">
                    <label class="form-label">Outcome Notes</label>
                    <textarea name="outcome_notes" class="form-control" rows="3">${esc(d.outcome_notes || '')}</textarea>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Related Advice Record</label>
                    <select name="advice_record_id" class="form-control">
                      ${adviceRecordOptions(advice, d.advice_record_id)}
                    </select>
                  </div>

                </div>
              </fieldset>

              <!-- ── Third Party Details ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Third Party Details</legend>
                <div class="form-grid form-grid-2">
                  <div class="form-group">
                    <label class="form-label">Surname</label>
                    <input type="text" name="tp_surname" class="form-control" value="${esc(d.tp_surname || '')}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Initials</label>
                    <input type="text" name="tp_initials" class="form-control" value="${esc(d.tp_initials || '')}" />
                  </div>
                  <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">Address</label>
                    <textarea name="tp_address" class="form-control" rows="2">${esc(d.tp_address || '')}</textarea>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Cell No</label>
                    <input type="tel" name="tp_cell_no" class="form-control" value="${esc(d.tp_cell_no || '')}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Telephone No</label>
                    <input type="tel" name="tp_telephone_no" class="form-control" value="${esc(d.tp_telephone_no || '')}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Occupation</label>
                    <input type="text" name="tp_occupation" class="form-control" value="${esc(d.tp_occupation || '')}" />
                  </div>
                </div>
                <fieldset style="border:1px solid var(--border,#dee2e6);border-radius:6px;padding:.75rem 1rem;margin:.75rem 0;">
                  <legend style="font-size:.85rem;font-weight:600;padding:0 .5rem;">Particulars of Vehicle</legend>
                  <div class="form-grid form-grid-2">
                    <div class="form-group">
                      <label class="form-label">Make</label>
                      <input type="text" name="tp_vehicle_make" class="form-control" value="${esc(d.tp_vehicle_make || '')}" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Model</label>
                      <input type="text" name="tp_vehicle_model" class="form-control" value="${esc(d.tp_vehicle_model || '')}" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Reg Number</label>
                      <input type="text" name="tp_vehicle_reg" class="form-control" value="${esc(d.tp_vehicle_reg || '')}" />
                    </div>
                  </div>
                </fieldset>
                <div class="form-group">
                  <label class="form-label">Description of Damage</label>
                  <textarea name="tp_damage_description" class="form-control" rows="2">${esc(d.tp_damage_description || '')}</textarea>
                </div>
                <div class="form-group" style="display:flex;align-items:center;gap:1.5rem;">
                  <span class="form-label" style="margin:0;">Is the other party insured?</span>
                  <label style="display:flex;align-items:center;gap:.35rem;">
                    <input type="radio" name="tp_is_insured" value="1" id="tp-insured-yes" ${d.tp_is_insured ? 'checked' : ''} /> Yes
                  </label>
                  <label style="display:flex;align-items:center;gap:.35rem;">
                    <input type="radio" name="tp_is_insured" value="0" id="tp-insured-no" ${d.tp_is_insured ? '' : 'checked'} /> No
                  </label>
                </div>
                <div class="form-group" id="tp-insurer-form-group" style="${d.tp_is_insured ? '' : 'display:none;'}">
                  <label class="form-label">Insurance Company</label>
                  <input type="text" name="tp_insurer" class="form-control" value="${esc(d.tp_insurer || '')}" />
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
                <button type="submit" class="btn btn-primary" id="claim-submit-btn">
                  ${isEdit ? 'Save Changes' : 'Create Claim'}
                </button>
                <a href="${isEdit ? `#/claims/${id}` : '#/claims'}" class="btn btn-secondary">Cancel</a>
              </div>

            </form>
          </div>
        </div>
      `;

      bindFormEvents(id, isEdit, d);
      wireClaimGate(policies, assets);
      wireClaimCrossFilters(d, isEdit, policies, assets);

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load form: ${esc(err.message)}</div>`;
    }
  }

  // ── Cross-filter: keep policy ↔ asset ↔ contact/account in sync ─────────
  // Selecting any of policy/contact/account narrows the asset dropdown to
  // only the matching assets. Selecting an asset auto-fills the policy plus
  // the asset's account or contact. The filter only kicks in when a
  // selection is made — defaults still expose every option.
  function wireClaimCrossFilters(d, isEdit, policies, assets) {
    const formEl = document.getElementById('claim-form');
    if (!formEl) return;
    const polSel = formEl.querySelector('[name="policy_id"]');
    const ctcSel = formEl.querySelector('[name="contact_id"]');
    const accSel = formEl.querySelector('[name="account_id"]');
    const astSel = formEl.querySelector('[name="asset_id"]');
    if (!polSel || !ctcSel || !accSel || !astSel) return;

    // Searchable wrappers (applied earlier by wireContactAccountToggle for
    // policy/contact/account) freeze their option cache and visible text,
    // so any programmatic value/option change must be followed by a sync.
    const sync = (s) => { if (typeof s._searchableSync === 'function') s._searchableSync(); };

    let _suppressLoop = false;

    function refilterAssets() {
      const polId = polSel.value;
      const ctcId = ctcSel.value;
      const accId = accSel.value;
      let filtered = assets;
      if (polId) filtered = filtered.filter(a => String(a.policy_id)  === String(polId));
      if (ctcId) filtered = filtered.filter(a => String(a.contact_id) === String(ctcId));
      if (accId) filtered = filtered.filter(a => String(a.account_id) === String(accId));
      const currentAst = astSel.value;
      astSel.innerHTML = assetOptions(filtered, currentAst);
      if (currentAst && !filtered.some(a => String(a.id) === String(currentAst))) {
        astSel.value = '';
      }
      sync(astSel);
    }

    function refilterPolicies() {
      const ctcId = ctcSel.value;
      const accId = accSel.value;
      let filtered = policies;
      if (ctcId) filtered = filtered.filter(p => String(p.contact_id) === String(ctcId));
      if (accId) filtered = filtered.filter(p => String(p.account_id) === String(accId));
      const currentPol = polSel.value;
      polSel.innerHTML = policyOptions(filtered, currentPol);
      if (currentPol && !filtered.some(p => String(p.id) === String(currentPol))) {
        polSel.value = '';
      }
      sync(polSel);
    }

    function autoFillFromAsset(assetId) {
      if (!assetId) return;
      const a = assets.find(x => String(x.id) === String(assetId));
      if (!a) return;
      if (a.policy_id  && polSel.value !== String(a.policy_id))  { polSel.value = String(a.policy_id);  sync(polSel); }
      if (a.account_id && accSel.value !== String(a.account_id)) { accSel.value = String(a.account_id); sync(accSel); }
      if (a.contact_id && ctcSel.value !== String(a.contact_id)) { ctcSel.value = String(a.contact_id); sync(ctcSel); }
    }

    function autoFillFromPolicy(policyId) {
      if (!policyId) return;
      const p = policies.find(x => String(x.id) === String(policyId));
      if (!p) return;
      if (p.account_id && accSel.value !== String(p.account_id)) { accSel.value = String(p.account_id); sync(accSel); }
      if (p.contact_id && ctcSel.value !== String(p.contact_id)) { ctcSel.value = String(p.contact_id); sync(ctcSel); }
    }

    polSel.addEventListener('change', () => {
      if (_suppressLoop) return;
      _suppressLoop = true;
      autoFillFromPolicy(polSel.value);
      refilterAssets();
      _suppressLoop = false;
    });
    astSel.addEventListener('change', () => {
      if (_suppressLoop) return;
      _suppressLoop = true;
      autoFillFromAsset(astSel.value);
      refilterPolicies();
      refilterAssets();
      _suppressLoop = false;
    });
    ctcSel.addEventListener('change', () => {
      if (_suppressLoop) return;
      _suppressLoop = true;
      refilterPolicies();
      refilterAssets();
      _suppressLoop = false;
    });
    accSel.addEventListener('change', () => {
      if (_suppressLoop) return;
      _suppressLoop = true;
      refilterPolicies();
      refilterAssets();
      _suppressLoop = false;
    });

    // Initial pass — apply prefills from hash params (policy_id, asset_id, etc.)
    if (!isEdit) {
      _suppressLoop = true;
      if (d.policy_id) autoFillFromPolicy(d.policy_id);
      if (d.asset_id)  autoFillFromAsset(d.asset_id);
      refilterPolicies();
      refilterAssets();
      _suppressLoop = false;
    }
  }

  // ── Inline gate: warn when policy isn't Active or asset isn't Active ────
  function wireClaimGate(policies, assets) {
    const formEl = document.getElementById('claim-form');
    if (!formEl) return;
    const polSel = formEl.querySelector('[name="policy_id"]');
    const astSel = formEl.querySelector('[name="asset_id"]');
    if (!polSel) return;

    let warnEl = formEl.querySelector('#claim-gate-warn');
    if (!warnEl) {
      warnEl = document.createElement('div');
      warnEl.id = 'claim-gate-warn';
      warnEl.style.cssText = `
        margin:.5rem 0 .75rem; padding:.6rem .85rem;
        background:#fdecea; border-left:3px solid #c0392b;
        color:#7a1f15; font-size:.83rem; border-radius:4px;
        display:none;
      `;
      polSel.closest('.form-group')?.parentNode?.insertBefore(
        warnEl, polSel.closest('.form-group')
      );
    }

    const update = () => {
      const issues = [];
      if (polSel.value) {
        const p = policies.find(x => String(x.id) === String(polSel.value));
        if (p) {
          if (p.policy_status !== 'Active') {
            issues.push(`Policy ${p.policy_number || p.policy_name} is ${p.policy_status} — only Active policies can have new claims.`);
          }
          if (p.cancellation_date) {
            issues.push(`Policy ${p.policy_number || p.policy_name} has a cancellation date on record.`);
          }
        }
      }
      if (astSel?.value) {
        const a = assets.find(x => String(x.id) === String(astSel.value));
        if (a && a.asset_status !== 'Active') {
          issues.push(`Asset "${a.asset_name}" is ${a.asset_status} — only Active assets can have new claims.`);
        }
      }
      if (issues.length) {
        warnEl.innerHTML = `🚫 <strong>Claim cannot be created:</strong><ul style="margin:.3rem 0 0 1.2rem;">${issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
        warnEl.style.display = '';
      } else {
        warnEl.style.display = 'none';
      }
    };

    polSel.addEventListener('change', update);
    astSel?.addEventListener('change', update);
    update();
  }

  function bindFormEvents(id, isEdit, d) {
    const formEl       = document.getElementById('claim-form');
    const delayFlagEl  = document.getElementById('claim-delay-flag');
    const delayWarning = document.getElementById('delay-warning');
    const disputeEl    = document.getElementById('claim-dispute');
    const disputeGroup = document.getElementById('claim-dispute-details-group');

    // Third party "is insured" radio toggle
    document.querySelectorAll('input[name="tp_is_insured"]').forEach(r => {
      r.addEventListener('change', () => {
        const grp = document.getElementById('tp-insurer-form-group');
        if (grp) grp.style.display = (r.value === '1' && r.checked) ? '' : 'none';
      });
    });

    // Delay flag toggle
    if (delayFlagEl && delayWarning) {
      delayFlagEl.addEventListener('change', () => {
        delayWarning.style.display = delayFlagEl.checked ? '' : 'none';
      });
    }

    // Asset selection — auto-populate excess fields from asset
    const assetSelectEl = document.getElementById('claim-asset-select');
    async function populateExcessFromAsset(assetId) {
      if (!assetId) return;
      try {
        const res = await Api.assets.get(assetId);
        const a = res.data || res;
        const setVal = (id, val) => {
          const el = document.getElementById(id);
          if (el && val != null) el.value = val;
        };
        setVal('claim-excess',             a.excess);
        setVal('claim-excess-pct-claim',   a.excess_pct_claim);
        setVal('claim-excess-pct-insured', a.excess_pct_insured);
        setVal('claim-minimum-excess',     a.minimum_excess);
        // Store asset value for % of insured calculation
        const avEl = document.getElementById('claim-asset-value-hidden');
        if (avEl) avEl.value = a.asset_value || a.sum_insured || '';
        if (typeof refreshClCalcs === 'function') refreshClCalcs();
      } catch (_) {}
    }
    if (assetSelectEl && !isEdit) {
      assetSelectEl.addEventListener('change', () => populateExcessFromAsset(assetSelectEl.value));
      // If asset was pre-filled from hash params, auto-populate excess immediately
      if (assetSelectEl.value) populateExcessFromAsset(assetSelectEl.value);
    }

    // Dispute raised toggle
    if (disputeEl && disputeGroup) {
      disputeEl.addEventListener('change', () => {
        disputeGroup.style.display = disputeEl.checked ? '' : 'none';
      });
    }

    // Excess % auto-calculation
    const clExcessEl    = document.getElementById('claim-excess');
    const clPctClaim    = document.getElementById('claim-excess-pct-claim');
    const clPctInsured  = document.getElementById('claim-excess-pct-insured');
    const clMinExcessEl = document.getElementById('claim-minimum-excess');
    const clBaseEl      = document.querySelector('[name="estimated_value"]');   // for % of claim
    const clAssetValEl  = document.getElementById('claim-asset-value-hidden'); // for % of insured

    function clEffective(pct, base, min) {
      if (!pct || !base) return null;
      const raw = (pct / 100) * base;
      return (min > 0 && raw < min) ? min : raw;
    }
    function fmtRcl(v) {
      const curEl = formEl.querySelector('[name="currency"]');
      const sym = currencySymbol(curEl ? curEl.value : 'ZAR');
      return sym + '\u00a0' + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function refreshClCalcs() {
      const claimBase   = parseFloat(clBaseEl     ? clBaseEl.value     : 0) || 0;
      const insuredBase = parseFloat(clAssetValEl ? clAssetValEl.value : 0) || claimBase;
      const min  = parseFloat(clMinExcessEl ? clMinExcessEl.value : 0) || 0;
      const pctC = parseFloat(clPctClaim    ? clPctClaim.value    : 0) || 0;
      const pctI = parseFloat(clPctInsured  ? clPctInsured.value  : 0) || 0;

      const calcClaim   = document.getElementById('claim-excess-pct-claim-calc');
      const calcInsured = document.getElementById('claim-excess-pct-insured-calc');

      const effC = clEffective(pctC, claimBase,   min);
      const effI = clEffective(pctI, insuredBase, min);

      if (calcClaim)   calcClaim.textContent   = effC !== null ? ('= ' + fmtRcl(effC)   + (min > 0 && (pctC/100)*claimBase   < min ? ' (min. excess applies)' : '')) : (pctC > 0 ? 'Enter estimated claim value to calculate' : '');
      if (calcInsured) calcInsured.textContent = effI !== null ? ('= ' + fmtRcl(effI) + (min > 0 && (pctI/100)*insuredBase < min ? ' (min. excess applies)' : '')) : (pctI > 0 ? 'Enter estimated value or select asset to calculate' : '');

      // Auto-fill excess Rand field
      if (clExcessEl) {
        const result = effC ?? effI;
        if (result !== null) clExcessEl.value = result.toFixed(2);
      }
    }
    if (clPctClaim && clPctInsured) {
      [clPctClaim, clPctInsured, clMinExcessEl, clBaseEl, clAssetValEl].forEach(el => {
        if (el) el.addEventListener('input', refreshClCalcs);
      });
      refreshClCalcs();
    }

    wireContactAccountToggle(formEl);
    wireCurrencySelector(formEl);

    // ── Driver Details visibility based on claim_type ──
    const claimTypeSelect = document.querySelector('[name="claim_type"]');
    const driverBlock     = document.getElementById('claim-driver-details-block');
    if (claimTypeSelect && driverBlock) {
      const applyDriverVis = () => {
        driverBlock.style.display = ['Motor','GIT'].includes(claimTypeSelect.value) ? '' : 'none';
      };
      claimTypeSelect.addEventListener('change', applyDriverVis);
      applyDriverVis();
    }

    // ── Claim Related Contacts repeater ──
    const CLAIM_CONTACT_TYPES = ['Company Representative','Claims Handler','Assessor','3rd Party','Legal Representative','Supplier'];
    const claimContactsHost = document.getElementById('claim-related-contacts-rows');
    const addClaimContactBtn = document.getElementById('add-claim-contact-btn');
    const renderClaimContactRow = (row = {}, idx) => {
      const typeOptions = ['', ...CLAIM_CONTACT_TYPES].map(t =>
        `<option value="${esc(t)}" ${row.contact_type === t ? 'selected' : ''}>${t ? esc(t) : '— Type —'}</option>`).join('');
      return `
        <div class="claim-contact-row" data-idx="${idx}"
          style="display:grid;grid-template-columns:1.2fr 1.2fr 1fr 1.4fr auto;gap:.4rem;margin-bottom:.4rem;align-items:center;">
          <select class="form-control claim-contact-type">${typeOptions}</select>
          <input type="text" class="form-control claim-contact-name" placeholder="Name"
            value="${esc(row.name || '')}" />
          <input type="text" class="form-control claim-contact-cell" placeholder="Cell Number"
            value="${esc(row.cell || '')}" />
          <input type="email" class="form-control claim-contact-email" placeholder="Email Address"
            value="${esc(row.email || '')}" />
          <button type="button" class="btn btn-sm btn-danger remove-claim-contact-btn" style="white-space:nowrap;">✕</button>
        </div>`;
    };
    const redrawClaimContacts = (rows) => {
      if (!claimContactsHost) return;
      claimContactsHost.innerHTML = rows.map((r, i) => renderClaimContactRow(r, i)).join('');
    };
    let initialClaimContacts = [];
    try { initialClaimContacts = JSON.parse((d && d.claim_related_contacts) || '[]') || []; } catch (_) {}
    if (!Array.isArray(initialClaimContacts)) initialClaimContacts = [];
    redrawClaimContacts(initialClaimContacts);
    if (addClaimContactBtn) {
      addClaimContactBtn.addEventListener('click', () => {
        if (!claimContactsHost) return;
        const current = readClaimContacts(claimContactsHost);
        current.push({ contact_type: '', name: '', cell: '', email: '' });
        redrawClaimContacts(current);
      });
    }
    if (claimContactsHost) {
      claimContactsHost.addEventListener('click', (e) => {
        const rm = e.target.closest('.remove-claim-contact-btn');
        if (!rm) return;
        const rowEl = rm.closest('.claim-contact-row');
        if (rowEl) rowEl.remove();
      });
    }

    if (formEl) {
      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('claim-submit-btn');
        // Asset is mandatory — a claim must always be raised against an asset.
        const assetSel = document.getElementById('claim-asset-select');
        if (!assetSel || !assetSel.value) {
          if (assetSel) {
            assetSel.style.borderColor = '#c0392b';
            assetSel.focus();
          }
          showToast('Please select an asset before saving the claim.', 'error');
          return;
        }
        if (btn) btn.disabled = true;
        const data = serializeForm(formEl);
        // Serialize Claim Related Contacts
        data.claim_related_contacts = JSON.stringify(readClaimContacts(claimContactsHost));
        // Extract third party fields (tp_ prefix) from the main form data
        const tpData = {};
        for (const k of Object.keys(data)) {
          if (k.startsWith('tp_')) {
            tpData[k.slice(3)] = data[k]; // strip tp_ prefix
            delete data[k];
          }
        }
        // Convert is_insured radio to int
        if (tpData.is_insured !== undefined) tpData.is_insured = tpData.is_insured === '1' ? 1 : 0;
        const hasTp = Boolean(tpData.surname);

        try {
          if (isEdit) {
            await Api.claims.update(id, data);
            // Save/update third party if filled
            if (hasTp) await Api.claims.thirdPartiesCreate(id, tpData);
            showToast('Claim updated.', 'success');
            navigate(`claims/${id}`);
          } else {
            const created = await Api.claims.create(data);
            const newId   = (created.data || created).id;
            // Save third party if filled
            if (hasTp) await Api.claims.thirdPartiesCreate(newId, tpData);
            showToast('Claim created.', 'success');
            // Ask user if they want to send the claim to the insurer
            if (confirm('Claim created successfully. Would you like to send this claim to the insurer?')) {
              navigate(`claims/${newId}`);
              setTimeout(() => { Claims._sendClaimMail(newId); }, 400);
            } else {
              navigate(`claims/${newId}`);
            }
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
    if (headerActions) headerActions.innerHTML = '';

    try {
      const res = await Api.claims.get(id);
      const d   = res.data || res || {};

      const isSettled = d.claim_status === 'Settled';
      const isAdmin   = window.currentUser?.role === 'admin';

      if (headerActions) {
        if (isSettled) {
          // Settled: no edit, show re-open for admin only
          headerActions.innerHTML = `
            <button class="btn btn-secondary" onclick="Claims._sendClaimMail(${id})">Send to Underwriter</button>
            <button class="btn btn-secondary" onclick="Claims._openClaimEmailModal(${id})">Email</button>
            ${isAdmin ? `<button class="btn btn-warning" onclick="Claims._reopenClaim(${id})">Re-open Claim</button>` : ''}`;
        } else {
          headerActions.innerHTML = `
            <button class="btn btn-secondary" onclick="Claims._sendClaimMail(${id})">Send to Underwriter</button>
            <button class="btn btn-secondary" onclick="Claims._openClaimEmailModal(${id})">Email</button>
            <a href="#/claims/${id}/edit" class="btn btn-primary">Edit</a>`;
        }
      }

      setPageTitle(esc(d.claim_number || 'Claim'));
      setBreadcrumb(['Claims', d.claim_number || 'Detail']);

      const hasDelayFlag   = Boolean(d.delay_flag);
      const hasFairProcess = Boolean(d.fair_process_concern);

      const field = (label, value) => `<div class="detail-field"><span class="detail-label">${label}</span><span class="detail-value">${value || '—'}</span></div>`;
      const bool  = (v) => v ? `<span class="bool-yes">&#10003; Yes</span>` : `<span class="bool-no">&#10007; No</span>`;
      const curSym = currencySymbol(d.currency || 'ZAR');
      const fmtCur = (v) => (v != null && v !== '') ? `${curSym} ` + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

      el.innerHTML = `
        <div class="detail-view">

          <!-- SETTLED / LOCKED BANNER -->
          ${isSettled ? `
          <div class="alert alert-warning" style="display:flex;align-items:center;gap:.75rem;">
            <strong>SETTLED &mdash; LOCKED</strong> This claim is settled and locked for editing.${isAdmin ? ' You can re-open it using the button above.' : ' Only an admin can re-open this claim.'}
          </div>` : ''}

          <!-- WARNING BANNERS -->
          ${hasDelayFlag ? `
          <div class="alert alert-danger">
            &#128681; <strong>DELAY FLAG</strong> — This claim has been flagged for processing delay.
            ${d.last_client_update_date ? ` Last client update: ${formatDate(d.last_client_update_date)}.` : ' Client has not been recently updated.'}
          </div>` : ''}

          ${hasFairProcess ? `
          <div class="alert alert-danger">
            &#9888; <strong>FAIR PROCESS CONCERN</strong> — A fair process concern has been raised on this claim.
          </div>` : ''}

          ${d.dispute_raised ? `
          <div class="alert alert-warning">
            &#9888; <strong>Dispute Raised</strong>${d.dispute_details ? ` — ${esc(d.dispute_details)}` : ''}
          </div>` : ''}

          <!-- Claim Details -->
          <div class="detail-section card">
            <div class="detail-section-title">Claim Details</div>
            <div class="detail-grid">
              ${field('Claim Number', esc(d.claim_number || '—'))}
              ${field('Claim Type', esc(d.claim_type || '—'))}
              ${field('Status', statusBadgeHtml(d.claim_status))}
              ${field('Claim Date', d.claim_date ? formatDate(d.claim_date) : '—')}
              ${field('Date Reported', d.date_reported ? formatDate(d.date_reported) : '—')}
            </div>
          </div>

          <!-- Parties -->
          <div class="detail-section card">
            <div class="detail-section-title">Parties</div>
            <div class="detail-grid">
              ${field('Contact', d.contact_id ? `<a href="#/contacts/${d.contact_id}">${esc(d.contact_name || '—')}</a>` : esc(d.contact_name || '—'))}
              ${field('Account', d.account_id ? `<a href="#/accounts/${d.account_id}">${esc(d.account_name || '—')}</a>` : esc(d.account_name || '—'))}
              ${field('Policy', d.policy_id ? `<a href="#/policies/${d.policy_id}">${esc(d.policy_name || '—')}</a>` : '—')}
              ${field('Policy Section', d.policy_section_id ? `<a href="#/policy-sections/${d.policy_section_id}">${esc(d.section_name || '—')}</a>` : '—')}
              ${field('Asset', d.asset_id ? `<a href="#/assets/${d.asset_id}">${esc(d.asset_name || '—')}</a>` : '—')}
              ${field('Broker', esc(d.broker_name || '—'))}
            </div>
          </div>

          <!-- Claim Related Contacts -->
          ${(() => {
            let rows = [];
            try { rows = JSON.parse(d.claim_related_contacts || '[]') || []; } catch (_) {}
            if (!Array.isArray(rows) || !rows.length) return '';
            return `
            <div class="detail-section card">
              <div class="detail-section-title">Claim Related Contacts</div>
              <table class="table" style="margin:0;">
                <thead><tr><th>Type</th><th>Name</th><th>Cell</th><th>Email</th></tr></thead>
                <tbody>
                  ${rows.map(r => `<tr>
                    <td>${esc(r.contact_type || '—')}</td>
                    <td>${esc(r.name || '—')}</td>
                    <td>${esc(r.cell || '—')}</td>
                    <td>${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '—'}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>`;
          })()}

          <!-- Financial -->
          <div class="detail-section card">
            <div class="detail-section-title">Financial</div>
            <div class="detail-grid">
              ${field('Estimated Value', d.estimated_value ? fmtCur(d.estimated_value) : '—')}
              ${field('Settlement Amount', d.settlement_amount ? fmtCur(d.settlement_amount) : '—')}
              ${field('Settlement Date', d.settlement_date ? formatDate(d.settlement_date) : '—')}
              ${d.excess != null ? field('Basic Excess', fmtCur(d.excess)) : ''}
              ${d.excess_pct_claim != null ? field('Excess (% of Claim)',
                  d.estimated_value != null
                    ? fmtCur(Math.max((d.excess_pct_claim / 100) * d.estimated_value, d.minimum_excess || 0))
                    : d.excess_pct_claim + '%')
                : ''}
              ${d.excess_pct_insured != null ? field('Excess (% of Insured)',
                  d.estimated_value != null
                    ? fmtCur(Math.max((d.excess_pct_insured / 100) * d.estimated_value, d.minimum_excess || 0))
                    : d.excess_pct_insured + '%')
                : ''}
              ${d.minimum_excess != null ? field('Minimum Excess', fmtCur(d.minimum_excess)) : ''}
            </div>
          </div>

          <!-- Driver Details -->
          ${(d.driver_name || d.driver_id_number || d.driver_licence_number || d.driver_cell || d.driver_relationship) ? `
          <div class="detail-section card">
            <div class="detail-section-title">Driver Details</div>
            <div class="detail-grid">
              ${d.driver_name ? field('Driver Name', esc(d.driver_name)) : ''}
              ${d.driver_id_number ? field('ID Number', esc(d.driver_id_number)) : ''}
              ${d.driver_licence_number ? field('Licence Number', esc(d.driver_licence_number)) : ''}
              ${d.driver_licence_code ? field('Licence Code', esc(d.driver_licence_code)) : ''}
              ${d.driver_cell ? field('Cell Number', esc(d.driver_cell)) : ''}
              ${d.driver_relationship ? field('Relationship to Insured', esc(d.driver_relationship)) : ''}
              ${d.driver_date_of_birth ? field('Date of Birth', formatDate(d.driver_date_of_birth)) : ''}
              ${d.driver_years_experience != null ? field('Years of Experience', esc(d.driver_years_experience)) : ''}
            </div>
          </div>` : ''}

          <!-- Client Communication -->
          <div class="detail-section card">
            <div class="detail-section-title">Client Communication</div>
            <div class="detail-grid">
              ${field('Client Kept Informed', bool(d.client_kept_informed))}
              ${field('Last Client Update Date', d.last_client_update_date ? formatDate(d.last_client_update_date) : '—')}
              ${field('Delay Flag', bool(d.delay_flag))}
              ${field('Fair Process Concern', bool(d.fair_process_concern))}
            </div>
          </div>

          <!-- Dispute -->
          ${d.dispute_raised ? `
          <div class="detail-section card">
            <div class="detail-section-title">Dispute</div>
            <div class="detail-text-fields">
              ${d.dispute_details ? `<div class="detail-text-item"><strong>Dispute Details</strong><p>${esc(d.dispute_details)}</p></div>` : ''}
            </div>
          </div>` : ''}

          <!-- Incident Description -->
          ${d.incident_description ? `
          <div class="detail-section card">
            <div class="detail-section-title">Incident Description</div>
            <p class="detail-notes">${esc(d.incident_description)}</p>
          </div>` : ''}

          <!-- Outcome -->
          ${d.rejection_reason || d.outcome_notes ? `
          <div class="detail-section card">
            <div class="detail-section-title">Outcome</div>
            <div class="detail-text-fields">
              ${d.rejection_reason ? `<div class="detail-text-item"><strong>Rejection Reason</strong><p>${esc(d.rejection_reason)}</p></div>` : ''}
              ${d.outcome_notes ? `<div class="detail-text-item"><strong>Outcome Notes</strong><p>${esc(d.outcome_notes)}</p></div>` : ''}
            </div>
          </div>` : ''}

          <!-- Notes -->
          ${d.notes ? `
          <div class="detail-section card">
            <div class="detail-section-title">Notes</div>
            <p class="detail-notes">${esc(d.notes)}</p>
          </div>` : ''}

          <!-- Tabs -->
          <div class="detail-tabs card">
            <div class="tabs-header" id="claim-tabs-header">
              <button class="tab-btn active" data-tab="timeline">Timeline</button>
              <button class="tab-btn"        data-tab="notes">Notes</button>
              <button class="tab-btn"        data-tab="third-parties">Third Parties</button>
              <button class="tab-btn"        data-tab="assets">Assets</button>
              <button class="tab-btn"        data-tab="documents">Documents</button>
              <button class="tab-btn"        data-tab="workflows">Workflows</button>
              <button class="tab-btn"        data-tab="versions">Versions</button>
            </div>
            <div class="tab-content" id="claim-tab-content">
              <div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>
            </div>
          </div>

        </div>
      `;

      loadClaimTab(id, 'timeline');

      document.getElementById('claim-tabs-header').querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#claim-tabs-header .tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          loadClaimTab(id, btn.dataset.tab);
        });
      });

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load claim: ${esc(err.message)}</div>`;
    }
  }

  async function loadClaimTab(claimId, tab) {
    const tabEl = document.getElementById('claim-tab-content');
    if (!tabEl) return;
    tabEl.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    try {
      switch (tab) {
        case 'timeline': {
          const entries = await Api.timeline.forRecord('claims', claimId);
          const rows = Array.isArray(entries) ? entries : (entries.data || []);
          tabEl.innerHTML = `<div style="padding:.75rem 1rem;">${renderTimeline(rows, 'No activity recorded yet.')}</div>`;
          break;
        }
        case 'assets': {
          const clRes = await Api.claims.get(claimId);
          const cl = clRes.data || clRes || {};
          const assetRows = [];
          // Fetch only the asset directly linked to the claim
          if (cl.asset_id) {
            try {
              const ar = await Api.assets.get(cl.asset_id);
              const a = ar.data || ar || {};
              if (a.id) assetRows.push(a);
            } catch (_) {}
          }
          await Assets.renderAssetsTab(tabEl, assetRows, {
            emptyMsg: 'No asset linked to this claim.',
          });
          break;
        }
        case 'documents': {
          const res = await Api.documents.list({ module: 'claims', record_id: claimId });
          const docs = (res.data || []);
          tabEl.innerHTML = `
            <div class="tab-toolbar">
              <label class="btn btn-primary btn-sm" for="claim-doc-upload">+ Upload Document</label>
              <input type="file" id="claim-doc-upload" style="display:none;"
                accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.csv" />
            </div>
            ${docs.length ? `
            <table class="table">
              <thead><tr><th>File Name</th><th>Type</th><th>Size</th><th>Uploaded By</th><th>Date</th><th></th></tr></thead>
              <tbody>${docs.map(d => `
                <tr>
                  <td>${esc(d.original_name)}</td>
                  <td>${esc(d.file_type || '—')}</td>
                  <td>${d.file_size || '—'}</td>
                  <td>${esc(d.uploaded_by_name || '—')}</td>
                  <td>${d.uploaded_at ? formatDate(d.uploaded_at) : '—'}</td>
                  <td style="white-space:nowrap;">
                    <a href="/api/documents/${d.id}/view" target="_blank" class="btn btn-xs btn-outline">View</a>
                    <button class="btn btn-xs btn-danger doc-del-btn" data-doc-id="${d.id}" data-doc-name="${esc(d.original_name)}">Delete</button>
                  </td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No documents uploaded yet.</p>`}
          `;
          document.getElementById('claim-doc-upload').addEventListener('change', async e => {
            const file = e.target.files[0];
            if (!file) return;
            try {
              const fd = new FormData();
              fd.append('file', file);
              fd.append('module', 'claims');
              fd.append('record_id', claimId);
              await Api.documents.upload(fd);
              showToast('Document uploaded.', 'success');
              loadClaimTab(claimId, 'documents');
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
                loadClaimTab(claimId, 'documents');
              } catch (err) {
                showToast('Delete failed: ' + (err.message || err), 'error');
              }
            });
          });
          break;
        }
        case 'notes': {
          const notes = await Api.claims.notesList(claimId);
          const rows = Array.isArray(notes) ? notes : (notes.data || []);
          tabEl.innerHTML = `
            <div class="tab-toolbar">
              <button class="btn btn-primary btn-sm" id="add-claim-note-btn">+ Add Note</button>
            </div>
            ${rows.length ? `
            <table class="table">
              <thead><tr><th>Date</th><th>Details</th><th>Expected Outcome</th><th>Captured By</th></tr></thead>
              <tbody>${rows.map(n => `
                <tr class="js-note-row" data-note-id="${n.id}" style="cursor:pointer;">
                  <td>${n.note_date ? formatDate(n.note_date) : '—'}</td>
                  <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(n.details)}</td>
                  <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(n.expected_outcome || '—')}</td>
                  <td>${esc(n.created_by_name || '—')}</td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No notes yet. Click "+ Add Note" to add one.</p>`}
          `;
          // Open note popup on row click
          tabEl.querySelectorAll('.js-note-row').forEach(row => {
            row.addEventListener('click', (e) => {
              const noteId = row.dataset.noteId;
              const n = rows.find(r => String(r.id) === noteId);
              if (!n) return;
              _openModal('Note Details', `
                <div class="detail-grid" style="gap:.75rem;">
                  <div class="detail-field"><span class="detail-label">Date</span><span class="detail-value">${n.note_date ? formatDate(n.note_date) : '—'}</span></div>
                  <div class="detail-field"><span class="detail-label">Captured By</span><span class="detail-value">${esc(n.created_by_name || '—')}</span></div>
                  <div class="detail-field" style="grid-column:1/-1;"><span class="detail-label">Details</span><span class="detail-value" style="white-space:pre-wrap;">${esc(n.details)}</span></div>
                  <div class="detail-field" style="grid-column:1/-1;"><span class="detail-label">Expected Outcome</span><span class="detail-value" style="white-space:pre-wrap;">${esc(n.expected_outcome || '—')}</span></div>
                  <div class="detail-field"><span class="detail-label">Created</span><span class="detail-value">${n.created_at ? formatDateTime(n.created_at) : '—'}</span></div>
                </div>`, '');
            });
          });
          // Add note
          document.getElementById('add-claim-note-btn')?.addEventListener('click', () => {
            const today = new Date().toISOString().slice(0,10);
            _openModal('Add Note', `
              <form id="claim-note-form">
                <div class="form-group"><label class="form-label required">Date</label><input type="date" name="note_date" class="form-control" value="${today}" required /></div>
                <div class="form-group"><label class="form-label required">Details</label><textarea name="details" class="form-control" rows="4" required></textarea></div>
                <div class="form-group"><label class="form-label">Expected Outcome</label><textarea name="expected_outcome" class="form-control" rows="2"></textarea></div>
              </form>`,
              `<button class="btn btn-primary" id="save-claim-note-btn">Save Note</button>`);
            document.getElementById('save-claim-note-btn')?.addEventListener('click', async () => {
              const form = document.getElementById('claim-note-form');
              const data = { note_date: form.note_date.value, details: form.details.value, expected_outcome: form.expected_outcome.value };
              if (!data.details) { showToast('Details are required.', 'error'); return; }
              try {
                await Api.claims.notesCreate(claimId, data);
                _closeModal();
                showToast('Note added.', 'success');
                loadClaimTab(claimId, 'notes');
              } catch (err) { showToast('Failed: ' + (err.message || err), 'error'); }
            });
          });
          break;
        }
        case 'third-parties': {
          const tps = await Api.claims.thirdPartiesList(claimId);
          const rows = Array.isArray(tps) ? tps : (tps.data || []);
          tabEl.innerHTML = `
            <div class="tab-toolbar">
              <button class="btn btn-primary btn-sm" id="add-claim-tp-btn">+ Add Third Party</button>
            </div>
            ${rows.length ? `
            <table class="table">
              <thead><tr><th>Surname</th><th>Initials</th><th>Cell No</th><th>Vehicle</th><th>Insured?</th><th></th></tr></thead>
              <tbody>${rows.map(tp => `
                <tr>
                  <td>${esc(tp.surname)}</td>
                  <td>${esc(tp.initials || '—')}</td>
                  <td>${esc(tp.cell_no || '—')}</td>
                  <td>${esc([tp.vehicle_make, tp.vehicle_model, tp.vehicle_reg].filter(Boolean).join(' ') || '—')}</td>
                  <td>${tp.is_insured ? '<span class="bool-yes">Yes</span>' + (tp.insurer ? ' — ' + esc(tp.insurer) : '') : '<span class="bool-no">No</span>'}</td>
                  <td style="white-space:nowrap;">
                    <button class="btn btn-xs btn-outline js-view-tp" data-tp-id="${tp.id}" title="View details" aria-label="View details">👁</button>
                    <button class="btn btn-xs btn-outline js-edit-tp" data-tp-id="${tp.id}">Edit</button>
                    <button class="btn btn-xs btn-danger js-del-tp" data-tp-id="${tp.id}" data-tp-name="${esc(tp.surname)}">Delete</button>
                  </td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No third parties recorded.</p>`}
          `;
          function openTpForm(tp = {}, tpOpts = {}) {
            const isEditing = Boolean(tp.id);
            const readOnly  = !!tpOpts.readOnly;
            const title = readOnly
              ? 'Third Party Details'
              : (isEditing ? 'Edit Third Party' : 'Add Third Party');
            const insuredChecked = tp.is_insured ? 'checked' : '';
            const notInsuredChecked = tp.is_insured ? '' : 'checked';
            _openModal(title, `
              <form id="claim-tp-form">
                <div class="form-grid form-grid-2">
                  <div class="form-group"><label class="form-label required">Surname</label><input type="text" name="surname" class="form-control" value="${esc(tp.surname || '')}" required /></div>
                  <div class="form-group"><label class="form-label">Initials</label><input type="text" name="initials" class="form-control" value="${esc(tp.initials || '')}" /></div>
                  <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Address</label><textarea name="address" class="form-control" rows="2">${esc(tp.address || '')}</textarea></div>
                  <div class="form-group"><label class="form-label">Cell No</label><input type="tel" name="cell_no" class="form-control" value="${esc(tp.cell_no || '')}" /></div>
                  <div class="form-group"><label class="form-label">Telephone No</label><input type="tel" name="telephone_no" class="form-control" value="${esc(tp.telephone_no || '')}" /></div>
                  <div class="form-group"><label class="form-label">Occupation</label><input type="text" name="occupation" class="form-control" value="${esc(tp.occupation || '')}" /></div>
                </div>
                <fieldset style="border:1px solid var(--border,#dee2e6);border-radius:6px;padding:.75rem 1rem;margin:.75rem 0;">
                  <legend style="font-size:.85rem;font-weight:600;padding:0 .5rem;">Particulars of Vehicle</legend>
                  <div class="form-grid form-grid-2">
                    <div class="form-group"><label class="form-label">Make</label><input type="text" name="vehicle_make" class="form-control" value="${esc(tp.vehicle_make || '')}" /></div>
                    <div class="form-group"><label class="form-label">Model</label><input type="text" name="vehicle_model" class="form-control" value="${esc(tp.vehicle_model || '')}" /></div>
                    <div class="form-group"><label class="form-label">Reg Number</label><input type="text" name="vehicle_reg" class="form-control" value="${esc(tp.vehicle_reg || '')}" /></div>
                  </div>
                </fieldset>
                <div class="form-group"><label class="form-label">Description of Damage</label><textarea name="damage_description" class="form-control" rows="2">${esc(tp.damage_description || '')}</textarea></div>
                <div class="form-group" style="display:flex;align-items:center;gap:1.5rem;">
                  <span class="form-label" style="margin:0;">Is the other party insured?</span>
                  <label style="display:flex;align-items:center;gap:.35rem;"><input type="radio" name="is_insured" value="1" ${insuredChecked} /> Yes</label>
                  <label style="display:flex;align-items:center;gap:.35rem;"><input type="radio" name="is_insured" value="0" ${notInsuredChecked} /> No</label>
                </div>
                <div class="form-group" id="tp-insurer-group" style="${tp.is_insured ? '' : 'display:none;'}">
                  <label class="form-label">Insurance Company</label>
                  <input type="text" name="insurer" class="form-control" value="${esc(tp.insurer || '')}" />
                </div>
                <div class="form-group"><label class="form-label">Notes</label><textarea name="notes" class="form-control" rows="2">${esc(tp.notes || '')}</textarea></div>
              </form>`,
              readOnly ? '' : `<button class="btn btn-primary" id="save-claim-tp-btn">Save</button>`);

            if (readOnly) {
              document.querySelectorAll('#claim-tp-form input, #claim-tp-form textarea, #claim-tp-form select')
                .forEach(el => el.disabled = true);
              return;
            }

            // Toggle insurer field based on radio
            document.querySelectorAll('input[name="is_insured"]').forEach(r => {
              r.addEventListener('change', () => {
                const grp = document.getElementById('tp-insurer-group');
                if (grp) grp.style.display = r.value === '1' && r.checked ? '' : 'none';
              });
            });
            document.getElementById('save-claim-tp-btn')?.addEventListener('click', async () => {
              const form = document.getElementById('claim-tp-form');
              const data = {};
              new FormData(form).forEach((v, k) => { data[k] = v; });
              if (!data.surname) { showToast('Surname is required.', 'error'); return; }
              data.is_insured = data.is_insured === '1' ? 1 : 0;
              if (!data.is_insured) data.insurer = '';
              try {
                if (isEditing) { await Api.claims.thirdPartiesUpdate(claimId, tp.id, data); }
                else { await Api.claims.thirdPartiesCreate(claimId, data); }
                _closeModal();
                showToast(isEditing ? 'Third party updated.' : 'Third party added.', 'success');
                loadClaimTab(claimId, 'third-parties');
              } catch (err) { showToast('Failed: ' + (err.message || err), 'error'); }
            });
          }
          function openTpView(tp) {
            const fld = (label, value, opts = {}) => `
              <div class="detail-field">
                <span class="detail-label">${esc(label)}</span>
                <span class="detail-value" style="${opts.preserveWhitespace ? 'white-space:pre-wrap;' : ''}">${value ? esc(value) : '<span style="color:#999;">—</span>'}</span>
              </div>`;
            const insuredBadge = tp.is_insured
              ? `<span class="bool-yes" style="background:#d4edda;color:#155724;border-radius:4px;padding:.1rem .5rem;font-size:.78rem;font-weight:600;">Insured</span>`
              : `<span class="bool-no"  style="background:#f8d7da;color:#721c24;border-radius:4px;padding:.1rem .5rem;font-size:.78rem;font-weight:600;">Not insured</span>`;
            const fullName = [tp.initials, tp.surname].filter(Boolean).join(' ').trim() || tp.surname || '(no name)';
            const vehicleLine = [tp.vehicle_make, tp.vehicle_model, tp.vehicle_reg].filter(Boolean).join(' ') || '—';

            const body = `
              <div class="detail-view" style="max-height:70vh;overflow:auto;padding-right:.25rem;">

                <!-- Header strip -->
                <div style="background:#1a5276;color:#fff;border-radius:6px;padding:.85rem 1rem;margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;">
                  <div>
                    <div style="font-size:1.05rem;font-weight:600;">${esc(fullName)}</div>
                    <div style="font-size:.8rem;opacity:.85;margin-top:.15rem;">${esc(tp.occupation || 'Occupation not recorded')}</div>
                  </div>
                  <div>${insuredBadge}</div>
                </div>

                <!-- Personal -->
                <div class="detail-section card" style="margin-bottom:1rem;">
                  <div class="detail-section-title">Personal Details</div>
                  <div class="detail-grid">
                    ${fld('Surname',     tp.surname)}
                    ${fld('Initials',    tp.initials)}
                    ${fld('Occupation',  tp.occupation)}
                    ${fld('Cell No',     tp.cell_no)}
                    ${fld('Telephone',   tp.telephone_no)}
                  </div>
                  <div style="margin-top:.5rem;">
                    ${fld('Address', tp.address, { preserveWhitespace: true })}
                  </div>
                </div>

                <!-- Vehicle -->
                <div class="detail-section card" style="margin-bottom:1rem;">
                  <div class="detail-section-title">Particulars of Vehicle</div>
                  <div class="detail-grid">
                    ${fld('Make',        tp.vehicle_make)}
                    ${fld('Model',       tp.vehicle_model)}
                    ${fld('Reg Number',  tp.vehicle_reg)}
                  </div>
                  <div style="margin-top:.5rem;font-size:.82rem;color:#666;">
                    Combined: <strong>${esc(vehicleLine)}</strong>
                  </div>
                </div>

                <!-- Damage -->
                <div class="detail-section card" style="margin-bottom:1rem;">
                  <div class="detail-section-title">Damage</div>
                  ${fld('Description of Damage', tp.damage_description, { preserveWhitespace: true })}
                </div>

                <!-- Insurance -->
                <div class="detail-section card" style="margin-bottom:1rem;">
                  <div class="detail-section-title">Insurance</div>
                  <div class="detail-grid">
                    ${fld('Is the other party insured?', tp.is_insured ? 'Yes' : 'No')}
                    ${fld('Insurance Company',           tp.is_insured ? (tp.insurer || '—') : 'N/A')}
                  </div>
                </div>

                <!-- Notes -->
                <div class="detail-section card">
                  <div class="detail-section-title">Notes</div>
                  ${fld('Notes', tp.notes, { preserveWhitespace: true })}
                </div>
              </div>`;

            _openModal(`Third Party — ${fullName}`, body, `<button class="btn btn-secondary" id="tp-view-edit">Edit</button>`);
            document.getElementById('tp-view-edit')?.addEventListener('click', () => {
              _closeModal();
              setTimeout(() => openTpForm(tp), 0);
            });
          }

          document.getElementById('add-claim-tp-btn')?.addEventListener('click', () => openTpForm());
          tabEl.querySelectorAll('.js-view-tp').forEach(btn => {
            btn.addEventListener('click', () => {
              const tp = rows.find(r => String(r.id) === btn.dataset.tpId);
              if (tp) openTpView(tp);
            });
          });
          tabEl.querySelectorAll('.js-edit-tp').forEach(btn => {
            btn.addEventListener('click', () => {
              const tp = rows.find(r => String(r.id) === btn.dataset.tpId);
              if (tp) openTpForm(tp);
            });
          });
          tabEl.querySelectorAll('.js-del-tp').forEach(btn => {
            btn.addEventListener('click', async () => {
              if (!confirm(`Delete third party "${btn.dataset.tpName}"?`)) return;
              try {
                await Api.claims.thirdPartiesDelete(claimId, btn.dataset.tpId);
                showToast('Third party deleted.', 'success');
                loadClaimTab(claimId, 'third-parties');
              } catch (err) { showToast('Failed: ' + (err.message || err), 'error'); }
            });
          });
          break;
        }
        case 'workflows': {
          const wfRes = await Api.workflows.list({ claim_id: claimId, limit: 200 }).catch(() => ({ data: [] }));
          const wfs = wfRes.data || wfRes || [];
          tabEl.innerHTML = `
            <div class="tab-toolbar">
              <a class="btn btn-primary btn-sm" href="#/workflows/new?claim_id=${claimId}">+ New Workflow</a>
            </div>
            ${wfs.length ? `
            <table class="table">
              <thead><tr><th>Description</th><th>Due Date</th><th>Status</th><th></th></tr></thead>
              <tbody>${wfs.map(w => `
                <tr>
                  <td>${esc(w.description || '—')}</td>
                  <td>${w.due_date ? formatDate(w.due_date) : '—'}</td>
                  <td><span class="badge badge-status">${esc(w.status || '—')}</span></td>
                  <td><a href="#/workflows/${w.id}" class="btn btn-xs btn-outline">View</a></td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No workflows linked to this claim.</p>`}
          `;
          break;
        }
        case 'versions': {
          await renderVersionsTab(tabEl, 'claims', claimId);
          break;
        }
        default:
          tabEl.innerHTML = '';
      }
    } catch (err) {
      tabEl.innerHTML = `<p class="tab-empty text-danger">Failed to load tab: ${esc(err.message || String(err))}</p>`;
    }
  }

  // ── Send to Underwriter ───────────────────────────────────────────────

  async function _sendClaimMail(claimId) {
    let d = {};
    try {
      const res = await Api.claims.get(claimId);
      d = res.data || res || {};
    } catch (e) {
      showToast('Failed to load claim: ' + (e.message || e), 'error');
      return;
    }

    const brokerName = d.broker_name || window.currentUser?.full_name || '';
    const clientName = d.contact_name || d.account_name || '—';
    const today      = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });

    const cur = (v) => (v != null && v !== '') ? 'R ' + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
    const dash = (v) => (v != null && v !== '') ? String(v) : '—';
    const fmt = (v) => v ? formatDate(v) : '—';

    const subject = `New Claim Notification — ${d.claim_number || 'Claim #' + claimId} — ${clientName}`;

    // Plain-text body
    const textBody =
`Good Day,

Please find below the details of a new claim to be processed:

═══════════════════════════════════════════
CLAIM DETAILS
═══════════════════════════════════════════
Claim Number:    ${dash(d.claim_number)}
Claim Type:      ${dash(d.claim_type)}
Status:          ${dash(d.claim_status)}
Claim Date:      ${fmt(d.claim_date)}
Date Reported:   ${fmt(d.date_reported)}

═══════════════════════════════════════════
POLICY / CLIENT
═══════════════════════════════════════════
Client:          ${clientName}
Policy:          ${dash(d.policy_name)} (${dash(d.policy_number)})
Insurer:         ${dash(d.insurer)}
Policy Section:  ${dash(d.section_name)}
Asset:           ${dash(d.asset_name)}
Broker:          ${brokerName}
Claims Handler:  ${dash(d.claims_handler_name)}

═══════════════════════════════════════════
FINANCIAL
═══════════════════════════════════════════
Estimated Value: ${cur(d.estimated_value)}
Basic Excess:    ${cur(d.excess)}
${d.excess_pct_claim != null   ? 'Excess % Claim: ' + d.excess_pct_claim + '%\n' : ''}${d.excess_pct_insured != null ? 'Excess % Insured: ' + d.excess_pct_insured + '%\n' : ''}${d.minimum_excess != null    ? 'Minimum Excess:  ' + cur(d.minimum_excess) + '\n' : ''}
═══════════════════════════════════════════
INCIDENT DESCRIPTION
═══════════════════════════════════════════
${dash(d.incident_description)}

${d.dispute_raised ? `═══════════════════════════════════════════
DISPUTE
═══════════════════════════════════════════
${dash(d.dispute_details)}

` : ''}${d.notes ? `═══════════════════════════════════════════
NOTES
═══════════════════════════════════════════
${d.notes}

` : ''}Please confirm receipt and advise on further requirements.

Regards,

${brokerName}
${today}`;

    // HTML body (nicer formatting for the underwriter)
    const fieldRow = (l, v) => `<tr><td style="padding:4px 10px;background:#f5f5f5;font-weight:600;width:40%;">${esc(l)}</td><td style="padding:4px 10px;">${esc(String(v || '—'))}</td></tr>`;
    const section  = (title, rowsHtml) => `
      <h3 style="margin:18px 0 6px;color:#1a5276;font-size:14px;border-bottom:2px solid #1a5276;padding-bottom:3px;">${esc(title)}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">${rowsHtml}</table>`;

    const htmlBody = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#222;max-width:700px;">
        <p>Good Day,</p>
        <p>Please find below the details of a new claim to be processed:</p>

        ${section('Claim Details',
          fieldRow('Claim Number',  d.claim_number)  +
          fieldRow('Claim Type',    d.claim_type)    +
          fieldRow('Status',        d.claim_status)  +
          fieldRow('Claim Date',    fmt(d.claim_date))    +
          fieldRow('Date Reported', fmt(d.date_reported))
        )}

        ${section('Policy / Client',
          fieldRow('Client',         clientName) +
          fieldRow('Policy',         `${d.policy_name || '—'} (${d.policy_number || '—'})`) +
          fieldRow('Insurer',        d.insurer) +
          fieldRow('Policy Section', d.section_name) +
          fieldRow('Asset',          d.asset_name) +
          fieldRow('Broker',         brokerName) +
          fieldRow('Claims Handler', d.claims_handler_name)
        )}

        ${section('Financial',
          fieldRow('Estimated Value', cur(d.estimated_value)) +
          fieldRow('Basic Excess',    cur(d.excess)) +
          (d.excess_pct_claim   != null ? fieldRow('Excess % of Claim',   d.excess_pct_claim + '%')   : '') +
          (d.excess_pct_insured != null ? fieldRow('Excess % of Insured', d.excess_pct_insured + '%') : '') +
          (d.minimum_excess     != null ? fieldRow('Minimum Excess',      cur(d.minimum_excess))      : '')
        )}

        ${d.incident_description ? `
        <h3 style="margin:18px 0 6px;color:#1a5276;font-size:14px;border-bottom:2px solid #1a5276;padding-bottom:3px;">Incident Description</h3>
        <p style="white-space:pre-wrap;margin:4px 0;">${esc(d.incident_description)}</p>` : ''}

        ${d.dispute_raised ? `
        <h3 style="margin:18px 0 6px;color:#b36a00;font-size:14px;border-bottom:2px solid #b36a00;padding-bottom:3px;">Dispute</h3>
        <p style="white-space:pre-wrap;margin:4px 0;">${esc(d.dispute_details || '—')}</p>` : ''}

        ${d.notes ? `
        <h3 style="margin:18px 0 6px;color:#1a5276;font-size:14px;border-bottom:2px solid #1a5276;padding-bottom:3px;">Notes</h3>
        <p style="white-space:pre-wrap;margin:4px 0;">${esc(d.notes)}</p>` : ''}

        <p style="margin-top:18px;">Please confirm receipt and advise on further requirements.</p>
        <p>Regards,<br><strong>${esc(brokerName)}</strong><br>${esc(today)}</p>
      </div>`;

    const modal = document.createElement('div');
    modal.id = 'send-claim-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="width:720px;max-height:90vh;display:flex;flex-direction:column;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>Send Claim to Underwriter</h3>
          <button class="btn-close" onclick="document.getElementById('send-claim-modal').remove()">×</button>
        </div>
        <div class="modal-body" style="overflow-y:auto;">
          <div id="send-claim-error" style="display:none;color:var(--danger);margin-bottom:.75rem;"></div>
          <div class="form-group">
            <label class="form-label">To (Underwriter Email)</label>
            <input class="form-control" id="send-claim-to" placeholder="underwriter@insurer.com">
          </div>
          <div class="form-group">
            <label class="form-label">CC <span style="font-size:.75rem;color:var(--text-muted);font-weight:normal;">(optional, comma separated)</span></label>
            <input class="form-control" id="send-claim-cc" placeholder="optional@example.com">
          </div>
          <div class="form-group">
            <label class="form-label">Subject</label>
            <input class="form-control" id="send-claim-subject" value="${esc(subject)}">
          </div>
          <div class="form-group">
            <label class="form-label">Email Body (plain text — editable)</label>
            <textarea class="form-control" id="send-claim-body" rows="18" style="font-family:monospace;white-space:pre-wrap;">${esc(textBody)}</textarea>
            <small style="color:var(--text-muted);display:block;margin-top:.25rem;">
              A formatted HTML version will be sent. Any edits above are reflected in both versions.
            </small>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('send-claim-modal').remove()">Cancel</button>
          <button class="btn btn-primary" id="send-claim-btn" onclick="Claims._sendClaim(${claimId})">Send to Underwriter</button>
        </div>
      </div>`;
    /* backdrop-close disabled */
    document.body.appendChild(modal);

    // Stash the generated HTML body so _sendClaim can use it.
    modal.__htmlBody = htmlBody;
  }

  async function _sendClaim(claimId) {
    const modal = document.getElementById('send-claim-modal');
    if (!modal) return;
    const to      = document.getElementById('send-claim-to')?.value?.trim();
    const ccRaw   = document.getElementById('send-claim-cc')?.value?.trim();
    const subject = document.getElementById('send-claim-subject')?.value?.trim();
    const body    = document.getElementById('send-claim-body')?.value;
    const errEl   = document.getElementById('send-claim-error');
    const btn     = document.getElementById('send-claim-btn');

    if (!to || !subject || !body) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'To, Subject and Body are required.'; }
      return;
    }

    // Rebuild HTML from the (possibly edited) text body so the underwriter
    // sees the same content in both versions. We wrap it in a <pre> so
    // formatting is preserved.
    const htmlBody = `<pre style="font-family:Arial,Helvetica,sans-serif;font-size:13px;white-space:pre-wrap;">${esc(body)}</pre>`;

    const cc = ccRaw ? ccRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;

    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
    try {
      await Api.settings.sendEmail({ to, cc, subject, html: htmlBody, text: body, audit_module: 'claims', audit_record_id: claimId });
      modal.remove();
      showToast('Claim details sent to underwriter', 'success');
    } catch (e) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = e.message || String(e); }
      if (btn)   { btn.disabled = false; btn.textContent = 'Send to Underwriter'; }
    }
  }

  // ── Generic Claim Email (template + attachments) ──────────────────────────

  async function _openClaimEmailModal(claimId) {
    let d = {};
    try {
      const res = await Api.claims.get(claimId);
      d = res.data || res || {};
    } catch (e) {
      showToast('Failed to load claim: ' + (e.message || e), 'error');
      return;
    }

    let relatedContacts = [];
    try { relatedContacts = JSON.parse(d.claim_related_contacts || '[]') || []; } catch (_) {}
    if (!Array.isArray(relatedContacts)) relatedContacts = [];
    const toOptions = relatedContacts.filter(r => r.email);

    let templates = [];
    try { templates = await Api.settings.listTemplates(); } catch (_) {}

    let claimForms = [];
    try { claimForms = await Api.settings.claimForms(); } catch (_) {}

    const brokerName = d.broker_name || window.currentUser?.full_name || '';
    const clientName = d.contact_name || d.account_name || '—';
    const today      = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });

    const modal = document.createElement('div');
    modal.id = 'claim-email-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="width:640px;max-height:90vh;display:flex;flex-direction:column;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>Email — Claim ${esc(d.claim_number || '#' + claimId)}</h3>
          <button class="btn-close" onclick="document.getElementById('claim-email-modal').remove()">×</button>
        </div>
        <div class="modal-body" style="overflow-y:auto;">
          <div id="claim-email-error" style="display:none;color:var(--danger);margin-bottom:.75rem;"></div>

          <div class="form-group">
            <label class="form-label">To</label>
            ${toOptions.length ? `
              <select class="form-control" id="claim-email-to-select">
                <option value="">— Select Recipient —</option>
                ${toOptions.map(h => `<option value="${esc(h.email)}">${esc(h.name || h.email)}${h.contact_type ? ` (${esc(h.contact_type)})` : ''} — ${esc(h.email)}</option>`).join('')}
                <option value="__custom__">Custom email address…</option>
              </select>
              <input class="form-control" id="claim-email-to-custom" placeholder="recipient@example.com"
                style="display:none;margin-top:.4rem;" />
            ` : `
              <input class="form-control" id="claim-email-to-custom" placeholder="recipient@example.com" />
            `}
          </div>

          <div class="form-group">
            <label class="form-label">CC <span style="font-size:.75rem;color:var(--text-muted);font-weight:normal;">(optional, comma separated)</span></label>
            <input class="form-control" id="claim-email-cc" placeholder="optional@example.com" />
          </div>

          <div class="form-group">
            <label class="form-label">Template</label>
            <select class="form-control" id="claim-email-template" onchange="Claims._applyClaimEmailTemplate(this.value)">
              <option value="">— No Template —</option>
              ${templates.map(t => `<option value="${esc(t.key)}">${esc(t.label)}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Subject</label>
            <input class="form-control" id="claim-email-subject" placeholder="Email subject..." />
          </div>

          <div class="form-group">
            <label class="form-label">Body</label>
            <textarea class="form-control" id="claim-email-body" rows="10" placeholder="Email body..."></textarea>
          </div>

          <!-- Attachments -->
          <div class="form-group" style="border-top:1px solid var(--border-color,#dee2e6);padding-top:.75rem;margin-top:.5rem;">
            <label class="form-label">Attachments</label>

            <div style="margin-top:.25rem;">
              <button type="button" class="btn btn-secondary btn-sm" id="claim-email-attach-file-btn">+ Add Attachment</button>
              <input type="file" id="claim-email-attach-file-input" multiple style="display:none;" />
            </div>

            ${claimForms.length ? `
            <div style="margin-top:.5rem;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
              <select id="claim-email-claim-form-select" class="form-control" style="flex:1;min-width:200px;">
                <option value="">— Select Claim Form —</option>
                ${claimForms.map(f => `<option value="${esc(f.filename)}">${esc(f.label || f.filename)}</option>`).join('')}
              </select>
              <button type="button" class="btn btn-secondary btn-sm" id="claim-email-attach-claim-form-btn">Attach</button>
            </div>` : ''}

            <div id="claim-email-attachment-list" style="margin-top:.5rem;display:flex;flex-direction:column;gap:.25rem;"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('claim-email-modal').remove()">Cancel</button>
          <button class="btn btn-primary" id="claim-email-send-btn" onclick="Claims._sendClaimEmail(${claimId})">Send Email</button>
        </div>
      </div>`;
    /* backdrop-close disabled */
    document.body.appendChild(modal);

    modal._templates = templates;
    modal._userAttachments = [];
    modal._claimFormNames = [];
    modal._placeholders = {
      claim_number: d.claim_number || '',
      claim_type: d.claim_type || '',
      claim_status: d.claim_status || '',
      client_name: clientName,
      policy_number: d.policy_number || '',
      policy_name: d.policy_name || '',
      insurer: d.insurer || '',
      section_name: d.section_name || '',
      asset_name: d.asset_name || '',
      broker_name: brokerName,
      claims_handler: (relatedContacts.find(r => r.contact_type === 'Claims Handler')?.name) || '',
      estimated_value: d.estimated_value != null ? String(d.estimated_value) : '',
      incident_description: d.incident_description || '',
      today,
    };

    // Wire the To select → custom input reveal
    const toSelect = document.getElementById('claim-email-to-select');
    const toCustom = document.getElementById('claim-email-to-custom');
    if (toSelect && toCustom) {
      toSelect.addEventListener('change', () => {
        toCustom.style.display = toSelect.value === '__custom__' ? '' : 'none';
        if (toSelect.value !== '__custom__') toCustom.value = '';
      });
    }

    // Wire attachments (file + claim forms)
    _wireClaimEmailAttachments(modal);
  }

  function _wireClaimEmailAttachments(modal) {
    const listEl = modal.querySelector('#claim-email-attachment-list');
    const renderList = () => {
      if (!listEl) return;
      const rows = [];
      (modal._userAttachments || []).forEach((f, i) => {
        rows.push(`<div style="display:flex;align-items:center;gap:.5rem;font-size:.85rem;padding:.25rem .5rem;background:var(--bg-alt,#f4f5f7);border-radius:4px;">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;">📎 ${esc(f.filename)}</span>
          <button type="button" class="btn btn-sm btn-danger" data-remove-file="${i}" style="padding:0 .4rem;">✕</button>
        </div>`);
      });
      (modal._claimFormNames || []).forEach((name, i) => {
        rows.push(`<div style="display:flex;align-items:center;gap:.5rem;font-size:.85rem;padding:.25rem .5rem;background:var(--bg-alt,#f4f5f7);border-radius:4px;">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;">📄 ${esc(name)}</span>
          <button type="button" class="btn btn-sm btn-danger" data-remove-form="${i}" style="padding:0 .4rem;">✕</button>
        </div>`);
      });
      listEl.innerHTML = rows.join('');
    };

    const fileBtn = modal.querySelector('#claim-email-attach-file-btn');
    const fileInput = modal.querySelector('#claim-email-attach-file-input');
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

    const formSelect = modal.querySelector('#claim-email-claim-form-select');
    const formBtn = modal.querySelector('#claim-email-attach-claim-form-btn');
    if (formSelect && formBtn) {
      formBtn.addEventListener('click', () => {
        const v = formSelect.value;
        if (!v) return;
        if (!modal._claimFormNames.includes(v)) modal._claimFormNames.push(v);
        formSelect.value = '';
        renderList();
      });
    }

    if (listEl) {
      listEl.addEventListener('click', (e) => {
        const rf = e.target.closest('[data-remove-file]');
        const rc = e.target.closest('[data-remove-form]');
        if (rf) {
          const i = parseInt(rf.dataset.removeFile, 10);
          modal._userAttachments.splice(i, 1);
          renderList();
        } else if (rc) {
          const i = parseInt(rc.dataset.removeForm, 10);
          modal._claimFormNames.splice(i, 1);
          renderList();
        }
      });
    }
  }

  function _applyClaimEmailTemplate(key) {
    if (!key) return;
    const modal = document.getElementById('claim-email-modal');
    const templates = modal?._templates || [];
    const ph = modal?._placeholders || {};
    const tpl = templates.find(t => t.key === key);
    if (!tpl) return;
    const subjectEl = document.getElementById('claim-email-subject');
    const bodyEl = document.getElementById('claim-email-body');
    const replace = (text) => (text || '').replace(/\{\{(\w+)\}\}/g, (m, k) => ph[k] !== undefined ? ph[k] : m);
    if (subjectEl && tpl.subject) subjectEl.value = replace(tpl.subject);
    if (bodyEl && tpl.body)       bodyEl.value    = replace(tpl.body);
  }

  async function _sendClaimEmail(claimId) {
    const modal = document.getElementById('claim-email-modal');
    if (!modal) return;
    const toSelect = document.getElementById('claim-email-to-select');
    const toCustom = document.getElementById('claim-email-to-custom');
    let to = '';
    if (toSelect && toSelect.value && toSelect.value !== '__custom__') to = toSelect.value;
    else if (toCustom) to = (toCustom.value || '').trim();

    const ccRaw   = document.getElementById('claim-email-cc')?.value?.trim() || '';
    const subject = document.getElementById('claim-email-subject')?.value?.trim() || '';
    const body    = document.getElementById('claim-email-body')?.value || '';
    const errEl   = document.getElementById('claim-email-error');
    const btn     = document.getElementById('claim-email-send-btn');

    if (!to || !subject || !body.trim()) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'To, Subject and Body are required.'; }
      return;
    }

    const cc = ccRaw ? ccRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const payload = {
      to,
      ...(cc && cc.length ? { cc } : {}),
      subject,
      html: body,
      text: body,
      audit_module: 'claims',
      audit_record_id: claimId,
    };
    if (modal._userAttachments?.length) payload.user_attachments = modal._userAttachments;
    if (modal._claimFormNames?.length)  payload.claim_form_names = modal._claimFormNames;

    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
    try {
      await Api.settings.sendEmail(payload);
      modal.remove();
      showToast('Email sent successfully', 'success');
    } catch (e) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = e.message || String(e); }
      if (btn)   { btn.disabled = false; btn.textContent = 'Send Email'; }
    }
  }

  // ── Re-open settled claim (admin only) ────────────────────────────────────

  async function _reopenClaim(claimId) {
    if (!confirm('Re-open this settled claim? It will be set back to "In Progress" and become editable.')) return;
    try {
      await Api.claims.reopen(claimId);
      showToast('Claim re-opened successfully.', 'success');
      detail(claimId); // refresh the detail view
    } catch (err) {
      showToast('Failed to re-open claim: ' + (err.message || err), 'error');
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return { list, form, detail, _sendClaimMail, _sendClaim, _reopenClaim,
           _openClaimEmailModal, _sendClaimEmail, _applyClaimEmailTemplate };

})();
