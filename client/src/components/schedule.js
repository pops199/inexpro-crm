/* ═══════════════════════════════════════════════════════════════════════════
   PolicySchedule component  —  Printable / emailable policy schedule
   ═══════════════════════════════════════════════════════════════════════════ */

const PolicySchedule = (() => {

  // ── Helpers ──────────────────────────────────────────────────────────────

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch (_) { return String(d).slice(0, 10); }
  }

  function fmtCur(v) {
    if (v == null || v === '') return '—';
    return 'R ' + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function numOrZero(v) { return Number(v) || 0; }

  // Auto-calculated asset value (mirrors the form's auto-calc):
  //   sum_insured + sum(extras[].amount) + sum(additional_covers[].cover_amount)
  function assetValueAuto(a) {
    let v = numOrZero(a.sum_insured);
    try {
      const extras = JSON.parse(a.vehicle_extras || '[]');
      if (Array.isArray(extras)) extras.forEach(ex => { v += numOrZero(ex.amount); });
    } catch (_) {}
    try {
      const addl = JSON.parse(a.additional_covers || '[]');
      if (Array.isArray(addl)) addl.forEach(ac => { v += numOrZero(ac.cover_amount); });
    } catch (_) {}
    return v;
  }

  // Auto-calculated asset premium EXCLUDING sasria:
  //   sum_insured_premium + sum(extras[].premium) + sum(additional_covers[].premium) + sum(excesses[].premium)
  function assetPremiumNoSasria(a) {
    let total = numOrZero(a.sum_insured_premium);
    try {
      const extras = JSON.parse(a.vehicle_extras || '[]');
      if (Array.isArray(extras)) extras.forEach(ex => { total += numOrZero(ex.premium); });
    } catch (_) {}
    try {
      const addl = JSON.parse(a.additional_covers || '[]');
      if (Array.isArray(addl)) addl.forEach(ac => { total += numOrZero(ac.premium); });
    } catch (_) {}
    try {
      const excs = JSON.parse(a.excesses || '[]');
      if (Array.isArray(excs)) excs.forEach(ex => { total += numOrZero(ex.premium); });
    } catch (_) {}
    return total;
  }

  // ── Entry points ─────────────────────────────────────────────────────────

  async function renderForContact(contactId) {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    setPageTitle('Policy Schedule');

    const headerActions = document.getElementById('header-actions');
    if (headerActions) headerActions.innerHTML = '';

    try {
      const contactRes = await Api.contacts.get(contactId);
      const client = contactRes.data || contactRes || {};
      const clientName = [client.first_name, client.last_name].filter(Boolean).join(' ') || client.company_name || '—';

      const policiesRes = await Api.policies.list({ contact_id: contactId, limit: 100 });
      const policies = policiesRes.data || policiesRes || [];

      await _renderSchedule(el, headerActions, clientName, client, null, policies, `#/contacts/${contactId}`);
    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load schedule: ${esc(err.message)}</div>`;
    }
  }

  async function renderForAccount(accountId) {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    setPageTitle('Policy Schedule');

    const headerActions = document.getElementById('header-actions');
    if (headerActions) headerActions.innerHTML = '';

    try {
      const accountRes = await Api.accounts.get(accountId);
      const account = accountRes.data || accountRes || {};
      const clientName = account.account_name || account.name || '—';

      const policiesRes = await Api.policies.list({ account_id: accountId, limit: 100 });
      const policies = policiesRes.data || policiesRes || [];

      await _renderSchedule(el, headerActions, clientName, null, account, policies, `#/accounts/${accountId}`);
    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load schedule: ${esc(err.message)}</div>`;
    }
  }

  async function renderForPolicy(policyId) {
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
    setPageTitle('Policy Schedule');

    const headerActions = document.getElementById('header-actions');
    if (headerActions) headerActions.innerHTML = '';

    try {
      const polRes = await Api.policies.get(policyId);
      const policy = polRes.data || polRes || {};

      let contact = null, account = null, clientName = '—';
      if (policy.contact_id) {
        try {
          const cRes = await Api.contacts.get(policy.contact_id);
          contact = cRes.data || cRes || {};
          clientName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.company_name || '—';
        } catch (_) {}
      } else if (policy.account_id) {
        try {
          const aRes = await Api.accounts.get(policy.account_id);
          account = aRes.data || aRes || {};
          clientName = account.account_name || account.name || '—';
        } catch (_) {}
      }

      await _renderSchedule(el, headerActions, clientName, contact, account, [policy], `#/policies/${policyId}`);
    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load schedule: ${esc(err.message)}</div>`;
    }
  }

  // ── Core renderer ─────────────────────────────────────────────────────────

  async function _renderSchedule(el, headerActions, clientName, contact, account, policies, backHref) {
    // Exclude cancelled/lapsed policies from schedule
    const activePolicies = policies.filter(p => !['Cancelled', 'Lapsed', 'Expired'].includes(p.policy_status));

    // Load assets for each policy, excluding sold/cancelled/decommissioned
    const SCHED_INACTIVE = ['Sold', 'Decommissioned', 'Inactive', 'Cancelled'];
    const policyDetails = await Promise.all(activePolicies.map(async (pol) => {
      const assetRes = await Api.assets.list({ policy_id: pol.id, limit: 200 }).catch(() => ({ data: [] }));
      const allAssets = assetRes.data || assetRes || [];
      return {
        policy: pol,
        assets: allAssets.filter(a => !SCHED_INACTIVE.includes(a.asset_status)),
      };
    }));

    // Grand totals — sum from asset-level premiums across all sections
    // grandPremium = asset.premium + extras[].premium + additional_covers[].premium
    // grandSasria is tracked separately so the summary can show the breakdown.
    let grandPremium = 0, grandSasria = 0, grandExcess = 0, grandValue = 0;
    policyDetails.forEach(({ assets }) => {
      assets.forEach(a => {
        grandPremium += assetPremiumNoSasria(a);
        grandValue   += assetValueAuto(a);
        grandSasria  += numOrZero(a.sasria);
        grandExcess  += numOrZero(a.excess);
      });
    });

    const today = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const policyNumbers = [...new Set(activePolicies.map(p => p.policy_number).filter(Boolean))].join(', ');
    const brokerCodes = [...new Set(activePolicies.map(p => p.broker_code_snapshot).filter(Boolean))].join(', ');

    // Address lines
    const addressParts = [];
    if (contact) {
      if (contact.street_address)  addressParts.push(esc(contact.street_address));
      if (contact.suburb)          addressParts.push(esc(contact.suburb));
      if (contact.city)            addressParts.push(esc(contact.city));
      if (contact.province)        addressParts.push(esc(contact.province));
      if (contact.postal_code)     addressParts.push(esc(contact.postal_code));
    } else if (account) {
      if (account.street_address)  addressParts.push(esc(account.street_address));
      if (account.city)            addressParts.push(esc(account.city));
      if (account.province)        addressParts.push(esc(account.province));
      if (account.postal_code)     addressParts.push(esc(account.postal_code));
    }

    // Header actions
    if (headerActions) {
      headerActions.innerHTML = `
        <a href="${esc(backHref)}" class="btn btn-secondary no-print">← Back</a>
        <button class="btn btn-primary no-print" onclick="PolicySchedule.printSchedule()">🖨 Print / Save as PDF</button>`;
    }

    setBreadcrumb(['Policy Schedule', clientName]);

    // ── Build HTML ────────────────────────────────────────────────────────
    const policyBlocksHtml = policyDetails.length
      ? policyDetails.map(({ policy, assets }) => _policyBlock(policy, assets)).join('')
      : `<div class="sched-no-policies">No active policies found for this client.</div>`;

    el.innerHTML = `
      <style>
        /* ── Print overrides ──────────────────────────────────────── */
        @media print {
          /* Remove fixed-height / overflow constraints that clip content to one page */
          html, body, .app-layout, .main-wrapper, .content-area {
            height: auto !important;
            overflow: visible !important;
            position: static !important;
          }
          body { background: #fff !important; margin: 0 !important; }
          .sidebar, .sidebar-overlay, .top-header, .header-bar,
          .header-actions, .no-print { display: none !important; }
          .main-wrapper { margin: 0 !important; padding: 0 !important; margin-left: 0 !important; }
          .content-area { padding: 0 !important; }
          .sched-wrap   { max-width: 100% !important; box-shadow: none !important; border-radius: 0 !important; }
          /* Page-break control */
          .sched-policy-block { page-break-inside: auto; }
          .sched-pol-header { page-break-after: avoid; }
          .sched-pol-details { page-break-after: avoid; }
          .sched-section-title { page-break-after: avoid; }
          .sched-assets-table { page-break-inside: auto; }
          .sched-assets-table thead { display: table-header-group; }
          .sched-assets-table tr { page-break-inside: avoid; }
          .sched-pol-subtotal { page-break-inside: avoid; }
        }
        /* ── Schedule styles ─────────────────────────────────────── */
        .sched-wrap {
          max-width: 960px; margin: 0 auto; background: #fff;
          box-shadow: 0 2px 12px rgba(0,0,0,.08); border-radius: 6px; overflow: hidden;
        }
        .sched-letterhead { display: block; width: 100%; height: auto; }
        .sched-title-bar {
          padding: 1rem 2rem .85rem; display: flex; justify-content: space-between;
          align-items: flex-start; gap: 1rem; border-bottom: 1px solid #e8e8e8;
        }
        .sched-title-bar h1 { margin: 0; font-size: 1.35rem; letter-spacing: .04em; color: #1a5276; }
        .sched-title-meta { text-align: right; font-size: .82rem; color: #555; line-height: 1.45; }
        .sched-client-bar {
          background: #f9f9f9; border-bottom: 1px solid #e8e8e8;
          padding: 1rem 2rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px,1fr)); gap: .75rem 2rem;
        }
        .sched-client-field label { font-size: .7rem; text-transform: uppercase; letter-spacing: .06em; color: #888; display: block; margin-bottom: .15rem; }
        .sched-client-field span  { font-weight: 600; font-size: .9rem; color: #222; }
        .sched-summary-bar {
          background: #222; color: #fff; padding: .65rem 2rem;
          display: flex; gap: 2.5rem; flex-wrap: wrap;
        }
        .sched-summary-item label { font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; opacity: .7; display: block; }
        .sched-summary-item span  { font-size: 1rem; font-weight: 700; }
        .sched-body { padding: 1.5rem 2rem; }
        .sched-policy-block { margin-bottom: 2.5rem; border: 1px solid #ddd; border-radius: 6px; overflow: hidden; }
        .sched-pol-header {
          background: #2c3e50; color: #fff; padding: .75rem 1rem;
          display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: .5rem;
        }
        .sched-pol-header h3 { margin: 0; font-size: 1rem; }
        .sched-pol-header .sched-pol-meta { font-size: .78rem; opacity: .8; display: flex; gap: 1.25rem; flex-wrap: wrap; }
        .sched-pol-details { background: #f5f5f5; padding: .6rem 1rem; display: flex; gap: 2rem; flex-wrap: wrap; border-bottom: 1px solid #ddd; }
        .sched-pol-details span { font-size: .8rem; color: #555; }
        .sched-pol-details strong { color: #222; }
        .sched-section-title { padding: .5rem 1rem; font-size: .78rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; background: #ecf0f1; color: #555; border-bottom: 1px solid #ddd; }
        .sched-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
        .sched-table th { background: #34495e; color: #fff; padding: .45rem .75rem; text-align: left; font-weight: 600; font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; }
        .sched-table th.num, .sched-table td.num { text-align: right; }
        .sched-table td { padding: .45rem .75rem; border-bottom: 1px solid #f0f0f0; color: #333; vertical-align: top; }
        .sched-table tr:last-child td { border-bottom: none; }
        .sched-table tr:hover td { background: #fafafa; }
        .sched-table tfoot td { font-weight: 700; background: #ecf0f1; border-top: 2px solid #bdc3c7; }
        .sched-pol-subtotal { padding: .5rem 1rem; background: #eaf4fb; font-size: .82rem; display: flex; gap: 2rem; border-top: 1px solid #d6e8f5; flex-wrap: wrap; }
        .sched-pol-subtotal span { color: #555; }
        .sched-pol-subtotal strong { color: #1a5276; }
        .sched-no-items { padding: .75rem 1rem; font-size: .82rem; color: #888; font-style: italic; }
        .sched-no-policies { padding: 2rem; text-align: center; color: #888; font-size: 1rem; }
        .sched-footer { background: #f9f9f9; border-top: 1px solid #e0e0e0; padding: .75rem 2rem; font-size: .75rem; color: #999; text-align: center; }
      </style>

      <div class="sched-wrap">

        <!-- Header -->
        <img class="sched-letterhead" src="/letterhead-ROA.png" alt="Inexpro">
        <div class="sched-title-bar">
          <h1>POLICY SCHEDULE</h1>
          <div class="sched-title-meta">
            Date Prepared: ${esc(today)}<br>
            ${activePolicies.length} polic${activePolicies.length !== 1 ? 'ies' : 'y'} included
          </div>
        </div>

        <!-- Client Details -->
        <div class="sched-client-bar">
          <div class="sched-client-field">
            <label>Insured</label>
            <span>${esc(clientName)}</span>
          </div>
          <div class="sched-client-field"><label>Policy Number${policyNumbers.includes(',') ? 's' : ''}</label><span>${esc(policyNumbers || '—')}</span></div>
          ${brokerCodes ? `<div class="sched-client-field"><label>Broker Code${brokerCodes.includes(',') ? 's' : ''}</label><span>${esc(brokerCodes)}</span></div>` : ''}
          ${contact && contact.company_name ? `<div class="sched-client-field"><label>Company</label><span>${esc(contact.company_name)}</span></div>` : ''}
          ${account && account.registration_number ? `<div class="sched-client-field"><label>Reg Number</label><span>${esc(account.registration_number)}</span></div>` : ''}
          ${addressParts.length ? `<div class="sched-client-field"><label>Address</label><span>${addressParts.join(', ')}</span></div>` : ''}
          ${contact && contact.email ? `<div class="sched-client-field"><label>Email</label><span>${esc(contact.email)}</span></div>` : ''}
          ${contact && contact.mobile_number ? `<div class="sched-client-field"><label>Mobile</label><span>${esc(contact.mobile_number)}</span></div>` : ''}
          ${account && account.email ? `<div class="sched-client-field"><label>Email</label><span>${esc(account.email)}</span></div>` : ''}
          ${account && account.phone ? `<div class="sched-client-field"><label>Phone</label><span>${esc(account.phone)}</span></div>` : ''}
        </div>

        <!-- Grand Summary Bar -->
        ${activePolicies.length ? `
        <div class="sched-summary-bar">
          <div class="sched-summary-item"><label>Total Policies</label><span>${activePolicies.length}</span></div>
          <div class="sched-summary-item"><label>Total Insured Value</label><span>${fmtCur(grandValue)}</span></div>
          <div class="sched-summary-item"><label>Total Premium</label><span>${fmtCur(grandPremium + grandSasria)}</span></div>
          ${grandSasria ? `<div class="sched-summary-item"><label>Total SASRIA (incl.)</label><span>${fmtCur(grandSasria)}</span></div>` : ''}
          ${grandExcess ? `<div class="sched-summary-item"><label>Total Excess</label><span>${fmtCur(grandExcess)}</span></div>` : ''}
        </div>` : ''}

        <!-- Policy Blocks -->
        <div class="sched-body">
          ${policyBlocksHtml}
        </div>

        <div class="sched-footer">
          This document is confidential and prepared for the exclusive use of ${esc(clientName)}.
          Inexpro CC &mdash; Authorised Financial Services Provider.
          <div style="margin-top:.35rem;font-weight:600;color:#555;">FSP No: 7591</div>
        </div>

      </div>`;
  }

  // ── Per-policy block ───────────────────────────────────────────────────────

  function _policyBlock(policy, assets) {
    const polPremium  = (policy.total_premium != null)
      ? numOrZero(policy.total_premium)
      : numOrZero(policy.premium);
    const assetValue  = assets.reduce((s, a) => s + assetValueAuto(a), 0);
    const assetPrem   = assets.reduce((s, a) => s + assetPremiumNoSasria(a), 0);
    const assetSasria = assets.reduce((s, a) => s + numOrZero(a.sasria), 0);
    const assetExcess = assets.reduce((s, a) => s + numOrZero(a.excess), 0);

    // Group assets by asset_section
    const sectionMap = new Map();
    assets.forEach(a => {
      const key = a.asset_section || 'Uncategorised';
      if (!sectionMap.has(key)) sectionMap.set(key, []);
      sectionMap.get(key).push(a);
    });

    const sectionKeys = [...sectionMap.keys()].sort((a, b) => {
      if (a === 'Uncategorised') return 1;
      if (b === 'Uncategorised') return -1;
      return a.localeCompare(b);
    });

    // Build per-section asset tables
    const sectionsHtml = sectionKeys.length ? sectionKeys.map(secName => {
      const items = sectionMap.get(secName);
      const secVal  = items.reduce((s, a) => s + assetValueAuto(a), 0);
      const secPrem = items.reduce((s, a) => s + assetPremiumNoSasria(a), 0);
      const secSas  = items.reduce((s, a) => s + numOrZero(a.sasria), 0);
      const secExc  = items.reduce((s, a) => s + numOrZero(a.excess), 0);

      return `
        <div class="sched-section-title">${esc(secName)}</div>
        <table class="sched-table sched-assets-table">
          <thead><tr>
            <th>#</th>
            <th>Description</th>
            <th>Type</th>
            <th>Make / Model</th>
            <th>Year</th>
            <th>Reg / Serial</th>
            <th class="num">Insured Value</th>
            <th class="num">Premium</th>
            <th class="num">SASRIA</th>
            <th class="num">Excess</th>
          </tr></thead>
          <tbody>
            ${items.map((a, i) => `
              <tr>
                <td style="color:#888;">${i + 1}</td>
                <td style="font-weight:500;">${esc(a.asset_name || '—')}</td>
                <td style="font-size:.78rem;">${esc(a.asset_type || '—')}</td>
                <td>${[a.make, a.model].filter(Boolean).map(esc).join(' ') || '—'}</td>
                <td>${esc(a.year || '—')}</td>
                <td style="font-size:.78rem;">${esc(a.registration_number || a.serial_number || '—')}</td>
                <td class="num">${fmtCur(assetValueAuto(a))}</td>
                <td class="num">${fmtCur(assetPremiumNoSasria(a))}</td>
                <td class="num">${fmtCur(a.sasria)}</td>
                <td class="num">${fmtCur(a.excess)}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot><tr>
            <td colspan="6"><strong>Section Total (${items.length} item${items.length !== 1 ? 's' : ''})</strong></td>
            <td class="num">${fmtCur(secVal)}</td>
            <td class="num">${fmtCur(secPrem)}</td>
            <td class="num">${secSas ? fmtCur(secSas) : '—'}</td>
            <td class="num">${secExc ? fmtCur(secExc) : '—'}</td>
          </tr></tfoot>
        </table>`;
    }).join('') : `<div class="sched-no-items">No insured items recorded for this policy.</div>`;

    return `
      <div class="sched-policy-block">
        <div class="sched-pol-header">
          <h3>${esc(policy.policy_name || policy.policy_number || '—')}</h3>
          <div class="sched-pol-meta">
            <span>Policy #: <strong>${esc(policy.policy_number || '—')}</strong></span>
            <span>Insurer: <strong>${esc(policy.insurer || '—')}</strong></span>
            <span>Status: <strong>${esc(policy.policy_status || '—')}</strong></span>
          </div>
        </div>
        <div class="sched-pol-details">
          <span>Product: <strong>${esc(policy.product_category || policy.policy_type || '—')}</strong></span>
          <span>Inception: <strong>${fmtDate(policy.inception_date)}</strong></span>
          <span>Renewal: <strong>${fmtDate(policy.renewal_date)}</strong></span>
          <span>Premium: <strong>${fmtCur(polPremium)}</strong></span>
          ${policy.broker_name ? `<span>Broker: <strong>${esc(policy.broker_name)}</strong></span>` : ''}
          ${policy.broker_code_snapshot ? `<span>Broker Code: <strong>${esc(policy.broker_code_snapshot)}${policy.broker_code_description_snapshot ? ` — ${esc(policy.broker_code_description_snapshot)}` : ''}</strong></span>` : ''}
        </div>
        ${sectionsHtml}
        ${assets.length ? `
        <div class="sched-pol-subtotal">
          <span>Policy Premium: <strong>${fmtCur(polPremium)}</strong></span>
          ${assetValue  ? `<span>Total Insured Value: <strong>${fmtCur(assetValue)}</strong></span>` : ''}
          ${assetPrem   ? `<span>Asset Premiums: <strong>${fmtCur(assetPrem)}</strong></span>` : ''}
          ${assetSasria ? `<span>SASRIA: <strong>${fmtCur(assetSasria)}</strong></span>` : ''}
        </div>` : ''}
      </div>`;
  }

  // ── Print using hidden iframe (avoids app shell overflow constraints) ─────

  function printSchedule() {
    const schedWrap = document.querySelector('.sched-wrap');
    if (!schedWrap) return;

    // Grab the inline <style> block that sits alongside .sched-wrap
    const inlineStyle = schedWrap.parentElement.querySelector('style');
    const styleText = inlineStyle ? inlineStyle.textContent : '';

    // Remove any previous print iframe
    const old = document.getElementById('sched-print-frame');
    if (old) old.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'sched-print-frame';
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Policy Schedule</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; font-size: 14px; background: #fff; color: #222; }
  ${styleText.replace(/@media print\s*\{[\s\S]*?\}\s*\}/, '')}
  .sched-wrap { max-width: 100%; box-shadow: none; border-radius: 0; }
  @media print {
    body { margin: 0; }
    .sched-policy-block { page-break-inside: auto; }
    .sched-pol-header { page-break-after: avoid; }
    .sched-pol-details { page-break-after: avoid; }
    .sched-section-title { page-break-after: avoid; }
    .sched-assets-table { page-break-inside: auto; }
    .sched-assets-table thead { display: table-header-group; }
    .sched-assets-table tr { page-break-inside: avoid; }
    .sched-pol-subtotal { page-break-inside: avoid; }
  }
</style>
</head><body>${schedWrap.outerHTML}</body></html>`);
    doc.close();

    let printed = false;
    const doPrint = () => {
      if (printed) return;
      printed = true;
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    };
    iframe.onload = doPrint;
    setTimeout(doPrint, 500);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return { renderForContact, renderForAccount, renderForPolicy, printSchedule };

})();
