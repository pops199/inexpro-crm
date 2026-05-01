'use strict';

const crypto = require('crypto');

// AES-256-GCM encryption for sensitive identifiers (e.g. SA ID numbers).
// Stored format: "v1:<ivHex>:<tagHex>:<cipherHex>"
//
// Key resolution order:
//   1. process.env.ID_NUMBER_KEY   (32-byte key, hex or base64)
//   2. process.env.SESSION_SECRET  (fallback — derived via SHA-256)
// In production ID_NUMBER_KEY MUST be set explicitly.

const VERSION    = 'v1';
const ALGORITHM  = 'aes-256-gcm';
const IV_LENGTH  = 12;

function resolveKey() {
  const raw = process.env.ID_NUMBER_KEY || process.env.SESSION_SECRET;
  if (!raw) {
    throw new Error('ID_NUMBER_KEY or SESSION_SECRET must be set to encrypt ID numbers.');
  }
  // Accept hex (64 chars), base64, or plain string — derive a 32-byte key.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  try {
    const b = Buffer.from(raw, 'base64');
    if (b.length === 32) return b;
  } catch (_) {}
  return crypto.createHash('sha256').update(raw).digest();
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(`${VERSION}:`);
}

function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const str = String(plain).trim();
  if (!str) return null;
  if (isEncrypted(str)) return str; // already encrypted — passthrough

  const key = resolveKey();
  const iv  = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(stored) {
  if (stored === null || stored === undefined || stored === '') return null;
  if (!isEncrypted(stored)) return stored; // legacy plain text

  const parts = stored.split(':');
  if (parts.length !== 4) return stored;
  const [, ivHex, tagHex, cipherHex] = parts;

  try {
    const key = resolveKey();
    const iv  = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const enc = Buffer.from(cipherHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch (err) {
    return null; // bad key, tampered ciphertext — fail closed
  }
}

/** Mask an ID number for display: last 4 digits visible, rest replaced with •. */
function mask(plain) {
  if (!plain) return '';
  const s = String(plain).replace(/\s+/g, '');
  if (s.length <= 4) return s;
  return '•'.repeat(s.length - 4) + s.slice(-4);
}

// Every field in this list is treated as "sensitive PII" by redactForAudit and
// will be replaced with a `[REDACTED ****1234]` marker (last 4 chars visible)
// in audit_log old_value / new_value payloads. The plaintext / ciphertext is
// never written to the log — admins use the /api/admin/reveal-encrypted
// endpoint to inspect the actual value, with a separate REVEAL audit entry.
const SENSITIVE_FIELDS = [
  'id_number',                  // broker_profiles
  'sa_id_number',               // contacts
  'passport_number',            // contacts
  'fica_document_reference',    // contacts + accounts
  'driver_id_number',           // claims (encryption pending)
  'co_insured_id_number',       // policies (encryption pending)
  'account_number_enc',         // policies — bank account number
  'registration_number',        // accounts (encryption pending)
  'vat_number',                 // accounts (encryption pending)
];

function _redactValue(v) {
  if (v === null || v === undefined || v === '') return v ?? null;
  const plain = isEncrypted(v) ? decrypt(v) : v;
  if (!plain) return '[REDACTED]';
  const s = String(plain);
  return s.length >= 4
    ? `[REDACTED ****${s.slice(-4)}]`
    : '[REDACTED]';
}

/**
 * Returns a copy of `obj` with every entry in SENSITIVE_FIELDS replaced by a
 * redaction marker. Suitable for audit_log old_value / new_value where storing
 * raw ciphertext (or, worse, plaintext) would defeat the encryption gate.
 *
 * Optionally pass an `extraFields` array to redact additional fields for a
 * particular call site without mutating the global list.
 */
function redactForAudit(obj, extraFields = []) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  const fields = extraFields.length
    ? Array.from(new Set([...SENSITIVE_FIELDS, ...extraFields]))
    : SENSITIVE_FIELDS;
  for (const f of fields) {
    if (f in out) out[f] = _redactValue(out[f]);
  }
  return out;
}

module.exports = { encrypt, decrypt, isEncrypted, mask, redactForAudit, SENSITIVE_FIELDS };
