// Playwright screenshot script for the Inexpro CRM training manual.
// Targets the demo server on localhost:3001 (manual_demo.db).
// Saves PNGs to docs/manual/screenshots/.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:3001';
const OUT = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 1440, height: 900 };

// Resolved at runtime from /api lookups
const ids = {};

async function lookupIds(page) {
  // Use page-context fetch so it inherits session cookies automatically
  const fetchJson = async (apiPath) => {
    return page.evaluate(async (p) => {
      const r = await fetch(p, { credentials: 'include' });
      if (!r.ok) throw new Error(`${p} -> ${r.status}`);
      return r.json();
    }, apiPath);
  };
  const list = (r) => r.data || r;
  const contacts = list(await fetchJson('/api/contacts?limit=200'));
  const accounts = list(await fetchJson('/api/accounts?limit=200'));
  const engagements = list(await fetchJson('/api/engagements?limit=200'));
  const policies = list(await fetchJson('/api/policies?limit=200'));
  const advice = list(await fetchJson('/api/advice-records?limit=200'));
  const claims = list(await fetchJson('/api/claims?limit=200'));
  const complaints = list(await fetchJson('/api/complaints?limit=200'));
  const assets = list(await fetchJson('/api/assets?limit=200'));

  ids.prospect = contacts.find(c => c.first_name === 'Thandiwe')?.id;
  ids.midOnboard = contacts.find(c => c.first_name === 'Pieter')?.id;
  ids.activeContact = contacts.find(c => c.first_name === 'Sarah')?.id;
  ids.account = accounts.find(a => a.account_name?.startsWith('Karoo'))?.id;
  ids.engagement = engagements.find(e => e.engagement_name?.startsWith('Sarah Naidoo'))?.id;
  ids.policy = policies.find(p => p.policy_number === 'SAN-2026-04-1024')?.id;
  ids.advice = advice.find(a => a.contact_id === ids.activeContact)?.id;
  ids.claim = claims.find(c => c.claim_number === 'CLM-2026-04-0007')?.id;
  ids.complaint = complaints.find(c => c.contact_id === ids.activeContact)?.id;
  ids.asset = assets.find(a => a.asset_name?.startsWith('Toyota Corolla'))?.id;

  console.log('Resolved IDs:', ids);
}

const shots = [];   // ordered list of capture instructions
function shot(file, hash, opts = {}) {
  shots.push({ file, hash, ...opts });
}

function buildShotList() {
  // 1. Login & dashboard
  shot('01-login.png', 'LOGIN');
  shot('02-dashboard.png', '#/');

  // 2. Onboarding flow
  shot('03-contacts-list.png', '#/contacts');
  shot('04-contact-new-form.png', '#/contacts/new');
  shot(`05-contact-prospect-detail.png`, `#/contacts/${ids.prospect}`);
  shot(`06-contact-fica-prospect.png`,   `#/fica/${ids.prospect}`);
  shot(`07-contact-popia-prospect.png`,  `#/popia/${ids.prospect}`);
  shot(`08-contact-midonboard-detail.png`, `#/contacts/${ids.midOnboard}`);
  shot(`09-contact-active-detail.png`, `#/contacts/${ids.activeContact}`);
  shot(`10-contact-fica-verified.png`, `#/fica/${ids.activeContact}`);
  shot(`11-contact-popia-consented.png`, `#/popia/${ids.activeContact}`);

  // 3. Activation gate error demo: try to activate Thandiwe (no FICA, no POPIA basis)
  shot('12-gate-activation-error.png', `#/contacts/${ids.prospect}/edit`, {
    afterLoad: async (page) => {
      // Set status to Active Client and try to save → server returns gate error
      await page.evaluate(() => {
        const sel = document.querySelector('select[name="contact_status"], #contact_status');
        if (sel) { sel.value = 'Active Client'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      });
      // Try clicking Save
      const saveBtn = await page.$('button[type="submit"], button:has-text("Save")');
      if (saveBtn) {
        await saveBtn.click().catch(() => {});
        await page.waitForTimeout(900);
      }
    },
  });

  // 4. Accounts
  shot('13-accounts-list.png', '#/accounts');
  shot('14-account-new-form.png', '#/accounts/new');
  shot(`15-account-detail.png`, `#/accounts/${ids.account}`);

  // 5. Engagements
  shot('16-engagements-list.png', '#/engagements');
  shot('17-engagement-new-form.png', '#/engagements/new');
  shot(`18-engagement-detail.png`, `#/engagements/${ids.engagement}`);

  // 6. Advice records
  shot('19-advice-list.png', '#/advice-records');
  shot('20-advice-new-form.png', '#/advice-records/new');
  shot(`21-advice-detail.png`, `#/advice-records/${ids.advice}`);

  // 7. Policies
  shot('22-policies-list.png', '#/policies');
  shot('23-policy-new-form.png', '#/policies/new');
  shot(`24-policy-detail.png`, `#/policies/${ids.policy}`);
  shot(`25-policy-schedule.png`, `#/schedule/policy/${ids.policy}`);

  // 8. Assets
  shot('26-assets-list.png', '#/assets');
  shot('27-asset-new-form.png', '#/assets/new');
  shot(`28-asset-detail.png`, `#/assets/${ids.asset}`);

  // 9. Claims
  shot('29-claims-list.png', '#/claims');
  shot('30-claim-new-form.png', '#/claims/new');
  shot(`31-claim-detail.png`, `#/claims/${ids.claim}`);

  // 10. Complaints
  shot('32-complaints-list.png', '#/complaints');
  shot('33-complaint-new-form.png', '#/complaints/new');
  shot(`34-complaint-detail.png`, `#/complaints/${ids.complaint}`);

  // 11. Reviews
  shot('35-reviews-list.png', '#/reviews');
  shot('36-review-new-form.png', '#/reviews/new');

  // 12. Workflows / tasks
  shot('37-workflows-list.png', '#/workflows');

  // 13. Reports
  shot('38-reports.png', '#/reports');

  // 14. Risk details, products, broker profiles, TCF, audit
  shot('39-risk-details.png', '#/risk-details');
  shot('40-products.png', '#/products');
  shot('41-broker-profiles.png', '#/broker-profiles');
  shot('42-tcf-dashboard.png', '#/tcf-dashboard');
  shot('43-data-breaches.png', '#/data-breaches');
  shot('44-admin-users.png', '#/admin/users');
  shot('45-admin-audit.png', '#/admin/audit');
  shot('46-popia-overview.png', '#/popia');
  shot('47-fica-overview.png', '#/fica');
  shot('48-notifications.png', '#/notifications');
}

async function login(page) {
  await page.goto(BASE + '/');
  await page.waitForLoadState('networkidle');
  // Capture the login screen first
  await page.screenshot({ path: path.join(OUT, '01-login.png'), fullPage: true });
  await page.fill('#login-username', 'admin');
  await page.fill('#login-password', 'admin123');
  await page.click('#login-form button[type="submit"]');
  // Wait for app to be visible (login screen hides itself)
  await page.waitForSelector('#login-screen', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
}

async function gotoHash(page, hash) {
  await page.goto(BASE + '/' + hash);
  // Wait for SPA route handler to render
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(700);
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();

  console.log('Logging in...');
  await login(page);

  console.log('Looking up demo IDs...');
  await lookupIds(page);

  buildShotList();

  console.log(`Capturing ${shots.length} screenshots...`);
  let n = 0;
  for (const s of shots) {
    if (s.hash === 'LOGIN') continue; // already captured
    n++;
    try {
      await gotoHash(page, s.hash);
      if (s.afterLoad) await s.afterLoad(page);
      const file = path.join(OUT, s.file);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`  ${n}/${shots.length - 1}  ${s.file}  ←  ${s.hash}`);
    } catch (e) {
      console.warn(`  ✗ ${s.file} (${s.hash}): ${e.message}`);
    }
  }

  await browser.close();
  console.log(`\n✅ Saved screenshots to: ${OUT}`);
})().catch(err => { console.error(err); process.exit(1); });
