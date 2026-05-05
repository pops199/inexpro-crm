/* ═══════════════════════════════════════════════════════════════════════════
   Engagements component  —  Client Engagements (spec section 7)
   ═══════════════════════════════════════════════════════════════════════════ */

const Engagements = (() => {

  // ── Constants ────────────────────────────────────────────────────────────

  const STAGES = [
    'Prospect',
    'Initial Contact',
    'Appointment Scheduled',
    'Fact Find Completed',
    'Needs Analysis Completed',
    'Quote / Proposal Prepared',
    'Advice Presented',
    'Client Decision Pending',
    'Accepted - Implementation',
    'Implemented / Active',
    'Lost / Declined',
    'On Hold',
  ];

  const ENGAGEMENT_TYPES = [
    'New Business',
    'Replacement Cover',
    'Additional Cover',
    'Amendment',
    'Renewal Review',
    'Cancellation Review',
    'Claims-Driven Advice',
    'Complaint-Driven Review',
    'Enquiry',
  ];

  const SOURCES = [
    'Referral',
    'Walk-in',
    'Existing Client',
    'Website',
    'Call-in',
    'Social Media',
    'Broker Initiative',
    'Other',
  ];

  const RISK_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

  // Stages after which disclosure + accepted decision is required
  const STAGES_REQUIRING_DISCLOSURE = ['Accepted - Implementation', 'Implemented / Active', 'Lost / Declined', 'On Hold'];

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

  function stagePill(stage) {
    const safe = esc(stage || '—');
    const slug = (stage || '').toLowerCase().replace(/\s+/g, '-');
    return `<span class="badge badge-stage badge-stage--${slug}">${safe}</span>`;
  }

  function checkIcon(val) {
    return val ? '<span class="check-done" title="Completed">&#10003;</span>'
               : '<span class="check-pending" title="Pending">&#9675;</span>';
  }

  function stageOptions(selected) {
    return STAGES.map(s =>
      `<option value="${esc(s)}" ${selected === s ? 'selected' : ''}>${esc(s)}</option>`
    ).join('');
  }

  function typeOptions(selected) {
    return ENGAGEMENT_TYPES.map(t =>
      `<option value="${esc(t)}" ${selected === t ? 'selected' : ''}>${esc(t)}</option>`
    ).join('');
  }

  function sourceOptions(selected) {
    return ['', ...SOURCES].map(s =>
      `<option value="${esc(s)}" ${selected === s ? 'selected' : ''}>${esc(s) || '— Select Source —'}</option>`
    ).join('');
  }

  function priorityOptions(selected) {
    return ['', ...RISK_PRIORITIES].map(p =>
      `<option value="${esc(p)}" ${selected === p ? 'selected' : ''}>${esc(p) || '— Select Priority —'}</option>`
    ).join('');
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

  function getFiltersFromHash() {
    const hash = window.location.hash || '';
    const qIdx = hash.indexOf('?');
    if (qIdx === -1) return {};
    const search = hash.slice(qIdx);
    const params = new URLSearchParams(search);
    const result = {};
    params.forEach((v, k) => { result[k] = v; });
    return result;
  }

  // ── List ─────────────────────────────────────────────────────────────────

  // ── Catalog-driven cell renderers ────────────────────────────────────────
  const ENG_CELLS = {
    engagement_name:  e => `<a href="#/engagements/${e.id}">${esc(e.engagement_name || '—')}</a>`,
    party_name:       e => esc(e.contact_name || e.account_name || '—'),
    engagement_type:  e => esc(e.engagement_type || '—'),
    stage:            e => stagePill(e.stage),
    risk_priority:    e => esc(e.risk_priority || '—'),
    source_of_lead:   e => esc(e.source_of_lead || '—'),
    current_insurer:  e => esc(e.current_insurer || '—'),
    current_premium:  e => e.current_premium  != null ? formatCurrency(e.current_premium)  : '—',
    expected_premium: e => e.expected_premium != null ? formatCurrency(e.expected_premium) : '—',
    inception_date:   e => e.inception_date ? formatDate(e.inception_date) : '—',
    client_decision:  e => esc(e.client_decision || '—'),
    broker_name:      e => esc(e.broker_name || '—'),
    created_at:       e => e.created_at ? formatDate(e.created_at) : '—',
    updated_at:       e => e.updated_at ? formatDate(e.updated_at) : '—',
    actions:          e => `
      <a href="#/engagements/${e.id}" class="btn btn-sm btn-secondary">View</a>
      <a href="#/engagements/${e.id}/edit" class="btn btn-sm btn-primary">Edit</a>
      <button class="btn btn-sm btn-danger" data-delete-id="${e.id}" data-delete-name="${esc(e.engagement_name || '')}">Delete</button>`,
  };

  let _engCatalog = null;
  let _engConfig  = null;

  async function list() {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    setPageTitle('Client Engagements');
    setBreadcrumb(['Client Engagements']);

    const filters = getFiltersFromHash();

    const ctrlStyle = 'height:28px;padding:.15rem .4rem;font-size:.78rem;line-height:1;';
    const headerActions = document.getElementById('header-actions');
    if (headerActions) {
      headerActions.innerHTML = `<a href="#/engagements/new" class="btn btn-primary" style="${ctrlStyle}">+ New Engagement</a>`;
    }

    try {
      const prefs = await ViewPrefs.load('engagements');
      _engCatalog = prefs.catalog;
      _engConfig  = prefs.config;

      const listParams = {
        ...filters,
        limit: 200,
        sort: _engConfig.sortBy,
        dir:  _engConfig.sortDir,
      };

      const [engRes, usersRes] = await Promise.all([
        Api.engagements.list(listParams),
        Api.admin.users(),
      ]);

      const engagements = engRes.data || engRes || [];
      const users = usersRes.data || usersRes || [];
      const brokers = users;

      const stageFilter   = filters.stage      || '';
      const brokerFilter  = filters.broker_id  || '';
      const typeFilter    = filters.type        || '';
      const searchFilter  = filters.q           || '';

      const visibleCols = ViewPrefs.visibleColumns(_engCatalog, _engConfig);
      const colCount = visibleCols.length || 1;

      const headCells = visibleCols.map(col => {
        const active = _engConfig.sortBy === col.id;
        const arrow  = active ? (_engConfig.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
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
              <table class="table" id="eng-table">
                <thead><tr id="eng-thead-row">${headCells}</tr></thead>
                <tbody id="eng-tbody">
                  <tr><td colspan="${colCount}" class="table-empty">Loading…</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      document.getElementById('engagements-center-filters')?.remove();
      const topHeader = document.getElementById('top-header');
      if (topHeader) {
        topHeader.style.position = 'relative';
        const wrap = document.createElement('div');
        wrap.id = 'engagements-center-filters';
        wrap.setAttribute('data-header-widget', '1');
        wrap.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;gap:.5rem;align-items:center;z-index:2;background:var(--bg);padding:.3rem .55rem;border-radius:6px;';
        wrap.innerHTML = `
          <input type="search" id="eng-search" class="form-control" placeholder="Search…"
            value="${esc(searchFilter)}"
            style="${ctrlStyle}width:160px;">
          <select id="eng-filter-stage" class="form-control" style="${ctrlStyle}max-width:140px;">
            <option value="">Stage</option>
            ${STAGES.map(s => `<option value="${esc(s)}" ${stageFilter === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
          </select>
          <select id="eng-filter-type" class="form-control" style="${ctrlStyle}max-width:140px;">
            <option value="">Type</option>
            ${ENGAGEMENT_TYPES.map(t => `<option value="${esc(t)}" ${typeFilter === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
          </select>
          <select id="eng-filter-broker" class="form-control" style="${ctrlStyle}max-width:140px;">
            <option value="">Broker</option>
            ${brokers.map(u => `<option value="${esc(u.id)}" ${String(brokerFilter) === String(u.id) ? 'selected' : ''}>${esc(u.full_name || u.username)}</option>`).join('')}
          </select>
          <button id="eng-filter-clear" class="btn btn-secondary" style="${ctrlStyle}">Clear</button>`;
        topHeader.appendChild(wrap);
      }

      // ⚙ Columns button
      ViewPrefs.attachButton({
        moduleKey: 'engagements',
        catalog:   _engCatalog,
        current:   _engConfig,
        onChange:  (newCfg) => { _engConfig = newCfg; list(); },
      });

      renderTableRows(engagements, searchFilter);
      bindFilterEvents(brokers);

      // Clickable sort headers
      el.querySelectorAll('#eng-thead-row th.sortable').forEach(th => {
        th.addEventListener('click', async () => {
          const col = th.dataset.sort;
          if (_engConfig.sortBy === col) {
            _engConfig.sortDir = _engConfig.sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            _engConfig.sortBy = col;
            _engConfig.sortDir = 'asc';
          }
          try { const r = await Api.viewPrefs.save('engagements', _engConfig); _engConfig = r.config; } catch (_) {}
          list();
        });
      });

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load engagements: ${esc(err.message)}</div>`;
    }
  }

  function renderTableRows(engagements, search) {
    const tbody = document.getElementById('eng-tbody');
    if (!tbody) return;
    const visibleCols = _engCatalog ? ViewPrefs.visibleColumns(_engCatalog, _engConfig) : [];
    const colCount = visibleCols.length || 1;

    let rows = engagements;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(e =>
        (e.engagement_name || '').toLowerCase().includes(q) ||
        (e.contact_name || '').toLowerCase().includes(q) ||
        (e.account_name || '').toLowerCase().includes(q)
      );
    }

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${colCount}" class="table-empty">No engagements found.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(e => `<tr>${visibleCols.map(col => {
      const fn = ENG_CELLS[col.id];
      return `<td${col.id === 'actions' ? ' class="actions-cell"' : ''}>${fn ? fn(e) : esc(String(e[col.id] ?? '—'))}</td>`;
    }).join('')}</tr>`).join('');

    tbody.querySelectorAll('[data-delete-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id   = btn.dataset.deleteId;
        const name = btn.dataset.deleteName;
        if (!confirmDialog(`Delete engagement "${name}"? This cannot be undone.`)) return;
        try {
          await Api.engagements.delete(id);
          showToast('Engagement deleted.', 'success');
          list();
        } catch (err) {
          showToast('Delete failed: ' + err.message, 'error');
        }
      });
    });
  }

  function bindFilterEvents(brokers) {
    const searchEl  = document.getElementById('eng-search');
    const stageEl   = document.getElementById('eng-filter-stage');
    const typeEl    = document.getElementById('eng-filter-type');
    const brokerEl  = document.getElementById('eng-filter-broker');
    const clearEl   = document.getElementById('eng-filter-clear');

    const applyFilters = debounce(async () => {
      const params = {};
      if (searchEl.value.trim())  params.q         = searchEl.value.trim();
      if (stageEl.value)          params.stage      = stageEl.value;
      if (typeEl.value)           params.type       = typeEl.value;
      if (brokerEl.value)         params.broker_id  = brokerEl.value;
      if (_engConfig) { params.sort = _engConfig.sortBy; params.dir = _engConfig.sortDir; }

      try {
        const res = await Api.engagements.list({ ...params, limit: 200 });
        renderTableRows(res.data || res || [], params.q || '');
      } catch (err) {
        showToast('Filter error: ' + err.message, 'error');
      }
    }, 350);

    if (searchEl) searchEl.addEventListener('input', applyFilters);
    if (stageEl)  stageEl.addEventListener('change', applyFilters);
    if (typeEl)   typeEl.addEventListener('change', applyFilters);
    if (brokerEl) brokerEl.addEventListener('change', applyFilters);

    if (clearEl) {
      clearEl.addEventListener('click', () => {
        if (searchEl) searchEl.value = '';
        if (stageEl)  stageEl.value  = '';
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
    setPageTitle(isEdit ? 'Edit Engagement' : 'New Engagement');
    setBreadcrumb(['Client Engagements', isEdit ? 'Edit' : 'New']);

    const headerActions = document.getElementById('header-actions');
    if (headerActions) headerActions.innerHTML = '';

    try {
      const [usersRes, contactsRes, accountsRes, engData] = await Promise.all([
        Api.admin.users(),
        Api.contacts.list({ limit: 500 }),
        Api.accounts.list({ limit: 500 }),
        isEdit ? Api.engagements.get(id) : Promise.resolve({}),
      ]);

      const users    = usersRes.data    || usersRes    || [];
      const contacts = contactsRes.data || contactsRes || [];
      const accounts = accountsRes.data || accountsRes || [];
      const d        = engData.data || engData || {};

      el.innerHTML = `
        <div class="form-page">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">${isEdit ? 'Edit Engagement' : 'New Client Engagement'}</h3>
            </div>

            <div id="stage-warning" class="alert alert-warning" style="display:none;">
              &#9888; Cannot progress past <strong>Advice Presented</strong> without Disclosure Completed and a Client Decision recorded.
            </div>

            <form id="engagement-form" novalidate>

              <!-- ── Core Details ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Core Details</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label required">Engagement Name</label>
                    <input type="text" name="engagement_name" class="form-control" required
                      value="${esc(d.engagement_name || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Type</label>
                    <select name="engagement_type" class="form-control" required>
                      <option value="">— Select Type —</option>
                      ${typeOptions(d.engagement_type)}
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
                    <label class="form-label">Source of Lead</label>
                    <select name="source_of_lead" class="form-control">
                      ${sourceOptions(d.source_of_lead)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Stage</label>
                    <select name="stage" id="eng-stage" class="form-control" required>
                      <option value="">— Select Stage —</option>
                      ${stageOptions(d.stage)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Assigned Broker</label>
                    <select name="assigned_broker_id" class="form-control" required>
                      ${userOptions(users, d.assigned_broker_id)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Assigned Admin</label>
                    <select name="assigned_admin_id" class="form-control">
                      ${userOptions(users, d.assigned_admin_id)}
                    </select>
                  </div>

                </div>
              </fieldset>

              <!-- ── Existing Cover ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Existing Cover &amp; Risk Profile</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label">Current Insurer</label>
                    <input type="text" name="current_insurer" class="form-control"
                      value="${esc(d.current_insurer || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Current Premium</label>
                    <div class="input-prefix-group">
                      <span class="input-prefix cur-label">R</span>
                      <input type="number" name="current_premium" class="form-control" step="0.01" min="0"
                        value="${esc(d.current_premium || '')}" />
                    </div>
                  </div>

                  <div class="form-group form-group-full">
                    <label class="form-label">Existing Cover Summary</label>
                    <textarea name="existing_cover_summary" class="form-control" rows="3">${esc(d.existing_cover_summary || '')}</textarea>
                  </div>

                  <div class="form-group form-group-full">
                    <label class="form-label">Identified Risks</label>
                    <textarea name="identified_risks" class="form-control" rows="3">${esc(d.identified_risks || '')}</textarea>
                  </div>

                  <div class="form-group form-group-full">
                    <label class="form-label">Client Needs Summary</label>
                    <textarea name="client_needs_summary" class="form-control" rows="3">${esc(d.client_needs_summary || '')}</textarea>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Risk Priority</label>
                    <select name="risk_priority" class="form-control">
                      ${priorityOptions(d.risk_priority)}
                    </select>
                  </div>

                </div>
              </fieldset>

              <!-- ── Process Completion Checklist ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Process Completion Checklist</legend>
                <div class="checklist-grid">

                  <label class="checklist-item">
                    <input type="checkbox" name="fact_find_completed" id="eng-fact-find"
                      ${d.fact_find_completed ? 'checked' : ''} />
                    <span>Fact Find Completed</span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="needs_analysis_completed"
                      ${d.needs_analysis_completed ? 'checked' : ''} />
                    <span>Needs Analysis Completed</span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="proposal_prepared"
                      ${d.proposal_prepared ? 'checked' : ''} />
                    <span>Proposal Prepared</span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="advice_presented"
                      ${d.advice_presented ? 'checked' : ''} />
                    <span>Advice Presented</span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="disclosure_completed" id="eng-disclosure"
                      ${d.disclosure_completed ? 'checked' : ''} />
                    <span>Disclosure Completed</span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="policy_wording_provided"
                      ${d.policy_wording_provided ? 'checked' : ''} />
                    <span>Policy Wording Provided</span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="key_risks_explained"
                      ${d.key_risks_explained ? 'checked' : ''} />
                    <span>Key Risks Explained</span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="excess_explained"
                      ${d.excess_explained ? 'checked' : ''} />
                    <span>Excess Explained</span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="premium_explained"
                      ${d.premium_explained ? 'checked' : ''} />
                    <span>Premium Explained</span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="limitations_explained"
                      ${d.limitations_explained ? 'checked' : ''} />
                    <span>Limitations Explained</span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="client_questions_answered"
                      ${d.client_questions_answered ? 'checked' : ''} />
                    <span>Client Questions Answered</span>
                  </label>

                </div>
              </fieldset>

              <!-- ── Decision & Outcome ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Decision &amp; Outcome</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label">Client Decision</label>
                    <select name="client_decision" id="eng-decision" class="form-control">
                      <option value="">— Not yet —</option>
                      <option value="Accepted" ${d.client_decision === 'Accepted' ? 'selected' : ''}>Accepted</option>
                      <option value="Declined" ${d.client_decision === 'Declined' ? 'selected' : ''}>Declined</option>
                      <option value="Pending"  ${d.client_decision === 'Pending'  ? 'selected' : ''}>Pending</option>
                    </select>
                  </div>

                  <div class="form-group" id="eng-decline-reason-group" style="${d.client_decision === 'Declined' ? '' : 'display:none;'}">
                    <label class="form-label">Decline Reason</label>
                    <textarea name="decline_reason" class="form-control" rows="2">${esc(d.decline_reason || '')}</textarea>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Inception Date</label>
                    <input type="date" name="inception_date" class="form-control"
                      value="${esc(d.inception_date ? d.inception_date.slice(0,10) : '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Expected Premium</label>
                    <div class="input-prefix-group">
                      <span class="input-prefix cur-label">R</span>
                      <input type="number" name="expected_premium" class="form-control" step="0.01" min="0"
                        value="${esc(d.expected_premium || '')}" />
                    </div>
                  </div>

                </div>
              </fieldset>

              <!-- ── Suitability & Compliance ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Suitability &amp; Compliance</legend>
                <div class="checklist-grid">

                  <label class="checklist-item">
                    <input type="checkbox" name="suitability_confirmed"
                      ${d.suitability_confirmed ? 'checked' : ''} />
                    <span>Suitability Confirmed</span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="client_understanding_confirmed"
                      ${d.client_understanding_confirmed ? 'checked' : ''} />
                    <span>Client Understanding Confirmed</span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="alternative_options_considered"
                      ${d.alternative_options_considered ? 'checked' : ''} />
                    <span>Alternative Options Considered</span>
                  </label>

                </div>
                <div class="form-grid form-grid-2" style="margin-top:16px;">

                  <label class="checklist-item">
                    <input type="checkbox" name="conduct_concern_flag" id="eng-conduct-flag"
                      ${d.conduct_concern_flag ? 'checked' : ''} />
                    <span class="text-danger"><strong>Conduct Concern Flag</strong></span>
                  </label>

                  <div class="form-group form-group-full" id="eng-conduct-notes-group"
                    style="${d.conduct_concern_flag ? '' : 'display:none;'}">
                    <label class="form-label">Conduct Notes</label>
                    <textarea name="conduct_notes" class="form-control" rows="2">${esc(d.conduct_notes || '')}</textarea>
                  </div>

                </div>
              </fieldset>

              <!-- ══════════════════════════════════════════════════════ -->
              <!-- Pre-Sale Disclosure Checklist (FAIS GCC §4 / TCF O1,3)   -->
              <!-- Must be Complete before a ROA can be created from this.  -->
              <!-- ══════════════════════════════════════════════════════ -->
              <fieldset class="form-section" id="eng-presale-disclosure">
                <legend class="form-section-title">
                  Pre-Sale Disclosure Checklist
                  <span id="eng-disclosure-status-badge" class="badge" style="margin-left:.5rem;"></span>
                </legend>
                <small class="form-hint" style="display:block;margin-bottom:.6rem;">
                  All items must be completed before a ROA can be generated. Timestamp and disclosing broker are stamped automatically when the checklist becomes Complete.
                </small>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label required">FSP Licence Number Disclosed</label>
                    <select name="fsp_licence_disclosed" class="form-control" required>
                      <option value="">— Select —</option>
                      <option value="Yes — Written" ${d.fsp_licence_disclosed === 'Yes — Written' ? 'selected' : ''}>Yes — Written</option>
                      <option value="Yes — Verbal"  ${d.fsp_licence_disclosed === 'Yes — Verbal'  ? 'selected' : ''}>Yes — Verbal</option>
                      <option value="No"            ${d.fsp_licence_disclosed === 'No'            ? 'selected' : ''}>No (blocks ROA creation)</option>
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Disclosure Method</label>
                    <select name="disclosure_method" class="form-control" required>
                      <option value="">— Select —</option>
                      ${['In-person meeting','Phone call','Video call','Email','WhatsApp','Signed form']
                        .map(o => `<option value="${esc(o)}" ${d.disclosure_method === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
                    </select>
                  </div>

                  <label class="checklist-item form-grid-span-2">
                    <input type="checkbox" name="broker_identity_disclosed"
                      ${d.broker_identity_disclosed ? 'checked' : ''} />
                    <span>Broker Name and Role Disclosed <small style="color:#666;">(required)</small></span>
                  </label>

                  <div class="form-group form-grid-span-2">
                    <label class="checklist-item">
                      <input type="checkbox" name="product_costs_disclosed"
                        ${d.product_costs_disclosed ? 'checked' : ''} />
                      <span>Product Costs Disclosed <small style="color:#666;">(required)</small></span>
                    </label>
                    <textarea name="product_costs_disclosed_notes" class="form-control" rows="2"
                      placeholder="Brief description of how costs were communicated"
                      style="margin-top:.35rem;">${esc(d.product_costs_disclosed_notes || '')}</textarea>
                  </div>

                  <div class="form-group form-grid-span-2">
                    <label class="checklist-item">
                      <input type="checkbox" name="material_risks_disclosed"
                        ${d.material_risks_disclosed ? 'checked' : ''} />
                      <span>Material Risks Disclosed <small style="color:#666;">(required)</small></span>
                    </label>
                    <textarea name="material_risks_disclosed_notes" class="form-control" rows="2"
                      placeholder="Brief description of risks communicated (e.g. exclusions highlighted)"
                      style="margin-top:.35rem;">${esc(d.material_risks_disclosed_notes || '')}</textarea>
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Complaints Process Disclosed</label>
                    <select name="complaints_process_disclosed" class="form-control" required>
                      <option value="">— Select —</option>
                      <option value="Yes — Written"            ${d.complaints_process_disclosed === 'Yes — Written'            ? 'selected' : ''}>Yes — Written</option>
                      <option value="Yes — Verbal"             ${d.complaints_process_disclosed === 'Yes — Verbal'             ? 'selected' : ''}>Yes — Verbal</option>
                      <option value="Complaints form provided" ${d.complaints_process_disclosed === 'Complaints form provided' ? 'selected' : ''}>Complaints form provided</option>
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Disclosure Timestamp (auto)</label>
                    <input type="text" class="form-control" readonly
                      style="background:#f8f9fa;"
                      value="${esc(d.disclosure_timestamp ? new Date(d.disclosure_timestamp).toLocaleString('en-ZA',{dateStyle:'medium',timeStyle:'short'}) : '— stamped when checklist becomes Complete —')}">
                  </div>

                  <div class="form-group form-grid-span-2">
                    <label class="form-label">Disclosing Broker (auto — logged-in user)</label>
                    <input type="text" class="form-control" readonly
                      style="background:#f8f9fa;"
                      value="${esc(d.disclosing_broker_name || (d.disclosing_broker_id ? ('User #' + d.disclosing_broker_id) : '— stamped on completion —'))}">
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
                <button type="submit" class="btn btn-primary" id="eng-submit-btn">
                  ${isEdit ? 'Save Changes' : 'Create Engagement'}
                </button>
                <a href="${isEdit ? `#/engagements/${id}` : '#/engagements'}" class="btn btn-secondary">Cancel</a>
              </div>

            </form>
          </div>
        </div>
      `;

      bindFormEvents(id, isEdit, d);

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load form: ${esc(err.message)}</div>`;
    }
  }

  function bindFormEvents(id, isEdit, existing) {
    const formEl      = document.getElementById('engagement-form');
    const stageEl     = document.getElementById('eng-stage');
    const disclosureEl = document.getElementById('eng-disclosure');
    const decisionEl  = document.getElementById('eng-decision');
    const warningEl   = document.getElementById('stage-warning');
    const conductFlagEl = document.getElementById('eng-conduct-flag');
    const declineGroup = document.getElementById('eng-decline-reason-group');
    const conductGroup = document.getElementById('eng-conduct-notes-group');

    // Stage change → disclosure warning
    function checkStageWarning() {
      if (!stageEl || !warningEl) return;
      const stage = stageEl.value;
      const disclosureDone = disclosureEl ? disclosureEl.checked : Boolean(existing.disclosure_completed);
      const decision = decisionEl ? decisionEl.value : (existing.client_decision || '');
      const needsWarning = STAGES_REQUIRING_DISCLOSURE.includes(stage) &&
        (!disclosureDone || !decision || decision === '');
      warningEl.style.display = needsWarning ? '' : 'none';
    }

    if (stageEl)      stageEl.addEventListener('change', checkStageWarning);
    if (disclosureEl) disclosureEl.addEventListener('change', checkStageWarning);
    if (decisionEl)   decisionEl.addEventListener('change', () => {
      checkStageWarning();
      if (declineGroup) {
        declineGroup.style.display = decisionEl.value === 'Declined' ? '' : 'none';
      }
    });

    // Conduct flag toggle
    if (conductFlagEl && conductGroup) {
      conductFlagEl.addEventListener('change', () => {
        conductGroup.style.display = conductFlagEl.checked ? '' : 'none';
      });
    }

    // Initial check
    checkStageWarning();

    wireContactAccountToggle(formEl);
    wireCurrencySelector(formEl);

    // ── Live pre-sale disclosure status badge ────────────────────────────
    const disclosureBadge = document.getElementById('eng-disclosure-status-badge');
    const FSP_OK        = ['Yes — Written', 'Yes — Verbal'];
    const COMPLAINTS_OK = ['Yes — Written', 'Yes — Verbal', 'Complaints form provided'];
    const METHOD_OK     = ['In-person meeting','Phone call','Video call','Email','WhatsApp','Signed form'];

    function evalDisclosure() {
      if (!formEl) return 'Incomplete';
      const v = (name) => formEl.querySelector(`[name="${name}"]`)?.value ?? '';
      const c = (name) => !!formEl.querySelector(`[name="${name}"]`)?.checked;
      const fspOk        = FSP_OK.includes(v('fsp_licence_disclosed'));
      const brokerOk     = c('broker_identity_disclosed');
      const costsOk      = c('product_costs_disclosed') && !!v('product_costs_disclosed_notes').trim();
      const risksOk      = c('material_risks_disclosed') && !!v('material_risks_disclosed_notes').trim();
      const complaintsOk = COMPLAINTS_OK.includes(v('complaints_process_disclosed'));
      const methodOk     = METHOD_OK.includes(v('disclosure_method'));
      return (fspOk && brokerOk && costsOk && risksOk && complaintsOk && methodOk) ? 'Complete' : 'Incomplete';
    }
    function refreshDisclosureBadge() {
      if (!disclosureBadge) return;
      const status = evalDisclosure();
      disclosureBadge.textContent = status;
      disclosureBadge.className = 'badge ' + (status === 'Complete' ? 'badge-success' : 'badge-warning');
    }
    if (disclosureBadge) {
      const fieldset = document.getElementById('eng-presale-disclosure');
      fieldset?.addEventListener('change', refreshDisclosureBadge);
      fieldset?.addEventListener('input',  refreshDisclosureBadge);
      refreshDisclosureBadge();
    }

    // Form submit
    if (formEl) {
      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('eng-submit-btn');
        if (btn) btn.disabled = true;

        const data = serializeForm(formEl);

        // Stage progression guard
        const stage = data.stage;
        const disclosureDone = data.disclosure_completed;
        const decision = data.client_decision;
        if (STAGES_REQUIRING_DISCLOSURE.includes(stage) && (!disclosureDone || !decision)) {
          if (!confirmDialog('This stage requires Disclosure Completed and a Client Decision. Continue anyway?')) {
            if (btn) btn.disabled = false;
            return;
          }
        }

        try {
          if (isEdit) {
            await Api.engagements.update(id, data);
            showToast('Engagement updated.', 'success');
            navigate(`engagements/${id}`);
          } else {
            const created = await Api.engagements.create(data);
            const newId = (created.data || created).id;
            showToast('Engagement created.', 'success');
            navigate(`engagements/${newId}`);
          }
        } catch (err) {
          showToast('Save failed: ' + err.message, 'error');
          if (btn) btn.disabled = false;
        }
      });
    }
  }

  function serializeForm(formEl) {
    const fd = new FormData(formEl);
    const data = {};
    // Collect all checkbox names first so unchecked ones become 0
    formEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      data[cb.name] = 0;
    });
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

  // ── Detail ────────────────────────────────────────────────────────────────

  async function detail(id) {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    const headerActions = document.getElementById('header-actions');
    if (headerActions) {
      headerActions.innerHTML = `<a href="#/engagements/${id}/edit" class="btn btn-primary">Edit</a>`;
    }

    try {
      const res = await Api.engagements.get(id);
      const d   = res.data || res || {};
      const disclosureComplete = d.presale_disclosure_status === 'Complete';

      setPageTitle(esc(d.engagement_name || 'Engagement'));
      setBreadcrumb(['Client Engagements', d.engagement_name || 'Detail']);

      // Inject Create-ROA CTA (greyed when disclosure incomplete)
      if (headerActions) {
        const createRoaHref = disclosureComplete
          ? `#/advice-records/new?engagement_id=${id}`
          : '#';
        const disabledAttr = disclosureComplete ? '' : 'aria-disabled="true" style="pointer-events:none;opacity:.55;" title="Pre-sale disclosure must be Complete before a ROA can be created."';
        headerActions.innerHTML = `
          <a href="${createRoaHref}" class="btn ${disclosureComplete ? 'btn-success' : 'btn-secondary'}" ${disabledAttr}>
            📝 Create ROA${disclosureComplete ? '' : ' (locked)'}
          </a>
          <a href="#/engagements/${id}/edit" class="btn btn-primary">Edit</a>`;
      }

      // Fetch linked policies
      let policies = [];
      try {
        const polRes = await Api.policies.list({ engagement_id: id, limit: 100 });
        policies = polRes.data || polRes || [];
      } catch (_) {}

      const checklist = [
        { label: 'Fact Find Completed',         key: 'fact_find_completed' },
        { label: 'Needs Analysis Completed',     key: 'needs_analysis_completed' },
        { label: 'Proposal Prepared',            key: 'proposal_prepared' },
        { label: 'Advice Presented',             key: 'advice_presented' },
        { label: 'Disclosure Completed',         key: 'disclosure_completed' },
        { label: 'Policy Wording Provided',      key: 'policy_wording_provided' },
        { label: 'Key Risks Explained',          key: 'key_risks_explained' },
        { label: 'Excess Explained',             key: 'excess_explained' },
        { label: 'Premium Explained',            key: 'premium_explained' },
        { label: 'Limitations Explained',        key: 'limitations_explained' },
        { label: 'Client Questions Answered',    key: 'client_questions_answered' },
      ];

      const checklistHtml = checklist.map(item => `
        <div class="checklist-detail-item ${d[item.key] ? 'checklist-done' : 'checklist-pending'}">
          <span class="checklist-icon">${d[item.key] ? '&#10003;' : '&#9675;'}</span>
          <span class="checklist-label">${item.label}</span>
        </div>`
      ).join('');

      const policiesHtml = policies.length
        ? policies.map(p => `
            <tr>
              <td><a href="#/policies/${p.id}">${esc(p.policy_name || '—')}</a></td>
              <td>${esc(p.policy_number || '—')}</td>
              <td>${esc(p.insurer || '—')}</td>
              <td>${p.policy_status ? `<span class="badge" data-status="${esc(p.policy_status)}">${esc(p.policy_status)}</span>` : '—'}</td>
            </tr>`).join('')
        : `<tr><td colspan="4" class="table-empty">No linked policies.</td></tr>`;

      const field = (label, value) => `<div class="detail-field"><span class="detail-label">${label}</span><span class="detail-value">${value || '—'}</span></div>`;
      const bool  = (v) => v ? `<span class="bool-yes">&#10003; Yes</span>` : `<span class="bool-no">&#10007; No</span>`;
      const curSym = currencySymbol(d.currency || 'ZAR');
      const fmtCur = (v) => (v != null && v !== '') ? `${curSym} ` + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

      el.innerHTML = `
        <div class="detail-view">

          ${d.conduct_concern_flag ? `
          <div class="alert alert-danger">
            &#9888; <strong>Conduct Concern Flagged</strong>
            ${d.conduct_notes ? ` — ${esc(d.conduct_notes)}` : ''}
          </div>` : ''}

          <!-- Engagement Details -->
          <div class="detail-section card">
            <div class="detail-section-title">Engagement Details</div>
            <div class="detail-grid">
              ${field('Engagement Name', esc(d.engagement_name || '—'))}
              ${field('Stage', stagePill(d.stage))}
              ${field('Engagement Type', esc(d.engagement_type || '—'))}
              ${field('Source of Lead', esc(d.source_of_lead || '—'))}
              ${field('Client Decision', esc(d.client_decision || '—'))}
              ${field('Risk Priority', esc(d.risk_priority || '—'))}
              ${field('Created', d.created_at ? formatDate(d.created_at) : '—')}
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

          <!-- Financial -->
          <div class="detail-section card">
            <div class="detail-section-title">Financial</div>
            <div class="detail-grid">
              ${field('Expected Premium', d.expected_premium ? fmtCur(d.expected_premium) : '—')}
              ${field('Current Premium', d.current_premium ? fmtCur(d.current_premium) : '—')}
              ${field('Current Insurer', esc(d.current_insurer || '—'))}
              ${field('Inception Date', d.inception_date ? formatDate(d.inception_date) : '—')}
            </div>
          </div>

          <!-- Process Completion -->
          <div class="detail-section card">
            <div class="detail-section-title">Process Completion</div>
            <div class="checklist-detail-grid">${checklistHtml}</div>
          </div>

          <!-- Pre-Sale Disclosure -->
          <div class="detail-section card" style="${disclosureComplete ? '' : 'border-left:4px solid #f59e0b;'}">
            <div class="detail-section-title">
              Pre-Sale Disclosure (FAIS GCC §4 / TCF)
              <span class="badge ${disclosureComplete ? 'badge-success' : 'badge-warning'}" style="margin-left:.5rem;">
                ${disclosureComplete ? '✓ Complete' : 'Incomplete — ROA creation locked'}
              </span>
            </div>
            <div class="detail-grid">
              ${field('FSP Licence Disclosed',         esc(d.fsp_licence_disclosed || '—'))}
              ${field('Broker Identity Disclosed',    bool(d.broker_identity_disclosed))}
              ${field('Product Costs Disclosed',      bool(d.product_costs_disclosed))}
              ${field('Material Risks Disclosed',     bool(d.material_risks_disclosed))}
              ${field('Complaints Process Disclosed', esc(d.complaints_process_disclosed || '—'))}
              ${field('Disclosure Method',            esc(d.disclosure_method || '—'))}
              ${field('Disclosure Timestamp',         d.disclosure_timestamp ? new Date(d.disclosure_timestamp).toLocaleString('en-ZA',{dateStyle:'medium',timeStyle:'short'}) : '—')}
              ${field('Disclosing Broker',            esc(d.disclosing_broker_name || '—'))}
            </div>
            ${d.product_costs_disclosed_notes || d.material_risks_disclosed_notes ? `
              <div class="detail-text-fields" style="margin-top:.75rem;">
                ${d.product_costs_disclosed_notes ? `<div class="detail-text-item"><strong>Product Costs — How Communicated</strong><p>${esc(d.product_costs_disclosed_notes)}</p></div>` : ''}
                ${d.material_risks_disclosed_notes ? `<div class="detail-text-item"><strong>Material Risks — Details</strong><p>${esc(d.material_risks_disclosed_notes)}</p></div>` : ''}
              </div>` : ''}
          </div>

          <!-- Suitability & Compliance -->
          <div class="detail-section card">
            <div class="detail-section-title">Suitability &amp; Compliance</div>
            <div class="checklist-detail-grid">
              <div class="checklist-detail-item ${d.suitability_confirmed ? 'checklist-done' : 'checklist-pending'}">
                <span class="checklist-icon">${d.suitability_confirmed ? '&#10003;' : '&#9675;'}</span>
                <span class="checklist-label">Suitability Confirmed</span>
              </div>
              <div class="checklist-detail-item ${d.client_understanding_confirmed ? 'checklist-done' : 'checklist-pending'}">
                <span class="checklist-icon">${d.client_understanding_confirmed ? '&#10003;' : '&#9675;'}</span>
                <span class="checklist-label">Client Understanding Confirmed</span>
              </div>
              <div class="checklist-detail-item ${d.alternative_options_considered ? 'checklist-done' : 'checklist-pending'}">
                <span class="checklist-icon">${d.alternative_options_considered ? '&#10003;' : '&#9675;'}</span>
                <span class="checklist-label">Alternative Options Considered</span>
              </div>
            </div>
          </div>

          <!-- Needs & Risk Profile -->
          ${d.client_needs_summary || d.identified_risks || d.existing_cover_summary || d.decline_reason ? `
          <div class="detail-section card">
            <div class="detail-section-title">Needs &amp; Risk Profile</div>
            <div class="detail-text-fields">
              ${d.existing_cover_summary ? `<div class="detail-text-item"><strong>Existing Cover Summary</strong><p>${esc(d.existing_cover_summary)}</p></div>` : ''}
              ${d.identified_risks ? `<div class="detail-text-item"><strong>Identified Risks</strong><p>${esc(d.identified_risks)}</p></div>` : ''}
              ${d.client_needs_summary ? `<div class="detail-text-item"><strong>Client Needs Summary</strong><p>${esc(d.client_needs_summary)}</p></div>` : ''}
              ${d.decline_reason ? `<div class="detail-text-item"><strong>Decline Reason</strong><p>${esc(d.decline_reason)}</p></div>` : ''}
            </div>
          </div>` : ''}

          <!-- Linked Policies -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Linked Policies</h3>
              <a href="#/policies/new?engagement_id=${id}" class="btn btn-sm btn-primary">+ Add Policy</a>
            </div>
            <div class="table-responsive">
              <table class="table">
                <thead><tr><th>Policy Name</th><th>Number</th><th>Insurer</th><th>Status</th></tr></thead>
                <tbody>${policiesHtml}</tbody>
              </table>
            </div>
          </div>

          <!-- Tabs -->
          <div class="detail-tabs card">
            <div class="tabs-header" id="engagement-tabs-header">
              <button class="tab-btn active" data-tab="documents">Documents</button>
              <button class="tab-btn"        data-tab="timeline">Timeline</button>
            </div>
            <div class="tab-content" id="engagement-tab-content">
              <div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>
            </div>
          </div>

        </div>
      `;

      loadEngagementTab(id, 'documents');

      document.getElementById('engagement-tabs-header').querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#engagement-tabs-header .tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          loadEngagementTab(id, btn.dataset.tab);
        });
      });

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load engagement: ${esc(err.message)}</div>`;
    }
  }

  async function loadEngagementTab(engagementId, tab) {
    const tabEl = document.getElementById('engagement-tab-content');
    if (!tabEl) return;
    tabEl.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    try {
      switch (tab) {
        case 'timeline': {
          const entries = await Api.timeline.forRecord('client_engagements', engagementId);
          const rows = Array.isArray(entries) ? entries : (entries.data || []);
          tabEl.innerHTML = `<div style="padding:.75rem 1rem;">${renderTimeline(rows, 'No activity recorded yet.')}</div>`;
          break;
        }
        case 'documents': {
          const res = await Api.documents.list({ module: 'engagements', record_id: engagementId });
          const docs = (res.data || []);
          tabEl.innerHTML = `
            <div class="tab-toolbar">
              <label class="btn btn-primary btn-sm" for="engagement-doc-upload">+ Upload Document</label>
              <input type="file" id="engagement-doc-upload" style="display:none;"
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
          document.getElementById('engagement-doc-upload').addEventListener('change', async e => {
            const file = e.target.files[0];
            if (!file) return;
            try {
              const fd = new FormData();
              fd.append('file', file);
              fd.append('module', 'engagements');
              fd.append('record_id', engagementId);
              await Api.documents.upload(fd);
              showToast('Document uploaded.', 'success');
              loadEngagementTab(engagementId, 'documents');
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
                loadEngagementTab(engagementId, 'documents');
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

  // ── Public API ────────────────────────────────────────────────────────────

  return { list, form, detail };

})();
