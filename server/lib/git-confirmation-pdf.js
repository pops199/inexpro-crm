'use strict';

// Shared renderer for the Goods-in-Transit "Confirmation of Insurance" PDF.
// Used by:
//   - server/routes/policies.js          → POST /:id/git-confirmation
//     (broker downloads an unsigned preview)
//   - server/routes/public-signing.js    → POST /sign/:token for
//     template_key === 'git_confirmation'
//     (client signed → server stamps signature onto the same document)
//
// When `signature` is provided we replace the printed Acknowledgement
// page with the captured signature image + signer name + date + an
// audit footer (IP, user-agent, timestamp). Otherwise the unsigned
// acknowledgement block (blank signature line + 14-day deemed-accepted
// clause) is rendered.

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

const LETTERHEAD_PATH = path.join(__dirname, '..', '..', 'client', 'public', 'letterhead-ROA.png');
const FOOTER_IMAGE_PATH = path.join(__dirname, '..', '..', 'client', 'public', 'letterhead-footer.jpg');

function fmtR(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v || '');
  return 'R ' + n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateLong(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * @param {{policy: object, body: object, signature?: {buf:Buffer, signerName:string, signedAt:Date, signedIp?:string, signedUa?:string}}} opts
 * @returns {Promise<Buffer>}
 */
async function renderGitConfirmationPdf({ policy, body, signature }) {
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
      const LABEL_W = 140;
      const y = pdfDoc.y;
      pdfDoc.font('Helvetica-Bold').fontSize(BODY).fillColor('#222')
        .text(label + ':', MARGIN, y, { width: LABEL_W });
      const lineH = pdfDoc.heightOfString(label + ':', { width: LABEL_W });
      pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222')
        .text(String(value || ''), MARGIN + LABEL_W, y, { width: CONTENT_W - LABEL_W });
      const lineH2 = pdfDoc.heightOfString(String(value || ''), { width: CONTENT_W - LABEL_W });
      pdfDoc.y = y + Math.max(lineH, lineH2) + 2;
    }

    // ── Date (right-aligned) ──────────────────────────────────
    pdfDoc.fontSize(BODY).font('Helvetica').fillColor('#222')
      .text(fmtDateLong(body.date) || fmtDateLong(new Date().toISOString()),
        MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'right' });

    pdfDoc.moveDown(0.8);

    // Title
    pdfDoc.fontSize(16).font('Helvetica-Bold').fillColor(PRIMARY)
      .text('Confirmation of Insurance', MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'center' });
    pdfDoc.moveDown(0.6);

    // Header block
    labelValueRow('INSURED',       body.insured_name || '');
    labelValueRow('ADDRESS',       body.insured_address || '');
    labelValueRow('RISK ADDRESS',  body.risk_address || '');
    labelValueRow('INSURERS',      body.insurer || policy.insurer || '');
    labelValueRow('Policy Number', body.policy_number || policy.policy_number || '');
    labelValueRow('Brokers',       body.broker_firm || 'Inexpro cc');
    labelValueRow('Renewal date',  fmtDateLong(body.renewal_date || policy.renewal_date));
    labelValueRow('Premiums',      body.premium_note || 'Continuation of cover is dependent on monthly payment of premium when presented');

    // ── Coverage & Limits ─────────────────────────────────────
    sectionHead('COVERAGE & LIMITS');
    const cov = body.coverage || {};
    const covRows = [
      ['Goods in Transit (Carriers Liability)', cov.goods_in_transit,            ' (As Specified)'],
      ['Vehicle Third Party Liability',         cov.vehicle_third_party_liability, ''],
      ['Driver Fidelity',                       cov.driver_fidelity,             ''],
      ['Spillage out of Vehicle',               cov.spillage_out_of_vehicle,     ''],
      ['Wreckage Removal',                      cov.wreckage_removal,            ''],
      ['Debris Removal',                        cov.debris_removal,              ''],
      ['Public Liability (Claims Made Basis)',  cov.public_liability,            ''],
    ];
    covRows.forEach(([label, amount, suffix]) => {
      if (amount === undefined || amount === null || amount === '') return;
      const y = pdfDoc.y;
      pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222')
        .text(label, MARGIN, y, { width: 300 });
      pdfDoc.text('- ' + fmtR(amount) + (suffix || ''), MARGIN + 300, y, { width: CONTENT_W - 300 });
      pdfDoc.y = y + 14;
    });
    const coverTypes = Array.isArray(body.cover_types) ? body.cover_types : [];
    if (coverTypes.length) {
      pdfDoc.moveDown(0.3);
      labelValueRow('Cover', coverTypes.join(', '));
    }

    // ── Goods in Transit (Carriers Liability) Detail ──────────
    sectionHead('Goods in Transit (Carriers Liability) Detail');
    pdfDoc.font('Helvetica-Bold').fontSize(BODY).fillColor('#222')
      .text('MAXIMUM LIMITS OF INDEMNITY', MARGIN, pdfDoc.y, { width: CONTENT_W });
    pdfDoc.moveDown(0.3);
    pdfDoc.font('Helvetica').fontSize(SMALL).fillColor('#222')
      .text(
        "Unless otherwise agreed prior to sending, the indemnity under Goods in Transit policy will be calculated as per the terms and conditions of the BASIS OF VALUATION and/or INDEMNITY CALCULATION CLAUSE and/or other relevant clauses, however subject to an ABSOLUTE MAXIMUM LIMIT OF INDEMNITY any ONE CONVEYANCE OR ONE OCCURRENCE sub-limits per section:",
        MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify' }
      );
    pdfDoc.moveDown(0.4);

    const groups = Array.isArray(body.vehicle_groups) ? body.vehicle_groups : [];
    groups.forEach(grp => {
      checkBreak(70);
      const desc = (grp.description || 'CARGO & PACKAGING MATERIALS').toUpperCase();
      const limit = fmtR(grp.limit);
      pdfDoc.font('Helvetica-Bold').fontSize(BODY).fillColor('#222')
        .text(`${desc} ${limit} any one conveyance or occurrence in respect of vehicle${(grp.vehicles || []).length > 1 ? 's' : ''}:`,
          MARGIN, pdfDoc.y, { width: CONTENT_W });
      pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222');
      (grp.vehicles || []).forEach(v => {
        checkBreak(14);
        pdfDoc.text(String(v), MARGIN + 16, pdfDoc.y, { width: CONTENT_W - 16 });
      });
      pdfDoc.moveDown(0.4);
    });

    // ── Standard boilerplate ──────────────────────────────────
    sectionHead('Goods in Transit');
    pdfDoc.font('Helvetica').fontSize(SMALL).fillColor('#222').text(
      "All property usual to the Insured's business (including ropes, tarpaulins and packing materials in connection with the transit)\n\n" +
      "Defined events: All Risk\n\n" +
      "Property shall mean the property described in the schedule, including all containers, ropes, tarpaulins, packaging materials, receptacles, covers, boxes and labels when necessary for the Insured's commercial purposes, specifically including Tyres, Electronic goods, Spirits, Alcohol and alcohol related products but excluding antiques or antiquities of any description, arms, ammunition, artworks, live animals of any description, bank and treasury notes, cash, travellers cheques, bullion, platinum, cobalt, copper, deeds, designs, documents of any description, explosives, furs, jewellery, patterns, plans, precious metals or stones, specie, stamps, tickets, brass and scrap metal, exotic sea foods including caviar, prawns, calamari and crayfish, aircraft and their parts and accessories unless declared to the company and specifically included in the schedule.",
      MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify' }
    );

    sectionHead('Excluded Goods');
    pdfDoc.font('Helvetica').fontSize(SMALL).fillColor('#222').text(
      "The following commodities / goods are excluded and no cover in respect thereof is provided unless agreed in writing with the company prior to cover commencing: antiques or antiquities of any description, artworks, ammunition, explosives, fireworks, bank and treasury notes, bullion, cash, travellers cheques, cameras, cellular phones and accessories, pre-paid phone cards, computers and memory systems, cobalt, copper in any form, copper cable, non-ferrous metals, gold, silver articles, jewellery, watches, furs, models, moulds, patterns, plans, deeds, designs, documents of any description, securities, specie, stamps, tickets, cigarettes and tobacco products other than raw tobacco, solar panels, lithium-ion batteries and catalytic converters, alcohol other than beer and wine.",
      MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify' }
    );

    sectionHead('Territorial limits');
    pdfDoc.font('Helvetica').fontSize(SMALL).fillColor('#222').text(
      body.territorial_limits || 'Republic of South Africa, Namibia, Botswana, Lesotho, Swaziland, Zimbabwe, Malawi, Mozambique, Zambia, Tanzania, Angola, and the Democratic Republic of the Congo.',
      MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify' }
    );

    sectionHead('GENERAL EXCLUSIONS');
    pdfDoc.font('Helvetica').fontSize(SMALL).fillColor('#222').text(
      'In no case shall this insurance cover liability arising from:',
      MARGIN, pdfDoc.y, { width: CONTENT_W });
    pdfDoc.moveDown(0.2);
    const exclusions = [
      'loss, damage, or expense attributable to willful misconduct of the Insured, or Agent of the Insured;',
      'ordinary leakage, ordinary loss in weight or volume or ordinary wear and tear or gradual deterioration (including the gradual action of light or climatic or atmospheric conditions) of the goods carried;',
      'loss, damage or expense caused by insufficiency or unsuitability of packing or preparation of the goods carried, outside the control of the Insured;',
      'loss, damage or expense caused by inherent vice or nature of the goods or changes brought about by natural causes or any latent or manufacturing defect;',
      'loss, damage or expense caused by delay;',
      'loss, damage or expense arising from the unfitness of the conveying vehicle;',
      'loss of market and/or consequential loss of any nature;',
      'loss, damage or expense caused by infestation, insects or vermin;',
      'loss, damage or expense caused during the process of loading and unloading of the conveying vehicle;',
      'loss, damage or expense arising out of the breakdown or malfunctioning of refrigeration equipment and/or cooling machinery or from insufficiency of insulation unless caused by external means, and provided that the Insurer and the Insured have agreed in writing prior to the carriage as to the specific terms and conditions upon which cover will be granted.',
    ];
    exclusions.forEach(t => {
      checkBreak(30);
      pdfDoc.font('Helvetica').fontSize(SMALL).fillColor('#222')
        .text('•  ' + t, MARGIN + 6, pdfDoc.y, { width: CONTENT_W - 6, align: 'justify' });
      pdfDoc.moveDown(0.15);
    });

    sectionHead('FIRST LOSS');
    pdfDoc.font('Helvetica').fontSize(SMALL).fillColor('#222').text(
      'In the event of the total cargo value at risk exceeding the maximum limits of indemnity provided herein, the Insurers undertake to pay the full amount of any loss recoverable up to but not exceeding the ABSOLUTE MAXIMUM LIMIT OF INDEMNITY any ONE CONVEYANCE OR ONE OCCURRENCE stated above without applying average or under insurance calculations, minus the appropriate excess.',
      MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify' }
    );

    sectionHead('PROPORTIONATE CONSIGNMENT COVER');
    pdfDoc.font('Helvetica').fontSize(SMALL).fillColor('#222').text(
      'The Indemnity as Specified per Vehicle is the ABSOLUTE MAXIMUM LIMIT OF INDEMNITY in any ONE CONVEYANCE in one complete consignment. Should any one consignment be divided between one or more consignees, the limit will be proportionately divided amongst the Consignees.',
      MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify' }
    );

    pdfDoc.moveDown(0.4);
    pdfDoc.font('Helvetica-Oblique').fontSize(SMALL).fillColor('#444').text(
      'This policy may contain clause(s) that limit the amount payable and is subject to standard policy conditions and exclusions. Any cargo owner or their representatives loading any commodity exceeding these terms and conditions will be regarded as at the owner’s risk. It is the obligation of the Cargo Owner or their representatives to ensure that the terms and conditions as specified herein are adhered to.',
      MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify' }
    );

    pdfDoc.moveDown(0.8);
    pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222')
      .text('Regards,', MARGIN, pdfDoc.y);
    pdfDoc.moveDown(2.5);
    pdfDoc.font('Helvetica-Bold').fontSize(BODY).fillColor('#222')
      .text(body.prepared_by_name || 'Inexpro Broker', MARGIN, pdfDoc.y);

    // ── Acknowledgement / Signature page ──────────────────────
    pdfDoc.addPage();
    // Broker-typed client / company names (entered in the GIT Confirmation
    // modal) fill the "I ____ representing ____" blanks in both the unsigned
    // and signed views. Falling back to a wide underscore run keeps the
    // printed form usable when the broker hands a paper copy to the client.
    const FILL_BLANK = '_______________________________';
    const clientNameLine  = (body.client_name  || '').toString().trim() || FILL_BLANK;
    const companyNameLine = (body.company_name || '').toString().trim() || FILL_BLANK;
    if (signature && signature.buf) {
      // The signed page intentionally mirrors the unsigned Acknowledgement
      // of Receipt layout (same heading, same wording, same side-by-side
      // For/Witness block, same 14-day deemed-accepted clause) so the final
      // signed PDF reads as a *completed* version of the form the client
      // received — not a separate "signature page".
      sectionHead('Acknowledgement of Receipt');

      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const dateObj   = signature.signedAt instanceof Date ? signature.signedAt : new Date(signature.signedAt);
      const dayN      = dateObj.getDate();
      const ord = (n) => {
        const s = ['th','st','nd','rd'], v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
      };
      const monthName = months[dateObj.getMonth()];
      const yearN     = dateObj.getFullYear();
      // Use the broker-entered Client Name (body.client_name) for the
      // legal "I ___ representing ___" line — that's what the broker
      // typed when preparing the document. signature.signerName is what
      // the client typed in the public signing page; the signing page
      // pre-fills it from the contact record, so most clients click
      // through without changing it and end up with the policy-holder
      // name there. The typed name is still captured separately
      // (signer_typed_name in signature_requests) and reproduced in the
      // audit footer below — so the legal trail is preserved.
      const sClientName = (body.client_name || signature.signerName || '').toString().trim();
      const sCompany    = (body.company_name || '').toString().trim();

      pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222').text(
        `I ${sClientName || '_______________________________'} representing ${sCompany || '_______________________________'},\n\n` +
        'hereby acknowledge and confirm that I have read and understood the terms and conditions contained in this Confirmation of Cover. Acceptance of this cover forms part of the agreement, that should any action arise without the conditions covered, it will be at own risk.\n\n' +
        `Signed on this ${ord(dayN)} day of ${monthName} ${yearN}.`,
        MARGIN, pdfDoc.y, { width: CONTENT_W, lineGap: 4 }
      );
      pdfDoc.moveDown(1.6);

      // Side-by-side signature block: signature image sits above the left
      // underline ("For"); the right underline ("Witness") stays blank —
      // an e-signature flow has no witness.
      const SIG_W   = 200;
      const SIG_H   = 50;
      const colW    = 250;
      const rightX  = MARGIN + colW + 30;
      const sigImgY = pdfDoc.y;
      const lineY   = sigImgY + SIG_H + 4;

      try {
        pdfDoc.image(signature.buf, MARGIN, sigImgY, { fit: [SIG_W, SIG_H] });
      } catch (_) {
        pdfDoc.font('Helvetica-Oblique').fontSize(SMALL).fillColor('#a00')
          .text('(signature image could not be embedded)', MARGIN, sigImgY + 18, { width: colW });
      }

      // Underlines beneath each signature column.
      pdfDoc.save();
      pdfDoc.moveTo(MARGIN, lineY).lineTo(MARGIN + colW, lineY)
        .strokeColor('#222').lineWidth(0.5).stroke();
      pdfDoc.moveTo(rightX, lineY).lineTo(rightX + colW, lineY)
        .strokeColor('#222').lineWidth(0.5).stroke();
      pdfDoc.restore();

      // Captions ("For" / "Witness") beneath the underlines.
      pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222')
        .text('For', MARGIN, lineY + 4, { width: colW, align: 'center' });
      pdfDoc.text('Witness', rightX, lineY + 4, { width: colW, align: 'center' });

      pdfDoc.x = MARGIN;
      pdfDoc.y = lineY + 24;
      pdfDoc.moveDown(1.0);

      // 14-day deemed-accepted clause (same as the unsigned variant).
      pdfDoc.font('Helvetica-Oblique').fontSize(SMALL).fillColor('#444').text(
        `Should either ${body.broker_firm || 'Inexpro'} or the Insured not have received the acknowledgement of receipt as above and/or any representation disputing the Terms and Conditions stated above, within 14 working days from the date of this confirmation, the cover as stipulated in this Confirmation of Cover will be deemed as accepted and contractually binding to the recipient and client.`,
        MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify' }
      );

      // Audit footer — IP / UA / exact timestamp for compliance.
      // Also surface the signer's typed name when it differs from the
      // broker-entered Client Name, so the trail shows exactly who
      // pressed Sign on the public page.
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
        `Should either ${body.broker_firm || 'Inexpro'} or the Insured not have received the acknowledgement of receipt as above and/or any representation disputing the Terms and Conditions stated above, within 14 working days from the date of this confirmation, the cover as stipulated in this Confirmation of Cover will be deemed as accepted and contractually binding to the recipient and client.`,
        MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify' }
      );
    }

    pdfDoc.end();
  });
}

module.exports = { renderGitConfirmationPdf };
