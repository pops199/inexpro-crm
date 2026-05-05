'use strict';

/**
 * Resolves the email signature for a given user.
 *
 * Lookup chain (first match wins):
 *   1. users.signature_filename — set on the user profile itself, this is
 *      the canonical per-user linkage. The file must live in /signatures/.
 *   2. smtp_from_list (system_settings) — legacy admin-configured From +
 *      signature mapping. Kept as a fallback so existing setups keep
 *      working.
 *   3. Text fallback — uses the user's row in `users` to render a simple
 *      "Kind regards, <name>" text-block signature so every email gets
 *      signed even when no image is mapped.
 *
 * Returns:
 *   {
 *     fromAddress:         string | null,   // override From; null = use default
 *     senderEmail:         string | null,   // for auto-CC; null if user unknown
 *     signatureHtml:       string,          // '' if userId omitted/unknown
 *     signatureAttachment: { filename, path, cid } | null,
 *     userName:            string | null,
 *   }
 *
 * Pure: no req, no session — safe to call from background jobs.
 */

const path = require('path');
const fs   = require('fs');
const { getDb } = require('../db/database');

const SIG_CID = 'user-signature@inexpro';

function _signaturesDir() {
  return path.join(__dirname, '..', '..', 'signatures');
}

function _loadFromList(db) {
  try {
    const row = db.prepare(
      "SELECT value FROM system_settings WHERE key = 'smtp_from_list'"
    ).get();
    if (!row) return [];
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function _escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _textSignatureHtml(name, email, role) {
  const safeName  = _escapeHtml(name  || '');
  const safeEmail = _escapeHtml(email || '');
  const safeRole  = _escapeHtml(role  || '');
  return `
<div style="margin-top:18px;color:#444;font-family:Arial,sans-serif;font-size:13px;line-height:1.4;">
  <hr style="border:none;border-top:1px solid #ddd;margin:12px 0;">
  Kind regards,<br>
  <strong>${safeName}</strong>${safeRole ? `<br>${safeRole}` : ''}
  ${safeEmail ? `<br><a href="mailto:${safeEmail}" style="color:#0d6efd;text-decoration:none;">${safeEmail}</a>` : ''}
</div>`.trim();
}

function _imageSignatureHtml() {
  return `<div style="margin-top:18px;"><img src="cid:${SIG_CID}" alt="signature" style="max-width:400px;height:auto;"></div>`;
}

function _safeSignaturePath(filename) {
  if (!filename) return null;
  const safeName = path.basename(String(filename));
  const sigPath  = path.join(_signaturesDir(), safeName);
  // Path traversal guard: ensure resolved path is still inside signatures dir
  const rel = path.relative(_signaturesDir(), path.resolve(sigPath));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (!fs.existsSync(sigPath) || !fs.statSync(sigPath).isFile()) return null;
  return { filename: safeName, fullPath: sigPath };
}

/**
 * @param {number|string|null|undefined} userId
 * @param {object} [opts]
 * @param {object} [opts.db]  override db (defaults to getDb())
 * @returns {object}
 */
function buildSignature(userId, opts = {}) {
  const empty = {
    fromAddress: null,
    senderEmail: null,
    signatureHtml: '',
    signatureAttachment: null,
    userName: null,
  };
  if (!userId) return empty;

  let db;
  try { db = opts.db || getDb(); } catch (_) { return empty; }

  let userRow = null;
  try {
    userRow = db.prepare(
      'SELECT id, full_name, email, role, signature_filename FROM users WHERE id = ?'
    ).get(userId);
  } catch (_) {
    // Pre-migration DB — try without the new column.
    try {
      userRow = db.prepare(
        'SELECT id, full_name, email, role FROM users WHERE id = ?'
      ).get(userId);
    } catch (_) { /* table missing — keep userRow null */ }
  }

  const fromList = _loadFromList(db);
  const entry = fromList.find(f => String(f.user_id) === String(userId) && f.email) || null;

  // From + sender CC: prefer smtp_from_list entry; fall back to users row
  let fromAddress = null;
  let senderEmail = null;
  let userName    = null;

  if (entry) {
    fromAddress = entry.name
      ? `"${String(entry.name).replace(/"/g, '')}" <${entry.email}>`
      : entry.email;
    senderEmail = entry.email;
    userName    = entry.name || (userRow && userRow.full_name) || null;
  } else if (userRow) {
    senderEmail = userRow.email || null;
    userName    = userRow.full_name || null;
  } else {
    return empty;
  }

  // Image signature: prefer users.signature_filename, then smtp_from_list.
  const filenameCandidate =
    (userRow && userRow.signature_filename) ||
    (entry && entry.signature) ||
    null;
  if (filenameCandidate) {
    const resolved = _safeSignaturePath(filenameCandidate);
    if (resolved) {
      return {
        fromAddress,
        senderEmail,
        signatureHtml: _imageSignatureHtml(),
        signatureAttachment: { filename: resolved.filename, path: resolved.fullPath, cid: SIG_CID },
        userName,
      };
    }
  }

  // Text fallback — name + role + email
  const role = userRow ? userRow.role : null;
  const roleLabel = role === 'admin' ? 'Administrator'
                  : role === 'broker' ? 'Broker'
                  : role === 'admin_only' ? 'Administrator'
                  : null;

  return {
    fromAddress,
    senderEmail,
    signatureHtml: _textSignatureHtml(userName, senderEmail, roleLabel),
    signatureAttachment: null,
    userName,
  };
}

module.exports = { buildSignature, SIG_CID };
