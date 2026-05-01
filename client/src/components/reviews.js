/* ═══════════════════════════════════════════════════════════════════════════
   Reviews component  —  Client Reviews Register
   ═══════════════════════════════════════════════════════════════════════════ */

const Reviews = (() => {

  // ── Constants ────────────────────────────────────────────────────────────

  const REVIEW_TYPES = [
    'Annual Review',
    'Mid-Year Review',
    'Renewal Review',
    'Claims Review',
    'Ad Hoc Review',
    'Complaint Review',
  ];

  const OUTCOMES = [
    'No Changes Required',
    'Changes Recommended',
    'Urgent Action Required',
    'Policy Cancelled',
    'Follow-Up Required',
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

  function completedBadgeHtml(completed) {
    if (completed) {
      return `<span class="badge badge-status badge-status--settled">Completed</span>`;
    }
    return `<span class="badge badge-status badge-status--open">Pending</span>`;
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

  // ── List ─────────────────────────────────────────────────────────────────

  async function list() {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    setPageTitle('Reviews');
    setBreadcrumb(['Reviews']);

    const headerActions = document.getElementById('header-actions');
    if (headerActions) {
      headerActions.innerHTML = `<a href="#/reviews/new" class="btn btn-primary">+ New Review</a>`;
    }

    const filters = getFiltersFromHash();

    try {
      const [reviewsRes, usersRes] = await Promise.all([
        Api.reviews.list({ ...filters, limit: 200 }),
        Api.admin.users(),
      ]);

      const reviews = reviewsRes.data || reviewsRes || [];
      const users   = usersRes.data   || usersRes   || [];

      const searchFilter    = filters.q            || '';
      const typeFilter      = filters.review_type  || '';
      const completedFilter = filters.completed    || '';
      const brokerFilter    = filters.broker_id    || '';

      el.innerHTML = `
        <div class="list-page">

          <!-- Filters -->
          <div class="filter-bar card">
            <div class="filter-group">
              <input type="text" id="rev-search" class="form-control" placeholder="Search reviews…"
                value="${esc(searchFilter)}" style="min-width:200px;" />
            </div>
            <div class="filter-group">
              <select id="rev-filter-type" class="form-control">
                <option value="">All Types</option>
                ${REVIEW_TYPES.map(t => `<option value="${esc(t)}" ${typeFilter === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
              </select>
            </div>
            <div class="filter-group">
              <select id="rev-filter-completed" class="form-control">
                <option value="">All (Completed / Pending)</option>
                <option value="1" ${completedFilter === '1' ? 'selected' : ''}>Completed</option>
                <option value="0" ${completedFilter === '0' ? 'selected' : ''}>Pending</option>
              </select>
            </div>
            <div class="filter-group">
              <select id="rev-filter-broker" class="form-control">
                <option value="">All Brokers</option>
                ${users.map(u => `<option value="${esc(u.id)}" ${String(brokerFilter) === String(u.id) ? 'selected' : ''}>${esc(u.full_name || u.username)}</option>`).join('')}
              </select>
            </div>
            <div class="filter-group">
              <button id="rev-filter-clear" class="btn btn-secondary">Clear</button>
            </div>
          </div>

          <!-- Table -->
          <div class="card">
            <div class="table-responsive">
              <table class="table">
                <thead>
                  <tr>
                    <th>Review #</th>
                    <th>Contact</th>
                    <th>Account</th>
                    <th>Review Type</th>
                    <th>Review Date</th>
                    <th>Completed</th>
                    <th>Outcome</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="rev-tbody">
                  <tr><td colspan="8" class="table-empty">Loading…</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      renderTableRows(reviews, searchFilter);
      bindFilterEvents(users);

    } catch (err) {
      el.innerHTML = Utils.errorHtml('Failed to load reviews.', err);
    }
  }

  function renderTableRows(reviews, search) {
    const tbody = document.getElementById('rev-tbody');
    if (!tbody) return;

    let rows = reviews;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        (r.review_number  || '').toLowerCase().includes(q) ||
        (r.contact_name   || '').toLowerCase().includes(q) ||
        (r.account_name   || '').toLowerCase().includes(q) ||
        (r.review_type    || '').toLowerCase().includes(q)
      );
    }

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="table-empty">No reviews found.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const num     = esc(r.review_number   || '—');
      const contact = esc(r.contact_name    || '—');
      const account = esc(r.account_name    || '—');
      const type    = esc(r.review_type     || '—');
      const date    = r.review_date ? Utils.formatDate(r.review_date) : '—';
      const outcome = esc(r.review_outcome  || '—');
      return `
        <tr>
          <td><a href="#/reviews/${r.id}">${num}</a></td>
          <td>${r.contact_id ? `<a href="#/contacts/${r.contact_id}">${contact}</a>` : contact}</td>
          <td>${r.account_id ? `<a href="#/accounts/${r.account_id}">${account}</a>` : account}</td>
          <td>${type}</td>
          <td>${date}</td>
          <td>${completedBadgeHtml(r.review_completed)}</td>
          <td>${outcome}</td>
          <td class="actions-cell">
            <a href="#/reviews/${r.id}" class="btn btn-sm btn-secondary">View</a>
            <a href="#/reviews/${r.id}/edit" class="btn btn-sm btn-primary">Edit</a>
            <button class="btn btn-sm btn-danger" data-delete-id="${r.id}" data-delete-name="${num}">Delete</button>
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-delete-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id   = btn.dataset.deleteId;
        const name = btn.dataset.deleteName;
        if (!confirmDialog(`Delete review "${name}"? This cannot be undone.`)) return;
        try {
          await Api.reviews.delete(id);
          showToast('Review deleted.', 'success');
          list();
        } catch (err) {
          showToast('Delete failed: ' + err.message, 'error');
        }
      });
    });
  }

  function bindFilterEvents(users) {
    const searchEl    = document.getElementById('rev-search');
    const typeEl      = document.getElementById('rev-filter-type');
    const completedEl = document.getElementById('rev-filter-completed');
    const brokerEl    = document.getElementById('rev-filter-broker');
    const clearEl     = document.getElementById('rev-filter-clear');

    const applyFilters = debounce(async () => {
      const params = {};
      if (searchEl.value.trim())         params.q           = searchEl.value.trim();
      if (typeEl.value)                  params.review_type = typeEl.value;
      if (completedEl.value !== '')      params.completed   = completedEl.value;
      if (brokerEl.value)                params.broker_id   = brokerEl.value;
      try {
        const res = await Api.reviews.list({ ...params, limit: 200 });
        renderTableRows(res.data || res || [], params.q || '');
      } catch (err) {
        showToast('Filter error: ' + err.message, 'error');
      }
    }, 350);

    if (searchEl)    searchEl.addEventListener('input', applyFilters);
    if (typeEl)      typeEl.addEventListener('change', applyFilters);
    if (completedEl) completedEl.addEventListener('change', applyFilters);
    if (brokerEl)    brokerEl.addEventListener('change', applyFilters);

    if (clearEl) {
      clearEl.addEventListener('click', () => {
        if (searchEl)    searchEl.value    = '';
        if (typeEl)      typeEl.value      = '';
        if (completedEl) completedEl.value = '';
        if (brokerEl)    brokerEl.value    = '';
        applyFilters();
      });
    }
  }

  // ── Form ─────────────────────────────────────────────────────────────────

  async function form(id = null) {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    const isEdit = Boolean(id);
    setPageTitle(isEdit ? 'Edit Review' : 'New Review');
    setBreadcrumb(['Reviews', isEdit ? 'Edit' : 'New']);

    const headerActions = document.getElementById('header-actions');
    if (headerActions) headerActions.innerHTML = '';

    // Read hash query params for pre-filling
    const hash   = window.location.hash;
    const qIdx   = hash.indexOf('?');
    const params = qIdx > -1 ? new URLSearchParams(hash.slice(qIdx)) : new URLSearchParams();

    try {
      const [usersRes, contactsRes, accountsRes, policiesRes, reviewData] = await Promise.all([
        Api.admin.users(),
        Api.contacts.list({ limit: 500 }),
        Api.accounts.list({ limit: 500 }),
        Api.policies.list({ limit: 500 }),
        isEdit ? Api.reviews.get(id) : Promise.resolve({}),
      ]);

      const users    = usersRes.data    || usersRes    || [];
      const contacts = contactsRes.data || contactsRes || [];
      const accounts = accountsRes.data || accountsRes || [];
      const policies = policiesRes.data || policiesRes || [];
      const d        = reviewData.data  || reviewData  || {};

      if (!isEdit) {
        if (params.get('contact_id')) d.contact_id = params.get('contact_id');
        if (params.get('account_id')) d.account_id = params.get('account_id');
        if (params.get('policy_id'))  d.policy_id  = params.get('policy_id');
      }

      el.innerHTML = `
        <div class="form-page">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">${isEdit ? 'Edit Review' : 'New Review'}</h3>
            </div>
            <form id="review-form" novalidate>

              <!-- ── Core Details ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Core Details</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label required">Review Date</label>
                    <input type="date" name="review_date" class="form-control" required
                      value="${esc(d.review_date ? d.review_date.slice(0, 10) : '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Review Type</label>
                    <select name="review_type" class="form-control" required>
                      ${selectOpts(REVIEW_TYPES, d.review_type, '— Select Type —')}
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
                    <label class="form-label">Broker</label>
                    <select name="broker_id" class="form-control">
                      ${userOptions(users, d.broker_id)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Assigned Admin</label>
                    <select name="assigned_admin_id" class="form-control">
                      ${userOptions(users, d.assigned_admin_id)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Next Review Date</label>
                    <input type="date" name="next_review_date" class="form-control"
                      value="${esc(d.next_review_date ? d.next_review_date.slice(0, 10) : '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Outcome</label>
                    <select name="review_outcome" class="form-control">
                      ${selectOpts(OUTCOMES, d.review_outcome)}
                    </select>
                  </div>

                </div>

                <div class="checklist-grid" style="margin-top:.75rem;">
                  <label class="checklist-item">
                    <input type="checkbox" name="review_completed"
                      ${d.review_completed ? 'checked' : ''} />
                    <span>Review Completed</span>
                  </label>
                  <label class="checklist-item">
                    <input type="checkbox" name="changes_in_risk_profile"
                      ${d.changes_in_risk_profile ? 'checked' : ''} />
                    <span>Changes in Risk Profile</span>
                  </label>
                  <label class="checklist-item">
                    <input type="checkbox" name="changes_in_assets_exposure"
                      ${d.changes_in_assets_exposure ? 'checked' : ''} />
                    <span>Changes in Assets / Exposure</span>
                  </label>
                  <label class="checklist-item">
                    <input type="checkbox" name="advice_record_required"
                      ${d.advice_record_required ? 'checked' : ''} />
                    <span>Advice Record Required</span>
                  </label>
                </div>

              </fieldset>

              <!-- ── Review Content ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Review Content</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group form-group-full">
                    <label class="form-label">Review Notes</label>
                    <textarea name="notes" class="form-control" rows="4">${esc(d.notes || '')}</textarea>
                  </div>

                  <div class="form-group form-group-full">
                    <label class="form-label">Gaps Identified</label>
                    <textarea name="gaps_identified" class="form-control" rows="3">${esc(d.gaps_identified || '')}</textarea>
                  </div>

                  <div class="form-group form-group-full">
                    <label class="form-label">Recommendations</label>
                    <textarea name="recommendations" class="form-control" rows="4">${esc(d.recommendations || '')}</textarea>
                  </div>

                  <div class="form-group form-group-full">
                    <label class="form-label">Follow-Up Actions</label>
                    <textarea name="follow_up_actions" class="form-control" rows="3">${esc(d.follow_up_actions || '')}</textarea>
                  </div>

                </div>
              </fieldset>

              <!-- ── Form Actions ── -->
              <div class="form-actions">
                <button type="submit" class="btn btn-primary" id="review-submit-btn">
                  ${isEdit ? 'Save Changes' : 'Create Review'}
                </button>
                <a href="${isEdit ? `#/reviews/${id}` : '#/reviews'}" class="btn btn-secondary">Cancel</a>
              </div>

            </form>
          </div>
        </div>
      `;

      bindFormEvents(id, isEdit);

    } catch (err) {
      el.innerHTML = Utils.errorHtml('Failed to load review form.', err);
    }
  }

  function bindFormEvents(id, isEdit) {
    const formEl = document.getElementById('review-form');

    wireContactAccountToggle(formEl);

    if (formEl) {
      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('review-submit-btn');
        if (btn) btn.disabled = true;
        const data = serializeForm(formEl);
        try {
          if (isEdit) {
            await Api.reviews.update(id, data);
            showToast('Review updated.', 'success');
            navigate(`reviews/${id}`);
          } else {
            const created = await Api.reviews.create(data);
            const newId   = (created.data || created).id;
            showToast('Review created.', 'success');
            navigate(`reviews/${newId}`);
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
      headerActions.innerHTML = `<a href="#/reviews/${id}/edit" class="btn btn-primary">Edit</a>`;
    }

    try {
      const res = await Api.reviews.get(id);
      const d   = res.data || res || {};

      setPageTitle(esc(d.review_number || 'Review'));
      setBreadcrumb(['Reviews', d.review_number || 'Detail']);

      const field = (label, value) => `<div class="detail-field"><span class="detail-label">${label}</span><span class="detail-value">${value || '—'}</span></div>`;
      const bool  = (v) => v ? `<span class="bool-yes">&#10003; Yes</span>` : `<span class="bool-no">&#10007; No</span>`;

      el.innerHTML = `
        <div class="detail-view">

          <!-- Urgent action banner -->
          ${d.review_outcome === 'Urgent Action Required' ? `
          <div class="alert alert-danger">
            &#9888; <strong>URGENT ACTION REQUIRED</strong> — This review outcome requires immediate attention.
          </div>` : ''}

          <!-- Review Details -->
          <div class="detail-section card">
            <div class="detail-section-title">Review Details</div>
            <div class="detail-grid">
              ${field('Review Number', esc(d.review_number || '—'))}
              ${field('Completed', completedBadgeHtml(d.review_completed))}
              ${field('Review Type', esc(d.review_type || '—'))}
              ${field('Review Date', d.review_date ? Utils.formatDate(d.review_date) : '—')}
              ${field('Next Review Date', d.next_review_date ? Utils.formatDate(d.next_review_date) : '—')}
              ${field('Review Outcome', esc(d.review_outcome || '—'))}
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
              ${field('Assigned Admin', esc(d.assigned_admin_name || '—'))}
              ${field('Created By', esc(d.created_by_name || '—'))}
            </div>
          </div>

          <!-- Risk Changes -->
          <div class="detail-section card">
            <div class="detail-section-title">Risk Changes</div>
            <div class="detail-grid">
              ${field('Changes in Risk Profile', bool(d.changes_in_risk_profile))}
              ${field('Changes in Assets / Exposure', bool(d.changes_in_assets_exposure))}
              ${field('Advice Record Required', bool(d.advice_record_required))}
              ${d.linked_advice_record_id ? field('Linked Advice Record', `<a href="#/advice-records/${d.linked_advice_record_id}">${esc(d.linked_advice_record_number || String(d.linked_advice_record_id))}</a>`) : ''}
            </div>
          </div>

          <!-- Review Notes -->
          ${d.notes ? `
          <div class="detail-section card">
            <div class="detail-section-title">Review Notes</div>
            <p class="detail-notes">${esc(d.notes)}</p>
          </div>` : ''}

          <!-- Findings & Actions -->
          ${(d.gaps_identified || d.recommendations || d.follow_up_actions) ? `
          <div class="detail-section card">
            <div class="detail-section-title">Findings &amp; Actions</div>
            <div class="detail-text-fields">
              ${d.gaps_identified   ? `<div class="detail-text-item"><strong>Gaps Identified</strong><p>${esc(d.gaps_identified)}</p></div>` : ''}
              ${d.recommendations   ? `<div class="detail-text-item"><strong>Recommendations</strong><p>${esc(d.recommendations)}</p></div>` : ''}
              ${d.follow_up_actions ? `<div class="detail-text-item"><strong>Follow-Up Actions</strong><p>${esc(d.follow_up_actions)}</p></div>` : ''}
            </div>
          </div>` : ''}

          <!-- Tabs: Timeline + Documents -->
          <div class="detail-tabs card">
            <div class="tabs-header" id="rev-tabs-header">
              <button class="tab-btn active" data-tab="timeline">Timeline</button>
              <button class="tab-btn"        data-tab="documents">Documents</button>
            </div>
            <div class="tab-content" id="rev-tab-content">
              <div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>
            </div>
          </div>

        </div>
      `;

      loadTab(id, 'timeline');

      document.getElementById('rev-tabs-header').querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#rev-tabs-header .tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          loadTab(id, btn.dataset.tab);
        });
      });

    } catch (err) {
      el.innerHTML = Utils.errorHtml('Failed to load review.', err);
    }
  }

  async function loadTab(reviewId, tab) {
    const tabEl = document.getElementById('rev-tab-content');
    if (!tabEl) return;
    tabEl.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    try {
      switch (tab) {

        case 'timeline': {
          const res  = await Api.admin.auditLog({ module: 'reviews', record_id: reviewId, limit: 100 });
          const rows = res.data || res || [];
          tabEl.innerHTML = rows.length ? `
            <table class="table" style="font-size:.85rem;">
              <thead>
                <tr><th>Date / Time</th><th>User</th><th>Action</th><th>Description</th></tr>
              </thead>
              <tbody>
                ${rows.map(r => `
                  <tr>
                    <td style="white-space:nowrap;">${r.timestamp ? Utils.formatDate(r.timestamp) : '—'}</td>
                    <td>${esc(r.user_full_name || r.user_id || 'System')}</td>
                    <td><span class="badge badge-status">${esc(r.action || '—')}</span></td>
                    <td>${esc(r.description || '—')}</td>
                  </tr>`).join('')}
              </tbody>
            </table>` : `<p class="tab-empty">No timeline entries found.</p>`;
          break;
        }

        case 'documents': {
          const res  = await Api.documents.list('reviews', reviewId);
          const docs = res.data || [];
          tabEl.innerHTML = `
            <div class="tab-toolbar">
              <label class="btn btn-primary btn-sm" for="rev-doc-upload">+ Upload Document</label>
              <input type="file" id="rev-doc-upload" style="display:none;"
                accept=".pdf,.jpg,.jpeg,.png,.docx" />
            </div>
            ${docs.length ? `
            <table class="table">
              <thead><tr><th>File Name</th><th>Type</th><th>Size</th><th>Uploaded By</th><th>Date</th><th></th></tr></thead>
              <tbody>${docs.map(doc => `
                <tr>
                  <td>${esc(doc.original_name)}</td>
                  <td>${esc(doc.file_type)}</td>
                  <td>${Utils.formatBytes(doc.file_size)}</td>
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

          document.getElementById('rev-doc-upload').addEventListener('change', async e => {
            const file = e.target.files[0];
            if (!file) return;
            try {
              await Api.documents.upload('reviews', reviewId, file);
              showToast('Document uploaded.', 'success');
              loadTab(reviewId, 'documents');
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
                loadTab(reviewId, 'documents');
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
