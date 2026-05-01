const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, requireAdminAny } = require('../middleware/auth');

const router = express.Router();

// GET /api/settings — get all settings (admin or admin_only)
router.get('/', requireAuth, requireAdminAny, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM system_settings').all();
  const settings = {};
  rows.forEach(r => {
    try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
  });
  res.json(settings);
});

// PUT /api/settings — save settings (admin or admin_only)
router.put('/', requireAuth, requireAdminAny, (req, res) => {
  const db = getDb();
  const settings = req.body;
  const upsert = db.prepare(`
    INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  const tx = db.transaction(() => {
    Object.entries(settings).forEach(([k, v]) => {
      upsert.run(k, JSON.stringify(v));
    });
  });
  tx();
  res.json({ message: 'Settings saved' });
});

// ═════════════════════════════════════════════════════════════════════
// Company Details — single record stored as JSON in system_settings.
// Document uploads go to uploads/company/.
// ═════════════════════════════════════════════════════════════════════
const multer = require('multer');
const fsMod  = require('fs');
const pathMod = require('path');
const {
  getPlainFileSize,
  readDecryptedFile,
  writeEncryptedFile,
} = require('../lib/file-encryption');
const COMPANY_UPLOAD_DIR = pathMod.join(__dirname, '..', '..', 'uploads', 'company');
const CLAIM_FORMS_DIR = pathMod.join(__dirname, '..', '..', 'client', 'public', 'claim_forms');
if (!fsMod.existsSync(COMPANY_UPLOAD_DIR)) {
  try { fsMod.mkdirSync(COMPANY_UPLOAD_DIR, { recursive: true }); } catch (_) {}
}
const companyUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});
const INEXPRO_LETTERHEAD_PATH = pathMod.join(__dirname, '..', '..', 'client', 'public', 'letterhead-ROA.png');
const EMAIL_LETTERHEAD_CID = 'inexpro-letterhead@inexpro-crm';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ''));
}

function normaliseEmailHtml(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (looksLikeHtml(raw)) {
    return `<div style="line-height:1.55;margin:0;color:#222;">${raw}</div>`;
  }
  return raw
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `<p style="margin:0 0 12px;line-height:1.55;">${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function getScheduleEmailContext(db, contactId, accountId) {
  let clientName = '';
  let policies = [];
  if (contactId) {
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
    if (contact) {
      clientName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.company_name || '';
      policies = db.prepare('SELECT * FROM policies WHERE contact_id = ?').all(contactId);
      if (contact.related_account_id) {
        const acctPols = db.prepare('SELECT * FROM policies WHERE account_id = ?').all(contact.related_account_id);
        const ids = new Set(policies.map(p => p.id));
        acctPols.forEach(p => { if (!ids.has(p.id)) policies.push(p); });
      }
    }
  } else if (accountId) {
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
    if (account) clientName = account.account_name || '';
    policies = db.prepare('SELECT * FROM policies WHERE account_id = ?').all(accountId);
  }
  const policyNumbers = [...new Set(policies.map(p => p.policy_number).filter(Boolean))].join(', ');
  return { clientName, policyNumbers };
}

function wrapInexproEmail(html, scheduleContext) {
  const scheduleMeta = scheduleContext ? `
    <div style="padding:0 24px 16px 24px;border-bottom:1px solid #e5e7eb;margin-bottom:20px;">
      <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:6px;">Policy Schedule</div>
      ${scheduleContext.clientName ? `<div style="font-size:13px;line-height:1.45;color:#4b5563;"><strong>Insured:</strong> ${escapeHtml(scheduleContext.clientName)}</div>` : ''}
      <div style="font-size:13px;line-height:1.45;color:#4b5563;"><strong>Policy Number${(scheduleContext.policyNumbers || '').includes(',') ? 's' : ''}:</strong> ${escapeHtml(scheduleContext.policyNumbers || '—')}</div>
    </div>` : '';

  return `
    <div style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#222;">
      <div style="max-width:790px;margin:0 auto;">
        <img src="cid:${EMAIL_LETTERHEAD_CID}" alt="Inexpro" style="display:block;width:100%;max-width:790px;height:auto;border:0;margin:0 0 20px 0;">
        ${scheduleMeta}
        <div style="padding:0 24px 24px 24px;font-size:14px;line-height:1.55;">
          ${html}
        </div>
      </div>
    </div>`;
}

function companyDocumentFilename(originalName) {
  const safe = String(originalName || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${Date.now()}_${safe}`;
}

function encodeRFC5987Value(value) {
  return encodeURIComponent(value)
    .replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function companyDocDisposition(disposition, filename) {
  const baseName = pathMod.basename(String(filename || 'company-document'));
  const fallback = baseName
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\;\r\n]/g, '_') || 'company-document';
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeRFC5987Value(baseName)}`;
}

function companyDocMime(filename) {
  const ext = pathMod.extname(filename || '').toLowerCase();
  return ({
    '.pdf':  'application/pdf',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png':  'image/png',
    '.doc':  'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls':  'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.csv':  'text/csv; charset=utf-8',
    '.txt':  'text/plain; charset=utf-8',
  })[ext] || 'application/octet-stream';
}

function sendCompanyDocument(req, res, disposition) {
  const safe = pathMod.basename(req.params.name);
  const full = pathMod.join(COMPANY_UPLOAD_DIR, safe);
  if (!fsMod.existsSync(full)) return res.status(404).json({ error: 'File not found' });

  let fileBuffer;
  try {
    fileBuffer = readDecryptedFile(full);
  } catch (err) {
    console.error('Company document decrypt error:', err);
    return res.status(500).json({ error: 'Failed to decrypt file' });
  }

  res.setHeader('Content-Type', companyDocMime(safe));
  res.setHeader('Content-Disposition', companyDocDisposition(disposition, safe));
  res.setHeader('Content-Length', fileBuffer.length);
  return res.send(fileBuffer);
}

// GET /api/settings/company — company details object (admin or admin_only)
router.get('/company', requireAuth, requireAdminAny, (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT value FROM system_settings WHERE key = 'company_details'").get();
  let value = {};
  if (row) { try { value = JSON.parse(row.value); } catch { value = {}; } }
  res.json(value);
});

// PUT /api/settings/company — save the company details object
router.put('/company', requireAuth, requireAdminAny, (req, res) => {
  const db = getDb();
  const payload = req.body || {};
  db.prepare(`
    INSERT INTO system_settings (key, value, updated_at) VALUES ('company_details', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(JSON.stringify(payload));
  const { logAudit } = require('../middleware/audit');
  logAudit({
    userId:      req.session.userId,
    ip:          req.ip,
    action:      'UPDATE',
    module:      'company_details',
    description: `Company details updated by ${req.session.userName || ('user ' + req.session.userId)}`,
  });
  res.json({ message: 'Company details saved' });
});

// GET /api/settings/company/documents — list uploaded company files
router.get('/company/documents', requireAuth, requireAdminAny, (_req, res) => {
  try {
    if (!fsMod.existsSync(COMPANY_UPLOAD_DIR)) return res.json([]);
    const files = fsMod.readdirSync(COMPANY_UPLOAD_DIR)
      .filter(f => !f.startsWith('.'))
      .map(filename => {
        const full = pathMod.join(COMPANY_UPLOAD_DIR, filename);
        return {
          filename,
          size: getPlainFileSize(full),
          uploaded_at: fsMod.statSync(full).mtime.toISOString(),
          url: `/api/settings/company/documents/${encodeURIComponent(filename)}`,
          view_url: `/api/settings/company/documents/${encodeURIComponent(filename)}/view`,
        };
      })
      .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/company/documents — upload a company document
router.post('/company/documents', requireAuth, requireAdminAny,
  companyUpload.single('file'),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const filename = companyDocumentFilename(req.file.originalname);
    const full = pathMod.join(COMPANY_UPLOAD_DIR, filename);
    try {
      writeEncryptedFile(full, req.file.buffer);
    } catch (err) {
      console.error('Company document encrypt error:', err);
      return res.status(500).json({ error: 'Failed to encrypt file' });
    }
    const { logAudit } = require('../middleware/audit');
    logAudit({
      userId:      req.session.userId,
      ip:          req.ip,
      action:      'CREATE',
      module:      'company_details',
      description: `Company document uploaded: ${filename}`,
    });
    res.status(201).json({
      filename,
      size:        req.file.size,
      uploaded_at: new Date().toISOString(),
      url:         `/api/settings/company/documents/${encodeURIComponent(filename)}`,
      view_url:    `/api/settings/company/documents/${encodeURIComponent(filename)}/view`,
    });
  }
);

// GET /api/settings/company/documents/:name — download
router.get('/company/documents/:name/view', requireAuth, requireAdminAny, (req, res) => {
  return sendCompanyDocument(req, res, 'inline');
});

router.get('/company/documents/:name', requireAuth, requireAdminAny, (req, res) => {
  return sendCompanyDocument(req, res, 'attachment');
});

// DELETE /api/settings/company/documents/:name — remove a company file
router.delete('/company/documents/:name', requireAuth, requireAdminAny, (req, res) => {
  const safe = pathMod.basename(req.params.name);
  const full = pathMod.join(COMPANY_UPLOAD_DIR, safe);
  if (!fsMod.existsSync(full)) return res.status(404).json({ error: 'File not found' });
  fsMod.unlinkSync(full);
  const { logAudit } = require('../middleware/audit');
  logAudit({
    userId:      req.session.userId,
    ip:          req.ip,
    action:      'DELETE',
    module:      'company_details',
    description: `Company document deleted: ${safe}`,
  });
  res.json({ message: 'File deleted' });
});

// GET /api/settings/security-public — non-sensitive security flags every
// authenticated user needs to know (e.g. whether the edit-password gate is
// globally bypassed, so the client can skip password prompts).
router.get('/security-public', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT value FROM system_settings WHERE key = 'bypass_edit_password'").get();
  let bypass = false;
  if (row) {
    try { bypass = JSON.parse(row.value) === true; } catch { bypass = (row.value === '1' || row.value === 'true'); }
  }
  res.json({ bypass_edit_password: bypass });
});

// GET /api/settings/signatures — list available signature image files
router.get('/signatures', requireAuth, (req, res) => {
  try {
    const fs = require('fs');
    const pathMod = require('path');
    const dir = pathMod.join(__dirname, '..', '..', 'signatures');
    if (!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir)
      .filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/test-email — test SMTP connection
router.post('/test-email', requireAuth, requireAdminAny, async (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM system_settings WHERE key LIKE ?').all('smtp_%');
    const settings = {};
    rows.forEach(r => { try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; } });

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: parseInt(settings.smtp_port) || 587,
      secure: String(settings.smtp_port) === '465',
      auth: { user: settings.smtp_user, pass: settings.smtp_pass },
    });
    await transporter.verify();
    res.json({ message: 'SMTP connection successful' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Email Template endpoints (all authenticated users) ─────────

// GET /api/settings/templates — list all templates
router.get('/templates', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM system_settings WHERE key LIKE 'template_%'").all();
  // Build template map: { key: { subject, body } }
  const templates = {};
  rows.forEach(r => {
    const match = r.key.match(/^template_(.+)_(subject|body)$/);
    if (!match) return;
    const [, name, field] = match;
    if (!templates[name]) templates[name] = { key: name, subject: '', body: '' };
    try { templates[name][field] = JSON.parse(r.value); } catch { templates[name][field] = r.value; }
  });
  // Also load the custom template list to preserve ordering/names
  const listRow = db.prepare("SELECT value FROM system_settings WHERE key = 'template_list'").get();
  let templateList = [];
  if (listRow) {
    try { templateList = JSON.parse(listRow.value); } catch {}
  }
  // Merge: ensure default templates are always present
  const defaults = [
    { key: 'policy_summary', label: 'Policy Summary' },
    { key: 'general', label: 'General Communication' },
    { key: 'data_breach_notification', label: 'Data Breach Notification' },
  ];
  const allKeys = new Set(templateList.map(t => t.key));
  defaults.forEach(d => { if (!allKeys.has(d.key)) templateList.unshift(d); });
  // Attach subject/body to list entries
  const result = templateList.map(t => ({
    key: t.key,
    label: t.label || t.key,
    subject: templates[t.key]?.subject || (
      t.key === 'data_breach_notification' ? 'Important: Data breach notification' : ''
    ),
    body: templates[t.key]?.body || (
      t.key === 'data_breach_notification'
        ? '<p>Dear {{recipient_name}},</p>\n<p>We are notifying you immediately after discovering a data breach that may affect information we hold.</p>\n<p><strong>Date of breach:</strong> {{breach_date}}<br><strong>Date discovered:</strong> {{discovered_date}}<br><strong>Nature of breach:</strong> {{nature}}<br><strong>Data affected:</strong> {{data_affected}}</p>\n<p><strong>Remediation:</strong> {{remediation}}</p>\n<p>We will provide further updates as our investigation progresses.</p>'
        : ''
    ),
  }));
  // Also include any orphaned templates not in the list
  Object.keys(templates).forEach(k => {
    if (!allKeys.has(k) && !defaults.some(d => d.key === k)) {
      result.push({ key: k, label: k, subject: templates[k].subject, body: templates[k].body });
    }
  });
  res.json(result);
});

// PUT /api/settings/templates/:key — save a template
router.put('/templates/:key', requireAuth, (req, res) => {
  const db = getDb();
  const { key } = req.params;
  const { subject, body, label } = req.body;
  const safeKey = key.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  const upsert = db.prepare(`
    INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  const tx = db.transaction(() => {
    if (subject !== undefined) upsert.run(`template_${safeKey}_subject`, JSON.stringify(subject));
    if (body !== undefined) upsert.run(`template_${safeKey}_body`, JSON.stringify(body));
    // Update template list
    const listRow = db.prepare("SELECT value FROM system_settings WHERE key = 'template_list'").get();
    let list = [];
    if (listRow) { try { list = JSON.parse(listRow.value); } catch {} }
    const idx = list.findIndex(t => t.key === safeKey);
    if (idx >= 0) { if (label) list[idx].label = label; }
    else list.push({ key: safeKey, label: label || safeKey });
    upsert.run('template_list', JSON.stringify(list));
  });
  tx();
  res.json({ message: 'Template saved' });
});

// DELETE /api/settings/templates/:key — delete a template
router.delete('/templates/:key', requireAuth, (req, res) => {
  const db = getDb();
  const { key } = req.params;
  const safeKey = key.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM system_settings WHERE key = ?").run(`template_${safeKey}_subject`);
    db.prepare("DELETE FROM system_settings WHERE key = ?").run(`template_${safeKey}_body`);
    // Remove from template list
    const listRow = db.prepare("SELECT value FROM system_settings WHERE key = 'template_list'").get();
    let list = [];
    if (listRow) { try { list = JSON.parse(listRow.value); } catch {} }
    list = list.filter(t => t.key !== safeKey);
    const upsert = db.prepare(`
      INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
    upsert.run('template_list', JSON.stringify(list));
  });
  tx();
  res.json({ message: 'Template deleted' });
});

// ── Helper: generate ROA PDF buffer ──────────────────────────
async function generateRoaPdf(db, roaId) {
  const d = db.prepare(`
    SELECT ar.*,
      c.first_name || ' ' || c.last_name AS contact_name,
      c.email AS contact_email, c.mobile AS contact_mobile, c.sa_id_number AS contact_id_number,
      b.full_name AS broker_name
    FROM advice_records ar
    LEFT JOIN contacts c ON c.id = ar.contact_id
    LEFT JOIN users b ON b.id = ar.broker_id
    WHERE ar.id = ?
  `).get(roaId);
  if (!d) return null;

  const PDFDocument = require('pdfkit');
  const fs = require('fs');
  const pathMod = require('path');
  const chunks = [];
  const pdfDoc = new PDFDocument({ margin: 42, size: 'A4' });
  pdfDoc.on('data', chunk => chunks.push(chunk));

  await new Promise((resolve, reject) => {
    pdfDoc.on('end', resolve);
    pdfDoc.on('error', reject);

    const MARGIN = 42, CONTENT_W = 595.28 - 84;
    const dateStr = (v) => v ? String(v).slice(0, 10) : '\u2014';
    const dash = (v) => v || '\u2014';

    // Letterhead
    const letterheadPath = pathMod.join(__dirname, '../../client/public/letterhead-ROA.png');
    if (fs.existsSync(letterheadPath)) {
      const imgData = fs.readFileSync(letterheadPath);
      const imgW = imgData.readUInt32BE(16);
      const imgH = imgData.readUInt32BE(20);
      pdfDoc.image(letterheadPath, 0, 0, { width: 595.28 });
      pdfDoc.y = (imgH / imgW) * 595.28 + 8;
    }

    pdfDoc.fontSize(14).font('Helvetica-Bold').fillColor('#1a5276')
      .text('RECORD OF ADVICE', MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'center' });
    pdfDoc.moveDown(0.5);
    pdfDoc.fontSize(10).font('Helvetica').fillColor('#222');

    const field = (l, v) => { pdfDoc.font('Helvetica-Bold').text(`${l}: `, { continued: true }); pdfDoc.font('Helvetica').text(dash(v)); };
    field('Reference', d.advice_record_number);
    field('Client', d.contact_name);
    field('Adviser', d.broker_name);
    field('Advice Date', dateStr(d.advice_date));
    field('Advice Type', d.advice_type);
    if (d.client_needs_identified) { pdfDoc.moveDown(0.5); pdfDoc.font('Helvetica-Bold').text('Client Needs:'); pdfDoc.font('Helvetica').text(d.client_needs_identified); }
    if (d.recommendation_given) { pdfDoc.moveDown(0.5); pdfDoc.font('Helvetica-Bold').text('Recommendation:'); pdfDoc.font('Helvetica').text(d.recommendation_given); }
    if (d.reason_product_suitable) { pdfDoc.moveDown(0.5); pdfDoc.font('Helvetica-Bold').text('Why Suitable:'); pdfDoc.font('Helvetica').text(d.reason_product_suitable); }
    pdfDoc.moveDown(1);
    pdfDoc.fontSize(8).fillColor('#999').text(`Generated by Inexpro CRM on ${new Date().toLocaleDateString('en-ZA')}`, { align: 'center' });
    pdfDoc.end();
  });
  return { buffer: Buffer.concat(chunks), filename: `ROA-${d.advice_record_number || roaId}.pdf` };
}

// ── Helper: generate Policy Schedule PDF buffer ─────────────
async function generateSchedulePdf(db, contactId, accountId) {
  let clientName = '\u2014', contact = null, account = null, policies = [];
  if (contactId) {
    contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
    if (contact) clientName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || '\u2014';
    policies = db.prepare('SELECT * FROM policies WHERE contact_id = ?').all(contactId);
    if (contact && contact.related_account_id) {
      account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(contact.related_account_id);
      const acctPols = db.prepare('SELECT * FROM policies WHERE account_id = ?').all(contact.related_account_id);
      const ids = new Set(policies.map(p => p.id));
      acctPols.forEach(p => { if (!ids.has(p.id)) policies.push(p); });
    }
  } else if (accountId) {
    account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
    if (account) clientName = account.account_name || '\u2014';
    policies = db.prepare('SELECT * FROM policies WHERE account_id = ?').all(accountId);
  }

  // Helpers — auto-calculate asset value + premium from parts (mirrors form)
  const numOrZero = (v) => Number(v) || 0;
  function assetValueAuto(a) {
    let v = numOrZero(a.sum_insured);
    try { const ex = JSON.parse(a.vehicle_extras || '[]'); if (Array.isArray(ex)) ex.forEach(x => v += numOrZero(x.amount)); } catch (_) {}
    try { const ac = JSON.parse(a.additional_covers || '[]'); if (Array.isArray(ac)) ac.forEach(x => v += numOrZero(x.cover_amount)); } catch (_) {}
    return v;
  }
  function assetPremiumAuto(a) {
    let p = numOrZero(a.sum_insured_premium);
    try { const ex = JSON.parse(a.vehicle_extras || '[]'); if (Array.isArray(ex)) ex.forEach(x => p += numOrZero(x.premium)); } catch (_) {}
    try { const ac = JSON.parse(a.additional_covers || '[]'); if (Array.isArray(ac)) ac.forEach(x => p += numOrZero(x.premium)); } catch (_) {}
    try { const xc = JSON.parse(a.excesses          || '[]'); if (Array.isArray(xc)) xc.forEach(x => p += numOrZero(x.premium)); } catch (_) {}
    return p;
  }

  // Load assets for each policy, grouped by section
  const policyDetails = policies.map(pol => {
    const assets = db.prepare('SELECT * FROM assets WHERE policy_id = ? ORDER BY asset_section, asset_name').all(pol.id);
    return { policy: pol, assets };
  });

  // Grand totals (computed from parts, not stored aggregates)
  let grandPremium = 0, grandSasria = 0, grandExcess = 0, grandValue = 0;
  policyDetails.forEach(({ assets }) => {
    assets.forEach(a => {
      grandPremium += assetPremiumAuto(a);
      grandValue   += assetValueAuto(a);
      grandSasria  += numOrZero(a.sasria);
      grandExcess  += numOrZero(a.excess);
    });
  });

  const PDFDocument = require('pdfkit');
  const chunks = [];
  // Landscape A4 — gives the asset table ~245pt more horizontal room so every
  // column can show its full text without truncation.
  const pdfDoc = new PDFDocument({ margin: 0, size: 'A4', layout: 'landscape', autoFirstPage: true });
  pdfDoc.on('data', chunk => chunks.push(chunk));

  // Suppress pdfkit's automatic text-flow pagination — we lay out everything
  // at absolute (x, y) and paginate manually via checkPage(). Without this,
  // any text() that started near the bottom margin would silently flow onto
  // a new page and chop the row mid-content.
  const _origContinue = pdfDoc.continueOnNewPage;
  pdfDoc.continueOnNewPage = function () { return this; };

  await new Promise((resolve, reject) => {
    pdfDoc.on('end', () => { pdfDoc.continueOnNewPage = _origContinue; resolve(); });
    pdfDoc.on('error', (err) => { pdfDoc.continueOnNewPage = _origContinue; reject(err); });

    // Landscape A4 — width and height are swapped vs. portrait.
    const PAGE_W = 841.89, PAGE_H = 595.28;
    const M = 36; // margin
    const W = PAGE_W - M * 2;
    const PRIMARY = '#1a73e8';
    const DARK = '#2c3e50';
    const LIGHT_BG = '#f5f7fa';
    const BORDER = '#dee2e6';
    const dash = (v) => v || '\u2014';
    const fmtCur = (v) => (v != null && v !== '' && v !== 0) ? 'R ' + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '\u2014';
    const fmtDate = (v) => v ? String(v).slice(0, 10) : '\u2014';
    const today = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // ── Ensure we don't overflow the page ──
    function checkPage(needed) {
      if (pdfDoc.y + needed > PAGE_H - 50) pdfDoc.addPage();
    }

    // ═══ HEADER BAR (blue) ═══
    let cy = 72;
    if (fsMod.existsSync(INEXPRO_LETTERHEAD_PATH)) {
      try {
        const imgData = fsMod.readFileSync(INEXPRO_LETTERHEAD_PATH);
        const imgW = imgData.readUInt32BE(16);
        const imgH = imgData.readUInt32BE(20);
        pdfDoc.image(INEXPRO_LETTERHEAD_PATH, 0, 0, { width: PAGE_W });
        cy = (imgH / imgW) * PAGE_W + 18;
      } catch (_) {}
      pdfDoc.font('Helvetica-Bold').fontSize(16).fillColor('#1a5276')
        .text('POLICY SCHEDULE', M, cy, { width: W / 2 });
      pdfDoc.font('Helvetica').fontSize(8).fillColor('#555')
        .text(`Date Prepared: ${today}`, M + W / 2, cy + 2, { width: W / 2, align: 'right' })
        .text(`${policies.length} polic${policies.length !== 1 ? 'ies' : 'y'} included`, M + W / 2, cy + 14, { width: W / 2, align: 'right' });
      cy += 34;
    } else {
      pdfDoc.rect(0, 0, PAGE_W, 65).fillColor(PRIMARY).fill();
      pdfDoc.font('Helvetica-Bold').fontSize(18).fillColor('#ffffff')
        .text('POLICY SCHEDULE', M, 16, { width: W / 2 });
      pdfDoc.font('Helvetica').fontSize(8).fillColor('#ffffffcc')
        .text('Confidential \u2014 prepared by Inexpro CC', M, 38);
      pdfDoc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff')
        .text('Inexpro CC', M + W / 2, 16, { width: W / 2, align: 'right' });
      pdfDoc.font('Helvetica').fontSize(8).fillColor('#ffffffcc')
        .text(`Date Prepared: ${today}`, M + W / 2, 30, { width: W / 2, align: 'right' })
        .text(`${policies.length} polic${policies.length !== 1 ? 'ies' : 'y'} included`, M + W / 2, 42, { width: W / 2, align: 'right' });
    }

    // ═══ CLIENT DETAILS BAR ═══
    // Match the client HTML schedule's spacing: 3 columns, taller rows,
    // bigger label/value fonts so fields breathe instead of cramming.
    const policyNumbers = [...new Set(policies.map(p => p.policy_number).filter(Boolean))].join(', ');
    const brokerCodes = [...new Set(policies.map(p => p.broker_code_snapshot).filter(Boolean))].join(', ');
    const clientFields = [];
    clientFields.push(['INSURED', clientName]);
    clientFields.push([policyNumbers.includes(',') ? 'POLICY NUMBERS' : 'POLICY NUMBER', policyNumbers || '\u2014']);
    if (brokerCodes) clientFields.push([brokerCodes.includes(',') ? 'BROKER CODES' : 'BROKER CODE', brokerCodes]);
    if (account && account.registration_number) clientFields.push(['REG NUMBER', account.registration_number]);
    if (contact && contact.email)            clientFields.push(['EMAIL', contact.email]);
    if (contact && contact.mobile)           clientFields.push(['MOBILE', contact.mobile]);
    if (account && account.email)            clientFields.push(['EMAIL', account.email]);
    if (account && account.phone)            clientFields.push(['PHONE', account.phone]);

    const COLS_CF = 3;
    const rowsCountCF = Math.ceil(clientFields.length / COLS_CF);
    const cfRowH = 26;
    const cfBarH = 16 + rowsCountCF * cfRowH;
    pdfDoc.rect(0, cy, PAGE_W, cfBarH).fillColor(LIGHT_BG).fill();
    pdfDoc.moveTo(0, cy + cfBarH).lineTo(PAGE_W, cy + cfBarH).strokeColor(BORDER).lineWidth(0.5).stroke();

    const cfW = W / COLS_CF;
    clientFields.forEach(([label, value], i) => {
      const x = M + (i % COLS_CF) * cfW;
      const rowIdx = Math.floor(i / COLS_CF);
      const fy = cy + 10 + rowIdx * cfRowH;
      pdfDoc.font('Helvetica').fontSize(7).fillColor('#888')
        .text(label, x, fy, { width: cfW - 10, lineBreak: false, ellipsis: true });
      pdfDoc.font('Helvetica-Bold').fontSize(10).fillColor('#222')
        .text(dash(value), x, fy + 10, { width: cfW - 10, lineBreak: false, ellipsis: true });
    });
    cy += cfBarH;

    // ═══ GRAND SUMMARY BAR (dark) ═══
    if (policies.length) {
      const sumH = 38;
      pdfDoc.rect(0, cy, PAGE_W, sumH).fillColor('#222').fill();
      const sumItems = [
        ['TOTAL POLICIES', String(policies.length)],
        ['TOTAL INSURED VALUE', fmtCur(grandValue)],
        ['TOTAL PREMIUM', fmtCur(grandPremium)],
      ];
      if (grandSasria) sumItems.push(['TOTAL SASRIA', fmtCur(grandSasria)]);
      if (grandExcess) sumItems.push(['TOTAL EXCESS', fmtCur(grandExcess)]);
      const sw = W / sumItems.length;
      sumItems.forEach(([label, value], i) => {
        pdfDoc.font('Helvetica').fontSize(7).fillColor('#ffffff99')
          .text(label, M + i * sw, cy + 7, { width: sw, lineBreak: false, ellipsis: true });
        pdfDoc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff')
          .text(value, M + i * sw, cy + 19, { width: sw, lineBreak: false, ellipsis: true });
      });
      cy += sumH + 4;
    }

    pdfDoc.y = cy + 14;
    pdfDoc.x = M;

    // ═══ POLICY BLOCKS ═══
    policyDetails.forEach(({ policy, assets }) => {
      const polPremium = Number(policy.premium) || 0;

      // Group assets by section
      const sectionMap = new Map();
      assets.forEach(a => {
        const key = a.asset_section || 'Uncategorised';
        if (!sectionMap.has(key)) sectionMap.set(key, []);
        sectionMap.get(key).push(a);
      });
      const sectionKeys = [...sectionMap.keys()].sort((a, b) => {
        if (a === 'Uncategorised') return 1;
        if (b === 'Uncategorised') return -1;
        return a.localeCompare(b);
      });

      // ── Policy header (dark blue bar) ──
      checkPage(140);
      const phY = pdfDoc.y;
      const phH = 30;
      pdfDoc.rect(M, phY, W, phH).fillColor(DARK).fill();
      pdfDoc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff')
        .text(dash(policy.policy_name || policy.policy_number), M + 12, phY + 9, { width: W / 2 - 16, lineBreak: false, ellipsis: true });
      pdfDoc.font('Helvetica').fontSize(8).fillColor('#ffffffcc')
        .text(`Policy #: ${dash(policy.policy_number)}    Insurer: ${dash(policy.insurer)}    Status: ${dash(policy.policy_status)}`,
          M + W / 2, phY + 11, { width: W / 2 - 12, align: 'right', lineBreak: false, ellipsis: true });

      // ── Policy details row ──
      const pdY = phY + phH;
      const detailParts = [
        `Product: ${dash(policy.product_category || policy.policy_type)}`,
        `Inception: ${fmtDate(policy.inception_date)}`,
        `Renewal: ${fmtDate(policy.renewal_date)}`,
        `Premium: ${fmtCur(polPremium)}`,
      ];
      if (policy.broker_code_snapshot) {
        detailParts.push(`Broker Code: ${policy.broker_code_snapshot}${policy.broker_code_description_snapshot ? ' — ' + policy.broker_code_description_snapshot : ''}`);
      }
      const pdH = 22;
      pdfDoc.rect(M, pdY, W, pdH).fillColor(LIGHT_BG).fill();
      pdfDoc.moveTo(M, pdY + pdH).lineTo(M + W, pdY + pdH).strokeColor(BORDER).lineWidth(0.5).stroke();
      pdfDoc.font('Helvetica').fontSize(9).fillColor('#444')
        .text(detailParts.join('     '), M + 12, pdY + 7, { width: W - 24 });

      pdfDoc.y = pdY + pdH + 4;

      // ── Section asset tables ──
      if (sectionKeys.length) {
        sectionKeys.forEach(secName => {
          const items = sectionMap.get(secName);
          const secVal  = items.reduce((s, a) => s + assetValueAuto(a), 0);
          const secPrem = items.reduce((s, a) => s + assetPremiumAuto(a), 0);
          const secSas  = items.reduce((s, a) => s + numOrZero(a.sasria), 0);
          const secExc  = items.reduce((s, a) => s + numOrZero(a.excess), 0);

          checkPage(60);

          // Section title bar
          const stY = pdfDoc.y;
          const stH = 18;
          pdfDoc.rect(M, stY, W, stH).fillColor('#ecf0f1').fill();
          pdfDoc.moveTo(M, stY + stH).lineTo(M + W, stY + stH).strokeColor(BORDER).lineWidth(0.5).stroke();
          pdfDoc.font('Helvetica-Bold').fontSize(8.5).fillColor('#555')
            .text(secName.toUpperCase(), M + 12, stY + 5, { width: W - 24, lineBreak: false, ellipsis: true });

          // Table header \u2014 TYPE column removed. Every cell is allowed to wrap
          // so values are never truncated; row height grows to fit the
          // tallest cell on each row.
          const thY = stY + stH;
          const thH = 20;
          pdfDoc.rect(M, thY, W, thH).fillColor('#34495e').fill();
          const numW = W * 0.10;              // each numeric column
          const numStart = M + W - 4 * numW;  // left edge of the 4-column right block
          const leftBlockW = numStart - (M + 22);
          const cols = [
            { x: M + 4,                              w: 18,                    label: '#',           align: 'left'  },
            { x: M + 22,                             w: leftBlockW * 0.50,     label: 'DESCRIPTION', align: 'left'  },
            { x: M + 22 + leftBlockW * 0.50,         w: leftBlockW * 0.22,     label: 'MAKE/MODEL',  align: 'left'  },
            { x: M + 22 + leftBlockW * 0.72,         w: leftBlockW * 0.08,     label: 'YEAR',        align: 'left'  },
            { x: M + 22 + leftBlockW * 0.80,         w: leftBlockW * 0.20,     label: 'REG/SERIAL',  align: 'left'  },
            { x: numStart,                            w: numW,                  label: 'VALUE',       align: 'right' },
            { x: numStart + numW,                     w: numW,                  label: 'PREMIUM',     align: 'right' },
            { x: numStart + numW * 2,                 w: numW,                  label: 'SASRIA',      align: 'right' },
            { x: numStart + numW * 3,                 w: numW,                  label: 'EXCESS',      align: 'right' },
          ];
          cols.forEach(c => {
            pdfDoc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff')
              .text(c.label, c.x, thY + 7, { width: c.w, align: c.align, lineBreak: false, ellipsis: true });
          });

          const minRowH = 22;
          let rowY = thY + thH;
          items.forEach((a, i) => {
            // Pre-measure every wrappable cell so the row can grow to fit
            // the tallest value (description, make/model, reg/serial, etc.).
            const vals = {
              description: dash(a.asset_name),
              makeModel:   [a.make, a.model].filter(Boolean).join(' ') || '\u2014',
              year:        dash(a.year),
              regSerial:   dash(a.registration_number || a.serial_number),
              value:       fmtCur(assetValueAuto(a)),
              premium:     fmtCur(assetPremiumAuto(a)),
              sasria:      fmtCur(a.sasria),
              excess:      fmtCur(a.excess),
            };
            pdfDoc.font('Helvetica').fontSize(8.5);
            const wrapped = [
              [vals.description, cols[1].w],
              [vals.makeModel,   cols[2].w],
              [vals.year,        cols[3].w],
              [vals.regSerial,   cols[4].w],
              [vals.value,       cols[5].w],
              [vals.premium,     cols[6].w],
              [vals.sasria,      cols[7].w],
              [vals.excess,      cols[8].w],
            ];
            const tallest = wrapped.reduce(
              (h, [t, w]) => Math.max(h, pdfDoc.heightOfString(t, { width: w })),
              0
            );
            const rowH = Math.max(minRowH, tallest + 12);

            checkPage(rowH + 4);
            if (pdfDoc.y > rowY) rowY = pdfDoc.y; // after page break

            const bg = i % 2 === 1 ? '#fafafa' : '#ffffff';
            pdfDoc.rect(M, rowY, W, rowH).fillColor(bg).fill();
            const cy = rowY + 6;

            // Index \u2014 always one short string, single line.
            pdfDoc.font('Helvetica').fontSize(8.5).fillColor('#888')
              .text(String(i + 1), cols[0].x, cy, { width: cols[0].w, align: cols[0].align, lineBreak: false, ellipsis: true });

            // All other cells: non-bold, multi-line wrap allowed.
            const cellOpt = (col) => ({ width: col.w, align: col.align });
            pdfDoc.font('Helvetica').fontSize(8.5).fillColor('#222');
            pdfDoc.text(vals.description, cols[1].x, cy, cellOpt(cols[1]));
            pdfDoc.fillColor('#333');
            pdfDoc.text(vals.makeModel,   cols[2].x, cy, cellOpt(cols[2]));
            pdfDoc.text(vals.year,        cols[3].x, cy, cellOpt(cols[3]));
            pdfDoc.text(vals.regSerial,   cols[4].x, cy, cellOpt(cols[4]));
            pdfDoc.fillColor('#222');
            pdfDoc.text(vals.value,       cols[5].x, cy, cellOpt(cols[5]));
            pdfDoc.text(vals.premium,     cols[6].x, cy, cellOpt(cols[6]));
            pdfDoc.text(vals.sasria,      cols[7].x, cy, cellOpt(cols[7]));
            pdfDoc.text(vals.excess,      cols[8].x, cy, cellOpt(cols[8]));

            rowY += rowH;
          });

          // Section total row \u2014 labels span the left block, numerics are the
          // last 4 cells (cols[5..8]) after the TYPE column was removed.
          const totH = 20;
          pdfDoc.rect(M, rowY, W, totH).fillColor('#ecf0f1').fill();
          pdfDoc.moveTo(M, rowY).lineTo(M + W, rowY).strokeColor('#bdc3c7').lineWidth(1).stroke();
          pdfDoc.font('Helvetica-Bold').fontSize(8.5).fillColor('#222')
            .text(`Section Total (${items.length} item${items.length !== 1 ? 's' : ''})`,
              cols[0].x, rowY + 6,
              { width: cols[4].x + cols[4].w - cols[0].x, lineBreak: false, ellipsis: true });
          pdfDoc.text(fmtCur(secVal),  cols[5].x, rowY + 6, { width: cols[5].w, align: 'right', lineBreak: false, ellipsis: true });
          pdfDoc.text(fmtCur(secPrem), cols[6].x, rowY + 6, { width: cols[6].w, align: 'right', lineBreak: false, ellipsis: true });
          pdfDoc.text(secSas ? fmtCur(secSas) : '\u2014', cols[7].x, rowY + 6, { width: cols[7].w, align: 'right', lineBreak: false, ellipsis: true });
          pdfDoc.text(secExc ? fmtCur(secExc) : '\u2014', cols[8].x, rowY + 6, { width: cols[8].w, align: 'right', lineBreak: false, ellipsis: true });
          pdfDoc.y = rowY + totH + 4;
        });
      } else {
        pdfDoc.font('Helvetica-Oblique').fontSize(9).fillColor('#888')
          .text('No insured items recorded for this policy.', M + 12, pdfDoc.y + 4);
        pdfDoc.moveDown(0.6);
      }

      // ── Policy subtotal bar ──
      if (assets.length) {
        const assetValue  = assets.reduce((s, a) => s + assetValueAuto(a), 0);
        const assetPrem   = assets.reduce((s, a) => s + assetPremiumAuto(a), 0);
        const assetSasria = assets.reduce((s, a) => s + numOrZero(a.sasria), 0);
        const stY = pdfDoc.y;
        const subH = 20;
        pdfDoc.rect(M, stY, W, subH).fillColor('#e8f0fe').fill();
        pdfDoc.moveTo(M, stY).lineTo(M + W, stY).strokeColor('#c5d8f0').lineWidth(0.5).stroke();
        let subText = `Policy Premium: ${fmtCur(polPremium)}`;
        if (assetValue)  subText += `     Total Insured Value: ${fmtCur(assetValue)}`;
        if (assetPrem)   subText += `     Asset Premiums: ${fmtCur(assetPrem)}`;
        if (assetSasria) subText += `     SASRIA: ${fmtCur(assetSasria)}`;
        pdfDoc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1a5276')
          .text(subText, M + 12, stY + 6, { width: W - 24 });
        pdfDoc.y = stY + subH + 4;
      }

      pdfDoc.moveDown(1);
    });

    // ═══ FOOTER ═══
    checkPage(44);
    const ftY = pdfDoc.y + 4;
    pdfDoc.moveTo(M, ftY).lineTo(M + W, ftY).strokeColor(BORDER).lineWidth(0.5).stroke();
    pdfDoc.font('Helvetica').fontSize(7).fillColor('#999')
      .text(`This document is confidential and prepared for the exclusive use of ${clientName}. Inexpro CC \u2014 Authorised Financial Services Provider.`,
        M, ftY + 6, { width: W, align: 'center' });
    pdfDoc.font('Helvetica-Bold').fontSize(7.5).fillColor('#555')
      .text('FSP No: 7591', M, ftY + 18, { width: W, align: 'center' });

    pdfDoc.end();
  });
  return { buffer: Buffer.concat(chunks), filename: `Policy-Schedule-${clientName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf` };
}

// GET /api/settings/claim-forms — list available claim form templates
router.get('/claim-forms', requireAuth, (req, res) => {
  try {
    if (!fsMod.existsSync(CLAIM_FORMS_DIR)) return res.json([]);
    const files = fsMod.readdirSync(CLAIM_FORMS_DIR)
      .filter(f => !f.startsWith('.') && pathMod.extname(f).toLowerCase() === '.pdf')
      .filter(f => fsMod.statSync(pathMod.join(CLAIM_FORMS_DIR, f)).isFile())
      .sort((a, b) => a.localeCompare(b))
      .map(filename => ({
        filename,
        label: pathMod.basename(filename, '.pdf'),
        content_type: 'application/pdf',
        url: `/claim_forms/${encodeURIComponent(filename)}`,
      }));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/send-email — send an email (with optional attachments)
router.post('/send-email', requireAuth, async (req, res) => {
  const { to, cc, subject, html, text, document_ids, roa_ids, schedule_contact_id, schedule_account_id, amendment_pdf, audit_module, audit_record_id, user_attachments, claim_form_names } = req.body;
  if (!to || !subject || (!html && !text)) {
    return res.status(400).json({ error: 'to, subject, and html or text are required' });
  }
  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM system_settings WHERE key LIKE ?').all('smtp_%');
    const settings = {};
    rows.forEach(r => { try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; } });

    if (!settings.smtp_host || !settings.smtp_user) {
      return res.status(400).json({ error: 'SMTP not configured. Please configure email settings in Admin.' });
    }

    // Build attachments from document IDs
    const attachments = [];
    if (Array.isArray(document_ids) && document_ids.length) {
      const path = require('path');
      const fs = require('fs');
      const uploadRoot = path.join(__dirname, '..', '..', 'uploads');
      for (const docId of document_ids) {
        const doc = db.prepare('SELECT original_name, file_path, file_type FROM documents WHERE id = ?').get(docId);
        if (doc) {
          const fullPath = path.join(uploadRoot, doc.file_path);
          if (fs.existsSync(fullPath)) {
            attachments.push({
              filename: doc.original_name,
              path: fullPath,
              contentType: doc.file_type || 'application/octet-stream',
            });
          }
        }
      }
    }

    // Generate and attach ROA PDFs
    if (Array.isArray(roa_ids) && roa_ids.length) {
      for (const roaId of roa_ids) {
        const pdf = await generateRoaPdf(db, roaId);
        if (pdf) {
          attachments.push({ filename: pdf.filename, content: pdf.buffer, contentType: 'application/pdf' });
        }
      }
    }

    // Generate and attach Policy Schedule PDF
    let scheduleEmailContext = null;
    if (schedule_contact_id || schedule_account_id) {
      scheduleEmailContext = getScheduleEmailContext(db, schedule_contact_id, schedule_account_id);
      const pdf = await generateSchedulePdf(db, schedule_contact_id, schedule_account_id);
      if (pdf) {
        attachments.push({ filename: pdf.filename, content: pdf.buffer, contentType: 'application/pdf' });
      }
    }

    // Attach amendment PDF (sent as base64 from client)
    if (amendment_pdf && amendment_pdf.base64) {
      attachments.push({
        filename: `Amendment-Notification.pdf`,
        content: Buffer.from(amendment_pdf.base64, 'base64'),
        contentType: 'application/pdf',
      });
    }

    // Attach user-uploaded files (base64 from client)
    if (Array.isArray(user_attachments) && user_attachments.length) {
      for (const f of user_attachments) {
        if (!f || !f.filename || !f.content_base64) continue;
        attachments.push({
          filename: String(f.filename),
          content: Buffer.from(f.content_base64, 'base64'),
          contentType: f.content_type || 'application/octet-stream',
        });
      }
    }

    // Attach selected claim form templates from /client/public/claim_forms/
    if (Array.isArray(claim_form_names) && claim_form_names.length) {
      for (const rawName of claim_form_names) {
        if (!rawName) continue;
        // Guard against path traversal and legacy Word attachments.
        const safeName = pathMod.basename(String(rawName));
        if (pathMod.extname(safeName).toLowerCase() !== '.pdf') continue;
        const fullPath = pathMod.join(CLAIM_FORMS_DIR, safeName);
        if (fsMod.existsSync(fullPath) && fsMod.statSync(fullPath).isFile()) {
          attachments.push({ filename: safeName, path: fullPath, contentType: 'application/pdf' });
        }
      }
    }

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: parseInt(settings.smtp_port) || 587,
      secure: String(settings.smtp_port) === '465',
      auth: { user: settings.smtp_user, pass: settings.smtp_pass },
    });
    // ── Determine the From address + signature based on signed-in user ──
    // smtp_from_list is a JSON array of { user_id, name, email, signature } entries.
    let fromAddress = settings.smtp_from || settings.smtp_user;
    let userEntry = null;
    try {
      const fromList = Array.isArray(settings.smtp_from_list) ? settings.smtp_from_list : [];
      userEntry = fromList.find(f => String(f.user_id) === String(req.session.userId) && f.email) || null;
      if (userEntry) {
        fromAddress = userEntry.name
          ? `"${String(userEntry.name).replace(/"/g, '')}" <${userEntry.email}>`
          : userEntry.email;
      }
    } catch (_) {}

    // ── Append signature image if the user has one assigned ──
    let finalHtml = normaliseEmailHtml(html || text);
    let finalText = text;
    const includeLetterhead = !!scheduleEmailContext && fsMod.existsSync(INEXPRO_LETTERHEAD_PATH);
    if (includeLetterhead) {
      attachments.push({
        filename: pathMod.basename(INEXPRO_LETTERHEAD_PATH),
        path: INEXPRO_LETTERHEAD_PATH,
        cid: EMAIL_LETTERHEAD_CID,
      });
    }
    if (userEntry && userEntry.signature) {
      const path = require('path');
      const fs = require('fs');
      // Guard against path traversal — only use the basename
      const safeName = path.basename(String(userEntry.signature));
      const sigPath = path.join(__dirname, '..', '..', 'signatures', safeName);
      if (fs.existsSync(sigPath)) {
        const cid = 'user-signature@inexpro';
        attachments.push({
          filename: safeName,
          path: sigPath,
          cid,
        });
        const sigHtml = `<div style="margin-top:18px;"><img src="cid:${cid}" alt="signature" style="max-width:400px;height:auto;"></div>`;
        if (finalHtml) finalHtml = finalHtml + sigHtml;
        else finalHtml = sigHtml;
      }
    }

    // ── Auto-CC the sending user ──
    // Determine the sender's email to add as CC
    if (includeLetterhead) {
      finalHtml = wrapInexproEmail(finalHtml, scheduleEmailContext);
    }

    let senderEmail = null;
    if (userEntry && userEntry.email) {
      senderEmail = userEntry.email;
    } else {
      // Fallback: look up the user's email from the users table
      const senderRow = db.prepare('SELECT email FROM users WHERE id = ?').get(req.session.userId);
      if (senderRow) senderEmail = senderRow.email;
    }

    // Merge sender into CC list (avoid duplicating if already present)
    let finalCc = [];
    if (cc) {
      finalCc = Array.isArray(cc) ? [...cc] : String(cc).split(',').map(s => s.trim()).filter(Boolean);
    }
    if (senderEmail) {
      const lowerCc = finalCc.map(e => e.toLowerCase());
      if (!lowerCc.includes(senderEmail.toLowerCase())) {
        finalCc.push(senderEmail);
      }
    }

    await transporter.sendMail({
      from: fromAddress,
      to,
      ...(finalCc.length ? { cc: finalCc.join(', ') } : {}),
      subject,
      html: finalHtml,
      text: finalText,
      attachments,
    });

    // ── Log to audit trail + timeline ──
    // If the caller provides audit_module and audit_record_id the email
    // appears on that record's timeline.  We also log a generic 'emails'
    // module entry so it shows in the global audit log.
    // Build a list of attached filenames (excluding the inline signature image)
    const attachedNames = attachments
      .filter(a => !a.cid)
      .map(a => a.filename)
      .filter(Boolean);

    const { logAudit } = require('../middleware/audit');
    const baseDescription = `Email sent to ${to} — "${subject}"`;
    const description = attachedNames.length
      ? `${baseDescription} — attachments: ${attachedNames.join(', ')}`
      : baseDescription;
    const auditPayload = {
      userId: req.session.userId,
      ip: req.ip,
      action: 'EMAIL',
      description,
      newValue: {
        to,
        cc: finalCc.length ? finalCc.join(', ') : null,
        subject,
        from: fromAddress,
        attachments: attachedNames,
      },
    };

    if (audit_module && audit_record_id) {
      logAudit({ ...auditPayload, module: audit_module, recordId: parseInt(audit_record_id, 10) });
    }
    // Always log under the generic 'emails' module for the global audit log
    logAudit({ ...auditPayload, module: 'emails', recordId: null });

    res.json({ message: 'Email sent successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
