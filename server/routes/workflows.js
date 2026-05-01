'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth, canDelete, getBrokerId } = require('../middleware/auth');
const { resolveSort } = require('./view-prefs');

router.use(requireAuth);

const STATUSES = ['Assigned', 'Open', 'In Progress', 'On Hold', 'Completed'];

const COLUMNS = [
  'description', 'due_date', 'contact_id', 'account_id',
  'policy_id', 'asset_id', 'claim_id', 'notes', 'status', 'assigned_broker_id'
];

function normalise(v) {
  if (v === undefined || v === null) return null;
  const s = typeof v === 'string' ? v.trim() : v;
  return s === '' ? null : s;
}

// GET / — list
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const { search, status, contact_id, account_id, policy_id, asset_id } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId) {
      conditions.push('(w.assigned_broker_id = ? OR w.assigned_broker_id IS NULL)');
      params.push(scopedBrokerId);
    }
    const { claim_id } = req.query;
    if (status)      { conditions.push('w.status = ?');     params.push(status); }
    if (contact_id)  { conditions.push('w.contact_id = ?'); params.push(contact_id); }
    if (account_id)  { conditions.push('w.account_id = ?'); params.push(account_id); }
    if (policy_id)   { conditions.push('w.policy_id = ?');  params.push(policy_id); }
    if (asset_id)    { conditions.push('w.asset_id = ?');   params.push(asset_id); }
    if (claim_id)    { conditions.push('w.claim_id = ?');   params.push(claim_id); }
    if (search) {
      conditions.push('(w.description LIKE ? OR w.notes LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const baseQuery = `
      FROM workflows w
      LEFT JOIN contacts c  ON w.contact_id = c.id
      LEFT JOIN accounts a  ON w.account_id = a.id
      LEFT JOIN policies p  ON w.policy_id  = p.id
      LEFT JOIN assets   s  ON w.asset_id   = s.id
      LEFT JOIN claims   cl ON w.claim_id   = cl.id
      LEFT JOIN users    u  ON w.assigned_broker_id = u.id
      ${where}
    `;

    const totalRow = db.prepare(`SELECT COUNT(*) AS total ${baseQuery}`).get(...params);
    const total = totalRow?.total || 0;

    // Server-side sort using the view-prefs allowlist; falls back to the
    // previous compound "status bucket → due date → id" ordering.
    const resolved = resolveSort('workflows', req.query.sort, req.query.dir);
    const orderBy = resolved
      ? `ORDER BY ${resolved.sql} ${resolved.dir}, w.id DESC`
      : `ORDER BY
           CASE w.status
             WHEN 'Completed' THEN 2
             WHEN 'On Hold'   THEN 1
             ELSE 0
           END ASC,
           COALESCE(w.due_date, '9999-12-31') ASC,
           w.id DESC`;

    const rows = db.prepare(`
      SELECT
        w.*,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        a.account_name,
        p.policy_name,
        p.policy_number,
        s.asset_name,
        cl.claim_number,
        u.full_name AS broker_name
      ${baseQuery}
      ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({ data: rows, total, page, limit });
  } catch (err) { next(err); }
});

// GET /:id
router.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT
        w.*,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        a.account_name,
        p.policy_name,
        p.policy_number,
        s.asset_name,
        cl.claim_number,
        u.full_name AS broker_name
      FROM workflows w
      LEFT JOIN contacts c  ON w.contact_id = c.id
      LEFT JOIN accounts a  ON w.account_id = a.id
      LEFT JOIN policies p  ON w.policy_id  = p.id
      LEFT JOIN assets   s  ON w.asset_id   = s.id
      LEFT JOIN claims   cl ON w.claim_id   = cl.id
      LEFT JOIN users    u  ON w.assigned_broker_id = u.id
      WHERE w.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Workflow not found' });
    res.json(row);
  } catch (err) { next(err); }
});

// POST /
router.post('/', (req, res, next) => {
  try {
    const db = getDb();
    const b = req.body;
    if (!b.description || !String(b.description).trim()) {
      return res.status(400).json({ error: 'description is required' });
    }
    if (b.status && !STATUSES.includes(b.status)) {
      return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    }

    const values = {
      description: String(b.description).trim(),
      due_date: normalise(b.due_date),
      contact_id: normalise(b.contact_id),
      account_id: normalise(b.account_id),
      policy_id: normalise(b.policy_id),
      asset_id: normalise(b.asset_id),
      claim_id: normalise(b.claim_id),
      notes: normalise(b.notes),
      status: b.status || 'Assigned',
      assigned_broker_id: normalise(b.assigned_broker_id),
      created_by: req.session.userId,
    };

    const stmt = db.prepare(`
      INSERT INTO workflows (
        description, due_date, contact_id, account_id,
        policy_id, asset_id, claim_id, notes, status, assigned_broker_id,
        created_by, created_at, updated_at
      ) VALUES (
        @description, @due_date, @contact_id, @account_id,
        @policy_id, @asset_id, @claim_id, @notes, @status, @assigned_broker_id,
        @created_by, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);
    const result = stmt.run(values);
    const created = db.prepare('SELECT * FROM workflows WHERE id = ?').get(result.lastInsertRowid);
    res.locals.logAudit?.({
      action: 'CREATE', module: 'workflows',
      recordId: result.lastInsertRowid, newValue: created,
      description: `Workflow created: ${values.description}`
    });
    res.status(201).json(created);
  } catch (err) { next(err); }
});

// PUT /:id
router.put('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM workflows WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Workflow not found' });

    const b = req.body;
    if (b.status && !STATUSES.includes(b.status)) {
      return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    }

    const updated = {
      id: req.params.id,
      description: b.description !== undefined ? (String(b.description).trim() || existing.description) : existing.description,
      due_date: b.due_date !== undefined ? normalise(b.due_date) : existing.due_date,
      contact_id: b.contact_id !== undefined ? normalise(b.contact_id) : existing.contact_id,
      account_id: b.account_id !== undefined ? normalise(b.account_id) : existing.account_id,
      policy_id: b.policy_id !== undefined ? normalise(b.policy_id) : existing.policy_id,
      asset_id: b.asset_id !== undefined ? normalise(b.asset_id) : existing.asset_id,
      claim_id: b.claim_id !== undefined ? normalise(b.claim_id) : existing.claim_id,
      notes: b.notes !== undefined ? normalise(b.notes) : existing.notes,
      status: b.status || existing.status,
      assigned_broker_id: b.assigned_broker_id !== undefined ? normalise(b.assigned_broker_id) : existing.assigned_broker_id,
    };

    db.prepare(`
      UPDATE workflows SET
        description = @description,
        due_date = @due_date,
        contact_id = @contact_id,
        account_id = @account_id,
        policy_id = @policy_id,
        asset_id = @asset_id,
        claim_id = @claim_id,
        notes = @notes,
        status = @status,
        assigned_broker_id = @assigned_broker_id,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run(updated);

    const saved = db.prepare('SELECT * FROM workflows WHERE id = ?').get(req.params.id);
    res.locals.logAudit?.({
      action: 'UPDATE', module: 'workflows',
      recordId: req.params.id, oldValue: existing, newValue: saved,
      description: 'Workflow updated'
    });
    res.json(saved);
  } catch (err) { next(err); }
});

// DELETE /:id
router.delete('/:id', canDelete, (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM workflows WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Workflow not found' });
    db.prepare('DELETE FROM workflows WHERE id = ?').run(req.params.id);
    res.locals.logAudit?.({
      action: 'DELETE', module: 'workflows',
      recordId: req.params.id, oldValue: existing,
      description: 'Workflow deleted'
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ============================================================
// Workflow Notes
// ============================================================

// GET /:id/notes
router.get('/:id/notes', (req, res, next) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT n.*, u.full_name AS created_by_name
      FROM workflow_notes n
      LEFT JOIN users u ON u.id = n.created_by
      WHERE n.workflow_id = ?
      ORDER BY n.note_date DESC, n.id DESC
    `).all(req.params.id);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /:id/notes
router.post('/:id/notes', (req, res, next) => {
  try {
    const db = getDb();
    const wf = db.prepare('SELECT id FROM workflows WHERE id = ?').get(req.params.id);
    if (!wf) return res.status(404).json({ error: 'Workflow not found' });

    const { note_date, details } = req.body || {};
    if (!details || !String(details).trim()) {
      return res.status(400).json({ error: 'details is required' });
    }
    const finalDate = note_date || new Date().toISOString().slice(0, 10);

    const result = db.prepare(`
      INSERT INTO workflow_notes (workflow_id, note_date, details, created_by)
      VALUES (?, ?, ?, ?)
    `).run(req.params.id, finalDate, String(details).trim(), req.session.userId);

    const created = db.prepare(`
      SELECT n.*, u.full_name AS created_by_name
      FROM workflow_notes n
      LEFT JOIN users u ON u.id = n.created_by
      WHERE n.id = ?
    `).get(result.lastInsertRowid);

    res.locals.logAudit?.({
      action: 'CREATE', module: 'workflow_notes',
      recordId: result.lastInsertRowid, newValue: created,
      description: `Note added to workflow ${req.params.id}`
    });
    res.status(201).json(created);
  } catch (err) { next(err); }
});

// DELETE /:id/notes/:noteId
router.delete('/:id/notes/:noteId', canDelete, (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM workflow_notes WHERE id = ? AND workflow_id = ?')
      .get(req.params.noteId, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Note not found' });
    db.prepare('DELETE FROM workflow_notes WHERE id = ?').run(req.params.noteId);
    res.locals.logAudit?.({
      action: 'DELETE', module: 'workflow_notes',
      recordId: req.params.noteId, oldValue: existing,
      description: `Note removed from workflow ${req.params.id}`
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
