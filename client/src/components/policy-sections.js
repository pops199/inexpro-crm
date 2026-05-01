/* ═══════════════════════════════════════════════════════════════════════════
   PolicySections component  —  Policy Sections / Needs Analysis (spec section 9)
   ═══════════════════════════════════════════════════════════════════════════ */

const PolicySections = (() => {

  // ── Constants ────────────────────────────────────────────────────────────

  const SECTION_TYPES = [
    // Personal Lines
    'Personal Motor', 'Household Contents', 'Buildings', 'All Risks',
    'Personal Liability', 'Watercraft', 'Caravan / Trailer', 'Personal Accident',
    'Extended Household / Portable Possessions',
    // Commercial Lines
    'Commercial Motor', 'Business Assets', 'Office Contents', 'Buildings Combined',
    'Electronic Equipment', 'Business Interruption', 'Money', 'Glass',
    'Fidelity Guarantee', 'Accounts Receivable',
    // Liability
    'Public Liability', 'Products Liability', 'Employers Liability',
    'Directors and Officers', 'Professional Indemnity', 'Cyber Liability',
    'Event Liability', 'Extended Third Party Liability',
    // Transport / Logistics
    'Goods in Transit', 'Carrier Liability', 'Fleet Cover',
    'Trailer Combination Cover', 'Load Limit', 'Wreckage Removal',
    'Passenger Liability', 'Cross Border / Special Risk',
    // Agri / Specialist
    'Agri Assets', 'Tractors and Implements', 'Livestock',
    'Irrigation Equipment', 'Specialist Plant', 'Contract Works',
    'Marine / Inland Marine', 'Other',
  ];

  const SECTION_CATEGORIES = [
    'Personal Lines',
    'Commercial Lines',
    'Transport',
    'Liability',
    'Specialist',
  ];

  const NEEDS_ANALYSIS_STATUSES = [
    'Not Assessed',
    'Assessed',
    'Recommendation Made',
    'Accepted',
    'Declined',
    'Implemented',
    'Not Applicable',
  ];

  const GAP_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

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

  async function list() {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    setPageTitle('Policy Sections');
    setBreadcrumb(['Policy Sections']);

    const headerActions = document.getElementById('header-actions');
    if (headerActions) {
      headerActions.innerHTML = `<a href="#/policy-sections/new" class="btn btn-primary">+ New Section</a>`;
    }

    const filters = getFiltersFromHash();

    try {
      const res = await Api.policySections.list({ ...filters, limit: 200 });
      const sections = res.data || res || [];

      const policyFilter   = filters.policy_id         || '';
      const gapFilter      = filters.gap_identified     || '';
      const typeFilter     = filters.section_type       || '';
      const catFilter      = filters.section_category   || '';

      el.innerHTML = `
        <div class="list-page">

          <!-- Filters -->
          <div class="filter-bar card">
            <div class="filter-group">
              <select id="ps-filter-type" class="form-control">
                <option value="">All Types</option>
                ${SECTION_TYPES.map(t => `<option value="${esc(t)}" ${typeFilter === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
              </select>
            </div>
            <div class="filter-group">
              <select id="ps-filter-cat" class="form-control">
                <option value="">All Categories</option>
                ${SECTION_CATEGORIES.map(c => `<option value="${esc(c)}" ${catFilter === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
              </select>
            </div>
            <div class="filter-group">
              <select id="ps-filter-gap" class="form-control">
                <option value="">All (gap / no gap)</option>
                <option value="1" ${gapFilter === '1' ? 'selected' : ''}>Gap Identified</option>
                <option value="0" ${gapFilter === '0' ? 'selected' : ''}>No Gap</option>
              </select>
            </div>
            <div class="filter-group">
              <button id="ps-filter-clear" class="btn btn-secondary">Clear</button>
            </div>
          </div>

          <!-- Table -->
          <div class="card">
            <div class="table-responsive">
              <table class="table">
                <thead>
                  <tr>
                    <th>Section Name</th>
                    <th>Policy</th>
                    <th>Section Type</th>
                    <th>Category</th>
                    <th>Risk Exists</th>
                    <th>Gap Identified</th>
                    <th>Implemented</th>
                    <th>Needs Analysis Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="ps-tbody">
                  <tr><td colspan="9" class="table-empty">Loading…</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      renderTableRows(sections);
      bindFilterEvents();

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load policy sections: ${esc(err.message)}</div>`;
    }
  }

  function renderTableRows(sections) {
    const tbody = document.getElementById('ps-tbody');
    if (!tbody) return;

    if (!sections.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="table-empty">No policy sections found.</td></tr>`;
      return;
    }

    tbody.innerHTML = sections.map(s => {
      const name   = esc(s.section_name   || '—');
      const policy = esc(s.policy_name    || '—');
      const type   = esc(s.section_type   || '—');
      const cat    = esc(s.section_category || '—');
      const status = esc(s.needs_analysis_status || '—');
      return `
        <tr>
          <td><a href="#/policy-sections/${s.id}">${name}</a></td>
          <td>${s.policy_id ? `<a href="#/policies/${s.policy_id}">${policy}</a>` : policy}</td>
          <td>${type}</td>
          <td>${cat}</td>
          <td>${s.risk_exists ? 'Yes' : 'No'}</td>
          <td>${s.gap_identified ? '<span class="badge badge-danger">GAP</span>' : '—'}</td>
          <td>${s.implemented ? 'Yes' : 'No'}</td>
          <td>${status}</td>
          <td class="actions-cell">
            <a href="#/policy-sections/${s.id}" class="btn btn-sm btn-secondary">View</a>
            <a href="#/policy-sections/${s.id}/edit" class="btn btn-sm btn-primary">Edit</a>
            <button class="btn btn-sm btn-danger" data-delete-id="${s.id}" data-delete-name="${name}">Delete</button>
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-delete-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id   = btn.dataset.deleteId;
        const name = btn.dataset.deleteName;
        if (!confirmDialog(`Delete section "${name}"? This cannot be undone.`)) return;
        try {
          await Api.policySections.delete(id);
          showToast('Section deleted.', 'success');
          list();
        } catch (err) {
          showToast('Delete failed: ' + err.message, 'error');
        }
      });
    });
  }

  function bindFilterEvents() {
    const typeEl  = document.getElementById('ps-filter-type');
    const catEl   = document.getElementById('ps-filter-cat');
    const gapEl   = document.getElementById('ps-filter-gap');
    const clearEl = document.getElementById('ps-filter-clear');

    const applyFilters = debounce(async () => {
      const params = {};
      if (typeEl.value)  params.section_type     = typeEl.value;
      if (catEl.value)   params.section_category = catEl.value;
      if (gapEl.value !== '') params.gap_identified = gapEl.value;
      try {
        const res = await Api.policySections.list({ ...params, limit: 200 });
        renderTableRows(res.data || res || []);
      } catch (err) {
        showToast('Filter error: ' + err.message, 'error');
      }
    }, 350);

    if (typeEl)  typeEl.addEventListener('change', applyFilters);
    if (catEl)   catEl.addEventListener('change', applyFilters);
    if (gapEl)   gapEl.addEventListener('change', applyFilters);

    if (clearEl) {
      clearEl.addEventListener('click', () => {
        if (typeEl) typeEl.value = '';
        if (catEl)  catEl.value  = '';
        if (gapEl)  gapEl.value  = '';
        applyFilters();
      });
    }
  }

  // ── Dynamic section type filtering by category ───────────────────────────

  function wireSectionTypeFilter(catSelect, typeSelect) {
    const TYPE_MAP = {
      'Personal Lines':   [
        'Personal Motor','Household Contents','Buildings','All Risks',
        'Personal Liability','Watercraft','Caravan / Trailer','Personal Accident',
        'Extended Household / Portable Possessions',
      ],
      'Commercial Lines': [
        'Commercial Motor','Business Assets','Office Contents','Buildings Combined',
        'Electronic Equipment','Business Interruption','Money','Glass',
        'Fidelity Guarantee','Accounts Receivable',
      ],
      'Liability': [
        'Public Liability','Products Liability','Employers Liability',
        'Directors and Officers','Professional Indemnity','Cyber Liability',
        'Event Liability','Extended Third Party Liability',
      ],
      'Transport': [
        'Goods in Transit','Carrier Liability','Fleet Cover',
        'Trailer Combination Cover','Load Limit','Wreckage Removal',
        'Passenger Liability','Cross Border / Special Risk',
      ],
      'Specialist': [
        'Agri Assets','Tractors and Implements','Livestock',
        'Irrigation Equipment','Specialist Plant','Contract Works',
        'Marine / Inland Marine','Other',
      ],
    };

    function updateTypeOptions(category) {
      const allowed = TYPE_MAP[category] || null;
      const currentText = typeSelect.options[typeSelect.selectedIndex]?.text || '';
      Array.from(typeSelect.options).forEach(opt => {
        if (!opt.value) return;           // keep the blank "— Select —" option
        opt.hidden   = allowed ? !allowed.includes(opt.text) : false;
        opt.disabled = opt.hidden;
      });
      // If the currently selected type is no longer valid, reset the select
      if (allowed && currentText && !allowed.includes(currentText)) {
        typeSelect.value = '';
      }
    }

    updateTypeOptions(catSelect.value);
    catSelect.addEventListener('change', () => updateTypeOptions(catSelect.value));
  }

  // ── Form ─────────────────────────────────────────────────────────────────

  async function form(id = null) {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    const isEdit = Boolean(id);
    setPageTitle(isEdit ? 'Edit Policy Section' : 'New Policy Section');
    setBreadcrumb(['Policy Sections', isEdit ? 'Edit' : 'New']);

    const headerActions = document.getElementById('header-actions');
    if (headerActions) headerActions.innerHTML = '';

    const hashParams = getFiltersFromHash();

    try {
      const [contactsRes, accountsRes, policiesRes, assetsRes, secData] = await Promise.all([
        Api.contacts.list({ limit: 500 }),
        Api.accounts.list({ limit: 500 }),
        Api.policies.list({ limit: 500 }),
        Api.assets.list({ limit: 500 }),
        isEdit ? Api.policySections.get(id) : Promise.resolve({}),
      ]);

      const contacts = contactsRes.data || contactsRes || [];
      const accounts = accountsRes.data || accountsRes || [];
      const policies = policiesRes.data || policiesRes || [];
      const assets   = assetsRes.data   || assetsRes   || [];
      const d        = secData.data     || secData     || {};

      if (!isEdit) {
        if (hashParams.policy_id)  d.policy_id  = hashParams.policy_id;
        if (hashParams.contact_id) d.contact_id = hashParams.contact_id;
        if (hashParams.account_id) d.account_id = hashParams.account_id;
      }

      const showDeclineReason = Boolean(d.client_declined_recommendation);
      const showGapSeverity   = Boolean(d.gap_identified);

      el.innerHTML = `
        <div class="form-page">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">${isEdit ? 'Edit Policy Section' : 'New Policy Section'}</h3>
            </div>
            <form id="ps-form" novalidate>

              <!-- ── Core Details ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Core Details</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label required">Section Name</label>
                    <input type="text" name="section_name" class="form-control" required
                      value="${esc(d.section_name || '')}" />
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
                    <label class="form-label">Asset (optional)</label>
                    <select name="asset_id" class="form-control">
                      ${assetOptions(assets, d.asset_id)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Section Type</label>
                    <select name="section_type" class="form-control" required>
                      ${selectOpts(SECTION_TYPES, d.section_type, '— Select Type —')}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Section Category</label>
                    <select name="section_category" class="form-control" required>
                      ${selectOpts(SECTION_CATEGORIES, d.section_category, '— Select Category —')}
                    </select>
                  </div>

                </div>
              </fieldset>

              <!-- ── Needs Analysis ── -->
              <fieldset class="form-section needs-analysis-section">
                <legend class="form-section-title">Needs Analysis</legend>
                <div class="checklist-grid">

                  <label class="checklist-item">
                    <input type="checkbox" name="risk_exists" id="ps-risk-exists"
                      ${d.risk_exists ? 'checked' : ''} />
                    <span>Risk Exists</span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="cover_required"
                      ${d.cover_required ? 'checked' : ''} />
                    <span>Cover Required</span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="currently_covered"
                      ${d.currently_covered ? 'checked' : ''} />
                    <span>Currently Covered</span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="recommended_for_cover" id="ps-recommended"
                      ${d.recommended_for_cover ? 'checked' : ''} />
                    <span>Recommended for Cover</span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="implemented" id="ps-implemented"
                      ${d.implemented ? 'checked' : ''} />
                    <span>Implemented</span>
                  </label>

                </div>

                <!-- Gap Identified (auto-set) -->
                <div class="gap-identified-row" style="margin-top:16px;">
                  <label class="checklist-item gap-checkbox-label">
                    <input type="checkbox" name="gap_identified" id="ps-gap-identified"
                      ${d.gap_identified ? 'checked' : ''} />
                    <span class="${d.gap_identified ? 'text-danger' : ''}">
                      <strong>Gap Identified</strong>
                    </span>
                    ${d.gap_identified ? '<span class="badge badge-danger" style="margin-left:8px;">GAP</span>' : ''}
                  </label>
                  <div id="ps-gap-auto-note" class="alert alert-info" style="margin-top:8px; ${d.gap_identified ? '' : 'display:none;'}">
                    &#9432; Gap auto-identified based on analysis (Risk Exists + Recommended for Cover + Not Implemented).
                  </div>
                </div>

                <!-- Gap Severity (only when gap identified) -->
                <div class="form-group" id="ps-gap-severity-group"
                  style="margin-top:12px; ${showGapSeverity ? '' : 'display:none;'}">
                  <label class="form-label">Gap Severity</label>
                  <select name="gap_severity" class="form-control" id="ps-gap-severity">
                    ${selectOpts(GAP_SEVERITIES, d.gap_severity, '— Select Severity —')}
                  </select>
                </div>

                <!-- Client recommendation response -->
                <div class="checklist-grid" style="margin-top:16px;">

                  <label class="checklist-item">
                    <input type="checkbox" name="client_accepted_recommendation" id="ps-accepted"
                      ${d.client_accepted_recommendation ? 'checked' : ''} />
                    <span>Client Accepted Recommendation</span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="client_declined_recommendation" id="ps-declined"
                      ${d.client_declined_recommendation ? 'checked' : ''} />
                    <span>Client Declined Recommendation</span>
                  </label>

                </div>

                <div class="form-group" id="ps-decline-reason-group"
                  style="margin-top:12px; ${showDeclineReason ? '' : 'display:none;'}">
                  <label class="form-label">Decline Reason</label>
                  <textarea name="decline_reason" class="form-control" rows="2">${esc(d.decline_reason || '')}</textarea>
                </div>

              </fieldset>

              <!-- ── Cover Details ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Cover Details</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label">Sum Insured / Limit</label>
                    <div class="input-prefix-group">
                      <span class="input-prefix cur-label">R</span>
                      <input type="number" name="sum_insured" class="form-control" step="0.01" min="0"
                        value="${esc(d.sum_insured || '')}" />
                    </div>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Premium</label>
                    <div class="input-prefix-group">
                      <span class="input-prefix cur-label">R</span>
                      <input type="number" name="premium" class="form-control" step="0.01" min="0"
                        value="${esc(d.premium || '')}" />
                    </div>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Basic Excess (<span class="cur-label">R</span>)</label>
                    <input type="number" name="excess" class="form-control" step="0.01" min="0"
                      placeholder="0.00" value="${esc(d.excess != null ? d.excess : '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Excess % of Claim Value <span style="font-weight:400;color:var(--text-muted);">(optional)</span></label>
                    <input type="number" name="excess_pct_claim" class="form-control" id="ps-excess-pct-claim"
                      min="0" max="100" step="0.01" placeholder="e.g. 10"
                      value="${esc(d.excess_pct_claim != null ? d.excess_pct_claim : '')}" />
                    <small id="ps-excess-pct-claim-calc" style="color:var(--text-muted);margin-top:.2rem;display:block;"></small>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Excess % of Insured Value <span style="font-weight:400;color:var(--text-muted);">(optional)</span></label>
                    <input type="number" name="excess_pct_insured" class="form-control" id="ps-excess-pct-insured"
                      min="0" max="100" step="0.01" placeholder="e.g. 2.5"
                      value="${esc(d.excess_pct_insured != null ? d.excess_pct_insured : '')}" />
                    <small id="ps-excess-pct-insured-calc" style="color:var(--text-muted);margin-top:.2rem;display:block;"></small>
                  </div>

                  <div class="form-group" id="ps-minimum-excess-group" style="${(d.excess_pct_claim != null || d.excess_pct_insured != null) ? '' : 'display:none;'}">
                    <label class="form-label">Minimum Excess (<span class="cur-label">R</span>)</label>
                    <input type="number" name="minimum_excess" class="form-control" id="ps-minimum-excess" min="0" step="0.01"
                      placeholder="0.00" value="${esc(d.minimum_excess != null ? d.minimum_excess : '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Excess Notes</label>
                    <input type="text" name="excess_structure_notes" class="form-control"
                      value="${esc(d.excess_structure_notes || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="checklist-item">
                      <input type="checkbox" name="buy_down_applies" id="ps-buydown"
                        ${d.buy_down_applies ? 'checked' : ''} />
                      <span>Buy Down Applies</span>
                    </label>
                  </div>

                  <div class="form-group" id="ps-buydown-premium-group"
                    style="${d.buy_down_applies ? '' : 'display:none;'}">
                    <label class="form-label">Buy Down Premium</label>
                    <div class="input-prefix-group">
                      <span class="input-prefix cur-label">R</span>
                      <input type="number" name="buy_down_premium" class="form-control" step="0.01" min="0"
                        value="${esc(d.buy_down_premium || '')}" />
                    </div>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Section Provider</label>
                    <input type="text" name="section_provider" class="form-control"
                      value="${esc(d.section_provider || '')}" />
                  </div>

                  <div class="form-group form-group-full">
                    <label class="form-label">Cover Description</label>
                    <textarea name="cover_description" class="form-control" rows="3">${esc(d.cover_description || '')}</textarea>
                  </div>

                  <div class="form-group form-group-full">
                    <label class="form-label">Main Exclusions / Limitations</label>
                    <textarea name="main_exclusions" class="form-control" rows="3">${esc(d.main_exclusions || '')}</textarea>
                  </div>

                </div>
              </fieldset>

              <!-- ── Compliance ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Compliance</legend>
                <div class="checklist-grid">

                  <label class="checklist-item">
                    <input type="checkbox" name="disclosure_explained"
                      ${d.disclosure_explained ? 'checked' : ''} />
                    <span>Disclosure Explained</span>
                  </label>

                  <label class="checklist-item">
                    <input type="checkbox" name="client_understanding_confirmed"
                      ${d.client_understanding_confirmed ? 'checked' : ''} />
                    <span>Client Understanding Confirmed</span>
                  </label>

                </div>
                <div class="form-grid form-grid-2" style="margin-top:16px;">

                  <div class="form-group">
                    <label class="form-label required">Needs Analysis Status</label>
                    <select name="needs_analysis_status" class="form-control" required>
                      ${selectOpts(NEEDS_ANALYSIS_STATUSES, d.needs_analysis_status, '— Select Status —')}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="checklist-item">
                      <input type="checkbox" name="conduct_concern_flag" id="ps-conduct-flag"
                        ${d.conduct_concern_flag ? 'checked' : ''} />
                      <span class="text-danger"><strong>Conduct Concern Flag</strong></span>
                    </label>
                  </div>

                  <div class="form-group form-group-full" id="ps-conduct-notes-group"
                    style="${d.conduct_concern_flag ? '' : 'display:none;'}">
                    <label class="form-label">Conduct Notes</label>
                    <textarea name="conduct_notes" class="form-control" rows="2">${esc(d.conduct_notes || '')}</textarea>
                  </div>

                </div>
              </fieldset>

              <!-- ── Review Dates ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Review Dates</legend>
                <div class="form-grid form-grid-2">
                  <div class="form-group">
                    <label class="form-label">Last Reviewed Date</label>
                    <input type="date" name="last_reviewed_date" class="form-control"
                      value="${esc(d.last_reviewed_date ? d.last_reviewed_date.slice(0,10) : '')}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Next Review Date</label>
                    <input type="date" name="next_review_date" class="form-control"
                      value="${esc(d.next_review_date ? d.next_review_date.slice(0,10) : '')}" />
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
                <button type="submit" class="btn btn-primary" id="ps-submit-btn">
                  ${isEdit ? 'Save Changes' : 'Create Section'}
                </button>
                <a href="${isEdit ? `#/policy-sections/${id}` : '#/policy-sections'}" class="btn btn-secondary">Cancel</a>
              </div>

            </form>
          </div>
        </div>
      `;

      bindFormEvents(id, isEdit);

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load form: ${esc(err.message)}</div>`;
    }
  }

  function bindFormEvents(id, isEdit) {
    const formEl         = document.getElementById('ps-form');
    const riskExistsEl   = document.getElementById('ps-risk-exists');
    const recommendedEl  = document.getElementById('ps-recommended');
    const implementedEl  = document.getElementById('ps-implemented');
    const gapEl          = document.getElementById('ps-gap-identified');
    const gapNoteEl      = document.getElementById('ps-gap-auto-note');
    const gapSevGroup    = document.getElementById('ps-gap-severity-group');
    const declinedEl     = document.getElementById('ps-declined');
    const acceptedEl     = document.getElementById('ps-accepted');
    const declineGroup   = document.getElementById('ps-decline-reason-group');
    const conductFlagEl  = document.getElementById('ps-conduct-flag');
    const conductGroup   = document.getElementById('ps-conduct-notes-group');
    const buydownEl      = document.getElementById('ps-buydown');
    const buydownGroup   = document.getElementById('ps-buydown-premium-group');

    // GAP AUTO-LOGIC: Risk Exists + Recommended + NOT Implemented → auto-check Gap
    function updateGapLogic() {
      const riskExists  = riskExistsEl  ? riskExistsEl.checked  : false;
      const recommended = recommendedEl ? recommendedEl.checked  : false;
      const implemented = implementedEl ? implementedEl.checked  : false;
      if (riskExists && recommended && !implemented) {
        if (gapEl) {
          gapEl.checked = true;
          gapEl.closest('.gap-checkbox-label') && gapEl.closest('.gap-checkbox-label')
            .querySelector('strong') &&
            (gapEl.closest('.gap-checkbox-label').querySelector('strong').className = 'text-danger');
        }
        if (gapNoteEl)  gapNoteEl.style.display  = '';
        if (gapSevGroup) gapSevGroup.style.display = '';
      }
    }

    // Gap checkbox toggled by user
    function onGapChange() {
      const isGap = gapEl ? gapEl.checked : false;
      if (gapNoteEl)  gapNoteEl.style.display  = isGap ? '' : 'none';
      if (gapSevGroup) gapSevGroup.style.display = isGap ? '' : 'none';
    }

    if (riskExistsEl)  riskExistsEl.addEventListener('change',  updateGapLogic);
    if (recommendedEl) recommendedEl.addEventListener('change', updateGapLogic);
    if (implementedEl) implementedEl.addEventListener('change', updateGapLogic);
    if (gapEl)         gapEl.addEventListener('change',         onGapChange);

    // Decline / Accept mutual exclusivity hint
    if (declinedEl) {
      declinedEl.addEventListener('change', () => {
        if (declineGroup) declineGroup.style.display = declinedEl.checked ? '' : 'none';
        if (declinedEl.checked && acceptedEl) acceptedEl.checked = false;
      });
    }
    if (acceptedEl) {
      acceptedEl.addEventListener('change', () => {
        if (acceptedEl.checked && declinedEl) {
          declinedEl.checked = false;
          if (declineGroup) declineGroup.style.display = 'none';
        }
      });
    }

    // Conduct flag toggle
    if (conductFlagEl && conductGroup) {
      conductFlagEl.addEventListener('change', () => {
        conductGroup.style.display = conductFlagEl.checked ? '' : 'none';
      });
    }

    // Buy down toggle
    if (buydownEl && buydownGroup) {
      buydownEl.addEventListener('change', () => {
        buydownGroup.style.display = buydownEl.checked ? '' : 'none';
      });
    }

    // Excess % auto-calculation (base = sum insured)
    const psPctClaim    = document.getElementById('ps-excess-pct-claim');
    const psPctInsured  = document.getElementById('ps-excess-pct-insured');
    const psMinGroup    = document.getElementById('ps-minimum-excess-group');
    const psMinExcessEl = document.getElementById('ps-minimum-excess');
    const psBaseEl      = document.querySelector('[name="sum_insured"]');
    if (psPctClaim && psPctInsured && psMinGroup) {
      function fmtRps(v) {
        const curEl = formEl.querySelector('[name="currency"]');
        const sym = currencySymbol(curEl ? curEl.value : 'ZAR');
        return sym + '\u00a0' + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      function psCalcShow(pctEl, calcEl) {
        const pct  = parseFloat(pctEl.value);
        const base = parseFloat(psBaseEl ? psBaseEl.value : 0);
        const min  = parseFloat(psMinExcessEl ? psMinExcessEl.value : 0) || 0;
        if (!pct || !base) { if (calcEl) calcEl.textContent = ''; return; }
        const raw = (pct / 100) * base;
        const effective = (min > 0 && raw < min) ? min : raw;
        if (calcEl) calcEl.textContent = (min > 0 && raw < min)
          ? `= ${fmtRps(effective)} (min. excess applies)`
          : `= ${fmtRps(effective)}`;
      }
      function refreshPsCalcs() {
        const hasAnyPct = psPctClaim.value.trim() !== '' || psPctInsured.value.trim() !== '';
        psMinGroup.style.display = hasAnyPct ? '' : 'none';
        psCalcShow(psPctClaim,   document.getElementById('ps-excess-pct-claim-calc'));
        psCalcShow(psPctInsured, document.getElementById('ps-excess-pct-insured-calc'));
      }
      [psPctClaim, psPctInsured, psMinExcessEl, psBaseEl].forEach(el => {
        if (el) el.addEventListener('input', refreshPsCalcs);
      });
      refreshPsCalcs();
    }

    // Dynamic section type filtering — restrict type options by selected category
    const catSel  = document.querySelector('[name="section_category"]');
    const typeSel = document.querySelector('[name="section_type"]');
    if (catSel && typeSel) wireSectionTypeFilter(catSel, typeSel);

    wireContactAccountToggle(formEl);
    wireCurrencySelector(formEl);

    // Form submit
    if (formEl) {
      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('ps-submit-btn');
        if (btn) btn.disabled = true;

        const data = serializeForm(formEl);

        try {
          if (isEdit) {
            await Api.policySections.update(id, data);
            showToast('Section updated.', 'success');
            navigate(`policy-sections/${id}`);
          } else {
            const created = await Api.policySections.create(data);
            const newId   = (created.data || created).id;
            showToast('Section created.', 'success');
            navigate(`policy-sections/${newId}`);
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
      headerActions.innerHTML = `<a href="#/policy-sections/${id}/edit" class="btn btn-primary">Edit</a>`;
    }

    try {
      const res = await Api.policySections.get(id);
      const d   = res.data || res || {};

      setPageTitle(esc(d.section_name || 'Policy Section'));
      setBreadcrumb(['Policy Sections', d.section_name || 'Detail']);

      const gapClass = d.gap_identified ? 'gap-status--identified' : 'gap-status--none';

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

          <!-- GAP STATUS Banner -->
          <div class="gap-status-banner ${gapClass}">
            ${d.gap_identified
              ? `<span class="badge badge-danger" style="font-size:14px; padding:8px 16px;">GAP IDENTIFIED${d.gap_severity ? ` — ${esc(d.gap_severity)}` : ''}</span>`
              : `<span class="badge badge-success" style="font-size:14px; padding:8px 16px;">No Gap Identified</span>`}
          </div>

          <!-- Section Details -->
          <div class="detail-section card">
            <div class="detail-section-title">Section Details</div>
            <div class="detail-grid">
              ${field('Section Name', esc(d.section_name || '—'))}
              ${field('Section Type', esc(d.section_type || '—'))}
              ${field('Category', esc(d.section_category || '—'))}
              ${field('Policy', d.policy_id ? `<a href="#/policies/${d.policy_id}">${esc(d.policy_name || '—')}</a>` : '—')}
              ${field('Provider', esc(d.section_provider || '—'))}
            </div>
          </div>

          <!-- Parties & Links -->
          <div class="detail-section card">
            <div class="detail-section-title">Parties &amp; Links</div>
            <div class="detail-grid">
              ${field('Contact', d.contact_id ? `<a href="#/contacts/${d.contact_id}">${esc(d.contact_name || '—')}</a>` : esc(d.contact_name || '—'))}
              ${field('Account', d.account_id ? `<a href="#/accounts/${d.account_id}">${esc(d.account_name || '—')}</a>` : esc(d.account_name || '—'))}
              ${field('Asset', d.asset_id ? `<a href="#/assets/${d.asset_id}">${esc(d.asset_name || '—')}</a>` : esc(d.asset_name || '—'))}
            </div>
          </div>

          <!-- Financial -->
          <div class="detail-section card">
            <div class="detail-section-title">Financial</div>
            <div class="detail-grid">
              ${field('Sum Insured', d.sum_insured ? fmtCur(d.sum_insured) : '—')}
              ${field('Premium', d.premium ? fmtCur(d.premium) : '—')}
              ${d.excess != null ? field('Basic Excess', fmtCur(d.excess)) : ''}
              ${d.excess_pct_claim != null ? field('Excess % of Claim', d.excess_pct_claim + '%') : ''}
              ${d.excess_pct_insured != null ? field('Excess % of Insured', d.excess_pct_insured + '%') : ''}
              ${d.minimum_excess != null ? field('Minimum Excess', fmtCur(d.minimum_excess)) : ''}
              ${d.excess_structure_notes ? field('Excess Notes', esc(d.excess_structure_notes)) : ''}
              ${d.buy_down_applies ? field('Buy Down Premium', d.buy_down_premium ? fmtCur(d.buy_down_premium) : '—') : ''}
              ${field('Last Reviewed Date', d.last_reviewed_date ? formatDate(d.last_reviewed_date) : '—')}
              ${field('Next Review Date', d.next_review_date ? formatDate(d.next_review_date) : '—')}
            </div>
          </div>

          <!-- Needs Analysis Status -->
          <div class="detail-section card">
            <div class="detail-section-title">Needs Analysis Status</div>
            <div class="detail-grid">
              ${field('Needs Analysis Status', esc(d.needs_analysis_status || '—'))}
              ${field('Implemented', bool(d.implemented))}
              ${field('Gap Identified', bool(d.gap_identified))}
              ${field('Gap Severity', esc(d.gap_severity || '—'))}
            </div>
          </div>

          <!-- Needs Analysis Checklist -->
          <div class="detail-section card">
            <div class="detail-section-title">Needs Analysis Checklist</div>
            <div class="checklist-detail-grid">
              ${[
                { label: 'Risk Exists',                       key: 'risk_exists' },
                { label: 'Cover Required',                    key: 'cover_required' },
                { label: 'Currently Covered',                 key: 'currently_covered' },
                { label: 'Recommended for Cover',             key: 'recommended_for_cover' },
                { label: 'Implemented',                       key: 'implemented' },
                { label: 'Gap Identified',                    key: 'gap_identified' },
                { label: 'Client Accepted Recommendation',    key: 'client_accepted_recommendation' },
                { label: 'Client Declined Recommendation',    key: 'client_declined_recommendation' },
              ].map(item => `
                <div class="checklist-detail-item ${d[item.key] ? 'checklist-done' : 'checklist-pending'}">
                  <span class="checklist-icon">${d[item.key] ? '&#10003;' : '&#9675;'}</span>
                  <span class="checklist-label">${item.label}</span>
                </div>`).join('')}
            </div>
            ${d.decline_reason ? `<p style="margin-top:8px;"><strong>Decline Reason:</strong> ${esc(d.decline_reason)}</p>` : ''}
          </div>

          <!-- Compliance -->
          <div class="detail-section card">
            <div class="detail-section-title">Compliance</div>
            <div class="checklist-detail-grid">
              ${[
                { label: 'Disclosure Explained',            key: 'disclosure_explained' },
                { label: 'Client Understanding Confirmed',  key: 'client_understanding_confirmed' },
              ].map(item => `
                <div class="checklist-detail-item ${d[item.key] ? 'checklist-done' : 'checklist-pending'}">
                  <span class="checklist-icon">${d[item.key] ? '&#10003;' : '&#9675;'}</span>
                  <span class="checklist-label">${item.label}</span>
                </div>`).join('')}
            </div>
          </div>

          <!-- Cover Details -->
          ${d.cover_description || d.main_exclusions ? `
          <div class="detail-section card">
            <div class="detail-section-title">Cover Details</div>
            <div class="detail-text-fields">
              ${d.cover_description ? `<div class="detail-text-item"><strong>Cover Description</strong><p>${esc(d.cover_description)}</p></div>` : ''}
              ${d.main_exclusions ? `<div class="detail-text-item"><strong>Main Exclusions / Limitations</strong><p>${esc(d.main_exclusions)}</p></div>` : ''}
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
            <div class="tabs-header" id="section-tabs-header">
              <button class="tab-btn active" data-tab="timeline">Timeline</button>
              <button class="tab-btn"        data-tab="documents">Documents</button>
            </div>
            <div class="tab-content" id="section-tab-content">
              <div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>
            </div>
          </div>

        </div>
      `;

      loadSectionTab(id, 'timeline');

      document.getElementById('section-tabs-header').querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#section-tabs-header .tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          loadSectionTab(id, btn.dataset.tab);
        });
      });

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load section: ${esc(err.message)}</div>`;
    }
  }

  async function loadSectionTab(sectionId, tab) {
    const tabEl = document.getElementById('section-tab-content');
    if (!tabEl) return;
    tabEl.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    try {
      switch (tab) {
        case 'timeline': {
          const entries = await Api.timeline.forRecord('policy-sections', sectionId);
          const rows = Array.isArray(entries) ? entries : (entries.data || []);
          tabEl.innerHTML = `<div style="padding:.75rem 1rem;">${renderTimeline(rows, 'No activity recorded yet.')}</div>`;
          break;
        }
        case 'documents': {
          const res = await Api.documents.list({ module: 'policy-sections', record_id: sectionId });
          const docs = (res.data || []);
          tabEl.innerHTML = `
            <div class="tab-toolbar">
              <label class="btn btn-primary btn-sm" for="section-doc-upload">+ Upload Document</label>
              <input type="file" id="section-doc-upload" style="display:none;"
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
                  <td><a href="/api/documents/${d.id}/view" target="_blank" class="btn btn-xs btn-outline">View</a></td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No documents uploaded yet.</p>`}
          `;
          document.getElementById('section-doc-upload').addEventListener('change', async e => {
            const file = e.target.files[0];
            if (!file) return;
            try {
              const fd = new FormData();
              fd.append('file', file);
              fd.append('module', 'policy-sections');
              fd.append('record_id', sectionId);
              await Api.documents.upload(fd);
              showToast('Document uploaded.', 'success');
              loadSectionTab(sectionId, 'documents');
            } catch (err) {
              showToast('Upload failed: ' + (err.message || err), 'error');
            }
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
