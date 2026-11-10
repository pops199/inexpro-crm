'use strict';

const assert = require('node:assert/strict');
const { before, after, test, mock } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const PDFDocument = require('pdfkit');

const COUNTRIES = [
  'South Africa', 'Namibia', 'Botswana', 'Lesotho', 'Eswatini (Swaziland)',
  'Zimbabwe', 'Malawi', 'Democratic Republic of Congo (DRC), no further north than Kolwezi',
  'Mozambique', 'Angola', 'Zambia', 'Tanzania', 'Uganda', 'Rwanda', 'Burundi', 'Kenya',
];
const root = path.resolve(__dirname, '..');
const outputDir = process.env.COVER_REVIEW_DIR;
let dbModule, server, baseUrl, browser;
let textCalls = [];
const sentEmails = [];

function pdfUrl(limits = []) {
  const query = new URLSearchParams();
  limits.forEach(limit => query.append('territorial_limits', limit));
  return `${baseUrl}/api/assets/1/confirmation-of-cover-pdf?${query}`;
}

function savePdf(name, data) {
  assert.equal(Buffer.from(data.base64, 'base64').subarray(0, 5).toString(), '%PDF-');
  if (outputDir) fs.writeFileSync(path.join(outputDir, name), Buffer.from(data.base64, 'base64'));
}

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inexpro-cover-test-'));

before(async () => {
  process.env.DB_PATH = path.join(testDir, 'test.db');
  dbModule = require('../server/db/database');
  const db = dbModule.getDb();
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, email TEXT, password_hash TEXT,
      full_name TEXT, role TEXT, signature_filename TEXT);
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, account_name TEXT);
    CREATE TABLE contacts (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT);
    CREATE TABLE policy_sections (id INTEGER PRIMARY KEY, section_name TEXT);
    CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE policies (id INTEGER PRIMARY KEY, policy_name TEXT, policy_number TEXT,
      insurer TEXT, assigned_broker_id INTEGER, product_category TEXT, inception_date TEXT);
    CREATE TABLE assets (id INTEGER PRIMARY KEY, asset_name TEXT, asset_type TEXT,
      account_id INTEGER, policy_id INTEGER, contact_id INTEGER, policy_section_id INTEGER,
      make TEXT, model TEXT, year INTEGER, registration_number TEXT, vin_number TEXT,
      engine_number TEXT, cover_type TEXT, sum_insured REAL, date_acquired TEXT,
      address TEXT, suburb TEXT, city TEXT, province TEXT, postal_code TEXT,
      financial_institution TEXT, finance_contract_number TEXT, contract_expiry_date TEXT);
  `);
  db.prepare(`INSERT INTO users (id, username, email, password_hash, full_name, role)
    VALUES (1, 'cover-test', 'cover@example.test', 'unused', 'Test Broker', 'admin')`).run();
  db.prepare("INSERT INTO accounts (id, account_name) VALUES (1, 'Example Logistics CC')").run();
  db.prepare(`INSERT INTO policies (id, policy_name, policy_number, insurer, assigned_broker_id,
    product_category, inception_date) VALUES (1, 'Example Fleet Cover', 'TEST-001', 'Test Insurer',
    1, 'Motor', '2024-01-01')`).run();
  db.prepare(`INSERT INTO assets (id, asset_name, asset_type, account_id, policy_id, make, model, year,
    registration_number, vin_number, engine_number, cover_type, sum_insured, date_acquired,
    address, city, financial_institution, finance_contract_number, contract_expiry_date)
    VALUES (1, 'Test Truck', 'Motor', 1, 1, 'FAW', 'JH6', 2024, 'TEST-123', 'TESTVIN', 'TESTENGINE',
    'Comprehensive', 1427400, '2024-01-01', '6 Example Avenue', 'Cape Town',
    'Example Vehicle Finance (Pty) Ltd', 'FIN-001', '2027-11-13')`).run();

  const originalText = PDFDocument.prototype.text;
  mock.method(PDFDocument.prototype, 'text', function (text, ...args) {
    textCalls.push(String(text));
    return originalText.call(this, text, ...args);
  });

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use((req, res, next) => {
    req.session = { userId: 1, userRole: 'admin' };
    next();
  });
  app.get('/api/assets/1', (_req, res) => res.json({ data: {
    ...db.prepare('SELECT * FROM assets WHERE id = 1').get(),
    account_name: 'Example Logistics CC', policy_number: 'TEST-001',
  } }));
  app.use('/api/assets', require('../server/routes/assets'));
  app.get('/api/settings/templates', (_req, res) => res.json([]));
  app.get('/api/settings/claim-forms', (_req, res) => res.json([{ filename: 'Test-Claim.pdf', label: 'Test Claim' }]));
  app.post('/api/settings/send-email', (req, res) => {
    sentEmails.push(req.body);
    res.json({ success: true });
  });
  app.use('/src', express.static(path.join(root, 'client/src')));
  app.get('/fixture', (_req, res) => res.send(`<!doctype html><html><head>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="/src/styles/main.css"></head><body>
    <script src="/src/utils.js"></script><script src="/src/api.js"></script>
    <script src="/src/components/assets.js"></script><script>
      window.currentUser = { full_name: 'Test Broker' };
      window.showToast = () => {};
    </script></body></html>`));
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  if (outputDir) fs.mkdirSync(outputDir, { recursive: true });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (dbModule) dbModule.closeDb();
  mock.restoreAll();
  assert.equal(path.dirname(testDir), os.tmpdir());
  assert.ok(path.basename(testDir).startsWith('inexpro-cover-test-'));
  fs.rmSync(testDir, { recursive: true, force: true });
});

test('no selection omits territorial heading and countries', async () => {
  textCalls = [];
  const response = await fetch(pdfUrl());
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.territorial_limit_options, COUNTRIES);
  assert.ok(!textCalls.includes('Territorial Limits:'));
  assert.ok(!textCalls.some(text => text.includes('Kolwezi')));
  savePdf('none.pdf', data);
});

test('selected limits render once in list order with the full DRC restriction', async () => {
  textCalls = [];
  const response = await fetch(pdfUrl([COUNTRIES[7], 'Namibia', 'Namibia']));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(textCalls.filter(text => text === 'Territorial Limits:').length, 1);
  assert.ok(textCalls.includes(`Namibia, ${COUNTRIES[7]}.`));
  assert.ok(!textCalls.some(text => text.includes('South Africa')));
  assert.ok(textCalls.indexOf('Territorial Limits:') < textCalls.indexOf('Regards,'));
  savePdf('selected.pdf', data);
});

test('all sixteen countries render in the PDF', async () => {
  textCalls = [];
  const response = await fetch(pdfUrl(COUNTRIES));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(textCalls.includes(COUNTRIES.join(', ') + '.'));
  assert.ok(textCalls.includes('Regards,'));
  savePdf('all.pdf', data);
});

test('a single country is accepted and invalid values are rejected', async () => {
  textCalls = [];
  assert.equal((await fetch(pdfUrl(['Kenya']))).status, 200);
  assert.ok(textCalls.includes('Kenya.'));
  assert.equal((await fetch(pdfUrl(['Unknown country']))).status, 400);
  assert.equal((await fetch(`${pdfUrl()}territorial_limits[name]=Namibia`)).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/assets/999/confirmation-of-cover-pdf`)).status, 404);
});

test('email checklist, final attachment, failure retry and responsive layout', { timeout: 60000 }, async t => {
  const { chromium } = require('playwright');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1069, height: 932 } });
  t.after(() => page.close());
  await page.goto(`${baseUrl}/fixture`);
  const openModal = () => page.evaluate(() => Assets._confirmationOfCoverMail(1));
  await openModal();
  const details = page.locator('#cover-mail-territorial-limits');
  assert.equal(await details.evaluate(el => el.open), false);
  assert.equal(await details.locator('input:checked').count(), 0);
  assert.equal(await details.locator('input[type="checkbox"]').count(), 16);
  assert.ok(await page.evaluate(() => {
    const section = document.getElementById('cover-mail-territorial-limits');
    return !!(section.compareDocumentPosition(document.getElementById('cover-mail-attachment-list')) & Node.DOCUMENT_POSITION_FOLLOWING);
  }));
  await details.locator('summary').click();
  await page.getByRole('checkbox', { name: 'Namibia', exact: true }).check();
  await page.getByRole('checkbox', { name: COUNTRIES[7], exact: true }).check();
  await page.getByRole('checkbox', { name: 'South Africa', exact: true }).check();
  await page.getByRole('checkbox', { name: 'South Africa', exact: true }).uncheck();
  await details.locator('summary').click();
  await details.locator('summary').click();
  assert.equal(await page.getByRole('checkbox', { name: 'Namibia', exact: true }).isChecked(), true);

  for (const width of [1069, 390]) {
    await page.setViewportSize({ width, height: 932 });
    await details.scrollIntoViewIfNeeded();
    assert.ok(await details.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (outputDir) await page.screenshot({ path: path.join(outputDir, `modal-${width}.png`) });
  }

  await page.locator('#cover-mail-to').fill('recipient@example.test');
  await page.locator('#cover-mail-cc').fill('copy@example.test');
  await page.locator('#cover-mail-attach-file-input').setInputFiles({
    name: 'extra.txt', mimeType: 'text/plain', buffer: Buffer.from('Extra attachment'),
  });
  await page.waitForFunction(() => document.getElementById('cover-mail-modal')._userAttachments.length === 2);
  await page.locator('#cover-mail-claim-form-select').selectOption('Test-Claim.pdf');
  await page.locator('#cover-mail-attach-claim-form-btn').click();

  let failPdf = true;
  const selectedRequests = [];
  await page.route('**/confirmation-of-cover-pdf?*', async route => {
    selectedRequests.push(new URL(route.request().url()).searchParams.getAll('territorial_limits'));
    if (failPdf) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Test failure"}' });
    return route.continue();
  });
  await page.getByRole('button', { name: 'Send Email', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('cover-mail-error').textContent.includes('Failed to generate'));
  assert.equal(sentEmails.length, 0);
  assert.equal(await page.getByRole('checkbox', { name: 'Namibia', exact: true }).isDisabled(), false);

  failPdf = false;
  await page.evaluate(() => Promise.all([Assets._sendCoverMail(1), Assets._sendCoverMail(1)]));
  assert.equal(sentEmails.length, 1);
  assert.deepEqual(selectedRequests.at(-1), ['Namibia', COUNTRIES[7]]);
  const payload = sentEmails[0];
  assert.deepEqual(payload.cc, ['copy@example.test']);
  assert.deepEqual(payload.claim_form_names, ['Test-Claim.pdf']);
  assert.equal(payload.user_attachments.length, 2);
  assert.equal(payload.user_attachments[1].filename, 'extra.txt');
  savePdf('emailed.pdf', { base64: payload.user_attachments[0].content_base64 });
  assert.equal(await page.locator('#cover-mail-modal').count(), 0);

  await openModal();
  await page.locator('#cover-mail-to').fill('recipient@example.test');
  await page.locator('#cover-mail-territorial-limits summary').click();
  await page.getByRole('checkbox', { name: 'South Africa', exact: true }).check();
  await page.getByRole('checkbox', { name: 'South Africa', exact: true }).uncheck();
  textCalls = [];
  await page.getByRole('button', { name: 'Send Email', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('cover-mail-modal'));
  assert.equal(sentEmails.length, 2);
  assert.ok(!textCalls.includes('Territorial Limits:'));

  await openModal();
  await page.locator('#cover-mail-to').fill('recipient@example.test');
  await page.locator('[data-remove-file="0"]').click();
  await page.getByRole('button', { name: 'Send Email', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('cover-mail-modal'));
  assert.equal(sentEmails.length, 3);
  assert.equal(sentEmails[2].user_attachments, undefined);

  const signaturePath = path.join(testDir, 'signature.png');
  const signatureBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 200;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = '#1a5276';
    ctx.font = 'italic 24px serif';
    ctx.fillText('Test Broker', 20, 100);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(signaturePath, Buffer.from(signatureBase64, 'base64'));
  t.mock.method(require('../server/lib/email-signature'), 'resolveSignaturePath', () => ({ fullPath: signaturePath }));
  const originalAddPage = PDFDocument.prototype.addPage;
  let pageCount = 0;
  t.mock.method(PDFDocument.prototype, 'addPage', function (...args) {
    pageCount++;
    return originalAddPage.apply(this, args);
  });
  const signedResponse = await fetch(pdfUrl(COUNTRIES));
  assert.equal(signedResponse.status, 200);
  savePdf('all-with-signature.pdf', await signedResponse.json());
  assert.equal(pageCount, 2);
});
