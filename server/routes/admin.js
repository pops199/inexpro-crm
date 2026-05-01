const express = require('express');
const bcrypt  = require('bcryptjs');
const { getDb } = require('../db/database');
const { requireAuth, requireAdmin, requireAdminAny, getBrokerId } = require('../middleware/auth');
const { notify } = require('../lib/notifications');

const router = express.Router();

// All admin routes require at least authentication
router.use(requireAuth);

// ─── GET /users — list all users (exclude password_hash) ─────
// Accessible to all authenticated users (needed for broker/admin dropdowns)

router.get('/users', (req, res) => {
  const db = getDb();

  const rows = db.prepare(`
    SELECT u.id, u.username, u.email, u.full_name, u.role, u.active, u.created_at, u.updated_at,
           CASE WHEN tf.enrolled = 1 THEN 1 ELSE 0 END AS two_factor_enabled
    FROM users u
    LEFT JOIN user_2fa tf ON tf.user_id = u.id
    ORDER BY u.full_name ASC
  `).all();

  // Attach broker codes per user — needed for the policy-form dropdown
  // and for the admin user-edit modal that lists/edits the codes.
  const codeStmt = db.prepare(
    'SELECT id, code, description FROM user_broker_codes WHERE user_id = ? ORDER BY code'
  );
  rows.forEach(u => { u.broker_codes = codeStmt.all(u.id); });

  return res.json({ data: rows });
});

// ─── Broker-code CRUD ────────────────────────────────────────
// GET /users/:id/broker-codes — list a single user's codes
router.get('/users/:id/broker-codes', (req, res) => {
  const db = getDb();
  const userId = parseInt(req.params.id, 10);
  const codes = db.prepare(
    'SELECT id, code, description, created_at, updated_at FROM user_broker_codes WHERE user_id = ? ORDER BY code'
  ).all(userId);
  res.json({ data: codes });
});

// POST /users/:id/broker-codes — admin only
router.post('/users/:id/broker-codes', requireAdmin, (req, res) => {
  const db = getDb();
  const userId = parseInt(req.params.id, 10);
  const code = (req.body.code || '').trim();
  const description = (req.body.description || '').trim() || null;
  if (!code) return res.status(400).json({ error: 'code is required' });
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) {
    return res.status(404).json({ error: 'User not found' });
  }
  try {
    const result = db.prepare(
      'INSERT INTO user_broker_codes (user_id, code, description) VALUES (?, ?, ?)'
    ).run(userId, code, description);
    const created = db.prepare(
      'SELECT id, user_id, code, description, created_at, updated_at FROM user_broker_codes WHERE id = ?'
    ).get(result.lastInsertRowid);
    res.locals.logAudit({
      action: 'CREATE', module: 'user_broker_codes', recordId: created.id,
      newValue: { user_id: userId, code, description },
      description: `Broker code "${code}" added for user ${userId}`,
    });
    return res.status(201).json(created);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'This broker code already exists for this user' });
    }
    throw err;
  }
});

// PUT /broker-codes/:id — admin only
router.put('/broker-codes/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM user_broker_codes WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Broker code not found' });
  const code = req.body.code !== undefined ? (req.body.code || '').trim() : existing.code;
  const description = req.body.description !== undefined
    ? ((req.body.description || '').trim() || null)
    : existing.description;
  if (!code) return res.status(400).json({ error: 'code cannot be empty' });
  try {
    db.prepare(
      'UPDATE user_broker_codes SET code = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(code, description, id);
    const updated = db.prepare('SELECT * FROM user_broker_codes WHERE id = ?').get(id);
    res.locals.logAudit({
      action: 'UPDATE', module: 'user_broker_codes', recordId: id,
      oldValue: { code: existing.code, description: existing.description },
      newValue: { code: updated.code, description: updated.description },
      description: `Broker code ${id} updated`,
    });
    return res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'This broker code already exists for this user' });
    }
    throw err;
  }
});

// DELETE /broker-codes/:id — admin only
router.delete('/broker-codes/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM user_broker_codes WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Broker code not found' });
  db.prepare('DELETE FROM user_broker_codes WHERE id = ?').run(id);
  res.locals.logAudit({
    action: 'DELETE', module: 'user_broker_codes', recordId: id,
    oldValue: { code: existing.code, description: existing.description },
    description: `Broker code "${existing.code}" deleted`,
  });
  return res.json({ message: 'Broker code deleted' });
});

// ─── POST /users — create user (admin only) ──────────────────

router.post('/users', requireAdmin, (req, res) => {
  const db = getDb();

  const { username, email, password, full_name, role } = req.body;

  if (!username || !email || !password || !full_name || !role) {
    return res.status(400).json({
      error: 'Required fields: username, email, password, full_name, role'
    });
  }

  const validRoles = ['admin', 'broker', 'admin_only'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      error: `Invalid role. Allowed: ${validRoles.join(', ')}`
    });
  }

  // Check uniqueness
  const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existingUsername) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (existingEmail) {
    return res.status(409).json({ error: 'Email address already in use' });
  }

  const password_hash = bcrypt.hashSync(password, 12);

  const result = db.prepare(`
    INSERT INTO users (username, email, password_hash, full_name, role, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(
    username.trim(),
    email.trim().toLowerCase(),
    password_hash,
    full_name.trim(),
    role
  );

  const created = db.prepare(
    'SELECT id, username, email, full_name, role, active, created_at, updated_at FROM users WHERE id = ?'
  ).get(result.lastInsertRowid);

  res.locals.logAudit({
    action:      'CREATE',
    module:      'users',
    recordId:    result.lastInsertRowid,
    newValue:    { username: created.username, email: created.email, role: created.role },
    description: `User "${created.username}" created by admin`
  });

  // Welcome the new user — placeholder body until the user manual lands.
  try {
    notify({
      userIds:      created.id,
      category:     'system',
      severity:     'info',
      title:        'Welcome to Inexpro CRM',
      body:         'Welcome aboard! A user manual will be linked here soon — until then, click the bell anytime to manage your notifications. Your administrator will reach out if action is needed on your part.',
      link:         '#/dashboard',
      sourceModule: 'system',
      dedupKey:     'seed:welcome_inexpro_v1',
    });
  } catch (_) {}

  return res.status(201).json(created);
});

// ─── POST /notifications/broadcast — admin/admin-only custom notification ────
// Body: { subject, message, target_user_ids?: number[]|'all', contact_id?, contact_module? }
router.post('/notifications/broadcast', requireAdminAny, (req, res) => {
  const db = getDb();
  const {
    subject,
    message,
    target_user_ids,
    contact_id,
    contact_module,
    severity,
  } = req.body || {};

  if (!subject || !String(subject).trim()) {
    return res.status(400).json({ error: 'Subject is required.' });
  }
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  // Resolve recipients: explicit ids array, or 'all' to mean every active user.
  let recipientIds = [];
  if (target_user_ids === 'all' || target_user_ids === '*') {
    recipientIds = db.prepare('SELECT id FROM users WHERE active = 1').all().map(r => r.id);
  } else if (Array.isArray(target_user_ids) && target_user_ids.length) {
    recipientIds = target_user_ids.map(n => parseInt(n, 10)).filter(n => Number.isFinite(n));
  } else {
    return res.status(400).json({ error: 'Select at least one recipient.' });
  }

  // Optional subject + module link. The link tells the recipient which
  // contact / account needs attention in which module — falls back to the
  // module list if no subject id is supplied, or to the subject detail if no
  // module is supplied. Module-specific subject pages (popia/fica) use a
  // different hash for accounts vs. contacts.
  const moduleHashes = {
    contacts:           '#/contacts',
    accounts:           '#/accounts',
    policies:           '#/policies',
    claims:             '#/claims',
    complaints:         '#/complaints',
    reviews:            '#/reviews',
    advice_records:     '#/advice-records',
    client_engagements: '#/engagements',
    assets:             '#/assets',
    popia:              '#/popia',
    fica:               '#/fica',
  };
  const moduleLabels = {
    contacts:           'Contacts',
    accounts:           'Accounts',
    policies:           'Policies',
    claims:             'Claims',
    complaints:         'Complaints',
    reviews:            'Reviews',
    advice_records:     'Records of Advice',
    client_engagements: 'Client Engagements',
    assets:             'Assets',
    popia:              'POPIA',
    fica:               'FICA',
  };

  const moduleKey  = contact_module && moduleHashes[contact_module] ? contact_module : null;
  const moduleHash = moduleKey ? moduleHashes[moduleKey] : null;

  // The subject can be either a contact or an account. The client sends a
  // value of `contact:<id>` or `account:<id>` in `contact_id`. Plain integers
  // are still accepted and assumed to be contact ids (back-compat).
  let subjectKind = null;
  let subjectId   = null;
  if (contact_id != null && contact_id !== '') {
    const raw = String(contact_id);
    if (raw.startsWith('contact:'))  { subjectKind = 'contact'; subjectId = parseInt(raw.slice(8), 10); }
    else if (raw.startsWith('account:')) { subjectKind = 'account'; subjectId = parseInt(raw.slice(8), 10); }
    else { subjectKind = 'contact'; subjectId = parseInt(raw, 10); }
    if (!Number.isFinite(subjectId)) { subjectKind = null; subjectId = null; }
  }

  let link        = null;
  let subjectName = null;
  if (subjectKind === 'contact' && subjectId) {
    const c = db.prepare('SELECT id, first_name, last_name FROM contacts WHERE id = ?').get(subjectId);
    if (c) {
      subjectName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || `contact #${c.id}`;
      // POPIA/FICA contact details live at #/popia/<id> and #/fica/<id>.
      link = (moduleKey === 'popia') ? `#/popia/${c.id}`
           : (moduleKey === 'fica')  ? `#/fica/${c.id}`
           : `#/contacts/${c.id}`;
    }
  } else if (subjectKind === 'account' && subjectId) {
    const a = db.prepare('SELECT id, account_name FROM accounts WHERE id = ?').get(subjectId);
    if (a) {
      subjectName = a.account_name || `account #${a.id}`;
      // POPIA/FICA accounts live at #/popia/account/<id> and #/fica/account/<id>.
      link = (moduleKey === 'popia') ? `#/popia/account/${a.id}`
           : (moduleKey === 'fica')  ? `#/fica/account/${a.id}`
           : `#/accounts/${a.id}`;
    }
  }
  if (!link && moduleHash) link = moduleHash;

  const footerParts = [];
  if (moduleKey)    footerParts.push(`Module: ${moduleLabels[moduleKey]}`);
  if (subjectName)  footerParts.push(`${subjectKind === 'account' ? 'Account' : 'Contact'}: ${subjectName}`);
  const body = footerParts.length
    ? `${String(message).trim()}\n\n— ${footerParts.join(' · ')}`
    : String(message).trim();

  const inserted = notify({
    userIds:        recipientIds,
    category:       'admin_message',
    severity:       (['info','warning','danger','success'].includes(severity) ? severity : 'info'),
    title:          String(subject).trim(),
    body,
    link,
    sourceModule:   moduleKey,
    sourceRecordId: subjectId,
    // No dedupKey — admin can send the same subject multiple times intentionally.
  });

  res.locals.logAudit({
    action:      'NOTIFY',
    module:      'notifications',
    recordId:    null,
    description: `Admin broadcast "${subject}" → ${inserted} user(s)`,
  });

  return res.status(201).json({ ok: true, recipients: recipientIds.length, inserted });
});

// ─── PUT /users/:id — update user (admin only) ──────────────

router.put('/users/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const existing = db.prepare(
    'SELECT id, username, email, full_name, role, active, created_at, updated_at FROM users WHERE id = ?'
  ).get(id);

  if (!existing) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { role, active, full_name, email, username, password } = req.body;

  // Validate role if provided
  if (role !== undefined) {
    const validRoles = ['admin', 'broker', 'admin_only'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Allowed: ${validRoles.join(', ')}` });
    }
  }

  // Check email uniqueness if changed
  if (email !== undefined && email.trim().toLowerCase() !== existing.email) {
    const conflict = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(
      email.trim().toLowerCase(), id
    );
    if (conflict) {
      return res.status(409).json({ error: 'Email address already in use' });
    }
  }

  // Check username uniqueness if changed
  if (username !== undefined && username.trim() !== existing.username) {
    const conflict = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username.trim(), id);
    if (conflict) return res.status(409).json({ error: 'Username already exists' });
  }

  // Hash password if provided
  let password_hash;
  if (password && password.trim()) {
    password_hash = bcrypt.hashSync(password, 12);
  }

  const setClauses = [
    'role       = ?',
    'active     = ?',
    'full_name  = ?',
    'email      = ?',
    'username   = ?',
    'updated_at = CURRENT_TIMESTAMP',
  ];
  const runParams = [
    role      !== undefined ? role                              : existing.role,
    active    !== undefined ? (active ? 1 : 0)                  : existing.active,
    full_name !== undefined ? full_name.trim()                   : existing.full_name,
    email     !== undefined ? email.trim().toLowerCase()         : existing.email,
    username  !== undefined ? username.trim()                    : existing.username,
  ];

  if (password_hash) {
    setClauses.splice(5, 0, 'password_hash = ?');
    runParams.push(password_hash);
  }

  runParams.push(id);

  db.prepare(`
    UPDATE users SET
      ${setClauses.join(',\n      ')}
    WHERE id = ?
  `).run(...runParams);

  const updated = db.prepare(
    'SELECT id, username, email, full_name, role, active, created_at, updated_at FROM users WHERE id = ?'
  ).get(id);

  res.locals.logAudit({
    action:      'UPDATE',
    module:      'users',
    recordId:    parseInt(id, 10),
    oldValue:    { role: existing.role, active: existing.active, full_name: existing.full_name, email: existing.email },
    newValue:    { role: updated.role,  active: updated.active,  full_name: updated.full_name,  email: updated.email },
    description: `User "${existing.username}" updated by admin`
  });

  return res.json(updated);
});

// ─── DELETE /users/:id — delete user (admin only, cannot delete self) ────

router.delete('/users/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  if (parseInt(id, 10) === req.session.userId) {
    return res.status(403).json({ error: 'You cannot delete your own account' });
  }

  const existing = db.prepare(
    'SELECT id, username, email, full_name, role FROM users WHERE id = ?'
  ).get(id);

  if (!existing) {
    return res.status(404).json({ error: 'User not found' });
  }

  const adminId = req.session.userId; // the admin performing the deletion

  // Nullify nullable FK references, reassign NOT NULL FK references to the deleting admin
  const deleteUser = db.transaction(() => {
    // ── Nullable FK columns → set NULL ──────────────────────────────────
    db.prepare('UPDATE contacts           SET assigned_broker_id      = NULL WHERE assigned_broker_id      = ?').run(id);
    db.prepare('UPDATE contacts           SET assigned_admin_id       = NULL WHERE assigned_admin_id       = ?').run(id);
    db.prepare('UPDATE contacts           SET created_by              = NULL WHERE created_by              = ?').run(id);
    db.prepare('UPDATE accounts           SET assigned_broker_id      = NULL WHERE assigned_broker_id      = ?').run(id);
    db.prepare('UPDATE accounts           SET assigned_admin_id       = NULL WHERE assigned_admin_id       = ?').run(id);
    db.prepare('UPDATE accounts           SET created_by              = NULL WHERE created_by              = ?').run(id);
    db.prepare('UPDATE policies           SET assigned_admin_id       = NULL WHERE assigned_admin_id       = ?').run(id);
    db.prepare('UPDATE policies           SET created_by              = NULL WHERE created_by              = ?').run(id);
    db.prepare('UPDATE client_engagements SET assigned_admin_id       = NULL WHERE assigned_admin_id       = ?').run(id);
    db.prepare('UPDATE client_engagements SET created_by              = NULL WHERE created_by              = ?').run(id);
    db.prepare('UPDATE policy_sections    SET created_by              = NULL WHERE created_by              = ?').run(id);
    db.prepare('UPDATE claims             SET broker_id               = NULL WHERE broker_id               = ?').run(id);
    db.prepare('UPDATE claims             SET claims_handler_admin_id = NULL WHERE claims_handler_admin_id = ?').run(id);
    db.prepare('UPDATE claims             SET created_by              = NULL WHERE created_by              = ?').run(id);
    db.prepare('UPDATE reviews            SET broker_id               = NULL WHERE broker_id               = ?').run(id);
    db.prepare('UPDATE reviews            SET assigned_admin_id       = NULL WHERE assigned_admin_id       = ?').run(id);
    db.prepare('UPDATE reviews            SET created_by              = NULL WHERE created_by              = ?').run(id);
    db.prepare('UPDATE complaints         SET broker_id               = NULL WHERE broker_id               = ?').run(id);
    db.prepare('UPDATE complaints         SET complaint_owner_id      = NULL WHERE complaint_owner_id      = ?').run(id);
    db.prepare('UPDATE complaints         SET assigned_to_id          = NULL WHERE assigned_to_id          = ?').run(id);
    db.prepare('UPDATE complaints         SET created_by              = NULL WHERE created_by              = ?').run(id);
    db.prepare('UPDATE risk_details       SET created_by              = NULL WHERE created_by              = ?').run(id);
    db.prepare('UPDATE assets             SET created_by              = NULL WHERE created_by              = ?').run(id);
    db.prepare('UPDATE audit_log          SET user_id                 = NULL WHERE user_id                 = ?').run(id);

    // ── NOT NULL FK columns → reassign to the deleting admin ────────────
    db.prepare('UPDATE policies           SET assigned_broker_id = ? WHERE assigned_broker_id = ?').run(adminId, id);
    db.prepare('UPDATE client_engagements SET assigned_broker_id = ? WHERE assigned_broker_id = ?').run(adminId, id);
    db.prepare('UPDATE advice_records     SET broker_id          = ? WHERE broker_id          = ?').run(adminId, id);
    db.prepare('UPDATE advice_records     SET prepared_by_id     = ? WHERE prepared_by_id     = ?').run(adminId, id);
    db.prepare('UPDATE advice_records     SET created_by         = ? WHERE created_by         = ?').run(adminId, id);
    db.prepare('UPDATE documents          SET uploaded_by        = ? WHERE uploaded_by        = ?').run(adminId, id);
    db.prepare('UPDATE saved_reports      SET creator_id         = ? WHERE creator_id         = ?').run(adminId, id);

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  });

  try {
    deleteUser();
  } catch (err) {
    return res.status(500).json({ error: 'Delete failed: ' + err.message });
  }

  res.locals.logAudit({
    action:      'DELETE',
    module:      'users',
    recordId:    parseInt(id, 10),
    oldValue:    existing,
    description: `User "${existing.username}" deleted by admin`
  });

  return res.json({ message: 'User deleted successfully' });
});

// ─── GET /audit-log — paginated with filters ──────────────────

router.get('/audit-log', (req, res) => {
  const db = getDb();
  const { module: mod, user_id, action, from, to, page = 1, limit = 50 } = req.query;

  const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const offset   = (pageNum - 1) * limitNum;

  const conditions = [];
  const params     = [];

  const { record_id } = req.query;
  if (mod)       { conditions.push('al.module = ?');    params.push(mod); }
  if (record_id) { conditions.push('al.record_id = ?'); params.push(parseInt(record_id, 10)); }
  if (user_id)   { conditions.push('al.user_id = ?');   params.push(user_id); }
  if (action)    { conditions.push('al.action = ?');     params.push(action); }
  if (from)    { conditions.push("al.timestamp >= ?"); params.push(from); }
  if (to)      { conditions.push("al.timestamp <= ?"); params.push(to); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db.prepare(`
    SELECT COUNT(*) AS total FROM audit_log al ${where}
  `).get(...params);

  const rows = db.prepare(`
    SELECT
      al.*,
      u.full_name AS user_full_name
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    ${where}
    ORDER BY al.timestamp DESC
    LIMIT ? OFFSET ?
  `).all(...params, limitNum, offset);

  return res.json({
    data:       rows,
    pagination: {
      page:       pageNum,
      limit:      limitNum,
      total:      countRow.total,
      totalPages: Math.ceil(countRow.total / limitNum)
    }
  });
});

// ─── GET /dashboard-stats ─────────────────────────────────────
// When the logged-in user is a broker, stats are scoped to their
// assigned records. Admins see company-wide figures.

router.get('/dashboard-stats', (req, res) => {
  const db = getDb();
  const brokerId = getBrokerId(req);

  // Helper: optional broker filter
  const bF  = (alias, col) => brokerId ? ` AND ${alias}.${col} = ?` : '';
  const bP  = () => brokerId ? [brokerId] : [];

  const activeContacts = db.prepare(`
    SELECT COUNT(*) AS count FROM contacts WHERE contact_status = 'Active Client'${bF('contacts', 'assigned_broker_id').replace('contacts.', '')}
  `).get(...bP()).count;

  const openEngagements = db.prepare(`
    SELECT COUNT(*) AS count FROM client_engagements
    WHERE stage NOT IN ('Implemented / Active', 'Lost / Declined', 'On Hold')${bF('client_engagements', 'assigned_broker_id').replace('client_engagements.', '')}
  `).get(...bP()).count;

  const activePolicies = db.prepare(`
    SELECT COUNT(*) AS count FROM policies WHERE policy_status = 'Active'${bF('policies', 'assigned_broker_id').replace('policies.', '')}
  `).get(...bP()).count;

  const openClaims = db.prepare(`
    SELECT COUNT(*) AS count FROM claims
    WHERE claim_status NOT IN ('Settled', 'Rejected', 'Closed')${brokerId ? ' AND broker_id = ?' : ''}
  `).get(...bP()).count;

  const policiesDueRenewal = db.prepare(`
    SELECT COUNT(*) AS count FROM policies
    WHERE policy_status = 'Active'
      AND renewal_date IS NOT NULL
      AND renewal_date BETWEEN date('now') AND date('now', '+30 days')${bF('policies', 'assigned_broker_id').replace('policies.', '')}
  `).get(...bP()).count;

  const gapSectionsCount = db.prepare(`
    SELECT COUNT(*) AS count FROM policy_sections ps
    ${brokerId ? 'JOIN policies p ON p.id = ps.policy_id' : ''}
    WHERE ps.gap_identified = 1${brokerId ? ' AND p.assigned_broker_id = ?' : ''}
  `).get(...bP()).count;

  const overdueReviews = db.prepare(`
    SELECT COUNT(*) AS count FROM reviews
    WHERE review_completed = 0
      AND review_date < date('now')${brokerId ? ' AND broker_id = ?' : ''}
  `).get(...bP()).count;

  const totalAssets = db.prepare(`
    SELECT COUNT(*) AS count FROM assets a
    ${brokerId ? 'LEFT JOIN policies p ON p.id = a.policy_id' : ''}
    WHERE a.asset_status = 'Active'${brokerId ? ' AND (p.assigned_broker_id = ? OR a.created_by = ?)' : ''}
  `).get(...(brokerId ? [brokerId, brokerId] : [])).count;

  return res.json({
    activeContacts,
    openEngagements,
    activePolicies,
    openClaims,
    policiesDueRenewal,
    gapSectionsCount,
    overdueReviews,
    totalAssets
  });
});

// ─── GET /chart-data ──────────────────────────────────────────
// Scoped to the logged-in broker; admins see all.
router.get('/chart-data', (req, res) => {
  const db = getDb();
  const brokerId = getBrokerId(req);
  const bP = () => brokerId ? [brokerId] : [];

  const engagementsByStage = db.prepare(`
    SELECT stage, COUNT(*) AS count
    FROM client_engagements
    WHERE stage NOT IN ('Implemented / Active','Lost / Declined','On Hold')
    ${brokerId ? 'AND assigned_broker_id = ?' : ''}
    GROUP BY stage ORDER BY count DESC
  `).all(...bP());

  const claimsByStatus = db.prepare(`
    SELECT claim_status AS label, COUNT(*) AS count
    FROM claims ${brokerId ? 'WHERE broker_id = ?' : ''}
    GROUP BY claim_status ORDER BY count DESC
  `).all(...bP());

  const policiesByType = db.prepare(`
    SELECT policy_type AS label, COUNT(*) AS count
    FROM policies WHERE policy_status = 'Active'
    ${brokerId ? 'AND assigned_broker_id = ?' : ''}
    GROUP BY policy_type ORDER BY count DESC
  `).all(...bP());

  const policiesByStatus = db.prepare(`
    SELECT policy_status AS label, COUNT(*) AS count
    FROM policies ${brokerId ? 'WHERE assigned_broker_id = ?' : ''}
    GROUP BY policy_status ORDER BY count DESC
  `).all(...bP());

  const contactsByStatus = db.prepare(`
    SELECT contact_status AS label, COUNT(*) AS count
    FROM contacts ${brokerId ? 'WHERE assigned_broker_id = ?' : ''}
    GROUP BY contact_status ORDER BY count DESC
  `).all(...bP());

  const contactsByCategory = db.prepare(`
    SELECT client_category AS label, COUNT(*) AS count
    FROM contacts ${brokerId ? 'WHERE assigned_broker_id = ?' : ''}
    GROUP BY client_category ORDER BY count DESC
  `).all(...bP());

  const claimsByType = db.prepare(`
    SELECT claim_type AS label, COUNT(*) AS count
    FROM claims ${brokerId ? 'WHERE broker_id = ?' : ''}
    GROUP BY claim_type ORDER BY count DESC
  `).all(...bP());

  const renewalsByMonth = db.prepare(`
    SELECT strftime('%Y-%m', renewal_date) AS label, COUNT(*) AS count
    FROM policies
    WHERE policy_status = 'Active'
      AND renewal_date BETWEEN date('now') AND date('now', '+12 months')
    ${brokerId ? 'AND assigned_broker_id = ?' : ''}
    GROUP BY label ORDER BY label ASC
  `).all(...bP());

  return res.json({
    engagementsByStage, claimsByStatus, policiesByType, policiesByStatus,
    contactsByStatus, contactsByCategory, claimsByType, renewalsByMonth,
  });
});

// ═════════════════════════════════════════════════════════════════
// EXPORT: whole modules as CSV
// ═════════════════════════════════════════════════════════════════

// Allow-list of exportable modules mapped to their SELECT statement.
// Joined columns surface as human-readable names where it helps.
const EXPORT_MODULES = {
  // ── Core records ──
  contacts:          { label: 'Contacts',                sql: 'SELECT * FROM contacts ORDER BY id' },
  accounts:          { label: 'Accounts',                sql: 'SELECT * FROM accounts ORDER BY id' },
  policies:          { label: 'Policies',                sql: 'SELECT * FROM policies ORDER BY id' },
  policy_sections:   { label: 'Policy Sections',         sql: 'SELECT * FROM policy_sections ORDER BY id' },
  policy_quotes:     { label: 'Policy Quotes / Schedules', sql: 'SELECT * FROM policy_quotes ORDER BY id' },
  policy_asset_history: { label: 'Policy Asset History', sql: 'SELECT * FROM policy_asset_history ORDER BY id' },
  assets:            { label: 'Covers (Assets)',         sql: 'SELECT * FROM assets ORDER BY id' },
  claims:            { label: 'Claims',                  sql: 'SELECT * FROM claims ORDER BY id' },
  claim_notes:       { label: 'Claim Notes',             sql: 'SELECT * FROM claim_notes ORDER BY id' },
  claim_third_parties:{ label: 'Claim Third Parties',    sql: 'SELECT * FROM claim_third_parties ORDER BY id' },
  engagements:       { label: 'Client Engagements',      sql: 'SELECT * FROM client_engagements ORDER BY id' },
  advice_records:    { label: 'Records of Advice',       sql: 'SELECT * FROM advice_records ORDER BY id' },
  complaints:        { label: 'Complaints',              sql: 'SELECT * FROM complaints ORDER BY id' },
  reviews:           { label: 'Reviews',                 sql: 'SELECT * FROM reviews ORDER BY id' },
  risk_details:      { label: 'Risk Details',            sql: 'SELECT * FROM risk_details ORDER BY id' },
  workflows:         { label: 'Workflows',               sql: 'SELECT * FROM workflows ORDER BY id' },
  workflow_notes:    { label: 'Workflow Notes',          sql: 'SELECT * FROM workflow_notes ORDER BY id' },
  documents:         { label: 'Documents (metadata)',    sql: 'SELECT id, module, record_id, original_name, file_path, file_type, file_size, uploaded_by, uploaded_at FROM documents ORDER BY id' },
  // ── Compliance ──
  data_subject_requests: { label: 'POPIA — Data Subject Requests', sql: 'SELECT * FROM data_subject_requests ORDER BY id' },
  data_breach_log:   { label: 'POPIA — Data Breach Log', sql: 'SELECT * FROM data_breach_log ORDER BY id' },
  // ── Broker fitness / TCF ──
  broker_profiles:   { label: 'Broker Profiles',         sql: 'SELECT * FROM broker_profiles ORDER BY id' },
  cpd_activities:    { label: 'CPD Activities',          sql: 'SELECT * FROM cpd_activities ORDER BY id' },
  broker_fitness_alerts_sent: { label: 'Broker Fitness Alerts Sent', sql: 'SELECT * FROM broker_fitness_alerts_sent ORDER BY id' },
  post_sale_events:  { label: 'Post-Sale Events',        sql: 'SELECT * FROM post_sale_events ORDER BY id' },
  products:          { label: 'Product Library',         sql: 'SELECT * FROM products ORDER BY id' },
  commission_log:    { label: 'Commission Log',          sql: 'SELECT * FROM commission_log ORDER BY id' },
  // ── Ops ──
  notifications:     { label: 'Notifications',           sql: 'SELECT * FROM notifications ORDER BY id' },
  // ── Admin ──
  users:             { label: 'Users',                   sql: 'SELECT id, username, email, full_name, role, active, created_at, updated_at FROM users ORDER BY id' },
  audit_log:         { label: 'Audit Log',               sql: 'SELECT a.id, a.timestamp, u.full_name AS user_full_name, u.username AS user_username, a.user_id, a.action, a.module, a.record_id, a.description, a.old_value, a.new_value, a.ip_address FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id' },
  otp_codes:         { label: 'One-Time PINs (audit)',   sql: 'SELECT id, code, created_by_user_id, target_user_id, expires_at, used_at, used_by_user_id, revoked_at, revoked_by_user_id, notes, created_at FROM otp_codes ORDER BY id' },
};

// GET /api/admin/exportable-modules — list of modules a client may export.
router.get('/exportable-modules', requireAdmin, (_req, res) => {
  res.json({
    data: Object.entries(EXPORT_MODULES).map(([key, { label }]) => ({ key, label })),
  });
});

// Convert a value into a CSV-safe cell (RFC 4180-ish).
function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

// GET /api/admin/export/:module — stream a CSV dump of the module.
router.get('/export/:module', requireAdmin, (req, res, next) => {
  try {
    const key = req.params.module;
    const spec = EXPORT_MODULES[key];
    if (!spec) {
      return res.status(404).json({ error: `Unknown export module: ${key}` });
    }

    const db = getDb();
    const rows = db.prepare(spec.sql).all();

    const filename = `${key}_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    if (!rows.length) {
      res.end('');
      return;
    }

    const columns = Object.keys(rows[0]);
    res.write('\uFEFF' + columns.join(',') + '\r\n'); // BOM for Excel friendliness
    for (const row of rows) {
      res.write(columns.map(c => csvCell(row[c])).join(',') + '\r\n');
    }
    res.end();
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/export-xlsx/:module — Excel workbook (.xlsx) of the module.
router.get('/export-xlsx/:module', requireAdmin, (req, res, next) => {
  try {
    const key = req.params.module;
    const spec = EXPORT_MODULES[key];
    if (!spec) {
      return res.status(404).json({ error: `Unknown export module: ${key}` });
    }

    const db = getDb();
    const rows = db.prepare(spec.sql).all();

    const { buildWorkbook } = require('../lib/xlsx');
    const columns = rows.length ? Object.keys(rows[0]) : [];
    const data    = rows.map(r => columns.map(c => r[c]));
    const buf = buildWorkbook({
      sheetName: spec.label || key,
      columns,
      rows: data,
    });

    const filename = `${key}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buf.length);
    res.end(buf);
  } catch (err) {
    next(err);
  }
});

// ─── POST /reveal-encrypted — verify admin password and return decrypted value ───
//
// Body: { password, module, record_id, field }
// Allowed module/field combinations are whitelisted to prevent arbitrary table reads.
// Every successful reveal is written to audit_log with the user, module/record/field
// touched and the IP address.
const { decrypt } = require('../lib/crypto');

const REVEAL_WHITELIST = {
  contacts:         { table: 'contacts',         fields: ['sa_id_number', 'passport_number', 'fica_document_reference'] }, // sa_id_number + passport_number + fica_document_reference are encrypted
  accounts:         { table: 'accounts',         fields: ['fica_document_reference', 'registration_number', 'vat_number'] },
  broker_profiles:  { table: 'broker_profiles',  fields: ['id_number'] },
  claims:           { table: 'claims',           fields: ['driver_id_number'] },
  policies:         { table: 'policies',         fields: ['account_number_enc', 'co_insured_id_number'] },
};

router.post('/reveal-encrypted', (req, res) => {
  const db = getDb();
  const { password, module, record_id, field } = req.body || {};

  if (!password || !module || !record_id || !field) {
    return res.status(400).json({ error: 'password, module, record_id and field are required.' });
  }

  // The logged-in user can be a broker — the override is authorised by ANY
  // active admin entering THEIR own password. Try the supplied password
  // against every admin/admin_only password hash and accept the first match.
  const sessionUser = db.prepare(
    'SELECT id, role, active, full_name, username FROM users WHERE id = ?'
  ).get(req.session.userId);
  if (!sessionUser || !sessionUser.active) return res.status(401).json({ error: 'Session invalid.' });
  const sessionLabel = sessionUser.full_name || sessionUser.username || `user ${sessionUser.id}`;

  const admins = db.prepare(
    `SELECT id, password_hash, full_name, username
     FROM users
     WHERE active = 1 AND role IN ('admin', 'admin_only')`
  ).all();
  if (!admins.length) {
    return res.status(503).json({ error: 'No active admin users on file — cannot reveal encrypted values.' });
  }

  let matchedAdmin = null;
  for (const a of admins) {
    if (a.password_hash && bcrypt.compareSync(String(password), a.password_hash)) {
      matchedAdmin = a;
      break;
    }
  }
  if (!matchedAdmin) {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    res.locals.logAudit?.({
      action: 'REVEAL_DENIED', module: 'admin_reveal', recordId: parseInt(record_id, 10) || null,
      description: `${sessionLabel} attempted (and failed) to reveal ${module}.${field} on record ${record_id} at ${ts} UTC`,
    });
    return res.status(401).json({ error: 'Incorrect admin password.' });
  }
  // Reuse the single `user` name below so the rest of the handler is unchanged.
  const user = sessionUser;

  // Resolve table + column from the whitelist.
  const spec = REVEAL_WHITELIST[module];
  if (!spec) return res.status(400).json({ error: `Unknown module: ${module}` });
  if (!spec.fields.includes(field)) {
    return res.status(400).json({ error: `Field ${field} is not revealable on ${module}.` });
  }

  const row = db.prepare(`SELECT ${field} AS value FROM ${spec.table} WHERE id = ?`).get(record_id);
  if (!row) return res.status(404).json({ error: 'Record not found.' });

  const plain = decrypt(row.value);

  // Resolve a human-readable subject name for the audit description so the
  // entry says "Pieter van der Merwe" instead of "record 1".
  let subjectName = `record ${record_id}`;
  try {
    if (module === 'contacts') {
      const c = db.prepare('SELECT first_name, last_name FROM contacts WHERE id = ?').get(record_id);
      if (c) subjectName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || subjectName;
    } else if (module === 'accounts') {
      const a = db.prepare('SELECT account_name FROM accounts WHERE id = ?').get(record_id);
      if (a) subjectName = a.account_name || subjectName;
    } else if (module === 'broker_profiles') {
      const bp = db.prepare(
        'SELECT u.full_name FROM broker_profiles bp LEFT JOIN users u ON u.id = bp.user_id WHERE bp.id = ?'
      ).get(record_id);
      if (bp) subjectName = bp.full_name || subjectName;
    } else if (module === 'claims') {
      const cl = db.prepare('SELECT claim_number FROM claims WHERE id = ?').get(record_id);
      if (cl) subjectName = cl.claim_number || subjectName;
    } else if (module === 'policies') {
      const p = db.prepare('SELECT policy_number, policy_name FROM policies WHERE id = ?').get(record_id);
      if (p) subjectName = p.policy_number || p.policy_name || subjectName;
    }
  } catch (_) { /* fall back to "record N" */ }

  // Audit description records BOTH the logged-in user (could be a broker) AND
  // the admin whose password authorised the reveal.
  const adminLabel = matchedAdmin.full_name || matchedAdmin.username || `user ${matchedAdmin.id}`;
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19); // YYYY-MM-DD HH:MM:SS UTC
  const sameSession = matchedAdmin.id === sessionUser.id;
  const desc = sameSession
    ? `${adminLabel} revealed ${module}.${field} for "${subjectName}" at ${ts} UTC`
    : `${sessionLabel} revealed ${module}.${field} for "${subjectName}" — authorised by admin ${adminLabel} at ${ts} UTC`;

  res.locals.logAudit?.({
    action:   'REVEAL',
    module:   'admin_reveal',
    recordId: parseInt(record_id, 10),
    description: desc,
  });

  res.json({ value: plain });
});

// ═════════════════════════════════════════════════════════════════════
// One-Time PIN codes — admin-issued edit override (Security tab)
// ═════════════════════════════════════════════════════════════════════
//
// Admins generate a 6-digit numeric PIN for a broker. The broker enters the
// PIN wherever an admin password is required, and the server accepts it for
// a single use within its TTL. Both issue and redemption are audit-logged.
// ─────────────────────────────────────────────────────────────────────

function _userLabel(u) {
  if (!u) return null;
  return u.full_name || u.username || `user ${u.id}`;
}

// GET /api/admin/otps — list active + recent OTPs (admins only)
router.get('/otps', requireAdminAny, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT o.*,
           cu.full_name AS created_by_name,  cu.username AS created_by_username,
           tu.full_name AS target_user_name, tu.username AS target_user_username,
           uu.full_name AS used_by_name,     uu.username AS used_by_username
    FROM otp_codes o
    LEFT JOIN users cu ON cu.id = o.created_by_user_id
    LEFT JOIN users tu ON tu.id = o.target_user_id
    LEFT JOIN users uu ON uu.id = o.used_by_user_id
    ORDER BY o.created_at DESC
    LIMIT 200
  `).all();
  // Annotate status for the UI
  const now = Date.now();
  const out = rows.map(r => {
    let status = 'active';
    if (r.revoked_at) status = 'revoked';
    else if (r.used_at) status = 'used';
    else if (r.expires_at && Date.parse(r.expires_at) < now) status = 'expired';
    return { ...r, status };
  });
  res.json({ data: out });
});

// POST /api/admin/otps — generate a new 6-digit OTP
router.post('/otps', requireAdminAny, (req, res) => {
  const db = getDb();
  const { target_user_id, valid_minutes, notes } = req.body || {};
  const ttl = parseInt(valid_minutes, 10);
  if (!ttl || ttl < 1 || ttl > 24 * 60) {
    return res.status(400).json({ error: 'valid_minutes must be between 1 and 1440 (24 hours).' });
  }

  let target = null;
  if (target_user_id) {
    target = db.prepare('SELECT id, full_name, username, active FROM users WHERE id = ?').get(target_user_id);
    if (!target) return res.status(400).json({ error: 'Target user not found.' });
    if (!target.active) return res.status(400).json({ error: 'Target user is inactive.' });
  }

  // Generate a random 6-digit code that isn't already an active unused OTP
  const generate = () => String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
  let code, attempts = 0;
  const isCollision = db.prepare(`
    SELECT 1 FROM otp_codes
    WHERE code = ? AND used_at IS NULL AND revoked_at IS NULL
      AND datetime(expires_at) > datetime('now')
  `);
  do {
    code = generate();
    attempts++;
    if (attempts > 25) return res.status(500).json({ error: 'Could not allocate a unique OTP — try again.' });
  } while (isCollision.get(code));

  const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();
  const result = db.prepare(`
    INSERT INTO otp_codes (code, created_by_user_id, target_user_id, expires_at, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(code, req.session.userId, target ? target.id : null, expiresAt, notes ? String(notes).slice(0, 500) : null);

  const created = db.prepare(`
    SELECT o.*, cu.full_name AS created_by_name, tu.full_name AS target_user_name
    FROM otp_codes o
    LEFT JOIN users cu ON cu.id = o.created_by_user_id
    LEFT JOIN users tu ON tu.id = o.target_user_id
    WHERE o.id = ?
  `).get(result.lastInsertRowid);

  const adminName = req.session.userName || `user ${req.session.userId}`;
  const targetLabel = target ? _userLabel(target) : 'any user';
  res.locals.logAudit?.({
    action:      'CREATE',
    module:      'otp',
    recordId:    result.lastInsertRowid,
    newValue:    { target_user_id: target ? target.id : null, valid_minutes: ttl, expires_at: expiresAt, code_preview: code.slice(0, 1) + '*****' },
    description: `OTP issued by ${adminName} for ${targetLabel}, valid ${ttl} minute(s) until ${expiresAt}`,
  });

  res.status(201).json(created);
});

// POST /api/admin/otps/:id/revoke — revoke an unused OTP
router.post('/otps/:id/revoke', requireAdminAny, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const otp = db.prepare('SELECT * FROM otp_codes WHERE id = ?').get(id);
  if (!otp) return res.status(404).json({ error: 'OTP not found.' });
  if (otp.used_at) return res.status(409).json({ error: 'OTP has already been used.' });
  if (otp.revoked_at) return res.status(409).json({ error: 'OTP is already revoked.' });

  db.prepare(`
    UPDATE otp_codes SET revoked_at = CURRENT_TIMESTAMP, revoked_by_user_id = ?
    WHERE id = ?
  `).run(req.session.userId, id);

  res.locals.logAudit?.({
    action:      'UPDATE',
    module:      'otp',
    recordId:    id,
    description: `OTP #${id} revoked by ${req.session.userName || ('user ' + req.session.userId)}`,
  });

  res.json({ message: 'OTP revoked' });
});

// ═════════════════════════════════════════════════════════════════════
// Two-Factor Authentication (TOTP) — admin manages 2FA per user
// ═════════════════════════════════════════════════════════════════════

const totp = require('../lib/totp');

// GET /api/admin/users/:id/2fa — status only (no secret leak)
router.get('/users/:id/2fa', requireAdminAny, (req, res) => {
  const db = getDb();
  const userId = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT id, full_name, username FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const row = db.prepare('SELECT enrolled, created_at, enrolled_at, last_used_at FROM user_2fa WHERE user_id = ?').get(userId);
  res.json({
    user_id:        user.id,
    user_label:     user.full_name || user.username,
    enrolled:       row ? !!row.enrolled : false,
    pending:        row ? (!row.enrolled) : false,
    enrolled_at:    row ? row.enrolled_at : null,
    last_used_at:   row ? row.last_used_at : null,
  });
});

// POST /api/admin/users/:id/2fa/enroll — generate a fresh secret + otpauth URI
// Returns the secret so the admin can share it with the user (or scan via QR).
// This call REPLACES any existing pending enrollment but does NOT touch a
// confirmed (enrolled = 1) record — caller must disable first.
router.post('/users/:id/2fa/enroll', requireAdminAny, (req, res) => {
  const db = getDb();
  const userId = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT id, full_name, username, email FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const existing = db.prepare('SELECT enrolled FROM user_2fa WHERE user_id = ?').get(userId);
  if (existing && existing.enrolled) {
    return res.status(409).json({ error: '2FA already enabled for this user. Disable it first to re-enroll.', code: 'ALREADY_ENROLLED' });
  }

  const secret = totp.generateSecret();
  const issuer = 'Inexpro CRM';
  const account = user.email || user.username;
  const uri = totp.buildOtpAuthUri({ secret, account, issuer });

  db.prepare(`
    INSERT INTO user_2fa (user_id, secret, enrolled, recovery_codes, created_at)
    VALUES (?, ?, 0, NULL, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      secret         = excluded.secret,
      enrolled       = 0,
      recovery_codes = NULL,
      created_at     = CURRENT_TIMESTAMP,
      enrolled_at    = NULL
  `).run(userId, secret);

  res.locals.logAudit?.({
    action:      'CREATE',
    module:      '2fa',
    recordId:    userId,
    description: `2FA enrollment started for ${user.full_name || user.username} by ${req.session.userName || ('user ' + req.session.userId)}`,
  });

  res.json({ secret, otpauth_uri: uri, account, issuer });
});

// POST /api/admin/users/:id/2fa/verify — confirm enrollment by entering a code.
// Issues recovery codes on first successful verification.
router.post('/users/:id/2fa/verify', requireAdminAny, (req, res) => {
  const db = getDb();
  const userId = parseInt(req.params.id, 10);
  const { code } = req.body || {};
  const row = db.prepare('SELECT secret, enrolled FROM user_2fa WHERE user_id = ?').get(userId);
  if (!row) return res.status(400).json({ error: 'No pending enrollment for this user.' });
  if (!totp.verifyTotp(row.secret, code)) {
    return res.status(401).json({ error: 'Invalid code. Wait for the next 30-second cycle and try again.', code: 'BAD_CODE' });
  }
  let recoveryCodes = [];
  if (!row.enrolled) {
    recoveryCodes = totp.generateRecoveryCodes(10);
    db.prepare(`
      UPDATE user_2fa SET enrolled = 1, enrolled_at = CURRENT_TIMESTAMP,
                          recovery_codes = ?, last_used_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(JSON.stringify(recoveryCodes), userId);
    res.locals.logAudit?.({
      action:      'UPDATE',
      module:      '2fa',
      recordId:    userId,
      description: `2FA enabled for user #${userId} by ${req.session.userName || ('user ' + req.session.userId)}; ${recoveryCodes.length} recovery codes issued`,
    });
  }
  res.json({ verified: true, recovery_codes: recoveryCodes });
});

// POST /api/admin/users/:id/2fa/disable — wipe 2FA for a user (lost-phone path)
router.post('/users/:id/2fa/disable', requireAdminAny, (req, res) => {
  const db = getDb();
  const userId = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT id, full_name, username FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const before = db.prepare('SELECT enrolled FROM user_2fa WHERE user_id = ?').get(userId);
  db.prepare('DELETE FROM user_2fa WHERE user_id = ?').run(userId);
  res.locals.logAudit?.({
    action:      'DELETE',
    module:      '2fa',
    recordId:    userId,
    description: `2FA disabled for ${user.full_name || user.username} by ${req.session.userName || ('user ' + req.session.userId)}` + (before && before.enrolled ? '' : ' (was pending enrollment)'),
  });
  res.json({ message: '2FA disabled' });
});

// GET /api/admin/users/:id/2fa/recovery-codes — view recovery codes for a user
// (for support: when user loses phone). Audit-logged so the disclosure is
// traceable. Only an admin can call this.
router.get('/users/:id/2fa/recovery-codes', requireAdminAny, (req, res) => {
  const db = getDb();
  const userId = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT id, full_name, username FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const row = db.prepare('SELECT recovery_codes FROM user_2fa WHERE user_id = ? AND enrolled = 1').get(userId);
  if (!row) return res.status(404).json({ error: '2FA is not enabled for this user.' });
  let codes = [];
  try { codes = JSON.parse(row.recovery_codes || '[]'); } catch (_) { codes = []; }
  res.locals.logAudit?.({
    action:      'REVEAL',
    module:      '2fa',
    recordId:    userId,
    description: `Recovery codes for ${user.full_name || user.username} viewed by admin ${req.session.userName || ('user ' + req.session.userId)}`,
  });
  res.json({ recovery_codes: codes });
});

// POST /api/admin/users/:id/2fa/regenerate-codes — replace recovery codes
router.post('/users/:id/2fa/regenerate-codes', requireAdminAny, (req, res) => {
  const db = getDb();
  const userId = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT enrolled FROM user_2fa WHERE user_id = ?').get(userId);
  if (!row || !row.enrolled) return res.status(404).json({ error: '2FA is not enabled for this user.' });
  const codes = totp.generateRecoveryCodes(10);
  db.prepare('UPDATE user_2fa SET recovery_codes = ? WHERE user_id = ?').run(JSON.stringify(codes), userId);
  res.locals.logAudit?.({
    action:      'UPDATE',
    module:      '2fa',
    recordId:    userId,
    description: `Recovery codes regenerated for user #${userId} by admin ${req.session.userName || ('user ' + req.session.userId)}`,
  });
  res.json({ recovery_codes: codes });
});

module.exports = router;
