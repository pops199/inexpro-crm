'use strict';

// Per-policy detail report as an .xlsx workbook, exposed via
// GET /api/policies/:id/report.xlsx. Mirrors policy-report-pdf.js section by
// section (Policy Details, Parties, Financial & Dates, Co-Insured, Banking,
// Cover & Notes, Cancellation, then the tab tables) styled to resemble the
// PDF: the Inexpro letterhead image up top, shaded section bands, bordered /
// right-aligned tables, and the footer band. Built on the dependency-free
// ./xlsx writer.

const fs = require('fs');
const path = require('path');
const { buildWorkbook, STYLES } = require('./xlsx');

const NCOLS = 5; // widest table — section bands span this many columns
const EMU_PER_PX = 9525;
const LETTERHEAD_PATH = path.join(__dirname, '..', '..', 'client', 'public', 'letterhead-ROA.png');

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── Formatters (mirror policy-report-pdf.js so output matches the PDF) ──────
function dateStr(v) {
  if (!v) return '—';
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : (v || '—');
}
function dateLong(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function dash(v) {
  if (v === null || v === undefined) return '—';
  const s = String(v).trim();
  return s === '' ? '—' : s;
}
function currencySymbol(c) {
  switch ((c || 'ZAR').toUpperCase()) {
    case 'NAD': return 'N$';
    case 'USD': return '$';
    case 'EUR': return '€';
    case 'GBP': return '£';
    default:    return 'R';
  }
}
function fmtMoney(v, sym) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${sym} ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function yesNo(v) { return v ? 'Yes' : 'No'; }
function safeJsonArray(s) {
  if (!s) return [];
  try {
    const v = typeof s === 'string' ? JSON.parse(s) : s;
    return Array.isArray(v) ? v : [];
  } catch (_) { return []; }
}
function premiumFromAsset(a) {
  let total = 0;
  total += parseFloat(a.sasria) || 0;
  total += parseFloat(a.sum_insured_premium) || 0;
  for (const json of [a.vehicle_extras, a.additional_covers, a.excesses]) {
    safeJsonArray(json).forEach(item => { total += parseFloat(item && item.premium) || 0; });
  }
  return total;
}

// Letterhead → { data, widthEmu, heightEmu, reserveRows } anchored at A1.
function loadLetterhead() {
  try {
    const data = fs.readFileSync(LETTERHEAD_PATH);
    if (data.slice(1, 4).toString() !== 'PNG') return null;
    const w = data.readUInt32BE(16);
    const h = data.readUInt32BE(20);
    if (!w || !h) return null;
    const widthPx  = 480;
    const heightPx = Math.round(widthPx * h / w);
    return {
      data,
      widthEmu:  widthPx  * EMU_PER_PX,
      heightEmu: heightPx * EMU_PER_PX,
      reserveRows: Math.ceil(heightPx / 20) + 1, // ~20px per default row + buffer
    };
  } catch (_) { return null; }
}

/**
 * @param {{ policy, assets, claims, commission, postSale, documents, quotes, gitConfirms }} opts
 * @returns {Buffer} .xlsx workbook
 */
function renderPolicyReportXlsx({ policy, assets, claims, commission, postSale, documents, quotes, gitConfirms } = {}) {
  policy      = policy      || {};
  assets      = assets      || [];
  claims      = claims      || [];
  commission  = commission  || [];
  postSale    = postSale    || [];
  documents   = documents   || [];
  quotes      = quotes      || [];
  gitConfirms = gitConfirms || [];

  let effectiveCurrency = policy.currency || 'ZAR';
  if (effectiveCurrency !== 'NAD' && assets.length
      && assets.every(a => a && a.currency === 'NAD')) {
    effectiveCurrency = 'NAD';
  }
  const sym = currencySymbol(effectiveCurrency);
  const money = v => fmtMoney(v, sym);
  const isTransport = policy.policy_type === 'Transport' || policy.product_category === 'Transport';

  const rows = [];
  const B       = (v) => ({ v, bold: true });
  const blank   = () => rows.push([]);
  const kv      = (label, value) => rows.push([B(label), value === undefined || value === null ? '—' : value]);
  const empty   = (msg) => rows.push([msg]);
  // Shaded section band spanning all columns.
  const section = (title) => {
    blank();
    const band = [{ v: title, s: STYLES.section }];
    for (let i = 1; i < NCOLS; i++) band.push({ s: STYLES.section });
    rows.push(band);
  };
  // Bordered table: bold shaded header + bordered body; `numeric` col indices right-align.
  const table = (headers, dataRows, numeric = new Set()) => {
    rows.push(headers.map((h, i) => ({ v: h, s: numeric.has(i) ? STYLES.theadRight : STYLES.thead })));
    dataRows.forEach(r => rows.push(r.map((c, i) => ({ v: c, s: numeric.has(i) ? STYLES.cellRight : STYLES.cell }))));
  };

  // ── Letterhead image (header) ──
  const lh = loadLetterhead();
  if (lh) {
    for (let i = 0; i < lh.reserveRows; i++) blank(); // reserve space the floating image sits over
  } else {
    // No image available → fall back to a text brand line.
    rows.push([{ v: 'Inexpro Short Term Insurance', s: STYLES.title }]);
    rows.push(['Steph@Inexpro.co.za  |  www.Inexpro.co.za']);
    blank();
  }

  // ── Title / identity ──
  rows.push([{ v: 'Policy Report', s: STYLES.title }]);
  rows.push([B(policy.policy_name || policy.policy_number || '—')]);
  rows.push([`Generated ${dateLong(new Date().toISOString())}`]);
  blank();
  kv('Policy Number', dash(policy.policy_number));
  kv('Insurer',       dash(policy.insurer));
  if (policy.account_name) kv('Account', dash(policy.account_name));
  else                     kv('Contact', dash(policy.contact_name));

  // ── Policy Details ──
  section('Policy Details');
  kv('Policy Number',    dash(policy.policy_number));
  kv('Policy Name',      dash(policy.policy_name));
  kv('Status',           dash(policy.policy_status));
  kv('Policy Type',      dash(policy.policy_type));
  kv('Product Category', dash(policy.product_category));
  kv('Insurer',          dash(policy.insurer));

  // ── Parties ──
  section('Parties');
  kv('Contact', dash(policy.contact_name));
  kv('Account', dash(policy.account_name));
  kv('Broker',  dash(policy.broker_name));
  if (policy.admin_name)      kv('Assigned Admin', policy.admin_name);
  if (policy.engagement_name) kv('Engagement',     policy.engagement_name);

  // ── Financial & Dates ──
  section('Financial & Dates');
  kv('Total Premium', money(policy.total_premium != null ? policy.total_premium : policy.premium));
  kv('Inception Date',       dateStr(policy.inception_date));
  kv('Renewal Date',         dateStr(policy.renewal_date));
  kv('Last Review Date',     dateStr(policy.last_review_date));
  kv('Next Review Date',     dateStr(policy.next_review_date));
  kv('Amendment Count',      String(policy.amendment_count != null ? policy.amendment_count : 0));
  kv('Claims Count',         String(policy.claims_count    != null ? policy.claims_count    : 0));
  kv('Disclosure Completed', yesNo(policy.disclosure_completed));

  // ── Co-Insured & Other Contacts (if any) ──
  const otherContacts = Array.isArray(policy.other_contacts) ? policy.other_contacts : [];
  if (policy.co_insured || policy.co_insured_contact_id || policy.co_insured_name || otherContacts.length) {
    section('Co-Insured & Other Contacts');
    if (policy.co_insured_name || policy.co_insured) kv('Co-Insured', policy.co_insured_name || policy.co_insured);
    if (policy.co_insured_id_number) kv('Co-Insured ID', policy.co_insured_id_number);
    if (otherContacts.length) kv('Other Contacts', otherContacts.map(oc => oc.name).filter(Boolean).join(', '));
  }

  // ── Banking / Payment (if present) ──
  if (policy.payment_method || policy.bank_name || policy.account_holder_name || policy.mandate_status) {
    section('Banking / Payment Details');
    kv('Payment Method',        dash(policy.payment_method));
    kv('Premium Frequency',     dash(policy.premium_frequency));
    kv('Debit Order Date',      dash(policy.debit_order_date));
    kv('Bank Name',             dash(policy.bank_name));
    kv('Branch Code',           dash(policy.branch_code));
    const acctMasked = policy.account_number_enc
      ? '••••••••' + String(policy.account_number_enc).slice(-4) : '—';
    kv('Account Number',        acctMasked);
    kv('Account Type',          dash(policy.account_type));
    kv('Account Holder',        dash(policy.account_holder_name));
    kv('Mandate Status',        dash(policy.mandate_status));
    kv('Mandate Auth Date',     dateStr(policy.mandate_auth_date));
    kv('Debit Order Reference', dash(policy.debit_order_reference));
  }

  // ── Cover & Notes (if present) ──
  if (policy.cover_description || policy.notes) {
    section('Cover & Notes');
    if (policy.cover_description) kv('Cover Description', policy.cover_description);
    if (policy.notes)             kv('Notes',             policy.notes);
  }

  // ── Cancellation (if cancelled) ──
  if (policy.policy_status === 'Cancelled') {
    section('Cancellation');
    kv('Cancellation Date',   dateStr(policy.cancellation_date));
    kv('Cancellation Reason', dash(policy.cancellation_reason));
  }

  // ── Sections (aggregated by asset_section) ──
  section('Sections');
  if (!assets.length) {
    empty('No assets linked yet — no sections to report.');
  } else {
    const SECTION_INACTIVE = ['Sold', 'Decommissioned', 'Inactive', 'Cancelled'];
    const byKey = new Map();
    for (const a of assets.filter(a => !SECTION_INACTIVE.includes(a.asset_status))) {
      const k = a.asset_section || '(Unassigned)';
      if (!byKey.has(k)) byKey.set(k, { sumInsured: 0, premium: 0, count: 0 });
      const agg = byKey.get(k);
      agg.count      += 1;
      agg.sumInsured += parseFloat(a.asset_value) || 0;
      agg.premium    += premiumFromAsset(a);
    }
    const sectionRows = [...byKey.entries()]
      .map(([s, agg]) => ({ section: s, ...agg }))
      .sort((a, b) => a.section.localeCompare(b.section));
    if (!sectionRows.length) {
      empty('No active sections.');
    } else {
      table(
        ['Section', 'Assets', 'Sum Insured', 'Premium'],
        sectionRows.map(r => [r.section, r.count, money(r.sumInsured), money(r.premium)]),
        new Set([1, 2, 3]),
      );
    }
  }

  // ── Assets ──
  section('Assets');
  if (!assets.length) {
    empty('No assets linked to this policy.');
  } else {
    table(
      ['Asset', 'Type', 'Section', 'Value', 'Premium'],
      assets.map(a => [dash(a.asset_name), dash(a.asset_type), dash(a.asset_section), money(a.asset_value), money(premiumFromAsset(a))]),
      new Set([3, 4]),
    );
  }

  // ── Claims ──
  section('Claims');
  if (!claims.length) {
    empty('No claims on this policy.');
  } else {
    table(
      ['Claim Number', 'Type', 'Status', 'Date', 'Estimated'],
      claims.map(c => [dash(c.claim_number), dash(c.claim_type), dash(c.claim_status), dateStr(c.claim_date), money(c.estimated_value)]),
      new Set([4]),
    );
  }

  // ── Commission ──
  section('Commission');
  if (!commission.length) {
    empty('No commission entries logged.');
  } else {
    table(
      ['Type', 'Rate', 'Amount', 'In ROA', 'Arrangement'],
      commission.map(r => [
        dash(r.commission_type),
        r.commission_rate != null ? r.commission_rate + '%' : '—',
        money(r.commission_amount),
        yesNo(r.disclosed_in_roa),
        dash(r.insurer_arrangement),
      ]),
      new Set([1, 2]),
    );
  }

  // ── Post-Sale Events ──
  section('Post-Sale Events');
  if (!postSale.length) {
    empty('No post-sale events logged.');
  } else {
    table(
      ['Date', 'Type', 'Outcome', 'Days', 'Barrier'],
      postSale.map(r => [
        dateStr(r.event_date), dash(r.event_type), dash(r.outcome),
        r.days_to_action != null ? r.days_to_action : '—',
        r.barrier_flagged ? 'Yes' : 'No',
      ]),
      new Set([3]),
    );
  }

  // ── Documents ──
  section('Documents');
  if (!documents.length) {
    empty('No documents uploaded.');
  } else {
    table(
      ['File Name', 'Type', 'Uploaded By', 'Date'],
      documents.map(d => [dash(d.original_name), dash(d.file_type), dash(d.uploaded_by_name), dateStr(d.uploaded_at)]),
    );
  }

  // ── Quotes & Schedules ──
  section('Quotes & Schedules');
  if (!quotes.length) {
    empty('No quotes or existing schedules uploaded.');
  } else {
    table(
      ['File Name', 'Document Type', 'Approved', 'Uploaded By', 'Uploaded'],
      quotes.map(q => [dash(q.original_name), dash(q.document_type), dateStr(q.approved_at), dash(q.uploaded_by_name), dateStr(q.uploaded_at)]),
    );
  }

  // ── GIT Confirmations (Transport policies only) ──
  if (isTransport) {
    section('GIT Confirmations');
    if (!gitConfirms.length) {
      empty('No GIT Confirmations issued.');
    } else {
      table(
        ['Recipient', 'Email', 'Status', 'Created', 'Signed'],
        gitConfirms.map(r => [dash(r.recipient_name), dash(r.recipient_email), dash(r.status), dateStr(r.created_at), dateStr(r.signed_at)]),
      );
    }
  }

  // ── Footer block (mirrors the PDF footer band) ──
  blank();
  rows.push([B('Inexpro Short Term Insurance')]);
  rows.push(['Steph@Inexpro.co.za  |  www.Inexpro.co.za']);
  rows.push(['CK 1995/049701/23  |  VAT 4240154593']);
  rows.push(['Inexpro is an authorised financial service provider — FSP Licence No. 7591']);

  const cols = [{ width: 34 }, { width: 30 }, { width: 16 }, { width: 16 }, { width: 16 }];

  return buildWorkbook({
    sheetName: 'Policy Report',
    columns: [],
    rows,
    cols,
    image: lh ? { data: lh.data, widthEmu: lh.widthEmu, heightEmu: lh.heightEmu } : null,
    headerFooter: {
      oddHeader: '&C&"Calibri,Bold"&12Inexpro Short Term Insurance',
      oddFooter: '&LInexpro — authorised FSP, Licence No. 7591&RPage &P of &N',
    },
  });
}

module.exports = { renderPolicyReportXlsx };
