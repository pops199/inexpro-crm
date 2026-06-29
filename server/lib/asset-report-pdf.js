'use strict';

// Per-asset detail report PDF. Mirrors the asset detail page: policy
// summary bar, asset details, insurance financials, address, identification,
// vehicle extras, excess info, additional cover, vehicle risk details,
// financial interest, section-specific details, cover details, links,
// dates, related contacts, notes, linked risk details — followed by the
// tab content (Notes / Amendments, Claims, Documents, Workflows). Skips
// Timeline and Versions per spec.

const {
  createReportPdf, dateStr, dash, yesNo, currencySymbol, fmtMoney, safeJsonArray,
} = require('./inexpro-pdf-helpers');

async function renderAssetReportPdf(data) {
  const a            = data.asset        || {};
  const amendments   = data.amendments   || [];
  const claims       = data.claims       || [];
  const documents    = data.documents    || [];
  const workflows    = data.workflows    || [];
  const riskDetails  = data.riskDetails  || [];

  const sym   = currencySymbol(a.currency);
  const money = v => fmtMoney(v, sym);

  const { h, finalise } = createReportPdf();

  // ═══ TITLE BLOCK ═════════════════════════════════════════════
  h.titleBlock('Asset Report', a.asset_name || '—');
  h.labelValueRow('Asset Type',  dash(a.asset_type));
  h.labelValueRow('Section',     dash(a.asset_section));
  if (a.policy_name) {
    h.labelValueRow('Policy',
      `${a.policy_name}${a.policy_number ? ' (' + a.policy_number + ')' : ''}`);
  }
  if (a.account_name) h.labelValueRow('Account', a.account_name);
  else if (a.contact_name) h.labelValueRow('Contact', a.contact_name);

  // ═══ ASSET DETAILS ════════════════════════════════════════════
  h.sectionHead('Asset Details');
  h.labelValueRow('Asset Name',    dash(a.asset_name));
  if (a.item_number) h.labelValueRow('Item Number', a.item_number);
  h.labelValueRow('Asset Type',    dash(a.asset_type));
  h.labelValueRow('Asset Status',  dash(a.asset_status));
  if (a.asset_section) h.labelValueRow('Asset Section', a.asset_section);
  h.labelValueRow('Asset Value',   money(a.asset_value));
  if (a.mm_number) h.labelValueRow('M&M Number', a.mm_number);
  h.labelValueRow('Currency',      dash(a.currency || 'ZAR'));

  // ═══ INSURANCE FINANCIALS ═════════════════════════════════════
  h.sectionHead('Insurance Financials');
  h.labelValueRow('Premium',                money(a.premium));
  if (a.sum_insured_premium != null)  h.labelValueRow('Sum Insured Premium', money(a.sum_insured_premium));
  if (a.sasria != null)               h.labelValueRow('SASRIA / NASRIA',     money(a.sasria));
  if (a.excess != null)               h.labelValueRow('Basic Excess',        money(a.excess));
  if (a.excess_pct_claim != null)     h.labelValueRow('Excess (% of Claim)', a.excess_pct_claim + '%');
  if (a.excess_pct_insured != null)   h.labelValueRow('Excess (% of Insured)', a.excess_pct_insured + '%');
  if (a.minimum_excess != null)       h.labelValueRow('Minimum Excess',      money(a.minimum_excess));
  if (a.sum_insured != null)          h.labelValueRow('Sum Insured',         money(a.sum_insured));
  if (a.basis_of_cover)               h.labelValueRow('Basis of Cover',      a.basis_of_cover);

  // ═══ ADDRESS (Risk / Building) ═══════════════════════════════
  if (a.address || a.city || a.suburb || a.postal_code) {
    const isVehicle = ['Motor','Goods in Transit','Marine','Aviation'].includes(a.asset_type);
    h.sectionHead(isVehicle ? 'Risk Address' : 'Building Address');
    h.labelValueRow('Street Address',     dash(a.address));
    h.labelValueRow('Complex / Building', dash(a.complex_building));
    h.labelValueRow('Suburb',             dash(a.suburb));
    h.labelValueRow('City / Town',        dash(a.city));
    h.labelValueRow('Province',           dash(a.province));
    h.labelValueRow('Postal Code',        dash(a.postal_code));
    h.labelValueRow('Country',            dash(a.country));
    if (a.gps_lat) h.labelValueRow('GPS Latitude',  a.gps_lat);
    if (a.gps_lng) h.labelValueRow('GPS Longitude', a.gps_lng);
  }

  // ═══ IDENTIFICATION ═══════════════════════════════════════════
  if (a.make || a.model || a.year || a.registration_number || a.vin_number
      || a.engine_number || a.serial_number || a.fleet_number || a.gvm) {
    h.sectionHead('Identification');
    if (a.make)                h.labelValueRow('Make',                a.make);
    if (a.model)               h.labelValueRow('Model',               a.model);
    if (a.year)                h.labelValueRow('Year',                String(a.year));
    if (a.registration_number) h.labelValueRow('Registration Number', a.registration_number);
    if (a.vin_number)          h.labelValueRow('VIN Number',          a.vin_number);
    if (a.engine_number)       h.labelValueRow('Engine Number',       a.engine_number);
    if (a.serial_number)       h.labelValueRow('Serial Number',       a.serial_number);
    if (a.fleet_number)        h.labelValueRow('Fleet Number',        a.fleet_number);
    if (a.gvm)                 h.labelValueRow('GVM (kg)',            a.gvm);
  }

  // ═══ VEHICLE EXTRAS ═══════════════════════════════════════════
  const extras = safeJsonArray(a.vehicle_extras);
  if (extras.length) {
    h.sectionHead('Vehicle Extras');
    const cols = [
      { label: 'Description', key: 'name',   width: 230 },
      { label: 'Amount',  width: 100, align: 'right', fmt: r => money(r.amount) },
      { label: 'Premium', width: 100, align: 'right', fmt: r => money(r.premium) },
      { label: 'In Total', width: 65, align: 'center',
        fmt: r => (r.include_in_total != null ? r.include_in_total : a.extras_in_total) ? 'Yes' : 'No' },
    ];
    h.tableHeader(cols);
    extras.forEach(r => h.tableRow(cols, r));
  }

  // ═══ EXCESS INFO ══════════════════════════════════════════════
  const excesses = safeJsonArray(a.excesses);
  if (excesses.length) {
    h.sectionHead('Excess Info');
    const cols = [
      { label: 'Excess Type', key: 'type', width: 305 },
      { label: 'Amount',  width: 95, align: 'right', fmt: r => money(r.amount) },
      { label: 'Premium', width: 95, align: 'right', fmt: r => money(r.premium) },
    ];
    h.tableHeader(cols);
    excesses.forEach(r => h.tableRow(cols, r));
  }

  // ═══ ADDITIONAL COVER ═════════════════════════════════════════
  const covers = safeJsonArray(a.additional_covers);
  if (covers.length) {
    h.sectionHead('Additional Cover');
    const cols = [
      { label: 'Description', key: 'description', width: 230 },
      { label: 'Cover Amount', width: 100, align: 'right', fmt: r => money(r.cover_amount) },
      { label: 'Premium',      width: 100, align: 'right', fmt: r => money(r.premium) },
      { label: 'In Total',     width: 65,  align: 'center',
        fmt: r => (r.include_in_total != null ? r.include_in_total : true) ? 'Yes' : 'No' },
    ];
    h.tableHeader(cols);
    covers.forEach(r => h.tableRow(cols, r));
  }

  // ═══ VEHICLE RISK DETAILS ═════════════════════════════════════
  if (a.parking_type || a.tracker_fitted || a.tracking_device || a.use_type || a.vehicle_use
      || a.territory || a.regular_driver) {
    h.sectionHead('Vehicle Risk Details');
    if (a.parking_type) {
      const txt = a.parking_type === 'Other' && a.parking_other
        ? `Other — ${a.parking_other}` : a.parking_type;
      h.labelValueRow('Parking', txt);
    }
    if (a.tracker_fitted)  h.labelValueRow('Tracker Device Fitted', a.tracker_fitted);
    if (a.tracking_device) h.labelValueRow('Tracking Device',       a.tracking_device);
    if (a.use_type || a.vehicle_use) h.labelValueRow('Use Type',    a.use_type || a.vehicle_use);
    if (a.territory)       h.labelValueRow('Territory',             a.territory);
    if (a.regular_driver)  h.labelValueRow('Regular Driver',        a.regular_driver);
  }

  // ═══ FINANCIAL INTEREST ═══════════════════════════════════════
  if (a.financial_interest_noted || a.financial_institution
      || a.finance_contract_number || a.contract_expiry_date) {
    h.sectionHead('Financial Interest');
    h.labelValueRow('Financial Interest Noted', yesNo(a.financial_interest_noted));
    if (a.financial_institution)    h.labelValueRow('Financial Institution',    a.financial_institution);
    if (a.finance_contract_number)  h.labelValueRow('Finance Contract Number', a.finance_contract_number);
    if (a.contract_expiry_date)     h.labelValueRow('Contract Expiry Date',    dateStr(a.contract_expiry_date));
  }

  // ═══ COVER DETAILS (cover type / shortfall / conditions / etc.) ════
  if (a.cover_type || a.credit_shortfall || a.conditions || a.extensions || a.exclusions) {
    h.sectionHead('Cover Details');
    if (a.cover_type)       h.labelValueRow('Cover Type',            a.cover_type);
    if (a.credit_shortfall) h.labelValueRow('Credit Shortfall Cover', yesNo(a.credit_shortfall));
    if (a.conditions) h.paragraph('Conditions', a.conditions);
    if (a.extensions) h.paragraph('Extensions', a.extensions);
    if (a.exclusions) h.paragraph('Exclusions', a.exclusions);
  }

  // ═══ LINKS ════════════════════════════════════════════════════
  h.sectionHead('Links');
  h.labelValueRow('Contact', dash(a.contact_name));
  h.labelValueRow('Account', dash(a.account_name));
  h.labelValueRow('Policy',  a.policy_name
    ? `${a.policy_name}${a.policy_number ? ' (' + a.policy_number + ')' : ''}` : '—');
  if (a.policy_section_name) h.labelValueRow('Policy Section', a.policy_section_name);

  // ═══ DATES ════════════════════════════════════════════════════
  h.sectionHead('Dates');
  h.labelValueRow('Date Acquired', dateStr(a.date_acquired));
  h.labelValueRow('Date Sold',     dateStr(a.date_sold));

  // ═══ RELATED CONTACTS ═════════════════════════════════════════
  const relContacts = safeJsonArray(a.related_contacts);
  if (relContacts.length) {
    h.sectionHead('Related Contacts');
    const cols = [
      { label: 'Type',  key: 'contact_type', width: 130 },
      { label: 'Name',  key: 'name',         width: 160 },
      { label: 'Cell',  key: 'cell',         width: 100 },
      { label: 'Email', key: 'email',        width: 105 },
    ];
    h.tableHeader(cols);
    relContacts.forEach(r => h.tableRow(cols, r));
  }

  // ═══ NOTES (main field) ═══════════════════════════════════════
  if (a.notes) {
    h.sectionHead('Notes');
    h.paragraph('Notes', a.notes);
  }

  // ═══ RISK DETAILS (linked rows) ═══════════════════════════════
  h.sectionHead('Risk Details');
  if (!riskDetails.length) {
    h.emptyLine('No risk details captured.');
  } else {
    const cols = [
      { label: 'Name',          key: 'risk_detail_name', width: 180 },
      { label: 'Risk Type',     key: 'risk_type',        width: 110 },
      { label: 'Section',       key: 'section_name',     width: 130 },
      { label: 'Last Updated',  width: 75, fmt: r => dateStr(r.updated_at) },
    ];
    h.tableHeader(cols);
    riskDetails.forEach(r => h.tableRow(cols, r));
  }

  // ═══ TAB: NOTES / AMENDMENTS ══════════════════════════════════
  h.sectionHead('Asset Notes');
  if (!amendments.length) {
    h.emptyLine('No notes recorded.');
  } else {
    amendments.forEach((n, idx) => {
      h.subHead(`${idx + 1}. ${dateStr(n.amendment_date)}${n.created_by_name ? ' — ' + n.created_by_name : ''}`);
      if (n.amendment_type) h.labelValueRow('Type', n.amendment_type);
      if (n.details)        h.paragraph('Details', n.details);
    });
  }

  // ═══ TAB: CLAIMS ══════════════════════════════════════════════
  h.sectionHead('Claims');
  if (!claims.length) {
    h.emptyLine('No claims on this asset.');
  } else {
    const cols = [
      { label: 'Claim Number', key: 'claim_number', width: 110 },
      { label: 'Type',         key: 'claim_type',   width: 90 },
      { label: 'Status',       key: 'claim_status', width: 80 },
      { label: 'Date',         width: 80, fmt: cl => dateStr(cl.claim_date) },
      { label: 'Estimated',    width: 135, align: 'right',
        fmt: cl => money(cl.estimated_value) },
    ];
    h.tableHeader(cols);
    claims.forEach(cl => h.tableRow(cols, cl));
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

  // ═══ TAB: WORKFLOWS ═══════════════════════════════════════════
  h.sectionHead('Workflows');
  if (!workflows.length) {
    h.emptyLine('No workflows linked.');
  } else {
    const cols = [
      { label: 'Description', key: 'description', width: 290 },
      { label: 'Due Date',    width: 95, fmt: w => dateStr(w.due_date) },
      { label: 'Status',      key: 'status', width: 110 },
    ];
    h.tableHeader(cols);
    workflows.forEach(w => h.tableRow(cols, w));
  }

  return finalise();
}

module.exports = { renderAssetReportPdf };
