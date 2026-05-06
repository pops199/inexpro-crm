/* ═══════════════════════════════════════════════════════════════════════════
   Assets component  —  Insured Assets (spec section 11)
   ═══════════════════════════════════════════════════════════════════════════ */

const Assets = (() => {

  // ── Constants ────────────────────────────────────────────────────────────

  // Asset type → allowed policy sections mapping.
  // Selecting an asset type constrains the section dropdown to just that type's sections.
  const SECTIONS_BY_TYPE = {
    'Motor': [
      'Motor \u2013 Light Motor Vehicle',
      'Motor \u2013 Light Delivery Vehicle',
      'Motor \u2013 Light Commercial 3 500 \u2013 7 500kg',
      'Motor \u2013 Heavy Commercial > 7 500kg',
      'Motor \u2013 Commercial Vehicle',
      'Motor \u2013 Fleet',
      'Motor \u2013 Motorcycles',
      'Motor \u2013 Trailers / Caravans',
      'Motor \u2013 Agricultural Vehicles',
      'Motor \u2013 Plant / Mobile Machinery',
      'Motor \u2013 Buses / Passenger Transport',
      'Motor \u2013 Special Types',
      'Motor \u2013 Watercraft',
      'Motor \u2013 Motor Traders Internal Risk',
      'Motor \u2013 Motor Traders External Risk',
      'Motor \u2013 Third Party Only',
      'Motor \u2013 Third Party Fire & Theft',
      'Motor \u2013 Golf Carts / ATVs / Quad Bikes',
      'Motor \u2013 Classic / Vintage Vehicles',
      'Motor \u2013 Hired-In / Borrowed Vehicles',
      'Motor \u2013 Cross-Border Extension',
      'Motor \u2013 Credit Shortfall / GAP Cover',
      'Motor \u2013 Car Hire / Temporary Transport',
      'Motor \u2013 Roadside / Emergency Assist',
      'Motor \u2013 Windscreen / Glass',
      'Motor \u2013 Non-Standard Accessories',
      'Motor \u2013 Mechanical / Electrical Breakdown Warranty',
      'Motor \u2013 Excess Waiver / Buy-Down',
      'Motor \u2013 Ride-Hailing / e-Hailing (Uber/Bolt)',
      'Motor \u2013 Electric Vehicle (EV) Cover',
    ],
    'Property': [
      'Property \u2013 Buildings (Commercial)',
      'Property \u2013 Buildings (Domestic / Homeowners)',
      'Property \u2013 Household Contents',
      'Property \u2013 Office Contents',
      'Property \u2013 Business Contents',
      'Property \u2013 Stock',
      'Property \u2013 Plant, Machinery & Landlord\u2019s Fixtures',
      'Property \u2013 Tenants Improvements',
      'Property \u2013 Portable Possessions / All Risks',
      'Property \u2013 Specified All Risks',
      'Property \u2013 Unspecified All Risks',
      'Property \u2013 Theft',
      'Property \u2013 Money',
      'Property \u2013 Glass',
      'Property \u2013 Business Interruption / Loss of Income',
      'Property \u2013 Accounts Receivable',
      'Property \u2013 Fine Arts & Valuables',
      'Property \u2013 Sectional Title / Body Corporate',
      'Property \u2013 Homeowners Association / Estate',
      'Property \u2013 Landlord\u2019s Cover / Loss of Rent',
      'Property \u2013 Holiday Home / Second Property',
      'Property \u2013 Subsidence & Landslip',
      'Property \u2013 Power Surge / Geyser',
      'Property \u2013 Deterioration of Stock (Non-Engineering)',
      'Property \u2013 Alternative Accommodation / Loss of Use',
      'Property \u2013 Removal of Debris',
      'Property \u2013 Garden & Landscaping',
      'Property \u2013 Deep Freeze / Refrigerated Contents',
      'Property \u2013 Domestic Employee Effects',
      'Property \u2013 Visitor / Guest Effects',
      'Property \u2013 Keys & Locks Replacement',
      'Property \u2013 Mirror & Internal Fixed Glass',
      'Property \u2013 Electronic Equipment (Standalone)',
      'Property \u2013 Solar Panels / Inverter / Battery',
      'Property \u2013 Rent Guarantee / Rent Default',
    ],
    'Fire': [
      'Fire \u2013 Commercial',
      'Fire \u2013 Industrial',
      'Fire \u2013 Domestic',
      'Fire \u2013 Thatch Roof Extension',
      'Fire \u2013 Spontaneous Combustion',
      'Fire \u2013 Forestry / Veld Fire',
      'Fire \u2013 Explosion & Boiler',
    ],
    'Liability': [
      'Liability \u2013 Broadform Liability',
      'Liability \u2013 Public Liability',
      'Liability \u2013 Products Liability',
      'Liability \u2013 Professional Indemnity',
      'Liability \u2013 Directors & Officers',
      'Liability \u2013 Employers Liability',
      'Liability \u2013 Personal Legal Liability',
      'Liability \u2013 Extended Personal Legal Liability',
      'Liability \u2013 Commercial Legal Liability',
      'Liability \u2013 Defective Workmanship',
      'Liability \u2013 Cyber Liability',
      'Liability \u2013 Employment Practices Liability (EPLI)',
      'Liability \u2013 Environmental / Pollution Liability',
      'Liability \u2013 Product Recall',
      'Liability \u2013 Product Guarantee',
      'Liability \u2013 Clinical Trials Insurance',
      'Liability \u2013 Excess / Umbrella Liability',
      'Liability \u2013 Dog Owner Liability',
      'Liability \u2013 Landlord Liability',
      'Liability \u2013 Statutory Liability',
      'Liability \u2013 Contractual Liability',
      'Liability \u2013 Office Bearers / Trustees',
    ],
    'Goods in Transit': [
      'Goods in Transit \u2013 Heavy Commercial > 7 500kg',
      'Goods in Transit \u2013 Light Commercial / LDV',
      'Goods in Transit \u2013 General',
      'GIT Contingency',
      'Goods in Transit \u2013 Carriers Liability',
      'Goods in Transit \u2013 Freight Forwarders Liability',
      'Goods in Transit \u2013 Cold Chain / Refrigerated',
      'Goods in Transit \u2013 Cash in Transit (CIT)',
      'Goods in Transit \u2013 Couriers / Parcel Delivery',
      'Goods in Transit \u2013 Household Removals',
    ],
    'Engineering': [
      'Engineering \u2013 Machinery Breakdown',
      'Engineering \u2013 Interruption Following Breakdown',
      'Engineering \u2013 Deterioration of Stock',
      'Engineering \u2013 Electronic Equipment',
      'Engineering \u2013 Computer All Risks',
      'Engineering \u2013 Contract Works / Construction All Risks',
      'Engineering \u2013 Erection All Risks (EAR)',
      'Engineering \u2013 Boiler & Pressure Vessel',
      'Engineering \u2013 Contractors Plant All Risks',
      'Engineering \u2013 Contractors Liability',
      'Engineering \u2013 Advance Loss of Profits (ALOP)',
      'Engineering \u2013 Maintenance / Defects Liability Period',
      'Engineering \u2013 Renewable Energy (Solar/Wind)',
      'Engineering \u2013 Lift & Escalator',
    ],
    'Accident & Health': [
      'Personal Accident',
      'Group Personal Accident',
      'Stated Benefits',
      'Fidelity Guarantee',
      'Hospital Cash Plan',
      'Dread Disease / Critical Illness',
      'Funeral Expenses',
      'Income Protection (Short-term / Temporary)',
      'Disability \u2013 Permanent',
      'Disability \u2013 Temporary Total',
      'Repatriation / Evacuation Costs',
      'Education Benefit',
    ],
    'Miscellaneous': [
      'Business All Risks',
      'Accidental Damage',
      'Communication Device All Risk',
      'Legal Costs & Legal Expenses',
      'Identity Theft',
      'Emergency Assistance / Home Assist',
      'Theft from Bank Account / Cyber',
      'Sasria',
      'Travel Insurance \u2013 Single Trip',
      'Travel Insurance \u2013 Annual Multi-Trip',
      'Extended Warranty',
      'Pet Insurance',
      'Wedding Insurance',
      'Event Insurance',
      'Political Risk',
      'Trade Credit Insurance',
      'Kidnap & Ransom',
      'Commercial Crime (Standalone)',
      'Bankers Blanket Bond',
      'Film & Entertainment',
      'Hole-in-One / Prize Indemnity',
      'Cyber Insurance (Standalone)',
      'Machinery & Equipment Hire',
      'Loss of Licence / Liquor Licence',
      'Spectacles / Hearing Aids / Medical Devices',
    ],
    'Agriculture': [
      'Agriculture \u2013 Crops',
      'Agriculture \u2013 Livestock',
      'Agriculture \u2013 Fire',
      'Agriculture \u2013 Combined Farming',
      'Agriculture \u2013 Forestry',
      'Agriculture \u2013 Hail (Standalone)',
      'Agriculture \u2013 Multi-Peril Crop Insurance (MPCI)',
      'Agriculture \u2013 Game / Wildlife',
      'Agriculture \u2013 Stud Animals / Bloodstock',
      'Agriculture \u2013 Aquaculture',
      'Agriculture \u2013 Farm Buildings & Implements',
      'Agriculture \u2013 Irrigation & Pivots',
      'Agriculture \u2013 Produce in Storage',
    ],
    'Marine': [
      'Marine \u2013 Cargo',
      'Marine \u2013 Hull',
      'Marine \u2013 Pleasure Craft',
      'Marine \u2013 Liability',
      'Marine \u2013 Stock Throughput',
      'Marine \u2013 Open Cover / Floating Policy',
      'Marine \u2013 War & Strikes (P&I)',
      'Marine \u2013 Loss of Hire / Demurrage',
      'Marine \u2013 Charterers Liability',
    ],
    'Aviation': [
      'Aviation \u2013 Hull',
      'Aviation \u2013 Liability',
      'Aviation \u2013 Combined',
      'Aviation \u2013 Passenger Liability',
      'Aviation \u2013 Ground Risk',
      'Aviation \u2013 Drone / UAV',
      'Aviation \u2013 Hangar Keepers Liability',
      'Aviation \u2013 Loss of Licence (Pilot)',
    ],
    'Guarantee': [
      'Guarantee \u2013 Performance Bond',
      'Guarantee \u2013 Contract Guarantee',
      'Guarantee \u2013 Bid Bond',
      'Guarantee \u2013 Advance Payment Bond',
      'Guarantee \u2013 Retention Bond',
      'Guarantee \u2013 Payment Guarantee',
      'Guarantee \u2013 Rental / Lease Guarantee',
      'Guarantee \u2013 Customs & Excise Bond',
      'Guarantee \u2013 Court Bond / Legal Guarantee',
      'Guarantee \u2013 Mining Rehabilitation Bond',
      'Guarantee \u2013 Reclamation Bond',
    ],
    'SASRIA': [
      'SASRIA \u2013 Material Damage (Fire Coupon)',
      'SASRIA \u2013 Motor Coupon',
      'SASRIA \u2013 Business Interruption',
      'SASRIA \u2013 Contract Works Coupon',
      'SASRIA \u2013 Goods in Transit Coupon',
      'SASRIA \u2013 Money Coupon',
      'SASRIA \u2013 Construction & Plant Risk',
    ],
  };

  const ASSET_TYPES = Object.keys(SECTIONS_BY_TYPE);
  const ASSET_SECTION_TYPES = Object.values(SECTIONS_BY_TYPE).reduce((a, b) => a.concat(b), []);

  const SA_PROVINCES = [
    'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal',
    'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape',
  ];

  const ASSET_STATUSES = [
    'Active',
    'Inactive',
    'Sold',
    'Written Off',
    'Stolen',
    'Decommissioned',
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

  function policyOptions(policies, selectedId) {
    return [{ id: '', policy_name: '— None —' }, ...policies].map(p =>
      `<option value="${esc(p.id)}" ${String(p.id) === String(selectedId) ? 'selected' : ''}>${esc(p.policy_name || '')}</option>`
    ).join('');
  }

  function sectionOptions(sections, selectedId) {
    return [{ id: '', section_name: '— None —' }, ...sections].map(s =>
      `<option value="${esc(s.id)}" ${String(s.id) === String(selectedId) ? 'selected' : ''}>${esc(s.section_name || '')}</option>`
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
    for (const [key, val] of fd.entries()) {
      data[key] = sanitiseInput(val);
    }
    return data;
  }

  // ── Searchable product select + Add Product button ────────────────────
  function wireAssetProductPicker(formEl) {
    if (!formEl) return;
    const sel = formEl.querySelector('#ast-product-select');
    if (sel && typeof makeSearchable === 'function') {
      makeSearchable(sel);
      // makeSearchable wraps the select in a content-sized div; force it to
      // fill the flex column so it lines up with the + Add button.
      const wrapper = sel.parentNode;
      if (wrapper && wrapper !== formEl) {
        wrapper.style.flex     = '1 1 auto';
        wrapper.style.minWidth = '0';
      }
    }

    const libBtn = formEl.querySelector('#ast-product-library-btn');
    if (libBtn) libBtn.addEventListener('click', () => {
      navigate('products');
    });
  }

  // ── List ─────────────────────────────────────────────────────────────────

  // ── Catalog cell renderers ───────────────────────────────────────────────
  const ASSET_CELLS = {
    asset_name:          a => `<a href="#/assets/${a.id}">${esc(a.asset_name || '—')}</a>`,
    asset_type:          a => esc(a.asset_type || '—'),
    asset_section:       a => esc(a.asset_section || '—'),
    make_model_year:     a => { const x = [a.make, a.model, a.year].filter(Boolean).map(esc).join(' '); return x || '—'; },
    registration_number: a => esc(a.registration_number || '—'),
    vin_number:          a => esc(a.vin_number || '—'),
    serial_number:       a => esc(a.serial_number || '—'),
    item_number:         a => esc(a.item_number || '—'),
    fleet_number:        a => esc(a.fleet_number || '—'),
    asset_status:        a => `<span class="badge" data-status="${esc(a.asset_status || '')}">${esc(a.asset_status || '—')}</span>`,
    asset_value:         a => a.asset_value != null ? formatCurrency(a.asset_value) : '—',
    sum_insured:         a => a.sum_insured != null ? formatCurrency(a.sum_insured) : '—',
    premium:             a => a.premium != null ? formatCurrency(a.premium) : '—',
    party_name:          a => esc(a.contact_name || a.account_name || '—'),
    policy_name:         a => a.policy_id ? `<a href="#/policies/${a.policy_id}">${esc(a.policy_name || a.policy_number || '—')}</a>` : '—',
    policy_section_name: a => esc(a.policy_section_name || a.asset_section || '—'),
    date_acquired:       a => a.date_acquired ? formatDate(a.date_acquired) : '—',
    created_at:          a => a.created_at ? formatDate(a.created_at) : '—',
    updated_at:          a => a.updated_at ? formatDate(a.updated_at) : '—',
    actions:             a => `
      <div style="display:flex;gap:.25rem;flex-wrap:nowrap;white-space:nowrap;">
        <a href="#/assets/${a.id}" class="btn btn-sm btn-secondary">View</a>
        <a href="#/assets/${a.id}/edit" class="btn btn-sm btn-primary">Edit</a>
        <button class="btn btn-sm btn-danger" data-delete-id="${a.id}" data-delete-name="${esc(a.asset_name || '')}">Delete</button>
      </div>`,
  };

  let _assetCatalog = null;
  let _assetConfig  = null;

  async function list() {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    setPageTitle('Assets');
    setBreadcrumb(['Assets']);

    const ctrlStyle = 'height:28px;padding:.15rem .4rem;font-size:.78rem;line-height:1;';
    const headerActions = document.getElementById('header-actions');
    if (headerActions) {
      headerActions.innerHTML = `<a href="#/assets/new" class="btn btn-primary" style="${ctrlStyle}">+ New Asset</a>`;
    }

    const filters = getFiltersFromHash();

    try {
      const prefs = await ViewPrefs.load('assets');
      _assetCatalog = prefs.catalog;
      _assetConfig  = prefs.config;

      const res = await Api.assets.list({
        ...filters,
        limit: 200,
        sort: _assetConfig.sortBy,
        dir:  _assetConfig.sortDir,
      });
      const assets = res.data || res || [];

      const typeFilter    = filters.asset_type || '';
      const statusFilter  = filters.status || '';
      const searchFilter  = filters.q          || '';

      const visibleCols = ViewPrefs.visibleColumns(_assetCatalog, _assetConfig);
      const colCount = visibleCols.length || 1;

      const headCells = visibleCols.map(col => {
        const active = _assetConfig.sortBy === col.id;
        const arrow  = active ? (_assetConfig.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
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
                <thead><tr id="asset-thead-row">${headCells}</tr></thead>
                <tbody id="asset-tbody">
                  <tr><td colspan="${colCount}" class="table-empty">Loading…</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      document.getElementById('assets-center-filters')?.remove();
      const topHeader = document.getElementById('top-header');
      if (topHeader) {
        topHeader.style.position = 'relative';
        const wrap = document.createElement('div');
        wrap.id = 'assets-center-filters';
        wrap.setAttribute('data-header-widget', '1');
        wrap.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;gap:.5rem;align-items:center;z-index:2;background:var(--bg);padding:.3rem .55rem;border-radius:6px;';
        wrap.innerHTML = `
          <input type="search" id="asset-search" class="form-control" placeholder="Search…"
            value="${esc(searchFilter)}"
            style="${ctrlStyle}width:160px;">
          <select id="asset-filter-type" class="form-control" style="${ctrlStyle}max-width:140px;">
            <option value="">Type</option>
            ${ASSET_TYPES.map(t => `<option value="${esc(t)}" ${typeFilter === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
          </select>
          <select id="asset-filter-status" class="form-control" style="${ctrlStyle}max-width:140px;">
            <option value="">Status</option>
            ${ASSET_STATUSES.map(s => `<option value="${esc(s)}" ${statusFilter === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
          </select>
          <button id="asset-filter-clear" class="btn btn-secondary" style="${ctrlStyle}">Clear</button>`;
        topHeader.appendChild(wrap);
      }

      // ⚙ Columns button
      ViewPrefs.attachButton({
        moduleKey: 'assets',
        catalog:   _assetCatalog,
        current:   _assetConfig,
        onChange:  (newCfg) => { _assetConfig = newCfg; list(); },
      });

      renderTableRows(assets, searchFilter);
      bindFilterEvents();

      el.querySelectorAll('#asset-thead-row th.sortable').forEach(th => {
        th.addEventListener('click', async () => {
          const col = th.dataset.sort;
          if (_assetConfig.sortBy === col) {
            _assetConfig.sortDir = _assetConfig.sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            _assetConfig.sortBy = col;
            _assetConfig.sortDir = 'asc';
          }
          try { const r = await Api.viewPrefs.save('assets', _assetConfig); _assetConfig = r.config; } catch (_) {}
          list();
        });
      });

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load assets: ${esc(err.message)}</div>`;
    }
  }

  function renderTableRows(assets, search) {
    const tbody = document.getElementById('asset-tbody');
    if (!tbody) return;
    const visibleCols = _assetCatalog ? ViewPrefs.visibleColumns(_assetCatalog, _assetConfig) : [];
    const colCount = visibleCols.length || 1;

    let rows = assets;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(a =>
        (a.asset_name          || '').toLowerCase().includes(q) ||
        (a.registration_number || '').toLowerCase().includes(q) ||
        (a.make                || '').toLowerCase().includes(q) ||
        (a.model               || '').toLowerCase().includes(q) ||
        (a.contact_name        || '').toLowerCase().includes(q) ||
        (a.account_name        || '').toLowerCase().includes(q)
      );
    }

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${colCount}" class="table-empty">No assets found.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(a => `<tr>${visibleCols.map(col => {
      const fn = ASSET_CELLS[col.id];
      return `<td${col.id === 'actions' ? ' class="actions-cell"' : ''}>${fn ? fn(a) : esc(String(a[col.id] ?? '—'))}</td>`;
    }).join('')}</tr>`).join('');

    tbody.querySelectorAll('[data-delete-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id   = btn.dataset.deleteId;
        const name = btn.dataset.deleteName;
        if (!confirmDialog(`Delete asset "${name}"? This cannot be undone.`)) return;
        try {
          await Api.assets.delete(id);
          showToast('Asset deleted.', 'success');
          list();
        } catch (err) {
          showToast('Delete failed: ' + err.message, 'error');
        }
      });
    });
  }

  function bindFilterEvents() {
    const searchEl  = document.getElementById('asset-search');
    const typeEl    = document.getElementById('asset-filter-type');
    const statusEl  = document.getElementById('asset-filter-status');
    const clearEl   = document.getElementById('asset-filter-clear');

    const applyFilters = debounce(async () => {
      const params = {};
      if (searchEl.value.trim()) params.q          = searchEl.value.trim();
      if (typeEl.value)          params.asset_type  = typeEl.value;
      if (statusEl.value)        params.status      = statusEl.value;
      if (_assetConfig) { params.sort = _assetConfig.sortBy; params.dir = _assetConfig.sortDir; }
      try {
        const res = await Api.assets.list({ ...params, limit: 200 });
        renderTableRows(res.data || res || [], params.q || '');
      } catch (err) {
        showToast('Filter error: ' + err.message, 'error');
      }
    }, 350);

    if (searchEl) searchEl.addEventListener('input', applyFilters);
    if (typeEl)   typeEl.addEventListener('change', applyFilters);
    if (statusEl) statusEl.addEventListener('change', applyFilters);

    if (clearEl) {
      clearEl.addEventListener('click', () => {
        if (searchEl) searchEl.value = '';
        if (typeEl)   typeEl.value   = '';
        if (statusEl) statusEl.value = '';
        applyFilters();
      });
    }
  }

  // ── Dynamic field visibility by asset type ───────────────────────────────

  function wireAssetTypeToggle(typeSelect) {
    /*
     * Field visibility rules per asset type:
     *
     * reg / VIN / engine  → road/powered vehicles + plant & equipment
     * make / model / year → vehicles, plant & equipment, electronics, portable possessions, other
     * serial_number       → plant & equipment, electronics, portable possessions,
     *                       building/structure, stock/inventory, other
     *
     * When no type is selected (blank), show ALL fields.
     */
    const FIELD_RULES = {
      'Motor':             { reg: true,  vin: true,  engine: true,  serial: false, makeModel: true,  mmNumber: true,  fleetNo: true  },
      'Property':          { reg: false, vin: false, engine: false, serial: true,  makeModel: false, mmNumber: false, fleetNo: false },
      'Fire':              { reg: false, vin: false, engine: false, serial: true,  makeModel: false, mmNumber: false, fleetNo: false },
      'Liability':         { reg: false, vin: false, engine: false, serial: false, makeModel: false, mmNumber: false, fleetNo: false },
      'Goods in Transit':  { reg: true,  vin: true,  engine: true,  serial: false, makeModel: true,  mmNumber: true,  fleetNo: true  },
      'Engineering':       { reg: false, vin: false, engine: true,  serial: true,  makeModel: true,  mmNumber: false, fleetNo: false },
      'Accident & Health': { reg: false, vin: false, engine: false, serial: false, makeModel: false, mmNumber: false, fleetNo: false },
      'Miscellaneous':     { reg: false, vin: false, engine: false, serial: true,  makeModel: true,  mmNumber: false, fleetNo: false },
      'Agriculture':       { reg: true,  vin: false, engine: true,  serial: true,  makeModel: true,  mmNumber: false, fleetNo: false },
      'Marine':            { reg: true,  vin: false, engine: true,  serial: true,  makeModel: true,  mmNumber: false, fleetNo: false },
      'Aviation':          { reg: true,  vin: false, engine: true,  serial: true,  makeModel: true,  mmNumber: false, fleetNo: false },
      'Guarantee':         { reg: false, vin: false, engine: false, serial: false, makeModel: false, mmNumber: false, fleetNo: false },
      'SASRIA':            { reg: false, vin: false, engine: false, serial: false, makeModel: false, mmNumber: false, fleetNo: false },
    };

    function show(name, visible) {
      const el = document.querySelector(`[name="${name}"]`);
      if (!el) return;
      (el.closest('.form-group') || el.parentElement).style.display = visible ? '' : 'none';
    }

    function applyType(type) {
      // When nothing selected hide all fields until a type is chosen
      const r = FIELD_RULES[type] || { reg: false, vin: false, engine: false, serial: false, makeModel: false, mmNumber: false, fleetNo: false };

      show('registration_number', r.reg);
      show('vin_number',          r.vin);
      show('engine_number',       r.engine);
      show('serial_number',       r.serial);
      show('make',                r.makeModel);
      show('model',               r.makeModel);
      show('year',                r.makeModel);
      show('mm_number',           r.mmNumber);
      show('fleet_number',        r.fleetNo);

      // Show / hide financial interest block (vehicles only)
      const isVehicle = ['Motor','Goods in Transit','Marine','Aviation','Agriculture'].includes(type);
      const finBlock = document.getElementById('financial-interest-block');
      if (finBlock) finBlock.style.display = isVehicle ? '' : 'none';

      // Show / hide vehicle risk details block (vehicles only)
      const riskBlock = document.getElementById('vehicle-risk-details-block');
      if (riskBlock) riskBlock.style.display = isVehicle ? '' : 'none';

      // Show / hide address block — shown for buildings AND vehicles (risk address)
      const isBuildingType = ['Property', 'Fire', 'Agriculture'].includes(type);
      const isVehicleType  = ['Motor', 'Goods in Transit', 'Marine', 'Aviation'].includes(type);
      const showAddress    = isBuildingType || isVehicleType;
      const addrBlock = document.getElementById('asset-address-block');
      if (addrBlock) {
        addrBlock.style.display = showAddress ? '' : 'none';
        const legend = addrBlock.querySelector('.form-section-title');
        if (legend) legend.textContent = isVehicleType ? 'Risk Address' : 'Building Address';
      }
      // Mark address/city as required only for buildings — vehicles are optional
      const addrInput = document.querySelector('[name="address"]');
      if (addrInput) addrInput.required = isBuildingType;
      const cityInput = document.querySelector('[name="city"]');
      if (cityInput) cityInput.required = isBuildingType;

      // Hide the entire Vehicle/Item Details fieldset when no relevant fields
      const vehicleFieldset = document.getElementById('vehicle-item-details-block');
      if (vehicleFieldset) {
        const anyVisible = r.reg || r.vin || r.engine || r.serial || r.makeModel || r.mmNumber || r.fleetNo;
        vehicleFieldset.style.display = anyVisible ? '' : 'none';
      }

      // Show / hide Vehicle Extras fieldset (only for vehicle types)
      const extrasFieldset = document.getElementById('vehicle-extras-fieldset');
      if (extrasFieldset) extrasFieldset.style.display = isVehicle ? '' : 'none';

      // Show / hide Excess fieldset (vehicle types + property)
      const showExcess = ['Motor','Goods in Transit','Marine','Aviation','Agriculture','Property'].includes(type);
      const excessFieldset = document.getElementById('excess-fieldset');
      if (excessFieldset) excessFieldset.style.display = showExcess ? '' : 'none';

      // Update section legend
      const legend = vehicleFieldset?.querySelector('.form-section-title');
      if (legend) {
        if (!type)                                   legend.textContent = 'Vehicle / Item Details';
        else if (type === 'Motor')                   legend.textContent = 'Vehicle Details';
        else if (type === 'Marine')                  legend.textContent = 'Vessel Details';
        else if (type === 'Aviation')                legend.textContent = 'Aircraft Details';
        else if (type === 'Goods in Transit')        legend.textContent = 'Vehicle / Transit Details';
        else if (type === 'Engineering')             legend.textContent = 'Plant & Equipment Details';
        else if (type === 'Agriculture')             legend.textContent = 'Farm Asset Details';
        else if (type === 'Property' || type === 'Fire') legend.textContent = 'Building / Structure Details';
        else                                         legend.textContent = 'Item Details';
      }

      // Refresh Policy Section dropdown to only show sections for the chosen type.
      const sectionEl = document.querySelector('[name="asset_section"]');
      if (sectionEl && sectionEl.tagName === 'SELECT') {
        const allowed = SECTIONS_BY_TYPE[type] || [];
        const current = sectionEl.value;
        sectionEl.innerHTML =
          `<option value="">${allowed.length ? '— Select Section —' : '— Select asset type first —'}</option>` +
          allowed.map(s => `<option value="${esc(s)}" ${current === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
        // If the prior value is no longer valid for this type, clear it and re-render dependent fields.
        if (current && !allowed.includes(current)) {
          sectionEl.value = '';
          sectionEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }

    applyType(typeSelect.value);
    typeSelect.addEventListener('change', () => applyType(typeSelect.value));
  }

  // ── Section-specific fields mapping ───────────────────────────────────────

  const SECTION_FIELD_DEFS = {
    // Motor sections
    'Motor': [
      { name: 'use_type', label: 'Use Type', type: 'select', options: ['Private','Business','Dual Purpose','Hire & Reward','Courtesy'] },
      { name: 'gvm', label: 'GVM (kg)', type: 'text' },
      { name: 'tracking_device', label: 'Tracking Device', type: 'text', placeholder: 'e.g. Tracker, Netstar, Matrix' },
      { name: 'territory', label: 'Territory', type: 'select', options: ['RSA Only','RSA & Neighbouring','Cross-border / SADC','Worldwide'] },
      { name: 'cover_type', label: 'Cover Type', type: 'select', options: ['Comprehensive','Third Party Fire & Theft','Third Party Only','Balance of Third Party'] },
      { name: 'regular_driver', label: 'Regular Driver', type: 'text' },
      { name: 'credit_shortfall', label: 'Credit Shortfall Cover', type: 'checkbox' },
    ],
    // Property / Buildings
    'Property': [
      { name: 'construction_type', label: 'Construction Type', type: 'select', options: ['Standard (Brick & Tile)','Non-Standard','Wood Frame','Steel','Prefab','Thatch','Mixed'] },
      { name: 'roof_type', label: 'Roof Type', type: 'select', options: ['Tile','Metal / IBR','Thatch','Slate','Concrete','Other'] },
      { name: 'occupancy', label: 'Occupancy', type: 'select', options: ['Residential – Owner','Residential – Tenant','Commercial','Industrial','Mixed','Vacant'] },
      { name: 'flat_no_floors', label: 'Floors / Unit Number', type: 'text' },
      { name: 'perils_covered', label: 'Perils Covered', type: 'text', placeholder: 'Fire, Storm, Flood, Earthquake, etc.' },
      { name: 'subsidence_cover', label: 'Subsidence Cover', type: 'checkbox' },
      { name: 'geyser_cover', label: 'Geyser Cover', type: 'checkbox' },
      { name: 'security_measures', label: 'Security Measures', type: 'text', placeholder: 'Alarm, Armed Response, CCTV, etc.' },
    ],
    // Contents / Householders
    'Contents': [
      { name: 'contents_category', label: 'Contents Category', type: 'select', options: ['Household','Office','Business','Mixed'] },
      { name: 'unspecified_items', label: 'Unspecified Items Value (R)', type: 'number' },
      { name: 'specified_items', label: 'Specified Items Value (R)', type: 'number' },
      { name: 'theft_extension', label: 'Theft Extension', type: 'checkbox' },
      { name: 'power_surge_cover', label: 'Power Surge Cover', type: 'checkbox' },
      { name: 'security_measures', label: 'Security Measures', type: 'text', placeholder: 'Alarm, Armed Response, etc.' },
    ],
    // Stock
    'Stock': [
      { name: 'stock_category', label: 'Stock Category', type: 'select', options: ['Raw Materials','Finished Goods','Work in Progress','Perishable','Mixed'] },
      { name: 'declaration_basis', label: 'Declaration Basis', type: 'select', options: ['Monthly','Quarterly','Annual','Actual'] },
      { name: 'cold_storage', label: 'Cold Storage', type: 'checkbox' },
      { name: 'avg_stock_value', label: 'Average Stock Value (R)', type: 'number' },
      { name: 'max_stock_value', label: 'Maximum Stock Value (R)', type: 'number' },
    ],
    // Electronic Equipment / Machinery
    'Electronic': [
      { name: 'replacement_value', label: 'Replacement Value (R)', type: 'number' },
      { name: 'portable', label: 'Portable', type: 'checkbox' },
      { name: 'maintenance_contract', label: 'Maintenance Contract', type: 'checkbox' },
      { name: 'breakdown_cover', label: 'Breakdown Cover', type: 'checkbox' },
    ],
    // Watercraft
    'Watercraft': [
      { name: 'vessel_name', label: 'Vessel Name', type: 'text' },
      { name: 'vessel_type', label: 'Vessel Type', type: 'select', options: ['Yacht','Ski Boat','PWC / Jet Ski','Catamaran','Pontoon','Dinghy','Other'] },
      { name: 'hull_length', label: 'Hull Length (LOA)', type: 'text' },
      { name: 'motor_details', label: 'Motor Details', type: 'text', placeholder: 'e.g. 2x Yamaha 200HP Outboard' },
      { name: 'mooring', label: 'Mooring / Storage', type: 'text' },
      { name: 'navigational_limits', label: 'Navigational Limits', type: 'select', options: ['Inland Waters','Coastal 50nm','Coastal 200nm','Worldwide','Other'] },
      { name: 'skipper_qualification', label: 'Skipper Qualification', type: 'text' },
    ],
    // Livestock / Game
    'Livestock': [
      { name: 'breed', label: 'Breed', type: 'text' },
      { name: 'gender', label: 'Gender', type: 'select', options: ['Male','Female','Mixed'] },
      { name: 'animal_count', label: 'Number of Animals', type: 'number' },
      { name: 'identification_method', label: 'Identification Method', type: 'select', options: ['Brand','Microchip','Ear Tag','Tattoo','Other'] },
      { name: 'premises_address', label: 'Premises Address', type: 'text' },
    ],
    // Goods in Transit (GIT)
    'Transit': [
      { name: 'commodity', label: 'Commodity / Goods Type', type: 'text' },
      { name: 'conveyance_type', label: 'Conveyance Type', type: 'select', options: ['Own Vehicle','Contractor','Rail','Sea','Air','Mixed'] },
      { name: 'route', label: 'Route Description', type: 'text' },
      { name: 'max_single_load', label: 'Max Single Load Value (R)', type: 'number' },
    ],
    // Liability sections
    'Liability': [
      { name: 'limit_of_indemnity', label: 'Limit of Indemnity (R)', type: 'number' },
      { name: 'aggregate_limit', label: 'Annual Aggregate (R)', type: 'number' },
      { name: 'business_activity', label: 'Business Activity', type: 'text' },
      { name: 'turnover', label: 'Annual Turnover (R)', type: 'number' },
      { name: 'employee_count', label: 'Number of Employees', type: 'number' },
      { name: 'retroactive_date', label: 'Retroactive Date', type: 'date' },
      { name: 'trigger_basis', label: 'Trigger Basis', type: 'select', options: ['Occurrence','Claims-made','Claims-made & Reported'] },
      { name: 'defence_costs', label: 'Defence Costs', type: 'select', options: ['Included in Limit','In Addition to Limit'] },
    ],
  };

  // Map section prefix keywords to field sets
  function getSectionFieldKey(sectionValue) {
    if (!sectionValue) return null;
    const s = sectionValue.toLowerCase();
    if (s.startsWith('motor'))      return 'Motor';
    if (s.startsWith('property') && (s.includes('building') || s.includes('fire')))  return 'Property';
    if (s.startsWith('property') && (s.includes('content') || s.includes('household'))) return 'Contents';
    if (s.startsWith('property') && s.includes('stock'))     return 'Stock';
    if (s.startsWith('property') && s.includes('business interruption')) return null;
    if (s.startsWith('property'))   return 'Contents';
    if (s.includes('building') || s.includes('fire'))        return 'Property';
    if (s.includes('content') || s.includes('household'))    return 'Contents';
    if (s.includes('stock') || s.includes('deterioration'))  return 'Stock';
    if (s.includes('electronic') || s.includes('machinery') || s.includes('breakdown')) return 'Electronic';
    if (s.includes('watercraft') || s.includes('pleasure'))  return 'Watercraft';
    if (s.includes('livestock') || s.includes('game'))       return 'Livestock';
    if (s.includes('transit') || s.includes('git'))          return 'Transit';
    if (s.includes('liability') || s.includes('cyber') || s.includes('fidelity') || s.includes('umbrella') || s.includes('d&o') || s.includes('directors')) return 'Liability';
    if (s.includes('employer') || s.includes('personal accident') || s.includes('group')) return 'Liability';
    if (s.includes('carrier'))     return 'Transit';
    return null;
  }

  function wireSectionFields(sectionInput, data) {
    const block = document.getElementById('section-fields-block');
    const grid  = document.getElementById('section-fields-grid');
    const title = document.getElementById('section-fields-title');
    if (!block || !grid) return;

    function renderFields(sectionValue) {
      const key = getSectionFieldKey(sectionValue);
      const fields = key ? SECTION_FIELD_DEFS[key] : null;

      if (!fields || !fields.length) {
        block.style.display = 'none';
        grid.innerHTML = '';
        return;
      }

      block.style.display = '';
      title.textContent = (key || 'Section') + ' Details';

      grid.innerHTML = fields.map(f => {
        const val = data[f.name] != null ? data[f.name] : '';
        if (f.type === 'checkbox') {
          return `<div class="form-group" style="display:flex;align-items:center;gap:.4rem;padding-top:.25rem;">
            <label class="form-check-label" style="display:flex;align-items:center;gap:.4rem;cursor:pointer;">
              <input type="checkbox" name="${f.name}" ${val ? 'checked' : ''} />
              ${f.label}
            </label>
          </div>`;
        }
        if (f.type === 'select') {
          return `<div class="form-group">
            <label class="form-label">${f.label}</label>
            <select name="${f.name}" class="form-control">
              ${selectOpts(f.options, String(val), '— Select —')}
            </select>
          </div>`;
        }
        if (f.type === 'number') {
          return `<div class="form-group">
            <label class="form-label">${f.label}</label>
            <input type="number" name="${f.name}" class="form-control" min="0" step="0.01"
              placeholder="0.00" value="${esc(val)}" />
          </div>`;
        }
        if (f.type === 'date') {
          return `<div class="form-group">
            <label class="form-label">${f.label}</label>
            <input type="date" name="${f.name}" class="form-control"
              value="${esc(val ? String(val).slice(0,10) : '')}" />
          </div>`;
        }
        // text
        return `<div class="form-group">
          <label class="form-label">${f.label}</label>
          <input type="text" name="${f.name}" class="form-control"
            value="${esc(val)}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} />
        </div>`;
      }).join('');
    }

    renderFields(sectionInput.value);

    // Re-render when section changes (debounced for datalist)
    let debounce;
    sectionInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => renderFields(sectionInput.value), 300);
    });
    sectionInput.addEventListener('change', () => renderFields(sectionInput.value));
  }

  // ── Form ─────────────────────────────────────────────────────────────────

  async function form(id = null) {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    const isEdit = Boolean(id);
    setPageTitle(isEdit ? 'Edit Asset' : 'New Asset');
    setBreadcrumb(['Assets', isEdit ? 'Edit' : 'New']);

    const headerActions = document.getElementById('header-actions');
    if (headerActions) headerActions.innerHTML = '';

    const hashParams = getFiltersFromHash();

    try {
      const [contactsRes, accountsRes, policiesRes, assetData, productsRes] = await Promise.all([
        Api.contacts.list({ limit: 500 }),
        Api.accounts.list({ limit: 500 }),
        Api.policies.list({ limit: 500 }),
        isEdit ? Api.assets.get(id) : Promise.resolve({}),
        Api.products.list({ status: 'Active' }).catch(() => []),
      ]);

      const contacts = contactsRes.data || contactsRes || [];
      const accounts = accountsRes.data || accountsRes || [];
      const policies = policiesRes.data || policiesRes || [];
      const products = productsRes.data || productsRes || [];
      const d        = assetData.data   || assetData   || {};

      if (!isEdit) {
        if (hashParams.contact_id)   d.contact_id   = hashParams.contact_id;
        if (hashParams.account_id)   d.account_id   = hashParams.account_id;
        if (hashParams.policy_id)    d.policy_id    = hashParams.policy_id;
        if (hashParams.asset_section) d.asset_section = decodeURIComponent(hashParams.asset_section);
      }

      el.innerHTML = `
        <div class="form-page">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">${isEdit ? 'Edit Asset' : 'New Asset'}</h3>
            </div>
            <form id="asset-form" novalidate>

              <!-- ── Core Details ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Core Details</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label required">Asset Name</label>
                    <input type="text" name="asset_name" class="form-control" required
                      value="${esc(d.asset_name || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Item Number</label>
                    <input type="text" name="item_number" class="form-control"
                      value="${esc(d.item_number || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Asset Type</label>
                    <select name="asset_type" class="form-control" required>
                      ${selectOpts(ASSET_TYPES, d.asset_type, '— Select Type —')}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Asset Status</label>
                    <select name="asset_status" class="form-control" required>
                      ${selectOpts(ASSET_STATUSES, d.asset_status, '— Select Status —')}
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
                    <label class="form-label">Policy</label>
                    <select name="policy_id" class="form-control">
                      ${policyOptions(policies, d.policy_id)}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Policy Section
                      <span style="font-size:.72rem;color:var(--text-muted);font-weight:normal;margin-left:.3rem;">filtered by asset type</span>
                    </label>
                    <select name="asset_section" id="ast-section-select" class="form-control" required>
                      ${(() => {
                        const allowed = SECTIONS_BY_TYPE[d.asset_type] || [];
                        const placeholder = d.asset_type
                          ? '— Select Section —'
                          : '— Select asset type first —';
                        return `<option value="">${placeholder}</option>` +
                          allowed.map(s => `<option value="${esc(s)}" ${d.asset_section === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
                      })()}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label required">Product (from Product Library)</label>
                    <div style="display:flex;gap:.5rem;align-items:stretch;">
                      <select name="product_id" id="ast-product-select" class="form-control" required style="flex:1;min-width:0;">
                        <option value="">— Select Product —</option>
                        ${products.map(p =>
                          `<option value="${p.id}" ${String(d.product_id || '') === String(p.id) ? 'selected' : ''}>${esc(p.product_code)} — ${esc(p.product_name)} (${esc(p.insurer)})</option>`
                        ).join('')}
                      </select>
                      <button type="button" class="btn btn-secondary" id="ast-product-library-btn"
                        title="Add a new product in the Product Library" style="white-space:nowrap;">
                        + Add
                      </button>
                    </div>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Asset Value (<span class="cur-label">R</span>)
                      <span style="font-size:.75rem;color:var(--text-muted);font-weight:normal;margin-left:.3rem;">auto-calculated</span>
                    </label>
                    <input type="number" name="asset_value" id="asset-value-auto" class="form-control" min="0" step="0.01"
                      placeholder="0.00" readonly style="background:var(--bg-alt,#f4f5f7);color:var(--text-light);"
                      value="${esc(d.asset_value != null ? d.asset_value : '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Premium (<span class="cur-label">R</span>)
                      <span style="font-size:.75rem;color:var(--text-muted);font-weight:normal;margin-left:.3rem;">auto-calculated — per asset under this policy</span>
                    </label>
                    <input type="number" name="premium" id="asset-premium-auto" class="form-control" min="0" step="0.01"
                      placeholder="0.00" readonly style="background:var(--bg-alt,#f4f5f7);color:var(--text-light);"
                      value="${esc(d.premium != null ? d.premium : '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">SASRIA (<span class="cur-label">R</span>)</label>
                    <input type="number" name="sasria" class="form-control" min="0" step="0.01"
                      placeholder="0.00" value="${esc(d.sasria != null ? d.sasria : '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Basic Excess (<span class="cur-label">R</span>)</label>
                    <input type="number" name="excess" class="form-control" min="0" step="0.01"
                      placeholder="0.00" value="${esc(d.excess != null ? d.excess : '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Excess % of Claim Value <span style="font-weight:400;color:var(--text-muted);">(optional)</span></label>
                    <input type="number" name="excess_pct_claim" class="form-control" id="excess-pct-claim"
                      min="0" max="100" step="0.01" placeholder="e.g. 10"
                      value="${esc(d.excess_pct_claim != null ? d.excess_pct_claim : '')}" />
                    <small id="excess-pct-claim-calc" style="color:var(--text-muted);margin-top:.2rem;display:block;"></small>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Excess % of Insured Value <span style="font-weight:400;color:var(--text-muted);">(optional)</span></label>
                    <input type="number" name="excess_pct_insured" class="form-control" id="excess-pct-insured"
                      min="0" max="100" step="0.01" placeholder="e.g. 2.5"
                      value="${esc(d.excess_pct_insured != null ? d.excess_pct_insured : '')}" />
                    <small id="excess-pct-insured-calc" style="color:var(--text-muted);margin-top:.2rem;display:block;"></small>
                  </div>

                  <div class="form-group" id="minimum-excess-group" style="${(d.excess_pct_claim != null || d.excess_pct_insured != null) ? '' : 'display:none;'}">
                    <label class="form-label">Minimum Excess (<span class="cur-label">R</span>)</label>
                    <input type="number" name="minimum_excess" class="form-control" id="asset-minimum-excess" min="0" step="0.01"
                      placeholder="0.00" value="${esc(d.minimum_excess != null ? d.minimum_excess : '')}" />
                  </div>

                </div>
              </fieldset>

              <!-- ── Related Contacts ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Related Contacts</legend>
                <div id="asset-related-contacts-rows"></div>
                <div style="margin-top:.5rem;">
                  <button type="button" class="btn btn-secondary btn-sm" id="add-asset-contact-btn">+ Add Contact</button>
                </div>
              </fieldset>

              <!-- ── Address (Building / Risk Address) ── -->
              <fieldset class="form-section" id="asset-address-block"
                style="${['Property', 'Fire', 'Agriculture', 'Motor', 'Goods in Transit', 'Marine', 'Aviation'].includes(d.asset_type) ? '' : 'display:none;'}">
                <legend class="form-section-title">${['Motor','Goods in Transit','Marine','Aviation'].includes(d.asset_type) ? 'Risk Address' : 'Building Address'}</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label required">Street Address</label>
                    <input type="text" name="address" class="form-control"
                      ${['Property', 'Fire', 'Agriculture'].includes(d.asset_type) ? 'required' : ''}
                      value="${esc(d.address || '')}" placeholder="e.g. 12 Oak Street" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Complex / Building</label>
                    <input type="text" name="complex_building" class="form-control"
                      value="${esc(d.complex_building || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Suburb</label>
                    <input type="text" name="suburb" class="form-control"
                      value="${esc(d.suburb || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label required">City / Town</label>
                    <input type="text" name="city" class="form-control"
                      ${['Property', 'Fire', 'Agriculture'].includes(d.asset_type) ? 'required' : ''}
                      value="${esc(d.city || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Province</label>
                    <select name="province" class="form-control">
                      <option value="">— Select Province —</option>
                      ${SA_PROVINCES.map(p => `<option value="${esc(p)}" ${d.province === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Postal Code</label>
                    <input type="text" name="postal_code" class="form-control"
                      value="${esc(d.postal_code || '')}" placeholder="e.g. 0001" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Country</label>
                    <input type="text" name="country" class="form-control"
                      value="${esc(d.country || 'South Africa')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">GPS Latitude</label>
                    <input type="text" name="gps_lat" class="form-control"
                      value="${esc(d.gps_lat || '')}" placeholder="e.g. -25.7461" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">GPS Longitude</label>
                    <input type="text" name="gps_lng" class="form-control"
                      value="${esc(d.gps_lng || '')}" placeholder="e.g. 28.1881" />
                  </div>

                </div>
              </fieldset>

              <!-- ── Vehicle / Item Details ── -->
              <fieldset class="form-section" id="vehicle-item-details-block"
                style="${d.asset_type ? '' : 'display:none;'}">
                <legend class="form-section-title">Vehicle / Item Details</legend>
                <div class="form-grid form-grid-2">

                  <div class="form-group">
                    <label class="form-label">Registration Number</label>
                    <input type="text" name="registration_number" class="form-control"
                      value="${esc(d.registration_number || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">VIN Number</label>
                    <input type="text" name="vin_number" class="form-control"
                      value="${esc(d.vin_number || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Engine Number</label>
                    <input type="text" name="engine_number" class="form-control"
                      value="${esc(d.engine_number || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Serial Number</label>
                    <input type="text" name="serial_number" class="form-control"
                      value="${esc(d.serial_number || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Make</label>
                    <input type="text" name="make" class="form-control"
                      value="${esc(d.make || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Model</label>
                    <input type="text" name="model" class="form-control"
                      value="${esc(d.model || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Year</label>
                    <input type="number" name="year" class="form-control" min="1900" max="2100"
                      value="${esc(d.year || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">M &amp; M Number</label>
                    <input type="text" name="mm_number" class="form-control"
                      value="${esc(d.mm_number || '')}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Fleet Number</label>
                    <input type="text" name="fleet_number" class="form-control"
                      value="${esc(d.fleet_number || '')}" />
                  </div>

                </div>
              </fieldset>

              <!-- ── Vehicle Risk Details (vehicles) ── -->
              <fieldset class="form-section" id="vehicle-risk-details-block"
                style="${['Motor','Goods in Transit','Marine','Aviation','Agriculture'].includes(d.asset_type) ? '' : 'display:none;'}">
                <legend class="form-section-title">Vehicle Risk Details</legend>
                <div class="form-grid form-grid-2">
                  <div class="form-group">
                    <label class="form-label">Parking</label>
                    <select name="parking_type" id="parking-type-select" class="form-control">
                      ${selectOpts(['Locked Garage','Behind Gates','Access Control','Open Carport','Street','Other'], d.parking_type, '— Select —')}
                    </select>
                  </div>
                  <div class="form-group" id="parking-other-group"
                    style="${d.parking_type === 'Other' ? '' : 'display:none;'}">
                    <label class="form-label">Parking (Other — specify)</label>
                    <input type="text" name="parking_other" class="form-control"
                      value="${esc(d.parking_other || '')}" placeholder="Specify parking arrangement" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Tracker Device Fitted</label>
                    <select name="tracker_fitted" class="form-control">
                      ${selectOpts(['Yes','No'], d.tracker_fitted, '— Select —')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Vehicle Use</label>
                    <select name="vehicle_use" class="form-control">
                      ${selectOpts(['Private','Business','Private & Business'], d.vehicle_use, '— Select —')}
                    </select>
                  </div>
                </div>
              </fieldset>

              <!-- ── Financial Interest (vehicles) ── -->
              <fieldset class="form-section" id="financial-interest-block"
                style="${['Motor','Goods in Transit','Marine','Aviation','Agriculture'].includes(d.asset_type) ? '' : 'display:none;'}">
                <legend class="form-section-title">Financial Interest</legend>
                <div class="form-grid form-grid-2">
                  <div class="form-group" style="display:flex;align-items:center;gap:.4rem;padding-top:.25rem;grid-column:1/-1;">
                    <label class="form-check-label" style="display:flex;align-items:center;gap:.4rem;cursor:pointer;">
                      <input type="checkbox" name="financial_interest_noted" id="financial-interest-noted"
                        ${d.financial_interest_noted ? 'checked' : ''} />
                      Financial Interest Noted
                    </label>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Financial Institution</label>
                    <input type="text" name="financial_institution" class="form-control"
                      value="${esc(d.financial_institution || '')}" placeholder="e.g. ABSA, Standard Bank" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Finance Contract Number</label>
                    <input type="text" name="finance_contract_number" class="form-control"
                      value="${esc(d.finance_contract_number || '')}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Contract Expiry Date</label>
                    <input type="date" name="contract_expiry_date" class="form-control"
                      value="${esc(d.contract_expiry_date ? d.contract_expiry_date.slice(0,10) : '')}" />
                  </div>
                </div>
              </fieldset>

              <!-- ── Excess (vehicles & property) ── -->
              <fieldset class="form-section" id="excess-fieldset"
                style="${['Motor','Goods in Transit','Marine','Aviation','Agriculture','Property'].includes(d.asset_type) ? '' : 'display:none;'}">
                <legend class="form-section-title">Excess</legend>
                <div id="excess-rows">
                  ${(() => {
                    let excesses = [];
                    try { excesses = JSON.parse(d.excesses || '[]'); } catch(_) {}
                    if (!excesses.length) return '';
                    return excesses.map((ex) => `
                      <div class="excess-row" style="display:flex;gap:.5rem;margin-bottom:.5rem;align-items:center;">
                        <input type="text" class="form-control excess-type" placeholder="Excess Type (e.g. Basic, Theft, Hail)"
                          value="${esc(ex.type || '')}" style="flex:2;" />
                        <input type="number" class="form-control excess-amount" placeholder="Amount"
                          value="${esc(ex.amount != null ? ex.amount : '')}" min="0" step="0.01" style="flex:1;" />
                        <input type="number" class="form-control excess-premium" placeholder="Premium"
                          value="${esc(ex.premium != null ? ex.premium : '')}" min="0" step="0.01" style="flex:1;" />
                        <button type="button" class="btn btn-sm btn-danger remove-excess-btn"
                          style="white-space:nowrap;">✕</button>
                      </div>`).join('');
                  })()}
                </div>
                <div id="excess-total-row" style="display:none;text-align:right;padding:.4rem .5rem;font-weight:600;border-top:1px solid #dee2e6;margin-bottom:.25rem;">
                  Premium Total: <span id="excess-premium-total-display">R 0.00</span>
                </div>
                <div style="display:flex;align-items:center;gap:1rem;margin-top:.5rem;flex-wrap:wrap;">
                  <button type="button" class="btn btn-secondary btn-sm" id="add-excess-btn">+ Add Excess</button>
                </div>
              </fieldset>

              <!-- ── Vehicle Extras ── -->
              <fieldset class="form-section" id="vehicle-extras-fieldset"
                style="${['Motor','Goods in Transit','Marine','Aviation','Agriculture'].includes(d.asset_type) ? '' : 'display:none;'}">
                <legend class="form-section-title">Vehicle Extras</legend>
                <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:.4rem;">
                  Tick "In total" to include the extra's amount in the asset's Sum Insured / Asset Value.
                  Premium is always included in the asset's total Premium.
                </div>
                <div id="vehicle-extras-rows">
                  ${(() => {
                    let extras = [];
                    try { extras = JSON.parse(d.vehicle_extras || '[]'); } catch(_) {}
                    if (!extras.length) return '';
                    // Per-row include flag. Backwards compat: when the legacy
                    // asset.extras_in_total flag is set, all existing rows
                    // inherit "include = true" if they don't carry their own
                    // include_in_total flag. Otherwise default to false.
                    const legacyAllIn = !!d.extras_in_total;
                    return extras.map((ex, i) => {
                      const inTotal = (ex.include_in_total != null)
                        ? !!ex.include_in_total
                        : legacyAllIn;
                      return `
                      <div class="vehicle-extra-row" style="display:flex;gap:.5rem;margin-bottom:.5rem;align-items:center;">
                        <input type="text" class="form-control extra-name" placeholder="Extra description"
                          value="${esc(ex.name || '')}" style="flex:2;" />
                        <input type="number" class="form-control extra-amount" placeholder="Amount"
                          value="${esc(ex.amount != null ? ex.amount : '')}" min="0" step="0.01" style="flex:1;" />
                        <input type="number" class="form-control extra-premium" placeholder="Premium"
                          value="${esc(ex.premium != null ? ex.premium : '')}" min="0" step="0.01" style="flex:1;" />
                        <label class="checklist-item" style="margin:0;white-space:nowrap;font-size:.82rem;">
                          <input type="checkbox" class="extra-in-total" ${inTotal ? 'checked' : ''} />
                          <span>In total</span>
                        </label>
                        <button type="button" class="btn btn-sm btn-danger remove-extra-btn"
                          style="white-space:nowrap;">✕</button>
                      </div>`;
                    }).join('');
                  })()}
                </div>
                <div id="extras-total-row" style="display:none;text-align:right;padding:.4rem .5rem;font-weight:600;border-top:1px solid #dee2e6;margin-bottom:.25rem;">
                  Amount Total <span style="font-weight:400;color:var(--text-muted);font-size:.78rem;">(included only)</span>: <span id="extras-total-display">R 0.00</span>
                  <span style="margin-left:1rem;">Premium Total: <span id="extras-premium-total-display">R 0.00</span></span>
                </div>
                <div style="display:flex;align-items:center;gap:1rem;margin-top:.5rem;flex-wrap:wrap;">
                  <button type="button" class="btn btn-secondary btn-sm" id="add-extra-btn">+ Extras</button>
                </div>
              </fieldset>

              <!-- ── Section-Specific Fields (dynamically shown) ── -->
              <fieldset class="form-section" id="section-fields-block" style="display:none;">
                <legend class="form-section-title" id="section-fields-title">Section Details</legend>
                <div class="form-grid form-grid-2" id="section-fields-grid"></div>
              </fieldset>

              <!-- ── General Cover Details ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Cover Details</legend>
                <div class="form-grid form-grid-2">
                  <div class="form-group">
                    <label class="form-label">Sum Insured (<span class="cur-label">R</span>)</label>
                    <input type="number" name="sum_insured" class="form-control" min="0" step="0.01"
                      placeholder="0.00" value="${esc(d.sum_insured != null ? d.sum_insured : '')}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Sum Insured Premium (<span class="cur-label">R</span>)</label>
                    <input type="number" name="sum_insured_premium" class="form-control" min="0" step="0.01"
                      placeholder="0.00" value="${esc(d.sum_insured_premium != null ? d.sum_insured_premium : '')}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Basis of Cover</label>
                    <select name="basis_of_cover" class="form-control">
                      ${selectOpts(['Replacement Value','Market Value','Agreed Value','Indemnity','First Loss'], d.basis_of_cover, '— Select —')}
                    </select>
                  </div>
                  <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">Conditions / Warranties</label>
                    <textarea name="conditions" class="form-control" rows="2" placeholder="Special conditions or warranties">${esc(d.conditions || '')}</textarea>
                  </div>
                  <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">Extensions / Endorsements</label>
                    <textarea name="extensions" class="form-control" rows="2" placeholder="Additional extensions">${esc(d.extensions || '')}</textarea>
                  </div>
                  <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">Exclusions</label>
                    <textarea name="exclusions" class="form-control" rows="2" placeholder="Specific exclusions">${esc(d.exclusions || '')}</textarea>
                  </div>
                </div>
              </fieldset>

              <!-- ── Additional Cover ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Additional Cover</legend>
                <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:.4rem;">
                  Tick "In total" to include the cover's amount in the asset's Sum Insured / Asset Value.
                  Premium is always included in the asset's total Premium.
                </div>
                <div id="additional-cover-rows">
                  ${(() => {
                    let covers = [];
                    try { covers = JSON.parse(d.additional_covers || '[]'); } catch(_) {}
                    if (!covers.length) return '';
                    // Per-row include flag. Older rows default to true (the
                    // pre-tickbox behaviour was always "include").
                    return covers.map((c) => {
                      const inTotal = (c.include_in_total != null) ? !!c.include_in_total : true;
                      return `
                      <div class="additional-cover-row" style="display:grid;grid-template-columns:2fr 1fr 1fr auto auto;gap:.5rem;margin-bottom:.5rem;align-items:center;">
                        <input type="text" class="form-control ac-description" placeholder="Description"
                          value="${esc(c.description || '')}" />
                        <div class="input-prefix-group" style="display:flex;align-items:center;">
                          <span class="input-prefix cur-label">R</span>
                          <input type="number" class="form-control ac-cover-amount" placeholder="Cover Amount"
                            value="${esc(c.cover_amount != null ? c.cover_amount : '')}" min="0" step="0.01" />
                        </div>
                        <div class="input-prefix-group" style="display:flex;align-items:center;">
                          <span class="input-prefix cur-label">R</span>
                          <input type="number" class="form-control ac-premium" placeholder="Premium"
                            value="${esc(c.premium != null ? c.premium : '')}" min="0" step="0.01" />
                        </div>
                        <label class="checklist-item" style="margin:0;white-space:nowrap;font-size:.82rem;">
                          <input type="checkbox" class="ac-in-total" ${inTotal ? 'checked' : ''} />
                          <span>In total</span>
                        </label>
                        <button type="button" class="btn btn-sm btn-danger remove-additional-cover-btn"
                          style="white-space:nowrap;">✕</button>
                      </div>`;
                    }).join('');
                  })()}
                </div>
                <div style="margin-top:.5rem;">
                  <button type="button" class="btn btn-secondary btn-sm" id="add-additional-cover-btn">+ Add Cover</button>
                </div>
              </fieldset>

              <!-- ── Dates ── -->
              <fieldset class="form-section">
                <legend class="form-section-title">Dates</legend>
                <div class="form-grid form-grid-2">
                  <div class="form-group">
                    <label class="form-label">Date Acquired</label>
                    <input type="date" name="date_acquired" class="form-control"
                      value="${esc(d.date_acquired ? d.date_acquired.slice(0,10) : '')}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Date Sold</label>
                    <input type="date" name="date_sold" class="form-control"
                      value="${esc(d.date_sold ? d.date_sold.slice(0,10) : '')}" />
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
                <button type="submit" class="btn btn-primary" id="asset-submit-btn">
                  ${isEdit ? 'Save Changes' : 'Create Asset'}
                </button>
                <a href="${isEdit ? `#/assets/${id}` : '#/assets'}" class="btn btn-secondary">Cancel</a>
              </div>

            </form>
          </div>
        </div>
      `;

      // ── Vehicle Extras ──────────────────────────────────────────
      const addExtraBtn  = document.getElementById('add-extra-btn');
      const extrasRows   = document.getElementById('vehicle-extras-rows');
      const extrasTotalRow = document.getElementById('extras-total-row');
      const extrasTotalDisplay = document.getElementById('extras-total-display');
      const extrasPremiumTotalDisplay = document.getElementById('extras-premium-total-display');

      function refreshExtrasTotal() {
        // Per-row "In total" check: only sum amounts where the row's
        // include-in-total checkbox is ticked. Premium is always summed.
        const rows = Array.from(document.querySelectorAll('#vehicle-extras-rows .vehicle-extra-row'));
        let amountIncl = 0;
        let premTot    = 0;
        rows.forEach(r => {
          const amt = parseFloat(r.querySelector('.extra-amount')?.value)  || 0;
          const prm = parseFloat(r.querySelector('.extra-premium')?.value) || 0;
          const inc = !!r.querySelector('.extra-in-total')?.checked;
          if (inc) amountIncl += amt;
          premTot += prm;
        });
        if (extrasTotalRow) extrasTotalRow.style.display = rows.length ? '' : 'none';
        const curEl = document.querySelector('[name="currency"]');
        const sym   = currencySymbol(curEl ? curEl.value : 'ZAR');
        if (extrasTotalDisplay) {
          extrasTotalDisplay.textContent = sym + '\u00a0' + amountIncl.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        if (extrasPremiumTotalDisplay) {
          extrasPremiumTotalDisplay.textContent = sym + '\u00a0' + premTot.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        if (typeof refreshAssetTotals === 'function') refreshAssetTotals();
      }

      function addExtraRow() {
        const row = document.createElement('div');
        row.className = 'vehicle-extra-row';
        row.style.cssText = 'display:flex;gap:.5rem;margin-bottom:.5rem;align-items:center;';
        row.innerHTML = `
          <input type="text"   class="form-control extra-name"    placeholder="Extra description" style="flex:2;" />
          <input type="number" class="form-control extra-amount"  placeholder="Amount" min="0" step="0.01" style="flex:1;" />
          <input type="number" class="form-control extra-premium" placeholder="Premium" min="0" step="0.01" style="flex:1;" />
          <label class="checklist-item" style="margin:0;white-space:nowrap;font-size:.82rem;">
            <input type="checkbox" class="extra-in-total" checked />
            <span>In total</span>
          </label>
          <button type="button" class="btn btn-sm btn-danger remove-extra-btn" style="white-space:nowrap;">✕</button>`;
        row.querySelector('.remove-extra-btn').addEventListener('click', () => { row.remove(); refreshExtrasTotal(); });
        row.querySelector('.extra-amount').addEventListener('input', refreshExtrasTotal);
        row.querySelector('.extra-premium').addEventListener('input', refreshExtrasTotal);
        row.querySelector('.extra-in-total').addEventListener('change', refreshExtrasTotal);
        extrasRows.appendChild(row);
        refreshExtrasTotal();
      }
      if (addExtraBtn) addExtraBtn.addEventListener('click', addExtraRow);
      if (extrasRows) {
        extrasRows.addEventListener('click', (e) => {
          if (e.target.classList.contains('remove-extra-btn')) { e.target.closest('.vehicle-extra-row').remove(); refreshExtrasTotal(); }
        });
        extrasRows.addEventListener('input', (e) => {
          if (e.target.classList.contains('extra-amount') || e.target.classList.contains('extra-premium')) refreshExtrasTotal();
        });
        extrasRows.addEventListener('change', (e) => {
          if (e.target.classList.contains('extra-in-total')) refreshExtrasTotal();
        });
      }
      refreshExtrasTotal();

      // ── Excess ───────────────────────────────────────────────────
      const addExcessBtn = document.getElementById('add-excess-btn');
      const excessRows   = document.getElementById('excess-rows');
      const excessTotalRow = document.getElementById('excess-total-row');
      const excessPremiumTotalDisplay = document.getElementById('excess-premium-total-display');

      function refreshExcessTotal() {
        const premiums = Array.from(document.querySelectorAll('#excess-rows .excess-premium'))
          .map(el => parseFloat(el.value) || 0);
        const premTot = premiums.reduce((s, v) => s + v, 0);
        if (excessTotalRow) excessTotalRow.style.display = premiums.length ? '' : 'none';
        const curEl = document.querySelector('[name="currency"]');
        const sym   = currencySymbol(curEl ? curEl.value : 'ZAR');
        if (excessPremiumTotalDisplay) {
          excessPremiumTotalDisplay.textContent = sym + '\u00a0' + premTot.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        if (typeof refreshAssetTotals === 'function') refreshAssetTotals();
      }

      function addExcessRow() {
        const row = document.createElement('div');
        row.className = 'excess-row';
        row.style.cssText = 'display:flex;gap:.5rem;margin-bottom:.5rem;align-items:center;';
        row.innerHTML = `
          <input type="text"   class="form-control excess-type"    placeholder="Excess Type (e.g. Basic, Theft, Hail)" style="flex:2;" />
          <input type="number" class="form-control excess-amount"  placeholder="Amount"  min="0" step="0.01" style="flex:1;" />
          <input type="number" class="form-control excess-premium" placeholder="Premium" min="0" step="0.01" style="flex:1;" />
          <button type="button" class="btn btn-sm btn-danger remove-excess-btn" style="white-space:nowrap;">✕</button>`;
        row.querySelector('.remove-excess-btn').addEventListener('click', () => { row.remove(); refreshExcessTotal(); });
        excessRows.appendChild(row);
        refreshExcessTotal();
      }
      if (addExcessBtn) addExcessBtn.addEventListener('click', addExcessRow);
      if (excessRows) {
        excessRows.addEventListener('click', (e) => {
          if (e.target.classList.contains('remove-excess-btn')) { e.target.closest('.excess-row').remove(); refreshExcessTotal(); }
        });
        excessRows.addEventListener('input', (e) => {
          if (e.target.classList.contains('excess-premium')) refreshExcessTotal();
        });
      }
      refreshExcessTotal();

      // ── Additional Cover (Task 4) ────────────────────────────────
      const addAdditionalCoverBtn = document.getElementById('add-additional-cover-btn');
      const additionalCoverRows   = document.getElementById('additional-cover-rows');
      function addAdditionalCoverRow() {
        const row = document.createElement('div');
        row.className = 'additional-cover-row';
        row.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr auto auto;gap:.5rem;margin-bottom:.5rem;align-items:center;';
        const curEl = document.querySelector('[name="currency"]');
        const sym   = currencySymbol(curEl ? curEl.value : 'ZAR');
        row.innerHTML = `
          <input type="text" class="form-control ac-description" placeholder="Description" />
          <div class="input-prefix-group" style="display:flex;align-items:center;">
            <span class="input-prefix cur-label">${sym}</span>
            <input type="number" class="form-control ac-cover-amount" placeholder="Cover Amount" min="0" step="0.01" />
          </div>
          <div class="input-prefix-group" style="display:flex;align-items:center;">
            <span class="input-prefix cur-label">${sym}</span>
            <input type="number" class="form-control ac-premium" placeholder="Premium" min="0" step="0.01" />
          </div>
          <label class="checklist-item" style="margin:0;white-space:nowrap;font-size:.82rem;">
            <input type="checkbox" class="ac-in-total" checked />
            <span>In total</span>
          </label>
          <button type="button" class="btn btn-sm btn-danger remove-additional-cover-btn" style="white-space:nowrap;">✕</button>`;
        additionalCoverRows.appendChild(row);
        if (typeof refreshAssetTotals === 'function') refreshAssetTotals();
      }
      if (addAdditionalCoverBtn) addAdditionalCoverBtn.addEventListener('click', addAdditionalCoverRow);
      if (additionalCoverRows) {
        additionalCoverRows.addEventListener('click', (e) => {
          if (e.target.classList.contains('remove-additional-cover-btn')) {
            e.target.closest('.additional-cover-row').remove();
            if (typeof refreshAssetTotals === 'function') refreshAssetTotals();
          }
        });
        additionalCoverRows.addEventListener('change', (e) => {
          if (e.target.classList.contains('ac-in-total')) {
            if (typeof refreshAssetTotals === 'function') refreshAssetTotals();
          }
        });
      }

      // ── Related Contacts repeater ───────────────────────────────
      const ASSET_CONTACT_TYPES = ['Company Representative','Claims Handler','Assessor','3rd Party','Legal Representative','Supplier'];
      const assetContactsHost = document.getElementById('asset-related-contacts-rows');
      const addAssetContactBtn = document.getElementById('add-asset-contact-btn');
      const renderAssetContactRow = (row = {}, idx) => {
        const typeOptions = ['', ...ASSET_CONTACT_TYPES].map(t =>
          `<option value="${esc(t)}" ${row.contact_type === t ? 'selected' : ''}>${t ? esc(t) : '— Type —'}</option>`).join('');
        return `
          <div class="asset-contact-row" data-idx="${idx}"
            style="display:grid;grid-template-columns:1.2fr 1.2fr 1fr 1.4fr auto;gap:.4rem;margin-bottom:.4rem;align-items:center;">
            <select class="form-control asset-contact-type">${typeOptions}</select>
            <input type="text" class="form-control asset-contact-name" placeholder="Name"
              value="${esc(row.name || '')}" />
            <input type="text" class="form-control asset-contact-cell" placeholder="Cell Number"
              value="${esc(row.cell || '')}" />
            <input type="email" class="form-control asset-contact-email" placeholder="Email Address"
              value="${esc(row.email || '')}" />
            <button type="button" class="btn btn-sm btn-danger remove-asset-contact-btn" style="white-space:nowrap;">✕</button>
          </div>`;
      };
      const readAssetContacts = () => {
        if (!assetContactsHost) return [];
        return Array.from(assetContactsHost.querySelectorAll('.asset-contact-row')).map(r => ({
          contact_type: r.querySelector('.asset-contact-type')?.value || '',
          name:         r.querySelector('.asset-contact-name')?.value?.trim()  || '',
          cell:         r.querySelector('.asset-contact-cell')?.value?.trim()  || '',
          email:        r.querySelector('.asset-contact-email')?.value?.trim() || '',
        })).filter(c => c.contact_type || c.name || c.cell || c.email);
      };
      const redrawAssetContacts = (rows) => {
        if (!assetContactsHost) return;
        assetContactsHost.innerHTML = rows.map((r, i) => renderAssetContactRow(r, i)).join('');
      };
      let initialAssetContacts = [];
      try { initialAssetContacts = JSON.parse(d.related_contacts || '[]') || []; } catch (_) {}
      if (!Array.isArray(initialAssetContacts)) initialAssetContacts = [];
      redrawAssetContacts(initialAssetContacts);
      if (addAssetContactBtn) {
        addAssetContactBtn.addEventListener('click', () => {
          const current = readAssetContacts();
          current.push({ contact_type: '', name: '', cell: '', email: '' });
          redrawAssetContacts(current);
        });
      }
      if (assetContactsHost) {
        assetContactsHost.addEventListener('click', (e) => {
          const rm = e.target.closest('.remove-asset-contact-btn');
          if (!rm) return;
          const rowEl = rm.closest('.asset-contact-row');
          if (rowEl) rowEl.remove();
        });
      }

      // ── Auto-calculate Asset Value + Premium ────────────────────
      function sumInputs(selector) {
        return Array.from(document.querySelectorAll(selector))
          .reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
      }

      function refreshAssetTotals() {
        const assetValueAutoEl    = document.getElementById('asset-value-auto');
        const assetPremiumAutoEl  = document.getElementById('asset-premium-auto');
        const sumInsuredEl        = document.querySelector('[name="sum_insured"]');
        const sumInsuredPremiumEl = document.querySelector('[name="sum_insured_premium"]');
        const sasriaEl            = document.querySelector('[name="sasria"]');

        // Vehicle Extras: per-row "In total" controls inclusion.
        const extrasRows = Array.from(document.querySelectorAll('#vehicle-extras-rows .vehicle-extra-row'));
        let extrasIncluded = 0;
        let extrasPremTotal = 0;
        extrasRows.forEach(r => {
          const amt = parseFloat(r.querySelector('.extra-amount')?.value)  || 0;
          const prm = parseFloat(r.querySelector('.extra-premium')?.value) || 0;
          if (r.querySelector('.extra-in-total')?.checked) extrasIncluded += amt;
          extrasPremTotal += prm;
        });

        // Additional Covers: per-row "In total" controls inclusion.
        const acRows = Array.from(document.querySelectorAll('#additional-cover-rows .additional-cover-row'));
        let acIncluded = 0;
        let acPremTotal = 0;
        acRows.forEach(r => {
          const amt = parseFloat(r.querySelector('.ac-cover-amount')?.value) || 0;
          const prm = parseFloat(r.querySelector('.ac-premium')?.value)      || 0;
          if (r.querySelector('.ac-in-total')?.checked) acIncluded += amt;
          acPremTotal += prm;
        });

        const sumInsured = parseFloat(sumInsuredEl?.value) || 0;
        const assetValue = sumInsured + acIncluded + extrasIncluded;

        // Premium = sum_insured_premium + SASRIA + extras + additional covers + excesses
        const excessPremTotal   = sumInputs('#excess-rows .excess-premium');
        const sumInsuredPremium = parseFloat(sumInsuredPremiumEl?.value) || 0;
        const sasria            = parseFloat(sasriaEl?.value) || 0;
        const premium = extrasPremTotal + acPremTotal + excessPremTotal + sumInsuredPremium + sasria;

        if (assetValueAutoEl)   assetValueAutoEl.value   = assetValue.toFixed(2);
        if (assetPremiumAutoEl) assetPremiumAutoEl.value = premium.toFixed(2);
      }

      document.addEventListener('input', (e) => {
        const t = e.target;
        if (!t) return;
        if (t.classList?.contains('extra-amount')  || t.classList?.contains('extra-premium')  ||
            t.classList?.contains('ac-cover-amount') || t.classList?.contains('ac-premium')   ||
            t.classList?.contains('excess-premium') ||
            t.name === 'sum_insured' || t.name === 'sum_insured_premium' || t.name === 'sasria') {
          refreshAssetTotals();
        }
      });
      // Re-run when any per-row "In total" toggles (extras or additional covers).
      document.addEventListener('change', (e) => {
        if (e.target?.classList?.contains('extra-in-total') ||
            e.target?.classList?.contains('ac-in-total')) refreshAssetTotals();
      });
      // Initial calc on load (picks up prepopulated rows for edits)
      refreshAssetTotals();

      const formEl = document.getElementById('asset-form');
      if (formEl) {
        formEl.addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = document.getElementById('asset-submit-btn');
          // Product Library gate: a product must be selected.
          const productSelect = document.getElementById('ast-product-select');
          if (!productSelect || !productSelect.value) {
            if (productSelect) {
              productSelect.style.borderColor = '#c0392b';
              productSelect.focus();
            }
            showToast('Please select a product from the Product Library before saving.', 'error');
            return;
          }
          // Contact / Account gate — every asset must belong to one party.
          const contactIdEl = formEl.querySelector('[name="contact_id"]');
          const accountIdEl = formEl.querySelector('[name="account_id"]');
          const cidVal = (contactIdEl?.value || '').trim();
          const aidVal = (accountIdEl?.value || '').trim();
          if (!cidVal && !aidVal) {
            showToast('Select a Contact or an Account before saving the asset.', 'error');
            const target = contactIdEl || accountIdEl;
            if (target) {
              target.style.borderColor = '#c0392b';
              target.focus();
            }
            return;
          }
          // Policy Section gate — every asset must be classified under a section.
          const sectionSelect = document.getElementById('ast-section-select');
          if (!sectionSelect || !(sectionSelect.value || '').trim()) {
            if (sectionSelect) {
              sectionSelect.style.borderColor = '#c0392b';
              sectionSelect.focus();
            }
            showToast('Select a Policy Section before saving the asset.', 'error');
            return;
          }
          if (btn) btn.disabled = true;
          const data = serializeForm(formEl);
          // Serialize vehicle extras as JSON, including the per-row
          // "In total" flag (controls whether the amount counts toward
          // the asset's Sum Insured / Asset Value).
          const extraRows = document.querySelectorAll('#vehicle-extras-rows .vehicle-extra-row');
          const extras = [];
          extraRows.forEach(row => {
            const name    = row.querySelector('.extra-name')?.value?.trim()    || '';
            const amount  = row.querySelector('.extra-amount')?.value?.trim()  || '';
            const premium = row.querySelector('.extra-premium')?.value?.trim() || '';
            const inTotal = !!row.querySelector('.extra-in-total')?.checked;
            if (name || amount || premium) extras.push({
              name,
              amount:  amount  !== '' ? parseFloat(amount)  : null,
              premium: premium !== '' ? parseFloat(premium) : null,
              include_in_total: inTotal,
            });
          });
          data.vehicle_extras  = extras.length ? JSON.stringify(extras) : null;
          // Legacy column: now reflects "any extra included". Kept so older
          // exports/audit code that reads asset.extras_in_total still works.
          data.extras_in_total = extras.some(x => x.include_in_total) ? 1 : 0;
          data.financial_interest_noted = document.getElementById('financial-interest-noted')?.checked ? 1 : 0;
          // Serialize excesses as JSON (type, amount, premium)
          const excessRowEls = document.querySelectorAll('#excess-rows .excess-row');
          const excesses = [];
          excessRowEls.forEach(row => {
            const type    = row.querySelector('.excess-type')?.value?.trim()    || '';
            const amount  = row.querySelector('.excess-amount')?.value?.trim()  || '';
            const premium = row.querySelector('.excess-premium')?.value?.trim() || '';
            if (type || amount || premium) excesses.push({
              type,
              amount:  amount  !== '' ? parseFloat(amount)  : null,
              premium: premium !== '' ? parseFloat(premium) : null,
            });
          });
          data.excesses = excesses.length ? JSON.stringify(excesses) : null;
          // Serialize related contacts as JSON
          const relatedContacts = readAssetContacts();
          data.related_contacts = relatedContacts.length ? JSON.stringify(relatedContacts) : null;
          // Serialize additional covers as JSON, including the per-row
          // "In total" flag (controls whether the cover_amount counts
          // toward the asset's Sum Insured / Asset Value).
          const acRowEls = document.querySelectorAll('#additional-cover-rows .additional-cover-row');
          const additional = [];
          acRowEls.forEach(row => {
            const description  = row.querySelector('.ac-description')?.value?.trim()  || '';
            const coverAmount  = row.querySelector('.ac-cover-amount')?.value?.trim() || '';
            const premium      = row.querySelector('.ac-premium')?.value?.trim()      || '';
            const inTotal      = !!row.querySelector('.ac-in-total')?.checked;
            if (description || coverAmount || premium) {
              additional.push({
                description,
                cover_amount: coverAmount !== '' ? parseFloat(coverAmount) : null,
                premium:      premium     !== '' ? parseFloat(premium)     : null,
                include_in_total: inTotal,
              });
            }
          });
          data.additional_covers = additional.length ? JSON.stringify(additional) : null;
          try {
            if (isEdit) {
              await Api.assets.update(id, data);
              showToast('Asset updated.', 'success');
              navigate(`assets/${id}`);
            } else {
              const created = await Api.assets.create(data);
              const newId   = (created.data || created).id;
              showToast('Asset created.', 'success');
              // Ask user if they want to send the new asset to the insurer
              const sendNow = await confirmDialogAsync(
                'Asset created successfully. Would you like to send this asset to the insurer?',
                { title: 'Notify insurer?', okLabel: 'Send notification', cancelLabel: 'Not now' }
              );
              navigate(`assets/${newId}`);
              if (sendNow) setTimeout(() => { Assets._amendmentMail(newId, { mode: 'new' }); }, 400);
            }
          } catch (err) {
            showToast('Save failed: ' + err.message, 'error');
            if (btn) btn.disabled = false;
          }
        });
      }

      // ── Contact / Account mutual exclusion ──
      wireContactAccountToggle(formEl);

      // ── Multi-currency selector ──
      wireCurrencySelector(formEl);

      // ── Add Product button (jumps to Product Library) ──
      wireAssetProductPicker(formEl);

      // ── Dynamic field visibility based on asset type ──
      const typeSelect = document.querySelector('[name="asset_type"]');
      if (typeSelect) wireAssetTypeToggle(typeSelect);

      // ── Parking "Other" conditional text field ──
      const parkingSelect = document.getElementById('parking-type-select');
      const parkingOtherGroup = document.getElementById('parking-other-group');
      if (parkingSelect && parkingOtherGroup) {
        parkingSelect.addEventListener('change', () => {
          parkingOtherGroup.style.display = parkingSelect.value === 'Other' ? '' : 'none';
          if (parkingSelect.value !== 'Other') {
            const otherInput = parkingOtherGroup.querySelector('[name="parking_other"]');
            if (otherInput) otherInput.value = '';
          }
        });
      }

      // ── Dynamic section-specific fields based on asset_section ──
      const sectionInput = document.querySelector('[name="asset_section"]');
      if (sectionInput) wireSectionFields(sectionInput, d);

      // ── Excess % auto-calculation ──
      const pctClaimEl     = document.getElementById('excess-pct-claim');
      const pctInsuredEl   = document.getElementById('excess-pct-insured');
      const minExcessGroup = document.getElementById('minimum-excess-group');
      const minExcessEl    = document.getElementById('asset-minimum-excess');
      const baseValueEl    = document.querySelector('[name="asset_value"]');

      function fmtR(v) {
        const curEl = document.querySelector('[name="currency"]');
        const sym   = currencySymbol(curEl ? curEl.value : 'ZAR');
        return sym + '\u00a0' + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      function calcAndShow(pctEl, calcEl) {
        const pct  = parseFloat(pctEl.value);
        const base = parseFloat(baseValueEl ? baseValueEl.value : 0);
        const min  = parseFloat(minExcessEl ? minExcessEl.value : 0) || 0;
        if (!pct || !base) { calcEl.textContent = ''; return; }
        const raw = (pct / 100) * base;
        const effective = (min > 0 && raw < min) ? min : raw;
        calcEl.textContent = (min > 0 && raw < min)
          ? `= ${fmtR(effective)} (min. excess applies)`
          : `= ${fmtR(effective)}`;
      }

      if (pctClaimEl && pctInsuredEl && minExcessGroup) {
        const calcClaimEl   = document.getElementById('excess-pct-claim-calc');
        const calcInsuredEl = document.getElementById('excess-pct-insured-calc');

        function refreshCalcs() {
          const hasAnyPct = pctClaimEl.value.trim() !== '' || pctInsuredEl.value.trim() !== '';
          minExcessGroup.style.display = hasAnyPct ? '' : 'none';
          if (calcClaimEl)   calcAndShow(pctClaimEl,   calcClaimEl);
          if (calcInsuredEl) calcAndShow(pctInsuredEl, calcInsuredEl);
        }

        [pctClaimEl, pctInsuredEl, minExcessEl, baseValueEl].forEach(el => {
          if (el) el.addEventListener('input', refreshCalcs);
        });
        refreshCalcs();
      }

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
      headerActions.innerHTML = `
        <button class="btn btn-secondary" onclick="Assets._amendmentMail(${id})">Create Amendment Mail</button>
        <button class="btn btn-secondary" onclick="Assets._confirmationOfCoverMail(${id})">Confirmation of Cover</button>
        <a href="#/assets/${id}/edit" class="btn btn-primary">Edit</a>`;
    }

    try {
      const res = await Api.assets.get(id);
      const d   = res.data || res || {};

      setPageTitle(esc(d.asset_name || 'Asset'));
      setBreadcrumb(['Assets', d.asset_name || 'Detail']);

      // Load linked risk details
      let riskDetails = [];
      try {
        const rdRes = await Api.riskDetails.list({ asset_id: id, limit: 100 });
        riskDetails = rdRes.data || rdRes || [];
      } catch (_) {}

      const field = (label, value) => `<div class="detail-field"><span class="detail-label">${label}</span><span class="detail-value">${value || '—'}</span></div>`;
      const bool  = (v) => v ? `<span class="bool-yes">&#10003; Yes</span>` : `<span class="bool-no">&#10007; No</span>`;

      const curSym = currencySymbol(d.currency || 'ZAR');
      const cur = (v) => v != null && v !== '' ? `${curSym} ` + Number(v).toLocaleString('en-ZA', {minimumFractionDigits:2, maximumFractionDigits:2}) : null;

      el.innerHTML = `
        <div class="detail-view">

          ${d.policy_id ? `
          <!-- Policy Summary Bar -->
          <div class="card" style="margin-bottom:.75rem;padding:.75rem 1.25rem;background:var(--surface-secondary,#f8f9fa);">
            <div style="display:flex;flex-wrap:wrap;gap:1.25rem;align-items:center;">
              <div>
                <span style="font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);">Policy</span><br>
                <a href="#/policies/${d.policy_id}" style="font-weight:600;font-size:.95rem;">${esc(d.policy_name || d.policy_number || '—')}</a>
                ${d.policy_number ? `<span style="color:var(--text-muted);font-size:.8rem;margin-left:.35rem;">#${esc(d.policy_number)}</span>` : ''}
              </div>
              ${d.asset_section ? `
              <div>
                <span style="font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);">Section</span><br>
                <span style="font-weight:500;">${esc(d.asset_section)}</span>
              </div>` : ''}
              ${d.premium != null ? `
              <div>
                <span style="font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);">Premium</span><br>
                <span style="font-weight:600;color:var(--color-success,#22863a);">${cur(d.premium)}</span>
              </div>` : ''}
              ${d.sasria != null ? `
              <div>
                <span style="font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);">SASRIA</span><br>
                <span style="font-weight:600;">${cur(d.sasria)}</span>
              </div>` : ''}
              ${d.excess != null ? `
              <div>
                <span style="font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);">Basic Excess</span><br>
                <span style="font-weight:600;color:var(--color-warning,#b36a00);">${cur(d.excess)}</span>
              </div>` : ''}
              ${d.excess_pct_claim != null ? `
              <div>
                <span style="font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);">Excess % of Claim</span><br>
                <span style="font-weight:600;color:var(--color-warning,#b36a00);">${esc(String(d.excess_pct_claim))}%</span>
              </div>` : ''}
              ${d.excess_pct_insured != null ? `
              <div>
                <span style="font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);">Excess % of Insured</span><br>
                <span style="font-weight:600;color:var(--color-warning,#b36a00);">${esc(String(d.excess_pct_insured))}%</span>
              </div>` : ''}
              ${d.minimum_excess != null ? `
              <div>
                <span style="font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);">Min Excess</span><br>
                <span style="font-weight:600;color:var(--color-warning,#b36a00);">${cur(d.minimum_excess)}</span>
              </div>` : ''}
            </div>
          </div>` : ''}

          <!-- Asset Details -->
          <div class="detail-section card">
            <div class="detail-section-title">Asset Details</div>
            <div class="detail-grid">
              ${field('Asset Name', esc(d.asset_name || '—'))}
              ${d.item_number ? field('Item Number', esc(d.item_number)) : ''}
              ${field('Asset Type', esc(d.asset_type || '—'))}
              ${field('Status', `<span class="badge" data-status="${esc(d.asset_status || '')}">${esc(d.asset_status || '—')}</span>`)}
              ${d.asset_section ? field('Asset Section', esc(d.asset_section)) : ''}
              ${field('Asset Value', cur(d.asset_value) || '—')}
              ${d.mm_number ? field('M &amp; M Number', esc(d.mm_number)) : ''}
            </div>
          </div>

          <!-- Insurance Financials -->
          <div class="detail-section card" id="asset-fin-card">
            <div class="detail-section-title" style="display:flex;align-items:center;gap:.75rem;">
              <span>Insurance Financials</span>
              <span style="flex:1;"></span>
              <label style="display:flex;align-items:center;gap:.35rem;font-size:.78rem;font-weight:400;color:var(--text-muted);cursor:pointer;">
                <input type="checkbox" id="asset-fin-breakdown-cb" ${getBreakdownPref('asset') ? 'checked' : ''} />
                Show breakdown
              </label>
            </div>
            <div id="asset-fin-body"></div>
          </div>

          <!-- Address (Building / Risk) -->
          ${(d.address || d.city) ? `
          <div class="detail-section card">
            <div class="detail-section-title" style="display:flex;align-items:center;gap:.5rem;">
              ${['Motor','Goods in Transit','Marine','Aviation'].includes(d.asset_type) ? 'Risk Address' : 'Building Address'}
              ${(() => {
                const addrParts = [d.address, d.complex_building, d.suburb, d.city, d.province, d.postal_code, d.country].filter(Boolean);
                const addrUrl = addrParts.length ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrParts.join(', '))}` : null;
                const gpsUrl  = (d.gps_lat && d.gps_lng) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.gps_lat + ',' + d.gps_lng)}` : null;
                return `
                  ${addrUrl ? `<a href="${addrUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="margin-left:auto;font-size:.75rem;">📍 Open in Google Maps</a>` : ''}
                  ${gpsUrl  ? `<a href="${gpsUrl}"  target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="${addrUrl ? '' : 'margin-left:auto;'}font-size:.75rem;">🌐 Open GPS</a>` : ''}`;
              })()}
            </div>
            <div class="detail-grid">
              ${field('Street Address', esc(d.address || '—'))}
              ${field('Complex / Building', esc(d.complex_building || '—'))}
              ${field('Suburb', esc(d.suburb || '—'))}
              ${field('City / Town', esc(d.city || '—'))}
              ${field('Province', esc(d.province || '—'))}
              ${field('Postal Code', esc(d.postal_code || '—'))}
              ${field('Country', esc(d.country || '—'))}
              ${field('GPS Latitude', esc(d.gps_lat || '—'))}
              ${field('GPS Longitude', esc(d.gps_lng || '—'))}
            </div>
          </div>` : ''}

          <!-- Identification (hide if no relevant fields) -->
          ${(d.make || d.model || d.year || d.registration_number || d.vin_number || d.engine_number || d.serial_number || d.fleet_number) ? `
          <div class="detail-section card">
            <div class="detail-section-title">Identification</div>
            <div class="detail-grid">
              ${d.make ? field('Make', esc(d.make)) : ''}
              ${d.model ? field('Model', esc(d.model)) : ''}
              ${d.year ? field('Year', esc(d.year)) : ''}
              ${d.registration_number ? field('Registration Number', esc(d.registration_number)) : ''}
              ${d.vin_number ? field('VIN Number', esc(d.vin_number)) : ''}
              ${d.engine_number ? field('Engine Number', esc(d.engine_number)) : ''}
              ${d.serial_number ? field('Serial Number', esc(d.serial_number)) : ''}
              ${d.fleet_number ? field('Fleet Number', esc(d.fleet_number)) : ''}
            </div>
          </div>` : ''}

          ${(() => {
            let extras = [];
            try { extras = JSON.parse(d.vehicle_extras || '[]'); } catch(_) {}
            if (!extras.length) return '';
            const legacyAllIn   = !!d.extras_in_total;
            const isIncluded    = (ex) => (ex.include_in_total != null ? !!ex.include_in_total : legacyAllIn);
            const totalIncluded = extras.reduce((s, ex) => s + (isIncluded(ex) ? (parseFloat(ex.amount) || 0) : 0), 0);
            const totalExcluded = extras.reduce((s, ex) => s + (!isIncluded(ex) ? (parseFloat(ex.amount) || 0) : 0), 0);
            const totalExtras   = totalIncluded + totalExcluded;
            const totalExtrasPr = extras.reduce((s, ex) => s + (parseFloat(ex.premium) || 0), 0);
            return `
            <div class="detail-section card">
              <div class="detail-section-title">Vehicle Extras</div>
              <table class="table" style="margin:0;">
                <thead><tr>
                  <th>Description</th>
                  <th style="text-align:right;">Amount</th>
                  <th style="text-align:right;">Premium</th>
                  <th style="text-align:center;">In Total</th>
                </tr></thead>
                <tbody>
                  ${extras.map(ex => `<tr${!isIncluded(ex) ? ' style="opacity:.65;"' : ''}>
                    <td>${esc(ex.name || '—')}</td>
                    <td style="text-align:right;">${ex.amount != null ? cur(ex.amount) : '—'}</td>
                    <td style="text-align:right;">${ex.premium != null ? cur(ex.premium) : '—'}</td>
                    <td style="text-align:center;">${isIncluded(ex) ? '<span class="bool-yes">&#10003;</span>' : '<span class="bool-no">&#10007;</span>'}</td>
                  </tr>`).join('')}
                  <tr style="font-weight:600;border-top:2px solid #dee2e6;">
                    <td>Totals (all extras)</td>
                    <td style="text-align:right;">${cur(totalExtras)}</td>
                    <td style="text-align:right;">${cur(totalExtrasPr)}</td>
                    <td></td>
                  </tr>
                  ${totalExcluded ? `
                  <tr style="font-weight:500;color:var(--text-muted);">
                    <td>Of which: included in Asset Value</td>
                    <td style="text-align:right;">${cur(totalIncluded)}</td>
                    <td colspan="2"></td>
                  </tr>
                  <tr style="font-weight:500;color:var(--text-muted);">
                    <td>Of which: excluded</td>
                    <td style="text-align:right;">${cur(totalExcluded)}</td>
                    <td colspan="2"></td>
                  </tr>` : ''}
                </tbody>
              </table>
            </div>`;
          })()}

          ${(() => {
            let excesses = [];
            try { excesses = JSON.parse(d.excesses || '[]'); } catch(_) {}
            if (!excesses.length) return '';
            const totalExcess      = excesses.reduce((s, ex) => s + (parseFloat(ex.amount)  || 0), 0);
            const totalExcessPrem  = excesses.reduce((s, ex) => s + (parseFloat(ex.premium) || 0), 0);
            return `
            <div class="detail-section card">
              <div class="detail-section-title">Excess Info</div>
              <table class="table" style="margin:0;">
                <thead><tr><th>Excess Type</th><th style="text-align:right;">Amount</th><th style="text-align:right;">Premium</th></tr></thead>
                <tbody>
                  ${excesses.map(ex => `<tr>
                    <td>${esc(ex.type || '—')}</td>
                    <td style="text-align:right;">${ex.amount  != null ? cur(ex.amount)  : '—'}</td>
                    <td style="text-align:right;">${ex.premium != null ? cur(ex.premium) : '—'}</td>
                  </tr>`).join('')}
                  <tr style="font-weight:600;border-top:2px solid #dee2e6;">
                    <td>Totals</td>
                    <td style="text-align:right;">${cur(totalExcess)}</td>
                    <td style="text-align:right;">${cur(totalExcessPrem)}</td>
                  </tr>
                </tbody>
              </table>
            </div>`;
          })()}

          ${(() => {
            let covers = [];
            try { covers = JSON.parse(d.additional_covers || '[]'); } catch(_) {}
            if (!covers.length) return '';
            const isIn          = (c) => (c.include_in_total != null ? !!c.include_in_total : true);
            const totalIncluded = covers.reduce((s, c) => s + (isIn(c)  ? (parseFloat(c.cover_amount) || 0) : 0), 0);
            const totalExcluded = covers.reduce((s, c) => s + (!isIn(c) ? (parseFloat(c.cover_amount) || 0) : 0), 0);
            const totalCA       = totalIncluded + totalExcluded;
            const totalPrm      = covers.reduce((s, c) => s + (parseFloat(c.premium) || 0), 0);
            return `
            <div class="detail-section card">
              <div class="detail-section-title">Additional Cover</div>
              <table class="table" style="margin:0;">
                <thead><tr>
                  <th>Description</th>
                  <th style="text-align:right;">Cover Amount</th>
                  <th style="text-align:right;">Premium</th>
                  <th style="text-align:center;">In Total</th>
                </tr></thead>
                <tbody>
                  ${covers.map(c => `<tr${!isIn(c) ? ' style="opacity:.65;"' : ''}>
                    <td>${esc(c.description || '—')}</td>
                    <td style="text-align:right;">${c.cover_amount != null ? cur(c.cover_amount) : '—'}</td>
                    <td style="text-align:right;">${c.premium      != null ? cur(c.premium)      : '—'}</td>
                    <td style="text-align:center;">${isIn(c) ? '<span class="bool-yes">&#10003;</span>' : '<span class="bool-no">&#10007;</span>'}</td>
                  </tr>`).join('')}
                  <tr style="font-weight:600;border-top:2px solid #dee2e6;">
                    <td>Totals (all covers)</td>
                    <td style="text-align:right;">${cur(totalCA)}</td>
                    <td style="text-align:right;">${cur(totalPrm)}</td>
                    <td></td>
                  </tr>
                  ${totalExcluded ? `
                  <tr style="font-weight:500;color:var(--text-muted);">
                    <td>Of which: included in Asset Value</td>
                    <td style="text-align:right;">${cur(totalIncluded)}</td>
                    <td colspan="2"></td>
                  </tr>
                  <tr style="font-weight:500;color:var(--text-muted);">
                    <td>Of which: excluded</td>
                    <td style="text-align:right;">${cur(totalExcluded)}</td>
                    <td colspan="2"></td>
                  </tr>` : ''}
                </tbody>
              </table>
            </div>`;
          })()}

          <!-- Vehicle Risk Details -->
          ${(d.parking_type || d.tracker_fitted || d.vehicle_use) ? `
          <div class="detail-section card">
            <div class="detail-section-title">Vehicle Risk Details</div>
            <div class="detail-grid">
              ${d.parking_type ? field('Parking', esc(d.parking_type === 'Other' && d.parking_other ? `Other — ${d.parking_other}` : d.parking_type)) : ''}
              ${d.tracker_fitted ? field('Tracker Device Fitted', esc(d.tracker_fitted)) : ''}
              ${d.vehicle_use ? field('Vehicle Use', esc(d.vehicle_use)) : ''}
            </div>
          </div>` : ''}

          <!-- Financial Interest -->
          ${(d.financial_interest_noted || d.financial_institution || d.finance_contract_number || d.contract_expiry_date) ? `
          <div class="detail-section card">
            <div class="detail-section-title">Financial Interest</div>
            <div class="detail-grid">
              ${field('Financial Interest Noted', bool(d.financial_interest_noted))}
              ${d.financial_institution ? field('Financial Institution', esc(d.financial_institution)) : ''}
              ${d.finance_contract_number ? field('Finance Contract Number', esc(d.finance_contract_number)) : ''}
              ${d.contract_expiry_date ? field('Contract Expiry Date', formatDate(d.contract_expiry_date)) : ''}
            </div>
          </div>` : ''}

          <!-- Section-Specific Details (dynamically built) -->
          ${(() => {
            const sKey = getSectionFieldKey(d.asset_section);
            const sDefs = sKey ? SECTION_FIELD_DEFS[sKey] : null;
            if (!sDefs) return '';
            const filledFields = sDefs.filter(f => d[f.name] != null && d[f.name] !== '' && d[f.name] !== 0 && d[f.name] !== false);
            if (!filledFields.length) return '';
            return `
            <div class="detail-section card">
              <div class="detail-section-title">${esc(sKey)} Details</div>
              <div class="detail-grid">
                ${filledFields.map(f => {
                  if (f.type === 'checkbox') return field(f.label, bool(d[f.name]));
                  if (f.name.includes('value') || f.name.includes('insured') || f.name.includes('limit') || f.name.includes('turnover') || f.name.includes('load') || f.name.includes('items') || f.name === 'replacement_value' || f.name === 'aggregate_limit' || f.name === 'limit_of_indemnity') return field(f.label, cur(d[f.name]) || esc(String(d[f.name])));
                  return field(f.label, esc(String(d[f.name])));
                }).join('')}
              </div>
            </div>`;
          })()}

          <!-- Cover Details -->
          ${(d.sum_insured || d.basis_of_cover || d.conditions || d.extensions || d.exclusions) ? `
          <div class="detail-section card">
            <div class="detail-section-title">Cover Details</div>
            <div class="detail-grid">
              ${d.sum_insured ? field('Sum Insured', cur(d.sum_insured)) : ''}
              ${d.basis_of_cover ? field('Basis of Cover', esc(d.basis_of_cover)) : ''}
            </div>
            ${d.conditions ? `<div class="detail-text-item" style="padding:.5rem 1rem;"><strong>Conditions</strong><p style="margin:.25rem 0;">${esc(d.conditions)}</p></div>` : ''}
            ${d.extensions ? `<div class="detail-text-item" style="padding:.5rem 1rem;"><strong>Extensions</strong><p style="margin:.25rem 0;">${esc(d.extensions)}</p></div>` : ''}
            ${d.exclusions ? `<div class="detail-text-item" style="padding:.5rem 1rem;"><strong>Exclusions</strong><p style="margin:.25rem 0;">${esc(d.exclusions)}</p></div>` : ''}
          </div>` : ''}

          <!-- Links -->
          <div class="detail-section card">
            <div class="detail-section-title">Links</div>
            <div class="detail-grid">
              ${field('Contact', d.contact_id ? `<a href="#/contacts/${d.contact_id}">${esc(d.contact_name || '—')}</a>` : '—')}
              ${field('Account', d.account_id ? `<a href="#/accounts/${d.account_id}">${esc(d.account_name || '—')}</a>` : '—')}
              ${field('Policy', d.policy_id ? `<a href="#/policies/${d.policy_id}">${esc(d.policy_name || '—')}</a>` : '—')}
            </div>
          </div>

          <!-- Dates -->
          <div class="detail-section card">
            <div class="detail-section-title">Dates</div>
            <div class="detail-grid">
              ${field('Date Acquired', d.date_acquired ? formatDate(d.date_acquired) : '—')}
              ${field('Date Sold', d.date_sold ? formatDate(d.date_sold) : '—')}
            </div>
          </div>

          <!-- Related Contacts -->
          ${(() => {
            let rows = [];
            try { rows = JSON.parse(d.related_contacts || '[]') || []; } catch (_) {}
            if (!Array.isArray(rows) || !rows.length) return '';
            return `
            <div class="detail-section card">
              <div class="detail-section-title">Related Contacts</div>
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

          <!-- Notes -->
          ${d.notes ? `
          <div class="detail-section card">
            <div class="detail-section-title">Notes</div>
            <p class="detail-notes">${esc(d.notes)}</p>
          </div>` : ''}

          <!-- Linked Risk Details -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Risk Details</h3>
              <a href="#/risk-details/new?asset_id=${id}" class="btn btn-sm btn-primary">+ Add Risk Detail</a>
            </div>
            <div class="table-responsive">
              <table class="table">
                <thead><tr><th>Name</th><th>Risk Type</th><th>Section</th><th>Last Updated</th><th>Actions</th></tr></thead>
                <tbody>
                  ${riskDetails.length
                    ? riskDetails.map(r => `
                      <tr>
                        <td><a href="#/risk-details/${r.id}">${esc(r.risk_detail_name || '—')}</a></td>
                        <td>${esc(r.risk_type || '—')}</td>
                        <td>${esc(r.section_name || '—')}</td>
                        <td>${r.updated_at ? formatDate(r.updated_at) : '—'}</td>
                        <td><a href="#/risk-details/${r.id}/edit" class="btn btn-sm btn-primary">Edit</a></td>
                      </tr>`).join('')
                    : `<tr><td colspan="5" class="table-empty">No risk details.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Tabs -->
          <div class="detail-tabs card">
            <div class="tabs-header" id="asset-tabs-header">
              <button class="tab-btn active" data-tab="amendments">Notes</button>
              <button class="tab-btn"        data-tab="claims">Claims</button>
              <button class="tab-btn"        data-tab="documents">Documents</button>
              <button class="tab-btn"        data-tab="workflows">Workflows</button>
              <button class="tab-btn"        data-tab="versions">Versions</button>
              <button class="tab-btn"        data-tab="timeline">Timeline</button>
            </div>
            <div class="tab-content" id="asset-tab-content">
              <div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>
            </div>
          </div>

        </div>
      `;

      loadAssetTab(id, 'amendments');

      // Insurance Financials — combined / breakdown toggle
      (function wireAssetFinBreakdown() {
        const body = document.getElementById('asset-fin-body');
        const cb   = document.getElementById('asset-fin-breakdown-cb');
        if (!body) return;
        const breakdown = calcAssetBreakdown(d);
        function draw() {
          const showBreakdown = cb ? cb.checked : false;
          if (!showBreakdown) {
            body.innerHTML = `
              <div class="detail-grid">
                ${field('Asset Value', cur(d.asset_value) || '—')}
                ${field('Premium',     cur(d.premium)     || '—')}
                ${field('SASRIA',      cur(d.sasria)      || '—')}
                ${field('Excess',      cur(d.excess)      || '—')}
                ${d.policy_id ? field('Policy', `<a href="#/policies/${d.policy_id}">${esc(d.policy_name || d.policy_number || '—')}</a>`) : ''}
                ${d.asset_section ? field('Section', esc(d.asset_section)) : ''}
              </div>`;
          } else {
            const row = (label, val, opts = {}) => `
              <div class="detail-field" style="${opts.bold ? 'font-weight:600;border-top:1px solid #dee2e6;padding-top:.4rem;margin-top:.2rem;' : ''}">
                <span class="detail-label">${label}</span>
                <span class="detail-value">${val == null ? '—' : (cur(val) || '—')}</span>
              </div>`;
            body.innerHTML = `
              <div class="detail-grid">
                ${row('Sum Insured',                breakdown.sumInsured)}
                ${breakdown.additionalCoversAmountIncluded ? row('Additional Covers (in total)', breakdown.additionalCoversAmountIncluded) : ''}
                ${breakdown.additionalCoversAmountExcluded ? row(`Additional Covers (excluded) <span style="color:var(--text-muted);font-size:.75rem;font-weight:400;">— per-row "In total" off</span>`, breakdown.additionalCoversAmountExcluded) : ''}
                ${breakdown.extrasAmountIncluded ? row('Vehicle Extras (in total)', breakdown.extrasAmountIncluded) : ''}
                ${breakdown.extrasAmountExcluded ? row(`Vehicle Extras (excluded) <span style="color:var(--text-muted);font-size:.75rem;font-weight:400;">— per-row "In total" off</span>`, breakdown.extrasAmountExcluded) : ''}
                ${row('Total Asset Value',          breakdown.assetValue, { bold: true })}
                ${row('Sum Insured Premium',        breakdown.sumInsuredPremium)}
                ${row('Vehicle Extras Premium',     breakdown.extrasPremium)}
                ${row('Additional Covers Premium',  breakdown.additionalCoversPremium)}
                ${row('Excesses Premium',           breakdown.excessesPremium)}
                ${row('SASRIA',                     breakdown.sasria)}
                ${row('Total Premium',              breakdown.premium, { bold: true })}
                ${row('Basic Excess',               parseFloat(d.excess) || 0)}
                ${d.policy_id ? `<div class="detail-field"><span class="detail-label">Policy</span><span class="detail-value"><a href="#/policies/${d.policy_id}">${esc(d.policy_name || d.policy_number || '—')}</a></span></div>` : ''}
                ${d.asset_section ? `<div class="detail-field"><span class="detail-label">Section</span><span class="detail-value">${esc(d.asset_section)}</span></div>` : ''}
              </div>`;
          }
        }
        if (cb) {
          cb.addEventListener('change', () => {
            setBreakdownPref('asset', cb.checked);
            draw();
          });
        }
        draw();
      })();

      document.getElementById('asset-tabs-header').querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#asset-tabs-header .tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          loadAssetTab(id, btn.dataset.tab);
        });
      });

    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load asset: ${esc(err.message)}</div>`;
    }
  }

  async function loadAssetTab(assetId, tab) {
    const tabEl = document.getElementById('asset-tab-content');
    if (!tabEl) return;
    tabEl.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    try {
      switch (tab) {
        case 'timeline': {
          const entries = await Api.timeline.forRecord('assets', assetId);
          const rows = Array.isArray(entries) ? entries : (entries.data || []);
          tabEl.innerHTML = `<div style="padding:.75rem 1rem;">${renderTimeline(rows, 'No activity recorded yet.')}</div>`;
          break;
        }
        case 'documents': {
          const res = await Api.documents.list({ module: 'assets', record_id: assetId });
          const docs = (res.data || []);
          tabEl.innerHTML = `
            <div class="tab-toolbar">
              <label class="btn btn-primary btn-sm" for="asset-doc-upload">+ Upload Document</label>
              <input type="file" id="asset-doc-upload" style="display:none;"
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
          document.getElementById('asset-doc-upload').addEventListener('change', async e => {
            const file = e.target.files[0];
            if (!file) return;
            try {
              const fd = new FormData();
              fd.append('file', file);
              fd.append('module', 'assets');
              fd.append('record_id', assetId);
              await Api.documents.upload(fd);
              showToast('Document uploaded.', 'success');
              loadAssetTab(assetId, 'documents');
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
                loadAssetTab(assetId, 'documents');
              } catch (err) {
                showToast('Delete failed: ' + (err.message || err), 'error');
              }
            });
          });
          break;
        }
        case 'versions': {
          await renderVersionsTab(tabEl, 'assets', assetId);
          break;
        }
        case 'workflows': {
          const wfRes = await Api.workflows.list({ asset_id: assetId, limit: 200 }).catch(() => ({ data: [] }));
          const wfs = wfRes.data || wfRes || [];
          tabEl.innerHTML = `
            <div class="tab-toolbar">
              <a class="btn btn-primary btn-sm" href="#/workflows/new?asset_id=${assetId}">+ New Workflow</a>
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
            </table>` : `<p class="tab-empty">No workflows linked to this asset.</p>`}
          `;
          break;
        }
        case 'amendments': {
          const rows = await Api.assets.amendmentsList(assetId).catch(() => []);
          const today = new Date().toISOString().slice(0, 10);
          const isAdmin = window.currentUser?.role === 'admin';

          const renderAttachments = (atts) => {
            if (!atts || !atts.length) return '<span style="color:var(--text-muted);font-size:.85rem;">No files attached</span>';
            return atts.map(a => {
              const delBtn = isAdmin
                ? `<button type="button" class="amend-att-del-btn" data-doc-id="${a.id}" data-doc-name="${esc(a.original_name)}" title="Delete file" style="background:none;border:none;color:#dc3545;cursor:pointer;padding:0 .15rem;font-weight:bold;">×</button>`
                : '';
              return `
                <span class="amend-attachment" style="display:inline-flex;align-items:center;gap:.25rem;padding:.15rem .5rem;margin:.15rem .25rem .15rem 0;background:#f1f3f5;border-radius:12px;font-size:.8rem;">
                  <a href="/api/documents/${a.id}/view" target="_blank" rel="noopener" title="${esc(a.original_name)}" style="text-decoration:none;color:#0d6efd;">📎 ${esc(a.original_name)}</a>
                  ${delBtn}
                </span>`;
            }).join('');
          };

          tabEl.innerHTML = `
            <div class="tab-toolbar">
              <button type="button" class="btn btn-primary btn-sm" id="asset-amend-new-btn">+ Add Note</button>
            </div>
            <form id="asset-amend-form" class="card" style="display:none;padding:1rem;margin:0 1rem 1rem;">
              <input type="hidden" name="amendment_id" value="" />
              <h4 id="asset-amend-form-title" style="margin:0 0 .75rem;">New Note</h4>
              <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group">
                  <label class="form-label">Date</label>
                  <input type="date" name="amendment_date" class="form-control" value="${today}" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Type <span style="color:var(--text-muted);font-weight:normal;">(optional)</span></label>
                  <input type="text" name="amendment_type" class="form-control" placeholder="e.g. Sum insured change, Section move, Reg number" />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Details</label>
                <textarea name="details" class="form-control" rows="4" required placeholder="Describe the note…"></textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Attachments <span style="color:var(--text-muted);font-weight:normal;">(optional — pdf, jpg, png, docx, xlsx, csv; max 20 MB each)</span></label>
                <input type="file" name="attachments" id="asset-amend-files" class="form-control"
                  accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.csv" multiple />
                <div id="asset-amend-files-preview" style="margin-top:.4rem;font-size:.85rem;color:var(--text-muted);"></div>
                <div id="asset-amend-files-help" style="margin-top:.25rem;font-size:.75rem;color:var(--text-muted);"></div>
              </div>
              <div style="display:flex;gap:.5rem;justify-content:flex-end;">
                <button type="button" class="btn btn-sm btn-secondary" id="asset-amend-cancel-btn">Cancel</button>
                <button type="submit" class="btn btn-sm btn-primary" id="asset-amend-submit-btn">Save Note</button>
              </div>
            </form>
            ${rows.length ? `
            <table class="table">
              <thead><tr>
                <th>Date</th><th>Type</th><th>Details</th><th>Attachments</th><th>Logged By</th><th></th>
              </tr></thead>
              <tbody>${rows.map(r => `
                <tr data-amend-row="${r.id}">
                  <td style="white-space:nowrap;">${r.amendment_date ? formatDate(r.amendment_date) : '—'}</td>
                  <td>${esc(r.amendment_type || '—')}</td>
                  <td style="white-space:pre-wrap;">${esc(r.details || '')}</td>
                  <td>
                    <div class="amend-att-list" data-amend-id="${r.id}">${renderAttachments(r.attachments)}</div>
                    <label class="btn btn-xs btn-outline" style="margin-top:.3rem;cursor:pointer;">
                      + Add file
                      <input type="file" class="amend-att-add-input" data-amend-id="${r.id}"
                        accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.csv" style="display:none;" />
                    </label>
                  </td>
                  <td>${esc(r.created_by_name || '—')}</td>
                  <td style="white-space:nowrap;text-align:right;">
                    <button class="btn btn-xs btn-outline amend-edit-btn" data-amend-id="${r.id}">Edit</button>
                    ${isAdmin ? `<button class="btn btn-xs btn-danger amend-del-btn" data-amend-id="${r.id}">Delete</button>` : ''}
                  </td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No notes captured yet.</p>`}
          `;

          const newBtn    = document.getElementById('asset-amend-new-btn');
          const form      = document.getElementById('asset-amend-form');
          const formTitle = document.getElementById('asset-amend-form-title');
          const cancelBtn = document.getElementById('asset-amend-cancel-btn');
          const fileInput = document.getElementById('asset-amend-files');
          const filePrev  = document.getElementById('asset-amend-files-preview');
          const fileHelp  = document.getElementById('asset-amend-files-help');
          const submitBtn = document.getElementById('asset-amend-submit-btn');
          const idInput   = form.querySelector('input[name="amendment_id"]');

          // Open the form in CREATE mode
          function openCreate() {
            form.reset();
            idInput.value = '';
            form.querySelector('input[name="amendment_date"]').value = today;
            formTitle.textContent = 'New Note';
            submitBtn.textContent = 'Save Note';
            fileHelp.textContent = '';
            filePrev.textContent = '';
            form.style.display = 'block';
            form.querySelector('textarea[name="details"]').focus();
          }

          // Open the form in EDIT mode, pre-populated from a row
          function openEdit(amendId) {
            const row = rows.find(r => String(r.id) === String(amendId));
            if (!row) return;
            form.reset();
            idInput.value = String(row.id);
            form.querySelector('input[name="amendment_date"]').value = row.amendment_date
              ? String(row.amendment_date).slice(0, 10)
              : today;
            form.querySelector('input[name="amendment_type"]').value = row.amendment_type || '';
            form.querySelector('textarea[name="details"]').value = row.details || '';
            formTitle.textContent = 'Edit Note';
            submitBtn.textContent = 'Save Changes';
            fileHelp.textContent = 'Files added here will be attached to this note in addition to its existing attachments.';
            filePrev.textContent = '';
            form.style.display = 'block';
            form.querySelector('textarea[name="details"]').focus();
          }

          newBtn.addEventListener('click', openCreate);
          cancelBtn.addEventListener('click', () => {
            form.reset();
            idInput.value = '';
            form.querySelector('input[name="amendment_date"]').value = today;
            filePrev.textContent = '';
            fileHelp.textContent = '';
            form.style.display = 'none';
          });
          fileInput.addEventListener('change', () => {
            const files = Array.from(fileInput.files || []);
            filePrev.textContent = files.length
              ? `${files.length} file(s) selected: ${files.map(f => f.name).join(', ')}`
              : '';
          });

          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(form);
            const editingId = idInput.value || null;
            const payload = {
              amendment_date: fd.get('amendment_date') || today,
              amendment_type: (fd.get('amendment_type') || '').trim() || null,
              details:        (fd.get('details') || '').trim(),
            };
            if (!payload.details) {
              showToast('Details are required.', 'error');
              return;
            }
            const files = Array.from(fileInput.files || []);
            submitBtn.disabled = true;
            const isEdit = !!editingId;
            submitBtn.textContent = files.length
              ? (isEdit ? 'Saving changes + uploading…' : 'Saving + uploading…')
              : (isEdit ? 'Saving changes…' : 'Saving…');
            try {
              const saved = isEdit
                ? await Api.assets.amendmentsUpdate(assetId, editingId, payload)
                : await Api.assets.amendmentsCreate(assetId, payload);
              if (files.length) {
                const uploadFailures = [];
                for (const f of files) {
                  try {
                    const ufd = new FormData();
                    ufd.append('file', f);
                    ufd.append('module', 'asset-amendments');
                    ufd.append('record_id', saved.id);
                    await Api.documents.upload(ufd);
                  } catch (err) {
                    uploadFailures.push(`${f.name}: ${err.message || err}`);
                  }
                }
                if (uploadFailures.length) {
                  showToast(`Note ${isEdit ? 'updated' : 'saved'}, but ${uploadFailures.length} file(s) failed: ${uploadFailures.join('; ')}`, 'error');
                } else {
                  showToast(`Note ${isEdit ? 'updated' : 'saved'} with ${files.length} file(s).`, 'success');
                }
              } else {
                showToast(`Note ${isEdit ? 'updated' : 'saved'}.`, 'success');
              }
              loadAssetTab(assetId, 'amendments');
            } catch (err) {
              showToast(`Failed to ${isEdit ? 'update' : 'save'} note: ` + (err.message || err), 'error');
              submitBtn.disabled = false;
              submitBtn.textContent = isEdit ? 'Save Changes' : 'Save Note';
            }
          });

          // Edit
          tabEl.querySelectorAll('.amend-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => openEdit(btn.dataset.amendId));
          });

          // Delete (admin only)
          tabEl.querySelectorAll('.amend-del-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
              if (!confirm('Delete this note and all its attached files? This cannot be undone.')) return;
              try {
                await Api.assets.amendmentsDelete(assetId, btn.dataset.amendId);
                showToast('Note deleted.', 'success');
                loadAssetTab(assetId, 'amendments');
              } catch (err) {
                showToast('Delete failed: ' + (err.message || err), 'error');
              }
            });
          });

          // Add file to an existing amendment
          tabEl.querySelectorAll('.amend-att-add-input').forEach(inp => {
            inp.addEventListener('change', async () => {
              const f = inp.files && inp.files[0];
              if (!f) return;
              try {
                const ufd = new FormData();
                ufd.append('file', f);
                ufd.append('module', 'asset-amendments');
                ufd.append('record_id', inp.dataset.amendId);
                await Api.documents.upload(ufd);
                showToast('File attached.', 'success');
                loadAssetTab(assetId, 'amendments');
              } catch (err) {
                showToast('Upload failed: ' + (err.message || err), 'error');
                inp.value = '';
              }
            });
          });

          // Delete a single attachment (admin only — only rendered for admin)
          tabEl.querySelectorAll('.amend-att-del-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
              if (!confirm(`Delete file "${btn.dataset.docName}"?`)) return;
              try {
                await Api.documents.delete(btn.dataset.docId);
                showToast('File deleted.', 'success');
                loadAssetTab(assetId, 'amendments');
              } catch (err) {
                showToast('Delete failed: ' + (err.message || err), 'error');
              }
            });
          });
          break;
        }
        case 'claims': {
          const claimsRes = await Api.claims.list({ asset_id: assetId, limit: 100 }).catch(() => ({ data: [] }));
          const claims = claimsRes.data || claimsRes || [];
          tabEl.innerHTML = `
            <div class="tab-toolbar">
              <a href="#/claims/new?asset_id=${assetId}" class="btn btn-primary btn-sm">+ Add Claim</a>
            </div>
            ${claims.length ? `
            <table class="table">
              <thead><tr>
                <th>Claim Number</th><th>Type</th><th>Status</th><th>Date</th>
                <th style="text-align:right;">Est. Value</th><th></th>
              </tr></thead>
              <tbody>${claims.map(c => `
                <tr>
                  <td><a href="#/claims/${c.id}">${esc(c.claim_number || '—')}</a></td>
                  <td>${esc(c.claim_type || '—')}</td>
                  <td>${statusBadgeHtml(c.claim_status)}</td>
                  <td>${c.claim_date ? formatDate(c.claim_date) : '—'}</td>
                  <td style="text-align:right;">${c.estimated_value ? formatCurrency(c.estimated_value) : '—'}</td>
                  <td><a href="#/claims/${c.id}" class="btn btn-xs btn-outline">View</a></td>
                </tr>`).join('')}</tbody>
            </table>` : `<p class="tab-empty">No claims linked to this asset.</p>`}
          `;
          break;
        }
        default:
          tabEl.innerHTML = '';
      }
    } catch (err) {
      tabEl.innerHTML = `<p class="tab-empty text-danger">Failed to load tab: ${esc(err.message || String(err))}</p>`;
    }
  }

  // ── Amendment Mail ────────────────────────────────────────────────────────

  // Build the email body for a given fetch result. `data.is_new_asset`
  // tells us whether the popup was opened straight after creation
  // (range=new) so we use the "Please add this new asset" wording.
  function _buildAmendmentEmailBody(data) {
    const clientName = data.client_name || '';
    const policyNum  = data.policy_number || '';
    const brokerName = data.broker_name || window.currentUser?.full_name || '';
    const today      = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
    const changes    = data.changes || [];
    const isNewAsset = !!data.is_new_asset;

    const lineCount  = changes.length;
    const changeLines = lineCount
      ? changes.map((c, i) => `${i + 1}. ${c.description}`).join('\n')
      : (isNewAsset
          ? '1. (No field values captured for this asset yet — please describe the new asset manually)'
          : `1. (No changes recorded ${data.range_label || 'in the selected period'} — please describe the amendment manually)`);

    if (isNewAsset) {
      return `Good Day,

Please add the following new asset to the Policy of ${clientName}, Policy Number: ${policyNum} with effect of Today ${today}:

${changeLines}

Please confirm the addition.

Regards,

${brokerName}`;
    }

    return `Good Day,

Please do the following Amendments to the Policy of ${clientName}, Policy Number: ${policyNum} with effect of Today ${today}:

${changeLines}

Please confirm the Amendment.

Regards,

${brokerName}`;
  }

  async function _amendmentMail(assetId, opts = {}) {
    // mode: 'new' (post-create popup) | 'amend' (detail-page button)
    const mode = opts.mode === 'new' ? 'new' : 'amend';
    const initialRange = mode === 'new' ? 'new' : '24h';

    async function fetchData(range) {
      try {
        const res = await fetch(
          `/api/assets/${assetId}/amendment-changes?range=${encodeURIComponent(range)}`,
          { credentials: 'same-origin' }
        );
        if (res.ok) return await res.json();
      } catch (_) {}
      return {};
    }

    const data = await fetchData(initialRange);
    const policyNum = data.policy_number || '';
    const subject   = mode === 'new'
      ? `New asset to add to Policy ${policyNum}`
      : `Amendments to Policy ${policyNum}`;
    const initialBody = _buildAmendmentEmailBody(data);

    const rangeOptions = [
      { value: 'new',  label: 'Initial creation (all field values)' },
      { value: '24h',  label: 'Changes in the last 24 hours' },
      { value: 'week', label: 'Changes in the last 7 days' },
      { value: 'all',  label: 'All changes since asset created' },
    ];
    const optionsHtml = rangeOptions.map(o =>
      `<option value="${esc(o.value)}"${o.value === initialRange ? ' selected' : ''}>${esc(o.label)}</option>`
    ).join('');

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
            <label class="form-label">Show <span style="font-size:.75rem;color:var(--text-muted);font-weight:normal;">(re-renders the body below)</span></label>
            <select class="form-control" id="amend-range">${optionsHtml}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Email Body <span style="font-size:.75rem;color:var(--text-muted);font-weight:normal;">(editable)</span></label>
            <textarea class="form-control" id="amend-body" rows="14" style="font-family:inherit;white-space:pre-wrap;">${esc(initialBody)}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('amendment-modal').remove()">Cancel</button>
          <button class="btn btn-primary" id="amend-send-btn" onclick="Assets._sendAmendment()">Send Amendment</button>
        </div>
      </div>`;
    modal.dataset.assetId = assetId;
    document.body.appendChild(modal);

    // When the user changes the range, re-fetch and re-fill the body.
    // We refresh subject too if it still matches the auto-generated one
    // for the previous range (so manually edited subjects are preserved).
    let lastAutoSubject = subject;
    document.getElementById('amend-range').addEventListener('change', async (e) => {
      const newRange = e.target.value;
      const bodyEl = document.getElementById('amend-body');
      const subjEl = document.getElementById('amend-subject');
      const sel = e.target;
      sel.disabled = true;
      try {
        const fresh = await fetchData(newRange);
        bodyEl.value = _buildAmendmentEmailBody(fresh);
        const polNum = fresh.policy_number || '';
        const newAutoSubject = newRange === 'new'
          ? `New asset to add to Policy ${polNum}`
          : `Amendments to Policy ${polNum}`;
        if (subjEl.value === lastAutoSubject) subjEl.value = newAutoSubject;
        lastAutoSubject = newAutoSubject;
      } finally {
        sel.disabled = false;
      }
    });
  }

  async function _sendAmendment() {
    const modal = document.getElementById('amendment-modal');
    const amendAssetId = modal ? parseInt(modal.dataset.assetId, 10) : null;
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
      await Api.settings.sendEmail({ to, subject, html: htmlBody, text: body, audit_module: 'assets', audit_record_id: amendAssetId });
      document.getElementById('amendment-modal')?.remove();
      showToast('Amendment notification sent successfully', 'success');
    } catch (e) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = e.message; }
      if (btn) { btn.disabled = false; btn.textContent = 'Send Amendment'; }
    }
  }

  // ── Confirmation of Cover Mail ─────────────────────────────────────────────

  async function _confirmationOfCoverMail(assetId) {
    let pdfData = null;
    let assetData = {};
    try {
      const aRes = await Api.assets.get(assetId);
      assetData = aRes.data || aRes || {};
    } catch (_) {}

    try {
      const res = await fetch(`/api/assets/${assetId}/confirmation-of-cover-pdf`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Failed to generate Confirmation of Cover PDF');
      pdfData = await res.json();
    } catch (err) {
      showToast('Could not generate PDF: ' + (err.message || err), 'error');
      return;
    }

    let templates = [];
    try { templates = await Api.settings.listTemplates(); } catch (_) {}
    let claimForms = [];
    try { claimForms = await Api.settings.claimForms(); } catch (_) {}

    const clientName = assetData.account_name || assetData.contact_name || '';
    const policyNum  = assetData.policy_number || '';
    const assetName  = assetData.asset_name || '';
    const brokerName = window.currentUser?.full_name || '';
    const today = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });

    const subject = `Confirmation of Cover — ${assetName || 'Asset'}${policyNum ? ' — Policy ' + policyNum : ''}`;
    const body =
`Good Day,

Please find attached the Confirmation of Cover for ${clientName || assetName}${policyNum ? ` under Policy Number ${policyNum}` : ''}, effective ${today}.

Kindly confirm receipt.

Regards,

${brokerName}`;

    const modal = document.createElement('div');
    modal.id = 'cover-mail-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="width:620px;max-height:90vh;display:flex;flex-direction:column;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>Send Confirmation of Cover</h3>
          <button class="btn-close" onclick="document.getElementById('cover-mail-modal').remove()">×</button>
        </div>
        <div class="modal-body" style="overflow-y:auto;">
          <div id="cover-mail-error" style="display:none;color:var(--danger);margin-bottom:.75rem;"></div>

          <div class="form-group">
            <label class="form-label">To</label>
            <input class="form-control" id="cover-mail-to" placeholder="recipient@example.com" />
          </div>
          <div class="form-group">
            <label class="form-label">CC <span style="font-size:.75rem;color:var(--text-muted);font-weight:normal;">(optional, comma separated)</span></label>
            <input class="form-control" id="cover-mail-cc" placeholder="optional@example.com" />
          </div>

          <div class="form-group">
            <label class="form-label">Template</label>
            <select class="form-control" id="cover-mail-template" onchange="Assets._applyCoverMailTemplate(this.value)">
              <option value="">— No Template —</option>
              ${templates.map(t => `<option value="${esc(t.key)}">${esc(t.label)}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Subject</label>
            <input class="form-control" id="cover-mail-subject" value="${esc(subject)}" />
          </div>

          <div class="form-group">
            <label class="form-label">Body</label>
            <textarea class="form-control" id="cover-mail-body" rows="10" style="white-space:pre-wrap;">${esc(body)}</textarea>
          </div>

          <!-- Attachments -->
          <div class="form-group" style="border-top:1px solid var(--border-color,#dee2e6);padding-top:.75rem;margin-top:.5rem;">
            <label class="form-label">Attachments</label>

            <div style="margin-top:.25rem;">
              <button type="button" class="btn btn-secondary btn-sm" id="cover-mail-attach-file-btn">+ Add Attachment</button>
              <input type="file" id="cover-mail-attach-file-input" multiple style="display:none;" />
            </div>

            ${claimForms.length ? `
            <div style="margin-top:.5rem;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
              <select id="cover-mail-claim-form-select" class="form-control" style="flex:1;min-width:200px;">
                <option value="">— Select Claim Form —</option>
                ${claimForms.map(f => `<option value="${esc(f.filename)}">${esc(f.label || f.filename)}</option>`).join('')}
              </select>
              <button type="button" class="btn btn-secondary btn-sm" id="cover-mail-attach-claim-form-btn">Attach</button>
            </div>` : ''}

            <div id="cover-mail-attachment-list" style="margin-top:.5rem;display:flex;flex-direction:column;gap:.25rem;"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('cover-mail-modal').remove()">Cancel</button>
          <button class="btn btn-primary" id="cover-mail-send-btn" onclick="Assets._sendCoverMail(${assetId})">Send Email</button>
        </div>
      </div>`;
    /* backdrop-close disabled */
    document.body.appendChild(modal);

    // Pre-attach the generated Confirmation of Cover PDF
    modal._userAttachments = [{
      filename: pdfData.filename,
      content_base64: pdfData.base64,
      content_type: 'application/pdf',
    }];
    modal._claimFormNames = [];
    modal._templates = templates;
    modal._placeholders = {
      client_name: clientName,
      account_name: assetData.account_name || '',
      policy_number: policyNum,
      policy_name: assetData.policy_name || '',
      asset_name: assetName,
      broker_name: brokerName,
      today,
    };

    _wireCoverMailAttachments(modal);
  }

  function _wireCoverMailAttachments(modal) {
    const listEl = modal.querySelector('#cover-mail-attachment-list');
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
    renderList();

    const fileBtn = modal.querySelector('#cover-mail-attach-file-btn');
    const fileInput = modal.querySelector('#cover-mail-attach-file-input');
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

    const formSelect = modal.querySelector('#cover-mail-claim-form-select');
    const formBtn = modal.querySelector('#cover-mail-attach-claim-form-btn');
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

  function _applyCoverMailTemplate(key) {
    if (!key) return;
    const modal = document.getElementById('cover-mail-modal');
    const templates = modal?._templates || [];
    const ph = modal?._placeholders || {};
    const tpl = templates.find(t => t.key === key);
    if (!tpl) return;
    const subjectEl = document.getElementById('cover-mail-subject');
    const bodyEl = document.getElementById('cover-mail-body');
    const replace = (text) => (text || '').replace(/\{\{(\w+)\}\}/g, (m, k) => ph[k] !== undefined ? ph[k] : m);
    if (subjectEl && tpl.subject) subjectEl.value = replace(tpl.subject);
    if (bodyEl && tpl.body)       bodyEl.value    = replace(tpl.body);
  }

  async function _sendCoverMail(assetId) {
    const modal = document.getElementById('cover-mail-modal');
    if (!modal) return;
    const to = document.getElementById('cover-mail-to')?.value?.trim() || '';
    const ccRaw = document.getElementById('cover-mail-cc')?.value?.trim() || '';
    const subject = document.getElementById('cover-mail-subject')?.value?.trim() || '';
    const body = document.getElementById('cover-mail-body')?.value || '';
    const errEl = document.getElementById('cover-mail-error');
    const btn = document.getElementById('cover-mail-send-btn');

    if (!to || !subject || !body.trim()) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'To, Subject and Body are required.'; }
      return;
    }

    const cc = ccRaw ? ccRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const htmlBody = body.replace(/\n/g, '<br>');
    const payload = {
      to,
      ...(cc && cc.length ? { cc } : {}),
      subject,
      html: htmlBody,
      text: body,
      audit_module: 'assets',
      audit_record_id: assetId,
    };
    if (modal._userAttachments?.length) payload.user_attachments = modal._userAttachments;
    if (modal._claimFormNames?.length)  payload.claim_form_names = modal._claimFormNames;

    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
    try {
      await Api.settings.sendEmail(payload);
      modal.remove();
      showToast('Confirmation of Cover sent successfully', 'success');
    } catch (e) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = e.message || String(e); }
      if (btn)   { btn.disabled = false; btn.textContent = 'Send Email'; }
    }
  }

  // ── Breakdown helpers (canonical shape consumed by every total display) ───
  // Single source of truth for "what makes up an asset's Sum Insured / Premium".
  // Asset Value parts:  sum_insured + Σ additional_covers[].cover_amount
  //                     + Σ vehicle_extras[].amount where ex.include_in_total
  // Premium parts:      sum_insured_premium + sasria
  //                     + Σ vehicle_extras[].premium
  //                     + Σ additional_covers[].premium
  //                     + Σ excesses[].premium
  // Per-row include flag (`include_in_total`) is the new model. Older rows
  // saved before this version don't carry the flag — they fall back to the
  // legacy asset.extras_in_total column so historic data still rolls up
  // correctly until the asset is re-saved.
  function calcAssetBreakdown(asset) {
    if (!asset) {
      return {
        sumInsured: 0,
        extrasAmount: 0, extrasAmountIncluded: 0, extrasAmountExcluded: 0,
        additionalCoversAmount: 0, additionalCoversAmountIncluded: 0, additionalCoversAmountExcluded: 0,
        assetValue: 0,
        sumInsuredPremium: 0, sasria: 0,
        extrasPremium: 0, additionalCoversPremium: 0, excessesPremium: 0,
        premium: 0,
      };
    }
    const num = (v) => parseFloat(v) || 0;

    let extrasArr = [];
    let coversArr = [];
    let excessesArr = [];
    try { extrasArr   = JSON.parse(asset.vehicle_extras    || '[]') || []; } catch (_) {}
    try { coversArr   = JSON.parse(asset.additional_covers || '[]') || []; } catch (_) {}
    try { excessesArr = JSON.parse(asset.excesses          || '[]') || []; } catch (_) {}
    if (!Array.isArray(extrasArr))   extrasArr   = [];
    if (!Array.isArray(coversArr))   coversArr   = [];
    if (!Array.isArray(excessesArr)) excessesArr = [];

    const legacyAllIn = !!asset.extras_in_total;
    const isExtraIncluded = (ex) => (ex.include_in_total != null ? !!ex.include_in_total : legacyAllIn);
    // Additional covers were always summed pre-tickbox, so missing flag = true.
    const isCoverIncluded = (c)  => (c.include_in_total  != null ? !!c.include_in_total  : true);

    const sumInsured             = num(asset.sum_insured);
    const extrasAmount           = extrasArr.reduce((s, x) => s + num(x.amount), 0);
    const extrasAmountIncluded   = extrasArr.reduce((s, x) => s + (isExtraIncluded(x) ? num(x.amount) : 0), 0);
    const extrasAmountExcluded   = extrasAmount - extrasAmountIncluded;
    const additionalCoversAmount         = coversArr.reduce((s, x) => s + num(x.cover_amount), 0);
    const additionalCoversAmountIncluded = coversArr.reduce((s, x) => s + (isCoverIncluded(x) ? num(x.cover_amount) : 0), 0);
    const additionalCoversAmountExcluded = additionalCoversAmount - additionalCoversAmountIncluded;
    const assetValue             = sumInsured + additionalCoversAmountIncluded + extrasAmountIncluded;

    const sumInsuredPremium       = num(asset.sum_insured_premium);
    const sasria                  = num(asset.sasria);
    const extrasPremium           = extrasArr.reduce((s, x) => s + num(x.premium), 0);
    const additionalCoversPremium = coversArr.reduce((s, x) => s + num(x.premium), 0);
    const excessesPremium         = excessesArr.reduce((s, x) => s + num(x.premium), 0);
    const premium = sumInsuredPremium + sasria
                  + extrasPremium + additionalCoversPremium + excessesPremium;

    return {
      sumInsured,
      extrasAmount, extrasAmountIncluded, extrasAmountExcluded,
      additionalCoversAmount, additionalCoversAmountIncluded, additionalCoversAmountExcluded,
      assetValue,
      sumInsuredPremium, sasria, extrasPremium, additionalCoversPremium, excessesPremium, premium,
    };
  }

  function calcAggregateBreakdown(assets) {
    const init = {
      sumInsured: 0,
      extrasAmount: 0, extrasAmountIncluded: 0, extrasAmountExcluded: 0,
      additionalCoversAmount: 0, additionalCoversAmountIncluded: 0, additionalCoversAmountExcluded: 0,
      assetValue: 0,
      sumInsuredPremium: 0, sasria: 0,
      extrasPremium: 0, additionalCoversPremium: 0, excessesPremium: 0,
      premium: 0, excess: 0,
    };
    if (!Array.isArray(assets)) return init;
    return assets.reduce((agg, a) => {
      const b = calcAssetBreakdown(a);
      return {
        sumInsured:                       agg.sumInsured                       + b.sumInsured,
        extrasAmount:                     agg.extrasAmount                     + b.extrasAmount,
        extrasAmountIncluded:             agg.extrasAmountIncluded             + b.extrasAmountIncluded,
        extrasAmountExcluded:             agg.extrasAmountExcluded             + b.extrasAmountExcluded,
        additionalCoversAmount:           agg.additionalCoversAmount           + b.additionalCoversAmount,
        additionalCoversAmountIncluded:   agg.additionalCoversAmountIncluded   + b.additionalCoversAmountIncluded,
        additionalCoversAmountExcluded:   agg.additionalCoversAmountExcluded   + b.additionalCoversAmountExcluded,
        assetValue:                       agg.assetValue                       + b.assetValue,
        sumInsuredPremium:                agg.sumInsuredPremium                + b.sumInsuredPremium,
        sasria:                           agg.sasria                           + b.sasria,
        extrasPremium:                    agg.extrasPremium                    + b.extrasPremium,
        additionalCoversPremium:          agg.additionalCoversPremium          + b.additionalCoversPremium,
        excessesPremium:                  agg.excessesPremium                  + b.excessesPremium,
        premium:                          agg.premium                          + b.premium,
        excess:                           agg.excess                           + (parseFloat(a.excess) || 0),
      };
    }, init);
  }

  // localStorage helpers for the "Show breakdown" UI toggle (display-only)
  const BREAKDOWN_LS_KEY = 'inexpro:show-breakdown';
  function getBreakdownPref(scope) {
    try {
      const raw = localStorage.getItem(`${BREAKDOWN_LS_KEY}:${scope}`);
      return raw === '1';
    } catch (_) { return false; }
  }
  function setBreakdownPref(scope, on) {
    try { localStorage.setItem(`${BREAKDOWN_LS_KEY}:${scope}`, on ? '1' : '0'); } catch (_) {}
  }

  // Shared HTML renderer for an aggregate breakdown panel (used by policy /
  // sections / section-assets views). `agg` is the result of
  // calcAggregateBreakdown. `curFn` formats a number as currency (R xx.xx).
  function renderAggregateBreakdownHtml(agg, curFn) {
    const fmt = (v) => v != null ? curFn(v) : '—';
    const row = (label, val, bold) => `
      <div class="detail-field" style="${bold ? 'font-weight:600;border-top:1px solid #dee2e6;padding-top:.4rem;margin-top:.2rem;' : ''}">
        <span class="detail-label">${label}</span>
        <span class="detail-value">${fmt(val)}</span>
      </div>`;
    return `
      <div class="detail-grid" style="margin-top:.5rem;">
        ${row('Sum Insured (asset)', agg.sumInsured)}
        ${agg.additionalCoversAmountIncluded ? row('Additional Covers (in total)', agg.additionalCoversAmountIncluded) : ''}
        ${agg.additionalCoversAmountExcluded ? row(`Additional Covers (excluded) <span style="color:var(--text-muted);font-weight:normal;font-size:.75rem;">— not added to Asset Value</span>`, agg.additionalCoversAmountExcluded) : ''}
        ${agg.extrasAmountIncluded ? row('Vehicle Extras (in total)', agg.extrasAmountIncluded) : ''}
        ${agg.extrasAmountExcluded ? row(`Vehicle Extras (excluded) <span style="color:var(--text-muted);font-weight:normal;font-size:.75rem;">— not added to Asset Value</span>`, agg.extrasAmountExcluded) : ''}
        ${row('Total Asset Value', agg.assetValue, true)}
        ${row('Sum Insured Premium', agg.sumInsuredPremium)}
        ${agg.extrasPremium           ? row('Vehicle Extras Premium', agg.extrasPremium) : ''}
        ${agg.additionalCoversPremium ? row('Additional Covers Premium', agg.additionalCoversPremium) : ''}
        ${agg.excessesPremium         ? row('Excesses Premium', agg.excessesPremium) : ''}
        ${row('SASRIA', agg.sasria)}
        ${row('Total Premium', agg.premium, true)}
      </div>`;
  }

  // ── Shared renderer for "Assets" sub-tabs on other modules ────────────────
  // Renders a customizable asset table into `tabEl`, reusing the main module's
  // ViewPrefs catalog + config so column visibility/order are consistent
  // across the main list and all related-asset tabs.
  async function renderAssetsTab(tabEl, rows, opts = {}) {
    const { addHref, onAddClick, addLabel = '+ New Asset', emptyMsg = 'No assets linked.' } = opts;
    if (!tabEl) return;

    // Always refetch — per-user prefs must not leak across sessions
    try {
      const prefs = await ViewPrefs.load('assets');
      _assetCatalog = prefs.catalog;
      _assetConfig  = prefs.config;
    } catch (_) {}

    const INACTIVE = ['Sold', 'Decommissioned', 'Inactive', 'Cancelled'];
    const hiddenCount = rows.filter(a => INACTIVE.includes(a.asset_status)).length;
    let showInactive = false;

    function draw() {
      const visibleCols = _assetCatalog ? ViewPrefs.visibleColumns(_assetCatalog, _assetConfig) : [];
      const visRows = showInactive ? rows : rows.filter(a => !INACTIVE.includes(a.asset_status));

      const showTotalRow = visibleCols.some(c => c.id === 'asset_value') && visRows.some(a => a.asset_value != null);
      const totalValue = visRows.reduce((s, a) => s + (Number(a.asset_value) || 0), 0);
      const valueColIdx = visibleCols.findIndex(c => c.id === 'asset_value');

      const headCells = visibleCols.map(c => `<th${c.id === 'asset_value' || c.id === 'sum_insured' || c.id === 'premium' ? ' style="text-align:right;"' : ''}>${esc(c.label)}</th>`).join('');

      const bodyRows = visRows.length ? visRows.map(a => {
        const dim = INACTIVE.includes(a.asset_status) ? ' style="opacity:.55;"' : '';
        return `<tr${dim}>${visibleCols.map(col => {
          const fn = ASSET_CELLS[col.id];
          const align = (col.id === 'asset_value' || col.id === 'sum_insured' || col.id === 'premium') ? ' style="text-align:right;"' : '';
          const cls   = col.id === 'actions' ? ' class="actions-cell"' : '';
          return `<td${cls}${align}>${fn ? fn(a) : esc(String(a[col.id] ?? '—'))}</td>`;
        }).join('')}</tr>`;
      }).join('') : `<tr><td colspan="${visibleCols.length || 1}" class="table-empty">${esc(emptyMsg)}</td></tr>`;

      let tfoot = '';
      if (showTotalRow && valueColIdx >= 0) {
        const cells = visibleCols.map((c, i) => {
          if (i === valueColIdx) {
            return `<td style="text-align:right;font-weight:600;">R ${totalValue.toLocaleString('en-ZA', {minimumFractionDigits: 2})}</td>`;
          }
          if (i === valueColIdx - 1) {
            return `<td style="text-align:right;font-weight:600;">Total Asset Value</td>`;
          }
          return '<td></td>';
        }).join('');
        tfoot = `<tfoot><tr>${cells}</tr></tfoot>`;
      }

      const addBtnHtml = onAddClick
        ? `<button type="button" class="btn btn-sm btn-primary tab-asset-add-btn">${esc(addLabel)}</button>`
        : (addHref ? `<a href="${esc(addHref)}" class="btn btn-sm btn-primary">${esc(addLabel)}</a>` : '');

      tabEl.innerHTML = `
        <div class="tab-toolbar" style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;">
          ${addBtnHtml}
          ${hiddenCount > 0 ? `<label style="display:flex;align-items:center;gap:.35rem;font-size:.82rem;color:var(--text-muted);cursor:pointer;">
            <input type="checkbox" class="tab-asset-show-inactive" ${showInactive ? 'checked' : ''} /> Show sold/inactive (${hiddenCount})
          </label>` : ''}
          <span style="flex:1;"></span>
          <button type="button" class="btn btn-sm btn-secondary tab-asset-columns-btn">⚙ Columns</button>
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead><tr>${headCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
            ${tfoot}
          </table>
        </div>`;

      tabEl.querySelector('.tab-asset-add-btn')?.addEventListener('click', () => {
        if (typeof onAddClick === 'function') onAddClick();
      });
      tabEl.querySelector('.tab-asset-show-inactive')?.addEventListener('change', (e) => {
        showInactive = e.target.checked;
        draw();
      });
      tabEl.querySelector('.tab-asset-columns-btn')?.addEventListener('click', () => {
        if (!_assetCatalog) return;
        ViewPrefs.openEditor({
          moduleKey: 'assets',
          catalog: _assetCatalog,
          current: _assetConfig,
          onChange: (newConfig) => {
            _assetConfig = newConfig;
            draw();
          },
        });
      });

      // Delete buttons (if actions column is visible)
      tabEl.querySelectorAll('[data-delete-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id   = btn.dataset.deleteId;
          const name = btn.dataset.deleteName;
          if (!confirmDialog(`Delete asset "${name}"? This cannot be undone.`)) return;
          try {
            await Api.assets.delete(id);
            showToast('Asset deleted.', 'success');
            // Signal caller to refresh — simplest approach: just remove the row locally
            const idx = rows.findIndex(r => String(r.id) === String(id));
            if (idx >= 0) rows.splice(idx, 1);
            draw();
          } catch (err) {
            showToast('Delete failed: ' + err.message, 'error');
          }
        });
      });
    }

    draw();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return { list, form, detail, _amendmentMail, _sendAmendment,
           _confirmationOfCoverMail, _sendCoverMail, _applyCoverMailTemplate,
           renderAssetsTab,
           calcAssetBreakdown, calcAggregateBreakdown,
           getBreakdownPref, setBreakdownPref,
           renderAggregateBreakdownHtml };

})();
