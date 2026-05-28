'use strict';

// Shared PDF helpers for the per-record "report" PDFs (Claim / Policy /
// Contact / Account / Asset). Centralises the Inexpro letterhead
// (page 1) + branded footer (every page), and the layout primitives:
// section headings, label-value rows, paragraphs, simple tables. All
// per-record renderers use this so the look stays in sync.

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
 * Create a PDFKit document configured with Inexpro letterhead on page 1
 * only and branded footer on every page. Returns the document, a `h`
 * object of layout helpers bound to it, and a `finalise()` that ends
 * the doc and resolves with the buffer.
 */
function createReportPdf() {
  const chunks = [];
  const pdfDoc = new PDFDocument({
    size: 'A4',
    margins: { top: PAGE2_TOP, bottom: FOOTER_H + FOOTER_BUFFER, left: MARGIN, right: MARGIN },
    autoFirstPage: true,
  });
  pdfDoc.on('data', c => chunks.push(c));

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

  function titleBlock(title, subtitle) {
    pdfDoc.fontSize(18).font('Helvetica-Bold').fillColor(PRIMARY)
      .text(title, MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'center' });
    pdfDoc.moveDown(0.2);
    if (subtitle) {
      pdfDoc.fontSize(13).font('Helvetica-Bold').fillColor('#222')
        .text(String(subtitle), MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'center' });
    }
    pdfDoc.moveDown(0.3);
    pdfDoc.fontSize(SMALL).font('Helvetica').fillColor('#666')
      .text(`Generated ${dateLong(new Date().toISOString())}`,
        MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'center' });
    pdfDoc.moveDown(0.8);
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
    let height = 12;
    colSpecs.forEach((c, i) => {
      const hh = pdfDoc.heightOfString(cells[i], { width: c.width - 4 });
      if (hh > height) height = hh;
    });
    checkBreak(height + 4);
    const y = pdfDoc.y;
    let x = MARGIN;
    pdfDoc.font('Helvetica').fontSize(SMALL).fillColor('#222');
    colSpecs.forEach((c, i) => {
      pdfDoc.text(cells[i], x, y, { width: c.width - 4, align: c.align || 'left' });
      x += c.width;
    });
    pdfDoc.y = y + height + 3;
  }

  function finalise() {
    return new Promise((resolve, reject) => {
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });
  }

  return {
    pdfDoc,
    h: { checkBreak, titleBlock, sectionHead, subHead, labelValueRow, paragraph, emptyLine, tableHeader, tableRow },
    finalise,
  };
}

module.exports = {
  PRIMARY, BODY, SMALL, H, MARGIN, CONTENT_W, PAGE_W, PAGE_H, SAFE_BOTTOM,
  dateStr, dateLong, dash, currencySymbol, fmtMoney, yesNo, safeJsonArray,
  createReportPdf,
};
