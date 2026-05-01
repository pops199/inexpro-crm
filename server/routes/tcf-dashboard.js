'use strict';

const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, getBrokerId } = require('../middleware/auth');
const { notSupplierSql } = require('../lib/supplier');

// Predicate appended to every contacts-based POPIA/FICA aggregate so suppliers
// (panel-beaters, assessors, etc.) don't count toward the compliance rate.
const NOT_SUPPLIER = notSupplierSql('contacts');

const router = express.Router();
router.use(requireAuth);

/**
 * TCF MI Dashboard (Section 6) — aggregated metrics for all six TCF outcomes
 * plus POPIA, FICA, broker fitness and commission transparency widgets.
 */
function monthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

router.get('/metrics', (req, res) => {
  const db = getDb();
  const scopedBrokerId = getBrokerId(req);

  // Complaint metrics ————————————————————————————————————
  const cmpScope = scopedBrokerId ? 'AND broker_id = ?' : '';
  const cmpScopeParams = scopedBrokerId ? [scopedBrokerId] : [];

  // Monthly volume — current month + prior 3 months for comparison
  const monthlyTrend = db.prepare(`
    SELECT strftime('%Y-%m', complaint_date) AS month, COUNT(*) AS count
    FROM complaints
    WHERE complaint_date >= date('now','start of month','-3 months') ${cmpScope}
    GROUP BY month
    ORDER BY month ASC
  `).all(...cmpScopeParams);

  const complaints = {
    monthly_trend: monthlyTrend,
    by_status: db.prepare(`
      SELECT complaint_status AS status, COUNT(*) AS count
      FROM complaints
      WHERE complaint_date >= date('now','-30 days') ${cmpScope}
      GROUP BY complaint_status
    `).all(...cmpScopeParams),
    resolution_rate: (() => {
      const total = db.prepare(`
        SELECT COUNT(*) AS c FROM complaints
        WHERE complaint_date >= date('now','-90 days') ${cmpScope}
      `).get(...cmpScopeParams).c;
      const resolved = db.prepare(`
        SELECT COUNT(*) AS c FROM complaints
        WHERE complaint_date >= date('now','-90 days')
          AND resolution_date IS NOT NULL
          AND julianday(resolution_date) - julianday(complaint_date) <= 30
          ${cmpScope}
      `).get(...cmpScopeParams).c;
      return total ? Math.round((resolved / total) * 100) : 100;
    })(),
    acknowledgment_rate: (() => {
      const total = db.prepare(`SELECT COUNT(*) AS c FROM complaints WHERE complaint_date >= date('now','-90 days') ${cmpScope}`).get(...cmpScopeParams).c;
      const ackd = db.prepare(`
        SELECT COUNT(*) AS c FROM complaints
        WHERE complaint_date >= date('now','-90 days')
          AND acknowledgment_date IS NOT NULL
          AND julianday(acknowledgment_date) - julianday(complaint_date) <= 3
          ${cmpScope}
      `).get(...cmpScopeParams).c;
      return total ? Math.round((ackd / total) * 100) : 100;
    })(),
  };

  // ROA completion rate ————————————————————————————————
  const arScope = scopedBrokerId ? 'AND broker_id = ?' : '';
  const arScopeParams = scopedBrokerId ? [scopedBrokerId] : [];
  const roa = {
    completion_rate: (() => {
      const total = db.prepare(`SELECT COUNT(*) AS c FROM advice_records WHERE advice_date >= date('now','-90 days') ${arScope}`).get(...arScopeParams).c;
      const complete = db.prepare(`SELECT COUNT(*) AS c FROM advice_records WHERE advice_date >= date('now','-90 days') AND roa_completed = 1 ${arScope}`).get(...arScopeParams).c;
      return total ? Math.round((complete / total) * 100) : 100;
    })(),
    coi_declaration_rate: (() => {
      const total = db.prepare(`SELECT COUNT(*) AS c FROM advice_records WHERE advice_date >= date('now','-90 days') ${arScope}`).get(...arScopeParams).c;
      const declared = db.prepare(`SELECT COUNT(*) AS c FROM advice_records WHERE advice_date >= date('now','-90 days') AND conflict_of_interest_flag IS NOT NULL ${arScope}`).get(...arScopeParams).c;
      return total ? Math.round((declared / total) * 100) : 100;
    })(),
    suitability_match_rate: (() => {
      const total = db.prepare(`SELECT COUNT(*) AS c FROM advice_records WHERE advice_date >= date('now','-90 days') AND suitability_match_score IS NOT NULL ${arScope}`).get(...arScopeParams).c;
      const match = db.prepare(`SELECT COUNT(*) AS c FROM advice_records WHERE advice_date >= date('now','-90 days') AND suitability_match_score = 'Match' ${arScope}`).get(...arScopeParams).c;
      return total ? Math.round((match / total) * 100) : 100;
    })(),
    suitability_override_rate: (() => {
      const total = db.prepare(`SELECT COUNT(*) AS c FROM advice_records WHERE advice_date >= date('now','-90 days') AND suitability_match_score IS NOT NULL ${arScope}`).get(...arScopeParams).c;
      const overrides = db.prepare(`
        SELECT COUNT(*) AS c FROM advice_records
        WHERE advice_date >= date('now','-90 days')
          AND (suitability_match_score LIKE '%Override%'
               OR suitability_match_score = 'Mismatch'
               OR suitability_match_score = 'Review Required')
        ${arScope}
      `).get(...arScopeParams).c;
      return total ? Math.round((overrides / total) * 100) : 0;
    })(),
    coi_declared_yes_rate: (() => {
      const total = db.prepare(`SELECT COUNT(*) AS c FROM advice_records WHERE advice_date >= date('now','-90 days') AND conflict_of_interest_flag IS NOT NULL ${arScope}`).get(...arScopeParams).c;
      const yes = db.prepare(`SELECT COUNT(*) AS c FROM advice_records WHERE advice_date >= date('now','-90 days') AND conflict_of_interest_flag = 'Yes' ${arScope}`).get(...arScopeParams).c;
      return total ? Math.round((yes / total) * 100) : 0;
    })(),
  };

  // Pre-sale disclosure completion —————————————————————
  // Spec 6.2: percentage of engagements with completed pre-sale disclosure
  // checklist. Uses disclosure_completed flag (set when broker confirms the
  // FAIS GCC 3A pre-sale checklist) PLUS the granular fields where present.
  // 'completion_rate' returns null when there are no engagements to evaluate
  // so the UI can show "—" instead of a misleading 100%.
  const engScope = scopedBrokerId ? 'AND assigned_broker_id = ?' : '';
  const engScopeParams = scopedBrokerId ? [scopedBrokerId] : [];
  const presale = (() => {
    const eCols = db.prepare('PRAGMA table_info(client_engagements)').all().map(c => c.name);
    const has = (col) => eCols.includes(col);

    // Build the "completed" predicate from whichever columns exist.
    const checks = [];
    if (has('disclosure_completed'))     checks.push("disclosure_completed = 1");
    if (has('fsp_licence_disclosed'))    checks.push("fsp_licence_disclosed IN ('Yes — Written','Yes — Verbal')");
    if (has('broker_identity_disclosed'))checks.push("broker_identity_disclosed = 1");
    if (has('product_costs_disclosed'))  checks.push("product_costs_disclosed = 1");
    if (has('material_risks_disclosed')) checks.push("material_risks_disclosed = 1");
    const completePredicate = checks.length ? checks.join(' AND ') : '1=1';

    const total = db.prepare(
      `SELECT COUNT(*) AS c FROM client_engagements
       WHERE created_at >= date('now','-365 days') ${engScope}`
    ).get(...engScopeParams).c;

    const complete = total
      ? db.prepare(
          `SELECT COUNT(*) AS c FROM client_engagements
           WHERE created_at >= date('now','-365 days')
             AND ${completePredicate}
             ${engScope}`
        ).get(...engScopeParams).c
      : 0;

    const incomplete = total - complete;
    return {
      total,
      complete,
      incomplete,
      completion_rate: total ? Math.round((complete / total) * 100) : null,
    };
  })();

  // Claims metrics ——————————————————————————————————
  const claimsScope = scopedBrokerId ? 'WHERE broker_id = ?' : '';
  const claimsScopeParams = scopedBrokerId ? [scopedBrokerId] : [];
  const claims = {
    repudiation_by_insurer: db.prepare(`
      SELECT p.insurer,
             COUNT(*) AS total,
             SUM(CASE WHEN c.claim_status IN ('Rejected') OR c.repudiation_reason IS NOT NULL THEN 1 ELSE 0 END) AS repudiated
      FROM claims c
      LEFT JOIN policies p ON p.id = c.policy_id
      ${claimsScope}
      ${claimsScope ? 'AND' : 'WHERE'} c.claim_date >= date('now','-365 days')
      GROUP BY p.insurer
      ORDER BY total DESC
      LIMIT 10
    `).all(...claimsScopeParams),
    avg_settlement_days: (() => {
      const row = db.prepare(`
        SELECT AVG(julianday(settlement_date) - julianday(claim_date)) AS avg_days
        FROM claims
        ${claimsScope}
        ${claimsScope ? 'AND' : 'WHERE'} settlement_date IS NOT NULL
      `).get(...claimsScopeParams);
      return row && row.avg_days != null ? Math.round(row.avg_days) : null;
    })(),
    satisfaction_breakdown: db.prepare(`
      SELECT post_claim_satisfaction AS rating, COUNT(*) AS count
      FROM claims
      ${claimsScope}
      ${claimsScope ? 'AND' : 'WHERE'} post_claim_satisfaction IS NOT NULL
      GROUP BY post_claim_satisfaction
    `).all(...claimsScopeParams),
    overall_repudiation_rate: (() => {
      const tot = db.prepare(`
        SELECT COUNT(*) AS c FROM claims
        ${claimsScope}
        ${claimsScope ? 'AND' : 'WHERE'} claim_date >= date('now','-365 days')
      `).get(...claimsScopeParams).c;
      const rep = db.prepare(`
        SELECT COUNT(*) AS c FROM claims
        ${claimsScope}
        ${claimsScope ? 'AND' : 'WHERE'} claim_date >= date('now','-365 days')
          AND (claim_status = 'Rejected' OR repudiation_reason IS NOT NULL)
      `).get(...claimsScopeParams).c;
      return tot ? Math.round((rep / tot) * 100) : 0;
    })(),
    repudiation_by_product: db.prepare(`
      SELECT p.product_category AS product,
             COUNT(*) AS total,
             SUM(CASE WHEN c.claim_status = 'Rejected' OR c.repudiation_reason IS NOT NULL THEN 1 ELSE 0 END) AS repudiated
      FROM claims c
      LEFT JOIN policies p ON p.id = c.policy_id
      ${claimsScope}
      ${claimsScope ? 'AND' : 'WHERE'} c.claim_date >= date('now','-365 days')
      GROUP BY p.product_category
      ORDER BY total DESC
      LIMIT 10
    `).all(...claimsScopeParams),
  };

  // Commission compliance — % of recent commission_log entries marked compliant
  const commission = (() => {
    const scope = scopedBrokerId ? 'WHERE pol.assigned_broker_id = ?' : '';
    const params = scopedBrokerId ? [scopedBrokerId] : [];
    const total = db.prepare(`
      SELECT COUNT(*) AS c
      FROM commission_log cl
      LEFT JOIN policies pol ON pol.id = cl.policy_id
      ${scope}
    `).get(...params).c;
    const compliant = db.prepare(`
      SELECT COUNT(*) AS c
      FROM commission_log cl
      LEFT JOIN policies pol ON pol.id = cl.policy_id
      ${scope}
      ${scope ? 'AND' : 'WHERE'} cl.remuneration_compliant = 'Compliant'
    `).get(...params).c;
    const flagged = db.prepare(`
      SELECT COUNT(*) AS c
      FROM commission_log cl
      LEFT JOIN policies pol ON pol.id = cl.policy_id
      ${scope}
      ${scope ? 'AND' : 'WHERE'} cl.remuneration_compliant = 'Non-compliant'
    `).get(...params).c;
    return {
      total,
      compliant,
      flagged,
      compliance_rate: total ? Math.round((compliant / total) * 100) : 100,
    };
  })();

  // Post-sale barrier incidents ——————————————————————
  const postSale = (() => {
    const scope = scopedBrokerId ? 'WHERE pol.assigned_broker_id = ?' : '';
    const params = scopedBrokerId ? [scopedBrokerId] : [];
    const total = db.prepare(`
      SELECT COUNT(*) AS c
      FROM post_sale_events pse
      LEFT JOIN policies pol ON pol.id = pse.policy_id
      ${scope}
      ${scope ? 'AND' : 'WHERE'} pse.event_date >= date('now','-90 days')
    `).get(...params).c;
    const barriers = db.prepare(`
      SELECT COUNT(*) AS c
      FROM post_sale_events pse
      LEFT JOIN policies pol ON pol.id = pse.policy_id
      ${scope}
      ${scope ? 'AND' : 'WHERE'} pse.event_date >= date('now','-90 days') AND pse.barrier_flagged = 1
    `).get(...params).c;
    // Lapse-reason MI for TCF Outcome 6 — last 12 months, broker-scoped
    const lapseReasons = db.prepare(`
      SELECT COALESCE(NULLIF(TRIM(pse.lapse_reason), ''), 'Unspecified') AS reason,
             COUNT(*) AS count
      FROM post_sale_events pse
      LEFT JOIN policies pol ON pol.id = pse.policy_id
      ${scope}
      ${scope ? 'AND' : 'WHERE'} pse.event_type = 'Policy lapse'
        AND pse.event_date >= date('now','-365 days')
      GROUP BY reason
      ORDER BY count DESC
    `).all(...params);
    return { total, barriers, lapse_reasons: lapseReasons };
  })();

  // Broker CPD compliance ———————————————————————————
  const cpd = (() => {
    const cycleRow = db.prepare(`SELECT strftime('%Y', 'now') AS y, strftime('%m', 'now') AS m`).get();
    const currentYear = parseInt(cycleRow.m, 10) >= 6 ? parseInt(cycleRow.y, 10) : parseInt(cycleRow.y, 10) - 1;
    const cycle = `${currentYear}-06 – ${currentYear + 1}-05`;
    const brokers = db.prepare(`
      SELECT bp.id, bp.user_id, u.full_name,
             COALESCE((SELECT SUM(points_awarded) FROM cpd_activities WHERE broker_profile_id = bp.id AND cpd_cycle = ?), 0) AS points
      FROM broker_profiles bp
      LEFT JOIN users u ON u.id = bp.user_id
    `).all(cycle);
    const onTrack = brokers.filter(b => b.points >= 14).length;
    const atRisk = brokers.filter(b => b.points >= 8 && b.points < 14).length;
    const critical = brokers.filter(b => b.points < 8).length;
    return { cycle, total_brokers: brokers.length, on_track: onTrack, at_risk: atRisk, critical, brokers };
  })();

  // POPIA compliance rate —————————————————————————————
  const popia = (() => {
    const total = db.prepare(`SELECT COUNT(*) AS c FROM contacts WHERE contact_status = 'Active Client' AND ${NOT_SUPPLIER}`).get().c;
    const complete = db.prepare(`
      SELECT COUNT(*) AS c FROM contacts
      WHERE contact_status = 'Active Client'
        AND ${NOT_SUPPLIER}
        AND data_processing_basis IS NOT NULL
        AND data_source IS NOT NULL
        AND data_categories_held IS NOT NULL
        AND information_officer_id IS NOT NULL
        AND privacy_notice_provided = 1
    `).get().c;
    const pendingDsr = db.prepare(`SELECT COUNT(*) AS c FROM data_subject_requests WHERE status != 'Completed'`).get().c;
    return {
      compliance_rate: total ? Math.round((complete / total) * 100) : 100,
      total,
      complete,
      pending_dsr: pendingDsr,
    };
  })();

  // FICA compliance rate ——————————————————————————————
  const fica = (() => {
    const total = db.prepare(`SELECT COUNT(*) AS c FROM contacts WHERE contact_status = 'Active Client' AND ${NOT_SUPPLIER}`).get().c;
    const verified = db.prepare(`
      SELECT COUNT(*) AS c FROM contacts
      WHERE contact_status = 'Active Client'
        AND ${NOT_SUPPLIER}
        AND fica_verification_date IS NOT NULL
        AND (fica_five_year_expiry IS NULL OR fica_five_year_expiry >= date('now'))
    `).get().c;
    return { compliance_rate: total ? Math.round((verified / total) * 100) : 100, total, verified };
  })();

  // Overdue reviews —————————————————————————————————————
  const overdueReviews = (() => {
    const scope = scopedBrokerId ? 'AND assigned_broker_id = ?' : '';
    const params = scopedBrokerId ? [scopedBrokerId] : [];
    return db.prepare(`
      SELECT COUNT(*) AS c FROM contacts
      WHERE contact_status = 'Active Client'
        AND ${NOT_SUPPLIER}
        AND (last_review_date IS NULL OR last_review_date < date('now','-365 days'))
        ${scope}
    `).get(...params).c;
  })();

  res.json({
    complaints,
    roa,
    presale,
    claims,
    commission,
    post_sale: postSale,
    cpd,
    popia,
    fica,
    overdue_reviews: overdueReviews,
    generated_at: new Date().toISOString(),
    scope: scopedBrokerId ? 'broker' : 'organisation',
    user_role: req.session.userRole,
  });
});

// GET /evidence-pack — FSCA Evidence Pack PDF (last 12 months)
router.get('/evidence-pack', async (req, res) => {
  const db = getDb();
  const PDFDocument = require('pdfkit');
  const path = require('path');
  const fs = require('fs');

  try {
    // Re-run the metrics query inline for the PDF
    const metricsReq = { ...req };
    metricsReq.session = req.session;
    const metricsRes = {};

    const chunks = [];
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.on('data', c => chunks.push(c));

    await new Promise((resolve, reject) => {
      doc.on('end', resolve);
      doc.on('error', reject);

      // ── Brokerage details (from system_settings if present)
      const settingRows = db.prepare("SELECT key, value FROM system_settings").all();
      const settings = {};
      settingRows.forEach(s => { try { settings[s.key] = JSON.parse(s.value); } catch (_) { settings[s.key] = s.value; } });
      const brokerageName    = settings.brokerage_name    || settings.smtp_from || 'Inexpro CRM Brokerage';
      const brokerageAddress = settings.brokerage_address || '';
      const fspNumber        = settings.fsp_number        || settings.fsca_fsp_number || '';
      const periodLabel      = req.query.period === 'ytd' ? 'Year to date' : 'Last 12 months';
      const sinceClause      = `date('now','-365 days')`;

      // ── Cover page (uses the same letterhead as the ROA PDF)
      const PAGE_W = 595.28; // A4 width in pt
      const letterheadPath = path.join(__dirname, '../../client/public/letterhead-ROA.png');
      let coverContentY = 50;
      if (fs.existsSync(letterheadPath)) {
        try {
          const imgData = fs.readFileSync(letterheadPath);
          const imgW = imgData.readUInt32BE(16);
          const imgH = imgData.readUInt32BE(20);
          const renderedH = (imgH / imgW) * PAGE_W;
          doc.image(letterheadPath, 0, 0, { width: PAGE_W });
          coverContentY = renderedH + 24;
        } catch (_) {
          const logoPath = path.join(__dirname, '../../client/public/logo.png');
          if (fs.existsSync(logoPath)) doc.image(logoPath, 40, 40, { width: 150 });
        }
      } else {
        const logoPath = path.join(__dirname, '../../client/public/logo.png');
        if (fs.existsSync(logoPath)) doc.image(logoPath, 40, 40, { width: 150 });
      }

      doc.fontSize(24).fillColor('#1a5276').font('Helvetica-Bold')
        .text('FSCA Evidence Pack', 40, coverContentY);
      doc.fontSize(14).fillColor('#555').font('Helvetica')
        .text('Treating Customers Fairly — Outcomes Evidence', 40, coverContentY + 35);
      doc.fontSize(10).fillColor('#222').font('Helvetica-Bold')
        .text(brokerageName, 40, coverContentY + 75);
      doc.font('Helvetica').fillColor('#444')
        .text(brokerageAddress || '', 40, coverContentY + 90);
      if (fspNumber) doc.text(`FSP No: ${fspNumber}`, 40, coverContentY + 105);
      doc.fillColor('#666')
        .text(`Generated: ${new Date().toLocaleString('en-ZA')}`, 40, coverContentY + 130)
        .text(`Period: ${periodLabel}`, 40, coverContentY + 145)
        .text(`Prepared by: ${req.session.userName || 'Compliance'}`, 40, coverContentY + 160);
      doc.fontSize(8).fillColor('#999').font('Helvetica-Oblique')
        .text('This document is the official Treating Customers Fairly evidence pack drawn from the Inexpro CRM. All figures are reproducible from the audit trail.',
              40, 750, { width: 515, align: 'center' });

      // ── Helper: scoring
      const scoreBadge = (pct) => {
        if (pct == null) return { label: 'N/A',  colour: '#7f8c8d' };
        if (pct >= 95)   return { label: 'A',    colour: '#1a7a3a' };
        if (pct >= 85)   return { label: 'B',    colour: '#27ae60' };
        if (pct >= 70)   return { label: 'C',    colour: '#b78105' };
        if (pct >= 50)   return { label: 'D',    colour: '#e67e22' };
        return              { label: 'F',    colour: '#a71d2a' };
      };

      // Pull scores once, reuse on summary + per-outcome pages
      const scoped = getBrokerId(req);
      const cmpScope = scoped ? 'AND broker_id = ?' : '';
      const p = scoped ? [scoped] : [];

      const totalComplaints12 = db.prepare(`SELECT COUNT(*) AS c FROM complaints WHERE complaint_date >= ${sinceClause} ${cmpScope}`).get(...p).c;
      const resolved30        = db.prepare(`SELECT COUNT(*) AS c FROM complaints WHERE complaint_date >= ${sinceClause} AND resolution_date IS NOT NULL AND julianday(resolution_date) - julianday(complaint_date) <= 30 ${cmpScope}`).get(...p).c;
      const cmpScore = totalComplaints12 ? Math.round(resolved30 / totalComplaints12 * 100) : 100;

      const totalSuit = db.prepare(`SELECT COUNT(*) AS c FROM advice_records WHERE advice_date >= ${sinceClause} AND suitability_match_score IS NOT NULL`).get().c;
      const matchSuit = db.prepare(`SELECT COUNT(*) AS c FROM advice_records WHERE advice_date >= ${sinceClause} AND suitability_match_score = 'Match'`).get().c;
      const suitScore = totalSuit ? Math.round(matchSuit / totalSuit * 100) : 100;

      const totalEng12   = db.prepare(`SELECT COUNT(*) AS c FROM client_engagements WHERE created_at >= ${sinceClause}`).get().c;
      const completeEng  = db.prepare(`SELECT COUNT(*) AS c FROM client_engagements WHERE created_at >= ${sinceClause} AND fsp_licence_disclosed IS NOT NULL AND broker_identity_disclosed = 1 AND product_costs_disclosed = 1 AND material_risks_disclosed = 1 AND disclosure_method IS NOT NULL`).get().c;
      const presaleScore = totalEng12 ? Math.round(completeEng / totalEng12 * 100) : 100;

      const totalRoa12  = db.prepare(`SELECT COUNT(*) AS c FROM advice_records WHERE advice_date >= ${sinceClause}`).get().c;
      const completeRoa = db.prepare(`SELECT COUNT(*) AS c FROM advice_records WHERE advice_date >= ${sinceClause} AND roa_completed = 1`).get().c;
      const adviceScore = totalRoa12 ? Math.round(completeRoa / totalRoa12 * 100) : 100;

      const totalClaims12 = db.prepare(`SELECT COUNT(*) AS c FROM claims WHERE claim_date >= ${sinceClause}`).get().c;
      const repudiated12  = db.prepare(`SELECT COUNT(*) AS c FROM claims WHERE claim_date >= ${sinceClause} AND (claim_status = 'Rejected' OR repudiation_reason IS NOT NULL)`).get().c;
      const repudRate     = totalClaims12 ? Math.round(repudiated12 / totalClaims12 * 100) : 0;
      const performanceScore = 100 - repudRate;

      const totalPostSale12 = db.prepare(`SELECT COUNT(*) AS c FROM post_sale_events WHERE event_date >= ${sinceClause}`).get().c;
      const barriersCnt     = db.prepare(`SELECT COUNT(*) AS c FROM post_sale_events WHERE event_date >= ${sinceClause} AND barrier_flagged = 1`).get().c;
      const barrierRate     = totalPostSale12 ? Math.round(barriersCnt / totalPostSale12 * 100) : 0;
      const postSaleScore   = 100 - barrierRate;

      // ── Executive Summary page ──
      doc.addPage();
      doc.fontSize(20).fillColor('#1a5276').font('Helvetica-Bold')
        .text('Executive Summary', 40, 50);
      doc.moveTo(40, 80).lineTo(555, 80).strokeColor('#1a5276').lineWidth(1.5).stroke();
      doc.fontSize(10).fillColor('#444').font('Helvetica')
        .text(`Period: ${periodLabel}. Six TCF outcome scores below; full detail follows on the per-outcome pages.`,
              40, 92, { width: 515 });

      const outcomeRows = [
        { num: 1, name: 'Culture & Complaints',    score: cmpScore },
        { num: 2, name: 'Product Suitability',     score: suitScore },
        { num: 3, name: 'Pre-Sale Disclosure',     score: presaleScore },
        { num: 4, name: 'Suitable Advice',         score: adviceScore },
        { num: 5, name: 'Product Performance',     score: performanceScore },
        { num: 6, name: 'Post-Sale Barriers',      score: postSaleScore },
      ];
      let yy = 130;
      doc.fontSize(11).fillColor('#222').font('Helvetica-Bold');
      doc.text('Outcome', 50, yy);
      doc.text('Score',   430, yy);
      doc.text('Grade',   500, yy);
      yy += 18;
      doc.moveTo(40, yy).lineTo(555, yy).strokeColor('#ddd').lineWidth(0.5).stroke();
      yy += 6;
      outcomeRows.forEach(r => {
        const b = scoreBadge(r.score);
        doc.font('Helvetica').fillColor('#222').fontSize(11)
          .text(`Outcome ${r.num} — ${r.name}`, 50, yy)
          .text(`${r.score}%`, 430, yy)
          .fillColor(b.colour).font('Helvetica-Bold')
          .text(b.label, 500, yy);
        yy += 22;
      });

      // ── Outcome 1 ──
      doc.addPage();
      doc.fontSize(18).fillColor('#1a5276').font('Helvetica-Bold')
        .text('Outcome 1 — Culture & Complaints', 40, 50);
      doc.moveTo(40, 75).lineTo(555, 75).strokeColor('#ccc').lineWidth(1).stroke();

      const totalComplaints = db.prepare(`SELECT COUNT(*) AS c FROM complaints WHERE complaint_date >= date('now','-365 days') ${cmpScope}`).get(...p).c;
      const resolvedComplaints = db.prepare(`SELECT COUNT(*) AS c FROM complaints WHERE complaint_date >= date('now','-365 days') AND complaint_status IN ('Resolved','Closed') ${cmpScope}`).get(...p).c;
      doc.fontSize(11).fillColor('#222').font('Helvetica')
        .text(`Total complaints (12 months): ${totalComplaints}`, 40, 90)
        .text(`Resolved complaints: ${resolvedComplaints}`, 40, 108)
        .text(`Resolution rate: ${totalComplaints ? Math.round(resolvedComplaints / totalComplaints * 100) : 100}%`, 40, 126);

      doc.fontSize(18).fillColor('#1a5276').font('Helvetica-Bold')
        .text('Outcome 2 — Product Suitability', 40, 170);
      doc.moveTo(40, 195).lineTo(555, 195).strokeColor('#ccc').lineWidth(1).stroke();

      const suitRow = db.prepare(`SELECT suitability_match_score, COUNT(*) AS c FROM advice_records WHERE advice_date >= date('now','-365 days') GROUP BY suitability_match_score`).all();
      let suitY = 210;
      suitRow.forEach(r => {
        doc.fontSize(11).fillColor('#222').font('Helvetica')
          .text(`${r.suitability_match_score || '—'}: ${r.c} ROAs`, 40, suitY);
        suitY += 18;
      });

      doc.addPage();
      doc.fontSize(18).fillColor('#1a5276').font('Helvetica-Bold')
        .text('Outcome 3 — Pre-Sale Disclosure', 40, 50);
      doc.moveTo(40, 75).lineTo(555, 75).strokeColor('#ccc').lineWidth(1).stroke();

      doc.fontSize(11).fillColor('#222').font('Helvetica')
        .text(`Total engagements: ${totalEng12}`, 40, 90)
        .text(`Engagements with completed disclosure: ${completeEng}`, 40, 108)
        .text(`Disclosure completion rate: ${presaleScore}%`, 40, 126);

      doc.fontSize(18).fillColor('#1a5276').font('Helvetica-Bold')
        .text('Outcome 4 — Suitable Advice', 40, 170);
      doc.moveTo(40, 195).lineTo(555, 195).strokeColor('#ccc').lineWidth(1).stroke();
      const coiDeclared = db.prepare(`SELECT COUNT(*) AS c FROM advice_records WHERE advice_date >= ${sinceClause} AND conflict_of_interest_flag IS NOT NULL`).get().c;
      doc.fontSize(11).fillColor('#222').font('Helvetica')
        .text(`Total ROAs: ${totalRoa12}`, 40, 210)
        .text(`Completed ROAs: ${completeRoa}`, 40, 228)
        .text(`COI declarations recorded: ${coiDeclared}`, 40, 246)
        .text(`ROA completion rate: ${adviceScore}%`, 40, 264);

      doc.addPage();
      doc.fontSize(18).fillColor('#1a5276').font('Helvetica-Bold')
        .text('Outcome 5 — Product Performance', 40, 50);
      doc.moveTo(40, 75).lineTo(555, 75).strokeColor('#ccc').lineWidth(1).stroke();
      const avgSettlement = db.prepare(`SELECT AVG(julianday(settlement_date) - julianday(claim_date)) AS d FROM claims WHERE settlement_date IS NOT NULL AND claim_date >= ${sinceClause}`).get().d;
      doc.fontSize(11).fillColor('#222').font('Helvetica')
        .text(`Total claims: ${totalClaims12}`, 40, 90)
        .text(`Repudiated claims: ${repudiated12}`, 40, 108)
        .text(`Repudiation rate: ${repudRate}%`, 40, 126)
        .text(`Average settlement days: ${avgSettlement ? Math.round(avgSettlement) : 'n/a'}`, 40, 144);

      doc.fontSize(18).fillColor('#1a5276').font('Helvetica-Bold')
        .text('Outcome 6 — Post-Sale Barriers', 40, 190);
      doc.moveTo(40, 215).lineTo(555, 215).strokeColor('#ccc').lineWidth(1).stroke();
      doc.fontSize(11).fillColor('#222').font('Helvetica')
        .text(`Total post-sale events: ${totalPostSale12}`, 40, 230)
        .text(`Events with barrier flagged: ${barriersCnt}`, 40, 248)
        .text(`Barrier incidents: ${barrierRate}%`, 40, 266);

      // ── Complaints Register ──
      doc.addPage();
      doc.fontSize(18).fillColor('#1a5276').font('Helvetica-Bold')
        .text('Complaints Register Summary', 40, 50);
      doc.moveTo(40, 75).lineTo(555, 75).strokeColor('#ccc').lineWidth(1).stroke();

      const complaintsByCat = db.prepare(`
        SELECT complaint_category AS cat, COUNT(*) AS total,
               SUM(CASE WHEN complaint_status IN ('Resolved','Closed') THEN 1 ELSE 0 END) AS resolved
        FROM complaints WHERE complaint_date >= ${sinceClause}
        GROUP BY complaint_category
        ORDER BY total DESC
      `).all();
      const complaintsBySev = db.prepare(`
        SELECT severity_rating AS sev, COUNT(*) AS total
        FROM complaints WHERE complaint_date >= ${sinceClause}
        GROUP BY severity_rating
      `).all();

      doc.fontSize(11).fillColor('#222').font('Helvetica')
        .text(`Total complaints (12 months): ${totalComplaints12}`, 40, 90)
        .text(`Resolved within 30 days: ${resolved30} (${cmpScore}%)`, 40, 108);

      doc.fontSize(11).fillColor('#1a5276').font('Helvetica-Bold').text('By category', 40, 140);
      let cy = 160;
      doc.fontSize(10).font('Helvetica').fillColor('#222');
      doc.text('Category', 50, cy); doc.text('Total', 380, cy); doc.text('Resolved', 460, cy);
      cy += 14;
      doc.moveTo(40, cy).lineTo(555, cy).strokeColor('#ddd').lineWidth(0.5).stroke();
      cy += 4;
      (complaintsByCat.length ? complaintsByCat : [{ cat: '—', total: 0, resolved: 0 }]).forEach(c => {
        doc.text(c.cat || '—', 50, cy);
        doc.text(String(c.total || 0), 380, cy);
        doc.text(String(c.resolved || 0), 460, cy);
        cy += 16;
      });

      doc.fontSize(11).fillColor('#1a5276').font('Helvetica-Bold').text('By severity', 40, cy + 14);
      let sy = cy + 36;
      doc.fontSize(10).font('Helvetica').fillColor('#222');
      (complaintsBySev.length ? complaintsBySev : [{ sev: '—', total: 0 }]).forEach(s => {
        doc.text(`${s.sev || '—'}: ${s.total || 0}`, 50, sy);
        sy += 14;
      });

      // ── Broker Fitness Summary ──
      doc.addPage();
      doc.fontSize(18).fillColor('#1a5276').font('Helvetica-Bold')
        .text('Broker Fitness Summary', 40, 50);
      doc.moveTo(40, 75).lineTo(555, 75).strokeColor('#ccc').lineWidth(1).stroke();

      const cycleRow = db.prepare(`SELECT strftime('%Y','now') AS y, strftime('%m','now') AS m`).get();
      const cy0 = parseInt(cycleRow.m, 10) >= 6 ? parseInt(cycleRow.y, 10) : parseInt(cycleRow.y, 10) - 1;
      const cycle = `${cy0}-06 – ${cy0 + 1}-05`;
      const brokers = db.prepare(`
        SELECT u.full_name,
               bp.fsca_registration_number,
               bp.re5_status,
               bp.re5_deadline,
               bp.good_standing_status,
               bp.suspended_from_advice,
               COALESCE((SELECT SUM(points_awarded) FROM cpd_activities WHERE broker_profile_id = bp.id AND cpd_cycle = ?), 0) AS cpd_points
        FROM broker_profiles bp
        LEFT JOIN users u ON u.id = bp.user_id
        ORDER BY u.full_name COLLATE NOCASE
      `).all(cycle);

      doc.fontSize(11).fillColor('#222').font('Helvetica')
        .text(`Current CPD cycle: ${cycle}. Brokers below show CPD points and Fit & Proper status.`, 40, 90);

      let by = 120;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#222');
      doc.text('Broker',          50,  by);
      doc.text('FSP No',          200, by);
      doc.text('CPD pts',         310, by);
      doc.text('RE5',             365, by);
      doc.text('Standing',        430, by);
      doc.text('Status',          510, by);
      by += 12;
      doc.moveTo(40, by).lineTo(555, by).strokeColor('#ddd').lineWidth(0.5).stroke();
      by += 4;
      doc.font('Helvetica');
      brokers.forEach(b => {
        if (by > 760) { doc.addPage(); by = 50; }
        doc.fillColor('#222')
          .text(b.full_name || '—', 50, by, { width: 145, ellipsis: true })
          .text(b.fsca_registration_number || '—', 200, by, { width: 105, ellipsis: true });
        const ptsCol = b.cpd_points >= 14 ? '#1a7a3a' : b.cpd_points >= 8 ? '#b78105' : '#a71d2a';
        doc.fillColor(ptsCol).text(String(b.cpd_points), 310, by);
        doc.fillColor('#222').text(b.re5_status || '—', 365, by, { width: 60, ellipsis: true })
          .text(b.good_standing_status || '—', 430, by, { width: 75, ellipsis: true })
          .text(b.suspended_from_advice ? 'SUSPENDED' : 'OK', 510, by);
        by += 14;
      });

      // ── POPIA Compliance Status ──
      doc.addPage();
      doc.fontSize(18).fillColor('#1a5276').font('Helvetica-Bold')
        .text('POPIA Compliance Status', 40, 50);
      doc.moveTo(40, 75).lineTo(555, 75).strokeColor('#ccc').lineWidth(1).stroke();

      const popContacts = db.prepare(`SELECT COUNT(*) AS c FROM contacts WHERE contact_status = 'Active Client' AND ${NOT_SUPPLIER}`).get().c;
      const popComplete = db.prepare(`SELECT COUNT(*) AS c FROM contacts WHERE contact_status = 'Active Client' AND ${NOT_SUPPLIER} AND data_processing_basis IS NOT NULL`).get().c;
      const popMissing  = popContacts - popComplete;
      const popDsr      = db.prepare(`SELECT COUNT(*) AS c FROM data_subject_requests WHERE status NOT IN ('Completed','Closed')`).get().c;
      const popOverdue  = db.prepare(`SELECT COUNT(*) AS c FROM data_subject_requests WHERE status NOT IN ('Completed','Closed') AND target_completion_date < date('now')`).get().c;
      const popExpiring = db.prepare(`SELECT COUNT(*) AS c FROM contacts WHERE retention_expiry_date IS NOT NULL AND date(retention_expiry_date) <= date('now','+30 days') AND ${NOT_SUPPLIER}`).get().c;
      const ficaTotal   = db.prepare(`SELECT COUNT(*) AS c FROM contacts WHERE contact_status = 'Active Client' AND ${NOT_SUPPLIER}`).get().c;
      const ficaVerified= db.prepare(`SELECT COUNT(*) AS c FROM contacts WHERE contact_status = 'Active Client' AND ${NOT_SUPPLIER} AND fica_verification_date IS NOT NULL AND (fica_five_year_expiry IS NULL OR fica_five_year_expiry >= date('now'))`).get().c;
      const popRate     = popContacts ? Math.round(popComplete / popContacts * 100) : 100;
      const ficaRate    = ficaTotal   ? Math.round(ficaVerified / ficaTotal * 100) : 100;
      const popBadge    = scoreBadge(popRate);
      const ficaBadge_  = scoreBadge(ficaRate);

      doc.fontSize(11).fillColor('#222').font('Helvetica')
        .text(`Active clients: ${popContacts}`, 40, 92)
        .text(`POPIA records complete: ${popComplete}   (Compliance rate: ${popRate}%)`, 40, 110)
        .fillColor(popBadge.colour).font('Helvetica-Bold')
        .text(`POPIA grade: ${popBadge.label}`, 40, 128)
        .fillColor('#222').font('Helvetica')
        .text(`POPIA records missing basis: ${popMissing}`, 40, 146)
        .text(`Active data-subject requests: ${popDsr}   (overdue: ${popOverdue})`, 40, 164)
        .text(`Records with retention expiring within 30 days: ${popExpiring}`, 40, 182);

      doc.fontSize(11).fillColor('#1a5276').font('Helvetica-Bold').text('FICA', 40, 220);
      doc.fontSize(11).fillColor('#222').font('Helvetica')
        .text(`Active clients with current FICA verification: ${ficaVerified} / ${ficaTotal} (${ficaRate}%)`, 40, 240)
        .fillColor(ficaBadge_.colour).font('Helvetica-Bold')
        .text(`FICA grade: ${ficaBadge_.label}`, 40, 258);

      doc.fontSize(9).fillColor('#999').font('Helvetica-Oblique')
        .text('This document is a system-generated Evidence Pack for FSCA supervisory engagements. All figures are drawn from the Inexpro CRM audit trail.',
              40, 760, { width: 515, align: 'center' });

      doc.end();
    });

    const buf = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="FSCA-Evidence-Pack-${new Date().toISOString().slice(0,10)}.pdf"`);
    res.send(buf);

    res.locals && res.locals.logAudit && res.locals.logAudit({
      action:   'EXPORT',
      module:   'tcf_evidence_pack',
      description: 'FSCA Evidence Pack PDF generated'
    });
  } catch (err) {
    console.error('Evidence Pack error:', err.message);
    res.status(500).json({ error: 'Failed to generate evidence pack' });
  }
});

module.exports = router;
