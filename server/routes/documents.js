const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { requireAuth, canDelete } = require('../middleware/auth');
const { readDecryptedFile, writeEncryptedFile } = require('../lib/file-encryption');

const router = express.Router();

// ─── Allowed modules ──────────────────────────────────────────

const ALLOWED_MODULES = new Set([
  'contacts', 'policies', 'claims', 'accounts', 'engagements',
  'policy-sections', 'assets', 'risk-details', 'advice-records',
  'complaints', 'reviews', 'workflows',
  'broker-profiles', 'cpd-activities',
  'asset-amendments'
]);

// ─── Module name → documents table FK column mapping ─────────

const MODULE_FK = {
  'contacts':         'contact_id',
  'policies':         'policy_id',
  'claims':           'claim_id',
  'accounts':         'account_id',
  'engagements':      'engagement_id',
  'policy-sections':  'policy_section_id',
  'assets':           'asset_id',
  'risk-details':     'risk_detail_id',
  'advice-records':   'advice_record_id',
  'complaints':       'complaint_id',
  'reviews':          'review_id',
  'workflows':        'workflow_id',
  'broker-profiles':  'broker_profile_id',
  'cpd-activities':   'cpd_activity_id',
  'asset-amendments': 'asset_amendment_id'
};

// ─── Allowed MIME types ───────────────────────────────────────

const ALLOWED_MIMETYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel'
]);

// ─── Multer — memory storage (we write to disk ourselves) ─────

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: pdf, jpg, jpeg, png, docx, xlsx, csv'));
    }
  }
});

// ─── Helpers ─────────────────────────────────────────────────

function getUploadRoot() {
  return process.env.UPLOAD_PATH
    ? path.resolve(process.env.UPLOAD_PATH)
    : path.resolve(__dirname, '../../uploads');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function extFromMimetype(mimetype) {
  const map = {
    'application/pdf':         '.pdf',
    'image/jpeg':              '.jpg',
    'image/png':               '.png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'text/csv': '.csv',
    'application/csv': '.csv',
    'application/vnd.ms-excel': '.csv'
  };
  return map[mimetype] || '';
}

function encodeRFC5987Value(value) {
  return encodeURIComponent(value)
    .replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function contentDisposition(disposition, filename) {
  const baseName = path.basename(String(filename || 'document'));
  const fallback = baseName
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\;\r\n]/g, '_') || 'document';
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeRFC5987Value(baseName)}`;
}

function resolveStoredPath(filePath) {
  const uploadRoot = getUploadRoot();
  const fullPath = path.resolve(uploadRoot, filePath || '');
  const relative = path.relative(uploadRoot, fullPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return fullPath;
}

function sendStoredDocument(req, res, disposition) {
  const db = getDb();
  const { id } = req.params;

  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  const fullPath = resolveStoredPath(doc.file_path);
  if (!fullPath || !fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }

  let fileBuffer;
  try {
    fileBuffer = readDecryptedFile(fullPath);
  } catch (err) {
    console.error('Document decrypt error:', err);
    return res.status(500).json({ error: 'Failed to decrypt file' });
  }

  res.setHeader('Content-Type', doc.file_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', contentDisposition(disposition, doc.original_name || doc.file_name));
  res.setHeader('Content-Length', fileBuffer.length);

  return res.send(fileBuffer);
}

// ─── POST /upload — upload a file ────────────────────────────

router.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const { module: mod, record_id, description } = req.body;

  if (!mod || !record_id) {
    return res.status(400).json({ error: 'Required body fields: module, record_id' });
  }

  if (!ALLOWED_MODULES.has(mod)) {
    return res.status(400).json({
      error: `Invalid module. Allowed: ${[...ALLOWED_MODULES].join(', ')}`
    });
  }

  const fkColumn    = MODULE_FK[mod];
  const uploadRoot  = getUploadRoot();
  const destDir     = path.join(uploadRoot, mod, String(record_id));
  ensureDir(destDir);

  const ext          = extFromMimetype(req.file.mimetype);
  const uniqueName   = `${uuidv4()}${ext}`;
  const destPath     = path.join(destDir, uniqueName);
  const relPath      = path.join(mod, String(record_id), uniqueName).replace(/\\/g, '/');

  writeEncryptedFile(destPath, req.file.buffer);

  const db = getDb();

  const result = db.prepare(`
    INSERT INTO documents (
      ${fkColumn}, file_name, original_name, file_type,
      file_path, file_size, description, uploaded_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    parseInt(record_id, 10),
    uniqueName,
    req.file.originalname,
    req.file.mimetype,
    relPath,
    req.file.size,
    description || null,
    req.session.userId
  );

  const created = db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid);

  res.locals.logAudit({
    action:      'CREATE',
    module:      'documents',
    recordId:    result.lastInsertRowid,
    newValue:    { module: mod, record_id, file_name: uniqueName, original_name: req.file.originalname },
    description: `Document "${req.file.originalname}" uploaded for ${mod}/${record_id}`
  });

  return res.status(201).json(created);
});

// ─── GET / — list documents with optional filters ────────────

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { module: mod, record_id } = req.query;

  if (!mod || !record_id) {
    return res.status(400).json({ error: 'Query params required: module, record_id' });
  }

  if (!ALLOWED_MODULES.has(mod)) {
    return res.status(400).json({
      error: `Invalid module. Allowed: ${[...ALLOWED_MODULES].join(', ')}`
    });
  }

  const fkColumn = MODULE_FK[mod];

  const rows = db.prepare(`
    SELECT
      d.*,
      u.full_name AS uploaded_by_name
    FROM documents d
    LEFT JOIN users u ON u.id = d.uploaded_by
    WHERE d.${fkColumn} = ?
    ORDER BY d.uploaded_at DESC
  `).all(parseInt(record_id, 10));

  return res.json({
    data: rows.map(row => ({
      ...row,
      view_url: `/api/documents/${row.id}/view`,
      download_url: `/api/documents/${row.id}/download`
    }))
  });
});

// ─── DELETE /:id — delete file from disk and database ────────

router.delete('/:id', requireAuth, canDelete, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Document not found' });
  }

  // Remove file from disk
  const uploadRoot = getUploadRoot();
  const fullPath   = path.join(uploadRoot, existing.file_path);

  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }

  db.prepare('DELETE FROM documents WHERE id = ?').run(id);

  res.locals.logAudit({
    action:      'DELETE',
    module:      'documents',
    recordId:    parseInt(id, 10),
    oldValue:    existing,
    description: `Document "${existing.original_name}" deleted (id ${id})`
  });

  return res.json({ message: 'Document deleted successfully' });
});

// ─── GET /:id/download — stream file to browser ──────────────

router.get('/:id/view', requireAuth, (req, res) => sendStoredDocument(req, res, 'inline'));

router.get('/:id/download', requireAuth, (req, res) => sendStoredDocument(req, res, 'attachment'));

// ─── Multer error handler ─────────────────────────────────────

router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError || err.message?.includes('Invalid file type')) {
    return res.status(400).json({ error: err.message });
  }
  console.error('Documents route error:', err);
  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;
