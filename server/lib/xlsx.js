'use strict';
/**
 * Minimal dependency-free XLSX writer.
 *
 * Builds an Office Open XML (.xlsx) workbook for a single sheet and returns it
 * as a Buffer. .xlsx is a zip of a few XML parts; we use Node's built-in zlib
 * for DEFLATE and assemble the zip container by hand. No external dependency.
 *
 * Public surface:
 *   STYLES   -> { default, bold, section, thead, theadRight, cell, cellRight, title }
 *               style-index constants for use in styled cells.
 *
 *   buildWorkbook({ sheetName, columns, rows, cols, headerFooter, image }) -> Buffer
 *     columns:  array of column-header strings. Rendered as a bold row 1.
 *               Pass [] (or omit) to skip the header row entirely.
 *     rows:     array of arrays (cells). A cell is either a primitive
 *               (string/number/Date/boolean/null/undefined) OR a styled object
 *               { v: <value>, bold: true } / { v: <value>, s: <STYLES index> }.
 *               A styled object with an empty value still paints fill/border.
 *     cols:     optional [{ width }] column widths (Excel char-width units).
 *     headerFooter (optional): { oddHeader, oddFooter } — Excel print
 *               header/footer strings using the standard &L/&C/&R/&P/&N codes.
 *     image (optional): { data: Buffer, widthEmu, heightEmu } — a PNG anchored
 *               at A1 (e.g. a letterhead). Caller reserves blank rows for it.
 */

const zlib = require('zlib');

// Style indices — must match the cellXfs order in styles.xml below.
const STYLES = {
  default: 0, bold: 1, section: 2, thead: 3, theadRight: 4,
  cell: 5, cellRight: 6, title: 7,
};

function _xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

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
  return /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v);
}

// Render one cell. styleIdx selects a cellXf (see styles.xml). An empty value
// with a non-zero style still emits a (self-closing) styled cell so fills and
// borders are painted; an empty value with no style is omitted entirely.
function _cellXml(ref, v, styleIdx) {
  const sAttr = styleIdx ? ` s="${styleIdx}"` : '';
  if (v === null || v === undefined || v === '') {
    return styleIdx ? `<c r="${ref}"${sAttr}/>` : '';
  }
  let val = v;
  if (val instanceof Date) {
    return `<c r="${ref}"${sAttr} t="inlineStr"><is><t>${_xmlEscape(val.toISOString())}</t></is></c>`;
  }
  if (typeof val === 'boolean') {
    return `<c r="${ref}"${sAttr} t="b"><v>${val ? 1 : 0}</v></c>`;
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return `<c r="${ref}"${sAttr}><v>${val}</v></c>`;
  }
  const s = String(val);
  if (_isNumericString(s) && s.length < 16) {
    return `<c r="${ref}"${sAttr}><v>${s}</v></c>`;
  }
  return `<c r="${ref}"${sAttr} t="inlineStr"><is><t>${_xmlEscape(s)}</t></is></c>`;
}

function _cellFrom(cell) {
  // Returns { val, styleIdx } for a primitive or styled-object cell.
  if (cell && typeof cell === 'object' && !(cell instanceof Date)) {
    return { val: cell.v, styleIdx: cell.s != null ? cell.s : (cell.bold ? STYLES.bold : 0) };
  }
  return { val: cell, styleIdx: 0 };
}

function _sheetXml({ columns, rows, headerFooter, cols, hasDrawing }) {
  const parts = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`);
  parts.push(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`);

  // Column widths (before <sheetData> per schema)
  if (cols && cols.length) {
    parts.push(`<cols>`);
    cols.forEach((c, i) => {
      parts.push(`<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`);
    });
    parts.push(`</cols>`);
  }

  parts.push(`<sheetData>`);

  let bodyStart = 1;
  if (columns && columns.length) {
    parts.push(`<row r="1">`);
    columns.forEach((c, i) => { parts.push(_cellXml(_cellRef(i, 1), c, STYLES.bold)); });
    parts.push(`</row>`);
    bodyStart = 2;
  }

  rows.forEach((row, rIdx) => {
    const rowNum = rIdx + bodyStart;
    parts.push(`<row r="${rowNum}">`);
    row.forEach((cell, i) => {
      const { val, styleIdx } = _cellFrom(cell);
      const xml = _cellXml(_cellRef(i, rowNum), val, styleIdx);
      if (xml) parts.push(xml);
    });
    parts.push(`</row>`);
  });

  parts.push(`</sheetData>`);

  // Print header/footer (after </sheetData>; pageMargins must precede it).
  if (headerFooter && (headerFooter.oddHeader || headerFooter.oddFooter)) {
    parts.push(`<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>`);
    parts.push(`<headerFooter>`);
    if (headerFooter.oddHeader) parts.push(`<oddHeader>${_xmlEscape(headerFooter.oddHeader)}</oddHeader>`);
    if (headerFooter.oddFooter) parts.push(`<oddFooter>${_xmlEscape(headerFooter.oddFooter)}</oddFooter>`);
    parts.push(`</headerFooter>`);
  }

  // Drawing reference (after headerFooter per schema).
  if (hasDrawing) parts.push(`<drawing r:id="rId1"/>`);

  parts.push(`</worksheet>`);
  return parts.join('');
}

function _contentTypesXml(hasImage) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>${hasImage ? `
  <Default Extension="png" ContentType="image/png"/>` : ''}
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hasImage ? `
  <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : ''}
</Types>`;
}

const RELS_DOT_RELS =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

// Two regular + two bold fonts; primary + grey fills; thin border. cellXfs
// order matches STYLES above.
const STYLES_XML =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="13"/><color rgb="FF1A5276"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1A5276"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEEEEEE"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCCCCCC"/></left>
      <right style="thin"><color rgb="FFCCCCCC"/></right>
      <top style="thin"><color rgb="FFCCCCCC"/></top>
      <bottom style="thin"><color rgb="FFCCCCCC"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const SHEET_RELS =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`;

const DRAWING_RELS =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>`;

function _drawingXml(widthEmu, heightEmu) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:oneCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:ext cx="${widthEmu}" cy="${heightEmu}"/>
    <xdr:pic>
      <xdr:nvPicPr>
        <xdr:cNvPr id="1" name="Letterhead"/>
        <xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>
      </xdr:nvPicPr>
      <xdr:blipFill>
        <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/>
        <a:stretch><a:fillRect/></a:stretch>
      </xdr:blipFill>
      <xdr:spPr>
        <a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      </xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:oneCellAnchor>
</xdr:wsDr>`;
}

function _workbookXml(sheetName) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="${_xmlEscape(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

// ── Minimal ZIP writer (DEFLATE entries, central directory) ────────────────

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
  const localChunks = [];
  const cdChunks = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf       = Buffer.from(f.name, 'utf8');
    const uncompressed  = f.data;
    const compressed    = zlib.deflateRawSync(uncompressed);
    const crc           = _crc32(uncompressed);
    const dosDateTime   = 0;

    const lf = Buffer.alloc(30);
    lf.writeUInt32LE(0x04034b50, 0);
    lf.writeUInt16LE(20, 4);
    lf.writeUInt16LE(0x0800, 6);
    lf.writeUInt16LE(8, 8);
    lf.writeUInt16LE(dosDateTime & 0xffff, 10);
    lf.writeUInt16LE((dosDateTime >>> 16) & 0xffff, 12);
    lf.writeUInt32LE(crc, 14);
    lf.writeUInt32LE(compressed.length, 18);
    lf.writeUInt32LE(uncompressed.length, 22);
    lf.writeUInt16LE(nameBuf.length, 26);
    lf.writeUInt16LE(0, 28);

    localChunks.push(lf, nameBuf, compressed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(dosDateTime & 0xffff, 12);
    cd.writeUInt16LE((dosDateTime >>> 16) & 0xffff, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(uncompressed.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);

    cdChunks.push(cd, nameBuf);
    offset += lf.length + nameBuf.length + compressed.length;
  }

  const local = Buffer.concat(localChunks);
  const cd    = Buffer.concat(cdChunks);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([local, cd, eocd]);
}

function buildWorkbook({ sheetName = 'Sheet1', columns = [], rows = [], cols = null, headerFooter = null, image = null } = {}) {
  const hasImage = !!(image && image.data && image.data.length);

  const sheetXml = _sheetXml({ columns, rows, headerFooter, cols, hasDrawing: hasImage });

  const files = [
    { name: '[Content_Types].xml',        data: Buffer.from(_contentTypesXml(hasImage), 'utf8') },
    { name: '_rels/.rels',                data: Buffer.from(RELS_DOT_RELS, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(WORKBOOK_RELS, 'utf8') },
    { name: 'xl/workbook.xml',            data: Buffer.from(_workbookXml(sheetName), 'utf8') },
    { name: 'xl/styles.xml',              data: Buffer.from(STYLES_XML, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml',   data: Buffer.from(sheetXml, 'utf8') },
  ];

  if (hasImage) {
    files.push(
      { name: 'xl/worksheets/_rels/sheet1.xml.rels', data: Buffer.from(SHEET_RELS, 'utf8') },
      { name: 'xl/drawings/drawing1.xml',            data: Buffer.from(_drawingXml(image.widthEmu, image.heightEmu), 'utf8') },
      { name: 'xl/drawings/_rels/drawing1.xml.rels', data: Buffer.from(DRAWING_RELS, 'utf8') },
      { name: 'xl/media/image1.png',                 data: image.data },
    );
  }

  return _zipBuild(files);
}

module.exports = { buildWorkbook, STYLES };
