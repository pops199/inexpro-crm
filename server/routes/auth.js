const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { _isOtpFormat, _bypassEnabled, _redeemOtp } = require('../lib/edit-lock');

const router = express.Router();

// ── Trusted-device helpers (Remember this device for 30 days) ─────────
const TRUST_COOKIE = 'inexpro_2fa_trust';
const TRUST_DAYS   = 30;

function _hashToken(t) {
  return crypto.createHash('sha256').update(String(t)).digest('hex');
}

function _hasTrustedDevice(db, userId, rawToken) {
  if (!userId || !rawToken) return false;
  const row = db.prepare(`
    SELECT id FROM device_2fa_trust
    WHERE user_id = ? AND token_hash = ?
      AND revoked_at IS NULL
      AND datetime(expires_at) > datetime('now')
    LIMIT 1
  `).get(userId, _hashToken(rawToken));
  return !!row;
}

function _readTrustCookie(req) {
  const raw = req.headers && req.headers.cookie;
  if (!raw) return null;
  const m = String(raw).split(/;\s*/).find(p => p.startsWith(TRUST_COOKIE + '='));
  return m ? decodeURIComponent(m.slice(TRUST_COOKIE.length + 1)) : null;
}

function _issueTrustedDevice(db, res, req, userId) {
  const raw = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + TRUST_DAYS * 24 * 60 * 60 * 1000);
  db.prepare(`
    INSERT INTO device_2fa_trust (user_id, token_hash, user_agent, ip_address, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, _hashToken(raw), String(req.headers['user-agent'] || '').slice(0, 250), req.ip || null, expires.toISOString());
  res.cookie(TRUST_COOKIE, raw, {
    httpOnly: true,
    sameSite: 'lax',
    secure:   process.env.COOKIE_SECURE === 'true',
    maxAge:   TRUST_DAYS * 24 * 60 * 60 * 1000,
    path:     '/',
  });
}

// Pending-2FA logins: keep the candidate user on the session under a
// separate key so it cannot be mistaken for an authenticated user. The
// follow-up POST /login-2fa promotes it to userId once the TOTP / recovery
// code verifies. Stays in-process and is wiped on session destroy.
const totpLib = require('../lib/totp');

// POST /api/auth/login — username + password. Returns either a fully
// authenticated session OR { twofa_required: true } if the user has 2FA on.
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const db = getDb();

  const user = db.prepare(
    'SELECT id, username, full_name, password_hash, role, active FROM users WHERE username = ?'
  ).get(username.trim());

  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  if (!user.active) {
    return res.status(403).json({ error: 'Account is disabled' });
  }

  const passwordMatch = bcrypt.compareSync(password, user.password_hash);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // Check 2FA enrollment
  const tf = db.prepare('SELECT enrolled FROM user_2fa WHERE user_id = ?').get(user.id);
  if (tf && tf.enrolled) {
    // Trusted-device shortcut — if the browser presents a valid 30-day
    // trust cookie for this user, skip the second-step prompt entirely.
    const trustToken = _readTrustCookie(req);
    if (trustToken && _hasTrustedDevice(db, user.id, trustToken)) {
      req.session.userId   = user.id;
      req.session.userRole = user.role;
      req.session.userName = user.full_name;
      return req.session.save((err) => {
        if (err) {
          console.error('Session save error (trusted-device):', err);
          return res.status(500).json({ error: 'Login failed — session error' });
        }
        res.locals.logAudit({
          action:      'LOGIN',
          module:      'auth',
          recordId:    user.id,
          description: `User "${user.username}" logged in (trusted device — 2FA skipped)`,
        });
        res.json({
          id:       user.id,
          username: user.username,
          fullName: user.full_name,
          role:     user.role,
        });
      });
    }
    // Park the user as pending — DO NOT set userId until 2FA succeeds
    req.session.pending2faUserId = user.id;
    req.session.pending2faAt     = Date.now();
    return req.session.save((err) => {
      if (err) {
        console.error('Session save error (2FA pending):', err);
        return res.status(500).json({ error: 'Login failed — session error' });
      }
      res.json({
        twofa_required: true,
        username: user.username,
      });
    });
  }

  req.session.userId   = user.id;
  req.session.userRole = user.role;
  req.session.userName = user.full_name;

  req.session.save((err) => {
    if (err) {
      console.error('Session save error:', err);
      return res.status(500).json({ error: 'Login failed — session error' });
    }

    res.locals.logAudit({
      action: 'LOGIN',
      module: 'auth',
      recordId: user.id,
      description: `User "${user.username}" logged in`
    });

    return res.json({
      id:       user.id,
      username: user.username,
      fullName: user.full_name,
      role:     user.role
    });
  });
});

// POST /api/auth/login-2fa — second step: verify the TOTP code (or a
// recovery code). On success, promotes the pending user to a real session.
// When `remember` is true, also issues a 30-day device-trust cookie so the
// user is not prompted for 2FA again on this browser within the window.
router.post('/login-2fa', (req, res) => {
  const { code, remember } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Code is required' });
  const pendingId = req.session && req.session.pending2faUserId;
  const pendingAt = req.session && req.session.pending2faAt;
  if (!pendingId || !pendingAt) {
    return res.status(400).json({ error: 'No login in progress.', code: 'NO_PENDING' });
  }
  // Pending logins are valid for 10 minutes only
  if (Date.now() - pendingAt > 10 * 60 * 1000) {
    delete req.session.pending2faUserId;
    delete req.session.pending2faAt;
    return res.status(401).json({ error: 'Login expired. Please sign in again.', code: 'EXPIRED' });
  }

  const db = getDb();
  const user = db.prepare(
    'SELECT id, username, full_name, role, active FROM users WHERE id = ?'
  ).get(pendingId);
  if (!user || !user.active) {
    return res.status(401).json({ error: 'Account no longer active.' });
  }
  const tf = db.prepare('SELECT secret, recovery_codes FROM user_2fa WHERE user_id = ? AND enrolled = 1').get(pendingId);
  if (!tf) {
    return res.status(400).json({ error: '2FA is no longer enabled — please sign in again.' });
  }

  const supplied = String(code || '').trim();
  let verified = false;
  let viaRecovery = false;

  if (totpLib.verifyTotp(tf.secret, supplied)) {
    verified = true;
  } else {
    // Try recovery codes
    let codes = [];
    try { codes = JSON.parse(tf.recovery_codes || '[]'); } catch (_) { codes = []; }
    const idx = codes.indexOf(supplied);
    if (idx !== -1) {
      verified = true;
      viaRecovery = true;
      codes.splice(idx, 1); // single-use
      db.prepare('UPDATE user_2fa SET recovery_codes = ? WHERE user_id = ?')
        .run(JSON.stringify(codes), pendingId);
    }
  }

  if (!verified) {
    res.locals.logAudit?.({
      userId:      null,
      action:      'LOGIN_2FA_DENIED',
      module:      'auth',
      recordId:    user.id,
      description: `Failed 2FA code for "${user.username}"`,
    });
    return res.status(401).json({ error: 'Invalid 2FA code.', code: 'BAD_CODE' });
  }

  db.prepare('UPDATE user_2fa SET last_used_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(pendingId);

  // If the user ticked "Remember this device for 30 days", mint a token
  // and set the long-lived cookie BEFORE we send the response.
  if (remember) {
    try { _issueTrustedDevice(db, res, req, user.id); } catch (_) {}
  }

  delete req.session.pending2faUserId;
  delete req.session.pending2faAt;
  req.session.userId   = user.id;
  req.session.userRole = user.role;
  req.session.userName = user.full_name;

  req.session.save((err) => {
    if (err) {
      console.error('Session save error (2FA promote):', err);
      return res.status(500).json({ error: 'Login failed — session error' });
    }
    res.locals.logAudit({
      action:      'LOGIN',
      module:      'auth',
      recordId:    user.id,
      description: `User "${user.username}" logged in${viaRecovery ? ' using recovery code' : ' with 2FA'}`,
    });
    res.json({
      id:       user.id,
      username: user.username,
      fullName: user.full_name,
      role:     user.role,
    });
  });
});

// POST /api/auth/verify-password — verify that the supplied secret unlocks an
// edit. Accepts EITHER an admin / admin_only user's bcrypt password OR a
// 6-digit OTP issued from the Security tab. Also short-circuits to verified
// when the system-wide `bypass_edit_password` toggle is on. Used by the
// client-side EditLock challenge so the secret is checked BEFORE the edit
// form opens. Brokers can call this — the override comes from any admin
// entering THEIR password (or a PIN they issued), regardless of who is
// logged in.
//
// NOTE on OTPs: this endpoint is the pre-flight check that gates the edit
// form opening. It does NOT consume the OTP — that happens on the actual
// PUT inside verifyEditUnlock so a single PIN protects the whole save.
router.post('/verify-password', requireAuth, (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password is required' });

  const db = getDb();

  if (_bypassEnabled(db)) {
    return res.json({ verified: true, bypassed: true });
  }

  // OTP path — peek-only (do not redeem here)
  if (_isOtpFormat(password)) {
    const trimmed = String(password).trim();
    const otp = db.prepare(`
      SELECT o.*, u.full_name AS issuer_name, u.username AS issuer_username
      FROM otp_codes o
      LEFT JOIN users u ON u.id = o.created_by_user_id
      WHERE o.code = ? AND o.used_at IS NULL AND o.revoked_at IS NULL
        AND datetime(o.expires_at) > datetime('now')
        AND (o.target_user_id IS NULL OR o.target_user_id = ?)
      ORDER BY o.id DESC
      LIMIT 1
    `).get(trimmed, req.session.userId);
    if (otp) {
      return res.json({
        verified:    true,
        otp_id:      otp.id,
        admin_label: otp.issuer_name || otp.issuer_username || 'admin',
        via:         'otp',
      });
    }
    // Fall through — not a valid OTP, but still try as a password
  }

  const admins = db.prepare(
    `SELECT id, password_hash, full_name, username
     FROM users
     WHERE active = 1 AND role IN ('admin', 'admin_only')`
  ).all();
  if (!admins.length) {
    return res.status(503).json({ error: 'No active admin users on file.' });
  }

  let matched = null;
  for (const a of admins) {
    if (a.password_hash && bcrypt.compareSync(String(password), a.password_hash)) {
      matched = a;
      break;
    }
  }

  if (!matched) {
    res.locals.logAudit?.({
      action:   'VERIFY_PASSWORD_DENIED',
      module:   'auth',
      recordId: req.session.userId,
      description: `Incorrect admin password / OTP supplied by ${req.session.userName || `user ${req.session.userId}`}`,
    });
    return res.status(401).json({ error: 'Incorrect admin password or OTP.', code: 'BAD_PASSWORD' });
  }

  return res.json({
    verified:    true,
    admin_id:    matched.id,
    admin_label: matched.full_name || matched.username,
    via:         'password',
  });
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  const userId   = req.session.userId;
  const userName = req.session.userName;

  res.locals.logAudit({
    action: 'LOGOUT',
    module: 'auth',
    recordId: userId,
    description: `User "${userName}" logged out`
  });

  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    return res.json({ message: 'Logged out successfully' });
  });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  return res.json({
    id:       req.session.userId,
    fullName: req.session.userName,
    role:     req.session.userRole
  });
});

// ═════════════════════════════════════════════════════════════════════
// Self-service profile — the signed-in user can view their own row and
// change their password / manage their own 2FA without admin help.
// Read-only fields (full_name, username, email, role, active) are NOT
// exposed for editing here — the admin User Management UI owns those.
// ═════════════════════════════════════════════════════════════════════

const totpLib2 = require('../lib/totp');

// GET /api/auth/profile — signed-in user's profile + 2FA status
router.get('/profile', requireAuth, (req, res) => {
  const db = getDb();
  const u = db.prepare(`
    SELECT id, username, email, full_name, role, active, created_at, updated_at
    FROM users WHERE id = ?
  `).get(req.session.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const tf = db.prepare('SELECT enrolled, enrolled_at, last_used_at FROM user_2fa WHERE user_id = ?').get(u.id);
  res.json({
    ...u,
    two_factor_enabled: tf ? !!tf.enrolled : false,
    two_factor_pending: tf ? !tf.enrolled : false,
    two_factor_last_used_at: tf ? tf.last_used_at : null,
  });
});

// PUT /api/auth/profile/password — change own password (must supply current)
router.put('/profile/password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  if (String(new_password).length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }
  const db = getDb();
  const u = db.prepare('SELECT id, username, password_hash FROM users WHERE id = ?').get(req.session.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (!bcrypt.compareSync(String(current_password), u.password_hash)) {
    res.locals.logAudit?.({
      action: 'PASSWORD_CHANGE_DENIED',
      module: 'auth',
      recordId: u.id,
      description: `Incorrect current password supplied by ${u.username} during password change`,
    });
    return res.status(401).json({ error: 'Current password is incorrect.', code: 'BAD_CURRENT' });
  }
  const newHash = bcrypt.hashSync(String(new_password), 12);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHash, u.id);
  res.locals.logAudit?.({
    action: 'UPDATE',
    module: 'users',
    recordId: u.id,
    description: `User "${u.username}" changed own password`,
  });
  res.json({ message: 'Password updated' });
});

// GET /api/auth/profile/2fa — own 2FA status
router.get('/profile/2fa', requireAuth, (req, res) => {
  const db = getDb();
  const tf = db.prepare('SELECT enrolled, enrolled_at, last_used_at FROM user_2fa WHERE user_id = ?').get(req.session.userId);
  res.json({
    enrolled: tf ? !!tf.enrolled : false,
    pending:  tf ? !tf.enrolled : false,
    enrolled_at:  tf ? tf.enrolled_at : null,
    last_used_at: tf ? tf.last_used_at : null,
  });
});

// POST /api/auth/profile/2fa/enroll — start own 2FA enrollment
router.post('/profile/2fa/enroll', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const u = db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const existing = db.prepare('SELECT enrolled FROM user_2fa WHERE user_id = ?').get(userId);
  if (existing && existing.enrolled) {
    return res.status(409).json({ error: '2FA is already enabled. Disable it first if you need to re-enroll.', code: 'ALREADY_ENROLLED' });
  }
  const secret = totpLib2.generateSecret();
  const issuer = 'Inexpro CRM';
  const account = u.email || u.username;
  const uri = totpLib2.buildOtpAuthUri({ secret, account, issuer });
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
    action: 'CREATE',
    module: '2fa',
    recordId: userId,
    description: `2FA enrollment started by ${u.username} (self-service)`,
  });
  res.json({ secret, otpauth_uri: uri, account, issuer });
});

// POST /api/auth/profile/2fa/verify — confirm own enrollment
router.post('/profile/2fa/verify', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const { code } = req.body || {};
  const row = db.prepare('SELECT secret, enrolled FROM user_2fa WHERE user_id = ?').get(userId);
  if (!row) return res.status(400).json({ error: 'No pending enrollment.' });
  if (!totpLib2.verifyTotp(row.secret, code)) {
    return res.status(401).json({ error: 'Invalid code. Wait for the next 30-second cycle and try again.', code: 'BAD_CODE' });
  }
  let recoveryCodes = [];
  if (!row.enrolled) {
    recoveryCodes = totpLib2.generateRecoveryCodes(10);
    db.prepare(`
      UPDATE user_2fa SET enrolled = 1, enrolled_at = CURRENT_TIMESTAMP,
                          recovery_codes = ?, last_used_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(JSON.stringify(recoveryCodes), userId);
    res.locals.logAudit?.({
      action: 'UPDATE',
      module: '2fa',
      recordId: userId,
      description: `2FA enabled for user #${userId} (self-service); ${recoveryCodes.length} recovery codes issued`,
    });
  }
  res.json({ verified: true, recovery_codes: recoveryCodes });
});

// POST /api/auth/profile/2fa/disable — disable own 2FA (requires current password)
router.post('/profile/2fa/disable', requireAuth, (req, res) => {
  const { current_password } = req.body || {};
  if (!current_password) return res.status(400).json({ error: 'Current password required to disable 2FA.' });
  const db = getDb();
  const u = db.prepare('SELECT id, username, password_hash FROM users WHERE id = ?').get(req.session.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (!bcrypt.compareSync(String(current_password), u.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.', code: 'BAD_CURRENT' });
  }
  db.prepare('DELETE FROM user_2fa WHERE user_id = ?').run(u.id);
  res.locals.logAudit?.({
    action: 'DELETE',
    module: '2fa',
    recordId: u.id,
    description: `2FA disabled by ${u.username} (self-service)`,
  });
  res.json({ message: '2FA disabled' });
});

module.exports = router;
