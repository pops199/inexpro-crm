/* ═══════════════════════════════════════════════════════════════════════════
   Dashboard — user-configurable widgets (chips / charts / tables)
   ═══════════════════════════════════════════════════════════════════════════
   The layout is driven by the user's saved config (or the company default).
   Widgets are described by the server catalog; the client only renders.
   "Edit Dashboard" opens a modal where the user toggles widgets, reorders
   them with drag-and-drop, and picks display modes.
   ═══════════════════════════════════════════════════════════════════════════ */

function _dashboardModeToggle(current) {
  const opt = (mode, label, href) => `
    <option value="${href}" ${current === mode ? 'selected' : ''}>${label}</option>`;
  return `
    <select class="dashboard-mode-toggle form-control" id="dashboard-mode-select"
      style="height:30px;padding:.15rem .55rem;font-size:.85rem;max-width:200px;">
      ${opt('main', 'Main Dashboard', '#/dashboard')}
      ${opt('tcf',  'TCF Dashboard',  '#/dashboard/tcf')}
    </select>`;
}
window._dashboardModeToggle = _dashboardModeToggle;

function _injectDashboardToggle(mode) {
  const el = document.getElementById('header-center');
  if (!el) return;
  el.innerHTML = _dashboardModeToggle(mode);
  const sel = document.getElementById('dashboard-mode-select');
  if (sel) {
    sel.addEventListener('change', (e) => {
      const href = e.target.value;
      if (href) window.location.hash = href;
    });
  }
}
window._injectDashboardToggle = _injectDashboardToggle;

const Dashboard = (() => {

  const _charts = {};
  let _catalog = null;      // { widgets: [...], groups: {...} }
  let _catalogById = {};
  let _config  = null;      // { chips: [...], charts: [...], tables: [...] }
  let _editing = null;      // working copy while edit modal is open

  const PALETTE = [
    '#2980b9','#27ae60','#8e44ad','#e67e22','#e74c3c',
    '#16a085','#f39c12','#2c3e50','#1abc9c','#d35400','#7f8c8d','#c0392b',
  ];

  const STATUS_MAP = {
    'Active':        '#27ae60',
    'Active Client': '#27ae60',
    'Prospect':      '#2980b9',
    'Notified':      '#3498db',
    'In Progress':   '#f39c12',
    'Settled':       '#27ae60',
    'Rejected':      '#e74c3c',
    'Closed':        '#95a5a6',
    'Disputed':      '#e67e22',
    'Pending':       '#f39c12',
    'Cancelled':     '#e74c3c',
    'Lapsed':        '#d35400',
    'Expired':       '#7f8c8d',
    'Low':           '#27ae60',
    'Medium':        '#f39c12',
    'High':          '#e67e22',
    'Critical':      '#e74c3c',
    'Verified':      '#27ae60',
    'Not Started':   '#95a5a6',
  };

  function destroyAll() {
    Object.values(_charts).forEach(c => { try { c.destroy(); } catch(_) {} });
    Object.keys(_charts).forEach(k => delete _charts[k]);
  }

  function colorFor(label, idx) {
    return STATUS_MAP[label] || PALETTE[idx % PALETTE.length];
  }

  /* ─────── Chart builders ─────── */

  function makeBar(canvasId, data, title) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || !data || !data.length || typeof Chart === 'undefined') return;
    const labels = data.map(r => r.label);
    const counts = data.map(r => r.count);
    const colors = labels.map((l, i) => colorFor(l, i));
    if (_charts[canvasId]) _charts[canvasId].destroy();
    _charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: title, data: counts,
          backgroundColor: colors.map(c => c + 'bb'),
          borderColor: colors, borderWidth: 1, borderRadius: 4 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: '#f0f0f0' } },
          x: { ticks: { font: { size: 9 }, maxRotation: 35 }, grid: { display: false } },
        },
      },
    });
  }

  function makeDoughnut(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || !data || !data.length || typeof Chart === 'undefined') return;
    const labels = data.map(r => r.label);
    const counts = data.map(r => r.count);
    const colors = labels.map((l, i) => colorFor(l, i));
    if (_charts[canvasId]) _charts[canvasId].destroy();
    _charts[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: counts,
          backgroundColor: colors.map(c => c + 'bb'),
          borderColor: colors, borderWidth: 1 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 9 }, boxWidth: 10, padding: 6 } } },
        cutout: '58%',
      },
    });
  }

  function makeLine(canvasId, data, title) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || !data || !data.length || typeof Chart === 'undefined') return;
    const labels = data.map(r => r.label);
    const counts = data.map(r => r.count);
    if (_charts[canvasId]) _charts[canvasId].destroy();
    _charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: title, data: counts,
          borderColor: '#2980b9', backgroundColor: '#2980b922',
          borderWidth: 2, fill: true, tension: 0.3,
          pointRadius: 3, pointBackgroundColor: '#2980b9' }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: '#f0f0f0' } },
          x: { ticks: { font: { size: 9 }, maxRotation: 35 }, grid: { display: false } },
        },
      },
    });
  }

  /* ─────── Card / row builders ─────── */

  function statCard(value, label, desc, color) {
    return `
      <div class="stat-card" style="border-left-color:${color};">
        <div class="stat-card-number" style="color:${color};">${value}</div>
        <div class="stat-card-label">${Utils.esc(label)}</div>
        <div class="stat-card-desc">${Utils.esc(desc)}</div>
      </div>`;
  }

  function chartCard(canvasId, title, emptyMsg, hasData) {
    return `
      <div class="dashboard-chart-card">
        <div class="dashboard-chart-title">${Utils.esc(title)}</div>
        ${hasData
          ? `<div style="position:relative;height:160px;"><canvas id="${canvasId}"></canvas></div>`
          : `<p style="color:var(--text-light);font-size:.8rem;text-align:center;padding:2rem 0;">${Utils.esc(emptyMsg)}</p>`}
      </div>`;
  }

  function renderTableRows(widgetId, rows) {
    if (!rows || !rows.length) return null;
    const today = new Date(); today.setHours(0,0,0,0);
    const dueCell = (d) => {
      if (!d) return '—';
      const due = new Date(d);
      if (isNaN(due)) return Utils.esc(String(d));
      const overdue = due < today;
      const soon = !overdue && (due - today <= 3 * 86400000);
      const color = overdue ? '#e74c3c' : (soon ? '#e67e22' : 'inherit');
      const weight = overdue ? '600' : '400';
      return `<span style="color:${color};font-weight:${weight};">${Utils.formatDate(d)}${overdue ? ' (overdue)' : ''}</span>`;
    };

    switch (widgetId) {
      case 'tbl_upcoming_workflows':
      case 'tbl_overdue_workflows':
        return rows.map(w => `
          <tr>
            <td><a href="#/workflows/${w.id}">${Utils.esc(w.description || '—')}</a></td>
            <td>${dueCell(w.due_date)}</td>
            <td>${Utils.esc(w.broker_name || '—')}</td>
            <td><span class="badge badge-status badge-status--${(w.status || '').toLowerCase().replace(/\s+/g,'-')}">${Utils.esc(w.status || '—')}</span></td>
          </tr>`).join('');
      case 'tbl_recent_engagements':
        return rows.map(e => `
          <tr>
            <td><a href="#/engagements/${e.id}">${Utils.esc(e.engagement_name || '—')}</a></td>
            <td><span class="badge badge-stage">${Utils.esc(e.stage || '—')}</span></td>
            <td>${Utils.esc(e.broker_name || '—')}</td>
            <td>${e.updated_at ? Utils.formatDate(e.updated_at) : '—'}</td>
          </tr>`).join('');
      case 'tbl_upcoming_renewals':
        return rows.map(p => `
          <tr>
            <td><a href="#/policies/${p.id}">${Utils.esc(p.policy_name || '—')}</a></td>
            <td>${Utils.esc(p.insurer || '—')}</td>
            <td>${p.renewal_date ? Utils.formatDate(p.renewal_date) : '—'}</td>
            <td>${Utils.esc(p.client_name || '—')}</td>
          </tr>`).join('');
      case 'tbl_overdue_reviews':
        return rows.map(r => `
          <tr>
            <td><a href="#/reviews/${r.id}">${Utils.esc(r.review_number || '—')}</a></td>
            <td>${Utils.esc(r.review_type || '—')}</td>
            <td>${dueCell(r.review_date)}</td>
            <td>${Utils.esc(r.broker_name || '—')}</td>
          </tr>`).join('');
      case 'tbl_open_complaints':
        return rows.map(c => `
          <tr>
            <td><a href="#/complaints/${c.id}">${Utils.esc(c.complaint_number || '—')}</a></td>
            <td>${Utils.esc(c.complaint_category || '—')}</td>
            <td>${dueCell(c.response_due_date)}</td>
            <td><span class="badge">${Utils.esc(c.complaint_status || '—')}</span></td>
          </tr>`).join('');
      case 'tbl_complaint_alerts':
        return rows.map(c => {
          const lvl = c.alert_level || 'normal';
          const palette = {
            critical:       { bg: '#fdecea', fg: '#a71d2a', label: '🚩 Day 30+ Critical' },
            escalation:     { bg: '#fff3cd', fg: '#664d03', label: '⚠️ Day 21+ Escalation' },
            unacknowledged: { bg: '#fff8e1', fg: '#856404', label: '⚠️ Day 3+ No Ack' },
            normal:         { bg: '#e8f4fd', fg: '#0c5460', label: 'On track' },
          }[lvl];
          const days = c.days_open != null ? c.days_open : '—';
          return `
            <tr>
              <td><a href="#/complaints/${c.id}">${Utils.esc(c.complaint_number || '—')}</a></td>
              <td style="font-weight:600;color:${palette.fg};">${days}</td>
              <td><span style="display:inline-block;padding:.15rem .55rem;border-radius:999px;background:${palette.bg};color:${palette.fg};font-size:.72rem;font-weight:600;">${palette.label}</span></td>
              <td><span class="badge">${Utils.esc(c.complaint_status || '—')}</span></td>
            </tr>`;
        }).join('');
      case 'tbl_open_claims':
        return rows.map(c => `
          <tr>
            <td><a href="#/claims/${c.id}">${Utils.esc(c.claim_number || '—')}</a></td>
            <td>${Utils.esc(c.claim_type || '—')}</td>
            <td>${c.date_reported ? Utils.formatDate(c.date_reported) : '—'}</td>
            <td><span class="badge">${Utils.esc(c.claim_status || '—')}</span></td>
          </tr>`).join('');
      case 'tbl_critical_gap_sections':
        return rows.map(g => `
          <tr>
            <td><a href="#/policy-sections/${g.id}">${Utils.esc(g.section_name || '—')}</a></td>
            <td>${Utils.esc(g.policy_name || '—')}</td>
            <td><span class="badge" style="background:#e74c3c22;color:#e74c3c;">${Utils.esc(g.gap_severity || '—')}</span></td>
            <td>${Utils.esc(g.needs_analysis_status || '—')}</td>
          </tr>`).join('');
      case 'tbl_fica_expiring':
        return rows.map(c => `
          <tr>
            <td><a href="#/contacts/${c.id}">${Utils.esc((c.first_name || '') + ' ' + (c.last_name || ''))}</a></td>
            <td><span class="badge">${Utils.esc(c.fica_status || '—')}</span></td>
            <td>${Utils.esc(c.client_category || '—')}</td>
            <td>${c.last_review_date ? Utils.formatDate(c.last_review_date) : '—'}</td>
          </tr>`).join('');
      case 'tbl_recent_advice':
        return rows.map(a => `
          <tr>
            <td><a href="#/advice-records/${a.id}">${Utils.esc(a.advice_record_number || '—')}</a></td>
            <td>${Utils.esc(a.advice_type || '—')}</td>
            <td>${a.advice_date ? Utils.formatDate(a.advice_date) : '—'}</td>
            <td>${Utils.esc(a.client_decision || '—')}</td>
          </tr>`).join('');
      default:
        // Generic fallback — render values of first few keys
        const keys = Object.keys(rows[0] || {}).filter(k => k !== 'id').slice(0, 4);
        return rows.map(row => `<tr>${keys.map(k => `<td>${Utils.esc(String(row[k] ?? '—'))}</td>`).join('')}</tr>`).join('');
    }
  }

  function tablePanel(widget, rows) {
    const cols = widget.columns || ['Column 1','Column 2','Column 3','Column 4'];
    const body = renderTableRows(widget.id, rows);
    return `
      <div class="dashboard-panel card" data-widget="${widget.id}">
        <div class="card-header">
          <h3 class="card-title">${Utils.esc(widget.label)}</h3>
          ${widget.viewAllHref ? `<a href="${widget.viewAllHref}" class="view-all-link">View all →</a>` : ''}
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead><tr>${cols.map(c => `<th>${Utils.esc(c)}</th>`).join('')}</tr></thead>
            <tbody>${body || `<tr><td colspan="${cols.length}" class="table-empty">No data.</td></tr>`}</tbody>
          </table>
        </div>
      </div>`;
  }

  /* ─────── Broker fitness alert banner ─────── */

  function _alertBannerHtml(alerts) {
    if (!alerts || !alerts.length) return '';
    const hasDanger = alerts.some(a => a.severity === 'danger');
    const bg = hasDanger ? '#c0392b' : '#d68910';
    const title = hasDanger
      ? '⚠ Broker Fitness — action required'
      : '⚠ Broker Fitness — upcoming deadlines';
    return `
      <div id="bf-banner" style="background:${bg};color:#fff;padding:.85rem 1.1rem;border-radius:6px;margin-bottom:1rem;box-shadow:0 2px 6px rgba(0,0,0,.15);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
          <div style="flex:1;">
            <div style="font-weight:600;font-size:1rem;margin-bottom:.35rem;">${title}</div>
            <ul style="margin:.25rem 0 0;padding-left:1.1rem;">
              ${alerts.map(a => `<li style="margin:.15rem 0;">${Utils.esc(a.message)}</li>`).join('')}
            </ul>
          </div>
          <a href="#/broker-profiles" class="btn btn-sm" style="background:#fff;color:${bg};font-weight:600;align-self:center;white-space:nowrap;">View profile →</a>
        </div>
      </div>`;
  }

  async function _loadAlertBanner() {
    try {
      const r = await Api.brokerProfiles.myAlerts();
      return _alertBannerHtml(r && r.alerts);
    } catch (_) { return ''; }
  }

  function _barrierBannerHtml(rows) {
    if (!rows || !rows.length) return '';
    return `
      <div id="post-sale-barrier-banner" style="background:#c0392b;color:#fff;padding:.85rem 1.1rem;border-radius:6px;margin-bottom:1rem;box-shadow:0 2px 6px rgba(0,0,0,.15);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
          <div style="flex:1;">
            <div style="font-weight:600;font-size:1rem;margin-bottom:.35rem;">⚠ Post-sale barriers — supervisor review required (TCF Outcome 6)</div>
            <ul style="margin:.25rem 0 0;padding-left:1.1rem;">
              ${rows.slice(0, 5).map(r => `
                <li style="margin:.15rem 0;">
                  <a href="#/policies/${r.policy_id}" style="color:#fff;text-decoration:underline;">
                    ${Utils.esc(r.policy_number || ('Policy ' + r.policy_id))}
                  </a>
                  — ${Utils.esc(r.event_type)} on ${Utils.esc(r.event_date)}
                  ${r.outcome ? ` (outcome: ${Utils.esc(r.outcome)})` : ''}
                  ${r.days_to_action != null ? ` · ${r.days_to_action} day(s) to action` : ''}
                  ${r.broker_name ? ` · broker: ${Utils.esc(r.broker_name)}` : ''}
                </li>`).join('')}
              ${rows.length > 5 ? `<li style="margin:.15rem 0;font-style:italic;">…and ${rows.length - 5} more.</li>` : ''}
            </ul>
          </div>
        </div>
      </div>`;
  }

  async function _loadBarrierBanner() {
    try {
      const r = await Api.postSaleEvents.barriers();
      return _barrierBannerHtml(r && (r.data || r));
    } catch (_) { return ''; }
  }

  /* ─────── Main render ─────── */

  async function render() {
    destroyAll();
    setPageTitle('Dashboard');
    setBreadcrumb(['Dashboard']);
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    try {
      // Load catalog + config in parallel; cache catalog for the session
      const [catRes, cfgRes, bannerHtml, barrierHtml] = await Promise.all([
        _catalog ? Promise.resolve({ ..._catalog }) : Api.dashboard.catalog(),
        Api.dashboard.getConfig(),
        _loadAlertBanner(),
        _loadBarrierBanner(),
      ]);
      _catalog = catRes;
      _catalogById = Object.fromEntries((_catalog.widgets || []).map(w => [w.id, w]));
      _config = cfgRes.config || { chips: [], charts: [], tables: [] };

      // Resolve the list of widget IDs we need data for
      const allIds = [
        ...(_config.chips  || []).map(x => x.widgetId),
        ...(_config.charts || []).map(x => x.widgetId),
        ...(_config.tables || []).map(x => x.widgetId),
      ].filter(id => _catalogById[id]);

      const dataRes = allIds.length ? await Api.dashboard.data(allIds) : { data: {} };
      const data = dataRes.data || {};

      // Render header action
      const headerActions = document.getElementById('header-actions');
      if (headerActions) {
        headerActions.innerHTML =
          `<button class="btn btn-secondary" id="btn-edit-dashboard">⚙ Edit Dashboard</button>`;
        document.getElementById('btn-edit-dashboard').addEventListener('click', openEditModal);
      }

      // ── Chips ──
      const chipsHtml = (_config.chips || [])
        .filter(c => _catalogById[c.widgetId])
        .map(c => {
          const w = _catalogById[c.widgetId];
          const val = (data[w.id] && data[w.id].value != null) ? data[w.id].value : 0;
          return statCard(val, w.label, w.description || '', w.color || '#2980b9');
        }).join('');

      // ── Charts ──
      const chartsConfigured = (_config.charts || []).filter(c => _catalogById[c.widgetId]);
      const chartsHtml = chartsConfigured.map(c => {
        const w = _catalogById[c.widgetId];
        const val = (data[w.id] && data[w.id].value) || [];
        const hasData = Array.isArray(val) && val.length > 0;
        return chartCard(`dash-chart-${w.id}`, w.label, 'No data.', hasData);
      }).join('');

      // ── Tables ──
      const tablesHtml = (_config.tables || [])
        .filter(c => _catalogById[c.widgetId])
        .map(c => {
          const w = _catalogById[c.widgetId];
          const val = (data[w.id] && data[w.id].value) || [];
          return tablePanel(w, val);
        }).join('');

      const empty = !chipsHtml && !chartsHtml && !tablesHtml;

      el.innerHTML = `
        <div class="dashboard">
          ${barrierHtml || ''}
          ${bannerHtml || ''}
          ${empty ? `
            <div class="card" style="padding:2.5rem;text-align:center;">
              <p style="font-size:1rem;margin:0 0 1rem;">Your dashboard is empty.</p>
              <button class="btn btn-primary" onclick="Dashboard.openEditModal()">⚙ Customize Dashboard</button>
            </div>` : ''}
          ${chipsHtml  ? `<div class="stat-cards-grid">${chipsHtml}</div>` : ''}
          ${chartsHtml ? `<div class="dashboard-charts">${chartsHtml}</div>` : ''}
          ${tablesHtml ? `<div class="dashboard-panels">${tablesHtml}</div>` : ''}
        </div>
      `;
      _injectDashboardToggle('main');

      // Build charts after DOM insertion
      for (const c of chartsConfigured) {
        const w = _catalogById[c.widgetId];
        const canvas = `dash-chart-${w.id}`;
        const val = (data[w.id] && data[w.id].value) || [];
        if (!Array.isArray(val) || val.length === 0) continue;
        const mode = c.mode || w.defaultMode;
        if (mode === 'bar')         makeBar(canvas, val, w.label);
        else if (mode === 'doughnut') makeDoughnut(canvas, val);
        else if (mode === 'line')   makeLine(canvas, val, w.label);
      }

    } catch (err) {
      el.innerHTML = Utils.errorHtml('Failed to load dashboard.', err);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     EDIT DASHBOARD MODAL
     ═══════════════════════════════════════════════════════════════════════ */

  async function openEditModal() {
    // Ensure catalog + current config are loaded
    if (!_catalog) _catalog = await Api.dashboard.catalog();
    _catalogById = Object.fromEntries((_catalog.widgets || []).map(w => [w.id, w]));
    if (!_config) {
      const r = await Api.dashboard.getConfig();
      _config = r.config;
    }
    // Deep-clone config into an editable working copy
    _editing = JSON.parse(JSON.stringify(_config || { chips: [], charts: [], tables: [] }));
    _editing.chips  = _editing.chips  || [];
    _editing.charts = _editing.charts || [];
    _editing.tables = _editing.tables || [];

    const modal = document.getElementById('global-modal');
    const dialog = document.getElementById('global-modal-dialog');
    const title  = document.getElementById('global-modal-title');
    const body   = document.getElementById('global-modal-body');
    const footer = document.getElementById('global-modal-footer');
    if (dialog) dialog.style.maxWidth = '900px';
    title.textContent = 'Edit Dashboard';

    body.innerHTML = `
      <div class="dash-edit">
        <div class="dash-edit-tabs">
          <button type="button" class="tab-btn active" data-tab="chips">Chips (KPIs)</button>
          <button type="button" class="tab-btn" data-tab="charts">Charts</button>
          <button type="button" class="tab-btn" data-tab="tables">Tables</button>
        </div>
        <div class="dash-edit-panel" id="dash-edit-panel"></div>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" id="dash-edit-reset" title="Clear your layout and use the company default">Reset to default</button>
      <span style="flex:1;"></span>
      <button class="btn btn-secondary" id="dash-edit-cancel">Cancel</button>
      <button class="btn btn-primary" id="dash-edit-save">Save</button>
    `;
    footer.style.display = 'flex';
    footer.style.gap = '.5rem';
    footer.style.alignItems = 'center';

    modal.style.display = 'flex';

    // Wire tabs
    body.querySelectorAll('.dash-edit-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        body.querySelectorAll('.dash-edit-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderEditTab(btn.dataset.tab);
      });
    });
    renderEditTab('chips');

    // Footer buttons
    document.getElementById('dash-edit-cancel').onclick = closeEditModal;
    document.getElementById('global-modal-close').onclick = closeEditModal;
    document.getElementById('dash-edit-save').onclick = saveEditModal;
    document.getElementById('dash-edit-reset').onclick = resetEditModal;
  }

  function closeEditModal() {
    const modal = document.getElementById('global-modal');
    if (modal) modal.style.display = 'none';
    const dialog = document.getElementById('global-modal-dialog');
    if (dialog) dialog.style.maxWidth = '';
    _editing = null;
  }

  function renderEditTab(tab) {
    const panel = document.getElementById('dash-edit-panel');
    if (!panel) return;

    const sectionKey = tab;              // 'chips' | 'charts' | 'tables'
    const categoryFor = tab === 'chips' ? 'metric' : (tab === 'charts' ? 'chart' : 'table');
    const available = (_catalog.widgets || []).filter(w => w.category === categoryFor);
    const selected  = _editing[sectionKey] || [];
    const selectedIds = new Set(selected.map(s => s.widgetId));

    // Group available widgets for the picker
    const groups = {};
    for (const w of available) {
      (groups[w.group] = groups[w.group] || []).push(w);
    }

    panel.innerHTML = `
      <div class="dash-edit-grid">
        <!-- Left: current layout (selected, ordered) -->
        <div class="dash-edit-col">
          <div class="dash-edit-col-title">Your layout <span class="muted">(drag to reorder)</span></div>
          <div class="dash-edit-selected" id="dash-edit-selected">
            ${selected.length ? selected.map((s, i) => renderSelectedRow(s, i, sectionKey)).join('') :
              `<div class="dash-edit-empty">Nothing selected. Add widgets from the right.</div>`}
          </div>
        </div>

        <!-- Right: available widget picker -->
        <div class="dash-edit-col">
          <div class="dash-edit-col-title">Available widgets</div>
          <input type="text" class="form-control" id="dash-edit-search" placeholder="Filter…" style="margin-bottom:.6rem;">
          <div class="dash-edit-available" id="dash-edit-available">
            ${Object.keys(groups).sort().map(g => `
              <div class="dash-edit-group">
                <div class="dash-edit-group-title">${Utils.esc(g)}</div>
                ${groups[g].map(w => `
                  <label class="dash-edit-item ${selectedIds.has(w.id) ? 'is-selected' : ''}" data-widget="${w.id}">
                    <input type="checkbox" ${selectedIds.has(w.id) ? 'checked' : ''} data-add="${w.id}">
                    <span class="dash-edit-item-body">
                      <span class="dash-edit-item-label">${Utils.esc(w.label)}</span>
                      <span class="dash-edit-item-desc">${Utils.esc(w.description || '')}</span>
                    </span>
                  </label>
                `).join('')}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    // Wire checkboxes (add/remove)
    panel.querySelectorAll('input[type=checkbox][data-add]').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.add;
        const w = _catalogById[id];
        if (!w) return;
        const arr = _editing[sectionKey];
        const idx = arr.findIndex(x => x.widgetId === id);
        if (cb.checked && idx === -1) {
          arr.push({ widgetId: id, mode: w.defaultMode });
        } else if (!cb.checked && idx !== -1) {
          arr.splice(idx, 1);
        }
        renderEditTab(sectionKey);
      });
    });

    // Wire mode change dropdowns
    panel.querySelectorAll('select[data-mode]').forEach(sel => {
      sel.addEventListener('change', () => {
        const id = sel.dataset.mode;
        const arr = _editing[sectionKey];
        const entry = arr.find(x => x.widgetId === id);
        if (entry) entry.mode = sel.value;
      });
    });

    // Wire remove buttons
    panel.querySelectorAll('button[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.remove;
        _editing[sectionKey] = _editing[sectionKey].filter(x => x.widgetId !== id);
        renderEditTab(sectionKey);
      });
    });

    // Wire move up/down buttons
    panel.querySelectorAll('button[data-move]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id  = btn.dataset.widget;
        const dir = btn.dataset.move === 'up' ? -1 : 1;
        const arr = _editing[sectionKey];
        const idx = arr.findIndex(x => x.widgetId === id);
        const target = idx + dir;
        if (idx < 0 || target < 0 || target >= arr.length) return;
        const tmp = arr[idx]; arr[idx] = arr[target]; arr[target] = tmp;
        renderEditTab(sectionKey);
      });
    });

    // Drag-and-drop reordering
    enableDragReorder(sectionKey);

    // Filter/search
    const search = document.getElementById('dash-edit-search');
    if (search) {
      search.addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        panel.querySelectorAll('.dash-edit-item').forEach(item => {
          const txt = (item.textContent || '').toLowerCase();
          item.style.display = txt.includes(q) ? '' : 'none';
        });
        panel.querySelectorAll('.dash-edit-group').forEach(g => {
          const anyVisible = Array.from(g.querySelectorAll('.dash-edit-item'))
            .some(it => it.style.display !== 'none');
          g.style.display = anyVisible ? '' : 'none';
        });
      });
    }
  }

  function renderSelectedRow(entry, idx, sectionKey) {
    const w = _catalogById[entry.widgetId];
    if (!w) return '';
    const modes = w.displayModes || [];
    const hasModeChoice = modes.length > 1;
    const modeSelect = hasModeChoice ? `
      <select class="form-control form-control-sm" data-mode="${w.id}" style="width:auto;">
        ${modes.map(m => `<option value="${m}" ${entry.mode === m ? 'selected' : ''}>${m}</option>`).join('')}
      </select>` : `<span class="muted" style="font-size:.75rem;">${modes[0] || ''}</span>`;

    return `
      <div class="dash-edit-row" draggable="true" data-id="${w.id}">
        <span class="dash-edit-handle" title="Drag to reorder">⋮⋮</span>
        <span class="dash-edit-row-label">
          <strong>${Utils.esc(w.label)}</strong>
          <span class="muted" style="font-size:.72rem;">${Utils.esc(w.group)}</span>
        </span>
        ${modeSelect}
        <button class="btn btn-sm btn-secondary" type="button" data-move="up"   data-widget="${w.id}" ${idx === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn btn-sm btn-secondary" type="button" data-move="down" data-widget="${w.id}">↓</button>
        <button class="btn btn-sm btn-danger"    type="button" data-remove="${w.id}" title="Remove">✕</button>
      </div>`;
  }

  function enableDragReorder(sectionKey) {
    const container = document.getElementById('dash-edit-selected');
    if (!container) return;
    let dragId = null;

    container.querySelectorAll('.dash-edit-row').forEach(row => {
      row.addEventListener('dragstart', e => {
        dragId = row.dataset.id;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        dragId = null;
      });
      row.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      row.addEventListener('drop', e => {
        e.preventDefault();
        const overId = row.dataset.id;
        if (!dragId || dragId === overId) return;
        const arr = _editing[sectionKey];
        const from = arr.findIndex(x => x.widgetId === dragId);
        const to   = arr.findIndex(x => x.widgetId === overId);
        if (from < 0 || to < 0) return;
        const [moved] = arr.splice(from, 1);
        arr.splice(to, 0, moved);
        renderEditTab(sectionKey);
      });
    });
  }

  async function saveEditModal() {
    if (!_editing) return closeEditModal();
    try {
      const res = await Api.dashboard.saveConfig(_editing);
      _config = res.config;
      closeEditModal();
      showToast('Dashboard updated');
      render();
    } catch (err) {
      showToast('Failed to save: ' + (err.message || err), 'error');
    }
  }

  async function resetEditModal() {
    if (!confirmDialog('Reset your dashboard to the company default?')) return;
    try {
      const res = await Api.dashboard.resetConfig();
      _config = res.config;
      closeEditModal();
      showToast('Dashboard reset to default');
      render();
    } catch (err) {
      showToast('Failed to reset: ' + (err.message || err), 'error');
    }
  }

  return { render, openEditModal };
})();
