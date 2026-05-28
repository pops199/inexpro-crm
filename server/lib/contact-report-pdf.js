'use strict';

// Per-contact detail report PDF — same letterhead/footer style as the
// claim/policy reports. Mirrors the contact detail page: personal,
// classification, compliance, assignments, flags, reviews, addresses,
// notes — followed by tab content (Policies, Claims, Assets,
// Engagements, Reviews, Complaints, Records of Advice, Sections,
// Documents). Timeline is skipped per spec.

const {
  createReportPdf, dateStr, dash, yesNo,
} = require('./inexpro-pdf-helpers');

async function renderContactReportPdf(data) {
  const c            = data.contact      || {};
  const policies     = data.policies     || [];
  const claims       = data.claims       || [];
  const assets       = data.assets       || [];
  const engagements  = data.engagements  || [];
  const reviews      = data.reviews      || [];
  const complaints   = data.complaints   || [];
  const adviceRecs   = data.adviceRecs   || [];
  const sections     = data.sections     || [];
  const documents    = data.documents    || [];

  const { h, finalise } = createReportPdf();

  // ═══ TITLE BLOCK ═════════════════════════════════════════════
  const fullName = [c.title, c.first_name, c.last_name].filter(Boolean).join(' ') || c.first_name || c.last_name || '—';
  h.titleBlock('Contact Report', fullName);
  h.labelValueRow('Contact Type',   dash(c.contact_type));
  h.labelValueRow('Client Status',  dash(c.contact_status));
  h.labelValueRow('Email',          dash(c.email));
  h.labelValueRow('Mobile',         dash(c.mobile));

  // ═══ PERSONAL DETAILS ════════════════════════════════════════
  h.sectionHead('Personal Details');
  h.labelValueRow('Title',           dash(c.title));
  h.labelValueRow('First Name',      dash(c.first_name));
  h.labelValueRow('Last Name',       dash(c.last_name));
  h.labelValueRow('Gender',          dash(c.gender));
  h.labelValueRow('Email',           dash(c.email));
  h.labelValueRow('Mobile',          dash(c.mobile));
  h.labelValueRow('Work Number',     dash(c.work_number));
  h.labelValueRow('Date of Birth',   dateStr(c.date_of_birth));
  // SA ID / Passport are encrypted at rest — show only the masked form
  // already on the row (the API returns it as the unencrypted preview).
  if (c.sa_id_number)        h.labelValueRow('SA ID Number',    c.sa_id_number);
  if (c.passport_number)     h.labelValueRow('Passport Number', c.passport_number);
  if (c.alternative_id_type) h.labelValueRow('Alternative ID Type', c.alternative_id_type);
  h.labelValueRow('Language',        dash(c.language));
  h.labelValueRow('Marital Status',  dash(c.marital_status));
  h.labelValueRow('Occupation',      dash(c.occupation));
  h.labelValueRow('Employer',        dash(c.employer));
  h.labelValueRow('Income Band',     dash(c.income_band));
  h.labelValueRow('Nationality',     dash(c.nationality));
  h.labelValueRow('Next of Kin',     dash(c.next_of_kin));
  h.labelValueRow('Preferred Comms', dash(c.preferred_communication));

  // ═══ DRIVERS LICENSE (if any) ════════════════════════════════
  if (c.dl_codes || c.dl_restrictions || c.dl_first_issue_date) {
    h.sectionHead('Drivers License');
    h.labelValueRow('Code',             dash(c.dl_codes));
    h.labelValueRow('Restrictions',     dash(c.dl_restrictions));
    h.labelValueRow('First Issue Date', dateStr(c.dl_first_issue_date));
  }

  // ═══ CLASSIFICATION ═══════════════════════════════════════════
  h.sectionHead('Classification');
  h.labelValueRow('Contact Type',         dash(c.contact_type));
  h.labelValueRow('Client Category',      dash(c.client_category));
  h.labelValueRow('Client Segment',       dash(c.client_segment));
  h.labelValueRow('Contact Status',       dash(c.contact_status));
  h.labelValueRow('Existing Client',      yesNo(c.existing_client));
  h.labelValueRow('Date Became Client',   dateStr(c.date_became_client));
  h.labelValueRow('Source of Lead',       dash(c.source_of_lead));

  // ═══ COMPLIANCE ═══════════════════════════════════════════════
  const isSupplier = c.contact_type === 'Supplier' && c.client_category === 'Supplier';
  h.sectionHead('Compliance Snapshot');
  if (isSupplier) {
    h.paragraph('Note',
      'This contact is classified as a Supplier. POPIA and FICA do not apply — supplier records are excluded from compliance reporting.');
  } else {
    h.labelValueRow('POPIA Status',           dash(c.popia_status));
    h.labelValueRow('POPIA Consent Date',     dateStr(c.popia_consent_date));
    h.labelValueRow('Data Processing Basis',  dash(c.data_processing_basis));
    h.labelValueRow('FICA Status',            dash(c.fica_status_derived || c.fica_status));
    if (c.retention_expiry_date) h.labelValueRow('Retention Expires', dateStr(c.retention_expiry_date));
  }

  // ═══ ASSIGNMENTS ══════════════════════════════════════════════
  h.sectionHead('Assignments');
  h.labelValueRow('Assigned Broker', dash(c.broker_full_name));
  h.labelValueRow('Assigned Admin',  dash(c.admin_full_name));

  // ═══ FLAGS ════════════════════════════════════════════════════
  h.sectionHead('Flags');
  h.labelValueRow('Conduct Risk Flag',       yesNo(c.conduct_risk_flag));
  h.labelValueRow('Primary Client Record',   yesNo(c.primary_client_record));
  if (c.conduct_risk_notes) h.paragraph('Conduct Risk Notes', c.conduct_risk_notes);

  // ═══ REVIEWS ══════════════════════════════════════════════════
  h.sectionHead('Reviews');
  h.labelValueRow('Last Review Date', dateStr(c.last_review_date));
  h.labelValueRow('Next Review Date', dateStr(c.next_review_date));

  // ═══ PHYSICAL ADDRESS ═════════════════════════════════════════
  h.sectionHead('Physical Address');
  h.labelValueRow('Street Address',     dash(c.phys_street_address));
  h.labelValueRow('Complex / Building', dash(c.phys_complex_building));
  h.labelValueRow('Suburb',             dash(c.phys_suburb));
  h.labelValueRow('City',               dash(c.phys_city));
  h.labelValueRow('Province',           dash(c.phys_province));
  h.labelValueRow('Postal Code',        dash(c.phys_postal_code));
  h.labelValueRow('Country',            dash(c.phys_country));
  if (c.phys_gps_lat) h.labelValueRow('GPS Latitude',  c.phys_gps_lat);
  if (c.phys_gps_lng) h.labelValueRow('GPS Longitude', c.phys_gps_lng);

  // ═══ POSTAL ADDRESS ═══════════════════════════════════════════
  h.sectionHead('Postal Address');
  h.labelValueRow('Street Address',     dash(c.post_street_address));
  h.labelValueRow('Complex / Building', dash(c.post_complex_building));
  h.labelValueRow('Suburb',             dash(c.post_suburb));
  h.labelValueRow('City',               dash(c.post_city));
  h.labelValueRow('Province',           dash(c.post_province));
  h.labelValueRow('Postal Code',        dash(c.post_postal_code));
  h.labelValueRow('Country',            dash(c.post_country));

  // ═══ NOTES ════════════════════════════════════════════════════
  if (c.notes) {
    h.sectionHead('Notes');
    h.paragraph('Notes', c.notes);
  }

  // ═══ TAB: POLICIES ════════════════════════════════════════════
  h.sectionHead('Policies');
  if (!policies.length) {
    h.emptyLine('No policies linked to this contact.');
  } else {
    const cols = [
      { label: 'Policy Name', key: 'policy_name',   width: 140 },
      { label: 'Number',      key: 'policy_number', width: 90 },
      { label: 'Insurer',     key: 'insurer',       width: 105 },
      { label: 'Status',      key: 'policy_status', width: 70 },
      { label: 'Renewal', width: 90, fmt: p => dateStr(p.renewal_date) },
    ];
    h.tableHeader(cols);
    policies.forEach(p => h.tableRow(cols, p));
  }

  // ═══ TAB: CLAIMS ══════════════════════════════════════════════
  h.sectionHead('Claims');
  if (!claims.length) {
    h.emptyLine('No claims on file.');
  } else {
    const cols = [
      { label: 'Claim Number', key: 'claim_number', width: 110 },
      { label: 'Type',         key: 'claim_type',   width: 90 },
      { label: 'Status',       key: 'claim_status', width: 90 },
      { label: 'Date',         width: 90, fmt: cl => dateStr(cl.claim_date) },
      { label: 'Policy',       key: 'policy_number', width: 115 },
    ];
    h.tableHeader(cols);
    claims.forEach(cl => h.tableRow(cols, cl));
  }

  // ═══ TAB: ASSETS ══════════════════════════════════════════════
  h.sectionHead('Assets');
  if (!assets.length) {
    h.emptyLine('No assets linked.');
  } else {
    const cols = [
      { label: 'Asset',   key: 'asset_name',   width: 160 },
      { label: 'Type',    key: 'asset_type',   width: 85 },
      { label: 'Section', key: 'asset_section', width: 165 },
      { label: 'Status',  key: 'asset_status', width: 85 },
    ];
    h.tableHeader(cols);
    assets.forEach(a => h.tableRow(cols, a));
  }

  // ═══ TAB: ENGAGEMENTS ═════════════════════════════════════════
  h.sectionHead('Engagements');
  if (!engagements.length) {
    h.emptyLine('No engagements logged.');
  } else {
    const cols = [
      { label: 'Engagement', key: 'engagement_name', width: 180 },
      { label: 'Type',       key: 'engagement_type', width: 100 },
      { label: 'Stage',      key: 'stage',           width: 120 },
      { label: 'Decision',   key: 'client_decision', width: 95 },
    ];
    h.tableHeader(cols);
    engagements.forEach(e => h.tableRow(cols, e));
  }

  // ═══ TAB: REVIEWS ═════════════════════════════════════════════
  h.sectionHead('Reviews');
  if (!reviews.length) {
    h.emptyLine('No reviews recorded.');
  } else {
    const cols = [
      { label: 'Review #', key: 'review_number', width: 90 },
      { label: 'Type',     key: 'review_type',   width: 130 },
      { label: 'Date',     width: 80, fmt: r => dateStr(r.review_date) },
      { label: 'Outcome',  key: 'review_outcome', width: 105 },
      { label: 'Next',     width: 90, fmt: r => dateStr(r.next_review_date) },
    ];
    h.tableHeader(cols);
    reviews.forEach(r => h.tableRow(cols, r));
  }

  // ═══ TAB: COMPLAINTS ══════════════════════════════════════════
  h.sectionHead('Complaints');
  if (!complaints.length) {
    h.emptyLine('No complaints recorded.');
  } else {
    const cols = [
      { label: 'Number',     key: 'complaint_number', width: 90 },
      { label: 'Date',       width: 70, fmt: r => dateStr(r.complaint_date) },
      { label: 'Category',   key: 'complaint_category', width: 110 },
      { label: 'Status',     key: 'complaint_status',   width: 80 },
      { label: 'Summary',    key: 'complaint_summary',  width: 145 },
    ];
    h.tableHeader(cols);
    complaints.forEach(r => h.tableRow(cols, r));
  }

  // ═══ TAB: RECORDS OF ADVICE ═══════════════════════════════════
  h.sectionHead('Records of Advice');
  if (!adviceRecs.length) {
    h.emptyLine('No records of advice on file.');
  } else {
    const cols = [
      { label: 'Number',        key: 'advice_record_number', width: 95 },
      { label: 'Type',          key: 'advice_type',          width: 105 },
      { label: 'Date',          width: 75, fmt: r => dateStr(r.advice_date) },
      { label: 'Decision',      key: 'client_decision',      width: 95 },
      { label: 'Adviser',       key: 'broker_full_name',     width: 125 },
    ];
    h.tableHeader(cols);
    adviceRecs.forEach(r => h.tableRow(cols, r));
  }

  // ═══ TAB: SECTIONS ════════════════════════════════════════════
  h.sectionHead('Policy Sections');
  if (!sections.length) {
    h.emptyLine('No policy sections linked.');
  } else {
    const cols = [
      { label: 'Section',     key: 'section_name', width: 180 },
      { label: 'Type',        key: 'section_type', width: 130 },
      { label: 'Policy',      key: 'policy_name',  width: 130 },
      { label: 'Policy #',    key: 'policy_number', width: 55 },
    ];
    h.tableHeader(cols);
    sections.forEach(s => h.tableRow(cols, s));
  }

  // ═══ TAB: DOCUMENTS ═══════════════════════════════════════════
  h.sectionHead('Documents');
  if (!documents.length) {
    h.emptyLine('No documents uploaded.');
  } else {
    const cols = [
      { label: 'File Name',   key: 'original_name',    width: 200 },
      { label: 'Type',        key: 'file_type',        width: 70 },
      { label: 'Uploaded By', key: 'uploaded_by_name', width: 130 },
      { label: 'Date',        width: 95, fmt: d => dateStr(d.uploaded_at) },
    ];
    h.tableHeader(cols);
    documents.forEach(d => h.tableRow(cols, d));
  }

  return finalise();
}

module.exports = { renderContactReportPdf };
