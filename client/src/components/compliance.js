/* =============================================================
   compliance.js — Compliance hub: POPIA, FICA, Broker Profile,
                     Products, Post-Sale Events, Commission Log,
                     TCF MI Dashboard, Data Breach Log.

   Exposes: window.Compliance (hub), window.PopiaTab, window.FicaTab,
            window.BrokerProfiles, window.Products, window.PostSaleEvents,
            window.CommissionLog, window.TcfDashboard
   ============================================================= */

(function () {
  'use strict';

  // ── Shared helpers ────────────────────────────────────────────
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function qs(obj) {
    const p = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') p.append(k, v);
    });
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  function setHeader(title, crumb) {
    const t = document.getElementById('header-title');
    if (t) t.textContent = title;
    if (typeof setBreadcrumb === 'function') setBreadcrumb(crumb);
    const h = document.getElementById('header-actions');
    if (h) h.innerHTML = '';
  }

  function renderInto(html) {
    const a = document.getElementById('content-area');
    if (a) a.innerHTML = html;
  }

  function toast(msg, type) {
    if (typeof showToast === 'function') return showToast(msg, type);
    console.log(`[${type || 'info'}] ${msg}`);
  }

  function badgeForPopia(status) {
    const color = status === 'Green' ? '#1a7a3a' : (status === 'Amber' ? '#b78105' : '#c0392b');
    return `<span style="display:inline-block;padding:.15rem .6rem;border-radius:999px;background:${color};color:#fff;font-size:.75rem;font-weight:600;">POPIA: ${esc(status)}</span>`;
  }

  function badgeForFica(status) {
    const color = status === 'Verified' ? '#1a7a3a' : (status === 'Expired' ? '#c0392b' : '#b78105');
    return `<span style="display:inline-block;padding:.15rem .6rem;border-radius:999px;background:${color};color:#fff;font-size:.75rem;font-weight:600;">FICA: ${esc(status)}</span>`;
  }

  // ═════════════════════════════════════════════════════════════
  // Compliance Hub landing
  // ═════════════════════════════════════════════════════════════
  const Compliance = {
    render() {
      setHeader('Compliance', ['Home', 'Compliance']);
      renderInto(`
        <div class="page-wrapper">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem;">
            ${tile('TCF MI Dashboard', 'Six-outcome TCF metrics, broker fitness, FSCA evidence pack export.', '/tcf-dashboard', '#1a5276')}
            ${tile('Broker Profiles', 'Fit & Proper: FSCA, RE1/RE5, CPD cycle, qualifications, good standing.', '/broker-profiles', '#0e6655')}
            ${tile('Product Library', 'Target-market definitions and suitability check for ROA.', '/products', '#7d6608')}
            ${tile('Post-Sale Events', 'Cancellation, switches, lapses, barrier flags (TCF Outcome 6).', '/post-sale-events', '#4a235a')}
            ${tile('Commission Log', 'Per-policy commission transparency (COFI remuneration).', '/commission-log', '#873600')}
            ${tile('Data Breach Log', 'POPIA s22 breach register and Information Regulator notifications.', '/data-breaches', '#922b21')}
          </div>

          <div class="card" style="margin-top:1.5rem;padding:1rem;">
            <h3 style="margin:0 0 .75rem;">How compliance works here</h3>
            <ul style="margin:0;padding-left:1.25rem;line-height:1.7;color:#444;">
              <li>The <strong>POPIA</strong> and <strong>FICA</strong> tabs live on each Contact record — open a contact to edit.</li>
              <li>Each <strong>Policy</strong> has a Commission entry and Post-Sale event log.</li>
              <li>The <strong>TCF Dashboard</strong> aggregates evidence from all modules for FSCA supervisory visits.</li>
              <li>Every change is written to the Audit Trail. Complaints cannot be deleted.</li>
            </ul>
          </div>
        </div>
      `);

      function tile(title, desc, route, color) {
        return `
          <a href="#${route}" class="compliance-tile" style="display:block;padding:1.25rem;border-left:4px solid ${color};background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.08);text-decoration:none;color:inherit;transition:transform .1s;">
            <div style="font-size:1.05rem;font-weight:600;color:${color};margin-bottom:.35rem;">${esc(title)}</div>
            <div style="color:#666;font-size:.9rem;">${esc(desc)}</div>
          </a>
        `;
      }
    }
  };

  // ═════════════════════════════════════════════════════════════
  // TCF MI Dashboard
  // ═════════════════════════════════════════════════════════════
  // ─── TCF widget catalog (used for chip rendering + edit modal) ──────
  const TCF_WIDGETS = [
    // Outcome 1
    { id: 'cmp_res_rate',   group: 'Outcome 1 — Culture',       label: 'Complaint resolution (30d)',  desc: 'Resolved within 30 days. Target ≥ 95%.',
      getValue: m => m.complaints.resolution_rate + '%',
      getColor: m => m.complaints.resolution_rate >= 95 ? '#27ae60' : m.complaints.resolution_rate >= 80 ? '#f39c12' : '#e74c3c' },
    { id: 'cmp_ack_rate',   group: 'Outcome 1 — Culture',       label: 'Acknowledged ≤ 3 days',       desc: 'FAIS GCC requirement.',
      getValue: m => m.complaints.acknowledgment_rate + '%',
      getColor: m => m.complaints.acknowledgment_rate >= 95 ? '#27ae60' : '#f39c12' },
    // Outcome 2
    { id: 'suit_match',     group: 'Outcome 2 — Suitability',   label: 'Suitability match rate',      desc: 'ROAs matching target market.',
      getValue: m => m.roa.suitability_match_rate + '%',
      getColor: () => '#16a085' },
    { id: 'suit_override',  group: 'Outcome 2 — Suitability',   label: 'Suitability override rate',   desc: 'ROAs requiring an override. Flag if > 10%.',
      getValue: m => (m.roa.suitability_override_rate ?? 0) + '%',
      getColor: m => (m.roa.suitability_override_rate ?? 0) > 10 ? '#e74c3c' : '#27ae60' },
    // Outcome 3
    { id: 'presale_rate',   group: 'Outcome 3 — Disclosure',    label: 'Pre-sale disclosure',         desc: 'Engagements with completed checklist.',
      getValue: m => (m.presale && m.presale.completion_rate != null
        ? `${m.presale.completion_rate}% (${m.presale.complete}/${m.presale.total})`
        : (m.presale && m.presale.total === 0 ? '— no engagements' : '—')),
      getColor: m => {
        const r = m.presale && m.presale.completion_rate;
        if (r == null) return '#7f8c8d';
        return r >= 95 ? '#27ae60' : r >= 70 ? '#f39c12' : '#e74c3c';
      } },
    // Outcome 4
    { id: 'roa_complete',   group: 'Outcome 4 — Advice',        label: 'ROA completion rate',          desc: 'Target 100%.',
      getValue: m => m.roa.completion_rate + '%',
      getColor: m => m.roa.completion_rate >= 90 ? '#27ae60' : '#f39c12' },
    { id: 'roa_coi',        group: 'Outcome 4 — Advice',        label: 'COI declaration rate',         desc: 'Yes/No captured on every ROA.',
      getValue: m => m.roa.coi_declaration_rate + '%',
      getColor: m => m.roa.coi_declaration_rate >= 100 ? '#27ae60' : '#f39c12' },
    { id: 'roa_coi_yes',    group: 'Outcome 4 — Advice',        label: 'COI declared "Yes"',           desc: 'Share of ROAs where a conflict was declared.',
      getValue: m => (m.roa.coi_declared_yes_rate ?? 0) + '%',
      getColor: () => '#7f8c8d' },
    // Outcome 5
    { id: 'claims_settle',  group: 'Outcome 5 — Performance',   label: 'Avg settlement days',          desc: 'Target < 30 days.',
      getValue: m => m.claims.avg_settlement_days != null ? m.claims.avg_settlement_days : '—',
      getColor: m => m.claims.avg_settlement_days && m.claims.avg_settlement_days > 45 ? '#e74c3c' : '#27ae60' },
    { id: 'claims_repud',   group: 'Outcome 5 — Performance',   label: 'Repudiation rate (12m)',       desc: 'Across all claims.',
      getValue: m => (m.claims.overall_repudiation_rate ?? 0) + '%',
      getColor: m => (m.claims.overall_repudiation_rate ?? 0) > 20 ? '#e74c3c' : '#27ae60' },
    // Outcome 6
    { id: 'post_sale_bar',  group: 'Outcome 6 — Post-Sale',     label: 'Barrier incidents (90d)',      desc: 'Target 0 — >5 days to action.',
      getValue: m => `${m.post_sale.barriers} / ${m.post_sale.total}`,
      getColor: m => m.post_sale.barriers > 0 ? '#e74c3c' : '#27ae60' },
    // Fitness
    { id: 'cpd_ontrack',    group: 'Broker Fitness',            label: 'Brokers on CPD track',         desc: '≥14 points in current cycle.',
      getValue: m => `${m.cpd.on_track} / ${m.cpd.total_brokers}`,
      getColor: () => '#2980b9' },
    { id: 'cpd_critical',   group: 'Broker Fitness',            label: 'Brokers critical CPD',         desc: '<8 points — needs urgent action.',
      getValue: m => m.cpd.critical,
      getColor: m => m.cpd.critical > 0 ? '#e74c3c' : '#27ae60' },
    // POPIA / FICA
    { id: 'popia_rate',     group: 'POPIA & FICA',              label: 'POPIA compliance',             desc: 'Active clients with basis recorded.',
      getValue: m => m.popia.compliance_rate + '%',
      getColor: m => m.popia.compliance_rate >= 95 ? '#27ae60' : '#f39c12' },
    { id: 'popia_dsar',     group: 'POPIA & FICA',              label: 'Pending data requests',        desc: 'Must be completed within 30 days.',
      getValue: m => m.popia.pending_dsr,
      getColor: m => m.popia.pending_dsr > 0 ? '#f39c12' : '#27ae60' },
    { id: 'fica_rate',      group: 'POPIA & FICA',              label: 'FICA verified',                desc: 'Active clients with current verification.',
      getValue: m => m.fica.compliance_rate + '%',
      getColor: m => m.fica.compliance_rate >= 95 ? '#27ae60' : '#f39c12' },
    { id: 'overdue_rev',    group: 'Reviews',                   label: 'Overdue reviews',              desc: 'No engagement in >12 months.',
      getValue: m => m.overdue_reviews,
      getColor: m => m.overdue_reviews > 0 ? '#f39c12' : '#27ae60' },
    // Outcome 1 — current-month volume (with prior-3-month comparison)
    { id: 'cmp_volume_mtd', group: 'Outcome 1 — Culture',       label: 'Complaints this month',        desc: 'Compared to prior 3-month average.',
      getValue: m => {
        const tr = (m.complaints && m.complaints.monthly_trend) || [];
        if (!tr.length) return 0;
        const ym = new Date().toISOString().slice(0, 7);
        const cur = (tr.find(r => r.month === ym) || {}).count || 0;
        return cur;
      },
      getColor: m => {
        const tr = (m.complaints && m.complaints.monthly_trend) || [];
        if (tr.length < 2) return '#7f8c8d';
        const ym = new Date().toISOString().slice(0, 7);
        const cur = (tr.find(r => r.month === ym) || {}).count || 0;
        const prior = tr.filter(r => r.month !== ym).map(r => r.count || 0);
        const avg = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : 0;
        return cur > avg * 1.2 ? '#e74c3c' : '#27ae60';
      } },
    // Senior management — commission compliance + flagged count
    { id: 'comm_compliance',group: 'Senior Management',         label: 'Commission compliance',        desc: 'Entries marked Compliant by remuneration rules.',
      getValue: m => (m.commission && m.commission.compliance_rate != null ? m.commission.compliance_rate + '%' : '—'),
      getColor: m => m.commission && m.commission.flagged > 0 ? '#e74c3c' : '#27ae60' },
    { id: 'comm_flagged',   group: 'Senior Management',         label: 'Commission entries flagged',   desc: 'Marked Non-compliant.',
      getValue: m => (m.commission ? m.commission.flagged : 0),
      getColor: m => m.commission && m.commission.flagged > 0 ? '#e74c3c' : '#27ae60' },
  ];

  const TCF_DEFAULT_VISIBLE = [
    'cmp_res_rate', 'cmp_volume_mtd', 'cmp_ack_rate', 'suit_match', 'suit_override', 'presale_rate',
    'roa_complete', 'roa_coi', 'claims_settle', 'claims_repud', 'post_sale_bar',
    'cpd_ontrack', 'cpd_critical', 'popia_rate', 'fica_rate', 'overdue_rev',
  ];

  const TCF_PREFS_KEY = 'tcf_dashboard_widgets_v1';

  function _loadTcfPrefs() {
    try {
      const raw = localStorage.getItem(TCF_PREFS_KEY);
      if (!raw) return TCF_DEFAULT_VISIBLE.slice();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : TCF_DEFAULT_VISIBLE.slice();
    } catch (_) { return TCF_DEFAULT_VISIBLE.slice(); }
  }
  function _saveTcfPrefs(ids) {
    try { localStorage.setItem(TCF_PREFS_KEY, JSON.stringify(ids)); } catch (_) {}
  }

  const TcfDashboard = {
    async render() {
      setPageTitle('Dashboard');
      setBreadcrumb(['Dashboard', 'TCF']);
      const el = document.getElementById('content-area');
      el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

      const headerActions = document.getElementById('header-actions');
      if (headerActions) {
        headerActions.innerHTML = `
          <button class="btn btn-secondary" id="tcf-edit-btn">⚙ Edit Dashboard</button>
          <a href="${Api.tcf.evidencePackUrl()}" target="_blank" class="btn btn-primary">📄 Generate FSCA Evidence Pack</a>`;
      }

      try {
        const m = await Api.tcf.metrics();
        this._renderChips(el, m);

        document.getElementById('tcf-edit-btn')?.addEventListener('click', () => this.openEditModal(m));
      } catch (err) {
        el.innerHTML = Utils.errorHtml ? Utils.errorHtml('Failed to load TCF dashboard.', err)
          : `<div class="alert alert-danger">${esc(err.message)}</div>`;
      }
    },

    _renderChips(el, m) {
      const visible = _loadTcfPrefs();
      const visibleSet = new Set(visible);
      const selectedWidgets = visible
        .map(id => TCF_WIDGETS.find(w => w.id === id))
        .filter(Boolean);

      const chipsHtml = selectedWidgets.map(w => {
        const val = w.getValue(m);
        const color = w.getColor(m);
        return `
          <div class="stat-card" style="border-left-color:${color};">
            <div class="stat-card-number" style="color:${color};">${esc(String(val))}</div>
            <div class="stat-card-label">${esc(w.label)}</div>
            <div class="stat-card-desc">${esc(w.desc || '')}</div>
          </div>`;
      }).join('');

      // Repudiation table and CPD detail panel (always visible as auxiliary panels)
      let repudiationHtml = '';
      if (m.claims.repudiation_by_insurer && m.claims.repudiation_by_insurer.length) {
        repudiationHtml = `
          <div class="dashboard-panel card">
            <div class="card-header"><h3 class="card-title">Repudiation rate by insurer (12 months)</h3></div>
            <div class="table-responsive">
              <table class="table">
                <thead><tr><th>Insurer</th><th style="text-align:right;">Total claims</th><th style="text-align:right;">Repudiated</th><th style="text-align:right;">Rate</th></tr></thead>
                <tbody>
                  ${m.claims.repudiation_by_insurer.map(r => {
                    const rate = r.total ? Math.round(r.repudiated / r.total * 100) : 0;
                    const col = rate > 20 ? '#e74c3c' : '#222';
                    return `<tr>
                      <td>${esc(r.insurer || '—')}</td>
                      <td style="text-align:right;">${r.total}</td>
                      <td style="text-align:right;">${r.repudiated}</td>
                      <td style="text-align:right;color:${col};font-weight:600;">${rate}%</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>`;
      }

      const cpdPanel = `
        <div class="dashboard-panel card">
          <div class="card-header"><h3 class="card-title">Broker CPD Status — ${esc(m.cpd.cycle)}</h3></div>
          <div style="padding:1rem;display:flex;gap:1.5rem;flex-wrap:wrap;font-size:.9rem;">
            <span style="color:#27ae60;">✓ On track (≥14 pts): <strong>${m.cpd.on_track}</strong></span>
            <span style="color:#f39c12;">⚠ At risk (8–13 pts): <strong>${m.cpd.at_risk}</strong></span>
            <span style="color:#e74c3c;">✗ Critical (&lt;8 pts): <strong>${m.cpd.critical}</strong></span>
            <span style="color:#7f8c8d;">Total brokers: <strong>${m.cpd.total_brokers}</strong></span>
          </div>
        </div>`;

      const empty = !chipsHtml;
      el.innerHTML = `
        <div class="dashboard">
          <div style="margin-bottom:1rem;font-size:.85rem;color:var(--text-light,#666);">
            Scope: ${m.scope === 'broker' ? 'Your records only' : 'Entire brokerage'}
            · Generated ${new Date(m.generated_at).toLocaleString('en-ZA')}
          </div>
          ${empty ? `
            <div class="card" style="padding:2.5rem;text-align:center;">
              <p style="font-size:1rem;margin:0 0 1rem;">No TCF widgets selected.</p>
              <button class="btn btn-primary" id="tcf-empty-edit">⚙ Customize TCF Dashboard</button>
            </div>` : `
            <div class="stat-cards-grid">${chipsHtml}</div>
            <div class="dashboard-panels">${cpdPanel}${repudiationHtml}</div>
          `}
        </div>
      `;
      if (typeof window._injectDashboardToggle === 'function') {
        window._injectDashboardToggle('tcf');
      }

      document.getElementById('tcf-empty-edit')?.addEventListener('click', () => this.openEditModal(m));
    },

    openEditModal(m) {
      const modal   = document.getElementById('global-modal');
      const dialog  = document.getElementById('global-modal-dialog');
      const title   = document.getElementById('global-modal-title');
      const body    = document.getElementById('global-modal-body');
      const footer  = document.getElementById('global-modal-footer');
      if (!modal) return;
      if (dialog) dialog.style.maxWidth = '820px';
      title.textContent = 'Edit TCF Dashboard';

      let working = _loadTcfPrefs();

      const groups = {};
      for (const w of TCF_WIDGETS) (groups[w.group] = groups[w.group] || []).push(w);

      function render() {
        const workingSet = new Set(working);
        body.innerHTML = `
          <div class="dash-edit">
            <div class="dash-edit-grid">
              <div class="dash-edit-col">
                <div class="dash-edit-col-title">Your layout <span class="muted">(drag to reorder)</span></div>
                <div class="dash-edit-selected" id="tcf-selected">
                  ${working.length ? working.map((id, i) => {
                    const w = TCF_WIDGETS.find(x => x.id === id);
                    if (!w) return '';
                    return `
                      <div class="dash-edit-row" draggable="true" data-id="${esc(w.id)}">
                        <span class="dash-edit-handle" title="Drag to reorder">⋮⋮</span>
                        <span class="dash-edit-row-label">
                          <strong>${esc(w.label)}</strong>
                          <span class="muted" style="font-size:.72rem;">${esc(w.group)}</span>
                        </span>
                        <button class="btn btn-sm btn-secondary" type="button" data-move="up"   data-id="${esc(w.id)}" ${i === 0 ? 'disabled' : ''}>↑</button>
                        <button class="btn btn-sm btn-secondary" type="button" data-move="down" data-id="${esc(w.id)}">↓</button>
                        <button class="btn btn-sm btn-danger"    type="button" data-remove="${esc(w.id)}">✕</button>
                      </div>`;
                  }).join('') : '<div class="dash-edit-empty">Nothing selected. Add widgets from the right.</div>'}
                </div>
              </div>
              <div class="dash-edit-col">
                <div class="dash-edit-col-title">Available widgets</div>
                <div class="dash-edit-available">
                  ${Object.keys(groups).map(g => `
                    <div class="dash-edit-group">
                      <div class="dash-edit-group-title">${esc(g)}</div>
                      ${groups[g].map(w => `
                        <label class="dash-edit-item ${workingSet.has(w.id) ? 'is-selected' : ''}">
                          <input type="checkbox" ${workingSet.has(w.id) ? 'checked' : ''} data-add="${esc(w.id)}">
                          <span class="dash-edit-item-body">
                            <span class="dash-edit-item-label">${esc(w.label)}</span>
                            <span class="dash-edit-item-desc">${esc(w.desc || '')}</span>
                          </span>
                        </label>`).join('')}
                    </div>`).join('')}
                </div>
              </div>
            </div>
          </div>`;

        body.querySelectorAll('input[type=checkbox][data-add]').forEach(cb => {
          cb.addEventListener('change', () => {
            const id = cb.dataset.add;
            const idx = working.indexOf(id);
            if (cb.checked && idx === -1) working.push(id);
            else if (!cb.checked && idx !== -1) working.splice(idx, 1);
            render();
          });
        });
        body.querySelectorAll('button[data-remove]').forEach(btn => {
          btn.addEventListener('click', () => {
            working = working.filter(x => x !== btn.dataset.remove);
            render();
          });
        });
        body.querySelectorAll('button[data-move]').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const dir = btn.dataset.move === 'up' ? -1 : 1;
            const idx = working.indexOf(id);
            const target = idx + dir;
            if (idx < 0 || target < 0 || target >= working.length) return;
            const [moved] = working.splice(idx, 1);
            working.splice(target, 0, moved);
            render();
          });
        });

        // drag & drop
        let dragId = null;
        body.querySelectorAll('.dash-edit-row').forEach(row => {
          row.addEventListener('dragstart', e => {
            dragId = row.dataset.id; row.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
          });
          row.addEventListener('dragend', () => { row.classList.remove('dragging'); dragId = null; });
          row.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
          row.addEventListener('drop', e => {
            e.preventDefault();
            const overId = row.dataset.id;
            if (!dragId || dragId === overId) return;
            const from = working.indexOf(dragId);
            const to   = working.indexOf(overId);
            if (from < 0 || to < 0) return;
            const [moved] = working.splice(from, 1);
            working.splice(to, 0, moved);
            render();
          });
        });
      }

      footer.innerHTML = `
        <button class="btn btn-secondary" id="tcf-reset">Reset to default</button>
        <span style="flex:1;"></span>
        <button class="btn btn-secondary" id="tcf-cancel">Cancel</button>
        <button class="btn btn-primary" id="tcf-save">Save</button>`;
      footer.style.display = 'flex';
      footer.style.gap = '.5rem';
      footer.style.alignItems = 'center';

      modal.style.display = 'flex';

      const close = () => {
        modal.style.display = 'none';
        if (dialog) dialog.style.maxWidth = '';
      };

      document.getElementById('tcf-cancel').onclick = close;
      document.getElementById('global-modal-close').onclick = close;
      document.getElementById('tcf-reset').onclick = () => {
        working = TCF_DEFAULT_VISIBLE.slice();
        render();
      };
      document.getElementById('tcf-save').onclick = () => {
        _saveTcfPrefs(working);
        close();
        toast('TCF dashboard updated', 'success');
        this.render();
      };

      render();
    }
  };

  // ═════════════════════════════════════════════════════════════
  // POPIA Tab (opened from Contact page)
  // ═════════════════════════════════════════════════════════════
  const PopiaTab = {
    async renderForContact(contactId) {
      setHeader('POPIA Compliance', ['Home', 'Contacts', 'POPIA']);
      renderInto(`<div class="page-wrapper"><div class="loading-spinner"></div></div>`);

      try {
        const [data, options, users] = await Promise.all([
          Api.popia.getContact(contactId),
          Api.popia.options(),
          Api.admin.users().catch(() => []),
        ]);
        renderInto(this._template(contactId, data, options, users));
        this._bind(contactId, data, options);
      } catch (err) {
        renderInto(`<div class="alert alert-danger">${esc(err.message)}</div>`);
      }
    },

    _template(contactId, d, opts, users) {
      const userList = Array.isArray(users) ? users : (users?.data || []);
      const userOpts = [{ id: '', full_name: '— None —' }, ...userList].map(u =>
        `<option value="${esc(u.id)}" ${String(u.id) === String(d.information_officer_id) ? 'selected' : ''}>${esc(u.full_name || u.username)}</option>`
      ).join('');

      const dd = (name, values, selected) => `
        <select name="${name}" class="form-control">
          <option value="">— Select —</option>
          ${values.map(v => `<option value="${esc(v)}" ${selected === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
        </select>`;

      const parseArr = (v) => { try { return JSON.parse(v) || []; } catch (_) { return []; } };
      const scope = parseArr(d.consent_scope);
      const categories = parseArr(d.data_categories_held);

      const multi = (name, values, selected) => values.map(v => `
        <label style="display:inline-flex;align-items:center;margin-right:.75rem;font-size:.9rem;">
          <input type="checkbox" name="${name}" value="${esc(v)}" ${selected.includes(v) ? 'checked' : ''} style="margin-right:.35rem;"> ${esc(v)}
        </label>`).join('');

      return `
        <div class="page-wrapper" style="max-width:900px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <div>
              <a href="#/contacts/${contactId}" class="btn-back">← Back to Contact</a>
            </div>
            ${badgeForPopia(d.status_badge || 'Red')}
          </div>

          <form id="popia-form" class="card" style="padding:1.25rem;">
            <h3 style="margin:0 0 1rem;">Data Processing Basis (POPIA ss 11–12)</h3>
            <div class="form-group">
              <label class="form-label required">Processing basis</label>
              ${dd('data_processing_basis', opts.processing_basis, d.data_processing_basis)}
            </div>
            <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
              <div class="form-group">
                <label class="form-label">Consent date</label>
                <input type="date" class="form-control" name="popia_consent_date" value="${esc(d.popia_consent_date || '')}">
              </div>
              <div class="form-group">
                <label class="form-label">Consent method</label>
                ${dd('consent_method', opts.consent_method, d.consent_method)}
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Consent scope (POPIA s18)</label>
              <div>${multi('consent_scope', opts.consent_scope, scope)}</div>
            </div>
            <div class="form-group">
              <label class="form-label">
                <input type="checkbox" name="direct_marketing_consent" ${d.direct_marketing_consent ? 'checked' : ''}>
                Direct marketing consent (separate; cannot be bundled)
              </label>
            </div>

            <h3 style="margin:1rem 0;">Data Inventory</h3>
            <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
              <div class="form-group">
                <label class="form-label required">Data source</label>
                ${dd('data_source', opts.data_source, d.data_source)}
              </div>
              <div class="form-group">
                <label class="form-label">Third-party sharing</label>
                <label style="display:flex;align-items:center;">
                  <input type="checkbox" name="third_party_sharing" ${d.third_party_sharing ? 'checked' : ''} style="margin-right:.5rem;">
                  Data shared with third parties (insurers, surveyors)
                </label>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label required">Data categories held</label>
              <div>${multi('data_categories_held', opts.data_categories, categories)}</div>
            </div>
            <div class="form-group">
              <label class="form-label">Third-party sharing notes</label>
              <textarea class="form-control" name="third_party_sharing_notes" rows="2">${esc(d.third_party_sharing_notes || '')}</textarea>
            </div>

            <h3 style="margin:1rem 0;">Retention & Governance</h3>
            <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;">
              <div class="form-group">
                <label class="form-label">Retention period (years)</label>
                <input type="number" class="form-control" name="retention_period_years" value="${esc(d.retention_period_years || 5)}" min="1" max="50">
              </div>
              <div class="form-group">
                <label class="form-label">Last activity date</label>
                <input type="date" class="form-control" name="last_activity_date" value="${esc(d.last_activity_date || '')}">
              </div>
              <div class="form-group">
                <label class="form-label">Retention expires</label>
                <input type="text" class="form-control" value="${esc(d.retention_expiry_date || '— auto-calculated —')}" disabled>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label required">Information Officer</label>
              <select name="information_officer_id" class="form-control">${userOpts}</select>
            </div>
            <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
              <div class="form-group">
                <label class="form-label">
                  <input type="checkbox" name="privacy_notice_provided" ${d.privacy_notice_provided ? 'checked' : ''}>
                  Privacy notice provided to client
                </label>
              </div>
              <div class="form-group">
                <label class="form-label">Notice date</label>
                <input type="date" class="form-control" name="privacy_notice_date" value="${esc(d.privacy_notice_date || '')}">
              </div>
            </div>

            <div style="display:flex;gap:.5rem;margin-top:1rem;">
              <button type="submit" class="btn btn-primary">Save POPIA Record</button>
            </div>
          </form>

          <div class="card" style="margin-top:1.25rem;padding:1.25rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;">
              <h3 style="margin:0;">Data Subject Rights (POPIA s5)</h3>
              <button id="new-dsr" class="btn btn-secondary">+ Log new request</button>
            </div>
            <table style="width:100%;font-size:.9rem;">
              <thead>
                <tr><th style="text-align:left;">Type</th><th>Requested</th><th>Target</th><th>Status</th><th>Outcome</th><th></th></tr>
              </thead>
              <tbody id="dsr-list">
                ${(d.requests || []).map(r => `
                  <tr>
                    <td>${esc(r.request_type)}</td>
                    <td>${esc(r.request_date)}</td>
                    <td>${esc(r.target_completion_date || '—')}</td>
                    <td>${esc(r.status)}</td>
                    <td>${esc(r.outcome || '—')}</td>
                    <td><button class="btn btn-link" data-dsr="${r.id}">Edit</button></td>
                  </tr>
                `).join('') || '<tr><td colspan="6" style="color:#888;padding:.75rem 0;">No requests logged.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      `;
    },

    _bind(contactId, data, options) {
      const form = document.getElementById('popia-form');
      if (!form) return;

      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const payload = {};
        for (const [k, v] of fd.entries()) {
          if (k === 'consent_scope' || k === 'data_categories_held') {
            if (!payload[k]) payload[k] = [];
            payload[k].push(v);
          } else {
            payload[k] = v;
          }
        }
        // Checkboxes that weren't submitted
        ['direct_marketing_consent', 'third_party_sharing', 'privacy_notice_provided'].forEach(k => {
          if (!(k in payload)) payload[k] = 0;
          else payload[k] = 1;
        });

        try {
          const res = await Api.popia.updateContact(contactId, payload);
          toast('POPIA record saved', 'success');
          // Re-render to refresh badge
          setTimeout(() => this.renderForContact(contactId), 300);
        } catch (err) {
          toast(err.message, 'error');
        }
      });

      document.getElementById('new-dsr').addEventListener('click', () => {
        PopiaTab._openDsrModal(contactId);
      });

      document.querySelectorAll('[data-dsr]').forEach(btn => {
        btn.addEventListener('click', () => {
          PopiaTab._openDsrUpdateModal(contactId, btn.dataset.dsr);
        });
      });
    },

    _openDsrModal(contactId) {
      const today = new Date().toISOString().slice(0, 10);
      const types = ['Access', 'Correction', 'Erasure', 'Object', 'Withdraw Consent'];
      const container = document.createElement('div');
      container.id = 'dsr-modal-container';
      container.innerHTML = `
        <div class="modal-overlay" id="dsr-modal"
             style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;">
          <div class="modal" style="background:var(--card-bg);color:var(--text);border:1px solid var(--border);border-radius:8px;width:600px;max-width:92vw;max-height:90vh;overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,0.2);">
            <div class="modal-header" style="padding:1rem 1.25rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;">Log new data subject request</h3>
              <button type="button" id="dsr-modal-close"
                      class="modal-close">×</button>
            </div>
            <div class="modal-body" style="padding:1.25rem;">
              <div id="dsr-modal-error" class="alert alert-danger" style="display:none;margin-bottom:.75rem;"></div>
              <div class="form-grid form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group">
                  <label class="form-label required">Request type</label>
                  <select id="dsr-type" class="form-control" required>
                    <option value="">— Select —</option>
                    ${types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label required">Request date</label>
                  <input type="date" id="dsr-date" class="form-control" value="${today}" required>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Describe the request</label>
                <textarea id="dsr-details" class="form-control" rows="3" placeholder="Optional — context, scope, deadline..."></textarea>
              </div>

              <!-- Right-specific blocks (toggled by request type) -->
              <div id="dsr-block-access" style="display:none;border-top:1px dashed var(--border);padding-top:.75rem;margin-top:.25rem;">
                <strong>Right to Access (DSAR)</strong>
                <p style="font-size:.8rem;color:var(--text-light);margin:.25rem 0;">System will generate a data export within 30 days. Record delivery once sent.</p>
                <div class="form-grid form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                  <div class="form-group">
                    <label class="form-label">Export format</label>
                    <select id="dsr-export-format" class="form-control">
                      <option value="">—</option>
                      <option value="PDF">PDF</option>
                      <option value="CSV">CSV</option>
                      <option value="ZIP">ZIP (full archive)</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Delivery date (when sent)</label>
                    <input type="date" id="dsr-delivery-date" class="form-control">
                  </div>
                </div>
              </div>

              <div id="dsr-block-correction" style="display:none;border-top:1px dashed var(--border);padding-top:.75rem;margin-top:.25rem;">
                <strong>Right to Correction</strong>
                <p style="font-size:.8rem;color:var(--text-light);margin:.25rem 0;">Record what was corrected and notify the client.</p>
                <div class="form-group">
                  <label class="form-label">Fields to be corrected (comma-separated)</label>
                  <input type="text" id="dsr-corrected-fields" class="form-control" placeholder="e.g. email, mobile, sa_id_number">
                </div>
                <div class="form-group">
                  <label class="form-label">Client notification date</label>
                  <input type="date" id="dsr-client-notified" class="form-control">
                </div>
              </div>

              <div id="dsr-block-erasure" style="display:none;border-top:1px dashed var(--border);padding-top:.75rem;margin-top:.25rem;">
                <strong>Right to Erasure</strong>
                <p style="font-size:.8rem;color:var(--text-light);margin:.25rem 0;">Assess legal basis for retention. If no override, anonymise or delete.</p>
                <div class="form-group">
                  <label class="form-label">Legal basis assessment</label>
                  <textarea id="dsr-legal-basis" class="form-control" rows="2" placeholder="Describe whether any legal/regulatory basis requires retention (FAIS, FICA, tax, etc.)"></textarea>
                </div>
                <div class="form-group">
                  <label class="form-label">Erasure action</label>
                  <select id="dsr-erasure-action" class="form-control">
                    <option value="">— Select once assessed —</option>
                    <option value="Anonymised">Anonymise</option>
                    <option value="Deleted">Delete</option>
                    <option value="Retained — legal basis">Retain (legal basis)</option>
                    <option value="Pending">Pending</option>
                  </select>
                  <small style="color:#a71d2a;font-size:.78rem;">Anonymise on resolution will replace name + contact details on this contact record.</small>
                </div>
              </div>

              <div id="dsr-block-object" style="display:none;border-top:1px dashed var(--border);padding-top:.75rem;margin-top:.25rem;">
                <strong>Right to Object</strong>
                <p style="font-size:.8rem;color:var(--text-light);margin:.25rem 0;">Logging will <strong>suspend processing</strong> on this objection until resolved. Document the resolution in outcome notes.</p>
              </div>

              <div id="dsr-block-withdraw" style="display:none;border-top:1px dashed var(--border);padding-top:.75rem;margin-top:.25rem;">
                <strong>Right to Withdraw Consent</strong>
                <p style="font-size:.8rem;color:var(--text-light);margin:.25rem 0;">Saving will <strong>immediately clear</strong> the contact's marketing consent flag.</p>
                <div class="form-group">
                  <label class="form-label">Withdrawal date</label>
                  <input type="date" id="dsr-consent-withdrawn" class="form-control" value="${today}">
                </div>
              </div>

              <div class="alert alert-info" style="margin:.75rem 0 0;font-size:.82rem;">
                POPIA s5: Data subject requests must be completed within 30 calendar days.
              </div>
            </div>
            <div class="modal-footer" style="padding:1rem 1.25rem;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:.5rem;">
              <button type="button" class="btn btn-secondary" id="dsr-modal-cancel">Cancel</button>
              <button type="button" class="btn btn-primary" id="dsr-modal-save">Log request</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(container);
      container._breachRecipients = { all_contacts: false, all_accounts: false, all_users: false, selected: [] };
      DataBreaches._renderRecipientPicker(container);

      const close = () => container.remove();
      container.querySelector('#dsr-modal').addEventListener('click', (e) => {
        /* click-outside-to-close disabled */ void e;
      });
      container.querySelector('#dsr-modal-close').addEventListener('click', close);
      container.querySelector('#dsr-modal-cancel').addEventListener('click', close);

      const typeEl = container.querySelector('#dsr-type');
      const blocks = {
        'Access':            container.querySelector('#dsr-block-access'),
        'Correction':        container.querySelector('#dsr-block-correction'),
        'Erasure':           container.querySelector('#dsr-block-erasure'),
        'Object':            container.querySelector('#dsr-block-object'),
        'Withdraw Consent':  container.querySelector('#dsr-block-withdraw'),
      };
      typeEl.addEventListener('change', () => {
        Object.entries(blocks).forEach(([k, el]) => { el.style.display = k === typeEl.value ? 'block' : 'none'; });
      });

      container.querySelector('#dsr-modal-save').addEventListener('click', async () => {
        const type    = typeEl.value;
        const date    = container.querySelector('#dsr-date').value;
        const details = container.querySelector('#dsr-details').value.trim();
        const errEl   = container.querySelector('#dsr-modal-error');
        if (!type || !date) {
          errEl.textContent = 'Request type and date are required.';
          errEl.style.display = 'block';
          return;
        }

        const payload = {
          request_type: type,
          request_date: date,
          request_details: details,
          status: 'Open',
        };
        if (type === 'Access') {
          payload.export_format = container.querySelector('#dsr-export-format').value || null;
          payload.delivery_date = container.querySelector('#dsr-delivery-date').value || null;
        } else if (type === 'Correction') {
          const raw = container.querySelector('#dsr-corrected-fields').value.trim();
          payload.corrected_fields = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : null;
          payload.client_notified_date = container.querySelector('#dsr-client-notified').value || null;
        } else if (type === 'Erasure') {
          payload.legal_basis_assessment = container.querySelector('#dsr-legal-basis').value.trim() || null;
          payload.erasure_action = container.querySelector('#dsr-erasure-action').value || null;
        } else if (type === 'Object') {
          payload.processing_suspended = 1;
        } else if (type === 'Withdraw Consent') {
          payload.consent_withdrawn_date = container.querySelector('#dsr-consent-withdrawn').value || date;
        }

        try {
          await Api.popia.createRequest(contactId, payload);
          close();
          toast('Request logged', 'success');
          PopiaTab.renderForContact(contactId);
        } catch (err) {
          errEl.textContent = err.message || String(err);
          errEl.style.display = 'block';
        }
      });
    },

    _openDsrUpdateModal(contactId, dsrId) {
      const statuses = ['Open', 'In Progress', 'Completed', 'Rejected'];
      const container = document.createElement('div');
      container.id = 'dsr-update-modal-container';
      container.innerHTML = `
        <div class="modal-overlay" id="dsr-update-modal"
             style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;">
          <div class="modal" style="background:#fff;border-radius:8px;width:480px;max-width:92vw;max-height:90vh;overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,0.2);">
            <div class="modal-header" style="padding:1rem 1.25rem;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;">Update data subject request</h3>
              <button type="button" id="dsr-update-close"
                      class="modal-close">×</button>
            </div>
            <div class="modal-body" style="padding:1.25rem;">
              <div id="dsr-update-error" class="alert alert-danger" style="display:none;margin-bottom:.75rem;"></div>
              <div class="form-group">
                <label class="form-label required">Status</label>
                <select id="dsr-update-status" class="form-control" required>
                  <option value="">— Select —</option>
                  ${statuses.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Outcome</label>
                <textarea id="dsr-update-outcome" class="form-control" rows="3" placeholder="Optional — outcome notes for the audit trail"></textarea>
              </div>
            </div>
            <div class="modal-footer" style="padding:1rem 1.25rem;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:.5rem;">
              <button type="button" class="btn btn-secondary" id="dsr-update-cancel">Cancel</button>
              <button type="button" class="btn btn-primary" id="dsr-update-save">Save update</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(container);
      container._breachRecipients = { all_contacts: false, all_accounts: false, all_users: false, selected: [] };
      DataBreaches._renderRecipientPicker(container);

      const close = () => container.remove();
      container.querySelector('#dsr-update-modal').addEventListener('click', (e) => {
        /* click-outside-to-close disabled */ void e;
      });
      container.querySelector('#dsr-update-close').addEventListener('click', close);
      container.querySelector('#dsr-update-cancel').addEventListener('click', close);

      container.querySelector('#dsr-update-save').addEventListener('click', async () => {
        const status  = container.querySelector('#dsr-update-status').value;
        const outcome = container.querySelector('#dsr-update-outcome').value.trim();
        const errEl   = container.querySelector('#dsr-update-error');
        if (!status) {
          errEl.textContent = 'Status is required.';
          errEl.style.display = 'block';
          return;
        }
        try {
          await Api.popia.updateRequest(dsrId, {
            status,
            outcome,
            completion_date: status === 'Completed' ? new Date().toISOString().slice(0, 10) : null,
          });
          close();
          toast('Request updated', 'success');
          PopiaTab.renderForContact(contactId);
        } catch (err) {
          errEl.textContent = err.message || String(err);
          errEl.style.display = 'block';
        }
      });
    }
  };

  // ═════════════════════════════════════════════════════════════
  // FICA Tab
  // ═════════════════════════════════════════════════════════════
  const FicaTab = {
    async renderForContact(contactId) {
      setHeader('FICA Verification', ['Home', 'Contacts', 'FICA']);
      renderInto(`<div class="page-wrapper"><div class="loading-spinner"></div></div>`);

      try {
        const [d, options, users] = await Promise.all([
          Api.fica.getContact(contactId),
          Api.fica.options(),
          Api.admin.users().catch(() => []),
        ]);
        renderInto(this._template(contactId, d, options, users));
        this._bind(contactId);
      } catch (err) {
        renderInto(`<div class="alert alert-danger">${esc(err.message)}</div>`);
      }
    },

    _template(contactId, d, opts, users) {
      const userList = Array.isArray(users) ? users : (users?.data || []);
      const verifierOpts = [{ id: '', full_name: '— None —' }, ...userList].map(u =>
        `<option value="${esc(u.id)}" ${String(u.id) === String(d.fica_verified_by_id) ? 'selected' : ''}>${esc(u.full_name || u.username)}</option>`
      ).join('');
      const dd = (name, values, selected) => `
        <select name="${name}" class="form-control">
          <option value="">— Select —</option>
          ${values.map(v => `<option value="${esc(v)}" ${selected === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
        </select>`;

      return `
        <div class="page-wrapper" style="max-width:800px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <a href="#/contacts/${contactId}" class="btn-back">← Back to Contact</a>
            ${badgeForFica(d.derived_status || 'Not verified')}
          </div>

          ${d.banner ? `
          <div class="alert alert-warning" style="margin-bottom:1rem;">
            ⚠ <strong>FICA Not Verified</strong> — This contact lacks a valid FICA verification (FICA s23).
            Verification records must be retained for at least 5 years from last transaction.
          </div>` : ''}

          <form id="fica-form" class="card" style="padding:1.25rem;">
            <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
              <div class="form-group">
                <label class="form-label required">Verification date</label>
                <input type="date" class="form-control" name="fica_verification_date" value="${esc(d.fica_verification_date || '')}" required>
              </div>
              <div class="form-group">
                <label class="form-label required">Verification method</label>
                ${dd('fica_verification_method', opts.method, d.fica_verification_method)}
              </div>
            </div>
            <div class="form-group">
              <label class="form-label required">Document reference</label>
              <input type="text" class="form-control" name="fica_document_reference" value="${esc(d.fica_document_reference || '')}" placeholder="ID / Passport / Registration number" required>
            </div>
            <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
              <div class="form-group">
                <label class="form-label required">Verified by</label>
                <select name="fica_verified_by_id" class="form-control">${verifierOpts}</select>
              </div>
              <div class="form-group">
                <label class="form-label">5-year expiry</label>
                <input type="text" class="form-control" value="${esc(d.fica_five_year_expiry || '— auto-calculated —')}" disabled>
              </div>
            </div>

            <h4 style="margin:1rem 0 .5rem;color:#555;">Juristic Person / Company</h4>
            <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
              <div class="form-group">
                <label class="form-label">CIPC number</label>
                <input type="text" class="form-control" name="fica_cipc_number" value="${esc(d.fica_cipc_number || '')}">
              </div>
              <div class="form-group">
                <label class="form-label">Beneficial owner confirmed</label>
                ${dd('fica_beneficial_owner_confirmed', opts.beneficial_owner, d.fica_beneficial_owner_confirmed)}
              </div>
            </div>

            <h4 style="margin:1rem 0 .5rem;color:#555;">PEP / Sanctions Check</h4>
            <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
              <div class="form-group">
                <label class="form-label required">PEP check</label>
                ${dd('fica_pep_check', opts.pep, d.fica_pep_check)}
              </div>
              <div class="form-group">
                <label class="form-label">PEP check date</label>
                <input type="date" class="form-control" name="fica_pep_check_date" value="${esc(d.fica_pep_check_date || '')}">
              </div>
            </div>

            <div style="display:flex;gap:.5rem;margin-top:1rem;">
              <button type="submit" class="btn btn-primary">Save FICA Record</button>
            </div>
          </form>

          <!-- Verification Evidence — file uploads -->
          ${ficaEvidenceCard({ kind: 'contacts', recordId: contactId })}
        </div>
      `;
    },

    _bind(contactId) {
      const form = document.getElementById('fica-form');
      if (form) {
        form.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const fd = new FormData(form);
          const payload = Object.fromEntries(fd.entries());
          try {
            await Api.fica.updateContact(contactId, payload);
            toast('FICA record saved', 'success');
            setTimeout(() => this.renderForContact(contactId), 300);
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      }
      bindFicaEvidence({ kind: 'contacts', recordId: contactId });
    }
  };

  // ═════════════════════════════════════════════════════════════
  // Shared FICA Verification Evidence widget (file upload)
  // Used by FicaTab (contact) and Fica.detailAccount (account).
  // ═════════════════════════════════════════════════════════════
  function ficaEvidenceCard({ kind, recordId }) {
    return `
      <div class="card" style="margin-top:1rem;padding:1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;">
          <h3 style="margin:0;font-size:1rem;">Verification Evidence</h3>
          <span style="font-size:.78rem;color:#666;">PDF, JPG, PNG, DOCX. Max 20 MB. Required by FICA s23.</span>
        </div>
        <form id="fica-evidence-form" data-kind="${esc(kind)}" data-record="${esc(recordId)}"
              style="display:flex;gap:.5rem;align-items:flex-end;flex-wrap:wrap;">
          <div class="form-group" style="flex:1;min-width:240px;margin-bottom:0;">
            <label class="form-label" style="font-size:.82rem;">Certified copy of identity document</label>
            <input type="file" id="fica-evidence-file" accept=".pdf,.jpg,.jpeg,.png,.docx" required
                   style="display:block;width:100%;">
          </div>
          <div class="form-group" style="flex:2;min-width:200px;margin-bottom:0;">
            <label class="form-label" style="font-size:.82rem;">Description (optional)</label>
            <input type="text" id="fica-evidence-desc" class="form-control" placeholder="e.g. Certified ID — front + back">
          </div>
          <button type="submit" class="btn btn-primary btn-sm" id="fica-evidence-upload-btn">Upload</button>
        </form>
        <div id="fica-evidence-error" class="alert alert-danger" style="display:none;margin-top:.5rem;"></div>
        <div id="fica-evidence-list" style="margin-top:.75rem;font-size:.88rem;color:#666;">Loading…</div>
      </div>`;
  }

  async function bindFicaEvidence({ kind, recordId }) {
    const form = document.getElementById('fica-evidence-form');
    const list = document.getElementById('fica-evidence-list');
    const errEl = document.getElementById('fica-evidence-error');
    if (!form || !list) return;

    async function refresh() {
      list.innerHTML = 'Loading…';
      try {
        const r = await fetch(`/api/documents?module=${encodeURIComponent(kind)}&record_id=${encodeURIComponent(recordId)}`,
          { credentials: 'same-origin' });
        const j = await r.json();
        const all = (j && j.data) || [];
        const ev = all.filter(d => /^FICA evidence/i.test(d.description || ''));
        if (!ev.length) {
          list.innerHTML = '<em style="color:#999;">No FICA evidence uploaded yet.</em>';
          return;
        }
        list.innerHTML = `
          <table class="table" style="font-size:.85rem;">
            <thead><tr><th>File</th><th>Uploaded</th><th>By</th><th>Description</th><th></th></tr></thead>
            <tbody>${ev.map(d => `
              <tr>
                <td><a href="/api/documents/${esc(d.id)}/view" target="_blank">${esc(d.original_name || d.file_name)}</a></td>
                <td>${esc(String(d.uploaded_at || '').replace('T', ' ').slice(0, 16))}</td>
                <td>${esc(d.uploaded_by_name || '—')}</td>
                <td>${esc((d.description || '').replace(/^FICA evidence\s*[—-]\s*/i, '') || '—')}</td>
                <td><button class="btn btn-xs btn-danger js-fica-evidence-del" data-id="${esc(d.id)}">Delete</button></td>
              </tr>`).join('')}</tbody>
          </table>`;
        list.querySelectorAll('.js-fica-evidence-del').forEach(b => b.addEventListener('click', async () => {
          if (!confirm('Delete this evidence file?')) return;
          try {
            const r = await fetch(`/api/documents/${b.dataset.id}`, { method: 'DELETE', credentials: 'same-origin' });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Delete failed');
            toast('Evidence removed', 'success');
            refresh();
          } catch (err) { toast(err.message, 'error'); }
        }));
      } catch (err) {
        list.innerHTML = `<span style="color:#c0392b;">${esc(err.message || String(err))}</span>`;
      }
    }

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      errEl.style.display = 'none';
      const fileInput = document.getElementById('fica-evidence-file');
      const desc      = (document.getElementById('fica-evidence-desc').value || '').trim();
      if (!fileInput.files || !fileInput.files[0]) {
        errEl.textContent = 'Choose a file to upload.';
        errEl.style.display = 'block';
        return;
      }
      const fd = new FormData();
      fd.append('file', fileInput.files[0]);
      fd.append('module', kind);
      fd.append('record_id', String(recordId));
      fd.append('description', desc ? `FICA evidence — ${desc}` : 'FICA evidence');
      const btn = document.getElementById('fica-evidence-upload-btn');
      btn.disabled = true; btn.textContent = 'Uploading…';
      try {
        const r = await fetch('/api/documents/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Upload failed');
        toast('Evidence uploaded', 'success');
        form.reset();
        await refresh();
      } catch (err) {
        errEl.textContent = err.message || String(err);
        errEl.style.display = 'block';
      } finally {
        btn.disabled = false; btn.textContent = 'Upload';
      }
    });

    refresh();
  }

  // ═════════════════════════════════════════════════════════════
  // Broker Profiles (admin list + self-view)
  // ═════════════════════════════════════════════════════════════
  // Cell renderers for broker profile columns
  const BP_CELLS = {
    full_name:                (r) => esc(r.full_name || '—'),
    fsca_registration_number: (r) => esc(r.fsca_registration_number || '—'),
    appointment_date:         (r) => r.appointment_date ? esc(r.appointment_date) : '—',
    re1_status:               (r) => esc(r.re1_status || '—'),
    re5_status:               (r) => {
      const deadline = r.re5_deadline ? ` (by ${esc(r.re5_deadline)})` : '';
      return `${esc(r.re5_status || '—')}${deadline}`;
    },
    re5_deadline:             (r) => r.re5_deadline ? esc(r.re5_deadline) : '—',
    qualification_nqf_level:  (r) => esc(r.qualification_nqf_level || '—'),
    cpd_points_current:       (r) => {
      const pts = r.cpd_points_current || 0;
      const col = pts >= 14 ? '#1a7a3a' : pts >= 8 ? '#b78105' : '#c0392b';
      return `<span style="color:${col};font-weight:600;">${pts} / 18 pts</span>`;
    },
    good_standing_status:     (r) => esc(r.good_standing_status || '—'),
    insolvency_flag:          (r) => r.insolvency_flag ? '⚠ Yes' : 'No',
    updated_at:               (r) => r.updated_at ? esc(String(r.updated_at).slice(0, 10)) : '—',
    actions:                  (r) => `<a href="#/broker-profiles/${r.id}" class="btn btn-sm btn-outline">View</a>`,
  };

  let _bpCatalog = null;
  let _bpConfig  = null;

  const BrokerProfiles = {
    async list(opts = {}) {
      const embedded = !!opts.embedded;
      const el = document.getElementById(embedded ? 'admin-content' : 'content-area');
      if (!el) return;
      el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
      if (!embedded) {
        setPageTitle('Broker Profiles');
        setBreadcrumb(['Admin', 'Broker Profiles']);
      }

      const ctrlStyle = 'height:28px;padding:.15rem .4rem;font-size:.78rem;line-height:1;';
      const headerActions = document.getElementById('header-actions');
      if (headerActions) {
        headerActions.innerHTML = `<a href="#/broker-profiles/new" class="btn btn-primary" style="${ctrlStyle}">+ New Broker Profile</a>`;
      }

      try {
        const prefs = await ViewPrefs.load('broker_profiles');
        _bpCatalog = prefs.catalog;
        _bpConfig  = prefs.config;

        const listParams = { sort: _bpConfig.sortBy, dir: _bpConfig.sortDir };
        const rows = await Api.brokerProfiles.list(listParams);

        const visibleCols = ViewPrefs.visibleColumns(_bpCatalog, _bpConfig);
        const colCount = visibleCols.length || 1;
        const headCells = visibleCols.map(col => {
          const active = _bpConfig.sortBy === col.id;
          const arrow  = active ? (_bpConfig.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
          const classes = col.sortable
            ? `class="sortable${active ? ' sort-active' : ''}" data-sort="${col.id}" style="cursor:pointer;"`
            : 'class="not-sortable"';
          return `<th ${classes}>${esc(col.label)}${arrow}</th>`;
        }).join('');

        el.innerHTML = `
          <div class="list-page">
            <div class="card">
              <div class="table-responsive">
                <table class="table">
                  <thead><tr id="bp-thead-row">${headCells}</tr></thead>
                  <tbody id="bp-tbody">
                    <tr><td colspan="${colCount}" class="table-empty">Loading…</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `;

        ViewPrefs.attachButton({
          moduleKey: 'broker_profiles',
          catalog:   _bpCatalog,
          current:   _bpConfig,
          onChange:  (newCfg) => { _bpConfig = newCfg; BrokerProfiles.list({ embedded }); },
        });

        this._renderTableRows(rows);

        el.querySelectorAll('#bp-thead-row th.sortable').forEach(th => {
          th.addEventListener('click', async () => {
            const col = th.dataset.sort;
            if (_bpConfig.sortBy === col) {
              _bpConfig.sortDir = _bpConfig.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
              _bpConfig.sortBy = col;
              _bpConfig.sortDir = 'asc';
            }
            try { const r = await Api.viewPrefs.save('broker_profiles', _bpConfig); _bpConfig = r.config; } catch (_) {}
            BrokerProfiles.list({ embedded });
          });
        });
      } catch (err) {
        el.innerHTML = `<div class="alert alert-danger">Failed to load broker profiles: ${esc(err.message)}</div>`;
      }
    },

    _renderTableRows(rows) {
      const tbody = document.getElementById('bp-tbody');
      if (!tbody) return;
      const visibleCols = _bpCatalog ? ViewPrefs.visibleColumns(_bpCatalog, _bpConfig) : [];
      const colCount = visibleCols.length || 1;
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="${colCount}" class="table-empty">No broker profiles yet — click "+ New Broker Profile" to create one.</td></tr>`;
        return;
      }
      tbody.innerHTML = rows.map(r => `<tr>${visibleCols.map(col => {
        const fn = BP_CELLS[col.id];
        return `<td${col.id === 'actions' ? ' class="actions-cell"' : ''}>${fn ? fn(r) : esc(String(r[col.id] ?? '—'))}</td>`;
      }).join('')}</tr>`).join('');
    },

    // Spec-defined picklists (Section 4.13)
    _CATEGORIES: ['Personal Lines','Commercial Lines','Personal Lines & Commercial Lines','Life','Other'],
    _RE1_STATUS: ['Passed','Not yet required','Pending','Failed — action required'],
    _RE5_STATUS: ['Passed','Pending','Failed — action required'],
    _NQF_LEVELS: ['NQF Level 4','NQF Level 5','NQF Level 6+','In progress','Not yet obtained'],
    _COB_STATUS: ['Completed','In progress','Required','Not required'],
    _STANDING:   ['In good standing','Under review','Suspended','Debarred'],

    _formSections(p, opts = {}) {
      const isEdit = !!opts.isEdit;
      const cats = new Set(
        Array.isArray(p.categories_list) && p.categories_list.length
          ? p.categories_list
          : (p.categories_authorised
              ? String(p.categories_authorised).split(',').map(s => s.trim()).filter(Boolean)
              : [])
      );
      const cycleDeadline = p.cpd_cycle_deadline || '';
      return `
        <fieldset class="form-section">
          <legend class="form-section-title">Identification &amp; Registration</legend>
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label class="form-label required">SA ID number</label>
              <input type="text" class="form-control" name="id_number"
                     value="${esc(p.id_number || '')}" maxlength="13"
                     pattern="\\d{6,13}" autocomplete="off" required>
              <small style="color:#666;">Stored encrypted. Used for FSCA verification.</small>
            </div>
            <div class="form-group">
              <label class="form-label required">FSCA registration number</label>
              <input type="text" class="form-control" name="fsca_registration_number"
                     value="${esc(p.fsca_registration_number || '')}" required>
            </div>
            <div class="form-group">
              <label class="form-label required">Appointment date</label>
              <input type="date" class="form-control" name="appointment_date"
                     value="${esc(p.appointment_date || '')}" required>
            </div>
            <div class="form-group">
              <label class="form-label required">Categories of advice authorised</label>
              <div style="display:flex;flex-direction:column;gap:.25rem;padding:.4rem .55rem;border:1px solid var(--border,#ccd);border-radius:4px;background:var(--card-bg);">
                ${this._CATEGORIES.map(c => `
                  <label style="display:flex;align-items:center;gap:.5rem;font-weight:normal;">
                    <input type="checkbox" name="categories_authorised" value="${esc(c)}"
                           ${cats.has(c) ? 'checked' : ''}>
                    ${esc(c)}
                  </label>`).join('')}
              </div>
            </div>
          </div>
        </fieldset>

        <fieldset class="form-section">
          <legend class="form-section-title">Regulatory Exams (Board Notice 194)</legend>
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label class="form-label required">RE1 status</label>
              <select class="form-control" name="re1_status" data-conditional="re1" required>
                <option value="">— Select —</option>
                ${this._RE1_STATUS.map(v => `<option value="${esc(v)}" ${p.re1_status === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" data-show-when="re1_status=Passed">
              <label class="form-label">RE1 pass date</label>
              <input type="date" class="form-control" name="re1_pass_date" value="${esc(p.re1_pass_date || '')}">
            </div>
            <div class="form-group">
              <label class="form-label required">RE5 status</label>
              <select class="form-control" name="re5_status" required>
                <option value="">— Select —</option>
                ${this._RE5_STATUS.map(v => `<option value="${esc(v)}" ${p.re5_status === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" data-show-when="re5_status=Passed">
              <label class="form-label">RE5 pass date</label>
              <input type="date" class="form-control" name="re5_pass_date" value="${esc(p.re5_pass_date || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">RE5 deadline (auto)</label>
              <input type="text" class="form-control" value="${esc(p.re5_deadline || '—')}" disabled>
              <small style="color:#666;">Appointment + 2 years</small>
            </div>
          </div>
        </fieldset>

        <fieldset class="form-section">
          <legend class="form-section-title">Qualifications</legend>
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label class="form-label required">NQF qualification level</label>
              <select class="form-control" name="qualification_nqf_level" required>
                <option value="">— Select —</option>
                ${this._NQF_LEVELS.map(v => `<option value="${esc(v)}" ${p.qualification_nqf_level === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" data-show-when="qualification_nqf_level=NQF Level 4|NQF Level 5|NQF Level 6+">
              <label class="form-label">Qualification name</label>
              <input type="text" class="form-control" name="qualification_name" value="${esc(p.qualification_name || '')}">
            </div>
            <div class="form-group" data-show-when="qualification_nqf_level=NQF Level 4|NQF Level 5|NQF Level 6+">
              <label class="form-label">Qualification provider</label>
              <input type="text" class="form-control" name="qualification_provider" value="${esc(p.qualification_provider || '')}">
              <small style="color:#666;">Accredited learning institution</small>
            </div>
          </div>
        </fieldset>

        <fieldset class="form-section">
          <legend class="form-section-title">Class of Business Training</legend>
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label class="form-label">Personal lines</label>
              <select class="form-control" name="cob_personal_lines">
                <option value="">— Select —</option>
                ${this._COB_STATUS.map(v => `<option value="${esc(v)}" ${p.cob_personal_lines === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" data-show-when="cob_personal_lines=Completed">
              <label class="form-label">Personal lines completion date</label>
              <input type="date" class="form-control" name="cob_personal_lines_date" value="${esc(p.cob_personal_lines_date || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Commercial lines</label>
              <select class="form-control" name="cob_commercial_lines">
                <option value="">— Select —</option>
                ${this._COB_STATUS.map(v => `<option value="${esc(v)}" ${p.cob_commercial_lines === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" data-show-when="cob_commercial_lines=Completed">
              <label class="form-label">Commercial lines completion date</label>
              <input type="date" class="form-control" name="cob_commercial_lines_date" value="${esc(p.cob_commercial_lines_date || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">CoB deadline (auto)</label>
              <input type="text" class="form-control" value="${esc(p.cob_deadline || '—')}" disabled>
              <small style="color:#666;">Appointment + 12 months</small>
            </div>
          </div>
        </fieldset>

        ${isEdit ? `
        <fieldset class="form-section">
          <legend class="form-section-title">CPD Cycle</legend>
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label class="form-label">Current CPD cycle</label>
              <input type="text" class="form-control" value="${esc(p.current_cpd_cycle || '—')}" disabled>
            </div>
            <div class="form-group">
              <label class="form-label">CPD cycle deadline</label>
              <input type="text" class="form-control" value="${esc(cycleDeadline || '—')}" disabled>
              <small style="color:#666;">31 May of current cycle</small>
            </div>
            <div class="form-group">
              <label class="form-label">Points logged this cycle</label>
              <input type="text" class="form-control" value="${(p.cpd_points_current ?? 0)} / 18" disabled>
            </div>
            <div class="form-group">
              <label class="form-label">Points remaining</label>
              <input type="text" class="form-control" value="${(p.cpd_points_remaining ?? 18)}" disabled>
            </div>
          </div>
        </fieldset>` : ''}

        <fieldset class="form-section">
          <legend class="form-section-title">Fit &amp; Proper Status</legend>
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label class="form-label required">Good standing</label>
              <select class="form-control" name="good_standing_status" required>
                ${this._STANDING.map(v => `<option value="${esc(v)}" ${p.good_standing_status === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="display:flex;align-items:center;gap:.5rem;margin-top:1.75rem;">
                <input type="checkbox" name="insolvency_flag" ${p.insolvency_flag ? 'checked' : ''}>
                Insolvency / sequestration flag
              </label>
            </div>
            <div class="form-group" data-show-when="good_standing_status=Debarred">
              <label class="form-label">Debarment date</label>
              <input type="date" class="form-control" name="debarment_date" value="${esc(p.debarment_date || '')}">
            </div>
            <div class="form-group" data-show-when="good_standing_status=Debarred">
              <label class="form-label">Debarment reason</label>
              <input type="text" class="form-control" name="debarment_reason" value="${esc(p.debarment_reason || '')}">
              <small style="color:#666;">Stored permanently.</small>
            </div>
            <div class="form-group" data-show-when="good_standing_status=Debarred">
              <label class="form-label">Debarment lifted date</label>
              <input type="date" class="form-control" name="debarment_lifted_date" value="${esc(p.debarment_lifted_date || '')}">
            </div>
            <div class="form-group" data-show-when="good_standing_status=Debarred">
              <label class="form-label">Authorising manager (if lifted)</label>
              <select class="form-control" name="debarment_authorised_by_id">
                <option value="">— None —</option>
                ${(opts.adminUsers || []).map(u =>
                  `<option value="${esc(u.id)}" ${String(p.debarment_authorised_by_id || '') === String(u.id) ? 'selected' : ''}>${esc(u.full_name)}</option>`
                ).join('')}
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset class="form-section">
          <legend class="form-section-title">Notes</legend>
          <div class="form-group">
            <textarea class="form-control" name="notes" rows="4">${esc(p.notes || '')}</textarea>
          </div>
        </fieldset>
      `;
    },

    _bindConditionalShow(root) {
      if (!root) return;
      const evaluate = () => {
        root.querySelectorAll('[data-show-when]').forEach(el => {
          const [field, valuesStr] = el.dataset.showWhen.split('=');
          const values = (valuesStr || '').split('|').filter(Boolean);
          const ctrl = root.querySelector(`[name="${field}"]`);
          const cur  = ctrl ? ctrl.value : '';
          el.style.display = values.includes(cur) ? '' : 'none';
        });
      };
      root.addEventListener('change', evaluate);
      evaluate();
    },

    _collectPayload(form) {
      const fd = new FormData(form);
      const payload = {};
      for (const [k, v] of fd.entries()) {
        if (k === 'categories_authorised' || k === 'insolvency_flag') continue;
        payload[k] = v;
      }
      payload.categories_authorised = fd.getAll('categories_authorised');
      payload.insolvency_flag = form.querySelector('[name="insolvency_flag"]')?.checked ? 1 : 0;
      return payload;
    },

    // Create-new form. Picks a user (without an existing profile) then creates.
    async form() {
      setHeader('New Broker Profile', ['Home', 'Admin', 'Broker Profiles', 'New']);
      const actions = document.getElementById('header-actions');
      if (actions) actions.innerHTML = '';
      renderInto(`<div class="page-wrapper"><div class="loading-spinner"></div></div>`);
      try {
        const [users, existing] = await Promise.all([
          Api.admin.users().catch(() => []),
          Api.brokerProfiles.list().catch(() => []),
        ]);
        const existingUserIds = new Set((existing || []).map(p => String(p.user_id)));
        const allUsers = users.data || users || [];
        const available = allUsers.filter(u => !existingUserIds.has(String(u.id)) && u.active);
        const adminUsers = allUsers.filter(u => u.active && (u.role === 'admin' || u.role === 'admin_only'));

        if (!available.length) {
          renderInto(`
            <div class="page-wrapper" style="max-width:600px;">
              <div class="alert alert-info">
                Every active user already has a broker profile. Open an existing profile from the list or create a new user in Admin first.
              </div>
              <a href="#/broker-profiles" class="btn btn-secondary btn-back">← Back</a>
            </div>`);
          return;
        }

        renderInto(`
          <div class="form-page">
            <div class="card">
              <div class="card-header"><h3 class="card-title">New Broker Profile</h3></div>
              <form id="bp-new-form" novalidate>
                <fieldset class="form-section">
                  <legend class="form-section-title">User</legend>
                  <div class="form-grid form-grid-2">
                    <div class="form-group" style="grid-column:1/-1;">
                      <label class="form-label required">Select user</label>
                      <select class="form-control" name="user_id" required>
                        <option value="">— Select user —</option>
                        ${available.map(u => `<option value="${esc(u.id)}">${esc(u.full_name)} (${esc(u.username)})</option>`).join('')}
                      </select>
                      <small style="color:#666;">Broker Full Name is pulled from the user record and cannot be overridden here.</small>
                    </div>
                  </div>
                </fieldset>

                ${this._formSections({}, { isEdit: false, adminUsers })}

                <div class="form-actions">
                  <button type="submit" class="btn btn-primary">Create Broker Profile</button>
                  <a href="#/broker-profiles" class="btn btn-secondary">Cancel</a>
                </div>
              </form>
            </div>
          </div>
        `);

        const form = document.getElementById('bp-new-form');
        this._bindConditionalShow(form);

        form.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const payload = this._collectPayload(form);
          payload.user_id = form.querySelector('[name="user_id"]').value;
          try {
            const created = await Api.brokerProfiles.create(payload);
            toast('Broker profile created', 'success');
            navigate('broker-profiles/' + created.id);
          } catch (err) { toast(err.message, 'error'); }
        });
      } catch (err) {
        renderInto(`<div class="alert alert-danger">${esc(err.message)}</div>`);
      }
    },

    async detail(id) {
      setHeader('Broker Profile', ['Home', 'Admin', 'Broker Profiles', 'Detail']);
      const actions = document.getElementById('header-actions');
      if (actions) actions.innerHTML = '';
      renderInto(`<div class="page-wrapper"><div class="loading-spinner"></div></div>`);
      try {
        const [p, cpd, usersResp] = await Promise.all([
          Api.brokerProfiles.get(id),
          Api.brokerProfiles.cpdList(id),
          Api.admin.users().catch(() => []),
        ]);
        const allUsers = usersResp.data || usersResp || [];
        const adminUsers = allUsers.filter(u => u.active && (u.role === 'admin' || u.role === 'admin_only'));
        renderInto(this._detailTemplate(id, p, cpd, { adminUsers }));
        this._bindDetail(id, { adminUsers, userId: p.user_id });
      } catch (err) {
        renderInto(`<div class="alert alert-danger">${esc(err.message)}</div>`);
      }
    },

    _alertStrip(p) {
      const alerts = [];
      const today = new Date();
      const daysUntil = (d) => {
        if (!d) return null;
        return Math.round((new Date(d) - today) / (1000 * 60 * 60 * 24));
      };

      const re5d = daysUntil(p.re5_deadline);
      if (p.re5_status !== 'Passed' && re5d !== null) {
        if (re5d < 0)        alerts.push({ tone: 'danger',  msg: `RE5 deadline passed ${-re5d} day(s) ago — broker suspended from new ROAs.` });
        else if (re5d <= 30) alerts.push({ tone: 'danger',  msg: `RE5 deadline in ${re5d} day(s) — escalate to senior management.` });
        else if (re5d <= 90) alerts.push({ tone: 'warning', msg: `RE5 deadline in ${re5d} day(s).` });
      }

      const cobd = daysUntil(p.cob_deadline);
      const cobIncomplete = (p.cob_personal_lines !== 'Completed' && p.cob_personal_lines !== 'Not required')
                         || (p.cob_commercial_lines !== 'Completed' && p.cob_commercial_lines !== 'Not required');
      if (cobIncomplete && cobd !== null && cobd <= 30) {
        alerts.push({ tone: cobd < 0 ? 'danger' : 'warning', msg: `Class of Business deadline ${cobd < 0 ? 'passed' : `in ${cobd} day(s)`}.` });
      }

      const cycD = daysUntil(p.cpd_cycle_deadline);
      const pts  = p.cpd_points_current || 0;
      if (cycD !== null) {
        if (cycD < 0 && pts < 18)       alerts.push({ tone: 'danger',  msg: `CPD cycle closed with ${pts}/18 points — flag broker.` });
        else if (cycD <= 7  && pts < 18) alerts.push({ tone: 'danger',  msg: `CPD cycle closes in ${cycD} day(s); ${pts}/18 logged.` });
        else if (cycD <= 30 && pts < 18) alerts.push({ tone: 'warning', msg: `CPD cycle closes in ${cycD} day(s); ${pts}/18 logged.` });
        else if (cycD <= 90 && pts < 14) alerts.push({ tone: 'warning', msg: `CPD cycle closes in ${cycD} day(s); only ${pts} points logged (< 14).` });
      }

      if (p.good_standing_status === 'Debarred') {
        alerts.push({ tone: 'danger', msg: 'Broker is DEBARRED — advice functions must be suspended.' });
      }
      if (p.insolvency_flag) {
        alerts.push({ tone: 'danger', msg: 'Broker flagged as insolvent / sequestrated.' });
      }

      if (!alerts.length) return '';
      return `<div style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:1rem;">
        ${alerts.map(a => `<div class="alert alert-${a.tone === 'danger' ? 'danger' : 'warning'}" style="padding:.5rem .75rem;">⚠ ${esc(a.msg)}</div>`).join('')}
      </div>`;
    },

    _detailTemplate(id, p, cpd, opts = {}) {
      const cpdPts = cpd.reduce((s, x) => s + (x.points_awarded || 0), 0);
      const statusColor = cpdPts >= 14 ? '#1a7a3a' : cpdPts >= 8 ? '#b78105' : '#c0392b';

      return `
        <div class="detail-view">

          <!-- Broker Identity -->
          <div class="detail-section card">
            <div class="detail-section-title">Broker</div>
            <div class="detail-grid">
              <div class="detail-field"><span class="detail-label">Name</span><span class="detail-value">${esc(p.full_name || '—')}</span></div>
              <div class="detail-field"><span class="detail-label">Email</span><span class="detail-value">${esc(p.email || '—')}</span></div>
              <div class="detail-field"><span class="detail-label">ID number</span><span class="detail-value">${p.id_number_encrypted ? EncryptedField.render({ module:'broker_profiles', recordId:p.id, field:'id_number', masked:p.id_number_masked, label:'ID Number' }) : esc(p.id_number_masked || '—')}</span></div>
              <div class="detail-field"><span class="detail-label">Current CPD cycle</span><span class="detail-value">${esc(p.current_cpd_cycle || '—')}</span></div>
              <div class="detail-field"><span class="detail-label">CPD points this cycle</span><span class="detail-value"><strong style="color:${statusColor};">${cpdPts} / 18</strong></span></div>
              <div class="detail-field"><span class="detail-label">Cycle deadline</span><span class="detail-value">${esc(p.cpd_cycle_deadline || '—')}</span></div>
            </div>
            <div style="margin-top:.5rem;">
              <a href="#/broker-profiles/${id}/audit-report" class="btn btn-sm btn-secondary">📄 View audit history</a>
            </div>
          </div>

          ${this._alertStrip(p)}

          <!-- Broker Codes -->
          <div class="card" style="margin-bottom:1rem;">
            <div class="card-header"><h3 class="card-title">Broker Codes</h3></div>
            <div style="padding:0 1rem 1rem;">
              <p style="font-size:.82rem;color:var(--text-light,#666);margin:.25rem 0 .75rem;">
                Insurer-issued codes for this broker. Selected on each policy at write time and shown on the policy schedule.
              </p>
              <div id="bc-list" style="margin-top:.25rem;"></div>
              <div style="display:grid;grid-template-columns:1fr 2fr auto;gap:.5rem;margin-top:.6rem;">
                <input class="form-control" id="bc-new-code" placeholder="Code">
                <input class="form-control" id="bc-new-desc" placeholder="Description (optional)">
                <button class="btn btn-sm btn-primary" type="button" onclick="Admin._addBrokerCode(${p.user_id})">Add</button>
              </div>
              <div id="bc-error" style="display:none;color:var(--danger);font-size:.8rem;margin-top:.4rem;"></div>
            </div>
          </div>

          <!-- Fit & Proper editor -->
          <div class="card">
            <div class="card-header"><h3 class="card-title">Fit &amp; Proper Details</h3></div>
            <form id="bp-form" novalidate>
              ${this._formSections(p, { isEdit: true, adminUsers: opts.adminUsers || [] })}

              <div class="form-actions">
                <button type="submit" class="btn btn-primary">Save changes</button>
                <a href="#/broker-profiles" class="btn btn-secondary btn-back">← Back to Broker Profiles</a>
              </div>
            </form>
          </div>

          <!-- CPD Activities -->
          <div class="detail-tabs card">
            <div class="tabs-header">
              <button class="tab-btn active" type="button">CPD Activities — ${esc(p.current_cpd_cycle || '')}</button>
            </div>
            <div class="tab-content">
              <div class="tab-toolbar" style="padding:.75rem;">
                <button id="new-cpd" class="btn btn-sm btn-primary">+ Log CPD Activity</button>
                <span style="margin-left:1rem;font-size:.9rem;color:var(--text-light,#666);">
                  Points this cycle: <strong style="color:${statusColor};">${cpdPts} / 18</strong>
                  &nbsp;·&nbsp; ${Math.max(0, 18 - cpdPts)} points remaining
                </span>
              </div>
              <div class="table-responsive">
                <table class="table">
                  <thead><tr>
                    <th>Date</th><th>Type</th><th>Activity</th><th>Provider</th>
                    <th style="text-align:center;">Points</th><th>Approved by</th><th>Certificate</th><th></th>
                  </tr></thead>
                  <tbody>
                    ${cpd.map(c => `
                      <tr>
                        <td>${esc(c.activity_date)}</td>
                        <td>${esc(c.activity_type)}</td>
                        <td>${esc(c.activity_title || '—')}</td>
                        <td>${esc(c.activity_provider)}</td>
                        <td style="text-align:center;">${c.points_awarded}</td>
                        <td>${esc(c.approved_by_name || '—')}</td>
                        <td>${(() => {
                          const cp = c.certificate_path || '';
                          const m = /^doc:(\d+)$/.exec(cp);
                          if (m) return `<a href="/api/documents/${esc(m[1])}/view" target="_blank">View</a>`;
                          if (cp && cp !== 'pending-upload') return `<span title="${esc(cp)}">📎 file</span>`;
                          return '—';
                        })()}</td>
                        <td style="white-space:nowrap;">
                          <button class="btn btn-xs btn-secondary cpd-edit" data-id="${c.id}">Edit</button>
                          <button class="btn btn-xs btn-danger cpd-del" data-id="${c.id}">Delete</button>
                        </td>
                      </tr>`).join('') || '<tr><td colspan="8" class="table-empty">No CPD activities logged yet.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      `;
    },

    _bindDetail(id, opts = {}) {
      // Populate the Broker Codes panel for this profile's user
      if (opts.userId && window.Admin?._renderBrokerCodes) {
        window.Admin._renderBrokerCodes(opts.userId);
      }

      const form = document.getElementById('bp-form');
      if (form) {
        this._bindConditionalShow(form);
        form.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const payload = this._collectPayload(form);
          try {
            await Api.brokerProfiles.update(id, payload);
            toast('Profile saved', 'success');
            setTimeout(() => this.detail(id), 300);
          } catch (err) { toast(err.message, 'error'); }
        });
      }

      const newCpdBtn = document.getElementById('new-cpd');
      if (newCpdBtn) {
        newCpdBtn.addEventListener('click', () => this._openCpdModal(id, opts.adminUsers || []));
      }

      document.querySelectorAll('.cpd-edit').forEach(btn => {
        btn.addEventListener('click', async () => {
          const cpdId = parseInt(btn.dataset.id, 10);
          try {
            const list = await Api.brokerProfiles.cpdList(id);
            const existing = (list || []).find(c => c.id === cpdId);
            if (!existing) { toast('CPD activity not found', 'error'); return; }
            this._openCpdModal(id, opts.adminUsers || [], existing);
          } catch (e) { toast(e.message, 'error'); }
        });
      });

      document.querySelectorAll('.cpd-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this CPD activity?')) return;
          try {
            await Api.brokerProfiles.cpdDelete(btn.dataset.id);
            this.detail(id);
          } catch (e) { toast(e.message, 'error'); }
        });
      });
    },

    _openCpdModal(profileId, adminUsers = [], existing = null) {
      const isEdit = !!existing;
      const today = new Date().toISOString().slice(0, 10);
      const activityTypes = [
        'Accredited training',
        'Industry conference',
        'FSCA seminar',
        'Online course',
        'Structured reading',
        'Other accredited',
      ];
      const initial = {
        date:       isEdit ? (existing.activity_date || today) : today,
        type:       isEdit ? (existing.activity_type     || '') : '',
        provider:   isEdit ? (existing.activity_provider || '') : '',
        title:      isEdit ? (existing.activity_title    || '') : '',
        points:     isEdit ? (existing.points_awarded != null ? existing.points_awarded : '') : '',
        approverId: isEdit ? (existing.approved_by_id   || '') : '',
        certPath:   isEdit ? (existing.certificate_path || '') : '',
      };
      const certDocMatch = /^doc:(\d+)$/.exec(initial.certPath);
      const existingCertHtml = isEdit
        ? (certDocMatch
            ? `<small style="color:#666;display:block;margin-top:.25rem;">Current: <a href="/api/documents/${esc(certDocMatch[1])}/view" target="_blank">View existing certificate</a> — leave file empty to keep, or pick a new file to replace it.</small>`
            : (initial.certPath && initial.certPath !== 'pending-upload'
              ? `<small style="color:#666;display:block;margin-top:.25rem;">Current: <span title="${esc(initial.certPath)}">📎 ${esc(initial.certPath)}</span> — leave empty to keep, or pick a new file to replace it.</small>`
              : `<small style="color:#666;display:block;margin-top:.25rem;">No certificate on file — pick one to attach.</small>`))
        : '';

      const container = document.createElement('div');
      container.id = 'cpd-modal-container';
      container.innerHTML = `
        <div class="modal-overlay" id="cpd-modal"
             style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;">
          <div class="modal" style="background:#fff;border-radius:8px;width:720px;max-width:94vw;max-height:90vh;overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,0.2);">
            <div class="modal-header" style="padding:1rem 1.25rem;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;">${isEdit ? 'Edit CPD Activity' : 'Log CPD Activity'}</h3>
              <button type="button" id="cpd-modal-close"
                      class="modal-close">×</button>
            </div>
            <div class="modal-body" style="padding:1.25rem;">
              <div id="cpd-modal-error" class="alert alert-danger" style="display:none;margin-bottom:.75rem;"></div>
              <div class="form-grid form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group">
                  <label class="form-label required">Activity date</label>
                  <input type="date" id="cpd-date" class="form-control" value="${esc(initial.date)}" required>
                </div>
                <div class="form-group">
                  <label class="form-label required">Points awarded</label>
                  <input type="number" id="cpd-points" class="form-control" step="0.5" min="0" placeholder="e.g. 2" value="${esc(initial.points)}" required>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label required">Activity type</label>
                <select id="cpd-type" class="form-control" required>
                  <option value="">— Select —</option>
                  ${activityTypes.map(t => `<option value="${esc(t)}" ${initial.type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label required">Provider</label>
                <input type="text" id="cpd-provider" class="form-control" placeholder="Accredited provider" value="${esc(initial.provider)}" required>
              </div>
              <div class="form-group">
                <label class="form-label">Activity title</label>
                <input type="text" id="cpd-title" class="form-control" placeholder="Optional — e.g. COFI Workshop 2026" value="${esc(initial.title)}">
              </div>
              <div class="form-group">
                <label class="form-label required">Approved by (compliance officer / KI)</label>
                <select id="cpd-approver" class="form-control" required>
                  <option value="">— Select admin user —</option>
                  ${adminUsers.map(u => `<option value="${esc(u.id)}" ${String(initial.approverId) === String(u.id) ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label ${isEdit ? '' : 'required'}">Certificate / evidence</label>
                <input type="file" id="cpd-certificate" class="form-control"
                       accept=".pdf,.jpg,.jpeg,.png,.docx" ${isEdit ? '' : 'required'}>
                <small style="color:#666;">PDF, JPG, PNG or DOCX. Max 20 MB.${isEdit ? '' : ' Mandatory.'}</small>
                ${existingCertHtml}
              </div>
            </div>
            <div class="modal-footer" style="padding:1rem 1.25rem;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:.5rem;">
              <button type="button" class="btn btn-secondary" id="cpd-modal-cancel">Cancel</button>
              <button type="button" class="btn btn-primary" id="cpd-modal-save">${isEdit ? 'Save Changes' : 'Log Activity'}</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(container);

      const close = () => container.remove();
      container.querySelector('#cpd-modal').addEventListener('click', (e) => {
        /* click-outside-to-close disabled */ void e;
      });
      container.querySelector('#cpd-modal-close').addEventListener('click', close);
      container.querySelector('#cpd-modal-cancel').addEventListener('click', close);

      container.querySelector('#cpd-modal-save').addEventListener('click', async () => {
        const date       = container.querySelector('#cpd-date').value;
        const type       = container.querySelector('#cpd-type').value;
        const provider   = container.querySelector('#cpd-provider').value.trim();
        const title      = container.querySelector('#cpd-title').value.trim();
        const ptsRaw     = container.querySelector('#cpd-points').value;
        const approverId = container.querySelector('#cpd-approver').value;
        const fileInput  = container.querySelector('#cpd-certificate');
        const errEl      = container.querySelector('#cpd-modal-error');

        if (!date || !type || !provider || !ptsRaw || !approverId) {
          errEl.textContent = 'Date, type, provider, points and approver are all required.';
          errEl.style.display = 'block';
          return;
        }
        const pts = parseFloat(ptsRaw);
        if (isNaN(pts) || pts < 0) {
          errEl.textContent = 'Points must be a non-negative number.';
          errEl.style.display = 'block';
          return;
        }
        const newFile = fileInput.files && fileInput.files[0];
        if (!isEdit && !newFile) {
          errEl.textContent = 'A certificate / proof of completion is required.';
          errEl.style.display = 'block';
          return;
        }

        const saveBtn = container.querySelector('#cpd-modal-save');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';

        try {
          if (isEdit) {
            // Edit flow: optionally upload a replacement file, then PUT the record.
            let certPath = initial.certPath;
            if (newFile) {
              const fd = new FormData();
              fd.append('file', newFile);
              fd.append('module', 'cpd-activities');
              fd.append('record_id', String(existing.id));
              fd.append('description', `CPD certificate — ${title || type}`);
              const uploadResp = await fetch('/api/documents/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
              if (!uploadResp.ok) {
                const e = await uploadResp.json().catch(() => ({}));
                throw new Error(e.error || 'Certificate upload failed');
              }
              const doc = await uploadResp.json();
              certPath = `doc:${doc.id}`;
            }
            await Api.brokerProfiles.cpdUpdate(existing.id, {
              activity_date:     date,
              activity_type:     type,
              activity_provider: provider,
              activity_title:    title,
              points_awarded:    pts,
              approved_by_id:    parseInt(approverId, 10),
              certificate_path:  certPath,
            });
            close();
            toast('CPD activity updated', 'success');
            this.detail(profileId);
            return;
          }

          // Create flow: placeholder → upload → patch.
          const created = await Api.brokerProfiles.cpdCreate(profileId, {
            activity_date:     date,
            activity_type:     type,
            activity_provider: provider,
            activity_title:    title,
            points_awarded:    pts,
            approved_by_id:    parseInt(approverId, 10),
            certificate_path:  'pending-upload',
          });

          const fd = new FormData();
          fd.append('file', newFile);
          fd.append('module', 'cpd-activities');
          fd.append('record_id', String(created.id));
          fd.append('description', `CPD certificate — ${title || type}`);
          const uploadResp = await fetch('/api/documents/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
          if (!uploadResp.ok) {
            const e = await uploadResp.json().catch(() => ({}));
            throw new Error(e.error || 'Certificate upload failed');
          }
          const doc = await uploadResp.json();

          await Api.brokerProfiles.cpdUpdate(created.id, {
            activity_date:     date,
            activity_type:     type,
            activity_provider: provider,
            activity_title:    title,
            points_awarded:    pts,
            approved_by_id:    parseInt(approverId, 10),
            certificate_path:  `doc:${doc.id}`,
          });

          close();
          toast('CPD activity logged', 'success');
          this.detail(profileId);
        } catch (err) {
          errEl.textContent = err.message || String(err);
          errEl.style.display = 'block';
          saveBtn.disabled = false;
          saveBtn.textContent = isEdit ? 'Save Changes' : 'Log Activity';
        }
      });
    },

    // ── Per-broker fitness audit report ─────────────────────────
    async auditReport(id) {
      setHeader('Broker Fitness Audit Report', ['Home', 'Admin', 'Broker Profiles', 'Audit Report']);
      const actions = document.getElementById('header-actions');
      if (actions) actions.innerHTML = '';
      renderInto(`<div class="page-wrapper"><div class="loading-spinner"></div></div>`);

      const today    = new Date().toISOString().slice(0, 10);
      const ninetyAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

      const load = async (from, to) => {
        const qs = new URLSearchParams();
        if (from) qs.set('from', from);
        if (to)   qs.set('to', to);
        const resp = await fetch(`/api/broker-profiles/${id}/audit-report?${qs.toString()}`, { credentials: 'same-origin' });
        if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || 'Failed');
        return resp.json();
      };

      const render = (data, from, to) => {
        const p = data.profile;
        const c = data.cycle;
        const events = data.events || [];

        const eventRow = (e) => {
          const old = e.old_value ? `<details><summary>Before</summary><pre style="white-space:pre-wrap;font-size:.8rem;margin:.25rem 0;">${esc(e.old_value)}</pre></details>` : '';
          const nw  = e.new_value ? `<details><summary>After</summary><pre style="white-space:pre-wrap;font-size:.8rem;margin:.25rem 0;">${esc(e.new_value)}</pre></details>` : '';
          return `
            <tr>
              <td style="white-space:nowrap;">${esc(String(e.timestamp).replace('T', ' ').slice(0, 19))}</td>
              <td>${esc(e.user_full_name || e.user_username || 'System')}</td>
              <td><span class="badge" data-status="${esc(e.action)}">${esc(e.action)}</span></td>
              <td>${esc(e.module)}</td>
              <td>${esc(e.record_id || '')}</td>
              <td>${esc(e.description || '')}</td>
              <td>${old}${nw}</td>
            </tr>`;
        };

        renderInto(`
          <div class="page-wrapper" id="audit-report-page">
            <div class="card" style="margin-bottom:1rem;">
              <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                <h3 class="card-title">Broker Fitness Audit Report — ${esc(p.full_name || '')}</h3>
                <div style="display:flex;gap:.5rem;">
                  <a href="#/broker-profiles/${id}" class="btn btn-sm btn-secondary btn-back">← Back to profile</a>
                  <button class="btn btn-sm btn-secondary" id="ar-print">🖨 Print</button>
                  <button class="btn btn-sm btn-secondary" id="ar-csv">⇩ CSV</button>
                </div>
              </div>
              <div style="padding:1rem;">
                <div class="detail-grid">
                  <div class="detail-field"><span class="detail-label">Broker</span><span class="detail-value">${esc(p.full_name || '—')}</span></div>
                  <div class="detail-field"><span class="detail-label">Username</span><span class="detail-value">${esc(p.username || '—')}</span></div>
                  <div class="detail-field"><span class="detail-label">FSCA reg #</span><span class="detail-value">${esc(p.fsca_registration_number || '—')}</span></div>
                  <div class="detail-field"><span class="detail-label">ID number</span><span class="detail-value">${p.id_number_encrypted ? EncryptedField.render({ module:'broker_profiles', recordId:p.id, field:'id_number', masked:p.id_number_masked, label:'ID Number' }) : esc(p.id_number_masked || '—')}</span></div>
                  <div class="detail-field"><span class="detail-label">Appointment date</span><span class="detail-value">${esc(p.appointment_date || '—')}</span></div>
                  <div class="detail-field"><span class="detail-label">Good standing</span><span class="detail-value">${esc(p.good_standing_status || '—')}</span></div>
                  <div class="detail-field"><span class="detail-label">RE5 deadline</span><span class="detail-value">${esc(p.re5_deadline || '—')}</span></div>
                  <div class="detail-field"><span class="detail-label">CoB deadline</span><span class="detail-value">${esc(p.cob_deadline || '—')}</span></div>
                  <div class="detail-field"><span class="detail-label">Current cycle</span><span class="detail-value">${esc(c.current || '—')} (closes ${esc(c.deadline || '—')})</span></div>
                  <div class="detail-field"><span class="detail-label">CPD points</span><span class="detail-value">${c.points_current} / 18 (${c.points_remaining} remaining)</span></div>
                </div>
              </div>
            </div>

            <div class="card" style="padding:1rem;margin-bottom:1rem;">
              <div class="filter-bar" style="display:flex;gap:.75rem;align-items:flex-end;">
                <div class="form-group" style="margin:0;">
                  <label class="form-label">From</label>
                  <input type="date" class="form-control" id="ar-from" value="${esc(from || '')}" style="width:160px;">
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label">To</label>
                  <input type="date" class="form-control" id="ar-to" value="${esc(to || '')}" style="width:160px;">
                </div>
                <button class="btn btn-primary btn-sm" id="ar-apply">Apply</button>
                <button class="btn btn-secondary btn-sm" id="ar-clear">Clear</button>
                <span style="margin-left:auto;font-size:.85rem;color:#666;">${events.length} event(s) · generated ${esc(String(data.generated_at).replace('T', ' ').slice(0, 19))}</span>
              </div>
            </div>

            <div class="card">
              <div class="table-responsive">
                <table class="table" id="ar-table">
                  <thead><tr>
                    <th>Timestamp</th><th>User</th><th>Action</th><th>Module</th><th>Record</th><th>Description</th><th>Diff</th>
                  </tr></thead>
                  <tbody>
                    ${events.length ? events.map(eventRow).join('') : '<tr><td colspan="7" class="table-empty">No audit events in this range.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `);

        document.getElementById('ar-apply').addEventListener('click', async () => {
          const f = document.getElementById('ar-from').value || null;
          const t = document.getElementById('ar-to').value   || null;
          try {
            const next = await load(f, t);
            render(next, f, t);
          } catch (e) { toast(e.message, 'error'); }
        });
        document.getElementById('ar-clear').addEventListener('click', () => render(data, null, null));
        document.getElementById('ar-print').addEventListener('click', () => window.print());
        document.getElementById('ar-csv').addEventListener('click', () => {
          const head = ['timestamp','user','action','module','record_id','description'];
          const lines = [head.join(',')].concat(events.map(e => head.map(k => {
            const map = { user: e.user_full_name || e.user_username || '' };
            const v = (map[k] !== undefined ? map[k] : (e[k] ?? '')) + '';
            return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
          }).join(',')));
          const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
          const url  = URL.createObjectURL(blob);
          const a    = document.createElement('a');
          a.href = url; a.download = `broker-${id}-audit-${today}.csv`;
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
        });
      };

      try {
        const data = await load(ninetyAgo, today);
        render(data, ninetyAgo, today);
      } catch (err) {
        renderInto(`<div class="alert alert-danger">${esc(err.message)}</div>`);
      }
    }
  };

  // ═════════════════════════════════════════════════════════════
  // Product Library
  // ═════════════════════════════════════════════════════════════
  // Product cell renderers
  const PROD_CELLS = {
    product_code:        (r) => esc(r.product_code || '—'),
    product_name:        (r) => esc(r.product_name || '—'),
    insurer:             (r) => esc(r.insurer || '—'),
    product_category:    (r) => esc(r.product_category || '—'),
    product_status:      (r) => {
      const col = r.product_status === 'Active' ? '#1a7a3a' : r.product_status === 'Discontinued' ? '#c0392b' : '#b78105';
      return `<span style="color:${col};font-weight:500;">${esc(r.product_status || '—')}</span>`;
    },
    min_insurable_value: (r) => r.min_insurable_value != null ? 'R ' + Number(r.min_insurable_value).toLocaleString('en-ZA') : '—',
    max_insurable_value: (r) => r.max_insurable_value != null ? 'R ' + Number(r.max_insurable_value).toLocaleString('en-ZA') : '—',
    geographic_scope:    (r) => esc(r.geographic_scope || '—'),
    last_review_date:    (r) => r.last_review_date ? esc(r.last_review_date) : '—',
    reviewed_by_name:    (r) => esc(r.reviewed_by_name || '—'),
    updated_at:          (r) => r.updated_at ? esc(String(r.updated_at).slice(0, 10)) : '—',
    actions:             (r) => `<a href="#/products/${r.id}/edit" class="btn btn-sm btn-outline">Edit</a>`,
  };

  let _prodCatalog = null;
  let _prodConfig  = null;

  const Products = {
    _filters: { search: '', insurer: '', category: '' },

    async list(opts = {}) {
      const embedded = !!opts.embedded;
      const el = document.getElementById(embedded ? 'admin-content' : 'content-area');
      if (!el) return;
      el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
      if (!embedded) {
        setPageTitle('Product Library');
        setBreadcrumb(['Admin', 'Products']);
      }

      const ctrlStyle = 'height:28px;padding:.15rem .4rem;font-size:.78rem;line-height:1;';
      const headerActions = document.getElementById('header-actions');
      if (headerActions) {
        headerActions.innerHTML = `<a href="#/products/new" class="btn btn-primary" style="${ctrlStyle}">+ New Product</a>`;
      }

      try {
        const prefs = await ViewPrefs.load('products');
        _prodCatalog = prefs.catalog;
        _prodConfig  = prefs.config;

        const listParams = {
          sort:     _prodConfig.sortBy,
          dir:      _prodConfig.sortDir,
          search:   this._filters.search   || undefined,
          insurer:  this._filters.insurer  || undefined,
          category: this._filters.category || undefined,
        };
        const [rows, options] = await Promise.all([
          Api.products.list(listParams),
          Api.products.options().catch(() => ({ insurers: [], product_category: [] })),
        ]);

        const visibleCols = ViewPrefs.visibleColumns(_prodCatalog, _prodConfig);
        const colCount = visibleCols.length || 1;
        const headCells = visibleCols.map(col => {
          const active = _prodConfig.sortBy === col.id;
          const arrow  = active ? (_prodConfig.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
          const classes = col.sortable
            ? `class="sortable${active ? ' sort-active' : ''}" data-sort="${col.id}" style="cursor:pointer;"`
            : 'class="not-sortable"';
          return `<th ${classes}>${esc(col.label)}${arrow}</th>`;
        }).join('');

        el.innerHTML = `
          <div class="list-page">
            <div class="list-summary">${rows.length} product${rows.length !== 1 ? 's' : ''}${this._filters.search || this._filters.insurer || this._filters.category ? ' (filtered)' : ''}</div>
            <div class="card">
              <div class="table-responsive">
                <table class="table">
                  <thead><tr id="prod-thead-row">${headCells}</tr></thead>
                  <tbody id="prod-tbody">
                    <tr><td colspan="${colCount}" class="table-empty">Loading…</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `;

        // Center-header filter strip — mirrors the Contacts module.
        document.getElementById('products-center-filters')?.remove();
        const topHeader = document.getElementById('top-header');
        if (topHeader) {
          topHeader.style.position = 'relative';
          const insurers   = Array.isArray(options.insurers)         ? options.insurers         : [];
          const categories = Array.isArray(options.product_category) ? options.product_category : [];
          const opt = (val, current) =>
            `<option value="${esc(val)}" ${current === val ? 'selected' : ''}>${esc(val)}</option>`;
          const wrap = document.createElement('div');
          wrap.id = 'products-center-filters';
          wrap.setAttribute('data-header-widget', '1');
          wrap.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;gap:.5rem;align-items:center;z-index:2;background:var(--bg);padding:.3rem .55rem;border-radius:6px;';
          wrap.innerHTML = `
            <input type="search" id="prod-search" class="form-control" placeholder="Search…"
              value="${esc(this._filters.search)}"
              style="${ctrlStyle}width:160px;">
            <select id="prod-filter-insurer" class="form-control" style="${ctrlStyle}max-width:160px;">
              <option value="">Insurer</option>
              ${insurers.map(v => opt(v, this._filters.insurer)).join('')}
            </select>
            <select id="prod-filter-category" class="form-control" style="${ctrlStyle}max-width:160px;">
              <option value="">Category</option>
              ${categories.map(v => opt(v, this._filters.category)).join('')}
            </select>
            <button id="prod-filter-clear" class="btn btn-secondary" style="${ctrlStyle}">Clear</button>`;
          topHeader.appendChild(wrap);
        }

        ViewPrefs.attachButton({
          moduleKey: 'products',
          catalog:   _prodCatalog,
          current:   _prodConfig,
          onChange:  (newCfg) => { _prodConfig = newCfg; Products.list({ embedded }); },
        });

        this._renderTableRows(rows);

        // Wire filter strip
        let searchTimer;
        const searchEl = document.getElementById('prod-search');
        if (searchEl) {
          searchEl.addEventListener('input', e => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
              this._filters.search = e.target.value;
              Products.list({ embedded });
            }, 350);
          });
        }
        const insurerEl  = document.getElementById('prod-filter-insurer');
        const categoryEl = document.getElementById('prod-filter-category');
        if (insurerEl) {
          insurerEl.addEventListener('change', e => {
            this._filters.insurer = e.target.value;
            Products.list({ embedded });
          });
        }
        if (categoryEl) {
          categoryEl.addEventListener('change', e => {
            this._filters.category = e.target.value;
            Products.list({ embedded });
          });
        }
        const clearEl = document.getElementById('prod-filter-clear');
        if (clearEl) {
          clearEl.addEventListener('click', () => {
            this._filters = { search: '', insurer: '', category: '' };
            Products.list({ embedded });
          });
        }

        el.querySelectorAll('#prod-thead-row th.sortable').forEach(th => {
          th.addEventListener('click', async () => {
            const col = th.dataset.sort;
            if (_prodConfig.sortBy === col) {
              _prodConfig.sortDir = _prodConfig.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
              _prodConfig.sortBy = col;
              _prodConfig.sortDir = 'asc';
            }
            try { const r = await Api.viewPrefs.save('products', _prodConfig); _prodConfig = r.config; } catch (_) {}
            Products.list({ embedded });
          });
        });
      } catch (err) {
        el.innerHTML = `<div class="alert alert-danger">Failed to load products: ${esc(err.message)}</div>`;
      }
    },

    _renderTableRows(rows) {
      const tbody = document.getElementById('prod-tbody');
      if (!tbody) return;
      const visibleCols = _prodCatalog ? ViewPrefs.visibleColumns(_prodCatalog, _prodConfig) : [];
      const colCount = visibleCols.length || 1;
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="${colCount}" class="table-empty">No products defined yet.</td></tr>`;
        return;
      }
      tbody.innerHTML = rows.map(r => `<tr>${visibleCols.map(col => {
        const fn = PROD_CELLS[col.id];
        return `<td${col.id === 'actions' ? ' class="actions-cell"' : ''}>${fn ? fn(r) : esc(String(r[col.id] ?? '—'))}</td>`;
      }).join('')}</tr>`).join('');
    },

    async form(id) {
      const isEdit = !!id;
      setHeader(isEdit ? 'Edit Product' : 'New Product', ['Home', 'Admin', 'Products', isEdit ? 'Edit' : 'New']);
      const actions = document.getElementById('header-actions');
      if (actions) actions.innerHTML = '';
      renderInto(`<div class="page-wrapper"><div class="loading-spinner"></div></div>`);

      try {
        const [options, product] = await Promise.all([
          Api.products.options(),
          isEdit ? Api.products.get(id) : Promise.resolve({}),
        ]);

        const parseArr = (v) => { try { return JSON.parse(v) || []; } catch (_) { return []; } };
        const selectedTypes = parseArr(product.target_client_type);
        const selectedAppetites = parseArr(product.suitable_risk_appetite);

        renderInto(`
          <div class="form-page">
            <div class="card">
              <div class="card-header"><h3 class="card-title">${isEdit ? 'Edit Product' : 'New Product'}</h3></div>
              <form id="prod-form" novalidate>
                <fieldset class="form-section">
                  <legend class="form-section-title">Identification</legend>
                  <div class="form-grid form-grid-2">
                    <div class="form-group">
                      <label class="form-label required">Product code</label>
                      <input type="text" class="form-control" name="product_code" value="${esc(product.product_code || '')}" required>
                    </div>
                    <div class="form-group">
                      <label class="form-label required">Insurer</label>
                      <input type="text" class="form-control" name="insurer" value="${esc(product.insurer || '')}" required>
                    </div>
                    <div class="form-group" style="grid-column:1/-1;">
                      <label class="form-label required">Product name</label>
                      <input type="text" class="form-control" name="product_name" value="${esc(product.product_name || '')}" required>
                    </div>
                  </div>
                </fieldset>

                <fieldset class="form-section">
                  <legend class="form-section-title">Category &amp; Status</legend>
                  <div class="form-grid form-grid-2">
                    <div class="form-group">
                      <label class="form-label required">Category</label>
                      <select class="form-control" name="product_category" required>
                        <option value="">— Select category —</option>
                        ${options.product_category.map(c =>
                          `<option value="${esc(c)}" ${product.product_category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Status</label>
                      <select class="form-control" name="product_status">
                        ${options.product_status.map(c =>
                          `<option value="${esc(c)}" ${product.product_status === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
                      </select>
                    </div>
                  </div>
                </fieldset>

                <fieldset class="form-section">
                  <legend class="form-section-title">Target Market (COFI)</legend>
                  <div class="form-group">
                    <label class="form-label">Target client types</label>
                    <div style="display:flex;flex-wrap:wrap;gap:.5rem 1rem;">${options.target_client_type.map(v => `
                      <label style="display:inline-flex;align-items:center;gap:.35rem;font-size:.9rem;">
                        <input type="checkbox" name="target_client_type" value="${esc(v)}" ${selectedTypes.includes(v) ? 'checked' : ''}>
                        ${esc(v)}
                      </label>`).join('')}</div>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Suitable risk appetite</label>
                    <div style="display:flex;flex-wrap:wrap;gap:.5rem 1rem;">${options.suitable_risk_appetite.map(v => `
                      <label style="display:inline-flex;align-items:center;gap:.35rem;font-size:.9rem;">
                        <input type="checkbox" name="suitable_risk_appetite" value="${esc(v)}" ${selectedAppetites.includes(v) ? 'checked' : ''}>
                        ${esc(v)}
                      </label>`).join('')}</div>
                  </div>
                  <div class="form-grid form-grid-2">
                    <div class="form-group">
                      <label class="form-label">Min insurable value (R)</label>
                      <input type="number" class="form-control" name="min_insurable_value" value="${esc(product.min_insurable_value || '')}">
                    </div>
                    <div class="form-group">
                      <label class="form-label">Max insurable value (R)</label>
                      <input type="number" class="form-control" name="max_insurable_value" value="${esc(product.max_insurable_value || '')}">
                    </div>
                    <div class="form-group" style="grid-column:1/-1;">
                      <label class="form-label">Geographic scope</label>
                      <select class="form-control" name="geographic_scope">
                        <option value="">— Select geographic scope —</option>
                        ${options.geographic_scope.map(c =>
                          `<option value="${esc(c)}" ${product.geographic_scope === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
                      </select>
                    </div>
                  </div>
                </fieldset>
              <div class="form-group">
                <fieldset class="form-section">
                  <legend class="form-section-title">Disclosures &amp; Notes</legend>
                  <div class="form-group">
                    <label class="form-label">Key exclusions summary</label>
                    <textarea class="form-control" name="key_exclusions_summary" rows="3">${esc(product.key_exclusions_summary || '')}</textarea>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Internal notes</label>
                    <textarea class="form-control" name="notes" rows="2">${esc(product.notes || '')}</textarea>
                  </div>
                </fieldset>

                <div class="form-actions">
                  <button type="submit" class="btn btn-primary">${isEdit ? 'Save changes' : 'Create Product'}</button>
                  <a href="#/products" class="btn btn-secondary">Cancel</a>
                </div>
              </form>
            </div>
          </div>
        `);

        document.getElementById('prod-form').addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.target);
          const payload = {
            target_client_type: fd.getAll('target_client_type'),
            suitable_risk_appetite: fd.getAll('suitable_risk_appetite'),
          };
          for (const [k, v] of fd.entries()) {
            if (k === 'target_client_type' || k === 'suitable_risk_appetite') continue;
            payload[k] = v;
          }
          try {
            if (isEdit) await Api.products.update(id, payload);
            else await Api.products.create(payload);
            toast('Product saved', 'success');
            navigate('products');
          } catch (err) { toast(err.message, 'error'); }
        });
      } catch (err) {
        renderInto(`<div class="alert alert-danger">${esc(err.message)}</div>`);
      }
    }
  };

  // ═════════════════════════════════════════════════════════════
  // Post-Sale Events
  // ═════════════════════════════════════════════════════════════
  const PostSaleEvents = {
    async list() {
      setHeader('Post-Sale Events', ['Home', 'Compliance', 'Post-Sale Events']);
      const actions = document.getElementById('header-actions');
      if (actions) actions.innerHTML = `<button id="new-pse" class="btn btn-primary">+ Log event</button>`;
      renderInto(`<div class="page-wrapper"><div class="loading-spinner"></div></div>`);

      try {
        const rows = await Api.postSaleEvents.list();
        const canDelete = window.currentUser?.role === 'admin';
        renderInto(this._listTemplate(rows, canDelete));
        document.getElementById('new-pse').addEventListener('click', () => this.form());
        document.querySelectorAll('[data-pse-edit]').forEach(b =>
          b.addEventListener('click', () => this.form(b.dataset.pseEdit)));
        if (canDelete) {
          document.querySelectorAll('[data-pse-delete]').forEach(b =>
            b.addEventListener('click', async () => {
              if (!confirm('Delete this post-sale event? This cannot be undone.')) return;
              try {
                await Api.postSaleEvents.delete(b.dataset.pseDelete);
                toast('Event deleted', 'success');
                this.list();
              } catch (err) { toast(err.message, 'error'); }
            }));
        }
      } catch (err) {
        renderInto(`<div class="alert alert-danger">${esc(err.message)}</div>`);
      }
    },

    _listTemplate(rows, canDelete = false) {
      return `
        <div class="page-wrapper">
          <div class="card" style="padding:1rem;">
            <table style="width:100%;font-size:.9rem;">
              <thead>
                <tr><th style="text-align:left;">Date</th><th>Type</th><th>Policy</th><th>Client</th><th>Outcome</th><th>Days</th><th>Barrier</th><th></th></tr>
              </thead>
              <tbody>
                ${rows.map(r => `
                  <tr style="${r.barrier_flagged ? 'background:#fff4e5;' : ''}">
                    <td>${esc(r.event_date)}</td>
                    <td>${esc(r.event_type)}</td>
                    <td>${esc(r.policy_number || r.policy_name || '—')}</td>
                    <td>${esc(r.contact_name || r.account_name || '—')}</td>
                    <td>${esc(r.outcome || '—')}</td>
                    <td>${r.days_to_action != null ? r.days_to_action : '—'}</td>
                    <td>${r.barrier_flagged ? '<span style="color:#c0392b;font-weight:600;">⚠ Yes</span>' : 'No'}</td>
                    <td style="white-space:nowrap;">
                      <button class="btn btn-link" data-pse-edit="${r.id}">Edit</button>
                      ${canDelete ? `<button class="btn btn-xs btn-danger" data-pse-delete="${r.id}">Delete</button>` : ''}
                    </td>
                  </tr>
                `).join('') || '<tr><td colspan="8" style="color:#888;">No events logged.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      `;
    },

    async form(id) {
      const isEdit = !!id;
      const canDelete = window.currentUser?.role === 'admin';
      setHeader(isEdit ? 'Edit Post-Sale Event' : 'New Post-Sale Event', ['Home', 'Compliance', 'Post-Sale Events', isEdit ? 'Edit' : 'New']);
      renderInto(`<div class="page-wrapper"><div class="loading-spinner"></div></div>`);

      try {
        const [opts, event, policies] = await Promise.all([
          Api.postSaleEvents.options(),
          isEdit ? Api.postSaleEvents.get(id) : Promise.resolve({}),
          Api.policies.list({ limit: 500 }).then(r => r.data || r).catch(() => []),
        ]);

        const polOpts = policies.map(p =>
          `<option value="${esc(p.id)}" ${String(p.id) === String(event.policy_id) ? 'selected' : ''}>${esc(p.policy_name || p.policy_number)}</option>`).join('');

        const dd = (name, values, selected) => `
          <select name="${name}" class="form-control">
            <option value="">—</option>
            ${values.map(v => `<option value="${esc(v)}" ${selected === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
          </select>`;

        renderInto(`
          <div class="page-wrapper" style="max-width:800px;">
            <a href="#/post-sale-events" class="btn-back">← Back</a>
            <form id="pse-form" class="card" style="padding:1.25rem;margin-top:.5rem;">
              <div class="form-group">
                <label class="form-label required">Policy</label>
                <select class="form-control" name="policy_id" required>
                  <option value="">— Select policy —</option>
                  ${polOpts}
                </select>
              </div>
              <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group">
                  <label class="form-label required">Event type</label>
                  ${dd('event_type', opts.event_type, event.event_type)}
                </div>
                <div class="form-group">
                  <label class="form-label required">Event date</label>
                  <input type="date" class="form-control" name="event_date" value="${esc(event.event_date || new Date().toISOString().slice(0,10))}" required>
                </div>
              </div>
              <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group">
                  <label class="form-label">Request method</label>
                  ${dd('request_method', opts.request_method, event.request_method)}
                </div>
                <div class="form-group">
                  <label class="form-label">Date actioned</label>
                  <input type="date" class="form-control" name="date_actioned" value="${esc(event.date_actioned || '')}">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Outcome</label>
                ${dd('outcome', opts.outcome, event.outcome)}
              </div>
              <div class="form-group">
                <label class="form-label">Outcome notes</label>
                <textarea class="form-control" name="outcome_notes" rows="2">${esc(event.outcome_notes || '')}</textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Refusal reason (if refused)</label>
                <input type="text" class="form-control" name="refusal_reason" value="${esc(event.refusal_reason || '')}">
              </div>
              <div class="form-group">
                <label class="form-label">Lapse reason (if policy lapse)</label>
                ${dd('lapse_reason', opts.lapse_reason, event.lapse_reason)}
              </div>
              <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group">
                  <label class="form-label">Switch from insurer</label>
                  <input type="text" class="form-control" name="switch_from_insurer" value="${esc(event.switch_from_insurer || '')}">
                </div>
                <div class="form-group">
                  <label class="form-label">Switch to insurer</label>
                  <input type="text" class="form-control" name="switch_to_insurer" value="${esc(event.switch_to_insurer || '')}">
                </div>
              </div>
              <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group">
                  <label class="form-label">Client notification date</label>
                  <input type="date" class="form-control" name="client_notification_date" value="${esc(event.client_notification_date || '')}">
                </div>
                <div class="form-group">
                  <label class="form-label">Notification method</label>
                  ${dd('client_notification_method', opts.client_notification_method, event.client_notification_method)}
                </div>
              </div>
              <div style="display:flex;gap:.5rem;align-items:center;">
                <button type="submit" class="btn btn-primary">Save event</button>
                ${isEdit && canDelete ? '<button type="button" class="btn btn-danger" id="pse-delete-btn" style="margin-left:auto;">Delete event</button>' : ''}
              </div>
            </form>
          </div>
        `);

        document.getElementById('pse-form').addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.target);
          const payload = Object.fromEntries(fd.entries());
          try {
            if (isEdit) await Api.postSaleEvents.update(id, payload);
            else await Api.postSaleEvents.create(payload);
            toast('Event saved', 'success');
            navigate('post-sale-events');
          } catch (err) { toast(err.message, 'error'); }
        });
        if (isEdit && canDelete) {
          document.getElementById('pse-delete-btn')?.addEventListener('click', async () => {
            if (!confirm('Delete this post-sale event? This cannot be undone.')) return;
            try {
              await Api.postSaleEvents.delete(id);
              toast('Event deleted', 'success');
              navigate('post-sale-events');
            } catch (err) { toast(err.message, 'error'); }
          });
        }
      } catch (err) {
        renderInto(`<div class="alert alert-danger">${esc(err.message)}</div>`);
      }
    }
  };

  // ═════════════════════════════════════════════════════════════
  // Commission Log
  // ═════════════════════════════════════════════════════════════
  const CommissionLog = {
    async list() {
      setHeader('Commission Log', ['Home', 'Compliance', 'Commission Log']);
      const actions = document.getElementById('header-actions');
      if (actions) actions.innerHTML = `<button id="new-cl" class="btn btn-primary">+ New entry</button>`;
      renderInto(`<div class="page-wrapper"><div class="loading-spinner"></div></div>`);

      try {
        const rows = await Api.commissionLog.list();
        renderInto(this._listTemplate(rows));
        document.getElementById('new-cl').addEventListener('click', () => this.form());
        document.querySelectorAll('[data-cl-edit]').forEach(b =>
          b.addEventListener('click', () => this.form(b.dataset.clEdit)));
      } catch (err) {
        renderInto(`<div class="alert alert-danger">${esc(err.message)}</div>`);
      }
    },

    _listTemplate(rows) {
      return `
        <div class="page-wrapper">
          <div class="card" style="padding:1rem;">
            <table style="width:100%;font-size:.9rem;">
              <thead>
                <tr><th style="text-align:left;">Policy</th><th>Type</th><th>Rate</th><th>Amount</th><th>Disclosed in ROA</th><th>Compliance</th><th></th></tr>
              </thead>
              <tbody>
                ${rows.map(r => {
                  const compColor = r.remuneration_compliant === 'Compliant' ? '#1a7a3a' : r.remuneration_compliant === 'Review required' ? '#b78105' : '#c0392b';
                  return `
                  <tr>
                    <td>${esc(r.policy_number || r.policy_name || '—')}</td>
                    <td>${esc(r.commission_type || '—')}</td>
                    <td>${r.commission_rate != null ? r.commission_rate + '%' : '—'}</td>
                    <td>${r.commission_amount != null ? 'R ' + Number(r.commission_amount).toLocaleString('en-ZA', {minimumFractionDigits:2}) : '—'}</td>
                    <td>${r.disclosed_in_roa ? '✓ ' + esc(r.advice_record_number || '') : '—'}</td>
                    <td style="color:${compColor};font-weight:600;">${esc(r.remuneration_compliant || '—')}</td>
                    <td><button class="btn btn-link" data-cl-edit="${r.id}">Edit</button></td>
                  </tr>`;
                }).join('') || '<tr><td colspan="7" style="color:#888;">No commission entries.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>`;
    },

    async form(id) {
      const isEdit = !!id;
      setHeader(isEdit ? 'Edit Commission' : 'New Commission', ['Home', 'Compliance', 'Commission', isEdit ? 'Edit' : 'New']);
      renderInto(`<div class="page-wrapper"><div class="loading-spinner"></div></div>`);

      try {
        const [opts, entry, policies] = await Promise.all([
          Api.commissionLog.options(),
          isEdit ? Api.commissionLog.get(id) : Promise.resolve({}),
          Api.policies.list({ limit: 500 }).then(r => r.data || r).catch(() => []),
        ]);

        const polOpts = policies.map(p =>
          `<option value="${esc(p.id)}" ${String(p.id) === String(entry.policy_id) ? 'selected' : ''}>${esc(p.policy_name || p.policy_number)} (R ${Number(p.premium || 0).toLocaleString('en-ZA')})</option>`).join('');

        const dd = (name, values, selected) => `
          <select name="${name}" class="form-control">
            <option value="">—</option>
            ${values.map(v => `<option value="${esc(v)}" ${selected === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
          </select>`;

        renderInto(`
          <div class="page-wrapper" style="max-width:700px;">
            <a href="#/commission-log" class="btn-back">← Back</a>
            <form id="cl-form" class="card" style="padding:1.25rem;margin-top:.5rem;">
              <div class="form-group">
                <label class="form-label required">Policy</label>
                <select class="form-control" name="policy_id" required ${isEdit ? 'disabled' : ''}>
                  <option value="">— Select policy —</option>
                  ${polOpts}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label required">Commission type</label>
                ${dd('commission_type', opts.commission_type, entry.commission_type)}
              </div>
              <div class="form-group">
                <label class="form-label">Commission rate (%)</label>
                <input type="number" step="0.01" class="form-control" name="commission_rate" value="${esc(entry.commission_rate || '')}" placeholder="e.g. 12.5">
              </div>
              <div class="form-group">
                <label class="form-label">Insurer arrangement</label>
                ${dd('insurer_arrangement', opts.insurer_arrangement, entry.insurer_arrangement)}
              </div>
              <div class="form-group">
                <label class="form-label">Volume override details (if applicable)</label>
                <textarea class="form-control" name="volume_override_details" rows="2">${esc(entry.volume_override_details || '')}</textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Notes</label>
                <textarea class="form-control" name="notes" rows="2">${esc(entry.notes || '')}</textarea>
              </div>
              <button type="submit" class="btn btn-primary">Save</button>
            </form>
          </div>
        `);

        document.getElementById('cl-form').addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.target);
          const payload = Object.fromEntries(fd.entries());
          try {
            if (isEdit) await Api.commissionLog.update(id, payload);
            else await Api.commissionLog.create(payload);
            toast('Commission entry saved', 'success');
            navigate('commission-log');
          } catch (err) { toast(err.message, 'error'); }
        });
      } catch (err) {
        renderInto(`<div class="alert alert-danger">${esc(err.message)}</div>`);
      }
    }
  };

  // ═════════════════════════════════════════════════════════════
  // Data Breach Log
  // ═════════════════════════════════════════════════════════════
  // Data breach cell renderers
  const DB_CELLS = {
    breach_date:                    (r) => esc(r.breach_date || '—'),
    discovered_date:                (r) => esc(r.discovered_date || '—'),
    nature:                         (r) => esc(r.nature || '—'),
    status:                         (r) => {
      const col = r.status === 'Resolved' || r.status === 'Closed' ? '#1a7a3a' : r.status === 'Open' ? '#c0392b' : '#b78105';
      return `<span style="color:${col};font-weight:500;">${esc(r.status || '—')}</span>`;
    },
    information_regulator_notified: (r) => r.information_regulator_notified
      ? `✓ ${esc(r.regulator_notified_date || '')}`
      : '<span style="color:#c0392b;">⚠ Pending immediate notice</span>',
    regulator_notified_date:        (r) => r.regulator_notified_date ? esc(r.regulator_notified_date) : '—',
    data_subjects_notified:         (r) => r.data_subjects_notified ? '✓' : '—',
    logged_by_name:                 (r) => esc(r.logged_by_name || '—'),
    created_at:                     (r) => r.created_at ? esc(String(r.created_at).slice(0, 10)) : '—',
    actions:                        (r) => `<button class="btn btn-sm btn-outline" data-breach-edit="${r.id}">View</button>`,
  };

  let _dbCatalog = null;
  let _dbConfig  = null;

  const DataBreaches = {
    async list(opts = {}) {
      const embedded = !!opts.embedded;
      const el = document.getElementById(embedded ? 'admin-content' : 'content-area');
      if (!el) return;
      el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
      if (!embedded) {
        setPageTitle('Data Breach Log');
        setBreadcrumb(['Admin', 'Data Breaches']);
      }

      const ctrlStyle = 'height:28px;padding:.15rem .4rem;font-size:.78rem;line-height:1;';
      const headerActions = document.getElementById('header-actions');
      if (headerActions) {
        headerActions.innerHTML = `<button id="new-db" class="btn btn-primary" style="${ctrlStyle}">+ Log breach</button>`;
      }

      try {
        const prefs = await ViewPrefs.load('data_breaches');
        _dbCatalog = prefs.catalog;
        _dbConfig  = prefs.config;

        const rows = await Api.popia.listBreaches();

        const visibleCols = ViewPrefs.visibleColumns(_dbCatalog, _dbConfig);
        const colCount = visibleCols.length || 1;
        const headCells = visibleCols.map(col => {
          const active = _dbConfig.sortBy === col.id;
          const arrow  = active ? (_dbConfig.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
          const classes = col.sortable
            ? `class="sortable${active ? ' sort-active' : ''}" data-sort="${col.id}" style="cursor:pointer;"`
            : 'class="not-sortable"';
          return `<th ${classes}>${esc(col.label)}${arrow}</th>`;
        }).join('');

        el.innerHTML = `
          <div class="list-page">
            <div class="alert alert-info" style="margin-bottom:1rem;">
              POPIA s22: The Information Regulator must be notified <strong>immediately after discovering a breach</strong>.
              Affected data subjects must be notified without undue delay.
            </div>
            <div class="card">
              <div class="table-responsive">
                <table class="table">
                  <thead><tr id="db-thead-row">${headCells}</tr></thead>
                  <tbody id="db-tbody">
                    <tr><td colspan="${colCount}" class="table-empty">Loading…</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `;

        ViewPrefs.attachButton({
          moduleKey: 'data_breaches',
          catalog:   _dbCatalog,
          current:   _dbConfig,
          onChange:  (newCfg) => { _dbConfig = newCfg; DataBreaches.list({ embedded }); },
        });

        this._renderTableRows(rows);

        // Wire View → edit modal. Each cell is rendered with
        // data-breach-edit="<id>" via DB_CELLS.actions.
        el.querySelectorAll('[data-breach-edit]').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.breachEdit, 10);
            if (id) DataBreaches._openEditModal(id, { embedded });
          });
        });

        document.getElementById('new-db')?.addEventListener('click', () => {
          DataBreaches._openBreachModal({ embedded });
        });

        el.querySelectorAll('#db-thead-row th.sortable').forEach(th => {
          th.addEventListener('click', async () => {
            const col = th.dataset.sort;
            if (_dbConfig.sortBy === col) {
              _dbConfig.sortDir = _dbConfig.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
              _dbConfig.sortBy = col;
              _dbConfig.sortDir = 'asc';
            }
            try { const r = await Api.viewPrefs.save('data_breaches', _dbConfig); _dbConfig = r.config; } catch (_) {}
            DataBreaches.list({ embedded });
          });
        });
      } catch (err) {
        el.innerHTML = `<div class="alert alert-danger">Failed to load breach log: ${esc(err.message)}</div>`;
      }
    },

    _recipientKey(r) {
      return `${r.type}:${r.id}`;
    },

    _recipientLabel(r) {
      const type = r.type === 'account' ? 'Account' : r.type === 'user' ? 'User' : 'Contact';
      const secondary = r.secondary ? ` - ${esc(r.secondary)}` : '';
      const email = r.email ? ` - ${esc(r.email)}` : '';
      return `<strong>${esc(r.name || r.email || '')}</strong> <span style="color:#777;">${type}${secondary}${email}</span>`;
    },

    _recipientSelection(container) {
      return container._breachRecipients || { all_contacts: false, all_accounts: false, all_users: false, selected: [] };
    },

    _renderRecipientPicker(container) {
      const state = DataBreaches._recipientSelection(container);
      const selectedEl = container.querySelector('#db-selected-recipients');
      const bulkEl = container.querySelector('#db-bulk-summary');
      if (bulkEl) {
        const parts = [];
        if (state.all_contacts) parts.push('All contacts');
        if (state.all_accounts) parts.push('All accounts');
        if (state.all_users) parts.push('All users');
        bulkEl.innerHTML = parts.length
          ? parts.map(p => `<span style="display:inline-flex;align-items:center;gap:.35rem;background:#eaf2fb;color:#1a5276;border-radius:999px;padding:.2rem .55rem;margin:.15rem;">${esc(p)}</span>`).join('')
          : '<span style="color:#777;">No bulk groups selected.</span>';
      }
      if (!selectedEl) return;
      selectedEl.innerHTML = state.selected.length
        ? state.selected.map(r => `
            <span style="display:inline-flex;align-items:center;gap:.35rem;background:#f4f6f8;border:1px solid #d9e1e8;border-radius:999px;padding:.2rem .55rem;margin:.15rem;">
              ${DataBreaches._recipientLabel(r)}
              <button type="button" class="btn btn-sm btn-outline" data-db-recipient-remove="${esc(DataBreaches._recipientKey(r))}" style="padding:0 .35rem;line-height:1.2;">x</button>
            </span>`).join('')
        : '<span style="color:#777;">No individual recipients selected.</span>';
    },

    _addRecipient(container, recipient) {
      const state = DataBreaches._recipientSelection(container);
      const key = DataBreaches._recipientKey(recipient);
      if (!state.selected.some(r => DataBreaches._recipientKey(r) === key)) {
        state.selected.push(recipient);
      }
      container._breachRecipients = state;
      DataBreaches._renderRecipientPicker(container);
    },

    async _searchRecipients(container) {
      const q = container.querySelector('#db-recipient-search')?.value?.trim();
      const resultsEl = container.querySelector('#db-recipient-results');
      if (!resultsEl) return;
      if (!q || q.length < 2) {
        resultsEl.innerHTML = '<div style="font-size:.8rem;color:#777;padding:.35rem 0;">Type at least 2 characters to search contacts, accounts and users.</div>';
        return;
      }
      resultsEl.innerHTML = '<div style="font-size:.8rem;color:#777;padding:.35rem 0;">Searching...</div>';
      try {
        const data = await Api.popia.breachRecipients({ search: q, limit: 8 });
        const results = data.results || [];
        resultsEl.innerHTML = results.length
          ? results.map(r => `
              <button type="button" class="btn btn-outline" data-db-recipient-add="${esc(r.type)}:${esc(String(r.id))}"
                      style="display:block;width:100%;text-align:left;margin:.25rem 0;padding:.4rem .55rem;">
                ${DataBreaches._recipientLabel(r)}
              </button>`).join('')
          : '<div style="font-size:.8rem;color:#777;padding:.35rem 0;">No matching email-enabled recipients found.</div>';
        resultsEl.querySelectorAll('[data-db-recipient-add]').forEach(btn => {
          btn.addEventListener('click', () => {
            const [type, id] = btn.dataset.dbRecipientAdd.split(':');
            const found = results.find(r => r.type === type && String(r.id) === String(id));
            if (found) DataBreaches._addRecipient(container, found);
          });
        });
      } catch (err) {
        resultsEl.innerHTML = `<div class="alert alert-danger">Recipient search failed: ${esc(err.message || err)}</div>`;
      }
    },

    _openBreachModal(opts = {}) {
      const embedded = !!opts.embedded;
      const today = new Date().toISOString().slice(0, 10);
      const container = document.createElement('div');
      container.id = 'db-breach-modal-container';
      container.innerHTML = `
        <div class="modal-overlay" id="db-breach-modal"
             style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;">
          <div class="modal" style="background:var(--card-bg);color:var(--text);border:1px solid var(--border);border-radius:8px;width:720px;max-width:94vw;max-height:90vh;overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,0.2);">
            <div class="modal-header" style="padding:1rem 1.25rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;">Log new data breach</h3>
              <button type="button" class="btn-close" id="db-modal-close"
                      class="modal-close">×</button>
            </div>
            <div class="modal-body" style="padding:1.25rem;">
              <div id="db-modal-error" class="alert alert-danger" style="display:none;margin-bottom:.75rem;"></div>
              <div class="form-grid form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group">
                  <label class="form-label required">Date of breach</label>
                  <input type="date" id="db-breach-date" class="form-control" value="${today}" required>
                </div>
                <div class="form-group">
                  <label class="form-label required">Date discovered</label>
                  <input type="date" id="db-discovered-date" class="form-control" value="${today}" required>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label required">Nature of breach</label>
                <textarea id="db-nature" class="form-control" rows="2" placeholder="Brief description of what happened" required></textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Data affected</label>
                <textarea id="db-data-affected" class="form-control" rows="2" placeholder="Which data categories were affected (ID numbers, contact details, etc.)"></textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Remediation steps</label>
                <textarea id="db-remediation" class="form-control" rows="2" placeholder="Immediate actions taken or planned"></textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Status</label>
                <select id="db-status" class="form-control">
                  <option value="Open" selected>Open</option>
                  <option value="Under Investigation">Investigating</option>
                  <option value="Resolved">Resolved</option>
                </select>
              </div>
              <fieldset style="border:1px solid var(--border);border-radius:6px;padding:.75rem 1rem;margin-top:.5rem;">
                <legend style="font-size:.8rem;color:var(--text-light);padding:0 .35rem;">Affected recipients</legend>
                <label style="display:flex;align-items:center;gap:.5rem;font-size:.85rem;margin-bottom:.5rem;">
                  <input type="checkbox" id="db-notify-recipients" checked>
                  Email selected recipients when the breach is logged
                </label>
                <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.5rem;">
                  <button type="button" class="btn btn-sm btn-outline" data-db-bulk="all_contacts">Select all contacts</button>
                  <button type="button" class="btn btn-sm btn-outline" data-db-bulk="all_accounts">Select all accounts</button>
                  <button type="button" class="btn btn-sm btn-outline" data-db-bulk="all_users">Select all users</button>
                </div>
                <div id="db-bulk-summary" style="margin-bottom:.45rem;"></div>
                <input type="search" id="db-recipient-search" class="form-control" placeholder="Search contacts, accounts or users by name or email">
                <div id="db-recipient-results" style="margin-top:.35rem;"></div>
                <div style="margin-top:.5rem;font-size:.8rem;color:var(--text-light);">Individual recipients</div>
                <div id="db-selected-recipients" style="margin-top:.2rem;"></div>
              </fieldset>
              <div class="alert alert-info" style="margin-top:.5rem;font-size:.82rem;">
                POPIA s22: the Information Regulator must be notified immediately after discovering a breach.
              </div>
            </div>
            <div class="modal-footer" style="padding:1rem 1.25rem;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:.5rem;">
              <button type="button" class="btn btn-secondary" id="db-modal-cancel">Cancel</button>
              <button type="button" class="btn btn-primary" id="db-modal-save">Log breach</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(container);

      const close = () => container.remove();
      container.querySelector('#db-breach-modal').addEventListener('click', (e) => {
        /* click-outside-to-close disabled */ void e;
      });
      container.querySelector('#db-modal-close').addEventListener('click', close);
      container.querySelector('#db-modal-cancel').addEventListener('click', close);
      container.querySelectorAll('[data-db-bulk]').forEach(btn => {
        btn.addEventListener('click', () => {
          const state = DataBreaches._recipientSelection(container);
          const key = btn.dataset.dbBulk;
          state[key] = !state[key];
          btn.classList.toggle('btn-primary', state[key]);
          btn.classList.toggle('btn-outline', !state[key]);
          container._breachRecipients = state;
          DataBreaches._renderRecipientPicker(container);
        });
      });
      let searchTimer = null;
      container.querySelector('#db-recipient-search')?.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => DataBreaches._searchRecipients(container), 250);
      });
      container.querySelector('#db-selected-recipients')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-db-recipient-remove]');
        if (!btn) return;
        const state = DataBreaches._recipientSelection(container);
        state.selected = state.selected.filter(r => DataBreaches._recipientKey(r) !== btn.dataset.dbRecipientRemove);
        container._breachRecipients = state;
        DataBreaches._renderRecipientPicker(container);
      });

      container.querySelector('#db-modal-save').addEventListener('click', async () => {
        const breachDate      = container.querySelector('#db-breach-date').value;
        const discoveredDate  = container.querySelector('#db-discovered-date').value;
        const nature          = container.querySelector('#db-nature').value.trim();
        const dataAffected    = container.querySelector('#db-data-affected').value.trim();
        const remediation     = container.querySelector('#db-remediation').value.trim();
        const status          = container.querySelector('#db-status').value;
        const errEl           = container.querySelector('#db-modal-error');

        if (!breachDate || !discoveredDate || !nature) {
          errEl.textContent = 'Date of breach, date discovered and nature are required.';
          errEl.style.display = 'block';
          return;
        }

        try {
          const created = await Api.popia.createBreach({
            breach_date: breachDate,
            discovered_date: discoveredDate,
            nature,
            data_affected: dataAffected || null,
            remediation: remediation || null,
            status,
            recipient_selection: DataBreaches._recipientSelection(container),
            notify_recipients: container.querySelector('#db-notify-recipients')?.checked ? 1 : 0,
          });
          close();
          const summary = created?.email_summary;
          const suffix = summary ? ` Emails sent ${summary.sent}/${summary.attempted}.` : '';
          toast(`Breach logged. Immediate regulator notification required.${suffix}`, 'success');
          DataBreaches.list({ embedded });
        } catch (e) {
          errEl.textContent = e.message || String(e);
          errEl.style.display = 'block';
        }
      });
    },

    async _openEditModal(id, opts = {}) {
      const embedded = !!opts.embedded;
      let breach;
      try {
        breach = await Api.popia.getBreach(id);
      } catch (err) {
        toast(`Failed to load breach: ${err.message || err}`, 'error');
        return;
      }
      const _val = (v) => v == null ? '' : String(v);
      const today = new Date().toISOString().slice(0, 10);
      const container = document.createElement('div');
      container.id = 'db-edit-modal-container';
      container.innerHTML = `
        <div class="modal-overlay" id="db-edit-modal"
             style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;">
          <div class="modal" style="background:#fff;border-radius:8px;width:640px;max-width:94vw;max-height:90vh;overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,0.2);">
            <div class="modal-header" style="padding:1rem 1.25rem;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;">Data breach #${esc(String(id))}</h3>
              <button type="button" class="btn-close" id="db-edit-close"
                      class="modal-close">×</button>
            </div>
            <div class="modal-body" style="padding:1.25rem;">
              <div id="db-edit-error" class="alert alert-danger" style="display:none;margin-bottom:.75rem;"></div>
              <div class="form-grid form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group">
                  <label class="form-label required">Date of breach</label>
                  <input type="date" id="dbe-breach-date" class="form-control" value="${esc(_val(breach.breach_date).slice(0, 10))}" required>
                </div>
                <div class="form-group">
                  <label class="form-label required">Date discovered</label>
                  <input type="date" id="dbe-discovered-date" class="form-control" value="${esc(_val(breach.discovered_date).slice(0, 10))}" required>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label required">Status</label>
                <select id="dbe-status" class="form-control">
                  <option value="Open"          ${breach.status === 'Open'          ? 'selected' : ''}>Open / Logged</option>
                  <option value="Under Investigation" ${breach.status === 'Under Investigation' || breach.status === 'Investigating' ? 'selected' : ''}>Investigating</option>
                  <option value="Resolved"      ${breach.status === 'Resolved' || breach.status === 'Completed' ? 'selected' : ''}>Completed / Resolved</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label required">Nature of breach</label>
                <textarea id="dbe-nature" class="form-control" rows="2" required>${esc(_val(breach.nature))}</textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Data affected</label>
                <textarea id="dbe-data-affected" class="form-control" rows="2">${esc(_val(breach.data_affected))}</textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Remediation steps</label>
                <textarea id="dbe-remediation" class="form-control" rows="3">${esc(_val(breach.remediation))}</textarea>
              </div>
              <fieldset style="border:1px solid #e5e7eb;border-radius:6px;padding:.6rem 1rem;margin-top:.5rem;">
                <legend style="font-size:.8rem;color:#555;padding:0 .35rem;">POPIA s22 — notifications</legend>
                <div class="form-grid form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                  <div class="form-group">
                    <label style="display:flex;align-items:center;gap:.5rem;font-size:.85rem;">
                      <input type="checkbox" id="dbe-regulator-notified" ${breach.information_regulator_notified ? 'checked' : ''}>
                      Information Regulator notified
                    </label>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Regulator notified date</label>
                    <input type="date" id="dbe-regulator-date" class="form-control" value="${esc(_val(breach.regulator_notified_date).slice(0, 10))}">
                  </div>
                  <div class="form-group">
                    <label style="display:flex;align-items:center;gap:.5rem;font-size:.85rem;">
                      <input type="checkbox" id="dbe-subjects-notified" ${breach.data_subjects_notified ? 'checked' : ''}>
                      Affected data subjects notified
                    </label>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Subjects notified date</label>
                    <input type="date" id="dbe-subjects-date" class="form-control" value="${esc(_val(breach.subjects_notified_date).slice(0, 10))}">
                  </div>
                </div>
              </fieldset>
              <div style="margin-top:.65rem;font-size:.75rem;color:#777;">
                Logged by ${esc(breach.logged_by_name || '—')} ·
                ${esc(_val(breach.created_at).slice(0, 16).replace('T', ' '))}
              </div>
            </div>
            <div class="modal-footer" style="padding:1rem 1.25rem;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:.5rem;">
              <button type="button" class="btn btn-secondary" id="db-edit-cancel">Cancel</button>
              <button type="button" class="btn btn-primary"   id="db-edit-save">Save changes</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(container);

      const close = () => container.remove();
      container.querySelector('#db-edit-modal').addEventListener('click', (e) => {
        /* click-outside-to-close disabled */ void e;
      });
      container.querySelector('#db-edit-close').addEventListener('click', close);
      container.querySelector('#db-edit-cancel').addEventListener('click', close);

      container.querySelector('#db-edit-save').addEventListener('click', async () => {
        const errEl = container.querySelector('#db-edit-error');
        const payload = {
          breach_date:                    container.querySelector('#dbe-breach-date').value,
          discovered_date:                container.querySelector('#dbe-discovered-date').value,
          status:                         container.querySelector('#dbe-status').value,
          nature:                         container.querySelector('#dbe-nature').value.trim(),
          data_affected:                  container.querySelector('#dbe-data-affected').value.trim() || null,
          remediation:                    container.querySelector('#dbe-remediation').value.trim() || null,
          information_regulator_notified: container.querySelector('#dbe-regulator-notified').checked ? 1 : 0,
          regulator_notified_date:        container.querySelector('#dbe-regulator-date').value || null,
          data_subjects_notified:         container.querySelector('#dbe-subjects-notified').checked ? 1 : 0,
          subjects_notified_date:         container.querySelector('#dbe-subjects-date').value || null,
        };
        if (!payload.breach_date || !payload.discovered_date || !payload.nature) {
          errEl.textContent = 'Date of breach, date discovered and nature are required.';
          errEl.style.display = 'block';
          return;
        }
        try {
          await Api.popia.updateBreach(id, payload);
          close();
          toast('Breach updated.', 'success');
          DataBreaches.list({ embedded });
        } catch (e) {
          errEl.textContent = e.message || String(e);
          errEl.style.display = 'block';
        }
      });
    },

    _renderTableRows(rows) {
      const tbody = document.getElementById('db-tbody');
      if (!tbody) return;
      const visibleCols = _dbCatalog ? ViewPrefs.visibleColumns(_dbCatalog, _dbConfig) : [];
      const colCount = visibleCols.length || 1;
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="${colCount}" class="table-empty">No breaches logged. Click "+ Log breach" if you need to record one.</td></tr>`;
        return;
      }
      tbody.innerHTML = rows.map(r => `<tr>${visibleCols.map(col => {
        const fn = DB_CELLS[col.id];
        return `<td${col.id === 'actions' ? ' class="actions-cell"' : ''}>${fn ? fn(r) : esc(String(r[col.id] ?? '—'))}</td>`;
      }).join('')}</tr>`).join('');
    }
  };

  // ═════════════════════════════════════════════════════════════
  // POPIA module (standalone, one record per contact + account)
  // ═════════════════════════════════════════════════════════════
  function _popiaHref(r) {
    return r.kind === 'account' ? `#/accounts/${r.id}` : `#/popia/${r.id}`;
  }
  const POPIA_CELLS = {
    name:                     (r) => `<a href="${_popiaHref(r)}"><strong>${esc(r.display_name || ((r.first_name || '') + ' ' + (r.last_name || '')).trim() || '(unnamed)')}</strong></a> ${r.kind === 'account' ? '<span style="font-size:.7rem;background:#eaf2fb;color:#1a73e8;padding:.05rem .4rem;border-radius:999px;margin-left:.25rem;">Account</span>' : ''}`,
    status_badge:             (r) => badgeForPopia(r.status_badge || 'Red'),
    data_processing_basis:    (r) => esc(r.data_processing_basis || '—'),
    popia_consent_date:       (r) => esc(r.popia_consent_date || '—'),
    consent_method:           (r) => esc(r.consent_method || '—'),
    information_officer_name: (r) => esc(r.information_officer_name || '—'),
    retention_expiry_date:    (r) => esc(r.retention_expiry_date || '—'),
    direct_marketing_consent: (r) => r.direct_marketing_consent ? 'Yes' : 'No',
    third_party_sharing:      (r) => r.third_party_sharing ? 'Yes' : 'No',
    privacy_notice_provided:  (r) => r.privacy_notice_provided ? 'Yes' : 'No',
    data_source:              (r) => esc(r.data_source || '—'),
    email:                    (r) => esc(r.email || '—'),
    mobile:                   (r) => esc(r.mobile || '—'),
    actions:                  (r) => `<a href="${_popiaHref(r)}" class="btn btn-xs btn-outline">Open</a>`,
  };
  let _popiaCatalog = null;
  let _popiaConfig  = null;

  const Popia = {
    async list() {
      setHeader('POPIA', ['Home', 'POPIA']);
      const headerActions = document.getElementById('header-actions');
      if (headerActions) {
        headerActions.innerHTML = `<button class="btn btn-secondary btn-sm" id="popia-report-btn">📄 Compliance Report</button>`;
      }
      const ctrlStyle = 'height:28px;padding:.15rem .4rem;font-size:.78rem;line-height:1;';
      const headerCenter = document.getElementById('header-center');
      if (headerCenter) {
        headerCenter.innerHTML = `
          <div style="display:flex;gap:.5rem;align-items:center;background:var(--bg);padding:.3rem .55rem;border-radius:6px;">
            <input type="search" id="popia-search" class="form-control"
              placeholder="Search…"
              style="${ctrlStyle}width:200px;">
          </div>`;
      }
      renderInto(`<div class="page-wrapper"><div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div></div>`);
      try {
        const [prefs, rows] = await Promise.all([
          ViewPrefs.load('popia'),
          Api.popia.list(),
        ]);
        _popiaCatalog = prefs.catalog;
        _popiaConfig  = prefs.config;

        let searchQ = '';
        let sortBy  = null;
        let sortDir = 'asc';

        const sortKey = (r, key) => {
          switch (key) {
            case 'name':
              return ((r.display_name || `${r.first_name || ''} ${r.last_name || ''}`).trim()).toLowerCase();
            case 'status_badge':
              return (r.status_badge || 'Red').toLowerCase();
            case 'direct_marketing_consent':
            case 'third_party_sharing':
            case 'privacy_notice_provided':
              return r[key] ? 1 : 0;
            default:
              return String(r[key] ?? '').toLowerCase();
          }
        };

        const searchHaystack = (r) => [
          r.display_name, r.first_name, r.last_name, r.account_name,
          r.email, r.mobile, r.data_processing_basis,
          r.information_officer_name, r.kind, r.status_badge,
          r.consent_method, r.data_source,
        ].filter(Boolean).join(' ').toLowerCase();

        const applyFilters = () => {
          let v = rows;
          if (searchQ) {
            const q = searchQ.toLowerCase();
            v = v.filter(r => searchHaystack(r).includes(q));
          }
          if (sortBy) {
            v = [...v].sort((a, b) => {
              const av = sortKey(a, sortBy);
              const bv = sortKey(b, sortBy);
              if (av < bv) return sortDir === 'asc' ? -1 : 1;
              if (av > bv) return sortDir === 'asc' ?  1 : -1;
              return 0;
            });
          }
          return v;
        };

        const renderHead = () => {
          const visibleCols = ViewPrefs.visibleColumns(_popiaCatalog, _popiaConfig);
          return visibleCols.map(col => {
            const sortable = !!col.sortable;
            const active   = sortBy === col.id;
            const arrow    = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
            const cls      = sortable ? `sortable${active ? ' sort-active' : ''}` : '';
            const style    = sortable ? 'cursor:pointer;user-select:none;' : '';
            const dataAttr = sortable ? ` data-sort="${esc(col.id)}"` : '';
            return `<th${cls ? ` class="${cls}"` : ''}${style ? ` style="${style}"` : ''}${dataAttr}>${esc(col.label)}${arrow}</th>`;
          }).join('');
        };

        const renderRows = (filtered) => {
          const visibleCols = ViewPrefs.visibleColumns(_popiaCatalog, _popiaConfig);
          const colCount = visibleCols.length || 1;
          if (!filtered.length) {
            return `<tr><td colspan="${colCount}" style="text-align:center;color:#888;padding:1rem;">${searchQ ? 'No matches.' : 'No contacts or accounts yet.'}</td></tr>`;
          }
          return filtered.map(r => `<tr>${visibleCols.map(col => {
            const fn = POPIA_CELLS[col.id];
            return `<td${col.id === 'actions' ? ' class="actions-cell"' : ''}>${fn ? fn(r) : esc(String(r[col.id] ?? '—'))}</td>`;
          }).join('')}</tr>`).join('');
        };

        const wireSortHandlers = () => {
          document.querySelectorAll('#popia-thead-row th.sortable').forEach(th => {
            th.addEventListener('click', () => {
              const id = th.dataset.sort;
              if (!id) return;
              if (sortBy === id) {
                sortDir = sortDir === 'asc' ? 'desc' : 'asc';
              } else {
                sortBy = id;
                sortDir = 'asc';
              }
              redraw();
            });
          });
        };

        const redraw = () => {
          const theadRow = document.getElementById('popia-thead-row');
          const tbodyEl  = document.getElementById('popia-tbody');
          if (theadRow) theadRow.innerHTML = renderHead();
          if (tbodyEl)  tbodyEl.innerHTML  = renderRows(applyFilters());
          wireSortHandlers();
        };

        renderInto(`
          <div class="page-wrapper">
            <p style="font-size:.85rem;color:#666;margin:.25rem 0 1rem;">
              Every contact and account has a POPIA record. Fill in the details to turn the status green.
            </p>
            <div class="card" style="padding:0;overflow-x:auto;">
              <table class="table">
                <thead><tr id="popia-thead-row">${renderHead()}</tr></thead>
                <tbody id="popia-tbody">${renderRows(rows)}</tbody>
              </table>
            </div>
          </div>
        `);

        wireSortHandlers();

        ViewPrefs.attachButton({
          moduleKey: 'popia',
          catalog:   _popiaCatalog,
          current:   _popiaConfig,
          onChange:  (newCfg) => { _popiaConfig = newCfg; redraw(); },
        });

        document.getElementById('popia-report-btn')?.addEventListener('click', () => Popia._openComplianceReportModal());

        // Wire search filter (client-side)
        const searchEl = document.getElementById('popia-search');
        if (searchEl) {
          searchEl.addEventListener('input', () => {
            searchQ = (searchEl.value || '').trim();
            redraw();
          });
        }
      } catch (err) {
        renderInto(`<div class="alert alert-danger">${esc(err.message)}</div>`);
      }
    },

    async _openComplianceReportModal() {
      // Guard against double-open (e.g. fast double-click)
      if (document.getElementById('popia-report-modal-container')) return;
      const container = document.createElement('div');
      container.id = 'popia-report-modal-container';
      container.innerHTML = `
        <div class="modal-overlay" id="popia-report-modal"
             style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;">
          <div class="modal" style="background:#fff;border-radius:8px;width:760px;max-width:94vw;max-height:90vh;overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,0.2);">
            <div class="modal-header" style="padding:1rem 1.25rem;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;">Weekly POPIA Compliance Report</h3>
              <div style="display:flex;gap:.5rem;align-items:center;">
                <a id="popia-report-pdf" class="btn btn-primary btn-sm" href="/api/popia/compliance-report.pdf">💾 Save PDF</a>
                <button type="button" id="popia-report-close"
                        class="modal-close">×</button>
              </div>
            </div>
            <div class="modal-body" id="popia-report-body" style="padding:1.25rem;">
              <div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(container);
      const close = () => container.remove();
      container.querySelector('#popia-report-modal').addEventListener('click', (e) => { /* click-outside-to-close disabled */ void e; });
      container.querySelector('#popia-report-close').addEventListener('click', close);

      const body = container.querySelector('#popia-report-body');
      try {
        const r = await Api.popia.complianceReport();
        const block = (title, count, rows, render) => `
          <div style="margin-bottom:1.25rem;">
            <h4 style="margin:.25rem 0 .5rem;">${esc(title)} <span style="background:${count > 0 ? '#fdecea' : '#d4edda'};color:${count > 0 ? '#a71d2a' : '#155724'};border-radius:999px;padding:.1rem .55rem;font-size:.78rem;font-weight:600;">${count}</span></h4>
            ${rows.length ? `<table class="table" style="font-size:.85rem;">${render(rows)}</table>` : `<p style="color:#888;font-size:.82rem;">None.</p>`}
          </div>`;
        body.innerHTML = `
          <p style="font-size:.82rem;color:#666;margin:0 0 .75rem;">Generated ${esc(new Date(r.generated_at).toLocaleString('en-ZA'))}</p>
          ${block('Contacts without a Data Processing Basis', r.missing_processing_basis.length, r.missing_processing_basis, rows => `
            <thead><tr><th>Contact</th><th>Status</th></tr></thead>
            <tbody>${rows.map(c => `<tr>
              <td><a href="${c.kind === 'account' ? '#/accounts/' + c.id : '#/contacts/' + c.id}">${esc(((c.first_name||'')+' '+(c.last_name||'')).trim() || '(unnamed)')}</a></td>
              <td>${esc(c.contact_status || '—')}</td></tr>`).join('')}</tbody>`)}
          ${block('Pending Data Subject Requests', r.pending_dsrs.length, r.pending_dsrs, rows => `
            <thead><tr><th>Contact</th><th>Type</th><th>Requested</th><th>Days Open</th><th>Status</th></tr></thead>
            <tbody>${rows.map(d => `<tr style="${d.overdue ? 'background:#fdecea;' : ''}">
              <td><a href="#/popia/${d.contact_id}">${esc(((d.first_name||'')+' '+(d.last_name||'')).trim())}</a></td>
              <td>${esc(d.request_type)}</td>
              <td>${esc(d.request_date)}</td>
              <td style="font-weight:600;${d.overdue ? 'color:#a71d2a;' : ''}">${d.days_open}${d.overdue ? ' (overdue)' : ''}</td>
              <td><span class="badge badge-status">${esc(d.status)}</span></td></tr>`).join('')}</tbody>`)}
          ${block('Retention Records expiring (≤30 days)', r.expiring_retention.length, r.expiring_retention, rows => `
            <thead><tr><th>Contact</th><th>Retention Expires</th><th>Days</th></tr></thead>
            <tbody>${rows.map(c => `<tr>
              <td><a href="#/popia/${c.id}">${esc(((c.first_name||'')+' '+(c.last_name||'')).trim())}</a></td>
              <td>${esc(c.retention_expiry_date || '—')}</td>
              <td style="font-weight:600;color:${c.days_to_expiry < 0 ? '#a71d2a' : '#856404'};">${c.days_to_expiry < 0 ? `${Math.abs(c.days_to_expiry)} days overdue` : `${c.days_to_expiry} days`}</td></tr>`).join('')}</tbody>`)}
        `;
      } catch (err) {
        body.innerHTML = `<div class="alert alert-danger">${esc(err.message || String(err))}</div>`;
      }
    },
    async detail(contactId) {
      setHeader('POPIA Record', ['Home', 'POPIA', 'Record']);
      renderInto(`<div class="page-wrapper"><div class="loading-spinner"></div></div>`);
      try {
        const [data, options, users] = await Promise.all([
          Api.popia.getContact(contactId),
          Api.popia.options(),
          Api.admin.users().catch(() => []),
        ]);
        const name = ((data.first_name || '') + ' ' + (data.last_name || '')).trim();
        if (name) setHeader(`POPIA — ${name}`, ['Home', 'POPIA', name]);
        renderInto(PopiaTab._template(contactId, data, options, users));
        PopiaTab._bind(contactId, data, options);
      } catch (err) {
        renderInto(`<div class="alert alert-danger">${esc(err.message)}</div>`);
      }
    },

    _openAccountDsrModal(accountId) {
      const today = new Date().toISOString().slice(0, 10);
      const types = ['Access', 'Correction', 'Erasure', 'Object', 'Withdraw Consent'];
      const container = document.createElement('div');
      container.id = 'dsr-acct-modal-container';
      container.innerHTML = `
        <div class="modal-overlay" id="dsr-acct-modal"
             style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;">
          <div class="modal" style="background:var(--card-bg);color:var(--text);border:1px solid var(--border);border-radius:8px;width:600px;max-width:92vw;max-height:90vh;overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,0.2);">
            <div class="modal-header" style="padding:1rem 1.25rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;">Log new data subject request</h3>
              <button type="button" id="dsr-acct-close"
                      class="modal-close">×</button>
            </div>
            <div class="modal-body" style="padding:1.25rem;">
              <div id="dsr-acct-error" class="alert alert-danger" style="display:none;margin-bottom:.75rem;"></div>
              <div class="form-grid form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group">
                  <label class="form-label required">Request type</label>
                  <select id="dsr-acct-type" class="form-control" required>
                    <option value="">— Select —</option>
                    ${types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label required">Request date</label>
                  <input type="date" id="dsr-acct-date" class="form-control" value="${today}" required>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Describe the request</label>
                <textarea id="dsr-acct-details" class="form-control" rows="3" placeholder="Optional — context, scope, deadline..."></textarea>
              </div>

              <div id="dsr-acct-block-access" style="display:none;border-top:1px dashed var(--border);padding-top:.75rem;margin-top:.25rem;">
                <strong>Right to Access (DSAR)</strong>
                <p style="font-size:.8rem;color:var(--text-light);margin:.25rem 0;">System will generate a data export within 30 days. Record delivery once sent.</p>
                <div class="form-grid form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                  <div class="form-group">
                    <label class="form-label">Export format</label>
                    <select id="dsr-acct-export-format" class="form-control">
                      <option value="">—</option>
                      <option value="PDF">PDF</option>
                      <option value="CSV">CSV</option>
                      <option value="ZIP">ZIP (full archive)</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Delivery date (when sent)</label>
                    <input type="date" id="dsr-acct-delivery-date" class="form-control">
                  </div>
                </div>
              </div>

              <div id="dsr-acct-block-correction" style="display:none;border-top:1px dashed var(--border);padding-top:.75rem;margin-top:.25rem;">
                <strong>Right to Correction</strong>
                <p style="font-size:.8rem;color:var(--text-light);margin:.25rem 0;">Record what was corrected and notify the client.</p>
                <div class="form-group">
                  <label class="form-label">Fields to be corrected (comma-separated)</label>
                  <input type="text" id="dsr-acct-corrected-fields" class="form-control" placeholder="e.g. registration_number, vat_number, address">
                </div>
                <div class="form-group">
                  <label class="form-label">Client notification date</label>
                  <input type="date" id="dsr-acct-client-notified" class="form-control">
                </div>
              </div>

              <div id="dsr-acct-block-erasure" style="display:none;border-top:1px dashed var(--border);padding-top:.75rem;margin-top:.25rem;">
                <strong>Right to Erasure</strong>
                <p style="font-size:.8rem;color:var(--text-light);margin:.25rem 0;">Assess legal basis for retention. If no override, anonymise or delete.</p>
                <div class="form-group">
                  <label class="form-label">Legal basis assessment</label>
                  <textarea id="dsr-acct-legal-basis" class="form-control" rows="2" placeholder="Describe whether any legal/regulatory basis requires retention (FAIS, FICA, tax, etc.)"></textarea>
                </div>
                <div class="form-group">
                  <label class="form-label">Erasure action</label>
                  <select id="dsr-acct-erasure-action" class="form-control">
                    <option value="">— Select once assessed —</option>
                    <option value="Anonymised">Anonymise</option>
                    <option value="Deleted">Delete</option>
                    <option value="Retained — legal basis">Retain (legal basis)</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>

              <div id="dsr-acct-block-object" style="display:none;border-top:1px dashed var(--border);padding-top:.75rem;margin-top:.25rem;">
                <strong>Right to Object</strong>
                <p style="font-size:.8rem;color:var(--text-light);margin:.25rem 0;">Logging will <strong>suspend processing</strong> on this objection until resolved. Document the resolution in outcome notes.</p>
              </div>

              <div id="dsr-acct-block-withdraw" style="display:none;border-top:1px dashed var(--border);padding-top:.75rem;margin-top:.25rem;">
                <strong>Right to Withdraw Consent</strong>
                <p style="font-size:.8rem;color:var(--text-light);margin:.25rem 0;">Saving will <strong>immediately clear</strong> the account's marketing consent flag.</p>
                <div class="form-group">
                  <label class="form-label">Withdrawal date</label>
                  <input type="date" id="dsr-acct-consent-withdrawn" class="form-control" value="${today}">
                </div>
              </div>

              <div class="alert alert-info" style="margin:.75rem 0 0;font-size:.82rem;">
                POPIA s5: Data subject requests must be completed within 30 calendar days.
              </div>
            </div>
            <div class="modal-footer" style="padding:1rem 1.25rem;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:.5rem;">
              <button type="button" class="btn btn-secondary" id="dsr-acct-cancel">Cancel</button>
              <button type="button" class="btn btn-primary" id="dsr-acct-save">Log request</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(container);

      const close = () => container.remove();
      container.querySelector('#dsr-acct-modal').addEventListener('click', (e) => {
        /* click-outside-to-close disabled */ void e;
      });
      container.querySelector('#dsr-acct-close').addEventListener('click', close);
      container.querySelector('#dsr-acct-cancel').addEventListener('click', close);

      const typeEl = container.querySelector('#dsr-acct-type');
      const blocks = {
        'Access':           container.querySelector('#dsr-acct-block-access'),
        'Correction':       container.querySelector('#dsr-acct-block-correction'),
        'Erasure':          container.querySelector('#dsr-acct-block-erasure'),
        'Object':           container.querySelector('#dsr-acct-block-object'),
        'Withdraw Consent': container.querySelector('#dsr-acct-block-withdraw'),
      };
      typeEl.addEventListener('change', () => {
        Object.entries(blocks).forEach(([k, el]) => { el.style.display = k === typeEl.value ? 'block' : 'none'; });
      });

      container.querySelector('#dsr-acct-save').addEventListener('click', async () => {
        const type    = typeEl.value;
        const date    = container.querySelector('#dsr-acct-date').value;
        const details = container.querySelector('#dsr-acct-details').value.trim();
        const errEl   = container.querySelector('#dsr-acct-error');
        if (!type || !date) {
          errEl.textContent = 'Request type and date are required.';
          errEl.style.display = 'block';
          return;
        }

        const payload = {
          request_type: type,
          request_date: date,
          request_details: details,
          status: 'Open',
        };
        if (type === 'Access') {
          payload.export_format = container.querySelector('#dsr-acct-export-format').value || null;
          payload.delivery_date = container.querySelector('#dsr-acct-delivery-date').value || null;
        } else if (type === 'Correction') {
          const raw = container.querySelector('#dsr-acct-corrected-fields').value.trim();
          payload.corrected_fields = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : null;
          payload.client_notified_date = container.querySelector('#dsr-acct-client-notified').value || null;
        } else if (type === 'Erasure') {
          payload.legal_basis_assessment = container.querySelector('#dsr-acct-legal-basis').value.trim() || null;
          payload.erasure_action         = container.querySelector('#dsr-acct-erasure-action').value || null;
        } else if (type === 'Object') {
          payload.processing_suspended = 1;
        } else if (type === 'Withdraw Consent') {
          payload.consent_withdrawn_date = container.querySelector('#dsr-acct-consent-withdrawn').value || date;
        }

        try {
          await Api.popia.createAccountRequest(accountId, payload);
          close();
          toast('Request logged', 'success');
          Popia.detailAccount(accountId);
        } catch (err) {
          errEl.textContent = err.message || String(err);
          errEl.style.display = 'block';
        }
      });
    },

    async detailAccount(accountId) {
      setHeader('POPIA Record (Account)', ['Home', 'POPIA', 'Account']);
      renderInto(`<div class="page-wrapper"><div class="loading-spinner"></div></div>`);
      try {
        const [data, options, usersResp] = await Promise.all([
          Api.popia.getAccount(accountId),
          Api.popia.options(),
          Api.admin.users().catch(() => []),
        ]);
        const allUsers = usersResp.data || usersResp || [];
        if (data.account_name) setHeader(`POPIA — ${data.account_name}`, ['Home', 'POPIA', data.account_name]);

        const dpb = options.processing_basis || ['Consent','Contractual necessity','Legal obligation','Legitimate interest','Vital interest'];
        const cm  = options.consent_method   || ['Signed form','Digital opt-in','Email confirmation','Verbal (with witness)'];
        const ds  = options.data_source      || ['Client-provided directly','Referred by third party','Public record','Existing relationship'];
        const dcOpts = options.data_categories || [];
        const parseArr = (v) => { try { return JSON.parse(v) || []; } catch (_) { return []; } };
        const dataCategoriesSelected = parseArr(data.data_categories_held);

        const requestRow = (r) => `
          <tr>
            <td>${esc(r.request_date)}</td>
            <td>${esc(r.request_type)}</td>
            <td>${esc(r.status)}</td>
            <td>${esc(r.target_completion_date || '—')}</td>
            <td>${esc(r.handled_by_name || '—')}</td>
            <td>${esc(r.request_details || '')}</td>
          </tr>`;

        renderInto(`
          <div class="page-wrapper" style="max-width:900px;">
            <div class="card detail-section" style="margin-bottom:1rem;">
              <div class="detail-section-title">Account</div>
              <div class="detail-grid">
                <div class="detail-field"><span class="detail-label">Account name</span><span class="detail-value">${esc(data.account_name || '—')}</span></div>
                <div class="detail-field"><span class="detail-label">Registration #</span><span class="detail-value">${esc(data.registration_number || '—')}</span></div>
                <div class="detail-field"><span class="detail-label">VAT #</span><span class="detail-value">${esc(data.vat_number || '—')}</span></div>
                <div class="detail-field"><span class="detail-label">Business type</span><span class="detail-value">${esc(data.business_type || '—')}</span></div>
              </div>
              <div style="margin-top:.5rem;"><a href="#/accounts/${accountId}" class="btn btn-sm btn-secondary btn-back">← Back to account</a></div>
            </div>

            <div class="card">
              <div class="card-header"><h3 class="card-title">POPIA Record</h3></div>
              <form id="popia-acct-form" novalidate>
                <fieldset class="form-section">
                  <legend class="form-section-title">Lawful basis &amp; consent</legend>
                  <div class="form-grid form-grid-2">
                    <div class="form-group">
                      <label class="form-label required">Data processing basis</label>
                      <select class="form-control" name="data_processing_basis" required>
                        <option value="">— Select —</option>
                        ${dpb.map(v => `<option value="${esc(v)}" ${data.data_processing_basis === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Consent date</label>
                      <input type="date" class="form-control" name="popia_consent_date" value="${esc(data.popia_consent_date || '')}">
                    </div>
                    <div class="form-group">
                      <label class="form-label">Consent method</label>
                      <select class="form-control" name="consent_method">
                        <option value="">— Select —</option>
                        ${cm.map(v => `<option value="${esc(v)}" ${data.consent_method === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Data source</label>
                      <select class="form-control" name="data_source">
                        <option value="">— Select —</option>
                        ${ds.map(v => `<option value="${esc(v)}" ${data.data_source === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Direct marketing consent</label>
                      <label style="display:flex;align-items:center;gap:.5rem;font-weight:normal;">
                        <input type="checkbox" name="direct_marketing_consent" ${data.direct_marketing_consent ? 'checked' : ''}>
                        Client has opted in to direct marketing
                      </label>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Third-party sharing</label>
                      <label style="display:flex;align-items:center;gap:.5rem;font-weight:normal;">
                        <input type="checkbox" name="third_party_sharing" ${data.third_party_sharing ? 'checked' : ''}>
                        Data shared with third parties
                      </label>
                    </div>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Third-party sharing notes</label>
                    <textarea class="form-control" name="third_party_sharing_notes" rows="2">${esc(data.third_party_sharing_notes || '')}</textarea>
                  </div>
                  <div class="form-group">
                    <label class="form-label required">Data categories held</label>
                    <div>
                      ${dcOpts.map(v => `
                        <label style="display:inline-flex;align-items:center;margin-right:.75rem;font-size:.9rem;">
                          <input type="checkbox" name="data_categories_held" value="${esc(v)}"
                            ${dataCategoriesSelected.includes(v) ? 'checked' : ''}
                            style="margin-right:.35rem;">
                          ${esc(v)}
                        </label>`).join('')}
                    </div>
                  </div>
                </fieldset>

                <fieldset class="form-section">
                  <legend class="form-section-title">Retention &amp; governance</legend>
                  <div class="form-grid form-grid-2">
                    <div class="form-group">
                      <label class="form-label">Retention period (years)</label>
                      <input type="number" min="1" max="30" class="form-control" name="retention_period_years" value="${esc(data.retention_period_years || 5)}">
                    </div>
                    <div class="form-group">
                      <label class="form-label">Retention expires (auto)</label>
                      <input type="text" class="form-control" value="${esc(data.retention_expiry_date || '—')}" disabled>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Information officer</label>
                      <select class="form-control" name="information_officer_id">
                        <option value="">— None —</option>
                        ${allUsers.filter(u => u.active).map(u => `<option value="${esc(u.id)}" ${String(data.information_officer_id || '') === String(u.id) ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Privacy notice provided</label>
                      <label style="display:flex;align-items:center;gap:.5rem;font-weight:normal;">
                        <input type="checkbox" name="privacy_notice_provided" ${data.privacy_notice_provided ? 'checked' : ''}>
                        Notice handed to client
                      </label>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Privacy notice date</label>
                      <input type="date" class="form-control" name="privacy_notice_date" value="${esc(data.privacy_notice_date || '')}">
                    </div>
                    <div class="form-group">
                      <label class="form-label">Last activity date</label>
                      <input type="date" class="form-control" name="last_activity_date" value="${esc(data.last_activity_date || '')}">
                    </div>
                  </div>
                </fieldset>

                <div class="form-actions">
                  <button type="submit" class="btn btn-primary">Save POPIA record</button>
                </div>
              </form>
            </div>

            <div class="card" style="margin-top:1rem;">
              <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                <h3 class="card-title">Data Subject Requests</h3>
                <button type="button" class="btn btn-sm btn-primary" id="popia-acct-add-dsr">+ Log request</button>
              </div>
              <div class="table-responsive">
                <table class="table">
                  <thead><tr><th>Date</th><th>Type</th><th>Status</th><th>Target</th><th>Handled by</th><th>Detail</th></tr></thead>
                  <tbody>
                    ${(data.requests && data.requests.length) ? data.requests.map(requestRow).join('') : '<tr><td colspan="6" class="table-empty">No requests logged.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `);

        const form = document.getElementById('popia-acct-form');
        form.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const fd = new FormData(form);
          // Collect multi-value checkboxes (data_categories_held) into arrays.
          const payload = {};
          for (const [k, v] of fd.entries()) {
            if (k === 'data_categories_held' || k === 'consent_scope') {
              if (!payload[k]) payload[k] = [];
              payload[k].push(v);
            } else {
              payload[k] = v;
            }
          }
          payload.direct_marketing_consent = form.querySelector('[name="direct_marketing_consent"]').checked ? 1 : 0;
          payload.third_party_sharing      = form.querySelector('[name="third_party_sharing"]').checked      ? 1 : 0;
          payload.privacy_notice_provided  = form.querySelector('[name="privacy_notice_provided"]').checked  ? 1 : 0;
          payload.popia_consent_obtained   = !!payload.popia_consent_date ? 1 : 0;
          // Ensure unchecked-all categories submits an empty array (not undefined),
          // so the server overwrites old values.
          if (!('data_categories_held' in payload)) payload.data_categories_held = [];
          try {
            await Api.popia.updateAccount(accountId, payload);
            toast('POPIA record saved', 'success');
            setTimeout(() => Popia.detailAccount(accountId), 250);
          } catch (err) { toast(err.message, 'error'); }
        });

        document.getElementById('popia-acct-add-dsr').addEventListener('click', () => {
          Popia._openAccountDsrModal(accountId);
        });
      } catch (err) {
        renderInto(`<div class="alert alert-danger">${esc(err.message)}</div>`);
      }
    },
  };

  // ═════════════════════════════════════════════════════════════
  // FICA module (standalone, one record per contact)
  // ═════════════════════════════════════════════════════════════
  // Build the FICA detail link for a row — accounts use a separate route.
  const _ficaHref = (r) => r.kind === 'account' ? `#/fica/account/${r.id}` : `#/fica/${r.id}`;
  const _ficaName = (r) => r.kind === 'account'
    ? esc(r.account_name || r.display_name || '(unnamed)')
    : esc(((r.first_name || '') + ' ' + (r.last_name || '')).trim() || '(unnamed)');
  const _accountBadge = `<span style="font-size:.7rem;background:#eaf2fb;color:#1a73e8;padding:.05rem .4rem;border-radius:999px;margin-left:.25rem;">Account</span>`;

  const FICA_CELLS = {
    name:                            (r) => `<a href="${_ficaHref(r)}"><strong>${_ficaName(r)}</strong></a>${r.kind === 'account' ? _accountBadge : ''}`,
    derived_status:                  (r) => badgeForFica(r.derived_status || 'Not verified'),
    fica_verification_date:          (r) => esc(r.fica_verification_date || '—'),
    fica_verification_method:        (r) => esc(r.fica_verification_method || '—'),
    fica_verified_by_name:           (r) => esc(r.fica_verified_by_name || '—'),
    fica_five_year_expiry:           (r) => esc(r.fica_five_year_expiry || '—'),
    fica_pep_check:                  (r) => esc(r.fica_pep_check || '—'),
    fica_document_reference:         (r) => {
      // Encrypted at rest — show masked value with admin-password reveal eye icon.
      if (!r.fica_document_reference) return '—';
      if (r.fica_document_reference_encrypted) {
        return EncryptedField.render({
          module:   r.kind === 'account' ? 'accounts' : 'contacts',
          recordId: r.id,
          field:    'fica_document_reference',
          masked:   r.fica_document_reference,
          label:    'FICA Document Reference',
        });
      }
      return esc(r.fica_document_reference);
    },
    fica_cipc_number:                (r) => esc(r.fica_cipc_number || '—'),
    fica_beneficial_owner_confirmed: (r) => esc(r.fica_beneficial_owner_confirmed || '—'),
    fica_pep_check_date:             (r) => esc(r.fica_pep_check_date || '—'),
    sa_id_number:                    (r) => esc(r.kind === 'account' ? (r.registration_number || '—') : (r.sa_id_number || '—')),
    email:                           (r) => esc(r.email || '—'),
    actions:                         (r) => `<a href="${_ficaHref(r)}" class="btn btn-xs btn-outline">Open</a>`,
  };
  let _ficaCatalog = null;
  let _ficaConfig  = null;

  const Fica = {
    async list() {
      setHeader('FICA', ['Home', 'FICA']);
      const headerActions = document.getElementById('header-actions');
      if (headerActions) {
        headerActions.innerHTML = `<button class="btn btn-secondary btn-sm" id="fica-report-btn">📄 Compliance Report</button>`;
      }
      const ctrlStyle = 'height:28px;padding:.15rem .4rem;font-size:.78rem;line-height:1;';
      const headerCenter = document.getElementById('header-center');
      if (headerCenter) {
        headerCenter.innerHTML = `
          <div style="display:flex;gap:.5rem;align-items:center;background:var(--bg);padding:.3rem .55rem;border-radius:6px;">
            <input type="search" id="fica-search" class="form-control"
              placeholder="Search…"
              style="${ctrlStyle}width:200px;">
          </div>`;
      }
      renderInto(`<div class="page-wrapper"><div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div></div>`);
      try {
        const [prefs, rows] = await Promise.all([
          ViewPrefs.load('fica'),
          Api.fica.list(),
        ]);
        _ficaCatalog = prefs.catalog;
        _ficaConfig  = prefs.config;

        let searchQ = '';
        let sortBy  = null;
        let sortDir = 'asc';

        const sortKey = (r, key) => {
          switch (key) {
            case 'name':
              return ((r.display_name || `${r.first_name || ''} ${r.last_name || ''}`).trim()).toLowerCase();
            case 'sa_id_number':
              return (r.kind === 'account' ? (r.registration_number || '') : (r.sa_id_number || '')).toLowerCase();
            default:
              return String(r[key] ?? '').toLowerCase();
          }
        };

        const searchHaystack = (r) => [
          r.display_name, r.first_name, r.last_name, r.account_name,
          r.email, r.kind, r.derived_status, r.fica_verification_method,
          r.fica_verified_by_name, r.fica_pep_check, r.fica_cipc_number,
          r.sa_id_number, r.registration_number,
        ].filter(Boolean).join(' ').toLowerCase();

        const applyFilters = () => {
          let v = rows;
          if (searchQ) {
            const q = searchQ.toLowerCase();
            v = v.filter(r => searchHaystack(r).includes(q));
          }
          if (sortBy) {
            v = [...v].sort((a, b) => {
              const av = sortKey(a, sortBy);
              const bv = sortKey(b, sortBy);
              if (av < bv) return sortDir === 'asc' ? -1 : 1;
              if (av > bv) return sortDir === 'asc' ?  1 : -1;
              return 0;
            });
          }
          return v;
        };

        const renderHead = () => {
          const visibleCols = ViewPrefs.visibleColumns(_ficaCatalog, _ficaConfig);
          return visibleCols.map(col => {
            const sortable = !!col.sortable;
            const active   = sortBy === col.id;
            const arrow    = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
            const cls      = sortable ? `sortable${active ? ' sort-active' : ''}` : '';
            const style    = sortable ? 'cursor:pointer;user-select:none;' : '';
            const dataAttr = sortable ? ` data-sort="${esc(col.id)}"` : '';
            return `<th${cls ? ` class="${cls}"` : ''}${style ? ` style="${style}"` : ''}${dataAttr}>${esc(col.label)}${arrow}</th>`;
          }).join('');
        };

        const renderRows = (filtered) => {
          const visibleCols = ViewPrefs.visibleColumns(_ficaCatalog, _ficaConfig);
          const colCount = visibleCols.length || 1;
          if (!filtered.length) {
            return `<tr><td colspan="${colCount}" style="text-align:center;color:#888;padding:1rem;">${searchQ ? 'No matches.' : 'No contacts yet — add a contact to get started.'}</td></tr>`;
          }
          return filtered.map(r => `<tr>${visibleCols.map(col => {
            const fn = FICA_CELLS[col.id];
            return `<td${col.id === 'actions' ? ' class="actions-cell"' : ''}>${fn ? fn(r) : esc(String(r[col.id] ?? '—'))}</td>`;
          }).join('')}</tr>`).join('');
        };

        const wireSortHandlers = () => {
          document.querySelectorAll('#fica-thead-row th.sortable').forEach(th => {
            th.addEventListener('click', () => {
              const id = th.dataset.sort;
              if (!id) return;
              if (sortBy === id) {
                sortDir = sortDir === 'asc' ? 'desc' : 'asc';
              } else {
                sortBy = id;
                sortDir = 'asc';
              }
              redraw();
            });
          });
        };

        const redraw = () => {
          const theadRow = document.getElementById('fica-thead-row');
          const tbodyEl  = document.getElementById('fica-tbody');
          if (theadRow) theadRow.innerHTML = renderHead();
          if (tbodyEl)  tbodyEl.innerHTML  = renderRows(applyFilters());
          wireSortHandlers();
        };

        renderInto(`
          <div class="page-wrapper">
            <p style="font-size:.85rem;color:#666;margin:.25rem 0 1rem;">
              Every contact and account has a FICA record. Complete verification to lift the "Not verified" warning.
            </p>
            <div class="card" style="padding:0;overflow-x:auto;">
              <table class="table">
                <thead><tr id="fica-thead-row">${renderHead()}</tr></thead>
                <tbody id="fica-tbody">${renderRows(rows)}</tbody>
              </table>
            </div>
          </div>
        `);

        wireSortHandlers();

        ViewPrefs.attachButton({
          moduleKey: 'fica',
          catalog:   _ficaCatalog,
          current:   _ficaConfig,
          onChange:  (newCfg) => { _ficaConfig = newCfg; redraw(); },
        });

        document.getElementById('fica-report-btn')?.addEventListener('click', () => Fica._openComplianceReportModal());

        const searchEl = document.getElementById('fica-search');
        if (searchEl) {
          searchEl.addEventListener('input', () => {
            searchQ = (searchEl.value || '').trim();
            redraw();
          });
        }
      } catch (err) {
        renderInto(`<div class="alert alert-danger">${esc(err.message)}</div>`);
      }
    },

    async _openComplianceReportModal() {
      if (document.getElementById('fica-report-modal-container')) return;
      const container = document.createElement('div');
      container.id = 'fica-report-modal-container';
      container.innerHTML = `
        <div class="modal-overlay" id="fica-report-modal"
             style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;">
          <div class="modal" style="background:#fff;border-radius:8px;width:780px;max-width:94vw;max-height:90vh;overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,0.2);">
            <div class="modal-header" style="padding:1rem 1.25rem;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;">FICA Compliance Report</h3>
              <div style="display:flex;gap:.5rem;align-items:center;">
                <button type="button" id="fica-report-print" class="btn btn-secondary btn-sm">🖨 Print</button>
                <button type="button" id="fica-report-close"
                        class="modal-close">×</button>
              </div>
            </div>
            <div class="modal-body" id="fica-report-body" style="padding:1.25rem;">
              <div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(container);
      const close = () => container.remove();
      container.querySelector('#fica-report-modal').addEventListener('click', (e) => { /* click-outside-to-close disabled */ void e; });
      container.querySelector('#fica-report-close').addEventListener('click', close);
      container.querySelector('#fica-report-print').addEventListener('click', () => window.print());

      const body = container.querySelector('#fica-report-body');
      try {
        const r = await Api.fica.complianceReport();
        const linkFor = (row) => row.kind === 'account' ? `#/fica/account/${row.id}` : `#/fica/${row.id}`;
        const nameFor = (row) => row.kind === 'account'
          ? esc(row.first_name || '(unnamed)')
          : esc(((row.first_name || '') + ' ' + (row.last_name || '')).trim() || '(unnamed)');

        const block = (title, rows, render) => `
          <div style="margin-bottom:1.25rem;">
            <h4 style="margin:.25rem 0 .5rem;">${esc(title)} <span style="background:${rows.length > 0 ? '#fdecea' : '#d4edda'};color:${rows.length > 0 ? '#a71d2a' : '#155724'};border-radius:999px;padding:.1rem .55rem;font-size:.78rem;font-weight:600;">${rows.length}</span></h4>
            ${rows.length ? `<table class="table" style="font-size:.85rem;">${render(rows)}</table>` : `<p style="color:#888;font-size:.82rem;">None.</p>`}
          </div>`;

        body.innerHTML = `
          <p style="font-size:.82rem;color:#666;margin:0 0 .75rem;">Generated ${esc(new Date(r.generated_at).toLocaleString('en-ZA'))}</p>

          ${block('Contacts &amp; accounts with no verification recorded', r.missing_verification, rows => `
            <thead><tr><th>Subject</th><th>Type</th><th>Status</th></tr></thead>
            <tbody>${rows.map(row => `<tr>
              <td><a href="${linkFor(row)}">${nameFor(row)}</a></td>
              <td>${row.kind === 'account' ? 'Account' : 'Contact'}</td>
              <td>${esc(row.fica_status || '—')}</td></tr>`).join('')}</tbody>`)}

          ${block('Verification expired (> 5 years)', r.expired_verification, rows => `
            <thead><tr><th>Subject</th><th>Type</th><th>Verified</th><th>Expired</th><th>Days overdue</th></tr></thead>
            <tbody>${rows.map(row => `<tr style="background:#fdecea;">
              <td><a href="${linkFor(row)}">${nameFor(row)}</a></td>
              <td>${row.kind === 'account' ? 'Account' : 'Contact'}</td>
              <td>${esc(row.fica_verification_date || '—')}</td>
              <td>${esc(row.fica_five_year_expiry || '—')}</td>
              <td style="font-weight:600;color:#a71d2a;">${row.days_overdue}</td></tr>`).join('')}</tbody>`)}

          ${block('Verification expiring within 60 days', r.expiring_verification, rows => `
            <thead><tr><th>Subject</th><th>Type</th><th>Expires</th><th>Days</th></tr></thead>
            <tbody>${rows.map(row => `<tr>
              <td><a href="${linkFor(row)}">${nameFor(row)}</a></td>
              <td>${row.kind === 'account' ? 'Account' : 'Contact'}</td>
              <td>${esc(row.fica_five_year_expiry || '—')}</td>
              <td style="font-weight:600;color:${row.days_to_expiry < 30 ? '#a71d2a' : '#856404'};">${row.days_to_expiry}</td></tr>`).join('')}</tbody>`)}

          ${block('PEP / Sanctions check missing', r.missing_pep_check, rows => `
            <thead><tr><th>Subject</th><th>Type</th><th>PEP status</th></tr></thead>
            <tbody>${rows.map(row => `<tr>
              <td><a href="${linkFor(row)}">${nameFor(row)}</a></td>
              <td>${row.kind === 'account' ? 'Account' : 'Contact'}</td>
              <td>${esc(row.fica_pep_check || '—')}</td></tr>`).join('')}</tbody>`)}

          ${block('Beneficial owner not confirmed (juristic accounts)', r.missing_beneficial_owner, rows => `
            <thead><tr><th>Account</th><th>Business type</th><th>BO status</th></tr></thead>
            <tbody>${rows.map(row => `<tr>
              <td><a href="${linkFor(row)}">${nameFor(row)}</a></td>
              <td>${esc(row.business_type || '—')}</td>
              <td>${esc(row.fica_beneficial_owner_confirmed || '—')}</td></tr>`).join('')}</tbody>`)}
        `;
      } catch (err) {
        body.innerHTML = `<div class="alert alert-danger">${esc(err.message || String(err))}</div>`;
      }
    },
    async detail(contactId) {
      setHeader('FICA Record', ['Home', 'FICA', 'Record']);
      renderInto(`<div class="page-wrapper"><div class="loading-spinner"></div></div>`);
      try {
        const [data, options, users] = await Promise.all([
          Api.fica.getContact(contactId),
          Api.fica.options(),
          Api.admin.users().catch(() => []),
        ]);
        const name = ((data.first_name || '') + ' ' + (data.last_name || '')).trim();
        if (name) setHeader(`FICA — ${name}`, ['Home', 'FICA', name]);
        renderInto(FicaTab._template(contactId, data, options, users));
        FicaTab._bind(contactId);
      } catch (err) {
        renderInto(`<div class="alert alert-danger">${esc(err.message)}</div>`);
      }
    },

    async detailAccount(accountId) {
      setHeader('FICA Record (Account)', ['Home', 'FICA', 'Account']);
      renderInto(`<div class="page-wrapper"><div class="loading-spinner"></div></div>`);
      try {
        const [data, options, usersResp] = await Promise.all([
          Api.fica.getAccount(accountId),
          Api.fica.options(),
          Api.admin.users().catch(() => []),
        ]);
        const allUsers = usersResp.data || usersResp || [];
        if (data.account_name) setHeader(`FICA — ${data.account_name}`, ['Home', 'FICA', data.account_name]);

        const methods = options.method           || ['South African ID document','Passport','CIPC registration (company)',"Driver's licence",'Biometric','Other certified document'];
        const peps    = options.pep              || ['Yes — clear','Yes — flagged for review','Not yet performed'];
        const bos     = options.beneficial_owner || ['Yes','No','Pending'];

        renderInto(`
          <div class="page-wrapper" style="max-width:900px;">
            <div class="card detail-section" style="margin-bottom:1rem;">
              <div class="detail-section-title">Account</div>
              <div class="detail-grid">
                <div class="detail-field"><span class="detail-label">Account name</span><span class="detail-value">${esc(data.account_name || '—')}</span></div>
                <div class="detail-field"><span class="detail-label">Registration #</span><span class="detail-value">${esc(data.registration_number || '—')}</span></div>
                <div class="detail-field"><span class="detail-label">VAT #</span><span class="detail-value">${esc(data.vat_number || '—')}</span></div>
                <div class="detail-field"><span class="detail-label">Business type</span><span class="detail-value">${esc(data.business_type || '—')}</span></div>
                <div class="detail-field"><span class="detail-label">Status</span><span class="detail-value">${badgeForFica(data.derived_status || 'Not verified')}</span></div>
                <div class="detail-field"><span class="detail-label">5-year expiry</span><span class="detail-value">${esc(data.fica_five_year_expiry || '—')}</span></div>
              </div>
              <div style="margin-top:.5rem;"><a href="#/accounts/${accountId}" class="btn btn-sm btn-secondary btn-back">← Back to account</a></div>
            </div>

            <div class="card">
              <div class="card-header"><h3 class="card-title">FICA Verification</h3></div>
              <form id="fica-acct-form" novalidate>
                <fieldset class="form-section">
                  <legend class="form-section-title">Verification</legend>
                  <div class="form-grid form-grid-2">
                    <div class="form-group">
                      <label class="form-label required">Verification date</label>
                      <input type="date" class="form-control" name="fica_verification_date" value="${esc(data.fica_verification_date || '')}" required>
                    </div>
                    <div class="form-group">
                      <label class="form-label required">Verification method</label>
                      <select class="form-control" name="fica_verification_method" required>
                        <option value="">— Select —</option>
                        ${methods.map(v => `<option value="${esc(v)}" ${data.fica_verification_method === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Document reference</label>
                      <input type="text" class="form-control" name="fica_document_reference" value="${esc(data.fica_document_reference || '')}" placeholder="Cert / scan reference">
                    </div>
                    <div class="form-group">
                      <label class="form-label">Verified by</label>
                      <select class="form-control" name="fica_verified_by_id">
                        <option value="">— Select —</option>
                        ${allUsers.filter(u => u.active).map(u => `<option value="${esc(u.id)}" ${String(data.fica_verified_by_id || '') === String(u.id) ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label">CIPC number</label>
                      <input type="text" class="form-control" name="fica_cipc_number" value="${esc(data.fica_cipc_number || '')}">
                    </div>
                    <div class="form-group">
                      <label class="form-label">Re-verification date (next)</label>
                      <input type="date" class="form-control" name="fica_re_verification_date" value="${esc(data.fica_re_verification_date || '')}">
                    </div>
                  </div>
                </fieldset>

                <fieldset class="form-section">
                  <legend class="form-section-title">Beneficial owner &amp; PEP screening</legend>
                  <div class="form-grid form-grid-2">
                    <div class="form-group">
                      <label class="form-label">Beneficial owner confirmed</label>
                      <select class="form-control" name="fica_beneficial_owner_confirmed">
                        <option value="">— Select —</option>
                        ${bos.map(v => `<option value="${esc(v)}" ${data.fica_beneficial_owner_confirmed === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label">PEP check</label>
                      <select class="form-control" name="fica_pep_check">
                        <option value="">— Select —</option>
                        ${peps.map(v => `<option value="${esc(v)}" ${data.fica_pep_check === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label">PEP check date</label>
                      <input type="date" class="form-control" name="fica_pep_check_date" value="${esc(data.fica_pep_check_date || '')}">
                    </div>
                  </div>
                </fieldset>

                <div class="form-actions">
                  <button type="submit" class="btn btn-primary">Save FICA record</button>
                </div>
              </form>
            </div>

            ${ficaEvidenceCard({ kind: 'accounts', recordId: accountId })}
          </div>
        `);

        const form = document.getElementById('fica-acct-form');
        form.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const fd = new FormData(form);
          const payload = Object.fromEntries(fd.entries());
          try {
            await Api.fica.updateAccount(accountId, payload);
            toast('FICA record saved', 'success');
            setTimeout(() => Fica.detailAccount(accountId), 250);
          } catch (err) { toast(err.message, 'error'); }
        });
        bindFicaEvidence({ kind: 'accounts', recordId: accountId });
      } catch (err) {
        renderInto(`<div class="alert alert-danger">${esc(err.message)}</div>`);
      }
    },
  };

  // ── Expose namespaces ─────────────────────────────────────────
  window.Compliance    = Compliance;
  window.TcfDashboard  = TcfDashboard;
  window.PopiaTab      = PopiaTab;
  window.FicaTab       = FicaTab;
  window.Popia         = Popia;
  window.Fica          = Fica;
  window.BrokerProfiles = BrokerProfiles;
  window.Products      = Products;
  window.PostSaleEvents = PostSaleEvents;
  window.CommissionLog = CommissionLog;
  window.DataBreaches  = DataBreaches;
})();
