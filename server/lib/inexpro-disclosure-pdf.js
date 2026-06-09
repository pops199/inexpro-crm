'use strict';

// Renderer for the Inexpro CC Statutory Intermediary Disclosure Notice PDF.
//
// Branded with the shared Inexpro letterhead (page 1) + footer (every page)
// via inexpro-pdf-helpers. The body (sections 1–17, including the docx's
// two-column tables) comes from the shared content module so the filed PDF
// matches what the client reads on the public signing page.
//
// Section 17 (Client Acknowledgement) is filled from the client's signing
// submission: their typed details, drawn signature and date are stamped in.
// The "On behalf of Inexpro CC" block carries the broker's signature image
// spanning the page width — it replaces the printed signature/capacity/date
// form entirely. When no client signature is supplied the client block is
// rendered as blank fill-in lines (e.g. for a broker preview).

const {
  createReportPdf, BODY, SMALL, MARGIN, CONTENT_W, SAFE_BOTTOM,
} = require('./inexpro-pdf-helpers');
const { INTRO, SECTIONS, CLIENT_FIELDS } = require('./inexpro-disclosure-content');

/**
 * @param {{
 *   signature?: { buf: Buffer, signerName: string, signedAt: Date, signedIp?: string, signedUa?: string },
 *   clientFields?: object,            // answers keyed by CLIENT_FIELDS[].name
 *   brokerSignaturePath?: string|null,
 *   preparedByName?: string|null,
 * }} [opts]
 * @returns {Promise<Buffer>}
 */
function renderIntermediaryDisclosurePdf(opts = {}) {
  const { signature = null, clientFields = {}, brokerSignaturePath = null, preparedByName = null } = opts;
  const { pdfDoc, h, finalise } = createReportPdf();

  // ── Local layout helpers ────────────────────────────────────────────────
  const para = (text) => {
    if (!text) return;
    h.checkBreak(28);
    pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222')
      .text(text, MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify', lineGap: 2 });
    pdfDoc.moveDown(0.35);
  };
  const note = (text) => {
    if (!text) return;
    h.checkBreak(24);
    pdfDoc.font('Helvetica-Oblique').fontSize(SMALL).fillColor('#555')
      .text(text, MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify', lineGap: 1.5 });
    pdfDoc.moveDown(0.3);
  };
  const bullet = (text) => {
    h.checkBreak(18);
    pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222')
      .text('•  ' + text, MARGIN + 8, pdfDoc.y, { width: CONTENT_W - 8, align: 'justify', lineGap: 1.5 });
    pdfDoc.moveDown(0.12);
  };

  // Bordered two-column table — mirrors the docx label/value tables.
  const LABEL_W = 175;
  const drawTable = (rows) => {
    const colV = CONTENT_W - LABEL_W;
    rows.forEach(([label, value]) => {
      const lStr = String(label == null ? '' : label);
      const vStr = String(value == null ? '' : value);
      pdfDoc.font('Helvetica-Bold').fontSize(BODY);
      const lh = pdfDoc.heightOfString(lStr, { width: LABEL_W - 12 });
      pdfDoc.font('Helvetica').fontSize(BODY);
      const vh = pdfDoc.heightOfString(vStr, { width: colV - 12 });
      const rowH = Math.max(lh, vh) + 9;
      if (pdfDoc.y + rowH > SAFE_BOTTOM) pdfDoc.addPage();
      const y = pdfDoc.y;
      // Label-cell background.
      pdfDoc.save();
      pdfDoc.rect(MARGIN, y, LABEL_W, rowH).fill('#f2f6fa');
      pdfDoc.restore();
      // Cell borders.
      pdfDoc.save();
      pdfDoc.lineWidth(0.5).strokeColor('#c9d3de');
      pdfDoc.rect(MARGIN, y, LABEL_W, rowH).stroke();
      pdfDoc.rect(MARGIN + LABEL_W, y, colV, rowH).stroke();
      pdfDoc.restore();
      // Cell text.
      pdfDoc.font('Helvetica-Bold').fontSize(BODY).fillColor('#222')
        .text(lStr, MARGIN + 6, y + 4, { width: LABEL_W - 12 });
      pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222')
        .text(vStr, MARGIN + LABEL_W + 6, y + 4, { width: colV - 12 });
      pdfDoc.y = y + rowH;
    });
    pdfDoc.moveDown(0.4);
  };

  // "Label:  __________________" — a fillable line spanning to the right margin.
  const blankLine = (label, value) => {
    h.checkBreak(22);
    const y = pdfDoc.y;
    const labelText = label + ':  ';
    pdfDoc.font('Helvetica-Bold').fontSize(BODY).fillColor('#222')
      .text(labelText, MARGIN, y, { width: CONTENT_W, lineBreak: false });
    const lw = pdfDoc.widthOfString(labelText);
    if (value) {
      pdfDoc.font('Helvetica').fontSize(BODY).fillColor('#222')
        .text(String(value), MARGIN + lw, y, { width: CONTENT_W - lw, lineBreak: false });
    } else {
      const lineY = y + 11;
      pdfDoc.moveTo(MARGIN + lw, lineY).lineTo(MARGIN + CONTENT_W, lineY)
        .strokeColor('#999').lineWidth(0.5).stroke();
    }
    pdfDoc.y = y + 22;
  };

  // ── Title + preamble ────────────────────────────────────────────────────
  h.titleBlock('Statutory Disclosure Notice to Clients', 'Inexpro Short Term Insurance');
  pdfDoc.font('Helvetica-Oblique').fontSize(BODY).fillColor('#555')
    .text('Authorised Financial Services Provider — FSCA FSP No. 7591',
      MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'center' });
  pdfDoc.moveDown(0.5);
  para(INTRO);

  // ── Sections 1–17 (from the shared content module) ──────────────────────
  SECTIONS.forEach(section => {
    h.sectionHead(section.h);
    section.body.forEach(b => {
      if (b.p) para(b.p);
      else if (b.sub) h.subHead(b.sub);
      else if (b.note) note(b.note);
      else if (b.ul) b.ul.forEach(bullet);
      else if (b.table) drawTable(b.table);
    });
  });

  // ── Section 17 — client detail fields (typed or blank) ──────────────────
  h.subHead('Client details');
  const detailFields = CLIENT_FIELDS.filter(f =>
    !['signing_capacity', 'signing_place'].includes(f.name));
  drawTable(detailFields.map(f => [f.label, (clientFields && clientFields[f.name]) || '']));

  // ── Client signature ────────────────────────────────────────────────────
  pdfDoc.moveDown(0.2);
  h.checkBreak(120);
  pdfDoc.font('Helvetica-Bold').fontSize(BODY).fillColor('#222')
    .text('Client signature:', MARGIN, pdfDoc.y, { width: CONTENT_W });
  pdfDoc.moveDown(0.2);
  if (signature && signature.buf) {
    const SIG_W = 240, SIG_H = 80;
    const sigY = pdfDoc.y;
    try { pdfDoc.image(signature.buf, MARGIN, sigY, { fit: [SIG_W, SIG_H] }); }
    catch (_) {
      pdfDoc.font('Helvetica-Oblique').fontSize(SMALL).fillColor('#a00')
        .text('(signature image could not be embedded)', MARGIN, sigY + 16, { width: SIG_W });
    }
    pdfDoc.y = sigY + SIG_H + 6;
    blankLine('Name (printed)', String(signature.signerName || ''));
    blankLine('Capacity (if signed on behalf of an entity)', (clientFields && clientFields.signing_capacity) || '');
    blankLine('Place', (clientFields && clientFields.signing_place) || '');
    blankLine('Date', signature.signedAt instanceof Date
      ? signature.signedAt.toISOString().slice(0, 10)
      : String(signature.signedAt || '').slice(0, 10));
    pdfDoc.moveDown(0.4);
    pdfDoc.font('Helvetica-Oblique').fontSize(8).fillColor('#666').text(
      `Electronically signed: ${signature.signedAt instanceof Date ? signature.signedAt.toISOString() : signature.signedAt} ` +
      `from ${signature.signedIp || 'unknown IP'}; UA: ${signature.signedUa || '(none)'}.`,
      MARGIN, pdfDoc.y, { width: CONTENT_W, lineGap: 2 });
  } else {
    // Unsigned preview — blank fill-in lines.
    const lineY = pdfDoc.y + 24;
    pdfDoc.moveTo(MARGIN, lineY).lineTo(MARGIN + 260, lineY).strokeColor('#999').lineWidth(0.5).stroke();
    pdfDoc.y = lineY + 6;
    blankLine('Name (printed)', '');
    blankLine('Capacity (if signed on behalf of an entity)', '');
    blankLine('Place', '');
    blankLine('Date', '');
  }

  // ── On behalf of Inexpro CC — broker signature spanning the page width ───
  // The captured broker signature REPLACES the printed "Signature / Name &
  // capacity / Date" block — only the actual signature + the broker's name show.
  pdfDoc.moveDown(0.8);
  h.checkBreak(130);
  pdfDoc.font('Helvetica-Bold').fontSize(BODY + 0.5).fillColor('#222')
    .text('On behalf of Inexpro CC:', MARGIN, pdfDoc.y, { width: CONTENT_W });
  pdfDoc.moveDown(0.5);

  let drewBrokerSig = false;
  if (brokerSignaturePath) {
    try {
      const img = pdfDoc.openImage(brokerSignaturePath);
      const MAX_H = 95;
      const ratio = Math.min(CONTENT_W / img.width, MAX_H / img.height);
      const dispW = img.width * ratio;
      const dispH = img.height * ratio;
      if (pdfDoc.y + 16 + dispH > SAFE_BOTTOM) pdfDoc.addPage();
      const sigY = pdfDoc.y + 2;
      pdfDoc.image(brokerSignaturePath, MARGIN, sigY, { width: dispW, height: dispH });
      const lineY = sigY + dispH + 3;
      pdfDoc.moveTo(MARGIN, lineY).lineTo(MARGIN + CONTENT_W, lineY)
        .strokeColor('#999').lineWidth(0.5).stroke();
      pdfDoc.y = lineY + 6;
      drewBrokerSig = true;
    } catch (_) { /* fall through to printed line */ }
  }
  if (!drewBrokerSig) {
    const lineY = pdfDoc.y + 26;
    pdfDoc.moveTo(MARGIN, lineY).lineTo(MARGIN + CONTENT_W, lineY)
      .strokeColor('#999').lineWidth(0.5).stroke();
    pdfDoc.y = lineY + 6;
  }
  if (preparedByName) {
    pdfDoc.font('Helvetica-Bold').fontSize(BODY).fillColor('#222')
      .text(String(preparedByName), MARGIN, pdfDoc.y, { width: CONTENT_W });
  }

  return finalise();
}

module.exports = { renderIntermediaryDisclosurePdf };
