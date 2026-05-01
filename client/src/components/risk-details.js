/* ═══════════════════════════════════════════════════════════════════════════
   RiskDetails component  —  Risk Details (spec section 12)
   ═══════════════════════════════════════════════════════════════════════════ */

const RiskDetails = (() => {

  // ── Constants ────────────────────────────────────────────────────────────

  const RISK_TYPES = [
    'Motor Risk',
    'Building Risk',
    'Goods in Transit Risk',
    'Marine Risk',
    'Liability Risk',
    'Personal Possessions Risk',
    'Electronic Equipment Risk',
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

  function selectOpts(items, selected, emptyLabel = '— Select —') {
    return [`<option value="">${emptyLabel}</option>`,
      ...items.map(i => `<option value="${esc(i)}" ${selected === i ? 'selected' : ''}>${esc(i)}</option>`)
    ].join('');
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

  function assetOptions(assets, selectedId) {
    return [{ id: '', asset_name: '— None —' }, ...assets].map(a =>
      `<option value="${esc(a.id)}" ${String(a.id) === String(selectedId) ? 'selected' : ''}>${esc(a.asset_name || '')}</option>`
    ).join('');
  }

  function policyOptions(policies, selectedId) {
    return [{ id: '', policy_name: '— None —' }, ...policies].map(p =>
      `<option value="${esc(p.id)}" ${String(p.id) === String(selectedId) ? 'selected' : ''}>${esc(p.policy_name || '')}</option>`
    ).join('');
  }

  function sectionOptions(sections, selectedId, placeholder = '— Select Section —') {
    return [{ id: '', section_name: placeholder }, ...sections].map(s => {
      const label = s.section_name || s.section_type || '';
      const suffix = s.id && s.policy_name ? ` (${s.policy_name})` : '';
      return `<option value="${esc(s.id)}" ${String(s.id) === String(selectedId) ? 'selected' : ''}>${esc(label + suffix)}</option>`;
    }).join('');
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
    for (const [key, val] of fd.entries()) {
      data[key] = sanitiseInput(val);
    }
    return data;
  }

  // ── Risk-type-specific field groups ──────────────────────────────────────

  function motorFieldsHtml(d) {
    return `
      <fieldset class="form-section risk-type-fields" id="riskfields-motor">
        <legend class="form-section-title">Motor Risk Details</legend>
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">Stored / Parked Overnight</label>
            <input type="text" name="stored_parked_overnight" class="form-control"
              value="${esc(d.stored_parked_overnight || '')}" placeholder="e.g. Locked garage" />
          </div>
          <div class="form-group">
            <label class="form-label">Tracking Device Fitted</label>
            <select name="tracking_device_fitted" class="form-control">
              <option value="">— Select —</option>
              <option value="Yes" ${d.tracking_device_fitted === 'Yes' ? 'selected' : ''}>Yes</option>
              <option value="No"  ${d.tracking_device_fitted === 'No'  ? 'selected' : ''}>No</option>
            </select>
          </div>
          <div class="form-group form-group-full">
            <label class="form-label">Route / Operating Area</label>
            <textarea name="route_operating_area" class="form-control" rows="2">${esc(d.route_operating_area || '')}</textarea>
          </div>
        </div>
      </fieldset>`;
  }

  function buildingFieldsHtml(d) {
    return `
      <fieldset class="form-section risk-type-fields" id="riskfields-building">
        <legend class="form-section-title">Building Risk Details</legend>
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">Occupancy / Use</label>
            <input type="text" name="occupancy_use" class="form-control"
              value="${esc(d.occupancy_use || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Construction Type</label>
            <input type="text" name="construction_type" class="form-control"
              value="${esc(d.construction_type || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Roof Construction</label>
            <input type="text" name="roof_construction" class="form-control"
              value="${esc(d.roof_construction || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Wall Construction</label>
            <input type="text" name="wall_construction" class="form-control"
              value="${esc(d.wall_construction || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Distance to Water (m)</label>
            <input type="number" name="distance_to_water" class="form-control" min="0"
              value="${esc(d.distance_to_water || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Flood Exposure</label>
            <select name="flood_exposure" class="form-control">
              <option value="">— Select —</option>
              ${['None', 'Low', 'Medium', 'High'].map(v =>
                `<option value="${esc(v)}" ${d.flood_exposure === v ? 'selected' : ''}>${esc(v)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Fire Exposure</label>
            <select name="fire_exposure" class="form-control">
              <option value="">— Select —</option>
              ${['None', 'Low', 'Medium', 'High'].map(v =>
                `<option value="${esc(v)}" ${d.fire_exposure === v ? 'selected' : ''}>${esc(v)}</option>`
              ).join('')}
            </select>
          </div>
        </div>
      </fieldset>`;
  }

  function gitFieldsHtml(d) {
    return `
      <fieldset class="form-section risk-type-fields" id="riskfields-git">
        <legend class="form-section-title">Goods in Transit Risk Details</legend>
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">Goods / Load Type</label>
            <input type="text" name="goods_load_type" class="form-control"
              value="${esc(d.goods_load_type || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Maximum Exposure Value</label>
            <div class="input-prefix-group">
              <span class="input-prefix">R</span>
              <input type="number" name="max_exposure_value" class="form-control" step="0.01" min="0"
                value="${esc(d.max_exposure_value || '')}" />
            </div>
          </div>
          <div class="form-group form-group-full">
            <label class="form-label">Route / Operating Area</label>
            <textarea name="git_route_operating_area" class="form-control" rows="2">${esc(d.git_route_operating_area || d.route_operating_area || '')}</textarea>
          </div>
          <div class="form-group form-group-full">
            <label class="form-label">Security Details (GIT)</label>
            <textarea name="git_security_details" class="form-control" rows="2">${esc(d.git_security_details || '')}</textarea>
          </div>
        </div>
      </fieldset>`;
  }

  // ── List ─────────────────────────────────────────────────────────────────

  // ── Catalog cell renderers ──────────────────────────────────────────────
  const RD_CELLS = {
    risk_detail_name:    r => `<a href="#/risk-details/${r.id}">${esc(r.risk_detail_name || '—')}</a>`,
    risk_type:           r => esc(r.risk_type || '—'),
    policy_section_name: r => r.policy_section_id ? `<a href="#/policy-sections/${r.policy_section_id}">${esc(r.section_name || r.policy_section_name || '—')}</a>` : esc(r.section_name || r.policy_section_name || '—'),
    asset_name:          r => r.asset_id ? `<a href="#/assets/${r.asset_id}">${esc(r.asset_name || '—')}</a>` : esc(r.asset_name || '—'),
    construction_type:   r => esc(r.construction_type || '—'),
    flood_exposure:      r => esc(r.flood_exposure || '—'),
    fire_exposure:       r => esc(r.fire_exposure || '—'),
    tracking_device_fitted: r => r.tracking_device_fitted ? 'Yes' : 'No',
    maximum_exposure_value: r => r.maximum_exposure_value != null ? formatCurrency(r.maximum_exposure_value) : '—',
    party_name:          r => esc(r.contact_name || r.account_name || '—'),
    policy_name:         r => esc(r.policy_name || '—'),
    last_updated:        r => r.updated_at ? formatDate(r.updated_at) : (r.last_updated ? formatDate(r.last_updated) : '—'),
    created_at:          r => r.created_at ? formatDate(r.created_at) : '—',
    actions:             r => `
      <a href="#/risk-details/${r.id}" class="btn btn-sm btn-secondary">View</a>
      <a href="#/risk-details/${r.id}/edit" class="btn btn-sm btn-primary">Edit</a>
      <button class="btn btn-sm btn-danger" data-delete-id="${r.id}" data-delete-name="${esc(r.risk_detail_name || '')}">Delete</button>`,
  };

  let _rdCatalog = null;
  let _rdConfig  = null;
  let _rdItems   = [];

  async function list() {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    setPageTitle('Risk Details');
    setBreadcrumb(['Risk Details']);

    const ctrlStyle = 'height:28px;padding:.15rem .4rem;font-size:.78rem;line-height:1;';
    const headerActions = document.getElementById('header-actions');
    if (headerActions) {
      headerActions.innerHTML = `<a href="#/risk-details/new" class="btn btn-primary" style="${ctrlStyle}">+ New Risk Detail</a>`;
    }

    const filters = getFiltersFromHash();

    try {
      const prefs = await ViewPrefs.load('risk_details');
      _rdCatalog = prefs.catalog;
      _rdConfig  = prefs.config;

      const res = await Api.riskDetails.list({
        ...filters,
        limit: 200,
        sort: _rdConfig.sortBy,
        dir:  _rdConfig.sortDir,
      });
      const items = res.data || res || [];

      const typeFilter    = filters.risk_type          || '';

      const visibleCols = ViewPrefs.visibleColumns(_rdCatalog, _rdConfig);
      const colCount = visibleCols.length || 1;

      const headCells = visibleCols.map(col => {
        const active = _rdConfig.sortBy === col.id;
        const arrow  = active ? (_rdConfig.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
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
                <thead><tr id="rd-thead-row">${headCells}</tr></thead>
                <tbody id="rd-tbody">
                  <tr><td colspan="${colCount}" class="table-empty">Loading…</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      document.getElementById('riskdetails-center-filters')?.remove();
      const topHeader = document.getElementById('top-header');
      if (topHeader) {
        topHeader.style.position = 'relative';
        const wrap = document.createElement('div');
        wrap.id = 'riskdetails-center-filters';
        wrap.setAttribute('data-header-widget', '1');
        wrap.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;gap:.5rem;align-items:center;z-index:2;background:var(--bg);padding:.3rem .55rem;border-radius:6px;';
        wrap.innerHTML = `
          <input type="search" id="rd-search" class="form-control" placeholder="Search…"
            style="${ctrlStyle}width:160px;">
          <select id="rd-filter-type" class="form-control" style="${ctrlStyle}max-width:160px;">
            <option value="">Risk Type</option>
            ${RISK_TYPES.map(t => `<option value="${esc(t)}" ${typeFilter === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
          </select>
          <button id="rd-filter-clear" class="btn btn-secondary" style="${ctrlStyle}">Clear</button>`;
        topHeader.appendChild(wrap);
      }

      // ⚙ Columns button
      ViewPrefs.attachButton({
        moduleKey: 'risk_details',
        catalog:   _rdCatalog,
        current:   _rdConfig,
        onChange:  (newCfg) => { _rdConfig = newCfg; list(); },
      });

      _rdItems = items;
      renderTableRows(items);
      bindFilterEvents();

      el.querySelectorAll('#rd-thead-row th.sortable').forEach(th => {
        th.addEventListener('click', async () => {
          const col = th.dataset.sort;
          if (_rdConfig.sortBy === col) {
            _rdConfig.sortDir = _rdConfig.sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            _rdConfig.sortBy = col;
            _rdConfig.sortDir = 'asc';
          }
          try { const r = await Api.viewPrefs.save('risk_details', _rdConfig); _rdConfig = r.config; } catch (_) {}
          list();
        });
      });

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load risk details: ${esc(err.message)}</div>`;
    }
  }

  function renderTableRows(items, search) {
    const tbody = document.getElementById('rd-tbody');
    if (!tbody) return;
    const visibleCols = _rdCatalog ? ViewPrefs.visibleColumns(_rdCatalog, _rdConfig) : [];
    const colCount = visibleCols.length || 1;

    let rows = items;
    const q = (search == null ? (document.getElementById('rd-search')?.value || '') : search).toLowerCase().trim();
    if (q) {
      rows = rows.filter(r =>
        (r.risk_detail_name || '').toLowerCase().includes(q) ||
        (r.risk_type || '').toLowerCase().includes(q) ||
        (r.section_name || r.policy_section_name || '').toLowerCase().includes(q) ||
        (r.asset_name || '').toLowerCase().includes(q) ||
        (r.contact_name || '').toLowerCase().includes(q) ||
        (r.account_name || '').toLowerCase().includes(q) ||
        (r.policy_name || '').toLowerCase().includes(q)
      );
    }

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${colCount}" class="table-empty">No risk details found.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => `<tr>${visibleCols.map(col => {
      const fn = RD_CELLS[col.id];
      return `<td${col.id === 'actions' ? ' class="actions-cell"' : ''}>${fn ? fn(r) : esc(String(r[col.id] ?? '—'))}</td>`;
    }).join('')}</tr>`).join('');

    tbody.querySelectorAll('[data-delete-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id   = btn.dataset.deleteId;
        const name = btn.dataset.deleteName;
        if (!confirmDialog(`Delete risk detail "${name}"? This cannot be undone.`)) return;
        try {
          await Api.riskDetails.delete(id);
          showToast('Risk detail deleted.', 'success');
          list();
        } catch (err) {
          showToast('Delete failed: ' + err.message, 'error');
        }
      });
    });
  }

  function bindFilterEvents() {
    const typeEl   = document.getElementById('rd-filter-type');
    const clearEl  = document.getElementById('rd-filter-clear');
    const searchEl = document.getElementById('rd-search');

    const applyFilters = debounce(async () => {
      const params = {};
      if (typeEl && typeEl.value) params.risk_type = typeEl.value;
      if (_rdConfig) { params.sort = _rdConfig.sortBy; params.dir = _rdConfig.sortDir; }
      try {
        const res = await Api.riskDetails.list({ ...params, limit: 200 });
        _rdItems = res.data || res || [];
        renderTableRows(_rdItems);
      } catch (err) {
        showToast('Filter error: ' + err.message, 'error');
      }
    }, 350);

    const applySearch = debounce(() => renderTableRows(_rdItems), 200);

    if (typeEl)   typeEl.addEventListener('change', applyFilters);
    if (searchEl) searchEl.addEventListener('input', applySearch);
    if (clearEl) {
      clearEl.addEventListener('click', () => {
        if (typeEl)   typeEl.value   = '';
        if (searchEl) searchEl.value = '';
        applyFilters();
      });
    }
  }

  // ── Form ─────────────────────────────────────────────────────────────────

  async function form(id = null) {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    const isEdit = Boolean(id);
    setPageTitle(isEdit ? 'Edit Risk Detail' : 'New Risk Detail');
    setBreadcrumb(['Risk Details', isEdit ? 'Edit' : 'New']);

    const headerActions = document.getElementById('header-actions');
    if (headerActions) headerActions.innerHTML = '';

    const hashParams = getFiltersFromHash();

    try {
      const [contactsRes, accountsRes, sectionsRes, assetsRes, policiesRes, rdData] = await Promise.all([
        Api.contacts.list({ limit: 500 }),
        Api.accounts.list({ limit: 500 }),
        Api.policySections.list({ limit: 500 }),
        Api.assets.list({ limit: 500 }),
        Api.policies.list({ limit: 500 }),
        isEdit ? Api.riskDetails.get(id) : Promise.resolve({}),
      ]);

      const contacts = contactsRes.data || contactsRes || [];
      const accounts = accountsRes.data || accountsRes || [];
      const sections = sectionsRes.data || sectionsRes || [];
      const assets   = assetsRes.data   || assetsRes   || [];
      const policies = policiesRes.data || policiesRes || [];
      const d        = rdData.data      || rdData      || {};

      if (!isEdit) {
        if (hashParams.asset_id)          d.asset_id          = hashParams.asset_id;
        if (hashParams.policy_section_id) d.policy_section_id = hashParams.policy_section_id;
        if (hashParams.contact_id)        d.contact_id        = hashParams.contact_id;
        if (hashParams.account_id)        d.account_id        = hashParams.account_id;
      }

      const currentRiskType = d.risk_type || '';

      el.innerHTML = `
        <div class="form-page">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">${isEdit ? 'Edit Risk Detail' : 'New Risk Detail'}</h3>
            </div>
            <form id="rd-form" novalidate>

              <!-- ── Core Details ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Core Details</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label required">Risk Detail Name</label>
                    <input type="text" name="risk_detail_name" class="form-control" required
                      value="${esc(d.risk_detail_name || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Risk Type</label>
                    <select name="risk_type" id="rd-risk-type" class="form-control" required>
                      ${selectOpts(RISK_TYPES, currentRiskType, '— Select Risk Type —')}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Asset
                      <span style="font-size:.72rem;color:var(--text-muted);font-weight:normal;margin-left:.3rem;">pick to auto-fill contact, policy &amp; section</span>
                    </label>
                    <select name="asset_id" id="rd-asset" class="form-control">
                      ${assetOptions(assets, d.asset_id)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Policy</label>
                    <select name="policy_id" id="rd-policy" class="form-control">
                      ${policyOptions(policies, d.policy_id)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Policy Section
                      <span style="font-size:.72rem;color:var(--text-muted);font-weight:normal;margin-left:.3rem;">auto-filled from asset</span>
                    </label>
                    <input type="text" id="rd-section-display" class="form-control" readonly
                      placeholder="Select an asset to populate"
                      value="${(() => {
                        if (d.section_display) return esc(d.section_display);
                        if (d.policy_section_name) return esc(d.policy_section_name);
                        if (d.asset_section_text) return esc(d.asset_section_text);
                        if (d.asset_id) {
                          const a = assets.find(x => String(x.id) === String(d.asset_id));
                          if (a) return esc(a.asset_section || '');
                        }
                        return '';
                      })()}" />
                    <input type="hidden" name="policy_section_id" id="rd-section"
                      value="${esc(d.policy_section_id != null ? d.policy_section_id : '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Contact
                      <span style="font-size:.72rem;color:var(--text-muted);font-weight:normal;margin-left:.3rem;">pick first to filter assets</span>
                    </label>
                    <select name="contact_id" id="rd-contact" class="form-control">
                      ${contactOptions(contacts, d.contact_id)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Account</label>
                    <select name="account_id" id="rd-account" class="form-control">
                      ${accountOptions(accounts, d.account_id)}
                    </select>
                  </div>

                </div>
              </fieldset>

              <!-- ── Risk-type-specific fields (toggled by JS) ── -->
              <div id="rd-type-fields">
                ${motorFieldsHtml(d)}
                ${buildingFieldsHtml(d)}
                ${gitFieldsHtml(d)}
              </div>

              <!-- ── Common Fields (All Types) ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Security &amp; Notes</legend>
                <div class="form-grid form-grid-2">
                  <div class="form-group form-group-full">
                    <label class="form-label">Security Details</label>
                    <textarea name="security_details" class="form-control" rows="3">${esc(d.security_details || '')}</textarea>
                  </div>
                  <div class="form-group form-group-full">
                    <label class="form-label">Risk Notes</label>
                    <textarea name="risk_notes" class="form-control" rows="3">${esc(d.risk_notes || '')}</textarea>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Last Updated</label>
                    <input type="date" name="last_updated" class="form-control"
                      value="${esc(d.last_updated ? d.last_updated.slice(0,10) : new Date().toISOString().slice(0,10))}" />
                  </div>
                </div>
              </fieldset>

              <!-- ── Form Actions ── -->
              <div class="form-actions">
                <button type="submit" class="btn btn-primary" id="rd-submit-btn">
                  ${isEdit ? 'Save Changes' : 'Create Risk Detail'}
                </button>
                <a href="${isEdit ? `#/risk-details/${id}` : '#/risk-details'}" class="btn btn-secondary">Cancel</a>
              </div>

            </form>
          </div>
        </div>
      `;

      // Apply initial visibility
      applyRiskTypeVisibility(currentRiskType);
      wireCascading(assets, contacts, sections);
      bindFormEvents(id, isEdit);

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load form: ${esc(err.message)}</div>`;
    }
  }

  function applyRiskTypeVisibility(riskType) {
    const motorEl    = document.getElementById('riskfields-motor');
    const buildingEl = document.getElementById('riskfields-building');
    const gitEl      = document.getElementById('riskfields-git');

    if (motorEl)    motorEl.style.display    = riskType === 'Motor Risk'                  ? '' : 'none';
    if (buildingEl) buildingEl.style.display = riskType === 'Building Risk'               ? '' : 'none';
    if (gitEl)      gitEl.style.display      = riskType === 'Goods in Transit Risk'       ? '' : 'none';
  }

  /**
   * Cascading behaviour:
   *  - Picking a Contact filters the Asset dropdown to that contact's assets.
   *  - Picking an Asset auto-fills Contact, Policy, Account and Policy Section
   *    from that asset's own links (if they aren't already explicitly set).
   */
  // Set the value of a <select> that may be wrapped by makeSearchable —
  // update both the hidden <select> and the visible text input, and fire
  // change so dependent toggles (e.g. contact/account mutual exclusion) sync.
  function setSearchableValue(sel, value) {
    if (!sel) return;
    sel.value = value || '';
    const wrapper = sel.parentElement;
    const textInput = wrapper && wrapper.querySelector('input[type="text"]');
    if (textInput) {
      const opt = Array.from(sel.options).find(o => o.value === sel.value);
      textInput.value = opt ? opt.textContent : '';
    }
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Tear down a makeSearchable wrapper (if applied) and re-apply so the
  // visible dropdown reflects the select's current options.
  function reapplySearchable(sel) {
    if (!sel) return;
    const wrapper = sel.parentElement;
    if (wrapper && sel.dataset.searchable && wrapper !== sel) {
      const grandparent = wrapper.parentElement;
      if (grandparent) {
        grandparent.insertBefore(sel, wrapper);
        grandparent.removeChild(wrapper);
      }
      sel.dataset.searchable = '';
      sel.style.display = '';
    }
    if (typeof makeSearchable === 'function') makeSearchable(sel);
  }

  function wireCascading(assets, contacts, sections) {
    const contactEl = document.getElementById('rd-contact');
    const assetEl   = document.getElementById('rd-asset');
    const policyEl  = document.getElementById('rd-policy');
    const accountEl = document.getElementById('rd-account');
    const sectionEl = document.getElementById('rd-section');

    // Build an id→asset lookup for fast access.
    const assetById = new Map(assets.map(a => [String(a.id), a]));

    // Remember the original full options so we can restore when contact is cleared.
    const fullAssetOptions = assetEl ? assetEl.innerHTML : '';

    function filterAssetsByContact(contactId) {
      if (!assetEl) return;
      if (!contactId) {
        assetEl.innerHTML = fullAssetOptions;
      } else {
        const filtered = assets.filter(a => String(a.contact_id) === String(contactId));
        assetEl.innerHTML = assetOptions(filtered, assetEl.value);
        // If the current asset no longer belongs to this contact, clear it.
        if (assetEl.value && !assets.some(a =>
          String(a.contact_id) === String(contactId) && String(a.id) === String(assetEl.value)
        )) {
          assetEl.value = '';
        }
      }
      // The options changed — rebuild the searchable wrapper so its dropdown
      // and cached option list stay in sync.
      reapplySearchable(assetEl);
    }

    function autofillFromAsset(assetId) {
      const sectionDisplay = document.getElementById('rd-section-display');
      if (!assetId) {
        if (sectionEl) sectionEl.value = '';
        if (sectionDisplay) sectionDisplay.value = '';
        return;
      }
      const a = assetById.get(String(assetId));
      if (!a) return;
      // Always sync from asset — the asset is the authoritative source.
      if (contactEl && a.contact_id) setSearchableValue(contactEl, String(a.contact_id));
      if (policyEl  && a.policy_id)  setSearchableValue(policyEl,  String(a.policy_id));
      if (accountEl && a.account_id) setSearchableValue(accountEl, String(a.account_id));
      if (sectionEl)      sectionEl.value      = a.policy_section_id ? String(a.policy_section_id) : '';
      if (sectionDisplay) sectionDisplay.value = a.asset_section || '';
    }

    if (contactEl) contactEl.addEventListener('change', () => filterAssetsByContact(contactEl.value));
    if (assetEl)   assetEl.addEventListener('change',   () => autofillFromAsset(assetEl.value));

    // Initial sync (covers the edit case and hash-prefill case).
    if (contactEl && contactEl.value) filterAssetsByContact(contactEl.value);
    if (assetEl   && assetEl.value)   autofillFromAsset(assetEl.value);

    // Make the Asset dropdown searchable too. Do this AFTER any initial filter
    // so it's built from the correct option set.
    if (assetEl && typeof makeSearchable === 'function') makeSearchable(assetEl);
  }

  function bindFormEvents(id, isEdit) {
    const formEl     = document.getElementById('rd-form');
    const riskTypeEl = document.getElementById('rd-risk-type');

    if (riskTypeEl) {
      riskTypeEl.addEventListener('change', () => {
        applyRiskTypeVisibility(riskTypeEl.value);
      });
    }

    wireContactAccountToggle(formEl);

    if (formEl) {
      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('rd-submit-btn');
        if (btn) btn.disabled = true;
        const data = serializeForm(formEl);
        try {
          if (isEdit) {
            await Api.riskDetails.update(id, data);
            showToast('Risk detail updated.', 'success');
            navigate(`risk-details/${id}`);
          } else {
            const created = await Api.riskDetails.create(data);
            const newId   = (created.data || created).id;
            showToast('Risk detail created.', 'success');
            navigate(`risk-details/${newId}`);
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
      headerActions.innerHTML = `<a href="#/risk-details/${id}/edit" class="btn btn-primary">Edit</a>`;
    }

    try {
      const res = await Api.riskDetails.get(id);
      const d   = res.data || res || {};

      setPageTitle(esc(d.risk_detail_name || 'Risk Detail'));
      setBreadcrumb(['Risk Details', d.risk_detail_name || 'Detail']);

      // Build type-specific fields display
      let typeSpecificHtml = '';
      const riskType = d.risk_type || '';

      const field = (label, value) => `<div class="detail-field"><span class="detail-label">${label}</span><span class="detail-value">${value || '—'}</span></div>`;
      const bool  = (v) => v ? `<span class="bool-yes">&#10003; Yes</span>` : `<span class="bool-no">&#10007; No</span>`;

      if (riskType === 'Motor Risk') {
        typeSpecificHtml = `
          <div class="detail-section card">
            <div class="detail-section-title">Motor Risk</div>
            <div class="detail-grid">
              ${field('Stored / Parked Overnight', esc(d.stored_parked_overnight || '—'))}
              ${field('Tracking Device Fitted', esc(d.tracking_device_fitted || '—'))}
              ${field('Route / Operating Area', esc(d.route_operating_area || '—'))}
            </div>
          </div>`;
      } else if (riskType === 'Building Risk') {
        typeSpecificHtml = `
          <div class="detail-section card">
            <div class="detail-section-title">Building Risk</div>
            <div class="detail-grid">
              ${field('Occupancy / Use', esc(d.occupancy_use || '—'))}
              ${field('Construction Type', esc(d.construction_type || '—'))}
              ${field('Roof Construction', esc(d.roof_construction || '—'))}
              ${field('Wall Construction', esc(d.wall_construction || '—'))}
              ${field('Distance to Water', d.distance_to_water != null ? `${esc(d.distance_to_water)} m` : '—')}
              ${field('Flood Exposure', esc(d.flood_exposure || '—'))}
              ${field('Fire Exposure', esc(d.fire_exposure || '—'))}
            </div>
          </div>`;
      } else if (riskType === 'Goods in Transit Risk') {
        typeSpecificHtml = `
          <div class="detail-section card">
            <div class="detail-section-title">GIT Risk</div>
            <div class="detail-grid">
              ${field('Goods / Load Type', esc(d.goods_load_type || '—'))}
              ${field('Max Exposure Value', d.max_exposure_value ? formatCurrency(d.max_exposure_value) : '—')}
              ${field('Route / Operating Area', esc(d.git_route_operating_area || d.route_operating_area || '—'))}
              ${field('Security Details (GIT)', esc(d.git_security_details || '—'))}
            </div>
          </div>`;
      }

      el.innerHTML = `
        <div class="detail-view">

          <!-- Risk Detail -->
          <div class="detail-section card">
            <div class="detail-section-title">Risk Detail</div>
            <div class="detail-grid">
              ${field('Risk Detail Name', esc(d.risk_detail_name || '—'))}
              ${field('Risk Type', `<span class="badge badge-type">${esc(riskType || '—')}</span>`)}
              ${field('Last Updated', d.last_updated ? formatDate(d.last_updated) : (d.updated_at ? formatDate(d.updated_at) : '—'))}
            </div>
          </div>

          <!-- Links -->
          <div class="detail-section card">
            <div class="detail-section-title">Links</div>
            <div class="detail-grid">
              ${field('Policy Section', d.policy_section_id
                ? `<a href="#/policy-sections/${d.policy_section_id}">${esc(d.section_display || d.policy_section_name || d.section_name || '—')}</a>`
                : esc(d.section_display || d.asset_section_text || '—'))}
              ${field('Asset', d.asset_id ? `<a href="#/assets/${d.asset_id}">${esc(d.asset_name || '—')}</a>` : '—')}
              ${field('Policy', d.policy_id ? `<a href="#/policies/${d.policy_id}">${esc(d.policy_name || '—')}</a>` : '—')}
              ${field('Contact', esc(d.contact_name || '—'))}
              ${field('Account', esc(d.account_name || '—'))}
            </div>
          </div>

          <!-- Risk-type-specific fields -->
          ${typeSpecificHtml}

          <!-- Security & Notes -->
          ${d.security_details || d.risk_notes ? `
          <div class="detail-section card">
            <div class="detail-section-title">Security &amp; Notes</div>
            <div class="detail-text-fields">
              ${d.security_details ? `<div class="detail-text-item"><strong>Security Details</strong><p>${esc(d.security_details)}</p></div>` : ''}
              ${d.risk_notes ? `<div class="detail-text-item"><strong>Risk Notes</strong><p>${esc(d.risk_notes)}</p></div>` : ''}
            </div>
          </div>` : ''}

          <!-- Tabs: Documents / Timeline -->
          <div class="detail-section card" style="padding:0;">
            <div class="tabs-header" id="rd-tabs-header">
              <button class="tab-btn active" data-tab="documents">Documents</button>
              <button class="tab-btn"        data-tab="timeline">Timeline</button>
            </div>
            <div id="rd-tab-content" style="padding:1rem;">
              <div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>
            </div>
          </div>

        </div>
      `;

      // Wire tab clicks
      document.getElementById('rd-tabs-header').querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#rd-tabs-header .tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          loadRiskDetailTab(id, btn.dataset.tab);
        });
      });

      // Load default tab
      loadRiskDetailTab(id, 'documents');

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load risk detail: ${esc(err.message)}</div>`;
    }
  }

  // ── Tab loader for Risk Detail ────────────────────────────────────────────

  async function loadRiskDetailTab(rdId, tab) {
    const tabEl = document.getElementById('rd-tab-content');
    if (!tabEl) return;
    tabEl.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    try {
      switch (tab) {

        case 'documents': {
          const res  = await Api.documents.list({ module: 'risk-details', record_id: rdId });
          const docs = res.data || [];
          tabEl.innerHTML = `
            <div class="tab-toolbar">
              <label class="btn btn-primary btn-sm" for="rd-doc-upload">+ Upload Document</label>
              <input type="file" id="rd-doc-upload" style="display:none;"
                accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.csv" />
            </div>
            ${docs.length ? `
            <table class="table">
              <thead><tr><th>File Name</th><th>Type</th><th>Size</th><th>Uploaded By</th><th>Date</th><th></th></tr></thead>
              <tbody>${docs.map(d => `
                <tr>
                  <td>${esc(d.original_name)}</td>
                  <td>${esc(d.file_type || '—')}</td>
                  <td>${typeof Utils !== 'undefined' && Utils.formatBytes ? Utils.formatBytes(d.file_size) : d.file_size}</td>
                  <td>${esc(d.uploaded_by_name || '—')}</td>
                  <td>${d.uploaded_at ? formatDate(d.uploaded_at) : '—'}</td>
                  <td style="white-space:nowrap;">
                    <a href="/api/documents/${d.id}/view" target="_blank" class="btn btn-xs btn-outline">View</a>
                    <button class="btn btn-xs btn-danger doc-del-btn" data-doc-id="${d.id}" data-doc-name="${esc(d.original_name)}">Delete</button>
                  </td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No documents uploaded yet.</p>`}
          `;
          const uploadEl = document.getElementById('rd-doc-upload');
          if (uploadEl) {
            uploadEl.addEventListener('change', async e => {
              const file = e.target.files[0];
              if (!file) return;
              try {
                const fd = new FormData();
                fd.append('file', file);
                fd.append('module', 'risk-details');
                fd.append('record_id', rdId);
                await Api.documents.upload(fd);
                showToast('Document uploaded.', 'success');
                loadRiskDetailTab(rdId, 'documents');
              } catch (err) {
                showToast('Upload failed: ' + (err.message || err), 'error');
              }
            });
          }
          tabEl.querySelectorAll('.doc-del-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
              const docName = btn.dataset.docName;
              if (!confirm(`Delete document "${docName}"? This cannot be undone.`)) return;
              try {
                await Api.documents.delete(btn.dataset.docId);
                showToast('Document deleted.', 'success');
                loadRiskDetailTab(rdId, 'documents');
              } catch (err) {
                showToast('Delete failed: ' + (err.message || err), 'error');
              }
            });
          });
          break;
        }

        case 'timeline': {
          const entries = await Api.timeline.forRecord('risk_details', rdId);
          const rows = Array.isArray(entries) ? entries : (entries.data || []);
          tabEl.innerHTML = `
            <div style="padding:.25rem 0;">
              ${renderTimeline(rows, 'No activity recorded for this risk detail yet.')}
            </div>`;
          break;
        }

        default:
          tabEl.innerHTML = '';
      }
    } catch (err) {
      tabEl.innerHTML = `<p class="tab-empty" style="color:var(--danger);">Failed to load: ${esc(err.message)}</p>`;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return { list, form, detail };

})();
