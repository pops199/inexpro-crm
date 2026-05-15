/* ═══════════════════════════════════════════════════════════════════════════
   Advice Records (ROA) component  —  Record of Advice (COFI-aligned)
   ═══════════════════════════════════════════════════════════════════════════ */

const AdviceRecords = (() => {

  // ── Constants ────────────────────────────────────────────────────────────

  const ADVICE_TYPES = [
    'New Business',
    'Amendment',
    'Cancellation',
    'Review',
    'Claims-Driven Advice',
  ];

  const CLIENT_DECISIONS = [
    'Accepted',
    'Declined',
    'Deferred',
    'Pending',
  ];

  const TRIGGER_EVENTS = [
    'Client Engagement',
    'Policy Amendment',
    'Cancellation',
    'Review',
    'Claim',
    'Enquiry',
  ];

  // ── New COFI-aligned option lists ────────────────────────────────────────
  const RISK_APPETITE_OPTS = ['Conservative', 'Moderate', 'Aggressive', 'High-Risk Commercial'];
  const GAP_CATEGORY_OPTS  = ['Underinsurance', 'Missing cover type', 'Outdated values', 'Other'];
  const COMMISSION_OPTS    = [
    'Yes — disclosed in writing',
    'Yes — disclosed verbally',
    'Not applicable (fee-based)',
  ];
  const REJECTION_OPTS     = ['Cost', 'Preferred different insurer', 'Will self-insure', 'Other'];
  const ACK_METHOD_OPTS    = [
    'Signed physical copy',
    'Electronic signature',
    'Email confirmation',
    'WhatsApp confirmation',
    'Verbal (with witness name)',
  ];

  // Keep this in sync with TARGET_MARKET_MAP on the server — used for the
  // client-side live suitability warning before saving.
  const TARGET_MARKET_MAP = {
    'Conservative':         ['Personal', 'Agri'],
    'Moderate':             ['Personal', 'Commercial', 'Agri', 'Mixed'],
    'Aggressive':           ['Personal', 'Commercial', 'Transport', 'Mixed'],
    'High-Risk Commercial': ['Commercial', 'Transport', 'Mixed'],
  };

  function parseJsonArray(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (_) { return []; }
  }

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

  function selectOpts(items, selected, emptyLabel = '— Select —') {
    return [
      `<option value="">${emptyLabel}</option>`,
      ...items.map(i => `<option value="${esc(i)}" ${selected === i ? 'selected' : ''}>${esc(i)}</option>`)
    ].join('');
  }

  function userOptions(users, selectedId) {
    return [{ id: '', full_name: '— None —' }, ...users].map(u =>
      `<option value="${esc(u.id)}" ${String(u.id) === String(selectedId) ? 'selected' : ''}>${esc(u.full_name || u.username || '')}</option>`
    ).join('');
  }

  function contactOptions(contacts, selectedId) {
    return [{ id: '', first_name: '—', last_name: 'None —' }, ...contacts].map(c =>
      `<option value="${esc(c.id)}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${esc([c.first_name, c.last_name].filter(Boolean).join(' ') || '—')}</option>`
    ).join('');
  }

  function accountOptions(accounts, selectedId) {
    return [{ id: '', account_name: '— None —' }, ...accounts].map(a =>
      `<option value="${esc(a.id)}" ${String(a.id) === String(selectedId) ? 'selected' : ''}>${esc(a.account_name || '')}</option>`
    ).join('');
  }

  function policyOptions(policies, selectedId) {
    return [{ id: '', policy_name: '— None —' }, ...policies].map(p =>
      `<option value="${esc(p.id)}" ${String(p.id) === String(selectedId) ? 'selected' : ''}>${esc(p.policy_name || '')}</option>`
    ).join('');
  }

  function engagementOptions(engagements, selectedId) {
    return [{ id: '', engagement_name: '— None —' }, ...engagements].map(e =>
      `<option value="${esc(e.id)}" ${String(e.id) === String(selectedId) ? 'selected' : ''}>${esc(e.engagement_name || '')}</option>`
    ).join('');
  }

  function chk(label, name, checked) {
    return `
      <div class="form-group" style="display:flex;align-items:center;gap:.5rem;">
        <input type="checkbox" name="${name}" id="chk-${name}" class="form-checkbox" ${checked ? 'checked' : ''} style="width:auto;">
        <label for="chk-${name}" class="form-label" style="margin:0;">${label}</label>
      </div>`;
  }

  function field(label, value) {
    return `<div class="detail-field"><span class="detail-label">${label}</span><span class="detail-value">${value || '—'}</span></div>`;
  }

  function boolBadge(v) {
    return v
      ? `<span class="badge badge-success">&#10003; Yes</span>`
      : `<span class="badge badge-secondary">&#10007; No</span>`;
  }

  function serializeForm(formEl) {
    const fd = new FormData(formEl);
    const data = {};
    for (const [key, val] of fd.entries()) {
      // Skip reserved multi-value keys (checkbox groups / hidden JSON lists)
      if (key === 'identified_gaps[]')            continue;
      if (key === 'alternatives_considered_list') continue;
      data[key] = typeof sanitiseInput === 'function' ? sanitiseInput(val) : val;
    }
    // Checkboxes not in a named group — single-field toggles
    formEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      if (cb.name === 'identified_gaps[]') return; // handled separately
      if (!cb.name) return;
      data[cb.name] = cb.checked ? 1 : 0;
    });
    // Identified gaps multi-select → JSON array
    const gapBoxes = formEl.querySelectorAll('input[name="identified_gaps[]"]:checked');
    data.identified_gaps = Array.from(gapBoxes).map(cb => cb.value);
    // Alternatives considered — rebuilt from repeater rows
    const altRows = formEl.querySelectorAll('[data-alt-row]');
    data.alternatives_considered_list = Array.from(altRows).map(row => ({
      product_name:            (row.querySelector('[data-alt-field="product_name"]')?.value || '').trim(),
      insurer:                 (row.querySelector('[data-alt-field="insurer"]')?.value || '').trim(),
      reason_not_recommended:  (row.querySelector('[data-alt-field="reason_not_recommended"]')?.value || '').trim(),
    })).filter(a => a.product_name || a.insurer || a.reason_not_recommended);
    return data;
  }

  // ── List ─────────────────────────────────────────────────────────────────

  // ── Catalog cell renderers ──────────────────────────────────────────────
  const AR_CELLS = {
    advice_record_number: r => `<a href="#/advice-records/${r.id}">${esc(r.advice_record_number || '—')}</a>`,
    advice_date:          r => r.advice_date ? formatDate(r.advice_date) : '—',
    contact_name:         r => {
      // RoA owner: a record is linked to either a contact OR an account, not both.
      // Render whichever is filled, with a small kind badge so the user can tell them apart.
      if (r.contact_id) {
        return `<span class="badge badge-secondary" style="margin-right:.4rem;font-size:.65rem;">Contact</span>`
             + `<a href="#/contacts/${r.contact_id}">${esc(r.contact_name || '—')}</a>`;
      }
      if (r.account_id) {
        return `<span class="badge badge-info" style="margin-right:.4rem;font-size:.65rem;">Account</span>`
             + `<a href="#/accounts/${r.account_id}">${esc(r.account_name || '—')}</a>`;
      }
      return '—';
    },
    policy_name:          r => r.policy_id ? `<a href="#/policies/${r.policy_id}">${esc(r.policy_name || r.policy_number || '—')}</a>` : esc(r.policy_name || '—'),
    advice_type:          r => esc(r.advice_type || '—'),
    trigger_event:        r => esc(r.trigger_event || '—'),
    client_decision:      r => esc(r.client_decision || '—'),
    decision_date:        r => r.decision_date ? formatDate(r.decision_date) : '—',
    roa_generated:        r => r.roa_generated ? 'Yes' : 'No',
    issue_date:           r => r.issue_date ? formatDate(r.issue_date) : '—',
    client_acknowledgement_received: r => r.client_acknowledgement_received ? 'Yes' : 'No',
    broker_name:          r => esc(r.broker_name || '—'),
    prepared_by_name:     r => esc(r.prepared_by_name || '—'),
    created_at:           r => r.created_at ? formatDate(r.created_at) : '—',
    updated_at:           r => r.updated_at ? formatDate(r.updated_at) : '—',
    actions:              r => `
      <a href="#/advice-records/${r.id}" class="btn btn-sm btn-secondary">View</a>
      <a href="#/advice-records/${r.id}/edit" class="btn btn-sm btn-primary">Edit</a>
      <button class="btn btn-sm btn-danger" data-delete-id="${r.id}" data-delete-num="${esc(r.advice_record_number || '')}">Delete</button>`,
  };

  let _arCatalog = null;
  let _arConfig  = null;

  async function list() {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    setPageTitle('Records of Advice');
    setBreadcrumb(['Records of Advice']);

    const ctrlStyle = 'height:28px;padding:.15rem .4rem;font-size:.78rem;line-height:1;';

    const headerActions = document.getElementById('header-actions');
    if (headerActions) {
      headerActions.style.flex = '';
      // ROAs can only be created from an engagement with a Complete pre-sale
      // disclosure (MOD-02 / FAIS GCC §4). The standalone "+ New Record of
      // Advice" button is kept in source but hidden so brokers are funnelled
      // through the engagement → Create ROA flow.
      headerActions.innerHTML = `
        <a href="#/advice-records/new" class="btn btn-primary" style="${ctrlStyle};display:none;">+ New Record of Advice</a>`;
    }

    // Center the filter bar absolutely inside the top header so it sits in the
    // true horizontal middle (not offset by the title/actions flex split).
    document.getElementById('ar-center-filters')?.remove();
    const topHeader = document.getElementById('top-header');
    if (topHeader) {
      topHeader.style.position = 'relative';
      const wrap = document.createElement('div');
      wrap.id = 'ar-center-filters';
      wrap.setAttribute('data-header-widget', '1');
      wrap.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;gap:.5rem;align-items:center;z-index:2;background:var(--bg);padding:.3rem .55rem;border-radius:6px;';
      wrap.innerHTML = `
        <input type="search" id="ar-search" class="form-control" placeholder="Search…"
          style="${ctrlStyle}width:160px;">
        <select id="ar-filter-type" class="form-control" style="${ctrlStyle}max-width:130px;">
          <option value="">All Types</option>
          ${ADVICE_TYPES.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
        </select>
        <select id="ar-filter-decision" class="form-control" style="${ctrlStyle}max-width:130px;">
          <option value="">All Decisions</option>
          ${CLIENT_DECISIONS.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('')}
        </select>
        <button id="ar-filter-clear" class="btn btn-secondary" style="${ctrlStyle}">Clear</button>`;
      topHeader.appendChild(wrap);
    }

    try {
      const prefs = await ViewPrefs.load('advice_records');
      _arCatalog = prefs.catalog;
      _arConfig  = prefs.config;

      const res = await Api.adviceRecords.list({
        limit: 100,
        sort: _arConfig.sortBy,
        dir:  _arConfig.sortDir,
      });
      const records = res.data || res || [];

      const visibleCols = ViewPrefs.visibleColumns(_arCatalog, _arConfig);
      const colCount = visibleCols.length || 1;

      const headCells = visibleCols.map(col => {
        const active = _arConfig.sortBy === col.id;
        const arrow  = active ? (_arConfig.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
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
                <thead><tr id="ar-thead-row">${headCells}</tr></thead>
                <tbody id="ar-tbody">
                  <tr><td colspan="${colCount}" class="table-empty">Loading…</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>`;

      // ⚙ Columns button
      ViewPrefs.attachButton({
        moduleKey: 'advice_records',
        catalog:   _arCatalog,
        current:   _arConfig,
        onChange:  (newCfg) => { _arConfig = newCfg; list(); },
      });

      renderTableRows(records, '');
      bindFilterEvents(records);

      el.querySelectorAll('#ar-thead-row th.sortable').forEach(th => {
        th.addEventListener('click', async () => {
          const col = th.dataset.sort;
          if (_arConfig.sortBy === col) {
            _arConfig.sortDir = _arConfig.sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            _arConfig.sortBy = col;
            _arConfig.sortDir = 'asc';
          }
          try { const r = await Api.viewPrefs.save('advice_records', _arConfig); _arConfig = r.config; } catch (_) {}
          list();
        });
      });

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load advice records: ${esc(err.message)}</div>`;
    }
  }

  function renderTableRows(records, search) {
    const tbody = document.getElementById('ar-tbody');
    if (!tbody) return;
    const visibleCols = _arCatalog ? ViewPrefs.visibleColumns(_arCatalog, _arConfig) : [];
    const colCount = visibleCols.length || 1;

    const typeFilter     = document.getElementById('ar-filter-type')?.value     || '';
    const decisionFilter = document.getElementById('ar-filter-decision')?.value || '';

    let rows = records;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        (r.advice_record_number || '').toLowerCase().includes(q) ||
        (r.contact_name         || '').toLowerCase().includes(q) ||
        (r.broker_name          || '').toLowerCase().includes(q)
      );
    }
    if (typeFilter)     rows = rows.filter(r => r.advice_type     === typeFilter);
    if (decisionFilter) rows = rows.filter(r => r.client_decision === decisionFilter);

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${colCount}" class="table-empty">No advice records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => `<tr>${visibleCols.map(col => {
      const fn = AR_CELLS[col.id];
      return `<td${col.id === 'actions' ? ' class="actions-cell"' : ''}>${fn ? fn(r) : esc(String(r[col.id] ?? '—'))}</td>`;
    }).join('')}</tr>`).join('');

    tbody.querySelectorAll('[data-delete-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id  = btn.dataset.deleteId;
        const num = btn.dataset.deleteNum;
        if (!confirmDialog(`Delete advice record "${num}"? This cannot be undone.`)) return;
        try {
          await Api.adviceRecords.delete(id);
          showToast('Advice record deleted.', 'success');
          list();
        } catch (err) {
          showToast('Delete failed: ' + err.message, 'error');
        }
      });
    });
  }

  function bindFilterEvents(records) {
    const searchEl   = document.getElementById('ar-search');
    const typeEl     = document.getElementById('ar-filter-type');
    const decisionEl = document.getElementById('ar-filter-decision');
    const clearEl    = document.getElementById('ar-filter-clear');

    const applyFilters = typeof debounce === 'function'
      ? debounce(() => renderTableRows(records, searchEl?.value || ''), 300)
      : () => renderTableRows(records, searchEl?.value || '');

    if (searchEl)   searchEl.addEventListener('input', applyFilters);
    if (typeEl)     typeEl.addEventListener('change', applyFilters);
    if (decisionEl) decisionEl.addEventListener('change', applyFilters);
    if (clearEl) {
      clearEl.addEventListener('click', () => {
        if (searchEl)   searchEl.value   = '';
        if (typeEl)     typeEl.value     = '';
        if (decisionEl) decisionEl.value = '';
        renderTableRows(records, '');
      });
    }
  }

  // ── Form ─────────────────────────────────────────────────────────────────

  async function form(id = null) {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    const isEdit = Boolean(id);
    setPageTitle(isEdit ? 'Edit Advice Record' : 'New Advice Record');
    setBreadcrumb(['Records of Advice', isEdit ? 'Edit' : 'New']);

    document.getElementById('ar-center-filters')?.remove();
    const headerActions = document.getElementById('header-actions');
    if (headerActions) {
      headerActions.style.flex = '';
      headerActions.innerHTML = '';
    }

    try {
      const [contactsRes, accountsRes, policiesRes, engagementsRes, usersRes, productsRes, arData] = await Promise.all([
        Api.contacts.list({ limit: 500 }),
        Api.accounts.list({ limit: 500 }),
        Api.policies.list({ limit: 500 }),
        Api.engagements.list({ limit: 500 }),
        Api.admin.users(),
        Api.products.list({ limit: 500 }).catch(() => []),
        isEdit ? Api.adviceRecords.get(id) : Promise.resolve({}),
      ]);

      const contacts    = contactsRes.data    || contactsRes    || [];
      const accounts    = accountsRes.data    || accountsRes    || [];
      const policies    = policiesRes.data    || policiesRes    || [];
      const engagements = engagementsRes.data || engagementsRes || [];
      const users       = usersRes.data       || usersRes       || [];
      const products    = productsRes.data    || productsRes    || [];
      const d           = arData.data         || arData         || {};

      // Pre-populate engagement_id from the hash query string
      // (e.g. #/advice-records/new?engagement_id=42 from engagement detail page)
      if (!isEdit) {
        const q = (window.location.hash || '').split('?')[1] || '';
        const params = new URLSearchParams(q);
        const qEng = params.get('engagement_id');
        if (qEng) {
          d.engagement_id = qEng;
          const eng = engagements.find(e => String(e.id) === String(qEng));
          if (eng) {
            if (!d.contact_id && eng.contact_id) d.contact_id = eng.contact_id;
            if (!d.account_id && eng.account_id) d.account_id = eng.account_id;
            if (!d.broker_id  && eng.assigned_broker_id) d.broker_id = eng.assigned_broker_id;
          }
        }
      }

      el.innerHTML = `
        <div class="form-page">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">${isEdit ? 'Edit Advice Record' : 'New Advice Record'}</h3>
            </div>
            <form id="ar-form" novalidate>

              <!-- ── Record Details ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Record Details</legend>
                <div class="form-grid form-grid-2">
                  <div class="form-group">
                    <label class="form-label">Advice Record Number</label>
                    <input type="text" name="advice_record_number" class="form-control"
                      value="${esc(d.advice_record_number || '')}" placeholder="Auto-generated on save" ${isEdit ? '' : 'readonly'}>
                  </div>
                  <div class="form-group">
                    <label class="form-label required">Advice Date</label>
                    <input type="date" name="advice_date" class="form-control" required
                      value="${esc(d.advice_date ? d.advice_date.slice(0, 10) : '')}">
                  </div>
                  <div class="form-group">
                    <label class="form-label required">Advice Type</label>
                    <select name="advice_type" class="form-control" required>
                      ${selectOpts(ADVICE_TYPES, d.advice_type, '— Select Type —')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Trigger Event</label>
                    <select name="trigger_event" class="form-control">
                      ${selectOpts(TRIGGER_EVENTS, d.trigger_event)}
                    </select>
                  </div>
                </div>
              </fieldset>

              <!-- ── Links ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Links</legend>
                <div class="form-grid form-grid-2">
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
                    <label class="form-label">Engagement</label>
                    <select name="engagement_id" class="form-control">
                      ${engagementOptions(engagements, d.engagement_id)}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Policy</label>
                    <select name="policy_id" class="form-control">
                      ${policyOptions(policies, d.policy_id)}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Product (Product Library)</label>
                    <div style="display:flex;gap:.5rem;align-items:stretch;">
                      <select name="product_id" id="ar-product-select" class="form-control" style="flex:1;min-width:0;">
                        <option value="">— Select Product —</option>
                        ${products.map(p => `<option value="${esc(p.id)}" ${String(p.id) === String(d.product_id) ? 'selected' : ''}>${esc(p.product_code || '')}${p.product_name ? ' — ' + esc(p.product_name) : ''}${p.insurer ? ' (' + esc(p.insurer) + ')' : ''}</option>`).join('')}
                      </select>
                      <button type="button" class="btn btn-secondary" id="ar-product-library-btn"
                        title="Add a new product in the Product Library" style="white-space:nowrap;">
                        + Add
                      </button>
                    </div>
                    <small class="form-hint">Selecting a product evaluates target market suitability.</small>
                  </div>
                  <div class="form-group">
                    <label class="form-label required">Broker</label>
                    <select name="broker_id" class="form-control" required>
                      ${userOptions(users, d.broker_id)}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label required">Prepared By</label>
                    <select name="prepared_by_id" class="form-control" required>
                      ${userOptions(users, d.prepared_by_id || (window.currentUser && window.currentUser.id))}
                    </select>
                  </div>
                </div>
              </fieldset>

              <!-- ══════════════════════════════════════════════════════ -->
              <!-- STEP 1 — Suitability Assessment (FAIS GCC §8, TCF Outc 4) -->
              <!-- ══════════════════════════════════════════════════════ -->
              <fieldset class="form-section" data-step="1">
                <legend class="form-section-title">Step 1 — Suitability Assessment</legend>
                <div class="form-grid form-grid-2">
                  <div class="form-group">
                    <label class="form-label required">Client Risk Appetite</label>
                    <select name="client_risk_appetite" class="form-control" required>
                      ${selectOpts(RISK_APPETITE_OPTS, d.client_risk_appetite, '— Select —')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label required">Total Financial Exposure (R)</label>
                    <input type="number" step="0.01" min="0" name="total_financial_exposure"
                      class="form-control" required
                      placeholder="Estimated total insurable value"
                      value="${esc(d.total_financial_exposure != null ? d.total_financial_exposure : '')}">
                  </div>
                  <div class="form-group form-grid-span-2">
                    <label class="form-label">Existing Cover — Summary (auto-populated from Policies)</label>
                    <textarea class="form-control" rows="3" readonly
                      style="background:#f8f9fa;font-family:monospace;font-size:.85rem;"
                      id="existing-cover-preview"
                      placeholder="Select a contact/account to auto-populate">${esc(d.existing_cover_summary_auto || '')}</textarea>
                    <small class="form-hint">Refreshed automatically on save from active/pending policies.</small>
                  </div>
                  <div class="form-group form-grid-span-2">
                    <label class="form-label required">Identified Gaps</label>
                    <div class="gap-checkboxes" style="display:flex;flex-wrap:wrap;gap:.75rem 1.25rem;padding:.35rem 0;">
                      ${GAP_CATEGORY_OPTS.map(g => {
                        const checked = parseJsonArray(d.identified_gaps).includes(g);
                        const idSafe = 'gap-' + g.replace(/[^a-z0-9]/gi,'-').toLowerCase();
                        return `
                          <label for="${idSafe}" style="display:inline-flex;align-items:center;gap:.35rem;">
                            <input type="checkbox" id="${idSafe}" name="identified_gaps[]"
                              value="${esc(g)}" ${checked ? 'checked' : ''} style="width:auto;">
                            ${esc(g)}
                          </label>`;
                      }).join('')}
                    </div>
                    <textarea name="identified_gaps_notes" class="form-control" rows="2"
                      placeholder="Describe the gap(s) in more detail">${esc(d.identified_gaps_notes || '')}</textarea>
                  </div>
                </div>
              </fieldset>

              <!-- ── Needs Analysis (supporting free-text) ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Needs Analysis</legend>
                <div class="form-grid form-grid-1">
                  <div class="form-group">
                    <label class="form-label required">Client Needs Identified</label>
                    <textarea name="client_needs_identified" class="form-control" rows="4" required>${esc(d.client_needs_identified || '')}</textarea>
                  </div>
                  <div class="form-group">
                    <label class="form-label required">Risk Analysis Summary</label>
                    <textarea name="risk_analysis_summary" class="form-control" rows="4" required>${esc(d.risk_analysis_summary || '')}</textarea>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Current Cover Considered</label>
                    <textarea name="current_cover_considered" class="form-control" rows="3">${esc(d.current_cover_considered || '')}</textarea>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Shortfalls Identified</label>
                    <textarea name="shortfalls_identified" class="form-control" rows="3">${esc(d.shortfalls_identified || '')}</textarea>
                  </div>
                </div>
              </fieldset>

              <!-- ══════════════════════════════════════════════════════ -->
              <!-- STEP 2 — Recommendation                                  -->
              <!-- ══════════════════════════════════════════════════════ -->
              <fieldset class="form-section" data-step="2">
                <legend class="form-section-title">Step 2 — Recommendation</legend>

                <!-- Suitability match banner (live) -->
                <div id="suitability-banner" style="display:none;margin-bottom:1rem;padding:.6rem .85rem;border-radius:6px;border:1px solid;"></div>

                <div class="form-grid form-grid-1">
                  <div class="form-group">
                    <label class="form-label required">Recommendation Given</label>
                    <textarea name="recommendation_given" class="form-control" rows="4" required>${esc(d.recommendation_given || '')}</textarea>
                  </div>
                  <div class="form-group">
                    <label class="form-label required">Recommendation Rationale (structured)</label>
                    <textarea name="recommendation_rationale" class="form-control" rows="5"
                      placeholder="Product recommended:&#10;Insurer selected:&#10;Basis for recommendation:&#10;Why alternatives rejected:"
                      required>${esc(d.recommendation_rationale || '')}</textarea>
                    <small class="form-hint">Structured: product recommended | insurer selected | basis for recommendation | why alternatives rejected.</small>
                  </div>

                  <!-- Alternatives repeater -->
                  <div class="form-group">
                    <label class="form-label required">Alternatives Considered (minimum 1)</label>
                    <div id="alternatives-container"></div>
                    <button type="button" class="btn btn-secondary btn-sm" id="alt-add-btn" style="margin-top:.35rem;">+ Add Alternative</button>
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Reason Product is Suitable</label>
                    <textarea name="reason_product_suitable" class="form-control" rows="3" required>${esc(d.reason_product_suitable || '')}</textarea>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Consequences of Not Proceeding</label>
                    <textarea name="consequences_of_not_proceeding" class="form-control" rows="3">${esc(d.consequences_of_not_proceeding || '')}</textarea>
                  </div>

                  <!-- Suitability score + override reason -->
                  <div class="form-grid form-grid-2" style="margin-top:.5rem;">
                    <div class="form-group">
                      <label class="form-label">Suitability Match Score (auto-calculated)</label>
                      <input type="text" id="suitability-score-display" class="form-control" readonly
                        style="background:#f8f9fa;font-weight:600;"
                        value="${esc(d.suitability_match_score || '—')}">
                    </div>
                    <div class="form-group" id="suitability-override-wrap" style="display:${(d.target_market_status === 'Review Required' || d.suitability_match_score === 'Mismatch') ? 'block' : 'none'};">
                      <label class="form-label required">Override Reason (required when review needed)</label>
                      <textarea name="suitability_override_reason" class="form-control" rows="2">${esc(d.suitability_override_reason || '')}</textarea>
                    </div>
                  </div>

                  <!-- Supervisor co-approval (red Target Market Mismatch) -->
                  <div class="form-group" id="supervisor-coapproval-wrap"
                       style="display:${d.target_market_status === 'Mismatch' ? 'block' : 'none'};margin-top:.5rem;padding:.75rem 1rem;border:1px solid #dc3545;border-radius:6px;background:#fdecea;">
                    <label class="form-label required" style="color:#a71d2a;">
                      🚩 Target Market Mismatch — Supervisor co-approval required
                    </label>
                    <small class="form-hint" style="color:#a71d2a;">
                      Client type is outside this product's target market. A supervisor must co-approve before the ROA can be saved or sent.
                    </small>
                    <select name="supervisor_co_approved_by_id" class="form-control" style="margin-top:.4rem;">
                      <option value="">— Select supervisor —</option>
                      ${userOptions(users.filter(u => u.role === 'admin' || u.role === 'admin_only'), d.supervisor_co_approved_by_id)}
                    </select>
                    ${d.supervisor_co_approved_at ? `<small style="display:block;margin-top:.4rem;color:#155724;">✓ Co-approved on ${esc(String(d.supervisor_co_approved_at).slice(0,16).replace('T',' '))}</small>` : ''}
                  </div>

                  <!-- Legacy free-text alternatives (kept, optional) -->
                  <div class="form-group">
                    <label class="form-label">Alternative Options Considered (free-text, optional)</label>
                    <textarea name="alternative_options_considered" class="form-control" rows="2">${esc(d.alternative_options_considered || '')}</textarea>
                  </div>
                </div>
              </fieldset>

              <!-- ══════════════════════════════════════════════════════ -->
              <!-- STEP 3 — Conflict of Interest (FAIS GCC §3A)             -->
              <!-- ══════════════════════════════════════════════════════ -->
              <fieldset class="form-section" data-step="3">
                <legend class="form-section-title">Step 3 — Conflict of Interest Declaration</legend>
                <div class="form-grid form-grid-2">
                  <div class="form-group form-grid-span-2">
                    <label class="form-label required">Financial Interest Declaration</label>
                    <div style="display:flex;gap:1.25rem;padding:.35rem 0;">
                      <label style="display:inline-flex;align-items:center;gap:.35rem;">
                        <input type="radio" name="conflict_of_interest_flag" value="Yes"
                          ${d.conflict_of_interest_flag === 'Yes' ? 'checked' : ''} required>
                        Yes — financial interest exists
                      </label>
                      <label style="display:inline-flex;align-items:center;gap:.35rem;">
                        <input type="radio" name="conflict_of_interest_flag" value="No"
                          ${d.conflict_of_interest_flag === 'No' ? 'checked' : ''} required>
                        No — no financial interest
                      </label>
                    </div>
                    <small class="form-hint">This declaration cannot be left blank (GCC §3A).</small>
                  </div>
                  <div class="form-group form-grid-span-2" id="coi-detail-wrap"
                    style="display:${d.conflict_of_interest_flag === 'Yes' ? 'block' : 'none'};">
                    <label class="form-label required">Describe the Conflict of Interest</label>
                    <textarea name="conflict_of_interest_description" class="form-control" rows="3">${esc(d.conflict_of_interest_description || '')}</textarea>
                  </div>
                  <div class="form-group">
                    <label class="form-label required">Commission Disclosed</label>
                    <select name="commission_disclosed" class="form-control" required>
                      ${selectOpts(COMMISSION_OPTS, d.commission_disclosed, '— Select —')}
                    </select>
                  </div>
                  <div class="form-group" id="commission-value-wrap"
                    style="display:${d.commission_disclosed && !/Not applicable/.test(d.commission_disclosed) ? 'grid' : 'none'};grid-template-columns:1fr 2fr;gap:.5rem;">
                    <select name="commission_rate_type" class="form-control">
                      <option value="percent"  ${d.commission_rate_type === 'percent' ? 'selected' : ''}>%</option>
                      <option value="amount"   ${d.commission_rate_type === 'amount'  ? 'selected' : ''}>R (amount)</option>
                    </select>
                    <input type="number" step="0.01" min="0" name="commission_rate_value"
                      class="form-control" placeholder="Rate or amount"
                      value="${esc(d.commission_rate_value != null ? d.commission_rate_value : '')}">
                  </div>
                </div>
              </fieldset>

              <!-- ══════════════════════════════════════════════════════ -->
              <!-- STEP 4 — Disclosures Confirmation                        -->
              <!-- ══════════════════════════════════════════════════════ -->
              <fieldset class="form-section" data-step="4">
                <legend class="form-section-title">Step 4 — Disclosures Confirmation</legend>
                <div class="form-grid form-grid-2">
                  ${chk('Risks Explained to Client', 'risks_explained', d.risks_explained)}
                  ${chk('Costs Explained to Client', 'costs_explained', d.costs_explained)}
                  ${chk('Excess Explained to Client', 'excess_explained', d.excess_explained)}
                  ${chk('Waiting Period &amp; Limitations Explained', 'waiting_period_limitations_explained', d.waiting_period_limitations_explained)}
                  ${chk('Exclusions Explained to Client', 'exclusions_explained', d.exclusions_explained)}
                  ${chk('Client Understanding Confirmed', 'client_understanding_confirmed', d.client_understanding_confirmed)}
                  ${chk('Fair Outcome Considered', 'fair_outcome_considered', d.fair_outcome_considered)}
                </div>
              </fieldset>

              <!-- ── Client Decision ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Client Decision & Acknowledgment</legend>
                <div class="form-grid form-grid-2">
                  <div class="form-group">
                    <label class="form-label">Client Decision</label>
                    <select name="client_decision" class="form-control">
                      ${selectOpts(CLIENT_DECISIONS, d.client_decision)}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Decision Date</label>
                    <input type="date" name="decision_date" class="form-control"
                      value="${esc(d.decision_date ? d.decision_date.slice(0, 10) : '')}">
                  </div>

                  <!-- Rejection fields (only shown when declined) -->
                  <div class="form-group" id="rejection-reason-wrap"
                    style="display:${d.client_decision === 'Declined' ? 'block' : 'none'};">
                    <label class="form-label required">Rejection Reason</label>
                    <select name="client_rejection_reason" class="form-control">
                      ${selectOpts(REJECTION_OPTS, d.client_rejection_reason, '— Select —')}
                    </select>
                  </div>
                  <div class="form-group" id="rejection-notes-wrap"
                    style="display:${d.client_decision === 'Declined' ? 'block' : 'none'};">
                    <label class="form-label">Rejection Notes</label>
                    <input type="text" name="client_rejection_notes" class="form-control"
                      value="${esc(d.client_rejection_notes || '')}" placeholder="Optional detail">
                  </div>

                  <div class="form-group form-grid-span-2">
                    <label class="form-label">Decision Notes</label>
                    <textarea name="decision_notes" class="form-control" rows="2">${esc(d.decision_notes || '')}</textarea>
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Client Acknowledgment Method</label>
                    <select name="client_acknowledgment_method" class="form-control" required>
                      ${selectOpts(ACK_METHOD_OPTS, d.client_acknowledgment_method, '— Select —')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label required">Date Acknowledgment Received</label>
                    <input type="date" name="acknowledgement_date" class="form-control" required
                      value="${esc(d.acknowledgement_date ? d.acknowledgement_date.slice(0, 10) : '')}">
                    <small class="form-hint">Must be on or after the ROA date.</small>
                  </div>
                  <div class="form-group form-grid-span-2" id="witness-wrap"
                    style="display:${d.client_acknowledgment_method === 'Verbal (with witness name)' ? 'block' : 'none'};">
                    <label class="form-label required">Witness Name</label>
                    <input type="text" name="acknowledgment_witness_name" class="form-control"
                      value="${esc(d.acknowledgment_witness_name || '')}">
                  </div>
                </div>
              </fieldset>

              <!-- ── Documentation ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Documentation</legend>
                <div class="form-grid form-grid-2">
                  ${chk('ROA Generated', 'roa_generated', d.roa_generated)}
                  <div class="form-group">
                    <label class="form-label">ROA Generation Date</label>
                    <input type="date" name="roa_generation_date" class="form-control"
                      value="${esc(d.roa_generation_date ? d.roa_generation_date.slice(0, 10) : '')}">
                  </div>
                  ${chk('Final Document Issued', 'final_document_issued', d.final_document_issued)}
                  <div class="form-group">
                    <label class="form-label">Issue Date</label>
                    <input type="date" name="issue_date" class="form-control"
                      value="${esc(d.issue_date ? d.issue_date.slice(0, 10) : '')}">
                  </div>
                  ${chk('Client Acknowledgement Received', 'client_acknowledgement_received', d.client_acknowledgement_received)}
                  <div class="form-group">
                    <label class="form-label">Acknowledgement Date</label>
                    <input type="date" name="acknowledgement_date" class="form-control"
                      value="${esc(d.acknowledgement_date ? d.acknowledgement_date.slice(0, 10) : '')}">
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
              <div class="form-actions" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;">
                <button type="submit" class="btn btn-primary" id="ar-submit-btn" data-mode="draft">
                  ${isEdit ? 'Save Changes' : 'Create Advice Record'}
                </button>
                <button type="submit" class="btn btn-success" id="ar-complete-btn" data-mode="complete"
                  ${d.roa_completed ? 'disabled title="Already marked complete"' : ''}>
                  ${d.roa_completed ? '✓ ROA Complete' : '✓ Mark ROA as Complete'}
                </button>
                <a href="${isEdit ? `#/advice-records/${id}` : '#/advice-records'}" class="btn btn-secondary">Cancel</a>
                <small style="margin-left:auto;color:var(--muted,#666);">Mark Complete requires all mandatory fields.</small>
              </div>

            </form>
          </div>
        </div>`;

      const formEl = document.getElementById('ar-form');
      wireContactAccountToggle(formEl);
      wireCurrencySelector(formEl);

      // ─── Interactive wiring ────────────────────────────────────────────

      // Track the mode the user clicked (draft vs complete) before submit fires
      let submitMode = 'draft';
      const draftBtn    = document.getElementById('ar-submit-btn');
      const completeBtn = document.getElementById('ar-complete-btn');
      if (draftBtn)    draftBtn.addEventListener('click',    () => { submitMode = 'draft';    });
      if (completeBtn) completeBtn.addEventListener('click', () => { submitMode = 'complete'; });

      // Alternatives repeater ─────────────────────────────────────────────
      const altsContainer = formEl.querySelector('#alternatives-container');
      function altRowHtml(a = {}) {
        return `
          <div class="alt-row" data-alt-row style="display:grid;grid-template-columns:1fr 1fr 2fr auto;gap:.5rem;margin-bottom:.4rem;align-items:start;">
            <input type="text" class="form-control" data-alt-field="product_name"
              placeholder="Product name" value="${esc(a.product_name || '')}">
            <input type="text" class="form-control" data-alt-field="insurer"
              placeholder="Insurer" value="${esc(a.insurer || '')}">
            <input type="text" class="form-control" data-alt-field="reason_not_recommended"
              placeholder="Reason not recommended" value="${esc(a.reason_not_recommended || '')}">
            <button type="button" class="btn btn-danger btn-sm alt-remove" title="Remove">✕</button>
          </div>`;
      }
      const initialAlts = parseJsonArray(d.alternatives_considered_list);
      altsContainer.innerHTML = (initialAlts.length ? initialAlts : [{}]).map(altRowHtml).join('');
      function attachAltRemove() {
        altsContainer.querySelectorAll('.alt-remove').forEach(btn => {
          btn.onclick = () => {
            const rows = altsContainer.querySelectorAll('[data-alt-row]');
            if (rows.length > 1) btn.closest('[data-alt-row]').remove();
            else showToast('At least one alternative row is required.', 'warning');
          };
        });
      }
      attachAltRemove();
      document.getElementById('alt-add-btn').onclick = () => {
        altsContainer.insertAdjacentHTML('beforeend', altRowHtml({}));
        attachAltRemove();
      };

      // COI toggle — description only visible on Yes
      function updateCoiToggle() {
        const yes = formEl.querySelector('input[name="conflict_of_interest_flag"]:checked')?.value === 'Yes';
        formEl.querySelector('#coi-detail-wrap').style.display = yes ? 'block' : 'none';
      }
      formEl.querySelectorAll('input[name="conflict_of_interest_flag"]').forEach(r =>
        r.addEventListener('change', updateCoiToggle));
      updateCoiToggle();

      // Commission disclosure → show/hide rate/value
      function updateCommissionToggle() {
        const v = formEl.querySelector('[name="commission_disclosed"]').value;
        const wrap = formEl.querySelector('#commission-value-wrap');
        wrap.style.display = (v && !/Not applicable/.test(v)) ? 'grid' : 'none';
      }
      formEl.querySelector('[name="commission_disclosed"]').addEventListener('change', updateCommissionToggle);

      // Client Decision → show/hide rejection fields
      function updateRejectionToggle() {
        const v = formEl.querySelector('[name="client_decision"]').value;
        const show = v === 'Declined' ? 'block' : 'none';
        formEl.querySelector('#rejection-reason-wrap').style.display = show;
        formEl.querySelector('#rejection-notes-wrap').style.display  = show;
      }
      formEl.querySelector('[name="client_decision"]').addEventListener('change', updateRejectionToggle);

      // Acknowledgment method → show witness when Verbal
      function updateWitnessToggle() {
        const v = formEl.querySelector('[name="client_acknowledgment_method"]').value;
        formEl.querySelector('#witness-wrap').style.display =
          v === 'Verbal (with witness name)' ? 'block' : 'none';
      }
      formEl.querySelector('[name="client_acknowledgment_method"]').addEventListener('change', updateWitnessToggle);

      // Live existing-cover preview when contact/account changes
      async function refreshExistingCover() {
        const cid = formEl.querySelector('[name="contact_id"]').value;
        const aid = formEl.querySelector('[name="account_id"]').value;
        const preview = formEl.querySelector('#existing-cover-preview');
        if (!cid && !aid) {
          preview.value = preview.value.startsWith('•') ? preview.value : 'Select a contact/account to preview current cover.';
          return;
        }
        try {
          const res = await Api.policies.list({
            ...(cid ? { contact_id: cid } : {}),
            ...(aid ? { account_id: aid } : {}),
            limit: 200,
          });
          const rows = (res.data || res || []).filter(p =>
            ['Active', 'Pending', 'Amended'].includes(p.policy_status));
          preview.value = rows.length
            ? rows.map(p =>
                `• ${p.insurer || 'Unknown insurer'} — ${p.policy_number || 'no number'}`
                + `${p.product_category ? ` (${p.product_category})` : ''}`
                + ` [${p.policy_status}]`
              ).join('\n')
            : 'No active policies on file.';
        } catch (_) { /* ignore */ }
      }
      formEl.querySelector('[name="contact_id"]').addEventListener('change', refreshExistingCover);
      formEl.querySelector('[name="account_id"]').addEventListener('change', refreshExistingCover);
      if (!isEdit) refreshExistingCover();

      // ── Pre-Sale Disclosure gate banner ─────────────────────────────
      // When a linked engagement does not have a Complete disclosure checklist,
      // show a prominent warning and block the submit buttons.
      const engagementsIndex = Object.fromEntries(engagements.map(e => [String(e.id), e]));
      const engageBanner = document.createElement('div');
      engageBanner.id = 'ar-engagement-disclosure-banner';
      engageBanner.style.cssText = 'display:none;margin:0 0 1rem;padding:.75rem 1rem;border-radius:6px;border:1px solid;';
      formEl.insertBefore(engageBanner, formEl.firstChild);

      function refreshEngagementDisclosureGate() {
        const eid = formEl.querySelector('[name="engagement_id"]').value;
        if (!eid) {
          engageBanner.style.display = 'none';
          if (draftBtn)    draftBtn.disabled    = false;
          if (completeBtn && !d.roa_completed) completeBtn.disabled = false;
          return;
        }
        const eng = engagementsIndex[String(eid)];
        const isComplete = eng && eng.presale_disclosure_status === 'Complete';
        if (isComplete) {
          engageBanner.style.display    = 'block';
          engageBanner.style.background = '#d4edda';
          engageBanner.style.borderColor = '#a3d9a5';
          engageBanner.style.color       = '#155724';
          engageBanner.innerHTML = `✓ Pre-sale disclosure on engagement <strong>${esc(eng.engagement_name || ('#' + eid))}</strong> is Complete. ROA can be created.`;
          if (draftBtn)    draftBtn.disabled    = false;
          if (completeBtn && !d.roa_completed) completeBtn.disabled = false;
        } else {
          engageBanner.style.display    = 'block';
          engageBanner.style.background = '#f8d7da';
          engageBanner.style.borderColor = '#f5c2c7';
          engageBanner.style.color       = '#842029';
          const name = eng ? (eng.engagement_name || ('#' + eid)) : ('#' + eid);
          engageBanner.innerHTML = `🔒 <strong>Pre-sale disclosure is incomplete</strong> on engagement <strong>${esc(name)}</strong>. A ROA cannot be saved until the disclosure checklist on the engagement is marked Complete. <a href="#/engagements/${esc(eid)}/edit" style="text-decoration:underline;">Open engagement</a>`;
          if (draftBtn)    draftBtn.disabled    = true;
          if (completeBtn) completeBtn.disabled = true;
        }
      }
      formEl.querySelector('[name="engagement_id"]').addEventListener('change', refreshEngagementDisclosureGate);
      refreshEngagementDisclosureGate();

      // Live suitability assessment — Product Library driven (Section 4.5) ─
      const contactsIndex = Object.fromEntries(contacts.map(c => [String(c.id), c]));
      const accountsIndex = Object.fromEntries(accounts.map(a => [String(a.id), a]));
      // Returns the array of target-market tokens (account.business_type +
      // contact.client_category) to compare against the product's allow-list.
      function deriveClientTypeLocal() {
        const tokens = [];
        const accId = formEl.querySelector('[name="account_id"]').value;
        if (accId) {
          const a = accountsIndex[String(accId)];
          if (a && a.business_type) tokens.push(a.business_type);
        }
        const cid = formEl.querySelector('[name="contact_id"]').value;
        if (cid) {
          const c = contactsIndex[String(cid)];
          if (c && c.client_category) tokens.push(c.client_category);
          if (c && c.related_account_id && !accId) {
            const a = accountsIndex[String(c.related_account_id)];
            if (a && a.business_type) tokens.push(a.business_type);
          }
        }
        return tokens;
      }

      let _suitabilityToken = 0;
      async function refreshSuitability() {
        const productId = formEl.querySelector('[name="product_id"]').value;
        const ra        = formEl.querySelector('[name="client_risk_appetite"]').value;
        const tfeRaw    = formEl.querySelector('[name="total_financial_exposure"]').value;
        const tfe       = tfeRaw === '' ? null : Number(tfeRaw);
        const clientTypes = deriveClientTypeLocal();

        const scoreEl       = formEl.querySelector('#suitability-score-display');
        const banner        = formEl.querySelector('#suitability-banner');
        const overrideWrap  = formEl.querySelector('#suitability-override-wrap');
        const overrideInput = formEl.querySelector('[name="suitability_override_reason"]');
        const coapprovalWrap = formEl.querySelector('#supervisor-coapproval-wrap');
        const coapprovalSel  = formEl.querySelector('[name="supervisor_co_approved_by_id"]');

        if (!productId) {
          scoreEl.value = 'Select a product';
          scoreEl.style.color = '#856404';
          banner.style.display    = 'block';
          banner.style.background = '#f8f9fa';
          banner.style.borderColor = '#dee2e6';
          banner.style.color      = '#495057';
          banner.textContent      = 'Select a Product from the Links section to evaluate target market suitability.';
          overrideWrap.style.display = 'none';
          if (overrideInput) overrideInput.required = false;
          coapprovalWrap.style.display = 'none';
          if (coapprovalSel) coapprovalSel.required = false;
          return;
        }

        const myToken = ++_suitabilityToken;
        let result;
        try {
          result = await Api.products.checkSuitability({
            product_id:           productId,
            client_risk_appetite: ra || null,
            client_types:         clientTypes,
            insurable_value:      tfe,
          });
        } catch (err) {
          banner.style.display    = 'block';
          banner.style.background = '#f8f9fa';
          banner.style.borderColor = '#dee2e6';
          banner.style.color      = '#495057';
          banner.textContent      = 'Unable to evaluate suitability: ' + (err.message || err);
          return;
        }
        if (myToken !== _suitabilityToken) return; // a newer call superseded us

        const status     = result.status || result.result;
        const mismatches = result.mismatches || [];

        scoreEl.value = status;
        if (status === 'Confirmed') {
          scoreEl.style.color = '#1a7a3a';
          banner.style.display    = 'block';
          banner.style.background = '#d4edda';
          banner.style.borderColor = '#a3d9a5';
          banner.style.color      = '#155724';
          banner.innerHTML        = '✅ <strong>Suitability Confirmed</strong> — all parameters match the product\'s target market definition.';
          overrideWrap.style.display = 'none';
          if (overrideInput) overrideInput.required = false;
          coapprovalWrap.style.display = 'none';
          if (coapprovalSel) coapprovalSel.required = false;
        } else if (status === 'Review Required') {
          scoreEl.style.color = '#b78105';
          banner.style.display    = 'block';
          banner.style.background = '#fff8e1';
          banner.style.borderColor = '#ffc107';
          banner.style.color      = '#664d03';
          banner.innerHTML        = '⚠️ <strong>Suitability Review Required</strong> — one or more parameters fall outside the product\'s target market. A written override reason is required before saving and will be logged in the monthly MI report.<ul style="margin:.4rem 0 0 1.2rem;">' +
            mismatches.map(m => `<li>${esc(m)}</li>`).join('') + '</ul>';
          overrideWrap.style.display = 'block';
          if (overrideInput) overrideInput.required = true;
          coapprovalWrap.style.display = 'none';
          if (coapprovalSel) coapprovalSel.required = false;
        } else if (status === 'Mismatch') {
          scoreEl.style.color = '#a71d2a';
          banner.style.display    = 'block';
          banner.style.background = '#fdecea';
          banner.style.borderColor = '#dc3545';
          banner.style.color      = '#a71d2a';
          banner.innerHTML        = '🚩 <strong>Target Market Mismatch</strong> — client type is outside this product\'s target market. A supervisor must co-approve this ROA before it can be sent.<ul style="margin:.4rem 0 0 1.2rem;">' +
            mismatches.map(m => `<li>${esc(m)}</li>`).join('') + '</ul>';
          overrideWrap.style.display = 'block';
          if (overrideInput) overrideInput.required = true;
          coapprovalWrap.style.display = 'block';
          if (coapprovalSel) coapprovalSel.required = true;
        }
      }

      formEl.querySelector('[name="client_risk_appetite"]').addEventListener('change', refreshSuitability);
      formEl.querySelector('[name="policy_id"]').addEventListener('change', refreshSuitability);
      formEl.querySelector('[name="product_id"]').addEventListener('change', refreshSuitability);
      formEl.querySelector('[name="contact_id"]').addEventListener('change', refreshSuitability);
      formEl.querySelector('[name="account_id"]').addEventListener('change', refreshSuitability);
      formEl.querySelector('[name="total_financial_exposure"]').addEventListener('change', refreshSuitability);
      refreshSuitability();

      // Make the Product select searchable + wire the + Add button
      const arProductSel = formEl.querySelector('#ar-product-select');
      if (arProductSel && typeof makeSearchable === 'function') {
        makeSearchable(arProductSel);
        const wrapper = arProductSel.parentNode;
        if (wrapper && wrapper !== formEl) {
          wrapper.style.flex     = '1 1 auto';
          wrapper.style.minWidth = '0';
        }
      }
      const arProductLibBtn = formEl.querySelector('#ar-product-library-btn');
      if (arProductLibBtn) arProductLibBtn.addEventListener('click', () => {
        navigate('products');
      });

      // ─── Submit handler ──────────────────────────────────────────────
      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();

        const data = serializeForm(formEl);
        data.roa_completed = submitMode === 'complete' ? 1 : (d.roa_completed ? 1 : 0);

        // Linear-order validation for 'complete' mode — prompts the broker
        // to fix Step 1 first, then Step 2, then Step 3, then Step 4.
        if (submitMode === 'complete') {
          const stepChecks = [
            { step: 1, label: 'Suitability Assessment', check: () => data.client_risk_appetite && data.total_financial_exposure && (data.identified_gaps && data.identified_gaps.length) },
            { step: 2, label: 'Recommendation',        check: () => data.recommendation_given && data.recommendation_rationale && data.alternatives_considered_list && data.alternatives_considered_list.length && data.reason_product_suitable },
            { step: 3, label: 'Conflict of Interest',  check: () => data.conflict_of_interest_flag && (data.conflict_of_interest_flag !== 'Yes' || data.conflict_of_interest_description) && data.commission_disclosed },
            { step: 4, label: 'Disclosures',           check: () => data.risks_explained && data.costs_explained && data.excess_explained && data.exclusions_explained && data.client_understanding_confirmed && data.fair_outcome_considered },
          ];
          for (const s of stepChecks) {
            if (!s.check()) {
              showToast(`Cannot mark Complete — finish Step ${s.step} (${s.label}) first.`, 'error');
              formEl.querySelector(`[data-step="${s.step}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              return;
            }
          }
          if (!data.client_acknowledgment_method || !data.acknowledgement_date) {
            showToast('Cannot mark Complete — acknowledgment method and date are required.', 'error');
            return;
          }
        }

        // Acknowledgment date vs advice date (client-side pre-check)
        if (data.acknowledgement_date && data.advice_date &&
            String(data.acknowledgement_date) < String(data.advice_date)) {
          showToast('Acknowledgment date must be on or after the ROA (advice) date.', 'error');
          return;
        }

        if (draftBtn)    draftBtn.disabled    = true;
        if (completeBtn) completeBtn.disabled = true;

        try {
          if (isEdit) {
            await Api.adviceRecords.update(id, data);
            showToast(submitMode === 'complete' ? 'ROA marked as Complete.' : 'Advice record updated.', 'success');
            navigate(`advice-records/${id}`);
          } else {
            const created = await Api.adviceRecords.create(data);
            const newId   = (created.data || created).id;
            showToast(submitMode === 'complete' ? 'ROA created and marked Complete.' : 'Advice record created.', 'success');
            navigate(`advice-records/${newId}`);
          }
        } catch (err) {
          showToast('Save failed: ' + err.message, 'error');
          if (draftBtn)    draftBtn.disabled    = false;
          if (completeBtn && !d.roa_completed) completeBtn.disabled = false;
        }
      });

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load form: ${esc(err.message)}</div>`;
    }
  }

  // ── ROA HTML Generator ───────────────────────────────────────────────────

  function _generateRoaHtml(d, contact, broker) {
    const contactName = contact
      ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
      : (d.contact_name || '—');
    const brokerName  = broker ? (broker.full_name || broker.username || '—') : (d.broker_name || '—');

    const disclosureRow = (label, val) =>
      `<tr><td>${label}</td><td>${val ? '&#10003;' : '&#10007;'}</td></tr>`;

    return `
      <!-- Letterhead: full-width, bleeds to top edge on page 1 -->
      <img class="roa-letterhead" src="/letterhead-ROA.png" alt="Letterhead">

      <div class="roa-body">

        <div class="roa-docref">Document Reference: ${d.advice_record_number || 'N/A'}</div>

        <!-- Section 1: Client & Adviser Details -->
        <div class="roa-section">
          <table class="roa-header-table">
            <tr>
              <td>
                <h3>Client Details</h3>
                <p><strong>Name:</strong> ${contactName}</p>
                ${contact && contact.email        ? `<p><strong>Email:</strong> ${contact.email}</p>` : ''}
                ${contact && contact.mobile       ? `<p><strong>Mobile:</strong> ${contact.mobile}</p>` : ''}
              </td>
              <td>
                <h3>Adviser Details</h3>
                <p><strong>Adviser:</strong> ${brokerName}</p>
                <p><strong>Date of Advice:</strong> ${d.advice_date ? d.advice_date.slice(0, 10) : '—'}</p>
                <p><strong>Advice Type:</strong> ${d.advice_type || '—'}</p>
                ${d.trigger_event ? `<p><strong>Trigger Event:</strong> ${d.trigger_event}</p>` : ''}
              </td>
            </tr>
          </table>
        </div>

        <!-- Section 2: Suitability Assessment -->
        <h3>Suitability Assessment</h3>
        <div class="roa-section">
          ${d.client_risk_appetite ? `<p><strong>Client Risk Appetite:</strong> ${d.client_risk_appetite}</p>` : ''}
          ${d.total_financial_exposure != null && d.total_financial_exposure !== '' ? `<p><strong>Total Financial Exposure:</strong> R ${Number(d.total_financial_exposure).toLocaleString('en-ZA', {minimumFractionDigits:2,maximumFractionDigits:2})}</p>` : ''}
          ${d.suitability_match_score ? `<p><strong>Suitability Match Score:</strong> ${d.suitability_match_score}</p>` : ''}
          ${d.existing_cover_summary_auto ? `<p><strong>Existing Cover (auto-populated):</strong></p><div class="roa-plain-block">${d.existing_cover_summary_auto}</div>` : ''}
          ${(() => {
            const gaps = parseJsonArray(d.identified_gaps);
            return gaps.length ? `<p><strong>Identified Gaps:</strong></p><div class="roa-plain-block">${gaps.map(g => '• ' + g).join('<br>')}</div>` : '';
          })()}
          ${d.identified_gaps_notes ? `<p><strong>Gap Notes:</strong></p><div class="roa-plain-block">${d.identified_gaps_notes}</div>` : ''}
          ${d.suitability_match_score === 'Mismatch' && d.suitability_override_reason ? `<p><strong>Override Reason:</strong></p><div class="roa-text-block">${d.suitability_override_reason}</div>` : ''}
        </div>

        <!-- Section 3: Needs Analysis -->
        <h3>Needs Analysis</h3>
        <div class="roa-section">
          <p><strong>Client Needs Identified:</strong></p>
          <div class="roa-text-block">${d.client_needs_identified || '—'}</div>
          <p><strong>Risk Analysis Summary:</strong></p>
          <div class="roa-text-block">${d.risk_analysis_summary || '—'}</div>
          ${d.current_cover_considered ? `<p><strong>Current Cover Considered:</strong></p><div class="roa-plain-block">${d.current_cover_considered}</div>` : ''}
          ${d.shortfalls_identified    ? `<p><strong>Shortfalls Identified:</strong></p><div class="roa-plain-block">${d.shortfalls_identified}</div>` : ''}
        </div>

        <!-- Section 4: Recommendation -->
        <h3>Recommendation</h3>
        <div class="roa-section">
          <p><strong>Recommendation Given:</strong></p>
          <div class="roa-text-block">${d.recommendation_given || '—'}</div>
          ${d.recommendation_rationale ? `<p><strong>Recommendation Rationale (structured):</strong></p><div class="roa-text-block">${d.recommendation_rationale}</div>` : ''}
          ${(() => {
            const alts = parseJsonArray(d.alternatives_considered_list);
            if (!alts.length) return '';
            const rows = alts.map((a, i) =>
              `<tr><td>${i + 1}</td><td>${a.product_name || '—'}</td><td>${a.insurer || '—'}</td><td>${a.reason_not_recommended || '—'}</td></tr>`
            ).join('');
            return `<p><strong>Alternatives Considered:</strong></p>
              <table class="roa-disclosure" style="margin-bottom:6pt;">
                <thead><tr><th style="width:20pt;">#</th><th>Product</th><th>Insurer</th><th>Reason not recommended</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>`;
          })()}
          ${d.alternative_options_considered ? `<p><strong>Alternative Options (free-text):</strong></p><div class="roa-plain-block">${d.alternative_options_considered}</div>` : ''}
          <p><strong>Reason Product is Suitable:</strong></p>
          <div class="roa-text-block">${d.reason_product_suitable || '—'}</div>
          ${d.consequences_of_not_proceeding ? `<p><strong>Consequences of Not Proceeding:</strong></p><div class="roa-plain-block">${d.consequences_of_not_proceeding}</div>` : ''}
        </div>

        <!-- Section 4b: Conflict of Interest -->
        <h3>Conflict of Interest Declaration</h3>
        <div class="roa-section">
          <p><strong>Financial Interest Disclosed:</strong> ${d.conflict_of_interest_flag || '—'}</p>
          ${d.conflict_of_interest_flag === 'Yes' && d.conflict_of_interest_description ? `<p><strong>Nature of Conflict:</strong></p><div class="roa-text-block">${d.conflict_of_interest_description}</div>` : ''}
          ${d.commission_disclosed ? `<p><strong>Commission Disclosure:</strong> ${d.commission_disclosed}</p>` : ''}
          ${d.commission_rate_value != null && d.commission_rate_value !== '' ? `<p><strong>Commission Rate / Fee:</strong> ${
            d.commission_rate_type === 'percent'
              ? `${Number(d.commission_rate_value)}%`
              : 'R ' + Number(d.commission_rate_value).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          }</p>` : ''}
        </div>

        <!-- Section 4: Disclosures -->
        <h3>Disclosures Checklist</h3>
        <table class="roa-disclosure">
          <thead>
            <tr>
              <th>Disclosure Item</th>
              <th>Completed</th>
            </tr>
          </thead>
          <tbody>
            ${disclosureRow('Risks explained to client', d.risks_explained)}
            ${disclosureRow('Costs explained to client', d.costs_explained)}
            ${disclosureRow('Excess explained to client', d.excess_explained)}
            ${disclosureRow('Waiting period &amp; limitations explained', d.waiting_period_limitations_explained)}
            ${disclosureRow('Exclusions explained to client', d.exclusions_explained)}
            ${disclosureRow('Client understanding confirmed', d.client_understanding_confirmed)}
            ${disclosureRow('Fair outcome considered', d.fair_outcome_considered)}
          </tbody>
        </table>

        <!-- Section 5: Client Decision & Acknowledgment -->
        <h3>Client Decision & Acknowledgment</h3>
        <div class="roa-section">
          <p><strong>Decision:</strong> ${d.client_decision || '—'}</p>
          ${d.decision_date  ? `<p><strong>Decision Date:</strong> ${d.decision_date.slice(0, 10)}</p>` : ''}
          ${d.client_decision === 'Declined' && d.client_rejection_reason ? `<p><strong>Rejection Reason:</strong> ${d.client_rejection_reason}</p>` : ''}
          ${d.client_decision === 'Declined' && d.client_rejection_notes ? `<p><strong>Rejection Notes:</strong> ${d.client_rejection_notes}</p>` : ''}
          ${d.decision_notes ? `<p><strong>Decision Notes:</strong></p><div class="roa-plain-block">${d.decision_notes}</div>` : ''}
          ${d.client_acknowledgment_method ? `<p><strong>Acknowledgment Method:</strong> ${d.client_acknowledgment_method}</p>` : ''}
          ${d.client_acknowledgment_method === 'Verbal (with witness name)' && d.acknowledgment_witness_name ? `<p><strong>Witness:</strong> ${d.acknowledgment_witness_name}</p>` : ''}
          ${d.acknowledgement_date ? `<p><strong>Date Acknowledgment Received:</strong> ${String(d.acknowledgement_date).slice(0, 10)}</p>` : ''}
        </div>

        <!-- Section 6: Signatures -->
        <h3>Signatures</h3>
        <table class="roa-sig-table">
          <tr>
            <td>
              <div class="roa-sig-line"></div>
              <p class="roa-sig-label">Client Signature &amp; Date</p>
            </td>
            <td>
              <div class="roa-sig-line"></div>
              <p class="roa-sig-label">Adviser Signature &amp; Date</p>
            </td>
          </tr>
        </table>

        ${d.engagement_disclosure_ts ? `<p class="roa-footer roa-disclosure-ref">Pre-sale disclosure completed by ${d.engagement_disclosing_broker || '—'} on ${new Date(d.engagement_disclosure_ts).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}.</p>` : ''}
        <p class="roa-footer">Generated by Inexpro CRM on ${new Date().toLocaleDateString('en-ZA')}</p>

      </div>`;
  }

  // ── Detail ────────────────────────────────────────────────────────────────

  async function detail(id) {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    document.getElementById('ar-center-filters')?.remove();
    const headerActions = document.getElementById('header-actions');
    if (headerActions) {
      headerActions.style.flex = '';
      headerActions.innerHTML = `<a href="#/advice-records/${id}/edit" class="btn btn-primary">Edit</a>`;
    }

    try {
      const d = await Api.adviceRecords.get(id);

      setPageTitle(d.advice_record_number || 'Advice Record');
      setBreadcrumb(['Records of Advice', d.advice_record_number || 'Detail']);

      // Update header with generate/email/complete buttons.
      // The "Mark ROA Complete" button is shown when the record is not yet
      // complete; clicking it locks the ROA — subsequent edits will require
      // an admin password (server-side gate via /:id/complete + edit-lock).
      if (headerActions) {
        const completeBtn = d.roa_completed
          ? `<span class="badge badge-success" style="padding:.4rem .65rem;">✓ ROA Complete</span>`
          : `<button class="btn btn-success" id="ar-detail-complete-btn">✓ Mark ROA as Complete</button>`;
        headerActions.innerHTML = `
          <button class="btn btn-secondary" onclick="AdviceRecords._generateRoa(${id})">📄 Generate ROA</button>
          <button class="btn btn-secondary" onclick="AdviceRecords._emailRoa(${id})">Send ROA</button>
          ${completeBtn}
          <a href="#/advice-records/${id}/edit" class="btn btn-primary">Edit</a>`;
        document.getElementById('ar-detail-complete-btn')?.addEventListener('click', async () => {
          if (!confirm('Mark this Record of Advice as Complete?\n\nOnce complete, the ROA can no longer be edited unless an admin password is entered. This is the FAIS audit-trail lock.')) return;
          try {
            await Api.adviceRecords.complete(id);
            showToast('ROA marked Complete — record is now locked.', 'success');
            detail(id);  // re-render
          } catch (err) {
            showToast(err.message || 'Failed to mark complete', 'error');
          }
        });
      }

      el.innerHTML = `
        <div class="detail-view">

          <!-- Record Details -->
          <div class="detail-section card">
            <div class="detail-section-title">Record Details</div>
            <div class="detail-grid">
              ${field('Record Number', esc(d.advice_record_number || '—'))}
              ${field('Advice Date', d.advice_date ? formatDate(d.advice_date) : '—')}
              ${field('Advice Type', esc(d.advice_type || '—'))}
              ${field('Trigger Event', esc(d.trigger_event || '—'))}
            </div>
          </div>

          <!-- Links -->
          <div class="detail-section card">
            <div class="detail-section-title">Links</div>
            <div class="detail-grid">
              ${field('Contact', d.contact_id ? `<a href="#/contacts/${d.contact_id}">${esc(d.contact_name || '—')}</a>` : '—')}
              ${field('Account', d.account_id ? `<a href="#/accounts/${d.account_id}">${esc(d.account_name || '—')}</a>` : '—')}
              ${field('Engagement', d.engagement_id ? `<a href="#/engagements/${d.engagement_id}">${esc(d.engagement_name || '—')}</a>` : '—')}
              ${field('Policy', d.policy_id ? `<a href="#/policies/${d.policy_id}">${esc(d.policy_name || d.policy_number || '—')}</a>` : '—')}
              ${field('Broker', esc(d.broker_name || '—'))}
              ${field('Prepared By', esc(d.prepared_by_name || '—'))}
            </div>
          </div>

          <!-- Suitability Assessment -->
          <div class="detail-section card">
            <div class="detail-section-title">
              Suitability Assessment
              ${d.roa_completed ? '<span class="badge badge-success" style="margin-left:.5rem;">✓ Complete</span>' : '<span class="badge badge-secondary" style="margin-left:.5rem;">Draft</span>'}
            </div>
            <div class="detail-grid">
              ${field('Client Risk Appetite', esc(d.client_risk_appetite || '—'))}
              ${field('Total Financial Exposure', d.total_financial_exposure != null && d.total_financial_exposure !== '' ? 'R ' + Number(d.total_financial_exposure).toLocaleString('en-ZA', {minimumFractionDigits:2,maximumFractionDigits:2}) : '—')}
              ${field('Suitability Match', (() => {
                const s = d.suitability_match_score || '—';
                const cls = s === 'Match' ? 'badge-success' : (s === 'Mismatch' ? 'badge-danger' : 'badge-warning');
                return `<span class="badge ${cls}">${esc(s)}</span>`;
              })())}
              ${field('Identified Gaps', (() => {
                const gaps = parseJsonArray(d.identified_gaps);
                return gaps.length ? gaps.map(g => `<span class="badge badge-secondary" style="margin-right:.25rem;">${esc(g)}</span>`).join('') : '—';
              })())}
            </div>
            ${d.existing_cover_summary_auto ? `<div class="detail-grid detail-grid-1" style="margin-top:.5rem;">${field('Existing Cover (auto)', `<pre class="detail-pre">${esc(d.existing_cover_summary_auto)}</pre>`)}</div>` : ''}
            ${d.identified_gaps_notes ? `<div class="detail-grid detail-grid-1">${field('Gap Notes', `<pre class="detail-pre">${esc(d.identified_gaps_notes)}</pre>`)}</div>` : ''}
            ${d.suitability_match_score === 'Mismatch' && d.suitability_override_reason ? `<div class="detail-grid detail-grid-1">${field('Override Reason', `<pre class="detail-pre">${esc(d.suitability_override_reason)}</pre>`)}</div>` : ''}
          </div>

          <!-- Needs Analysis -->
          <div class="detail-section card">
            <div class="detail-section-title">Needs Analysis</div>
            <div class="detail-grid detail-grid-1">
              ${field('Client Needs Identified', `<pre class="detail-pre">${esc(d.client_needs_identified || '—')}</pre>`)}
              ${field('Risk Analysis Summary', `<pre class="detail-pre">${esc(d.risk_analysis_summary || '—')}</pre>`)}
              ${d.current_cover_considered ? field('Current Cover Considered', `<pre class="detail-pre">${esc(d.current_cover_considered)}</pre>`) : ''}
              ${d.shortfalls_identified ? field('Shortfalls Identified', `<pre class="detail-pre">${esc(d.shortfalls_identified)}</pre>`) : ''}
            </div>
          </div>

          <!-- Recommendation -->
          <div class="detail-section card">
            <div class="detail-section-title">Recommendation</div>
            <div class="detail-grid detail-grid-1">
              ${field('Recommendation Given', `<pre class="detail-pre">${esc(d.recommendation_given || '—')}</pre>`)}
              ${d.recommendation_rationale ? field('Recommendation Rationale (structured)', `<pre class="detail-pre">${esc(d.recommendation_rationale)}</pre>`) : ''}
              ${(() => {
                const alts = parseJsonArray(d.alternatives_considered_list);
                if (!alts.length) return '';
                const rows = alts.map((a, i) =>
                  `<tr><td>${i + 1}</td><td>${esc(a.product_name || '—')}</td><td>${esc(a.insurer || '—')}</td><td>${esc(a.reason_not_recommended || '—')}</td></tr>`
                ).join('');
                return field('Alternatives Considered',
                  `<table class="table" style="margin-top:.25rem;">
                    <thead><tr><th>#</th><th>Product</th><th>Insurer</th><th>Reason not recommended</th></tr></thead>
                    <tbody>${rows}</tbody>
                  </table>`);
              })()}
              ${d.alternative_options_considered ? field('Alternative Options (free-text)', `<pre class="detail-pre">${esc(d.alternative_options_considered)}</pre>`) : ''}
              ${field('Reason Product is Suitable', `<pre class="detail-pre">${esc(d.reason_product_suitable || '—')}</pre>`)}
              ${d.consequences_of_not_proceeding ? field('Consequences of Not Proceeding', `<pre class="detail-pre">${esc(d.consequences_of_not_proceeding)}</pre>`) : ''}
            </div>
          </div>

          <!-- Conflict of Interest -->
          <div class="detail-section card">
            <div class="detail-section-title">Conflict of Interest (GCC §3A)</div>
            <div class="detail-grid">
              ${field('Financial Interest Disclosed', (() => {
                const v = d.conflict_of_interest_flag;
                if (v === 'Yes') return '<span class="badge badge-warning">Yes — Conflict declared</span>';
                if (v === 'No')  return '<span class="badge badge-success">No</span>';
                return '<span class="badge badge-danger">Not declared</span>';
              })())}
              ${field('Commission Disclosed', esc(d.commission_disclosed || '—'))}
              ${field('Commission Rate / Fee', (() => {
                if (d.commission_rate_value == null || d.commission_rate_value === '') return '—';
                const v = Number(d.commission_rate_value);
                return d.commission_rate_type === 'percent'
                  ? `${v}%`
                  : 'R ' + v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              })())}
            </div>
            ${d.conflict_of_interest_flag === 'Yes' && d.conflict_of_interest_description ? `<div class="detail-grid detail-grid-1">${field('Nature of Conflict', `<pre class="detail-pre">${esc(d.conflict_of_interest_description)}</pre>`)}</div>` : ''}
          </div>

          <!-- Disclosures -->
          <div class="detail-section card">
            <div class="detail-section-title">Disclosures</div>
            <div class="detail-grid">
              ${field('Risks Explained', boolBadge(d.risks_explained))}
              ${field('Costs Explained', boolBadge(d.costs_explained))}
              ${field('Excess Explained', boolBadge(d.excess_explained))}
              ${field('Waiting Period &amp; Limitations Explained', boolBadge(d.waiting_period_limitations_explained))}
              ${field('Exclusions Explained', boolBadge(d.exclusions_explained))}
              ${field('Client Understanding Confirmed', boolBadge(d.client_understanding_confirmed))}
              ${field('Fair Outcome Considered', boolBadge(d.fair_outcome_considered))}
            </div>
          </div>

          <!-- Client Decision -->
          <div class="detail-section card">
            <div class="detail-section-title">Client Decision & Acknowledgment</div>
            <div class="detail-grid">
              ${field('Decision', esc(d.client_decision || '—'))}
              ${field('Decision Date', d.decision_date ? formatDate(d.decision_date) : '—')}
              ${d.client_decision === 'Declined' ? field('Rejection Reason', esc(d.client_rejection_reason || '—')) : ''}
              ${d.client_decision === 'Declined' && d.client_rejection_notes ? field('Rejection Notes', esc(d.client_rejection_notes)) : ''}
              ${field('Acknowledgment Method', esc(d.client_acknowledgment_method || '—'))}
              ${field('Acknowledgment Date', d.acknowledgement_date ? formatDate(d.acknowledgement_date) : '—')}
              ${d.client_acknowledgment_method === 'Verbal (with witness name)' && d.acknowledgment_witness_name ? field('Witness', esc(d.acknowledgment_witness_name)) : ''}
            </div>
            ${d.decision_notes ? `<div class="detail-grid detail-grid-1" style="margin-top:.5rem;">${field('Decision Notes', `<pre class="detail-pre">${esc(d.decision_notes)}</pre>`)}</div>` : ''}
          </div>

          <!-- Documentation -->
          <div class="detail-section card">
            <div class="detail-section-title">Documentation Status</div>
            <div class="detail-grid">
              ${field('ROA Generated', boolBadge(d.roa_generated))}
              ${field('ROA Generation Date', d.roa_generation_date ? formatDate(d.roa_generation_date) : '—')}
              ${field('Final Document Issued', boolBadge(d.final_document_issued))}
              ${field('Issue Date', d.issue_date ? formatDate(d.issue_date) : '—')}
              ${field('Client Acknowledgement Received', boolBadge(d.client_acknowledgement_received))}
              ${field('Acknowledgement Date', d.acknowledgement_date ? formatDate(d.acknowledgement_date) : '—')}
            </div>
          </div>

          ${d.notes ? `
          <div class="detail-section card">
            <div class="detail-section-title">Notes</div>
            <p class="detail-notes">${esc(d.notes)}</p>
          </div>` : ''}

          <!-- Tabs: Timeline + Documents -->
          <div class="detail-tabs card">
            <div class="tabs-header" id="ar-tabs-header">
              <button class="tab-btn active" data-tab="timeline">Timeline</button>
              <button class="tab-btn" data-tab="documents">Documents</button>
            </div>
            <div class="tab-content" id="ar-tab-content">
              <div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>
            </div>
          </div>

        </div>`;

      // Store record data for ROA generation
      el._arData = d;

      _loadArTab(id, 'timeline');

      document.getElementById('ar-tabs-header').querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#ar-tabs-header .tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          _loadArTab(id, btn.dataset.tab);
        });
      });

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load advice record: ${esc(err.message)}</div>`;
    }
  }

  async function _loadArTab(arId, tab) {
    const tabEl = document.getElementById('ar-tab-content');
    if (!tabEl) return;
    tabEl.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    try {
      switch (tab) {
        case 'timeline': {
          const entries = await Api.timeline.forRecord('advice_records', arId);
          const rows = Array.isArray(entries) ? entries : (entries.data || []);
          tabEl.innerHTML = `<div style="padding:.75rem 1rem;">${renderTimeline(rows, 'No activity recorded yet.')}</div>`;
          break;
        }
        case 'documents': {
          const res = await Api.documents.list({ module: 'advice-records', record_id: arId });
          const docs = res.data || [];
          tabEl.innerHTML = `
            <div class="tab-toolbar">
              <label class="btn btn-primary btn-sm" for="ar-doc-upload">+ Upload Document</label>
              <input type="file" id="ar-doc-upload" style="display:none;" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx">
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
            </table>` : `<p class="tab-empty">No documents uploaded yet.</p>`}`;
          document.getElementById('ar-doc-upload').addEventListener('change', async e => {
            const file = e.target.files[0];
            if (!file) return;
            try {
              const fd = new FormData();
              fd.append('file', file);
              fd.append('module', 'advice-records');
              fd.append('record_id', arId);
              await Api.documents.upload(fd);
              showToast('Document uploaded.', 'success');
              _loadArTab(arId, 'documents');
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
                _loadArTab(arId, 'documents');
              } catch (err) {
                showToast('Delete failed: ' + (err.message || err), 'error');
              }
            });
          });
          break;
        }
        default:
          tabEl.innerHTML = '';
      }
    } catch (err) {
      tabEl.innerHTML = `<p class="tab-empty text-danger">Failed to load tab: ${esc(err.message || String(err))}</p>`;
    }
  }

  async function _generateRoa(id) {
    try {
      const d = await Api.adviceRecords.get(id);
      let contact = null;
      if (d.contact_id) {
        try { contact = await Api.contacts.get(d.contact_id); } catch (_) {}
      }

      const html = _generateRoaHtml(d, contact, null);
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(`<!DOCTYPE html><html><head><title>ROA - ${d.advice_record_number || ''}</title>
          <style>
            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

            /* ── A4 page setup ───────────────────────────────────────────── */
            @page          { size: A4 portrait; margin: 15mm 15mm 20mm 15mm; }
            @page :first   { margin-top: 0; }          /* letterhead bleeds to top edge on page 1 */

            body {
              font-family: Arial, Helvetica, sans-serif;
              font-size: 10pt;
              line-height: 1.5;
              color: #222;
              background: #fff;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }

            /* ── Letterhead ──────────────────────────────────────────────── */
            .roa-letterhead {
              display: block;
              width: 100%;
              height: auto;
              margin: 0;
              padding: 0;
            }

            /* ── Content wrapper ─────────────────────────────────────────── */
            .roa-body {
              padding-top: 6mm;
            }

            /* ── Typography ──────────────────────────────────────────────── */
            p { margin-bottom: 5pt; orphans: 3; widows: 3; }

            h3 {
              font-size: 11pt;
              color: #1a5276;
              border-bottom: 1pt solid #dee2e6;
              padding-bottom: 3pt;
              margin: 12pt 0 6pt;
              page-break-after: avoid;
            }

            /* ── Sections: keep together where possible ──────────────────── */
            .roa-section        { page-break-inside: avoid; margin-bottom: 8pt; }
            .roa-text-block     {
              background: #f8f9fa;
              border-left: 3pt solid #1a5276;
              padding: 5pt 8pt;
              margin-bottom: 7pt;
              white-space: pre-wrap;
              font-size: 9.5pt;
              page-break-inside: avoid;
            }
            .roa-plain-block    {
              background: #f8f9fa;
              padding: 5pt 8pt;
              margin-bottom: 7pt;
              white-space: pre-wrap;
              font-size: 9.5pt;
              page-break-inside: avoid;
            }

            /* ── Two-column header table ─────────────────────────────────── */
            .roa-header-table   { width: 100%; border-collapse: collapse; margin-bottom: 10pt; }
            .roa-header-table td { width: 50%; vertical-align: top; padding: 0 8pt 0 0; }
            .roa-header-table td + td { padding: 0 0 0 8pt; border-left: 1pt solid #dee2e6; }

            /* ── Disclosure checklist ────────────────────────────────────── */
            .roa-disclosure     { width: 100%; border-collapse: collapse; margin-bottom: 10pt; font-size: 9.5pt; page-break-inside: avoid; }
            .roa-disclosure th  { background: #1a5276; color: #fff; padding: 4pt 6pt; text-align: left; }
            .roa-disclosure th:last-child { text-align: center; width: 60pt; }
            .roa-disclosure td  { padding: 3pt 6pt; border-bottom: 0.5pt solid #dee2e6; }
            .roa-disclosure td:last-child { text-align: center; }
            .roa-disclosure tr:nth-child(even) td { background: #f8f9fa; }

            /* ── Signature block ─────────────────────────────────────────── */
            .roa-sig-table      { width: 100%; border-collapse: collapse; margin-top: 8pt; page-break-inside: avoid; }
            .roa-sig-table td   { width: 50%; vertical-align: bottom; padding: 0 16pt 0 0; }
            .roa-sig-table td + td { padding: 0 0 0 16pt; }
            .roa-sig-line       { border-bottom: 1pt solid #222; height: 28pt; margin-bottom: 3pt; }
            .roa-sig-label      { font-size: 8pt; color: #666; }

            /* ── Footer note ─────────────────────────────────────────────── */
            .roa-footer         { font-size: 7.5pt; color: #999; text-align: center; margin-top: 14pt; }

            /* ── Doc ref ─────────────────────────────────────────────────── */
            .roa-docref         { text-align: right; font-size: 8.5pt; color: #666; margin-bottom: 8pt; }
          </style>
          </head><body>${html}
          <script>setTimeout(function(){window.print();}, 400);<\/script>
          </body></html>`);
        win.document.close();
      } else {
        showToast('Popup blocked. Allow popups to generate ROA.', 'error');
      }
    } catch (err) {
      showToast('Failed to generate ROA: ' + err.message, 'error');
    }
  }

  // ── Send ROA ─────────────────────────────────────────────────────────────
  //
  // New flow: clicking "Send ROA" creates a pending signature_request for
  // this ROA, then opens the email modal pre-filled with the signing link
  // already pasted into the body. The broker tweaks the message + sends.
  // The client clicks the link → reviews the ROA on a public page →
  // signs → submits → the signed PDF is filed automatically under the
  // ROA, contact, account, and policy.
  async function _emailRoa(id) {
    try {
      // 1) Create the signature request first so the link is ready before
      //    the broker even sees the email modal.
      const r = await fetch(`/api/advice-records/${id}/sign-request`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!r.ok) {
        let msg = 'Failed to create signature link';
        try { const j = await r.json(); if (j.error) msg = j.error; } catch (_) {}
        throw new Error(msg);
      }
      const sig = await r.json();

      // 2) Pull client / contact details for the modal pre-fill.
      const d = await Api.adviceRecords.get(id);
      let contact = null;
      if (d.contact_id) {
        try { contact = await Api.contacts.get(d.contact_id); } catch (_) {}
      }
      const contactName = contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : '';
      const email = (sig.recipient_email) || (contact ? contact.email : '') || '';
      const greeting = contactName ? `Dear ${contactName},` : 'Hi,';

      // Default HTML body with the signing link styled as a button + the
      // raw URL underneath for forwarding / copy-paste.
      const defaultBody =
        `<p>${esc(greeting)}</p>` +
        `<p>Please click the link below to review and sign your Record of Advice (${esc(d.advice_record_number || '')}). ` +
        `When you submit, your signed copy will be filed against your record automatically.</p>` +
        `<p style="margin:18px 0;">` +
          `<a href="${esc(sig.public_url)}" style="display:inline-block;padding:10px 18px;background:#1a5276;color:#fff;text-decoration:none;border-radius:4px;font-weight:600;">Click here to review and sign</a>` +
        `</p>` +
        `<p style="font-size:12px;color:#666;">Or copy this link into your browser: ${esc(sig.public_url)}</p>` +
        `<p>Kind regards,<br><strong>${esc(window.currentUser?.full_name || 'Inexpro Broker')}</strong></p>`;

      const modal = document.createElement('div');
      modal.id = 'mail-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal" style="width:600px;max-width:95vw;" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3>Send ROA for Signature</h3>
            <button class="btn-close" onclick="document.getElementById('mail-modal').remove()">×</button>
          </div>
          <div class="modal-body">
            <div id="mail-error" style="display:none;color:var(--danger);margin-bottom:.75rem;"></div>
            <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:.75rem;">
              A unique signing link has been created. It's already in the message below — tweak the wording if you like, then send.
            </p>
            <div class="form-group">
              <label class="form-label">To</label>
              <input class="form-control" id="mail-to" value="${esc(email)}" placeholder="recipient@email.com">
            </div>
            <div class="form-group">
              <label class="form-label">Subject</label>
              <input class="form-control" id="mail-subject" value="Record of Advice - ${esc(d.advice_record_number || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Message</label>
              <textarea class="form-control" id="mail-message" rows="10" style="font-family:Arial,sans-serif;font-size:.85rem;">${esc(defaultBody)}</textarea>
              <small style="color:var(--text-muted);font-size:.75rem;">HTML supported. The signing link is included above.</small>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('mail-modal').remove()">Cancel</button>
            <button class="btn btn-primary" id="mail-send-btn" onclick="AdviceRecords._sendRoaEmail()">Send ROA</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal._roaId = id;
      modal._signatureRequest = sig;
    } catch (err) {
      showToast('Failed to prepare ROA email: ' + (err.message || err), 'error');
    }
  }

  async function _sendRoaEmail() {
    const modal   = document.getElementById('mail-modal');
    const roaId   = modal?._roaId;
    const to      = document.getElementById('mail-to')?.value?.trim();
    const subject = document.getElementById('mail-subject')?.value?.trim();
    const html    = document.getElementById('mail-message')?.value || '';
    const errEl   = document.getElementById('mail-error');
    const sendBtn = document.getElementById('mail-send-btn');

    if (!to || !subject) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'To and Subject are required.'; }
      return;
    }

    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending…'; }
    try {
      await Api.settings.sendEmail({
        to,
        subject,
        html,
        text: html.replace(/<[^>]+>/g, ''),
        audit_module: 'advice_records',
        audit_record_id: roaId,
      });
      document.getElementById('mail-modal')?.remove();
      showToast('ROA signing link sent.', 'success');
    } catch (e) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = e.message; }
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send ROA'; }
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return { list, form, detail, _generateRoa, _emailRoa, _sendRoaEmail, _generateRoaHtml };

})();
