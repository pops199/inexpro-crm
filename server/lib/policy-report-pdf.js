'use strict';

// Per-policy detail report PDF, exposed via GET /api/policies/:id/report.pdf.
// Same letterhead/footer/section-head pattern as the ROA & GIT Confirmation
// PDFs. Renders the detail-view sections (Policy Details, Parties, Financial
// & Dates, Co-Insured, Banking, Cover & Notes, Cancellation) plus tab
// content (Sections, Assets, Claims, Commission, Post-Sale Events,
// Documents, Quotes, GIT Confirmations). Timeline + Versions are skipped.

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const PAGE2_TOP = 50;
const FOOTER_H = 80;
const FOOTER_BUFFER = 12;
const SAFE_BOTTOM = PAGE_H - (FOOTER_H + FOOTER_BUFFER);
const CONTENT_W = PAGE_W - MARGIN * 2;
const PRIMARY = '#1a5276';
const BODY = 10;
const SMALL = 9;
const H = 12;

const LETTERHEAD_PATH   = path.join(__dirname, '..', '..', 'client', 'public', 'letterhead-ROA.png');
const FOOTER_IMAGE_PATH = path.join(__dirname, '..', '..', 'client', 'public', 'letterhead-footer.jpg');

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

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
    const arr = safeJsonArray(json);
    arr.forEach(item => { total += parseFloat(item && item.premium) || 0; });
  }
  return total;
}

/**
 * @param {{
 *   policy:       object,
 *   assets:       Array<object>,
 *   claims:       Array<object>,
 *   commission:   Array<object>,
 *   postSale:     Array<object>,
 *   documents:    Array<object>,
 *   quotes:       Array<object>,
 *   gitConfirms:  Array<object>,
 * }} opts
 * @returns {Promise<Buffer>}
 */
async function renderPolicyReportPdf({ policy, assets, claims, commission, postSale, documents, quotes, gitConfirms }) {
  policy      = policy      || {};
  assets      = assets      || [];
  claims      = claims      || [];
  commission  = commission  || [];
  postSale    = postSale    || [];
  documents   = documents   || [];
  quotes      = quotes      || [];
  gitConfirms = gitConfirms || [];

  // Effective currency — same fallback the Sections tab uses: if the policy
  // is ZAR but every asset is NAD, treat the report as NAD.
  let effectiveCurrency = policy.currency || 'ZAR';
  if (effectiveCurrency !== 'NAD' && assets.length
      && assets.every(a => a && a.currency === 'NAD')) {
    effectiveCurrency = 'NAD';
  }
  const sym = currencySymbol(effectiveCurrency);
  const money = v => fmtMoney(v, sym);

  const isTransport = policy.policy_type === 'Transport' || policy.product_category === 'Transport';

  const chunks = [];
  const pdfDoc = new PDFDocument({
    size: 'A4',
    margins: { top: PAGE2_TOP, bottom: FOOTER_H + FOOTER_BUFFER, left: MARGIN, right: MARGIN },
    autoFirstPage: true,
  });
  pdfDoc.on('data', c => chunks.push(c));

  return new Promise((resolve, reject) => {
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);

    // ── Footer (every page) ────────────────────────────────────
    const FOOTER_TEXT_TOP = PAGE_H - FOOTER_H + 8;
    function drawFooter() {
      const savedX = pdfDoc.x;
      const savedY = pdfDoc.y;
      const savedFontName = pdfDoc._font && pdfDoc._font.name;
      const savedFontSize = pdfDoc._fontSize;
      if (fs.existsSync(FOOTER_IMAGE_PATH)) {
        pdfDoc.image(FOOTER_IMAGE_PATH, 0, PAGE_H - FOOTER_H, { width: PAGE_W, height: FOOTER_H });
      }
      pdfDoc.save();
      const origBottom = pdfDoc.page.margins.bottom;
      pdfDoc.page.margins.bottom = 0;
      try {
        const opts = { width: PAGE_W, align: 'center', lineBreak: false };
        pdfDoc.font('Helvetica-Bold').fontSize(8).fillColor(PRIMARY)
          .text('Inexpro Short Term Insurance', 0, FOOTER_TEXT_TOP, opts);
        pdfDoc.font('Helvetica').fontSize(7.5).fillColor(PRIMARY)
          .text('Steph@Inexpro.co.za  |  www.Inexpro.co.za', 0, FOOTER_TEXT_TOP + 12, opts);
        pdfDoc.fontSize(7).fillColor('#555')
          .text('CK 1995/049701/23  |  VAT 4240154593', 0, FOOTER_TEXT_TOP + 26, opts);
        pdfDoc.text('Inexpro is an authorised financial service provider — FSP Licence No. 7591',
          0, FOOTER_TEXT_TOP + 38, opts);
      } finally {
        pdfDoc.page.margins.bottom = origBottom;
      }
      pdfDoc.restore();
      if (savedFontName) pdfDoc.font(savedFontName);
      if (savedFontSize) pdfDoc.fontSize(savedFontSize);
      pdfDoc.x = savedX;
      pdfDoc.y = savedY;
    }

    // ── Letterhead on page 1 only ──────────────────────────────
    let firstPageTop = PAGE2_TOP;
    if (fs.existsSync(LETTERHEAD_PATH)) {
      const imgData = fs.readFileSync(LETTERHEAD_PATH);
      const imgW = imgData.readUInt32BE(16);
      const imgH = imgData.readUInt32BE(20);
      const renderedH = (imgH / imgW) * PAGE_W;
      pdfDoc.image(LETTERHEAD_PATH, 0, 0, { width: PAGE_W });
      firstPageTop = renderedH + 12;
    }
    drawFooter();
    pdfDoc.on('pageAdded', () => { drawFooter(); });

    pdfDoc.y = firstPageTop;
    pdfDoc.x = MARGIN;

    // ── Layout helpers ─────────────────────────────────────────
    function checkBreak(needed) {
      if (pdfDoc.y + needed > SAFE_BOTTOM) pdfDoc.addPage();
    }
    function sectionHead(title) {
      checkBreak(40);
      pdfDoc.moveDown(0.6);
      pdfDoc.fontSize(H).fillColor(PRIMARY).font('Helvetica-Bold')
        .text(title, MARGIN, pdfDoc.y, { width: CONTENT_W });
      pdfDoc.moveTo(MARGIN, pdfDoc.y + 2).lineTo(MARGIN + CONTENT_W, pdfDoc.y + 2)
        .strokeColor('#dee2e6').lineWidth(0.75).stroke();
      pdfDoc.moveDown(0.4);
      pdfDoc.fontSize(BODY).fillColor('#222').font('Helvetica');
    }
    function labelValueRow(label, value) {
      const LABEL_W = 160;
      checkBreak(18);
      const y = pdfDoc.y;
      pdfDoc.font('Helvetica-Bold').fontSize(BODY).fillColor('#222')
        .text(label + ':', MARGIN, y, { width: LABEL_W });
      const h1 = pdfDoc.heightOfString(label + ':', { width: LABEL_W });
      pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222')
        .text(String(value || dash(value)), MARGIN + LABEL_W, y, { width: CONTENT_W - LABEL_W });
      const h2 = pdfDoc.heightOfString(String(value || ''), { width: CONTENT_W - LABEL_W });
      pdfDoc.y = y + Math.max(h1, h2) + 2;
    }
    function paragraph(label, value) {
      if (!value) return;
      checkBreak(40);
      pdfDoc.moveDown(0.3);
      pdfDoc.font('Helvetica-Bold').fontSize(BODY).fillColor(PRIMARY)
        .text(label, MARGIN, pdfDoc.y, { width: CONTENT_W });
      pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222')
        .text(String(value), MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify', lineGap: 2 });
    }
    function emptyLine(msg) {
      pdfDoc.font('Helvetica-Oblique').fontSize(SMALL).fillColor('#777')
        .text(msg, MARGIN, pdfDoc.y, { width: CONTENT_W });
      pdfDoc.moveDown(0.3);
      pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222');
    }
    function tableHeader(colSpecs) {
      checkBreak(22);
      const y = pdfDoc.y;
      let x = MARGIN;
      pdfDoc.font('Helvetica-Bold').fontSize(SMALL).fillColor(PRIMARY);
      for (const c of colSpecs) {
        pdfDoc.text(c.label, x, y, { width: c.width, lineBreak: false, align: c.align || 'left' });
        x += c.width;
      }
      pdfDoc.y = y + 12;
      pdfDoc.moveTo(MARGIN, pdfDoc.y).lineTo(MARGIN + CONTENT_W, pdfDoc.y)
        .strokeColor('#dee2e6').lineWidth(0.5).stroke();
      pdfDoc.y += 2;
      pdfDoc.font('Helvetica').fontSize(SMALL).fillColor('#222');
    }
    function tableRow(colSpecs, row) {
      const cells = colSpecs.map(c => {
        const raw = c.fmt ? c.fmt(row) : row[c.key];
        return (raw === null || raw === undefined || raw === '') ? '—' : String(raw);
      });
      let h = 12;
      colSpecs.forEach((c, i) => {
        const hh = pdfDoc.heightOfString(cells[i], { width: c.width - 4 });
        if (hh > h) h = hh;
      });
      checkBreak(h + 4);
      const y = pdfDoc.y;
      let x = MARGIN;
      pdfDoc.font('Helvetica').fontSize(SMALL).fillColor('#222');
      colSpecs.forEach((c, i) => {
        pdfDoc.text(cells[i], x, y, { width: c.width - 4, align: c.align || 'left' });
        x += c.width;
      });
      pdfDoc.y = y + h + 3;
    }

    // ═══ TITLE BLOCK ═════════════════════════════════════════════
    pdfDoc.fontSize(18).font('Helvetica-Bold').fillColor(PRIMARY)
      .text('Policy Report', MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'center' });
    pdfDoc.moveDown(0.2);
    pdfDoc.fontSize(13).font('Helvetica-Bold').fillColor('#222')
      .text(policy.policy_name || policy.policy_number || '—',
        MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'center' });
    pdfDoc.moveDown(0.3);
    pdfDoc.fontSize(SMALL).font('Helvetica').fillColor('#666')
      .text(`Generated ${dateLong(new Date().toISOString())}`,
        MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'center' });
    pdfDoc.moveDown(0.8);

    labelValueRow('Policy Number', dash(policy.policy_number));
    labelValueRow('Insurer',       dash(policy.insurer));
    if (policy.account_name) {
      labelValueRow('Account',     dash(policy.account_name));
    } else {
      labelValueRow('Contact',     dash(policy.contact_name));
    }

    // ═══ POLICY DETAILS ══════════════════════════════════════════
    sectionHead('Policy Details');
    labelValueRow('Policy Number',    dash(policy.policy_number));
    labelValueRow('Policy Name',      dash(policy.policy_name));
    labelValueRow('Status',           dash(policy.policy_status));
    labelValueRow('Policy Type',      dash(policy.policy_type));
    labelValueRow('Product Category', dash(policy.product_category));
    labelValueRow('Insurer',          dash(policy.insurer));

    // ═══ PARTIES ══════════════════════════════════════════════════
    sectionHead('Parties');
    labelValueRow('Contact',          dash(policy.contact_name));
    labelValueRow('Account',          dash(policy.account_name));
    labelValueRow('Broker',           dash(policy.broker_name));
    if (policy.admin_name)       labelValueRow('Assigned Admin', policy.admin_name);
    if (policy.engagement_name)  labelValueRow('Engagement',     policy.engagement_name);

    // ═══ FINANCIAL & DATES ════════════════════════════════════════
    sectionHead('Financial & Dates');
    labelValueRow('Total Premium',
      money(policy.total_premium != null ? policy.total_premium : policy.premium));
    labelValueRow('Inception Date',     dateStr(policy.inception_date));
    labelValueRow('Renewal Date',       dateStr(policy.renewal_date));
    labelValueRow('Last Review Date',   dateStr(policy.last_review_date));
    labelValueRow('Next Review Date',   dateStr(policy.next_review_date));
    labelValueRow('Amendment Count',    String(policy.amendment_count != null ? policy.amendment_count : 0));
    labelValueRow('Claims Count',       String(policy.claims_count    != null ? policy.claims_count    : 0));
    labelValueRow('Disclosure Completed', yesNo(policy.disclosure_completed));

    // ═══ CO-INSURED & OTHER CONTACTS (if any) ════════════════════
    const otherContacts = Array.isArray(policy.other_contacts) ? policy.other_contacts : [];
    if (policy.co_insured || policy.co_insured_contact_id || policy.co_insured_name || otherContacts.length) {
      sectionHead('Co-Insured & Other Contacts');
      if (policy.co_insured_name || policy.co_insured) {
        labelValueRow('Co-Insured', policy.co_insured_name || policy.co_insured);
      }
      if (policy.co_insured_id_number) labelValueRow('Co-Insured ID', policy.co_insured_id_number);
      if (otherContacts.length) {
        labelValueRow('Other Contacts', otherContacts.map(oc => oc.name).filter(Boolean).join(', '));
      }
    }

    // ═══ BANKING / PAYMENT (if present) ══════════════════════════
    if (policy.payment_method || policy.bank_name || policy.account_holder_name || policy.mandate_status) {
      sectionHead('Banking / Payment Details');
      labelValueRow('Payment Method',      dash(policy.payment_method));
      labelValueRow('Premium Frequency',   dash(policy.premium_frequency));
      labelValueRow('Debit Order Date',    dash(policy.debit_order_date));
      labelValueRow('Bank Name',           dash(policy.bank_name));
      labelValueRow('Branch Code',         dash(policy.branch_code));
      // Account number is encrypted at rest — show masked tail only.
      const acctMasked = policy.account_number_enc
        ? '••••••••' + String(policy.account_number_enc).slice(-4) : '—';
      labelValueRow('Account Number',      acctMasked);
      labelValueRow('Account Type',        dash(policy.account_type));
      labelValueRow('Account Holder',      dash(policy.account_holder_name));
      labelValueRow('Mandate Status',      dash(policy.mandate_status));
      labelValueRow('Mandate Auth Date',   dateStr(policy.mandate_auth_date));
      labelValueRow('Debit Order Reference', dash(policy.debit_order_reference));
    }

    // ═══ COVER & NOTES (if present) ══════════════════════════════
    if (policy.cover_description || policy.notes) {
      sectionHead('Cover & Notes');
      if (policy.cover_description) paragraph('Cover Description', policy.cover_description);
      if (policy.notes)             paragraph('Notes',             policy.notes);
    }

    // ═══ CANCELLATION (if cancelled) ═════════════════════════════
    if (policy.policy_status === 'Cancelled') {
      sectionHead('Cancellation');
      labelValueRow('Cancellation Date',   dateStr(policy.cancellation_date));
      labelValueRow('Cancellation Reason', dash(policy.cancellation_reason));
    }

    // ═══ TAB: SECTIONS ═══════════════════════════════════════════
    sectionHead('Sections');
    // Aggregate by asset_section across linked assets.
    if (!assets.length) {
      emptyLine('No assets linked yet — no sections to report.');
    } else {
      const SECTION_INACTIVE = ['Sold', 'Decommissioned', 'Inactive', 'Cancelled'];
      const activeAssets = assets.filter(a => !SECTION_INACTIVE.includes(a.asset_status));
      const byKey = new Map();
      for (const a of activeAssets) {
        const k = a.asset_section || '(Unassigned)';
        if (!byKey.has(k)) byKey.set(k, { sumInsured: 0, premium: 0, count: 0 });
        const agg = byKey.get(k);
        agg.count       += 1;
        agg.sumInsured  += parseFloat(a.asset_value) || 0;
        agg.premium     += premiumFromAsset(a);
      }
      const sectionRows = [...byKey.entries()]
        .map(([section, agg]) => ({ section, ...agg }))
        .sort((a, b) => a.section.localeCompare(b.section));

      if (!sectionRows.length) {
        emptyLine('No active sections.');
      } else {
        const cols = [
          { label: 'Section',      key: 'section', width: 230 },
          { label: 'Assets',       width: 50,  align: 'right', fmt: r => r.count },
          { label: 'Sum Insured',  width: 110, align: 'right', fmt: r => money(r.sumInsured) },
          { label: 'Premium',      width: CONTENT_W - 230 - 50 - 110, align: 'right', fmt: r => money(r.premium) },
        ];
        tableHeader(cols);
        sectionRows.forEach(r => tableRow(cols, r));
      }
    }

    // ═══ TAB: ASSETS ══════════════════════════════════════════════
    sectionHead('Assets');
    if (!assets.length) {
      emptyLine('No assets linked to this policy.');
    } else {
      const cols = [
        { label: 'Asset',     key: 'asset_name',    width: 140 },
        { label: 'Type',      key: 'asset_type',    width: 70  },
        { label: 'Section',   key: 'asset_section', width: 130 },
        { label: 'Value',     width: 90, align: 'right', fmt: a => money(a.asset_value) },
        { label: 'Premium',   width: CONTENT_W - 140 - 70 - 130 - 90, align: 'right',
          fmt: a => money(premiumFromAsset(a)) },
      ];
      tableHeader(cols);
      assets.forEach(a => tableRow(cols, a));
    }

    // ═══ TAB: CLAIMS ══════════════════════════════════════════════
    sectionHead('Claims');
    if (!claims.length) {
      emptyLine('No claims on this policy.');
    } else {
      const cols = [
        { label: 'Claim Number', key: 'claim_number', width: 110 },
        { label: 'Type',         key: 'claim_type',   width: 85 },
        { label: 'Status',       key: 'claim_status', width: 75 },
        { label: 'Date',         width: 70, fmt: c => dateStr(c.claim_date) },
        { label: 'Estimated',    width: CONTENT_W - 110 - 85 - 75 - 70, align: 'right',
          fmt: c => money(c.estimated_value) },
      ];
      tableHeader(cols);
      claims.forEach(c => tableRow(cols, c));
    }

    // ═══ TAB: COMMISSION ══════════════════════════════════════════
    sectionHead('Commission');
    if (!commission.length) {
      emptyLine('No commission entries logged.');
    } else {
      const cols = [
        { label: 'Type',       key: 'commission_type', width: 140 },
        { label: 'Rate',       width: 50,  align: 'right',
          fmt: r => r.commission_rate != null ? r.commission_rate + '%' : '—' },
        { label: 'Amount',     width: 95,  align: 'right',
          fmt: r => money(r.commission_amount) },
        { label: 'In ROA',     width: 55,  align: 'center', fmt: r => yesNo(r.disclosed_in_roa) },
        { label: 'Arrangement', key: 'insurer_arrangement',
          width: CONTENT_W - 140 - 50 - 95 - 55 },
      ];
      tableHeader(cols);
      commission.forEach(r => tableRow(cols, r));
    }

    // ═══ TAB: POST-SALE EVENTS ════════════════════════════════════
    sectionHead('Post-Sale Events');
    if (!postSale.length) {
      emptyLine('No post-sale events logged.');
    } else {
      const cols = [
        { label: 'Date',    width: 65, fmt: r => dateStr(r.event_date) },
        { label: 'Type',    key: 'event_type', width: 140 },
        { label: 'Outcome', key: 'outcome',    width: 100 },
        { label: 'Days',    width: 40, align: 'right',
          fmt: r => r.days_to_action != null ? r.days_to_action : '—' },
        { label: 'Barrier', width: CONTENT_W - 65 - 140 - 100 - 40, align: 'center',
          fmt: r => r.barrier_flagged ? 'Yes' : 'No' },
      ];
      tableHeader(cols);
      postSale.forEach(r => tableRow(cols, r));
    }

    // ═══ TAB: DOCUMENTS ═══════════════════════════════════════════
    sectionHead('Documents');
    if (!documents.length) {
      emptyLine('No documents uploaded.');
    } else {
      const cols = [
        { label: 'File Name',   key: 'original_name',    width: 200 },
        { label: 'Type',        key: 'file_type',        width: 70 },
        { label: 'Uploaded By', key: 'uploaded_by_name', width: 130 },
        { label: 'Date',        width: CONTENT_W - 200 - 70 - 130, fmt: d => dateStr(d.uploaded_at) },
      ];
      tableHeader(cols);
      documents.forEach(d => tableRow(cols, d));
    }

    // ═══ TAB: QUOTES ══════════════════════════════════════════════
    sectionHead('Quotes & Schedules');
    if (!quotes.length) {
      emptyLine('No quotes or existing schedules uploaded.');
    } else {
      const cols = [
        { label: 'File Name',     key: 'original_name', width: 200 },
        { label: 'Document Type', key: 'document_type', width: 80 },
        { label: 'Approved',      width: 70, fmt: q => dateStr(q.approved_at) },
        { label: 'Uploaded By',   key: 'uploaded_by_name', width: 110 },
        { label: 'Uploaded',      width: CONTENT_W - 200 - 80 - 70 - 110,
          fmt: q => dateStr(q.uploaded_at) },
      ];
      tableHeader(cols);
      quotes.forEach(q => tableRow(cols, q));
    }

    // ═══ TAB: GIT CONFIRMATIONS (Transport policies only) ═════════
    if (isTransport) {
      sectionHead('GIT Confirmations');
      if (!gitConfirms.length) {
        emptyLine('No GIT Confirmations issued.');
      } else {
        const cols = [
          { label: 'Recipient', key: 'recipient_name',  width: 160 },
          { label: 'Email',     key: 'recipient_email', width: 170 },
          { label: 'Status',    key: 'status',          width: 70 },
          { label: 'Created',   width: 60, fmt: r => dateStr(r.created_at) },
          { label: 'Signed',    width: CONTENT_W - 160 - 170 - 70 - 60,
            fmt: r => dateStr(r.signed_at) },
        ];
        tableHeader(cols);
        gitConfirms.forEach(r => tableRow(cols, r));
      }
    }

    pdfDoc.end();
  });
}

module.exports = { renderPolicyReportPdf };
