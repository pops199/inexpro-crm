'use strict';

/**
 * Lightweight server-side mailer used by background jobs (no req.session).
 * Reads SMTP settings from system_settings (same store as /api/settings).
 *
 * If a `userId` is passed, the user's email signature (image-based via
 * smtp_from_list, or a text-fallback built from the users table) is
 * appended to the HTML body, the From header is overridden with the
 * user's name<email>, and the user is auto-CC'd. This matches the
 * behaviour of the inline raw-nodemailer paths in routes/advice-records
 * and routes/settings.
 *
 * If an `audit` object is passed, on successful send we write:
 *   - A generic `module: 'emails', recordId: null` audit_log entry
 *     (global audit-log visibility for every mail).
 *   - If `audit.module` is provided, an additional record-specific
 *     entry under that module + recordId so the email appears on the
 *     relevant record's timeline (assets/policies/claims/etc.).
 *
 * Returns { ok: true } on success or { ok: false, reason } when SMTP is
 * not configured / fails — never throws to the caller.
 */

const { getDb } = require('../db/database');
const { buildSignature } = require('./email-signature');
const { logAudit } = require('../middleware/audit');

function loadSmtpSettings() {
  const db = getDb();
  const rows = db.prepare(
    "SELECT key, value FROM system_settings WHERE key LIKE 'smtp_%'"
  ).all();
  const out = {};
  rows.forEach(r => {
    try { out[r.key] = JSON.parse(r.value); }
    catch (_) { out[r.key] = r.value; }
  });
  return out;
}

function _mergeCc(cc, senderEmail) {
  let list = [];
  if (cc) {
    list = Array.isArray(cc)
      ? cc.filter(Boolean)
      : String(cc).split(',').map(s => s.trim()).filter(Boolean);
  }
  if (senderEmail) {
    const lower = list.map(e => e.toLowerCase());
    if (!lower.includes(senderEmail.toLowerCase())) list.push(senderEmail);
  }
  return list;
}

async function sendMail({ to, subject, html, text, cc, attachments, userId, audit }) {
  if (!to) return { ok: false, reason: 'no recipient' };
  const settings = loadSmtpSettings();
  if (!settings.smtp_host || !settings.smtp_user) {
    return { ok: false, reason: 'SMTP not configured' };
  }
  let nodemailer;
  try { nodemailer = require('nodemailer'); }
  catch (_) { return { ok: false, reason: 'nodemailer not installed' }; }

  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port: parseInt(settings.smtp_port, 10) || 587,
    secure: String(settings.smtp_port) === '465',
    auth: { user: settings.smtp_user, pass: settings.smtp_pass },
  });

  // Default From — overridden below if the user has a from-list entry.
  let fromAddress = settings.smtp_from || settings.smtp_user;

  // Resolve signature + per-user From/CC. Empty for system jobs (no userId).
  const sig = buildSignature(userId);
  if (sig.fromAddress) fromAddress = sig.fromAddress;

  // Compose final attachments list (user attachments + signature image if any)
  const finalAttachments = Array.isArray(attachments) ? [...attachments] : [];
  if (sig.signatureAttachment) finalAttachments.push(sig.signatureAttachment);

  // Append signature to HTML (always non-empty if userId resolved a user)
  let finalHtml = html || '';
  if (sig.signatureHtml) finalHtml = `${finalHtml}${sig.signatureHtml}`;

  // Auto-CC the sending user
  const finalCc = _mergeCc(cc, sig.senderEmail);

  try {
    await transporter.sendMail({
      from: fromAddress,
      to:   Array.isArray(to) ? to.join(', ') : to,
      ...(finalCc.length ? { cc: finalCc.join(', ') } : {}),
      subject,
      html: finalHtml || undefined,
      text: text || (finalHtml ? finalHtml.replace(/<[^>]+>/g, '') : ''),
      ...(finalAttachments.length ? { attachments: finalAttachments } : {}),
    });

    // ── Audit log on success ──────────────────────────────────────────
    // Always log to a generic 'emails' module so the global audit log
    // captures every mail. If `audit.module` is provided, also log a
    // record-specific entry so the mail appears on that record's
    // timeline (asset / policy / claim / etc.).
    try {
      const toLabel = Array.isArray(to) ? to.join(', ') : String(to);
      const attachedNames = finalAttachments
        .filter(a => !a.cid)
        .map(a => a.filename)
        .filter(Boolean);
      const baseDescription = (audit && audit.description)
        || `Email sent to ${toLabel} — "${subject}"${attachedNames.length ? ` — attachments: ${attachedNames.join(', ')}` : ''}`;
      const auditPayload = {
        userId: userId || null,
        action: 'EMAIL',
        description: baseDescription,
        newValue: {
          to: toLabel,
          cc: finalCc.length ? finalCc.join(', ') : null,
          subject,
          from: fromAddress,
          attachments: attachedNames,
        },
      };
      // Always write a generic 'emails' entry for global audit-log visibility.
      logAudit({ ...auditPayload, module: 'emails', recordId: null });
      // If a specific module + record is provided, write a second entry so
      // the mail appears on that record's timeline.
      if (audit && audit.module && audit.recordId != null) {
        logAudit({
          ...auditPayload,
          module: audit.module,
          recordId: parseInt(audit.recordId, 10),
        });
      }
    } catch (auditErr) {
      // Audit failure must never break the send; log to console only.
      console.error('[mailer] audit log write failed:', auditErr.message);
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message || String(err) };
  }
}

module.exports = { sendMail };
