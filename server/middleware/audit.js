const { getDb } = require('../db/database');

/**
 * Log an audit event to the audit_log table.
 */
function logAudit({ userId, action, module, recordId, oldValue, newValue, description, ip }) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO audit_log (user_id, action, module, record_id, old_value, new_value, description, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId || null,
      action,
      module,
      recordId || null,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      description || null,
      ip || null
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

/**
 * Express middleware that attaches logAudit to res.locals.
 */
function auditMiddleware(req, res, next) {
  res.locals.logAudit = (opts) => {
    logAudit({
      userId: req.session?.userId,
      ip: req.ip,
      ...opts
    });
  };
  next();
}

module.exports = { logAudit, auditMiddleware };
