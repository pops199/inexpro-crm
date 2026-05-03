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

const ids = {};

async function lookupIds(page) {
  const fetchJson = async (apiPath) => {
    return page.evaluate(async (p) => {
      const r = await fetch(p, { credentials: 'include' });
      if (!r.ok) throw new Error(`${p} -> ${r.status}`);
      return r.json();
    }, apiPath);
  };
  const list = (r) => r.data || r;
  const contacts    = list(await fetchJson('/api/contacts?limit=200'));
  const accounts    = list(await fetchJson('/api/accounts?limit=200'));
  const engagements = list(await fetchJson('/api/engagements?limit=200'));
  const policies    = list(await fetchJson('/api/policies?limit=200'));
  const advice      = list(await fetchJson('/api/advice-records?limit=200'));
  const claims      = list(await fetchJson('/api/claims?limit=200'));
  const complaints  = list(await fetchJson('/api/complaints?limit=200'));
  const assets      = list(await fetchJson('/api/assets?limit=200'));
  const users       = list(await fetchJson('/api/admin/users'));

  ids.prospect      = contacts.find(c => c.first_name === 'Thandiwe')?.id;
  ids.midOnboard    = contacts.find(c => c.first_name === 'Pieter')?.id;
  ids.activeContact = contacts.find(c => c.first_name === 'Sarah')?.id;
  ids.account       = accounts.find(a => a.account_name?.startsWith('Karoo'))?.id;
  ids.engagement    = engagements.find(e => e.engagement_name?.startsWith('Sarah Naidoo'))?.id;
  ids.policy        = policies.find(p => p.policy_number === 'SAN-2026-04-1024')?.id;
  ids.advice        = advice.find(a => a.contact_id === ids.activeContact)?.id;
  ids.claim         = claims.find(c => c.claim_number === 'CLM-2026-04-0007')?.id;
  ids.complaint     = complaints.find(c => c.contact_id === ids.activeContact)?.id;
  ids.asset         = assets.find(a => a.asset_name?.startsWith('Toyota Corolla'))?.id;
  ids.adminUser     = users.find(u => u.username === 'admin')?.id;
  ids.brokerUser    = users.find(u => u.username === 'training_broker')?.id;

  console.log('Resolved IDs:', ids);
}

const shots = [];
function shot(file, hash, opts = {}) {
  shots.push({ file, hash, ...opts });
}

// Helper: click a tab inside a tabs-header by data-tab value AND scroll the
// tabs strip to the top of the viewport so the active tab's content is the
// focus of the screenshot (not cut off below the fold).
// The SPA's main content scrolls inside `.content-area`, not on `window`.
// This helper scrolls THAT container so the targeted element sits 24 px below
// the top of the viewport.
async function scrollElementToTop(page, selectorChain) {
  await page.evaluate((selectors) => {
    const scroller = document.querySelector('.content-area') || document.scrollingElement || document.documentElement;
    if (!scroller) return;
    let target = null;
    for (const s of selectors) {
      target = document.querySelector(s);
      if (target) break;
    }
    if (!target) return;
    const offset = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTop = Math.max(0, offset - 24);
    // Belt-and-braces — also nudge the window in case the page has a window-level scroll.
    try { window.scrollTo({ top: Math.max(0, offset - 24), behavior: 'auto' }); } catch (_) {}
  }, selectorChain);
  await page.waitForTimeout(250);
}

function clickTab(headerSelector, dataTab, settle = 600) {
  return async (page) => {
    await page.evaluate(({ sel, t }) => {
      const btn = document.querySelector(`${sel} .tab-btn[data-tab="${t}"]`);
      if (btn) btn.click();
    }, { sel: headerSelector, t: dataTab });
    await page.waitForTimeout(settle);
    // Scroll the .detail-tabs card (parent of the tab header) to the top of the
    // .content-area scroller so the active tab content fills the viewport.
    await scrollElementToTop(page, ['.detail-tabs', headerSelector]);
  };
}

async function scrollTabsCardIntoView(page) {
  await scrollElementToTop(page, ['.detail-tabs']);
}

function buildShotList() {
  // ── 1. AUTH + DASHBOARD ──────────────────────────────────────────────
  shot('01-login.png', 'LOGIN');
  shot('02-dashboard.png', '#/');

  // Profile + 2FA enrolment + password change
  shot('03-profile.png', '#/profile');
  shot('04-profile-2fa-modal.png', '#/profile', {
    afterLoad: async (page) => {
      const btn = await page.$('button:has-text("Activate 2FA"), button:has-text("Set up two-factor authentication")');
      if (btn) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(900);
      }
    },
    afterShot: async (page) => {
      // Close the 2FA modal so it does not bleed into subsequent screenshots
      await page.evaluate(() => {
        document.querySelectorAll(
          '.modal-close, .btn-close, [data-dismiss="modal"]'
        ).forEach(el => { try { el.click(); } catch (_) {} });
        // As a fallback, hide any common overlay/modal nodes outright
        document.querySelectorAll(
          '.modal-overlay, .modal-backdrop, #global-modal, .modal'
        ).forEach(el => {
          try { el.style.display = 'none'; el.remove(); } catch (_) {}
        });
      });
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(250);
    },
  });

  // ── 2. CONTACTS — list / form / states ───────────────────────────────
  shot('10-contacts-list.png', '#/contacts');
  shot('11-contact-new-form.png', '#/contacts/new');
  shot(`12-contact-prospect-detail.png`, `#/contacts/${ids.prospect}`);
  shot(`13-contact-fica-prospect.png`,   `#/fica/${ids.prospect}`);
  shot(`14-contact-popia-prospect.png`,  `#/popia/${ids.prospect}`);
  shot(`15-contact-midonboard-detail.png`, `#/contacts/${ids.midOnboard}`);
  shot(`16-contact-active-detail.png`,   `#/contacts/${ids.activeContact}`);
  shot(`17-contact-fica-verified.png`,   `#/fica/${ids.activeContact}`);
  shot(`18-contact-popia-consented.png`, `#/popia/${ids.activeContact}`);

  // Activation gate: try to set Thandiwe to Active and let the validation message render
  shot('19-gate-activation-error.png', `#/contacts/${ids.prospect}/edit`, {
    afterLoad: async (page) => {
      await page.evaluate(() => {
        const sel = document.querySelector('select[name="contact_status"], #contact_status');
        if (sel) { sel.value = 'Active Client'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      });
      const saveBtn = await page.$('button[type="submit"], button:has-text("Save")');
      if (saveBtn) {
        await saveBtn.click().catch(() => {});
        await page.waitForTimeout(900);
      }
    },
  });

  // Contact detail tabs (active client) — viewport-only so the tab content fills the frame
  shot(`20-contact-tab-policies.png`, `#/contacts/${ids.activeContact}`, { afterLoad: clickTab('#contact-tabs-header', 'policies'), clip: '.detail-tabs' });
  shot(`21-contact-tab-engagements.png`, `#/contacts/${ids.activeContact}`, { afterLoad: clickTab('#contact-tabs-header', 'engagements'), clip: '.detail-tabs' });
  shot(`22-contact-tab-sections.png`, `#/contacts/${ids.activeContact}`, { afterLoad: clickTab('#contact-tabs-header', 'sections'), clip: '.detail-tabs' });
  shot(`23-contact-tab-timeline.png`, `#/contacts/${ids.activeContact}`, { afterLoad: clickTab('#contact-tabs-header', 'timeline'), clip: '.detail-tabs' });

  // ── 3. ACCOUNTS ──────────────────────────────────────────────────────
  shot('30-accounts-list.png', '#/accounts');
  shot('31-account-new-form.png', '#/accounts/new');
  shot(`32-account-detail.png`, `#/accounts/${ids.account}`);
  shot(`33-account-fica.png`,   `#/fica/account/${ids.account}`);

  // ── 4. ENGAGEMENTS ───────────────────────────────────────────────────
  shot('40-engagements-list.png', '#/engagements');
  shot('41-engagement-new-form.png', '#/engagements/new');
  shot(`42-engagement-detail.png`, `#/engagements/${ids.engagement}`);

  // ── 5. ADVICE RECORDS ────────────────────────────────────────────────
  shot('50-advice-list.png', '#/advice-records');
  shot('51-advice-new-form.png', '#/advice-records/new');
  shot(`52-advice-detail.png`, `#/advice-records/${ids.advice}`);

  // ── 6. POLICIES ──────────────────────────────────────────────────────
  shot('60-policies-list.png', '#/policies');
  shot('61-policy-new-form.png', '#/policies/new');
  shot(`62-policy-detail-sections-tab.png`, `#/policies/${ids.policy}`);
  // Sections tab — Show breakdown — scroll the tab card into view
  shot(`63-policy-sections-breakdown.png`, `#/policies/${ids.policy}`, {
    afterLoad: async (page) => {
      await page.waitForTimeout(700);
      await page.evaluate(() => {
        const cb = document.getElementById('pol-sec-breakdown-cb');
        if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      });
      await page.waitForTimeout(400);
      await scrollTabsCardIntoView(page);
    },
    clip: '.detail-tabs',
  });
  // Drill into "Assets in this Section"
  shot(`64-policy-section-assets.png`, `#/policies/${ids.policy}`, {
    afterLoad: async (page) => {
      await page.waitForTimeout(800);
      await page.evaluate(() => {
        const btn = document.querySelector('.sec-view-btn');
        if (btn) btn.click();
      });
      await page.waitForTimeout(900);
      await scrollTabsCardIntoView(page);
    },
    clip: '.detail-tabs',
  });
  shot(`65-policy-section-assets-search.png`, `#/policies/${ids.policy}`, {
    afterLoad: async (page) => {
      await page.waitForTimeout(800);
      await page.evaluate(() => {
        const btn = document.querySelector('.sec-view-btn');
        if (btn) btn.click();
      });
      await page.waitForTimeout(700);
      await page.evaluate(() => {
        const inp = document.getElementById('sec-asset-search');
        if (inp) {
          inp.value = 'Toyota';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      await page.waitForTimeout(400);
      await scrollTabsCardIntoView(page);
    },
    clip: '.detail-tabs',
  });
  // Bottom-tab content — viewport-only after scrolling tab into view
  shot(`66-policy-tab-assets.png`,    `#/policies/${ids.policy}`, { afterLoad: clickTab('#pol-tabs-header', 'assets',    800), clip: '.detail-tabs' });
  shot(`67-policy-tab-claims.png`,    `#/policies/${ids.policy}`, { afterLoad: clickTab('#pol-tabs-header', 'claims',    800), clip: '.detail-tabs' });
  shot(`68-policy-tab-commission.png`,`#/policies/${ids.policy}`, { afterLoad: clickTab('#pol-tabs-header', 'commission',900), clip: '.detail-tabs' });
  shot(`69-policy-tab-post-sale.png`, `#/policies/${ids.policy}`, { afterLoad: clickTab('#pol-tabs-header', 'post-sale', 900), clip: '.detail-tabs' });
  shot(`70-policy-tab-documents.png`, `#/policies/${ids.policy}`, { afterLoad: clickTab('#pol-tabs-header', 'documents', 900), clip: '.detail-tabs' });
  shot(`71-policy-tab-timeline.png`,  `#/policies/${ids.policy}`, { afterLoad: clickTab('#pol-tabs-header', 'timeline',  900), clip: '.detail-tabs' });
  shot(`72-policy-tab-versions.png`,  `#/policies/${ids.policy}`, { afterLoad: clickTab('#pol-tabs-header', 'versions',  900), clip: '.detail-tabs' });
  shot(`73-policy-tab-quotes.png`,    `#/policies/${ids.policy}`, { afterLoad: clickTab('#pol-tabs-header', 'quotes',    900), clip: '.detail-tabs' });
  // Premium breakdown panel on Financial & Dates card
  shot(`74-policy-premium-breakdown.png`, `#/policies/${ids.policy}`, {
    afterLoad: async (page) => {
      await page.waitForTimeout(600);
      await page.evaluate(() => {
        const cb = document.getElementById('pol-fin-breakdown-cb');
        if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
        cb && cb.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(900);
    },
  });
  // Schedule
  shot(`75-policy-schedule.png`, `#/schedule/policy/${ids.policy}`);

  // ── 7. ASSETS ────────────────────────────────────────────────────────
  shot('80-assets-list.png', '#/assets');
  shot('81-asset-new-form.png', '#/assets/new');
  shot(`82-asset-edit-extras-rows.png`, `#/assets/${ids.asset}/edit`, {
    afterLoad: async (page) => {
      // Scroll Vehicle Extras section into view
      await page.evaluate(() => {
        const fs = document.getElementById('vehicle-extras-fieldset');
        if (fs) fs.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(500);
    },
  });
  shot(`83-asset-edit-additional-covers.png`, `#/assets/${ids.asset}/edit`, {
    afterLoad: async (page) => {
      await page.evaluate(() => {
        const acRows = document.getElementById('additional-cover-rows');
        if (acRows) acRows.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(500);
    },
  });
  shot(`84-asset-detail.png`, `#/assets/${ids.asset}`);
  shot(`85-asset-detail-breakdown.png`, `#/assets/${ids.asset}`, {
    afterLoad: async (page) => {
      await page.waitForTimeout(600);
      await page.evaluate(() => {
        const cb = document.getElementById('asset-fin-breakdown-cb');
        if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
        cb && cb.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(500);
    },
  });

  // ── 8. CLAIMS ────────────────────────────────────────────────────────
  shot('90-claims-list.png', '#/claims');
  shot('91-claim-new-form.png', '#/claims/new');
  shot(`92-claim-detail.png`, `#/claims/${ids.claim}`);
  shot(`93-claim-tab-third-parties.png`, `#/claims/${ids.claim}`, { afterLoad: clickTab('#claim-tabs-header', 'third-parties', 800), clip: '.detail-tabs' });
  shot(`94-claim-tab-notes.png`,         `#/claims/${ids.claim}`, { afterLoad: clickTab('#claim-tabs-header', 'notes',         800), clip: '.detail-tabs' });

  // ── 9. COMPLAINTS ────────────────────────────────────────────────────
  shot('100-complaints-list.png', '#/complaints');
  shot('101-complaint-new-form.png', '#/complaints/new');
  shot(`102-complaint-detail.png`, `#/complaints/${ids.complaint}`);

  // ── 10. REVIEWS ──────────────────────────────────────────────────────
  shot('110-reviews-list.png', '#/reviews');
  shot('111-review-new-form.png', '#/reviews/new');

  // ── 11. WORKFLOWS ────────────────────────────────────────────────────
  shot('120-workflows-list.png', '#/workflows');
  shot('121-workflow-new-form.png', '#/workflows/new');

  // ── 12. RISK DETAILS / POLICY SECTIONS / PRODUCTS / SCHEDULES ─────────
  shot('130-risk-details.png', '#/risk-details');
  shot('131-policy-sections-list.png', '#/policy-sections');
  shot('132-products.png', '#/products');
  shot('133-broker-profiles.png', '#/broker-profiles');

  // ── 13. REPORTS — three tabs ────────────────────────────────────────
  shot('140-reports-predefined.png', '#/reports');
  shot('141-reports-custom.png', '#/reports', {
    afterLoad: async (page) => {
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        const t = document.querySelector('button.reports-tab[data-tab="custom"]');
        if (t) t.click();
      });
      await page.waitForTimeout(900);
    },
  });
  shot('142-reports-audit.png', '#/reports', {
    afterLoad: async (page) => {
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        const t = document.querySelector('button.reports-tab[data-tab="audit"]');
        if (t) t.click();
      });
      await page.waitForTimeout(900);
    },
  });

  // ── 14. COMPLIANCE OVERVIEWS ────────────────────────────────────────
  shot('150-popia-overview.png', '#/popia');
  shot('151-fica-overview.png', '#/fica');
  shot('152-tcf-dashboard.png', '#/tcf-dashboard');
  shot('153-data-breaches.png', '#/data-breaches');

  // ── 15. ADMIN ──────────────────────────────────────────────────────
  shot('160-admin-users.png', '#/admin/users');
  shot('161-admin-audit.png', '#/admin/audit');
  shot('162-admin-settings.png', '#/admin');
  // Try to navigate to Security pane and System Update pane via inner sidebar clicks
  shot('163-admin-security.png', '#/admin', {
    afterLoad: async (page) => {
      await page.waitForTimeout(700);
      await page.evaluate(() => {
        // Click any sidebar/tab item labelled Security
        const candidates = Array.from(document.querySelectorAll('button, a, .admin-nav-item, [data-section], [role="tab"]'));
        const sec = candidates.find(el => /security/i.test(el.textContent || ''));
        if (sec) sec.click();
      });
      await page.waitForTimeout(900);
    },
  });
  shot('164-admin-system-update.png', '#/admin', {
    afterLoad: async (page) => {
      await page.waitForTimeout(700);
      await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('button, a, .admin-nav-item, [data-section], [role="tab"]'));
        const su = candidates.find(el => /system\s*update/i.test(el.textContent || ''));
        if (su) su.click();
      });
      await page.waitForTimeout(900);
    },
  });
  shot('165-admin-otp-generate.png', '#/admin', {
    afterLoad: async (page) => {
      await page.waitForTimeout(700);
      await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('button, a, .admin-nav-item, [data-section], [role="tab"]'));
        const sec = candidates.find(el => /security/i.test(el.textContent || ''));
        if (sec) sec.click();
      });
      await page.waitForTimeout(700);
      await page.evaluate(() => {
        const gen = Array.from(document.querySelectorAll('button')).find(b =>
          /generate\s*pin|generate\s*otp|issue.*pin/i.test(b.textContent || ''));
        if (gen) gen.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(500);
    },
  });

  // ── 16. NOTIFICATIONS ──────────────────────────────────────────────
  shot('170-notifications.png', '#/notifications');
}

async function login(page) {
  await page.goto(BASE + '/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(OUT, '01-login.png'), fullPage: true });
  await page.fill('#login-username', 'admin');
  await page.fill('#login-password', 'admin123');
  await page.click('#login-form button[type="submit"]');
  await page.waitForSelector('#login-screen', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
}

async function gotoHash(page, hash) {
  // Defensive: kill any lingering modal / overlay before navigating away.
  await page.evaluate(() => {
    document.querySelectorAll(
      '.modal-overlay, .modal-backdrop, #global-modal, .modal'
    ).forEach(el => {
      try {
        // Only remove things actually shown (display !== 'none')
        const cs = el && el.style && el.style.display;
        if (cs !== 'none') el.remove();
      } catch (_) {}
    });
  }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await page.goto(BASE + '/' + hash);
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
    if (s.hash === 'LOGIN') continue;
    n++;
    try {
      await gotoHash(page, s.hash);
      if (s.afterLoad) await s.afterLoad(page);
      const file = path.join(OUT, s.file);
      if (s.clip) {
        // Element-only screenshot: tightly frames the tab card or modal etc.
        // Falls back to a viewport screenshot if the element is missing.
        const handle = await page.$(s.clip);
        if (handle) {
          // Make sure the element is in view, then screenshot just it.
          await handle.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(150);
          await handle.screenshot({ path: file });
        } else {
          await page.screenshot({ path: file, fullPage: false });
        }
      } else if (s.viewport) {
        await page.screenshot({ path: file, fullPage: false });
      } else {
        await page.screenshot({ path: file, fullPage: true });
      }
      if (s.afterShot) await s.afterShot(page);
      console.log(`  ${n}/${shots.length - 1}  ${s.file}  ←  ${s.hash}`);
    } catch (e) {
      console.warn(`  ✗ ${s.file} (${s.hash}): ${e.message}`);
    }
  }

  await browser.close();
  console.log(`\n✅ Saved screenshots to: ${OUT}`);
})().catch(err => { console.error(err); process.exit(1); });
