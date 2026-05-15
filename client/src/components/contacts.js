/* ═══════════════════════════════════════════════════════════════════════════
   Contacts component
   ═══════════════════════════════════════════════════════════════════════════ */

const Contacts = (() => {

  // ── Enum option sets ────────────────────────────────────────────────────
  const CONTACT_TYPES    = ['Individual Client', 'Business Contact Person', 'Trustee', 'Member', 'Director', 'Employee Contact', 'Supplier', 'Other'];
  const CLIENT_CATS      = ['Personal Lines', 'Commercial Lines', 'Agri', 'Transport', 'Mixed', 'Supplier', 'Prospect Only'];
  const CLIENT_SEGS      = ['A', 'B', 'C', 'VIP', 'Standard', 'High Risk', 'Strategic'];
  const STATUSES         = ['Prospect', 'Active Client', 'Inactive Client', 'Former Client', 'Do Not Service', 'Deceased', '3rd Party', 'Co-Insured', 'Contact', 'Other'];
  const FICA_STATUSES    = ['Not Started', 'Pending Documents', 'In Review', 'Verified', 'Expired', 'Exempt'];
  const LEAD_SOURCES     = ['Referral', 'Walk-in', 'Existing Client', 'Website', 'Call-in', 'Social Media', 'Broker Initiative', 'Other'];
  const SA_PROVINCES     = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'];

  // ── Shared: load users for broker / admin dropdowns ────────────────────
  async function loadUsers() {
    try {
      const res = await Api.admin.users();
      return res.data || [];
    } catch (_) {
      return [];
    }
  }

  // ── POPIA pill — driven by the POPIA module's computed Green/Amber/Red ─
  function popiaPill(status) {
    if (status === 'Green')  return `<span class="badge badge-success" title="POPIA — all required fields complete">Compliant</span>`;
    if (status === 'Amber')  return `<span class="badge badge-warning" title="POPIA — incomplete fields">Needs Attention</span>`;
    return `<span class="badge badge-danger" title="POPIA — basis missing, retention expired, or pending erasure">Non-Compliant</span>`;
  }

  // ── FICA pill — Verified (green) / Not Verified (red) ──────────────────
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

  // ── Cell renderers (one per catalog column id) ────────────────────────
  const CELL_RENDERERS = {
    name:              c => `<a href="#/contacts/${c.id}">${Utils.esc(`${c.last_name || ''}, ${c.first_name || ''}`)}</a>`,
    contact_type:      c => Utils.esc(c.contact_type || '—'),
    client_category:   c => Utils.esc(c.client_category || '—'),
    client_segment:    c => Utils.esc(c.client_segment || '—'),
    contact_status:    c => `<span class="badge badge-status">${Utils.esc(c.contact_status || '—')}</span>`,
    email:             c => c.email ? `<a href="mailto:${Utils.esc(c.email)}">${Utils.esc(c.email)}</a>` : '—',
    mobile:            c => c.mobile ? `<a href="tel:${Utils.esc(c.mobile)}">${Utils.esc(c.mobile)}</a>` : '—',
    popia:             c => (c.contact_type === 'Supplier' && c.client_category === 'Supplier')
                              ? `<span class="badge badge-secondary" title="Supplier — POPIA not applicable">N/A</span>`
                              : popiaPill(c.popia_status),
    fica_status:       c => (c.contact_type === 'Supplier' && c.client_category === 'Supplier')
                              ? `<span class="badge badge-secondary" title="Supplier — FICA not applicable">N/A</span>`
                              : ficaPill(c.fica_status_derived),
    conduct_risk_flag: c => c.conduct_risk_flag ? '<span style="color:#c0392b;font-weight:600;">⚑ Flagged</span>' : '—',
    broker_full_name:  c => Utils.esc(c.broker_full_name || '—'),
    source_of_lead:    c => Utils.esc(c.source_of_lead || '—'),
    last_review_date:  c => c.last_review_date ? Utils.formatDate(c.last_review_date) : '—',
    next_review_date:  c => c.next_review_date ? Utils.formatDate(c.next_review_date) : '—',
    created_at:        c => c.created_at ? Utils.formatDate(c.created_at) : '—',
    updated_at:        c => c.updated_at ? Utils.formatDate(c.updated_at) : '—',
    actions:           c => `
      <a href="#/contacts/${c.id}"          class="btn btn-sm btn-secondary">View</a>
      <a href="#/contacts/${c.id}/edit"     class="btn btn-sm btn-primary">Edit</a>
      <button class="btn btn-sm btn-danger js-delete" data-id="${c.id}" data-name="${Utils.esc(`${c.last_name || ''}, ${c.first_name || ''}`)}">Delete</button>`,
  };

  let _catalog = null;
  let _config  = null;

  // ════════════════════════════════════════════════════════════════════════
  // LIST
  // ════════════════════════════════════════════════════════════════════════
  async function list(params = {}) {
    setPageTitle('Contacts');
    setBreadcrumb(['Contacts']);
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    try {
      // Load prefs (catalog + user config)
      const prefs = await ViewPrefs.load('contacts');
      _catalog = prefs.catalog;
      _config  = prefs.config;

      // Default the broker filter to the logged-in admin so they land on
      // *their own* contacts first — admins can see everyone but the day-to-day
      // working set is their own book. The dropdown still lets them pick
      // another broker or use the Clear button to show all.
      // Brokers and admin_only roles fall through unchanged: brokers are
      // already broker-isolated server-side; admin_only isn't in the broker
      // dropdown so a self-filter would return zero matches.
      const isAdmin = window.currentUser?.role === 'admin';
      const defaultBroker = (isAdmin && params.broker_id === undefined && window.currentUser?.id)
        ? String(window.currentUser.id)
        : '';

      // Current filter state (sort comes from prefs now)
      let state = {
        search:    params.search    || '',
        status:    params.status    || '',
        category:  params.category  || '',
        broker_id: params.broker_id !== undefined ? params.broker_id : defaultBroker,
        page:      params.page      || 1,
        sort:      _config.sortBy,
        dir:       _config.sortDir,
      };

      const [users, res] = await Promise.all([
        loadUsers(),
        Api.contacts.list(state),
      ]);

      const contacts = res.data  || [];
      const total    = res.total || 0;
      const page     = res.page  || 1;
      const pages    = res.pages || 1;

      const brokers   = users.filter(u => u.role === 'broker' || u.role === 'admin');
      const brokerOps = `<option value="">All Brokers</option>` + brokers.map(u => {
        const sel = String(u.id) === String(state.broker_id) ? ' selected' : '';
        return `<option value="${u.id}"${sel}>${Utils.esc(u.full_name)}</option>`;
      }).join('');

      // Build table from catalog × config
      const visibleCols = ViewPrefs.visibleColumns(_catalog, _config);
      const colCount = visibleCols.length || 1;

      const headCells = visibleCols.map(col => {
        const active = _config.sortBy === col.id;
        const arrow  = active ? (_config.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
        const classes = col.sortable
          ? `class="sortable${active ? ' sort-active' : ''}" data-sort="${col.id}" style="cursor:pointer;"`
          : 'class="not-sortable"';
        return `<th ${classes}>${Utils.esc(col.label)}${arrow}</th>`;
      }).join('');

      const rows = contacts.length
        ? contacts.map(c => `<tr>${visibleCols.map(col => {
            const fn = CELL_RENDERERS[col.id];
            return `<td${col.id === 'actions' ? ' class="table-actions"' : ''}>${fn ? fn(c) : Utils.esc(String(c[col.id] ?? '—'))}</td>`;
          }).join('')}</tr>`).join('')
        : `<tr><td colspan="${colCount}" class="table-empty">No contacts found.</td></tr>`;

      el.innerHTML = `
        <div class="list-view">

          <!-- Summary -->
          <div class="list-summary">${total} contact${total !== 1 ? 's' : ''} found</div>

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

      // ── Header actions: + New Contact and ⚙ Columns ────────────────────
      const ctrlStyle = 'height:28px;padding:.15rem .4rem;font-size:.78rem;line-height:1;';
      const headerActions = document.getElementById('header-actions');
      if (headerActions) {
        headerActions.innerHTML = `<a href="#/contacts/new" class="btn btn-primary" style="${ctrlStyle}">+ New Contact</a>`;
      }

      // Absolutely-centered filter strip in the top header. Tagged
      // data-header-widget so the router auto-removes it on navigation.
      document.getElementById('contacts-center-filters')?.remove();
      const topHeader = document.getElementById('top-header');
      if (topHeader) {
        topHeader.style.position = 'relative';
        const wrap = document.createElement('div');
        wrap.id = 'contacts-center-filters';
        wrap.setAttribute('data-header-widget', '1');
        wrap.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;gap:.5rem;align-items:center;z-index:2;background:var(--bg);padding:.3rem .55rem;border-radius:6px;';
        wrap.innerHTML = `
          <input type="search" id="contacts-search" class="form-control" placeholder="Search…"
            value="${Utils.esc(state.search)}"
            style="${ctrlStyle}width:160px;">
          <select id="filter-status" class="form-control" style="${ctrlStyle}max-width:140px;">
            <option value="">Status</option>
            ${opts(STATUSES, state.status, '')}
          </select>
          <select id="filter-category" class="form-control" style="${ctrlStyle}max-width:140px;">
            <option value="">Category</option>
            ${opts(CLIENT_CATS, state.category, '')}
          </select>
          <select id="filter-broker" class="form-control" style="${ctrlStyle}max-width:140px;">
            ${brokerOps.replace('All Brokers', 'Broker')}
          </select>
          <button id="contacts-filter-clear" class="btn btn-secondary" style="${ctrlStyle}">Clear</button>`;
        topHeader.appendChild(wrap);
      }
      ViewPrefs.attachButton({
        moduleKey: 'contacts',
        catalog:   _catalog,
        current:   _config,
        onChange:  (newCfg) => { _config = newCfg; list(state); },
      });

      // ── Event wiring ───────────────────────────────────────────────────
      let searchTimer;
      document.getElementById('contacts-search').addEventListener('input', e => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          state.search = e.target.value;
          state.page   = 1;
          list(state);
        }, 350);
      });

      ['filter-status', 'filter-category', 'filter-broker'].forEach(id => {
        document.getElementById(id).addEventListener('change', e => {
          const key = { 'filter-status': 'status', 'filter-category': 'category', 'filter-broker': 'broker_id' }[id];
          state[key] = e.target.value;
          state.page = 1;
          list(state);
        });
      });

      const contactsClearEl = document.getElementById('contacts-filter-clear');
      if (contactsClearEl) {
        contactsClearEl.addEventListener('click', () => {
          list({ search: '', status: '', category: '', broker_id: '', page: 1 });
        });
      }

      el.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', async () => {
          const col = th.dataset.sort;
          if (_config.sortBy === col) {
            _config.sortDir = _config.sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            _config.sortBy = col;
            _config.sortDir = 'asc';
          }
          try { const r = await Api.viewPrefs.save('contacts', _config); _config = r.config; } catch (_) {}
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
          if (!confirm(`Delete contact "${name}"? This cannot be undone.`)) return;
          try {
            await Api.contacts.delete(id);
            showToast('Contact deleted.', 'success');
            list(state);
          } catch (err) {
            showToast('Failed to delete contact: ' + (err.message || err), 'error');
          }
        });
      });

    } catch (err) {
      el.innerHTML = Utils.errorHtml('Failed to load contacts.', err);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // FORM (new / edit)
  // ════════════════════════════════════════════════════════════════════════
  async function form(id = null) {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    try {
      const [users, accountsRes, contact] = await Promise.all([
        loadUsers(),
        Api.accounts.list({ limit: 200 }),
        id ? Api.contacts.get(id) : Promise.resolve(null),
      ]);

      const c       = contact || {};
      const isEdit  = !!id;
      const title   = isEdit
        ? `Edit Contact: ${Utils.esc(c.first_name + ' ' + c.last_name)}`
        : 'New Contact';

      const brokers  = users.filter(u => u.role === 'broker' || u.role === 'admin');
      const admins   = users.filter(u => u.role === 'admin'  || u.role === 'admin_only');
      const accounts = (accountsRes.data || []);

      // Update header title
      const headerTitle = document.getElementById('header-title');
      if (headerTitle) headerTitle.textContent = isEdit ? 'Edit Contact' : 'New Contact';

      // Clear header actions
      const headerActions = document.getElementById('header-actions');
      if (headerActions) headerActions.innerHTML = '';

      el.innerHTML = `
        <div class="form-view">
          <div class="form-view-header">
            <h2 class="form-view-title">${title}</h2>
          </div>

          <form id="contact-form" novalidate>

            <!-- 1. Personal Details -->
            <div class="form-section card">
              <div class="form-section-title">Personal Details</div>
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label required">First Name</label>
                  <input type="text" class="form-control" name="first_name"
                    value="${Utils.esc(c.first_name || '')}" required />
                  <span class="field-error" data-field="first_name"></span>
                </div>
                <div class="form-group">
                  <label class="form-label required">Last Name</label>
                  <input type="text" class="form-control" name="last_name"
                    value="${Utils.esc(c.last_name || '')}" required />
                  <span class="field-error" data-field="last_name"></span>
                </div>
                <div class="form-group">
                  <label class="form-label">Email</label>
                  <input type="email" class="form-control" name="email"
                    value="${Utils.esc(c.email || '')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Mobile</label>
                  <input type="tel" class="form-control" name="mobile"
                    value="${Utils.esc(c.mobile || '')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Work Number</label>
                  <input type="tel" class="form-control" name="work_number"
                    value="${Utils.esc(c.work_number || '')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Date of Birth</label>
                  <input type="date" class="form-control" name="date_of_birth"
                    value="${Utils.esc(c.date_of_birth || '')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">SA ID Number</label>
                  <input type="text" class="form-control" name="sa_id_number"
                    value="${Utils.esc(c.sa_id_number || '')}" maxlength="13" />
                </div>
                <div class="form-group">
                  <label class="form-label">Title</label>
                  <input type="text" class="form-control" name="title"
                    value="${Utils.esc(c.title || '')}" placeholder="e.g. Mr, Mrs, Ms, Dr" />
                </div>
                <div class="form-group">
                  <label class="form-label">Gender</label>
                  <select class="form-control" name="gender">
                    <option value="">— Select —</option>
                    ${['Male','Female'].map(v => `<option value="${v}" ${c.gender === v ? 'selected' : ''}>${v}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Language</label>
                  <input type="text" class="form-control" name="language"
                    value="${Utils.esc(c.language || '')}" placeholder="e.g. English, Afrikaans" />
                </div>
                <div class="form-group">
                  <label class="form-label">Marital Status</label>
                  <select class="form-control" name="marital_status">
                    <option value="">— Select —</option>
                    ${['Married','Single','Divorced','Widow'].map(v => `<option value="${v}" ${c.marital_status === v ? 'selected' : ''}>${v}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Occupation</label>
                  <input type="text" class="form-control" name="occupation"
                    value="${Utils.esc(c.occupation || '')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Employer</label>
                  <input type="text" class="form-control" name="employer"
                    value="${Utils.esc(c.employer || '')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Income Band</label>
                  <select class="form-control" name="income_band">
                    <option value="">— Select —</option>
                    ${['R0 - R10 000','R10 000 - R25 000','R25 000 - R50 000','R50 000 - R75 000','R75 000+'].map(v => `<option value="${v}" ${c.income_band === v ? 'selected' : ''}>${v}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Nationality</label>
                  <input type="text" class="form-control" name="nationality"
                    value="${Utils.esc(c.nationality || '')}" placeholder="e.g. South African" />
                </div>
                <div class="form-group">
                  <label class="form-label">Passport Number</label>
                  <input type="text" class="form-control" name="passport_number"
                    value="${Utils.esc(c.passport_number || '')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Alternative ID Type</label>
                  <input type="text" class="form-control" name="alternative_id_type"
                    value="${Utils.esc(c.alternative_id_type || '')}" placeholder="e.g. Passport, Refugee ID" />
                </div>
                <div class="form-group">
                  <label class="form-label">Next of Kin</label>
                  <input type="text" class="form-control" name="next_of_kin"
                    value="${Utils.esc(c.next_of_kin || '')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Preferred Communication</label>
                  <select class="form-control" name="preferred_communication">
                    <option value="">— Select —</option>
                    ${['Email','Mobile','Work'].map(v => `<option value="${v}" ${c.preferred_communication === v ? 'selected' : ''}>${v}</option>`).join('')}
                  </select>
                </div>
              </div>
            </div>

            <!-- 1b. Drivers License -->
            <div class="form-section card">
              <div class="form-section-title">Drivers License</div>
              <div class="form-grid form-grid-2">
                <div class="form-group" style="grid-column:1/-1;">
                  <label class="form-label">Code <span style="font-weight:400;color:var(--text-muted);font-size:.75rem;">(select all that apply)</span></label>
                  <div style="display:flex;flex-wrap:wrap;gap:.75rem;padding:.25rem 0;">
                    ${(() => {
                      const codes = ['A','A1','B','EB','C1','C','EC1','EC'];
                      const sel = (c.dl_codes || '').split(',').map(s => s.trim()).filter(Boolean);
                      return codes.map(code => `
                        <label style="display:inline-flex;align-items:center;gap:.3rem;margin:0;font-weight:500;">
                          <input type="checkbox" class="dl-code-check" value="${code}"
                            ${sel.includes(code) ? 'checked' : ''} />
                          ${code}
                        </label>`).join('');
                    })()}
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Restrictions</label>
                  <input type="text" class="form-control" name="dl_restrictions"
                    value="${Utils.esc(c.dl_restrictions || '')}" placeholder="e.g. Glasses required" />
                </div>
                <div class="form-group">
                  <label class="form-label">First Issue Date</label>
                  <input type="date" class="form-control" name="dl_first_issue_date"
                    value="${Utils.esc(c.dl_first_issue_date ? String(c.dl_first_issue_date).slice(0,10) : '')}" />
                </div>
              </div>
            </div>

            <!-- 2. Classification -->
            <div class="form-section card">
              <div class="form-section-title">Classification</div>
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label required">Contact Type</label>
                  <select class="form-control" name="contact_type" required>
                    ${opts(CONTACT_TYPES, c.contact_type)}
                  </select>
                  <span class="field-error" data-field="contact_type"></span>
                </div>
                <div class="form-group">
                  <label class="form-label required">Client Category</label>
                  <select class="form-control" name="client_category" required>
                    ${opts(CLIENT_CATS, c.client_category)}
                  </select>
                  <span class="field-error" data-field="client_category"></span>
                </div>
                <div class="form-group">
                  <label class="form-label">Client Segment</label>
                  <select class="form-control" name="client_segment">
                    ${opts(CLIENT_SEGS, c.client_segment)}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label required">Contact Status</label>
                  <select class="form-control" name="contact_status" required>
                    ${opts(STATUSES, c.contact_status)}
                  </select>
                  <span class="field-error" data-field="contact_status"></span>
                </div>
                <div class="form-group form-group-checkbox">
                  <label class="form-label">
                    <input type="checkbox" name="existing_client" value="1"
                      ${c.existing_client ? 'checked' : ''} />
                    Existing Client
                  </label>
                </div>
                <div class="form-group">
                  <label class="form-label">Date Became Client</label>
                  <input type="date" class="form-control" name="date_became_client"
                    value="${Utils.esc(c.date_became_client || '')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Source of Lead</label>
                  <select class="form-control" name="source_of_lead">
                    ${opts(LEAD_SOURCES, c.source_of_lead)}
                  </select>
                </div>
              </div>
            </div>

            <!-- 3. Compliance -->
            <div class="form-section card compliance-section">
              <div class="form-section-title">Compliance</div>
              <div class="form-grid form-grid-2">
                <div class="form-group compliance-field">
                  <label class="form-label">
                    <input type="checkbox" name="popia_consent_obtained" value="1"
                      ${c.popia_consent_obtained ? 'checked' : ''} />
                    POPIA Consent Obtained
                  </label>
                </div>
                <div class="form-group compliance-field">
                  <label class="form-label">POPIA Consent Date</label>
                  <input type="date" class="form-control" name="popia_consent_date"
                    value="${Utils.esc(c.popia_consent_date || '')}" />
                </div>
                <div class="form-group compliance-field">
                  <label class="form-label required">FICA Status</label>
                  <select class="form-control" name="fica_status" required>
                    ${opts(FICA_STATUSES, c.fica_status)}
                  </select>
                  <span class="field-error" data-field="fica_status"></span>
                </div>
              </div>
            </div>

            <!-- 4. Assignments -->
            <div class="form-section card">
              <div class="form-section-title">Assignments</div>
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label required">Assigned Broker</label>
                  <select class="form-control" name="assigned_broker_id" required>
                    ${userOpts(brokers, c.assigned_broker_id)}
                  </select>
                  <span class="field-error" data-field="assigned_broker_id"></span>
                </div>
                <div class="form-group">
                  <label class="form-label">Assigned Admin</label>
                  <select class="form-control" name="assigned_admin_id">
                    ${userOpts(admins, c.assigned_admin_id)}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Related Account</label>
                  <select class="form-control" name="related_account_id">
                    <option value="">— None —</option>
                    ${accounts.map(a => {
                      const sel = String(a.id) === String(c.related_account_id) ? ' selected' : '';
                      return `<option value="${a.id}"${sel}>${Utils.esc(a.account_name)}</option>`;
                    }).join('')}
                  </select>
                </div>
              </div>
            </div>

            <!-- 5. Flags -->
            <div class="form-section card">
              <div class="form-section-title">Flags</div>
              <div class="form-grid form-grid-2">
                <div class="form-group form-group-checkbox">
                  <label class="form-label">
                    <input type="checkbox" name="conduct_risk_flag" value="1"
                      ${c.conduct_risk_flag ? 'checked' : ''} />
                    Conduct Risk Flag
                  </label>
                </div>
                <div class="form-group form-group-checkbox">
                  <label class="form-label">
                    <input type="checkbox" name="primary_client_record" value="1"
                      ${c.primary_client_record !== 0 ? 'checked' : ''} />
                    Primary Client Record
                  </label>
                </div>
                <div class="form-group form-grid-full">
                  <label class="form-label">Conduct Risk Notes</label>
                  <textarea class="form-control" name="conduct_risk_notes" rows="3">${Utils.esc(c.conduct_risk_notes || '')}</textarea>
                </div>
              </div>
            </div>

            <!-- 6. Reviews -->
            <div class="form-section card">
              <div class="form-section-title">Reviews</div>
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label class="form-label">Last Review Date</label>
                  <input type="date" class="form-control" name="last_review_date"
                    value="${Utils.esc(c.last_review_date || '')}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Next Review Date</label>
                  <input type="date" class="form-control" name="next_review_date"
                    value="${Utils.esc(c.next_review_date || '')}" />
                </div>
              </div>
            </div>

            <!-- 7. Physical Address -->
            <div class="form-section card">
              <div class="form-section-title" style="display:flex;align-items:center;gap:.5rem;">
                Physical Address
                <button type="button" class="btn btn-secondary btn-sm" style="margin-left:auto;font-size:.75rem;"
                  data-maps-from="phys" title="Open address in Google Maps">📍 Open in Google Maps</button>
                <button type="button" class="btn btn-secondary btn-sm" style="font-size:.75rem;"
                  data-maps-from-gps="phys" title="Open GPS coords in Google Maps">🌐 Open GPS</button>
              </div>
              <div class="form-grid form-grid-2">
                <div class="form-group"><label class="form-label">Street Address</label><input type="text" class="form-control" name="phys_street_address" value="${Utils.esc(c.phys_street_address || '')}" /></div>
                <div class="form-group"><label class="form-label">Complex / Building</label><input type="text" class="form-control" name="phys_complex_building" value="${Utils.esc(c.phys_complex_building || '')}" /></div>
                <div class="form-group"><label class="form-label">Suburb</label><input type="text" class="form-control" name="phys_suburb" value="${Utils.esc(c.phys_suburb || '')}" /></div>
                <div class="form-group"><label class="form-label">City</label><input type="text" class="form-control" name="phys_city" value="${Utils.esc(c.phys_city || '')}" /></div>
                <div class="form-group"><label class="form-label">Province</label><select class="form-control" name="phys_province"><option value="">— Select —</option>${SA_PROVINCES.map(p => `<option value="${p}" ${c.phys_province === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
                <div class="form-group"><label class="form-label">Postal Code</label><input type="text" class="form-control" name="phys_postal_code" value="${Utils.esc(c.phys_postal_code || '')}" /></div>
                <div class="form-group"><label class="form-label">Country</label><input type="text" class="form-control" name="phys_country" value="${Utils.esc(c.phys_country || 'South Africa')}" /></div>
                <div class="form-group"><label class="form-label">GPS Latitude</label><input type="text" class="form-control" name="phys_gps_lat" value="${Utils.esc(c.phys_gps_lat || '')}" placeholder="e.g. -25.7461" /></div>
                <div class="form-group"><label class="form-label">GPS Longitude</label><input type="text" class="form-control" name="phys_gps_lng" value="${Utils.esc(c.phys_gps_lng || '')}" placeholder="e.g. 28.1881" /></div>
              </div>
            </div>

            <!-- 7b. Postal Address -->
            <div class="form-section card">
              <div class="form-section-title">Postal Address</div>
              <div class="form-grid form-grid-2">
                <div class="form-group"><label class="form-label">Street Address</label><input type="text" class="form-control" name="post_street_address" value="${Utils.esc(c.post_street_address || '')}" /></div>
                <div class="form-group"><label class="form-label">Complex / Building</label><input type="text" class="form-control" name="post_complex_building" value="${Utils.esc(c.post_complex_building || '')}" /></div>
                <div class="form-group"><label class="form-label">Suburb</label><input type="text" class="form-control" name="post_suburb" value="${Utils.esc(c.post_suburb || '')}" /></div>
                <div class="form-group"><label class="form-label">City</label><input type="text" class="form-control" name="post_city" value="${Utils.esc(c.post_city || '')}" /></div>
                <div class="form-group"><label class="form-label">Province</label><select class="form-control" name="post_province"><option value="">— Select —</option>${SA_PROVINCES.map(p => `<option value="${p}" ${c.post_province === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
                <div class="form-group"><label class="form-label">Postal Code</label><input type="text" class="form-control" name="post_postal_code" value="${Utils.esc(c.post_postal_code || '')}" /></div>
                <div class="form-group"><label class="form-label">Country</label><input type="text" class="form-control" name="post_country" value="${Utils.esc(c.post_country || 'South Africa')}" /></div>
              </div>
            </div>

            <!-- 8. Notes -->
            <div class="form-section card">
              <div class="form-section-title">Notes</div>
              <div class="form-group">
                <textarea class="form-control" name="notes" rows="4">${Utils.esc(c.notes || '')}</textarea>
              </div>
            </div>

            <!-- Form Actions -->
            <div class="form-actions">
              <button type="submit" class="btn btn-primary" id="contact-save-btn">
                ${isEdit ? 'Save Changes' : 'Create Contact'}
              </button>
              <button type="button" class="btn btn-outline" id="contact-cancel-btn">Cancel</button>
            </div>

          </form>
        </div>
      `;

      // ── Cancel ──────────────────────────────────────────────────────────
      document.getElementById('contact-cancel-btn').addEventListener('click', () => {
        navigate(id ? `contacts/${id}` : 'contacts');
      });

      // ── Google Maps shortcuts (per-section: phys / post) ────────────────
      el.querySelectorAll('[data-maps-from]').forEach(btn => {
        btn.addEventListener('click', () => {
          const prefix = btn.dataset.mapsFrom;
          const f = el.querySelector('#contact-form');
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
          const f = el.querySelector('#contact-form');
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
      document.getElementById('contact-form').addEventListener('submit', async e => {
        e.preventDefault();
        clearErrors(el);

        const data    = collectForm(e.target);
        const errors  = validateContact(data);
        if (errors.length) {
          showErrors(el, errors);
          return;
        }

        const btn = document.getElementById('contact-save-btn');
        btn.disabled    = true;
        btn.textContent = 'Saving…';

        try {
          if (isEdit) {
            await Api.contacts.update(id, data);
            showToast('Contact updated successfully.', 'success');
            navigate(`contacts/${id}`);
          } else {
            const created = await Api.contacts.create(data);
            showToast('Contact created successfully.', 'success');
            navigate(`contacts/${created.id}`);
          }
        } catch (err) {
          btn.disabled    = false;
          btn.textContent = isEdit ? 'Save Changes' : 'Create Contact';
          showToast('Save failed: ' + (err.message || 'Unknown error'), 'error');
        }
      });

    } catch (err) {
      el.innerHTML = Utils.errorHtml('Failed to load contact form.', err);
    }
  }

  // ── Collect form data to plain object ──────────────────────────────────
  function collectForm(formEl) {
    const fd  = new FormData(formEl);
    const out = {};
    for (const [k, v] of fd.entries()) {
      out[k] = v;
    }
    // Checkboxes — default to 0 if unchecked
    ['existing_client', 'popia_consent_obtained', 'conduct_risk_flag', 'primary_client_record'].forEach(k => {
      out[k] = out[k] === '1' ? 1 : 0;
    });
    // Drivers license codes — collect checked values into comma-separated string
    const dlCodes = Array.from(formEl.querySelectorAll('.dl-code-check:checked'))
      .map(cb => cb.value);
    out.dl_codes = dlCodes.length ? dlCodes.join(',') : null;
    return out;
  }

  // ── Client-side validation ──────────────────────────────────────────────
  function validateContact(data) {
    const errors = [];
    const isSupplier = data.contact_type === 'Supplier' && data.client_category === 'Supplier';
    if (!data.first_name)          errors.push({ field: 'first_name',          msg: 'First name is required.' });
    if (!data.last_name)           errors.push({ field: 'last_name',           msg: 'Last name is required.' });
    if (!data.contact_type)        errors.push({ field: 'contact_type',        msg: 'Contact type is required.' });
    if (!data.client_category)     errors.push({ field: 'client_category',     msg: 'Client category is required.' });
    if (!data.contact_status)      errors.push({ field: 'contact_status',      msg: 'Contact status is required.' });
    // FICA does not apply to suppliers (panel-beaters, assessors, etc.)
    if (!isSupplier && !data.fica_status) errors.push({ field: 'fica_status',  msg: 'FICA status is required.' });
    if (!data.assigned_broker_id)  errors.push({ field: 'assigned_broker_id',  msg: 'Assigned broker is required.' });
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
    // Scroll to first error
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
      const c = await Api.contacts.get(id);

      // Update header
      const headerTitle = document.getElementById('header-title');
      if (headerTitle) headerTitle.textContent = `${c.first_name} ${c.last_name}`;

      const headerActions = document.getElementById('header-actions');
      if (headerActions) {
        headerActions.innerHTML = `
          <a href="#/schedule/contact/${id}" class="btn btn-secondary">📋 Policy Schedule</a>
          <button class="btn btn-secondary" onclick="Contacts._openMailModal(${id})">📧 Email</button>
          <a href="#/contacts/${id}/edit" class="btn btn-primary">Edit</a>`;
      }

      // ── Read-only field helper ─────────────────────────────────────────
      // If `value` is already an HTML string (starts with '<'), render it raw —
      // this lets callers pass interactive widgets like EncryptedField without
      // the helper double-escaping their markup.
      const field = (label, value, isCompliance = false) => {
        const cls = isCompliance ? ' compliance-field' : '';
        const isHtml = typeof value === 'string' && value.trim().startsWith('<');
        const inner = isHtml ? value : Utils.esc(value || '—');
        return `
          <div class="detail-field${cls}">
            <span class="detail-label">${label}</span>
            <span class="detail-value">${inner}</span>
          </div>`;
      };

      // Open complaint count for the red badge (loaded async — non-blocking)
      const _openComplaintsBadgeId = `open-complaints-badge-${id}`;
      Api.complaints.list({ contact_id: id, limit: 200 }).then(res => {
        const rows = res.data || res || [];
        const open = rows.filter(r => !['Resolved','Closed'].includes(r.complaint_status) && !r.withdrawn).length;
        const slot = document.getElementById(_openComplaintsBadgeId);
        if (slot && open > 0) {
          slot.innerHTML = `<a href="#/complaints?contact_id=${id}" style="display:inline-block;background:#dc3545;color:#fff;padding:.15rem .55rem;border-radius:999px;font-size:.78rem;font-weight:600;text-decoration:none;margin-left:.5rem;" title="${open} open complaint${open === 1 ? '' : 's'}">⚠ ${open} open complaint${open === 1 ? '' : 's'}</a>`;
        }
      }).catch(() => {});

      // ── Compliance banners (FICA + POPIA) ──
      // Suppliers (panel-beaters, assessors, etc.) are not data subjects under
      // POPIA/FICA — suppress all compliance flags and banners on their record.
      const _isSupplier = c.contact_type === 'Supplier' && c.client_category === 'Supplier';
      const _today = new Date().toISOString().slice(0, 10);
      const _ficaBad = !_isSupplier && (!c.fica_status
        || c.fica_status === 'Not Started' || c.fica_status === 'Pending Documents'
        || c.fica_status === 'In Review'   || c.fica_status === 'Expired'
        || (c.fica_five_year_expiry && c.fica_five_year_expiry < _today));
      const _popiaBad = !_isSupplier && (!c.data_processing_basis
        || (c.retention_expiry_date && c.retention_expiry_date < _today)
        || (c.data_processing_basis === 'Consent' && (!c.popia_consent_date || !c.consent_method)));
      const _bannerHtml = (_ficaBad || _popiaBad) ? `
        <div style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:1rem;">
          ${_ficaBad ? `
            <div class="alert alert-danger" style="padding:.75rem 1rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;">
              <div>
                <strong>⚠ FICA Not Verified</strong> — This contact lacks a valid FICA verification (FICA s23).
                Verification records must be retained for at least 5 years.
              </div>
              <a href="#/fica/${c.id}" class="btn btn-sm btn-light" style="background:#fff;color:#a71d2a;font-weight:600;white-space:nowrap;">Open FICA →</a>
            </div>` : ''}
          ${_popiaBad ? `
            <div class="alert alert-danger" style="padding:.75rem 1rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;">
              <div>
                <strong>⚠ POPIA Incomplete</strong> — ${!c.data_processing_basis ? 'Data Processing Basis is missing.' : (c.retention_expiry_date && c.retention_expiry_date < _today) ? 'Retention period has expired.' : 'Consent date / method is missing.'}
              </div>
              <a href="#/popia/${c.id}" class="btn btn-sm btn-light" style="background:#fff;color:#a71d2a;font-weight:600;white-space:nowrap;">Open POPIA →</a>
            </div>` : ''}
        </div>` : '';

      el.innerHTML = `
        <div class="detail-view">

          ${_bannerHtml}

          <!-- Personal Details -->
          <div class="detail-section card">
            <div class="detail-section-title">Personal Details
              <span id="${_openComplaintsBadgeId}"></span>
            </div>
            <div class="detail-grid">
              ${field('Title',        c.title)}
              ${field('First Name',   c.first_name)}
              ${field('Last Name',    c.last_name)}
              ${field('Gender',       c.gender)}
              ${field('Email',        c.email)}
              ${field('Mobile',       c.mobile)}
              ${field('Work Number',  c.work_number)}
              ${field('Date of Birth',c.date_of_birth ? Utils.formatDate(c.date_of_birth) : null)}
              ${field('SA ID Number', c.sa_id_number_encrypted
                ? EncryptedField.render({ module:'contacts', recordId:c.id, field:'sa_id_number', masked:c.sa_id_number, label:'SA ID Number' })
                : c.sa_id_number)}
              ${field('Passport Number', c.passport_number_encrypted
                ? EncryptedField.render({ module:'contacts', recordId:c.id, field:'passport_number', masked:c.passport_number, label:'Passport Number' })
                : c.passport_number)}
              ${field('Alternative ID Type', c.alternative_id_type)}
              ${field('Language',     c.language)}
              ${field('Marital Status', c.marital_status)}
              ${field('Occupation',   c.occupation)}
              ${field('Employer',     c.employer)}
              ${field('Income Band',  c.income_band)}
              ${field('Nationality',  c.nationality)}
              ${field('Next of Kin',  c.next_of_kin)}
              ${field('Preferred Communication', c.preferred_communication)}
            </div>
          </div>

          <!-- Drivers License -->
          ${(c.dl_codes || c.dl_restrictions || c.dl_first_issue_date) ? `
          <div class="detail-section card">
            <div class="detail-section-title">Drivers License</div>
            <div class="detail-grid">
              ${field('Code', c.dl_codes)}
              ${field('Restrictions', c.dl_restrictions)}
              ${field('First Issue Date', c.dl_first_issue_date ? Utils.formatDate(c.dl_first_issue_date) : null)}
            </div>
          </div>` : ''}

          <!-- Classification -->
          <div class="detail-section card">
            <div class="detail-section-title">Classification</div>
            <div class="detail-grid">
              ${field('Contact Type',      c.contact_type)}
              ${field('Client Category',   c.client_category)}
              ${field('Client Segment',    c.client_segment)}
              ${field('Contact Status',    c.contact_status)}
              ${field('Existing Client',   c.existing_client ? 'Yes' : 'No')}
              ${field('Date Became Client',c.date_became_client ? Utils.formatDate(c.date_became_client) : null)}
              ${field('Source of Lead',    c.source_of_lead)}
            </div>
          </div>

          <!-- Compliance snapshot — full records live in the POPIA / FICA modules -->
          ${_isSupplier ? `
          <div class="detail-section card compliance-section">
            <div class="detail-section-title">Compliance Snapshot</div>
            <div class="alert alert-info" style="margin:0;font-size:.85rem;">
              This contact is classified as a <strong>Supplier</strong>. POPIA and FICA do not apply — supplier records are excluded from compliance reporting.
            </div>
          </div>
          ` : `
          ${(() => {
            // Tri-state POPIA status (mirrors server computePopiaStatus)
            const today = new Date().toISOString().slice(0, 10);
            const retentionExpired = c.retention_expiry_date && c.retention_expiry_date < today;
            const hasBasis      = !!c.data_processing_basis;
            const consentOk     = c.data_processing_basis === 'Consent'
              ? !!(c.popia_consent_date && c.consent_method)
              : true;
            const hasSource     = !!c.data_source;
            const hasCategories = !!(c.data_categories_held && c.data_categories_held !== '[]');
            const hasIO         = !!c.information_officer_id;
            const hasNotice     = !!c.privacy_notice_provided;
            let popiaStatus = 'amber';
            if (retentionExpired || !hasBasis) popiaStatus = 'red';
            else if (hasBasis && consentOk && hasSource && hasCategories && hasIO && hasNotice) popiaStatus = 'green';
            const popiaImg = popiaStatus === 'green' ? '/popia.jpg'
                          : popiaStatus === 'amber' ? '/popia_amber.jpg'
                          : '/popia_red.jpg';
            const popiaTitle = popiaStatus === 'green' ? 'POPIA — Compliant'
                           : popiaStatus === 'amber' ? 'POPIA — Incomplete fields'
                           : 'POPIA — Consent missing or retention expired';
            window.__popiaSnapshotImg = `<img src="${popiaImg}" alt="${popiaTitle}" title="${popiaTitle}" style="position:absolute;top:.5rem;right:.5rem;width:64px;height:auto;opacity:.95;">`;
            return '';
          })()}
          <div class="detail-section card compliance-section" style="position:relative;">
            ${window.__popiaSnapshotImg || ''}
            <div class="detail-section-title">Compliance Snapshot</div>
            <div class="detail-grid">
              <div class="detail-field compliance-field">
                <span class="detail-label">POPIA</span>
                <span class="detail-value">${popiaPill(c.popia_status)}</span>
              </div>
              ${field('POPIA Consent Date', c.popia_consent_date ? Utils.formatDate(c.popia_consent_date) : null, true)}
              <div class="detail-field compliance-field">
                <span class="detail-label">Data Processing Basis</span>
                <span class="detail-value">${Utils.esc(c.data_processing_basis || '— missing —')}</span>
              </div>
              <div class="detail-field compliance-field">
                <span class="detail-label">FICA</span>
                <span class="detail-value">${ficaPill(c.fica_status_derived)}</span>
              </div>
            </div>
            ${!c.data_processing_basis ? `
              <div class="alert alert-warning" style="margin-top:.5rem;font-size:.82rem;">
                ⚠ POPIA: a Data Processing Basis is required before this contact can be set to Active Client.
              </div>` : ''}
            <div style="margin-top:.75rem;display:flex;gap:.5rem;flex-wrap:wrap;">
              <a href="#/popia/${c.id}" class="btn btn-sm btn-outline">Open POPIA Record →</a>
              <a href="#/fica/${c.id}"  class="btn btn-sm btn-outline">Open FICA Record →</a>
            </div>
          </div>
          `}

          <!-- Assignments -->
          <div class="detail-section card">
            <div class="detail-section-title">Assignments</div>
            <div class="detail-grid">
              ${field('Assigned Broker', c.broker_full_name)}
              ${field('Assigned Admin',  c.admin_full_name)}
              ${field('Related Account', c.related_account_id ? `#${c.related_account_id}` : null)}
            </div>
          </div>

          <!-- Flags -->
          <div class="detail-section card">
            <div class="detail-section-title">Flags</div>
            <div class="detail-grid">
              ${field('Conduct Risk Flag',   c.conduct_risk_flag      ? 'Yes' : 'No')}
              ${field('Primary Client Rec.', c.primary_client_record  ? 'Yes' : 'No')}
              ${field('Conduct Risk Notes',  c.conduct_risk_notes)}
            </div>
          </div>

          <!-- Reviews -->
          <div class="detail-section card">
            <div class="detail-section-title">Reviews</div>
            <div class="detail-grid">
              ${field('Last Review Date', c.last_review_date ? Utils.formatDate(c.last_review_date) : null)}
              ${field('Next Review Date', c.next_review_date ? Utils.formatDate(c.next_review_date) : null)}
            </div>
          </div>

          <!-- Physical Address -->
          <div class="detail-section card">
            <div class="detail-section-title" style="display:flex;align-items:center;gap:.5rem;">
              Physical Address
              ${(() => {
                const addrParts = [c.phys_street_address, c.phys_complex_building, c.phys_suburb, c.phys_city, c.phys_province, c.phys_postal_code, c.phys_country].filter(Boolean);
                const addrUrl = addrParts.length ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrParts.join(', '))}` : null;
                const gpsUrl  = (c.phys_gps_lat && c.phys_gps_lng) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.phys_gps_lat + ',' + c.phys_gps_lng)}` : null;
                return `
                  ${addrUrl ? `<a href="${addrUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="margin-left:auto;font-size:.75rem;">📍 Open in Google Maps</a>` : ''}
                  ${gpsUrl  ? `<a href="${gpsUrl}"  target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="${addrUrl ? '' : 'margin-left:auto;'}font-size:.75rem;">🌐 Open GPS</a>` : ''}`;
              })()}
            </div>
            <div class="detail-grid">
              ${field('Street Address',    c.phys_street_address)}
              ${field('Complex / Building',c.phys_complex_building)}
              ${field('Suburb',            c.phys_suburb)}
              ${field('City',              c.phys_city)}
              ${field('Province',          c.phys_province)}
              ${field('Postal Code',       c.phys_postal_code)}
              ${field('Country',           c.phys_country)}
              ${field('GPS Latitude',      c.phys_gps_lat)}
              ${field('GPS Longitude',     c.phys_gps_lng)}
            </div>
          </div>

          <!-- Postal Address -->
          <div class="detail-section card">
            <div class="detail-section-title">Postal Address</div>
            <div class="detail-grid">
              ${field('Street Address',    c.post_street_address)}
              ${field('Complex / Building',c.post_complex_building)}
              ${field('Suburb',            c.post_suburb)}
              ${field('City',              c.post_city)}
              ${field('Province',          c.post_province)}
              ${field('Postal Code',       c.post_postal_code)}
              ${field('Country',           c.post_country)}
            </div>
          </div>

          <!-- Notes -->
          ${c.notes ? `
          <div class="detail-section card">
            <div class="detail-section-title">Notes</div>
            <div class="detail-notes">${Utils.esc(c.notes)}</div>
          </div>` : ''}

          <!-- Tabs -->
          <div class="detail-tabs card">
            <div class="tabs-header" id="contact-tabs-header">
              <button class="tab-btn active" data-tab="policies">Policies</button>
              <button class="tab-btn"        data-tab="claims">Claims</button>
              <button class="tab-btn"        data-tab="assets">Assets</button>
              <button class="tab-btn"        data-tab="engagements">Engagements</button>
              <button class="tab-btn"        data-tab="reviews">Reviews</button>
              <button class="tab-btn"        data-tab="complaints">Complaints</button>
              <button class="tab-btn"        data-tab="advice-records">Records of Advice</button>
              <button class="tab-btn"        data-tab="sections">Sections</button>
              <button class="tab-btn"        data-tab="documents">Documents</button>
              <button class="tab-btn"        data-tab="timeline">Timeline</button>
            </div>
            <div class="tab-content" id="contact-tab-content">
              <div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>
            </div>
          </div>

        </div><!-- /.detail-view -->
      `;

      // Load default tab
      loadContactTab(id, 'policies');

      // Tab switching
      document.getElementById('contact-tabs-header').querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#contact-tabs-header .tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          loadContactTab(id, btn.dataset.tab);
        });
      });

    } catch (err) {
      el.innerHTML = Utils.errorHtml('Failed to load contact.', err);
    }
  }

  // ── Tab content loader for detail view ─────────────────────────────────
  async function loadContactTab(contactId, tab) {
    const tabEl = document.getElementById('contact-tab-content');
    if (!tabEl) return;
    tabEl.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    try {
      switch (tab) {

        case 'policies': {
          const res = await Api.policies.list({ contact_id: contactId, limit: 50 });
          const rows = (res.data || []);
          tabEl.innerHTML = rows.length ? `
            <table class="table">
              <thead><tr><th>Policy Name</th><th>Number</th><th>Insurer</th><th>Broker Code</th><th>Status</th><th>Renewal</th><th></th></tr></thead>
              <tbody>${rows.map(p => `
                <tr>
                  <td><a href="#/policies/${p.id}">${Utils.esc(p.policy_name || '—')}</a></td>
                  <td>${Utils.esc(p.policy_number || '—')}</td>
                  <td>${Utils.esc(p.insurer       || '—')}</td>
                  <td title="${Utils.esc(p.broker_code_description_snapshot || '')}">${Utils.esc(p.broker_code_snapshot || '—')}</td>
                  <td><span class="badge badge-status">${Utils.esc(p.policy_status || '—')}</span></td>
                  <td>${p.renewal_date ? Utils.formatDate(p.renewal_date) : '—'}</td>
                  <td><a href="#/policies/${p.id}" class="btn btn-xs btn-outline">View</a></td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No policies linked to this contact.</p>`;
          break;
        }

        case 'claims': {
          const res = await Api.claims.list({ contact_id: contactId, limit: 50 });
          const rows = (res.data || []);
          tabEl.innerHTML = rows.length ? `
            <table class="table">
              <thead><tr><th>Claim Ref</th><th>Type</th><th>Status</th><th>Date</th><th></th></tr></thead>
              <tbody>${rows.map(cl => `
                <tr>
                  <td><a href="#/claims/${cl.id}">${Utils.esc(cl.claim_number || cl.id)}</a></td>
                  <td>${Utils.esc(cl.claim_type   || '—')}</td>
                  <td><span class="badge badge-status">${Utils.esc(cl.claim_status || '—')}</span></td>
                  <td>${cl.claim_date ? Utils.formatDate(cl.claim_date) : '—'}</td>
                  <td><a href="#/claims/${cl.id}" class="btn btn-xs btn-outline">View</a></td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No claims linked to this contact.</p>`;
          break;
        }

        case 'documents': {
          const res = await Api.documents.list({ module: 'contacts', record_id: contactId });
          const docs = (res.data || []);
          tabEl.innerHTML = `
            <div class="tab-toolbar">
              <label class="btn btn-primary btn-sm" for="contact-doc-upload">+ Upload Document</label>
              <input type="file" id="contact-doc-upload" style="display:none;"
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

          // Wire file upload
          document.getElementById('contact-doc-upload').addEventListener('change', async e => {
            const file = e.target.files[0];
            if (!file) return;
            try {
              const fd = new FormData();
              fd.append('file', file);
              fd.append('module', 'contacts');
              fd.append('record_id', contactId);
              await Api.documents.upload(fd);
              showToast('Document uploaded.', 'success');
              loadContactTab(contactId, 'documents');
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
                loadContactTab(contactId, 'documents');
              } catch (err) {
                showToast('Delete failed: ' + (err.message || err), 'error');
              }
            });
          });
          break;
        }

        case 'engagements': {
          const res = await Api.engagements.list({ contact_id: contactId, limit: 50 });
          const rows = (res.data || []);
          tabEl.innerHTML = rows.length ? `
            <table class="table">
              <thead><tr><th>Engagement</th><th>Type</th><th>Stage</th><th>Broker</th><th>Updated</th><th></th></tr></thead>
              <tbody>${rows.map(eng => `
                <tr>
                  <td><a href="#/engagements/${eng.id}">${Utils.esc(eng.engagement_name || '—')}</a></td>
                  <td>${Utils.esc(eng.engagement_type || '—')}</td>
                  <td><span class="badge badge-stage">${Utils.esc(eng.stage || '—')}</span></td>
                  <td>${Utils.esc(eng.broker_name || '—')}</td>
                  <td>${eng.updated_at ? Utils.formatDate(eng.updated_at) : '—'}</td>
                  <td><a href="#/engagements/${eng.id}" class="btn btn-xs btn-outline">View</a></td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No engagements linked to this contact.</p>`;
          break;
        }

        case 'assets': {
          const res = await Api.assets.list({ contact_id: contactId, limit: 200 });
          const allRows = (res.data || []);
          await Assets.renderAssetsTab(tabEl, allRows, {
            addHref: `#/assets/new?contact_id=${contactId}`,
            emptyMsg: 'No active assets linked to this contact.',
          });
          break;
        }

        case 'reviews': {
          const res = await Api.reviews.list({ contact_id: contactId, limit: 50 });
          const rows = (res.data || []);
          const addBtn = `<div class="tab-toolbar"><a href="#/reviews/new?contact_id=${contactId}" class="btn btn-sm btn-primary">+ New Review</a></div>`;
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
            </table>` : `<p class="tab-empty">No reviews linked to this contact.</p>`);
          break;
        }

        case 'complaints': {
          const res = await Api.complaints.list({ contact_id: contactId, limit: 50 });
          const rows = (res.data || []);
          const addBtn = `<div class="tab-toolbar"><a href="#/complaints/new?contact_id=${contactId}" class="btn btn-sm btn-primary">+ New Complaint</a></div>`;
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
            </table>` : `<p class="tab-empty">No complaints linked to this contact.</p>`);
          break;
        }

        case 'advice-records': {
          const res  = await Api.adviceRecords.list({ contact_id: contactId, limit: 50 });
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
            </table>` : `<p class="tab-empty">No advice records linked to this contact.</p>`;
          break;
        }

        case 'sections': {
          // Load all assets for this contact, group by asset_section to show sections overview
          const assetRes = await Api.assets.list({ contact_id: contactId, limit: 500 }).catch(() => ({ data: [] }));
          const _allSecAssets = assetRes.data || assetRes || [];
          const _SEC_INACTIVE = ['Sold', 'Decommissioned', 'Inactive', 'Cancelled'];
          const allAssets = _allSecAssets.filter(a => !_SEC_INACTIVE.includes(a.asset_status));
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
          : `<p class="tab-empty">No policy sections found for this contact. Assets need an "Asset Section" value to appear here.</p>`;
          break;
        }

        case 'timeline': {
          const entries = await Api.timeline.forContact(contactId);
          const rows = Array.isArray(entries) ? entries : (entries.data || []);
          tabEl.innerHTML = `
            <div style="padding:.75rem 1rem;">
              ${renderTimeline(rows, 'No activity recorded for this contact yet.')}
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
    let contact = null;
    let policies = [];
    let adviceRecords = [];
    try { contact = await Api.contacts.get(id); } catch (_) {}

    // Load policies for placeholders
    try {
      const pRes = await Api.policies.list({ contact_id: id, limit: 100 });
      policies = pRes.data || pRes || [];
    } catch (_) {}
    const acctId = contact?.related_account_id || contact?.account_id;
    if (acctId) {
      try {
        const pRes2 = await Api.policies.list({ account_id: acctId, limit: 100 });
        const acctPols = pRes2.data || pRes2 || [];
        const existingIds = new Set(policies.map(p => p.id));
        acctPols.forEach(p => { if (!existingIds.has(p.id)) policies.push(p); });
      } catch (_) {}
    }

    // Load advice records linked to this contact or their account
    try {
      const arRes = await Api.adviceRecords.list({ contact_id: id, limit: 100 });
      adviceRecords = arRes.data || arRes || [];
    } catch (_) {}
    if (acctId) {
      try {
        const arRes2 = await Api.adviceRecords.list({ account_id: acctId, limit: 100 });
        const acctArs = arRes2.data || arRes2 || [];
        const existingIds = new Set(adviceRecords.map(a => a.id));
        acctArs.forEach(a => { if (!existingIds.has(a.id)) adviceRecords.push(a); });
      } catch (_) {}
    }

    const name = contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : '';
    const email = contact ? (contact.email || '') : '';

    let templates = [];
    try { templates = await Api.settings.listTemplates(); } catch (_) {}

    let claimForms = [];
    try { claimForms = await Api.settings.claimForms(); } catch (_) {}

    const modal = document.createElement('div');
    modal.id = 'mail-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="width:560px;max-height:90vh;display:flex;flex-direction:column;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>Send Email to ${Utils.esc(name)}</h3>
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
            <select class="form-control" id="mail-template" onchange="Contacts._applyMailTemplate(this.value)">
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
          <button class="btn btn-primary" id="mail-send-btn" onclick="Contacts._sendMail()">Send Email</button>
        </div>
      </div>`;
    /* backdrop-close disabled */
    document.body.appendChild(modal);

    // Store templates and context for placeholder replacement
    modal._templates = templates;
    modal._placeholders = {
      client_name: name,
      first_name: contact?.first_name || '',
      last_name: contact?.last_name || '',
      email: email,
      mobile: contact?.mobile || '',
      phone: contact?.phone || '',
      id_number: contact?.sa_id_number || '',
      date_of_birth: contact?.date_of_birth ? formatDate(contact.date_of_birth) : '',
      client_category: contact?.client_category || '',
      client_segment: contact?.client_segment || '',
      contact_status: contact?.contact_status || '',
      broker_name: window.currentUser?.full_name || '',
      account_name: '',
      policy_number: policies.length ? policies.map(p => p.policy_number).filter(Boolean).join(', ') : '',
      policy_name: policies.length ? policies.map(p => p.policy_name).filter(Boolean).join(', ') : '',
      today: new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' }),
    };
    modal._contactId = id;
    modal._userAttachments = [];
    modal._libraryDocs = []; // [{ id, filename, group, type, value }]

    // Context the library picker needs to inject synthetic entries: claim
    // form templates (Claims group), policy schedule generator (Policies
    // group), and ROA generators (Engagements group).
    modal._parentModule  = 'contacts';
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
          parentModule:  modal._parentModule || 'contacts',
          parentId:      modal._contactId,
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
   * Open the document-library picker. Lists every real document related to
   * the parent (contact or account), grouped by source. Then merges in
   * SYNTHETIC entries the user can also send:
   *   - Claim form templates → "Claims" group  (claim_form_names payload)
   *   - Policy Schedule PDF → "Policies" group (schedule_contact/account_id)
   *   - One Record of Advice per advice record → "Engagements" group (roa_ids)
   *
   * Each picked item is returned with a `type` so _sendMail can route it to
   * the correct field on the email payload.
   *
   * @param {{parentModule:string, parentId:number, claimForms?:Array,
   *          policies?:Array, adviceRecords?:Array}} opts
   * @param {Array}  alreadyPicked - existing [{id, filename, group, type, value}]
   * @param {Function} onApply     - called with the new picked array
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
    overlay.style.zIndex = '2000'; // sit above the email modal
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

    // Fetch real documents AND advice records in parallel. Pulling advice
    // records directly here (rather than trusting the preloaded list on the
    // modal) makes the picker authoritative — newly-created ROAs show up
    // without having to close + reopen the email composer.
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
    // The picker ALWAYS shows every standard group so the user can see what
    // categories exist, even when a category has nothing in it yet. Real docs
    // come from the server response; synthetic entries (Policy Schedule,
    // ROAs, default claim forms) get merged in below.
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
        // Any unexpected label from the server (shouldn't happen normally).
        groupMap.set(g.label, g);
      }
    });

    // ── Inject synthetic entries ────────────────────────────────────────────
    // Synthetic items represent generated PDFs (Policy Schedule, ROAs) and
    // static claim-form templates. They share the row UI but carry a `type`
    // marker so _sendMail can route them to the right payload field.

    // Claim form templates → Claims (always available when the system has
    // any default claim-form PDFs).
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

    // Policy Schedule synthetic → Policies (always offered; the server
    // generator gracefully produces an empty schedule when there are no
    // policies, matching the legacy "always-visible checkbox" behaviour).
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

    // ROA synthetics → Engagements (one per advice record on this parent).
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

    // Preselected: ids the email modal already has from previous picks.
    // Compare as strings since synthetic ids are non-numeric (e.g. "roa:5").
    const preselectedIds = new Set((alreadyPicked || []).map(d => String(d.id)));

    const renderGroups = (filterTerm) => {
      const term = (filterTerm || '').trim().toLowerCase();
      const html = groups.map(g => {
        const visibleDocs = term
          ? (g.docs || []).filter(d =>
              (d.original_name || '').toLowerCase().includes(term) ||
              (d.description || '').toLowerCase().includes(term))
          : (g.docs || []);

        // Empty state — keep the group visible so the user can see all
        // possible categories. While searching, suppress empty groups so the
        // results stay tight.
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

      // Wire per-group "Select all"
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

    const payload = { to, subject, html: body, text: body, audit_module: 'contacts', audit_record_id: modal?._contactId };

    // Locally-uploaded files (kept separate from library picks — these are
    // base64 buffers in the request body, not server-resident docs).
    if (modal?._userAttachments?.length) payload.user_attachments = modal._userAttachments;

    // Route each library pick into the right payload field based on `type`.
    // Library picks now cover library docs, claim-form templates, the Policy
    // Schedule generator, and ROA generators — what used to be three
    // separate UI controls.
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
    if (docIds.length)        payload.document_ids     = docIds;
    if (roaIds.length)        payload.roa_ids          = roaIds;
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
