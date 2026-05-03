// Seed the manual_demo.db with realistic training data for screenshots.
// Idempotent: re-running adds only what's missing (looked up by name/number).
//
// Run with:  node docs/manual/seed-demo.js
// Targets http://localhost:3001 by default.

const BASE = process.env.BASE || 'http://localhost:3001';
const ADMIN = { username: 'admin', password: 'admin123' };

let cookie = '';

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.headers.get('set-cookie')) {
    cookie = res.headers.get('set-cookie').split(';')[0];
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status}: ${json?.error || text}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function login() {
  console.log('Logging in as admin...');
  await api('POST', '/api/auth/login', ADMIN);
}

async function findOrCreateBroker() {
  const users = await api('GET', '/api/admin/users');
  const list = users.data || users;
  const existing = list.find(u => u.username === 'training_broker');
  if (existing) return existing.id;
  const created = await api('POST', '/api/admin/users', {
    username: 'training_broker',
    email: 'training@inexpro.example',
    password: 'Training123!',
    full_name: 'Training Broker (Demo)',
    role: 'broker',
    active: 1,
  });
  console.log('  ✓ Created training_broker user id=' + created.id);
  return created.id;
}

async function findOrCreateContact(name, overrides = {}) {
  const list = await api('GET', '/api/contacts?limit=200');
  const existing = (list.data || []).find(
    c => c.first_name === name.first && c.last_name === name.last
  );
  if (existing) return existing;
  const created = await api('POST', '/api/contacts', {
    first_name: name.first,
    last_name: name.last,
    email: `${name.first.toLowerCase()}.${name.last.toLowerCase()}@training.example`,
    mobile: '0820000000',
    contact_type: 'Individual Client',
    client_category: 'Personal Lines',
    existing_client: 0,
    contact_status: 'Prospect',
    popia_consent_obtained: 0,
    fica_status: 'Not Started',
    primary_client_record: 1,
    ...overrides,
  });
  console.log(`  ✓ Created contact ${name.first} ${name.last} (id=${created.id})`);
  return created;
}

async function findOrCreateAccount(name, overrides = {}) {
  const list = await api('GET', '/api/accounts?limit=200');
  const existing = (list.data || []).find(a => a.account_name === name);
  if (existing) return existing;
  const created = await api('POST', '/api/accounts', {
    account_name: name,
    business_type: 'Company',
    client_category: 'Commercial Lines',
    existing_client: 0,
    client_status: 'Prospect',
    fica_status: 'Not Started',
    ...overrides,
  });
  console.log(`  ✓ Created account ${name} (id=${created.id})`);
  return created;
}

async function ensureFicaVerified(kind, id) {
  const path = `/api/fica/${kind}/${id}`;
  // Resolve admin user id for "verified-by"
  const usersResp = await api('GET', '/api/admin/users').catch(() => ({ data: [] }));
  const users = usersResp.data || usersResp || [];
  const admin = users.find(u => u.username === 'admin') || users[0] || { id: 1 };
  await api('PUT', path, {
    fica_status: 'Verified',
    fica_verification_date: '2026-04-20',
    fica_verification_method: kind === 'account' ? 'CIPC registration (company)' : 'South African ID document',
    fica_document_reference: kind === 'account' ? 'CIPC: 2018/123456/07' : 'ID: 8001015009088',
    fica_verified_by_id: admin.id,
    fica_beneficial_owner_confirmed: 'Yes',
    fica_pep_check: 'Yes — clear',
    fica_pep_check_date: '2026-04-20',
    fica_id_document_received: 1,
    fica_proof_of_address_received: 1,
    _admin_password: 'admin123',
  }).catch(e => console.warn(`  · FICA(${kind}/${id}) update note:`, e.message));
}

async function ensurePopiaConsented(contactId) {
  // Resolve admin to use as Information Officer
  const usersResp = await api('GET', '/api/admin/users').catch(() => ({ data: [] }));
  const users = usersResp.data || usersResp || [];
  const admin = users.find(u => u.username === 'admin') || users[0] || { id: 1 };
  await api('PUT', `/api/popia/contact/${contactId}`, {
    popia_consent_obtained: 1,
    popia_consent_date: '2026-04-20',
    consent_method: 'Signed form',
    data_processing_basis: 'Consent',
    purpose_of_processing: 'Insurance advice, intermediary services and policy administration',
    retention_period_years: 5,
    data_source: 'Direct from data subject',
    data_categories_held: JSON.stringify(['Identity', 'Contact', 'Financial', 'Insurance']),
    information_officer_id: admin.id,
    privacy_notice_provided: 1,
    _admin_password: 'admin123',
  }).catch(e => console.warn('  · POPIA update note:', e.message));
}

async function findOrCreateBrokerCode(brokerId) {
  const codes = await api('GET', `/api/admin/users/${brokerId}/broker-codes`).catch(() => ({ data: [] }));
  const list = codes.data || codes || [];
  if (list[0]) return list[0].id;
  const created = await api('POST', `/api/admin/users/${brokerId}/broker-codes`, {
    code: 'TRN-001',
    description: 'Default broker code (training data)',
  });
  console.log(`  ✓ Created broker code TRN-001 for broker id=${brokerId}`);
  return (created.data || created).id;
}

async function activateContact(contact) {
  await api('PUT', `/api/contacts/${contact.id}`, {
    ...contact,
    contact_status: 'Active Client',
    fica_status: 'Verified',
    popia_consent_obtained: 1,
    data_processing_basis: 'Consent',
  });
  console.log(`  ✓ Activated contact id=${contact.id}`);
}

async function findOrCreateEngagement(name, contactId, brokerId) {
  const list = await api('GET', '/api/engagements?limit=200');
  const existing = (list.data || []).find(e => e.engagement_name === name);
  if (existing) return existing;
  const created = await api('POST', '/api/engagements', {
    engagement_name: name,
    assigned_broker_id: brokerId,
    engagement_type: 'New Business',
    contact_id: contactId,
    stage: 'Fact Find Completed',
    fsp_licence_disclosed: 'Yes — Written',
    broker_identity_disclosed: 1,
    product_costs_disclosed: 1,
    product_costs_disclosed_notes: 'Premium and intermediary fee disclosed in writing.',
    material_risks_disclosed: 1,
    material_risks_disclosed_notes: 'Excesses, exclusions and waiting periods discussed.',
    complaints_process_disclosed: 'Yes — Written',
    disclosure_method: 'In-person meeting',
  });
  console.log(`  ✓ Created engagement "${name}" (id=${created.id})`);
  return created;
}

async function findOrCreatePolicy(number, contactId, brokerId) {
  const list = await api('GET', '/api/policies?limit=200');
  const existing = (list.data || []).find(p => p.policy_number === number);
  if (existing) return existing;
  const brokerCodeId = await findOrCreateBrokerCode(brokerId);
  const created = await api('POST', '/api/policies', {
    policy_number: number,
    policy_name: 'Sarah Naidoo — Household & Motor 2026',
    insurer: 'Santam',
    product_category: 'Personal Lines Multi-Peril',
    inception_date: '2026-04-01',
    assigned_broker_id: brokerId,
    broker_code_id: brokerCodeId,
    contact_id: contactId,
    policy_status: 'Pending',
    annual_premium: 18450,
    monthly_premium: 1537.50,
  });
  console.log(`  ✓ Created policy ${number} (id=${created.id})`);
  return created;
}

async function findOrCreateAdvice(brokerId, contactId, engagementId) {
  const list = await api('GET', '/api/advice-records?limit=200');
  const existing = (list.data || []).find(a => a.contact_id === contactId);
  if (existing) return existing;
  const created = await api('POST', '/api/advice-records', {
    broker_id: brokerId,
    prepared_by_id: brokerId,
    contact_id: contactId,
    engagement_id: engagementId,
    advice_date: '2026-04-22',
    advice_type: 'New Business',
    trigger_event: 'Client Engagement',
    client_needs_identified: 'Comprehensive household and motor cover for primary residence and 2 vehicles.',
    risk_analysis_summary: 'Theft risk medium (suburb), motor risk high (daily commuter), no current cover.',
    recommendation_given: 'Santam Multi-Peril with R5,000 standard excess, building sum insured R2.4m, contents R750k, both vehicles comprehensive.',
    reason_product_suitable: 'Insurer has strong claims-paying record; product matches client risk profile and budget.',
    conflict_of_interest_declared: 'No',
    risks_explained: 1,
    costs_explained: 1,
    excess_explained: 1,
    waiting_period_limitations_explained: 1,
    exclusions_explained: 1,
    client_understanding_confirmed: 1,
    fair_outcome_considered: 1,
    client_decision: 'Accepted',
  });
  console.log(`  ✓ Created advice record (id=${created.id})`);
  return created;
}

async function ensurePolicyActiveWithApprovedQuote(policy) {
  if (policy.policy_status === 'Active') return;
  const fs = require('fs');
  const path = require('path');
  // 1. Check for existing quote
  const quotes = await api('GET', `/api/policies/${policy.id}/quotes`);
  let quote = (quotes.data || [])[0];
  if (!quote) {
    // Upload a tiny PDF quote
    const pdfPath = path.join(__dirname, 'demo-quote.pdf');
    if (!fs.existsSync(pdfPath)) {
      // Minimal valid PDF
      fs.writeFileSync(pdfPath, Buffer.from(
        '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<<>>>>endobj xref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000053 00000 n \n0000000102 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n173\n%%EOF',
        'binary'
      ));
    }
    const form = new FormData();
    const blob = new Blob([fs.readFileSync(pdfPath)], { type: 'application/pdf' });
    form.append('file', blob, 'demo-quote.pdf');
    const res = await fetch(`${BASE}/api/policies/${policy.id}/quotes`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
    });
    if (!res.ok) throw new Error(`Quote upload failed: ${res.status} ${await res.text()}`);
    quote = await res.json();
    console.log(`  ✓ Uploaded quote (id=${quote.id})`);
  }
  // 2. Approve quote if not approved
  if (!quote.approved_at) {
    await api('POST', `/api/policies/quotes/${quote.id}/approve`, { approved_at: '2026-04-15' });
    console.log(`  ✓ Approved quote id=${quote.id}`);
  }
  // 3. Activate policy (edit-lock requires admin password)
  await api('PUT', `/api/policies/${policy.id}`, {
    ...policy,
    policy_status: 'Active',
    _admin_password: 'admin123',
  });
  console.log(`  ✓ Activated policy id=${policy.id}`);
}

async function findMotorProduct() {
  const products = await api('GET', '/api/products?limit=200');
  const list = products.data || products;
  const motor = list.find(p => p.product_category === 'Personal Lines — Motor' && p.product_status === 'Active');
  if (motor) return motor.id;
  const created = await api('POST', '/api/products', {
    product_code: 'SAN-MOT-COMP',
    product_name: 'Santam Multi-Peril Motor (Comprehensive)',
    insurer: 'Santam',
    product_category: 'Personal Lines — Motor',
    product_status: 'Active',
    target_market: 'Individuals owning private motor vehicles for personal use; SA residents.',
    geographic_scope: 'Republic of South Africa (cross-border extension on request)',
    risk_appetite: 'Low to Medium',
    minimum_insurable_value: 50000,
    maximum_insurable_value: 5000000,
    key_exclusions: 'Wear and tear, willful damage, unlicensed driver, racing.',
  });
  console.log(`  ✓ Created Personal Lines — Motor product (id=${(created.data || created).id})`);
  return (created.data || created).id;
}

async function findHomeProduct() {
  const products = await api('GET', '/api/products?limit=200');
  const list = products.data || products;
  const home = list.find(p => p.product_category === 'Personal Lines — Property' && p.product_status === 'Active');
  if (home) return home.id;
  const created = await api('POST', '/api/products', {
    product_code: 'SAN-HOME-MULTI',
    product_name: 'Santam Multi-Peril Household & Buildings',
    insurer: 'Santam',
    product_category: 'Personal Lines — Property',
    product_status: 'Active',
    target_market: 'Individual homeowners; SA residents.',
    geographic_scope: 'Republic of South Africa',
    risk_appetite: 'Low to Medium',
    minimum_insurable_value: 100000,
    maximum_insurable_value: 15000000,
    key_exclusions: 'Subsidence (without endorsement), gradual deterioration, war risks.',
  });
  console.log(`  ✓ Created Personal Lines — Property product (id=${(created.data || created).id})`);
  return (created.data || created).id;
}

async function findOrCreatePolicySection(policyId, contactId, sectionType) {
  const list = await api('GET', `/api/policy-sections?policy_id=${policyId}&limit=50`).catch(() => ({ data: [] }));
  const existing = (list.data || []).find(s => s.section_type === sectionType);
  if (existing) return existing;
  const sectionName = sectionType === 'Personal Motor'
    ? 'Personal Motor section'
    : `${sectionType} section`;
  const created = await api('POST', '/api/policy-sections', {
    section_name: sectionName,
    policy_id: policyId,
    contact_id: contactId,
    section_type: sectionType,
    section_category: sectionType === 'Personal Motor' ? 'Personal Lines' : 'Personal Lines',
    needs_analysis_status: 'Implemented',
    risk_exists: 1,
    cover_required: 1,
    currently_covered: 1,
    recommended_for_cover: 1,
    implemented: 1,
    gap_identified: 0,
    disclosure_explained: 1,
    client_understanding_confirmed: 1,
  });
  console.log(`  ✓ Created policy section "${sectionName}" (id=${(created.data || created).id})`);
  return created.data || created;
}

async function findOrCreateAsset(name, contactId, policyId, brokerId) {
  const list = await api('GET', '/api/assets?limit=200');
  const existing = (list.data || []).find(a => a.asset_name === name);
  if (existing) return existing;
  const productId = await findMotorProduct();
  const section = await findOrCreatePolicySection(policyId, contactId, 'Personal Motor');
  const created = await api('POST', '/api/assets', {
    asset_name: name,
    asset_type: 'Motor',
    asset_section: 'Motor – Light Motor Vehicle',
    policy_section_id: section.id,
    asset_status: 'Active',
    contact_id: contactId,
    policy_id: policyId,
    product_id: productId,
    assigned_broker_id: brokerId,
    make: 'Toyota',
    model: 'Corolla Cross XS',
    year: 2024,
    registration_number: 'CA 123-456',
    vin_number: 'JT1ZE10E000123456',
    sum_insured: 425000,
    sum_insured_premium: 685,
    asset_value: 425000,
    premium: 685,
    sasria: 25,
    excess: 5000,
    vehicle_extras: JSON.stringify([
      { name: 'Aftermarket sound system + roof rack', amount: 18500, premium: 35, include_in_total: true },
      { name: 'Tracker hardware (factory-fitted)',     amount: 4200,  premium: 0,  include_in_total: false },
    ]),
    additional_covers: JSON.stringify([
      { description: 'Hail (named perils extension)', cover_amount: 50000, premium: 28, include_in_total: true },
      { description: 'Riot & Strike (under SASRIA limit)', cover_amount: 100000, premium: 0, include_in_total: false },
    ]),
    extras_in_total: 1,
  });
  console.log(`  ✓ Created asset "${name}" (id=${created.id})`);
  return created;
}

async function findOrCreateClaim(number, policyId, assetId, contactId, brokerId) {
  const list = await api('GET', '/api/claims?limit=200');
  const existing = (list.data || []).find(c => c.claim_number === number);
  if (existing) return existing;
  const created = await api('POST', '/api/claims', {
    claim_number: number,
    policy_id: policyId,
    asset_id: assetId,
    contact_id: contactId,
    broker_id: brokerId,
    claim_date: '2026-04-15',
    date_reported: '2026-04-15',
    claim_type: 'Motor',
    claim_status: 'In Progress',
    incident_description: 'Rear-end collision at traffic light intersection. Third party vehicle damaged. Client uninjured.',
    estimated_value: 42500,
    client_kept_informed: 1,
    last_client_update_date: '2026-04-23',
  });
  console.log(`  ✓ Created claim ${number} (id=${created.id})`);
  return created;
}

async function findOrCreateComplaint(contactId, brokerId) {
  const list = await api('GET', '/api/complaints?limit=200');
  const existing = (list.data || []).find(c => c.contact_id === contactId);
  if (existing) return existing;
  const created = await api('POST', '/api/complaints', {
    contact_id: contactId,
    broker_id: brokerId,
    complaint_date: '2026-04-18',
    complaint_summary: 'Client complains that quote turnaround was slower than promised at the initial meeting.',
    complaint_status: 'Open',
    complaint_category: 'Service Quality',
    severity_rating: 'Medium',
    received_via: 'Email',
  });
  console.log(`  ✓ Created complaint (id=${created.id})`);
  return created;
}

(async () => {
  try {
    await login();

    console.log('\n[1/9] Broker user');
    const brokerId = await findOrCreateBroker();

    console.log('\n[2/9] PROSPECT contact (gate-state demo: cannot activate yet)');
    await findOrCreateContact(
      { first: 'Thandiwe', last: 'Mokoena' },
      { contact_status: 'Prospect', fica_status: 'Not Started', assigned_broker_id: brokerId }
    );

    console.log('\n[3/9] FICA-IN-REVIEW contact (mid-onboarding demo)');
    await findOrCreateContact(
      { first: 'Pieter', last: 'Botha' },
      { contact_status: 'Prospect', fica_status: 'In Review', popia_consent_obtained: 1, assigned_broker_id: brokerId }
    );

    console.log('\n[4/9] ACTIVE CLIENT contact (full happy path)');
    const sarah = await findOrCreateContact(
      { first: 'Sarah', last: 'Naidoo' },
      { assigned_broker_id: brokerId }
    );
    await ensureFicaVerified('contact', sarah.id);
    await ensurePopiaConsented(sarah.id);
    const sarahFresh = await api('GET', `/api/contacts/${sarah.id}`);
    if (sarahFresh.contact_status !== 'Active Client') {
      await activateContact(sarahFresh);
    }

    console.log('\n[5/9] Business account');
    const acct = await findOrCreateAccount('Karoo Logistics (Pty) Ltd', {
      assigned_broker_id: brokerId,
    });
    await ensureFicaVerified('account', acct.id);

    console.log('\n[6/9] Client engagement (Sarah)');
    const eng = await findOrCreateEngagement(
      'Sarah Naidoo — Household & Motor 2026',
      sarah.id,
      brokerId
    );

    console.log('\n[7/9] Advice record (Sarah)');
    const advice = await findOrCreateAdvice(brokerId, sarah.id, eng.id);

    console.log('\n[8/10] Policy (Sarah)');
    const policy = await findOrCreatePolicy('SAN-2026-04-1024', sarah.id, brokerId);

    console.log('\n[8b/10] Pending policy (Pieter — gate demo, no quote yet)');
    const pieter = (await api('GET', '/api/contacts?limit=200')).data.find(c => c.first_name === 'Pieter');
    if (pieter) {
      // Pieter has FICA In Review so a policy creation will be blocked — perfect for demoing the gate.
      // Don't actually create — but the demo of the form-with-error will be captured by Playwright.
    }

    console.log('\n[9/10] Quote upload + approval + policy activation (Sarah)');
    await ensurePolicyActiveWithApprovedQuote(policy);

    console.log('\n[10/10] Asset, claim + complaint (Sarah, on now-Active policy)');
    const policyFresh = await api('GET', `/api/policies/${policy.id}`);
    const asset = await findOrCreateAsset('Toyota Corolla Cross — CA 123-456', sarah.id, policyFresh.id, brokerId);
    await findOrCreateClaim('CLM-2026-04-0007', policyFresh.id, asset.id, sarah.id, brokerId);
    await findOrCreateComplaint(sarah.id, brokerId);

    console.log('\n✅ Demo data seed complete.');
  } catch (e) {
    console.error('\n❌ Seed failed:', e.message);
    if (e.body) console.error('   body:', JSON.stringify(e.body));
    process.exit(1);
  }
})();
