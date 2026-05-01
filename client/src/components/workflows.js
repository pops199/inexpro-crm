/* ═══════════════════════════════════════════════════════════════════════════
   Workflows component  —  Task tracker for broker/admin actions
   ═══════════════════════════════════════════════════════════════════════════ */

const Workflows = (() => {

  const STATUSES = ['Assigned', 'Open', 'In Progress', 'On Hold', 'Completed'];

  // ── Helpers ────────────────────────────────────────────────────────────────

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function selectOpts(items, selected, emptyLabel = '— Select —') {
    return [
      `<option value="">${emptyLabel}</option>`,
      ...items.map(i => `<option value="${esc(i)}" ${selected === i ? 'selected' : ''}>${esc(i)}</option>`)
    ].join('');
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

  function assetOptions(assets, selectedId) {
    return [{ id: '', asset_name: '— None —' }, ...assets].map(a =>
      `<option value="${esc(a.id)}" ${String(a.id) === String(selectedId) ? 'selected' : ''}>${esc(a.asset_name || a.asset_type || '')}</option>`
    ).join('');
  }

  function claimOptions(claims, selectedId) {
    return [{ id: '', claim_number: '— None —' }, ...claims].map(c =>
      `<option value="${esc(c.id)}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${esc(c.claim_number || `Claim #${c.id}`)}${c.incident_description ? ' — ' + esc(String(c.incident_description).slice(0,40)) : ''}</option>`
    ).join('');
  }

  function userOptions(users, selectedId) {
    return [{ id: '', full_name: '— Unassigned —' }, ...users].map(u =>
      `<option value="${esc(u.id)}" ${String(u.id) === String(selectedId) ? 'selected' : ''}>${esc(u.full_name || u.username || '')}</option>`
    ).join('');
  }

  function statusBadge(status) {
    const safe = esc(status || '—');
    const slug = (status || '').toLowerCase().replace(/\s+/g, '-');
    return `<span class="badge badge-status badge-status--${slug}">${safe}</span>`;
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
        data[key] = (typeof sanitiseInput === 'function') ? sanitiseInput(val) : String(val).trim();
      }
    }
    return data;
  }

  function fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch (_) { return String(d).slice(0, 10); }
  }

  // ── Cell renderers (one per catalog column id) ────────────────────────────
  //
  // Each renderer returns a TD's inner HTML (not the full <td>). The table
  // wraps rows in <tr onclick=…> so individual cell links use stopPropagation.

  const CELL_RENDERERS = {
    description:   r => `<span style="font-weight:500;">${esc(r.description || '—')}</span>`,
    due_date:      r => fmtDate(r.due_date),
    status:        r => statusBadge(r.status),
    broker_name:   r => esc(r.broker_name || '—'),
    contact_name:  r => r.contact_id ? `<a href="#/contacts/${r.contact_id}" onclick="event.stopPropagation();">${esc(r.contact_name || '—')}</a>` : '—',
    account_name:  r => r.account_id ? `<a href="#/accounts/${r.account_id}" onclick="event.stopPropagation();">${esc(r.account_name || '—')}</a>` : '—',
    policy_name:   r => r.policy_id  ? `<a href="#/policies/${r.policy_id}"  onclick="event.stopPropagation();">${esc(r.policy_name || r.policy_number || '—')}</a>` : '—',
    policy_number: r => r.policy_id  ? `<a href="#/policies/${r.policy_id}"  onclick="event.stopPropagation();">${esc(r.policy_number || '—')}</a>` : esc(r.policy_number || '—'),
    asset_name:    r => r.asset_id   ? `<a href="#/assets/${r.asset_id}"     onclick="event.stopPropagation();">${esc(r.asset_name || '—')}</a>` : '—',
    claim_number:  r => r.claim_id   ? `<a href="#/claims/${r.claim_id}"     onclick="event.stopPropagation();">${esc(r.claim_number || `#${r.claim_id}`)}</a>` : '—',
    notes:         r => {
      const n = (r.notes || '').replace(/\s+/g, ' ').trim();
      if (!n) return '—';
      const short = n.length > 80 ? n.slice(0, 80) + '…' : n;
      return `<span title="${esc(n)}">${esc(short)}</span>`;
    },
    created_at:    r => r.created_at ? fmtDate(r.created_at) : '—',
    updated_at:    r => r.updated_at ? fmtDate(r.updated_at) : '—',
  };

  // Cached prefs loaded once per page entry (also refreshed on save/reset)
  let _catalog = null;
  let _config  = null;

  // ── List ──────────────────────────────────────────────────────────────────

  async function list() {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    setPageTitle('Workflows');
    setBreadcrumb(['Workflows']);

    const ctrlStyle = 'height:28px;padding:.15rem .4rem;font-size:.78rem;line-height:1;';
    const headerActions = document.getElementById('header-actions');
    if (headerActions) {
      headerActions.innerHTML = `<a href="#/workflows/new" class="btn btn-primary" style="${ctrlStyle}">+ New Workflow</a>`;
    }

    document.getElementById('workflows-center-filters')?.remove();
    const topHeader = document.getElementById('top-header');
    if (topHeader) {
      topHeader.style.position = 'relative';
      const wrap = document.createElement('div');
      wrap.id = 'workflows-center-filters';
      wrap.setAttribute('data-header-widget', '1');
      wrap.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;gap:.5rem;align-items:center;z-index:2;background:var(--bg);padding:.3rem .55rem;border-radius:6px;';
      wrap.innerHTML = `
        <input type="search" id="wf-search" class="form-control" placeholder="Search description or notes…"
          style="${ctrlStyle}width:240px;">`;
      topHeader.appendChild(wrap);
    }

    try {
      // Load view prefs (catalog + user config) alongside the workflows data
      const prefs = await ViewPrefs.load('workflows');
      _catalog = prefs.catalog;
      _config  = prefs.config;

      // Wire the "⚙ Columns" button next to "+ New Workflow"
      ViewPrefs.attachButton({
        moduleKey: 'workflows',
        catalog:   _catalog,
        current:   _config,
        onChange:  (newCfg) => { _config = newCfg; list(); },
      });

      const res = await Api.workflows.list({
        limit: 200,
        sort: _config.sortBy,
        dir:  _config.sortDir,
      });
      const rows = res.data || res || [];

      const tabs = ['All', ...STATUSES];
      function countFor(s) {
        return s === 'All' ? rows.length : rows.filter(r => r.status === s).length;
      }

      // ── Due-date ranges (chips) ─────────────────────────────────────────
      const today = new Date(); today.setHours(0,0,0,0);
      const startOfDay = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
      const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
      // Monday as start of week (ISO)
      const dayIdx = (today.getDay() + 6) % 7; // Mon=0..Sun=6
      const endOfWeek = addDays(today, 6 - dayIdx);   // this Sunday
      const startNextWeek = addDays(endOfWeek, 1);
      const endNextWeek   = addDays(startNextWeek, 6);
      const tomorrow      = addDays(today, 1);
      const in14 = addDays(today, 14);
      const in30 = addDays(today, 30);

      const ranges = [
        { key: 'overdue',  label: 'Overdue',       test: d => d < today,                                            color: '#e74c3c' },
        { key: 'tomorrow', label: 'Due Tomorrow',  test: d => d.getTime() === tomorrow.getTime(),                   color: '#e67e22' },
        { key: 'this',     label: 'Due This Week', test: d => d >= today && d <= endOfWeek,                         color: '#f39c12' },
        { key: 'next',     label: 'Due Next Week', test: d => d >= startNextWeek && d <= endNextWeek,               color: '#2980b9' },
        { key: '14',       label: 'Next 14 Days',  test: d => d >= today && d <= in14,                              color: '#8e44ad' },
        { key: '30',       label: 'Next 30 Days',  test: d => d >= today && d <= in30,                              color: '#16a085' },
        { key: 'onhold',   label: 'On Hold',       statusOnly: 'On Hold',                                           color: '#7f8c8d' },
      ];
      function countRange(r) {
        return rows.filter(x => {
          if (r.statusOnly) return x.status === r.statusOnly;
          if (x.status === 'Completed') return false;
          if (!x.due_date) return false;
          const d = startOfDay(x.due_date);
          if (isNaN(d)) return false;
          return r.test(d);
        }).length;
      }

      // ── Build columns from the catalog × user config ───────────────────
      const visibleCols = ViewPrefs.visibleColumns(_catalog, _config);
      const colCount = visibleCols.length || 1;

      const headCells = visibleCols.map(col => {
        const isActive = _config.sortBy === col.id;
        const arrow    = isActive ? (_config.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
        const classes  = 'sortable' + (col.sortable ? '' : ' not-sortable') + (isActive ? ' sort-active' : '');
        const clickable = col.sortable
          ? `class="${classes}" data-sort="${esc(col.id)}" style="cursor:pointer;"`
          : `class="${classes}"`;
        return `<th ${clickable}>${esc(col.label)}${arrow}</th>`;
      }).join('');

      el.innerHTML = `
        <div class="card">
          <div class="card-header" style="display:flex;flex-direction:column;gap:.85rem;align-items:stretch;">
            <div id="wf-due-chips" style="display:flex;gap:.5rem;flex-wrap:wrap;">
              ${ranges.map(r => `
                <button type="button" class="wf-chip" data-range="${r.key}"
                  style="display:inline-flex;align-items:center;gap:.5rem;border:1px solid ${r.color}55;background:${r.color}14;color:${r.color};
                         padding:.45rem .85rem;border-radius:999px;cursor:pointer;font-size:.85rem;font-weight:500;transition:all .15s;"
                  data-color="${r.color}">
                  <span>${esc(r.label)}</span>
                  <span class="wf-chip-count" style="background:${r.color};color:#fff;padding:.1rem .55rem;border-radius:999px;font-size:.72rem;font-weight:600;min-width:1.5rem;text-align:center;">${countRange(r)}</span>
                </button>`).join('')}
            </div>
            <div id="wf-status-tabs" style="display:flex;gap:.25rem;flex-wrap:wrap;border-bottom:1px solid var(--border-color,#e2e8f0);">
              ${tabs.map((s, i) => `
                <button type="button" class="wf-tab ${i === 0 ? 'active' : ''}" data-status="${esc(s === 'All' ? '' : s)}"
                  style="background:none;border:none;padding:.6rem 1rem;cursor:pointer;border-bottom:2px solid transparent;font-size:.9rem;color:var(--text-muted,#64748b);margin-bottom:-1px;">
                  ${esc(s)} <span class="wf-tab-count" style="background:var(--bg-subtle,#f1f5f9);color:var(--text-muted,#64748b);padding:.1rem .5rem;border-radius:10px;font-size:.75rem;margin-left:.25rem;">${countFor(s)}</span>
                </button>`).join('')}
            </div>
          </div>
          <div class="table-responsive">
            <table class="table">
              <thead>
                <tr id="wf-thead-row">${headCells}</tr>
              </thead>
              <tbody id="wf-tbody">
                ${rows.length ? rows.map(r => rowHtml(r, visibleCols)).join('') : `<tr><td colspan="${colCount}" style="text-align:center;color:var(--text-muted);padding:2rem;">No workflows yet.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
        <style>
          .wf-tab.active {
            color: var(--color-primary, #2980b9) !important;
            border-bottom-color: var(--color-primary, #2980b9) !important;
            font-weight: 600;
          }
          .wf-tab.active .wf-tab-count {
            background: var(--color-primary, #2980b9) !important;
            color: #fff !important;
          }
          .wf-tab:hover:not(.active) {
            color: var(--text-color, #1e293b) !important;
          }
          .wf-chip:hover { filter: brightness(0.96); }
          .wf-chip.active {
            box-shadow: 0 0 0 2px currentColor inset, 0 2px 6px rgba(0,0,0,0.08);
            font-weight: 600;
          }
          th.sortable { user-select: none; }
          th.sortable.sort-active { color: var(--color-primary, #2980b9); }
          th.sortable.not-sortable { cursor: default; }
        </style>`;

      const searchEl = document.getElementById('wf-search');
      const tabsEl = document.getElementById('wf-status-tabs');
      const chipsEl = document.getElementById('wf-due-chips');
      let activeStatus = '';
      let activeRange = null;

      function applyFilter() {
        const q = (searchEl.value || '').toLowerCase();
        const s = activeStatus;
        const filtered = rows.filter(r => {
          if (activeRange) {
            if (activeRange.statusOnly) {
              if (r.status !== activeRange.statusOnly) return false;
            } else {
              if (r.status === 'Completed') return false;
              if (!r.due_date) return false;
              const d = startOfDay(r.due_date);
              if (isNaN(d) || !activeRange.test(d)) return false;
            }
          }
          if (s && r.status !== s) return false;
          if (q) {
            const hay = `${r.description || ''} ${r.notes || ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
        document.getElementById('wf-tbody').innerHTML = filtered.length
          ? filtered.map(r => rowHtml(r, visibleCols)).join('')
          : `<tr><td colspan="${colCount}" style="text-align:center;color:var(--text-muted);padding:2rem;">No workflows match.</td></tr>`;
      }

      if (searchEl) searchEl.addEventListener('input', applyFilter);
      if (tabsEl) {
        tabsEl.querySelectorAll('.wf-tab').forEach(btn => {
          btn.addEventListener('click', () => {
            tabsEl.querySelectorAll('.wf-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeStatus = btn.dataset.status || '';
            applyFilter();
          });
        });
      }
      if (chipsEl) {
        chipsEl.querySelectorAll('.wf-chip').forEach(btn => {
          btn.addEventListener('click', () => {
            const key = btn.dataset.range;
            const already = btn.classList.contains('active');
            chipsEl.querySelectorAll('.wf-chip').forEach(b => b.classList.remove('active'));
            if (already) {
              activeRange = null;
            } else {
              btn.classList.add('active');
              activeRange = ranges.find(r => r.key === key) || null;
            }
            applyFilter();
          });
        });
      }

      // ── Clickable sort headers ─────────────────────────────────────────
      document.querySelectorAll('#wf-thead-row th[data-sort]').forEach(th => {
        th.addEventListener('click', async () => {
          const col = th.dataset.sort;
          if (_config.sortBy === col) {
            _config.sortDir = _config.sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            _config.sortBy = col;
            _config.sortDir = 'asc';
          }
          // Persist the new sort so it survives page reloads
          try {
            const res = await Api.viewPrefs.save('workflows', _config);
            _config = res.config;
          } catch (_) { /* keep going even if save fails */ }
          list();
        });
      });

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load workflows: ${esc(err.message)}</div>`;
    }
  }

  function rowHtml(r, visibleCols) {
    const cells = visibleCols.map(col => {
      const fn = CELL_RENDERERS[col.id];
      const html = fn ? fn(r) : esc(String(r[col.id] ?? '—'));
      return `<td>${html}</td>`;
    }).join('');
    return `
      <tr style="cursor:pointer;" onclick="location.hash='#/workflows/${r.id}'">
        ${cells}
      </tr>`;
  }

  // ── Form (create / edit) ──────────────────────────────────────────────────

  async function form(id = null) {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    const isEdit = Boolean(id);
    setPageTitle(isEdit ? 'Edit Workflow' : 'New Workflow');
    setBreadcrumb(['Workflows', isEdit ? 'Edit' : 'New']);

    const headerActions = document.getElementById('header-actions');
    if (headerActions) headerActions.innerHTML = '';

    try {
      const [contactsRes, accountsRes, policiesRes, assetsRes, claimsRes, usersRes, data] = await Promise.all([
        Api.contacts.list({ limit: 500 }),
        Api.accounts.list({ limit: 500 }),
        Api.policies.list({ limit: 500 }),
        Api.assets.list({ limit: 500 }),
        Api.claims.list({ limit: 500 }),
        Api.admin.users().catch(() => ({ data: [] })),
        isEdit ? Api.workflows.get(id) : Promise.resolve({}),
      ]);

      const contacts = contactsRes.data || contactsRes || [];
      const accounts = accountsRes.data || accountsRes || [];
      const policies = policiesRes.data || policiesRes || [];
      const assets   = assetsRes.data   || assetsRes   || [];
      const claims   = claimsRes.data   || claimsRes   || [];
      const users    = (usersRes.data || usersRes || []).filter(u => u.active !== 0);
      const d = data.data || data || {};

      // Pre-fill from hash params
      const hash = window.location.hash || '';
      const qIdx = hash.indexOf('?');
      if (!isEdit && qIdx !== -1) {
        const params = new URLSearchParams(hash.slice(qIdx + 1));
        ['contact_id','account_id','policy_id','asset_id','claim_id'].forEach(k => {
          if (!d[k] && params.get(k)) d[k] = params.get(k);
        });
      }

      el.innerHTML = `
        <div class="form-page">
          <div class="card">
            <div class="card-header"><h3 class="card-title">${isEdit ? 'Edit Workflow' : 'New Workflow'}</h3></div>
            <form id="wf-form" novalidate>
              <fieldset class="form-section">
                <legend class="form-section-title">Details</legend>
                <div class="form-grid form-grid-2">
                  <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label required">Description</label>
                    <input type="text" name="description" class="form-control" required
                      value="${esc(d.description || '')}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Due Date</label>
                    <input type="date" name="due_date" class="form-control"
                      value="${esc(d.due_date ? String(d.due_date).slice(0,10) : '')}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label required">Status</label>
                    <select name="status" class="form-control" required>
                      ${selectOpts(STATUSES, d.status || 'Assigned', '— Select Status —')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Responsible Person</label>
                    <select name="assigned_broker_id" class="form-control">
                      ${userOptions(users, d.assigned_broker_id)}
                    </select>
                  </div>
                </div>
              </fieldset>

              <fieldset class="form-section">
                <legend class="form-section-title">Links</legend>
                <div class="form-grid form-grid-2">
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
                    <label class="form-label">Asset</label>
                    <select name="asset_id" class="form-control">
                      ${assetOptions(assets, d.asset_id)}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Claim</label>
                    <select name="claim_id" class="form-control">
                      ${claimOptions(claims, d.claim_id)}
                    </select>
                  </div>
                </div>
              </fieldset>

              <fieldset class="form-section">
                <legend class="form-section-title">Notes</legend>
                <div class="form-group">
                  <textarea name="notes" class="form-control" rows="4">${esc(d.notes || '')}</textarea>
                </div>
              </fieldset>

              <div class="form-actions">
                <button type="submit" class="btn btn-primary" id="wf-submit-btn">
                  ${isEdit ? 'Save Changes' : 'Create Workflow'}
                </button>
                <a href="${isEdit ? `#/workflows/${id}` : '#/workflows'}" class="btn btn-secondary">Cancel</a>
              </div>
            </form>
          </div>
        </div>`;

      const formEl = document.getElementById('wf-form');

      // Searchable selects
      ['contact_id', 'account_id', 'policy_id', 'asset_id', 'claim_id', 'assigned_broker_id'].forEach(name => {
        const s = formEl.querySelector(`select[name="${name}"]`);
        if (s && typeof makeSearchable === 'function') makeSearchable(s);
      });

      // Mutual exclusion between contact and account
      if (typeof wireContactAccountToggle === 'function') {
        wireContactAccountToggle(formEl);
      }

      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('wf-submit-btn');
        if (btn) btn.disabled = true;
        const payload = serializeForm(formEl);
        try {
          if (isEdit) {
            await Api.workflows.update(id, payload);
            showToast('Workflow updated.', 'success');
            navigate(`workflows/${id}`);
          } else {
            const created = await Api.workflows.create(payload);
            const newId = (created.data || created).id;
            showToast('Workflow created.', 'success');
            navigate(`workflows/${newId}`);
          }
        } catch (err) {
          showToast('Save failed: ' + err.message, 'error');
          if (btn) btn.disabled = false;
        }
      });

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load form: ${esc(err.message)}</div>`;
    }
  }

  // ── Detail ────────────────────────────────────────────────────────────────

  async function detail(id) {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    const headerActions = document.getElementById('header-actions');
    if (headerActions) {
      headerActions.innerHTML = `<a href="#/workflows/${id}/edit" class="btn btn-primary">Edit</a>`;
    }

    try {
      const res = await Api.workflows.get(id);
      const d = res.data || res || {};

      setPageTitle(esc(d.description || 'Workflow'));
      setBreadcrumb(['Workflows', d.description || 'Detail']);

      const field = (label, value) => `<div class="detail-field"><span class="detail-label">${label}</span><span class="detail-value">${value || '—'}</span></div>`;

      const isCompleted = d.status === 'Completed';
      const statusValue = `
        <span style="display:inline-flex;align-items:center;gap:.5rem;flex-wrap:wrap;">
          ${statusBadge(d.status)}
          ${isCompleted
            ? `<button class="btn btn-xs btn-secondary" id="wf-reopen-btn">Reopen</button>`
            : `<button class="btn btn-xs btn-success" id="wf-complete-btn">✓ Mark as Complete</button>`}
        </span>`;

      el.innerHTML = `
        <div class="detail-view">
          <div class="detail-section card">
            <div class="detail-section-title">Workflow Details</div>
            <div class="detail-grid">
              ${field('Description', esc(d.description || '—'))}
              ${field('Status', statusValue)}
              ${field('Due Date', fmtDate(d.due_date))}
              ${field('Responsible Person', esc(d.broker_name || '— Unassigned —'))}
            </div>
          </div>

          <div class="detail-section card">
            <div class="detail-section-title">Linked Records</div>
            <div class="detail-grid">
              ${field('Contact', d.contact_id ? `<a href="#/contacts/${d.contact_id}">${esc(d.contact_name || '—')}</a>` : '—')}
              ${field('Account', d.account_id ? `<a href="#/accounts/${d.account_id}">${esc(d.account_name || '—')}</a>` : '—')}
              ${field('Policy',  d.policy_id  ? `<a href="#/policies/${d.policy_id}">${esc(d.policy_name || d.policy_number || '—')}</a>` : '—')}
              ${field('Asset',   d.asset_id   ? `<a href="#/assets/${d.asset_id}">${esc(d.asset_name || '—')}</a>` : '—')}
              ${field('Claim',   d.claim_id   ? `<a href="#/claims/${d.claim_id}">${esc(d.claim_number || `Claim #${d.claim_id}`)}</a>` : '—')}
            </div>
          </div>

          ${d.notes ? `
          <div class="detail-section card">
            <div class="detail-section-title">Summary Notes</div>
            <div style="white-space:pre-wrap;">${esc(d.notes)}</div>
          </div>` : ''}

          <!-- Tabs -->
          <div class="detail-tabs card">
            <div class="tabs-header" id="wf-tabs-header">
              <button class="tab-btn active" data-tab="notes">Notes</button>
              <button class="tab-btn"        data-tab="documents">Documents</button>
              <button class="tab-btn"        data-tab="timeline">Timeline</button>
            </div>
            <div class="tab-content" id="wf-tab-content">
              <div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>
            </div>
          </div>

          <div class="form-actions">
            ${canUserDelete && canUserDelete() ? `<button class="btn btn-danger" id="wf-delete-btn">Delete</button>` : ''}
            <a href="#/workflows" class="btn btn-secondary btn-back">← Back to Workflows</a>
          </div>
        </div>`;

      loadWorkflowTab(id, 'notes');
      document.getElementById('wf-tabs-header').querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#wf-tabs-header .tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          loadWorkflowTab(id, btn.dataset.tab);
        });
      });

      const completeBtn = document.getElementById('wf-complete-btn');
      if (completeBtn) {
        completeBtn.addEventListener('click', async () => {
          completeBtn.disabled = true;
          try {
            await Api.workflows.update(id, { status: 'Completed' });
            showToast('Workflow marked as complete.', 'success');
            detail(id);
          } catch (err) {
            showToast('Update failed: ' + err.message, 'error');
            completeBtn.disabled = false;
          }
        });
      }

      const reopenBtn = document.getElementById('wf-reopen-btn');
      if (reopenBtn) {
        reopenBtn.addEventListener('click', async () => {
          reopenBtn.disabled = true;
          try {
            await Api.workflows.update(id, { status: 'In Progress' });
            showToast('Workflow reopened.', 'success');
            detail(id);
          } catch (err) {
            showToast('Update failed: ' + err.message, 'error');
            reopenBtn.disabled = false;
          }
        });
      }

      const delBtn = document.getElementById('wf-delete-btn');
      if (delBtn) {
        delBtn.addEventListener('click', async () => {
          if (!confirm('Delete this workflow?')) return;
          try {
            await Api.workflows.delete(id);
            showToast('Workflow deleted.', 'success');
            navigate('workflows');
          } catch (err) {
            showToast('Delete failed: ' + err.message, 'error');
          }
        });
      }

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load workflow: ${esc(err.message)}</div>`;
    }
  }

  async function loadWorkflowTab(id, tab) {
    const tabEl = document.getElementById('wf-tab-content');
    if (!tabEl) return;
    tabEl.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    try {
      switch (tab) {
        case 'notes': {
          const notesRes = await Api.workflows.notesList(id).catch(() => []);
          let notes = Array.isArray(notesRes) ? notesRes : (notesRes.data || []);
          tabEl.innerHTML = `
            <div style="padding:.75rem 1rem;">
              <form id="wf-add-note-form" style="display:grid;grid-template-columns:140px 1fr auto;gap:.5rem;align-items:start;margin-bottom:1rem;">
                <input type="date" name="note_date" class="form-control" value="${new Date().toISOString().slice(0,10)}" />
                <textarea name="details" class="form-control" rows="2" placeholder="Add a note…" required></textarea>
                <button type="submit" class="btn btn-primary" id="wf-add-note-btn">Add Note</button>
              </form>
              <div id="wf-notes-list"></div>
            </div>`;

          function renderNotes() {
            const host = document.getElementById('wf-notes-list');
            if (!host) return;
            host.innerHTML = notes.length ? notes.map(n => `
              <div class="wf-note" style="border-bottom:1px solid #eee;padding:.6rem 0;display:flex;gap:1rem;align-items:flex-start;">
                <div style="flex:1;">
                  <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:.15rem;">
                    ${esc(fmtDate(n.note_date))} — ${esc(n.created_by_name || '—')}
                  </div>
                  <div style="white-space:pre-wrap;">${esc(n.details)}</div>
                </div>
                ${canUserDelete && canUserDelete() ? `
                  <button class="btn btn-sm btn-danger wf-note-del" data-id="${n.id}" style="white-space:nowrap;">Delete</button>` : ''}
              </div>`).join('') : `<p class="tab-empty">No notes yet.</p>`;

            host.querySelectorAll('.wf-note-del').forEach(btn => {
              btn.addEventListener('click', async () => {
                const nid = btn.dataset.id;
                if (!confirm('Delete this note?')) return;
                try {
                  await Api.workflows.notesDelete(id, nid);
                  notes = notes.filter(x => String(x.id) !== String(nid));
                  renderNotes();
                  showToast('Note deleted.', 'success');
                } catch (err) { showToast('Delete failed: ' + err.message, 'error'); }
              });
            });
          }
          renderNotes();

          const addForm = document.getElementById('wf-add-note-form');
          addForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('wf-add-note-btn');
            if (btn) btn.disabled = true;
            const fd = new FormData(addForm);
            const payload = {
              note_date: fd.get('note_date') || null,
              details:   (fd.get('details') || '').toString().trim(),
            };
            if (!payload.details) {
              showToast('Please enter note details.', 'error');
              if (btn) btn.disabled = false;
              return;
            }
            try {
              const created = await Api.workflows.notesCreate(id, payload);
              notes = [created, ...notes];
              renderNotes();
              addForm.reset();
              const dateInput = addForm.querySelector('[name="note_date"]');
              if (dateInput) dateInput.value = new Date().toISOString().slice(0,10);
              showToast('Note added.', 'success');
            } catch (err) {
              showToast('Add note failed: ' + err.message, 'error');
            } finally {
              if (btn) btn.disabled = false;
            }
          });
          break;
        }

        case 'documents': {
          const res = await Api.documents.list({ module: 'workflows', record_id: id });
          const docs = res.data || [];
          tabEl.innerHTML = `
            <div class="tab-toolbar">
              <label class="btn btn-primary btn-sm" for="wf-doc-upload">+ Upload Document</label>
              <input type="file" id="wf-doc-upload" style="display:none;" accept=".pdf,.jpg,.jpeg,.png,.docx" />
            </div>
            ${docs.length ? `
            <table class="table">
              <thead><tr><th>File Name</th><th>Type</th><th>Uploaded By</th><th>Date</th><th></th></tr></thead>
              <tbody>${docs.map(x => `
                <tr>
                  <td>${esc(x.original_name)}</td>
                  <td>${esc(x.file_type || '—')}</td>
                  <td>${esc(x.uploaded_by_name || '—')}</td>
                  <td>${x.uploaded_at ? fmtDate(x.uploaded_at) : '—'}</td>
                  <td style="white-space:nowrap;">
                    <a href="/api/documents/${x.id}/view" target="_blank" class="btn btn-xs btn-outline">View</a>
                    ${canUserDelete && canUserDelete() ? `<button class="btn btn-xs btn-danger wf-doc-del" data-id="${x.id}" data-name="${esc(x.original_name)}">Delete</button>` : ''}
                  </td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No documents uploaded yet.</p>`}
          `;

          document.getElementById('wf-doc-upload').addEventListener('change', async e => {
            const file = e.target.files[0];
            if (!file) return;
            try {
              const fd = new FormData();
              fd.append('file', file);
              fd.append('module', 'workflows');
              fd.append('record_id', id);
              await Api.documents.upload(fd);
              showToast('Document uploaded.', 'success');
              loadWorkflowTab(id, 'documents');
            } catch (err) { showToast('Upload failed: ' + (err.message || err), 'error'); }
          });

          tabEl.querySelectorAll('.wf-doc-del').forEach(btn => {
            btn.addEventListener('click', async () => {
              if (!confirm(`Delete document "${btn.dataset.name}"? This cannot be undone.`)) return;
              try {
                await Api.documents.delete(btn.dataset.id);
                showToast('Document deleted.', 'success');
                loadWorkflowTab(id, 'documents');
              } catch (err) { showToast('Delete failed: ' + (err.message || err), 'error'); }
            });
          });
          break;
        }

        case 'timeline': {
          const entries = await Api.timeline.forRecord('workflows', id);
          const rows = Array.isArray(entries) ? entries : (entries.data || []);
          tabEl.innerHTML = `<div style="padding:.75rem 1rem;">${renderTimeline(rows, 'No activity recorded yet.')}</div>`;
          break;
        }
      }
    } catch (err) {
      tabEl.innerHTML = `<div class="alert alert-danger">Failed to load tab: ${esc(err.message)}</div>`;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return { list, form, detail };

})();
