/* ═══════════════════════════════════════════════════════════════════════════
   Complaints component  —  Complaints Register (COFI-aligned)
   ═══════════════════════════════════════════════════════════════════════════ */

const Complaints = (() => {

  // ── Constants ────────────────────────────────────────────────────────────

  const STATUSES = [
    'Open',
    'In Progress',
    'Awaiting Response',
    'Resolved',
    'Closed',
    'Escalated',
  ];

  const CATEGORIES = [
    'Service Quality',
    'Incorrect Advice',
    'Claims Handling',
    'Premium Dispute',
    'Policy Cancellation',
    'POPIA Breach',
    'Conduct',
    'Other',
  ];

  const RECEIVED_VIA_OPTIONS = [
    'Email',
    'Phone',
    'Letter',
    'In Person',
    'Online Form',
    'Regulator',
    'Other',
  ];

  const ROOT_CAUSE_CATEGORIES = [
    'Process Failure',
    'Communication Failure',
    'System Error',
    'Human Error',
    'Policy Terms',
    'Third Party',
    'Other',
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
    return [{ id: '', first_name: '—', last_name: 'None' }, ...contacts].map(c =>
      `<option value="${esc(c.id)}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${esc([c.first_name, c.last_name].filter(Boolean).join(' ') || c.full_name || '')}</option>`
    ).join('');
  }

  function accountOptions(accounts, selectedId) {
    return [{ id: '', account_name: '— None —' }, ...accounts].map(a =>
      `<option value="${esc(a.id)}" ${String(a.id) === String(selectedId) ? 'selected' : ''}>${esc(a.account_name || a.name || '')}</option>`
    ).join('');
  }

  function policyOptions(policies, selectedId) {
    return [{ id: '', policy_name: '— None —' }, ...policies].map(p =>
      `<option value="${esc(p.id)}" ${String(p.id) === String(selectedId) ? 'selected' : ''}>${esc(p.policy_name || p.policy_number || '')}</option>`
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

  function isResolved(status) {
    return status === 'Resolved' || status === 'Closed';
  }

  // ── List ─────────────────────────────────────────────────────────────────

  const COMP_CELLS = {
    complaint_number:     (c) => `<a href="#/complaints/${c.id}">${esc(c.complaint_number || '—')}</a>`,
    contact_name:         (c) => c.contact_id
      ? `<a href="#/contacts/${c.contact_id}">${esc(c.contact_name || '—')}</a>`
      : esc(c.contact_name || '—'),
    account_name:         (c) => c.account_id
      ? `<a href="#/accounts/${c.account_id}">${esc(c.account_name || '—')}</a>`
      : esc(c.account_name || '—'),
    complaint_category:   (c) => esc(c.complaint_category || '—'),
    complaint_status:     (c) => statusBadgeHtml(c.complaint_status),
    complaint_date:       (c) => c.complaint_date ? Utils.formatDate(c.complaint_date) : '—',
    assigned_to_name:     (c) => esc(c.assigned_to_name || '—'),
    severity_rating:      (c) => esc(c.severity_rating || '—'),
    broker_name:          (c) => esc(c.broker_name || '—'),
    complaint_owner_name: (c) => esc(c.complaint_owner_name || '—'),
    days_open:            (c) => c.days_open != null ? String(c.days_open) : '—',
    policy_number:        (c) => c.policy_id
      ? `<a href="#/policies/${c.policy_id}">${esc(c.policy_number || '—')}</a>`
      : esc(c.policy_number || '—'),
    actions: (c) => `
      <a href="#/complaints/${c.id}" class="btn btn-sm btn-secondary">View</a>
      <a href="#/complaints/${c.id}/edit" class="btn btn-sm btn-primary">Edit</a>
      ${c.withdrawn || ['Resolved','Closed'].includes(c.complaint_status)
        ? ''
        : `<button class="btn btn-sm btn-warning" data-withdraw-id="${c.id}" data-withdraw-name="${esc(c.complaint_number || c.id)}">Withdraw</button>`}`,
  };

  let _compCatalog = null;
  let _compConfig  = null;

  async function list() {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    setPageTitle('Complaints');
    setBreadcrumb(['Complaints']);

    const headerActions = document.getElementById('header-actions');
    if (headerActions) {
      headerActions.innerHTML = `<a href="#/complaints/new" class="btn btn-primary">+ New Complaint</a>`;
    }

    const filters = getFiltersFromHash();

    try {
      const [prefs, complaintsRes, usersRes] = await Promise.all([
        ViewPrefs.load('complaints'),
        Api.complaints.list({ ...filters, limit: 200 }),
        Api.admin.users(),
      ]);

      _compCatalog = prefs.catalog;
      _compConfig  = prefs.config;

      const complaints   = complaintsRes.data || complaintsRes || [];
      const users        = usersRes.data || usersRes || [];

      const searchFilter   = filters.q          || '';
      const statusFilter   = filters.status      || '';
      const categoryFilter = filters.category    || '';

      const visibleCols = ViewPrefs.visibleColumns(_compCatalog, _compConfig);
      const colCount = visibleCols.length || 1;
      const headCells = visibleCols.map(col => `<th>${esc(col.label)}</th>`).join('');

      el.innerHTML = `
        <div class="list-page">

          <!-- Filters -->
          <div class="filter-bar card">
            <div class="filter-group">
              <input type="text" id="comp-search" class="form-control" placeholder="Search complaints…"
                value="${esc(searchFilter)}" style="min-width:200px;" />
            </div>
            <div class="filter-group">
              <select id="comp-filter-status" class="form-control">
                <option value="">All Statuses</option>
                ${STATUSES.map(s => `<option value="${esc(s)}" ${statusFilter === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
              </select>
            </div>
            <div class="filter-group">
              <select id="comp-filter-category" class="form-control">
                <option value="">All Categories</option>
                ${CATEGORIES.map(c => `<option value="${esc(c)}" ${categoryFilter === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
              </select>
            </div>
            <div class="filter-group">
              <button id="comp-filter-clear" class="btn btn-secondary">Clear</button>
            </div>
          </div>

          <!-- Table -->
          <div class="card">
            <div class="table-responsive">
              <table class="table">
                <thead><tr>${headCells}</tr></thead>
                <tbody id="comp-tbody">
                  <tr><td colspan="${colCount}" class="table-empty">Loading…</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      ViewPrefs.attachButton({
        moduleKey: 'complaints',
        catalog:   _compCatalog,
        current:   _compConfig,
        onChange:  (newCfg) => { _compConfig = newCfg; list(); },
      });

      renderTableRows(complaints, searchFilter);
      bindFilterEvents();

    } catch (err) {
      el.innerHTML = Utils.errorHtml('Failed to load complaints.', err);
    }
  }

  function renderTableRows(complaints, search) {
    const tbody = document.getElementById('comp-tbody');
    if (!tbody) return;

    const visibleCols = _compCatalog ? ViewPrefs.visibleColumns(_compCatalog, _compConfig) : [];
    const colCount = visibleCols.length || 1;

    let rows = complaints;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(c =>
        (c.complaint_number  || '').toLowerCase().includes(q) ||
        (c.contact_name      || '').toLowerCase().includes(q) ||
        (c.account_name      || '').toLowerCase().includes(q) ||
        (c.complaint_summary || '').toLowerCase().includes(q)
      );
    }

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${colCount}" class="table-empty">No complaints found.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(c => `<tr>${visibleCols.map(col => {
      const fn = COMP_CELLS[col.id];
      return `<td${col.id === 'actions' ? ' class="actions-cell"' : ''}>${fn ? fn(c) : esc(String(c[col.id] ?? '—'))}</td>`;
    }).join('')}</tr>`).join('');

    tbody.querySelectorAll('[data-withdraw-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        openWithdrawModal(btn.dataset.withdrawId, btn.dataset.withdrawName);
      });
    });
  }

  function openWithdrawModal(complaintId, complaintName) {
    const container = document.createElement('div');
    container.id = 'withdraw-modal-container';
    container.innerHTML = `
      <div class="modal-overlay" id="withdraw-modal"
           style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;">
        <div class="modal" style="background:#fff;border-radius:8px;width:480px;max-width:92vw;max-height:90vh;overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,0.2);">
          <div class="modal-header" style="padding:1rem 1.25rem;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
            <h3 style="margin:0;">Withdraw complaint ${esc(complaintName)}</h3>
            <button type="button" id="withdraw-modal-close"
                    style="background:none;border:none;font-size:1.4rem;line-height:1;cursor:pointer;">×</button>
          </div>
          <div class="modal-body" style="padding:1.25rem;">
            <div id="withdraw-modal-error" class="alert alert-danger" style="display:none;margin-bottom:.75rem;"></div>
            <p style="margin:0 0 .75rem;font-size:.9rem;color:#555;">
              The complaint record will remain on file (deletion is not permitted).
              Status will be set to <strong>Closed</strong> with a Withdrawn flag.
            </p>
            <div class="form-group">
              <label class="form-label required">Reason for withdrawal</label>
              <textarea id="withdraw-reason" class="form-control" rows="4"
                        placeholder="e.g. Client withdrew the complaint after follow-up call"></textarea>
            </div>
          </div>
          <div class="modal-footer" style="padding:1rem 1.25rem;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:.5rem;">
            <button type="button" class="btn btn-secondary" id="withdraw-modal-cancel">Cancel</button>
            <button type="button" class="btn btn-warning" id="withdraw-modal-save">Withdraw complaint</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(container);

    const close = () => container.remove();
    container.querySelector('#withdraw-modal').addEventListener('click', (e) => {
      /* click-outside-to-close disabled */ void e;
    });
    container.querySelector('#withdraw-modal-close').addEventListener('click', close);
    container.querySelector('#withdraw-modal-cancel').addEventListener('click', close);

    container.querySelector('#withdraw-modal-save').addEventListener('click', async () => {
      const reason = container.querySelector('#withdraw-reason').value.trim();
      const errEl  = container.querySelector('#withdraw-modal-error');
      if (!reason) {
        errEl.textContent = 'A reason is required to withdraw a complaint.';
        errEl.style.display = 'block';
        return;
      }
      try {
        await Api.complaints.withdraw(complaintId, reason);
        close();
        showToast('Complaint withdrawn.', 'success');
        list();
      } catch (err) {
        errEl.textContent = err.message || String(err);
        errEl.style.display = 'block';
      }
    });
  }

  function bindFilterEvents() {
    const searchEl   = document.getElementById('comp-search');
    const statusEl   = document.getElementById('comp-filter-status');
    const categoryEl = document.getElementById('comp-filter-category');
    const clearEl    = document.getElementById('comp-filter-clear');

    const applyFilters = debounce(async () => {
      const params = {};
      if (searchEl.value.trim())  params.q        = searchEl.value.trim();
      if (statusEl.value)         params.status   = statusEl.value;
      if (categoryEl.value)       params.category = categoryEl.value;
      try {
        const res = await Api.complaints.list({ ...params, limit: 200 });
        renderTableRows(res.data || res || [], params.q || '');
      } catch (err) {
        showToast('Filter error: ' + err.message, 'error');
      }
    }, 350);

    if (searchEl)   searchEl.addEventListener('input', applyFilters);
    if (statusEl)   statusEl.addEventListener('change', applyFilters);
    if (categoryEl) categoryEl.addEventListener('change', applyFilters);

    if (clearEl) {
      clearEl.addEventListener('click', () => {
        if (searchEl)   searchEl.value   = '';
        if (statusEl)   statusEl.value   = '';
        if (categoryEl) categoryEl.value = '';
        applyFilters();
      });
    }
  }

  // ── Form ─────────────────────────────────────────────────────────────────

  async function form(id = null) {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    const isEdit = Boolean(id);
    setPageTitle(isEdit ? 'Edit Complaint' : 'New Complaint');
    setBreadcrumb(['Complaints', isEdit ? 'Edit' : 'New']);

    const headerActions = document.getElementById('header-actions');
    if (headerActions) headerActions.innerHTML = '';

    // Read hash query params for pre-filling
    const hash   = window.location.hash;
    const qIdx   = hash.indexOf('?');
    const params = qIdx > -1 ? new URLSearchParams(hash.slice(qIdx)) : new URLSearchParams();

    try {
      const [usersRes, contactsRes, accountsRes, policiesRes, complaintData] = await Promise.all([
        Api.admin.users(),
        Api.contacts.list({ limit: 500 }),
        Api.accounts.list({ limit: 500 }),
        Api.policies.list({ limit: 500 }),
        isEdit ? Api.complaints.get(id) : Promise.resolve({}),
      ]);

      const users    = usersRes.data    || usersRes    || [];
      const contacts = contactsRes.data || contactsRes || [];
      const accounts = accountsRes.data || accountsRes || [];
      const policies = policiesRes.data || policiesRes || [];
      const d        = complaintData.data || complaintData || {};

      if (!isEdit) {
        if (params.get('contact_id')) d.contact_id = params.get('contact_id');
        if (params.get('account_id')) d.account_id = params.get('account_id');
        if (params.get('policy_id'))  d.policy_id  = params.get('policy_id');
      }

      const showResolution = isResolved(d.complaint_status);

      el.innerHTML = `
        <div class="form-page">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">${isEdit ? 'Edit Complaint' : 'New Complaint'}</h3>
            </div>
            <form id="complaint-form" novalidate>

              <!-- ── Core Details ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Core Details</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label required">Complaint Date</label>
                    <input type="date" name="complaint_date" class="form-control" required
                      value="${esc(d.complaint_date ? d.complaint_date.slice(0, 10) : '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Status</label>
                    <select name="complaint_status" id="complaint-status-sel" class="form-control" required>
                      ${selectOpts(STATUSES, d.complaint_status, '— Select Status —')}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Category</label>
                    <select name="complaint_category" class="form-control">
                      ${selectOpts(CATEGORIES, d.complaint_category)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Received Via</label>
                    <select name="received_via" class="form-control">
                      ${selectOpts(RECEIVED_VIA_OPTIONS, d.received_via)}
                    </select>
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
                    <label class="form-label">Policy</label>
                    <select name="policy_id" class="form-control">
                      ${policyOptions(policies, d.policy_id)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Assigned To</label>
                    <select name="assigned_to_id" class="form-control">
                      ${userOptions(users, d.assigned_to_id)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Complaint Owner</label>
                    <select name="complaint_owner_id" class="form-control">
                      ${userOptions(users, d.complaint_owner_id)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Response Due Date</label>
                    <input type="date" name="response_due_date" class="form-control"
                      value="${esc(d.response_due_date ? d.response_due_date.slice(0, 10) : '')}" />
                  </div>

                </div>
              </fieldset>

              <!-- ── Complaint Detail ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Complaint Detail</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group form-group-full">
                    <label class="form-label required">Complaint Summary</label>
                    <textarea name="complaint_summary" class="form-control" rows="3" required>${esc(d.complaint_summary || '')}</textarea>
                  </div>

                  <div class="form-group form-group-full">
                    <label class="form-label">Detailed Complaint</label>
                    <textarea name="detailed_complaint" class="form-control" rows="5">${esc(d.detailed_complaint || '')}</textarea>
                  </div>

                </div>
              </fieldset>

              <!-- ── Resolution (shown when Resolved / Closed) ── -->
              <fieldset class="form-section" id="resolution-section" style="${showResolution ? '' : 'display:none;'}">
                <legend class="form-section-title">Resolution</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label">Resolution Date</label>
                    <input type="date" name="resolution_date" class="form-control"
                      value="${esc(d.resolution_date ? d.resolution_date.slice(0, 10) : '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Root Cause Category</label>
                    <select name="root_cause_category" class="form-control">
                      ${selectOpts(ROOT_CAUSE_CATEGORIES, d.root_cause_category)}
                    </select>
                  </div>

                  <div class="form-group form-group-full">
                    <label class="form-label">Resolution Summary</label>
                    <textarea name="resolution_summary" class="form-control" rows="4">${esc(d.resolution_summary || '')}</textarea>
                  </div>

                  <div class="form-group form-group-full">
                    <label class="form-label">Root Cause Identified</label>
                    <textarea name="root_cause_identified" class="form-control" rows="3">${esc(d.root_cause_identified || '')}</textarea>
                  </div>

                  <div class="form-group form-group-full">
                    <label class="form-label">Corrective Action Taken</label>
                    <textarea name="corrective_action_taken" class="form-control" rows="3">${esc(d.corrective_action_taken || '')}</textarea>
                  </div>

                </div>

                <div class="checklist-grid">
                  <label class="checklist-item">
                    <input type="checkbox" name="fair_outcome_achieved"
                      ${d.fair_outcome_achieved ? 'checked' : ''} />
                    <span>Fair Outcome Achieved</span>
                  </label>
                  <label class="checklist-item">
                    <input type="checkbox" name="complaint_escalated_internally"
                      ${d.complaint_escalated_internally ? 'checked' : ''} />
                    <span>Escalated Internally</span>
                  </label>
                  <label class="checklist-item">
                    <input type="checkbox" name="external_ombud_escalation"
                      ${d.external_ombud_escalation ? 'checked' : ''} />
                    <span>External Ombud Escalation</span>
                  </label>
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
                <button type="submit" class="btn btn-primary" id="complaint-submit-btn">
                  ${isEdit ? 'Save Changes' : 'Create Complaint'}
                </button>
                <a href="${isEdit ? `#/complaints/${id}` : '#/complaints'}" class="btn btn-secondary">Cancel</a>
              </div>

            </form>
          </div>
        </div>
      `;

      bindFormEvents(id, isEdit);

    } catch (err) {
      el.innerHTML = Utils.errorHtml('Failed to load complaint form.', err);
    }
  }

  function bindFormEvents(id, isEdit) {
    const formEl       = document.getElementById('complaint-form');
    const statusEl     = document.getElementById('complaint-status-sel');
    const resSection   = document.getElementById('resolution-section');

    // Show/hide resolution section based on status
    if (statusEl && resSection) {
      statusEl.addEventListener('change', () => {
        resSection.style.display = isResolved(statusEl.value) ? '' : 'none';
      });
    }

    wireContactAccountToggle(formEl);

    if (formEl) {
      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('complaint-submit-btn');
        if (btn) btn.disabled = true;
        const data = serializeForm(formEl);
        try {
          if (isEdit) {
            await Api.complaints.update(id, data);
            showToast('Complaint updated.', 'success');
            navigate(`complaints/${id}`);
          } else {
            const created = await Api.complaints.create(data);
            const newId   = (created.data || created).id;
            showToast('Complaint created.', 'success');
            navigate(`complaints/${newId}`);
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
      headerActions.innerHTML = `<a href="#/complaints/${id}/edit" class="btn btn-primary">Edit</a>`;
    }

    try {
      const res = await Api.complaints.get(id);
      const d   = res.data || res || {};

      setPageTitle(esc(d.complaint_number || 'Complaint'));
      setBreadcrumb(['Complaints', d.complaint_number || 'Detail']);

      const resolved = isResolved(d.complaint_status);

      const field = (label, value) => `<div class="detail-field"><span class="detail-label">${label}</span><span class="detail-value">${value || '—'}</span></div>`;
      const bool  = (v) => v ? `<span class="bool-yes">&#10003; Yes</span>` : `<span class="bool-no">&#10007; No</span>`;

      el.innerHTML = `
        <div class="detail-view">

          <!-- Escalation banners -->
          ${d.external_ombud_escalation ? `
          <div class="alert alert-danger">
            &#9888; <strong>EXTERNAL OMBUD ESCALATION</strong> — This complaint has been escalated to an external ombud.
          </div>` : ''}

          ${d.complaint_escalated_internally ? `
          <div class="alert alert-warning">
            &#9888; <strong>Internally Escalated</strong> — This complaint has been escalated internally.
          </div>` : ''}

          <!-- Complaint Details -->
          <div class="detail-section card">
            <div class="detail-section-title">Complaint Details</div>
            <div class="detail-grid">
              ${field('Complaint Number', esc(d.complaint_number || '—'))}
              ${field('Status', statusBadgeHtml(d.complaint_status))}
              ${field('Category', esc(d.complaint_category || '—'))}
              ${field('Received Via', esc(d.received_via || '—'))}
              ${field('Complaint Date', d.complaint_date ? Utils.formatDate(d.complaint_date) : '—')}
              ${field('Response Due Date', d.response_due_date ? Utils.formatDate(d.response_due_date) : '—')}
            </div>
          </div>

          <!-- Parties -->
          <div class="detail-section card">
            <div class="detail-section-title">Parties</div>
            <div class="detail-grid">
              ${field('Contact', d.contact_id ? `<a href="#/contacts/${d.contact_id}">${esc(d.contact_name || '—')}</a>` : esc(d.contact_name || '—'))}
              ${field('Account', d.account_id ? `<a href="#/accounts/${d.account_id}">${esc(d.account_name || '—')}</a>` : esc(d.account_name || '—'))}
              ${field('Policy', d.policy_id ? `<a href="#/policies/${d.policy_id}">${esc(d.policy_name || d.policy_number || '—')}</a>` : '—')}
              ${field('Broker', esc(d.broker_name || '—'))}
              ${field('Assigned To', esc(d.assigned_to_name || '—'))}
              ${field('Complaint Owner', esc(d.complaint_owner_name || '—'))}
              ${field('Created By', esc(d.created_by_name || '—'))}
            </div>
          </div>

          <!-- Status & Flags -->
          <div class="detail-section card">
            <div class="detail-section-title">Status &amp; Flags</div>
            <div class="detail-grid">
              ${field('Fair Outcome Achieved', bool(d.fair_outcome_achieved))}
              ${field('External Ombud Escalation', bool(d.external_ombud_escalation))}
              ${field('Complaint Escalated Internally', bool(d.complaint_escalated_internally))}
            </div>
          </div>

          <!-- Complaint Summary -->
          <div class="detail-section card">
            <div class="detail-section-title">Complaint Summary</div>
            <div class="detail-text-fields">
              ${d.complaint_summary ? `<div class="detail-text-item"><strong>Complaint Summary</strong><p>${esc(d.complaint_summary)}</p></div>` : ''}
              ${d.detailed_complaint ? `<div class="detail-text-item"><strong>Detailed Complaint</strong><p>${esc(d.detailed_complaint)}</p></div>` : ''}
            </div>
          </div>

          <!-- Resolution -->
          ${resolved ? `
          <div class="detail-section card">
            <div class="detail-section-title">Resolution</div>
            <div class="detail-grid">
              ${field('Resolution Date', d.resolution_date ? Utils.formatDate(d.resolution_date) : '—')}
              ${field('Root Cause Category', esc(d.root_cause_category || '—'))}
            </div>
            ${d.resolution_summary || d.root_cause_identified || d.corrective_action_taken ? `
            <div class="detail-text-fields" style="margin-top:.75rem;">
              ${d.resolution_summary ? `<div class="detail-text-item"><strong>Resolution Summary</strong><p>${esc(d.resolution_summary)}</p></div>` : ''}
              ${d.root_cause_identified ? `<div class="detail-text-item"><strong>Root Cause Identified</strong><p>${esc(d.root_cause_identified)}</p></div>` : ''}
              ${d.corrective_action_taken ? `<div class="detail-text-item"><strong>Corrective Action Taken</strong><p>${esc(d.corrective_action_taken)}</p></div>` : ''}
            </div>` : ''}
          </div>` : ''}

          <!-- Notes -->
          ${d.notes ? `
          <div class="detail-section card">
            <div class="detail-section-title">Notes</div>
            <p class="detail-notes">${esc(d.notes)}</p>
          </div>` : ''}

          <!-- Tabs: Timeline + Documents -->
          <div class="detail-tabs card">
            <div class="tabs-header" id="comp-tabs-header">
              <button class="tab-btn active" data-tab="timeline">Timeline</button>
              <button class="tab-btn"        data-tab="documents">Documents</button>
            </div>
            <div class="tab-content" id="comp-tab-content">
              <div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>
            </div>
          </div>

        </div>
      `;

      loadTab(id, 'timeline');

      document.getElementById('comp-tabs-header').querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#comp-tabs-header .tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          loadTab(id, btn.dataset.tab);
        });
      });

    } catch (err) {
      el.innerHTML = Utils.errorHtml('Failed to load complaint.', err);
    }
  }

  async function loadTab(complaintId, tab) {
    const tabEl = document.getElementById('comp-tab-content');
    if (!tabEl) return;
    tabEl.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    try {
      switch (tab) {

        case 'timeline': {
          const entries = await Api.timeline.forRecord('complaints', complaintId);
          const rows    = Array.isArray(entries) ? entries : (entries.data || []);
          tabEl.innerHTML = `<div style="padding:.75rem 1rem;">${renderTimeline(rows, 'No activity recorded for this complaint yet.')}</div>`;
          break;
        }

        case 'documents': {
          const res  = await Api.documents.list({ module: 'complaints', record_id: complaintId });
          const docs = res.data || [];
          tabEl.innerHTML = `
            <div class="tab-toolbar">
              <label class="btn btn-primary btn-sm" for="comp-doc-upload">+ Upload Document</label>
              <input type="file" id="comp-doc-upload" style="display:none;"
                accept=".pdf,.jpg,.jpeg,.png,.docx" />
            </div>
            ${docs.length ? `
            <table class="table">
              <thead><tr><th>File Name</th><th>Type</th><th>Size</th><th>Uploaded By</th><th>Date</th><th></th></tr></thead>
              <tbody>${docs.map(doc => `
                <tr>
                  <td>${esc(doc.original_name)}</td>
                  <td>${esc(doc.file_type || '—')}</td>
                  <td>${Utils.formatBytes ? Utils.formatBytes(doc.file_size) : doc.file_size}</td>
                  <td>${esc(doc.uploaded_by_name || '—')}</td>
                  <td>${doc.uploaded_at ? Utils.formatDate(doc.uploaded_at) : '—'}</td>
                  <td style="white-space:nowrap;">
                    <a href="/api/documents/${doc.id}/view" target="_blank" class="btn btn-xs btn-outline">View</a>
                    <button class="btn btn-xs btn-danger doc-del-btn" data-doc-id="${doc.id}" data-doc-name="${esc(doc.original_name)}">Delete</button>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>` : `<p class="tab-empty">No documents uploaded yet.</p>`}
          `;

          document.getElementById('comp-doc-upload').addEventListener('change', async e => {
            const file = e.target.files[0];
            if (!file) return;
            try {
              const fd = new FormData();
              fd.append('file', file);
              fd.append('module', 'complaints');
              fd.append('record_id', complaintId);
              await Api.documents.upload(fd);
              showToast('Document uploaded.', 'success');
              loadTab(complaintId, 'documents');
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
                loadTab(complaintId, 'documents');
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
      tabEl.innerHTML = `<p class="tab-empty" style="color:var(--danger);">Failed to load tab: ${esc(err.message)}</p>`;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return { list, form, detail };

})();
