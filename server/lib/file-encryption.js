'use strict';

const crypto = require('crypto');
const fs = require('fs');

const HEADER_PREFIX = 'INEXPRODOCENC';
const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const HEADER_SCAN_BYTES = 512;

function resolveDocumentKey() {
  const raw = process.env.DOCUMENT_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!raw) {
    throw new Error('DOCUMENT_ENCRYPTION_KEY or SESSION_SECRET must be set to encrypt documents.');
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');

  try {
    const b = Buffer.from(raw, 'base64');
    if (b.length === 32) return b;
  } catch (_) {}

  return crypto.createHash('sha256').update(raw).digest();
}

function buildAad(ivHex, plainSize) {
  return Buffer.from(`${HEADER_PREFIX}:${VERSION}:${ivHex}:${plainSize}`, 'utf8');
}

function parseHeader(buffer, { throwOnMalformed = false } = {}) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  const prefix = Buffer.from(`${HEADER_PREFIX}:`, 'utf8');

  if (source.length < prefix.length || !source.subarray(0, prefix.length).equals(prefix)) {
    return { encrypted: false };
  }

  const newlineIndex = source.indexOf(0x0a);
  if (newlineIndex === -1 || newlineIndex > HEADER_SCAN_BYTES) {
    if (throwOnMalformed) throw new Error('Encrypted document header is malformed.');
    return { encrypted: false };
  }

  const line = source.subarray(0, newlineIndex).toString('utf8');
  const parts = line.split(':');
  if (parts.length !== 5 || parts[0] !== HEADER_PREFIX || parts[1] !== VERSION) {
    if (throwOnMalformed) throw new Error('Encrypted document header is malformed.');
    return { encrypted: false };
  }

  const [, , ivHex, tagHex, sizeText] = parts;
  if (!/^[0-9a-f]{24}$/i.test(ivHex) || !/^[0-9a-f]{32}$/i.test(tagHex) || !/^\d+$/.test(sizeText)) {
    if (throwOnMalformed) throw new Error('Encrypted document header is malformed.');
    return { encrypted: false };
  }

  const plainSize = Number.parseInt(sizeText, 10);
  return {
    encrypted: true,
    headerEnd: newlineIndex + 1,
    ivHex,
    tagHex,
    plainSize,
    aad: buildAad(ivHex, plainSize),
  };
}

function isEncryptedBuffer(buffer) {
  return parseHeader(buffer).encrypted;
}

function encryptBuffer(input) {
  const plain = Buffer.isBuffer(input) ? input : Buffer.from(input || '');
  if (isEncryptedBuffer(plain)) return plain;

  const key = resolveDocumentKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const ivHex = iv.toString('hex');
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(buildAad(ivHex, plain.length));

  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tagHex = cipher.getAuthTag().toString('hex');
  const header = Buffer.from(`${HEADER_PREFIX}:${VERSION}:${ivHex}:${tagHex}:${plain.length}\n`, 'utf8');

  return Buffer.concat([header, encrypted]);
}

function decryptBuffer(input) {
  const stored = Buffer.isBuffer(input) ? input : Buffer.from(input || '');
  const header = parseHeader(stored, { throwOnMalformed: true });
  if (!header.encrypted) return stored;

  const key = resolveDocumentKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(header.ivHex, 'hex')
  );
  decipher.setAAD(header.aad);
  decipher.setAuthTag(Buffer.from(header.tagHex, 'hex'));

  const plain = Buffer.concat([
    decipher.update(stored.subarray(header.headerEnd)),
    decipher.final(),
  ]);

  if (plain.length !== header.plainSize) {
    throw new Error('Decrypted document size mismatch.');
  }

  return plain;
}

function writeEncryptedFile(filePath, plainBuffer) {
  fs.writeFileSync(filePath, encryptBuffer(plainBuffer));
}

function readDecryptedFile(filePath) {
  return decryptBuffer(fs.readFileSync(filePath));
}

function getPlainFileSize(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const head = Buffer.alloc(HEADER_SCAN_BYTES);
    const bytesRead = fs.readSync(fd, head, 0, HEADER_SCAN_BYTES, 0);
    const header = parseHeader(head.subarray(0, bytesRead));
    if (header.encrypted) return header.plainSize;
  } finally {
    fs.closeSync(fd);
  }

  return fs.statSync(filePath).size;
}

module.exports = {
  encryptBuffer,
  decryptBuffer,
  isEncryptedBuffer,
  writeEncryptedFile,
  readDecryptedFile,
  getPlainFileSize,
};
