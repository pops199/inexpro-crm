'use strict';

// Record of Advice PDF renderer used by the e-signature flow.
// Mirrors the look of the POPIA / GIT signed PDFs: Inexpro letterhead
// on page 1, branded footer on every page, long bodies auto-wrap
// before the footer. When `signature` is supplied a final
// Acknowledgement page stamps the signature image, typed name, date
// and an audit footer.

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

const LETTERHEAD_PATH = path.join(__dirname, '..', '..', 'client', 'public', 'letterhead-ROA.png');
const FOOTER_IMAGE_PATH = path.join(__dirname, '..', '..', 'client', 'public', 'letterhead-footer.jpg');

function dateStr(v) { return v ? String(v).slice(0, 10) : '—'; }
function dash(v) { return v || '—'; }

/**
 * @param {{roa: object, signature?: {buf:Buffer, signerName:string, signedAt:Date, signedIp?:string, signedUa?:string}}} opts
 * @returns {Promise<Buffer>}
 */
async function renderRoaPdf({ roa, signature }) {
  roa = roa || {};

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

    // Footer — drawn on every page. Lifts the bottom margin to 0 during
    // the draw (so footer text doesn't trigger a page break) and
    // saves/restores cursor + font (PDFKit's save()/restore() doesn't
    // cover font state).
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

    function sectionHead(title) {
      pdfDoc.moveDown(0.6);
      pdfDoc.fontSize(11).fillColor(PRIMARY).font('Helvetica-Bold')
        .text(title, MARGIN, pdfDoc.y, { width: CONTENT_W });
      pdfDoc.moveTo(MARGIN, pdfDoc.y + 2).lineTo(MARGIN + CONTENT_W, pdfDoc.y + 2)
        .strokeColor('#dee2e6').lineWidth(0.75).stroke();
      pdfDoc.moveDown(0.4);
      pdfDoc.fontSize(10).fillColor('#222').font('Helvetica');
    }
    function labelValueRow(label, value) {
      const LABEL_W = 140;
      const y = pdfDoc.y;
      pdfDoc.font('Helvetica-Bold').fontSize(10).fillColor('#222')
        .text(label + ':', MARGIN, y, { width: LABEL_W });
      const h1 = pdfDoc.heightOfString(label + ':', { width: LABEL_W });
      pdfDoc.font('Helvetica').fontSize(10).fillColor('#222')
        .text(String(value || dash(value)), MARGIN + LABEL_W, y, { width: CONTENT_W - LABEL_W });
      const h2 = pdfDoc.heightOfString(String(value || ''), { width: CONTENT_W - LABEL_W });
      pdfDoc.y = y + Math.max(h1, h2) + 2;
    }
    function paragraph(label, value) {
      if (!value) return;
      pdfDoc.moveDown(0.4);
      pdfDoc.font('Helvetica-Bold').fontSize(10).fillColor(PRIMARY)
        .text(label, MARGIN, pdfDoc.y, { width: CONTENT_W });
      pdfDoc.font('Helvetica').fontSize(10).fillColor('#222')
        .text(String(value), MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify', lineGap: 2 });
    }

    // ── Title block ───────────────────────────────────────────
    pdfDoc.fontSize(16).font('Helvetica-Bold').fillColor(PRIMARY)
      .text('Record of Advice', MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'center' });
    pdfDoc.moveDown(0.6);

    // ── Header fields ─────────────────────────────────────────
    labelValueRow('Reference',    roa.advice_record_number);
    labelValueRow('Client',       roa.contact_name || roa.account_name);
    labelValueRow('Adviser',      roa.broker_name);
    labelValueRow('Advice Date',  dateStr(roa.advice_date));
    labelValueRow('Advice Type',  roa.advice_type);
    if (roa.trigger_event)        labelValueRow('Trigger Event',  roa.trigger_event);
    if (roa.policy_name)          labelValueRow('Policy',          roa.policy_name);

    // ── Body sections ─────────────────────────────────────────
    if (roa.client_needs_identified) {
      sectionHead('Client Needs Identified');
      pdfDoc.font('Helvetica').fontSize(10).fillColor('#222')
        .text(roa.client_needs_identified, MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify', lineGap: 2 });
    }
    if (roa.recommendation_given) {
      sectionHead('Recommendation Given');
      pdfDoc.font('Helvetica').fontSize(10).fillColor('#222')
        .text(roa.recommendation_given, MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify', lineGap: 2 });
    }
    if (roa.reason_product_suitable) {
      sectionHead('Why the Product is Suitable');
      pdfDoc.font('Helvetica').fontSize(10).fillColor('#222')
        .text(roa.reason_product_suitable, MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify', lineGap: 2 });
    }
    if (roa.alternatives_considered) {
      sectionHead('Alternatives Considered');
      pdfDoc.font('Helvetica').fontSize(10).fillColor('#222')
        .text(roa.alternatives_considered, MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify', lineGap: 2 });
    }
    if (roa.client_decision || roa.client_rejection_reason) {
      sectionHead('Client Decision');
      if (roa.client_decision)         labelValueRow('Decision',        roa.client_decision);
      if (roa.decision_date)           labelValueRow('Decision Date',   dateStr(roa.decision_date));
      if (roa.client_rejection_reason) paragraph('Rejection Reason', roa.client_rejection_reason);
    }
    if (roa.material_disclosures) {
      sectionHead('Material Disclosures');
      pdfDoc.font('Helvetica').fontSize(10).fillColor('#222')
        .text(roa.material_disclosures, MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify', lineGap: 2 });
    }
    if (roa.notes) {
      sectionHead('Notes');
      pdfDoc.font('Helvetica').fontSize(10).fillColor('#222')
        .text(roa.notes, MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify', lineGap: 2 });
    }

    // ── Acknowledgement / Signature page ──────────────────────
    pdfDoc.addPage();
    if (signature && signature.buf) {
      sectionHead('Client Acknowledgement & Signature');
      pdfDoc.font('Helvetica').fontSize(10).fillColor('#222').text(
        `I, ${signature.signerName}, hereby acknowledge that I have read and understood the advice contained in this Record of Advice. I confirm that the recommendation has been explained to me and that I have indicated my decision (accept / decline / partial) as recorded above.`,
        MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify', lineGap: 2 }
      );
      pdfDoc.moveDown(0.8);

      const SIG_W = 240;
      const SIG_H = 90;
      const sigX = MARGIN;
      const sigY = pdfDoc.y;
      try {
        pdfDoc.image(signature.buf, sigX, sigY, { fit: [SIG_W, SIG_H] });
      } catch (_) {
        pdfDoc.fontSize(10).fillColor('#a00').text('(signature image could not be embedded)', sigX, sigY);
      }
      pdfDoc.x = sigX;
      pdfDoc.y = sigY + SIG_H + 8;

      pdfDoc.font('Helvetica').fontSize(10).fillColor('#222')
        .text(`Signed by: ${signature.signerName}`, MARGIN, pdfDoc.y, { width: CONTENT_W });
      pdfDoc.text(`Date: ${signature.signedAt.toISOString().slice(0, 10)}`,
        MARGIN, pdfDoc.y, { width: CONTENT_W });
      pdfDoc.moveDown(0.4);
      pdfDoc.font('Helvetica-Oblique').fontSize(8).fillColor('#666').text(
        `Audit: signed ${signature.signedAt.toISOString()} from ${signature.signedIp || 'unknown IP'}; UA: ${signature.signedUa || '(none)'}`,
        MARGIN, pdfDoc.y, { width: CONTENT_W, lineGap: 2 }
      );
    } else {
      sectionHead('Client Acknowledgement');
      pdfDoc.font('Helvetica').fontSize(10).fillColor('#222').text(
        'I acknowledge that I have read and understood the advice contained in this Record of Advice.\n\n' +
        'Signed: ______________________________________\n\n' +
        'Name (printed): _______________________________\n\n' +
        'Date: ____ / ____ / __________\n\n' +
        'Place: ________________________________________',
        MARGIN, pdfDoc.y, { width: CONTENT_W, lineGap: 6 }
      );
    }

    pdfDoc.end();
  });
}

module.exports = { renderRoaPdf };
