const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const projectRoot = path.join(__dirname, '..');
const outputDir = path.join(projectRoot, 'client', 'public', 'claim_forms');
const logoPath = path.join(projectRoot, 'client', 'public', 'logo.png');

const COLORS = {
  ink: '#17212b',
  muted: '#5f6f82',
  blue: '#1a5276',
  blueDark: '#123a59',
  border: '#9fb1c1',
  field: '#fbfdff',
  band: '#eaf2f8',
};

function safeFieldName(prefix, name) {
  return `${prefix}_${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
}

function createFormWriter(doc, prefix, title) {
  const left = doc.page.margins.left;
  const right = doc.page.margins.right;
  const usableWidth = doc.page.width - left - right;
  let y = 0;
  // Tracks whether the current (last) page has had a real form section/field
  // rendered on it. ensure() resets this when it adds a new page; the section
  // helpers set it to true once they've drawn. After build we trim a trailing
  // page that only got the header (no real content) — this is what produced
  // the spurious blank pages at the bottom of the generated forms.
  let lastPageHasContent = false;

  function header() {
    doc.fillColor(COLORS.ink);
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, left, 32, { width: 82 });
    }
    doc.font('Helvetica-Bold').fontSize(15).fillColor(COLORS.blueDark)
      .text(title, left + 96, 34, { width: usableWidth - 96 });
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
      .text('Fillable PDF claim form. Complete electronically, save, and return with supporting documents.',
        left + 96, 57, { width: usableWidth - 96 });
    doc.moveTo(left, 84).lineTo(left + usableWidth, 84).strokeColor(COLORS.border).lineWidth(0.8).stroke();
    y = 100;
  }

  function footer() {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const footerY = doc.page.height - 34;
      doc.moveTo(left, footerY - 8).lineTo(left + usableWidth, footerY - 8).strokeColor('#d6dee6').lineWidth(0.5).stroke();
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted)
        .text('Inexpro CRM - claim form template', left, footerY, { width: usableWidth / 2 });
      doc.text(`Page ${i + 1 - range.start} of ${range.count}`, left + usableWidth / 2, footerY, {
        width: usableWidth / 2,
        align: 'right',
      });
    }
  }

  // Drop any trailing pages that only got their header (no fields/sections).
  function trim() {
    while (!lastPageHasContent && doc._pageBuffer && doc._pageBuffer.length > 1) {
      doc._pageBuffer.pop();
      doc.page = doc._pageBuffer[doc._pageBuffer.length - 1];
      // Conservatively assume the new "last" page has content — if not, the
      // next iteration will pop it too.
      lastPageHasContent = true;
    }
  }

  function ensure(height) {
    if (y + height > doc.page.height - doc.page.margins.bottom - 18) {
      doc.addPage();
      header();
      lastPageHasContent = false;
    }
  }
  function mark() { lastPageHasContent = true; }

  function section(label) {
    ensure(34);
    doc.rect(left, y, usableWidth, 18).fillColor(COLORS.blue).fill();
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff')
      .text(label, left + 8, y + 5, { width: usableWidth - 16 });
    y += 28;
    mark();
  }

  function note(text) {
    doc.font('Helvetica').fontSize(8);
    const h = doc.heightOfString(text, { width: usableWidth }) + 10;
    ensure(h);
    doc.fillColor(COLORS.muted)
      .text(text, left, y, { width: usableWidth });
    y += h;
    mark();
  }

  function drawTextField(fieldName, x, top, w, h, opts = {}) {
    doc.rect(x, top, w, h).fillColor(COLORS.field).fill();
    doc.rect(x, top, w, h).strokeColor(COLORS.border).lineWidth(0.7).stroke();
    doc.font('Helvetica');
    doc.formText(safeFieldName(prefix, fieldName), x, top, w, h, {
      fontSize: 9,
      multiline: !!opts.multiline,
      required: !!opts.required,
      backgroundColor: COLORS.field,
      borderColor: COLORS.border,
      align: opts.align || 'left',
    });
  }

  function field(label, name, opts = {}) {
    const h = opts.height || 19;
    ensure(h + 20);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.ink)
      .text(label, left, y, { width: usableWidth });
    y += 10;
    drawTextField(name, left, y, usableWidth, h, opts);
    y += h + 9;
    mark();
  }

  function pair(a, b) {
    const gap = 14;
    const colW = (usableWidth - gap) / 2;
    const h = Math.max(a.height || 19, b.height || 19);
    ensure(h + 20);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.ink)
      .text(a.label, left, y, { width: colW })
      .text(b.label, left + colW + gap, y, { width: colW });
    y += 10;
    drawTextField(a.name, left, y, colW, h, a);
    drawTextField(b.name, left + colW + gap, y, colW, h, b);
    y += h + 9;
    mark();
  }

  function triple(fields) {
    const gap = 12;
    const colW = (usableWidth - gap * 2) / 3;
    ensure(39);
    fields.forEach((f, idx) => {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.ink)
        .text(f.label, left + idx * (colW + gap), y, { width: colW });
    });
    y += 10;
    fields.forEach((f, idx) => drawTextField(f.name, left + idx * (colW + gap), y, colW, f.height || 19, f));
    y += 28;
    mark();
  }

  function area(label, name, height = 58) {
    field(label, name, { height, multiline: true });
  }

  function checkboxes(label, items, columns = 2) {
    const colW = usableWidth / columns;
    const rows = Math.ceil(items.length / columns);
    ensure(20 + rows * 18);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.ink)
      .text(label, left, y, { width: usableWidth });
    y += 13;
    items.forEach((item, idx) => {
      const row = Math.floor(idx / columns);
      const col = idx % columns;
      const x = left + col * colW;
      const cy = y + row * 18;
      doc.rect(x, cy, 11, 11).strokeColor(COLORS.border).lineWidth(0.7).stroke();
      doc.formCheckbox(safeFieldName(prefix, item.name || item), x, cy, 11, 11, {
        borderColor: COLORS.border,
        backgroundColor: '#ffffff',
      });
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.ink)
        .text(item.label || item, x + 16, cy - 1, { width: colW - 18 });
    });
    y += rows * 18 + 8;
    mark();
  }

  function declaration() {
    section('Declaration and Signature');
    note('I declare that the information provided in this form is true and complete to the best of my knowledge. I authorise the broker, insurer, assessor, and related service providers to process and share the information needed to assess this claim.');
    checkboxes('Declaration confirmations', [
      'I have checked that the details above are correct',
      'I have attached the available supporting documents',
      'I consent to claim-related personal information processing',
    ], 1);
    pair(
      { label: 'Signature', name: 'signature', height: 24 },
      { label: 'Date', name: 'signature_date' },
    );
    pair(
      { label: 'Capacity / relationship to insured', name: 'capacity' },
      { label: 'Broker / staff member assisting', name: 'broker_staff' },
    );
  }

  function spacer(height = 8) {
    ensure(height);
    y += height;
  }

  header();
  return { section, note, field, pair, triple, area, checkboxes, declaration, spacer, footer, trim };
}

function addCommonClaimDetails(f) {
  f.section('Client / Insured Details');
  f.pair(
    { label: 'Insured name', name: 'insured_name', required: true },
    { label: 'ID / registration number', name: 'id_or_registration' },
  );
  f.pair(
    { label: 'Contact person', name: 'contact_person' },
    { label: 'Contact number', name: 'contact_number' },
  );
  f.pair(
    { label: 'Email address', name: 'email_address' },
    { label: 'Preferred contact method', name: 'preferred_contact_method' },
  );
  f.area('Physical address', 'physical_address', 42);

  f.section('Policy and Claim Details');
  f.pair(
    { label: 'Policy number', name: 'policy_number', required: true },
    { label: 'Insurer', name: 'insurer' },
  );
  f.pair(
    { label: 'Policy section', name: 'policy_section' },
    { label: 'Claim number (if known)', name: 'claim_number' },
  );
  f.triple([
    { label: 'Date of loss', name: 'date_of_loss' },
    { label: 'Time of loss', name: 'time_of_loss' },
    { label: 'Date reported', name: 'date_reported' },
  ]);
  f.field('Incident location', 'incident_location');
  f.area('Brief description of incident', 'incident_description', 66);

  f.section('Police / Authority Details');
  f.pair(
    { label: 'Was the incident reported?', name: 'reported_to_authorities' },
    { label: 'Date reported to authority', name: 'authority_report_date' },
  );
  f.pair(
    { label: 'Police station / authority', name: 'police_station' },
    { label: 'Case / reference number', name: 'case_number' },
  );
}

function addPaymentAndDocuments(f, extraDocuments = []) {
  f.section('Claim Amount and Payment Details');
  f.pair(
    { label: 'Estimated claim amount', name: 'estimated_claim_amount' },
    { label: 'VAT number (if applicable)', name: 'vat_number' },
  );
  f.pair(
    { label: 'Account holder', name: 'account_holder' },
    { label: 'Bank name', name: 'bank_name' },
  );
  f.pair(
    { label: 'Account number', name: 'account_number' },
    { label: 'Branch code', name: 'branch_code' },
  );

  f.section('Supporting Documents Checklist');
  f.checkboxes('Attach where available', [
    'Copy of ID / registration documents',
    'Policy schedule',
    'Photos of damage or loss',
    'Quotes / invoices / proof of value',
    'Police report or case number',
    'Proof of ownership',
    ...extraDocuments,
  ], 2);
  f.area('Additional document notes', 'additional_document_notes', 44);
}

function buildMotorForm(f) {
  addCommonClaimDetails(f);
  f.section('Vehicle Details');
  f.pair(
    { label: 'Vehicle registration', name: 'vehicle_registration', required: true },
    { label: 'Make and model', name: 'vehicle_make_model' },
  );
  f.triple([
    { label: 'Year', name: 'vehicle_year' },
    { label: 'VIN / chassis number', name: 'vin_number' },
    { label: 'Odometer reading', name: 'odometer_reading' },
  ]);
  f.pair(
    { label: 'Finance house', name: 'finance_house' },
    { label: 'Vehicle use at time of loss', name: 'vehicle_use' },
  );
  f.section('Driver Details');
  f.pair(
    { label: 'Driver full name', name: 'driver_name' },
    { label: 'Driver ID number', name: 'driver_id_number' },
  );
  f.pair(
    { label: 'Driver licence number', name: 'driver_licence_number' },
    { label: 'Driver contact number', name: 'driver_contact_number' },
  );
  f.pair(
    { label: 'Relationship to insured', name: 'driver_relationship' },
    { label: 'Purpose of trip', name: 'purpose_of_trip' },
  );
  f.section('Accident / Damage Details');
  f.checkboxes('Incident type', [
    'Accident',
    'Theft / hijacking',
    'Windscreen / glass',
    'Fire',
    'Hail / storm',
    'Other',
  ], 3);
  f.pair(
    { label: 'Road conditions', name: 'road_conditions' },
    { label: 'Weather conditions', name: 'weather_conditions' },
  );
  f.area('Describe how the damage occurred', 'damage_circumstances', 70);
  f.area('Third party details, witnesses, towing, and repairer details', 'third_party_and_repair_details', 70);
  addPaymentAndDocuments(f, [
    'Driver licence',
    'Third party details',
    'Tow-in slip',
    'Repair quote',
  ]);
  f.declaration();
}

function buildPropertyForm(f) {
  addCommonClaimDetails(f);
  f.section('Property Details');
  f.field('Risk address / premises where loss occurred', 'risk_address');
  f.pair(
    { label: 'Property owner', name: 'property_owner' },
    { label: 'Occupant / tenant', name: 'occupant_tenant' },
  );
  f.pair(
    { label: 'Alarm armed?', name: 'alarm_armed' },
    { label: 'Security company', name: 'security_company' },
  );
  f.section('Loss / Damage Details');
  f.checkboxes('Cause of loss', [
    'Fire',
    'Storm / flood',
    'Burst pipe',
    'Theft / burglary',
    'Accidental damage',
    'Power surge',
    'Malicious damage',
    'Other',
  ], 2);
  f.area('Items or property damaged / stolen', 'damaged_or_stolen_items', 82);
  f.area('Full description of damage and immediate action taken', 'damage_description', 82);
  f.pair(
    { label: 'Emergency repairs completed?', name: 'emergency_repairs' },
    { label: 'Repairer / supplier', name: 'repairer_supplier' },
  );
  addPaymentAndDocuments(f, [
    'Inventory of items',
    'Alarm activation report',
    'Repair quote',
    'Purchase invoices',
  ]);
  f.declaration();
}

function buildLiabilityForm(f) {
  addCommonClaimDetails(f);
  f.section('Claimant / Third Party Details');
  f.pair(
    { label: 'Claimant name', name: 'claimant_name' },
    { label: 'Claimant contact number', name: 'claimant_contact_number' },
  );
  f.pair(
    { label: 'Claimant email', name: 'claimant_email' },
    { label: 'Claimant ID / registration', name: 'claimant_id_or_registration' },
  );
  f.area('Claimant address', 'claimant_address', 42);
  f.section('Incident and Allegation Details');
  f.checkboxes('Nature of claim', [
    'Bodily injury',
    'Property damage',
    'Defective workmanship',
    'Defective product',
    'Professional / advice concern',
    'Other',
  ], 2);
  f.area('Describe the allegation and circumstances', 'liability_circumstances', 82);
  f.area('Witnesses and employee / contractor involved', 'witnesses_and_involved_parties', 64);
  f.pair(
    { label: 'Attorney / representative details', name: 'attorney_details' },
    { label: 'Amount claimed (if known)', name: 'amount_claimed' },
  );
  addPaymentAndDocuments(f, [
    'Letter of demand / summons',
    'Witness statements',
    'Incident report',
    'Photos / CCTV references',
  ]);
  f.declaration();
}

function buildGitForm(f) {
  addCommonClaimDetails(f);
  f.section('Goods In Transit Details');
  f.pair(
    { label: 'Consignment owner', name: 'consignment_owner' },
    { label: 'Invoice / waybill number', name: 'invoice_waybill_number' },
  );
  f.pair(
    { label: 'Goods description', name: 'goods_description' },
    { label: 'Goods value', name: 'goods_value' },
  );
  f.pair(
    { label: 'Dispatch location', name: 'dispatch_location' },
    { label: 'Destination', name: 'destination' },
  );
  f.triple([
    { label: 'Dispatch date', name: 'dispatch_date' },
    { label: 'Delivery due date', name: 'delivery_due_date' },
    { label: 'Loss discovered date', name: 'loss_discovered_date' },
  ]);
  f.section('Carrier / Vehicle Details');
  f.pair(
    { label: 'Carrier / transport company', name: 'carrier_name' },
    { label: 'Vehicle registration', name: 'vehicle_registration' },
  );
  f.pair(
    { label: 'Driver name', name: 'driver_name' },
    { label: 'Driver contact number', name: 'driver_contact_number' },
  );
  f.checkboxes('Incident type', [
    'Theft',
    'Hijacking',
    'Accident',
    'Short delivery',
    'Damage in transit',
    'Non-delivery',
  ], 3);
  f.area('Describe the transit route, loss, and discovery circumstances', 'transit_loss_details', 82);
  addPaymentAndDocuments(f, [
    'Waybill / delivery note',
    'Supplier invoice',
    'Carrier statement',
    'Photos of packaging / damage',
  ]);
  f.declaration();
}

function buildDisclosureForm(f) {
  f.section('Disclosure and Consent Details');
  f.note('This disclosure is completed for claim administration. It records client acknowledgement, consent, and authorisation for processing claim information.');
  f.pair(
    { label: 'Client / insured name', name: 'client_name', required: true },
    { label: 'ID / registration number', name: 'id_or_registration' },
  );
  f.pair(
    { label: 'Policy number', name: 'policy_number' },
    { label: 'Claim number (if known)', name: 'claim_number' },
  );
  f.pair(
    { label: 'Claim type', name: 'claim_type' },
    { label: 'Disclosure date', name: 'disclosure_date' },
  );
  f.area('Claim summary', 'claim_summary', 66);
  f.section('Client Acknowledgements');
  f.checkboxes('Please tick each acknowledgement', [
    'I understand that the insurer may request additional claim information',
    'I authorise Inexpro to share claim information with the insurer and service providers',
    'I confirm that information supplied must be true, accurate, and complete',
    'I consent to claim-related personal information processing under POPIA',
    'I understand that incorrect information may affect the outcome of the claim',
  ], 1);
  f.area('Special instructions, limitations, or additional consent notes', 'consent_notes', 70);
  f.section('Broker Disclosure');
  f.pair(
    { label: 'Broker / representative name', name: 'broker_name' },
    { label: 'FSP / representative code', name: 'representative_code' },
  );
  f.area('Advice / service notes provided to client', 'service_notes', 60);
  f.declaration();
}

const forms = [
  {
    filename: 'Disclosure.pdf',
    prefix: 'disclosure',
    title: 'INEXPRO CLAIM DISCLOSURE AND CONSENT',
    build: buildDisclosureForm,
  },
  {
    filename: 'GIT Claim.pdf',
    prefix: 'git',
    title: 'GOODS IN TRANSIT CLAIM FORM',
    build: buildGitForm,
  },
  {
    filename: 'Motor Vehicle Own Damage Claim.pdf',
    prefix: 'motor',
    title: 'MOTOR VEHICLE OWN DAMAGE CLAIM FORM',
    build: buildMotorForm,
  },
  {
    filename: 'Property Claim.pdf',
    prefix: 'property',
    title: 'PROPERTY CLAIM FORM',
    build: buildPropertyForm,
  },
  {
    filename: 'Public Liability Claim.pdf',
    prefix: 'liability',
    title: 'PUBLIC LIABILITY CLAIM FORM',
    build: buildLiabilityForm,
  },
];

async function writePdf(template) {
  const doc = new PDFDocument({
    size: 'A4',
    bufferPages: true,
    margins: { top: 40, right: 42, bottom: 44, left: 42 },
    info: {
      Title: template.title,
      Author: 'Inexpro CRM',
      Subject: 'Fillable claim form',
      Keywords: 'claim, insurance, fillable, PDF',
    },
  });

  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));

  doc.font('Helvetica');
  doc.initForm();

  const form = createFormWriter(doc, template.prefix, template.title);

  // Suppress pdfkit's automatic text-flow pagination during build AND footer.
  // We lay out every block at absolute (x, y) and paginate ourselves via
  // ensure(). The built-in continueOnNewPage was firing on every long note/
  // label, AND on the footer (which writes below pdfkit's maxY), generating
  // a cascade of trailing blank pages.
  const _origContinue = doc.continueOnNewPage;
  doc.continueOnNewPage = function () { return this; };
  try {
    template.build(form);
    // Drop any trailing pages that only got their decorative header.
    form.trim();
    form.footer();
  } finally {
    doc.continueOnNewPage = _origContinue;
  }

  const finished = new Promise((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });
  doc.end();
  await finished;

  const buffer = Buffer.concat(chunks);
  const outPath = path.join(outputDir, template.filename);
  fs.writeFileSync(outPath, buffer);
  return { filename: template.filename, bytes: buffer.length };
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const written = [];
  for (const template of forms) {
    written.push(await writePdf(template));
  }
  written.forEach(file => {
    console.log(`${file.filename} (${file.bytes} bytes)`);
  });
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
