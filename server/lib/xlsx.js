'use strict';
/**
 * Minimal dependency-free XLSX writer.
 *
 * Builds an Office Open XML (.xlsx) workbook for a single sheet of tabular
 * data and returns it as a Buffer. .xlsx is a zip of a few XML parts; we
 * use Node's built-in zlib for DEFLATE and assemble the zip container by
 * hand. No external dependency required.
 *
 * Public surface:
 *   buildWorkbook({ sheetName, columns, rows }) -> Buffer
 *     columns:  array of column-header strings
 *     rows:     array of arrays (cells); strings/numbers/Date/null/undefined
 */

const zlib = require('zlib');

function _xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Strip control chars that would corrupt the XML
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

// Convert a 0-indexed column to A, B, ..., Z, AA, AB...
function _colLetter(idx) {
  let s = '';
  let n = idx;
  while (true) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
    if (n < 0) break;
  }
  return s;
}

function _cellRef(col, row1Based) {
  return _colLetter(col) + row1Based;
}

function _isNumericString(v) {
  if (typeof v !== 'string') return false;
  if (v === '') return false;
  // Excel-friendly numeric: int or decimal, optional leading minus,
  // no leading zero on multi-digit integers (so "007" stays as text).
  return /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v);
}

function _sheetXml(columns, rows) {
  const parts = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`);
  parts.push(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`);
  parts.push(`<sheetData>`);

  // Header row
  parts.push(`<row r="1">`);
  columns.forEach((c, i) => {
    parts.push(`<c r="${_cellRef(i, 1)}" t="inlineStr"><is><t>${_xmlEscape(c)}</t></is></c>`);
  });
  parts.push(`</row>`);

  // Body rows
  rows.forEach((row, rIdx) => {
    const rowNum = rIdx + 2;
    parts.push(`<row r="${rowNum}">`);
    row.forEach((v, i) => {
      const ref = _cellRef(i, rowNum);
      if (v === null || v === undefined || v === '') return; // omit empty
      let val = v;
      if (val instanceof Date) {
        const iso = val.toISOString();
        parts.push(`<c r="${ref}" t="inlineStr"><is><t>${_xmlEscape(iso)}</t></is></c>`);
        return;
      }
      if (typeof val === 'boolean') {
        parts.push(`<c r="${ref}" t="b"><v>${val ? 1 : 0}</v></c>`);
        return;
      }
      if (typeof val === 'number' && Number.isFinite(val)) {
        parts.push(`<c r="${ref}"><v>${val}</v></c>`);
        return;
      }
      const s = String(val);
      if (_isNumericString(s) && s.length < 16) {
        parts.push(`<c r="${ref}"><v>${s}</v></c>`);
        return;
      }
      parts.push(`<c r="${ref}" t="inlineStr"><is><t>${_xmlEscape(s)}</t></is></c>`);
    });
    parts.push(`</row>`);
  });

  parts.push(`</sheetData></worksheet>`);
  return parts.join('');
}

const STATIC_PARTS = {
  '[Content_Types].xml':
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,

  '_rels/.rels':
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,

  'xl/_rels/workbook.xml.rels':
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
};

function _workbookXml(sheetName) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="${_xmlEscape(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

// ── Minimal ZIP writer (DEFLATE entries, central directory) ────────────────
//
// Each file entry is stored using DEFLATE compression. We do not include the
// data-descriptor variant since we know the sizes up-front.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function _crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function _zipBuild(files) {
  // files: [{ name, data: Buffer }]
  const localChunks = [];
  const cdChunks = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf       = Buffer.from(f.name, 'utf8');
    const uncompressed  = f.data;
    const compressed    = zlib.deflateRawSync(uncompressed);
    const crc           = _crc32(uncompressed);
    const dosDateTime   = 0; // 1980-01-01 00:00:00 — fine for our purposes

    // Local file header
    const lf = Buffer.alloc(30);
    lf.writeUInt32LE(0x04034b50, 0);
    lf.writeUInt16LE(20, 4);              // version needed
    lf.writeUInt16LE(0x0800, 6);          // flags: UTF-8 names
    lf.writeUInt16LE(8, 8);               // method: DEFLATE
    lf.writeUInt16LE(dosDateTime & 0xffff, 10);
    lf.writeUInt16LE((dosDateTime >>> 16) & 0xffff, 12);
    lf.writeUInt32LE(crc, 14);
    lf.writeUInt32LE(compressed.length, 18);
    lf.writeUInt32LE(uncompressed.length, 22);
    lf.writeUInt16LE(nameBuf.length, 26);
    lf.writeUInt16LE(0, 28);              // extra length

    localChunks.push(lf, nameBuf, compressed);

    // Central directory entry
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);              // version made by
    cd.writeUInt16LE(20, 6);              // version needed
    cd.writeUInt16LE(0x0800, 8);          // flags
    cd.writeUInt16LE(8, 10);              // method
    cd.writeUInt16LE(dosDateTime & 0xffff, 12);
    cd.writeUInt16LE((dosDateTime >>> 16) & 0xffff, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(uncompressed.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);              // extra length
    cd.writeUInt16LE(0, 32);              // comment length
    cd.writeUInt16LE(0, 34);              // disk number start
    cd.writeUInt16LE(0, 36);              // internal attrs
    cd.writeUInt32LE(0, 38);              // external attrs
    cd.writeUInt32LE(offset, 42);

    cdChunks.push(cd, nameBuf);
    offset += lf.length + nameBuf.length + compressed.length;
  }

  const local = Buffer.concat(localChunks);
  const cd    = Buffer.concat(cdChunks);

  // End of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);                // disk
  eocd.writeUInt16LE(0, 6);                // disk with CD
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([local, cd, eocd]);
}

function buildWorkbook({ sheetName = 'Sheet1', columns = [], rows = [] } = {}) {
  const files = [
    { name: '[Content_Types].xml',          data: Buffer.from(STATIC_PARTS['[Content_Types].xml'], 'utf8') },
    { name: '_rels/.rels',                  data: Buffer.from(STATIC_PARTS['_rels/.rels'], 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels',   data: Buffer.from(STATIC_PARTS['xl/_rels/workbook.xml.rels'], 'utf8') },
    { name: 'xl/workbook.xml',              data: Buffer.from(_workbookXml(sheetName), 'utf8') },
    { name: 'xl/worksheets/sheet1.xml',     data: Buffer.from(_sheetXml(columns, rows), 'utf8') },
  ];
  return _zipBuild(files);
}

module.exports = { buildWorkbook };
