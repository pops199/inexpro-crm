'use strict';

// Per-account detail report PDF — same letterhead/footer style as the
// other report renderers. Mirrors the account detail page: account
// details, addresses, relationships, compliance, reviews, notes —
// followed by tab content (Contacts, Policies, Assets, Claims,
// Engagements, Reviews, Complaints, Records of Advice, Sections,
// Documents). Timeline is skipped per spec.

const {
  createReportPdf, dateStr, dash, yesNo,
} = require('./inexpro-pdf-helpers');

async function renderAccountReportPdf(data) {
  const a            = data.account      || {};
  const contacts     = data.contacts     || [];
  const policies     = data.policies     || [];
  const assets       = data.assets       || [];
  const claims       = data.claims       || [];
  const engagements  = data.engagements  || [];
  const reviews      = data.reviews      || [];
  const complaints   = data.complaints   || [];
  const adviceRecs   = data.adviceRecs   || [];
  const sections     = data.sections     || [];
  const documents    = data.documents    || [];

  const { h, finalise } = createReportPdf();

  // ═══ TITLE BLOCK ═════════════════════════════════════════════
  h.titleBlock('Account Report', a.account_name || '—');
  h.labelValueRow('Registration Number', dash(a.registration_number));
  h.labelValueRow('VAT Number',          dash(a.vat_number));
  h.labelValueRow('Industry',            dash(a.industry));
  h.labelValueRow('Main Contact',        dash(a.main_contact_name));

  // ═══ ACCOUNT DETAILS ═════════════════════════════════════════
  h.sectionHead('Account Details');
  h.labelValueRow('Account Name',         dash(a.account_name));
  h.labelValueRow('Registration Number',  dash(a.registration_number));
  h.labelValueRow('VAT Number',           dash(a.vat_number));
  h.labelValueRow('Business Type',        dash(a.business_type));
  h.labelValueRow('Industry',             dash(a.industry));
  h.labelValueRow('No. of Employees',     a.number_of_employees != null ? String(a.number_of_employees) : '—');
  h.labelValueRow('Annual Turnover Band', dash(a.annual_turnover_band));

  // ═══ PHYSICAL ADDRESS ═════════════════════════════════════════
  h.sectionHead('Physical Address');
  h.labelValueRow('Street Address',     dash(a.phys_street_address));
  h.labelValueRow('Complex / Building', dash(a.phys_complex_building));
  h.labelValueRow('Suburb',             dash(a.phys_suburb));
  h.labelValueRow('City',               dash(a.phys_city));
  h.labelValueRow('Province',           dash(a.phys_province));
  h.labelValueRow('Postal Code',        dash(a.phys_postal_code));
  h.labelValueRow('Country',            dash(a.phys_country));
  if (a.phys_gps_lat) h.labelValueRow('GPS Latitude',  a.phys_gps_lat);
  if (a.phys_gps_lng) h.labelValueRow('GPS Longitude', a.phys_gps_lng);

  // ═══ POSTAL ADDRESS ═══════════════════════════════════════════
  h.sectionHead('Postal Address');
  h.labelValueRow('Street Address',     dash(a.post_street_address));
  h.labelValueRow('Complex / Building', dash(a.post_complex_building));
  h.labelValueRow('Suburb',             dash(a.post_suburb));
  h.labelValueRow('City',               dash(a.post_city));
  h.labelValueRow('Province',           dash(a.post_province));
  h.labelValueRow('Postal Code',        dash(a.post_postal_code));
  h.labelValueRow('Country',            dash(a.post_country));

  // ═══ RELATIONSHIPS & ASSIGNMENTS ══════════════════════════════
  h.sectionHead('Relationships & Assignments');
  h.labelValueRow('Main Contact',    dash(a.main_contact_name));
  h.labelValueRow('Assigned Broker', dash(a.broker_full_name));
  h.labelValueRow('Assigned Admin',  dash(a.admin_full_name));

  // ═══ COMPLIANCE & STATUS ══════════════════════════════════════
  h.sectionHead('Compliance & Status');
  h.labelValueRow('Client Status',          dash(a.client_status));
  h.labelValueRow('POPIA Status',           dash(a.popia_status));
  h.labelValueRow('FICA Status',            dash(a.fica_status_derived || a.fica_status));
  h.labelValueRow('Date Became Client',     dateStr(a.date_became_client));
  h.labelValueRow('Data Processing Basis',  dash(a.data_processing_basis));
  h.labelValueRow('POPIA Consent Date',     dateStr(a.popia_consent_date));
  h.labelValueRow('Retention Expires',      dateStr(a.retention_expiry_date));

  // ═══ REVIEWS ══════════════════════════════════════════════════
  h.sectionHead('Reviews');
  h.labelValueRow('Last Review Date', dateStr(a.last_review_date));
  h.labelValueRow('Next Review Date', dateStr(a.next_review_date));

  // ═══ NOTES ════════════════════════════════════════════════════
  if (a.notes) {
    h.sectionHead('Notes');
    h.paragraph('Notes', a.notes);
  }

  // ═══ TAB: CONTACTS ════════════════════════════════════════════
  h.sectionHead('Contacts');
  if (!contacts.length) {
    h.emptyLine('No contacts linked to this account.');
  } else {
    const cols = [
      { label: 'Name',  width: 165, fmt: r => [r.first_name, r.last_name].filter(Boolean).join(' ') },
      { label: 'Type',  key: 'contact_type', width: 120 },
      { label: 'Email', key: 'email',        width: 130 },
      { label: 'Phone', key: 'mobile',       width: 80 },
    ];
    h.tableHeader(cols);
    contacts.forEach(r => h.tableRow(cols, r));
  }

  // ═══ TAB: POLICIES ════════════════════════════════════════════
  h.sectionHead('Policies');
  if (!policies.length) {
    h.emptyLine('No policies on this account.');
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
    assets.forEach(r => h.tableRow(cols, r));
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
    engagements.forEach(r => h.tableRow(cols, r));
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
      { label: 'Number',   key: 'advice_record_number', width: 95 },
      { label: 'Type',     key: 'advice_type',          width: 105 },
      { label: 'Date',     width: 75, fmt: r => dateStr(r.advice_date) },
      { label: 'Decision', key: 'client_decision',      width: 95 },
      { label: 'Adviser',  key: 'broker_full_name',     width: 125 },
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

module.exports = { renderAccountReportPdf };
