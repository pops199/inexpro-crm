'use strict';

// Belogix Namibia variant of the Goods-in-Transit Confirmation of Insurance.
// Triggered when the broker picks N$ as the currency in the GIT Confirmation
// modal. Same form data and same signing flow as the South African renderer
// (server/lib/git-confirmation-pdf.js) — different letterhead, different
// footer, different title, and a table-style summary that mirrors the
// "Belogix Namibia GIT Confirmation of Cover.docx" source document.
//
// Used by:
//   - server/routes/policies.js          → POST /:id/git-confirmation
//     (broker downloads an unsigned preview)
//   - server/routes/public-signing.js    → POST /sign/:token for
//     template_key === 'git_confirmation' AND form_data.currency === 'NAD'

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const PAGE2_TOP = 50;
const FOOTER_H = 90;
const FOOTER_BUFFER = 12;
const SAFE_BOTTOM = PAGE_H - (FOOTER_H + FOOTER_BUFFER);
const CONTENT_W = PAGE_W - MARGIN * 2;
const PRIMARY = '#1a5276';
const BODY = 10;
const SMALL = 9;
const H = 12;

const LETTERHEAD_PATH = path.join(__dirname, '..', '..', 'client', 'public', 'letterhead-belogix-namibia.jpg');
const FOOTER_IMAGE_PATH = path.join(__dirname, '..', '..', 'client', 'public', 'letterhead-belogix-namibia-footer.jpg');

// Default boilerplate for the three editable Namibian sections. Used when
// the broker leaves the textarea blank. Kept in sync with NAM_DEFAULTS in
// client/src/components/policies.js (_openGitConfirmation).
const DEFAULT_EXCLUDED_COMMODITIES =
  'Antiques or antiquities of any description, arms, ammunition, artworks, live animals of any description, bank and treasury notes, cash, travellers cheques, bullion, platinum, cobalt, copper, deeds, designs, documents of any description, explosives, furs, jewellery, patterns, plans, precious metals or stones, specie, stamps, tickets, tobacco, brass and scrap metal, exotic sea foods including caviar, prawns, calamari and crayfish, aircraft and their parts and accessories.';
const DEFAULT_VALID_DRIVERS_LICENCE =
  'A valid PDP (Professional Driving Permit) is a prerequisite for the operation of goods vehicles, and any claim arising in its absence shall be deemed null and void.';
const DEFAULT_SECURITY_CONDITIONS =
  'Cover under this section as a result of theft, hijack or any attempt thereat is subject to the following:\n' +
  '(a) The Insured must be able to prove that, prior to the happening of such theft or hijack, a vehicle tracking and recovery device was installed in the insured vehicle.\n' +
  '(b) To the best of the Insured’s knowledge, the vehicle tracking and recovery device was, at the time of the loss, in working order.\n' +
  '(c) A legal contract must exist between the Insured and the vehicle recovery service provider, and any subscription fees must be paid up to date at the time of the theft or hijack.\n' +
  '(d) The theft or hijacking is immediately reported to the service provider.\n\n' +
  'Should the Insured not comply with all of points (a) to (d) above, and regardless of anything to the contrary contained in the policy schedule, no cover will be provided by this section.';

function fmtN(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v || '');
  return 'N$' + n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateLong(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * @param {{policy: object, body: object, signature?: {buf:Buffer, signerName:string, signedAt:Date, signedIp?:string, signedUa?:string}}} opts
 * @returns {Promise<Buffer>}
 */
async function renderBelogixNamibiaGitConfirmationPdf({ policy, body, signature, brokerSignaturePath }) {
  policy = policy || {};
  body = body || {};

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

    // ── Footer (every page) — Crown Insurance Brokers branding ────
    const FOOTER_TEXT_TOP = PAGE_H - FOOTER_H + 12;
    function drawFooter() {
      const savedX = pdfDoc.x;
      const savedY = pdfDoc.y;
      const savedFontName = pdfDoc._font && pdfDoc._font.name;
      const savedFontSize = pdfDoc._fontSize;
      if (fs.existsSync(FOOTER_IMAGE_PATH)) {
        // Decorative wave image runs the full page width along the bottom.
        pdfDoc.image(FOOTER_IMAGE_PATH, 0, PAGE_H - FOOTER_H, { width: PAGE_W });
      }
      pdfDoc.save();
      const origBottom = pdfDoc.page.margins.bottom;
      pdfDoc.page.margins.bottom = 0;
      try {
        const opts = { width: PAGE_W, align: 'center', lineBreak: false };
        pdfDoc.font('Helvetica-Bold').fontSize(8.5).fillColor(PRIMARY)
          .text('Crown Insurance Brokers CC', 0, FOOTER_TEXT_TOP, opts);
        pdfDoc.font('Helvetica').fontSize(7.5).fillColor(PRIMARY)
          .text('Steph@Inexpro.co.za  |  www.Inexpro.co.za', 0, FOOTER_TEXT_TOP + 12, opts);
        pdfDoc.fontSize(7).fillColor('#555')
          .text('CK 2017/10070', 0, FOOTER_TEXT_TOP + 26, opts);
        pdfDoc.text('Duly registered in terms of Section 53 of the Short-Term Insurance Act (Act No 4 of 1998) — Licence Number SB/848',
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

    // ── Letterhead on page 1 only — Crown logo + right-side address block
    let firstPageTop = PAGE2_TOP;
    if (fs.existsSync(LETTERHEAD_PATH)) {
      // Crown logo image runs the full page width.
      pdfDoc.image(LETTERHEAD_PATH, 0, 0, { width: PAGE_W });
      // PNG-style width/height read won't work for JPEG headers; instead,
      // size the rendered band by the image's aspect ratio captured at copy
      // time (718 × 207). renderedH = (207 / 718) × PAGE_W ≈ 171.5
      const renderedH = (207 / 718) * PAGE_W;
      // Office / Cell address block on the right, layered over the logo
      // band so it lines up with the wave decoration like the source docx.
      const RIGHT_BLOCK_W = 200;
      const rightX = PAGE_W - MARGIN - RIGHT_BLOCK_W;
      pdfDoc.font('Helvetica').fontSize(SMALL).fillColor('#333');
      let ry = 30;
      const lines = [
        'Farm Mooirivier',
        'D260',
        'Karasburg',
        '',
        'Office +27 (0) 21 981-1612',
        'Cell      +27 (0) 83 708 3130',
      ];
      lines.forEach(line => {
        pdfDoc.text(line, rightX, ry, { width: RIGHT_BLOCK_W, align: 'right', lineBreak: false });
        ry += 12;
      });
      firstPageTop = renderedH + 16;
    }
    drawFooter();
    pdfDoc.on('pageAdded', () => { drawFooter(); });

    pdfDoc.y = firstPageTop;
    pdfDoc.x = MARGIN;

    function checkBreak(needed) {
      if (pdfDoc.y + needed > SAFE_BOTTOM) pdfDoc.addPage();
    }

    // ── Date + reference (left-aligned, top of body) ──────────────
    pdfDoc.fontSize(BODY).font('Helvetica').fillColor('#222');
    pdfDoc.text(`Date: ${fmtDateLong(body.date) || fmtDateLong(new Date().toISOString())}`,
      MARGIN, pdfDoc.y, { width: CONTENT_W });
    pdfDoc.text(`Our reference: SG/GIT/${body.insured_name || '—'}`,
      MARGIN, pdfDoc.y, { width: CONTENT_W });

    pdfDoc.moveDown(0.8);

    // ── Insured address block ─────────────────────────────────────
    pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222');
    pdfDoc.text(body.insured_name || '—', MARGIN, pdfDoc.y, { width: CONTENT_W });
    const addressLines = String(body.insured_address || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    addressLines.forEach(line => {
      pdfDoc.text(line, MARGIN, pdfDoc.y, { width: CONTENT_W });
    });
    pdfDoc.text('NAMIBIA', MARGIN, pdfDoc.y, { width: CONTENT_W });

    pdfDoc.moveDown(0.8);

    pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222')
      .text('To Whom It May Concern', MARGIN, pdfDoc.y, { width: CONTENT_W });

    pdfDoc.moveDown(0.6);

    // Title — matches the source docx
    pdfDoc.fontSize(13).font('Helvetica-Bold').fillColor(PRIMARY)
      .text('CONFIRMATION OF COVER – GOODS IN TRANSIT',
        MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'center' });

    pdfDoc.moveDown(0.6);

    pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222').text(
      `We hereby confirm that the undermentioned Goods in Transit cover is in place for ${body.insured_name || '—'}, underwritten by ${body.insurer || policy.insurer || '—'}:`,
      MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify' }
    );

    pdfDoc.moveDown(0.6);

    // ── Summary table ────────────────────────────────────────────
    // Two-column table: 35% / 65%. Each row sizes to fit its content.
    const TABLE_LABEL_W = Math.round(CONTENT_W * 0.30);
    const TABLE_VALUE_W = CONTENT_W - TABLE_LABEL_W;
    function tableRow(label, value) {
      const labelStr = String(label);
      const valueStr = String(value == null ? '' : value);
      pdfDoc.font('Helvetica-Bold').fontSize(BODY).fillColor('#222');
      const labelH = pdfDoc.heightOfString(labelStr, { width: TABLE_LABEL_W - 8 });
      pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222');
      const valueH = pdfDoc.heightOfString(valueStr, { width: TABLE_VALUE_W - 8 });
      const rowH = Math.max(labelH, valueH) + 8;
      checkBreak(rowH + 4);
      const y = pdfDoc.y;
      // Borders
      pdfDoc.save();
      pdfDoc.strokeColor('#bbb').lineWidth(0.5);
      pdfDoc.rect(MARGIN, y, TABLE_LABEL_W, rowH).stroke();
      pdfDoc.rect(MARGIN + TABLE_LABEL_W, y, TABLE_VALUE_W, rowH).stroke();
      pdfDoc.restore();
      // Light background for the label cell
      pdfDoc.save();
      pdfDoc.rect(MARGIN, y, TABLE_LABEL_W, rowH).fillColor('#f2f6fa').fill();
      pdfDoc.restore();
      pdfDoc.font('Helvetica-Bold').fontSize(BODY).fillColor('#222')
        .text(labelStr, MARGIN + 4, y + 4, { width: TABLE_LABEL_W - 8 });
      pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222')
        .text(valueStr, MARGIN + TABLE_LABEL_W + 4, y + 4, { width: TABLE_VALUE_W - 8 });
      pdfDoc.y = y + rowH;
    }

    // Derive truck count + registrations from vehicle_groups
    const groups = Array.isArray(body.vehicle_groups) ? body.vehicle_groups : [];
    const allVehicles = groups.flatMap(g => Array.isArray(g.vehicles) ? g.vehicles : []);
    const truckCount = allVehicles.length;
    const truckRegs  = allVehicles.join(' / ');
    // Use the first group's limit as the per-truck load limit if present.
    const loadLimit  = groups[0] && Number.isFinite(Number(groups[0].limit))
      ? Number(groups[0].limit)
      : null;
    const coverTypes = Array.isArray(body.cover_types) ? body.cover_types : [];
    const typeOfCover = coverTypes.length ? coverTypes.join(', ') : 'All Risk Cover (First Loss Basis)';

    // Period of cover — broker can set start via body.date; renewal_date is end.
    const periodFrom = fmtDateLong(body.date) || fmtDateLong(new Date().toISOString());
    const periodTo   = fmtDateLong(body.renewal_date || policy.renewal_date);

    tableRow('Insured',              body.insured_name || '');
    tableRow('Insurer',              body.insurer || policy.insurer || '');
    tableRow('Policy Number',        body.policy_number || policy.policy_number || '');
    tableRow('Type of Cover',        typeOfCover);
    tableRow('Load Limit per Truck', loadLimit != null ? fmtN(loadLimit) : '—');
    tableRow('Number of Trucks',     truckCount ? String(truckCount) : '—');
    tableRow('Truck Registrations',  truckRegs || '—');
    tableRow('Period of Cover',      periodTo ? `${periodFrom} to ${periodTo}` : periodFrom);
    tableRow('NASRIA',               'Included');
    tableRow('Fidelity',             'Drivers not excluded on current cover');
    tableRow('Territorial Limits',   body.territorial_limits ||
      'Republic of South Africa, Namibia, Botswana, Lesotho, Swaziland (Eswatini), Zimbabwe, Malawi, Mozambique, Zambia, Tanzania, Angola, and the Democratic Republic of the Congo.');
    // Broker-editable sections — fall back to the standard wording when
    // the textarea was left blank.
    tableRow('Excluded Commodities',
      (body.excluded_commodities && String(body.excluded_commodities).trim())
        || DEFAULT_EXCLUDED_COMMODITIES);
    tableRow('Valid Driver’s Licence',
      (body.valid_drivers_licence && String(body.valid_drivers_licence).trim())
        || DEFAULT_VALID_DRIVERS_LICENCE);
    tableRow('Security Conditions (Cross-border consignments exceeding N$1,000,000.00 in value)',
      (body.security_conditions && String(body.security_conditions).trim())
        || DEFAULT_SECURITY_CONDITIONS);

    pdfDoc.moveDown(0.8);

    pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222').text(
      `This confirmation is issued in good faith and is subject at all times to the full terms, conditions, exceptions and warranties of the underlying policy issued by ${body.insurer || policy.insurer || 'the insurer'}. It does not amend, extend or otherwise alter the cover provided under that policy and confers no rights upon any third party.`,
      MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify' }
    );

    pdfDoc.moveDown(0.5);
    pdfDoc.text('Should you require any further information, please do not hesitate to contact our office.',
      MARGIN, pdfDoc.y, { width: CONTENT_W });

    pdfDoc.moveDown(0.8);
    pdfDoc.text('Yours faithfully,', MARGIN, pdfDoc.y, { width: CONTENT_W });

    // Broker signature image (full content width) — mirrors the SA
    // renderer so the Namibia variant has the same closing look.
    let drewBrokerSig = false;
    if (brokerSignaturePath) {
      try {
        const img = pdfDoc.openImage(brokerSignaturePath);
        const MAX_H = 110;
        const ratio = Math.min(CONTENT_W / img.width, MAX_H / img.height);
        const dispW = img.width * ratio;
        const dispH = img.height * ratio;
        if (pdfDoc.y + 18 + dispH > SAFE_BOTTOM) pdfDoc.addPage();
        const sigY = pdfDoc.y + 6;
        pdfDoc.image(brokerSignaturePath, MARGIN, sigY, { width: dispW, height: dispH });
        pdfDoc.y = sigY + dispH + 4;
        drewBrokerSig = true;
      } catch (_) {}
    }
    if (!drewBrokerSig) pdfDoc.moveDown(2.2);

    pdfDoc.font('Helvetica-Bold').fontSize(BODY).fillColor('#222')
      .text(body.prepared_by_name || 'Steph van der Vyver', MARGIN, pdfDoc.y, { width: CONTENT_W });
    pdfDoc.font('Helvetica').fontSize(SMALL).fillColor('#444')
      .text('Inexpro Advisory / Crown Insurance Brokers CC', MARGIN, pdfDoc.y, { width: CONTENT_W });
    pdfDoc.text('FSP Licence Number: SB/848', MARGIN, pdfDoc.y, { width: CONTENT_W });

    // ── Acknowledgement of Receipt page ──────────────────────────
    // Mirrors the layout in the South African renderer so both versions
    // hand the broker a familiar signing experience.
    pdfDoc.addPage();
    const FILL_BLANK = '_______________________________';
    const clientNameLine  = (body.client_name  || '').toString().trim() || FILL_BLANK;
    const companyNameLine = (body.company_name || '').toString().trim() || FILL_BLANK;

    function sectionHead(title) {
      checkBreak(40);
      pdfDoc.moveDown(0.4);
      pdfDoc.fontSize(H).fillColor(PRIMARY).font('Helvetica-Bold')
        .text(title, MARGIN, pdfDoc.y, { width: CONTENT_W });
      pdfDoc.moveTo(MARGIN, pdfDoc.y + 2).lineTo(MARGIN + CONTENT_W, pdfDoc.y + 2)
        .strokeColor('#dee2e6').lineWidth(0.75).stroke();
      pdfDoc.moveDown(0.4);
      pdfDoc.fontSize(BODY).fillColor('#222').font('Helvetica');
    }

    if (signature && signature.buf) {
      sectionHead('Acknowledgement of Receipt');

      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const dateObj = signature.signedAt instanceof Date ? signature.signedAt : new Date(signature.signedAt);
      const dayN     = dateObj.getDate();
      const monthName = months[dateObj.getMonth()];
      const yearN     = dateObj.getFullYear();
      const sClientName = (body.client_name || signature.signerName || '').toString().trim();
      const sCompany    = (body.company_name || '').toString().trim();

      pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222').text(
        `I ${sClientName || FILL_BLANK} representing ${sCompany || FILL_BLANK},\n\n` +
        'hereby acknowledge and confirm that I have read and understood the terms and conditions contained in this Confirmation of Cover. Acceptance of this cover forms part of the agreement, that should any action arise without the conditions covered, it will be at own risk.\n\n' +
        `Signed on this ${ordinal(dayN)} day of ${monthName} ${yearN}.`,
        MARGIN, pdfDoc.y, { width: CONTENT_W, lineGap: 4 }
      );

      pdfDoc.moveDown(1.6);

      const SIG_W = 200;
      const SIG_H = 50;
      const colW = 250;
      const rightX = MARGIN + colW + 30;
      const sigImgY = pdfDoc.y;
      const lineY = sigImgY + SIG_H + 4;
      try {
        pdfDoc.image(signature.buf, MARGIN, sigImgY, { fit: [SIG_W, SIG_H] });
      } catch (_) {
        pdfDoc.font('Helvetica-Oblique').fontSize(SMALL).fillColor('#a00')
          .text('(signature image could not be embedded)', MARGIN, sigImgY + 18, { width: colW });
      }
      pdfDoc.save();
      pdfDoc.moveTo(MARGIN, lineY).lineTo(MARGIN + colW, lineY).strokeColor('#222').lineWidth(0.5).stroke();
      pdfDoc.moveTo(rightX, lineY).lineTo(rightX + colW, lineY).strokeColor('#222').lineWidth(0.5).stroke();
      pdfDoc.restore();
      pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222')
        .text('For', MARGIN, lineY + 4, { width: colW, align: 'center' });
      pdfDoc.text('Witness', rightX, lineY + 4, { width: colW, align: 'center' });

      pdfDoc.x = MARGIN;
      pdfDoc.y = lineY + 24;
      pdfDoc.moveDown(1.0);

      pdfDoc.font('Helvetica-Oblique').fontSize(SMALL).fillColor('#444').text(
        `Should either Crown Insurance Brokers CC or the Insured not have received the acknowledgement of receipt as above and/or any representation disputing the Terms and Conditions stated above, within 14 working days from the date of this confirmation, the cover as stipulated in this Confirmation of Cover will be deemed as accepted and contractually binding to the recipient and client.`,
        MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify' }
      );

      pdfDoc.moveDown(0.8);
      const typedNameNote = (signature.signerName && signature.signerName !== sClientName)
        ? ` Typed name at sign time: "${signature.signerName}".`
        : '';
      pdfDoc.font('Helvetica-Oblique').fontSize(8).fillColor('#666').text(
        `Electronically signed: ${signature.signedAt.toISOString()} from ${signature.signedIp || 'unknown IP'}; UA: ${signature.signedUa || '(none)'}.${typedNameNote}`,
        MARGIN, pdfDoc.y, { width: CONTENT_W, lineGap: 2 }
      );
    } else {
      sectionHead('Acknowledgement of Receipt');
      pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222').text(
        `I ${clientNameLine} representing ${companyNameLine},\n\n` +
        'hereby acknowledge and confirm that I have read and understood the terms and conditions contained in this Confirmation of Cover. Acceptance of this cover forms part of the agreement, that should any action arise without the conditions covered, it will be at own risk.\n\n' +
        'Signed on this ______ day of _______________________ ' + (new Date(body.date || Date.now()).getFullYear()) + ' at _______________________.\n\n\n\n' +
        '_______________________________                _______________________________\n' +
        '             For                                                   Witness',
        MARGIN, pdfDoc.y, { width: CONTENT_W, lineGap: 4 }
      );
      pdfDoc.moveDown(1.2);
      pdfDoc.font('Helvetica-Oblique').fontSize(SMALL).fillColor('#444').text(
        `Should either Crown Insurance Brokers CC or the Insured not have received the acknowledgement of receipt as above and/or any representation disputing the Terms and Conditions stated above, within 14 working days from the date of this confirmation, the cover as stipulated in this Confirmation of Cover will be deemed as accepted and contractually binding to the recipient and client.`,
        MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify' }
      );
    }

    pdfDoc.end();
  });
}

module.exports = { renderBelogixNamibiaGitConfirmationPdf };
