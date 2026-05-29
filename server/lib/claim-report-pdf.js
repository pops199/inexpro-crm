'use strict';

// Per-claim detail report PDF, exposed via GET /api/claims/:id/report.pdf.
// Mirrors the look of the ROA / GIT Confirmation PDFs: Inexpro letterhead
// on page 1 only, branded footer on every page, body sections auto-break
// before the footer. Renders the same blocks the detail view shows
// (Claim Details, Parties, Financial, Driver, Client Comms, Incident,
// Notes) plus the tabular tabs (Notes / Third Parties / Assets /
// Documents / Workflows). Timeline + Versions are intentionally skipped.

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

/**
 * @param {{
 *   claim:        object,
 *   thirdParties: Array<object>,
 *   notes:        Array<object>,
 *   asset:        object | null,
 *   documents:    Array<object>,
 *   workflows:    Array<object>,
 * }} opts
 * @returns {Promise<Buffer>}
 */
async function renderClaimReportPdf({ claim, thirdParties, notes, asset, documents, workflows }) {
  claim        = claim        || {};
  thirdParties = thirdParties || [];
  notes        = notes        || [];
  documents    = documents    || [];
  workflows    = workflows    || [];

  const sym    = currencySymbol(claim.currency);
  const money  = (v) => fmtMoney(v, sym);

  const chunks = [];
  const pdfDoc = new PDFDocument({
    size: 'A4',
    margins: {
      top:    PAGE2_TOP,
      bottom: FOOTER_H + FOOTER_BUFFER,
      left:   MARGIN,
      right:  MARGIN,
    },
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
    function subHead(title) {
      checkBreak(24);
      pdfDoc.moveDown(0.3);
      pdfDoc.fontSize(BODY + 0.5).fillColor('#222').font('Helvetica-Bold')
        .text(title, MARGIN, pdfDoc.y, { width: CONTENT_W });
      pdfDoc.moveDown(0.15);
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
    // Simple table: header row in bold + a thin underline, then plain rows.
    // colSpecs = [{ label, key, width, fmt? }]; widths must sum to CONTENT_W.
    function tableHeader(colSpecs) {
      checkBreak(22);
      const y = pdfDoc.y;
      let x = MARGIN;
      pdfDoc.font('Helvetica-Bold').fontSize(SMALL).fillColor(PRIMARY);
      for (const c of colSpecs) {
        pdfDoc.text(c.label, x, y, { width: c.width, lineBreak: false });
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
      // Measure to handle wrap. Pick the tallest column.
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
        pdfDoc.text(cells[i], x, y, { width: c.width - 4 });
        x += c.width;
      });
      pdfDoc.y = y + h + 3;
    }

    // ═══ TITLE BLOCK ═════════════════════════════════════════════
    pdfDoc.fontSize(18).font('Helvetica-Bold').fillColor(PRIMARY)
      .text('Claim Report', MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'center' });
    pdfDoc.moveDown(0.2);
    pdfDoc.fontSize(13).font('Helvetica-Bold').fillColor('#222')
      .text(claim.claim_name || claim.claim_number || '—',
        MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'center' });
    pdfDoc.moveDown(0.3);
    pdfDoc.fontSize(SMALL).font('Helvetica').fillColor('#666')
      .text(`Generated ${dateLong(new Date().toISOString())}`,
        MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'center' });
    pdfDoc.moveDown(0.8);

    // Heading key-values
    labelValueRow('Claim Number', dash(claim.claim_number));
    labelValueRow('Policy',       claim.policy_name
      ? `${claim.policy_name}${claim.policy_number ? ' (' + claim.policy_number + ')' : ''}`
      : '—');
    if (claim.account_name) {
      labelValueRow('Account',    dash(claim.account_name));
    } else {
      labelValueRow('Contact',    dash(claim.contact_name));
    }

    // ═══ CLAIM DETAILS ════════════════════════════════════════════
    sectionHead('Claim Details');
    labelValueRow('Claim Number',     dash(claim.claim_number));
    labelValueRow('Claim Name',       dash(claim.claim_name));
    labelValueRow('Claim Type',       dash(claim.claim_type));
    labelValueRow('Status',           dash(claim.claim_status));
    labelValueRow('Date of Incident', dateStr(claim.claim_date));
    if (claim.incident_time) labelValueRow('Time of Incident', claim.incident_time);
    labelValueRow('Date Reported',    dateStr(claim.date_reported));

    // ═══ INCIDENT LOCATION (optional) ═════════════════════════════
    if (claim.incident_location_address || claim.incident_gps_lat || claim.incident_gps_lng) {
      sectionHead('Incident Location');
      if (claim.incident_location_address) labelValueRow('Address',       claim.incident_location_address);
      if (claim.incident_gps_lat)          labelValueRow('GPS Latitude',  claim.incident_gps_lat);
      if (claim.incident_gps_lng)          labelValueRow('GPS Longitude', claim.incident_gps_lng);
    }

    // ═══ POLICE REPORT (optional) ═════════════════════════════════
    if (claim.police_case_number || claim.police_station_reported ||
        claim.police_report_date_reported || claim.police_officer_name ||
        claim.police_report_received) {
      sectionHead('Police Report');
      if (claim.police_case_number)          labelValueRow('Case Number',     claim.police_case_number);
      if (claim.police_station_reported)     labelValueRow('Station',         claim.police_station_reported);
      if (claim.police_report_date_reported) labelValueRow('Date Reported',   dateStr(claim.police_report_date_reported));
      if (claim.police_officer_name)         labelValueRow('Officer Name',    claim.police_officer_name);
      labelValueRow('Report Received', yesNo(claim.police_report_received));
    }

    // ═══ PARTIES ══════════════════════════════════════════════════
    sectionHead('Parties');
    labelValueRow('Contact',        dash(claim.contact_name));
    labelValueRow('Account',        dash(claim.account_name));
    labelValueRow('Policy',         claim.policy_name
      ? `${claim.policy_name}${claim.policy_number ? ' (' + claim.policy_number + ')' : ''}`
      : '—');
    labelValueRow('Policy Section', dash(claim.policy_section_name || claim.section_name));
    labelValueRow('Asset',          dash(claim.asset_name));
    labelValueRow('Broker',         dash(claim.broker_name));
    labelValueRow('Claims Handler', dash(claim.claims_handler_name));
    labelValueRow('Insurer',        dash(claim.insurer));

    // ═══ CLAIM RELATED CONTACTS ═══════════════════════════════════
    const relContacts = safeJsonArray(claim.claim_related_contacts);
    if (relContacts.length) {
      sectionHead('Claim Related Contacts');
      const cols = [
        { label: 'Type',  key: 'contact_type', width: 130 },
        { label: 'Name',  key: 'name',         width: 160 },
        { label: 'Cell',  key: 'cell',         width: 100 },
        { label: 'Email', key: 'email',        width: CONTENT_W - 130 - 160 - 100 },
      ];
      tableHeader(cols);
      relContacts.forEach(r => tableRow(cols, r));
    }

    // ═══ FINANCIAL ═══════════════════════════════════════════════
    sectionHead('Financial');
    labelValueRow('Estimated Value',    money(claim.estimated_value));
    labelValueRow('Settlement Amount',  money(claim.settlement_amount));
    labelValueRow('Settlement Date',    dateStr(claim.settlement_date));
    if (claim.excess != null)              labelValueRow('Basic Excess',         money(claim.excess));
    if (claim.excess_pct_claim != null)    labelValueRow('Excess (% of Claim)',  claim.excess_pct_claim + '%');
    if (claim.excess_pct_insured != null)  labelValueRow('Excess (% of Insured)', claim.excess_pct_insured + '%');
    if (claim.minimum_excess != null)      labelValueRow('Minimum Excess',       money(claim.minimum_excess));

    // ═══ DRIVER DETAILS ══════════════════════════════════════════
    const hasDriver = claim.driver_name || claim.driver_id_number || claim.driver_licence_number ||
                      claim.driver_cell || claim.driver_relationship;
    if (hasDriver) {
      sectionHead('Driver Details');
      if (claim.driver_name)               labelValueRow('Driver Name',     claim.driver_name);
      if (claim.driver_id_number)          labelValueRow('ID Number',       claim.driver_id_number);
      if (claim.driver_licence_number)     labelValueRow('Licence Number',  claim.driver_licence_number);
      if (claim.driver_licence_code)       labelValueRow('Licence Code',    claim.driver_licence_code);
      if (claim.driver_cell)               labelValueRow('Cell Number',     claim.driver_cell);
      if (claim.driver_relationship)       labelValueRow('Relationship',    claim.driver_relationship);
      if (claim.driver_date_of_birth)      labelValueRow('Date of Birth',   dateStr(claim.driver_date_of_birth));
      if (claim.driver_years_experience != null)
        labelValueRow('Years of Experience', String(claim.driver_years_experience));
    }

    // ═══ CLIENT COMMUNICATION ═══════════════════════════════════
    sectionHead('Client Communication');
    labelValueRow('Client Kept Informed',     yesNo(claim.client_kept_informed));
    labelValueRow('Last Client Update Date',  dateStr(claim.last_client_update_date));
    labelValueRow('Delay Flag',               yesNo(claim.delay_flag));
    labelValueRow('Fair Process Concern',     yesNo(claim.fair_process_concern));

    // ═══ DISPUTE (optional) ══════════════════════════════════════
    if (claim.dispute_raised) {
      sectionHead('Dispute');
      labelValueRow('Dispute Raised', 'Yes');
      if (claim.dispute_details) paragraph('Dispute Details', claim.dispute_details);
    }

    // ═══ INCIDENT DESCRIPTION ════════════════════════════════════
    if (claim.incident_description) {
      sectionHead('Incident Description');
      pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222')
        .text(claim.incident_description, MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify', lineGap: 2 });
    }

    // ═══ OUTCOME (optional) ══════════════════════════════════════
    if (claim.rejection_reason || claim.outcome_notes) {
      sectionHead('Outcome');
      if (claim.rejection_reason) paragraph('Rejection Reason', claim.rejection_reason);
      if (claim.outcome_notes)    paragraph('Outcome Notes',    claim.outcome_notes);
    }

    // ═══ NOTES (main claim notes field) ══════════════════════════
    if (claim.notes) {
      sectionHead('Notes');
      pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222')
        .text(claim.notes, MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify', lineGap: 2 });
    }

    // ═══ TAB: NOTES ══════════════════════════════════════════════
    sectionHead('Claim Notes');
    if (!notes.length) {
      emptyLine('No notes recorded.');
    } else {
      notes.forEach((n, idx) => {
        subHead(`${idx + 1}. ${dateStr(n.note_date)}${n.created_by_name ? ' — ' + n.created_by_name : ''}`);
        if (n.details)          paragraph('Details',          n.details);
        if (n.expected_outcome) paragraph('Expected Outcome', n.expected_outcome);
      });
    }

    // ═══ TAB: THIRD PARTIES ══════════════════════════════════════
    sectionHead('Third Parties');
    if (!thirdParties.length) {
      emptyLine('No third parties recorded.');
    } else {
      thirdParties.forEach((tp, idx) => {
        const fullName = [tp.initials, tp.surname].filter(Boolean).join(' ').trim() || tp.surname || '(no name)';
        subHead(`${idx + 1}. ${fullName}`);
        if (tp.address)             labelValueRow('Address',         tp.address);
        if (tp.cell_no)             labelValueRow('Cell',            tp.cell_no);
        if (tp.telephone_no)        labelValueRow('Telephone',       tp.telephone_no);
        if (tp.occupation)          labelValueRow('Occupation',      tp.occupation);
        const vehicle = [tp.vehicle_make, tp.vehicle_model, tp.vehicle_reg].filter(Boolean).join(' ');
        if (vehicle)                labelValueRow('Vehicle',         vehicle);
        if (tp.damage_description)  paragraph('Damage', tp.damage_description);
        labelValueRow('Insured',                tp.is_insured ? 'Yes' + (tp.insurer ? ' — ' + tp.insurer : '') : 'No');
        if (tp.notes)               paragraph('Notes', tp.notes);
      });
    }

    // ═══ TAB: ASSETS ═════════════════════════════════════════════
    sectionHead('Asset');
    if (!asset || !asset.id) {
      emptyLine('No asset linked to this claim.');
    } else {
      labelValueRow('Asset Name',     dash(asset.asset_name));
      labelValueRow('Asset Type',     dash(asset.asset_type));
      labelValueRow('Section',        dash(asset.asset_section));
      if (asset.registration_number) labelValueRow('Registration',   asset.registration_number);
      if (asset.vin_number)          labelValueRow('VIN',            asset.vin_number);
      if (asset.make || asset.model || asset.year) {
        labelValueRow('Make / Model', [asset.make, asset.model, asset.year].filter(Boolean).join(' '));
      }
      if (asset.serial_number)       labelValueRow('Serial Number',  asset.serial_number);
      if (asset.asset_value != null) labelValueRow('Asset Value',    fmtMoney(asset.asset_value, currencySymbol(asset.currency || claim.currency)));
      if (asset.address)             labelValueRow('Address',        asset.address);
      if (asset.city)                labelValueRow('City',           asset.city);
    }

    // ═══ TAB: DOCUMENTS ══════════════════════════════════════════
    sectionHead('Documents');
    if (!documents.length) {
      emptyLine('No documents uploaded.');
    } else {
      const cols = [
        { label: 'File Name',   key: 'original_name', width: 200 },
        { label: 'Type',        key: 'file_type',     width: 70 },
        { label: 'Uploaded By', key: 'uploaded_by_name', width: 130 },
        { label: 'Date',        width: CONTENT_W - 200 - 70 - 130, fmt: d => dateStr(d.uploaded_at) },
      ];
      tableHeader(cols);
      documents.forEach(d => tableRow(cols, d));
    }

    // ═══ TAB: WORKFLOWS ══════════════════════════════════════════
    sectionHead('Workflows');
    if (!workflows.length) {
      emptyLine('No workflows linked to this claim.');
    } else {
      const cols = [
        { label: 'Description', key: 'description', width: 290 },
        { label: 'Due Date',    width: 95,  fmt: w => dateStr(w.due_date) },
        { label: 'Status',      key: 'status',       width: CONTENT_W - 290 - 95 },
      ];
      tableHeader(cols);
      workflows.forEach(w => tableRow(cols, w));
    }

    pdfDoc.end();
  });
}

module.exports = { renderClaimReportPdf };
