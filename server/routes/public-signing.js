'use strict';

// Public (no-auth) signing endpoints. The client clicks the link in the
// email → GET /sign/:token renders an HTML page they can read + sign.
// POST /sign/:token accepts the typed name, marketing consent, and the
// signature image (base64 PNG from a canvas). The server generates a
// signed PDF, stores it in the documents table (linked to the contact /
// account / policy from the request), and marks the request as signed.

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { getDb } = require('../db/database');
const { getTemplate, applyPlaceholders } = require('../lib/signable-templates');
const { writeEncryptedFile } = require('../lib/file-encryption');

// Resolve the upload root the same way the documents route does so the
// signed PDF lands beside other client documents.
function uploadRoot() {
  return process.env.UPLOAD_PATH
    ? path.resolve(process.env.UPLOAD_PATH)
    : path.resolve(__dirname, '..', '..', 'client', 'uploads');
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── GET /sign/:token — render the public signing page ─────────
router.get('/:token', (req, res) => {
  const db = getDb();
  const sr = db.prepare('SELECT * FROM signature_requests WHERE token = ?').get(req.params.token);
  if (!sr) {
    return res.status(404).type('html').send(renderMessage('Link not found',
      'This signing link is invalid. Please contact your broker for a new one.'));
  }
  if (sr.status === 'signed') {
    return res.type('html').send(renderMessage('Already signed',
      'Thank you — this document has already been signed and submitted.'));
  }
  if (sr.status !== 'pending') {
    return res.status(410).type('html').send(renderMessage('Link expired',
      'This signing link is no longer valid. Please contact your broker for a new one.'));
  }
  if (sr.expires_at && new Date(sr.expires_at) < new Date()) {
    return res.status(410).type('html').send(renderMessage('Link expired',
      'This signing link has expired. Please contact your broker for a new one.'));
  }

  const tpl = getTemplate(sr.template_key);
  if (!tpl) {
    return res.status(500).type('html').send(renderMessage('Template missing',
      'The document template is no longer available. Please contact your broker.'));
  }

  // Build placeholder context from the linked contact / account.
  const ph = buildPlaceholders(db, sr);

  // Dynamic templates (GIT Confirmation) build their body from the
  // form_data the broker captured at request-creation time, rather than
  // a static HTML template.
  let bodyHtml;
  let footerHtml;
  if (tpl.dynamic) {
    let formData = {};
    try { formData = sr.form_data ? JSON.parse(sr.form_data) : {}; } catch (_) {}
    if (sr.template_key === 'git_confirmation') {
      bodyHtml   = renderGitConfirmationHtml(formData);
      footerHtml = '';
    } else if (sr.template_key === 'roa_confirmation') {
      bodyHtml   = renderRoaSigningHtml(db, formData);
      footerHtml = '';
    } else {
      bodyHtml   = '<p>This document is ready for your signature.</p>';
      footerHtml = '';
    }
  } else {
    bodyHtml   = applyPlaceholders(tpl.bodyHtml,   ph);
    footerHtml = applyPlaceholders(tpl.footerHtml, ph);
  }

  res.type('html').send(renderSigningPage({
    token: sr.token,
    title: tpl.title,
    bodyHtml,
    footerHtml,
    hasMarketingConsent: !!tpl.hasMarketingConsent,
    // Always render the signer-name field blank so the client must type
    // their own name. Pre-filling from the contact record meant most
    // clients clicked through with the policy-holder name still in the
    // box, which then ended up on the signed PDF audit trail instead of
    // their actual typed name.
    prefillName: '',
  }));
});

// ─── POST /sign/:token — accept the signed submission ──────────
router.post('/:token', express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const db = getDb();
    const sr = db.prepare('SELECT * FROM signature_requests WHERE token = ?').get(req.params.token);
    if (!sr || sr.status !== 'pending') {
      return res.status(404).json({ error: 'Request not found or already signed' });
    }
    if (sr.expires_at && new Date(sr.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Signing link expired' });
    }

    const tpl = getTemplate(sr.template_key);
    if (!tpl) return res.status(500).json({ error: 'Template missing' });

    const { signer_name, marketing_consent, signature_png_base64 } = req.body || {};
    if (!signer_name || !String(signer_name).trim()) {
      return res.status(400).json({ error: 'Full name is required' });
    }
    if (!signature_png_base64) {
      return res.status(400).json({ error: 'Signature is required' });
    }

    const sigB64 = String(signature_png_base64).replace(/^data:image\/png;base64,/i, '');
    let signatureBuf;
    try { signatureBuf = Buffer.from(sigB64, 'base64'); }
    catch (_) { return res.status(400).json({ error: 'Invalid signature image' }); }

    const ph = buildPlaceholders(db, sr);
    const signedAt = new Date();
    const signedIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    const signedUa = (req.headers['user-agent'] || '').slice(0, 240);

    // Generate the signed PDF. GIT Confirmation uses its own (shared)
    // renderer that re-creates the broker's letter from form_data and
    // appends a final Acknowledgement page carrying the signature image.
    // Other (static-template) requests go through renderSignedPdf as before.
    let pdfBuffer;
    if (sr.template_key === 'git_confirmation') {
      const { renderGitConfirmationPdf } = require('../lib/git-confirmation-pdf');
      let formData = {};
      try { formData = sr.form_data ? JSON.parse(sr.form_data) : {}; } catch (_) {}
      const policy = sr.policy_id
        ? db.prepare('SELECT * FROM policies WHERE id = ?').get(sr.policy_id) || {}
        : {};
      pdfBuffer = await renderGitConfirmationPdf({
        policy,
        body:      formData,
        signature: {
          buf:        signatureBuf,
          signerName: String(signer_name).trim(),
          signedAt, signedIp, signedUa,
        },
      });
    } else if (sr.template_key === 'roa_confirmation') {
      const { renderRoaPdf } = require('../lib/roa-pdf');
      let formData = {};
      try { formData = sr.form_data ? JSON.parse(sr.form_data) : {}; } catch (_) {}
      const roa = formData.advice_record_id
        ? db.prepare(`
            SELECT ar.*,
                   (c.first_name || ' ' || c.last_name) AS contact_name,
                   a.account_name,
                   b.full_name AS broker_name,
                   p.policy_name
            FROM advice_records ar
            LEFT JOIN contacts c ON c.id = ar.contact_id
            LEFT JOIN accounts a ON a.id = ar.account_id
            LEFT JOIN users    b ON b.id = ar.broker_id
            LEFT JOIN policies p ON p.id = ar.policy_id
            WHERE ar.id = ?
          `).get(formData.advice_record_id) || {}
        : {};
      pdfBuffer = await renderRoaPdf({
        roa,
        signature: {
          buf:        signatureBuf,
          signerName: String(signer_name).trim(),
          signedAt, signedIp, signedUa,
        },
      });
    } else {
      pdfBuffer = await renderSignedPdf({
        tpl,
        placeholders: ph,
        answers: {
          signerName:        String(signer_name).trim(),
          marketingConsent:  marketing_consent === true || marketing_consent === 'yes' || marketing_consent === 1,
          marketingProvided: marketing_consent !== undefined && marketing_consent !== null && marketing_consent !== '',
          signatureBuf,
          signedAt, signedIp, signedUa,
        },
      });
    }

    // Persist the PDF to disk (encrypted) and create a documents row.
    const root = uploadRoot();
    const subdir = sr.contact_id ? path.join('contacts', String(sr.contact_id))
                  : sr.account_id ? path.join('accounts', String(sr.account_id))
                  : 'signature-requests';
    fs.mkdirSync(path.join(root, subdir), { recursive: true });
    const fileBaseName = `${tpl.key}-${uuidv4()}.pdf`;
    const relPath = path.join(subdir, fileBaseName).replace(/\\/g, '/');
    const absPath = path.join(root, relPath);
    writeEncryptedFile(absPath, pdfBuffer);

    // Friendly download filename: "POPIA Consent - <Client Name>.pdf".
    // Prefer the name the client typed at sign time (authoritative —
    // that's the name they actually signed as); fall back to the contact /
    // account name from the placeholder context. Sanitise to keep it
    // filesystem- and HTTP-header-safe.
    const sanitiseFilename = (s) =>
      String(s || '')
        .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')   // strip path/header-unsafe chars
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
    const clientNameForFile = sanitiseFilename(signer_name)
      || sanitiseFilename(ph.client_name)
      || 'Client';
    const friendlyFilename =
        sr.template_key === 'git_confirmation' ? `GIT Confirmation - ${clientNameForFile}.pdf`
      : sr.template_key === 'roa_confirmation' ? `Record of Advice - ${clientNameForFile}.pdf`
      : `POPIA Consent - ${clientNameForFile}.pdf`;

    // For ROA-template requests we also link the signed PDF to the
    // advice_record itself, so the document surfaces under the ROA's
    // Documents tab — not just the contact / account / policy.
    let adviceRecordId = null;
    if (sr.template_key === 'roa_confirmation') {
      try {
        const fd = sr.form_data ? JSON.parse(sr.form_data) : {};
        if (fd && fd.advice_record_id) adviceRecordId = parseInt(fd.advice_record_id, 10) || null;
      } catch (_) {}
    }

    const docResult = db.prepare(`
      INSERT INTO documents (
        contact_id, account_id, policy_id, advice_record_id,
        file_name, original_name, file_type, file_path, file_size,
        description, uploaded_by, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      sr.contact_id, sr.account_id, sr.policy_id, adviceRecordId,
      fileBaseName, friendlyFilename,
      'application/pdf',
      relPath, pdfBuffer.length,
      tpl.description || `${tpl.label} — signed by client`,
      sr.created_by
    );
    const documentId = docResult.lastInsertRowid;

    // Mark the request signed.
    db.prepare(`
      UPDATE signature_requests
      SET status='signed',
          signed_at=CURRENT_TIMESTAMP,
          signed_ip=?, signed_user_agent=?,
          signer_typed_name=?, marketing_consent=?,
          document_id=?
      WHERE id=?
    `).run(
      (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim(),
      (req.headers['user-agent'] || '').slice(0, 240),
      String(signer_name).trim(),
      marketing_consent === true || marketing_consent === 'yes' || marketing_consent === 1 ? 1
        : marketing_consent === false || marketing_consent === 'no' || marketing_consent === 0 ? 0
        : null,
      documentId,
      sr.id
    );

    // Audit log — best-effort, no req.session here.
    try {
      db.prepare(`
        INSERT INTO audit_log (user_id, action, module, record_id, new_value, description)
        VALUES (?, 'UPDATE', 'signature_requests', ?, ?, ?)
      `).run(
        sr.created_by, sr.id,
        JSON.stringify({ status: 'signed', document_id: documentId }),
        `Signature request ${sr.id} signed by ${String(signer_name).trim()}; document ${documentId} created`
      );
    } catch (_) {}

    res.json({
      message: 'Thank you — your signed consent has been recorded.',
      document_id: documentId,
    });
  } catch (err) {
    console.error('POST /sign/:token error:', err);
    res.status(500).json({ error: 'Failed to record signature' });
  }
});

// ─── Helpers ──────────────────────────────────────────────────

// Build the HTML version of a GIT Confirmation of Insurance for the
// public signing page. Source of truth for fields is the form_data
// payload captured at request-creation time.
function renderGitConfirmationHtml(form) {
  const fmtR = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v == null ? '' : v);
    return 'R ' + n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const fmtDateLong = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };
  const cov = form.coverage || {};
  const groups = Array.isArray(form.vehicle_groups) ? form.vehicle_groups : [];
  const coverTypes = Array.isArray(form.cover_types) ? form.cover_types : [];

  const headerRow = (label, value) => value
    ? `<tr><th style="text-align:left;padding:4px 12px 4px 0;width:140px;font-weight:600;">${escHtml(label)}</th>
         <td style="padding:4px 0;">${escHtml(value)}</td></tr>`
    : '';

  const covRow = (label, amount, suffix) => (amount === undefined || amount === null || amount === '')
    ? ''
    : `<tr><td style="padding:3px 12px 3px 0;">${escHtml(label)}</td>
         <td style="padding:3px 0;text-align:right;">${escHtml('- ' + fmtR(amount) + (suffix || ''))}</td></tr>`;

  const groupBlocks = groups.map(g => {
    const desc = String(g.description || 'CARGO & PACKAGING MATERIALS').toUpperCase();
    const lim = fmtR(g.limit);
    const veh = (g.vehicles || []).map(v => `<li>${escHtml(v)}</li>`).join('');
    return `<p style="margin:8px 0 2px;font-weight:600;">${escHtml(desc)} ${escHtml(lim)} any one conveyance or occurrence in respect of vehicle${(g.vehicles||[]).length>1?'s':''}:</p>
            <ul style="margin:0 0 12px 24px;">${veh}</ul>`;
  }).join('');

  return `
    <p style="text-align:right;margin:0 0 12px;">${escHtml(fmtDateLong(form.date) || fmtDateLong(new Date().toISOString()))}</p>
    <h2 style="text-align:center;">Confirmation of Insurance</h2>

    <table role="presentation" style="margin:12px 0;font-size:14px;line-height:1.5;">
      ${headerRow('INSURED',       form.insured_name)}
      ${headerRow('ADDRESS',       form.insured_address)}
      ${headerRow('RISK ADDRESS',  form.risk_address)}
      ${headerRow('INSURERS',      form.insurer)}
      ${headerRow('Policy Number', form.policy_number)}
      ${headerRow('Brokers',       form.broker_firm || 'Inexpro cc')}
      ${headerRow('Renewal date',  fmtDateLong(form.renewal_date))}
      ${headerRow('Premiums',      form.premium_note || 'Continuation of cover is dependent on monthly payment of premium when presented')}
    </table>

    <h3>COVERAGE &amp; LIMITS</h3>
    <table role="presentation" style="margin:6px 0;font-size:14px;width:100%;max-width:520px;">
      ${covRow('Goods in Transit (Carriers Liability)', cov.goods_in_transit,            ' (As Specified)')}
      ${covRow('Vehicle Third Party Liability',         cov.vehicle_third_party_liability, '')}
      ${covRow('Driver Fidelity',                       cov.driver_fidelity,             '')}
      ${covRow('Spillage out of Vehicle',               cov.spillage_out_of_vehicle,     '')}
      ${covRow('Wreckage Removal',                      cov.wreckage_removal,            '')}
      ${covRow('Debris Removal',                        cov.debris_removal,              '')}
      ${covRow('Public Liability (Claims Made Basis)',  cov.public_liability,            '')}
    </table>
    ${coverTypes.length ? `<p><strong>Cover:</strong> ${escHtml(coverTypes.join(', '))}</p>` : ''}

    <h3>Goods in Transit (Carriers Liability) Detail</h3>
    <p style="font-weight:600;">MAXIMUM LIMITS OF INDEMNITY</p>
    <p>Unless otherwise agreed prior to sending, the indemnity under the Goods in Transit policy will be calculated as per the terms and conditions of the BASIS OF VALUATION and/or INDEMNITY CALCULATION CLAUSE and/or other relevant clauses, however subject to an ABSOLUTE MAXIMUM LIMIT OF INDEMNITY any ONE CONVEYANCE OR ONE OCCURRENCE sub-limits per section:</p>
    ${groupBlocks}

    <h3>Goods in Transit</h3>
    <p>All property usual to the Insured's business (including ropes, tarpaulins and packing materials in connection with the transit).</p>
    <p><strong>Defined events:</strong> All Risk</p>
    <p>Property shall mean the property described in the schedule, including all containers, ropes, tarpaulins, packaging materials, receptacles, covers, boxes and labels when necessary for the Insured's commercial purposes — specifically including Tyres, Electronic goods, Spirits, Alcohol and alcohol-related products, but excluding antiques or antiquities of any description, arms, ammunition, artworks, live animals, bank and treasury notes, cash, travellers cheques, bullion, platinum, cobalt, copper, deeds, designs, documents of any description, explosives, furs, jewellery, patterns, plans, precious metals or stones, specie, stamps, tickets, brass and scrap metal, exotic sea foods (incl. caviar, prawns, calamari and crayfish), aircraft and their parts and accessories — unless declared to the company and specifically included in the schedule.</p>

    <h3>Territorial limits</h3>
    <p>${escHtml(form.territorial_limits || 'Republic of South Africa, Namibia, Botswana, Lesotho, Swaziland, Zimbabwe, Malawi, Mozambique, Zambia, Tanzania, Angola, and the Democratic Republic of the Congo.')}</p>

    <h3>GENERAL EXCLUSIONS</h3>
    <ul>
      <li>Wilful misconduct of the Insured or their Agent.</li>
      <li>Ordinary leakage, wear and tear or gradual deterioration of the goods carried.</li>
      <li>Insufficient or unsuitable packing or preparation outside the control of the Insured.</li>
      <li>Inherent vice, natural causes, or latent / manufacturing defects.</li>
      <li>Delay; loss of market; consequential loss of any nature.</li>
      <li>Unfitness of the conveying vehicle.</li>
      <li>Infestation, insects or vermin.</li>
      <li>Damage during loading and unloading.</li>
      <li>Breakdown or malfunctioning of refrigeration / cooling machinery unless otherwise agreed in writing prior to carriage.</li>
    </ul>

    <h3>FIRST LOSS</h3>
    <p>In the event of the total cargo value at risk exceeding the maximum limits of indemnity provided herein, the Insurers undertake to pay the full amount of any loss recoverable up to but not exceeding the ABSOLUTE MAXIMUM LIMIT OF INDEMNITY any ONE CONVEYANCE OR ONE OCCURRENCE stated above without applying average or under-insurance calculations, minus the appropriate excess.</p>

    <h3>PROPORTIONATE CONSIGNMENT COVER</h3>
    <p>The Indemnity as Specified per Vehicle is the ABSOLUTE MAXIMUM LIMIT OF INDEMNITY in any ONE CONVEYANCE in one complete consignment. Should any one consignment be divided between one or more consignees, the limit will be proportionately divided amongst the Consignees.</p>

    <p style="font-style:italic;color:#444;">This policy may contain clause(s) that limit the amount payable and is subject to standard policy conditions and exclusions. Any cargo owner or their representatives loading any commodity exceeding these terms and conditions will be regarded as at the owner's risk. It is the obligation of the Cargo Owner or their representatives to ensure that the terms and conditions as specified herein are adhered to.</p>

    <h3>Acknowledgement</h3>
    <p>By signing below, I acknowledge and confirm that I have read and understood the terms and conditions contained in this Confirmation of Cover.</p>

    <p>Kind regards,<br><strong>${escHtml(form.prepared_by_name || 'Inexpro Broker')}</strong><br>Inexpro Short Term Insurance</p>
  `;
}

// Build the HTML version of a Record of Advice for the public signing
// page. Looks up the advice_record by id from form_data and pulls the
// linked client / broker / policy names so the document the client
// signs matches the broker's record exactly.
function renderRoaSigningHtml(db, formData) {
  const roaId = formData && formData.advice_record_id;
  if (!roaId) {
    return '<p style="color:#a71d2a;">Advice record reference is missing. Please contact your broker.</p>';
  }
  const roa = db.prepare(`
    SELECT ar.*,
           (c.first_name || ' ' || c.last_name) AS contact_name,
           a.account_name,
           b.full_name AS broker_name,
           p.policy_name
    FROM advice_records ar
    LEFT JOIN contacts c ON c.id = ar.contact_id
    LEFT JOIN accounts a ON a.id = ar.account_id
    LEFT JOIN users    b ON b.id = ar.broker_id
    LEFT JOIN policies p ON p.id = ar.policy_id
    WHERE ar.id = ?
  `).get(roaId);
  if (!roa) {
    return '<p style="color:#a71d2a;">Advice record not found. Please contact your broker.</p>';
  }

  const dateStr = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  const headerRow = (label, value) => value
    ? `<tr><th style="text-align:left;padding:4px 12px 4px 0;width:140px;font-weight:600;">${escHtml(label)}</th>
         <td style="padding:4px 0;">${escHtml(value)}</td></tr>`
    : '';

  const section = (heading, value) => value
    ? `<h3>${escHtml(heading)}</h3><p style="white-space:pre-wrap;">${escHtml(value)}</p>`
    : '';

  return `
    <h2 style="text-align:center;">Record of Advice</h2>

    <table role="presentation" style="margin:12px 0;font-size:14px;line-height:1.5;">
      ${headerRow('Reference',   roa.advice_record_number)}
      ${headerRow('Client',      roa.contact_name || roa.account_name)}
      ${headerRow('Adviser',     roa.broker_name)}
      ${headerRow('Advice Date', dateStr(roa.advice_date))}
      ${headerRow('Advice Type', roa.advice_type)}
      ${headerRow('Trigger Event', roa.trigger_event)}
      ${headerRow('Policy',      roa.policy_name)}
    </table>

    ${section('Client Needs Identified',  roa.client_needs_identified)}
    ${section('Recommendation Given',     roa.recommendation_given)}
    ${section('Why the Product is Suitable', roa.reason_product_suitable)}
    ${section('Alternatives Considered',  roa.alternatives_considered)}
    ${section('Material Disclosures',     roa.material_disclosures)}
    ${section('Notes',                    roa.notes)}

    ${roa.client_decision ? `
      <h3>Client Decision</h3>
      <p><strong>Decision:</strong> ${escHtml(roa.client_decision)}</p>
      ${roa.decision_date ? `<p><strong>Decision Date:</strong> ${escHtml(dateStr(roa.decision_date))}</p>` : ''}
      ${roa.client_rejection_reason ? `<p><strong>Reason:</strong> ${escHtml(roa.client_rejection_reason)}</p>` : ''}
    ` : ''}

    <h3>Acknowledgement</h3>
    <p>By signing below, I confirm that I have read and understood the advice contained in this Record of Advice and that the recommendation has been explained to me.</p>
  `;
}

function buildPlaceholders(db, sr) {
  let clientName = sr.recipient_name || '';
  let brokerName = '';
  if (sr.contact_id) {
    const c = db.prepare('SELECT first_name, last_name, assigned_broker_id FROM contacts WHERE id = ?').get(sr.contact_id);
    if (c) clientName = clientName || `${c.first_name || ''} ${c.last_name || ''}`.trim();
    if (c && c.assigned_broker_id) {
      const b = db.prepare('SELECT full_name FROM users WHERE id = ?').get(c.assigned_broker_id);
      brokerName = b?.full_name || '';
    }
  } else if (sr.account_id) {
    const a = db.prepare('SELECT account_name, assigned_broker_id FROM accounts WHERE id = ?').get(sr.account_id);
    if (a) clientName = clientName || a.account_name;
    if (a && a.assigned_broker_id) {
      const b = db.prepare('SELECT full_name FROM users WHERE id = ?').get(a.assigned_broker_id);
      brokerName = b?.full_name || '';
    }
  }
  if (!brokerName && sr.created_by) {
    const b = db.prepare('SELECT full_name FROM users WHERE id = ?').get(sr.created_by);
    brokerName = b?.full_name || '';
  }
  return { client_name: clientName || 'Client', broker_name: brokerName || 'Inexpro Broker' };
}

function renderMessage(title, message) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escHtml(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:Arial,sans-serif;background:#f4f5f7;color:#222;padding:48px 16px;}
.box{max-width:520px;margin:0 auto;background:#fff;padding:32px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.06);text-align:center;}
h1{color:#1a5276;font-size:22px;margin-bottom:12px;}p{line-height:1.6;font-size:15px;}</style></head>
<body><div class="box"><h1>${escHtml(title)}</h1><p>${escHtml(message)}</p></div></body></html>`;
}

function renderSigningPage({ token, title, bodyHtml, footerHtml, hasMarketingConsent, prefillName }) {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;background:#f4f5f7;color:#222;margin:0;padding:0;}
  .wrap{max-width:760px;margin:0 auto;padding:24px 16px 80px;}
  .card{background:#fff;border-radius:8px;padding:28px;box-shadow:0 2px 10px rgba(0,0,0,.06);}
  h1,h2,h3{color:#1a5276;}
  h2{font-size:22px;margin:0 0 16px;}
  h3{font-size:16px;margin:22px 0 8px;}
  p,li{font-size:14px;line-height:1.6;}
  ol,ul{padding-left:22px;}
  a{color:#1a5276;}
  .marketing{background:#f8f9fa;border:1px solid #e0e4e8;border-radius:6px;padding:14px 16px;margin:18px 0;}
  .marketing label{display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;font-size:14px;}
  .marketing input{width:18px;height:18px;}
  .sig-box{border:1px dashed #888;border-radius:6px;background:#fff;}
  canvas{display:block;width:100%;height:180px;touch-action:none;cursor:crosshair;}
  .sig-actions{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#666;padding:6px 8px;border-top:1px solid #eee;}
  .sig-actions button{background:none;border:none;color:#1a5276;cursor:pointer;font-size:12px;}
  .form-row{display:grid;grid-template-columns:1fr 200px;gap:12px;margin:14px 0;}
  .form-row label{display:block;font-size:13px;color:#444;margin-bottom:4px;font-weight:600;}
  .form-row input{width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;font-size:14px;box-sizing:border-box;}
  .submit-row{display:flex;justify-content:flex-end;gap:10px;margin-top:24px;}
  .btn{padding:10px 22px;border:none;border-radius:4px;font-size:14px;font-weight:600;cursor:pointer;}
  .btn-primary{background:#1a5276;color:#fff;}
  .btn-primary:hover{background:#13405c;}
  .btn-primary:disabled{background:#7f9bae;cursor:not-allowed;}
  .alert{display:none;margin-top:12px;padding:10px 12px;border-radius:4px;font-size:14px;}
  .alert-error{background:#fdecea;color:#a71d2a;border:1px solid #f5c2c7;}
  .alert-success{background:#d1e7dd;color:#0f5132;border:1px solid #badbcc;}
  .footer-note{font-size:12px;color:#666;margin-top:24px;text-align:center;}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    ${bodyHtml}

    ${hasMarketingConsent ? `
    <div class="marketing">
      <strong>Direct marketing (POPIA s69)</strong>
      <p style="margin:6px 0 10px;font-size:13px;">Please indicate one option below:</p>
      <label><input type="radio" name="marketing" value="yes"> <strong>YES</strong> &mdash; I consent to receiving newsletters, product updates and marketing from Inexpro</label>
      <label><input type="radio" name="marketing" value="no"> <strong>NO</strong> &mdash; I do not wish to receive marketing communications</label>
    </div>` : ''}

    ${footerHtml}

    <h3>Sign below</h3>
    <p style="font-size:13px;color:#555;">Draw your signature in the box below using your mouse or finger.</p>
    <div class="sig-box">
      <canvas id="sig-canvas" width="900" height="180"></canvas>
      <div class="sig-actions">
        <span id="sig-hint">Signature area</span>
        <button type="button" id="sig-clear">Clear</button>
      </div>
    </div>

    <div class="form-row">
      <div>
        <label for="signer-name">Full name (printed)</label>
        <input type="text" id="signer-name" value="${escHtml(prefillName)}" autocomplete="name" required>
      </div>
      <div>
        <label for="signer-date">Date</label>
        <input type="text" id="signer-date" value="${escHtml(new Date().toISOString().slice(0, 10))}" readonly>
      </div>
    </div>

    <div class="alert alert-error"   id="alert-error"></div>
    <div class="alert alert-success" id="alert-success"></div>

    <div class="submit-row">
      <button type="button" class="btn btn-primary" id="submit-btn">Submit signed consent</button>
    </div>

    <p class="footer-note">By submitting you confirm that the signature above is yours and that you have read and understood this notice.</p>
  </div>
</div>

<script>
(function(){
  var canvas = document.getElementById('sig-canvas');
  var ctx = canvas.getContext('2d');
  function resizeCanvas(){
    var rect = canvas.getBoundingClientRect();
    var ratio = window.devicePixelRatio || 1;
    canvas.width  = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  var drawing = false; var hasInk = false;
  function pos(e){
    var rect = canvas.getBoundingClientRect();
    var t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }
  function start(e){ drawing = true; var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
  function move(e){ if (!drawing) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); hasInk = true; e.preventDefault(); }
  function end(){ drawing = false; }
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove',  move,  { passive: false });
  canvas.addEventListener('touchend',   end);
  document.getElementById('sig-clear').addEventListener('click', function(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk = false;
  });

  function showError(msg){
    var el = document.getElementById('alert-error');
    el.textContent = msg; el.style.display = 'block';
    document.getElementById('alert-success').style.display = 'none';
  }
  function showSuccess(msg){
    var el = document.getElementById('alert-success');
    el.textContent = msg; el.style.display = 'block';
    document.getElementById('alert-error').style.display = 'none';
  }

  document.getElementById('submit-btn').addEventListener('click', async function(){
    var name = (document.getElementById('signer-name').value || '').trim();
    if (!name) return showError('Please enter your full name.');
    if (!hasInk) return showError('Please draw your signature in the signature box.');

    var marketing = null;
    var checked = document.querySelector('input[name="marketing"]:checked');
    if (checked) marketing = checked.value;
    ${hasMarketingConsent ? "if (!marketing) return showError('Please indicate your direct marketing preference.');" : ''}

    var btn = document.getElementById('submit-btn');
    btn.disabled = true; btn.textContent = 'Submitting...';

    try {
      var res = await fetch('/sign/${encodeURIComponent(token)}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signer_name: name,
          marketing_consent: marketing,
          signature_png_base64: canvas.toDataURL('image/png')
        })
      });
      var json = await res.json().catch(function(){ return {}; });
      if (!res.ok) { showError(json.error || ('Submit failed (HTTP ' + res.status + ')')); btn.disabled = false; btn.textContent = 'Submit signed consent'; return; }
      showSuccess(json.message || 'Thank you — your signed consent has been recorded.');
      btn.style.display = 'none';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      showError('Submit failed: ' + (e.message || e));
      btn.disabled = false; btn.textContent = 'Submit signed consent';
    }
  });
})();
</script>
</body></html>`;
}

// Build the signed PDF: Inexpro letterhead on page 1, branded footer on
// every page (same images we use for the GIT Confirmation), then the
// notice text → marketing-consent answer → signature image → typed name
// + date + IP audit footer.
async function renderSignedPdf({ tpl, placeholders, answers }) {
  const PDFDocument = require('pdfkit');

  // Layout constants.
  const PAGE_W   = 595.28;
  const PAGE_H   = 841.89;
  const MARGIN   = 50;
  const PAGE2_TOP = 50;
  const FOOTER_H = 80;
  const FOOTER_BUFFER = 12; // breathing room above the footer image
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const PRIMARY  = '#1a5276';

  const chunks = [];
  // Give PDFKit real margins so its automatic line wrap + page break
  // respects them. With `bottom: FOOTER_H + buffer` long bodies of text
  // automatically flow onto a new page BEFORE running into the footer
  // banner. `top: PAGE2_TOP` is where wrapped text starts on subsequent
  // pages (page 1's letterhead is drawn explicitly at y=0, ignoring the
  // margin).
  const pdfDoc = new PDFDocument({
    size: 'A4',
    margins: {
      top:    PAGE2_TOP,
      bottom: FOOTER_H + FOOTER_BUFFER,
      left:   MARGIN,
      right:  MARGIN,
    },
    autoFirstPage: true,
  });
  pdfDoc.on('data', c => chunks.push(c));

  return new Promise((resolve, reject) => {
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);

    // Branded footer image + text overlay, drawn on every page.
    //
    // Two pitfalls guarded against here:
    //  1. The footer text lives BELOW the page's bottom margin (by design —
    //     we set bottom margin = FOOTER_H + buffer specifically to keep
    //     content out of this strip). Drawing text below the margin would
    //     trigger PDFKit's auto-page-break → fire pageAdded → re-enter
    //     drawFooter → infinite recursion. Lifting bottom margin to 0
    //     during the footer draw avoids this.
    //  2. After the draw, pdfDoc.y is left at the bottom of the page (where
    //     the last footer line was rendered). The NEXT main-flow text()
    //     call would see y is below the safe area and trigger ANOTHER
    //     page break → another drawFooter → another stale y → cascade of
    //     blank pages. Saving/restoring the cursor around the draw stops
    //     that cascade.
    const footerImagePath = path.join(__dirname, '../../client/public/letterhead-footer.jpg');
    const FOOTER_TEXT_TOP = PAGE_H - FOOTER_H + 8;
    function drawFooter() {
      const savedX = pdfDoc.x;
      const savedY = pdfDoc.y;
      // PDFKit's save()/restore() covers graphics state (fill colour,
      // stroke, transforms) but NOT font / fontSize. Without saving these,
      // when an auto-page-break interrupts a 10pt body text block, the
      // footer's 7pt setting bleeds into the body continuation on page 2.
      const savedFontName = pdfDoc._font && pdfDoc._font.name;
      const savedFontSize = pdfDoc._fontSize;

      if (fs.existsSync(footerImagePath)) {
        pdfDoc.image(footerImagePath, 0, PAGE_H - FOOTER_H, { width: PAGE_W, height: FOOTER_H });
      }
      pdfDoc.save();
      const origBottom = pdfDoc.page.margins.bottom;
      pdfDoc.page.margins.bottom = 0;
      try {
        const opts = { width: PAGE_W, align: 'center', lineBreak: false };
        pdfDoc.font('Helvetica-Bold').fontSize(8).fillColor(PRIMARY)
          .text('Inexpro Short Term Insurance', 0, FOOTER_TEXT_TOP, opts);
        pdfDoc.font('Helvetica').fontSize(7.5).fillColor(PRIMARY)
          .text('Steph@Inexpro.co.za  |  www.Inexpro.co.za', 0, FOOTER_TEXT_TOP + 12, opts);
        pdfDoc.fontSize(7).fillColor('#555')
          .text('CK 1995/049701/23  |  VAT 4240154593', 0, FOOTER_TEXT_TOP + 26, opts);
        pdfDoc.text('Inexpro is an authorised financial service provider — FSP Licence No. 7591',
          0, FOOTER_TEXT_TOP + 38, opts);
      } finally {
        pdfDoc.page.margins.bottom = origBottom;
      }
      pdfDoc.restore();
      if (savedFontName) pdfDoc.font(savedFontName);
      if (savedFontSize) pdfDoc.fontSize(savedFontSize);
      pdfDoc.x = savedX;
      pdfDoc.y = savedY;
    }

    // Letterhead on page 1 only.
    const letterheadPath = path.join(__dirname, '../../client/public/letterhead-ROA.png');
    let firstPageTop = PAGE2_TOP;
    if (fs.existsSync(letterheadPath)) {
      const imgData = fs.readFileSync(letterheadPath);
      const imgW = imgData.readUInt32BE(16);
      const imgH = imgData.readUInt32BE(20);
      const renderedH = (imgH / imgW) * PAGE_W;
      pdfDoc.image(letterheadPath, 0, 0, { width: PAGE_W });
      firstPageTop = renderedH + 12;
    }
    drawFooter();
    // pageAdded fires AFTER PDFKit positions the cursor at margins.top on
    // the new page — we just need to stamp the footer image on top of it.
    pdfDoc.on('pageAdded', () => {
      drawFooter();
    });

    pdfDoc.y = firstPageTop;
    pdfDoc.x = MARGIN;

    // Cushion for atomic blocks (signature image, etc.) — for plain text
    // PDFKit handles the wrap automatically via the bottom margin.
    function checkBreak(needed) {
      const safeBottom = PAGE_H - (FOOTER_H + FOOTER_BUFFER);
      if (pdfDoc.y + needed > safeBottom) pdfDoc.addPage();
    }

    const stripTags = html => String(html || '')
      .replace(/<h[1-6][^>]*>/gi, '\n').replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<\/?p[^>]*>/gi, '\n').replace(/<br[^>]*>/gi, '\n')
      .replace(/<\/?ol[^>]*>/gi, '\n').replace(/<\/?ul[^>]*>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n  • ').replace(/<\/li>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n').trim();

    const { applyPlaceholders: apply } = require('../lib/signable-templates');
    const bodyText   = stripTags(apply(tpl.bodyHtml,   placeholders));
    const footerText = stripTags(apply(tpl.footerHtml, placeholders));

    // Title
    pdfDoc.font('Helvetica-Bold').fontSize(16).fillColor(PRIMARY)
      .text(tpl.title, MARGIN, pdfDoc.y, { width: CONTENT_W });
    pdfDoc.moveDown(0.6);

    // Body
    pdfDoc.font('Helvetica').fontSize(10).fillColor('#222')
      .text(bodyText, MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'justify', lineGap: 2 });

    // Marketing consent answer
    if (tpl.hasMarketingConsent) {
      checkBreak(50);
      pdfDoc.moveDown(0.5);
      pdfDoc.font('Helvetica-Bold').fontSize(11).fillColor(PRIMARY)
        .text('Direct marketing (POPIA s69)', MARGIN, pdfDoc.y, { width: CONTENT_W });
      pdfDoc.font('Helvetica').fontSize(10).fillColor('#222');
      const m = answers.marketingProvided
        ? (answers.marketingConsent
            ? 'YES — Client consents to receiving newsletters, product updates and marketing from Inexpro.'
            : 'NO — Client does not wish to receive marketing communications.')
        : 'Not answered.';
      pdfDoc.text(m, MARGIN, pdfDoc.y, { width: CONTENT_W, lineGap: 2 });
    }

    pdfDoc.moveDown(0.6);
    pdfDoc.font('Helvetica').fontSize(10).fillColor('#222')
      .text(footerText, MARGIN, pdfDoc.y, { width: CONTENT_W, lineGap: 2 });

    // Signature block — heading + image + name/date + audit footer.
    // PDFKit's image() doesn't advance pdfDoc.y past the rendered image,
    // so we explicitly position it and bump y ourselves to avoid the
    // following text overlapping the signature.
    const SIG_W = 240;
    const SIG_H = 90;
    const SIG_GAP = 8;
    checkBreak(SIG_H + 80);
    pdfDoc.moveDown(1);
    pdfDoc.font('Helvetica-Bold').fontSize(12).fillColor(PRIMARY)
      .text('Client Signature', MARGIN, pdfDoc.y, { width: CONTENT_W });
    pdfDoc.moveDown(0.3);

    const sigX = MARGIN;
    const sigY = pdfDoc.y;
    try {
      pdfDoc.image(answers.signatureBuf, sigX, sigY, { fit: [SIG_W, SIG_H] });
    } catch (_) {
      pdfDoc.fontSize(10).fillColor('#a00').text('(signature image could not be embedded)', sigX, sigY);
    }
    pdfDoc.x = sigX;
    pdfDoc.y = sigY + SIG_H + SIG_GAP;

    pdfDoc.font('Helvetica').fontSize(10).fillColor('#222')
      .text(`Signed by: ${answers.signerName}`, MARGIN, pdfDoc.y, { width: CONTENT_W });
    pdfDoc.text(`Date: ${answers.signedAt.toISOString().slice(0, 10)}`, MARGIN, pdfDoc.y, { width: CONTENT_W });
    pdfDoc.moveDown(0.4);
    pdfDoc.font('Helvetica-Oblique').fontSize(8).fillColor('#666')
      .text(
        `Audit: signed ${answers.signedAt.toISOString()} from ${answers.signedIp || 'unknown IP'}; UA: ${answers.signedUa || '(none)'}`,
        MARGIN, pdfDoc.y, { width: CONTENT_W, lineGap: 2 }
      );

    pdfDoc.end();
  });
}

module.exports = router;
