'use strict';

/**
 * Edit-lock gate
 * ==============
 *
 * After a record has been saved (i.e. on every PUT to a "locked" module) the
 * client MUST include `_admin_password` in the request body. The server tries
 * the supplied secret first as a 6-digit OTP issued from the Security tab,
 * then against every active admin / admin_only user's bcrypt hash. This is
 * intentional: a broker may be logged in editing a record, and an admin can
 * either step in (entering their own password) or hand the broker a
 * pre-issued OTP — both authorise the change.
 *
 * The whole gate can also be globally disabled via the
 * `bypass_edit_password` system_settings flag (Security → toggle).
 *
 * Modules currently behind this gate:
 *   • policies          — every PUT
 *   • claims            — every PUT
 *   • fica/contact      — only after first FICA save
 *   • fica/account      — only after first FICA save
 *   • popia/contact     — only after first POPIA save
 *   • popia/account     — only after first POPIA save
 *   • client_engagements — every PUT
 *   • advice_records    — only when roa_completed = 1 (locked on Mark Complete)
 *
 * Successful unlock writes a `UNLOCK_EDIT` audit entry that records BOTH the
 * logged-in user (broker) AND the admin whose password matched (or the admin
 * who issued the redeemed OTP). Failed attempts write `UNLOCK_DENIED`. The
 * password is read off `req.body` and stripped before the route handler runs
 * so it never lands in the row update.
 */

const bcrypt = require('bcryptjs');

function _isOtpFormat(s) {
  return typeof s === 'string' && /^\d{6}$/.test(s.trim());
}

function _bypassEnabled(db) {
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'bypass_edit_password'").get();
    if (!row) return false;
    const v = row.value;
    if (v === '1' || v === 'true') return true;
    try { return JSON.parse(v) === true; } catch (_) { return false; }
  } catch (_) { return false; }
}

/**
 * Try to redeem a 6-digit OTP. On success, marks it used and returns the
 * issuing admin record so the caller can write a meaningful audit entry.
 * Returns null when no active matching OTP exists.
 */
function _redeemOtp(db, code, sessionUserId) {
  const trimmed = String(code).trim();
  if (!_isOtpFormat(trimmed)) return null;
  const otp = db.prepare(`
    SELECT * FROM otp_codes
    WHERE code = ? AND used_at IS NULL AND revoked_at IS NULL
      AND datetime(expires_at) > datetime('now')
    ORDER BY id DESC
    LIMIT 1
  `).get(trimmed);
  if (!otp) return null;
  // Optional binding to a specific user
  if (otp.target_user_id && otp.target_user_id !== sessionUserId) return null;

  db.prepare(`
    UPDATE otp_codes SET used_at = CURRENT_TIMESTAMP, used_by_user_id = ?
    WHERE id = ?
  `).run(sessionUserId, otp.id);

  const issuer = db.prepare(
    'SELECT id, full_name, username FROM users WHERE id = ?'
  ).get(otp.created_by_user_id);
  return { otp, issuer };
}

module.exports._isOtpFormat   = _isOtpFormat;
module.exports._bypassEnabled = _bypassEnabled;
module.exports._redeemOtp     = _redeemOtp;

function _audit(res, action, module, recordId, description) {
  if (res && res.locals && typeof res.locals.logAudit === 'function') {
    res.locals.logAudit({ action, module, recordId, description });
  }
}

/**
 * Verify the supplied admin password and (on success) strip it from the body
 * so it can never end up persisted. Returns:
 *   { ok: true }                              — proceed with the PUT
 *   { ok: false, status, error, code }        — reject with status/error
 *
 * `module` and `recordId` are used purely for audit-log breadcrumbs.
 */
function verifyEditUnlock(req, res, db, { module, recordId } = {}) {
  const supplied = req.body && req.body._admin_password;

  // Always strip — even on failure paths — so the field never reaches DB writes.
  if (req.body && '_admin_password' in req.body) {
    delete req.body._admin_password;
  }

  // Global bypass — admin has flipped the Security toggle to disable the gate.
  if (_bypassEnabled(db)) {
    _audit(res, 'UNLOCK_EDIT', 'edit_lock', recordId,
      `${module} #${recordId} edited with edit-password gate disabled (Security bypass)`);
    return { ok: true, bypassed: true };
  }

  if (!supplied) {
    return {
      ok: false,
      status: 423, // Locked
      code: 'EDIT_LOCKED',
      error: 'This record is locked. Enter an admin password or a one-time PIN issued by an admin.',
    };
  }

  const userId = req.session && req.session.userId;
  if (!userId) {
    return { ok: false, status: 401, code: 'NO_SESSION', error: 'Session invalid.' };
  }

  // Logged-in user (could be a broker — they're allowed, the override comes
  // from any admin entering their own password OR a valid OTP).
  const sessionUser = db.prepare(
    'SELECT id, role, active, full_name, username FROM users WHERE id = ?'
  ).get(userId);
  if (!sessionUser || !sessionUser.active) {
    return { ok: false, status: 401, code: 'NO_SESSION', error: 'Session invalid.' };
  }
  const sessionLabel = sessionUser.full_name || sessionUser.username || `user ${sessionUser.id}`;

  // 1) Try OTP redemption first (a 6-digit numeric value). If it matches an
  //    active OTP, mark it used and emit an OTP-flavoured audit entry.
  if (_isOtpFormat(supplied)) {
    const redeemed = _redeemOtp(db, supplied, sessionUser.id);
    if (redeemed) {
      const issuerLabel = redeemed.issuer
        ? (redeemed.issuer.full_name || redeemed.issuer.username || `user ${redeemed.issuer.id}`)
        : 'unknown admin';
      _audit(res, 'UNLOCK_EDIT', 'edit_lock', recordId,
        `${sessionLabel} edited ${module} #${recordId} using OTP #${redeemed.otp.id} issued by admin ${issuerLabel}`);
      return { ok: true, sessionUser, otp: redeemed.otp, issuer: redeemed.issuer };
    }
  }

  // 2) Try the supplied password against every active admin / admin_only user.
  //    First match wins.
  const admins = db.prepare(
    `SELECT id, role, password_hash, full_name, username
     FROM users
     WHERE active = 1 AND role IN ('admin', 'admin_only')`
  ).all();

  if (!admins.length) {
    _audit(res, 'UNLOCK_DENIED', 'edit_lock', recordId,
      `Edit attempt on ${module} #${recordId} by ${sessionLabel} but no active admin users exist to authorise it`);
    return { ok: false, status: 503, code: 'NO_ADMINS', error: 'No active admin users on file — cannot authorise edits.' };
  }

  let matchedAdmin = null;
  for (const a of admins) {
    if (a.password_hash && bcrypt.compareSync(String(supplied), a.password_hash)) {
      matchedAdmin = a;
      break;
    }
  }

  if (!matchedAdmin) {
    _audit(res, 'UNLOCK_DENIED', 'edit_lock', recordId,
      `${sessionLabel} entered an incorrect admin password / OTP for ${module} #${recordId}`);
    return { ok: false, status: 401, code: 'BAD_PASSWORD', error: 'Incorrect admin password or OTP.' };
  }

  const adminLabel = matchedAdmin.full_name || matchedAdmin.username || `user ${matchedAdmin.id}`;
  const same = matchedAdmin.id === sessionUser.id;
  _audit(res, 'UNLOCK_EDIT', 'edit_lock', recordId,
    same
      ? `${adminLabel} unlocked ${module} #${recordId} for editing (own session)`
      : `${sessionLabel} edited ${module} #${recordId} — authorised by admin ${adminLabel}`);

  return { ok: true, sessionUser, admin: matchedAdmin };
}

module.exports.verifyEditUnlock = verifyEditUnlock;
