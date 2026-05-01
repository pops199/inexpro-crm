'use strict';

/**
 * Lightweight server-side mailer used by background jobs (no req.session).
 * Reads SMTP settings from system_settings (same store as /api/settings).
 * Returns { ok: true } on success or { ok: false, reason } when SMTP is
 * not configured / fails — never throws to the caller.
 */

const { getDb } = require('../db/database');

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

async function sendMail({ to, subject, html, text, cc }) {
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
  const fromAddress = settings.smtp_from || settings.smtp_user;

  try {
    await transporter.sendMail({
      from: fromAddress,
      to:   Array.isArray(to) ? to.join(', ') : to,
      ...(cc ? { cc: Array.isArray(cc) ? cc.join(', ') : cc } : {}),
      subject,
      html: html || undefined,
      text: text || (html ? html.replace(/<[^>]+>/g, '') : ''),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message || String(err) };
  }
}

module.exports = { sendMail };
