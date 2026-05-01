'use strict';
/**
 * TOTP (RFC 6238) — HMAC-SHA1, 6-digit codes, 30-second time-step.
 * Implemented against Node's built-in `crypto` so no external dep is
 * required. Compatible with Google Authenticator, Authy, 1Password etc.
 */

const crypto = require('crypto');

const RFC4648_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateSecret(bytes = 20) {
  // 20 bytes = 160 bits — RFC 4226 minimum for HMAC-SHA1
  const buf = crypto.randomBytes(bytes);
  return base32Encode(buf);
}

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += RFC4648_BASE32[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += RFC4648_BASE32[(value << (5 - bits)) & 0x1f];
  return out;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = RFC4648_BASE32.indexOf(ch);
    if (idx === -1) continue; // ignore stray characters
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secretBase32, counter) {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  // SQLite/JS bigint-free 8-byte counter
  for (let i = 7; i >= 0; i--) {
    buf[i] = counter & 0xff;
    counter = Math.floor(counter / 256);
  }
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24)
             | ((hmac[offset + 1] & 0xff) << 16)
             | ((hmac[offset + 2] & 0xff) << 8)
             |  (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

function totp(secretBase32, t = Date.now()) {
  return hotp(secretBase32, Math.floor(t / 1000 / 30));
}

/**
 * Verify a user-supplied 6-digit code with a +/- 1 step skew window so
 * minor clock drift on the user's phone doesn't lock them out.
 */
function verifyTotp(secretBase32, code, t = Date.now()) {
  const expected = String(code || '').replace(/\D/g, '');
  if (expected.length !== 6) return false;
  const step = Math.floor(t / 1000 / 30);
  for (const offset of [0, -1, 1]) {
    if (hotp(secretBase32, step + offset) === expected) return true;
  }
  return false;
}

/**
 * Build the otpauth URI scanned by authenticator apps.
 *   otpauth://totp/<issuer>:<account>?secret=<...>&issuer=<...>
 */
function buildOtpAuthUri({ secret, account, issuer }) {
  const enc = encodeURIComponent;
  const label = `${issuer}:${account}`;
  return `otpauth://totp/${enc(label)}?secret=${secret}&issuer=${enc(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** Generate a batch of one-time recovery codes (printable, hyphenated). */
function generateRecoveryCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString('hex'); // 10 hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

module.exports = {
  generateSecret,
  totp,
  verifyTotp,
  buildOtpAuthUri,
  generateRecoveryCodes,
};
