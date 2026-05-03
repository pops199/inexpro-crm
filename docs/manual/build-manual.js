// Builds Inexpro_CRM_User_Manual.docx from screenshots + text blocks.
// Run: node docs/manual/build-manual.js

const fs = require('fs');
const path = require('path');
// image-size v2+ exports { imageSize }; older versions exported the function
// directly. Resolve either shape to a single callable.
const sizeOf = (() => {
  try {
    const mod = require('image-size');
    if (typeof mod === 'function') return mod;
    if (mod && typeof mod.imageSize === 'function') return mod.imageSize;
    if (mod && typeof mod.default === 'function') return mod.default;
    return null;
  } catch (_) { return null; }
})();

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle,
  PageBreak, ShadingType, LevelFormat, Footer, Header, PageNumber, NumberFormat,
} = require('docx');

const SHOTS = path.join(__dirname, 'screenshots');
const LOGO_PATH = path.join(__dirname, '..', '..', 'client', 'public', 'logo.png');
const LOGO_LIGHT_PATH = path.join(__dirname, '..', '..', 'client', 'public', 'logo-login.png');
const OUT = path.join(__dirname, '..', '..', 'Inexpro_CRM_User_Manual.docx');
const TODAY = new Date().toISOString().slice(0, 10);

// ── Brand palette (matches the existing Inexpro Training Module PDF) ──
const NAVY      = '1F2A5A';   // header background, primary heading
const NAVY_DARK = '0B1C42';
const GOLD      = 'C9A961';   // accent / underline / horizontal rule
const GREY_DK   = '4A4F5C';   // footer primary text
const GREY_MD   = '6A6F7B';   // footer fine-print
const GREY_LT   = 'CFD4E2';   // header tagline
const WHITE     = 'FFFFFF';

// ── Helpers ────────────────────────────────────────────────────────────────

function img(file, widthPx = 600) {
  const full = path.join(SHOTS, file);
  if (!fs.existsSync(full)) {
    console.warn('Missing screenshot:', file);
    return new Paragraph({ children: [new TextRun({ text: `[Screenshot missing: ${file}]`, italics: true })] });
  }
  const data = fs.readFileSync(full);
  let w = widthPx, h = Math.round(widthPx * 0.625);
  if (sizeOf) {
    try {
      const dim = sizeOf(data);
      if (dim?.width && dim?.height) {
        h = Math.round(widthPx * (dim.height / dim.width));
      }
    } catch (_) {}
  }
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({ data, type: 'png', transformation: { width: w, height: h } })],
    spacing: { before: 120, after: 120 },
  });
}

function caption(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text, italics: true, size: 18, color: '555555' })],
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 140 },
    children: [new TextRun({ text, ...opts })],
  });
}

function lead(text) {
  return new Paragraph({
    spacing: { after: 220 },
    children: [new TextRun({ text, size: 24, color: '333333' })],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 60 },
    pageBreakBefore: true,
    border: {
      bottom: { color: GOLD, space: 4, style: BorderStyle.SINGLE, size: 12 },
    },
    children: [new TextRun({ text, bold: true, size: 36, color: NAVY })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true, size: 28, color: NAVY })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, color: NAVY })],
  });
}

function h4(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_4,
    spacing: { before: 180, after: 100 },
    children: [new TextRun({ text, bold: true, size: 22, color: NAVY })],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    spacing: { after: 60 },
    bullet: { level },
    children: [new TextRun({ text })],
  });
}

function bulletRich(runs, level = 0) {
  return new Paragraph({
    spacing: { after: 60 },
    bullet: { level },
    children: runs,
  });
}

function callout(label, text, color = 'FFF4E5', textColor = '8A4A00') {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: color },
            margins: { top: 160, bottom: 160, left: 200, right: 200 },
            borders: borderless(),
            children: [
              new Paragraph({
                spacing: { after: 60 },
                children: [new TextRun({ text: label, bold: true, color: textColor, size: 22 })],
              }),
              new Paragraph({
                children: [new TextRun({ text, color: textColor, size: 22 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function borderless() {
  const e = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return { top: e, bottom: e, left: e, right: e };
}

function gateCallout(text)  { return callout('🚦 GATE', text, 'FBE9E9', '8A1A1A'); }
function tipCallout(text)   { return callout('💡 Tip', text, 'E5F1FB', '0B3D5C'); }
function noteCallout(text)  { return callout('📝 Note', text, 'F1F1F1', '333333'); }
function newCallout(text)   { return callout('✨ New in this release', text, 'EAF7E6', '1F5B12'); }

function ruleTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: rows[0].map(text => new TableCell({
          shading: { type: ShadingType.CLEAR, fill: NAVY },
          children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: WHITE, size: 20 })] })],
        })),
      }),
      ...rows.slice(1).map(row => new TableRow({
        children: row.map(text => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text, size: 20 })] })],
        })),
      })),
    ],
  });
}

function step(num, title) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 100 },
    children: [
      new TextRun({ text: `Step ${num}.  `, bold: true, color: GOLD, size: 26 }),
      new TextRun({ text: title, bold: true, color: NAVY, size: 26 }),
    ],
  });
}

function spacer(after = 100) {
  return new Paragraph({ spacing: { after }, children: [new TextRun('')] });
}

// ── Content ────────────────────────────────────────────────────────────────

const children = [];

// COVER
function coverLogo() {
  // Use the light/transparent logo on the white cover.
  const candidate = fs.existsSync(LOGO_LIGHT_PATH) ? LOGO_LIGHT_PATH
                  : fs.existsSync(LOGO_PATH)       ? LOGO_PATH
                  : null;
  if (!candidate) return null;
  const data = fs.readFileSync(candidate);
  let w = 320, h = 120;
  if (sizeOf) {
    try {
      const dim = sizeOf(data);
      if (dim?.width && dim?.height) {
        h = Math.round(w * (dim.height / dim.width));
      }
    } catch (_) {}
  }
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 800, after: 600 },
    children: [new ImageRun({ data, type: 'png', transformation: { width: w, height: h } })],
  });
}

const coverLogoP = coverLogo();
if (coverLogoP) children.push(coverLogoP);

children.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'INEXPRO CRM', bold: true, size: 64, color: NAVY })],
  }),
  // Gold underline below the title
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 280 },
    border: {
      bottom: { color: GOLD, space: 1, style: BorderStyle.SINGLE, size: 18 },
    },
    children: [new TextRun({ text: '', size: 4 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [new TextRun({ text: 'User Manual', size: 36, color: NAVY_DARK })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [new TextRun({ text: 'A workflow-driven, compliance-aware guide for brokers, admin staff and supervisors.', italics: true, size: 22, color: GREY_DK })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 1200 },
    children: [new TextRun({ text: `Version 3.0  ·  Application v1.0.23  ·  ${TODAY}`, size: 20, color: GREY_MD })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Inexpro Insurance Brokers (Pty) Ltd', size: 20, color: GREY_MD })],
  }),
);

// =========================================================================
// 1. INTRODUCTION
// =========================================================================
children.push(h1('1. Introduction'));

children.push(h2('1.1 What this system is'));
children.push(lead('Inexpro CRM is a compliance-driven advisory platform built specifically for South African short-term insurance brokers. It is not a generic CRM with compliance bolted on — every workflow, every form, and every audit entry is structured around the requirements of the FAIS General Code of Conduct, the Policyholder Protection Rules, POPIA, FICA, and the TCF outcomes, and is being prepared for COFI when it commences.'));

children.push(h2('1.2 Who this manual is for'));
children.push(p('This manual covers three roles:', { bold: true }));
children.push(bullet('Brokers — log in, manage their own clients, capture advice and policies.'));
children.push(bullet('Admin staff — assist brokers with data capture and document handling.'));
children.push(bullet('Administrators / supervisors — manage users, run compliance dashboards, oversee audit trails.'));

children.push(h2('1.3 The compliance philosophy: gates, not checkboxes'));
children.push(p('The most important thing to understand about this system is that compliance is enforced through workflow gates, not optional checkboxes. There are several "you cannot do X until you have done Y" rules that the software simply will not let you bypass — and these are deliberate. They mirror the regulatory sequence a real advisory engagement must follow.'));
children.push(spacer());
children.push(gateCallout(
  'Examples of gates you will meet:\n' +
  '   •  You cannot promote a contact from Prospect to Active Client until FICA is verified and a POPIA lawful basis is recorded.\n' +
  '   •  You cannot create a policy for a client whose POPIA status is not Compliant (Green) and whose FICA is not Verified.\n' +
  '   •  You cannot activate a policy until at least one quote is uploaded AND approved.\n' +
  '   •  You cannot add an asset to a policy until the policy is Active.\n' +
  '   •  You cannot mark a complaint Resolved until the root cause is recorded.\n' +
  '   •  You cannot delete a complaint — ever. (You can withdraw it.)\n' +
  '   •  You cannot raise a claim against a Pending policy.\n' +
  '   •  You cannot save an asset without selecting a Product (from the Product Library) AND a Policy Section.\n' +
  '   •  Once a record has been edited once, every further edit needs a password or a one-time PIN (the edit-lock — see Chapter 14).'
));

children.push(h2('1.4 How to read this manual'));
children.push(p('Skim Chapter 2 for the day-one quick-start. Use Chapter 3 (the gate reference) as a sanity-check whenever the system pushes back. Chapters 4–13 walk through each module in detail — the screen, what every field is for, the gates, and what each tab on the detail view shows. Chapter 14 covers the edit-lock and admin OTP flow. Chapter 15 covers everything new since application v1.0.20 (sections breakdown, per-row tickboxes, customizable columns, dark mode, system update). Appendices at the back list every picklist value the system accepts.'));

// =========================================================================
// 2. QUICK START — DAY ONE
// =========================================================================
children.push(h1('2. Quick start — your first day with the system'));
children.push(lead('A 14-step path from zero to "first policy live and a cover loaded". Each step is expanded later in the manual; treat this as the map you stick on your wall.'));

children.push(h2('2.1 The 14 steps, in order'));
children.push(spacer());
children.push(ruleTable([
  ['#', 'Step', 'What you actually do'],
  ['1',  'Log in and change your password',
         'Use the credentials your administrator gave you. Change the password from your Profile page immediately on first sign-in. Default admin/admin123 must be changed on first deployment.'],
  ['2',  'Set up 2FA',
         'Profile → Activate two-factor authentication. Scan the QR code with Google Authenticator (or any TOTP app), enter the 6-digit code, and save the recovery codes somewhere safe.'],
  ['3',  'Complete Broker Fitness',
         'Sidebar → Broker Profiles → open your row → fill in qualifications, RE5 status, CPD points, fit-and-proper declaration. Supervisors review this in audits.'],
  ['4',  'Add a contact / account in Prospect status',
         'Capture all available details. Leave the status as Prospect — you cannot set it to Active until POPIA and FICA are completed.'],
  ['5',  'Complete POPIA for the contact / account',
         'POPIA → open the new record → capture the lawful basis (usually Consent), consent date, method, data source, data categories held, the information officer, and tick "privacy notice provided".'],
  ['6',  'Complete FICA',
         'FICA → open the new record → capture the verification method, verification date, document reference, who verified it, beneficial-owner check, PEP check (and PEP check date). Save.'],
  ['7',  'Set the contact / account to Active',
         'Edit → Status = Active Client / Active Account. The system only allows this once POPIA is Green AND FICA is Verified.'],
  ['8',  'Create a Client Engagement',
         'Engagements → + New Engagement. Capture pre-sale disclosure (FAIS GCC §4) — FSP licence, broker identity, costs, material risks, complaints process, disclosure method. The engagement is where you record the conversation that justifies later advice.'],
  ['9',  'Create a Policy in Pending status',
         'Policies → + New Policy. Pick the active client/account, the broker code, insurer, product category, inception date. Save as Pending — Active is gated until a quote is approved.'],
  ['10', 'Capture commission on the Commission tab',
         'Open the policy detail → Commission tab → + Commission. Capture rate (% or flat R), basis, broker code. Without commission the policy detail header shows a "Commission missing" banner.'],
  ['11', 'Upload a quote (or existing policy schedule)',
         'Quotes tab → upload PDF/Word/Excel → mark approved with the date you accepted the quote on behalf of the client. The system blocks asset creation until a quote is approved on this policy.'],
  ['12', 'Activate the policy',
         'Edit → Status = Active. The system checks for at least one approved quote before allowing the change.'],
  ['13', 'Create the cover (assets) — fill in everything',
         'Assets → + New Asset. Pick the right Product (from the Product Library), the Policy and the Policy Section. Capture asset specifics. Asset Value and Total Premium auto-calculate from Sum Insured + extras + additional covers + SASRIA + premiums; THE NUMBERS YOU ENTER FLOW THROUGH TO THE POLICY SCHEDULE — make them accurate. Add Vehicle Extras and Additional Covers as needed (each row has its own "In total" tickbox). Add multiple assets on the same policy if needed. Buildings need a physical street address AND a Google Maps link / GPS coordinates so the schedule shows the right risk address.'],
  ['14', 'Edit-locked changes — admins issue a one-time PIN',
         'Once a record has been saved once, any further edit triggers an edit-lock challenge. The user enters their own password OR a 6-digit OTP issued by an admin in Admin → Settings → Security → Generate PIN. Both paths get captured in the audit trail with the PIN-issuing admin\'s name and the redeeming user\'s name.'],
]));
children.push(spacer(220));
children.push(p('The rest of this manual expands each step. If you only ever read one chapter, read this one — but Chapters 4–14 are where the detail lives.'));

// =========================================================================
// 3. THE GOLDEN RULE — GATES
// =========================================================================
children.push(h1('3. The golden rule — workflow gates'));
children.push(lead('Read this table left-to-right: "If you want to do the thing in column 1, you must first have done everything in column 2." Every gate is enforced server-side and returns a clear error message when triggered.'));

children.push(h2('3.1 The gate reference'));
children.push(spacer());
children.push(ruleTable([
  ['You want to…', 'You must first…'],
  ['Set a Contact to Active Client', 'POPIA Green (lawful basis, consent if used, data source, categories, info officer, privacy notice) · FICA Verified (full record incl. doc reference, verifier, PEP check date)'],
  ['Set a business Account to Active', 'FICA Verified on the account'],
  ['Create a Policy', 'Linked Contact must be Active and POPIA Green (FICA Verified). Linked Account must be FICA Verified. Pick a broker code.'],
  ['Set a Policy to Active', 'At least one quote uploaded AND marked approved'],
  ['Add an Asset to a Policy', 'Policy is Active · Quote approved · Product picked from Library · Policy Section selected'],
  ['Save a Building / Structure asset', 'Capture a physical address (street + city / suburb)'],
  ['Create a Record of Advice (RoA)', 'A Client Engagement on the contact/account with pre-sale disclosure complete'],
  ['Mark an RoA Complete', 'All explanation flags ticked · COI declared · supervisor co-approval if target-market is "Mismatch"'],
  ['Raise a Claim', 'Policy is Active · Active asset selected'],
  ['Mark a Complaint Resolved or Closed', 'Root cause recorded'],
  ['Delete a Complaint', 'Not allowed — ever. Use Withdraw.'],
  ['Edit any saved record', 'Enter your password OR a 6-digit OTP issued by an admin (the edit-lock — Chapter 14)'],
  ['Issue an RoA from a Review', 'Tick "Advice record required" on the review and create the linked RoA'],
]));
children.push(spacer(200));

// =========================================================================
// 4. GETTING STARTED
// =========================================================================
children.push(h1('4. Getting started'));

children.push(h2('4.1 Logging in'));
children.push(p('Open the Inexpro CRM URL in your browser. You will be presented with the sign-in screen.'));
children.push(img('01-login.png', 480));
children.push(caption('Figure 4.1 — Sign-in screen'));
children.push(p('Enter the username and password supplied to you by your administrator and click Sign In. If 2FA is enrolled on your account, you will be asked for the 6-digit code from your authenticator app immediately after the password.'));
children.push(tipCallout('On a brand-new install the only user is "admin" with password "admin123". Change it the first time you sign in (Profile → Change password).'));

children.push(h2('4.2 The dashboard'));
children.push(p('After signing in, you land on the main dashboard. This is your at-a-glance view of the business: active contacts, open engagements, active policies, open claims, upcoming renewals, and overdue reviews.'));
children.push(img('02-dashboard.png'));
children.push(caption('Figure 4.2 — Main dashboard with KPIs and charts'));
children.push(p('The dashboard has three sub-tabs at the top:'));
children.push(bullet('Chips — KPIs (counts of clients, policies, claims, complaints, etc.)'));
children.push(bullet('Charts — pipeline charts, premium-by-broker, claims-by-status'));
children.push(bullet('Tables — drill-down lists of items needing attention'));
children.push(p('Admin / supervisor users also have a TCF Dashboard (sidebar) — a separate compliance-oriented view organised around the six Treating Customers Fairly outcomes.'));

children.push(h2('4.3 Your profile, password, and 2FA'));
children.push(p('Your profile is reachable from the user menu in the top-right corner. From here you can:'));
children.push(bullet('Change your display name and email.'));
children.push(bullet('Change your password (must meet the complexity requirement printed on the form).'));
children.push(bullet('Enrol or disable two-factor authentication.'));
children.push(bullet('See your last login and active session info.'));
children.push(img('03-profile.png'));
children.push(caption('Figure 4.3a — Profile page.'));
children.push(p('To enrol 2FA, click Activate two-factor authentication. The system shows a QR code and a manual secret. Scan the QR with your authenticator app, type the 6-digit code that appears, and confirm. The system then displays 10 single-use recovery codes — copy them somewhere safe (each works only once and is your fallback if you lose the device). Once 2FA is enrolled, every login requires both the password and the 6-digit TOTP.'));
children.push(img('04-profile-2fa-modal.png'));
children.push(caption('Figure 4.3b — Two-factor authentication enrolment modal. QR code on the left; type the 6-digit code from the app on the right.'));
children.push(noteCallout('Admins can also enrol 2FA on a user\'s behalf from Admin → Users → 2FA button next to that user. The QR is shown to the admin who shares it with the user out-of-band, and the system displays the recovery codes once.'));

children.push(h2('4.4 Roles and what each can do'));
children.push(p('There are three roles. Your administrator assigns one when they create your user account.'));
children.push(spacer());
children.push(ruleTable([
  ['Capability', 'admin', 'broker', 'admin_only'],
  ['View all clients (across brokers)', 'Yes', 'Own only', 'Yes'],
  ['Create / edit clients, policies, RoAs', 'Yes', 'Yes', 'Yes'],
  ['Edit other brokers\' records', 'Yes', 'No', 'Yes'],
  ['Delete records', 'Yes', 'Own only', 'No'],
  ['Manage users', 'Yes', 'No', 'No'],
  ['Issue OTPs to bypass edit-lock', 'Yes', 'No', 'No'],
  ['View audit log', 'Yes', 'Yes', 'Yes'],
  ['TCF dashboard / Broker Fitness / Product Library', 'Yes', 'No', 'Yes'],
  ['Supervisor co-approval on RoA mismatches', 'Yes', 'No', 'Yes'],
]));
children.push(spacer(220));
children.push(p('Brokers see only their own clients (data isolation). Admin and admin_only users see everything. Only admins can manage users; only admins or owning brokers can delete records.'));

children.push(h2('4.5 Broker Fitness'));
children.push(p('Every broker user has a Broker Fitness profile — an evidence record of their fit-and-proper status. Open Broker Profiles in the sidebar and click your row.'));
children.push(img('133-broker-profiles.png'));
children.push(caption('Figure 4.5 — Broker Profiles list. Each row tracks RE5, qualifications, CPD and fit-and-proper.'));
children.push(p('Capture, in full:'));
children.push(bullet('FAIS qualification (NQF 4 / 5 / 6 / Higher Cert / Diploma) and date achieved.'));
children.push(bullet('RE5 / RE1 results and date passed.'));
children.push(bullet('Class of business authorisation (which short-term and long-term sub-categories you are licensed for).'));
children.push(bullet('CPD points (current cycle) — including supporting evidence file uploads.'));
children.push(bullet('Fit-and-proper declaration — honesty, integrity, financial soundness, with the date you signed it.'));
children.push(bullet('Continuing supervisor (your reporting line for compliance).'));
children.push(p('Supervisors review this record during their audits. The system warns you when CPD or fit-and-proper is overdue.'));

// =========================================================================
// 5. CONTACTS
// =========================================================================
children.push(h1('5. Contacts (individuals)'));
children.push(lead('Contacts are natural persons. Every short-term policy needs a contact (or an account) as the policyholder. The contact lifecycle is: Prospect → Active Client → Inactive Client / Former Client / Do Not Service / Deceased.'));

children.push(h2('5.1 List view + customizable columns'));
children.push(p('Click Contacts in the sidebar. The list shows every contact you can see (subject to broker isolation). The toolbar offers ⚙ Columns to customise which columns are visible, in what order, and the default sort. Your choice is saved against your user.'));
children.push(img('10-contacts-list.png'));
children.push(caption('Figure 5.1 — Contacts list. ⚙ Columns is in the page header.'));

children.push(h2('5.2 Creating a Prospect contact'));
children.push(p('Click + New Contact. The form is long; capture as much as you have, then save. Required fields are flagged.'));
children.push(img('11-contact-new-form.png'));
children.push(caption('Figure 5.2 — New Contact form.'));
children.push(p('Required:'));
children.push(bullet('First name, Last name'));
children.push(bullet('Contact type (default: Individual Client)'));
children.push(bullet('Client category (Personal Lines / Commercial Lines / etc.)'));
children.push(bullet('Contact status — leave at Prospect (the system will refuse Active until POPIA + FICA are done).'));
children.push(bullet('Assigned broker (defaults to you).'));
children.push(spacer());
children.push(gateCallout('Do NOT pick "Active Client" at creation time — the save will be rejected with the missing-compliance reason.'));

children.push(h2('5.3 The contact detail view'));
children.push(p('A saved contact opens to a detail page that has the following sections in order:'));
children.push(bullet('Banners — FICA Not Verified / POPIA Incomplete / Open Complaints, when relevant.'));
children.push(bullet('Personal Details — name, ID number, contact details, addresses.'));
children.push(bullet('Driver\'s Licence — for motor underwriting context.'));
children.push(bullet('Classification — client status, category, broker, since-date, type.'));
children.push(bullet('Compliance Snapshot — FICA + POPIA status and quick links to those records.'));
children.push(img('12-contact-prospect-detail.png'));
children.push(caption('Figure 5.3a — Prospect contact detail. Compliance Snapshot is amber on every line.'));

children.push(h3('Bottom tabs on the contact detail page'));
children.push(p('At the bottom of the detail page is a tab strip. Each tab loads its data only when you click it.'));
children.push(spacer());
children.push(ruleTable([
  ['Tab', 'Shows'],
  ['Policies',          'Every policy where this contact is the policyholder, co-insured, or related party. Customizable columns.'],
  ['Claims',            'Every claim under any of those policies.'],
  ['Assets',            'Every asset linked (directly or via a policy) to this contact.'],
  ['Engagements',       'Every Client Engagement record on this contact.'],
  ['Reviews',           'Every annual / mid-year / claims / ad-hoc review.'],
  ['Complaints',        'Every complaint where this contact is the complainant.'],
  ['Records of Advice', 'Every RoA capturing advice given to this contact.'],
  ['Sections',          'Policy sections (cover lines) under this contact\'s policies — gives you a fast view of where there are gaps.'],
  ['Documents',         'Every file uploaded against the contact (incl. signed mandates, ID copies, FICA evidence).'],
  ['Timeline',          'Reverse-chronological log of every action against this contact.'],
]));
children.push(spacer(200));
children.push(img('20-contact-tab-policies.png'));
children.push(caption('Figure 5.3b — Contact detail, Policies tab.'));
children.push(img('21-contact-tab-engagements.png'));
children.push(caption('Figure 5.3c — Contact detail, Engagements tab.'));
children.push(img('22-contact-tab-sections.png'));
children.push(caption('Figure 5.3d — Contact detail, Sections tab — fast cover-gap view.'));
children.push(img('23-contact-tab-timeline.png'));
children.push(caption('Figure 5.3e — Contact detail, Timeline tab.'));

children.push(h2('5.4 FICA on a contact'));
children.push(p('From the contact detail click "Open FICA Record" or use the FICA item in the sidebar.'));
children.push(img('13-contact-fica-prospect.png'));
children.push(caption('Figure 5.4a — Empty FICA record.'));
children.push(p('Capture, ALL of the following — the system will refuse "Verified" until every required field is on file:'));
children.push(bullet('Verification method — South African ID document, Passport, CIPC registration (company), Driver\'s licence, Biometric, or Other certified document.'));
children.push(bullet('Verification date.'));
children.push(bullet('Document reference (the actual ID / passport / CIPC number — stored encrypted).'));
children.push(bullet('Verified-by user (the broker / admin who sighted the documents).'));
children.push(bullet('Beneficial owner confirmed — Yes / No / Pending.'));
children.push(bullet('PEP check — Yes — clear, Yes — flagged for review, or Not yet performed.'));
children.push(bullet('PEP check date.'));
children.push(bullet('ID document received and Proof of address received — both ticked.'));
children.push(p('Save. The system auto-calculates the 5-year expiry date from your verification date.'));
children.push(img('17-contact-fica-verified.png'));
children.push(caption('Figure 5.4b — A complete, Verified FICA record.'));
children.push(gateCallout('Once the FICA record has any field saved, every subsequent FICA edit is edit-locked and requires the user\'s password or an admin OTP. First-time data entry goes through unlocked.'));

children.push(h2('5.5 POPIA on a contact'));
children.push(p('Same pattern — open the POPIA record and capture the lawful basis details.'));
children.push(img('14-contact-popia-prospect.png'));
children.push(caption('Figure 5.5a — Empty POPIA record.'));
children.push(p('To go Compliant (Green), all of:'));
children.push(bullet('Data processing basis — Consent, Contractual necessity, Legal obligation, Legitimate interest, or Vital interest.'));
children.push(bullet('If basis = Consent: consent date AND consent method (Signed form / Digital opt-in / Email / Verbal).'));
children.push(bullet('Data source (Direct / Public source / Third party / etc.).'));
children.push(bullet('Data categories held — multi-select (Identity / Contact / Financial / Insurance / Health / etc.).'));
children.push(bullet('Information officer (the user designated as IO for this client).'));
children.push(bullet('Privacy notice provided — ticked.'));
children.push(bullet('Purpose of processing — narrative.'));
children.push(bullet('Retention period (years) — defaults to 5.'));
children.push(img('18-contact-popia-consented.png'));
children.push(caption('Figure 5.5b — A POPIA Compliant record.'));

children.push(h2('5.6 Activating the contact'));
children.push(p('Once both POPIA and FICA are in order, edit the contact and change Contact Status to Active Client. Save.'));
children.push(img('19-gate-activation-error.png'));
children.push(caption('Figure 5.6 — Trying to activate a contact whose POPIA / FICA are not done — the system rejects the save with the missing-compliance reason.'));
children.push(img('16-contact-active-detail.png'));
children.push(caption('Figure 5.6b — Contact now Active. Compliance Snapshot is fully green.'));

// =========================================================================
// 6. ACCOUNTS (BUSINESS CLIENTS)
// =========================================================================
children.push(h1('6. Accounts (business clients)'));
children.push(p('Accounts are non-natural persons: companies, close corporations, sole proprietors, partnerships, trusts, NPOs, schools, churches, body corporates, etc. Two structural differences from contacts:'));
children.push(bullet('POPIA does not apply (POPIA covers natural persons). You only need FICA Verified to activate.'));
children.push(bullet('Business type is required at creation (Company / Close Corp / Sole Prop / Partnership / Trust / NPO / School / Church / Body Corporate / Other).'));

children.push(h2('6.1 Create the account'));
children.push(img('30-accounts-list.png'));
children.push(caption('Figure 6.1a — Accounts list.'));
children.push(img('31-account-new-form.png'));
children.push(caption('Figure 6.1b — New Account form.'));

children.push(h2('6.2 The account detail view'));
children.push(img('32-account-detail.png'));
children.push(caption('Figure 6.2 — Business account detail. FICA must be Verified before status flips to Active.'));
children.push(p('Top-of-page sections: FICA banner; Account Details; Physical Address; Postal Address; Relationships & Assignments; Compliance & Status; Reviews. Quick actions in the action bar: Policy Schedule, Email, Edit.'));

children.push(h3('Bottom tabs on the account detail page'));
children.push(spacer());
children.push(ruleTable([
  ['Tab', 'Shows'],
  ['Contacts',          'Natural persons related to this account (directors, owners, signatories, employees-on-cover).'],
  ['Policies',          'Every policy where this account is the policyholder.'],
  ['Assets',            'Every asset under those policies.'],
  ['Claims',            'Every claim raised under those policies.'],
  ['Engagements',       'Every Client Engagement on the account.'],
  ['Reviews',           'Every review.'],
  ['Complaints',        'Every complaint logged against the account.'],
  ['Records of Advice', 'Every RoA generated for the account.'],
  ['Sections',          'Cover lines under the account\'s policies — fast cover-gap view.'],
  ['Documents',         'Files uploaded against the account (CIPC docs, BO declarations, mandates).'],
  ['Timeline',          'Reverse-chronological log.'],
]));
children.push(spacer(200));

children.push(h2('6.3 FICA on an account'));
children.push(p('Same pattern as the contact FICA, but the verification method usually defaults to "CIPC registration (company)" and the document reference is the registration number. Beneficial-owner confirmation is required for juristic types: (Pty) Ltd, Public Company, Close Corporation, Trust, Co-operative, Section 21, NPO, Body Corporate.'));
children.push(img('33-account-fica.png'));
children.push(caption('Figure 6.3 — FICA on an account.'));

children.push(h2('6.4 Engagements / RoAs / Policies / Assets'));
children.push(p('Once the account is Active the engagement / RoA / policy / asset workflow is identical to the individual flow — you simply pick the Account on each form instead of the Contact.'));

// =========================================================================
// 7. CLIENT ENGAGEMENTS
// =========================================================================
children.push(h1('7. Client Engagements'));
children.push(lead('A Client Engagement is the advisory pipeline for one client. It captures the conversation: fact-find, needs analysis, quotes, and ultimately the advice presented. You cannot create a Record of Advice without an engagement, because the engagement is where pre-sale disclosure (FAIS GCC §4) is captured.'));

children.push(h2('7.1 List + form'));
children.push(img('40-engagements-list.png'));
children.push(caption('Figure 7.1a — Engagements list.'));
children.push(img('41-engagement-new-form.png'));
children.push(caption('Figure 7.1b — New Engagement form.'));
children.push(p('Required:'));
children.push(bullet('Engagement name (e.g. "Sarah Naidoo — Household & Motor 2026").'));
children.push(bullet('Engagement type (New Business / Renewal / Amendment / Cancellation / Claims-Driven).'));
children.push(bullet('Assigned broker.'));
children.push(bullet('At least one of: Contact OR Account.'));
children.push(p('Stages, in order: Prospect → Initial Contact → Appointment Scheduled → Fact Find Completed → Needs Analysis Completed → Quote / Proposal Prepared → Advice Presented → Client Decision Pending → Accepted - Implementation → Implemented / Active. Plus terminal stages: Lost / Declined and On Hold.'));

children.push(h2('7.2 The engagement detail view + tabs'));
children.push(img('42-engagement-detail.png'));
children.push(caption('Figure 7.2 — Engagement detail.'));
children.push(p('Detail sections: Engagement Details, Parties, Financial, Process Completion, Pre-Sale Disclosure (auto-status badge), Suitability & Compliance, Needs & Risk Profile, Linked Policies. Bottom tabs: Timeline, Documents.'));

children.push(h2('7.3 Pre-sale disclosure (FAIS GCC §4) — the gate to RoA'));
children.push(p('For disclosure status to compute as Complete, ALL of:'));
children.push(bullet('FSP licence disclosed — Yes — Written OR Yes — Verbal.'));
children.push(bullet('Broker identity disclosed — ticked.'));
children.push(bullet('Product costs disclosed — ticked AND notes filled in.'));
children.push(bullet('Material risks disclosed — ticked AND notes filled in.'));
children.push(bullet('Complaints process disclosed — Yes — Written, Yes — Verbal, OR Complaints form provided.'));
children.push(bullet('Disclosure method — In-person / Phone / Video / Email / WhatsApp / Signed form.'));
children.push(spacer());
children.push(gateCallout('If any one of these six fields is missing, the engagement\'s disclosure status reads "Incomplete" and the system will block any RoA creation against this engagement with a message naming the missing item.'));

// =========================================================================
// 8. RECORDS OF ADVICE
// =========================================================================
children.push(h1('8. Records of Advice (RoAs)'));
children.push(lead('An RoA is the documentary record of advice given (FAIS s9). The system enforces every regulatory data point and adds a target-market check tied to the Product Library.'));

children.push(h2('8.1 List + form'));
children.push(img('50-advice-list.png'));
children.push(caption('Figure 8.1a — Records of Advice list.'));
children.push(img('51-advice-new-form.png'));
children.push(caption('Figure 8.1b — New RoA form.'));
children.push(p('Required to save as draft:'));
children.push(bullet('Broker · Prepared by · Advice date · Advice type (New Business / Amendment / Cancellation / Review / Claims-Driven Advice).'));
children.push(bullet('Trigger event (Client Engagement / Policy Amendment / Cancellation / Review / Claim / Enquiry).'));
children.push(bullet('Client needs identified — narrative.'));
children.push(bullet('Risk analysis summary — narrative.'));
children.push(bullet('Recommendation given.'));
children.push(bullet('Reason product is suitable.'));
children.push(bullet('Conflict of Interest declared — Yes/No (cannot be blank). If Yes, description required.'));
children.push(p('Required to mark Complete:'));
children.push(bullet('All explanation flags ticked: Risks · Costs · Excess · Waiting Period & Limitations · Exclusions · Client Understanding · Fair Outcome.'));
children.push(bullet('Client decision — Accepted, Declined, Deferred, or Pending. If Declined, capture the rejection reason.'));

children.push(h2('8.2 The RoA detail view + tabs'));
children.push(img('52-advice-detail.png'));
children.push(caption('Figure 8.2 — RoA detail. Note the auto-generated AR-YYYYMMDD-XXXX number at the top.'));
children.push(p('Detail sections: Record Details, Links (engagement, policy, product), Suitability Assessment, Needs Analysis, Recommendation, Conflict of Interest (GCC §3A), Disclosures, Client Decision & Acknowledgment, Documentation Status. Bottom tabs: Timeline, Documents.'));
children.push(p('Quick actions in the header: Generate RoA (PDF), Send RoA (email), Mark RoA Complete, Edit.'));
children.push(gateCallout(
  'Target-market check: when the RoA is linked to a product from the Product Library, the system evaluates whether the client falls within the product\'s target market. If the result is "Mismatch", a supervisor (admin or admin_only) must co-approve before the RoA can be marked Complete. If the result is "Review Required", you must enter a written suitability override reason.'
));

// =========================================================================
// 9. POLICIES
// =========================================================================
children.push(h1('9. Policies'));
children.push(lead('Policies are the heart of the post-sale system. Everything else either feeds a policy (engagements, RoAs) or hangs off a policy (assets, claims, commission, post-sale events). The detail view has nine bottom tabs covering every aspect of the contract.'));

children.push(h2('9.1 List + form'));
children.push(img('60-policies-list.png'));
children.push(caption('Figure 9.1a — Policies list.'));
children.push(img('61-policy-new-form.png'));
children.push(caption('Figure 9.1b — New Policy form.'));
children.push(p('Required:'));
children.push(bullet('Policy number (must be unique).'));
children.push(bullet('Policy name.'));
children.push(bullet('Insurer.'));
children.push(bullet('Product category.'));
children.push(bullet('Inception date.'));
children.push(bullet('Assigned broker.'));
children.push(bullet('Broker code (the FSCA broker code under which the policy is placed — managed in Admin → Users → Broker Codes).'));
children.push(bullet('At least one of Contact or Account (subject to the compliance gate).'));
children.push(spacer());
children.push(gateCallout(
  'Two creation gates here:\n' +
  '   1. Status must be Pending at creation. Active is gated until a quote is approved.\n' +
  '   2. Linked contact must be Active and POPIA Green AND FICA Verified. Linked account must be FICA Verified. Failed gates return a 422 with the specific reason.'
));

children.push(h2('9.2 The policy detail view'));
children.push(img('62-policy-detail-sections-tab.png'));
children.push(caption('Figure 9.2 — Policy detail (Sections tab is the default).'));
children.push(p('Top-of-page sections: a Commission-missing banner if no commission is captured; Policy Details; Parties; Financial & Dates; Previously Linked Assets (if cancelled); Co-Insured & Other Contacts; Banking / Payment.'));
children.push(p('Quick actions in the action bar: Create Amendment Mail (composes a customer letter), Show Schedule (printable policy schedule), Edit.'));

children.push(h2('9.3 The nine bottom tabs'));
children.push(spacer());
children.push(ruleTable([
  ['Tab', 'Shows / lets you do'],
  ['Sections',         'Cover lines (Personal Motor, Buildings, etc.) grouped from the policy\'s assets. Combined or breakdown view (Show breakdown). Drill into a section for "Assets in this Section" with search + customizable columns.'],
  ['Assets',           'Flat list of every asset on the policy. Customizable columns. + Add Asset opens the choice modal (link existing or create new).'],
  ['Claims',           'Every claim raised against the policy. + Add Claim deep-links to the claim form pre-populated with this policy.'],
  ['Commission',       'Commission rates / amounts captured for this policy. Multiple lines allowed (e.g. fee + percentage). Without at least one commission line, the policy detail header shows the Commission missing banner.'],
  ['Post-Sale Events', 'Renewal-confirmations, mid-term amendments, lapse notices, cancellation notices — anything that happens after binding.'],
  ['Documents',        'Every uploaded file against the policy (insurer schedule, endorsements, customer letters).'],
  ['Timeline',         'Reverse-chronological log of every action.'],
  ['Versions',         'Snapshot of every change to the policy record (who changed what, when).'],
  ['Quotes',           'Quote PDFs/Word/Excel files. Each line has Approve / Reject buttons. Active is gated until at least one quote is approved.'],
]));
children.push(spacer(200));

children.push(h3('9.3.1 Sections tab — combined and breakdown views'));
children.push(p('The Sections tab groups the policy\'s assets by their Section field (Personal Motor, Buildings, Goods in Transit, etc.). The toolbar has two tickboxes:'));
children.push(bulletRich([
  new TextRun({ text: 'Show sold/inactive', bold: true }),
  new TextRun({ text: ' — only visible when the policy has assets that are no longer active. Off by default; tick to bring decommissioned / sold / cancelled / inactive assets back into view.' }),
]));
children.push(bulletRich([
  new TextRun({ text: 'Show breakdown', bold: true }),
  new TextRun({ text: ' — switches the table between a 6-column combined view and a 13-column breakdown view that decomposes each section into Sum Insured, Add\'l Cov (in / excluded), Extras (in / excluded), Asset Value, every premium component, SASRIA and basic excess.' }),
]));
children.push(img('63-policy-sections-breakdown.png'));
children.push(caption('Figure 9.3a — Sections tab with "Show breakdown" on. Excluded extras / additional covers are dimmed.'));
children.push(p('Click a section name to drill into "Assets in this Section":'));
children.push(img('64-policy-section-assets.png'));
children.push(caption('Figure 9.3b — "Assets in this Section" view. Section totals card on top; the Show breakdown tickbox switches between combined and per-component layouts. The Assets table uses the same column engine as the main Assets tab.'));
children.push(img('65-policy-section-assets-search.png'));
children.push(caption('Figure 9.3c — Search box filters the section\'s assets live (debounced) by name, registration, make, model, VIN, serial, contact, account or year.'));

children.push(h3('9.3.2 Assets tab'));
children.push(img('66-policy-tab-assets.png'));
children.push(caption('Figure 9.3d — Policy detail, Assets tab. ⚙ Columns + customizable layout.'));

children.push(h3('9.3.3 Claims tab'));
children.push(img('67-policy-tab-claims.png'));
children.push(caption('Figure 9.3e — Policy detail, Claims tab.'));

children.push(h3('9.3.4 Commission tab'));
children.push(p('This is where you record every commission line the FSP earns on the policy. Click + Commission and capture rate (% of premium) OR a flat rand amount, basis (Annual / Monthly), broker code, and effective date. You can have multiple lines (e.g. one for the placement fee and one for the renewal commission).'));
children.push(img('68-policy-tab-commission.png'));
children.push(caption('Figure 9.3f — Policy detail, Commission tab. The header banner on the policy disappears once at least one commission line is captured.'));

children.push(h3('9.3.5 Post-Sale Events tab'));
children.push(p('Every post-binding event the system needs to evidence: renewal confirmations sent, mid-term amendments, lapse / cancellation notices, anniversary letters, etc. Captures the event type, date, channel, and a copy of the document sent.'));
children.push(img('69-policy-tab-post-sale.png'));
children.push(caption('Figure 9.3g — Post-Sale Events tab.'));

children.push(h3('9.3.6 Documents tab'));
children.push(img('70-policy-tab-documents.png'));
children.push(caption('Figure 9.3h — Documents tab.'));

children.push(h3('9.3.7 Timeline tab'));
children.push(img('71-policy-tab-timeline.png'));
children.push(caption('Figure 9.3i — Timeline tab.'));

children.push(h3('9.3.8 Versions tab'));
children.push(p('Each row is a snapshot of the policy record after a change — who changed what, when, and what the previous values were. The system creates one snapshot per save automatically.'));
children.push(img('72-policy-tab-versions.png'));
children.push(caption('Figure 9.3j — Versions tab.'));

children.push(h3('9.3.9 Quotes tab — and how to activate the policy'));
children.push(p('Drag-and-drop or browse to upload the insurer\'s quote document (PDF / Word / Excel). Once uploaded, click "Approve" and capture the date you accepted the quote on the client\'s behalf.'));
children.push(img('73-policy-tab-quotes.png'));
children.push(caption('Figure 9.3k — Quotes tab. Each quote has its own Approve / Reject controls.'));
children.push(gateCallout(
  'Activating the policy: change status from Pending to Active and save. The system checks that at least one quote is uploaded AND has an "approved on" date. Without an approved quote, the save is rejected: "This policy cannot be set to Active — upload a quote in the Quotes tab and mark it approved before activating the policy."'
));

children.push(h2('9.4 The premium breakdown panel (Financial & Dates card)'));
children.push(p('The Financial & Dates card on the policy detail has a "Show premium breakdown" tickbox. Tick it and a sub-panel underneath aggregates Sum Insured + every premium component across all linked active assets — Sum Insured Premium, Vehicle Extras Premium, Additional Covers Premium, Excesses Premium, SASRIA — adding up to the policy\'s headline Total Premium. Loaded lazily the first time you tick the box; persisted in localStorage for next time.'));
children.push(img('74-policy-premium-breakdown.png'));
children.push(caption('Figure 9.4 — Premium breakdown panel.'));

children.push(h2('9.5 The policy schedule'));
children.push(p('Click "Show Schedule" in the action bar. The system generates a printable schedule pulling together the policy header + every asset + section totals — exactly the document you send to the client.'));
children.push(img('75-policy-schedule.png'));
children.push(caption('Figure 9.5 — Policy schedule.'));

// =========================================================================
// 10. ASSETS / COVERS
// =========================================================================
children.push(h1('10. Assets (covers)'));
children.push(lead('Assets are the insured items: vehicles, buildings, contents, equipment. Each asset hangs off a policy and a policy section. The asset form is where extras and additional covers are captured row-by-row, with per-row "In total" tickboxes that decide whether each row\'s amount counts toward the schedule.'));

children.push(h2('10.1 List + form'));
children.push(img('80-assets-list.png'));
children.push(caption('Figure 10.1a — Assets list.'));
children.push(img('81-asset-new-form.png'));
children.push(caption('Figure 10.1b — New Asset form (top of the long form).'));
children.push(p('Required:'));
children.push(bullet('Asset name (e.g. "Toyota Corolla Cross — CA 123-456").'));
children.push(bullet('Asset type (Motor / Property / Goods in Transit / Marine / Aviation / Agriculture / Liability / etc.).'));
children.push(bullet('Asset section (the cover line — "Motor – Light Motor Vehicle", "Property – Buildings (Domestic)", etc.). The list of sections is filtered by asset type.'));
children.push(bullet('Asset status (default Active).'));
children.push(bullet('Product (from the Product Library — must be Active).'));
children.push(bullet('Policy AND Policy Section (the latter groups the asset under the right cover line on the schedule).'));
children.push(bullet('Either Contact or Account (the policyholder).'));
children.push(spacer());
children.push(gateCallout('Buildings / structures additionally require a physical address (street + city/suburb). The system blocks the save with "A physical address … is required" if missing. Tip: capture GPS coordinates and / or a Google Maps link too — the schedule reads them.'));

children.push(h2('10.2 Vehicle Extras — per-row "In total" tickbox'));
children.push(p('Most vehicle and equipment assets carry extras (canopy, roof rack, sound system, tools-of-trade, decals). The Vehicle Extras grid lets you capture each row with four fields:'));
children.push(bullet('Description.'));
children.push(bullet('Amount.'));
children.push(bullet('Premium.'));
children.push(bulletRich([
  new TextRun({ text: 'In total', bold: true }),
  new TextRun({ text: ' — tick to include this row\'s amount in the asset\'s Sum Insured / Asset Value. The premium is ALWAYS added to Total Premium regardless of this tickbox.' }),
]));
children.push(img('82-asset-edit-extras-rows.png'));
children.push(caption('Figure 10.2 — Vehicle Extras grid. Each row has its own In total tickbox. The footer shows Amount Total (only the included rows) and Premium Total (every row).'));
children.push(newCallout(
  'Why per-row? Because amounts often duplicate value already inside the main Sum Insured. Factory-fitted tracker hardware is in the manufacturer\'s declared value; aftermarket extras are added on top. Premium is always charged so it always counts. The per-row tickbox lets you mirror the insurer\'s schedule exactly.'
));

children.push(h2('10.3 Additional Cover — per-row "In total" tickbox'));
children.push(p('Same pattern, for sub-limits / extensions: glass, riot, third-party limits, hail, business interruption sub-limits. Each row has Description + Cover Amount + Premium + In total + ✕.'));
children.push(img('83-asset-edit-additional-covers.png'));
children.push(caption('Figure 10.3 — Additional Cover grid. R-prefix sits inline with the input field.'));

children.push(h2('10.4 Auto-calculated Asset Value and Total Premium'));
children.push(p('The form\'s Asset Value and Total Premium fields are calculated live as you type:'));
children.push(spacer());
children.push(ruleTable([
  ['Total', 'Composition'],
  ['Asset Value', 'Sum Insured  +  Σ additional_covers[].cover_amount where In total = ON  +  Σ vehicle_extras[].amount where In total = ON'],
  ['Total Premium', 'Sum Insured Premium  +  SASRIA  +  Σ vehicle_extras[].premium  +  Σ additional_covers[].premium  +  Σ excesses[].premium'],
]));
children.push(spacer(200));
children.push(p('Everything you enter flows through to the asset detail, the policy schedule, the policy → Sections breakdown, and ultimately the client\'s schedule document. Accuracy matters — double-check before saving.'));

children.push(h2('10.5 The asset detail view + tabs'));
children.push(img('84-asset-detail.png'));
children.push(caption('Figure 10.5a — Asset detail.'));
children.push(p('Detail cards in order: a policy summary bar (premium, SASRIA, excess); Asset Details; Insurance Financials (with Show breakdown toggle); Address / Risk Address; Identification; Vehicle Extras; Excess Info; Additional Cover; Vehicle Risk Details; Financial Interest; Section-Specific Details (dynamic based on asset_section); Cover Details; Notes; Risk Details (linked); bottom tabs Timeline / Documents / Claims / Workflows / Versions.'));
children.push(p('Tick "Show breakdown" on the Insurance Financials card to switch from the four-field summary (Asset Value / Premium / SASRIA / Excess) to the full per-component layout.'));
children.push(img('85-asset-detail-breakdown.png'));
children.push(caption('Figure 10.5b — Asset detail, Show breakdown ticked. Vehicle Extras (in total) vs (excluded), Additional Covers (in total) vs (excluded), every premium component, then the totals.'));
children.push(p('Quick actions in the action bar: Create Amendment Mail, Confirmation of Cover, Edit.'));

// =========================================================================
// 11. CLAIMS
// =========================================================================
children.push(h1('11. Claims'));
children.push(lead('Claims are TCF Outcome 5 territory: customers should not face unreasonable post-sale barriers when they need to claim. The module is designed to evidence that you handled the claim fairly, kept the client informed, and produced a justifiable outcome.'));

children.push(h2('11.1 Logging a claim'));
children.push(img('90-claims-list.png'));
children.push(caption('Figure 11.1a — Claims list.'));
children.push(img('91-claim-new-form.png'));
children.push(caption('Figure 11.1b — New Claim form.'));
children.push(p('Required:'));
children.push(bullet('Claim number (typically the insurer\'s reference; must be unique).'));
children.push(bullet('Policy — must be Active.'));
children.push(bullet('Asset — must be Active.'));
children.push(bullet('Claim date and date reported.'));
children.push(bullet('Claim type — Motor / Property / Liability / GIT / Theft / Fire / Other.'));
children.push(bullet('Incident description.'));
children.push(spacer());
children.push(gateCallout(
  'Two gates apply when raising a claim:\n' +
  '   1. Linked policy must be Active.\n' +
  '   2. Linked asset must currently be Active.'
));

children.push(h2('11.2 The claim detail view + tabs'));
children.push(img('92-claim-detail.png'));
children.push(caption('Figure 11.2a — Claim detail.'));
children.push(p('Top banners: Settled (locked for further edits), Delay Flag, Fair Process Concern, Dispute Raised.'));
children.push(p('Detail cards: Claim Details, Parties, Claim Related Contacts, Financial, Driver Details, Client Communication, Dispute, Incident Description, Outcome.'));
children.push(p('Bottom tabs:'));
children.push(spacer());
children.push(ruleTable([
  ['Tab', 'Shows / lets you do'],
  ['Timeline',     'Reverse-chronological log of every claim event.'],
  ['Notes',        'Free-form notes — file-locked once Settled.'],
  ['Third Parties', 'Other parties involved (other vehicles / persons / insurers).'],
  ['Assets',       'Every asset linked to this claim — primary asset + any others affected.'],
  ['Documents',    'Photos, statements, repairer quotes, settlement letters.'],
  ['Workflows',    'Tasks / follow-ups assigned around this claim.'],
  ['Versions',     'Edit-history snapshots.'],
]));
children.push(spacer(200));
children.push(img('93-claim-tab-third-parties.png'));
children.push(caption('Figure 11.2b — Third Parties tab.'));
children.push(img('94-claim-tab-notes.png'));
children.push(caption('Figure 11.2c — Notes tab.'));

children.push(h2('11.3 Working a claim'));
children.push(p('Status flow: Notified → In Progress → Awaiting Documents → Settled / Rejected / Closed (or Disputed if it goes south). Important during the claim:'));
children.push(bullet('Keep "Last client update date" current. If you don\'t update for 7+ days while the claim is in progress, the system flags it as delayed.'));
children.push(bullet('Tick "Client kept informed" each time you communicate.'));
children.push(bullet('On rejection: capture the repudiation reason AND the broker\'s dispute action — both required.'));

// =========================================================================
// 12. COMPLAINTS
// =========================================================================
children.push(h1('12. Complaints'));
children.push(lead('Complaints are sensitive — both regulatorily (FAIS GCC, the Ombud rules) and reputationally. The complaints module enforces timelines and root-cause discipline so your complaints register stands up to scrutiny.'));

children.push(h2('12.1 Logging a complaint'));
children.push(img('100-complaints-list.png'));
children.push(caption('Figure 12.1a — Complaints list.'));
children.push(img('101-complaint-new-form.png'));
children.push(caption('Figure 12.1b — New Complaint form. The complaint number is auto-generated as COMP-YYYYMMDD-XXXX.'));

children.push(h2('12.2 The complaint detail view + tabs'));
children.push(img('102-complaint-detail.png'));
children.push(caption('Figure 12.2 — Complaint detail.'));
children.push(p('Banners: External Ombud Escalation, Internally Escalated. Cards: Complaint Details, Parties, Status & Flags, Complaint Summary, Resolution (if resolved). Bottom tabs: Timeline, Documents.'));

children.push(h2('12.3 SLA timer + auto-escalation'));
children.push(spacer());
children.push(ruleTable([
  ['Day', 'Trigger', 'Action by system'],
  ['Day 3+',  'No acknowledgement recorded',  'Email handler and supervisor; flag alert sent'],
  ['Day 21+', 'Still unresolved',             'Email supervisors; flag alert sent'],
  ['Day 30+', 'Still unresolved',             'Severity auto-escalated to Critical; senior management notified by email'],
]));
children.push(spacer(200));

children.push(h2('12.4 Resolving / closing / withdrawing'));
children.push(gateCallout('You cannot move a complaint to Resolved or Closed without first recording the root cause.'));
children.push(gateCallout('Complaints CANNOT be deleted. If logged in error or withdrawn by the client, use Withdraw — the record stays on file with a "Withdrawn" outcome.'));

// =========================================================================
// 13. REVIEWS, WORKFLOWS, REPORTS, COMPLIANCE OVERVIEWS
// =========================================================================
children.push(h1('13. Reviews, workflows, reports and compliance overviews'));

children.push(h2('13.1 Reviews'));
children.push(p('Annual / mid-year / claims / ad-hoc / complaint reviews. Required: review type, review date, at least one of (Contact / Account / Policy).'));
children.push(img('110-reviews-list.png'));
children.push(caption('Figure 13.1a — Reviews list.'));
children.push(img('111-review-new-form.png'));
children.push(caption('Figure 13.1b — New Review form.'));
children.push(p('Top banner: Urgent Action Required (when outcome = Urgent Action Required). Cards: Review Details, Parties, Risk Changes, Review Notes, Findings & Actions. Tabs: Timeline, Documents.'));
children.push(p('When the review outcome is "Changes Recommended" (or stronger), tick "Advice record required" — this requires a fresh RoA and the new RoA links back to this review.'));

children.push(h2('13.2 Workflows / tasks'));
children.push(img('120-workflows-list.png'));
children.push(caption('Figure 13.2a — Workflows list.'));
children.push(img('121-workflow-new-form.png'));
children.push(caption('Figure 13.2b — New Workflow form.'));
children.push(p('A simple task queue. Use it for follow-ups (e.g. "Chase quote for renewal", "FICA expiring in 30 days — re-verify"). Detail tabs: Notes (with inline form), Documents, Timeline. Quick actions: Mark Complete, Reopen.'));

children.push(h2('13.3 Reports'));
children.push(p('The Reports module has three tabs:'));
children.push(img('140-reports-predefined.png'));
children.push(caption('Figure 13.3a — Predefined Reports tab. Click a template, choose date ranges, run.'));
children.push(img('141-reports-custom.png'));
children.push(caption('Figure 13.3b — Custom Report Builder. Six steps: source → columns → filters → joins → sort/group → results. AI-assist: type a plain-English description (e.g. "Show me all clients with FICA expiring in the next 90 days, grouped by broker") and the system pre-fills the builder.'));
children.push(img('142-reports-audit.png'));
children.push(caption('Figure 13.3c — Audit Trail tab. Searchable, filterable view of every system action — module, user, action, timestamp, old value, new value.'));
children.push(tipCallout('You never see raw SQL. The AI generates the report definition; the system runs it inside the same data isolation rules that govern the rest of the app, so brokers will still only see their own data.'));

children.push(h2('13.4 Risk Details'));
children.push(img('130-risk-details.png'));
children.push(caption('Figure 13.4 — Risk Details list.'));
children.push(p('Risk Details are deeper risk descriptors that hang off an asset (e.g. detailed motor risk, building construction details, GIT route info). They feed underwriting and renewal questions.'));

children.push(h2('13.5 Policy Sections'));
children.push(img('131-policy-sections-list.png'));
children.push(caption('Figure 13.5 — Policy Sections list.'));
children.push(p('Policy sections are the named cover lines (e.g. "Personal Motor section"). They tie assets together for the schedule and are where needs analysis status is tracked. The detail view has a GAP banner (identified / none) and bottom tabs Timeline + Documents.'));

children.push(h2('13.6 POPIA, FICA and TCF overviews'));
children.push(img('150-popia-overview.png'));
children.push(caption('Figure 13.6a — POPIA overview. Surfaces clients whose POPIA needs attention.'));
children.push(img('151-fica-overview.png'));
children.push(caption('Figure 13.6b — FICA overview. Surfaces FICA records overdue for refresh / nearing 5-year expiry.'));
children.push(img('152-tcf-dashboard.png'));
children.push(caption('Figure 13.6c — TCF Dashboard (admin / admin_only). Real-time view against the six TCF outcomes.'));
children.push(img('153-data-breaches.png'));
children.push(caption('Figure 13.6d — Data Breach Log (POPIA s22 register).'));

children.push(h2('13.7 Notifications'));
children.push(img('170-notifications.png'));
children.push(caption('Figure 13.7 — Notification centre.'));
children.push(p('Central inbox of system-generated alerts: complaint SLA breaches, broker fitness expiries, FICA renewals due, policy renewals upcoming, target-market mismatches awaiting supervisor approval, etc.'));

// =========================================================================
// 14. THE EDIT-LOCK AND ADMIN OTP FLOW
// =========================================================================
children.push(h1('14. The edit-lock and admin OTP flow'));
children.push(lead('Once a record has been saved once, every subsequent edit is gated. The user must enter their own password OR a 6-digit one-time PIN issued by an admin. Both paths get captured in the audit trail.'));

children.push(h2('14.1 What is edit-locked?'));
children.push(p('All "stateful" records: policies, claims, advice records, FICA records, POPIA records, engagements, asset edits, complaint edits. Fresh creates go through unlocked; the lock kicks in once anything has been saved.'));

children.push(h2('14.2 The challenge modal'));
children.push(p('When a broker tries to save an edit on a locked record, a small centred modal appears asking for a password OR a PIN. The user types one or the other (the system tries password first, then OTP) and clicks Unlock. On success, the save proceeds and an UNLOCK_EDIT entry is written to the audit log.'));

children.push(h2('14.3 How an admin issues a PIN'));
children.push(p('When a user has forgotten their password or is in the field and cannot reset, an admin can issue a 6-digit one-time PIN that lets them through one edit. From Admin → Settings → Security pane:'));
children.push(img('163-admin-security.png'));
children.push(caption('Figure 14.3a — Admin → Settings → Security pane.'));
children.push(img('165-admin-otp-generate.png'));
children.push(caption('Figure 14.3b — Generate PIN. Pick the target user (optional — leave blank for any user), set TTL (1–1440 minutes), add notes if helpful.'));
children.push(p('The system stores the PIN in the otp_codes table with the chosen TTL. The admin shares the PIN with the user out-of-band (SMS, phone, in person — never inside the system). When the user types the PIN into the edit-lock modal, the system marks the PIN as used (single-use), captures the redeeming user, and writes an audit log entry showing both the issuing admin and the redeeming user.'));
children.push(noteCallout('PINs are single-use, time-bound, and cannot be re-used. Admins can revoke an unused PIN in the same pane before the user redeems it.'));

children.push(h2('14.4 Audit trail entries for the OTP flow'));
children.push(p('Two entries are written:'));
children.push(bullet('CREATE / otp_codes — when the admin issues the PIN. Captures admin name, target user (if any), TTL, notes.'));
children.push(bullet('UNLOCK_EDIT / edit_lock — when the user redeems the PIN against a record. Captures the user, the module, the record id, and which OTP was used.'));
children.push(p('Both entries are visible in Admin → Audit and in Reports → Audit Trail.'));

children.push(h2('14.5 The optional global bypass (testing only)'));
children.push(p('Admin → Settings → Security has a "Bypass edit-password gate" toggle. When ON, edit-locked saves go through without any password / PIN challenge — useful only for staging / training / migration scenarios. The audit log still records every save, but the unlock step is skipped. NEVER leave this on in production.'));

// =========================================================================
// 15. ADMIN MODULE
// =========================================================================
children.push(h1('15. Admin module'));
children.push(lead('Reserved for users with the admin role (and partly for admin_only). The admin module is split between top-level pages (Users, Audit) and a Settings page with a sidebar of tabs.'));

children.push(h2('15.1 User management'));
children.push(img('160-admin-users.png'));
children.push(caption('Figure 15.1 — User Management.'));
children.push(p('Create, edit, deactivate users. Assign roles. Manage broker codes per user. Trigger 2FA enrolment / disable. Reset passwords. The role determines what each user can see and do (Section 4.4).'));

children.push(h2('15.2 Audit log'));
children.push(img('161-admin-audit.png'));
children.push(caption('Figure 15.2 — Audit log.'));
children.push(p('Every CREATE, UPDATE, DELETE, LOGIN, LOGOUT, EXPORT, EMAIL, UNLOCK_EDIT and OTP-issue action is logged automatically. Each entry records: who did it, when, on which record, the old value, the new value, and a human-readable description.'));

children.push(h2('15.3 Settings'));
children.push(img('162-admin-settings.png'));
children.push(caption('Figure 15.3a — Admin Settings landing page.'));
children.push(p('The Settings page has a left sidebar of panes:'));
children.push(bullet('Company — branding, FSP details, contact info shown on outgoing emails / RoAs.'));
children.push(bullet('Users — quick access to user management.'));
children.push(bullet('Security — global bypass, OTP issuance, password policy, 2FA enforcement (Figure 14.3a).'));
children.push(bullet('Dashboard Default — set the system-wide default dashboard layout.'));
children.push(bullet('System Update — apply updates from GitHub release tags.'));
children.push(bullet('SMTP / Email — outbound email config.'));
children.push(bullet('Database Snapshot — manually take a snapshot before risky actions.'));

children.push(h3('15.3.1 System Update'));
children.push(img('164-admin-system-update.png'));
children.push(caption('Figure 15.3.1 — System Update pane. Reads release tags from GitHub and matches against the running version. The release-notes panel reads RELEASES.md.'));
children.push(tipCallout('Always take a manual database snapshot before applying any update — Settings → Database Snapshot. The system creates one automatically as part of the update routine, but having your own makes rollback faster.'));

children.push(h2('15.4 Product Library'));
children.push(img('132-products.png'));
children.push(caption('Figure 15.4 — Product Library.'));
children.push(p('Maintain the list of insurance products you advise on. For each product capture target market, geographic scope, insurable value range, key exclusions, suitable risk appetite, and product status. The Product Library is what powers the target-market check on every Record of Advice and is the source of the Product dropdown on the asset form.'));

// =========================================================================
// 16. WHAT'S NEW (v1.0.20 → v1.0.23)
// =========================================================================
children.push(h1('16. What\'s new in this release (v1.0.20 → v1.0.23)'));
children.push(lead('A focused summary of changes since the previous manual. Pair this with the in-app release-notes panel for the canonical changelog.'));

children.push(h2('16.1 v1.0.23'));
children.push(bullet('Per-row "In total" tickbox on Additional Covers — each cover row decides for itself whether its amount counts toward Asset Value.'));
children.push(bullet('R-prefix layout fix on the Additional Cover grid — currency prefix sits inline with the input, no longer wraps above it.'));
children.push(bullet('Asset detail Additional Cover table grew an "In Total" ✓/✗ column with dimmed excluded rows.'));
children.push(bullet('Every aggregate view now shows Additional Covers as separate "in total" / "excluded" lines.'));

children.push(h2('16.2 v1.0.22'));
children.push(bullet('Per-row "In total" tickbox introduced for Vehicle Extras.'));
children.push(bullet('vehicle_extras[] JSON gained a per-row include_in_total flag; legacy data falls back to the global asset.extras_in_total boolean for full backwards compatibility.'));

children.push(h2('16.3 v1.0.21'));
children.push(bullet('Customizable columns + sort + search on "Assets in this Section" view, sharing the column engine and view-prefs key with the main Assets tab.'));
children.push(bullet('Search field next to the "Assets in this Section" header — debounced live filter across name, registration, make, model, VIN, serial, contact, account, year.'));
children.push(bullet('"Show breakdown" toggle in four places: Asset detail Insurance Financials card, Policy detail Financial & Dates card, Policy → Sections tab summary + table, and the per-section "Assets in this Section" totals card. Each toggle\'s state is remembered separately in localStorage.'));

children.push(h2('16.4 v1.0.20 and earlier'));
children.push(bullet('Dark-mode polish: every modal close button standardised on .modal-close, 2FA modal themed, modal footers + data-breach popup themed, secondary buttons / table lines / chart labels themed.'));
children.push(bullet('Auto-calculated currency inputs (Asset Value, Premium) marked read-only and styled so users do not type into them.'));
children.push(bullet('In-app System Update flow now reads RELEASES.md so admins see what each version changed before applying.'));

// =========================================================================
// 17. APPENDIX — picklist reference
// =========================================================================
children.push(h1('17. Appendix — picklist reference'));
children.push(lead('Useful for capturing data correctly the first time.'));

children.push(h2('17.1 Contact lifecycle'));
children.push(p('Contact statuses: Prospect · Active Client · Inactive Client · Former Client · Do Not Service · Deceased.'));
children.push(p('FICA statuses: Not Started · Pending Documents · In Review · Verified · Expired · Exempt.'));

children.push(h2('17.2 Engagement stages (in order)'));
children.push(p('Prospect → Initial Contact → Appointment Scheduled → Fact Find Completed → Needs Analysis Completed → Quote / Proposal Prepared → Advice Presented → Client Decision Pending → Accepted - Implementation → Implemented / Active. Plus terminal stages: Lost / Declined and On Hold.'));

children.push(h2('17.3 Disclosure picklists'));
children.push(p('FSP licence disclosed: Yes — Written / Yes — Verbal / No.'));
children.push(p('Complaints process disclosed: Yes — Written / Yes — Verbal / Complaints form provided / No.'));
children.push(p('Disclosure method: In-person meeting / Phone call / Video call / Email / WhatsApp / Signed form.'));

children.push(h2('17.4 Policy & cover'));
children.push(p('Policy statuses: Pending · Active · Amended · Cancelled · Lapsed · Expired.'));
children.push(p('Policy section needs analysis status: Not Assessed · Assessed · Recommendation Made · Accepted · Declined · Implemented · Not Applicable.'));

children.push(h2('17.5 Claims'));
children.push(p('Claim statuses: Notified · In Progress · Awaiting Documents · Settled · Rejected · Closed · Disputed.'));
children.push(p('Claim types: Motor · Property · Liability · GIT · Theft · Fire · Other.'));

children.push(h2('17.6 Complaints'));
children.push(p('Statuses: Open · In Progress · Awaiting Response · Resolved · Closed · Escalated.'));
children.push(p('Severity: Low · Medium · High · Critical.'));
children.push(p('Categories: Service Quality · Incorrect Advice · Claims Handling · Premium Dispute · Policy Cancellation · POPIA Breach · Conduct · Other.'));
children.push(p('Outcomes: Upheld — full remedy · Upheld — partial remedy · Not upheld · Withdrawn by client · Referred to Ombudsman.'));

children.push(h2('17.7 POPIA lawful bases'));
children.push(p('Consent · Contractual necessity · Legal obligation · Legitimate interest · Vital interest. Consent is the most common for insurance advisory.'));

children.push(h2('17.8 FICA verification methods'));
children.push(p('South African ID document · Passport · CIPC registration (company) · Driver\'s licence · Biometric · Other certified document.'));

// END
children.push(h1('Document end'));
children.push(p(`Inexpro CRM User Manual · Version 3.0 · Application v1.0.23 · ${TODAY}`, { italics: true }));
children.push(p('Compiled from the live application. The rules described here are enforced in code; if a workflow described here ever differs from what the application allows, trust the application — and please report the documentation drift so this manual can be updated.'));

// ── Build doc ──────────────────────────────────────────────────────────────

const doc = new Document({
  creator: 'Inexpro CRM',
  title: 'Inexpro CRM — User Manual',
  description: 'Workflow-driven user manual for brokers and admin staff.',
  styles: {
    default: {
      document: {
        run: { font: 'Calibri', size: 22 },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        // Bigger top + bottom margins to leave room for the new banner header / footer.
        margin: { top: 1500, right: 1100, bottom: 1400, left: 1100, header: 360, footer: 360 },
      },
      titlePage: true,   // suppress header/footer on the cover page
    },
    headers: {
      // Suppressed cover header
      first: new Header({
        children: [new Paragraph({ children: [new TextRun({ text: '' })] })],
      }),
      default: new Header({
        children: [
          // Navy band: 3-cell table — left title, centre subtitle, right tagline
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top:    { style: BorderStyle.NONE, size: 0, color: WHITE },
              left:   { style: BorderStyle.NONE, size: 0, color: WHITE },
              right:  { style: BorderStyle.NONE, size: 0, color: WHITE },
              bottom: { style: BorderStyle.SINGLE, size: 23, color: GOLD },
              insideVertical:   { style: BorderStyle.NONE, size: 0, color: WHITE },
              insideHorizontal: { style: BorderStyle.NONE, size: 0, color: WHITE },
            },
            rows: [new TableRow({
              children: [
                new TableCell({
                  width: { size: 40, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.CLEAR, fill: NAVY },
                  margins: { top: 120, bottom: 120, left: 200, right: 100 },
                  children: [new Paragraph({
                    alignment: AlignmentType.LEFT,
                    children: [new TextRun({ text: 'INEXPRO CRM User Manual', bold: true, color: WHITE, size: 22 })],
                  })],
                }),
                new TableCell({
                  width: { size: 30, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.CLEAR, fill: NAVY },
                  margins: { top: 120, bottom: 120, left: 100, right: 100 },
                  children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: 'Brokerage Operating System', color: WHITE, size: 18 })],
                  })],
                }),
                new TableCell({
                  width: { size: 30, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.CLEAR, fill: NAVY },
                  margins: { top: 120, bottom: 120, left: 100, right: 200 },
                  children: [new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: 'Compliance-Driven Advisory Platform', color: GREY_LT, size: 16, italics: true })],
                  })],
                }),
              ],
            })],
          }),
        ],
      }),
    },
    footers: {
      first: new Footer({
        children: [new Paragraph({ children: [new TextRun({ text: '' })] })],
      }),
      default: new Footer({
        children: [
          // Three-cell row: left CRM | confidential, centre page n/N, right (empty for spacing)
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top:    { style: BorderStyle.SINGLE, size: 6, color: GOLD },
              left:   { style: BorderStyle.NONE,   size: 0, color: WHITE },
              right:  { style: BorderStyle.NONE,   size: 0, color: WHITE },
              bottom: { style: BorderStyle.NONE,   size: 0, color: WHITE },
              insideVertical:   { style: BorderStyle.NONE, size: 0, color: WHITE },
              insideHorizontal: { style: BorderStyle.NONE, size: 0, color: WHITE },
            },
            rows: [new TableRow({
              children: [
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  margins: { top: 100, bottom: 40, left: 0, right: 0 },
                  children: [new Paragraph({
                    alignment: AlignmentType.LEFT,
                    children: [new TextRun({ text: 'INEXPRO CRM | User Manual — Confidential', size: 16, color: GREY_DK })],
                  })],
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  margins: { top: 100, bottom: 40, left: 0, right: 0 },
                  children: [new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      new TextRun({ text: 'Page ', size: 16, color: GREY_DK }),
                      new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY_DK, bold: true }),
                      new TextRun({ text: ' of ', size: 16, color: GREY_DK }),
                      new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: GREY_DK, bold: true }),
                    ],
                  })],
                }),
              ],
            })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 60 },
            children: [new TextRun({
              text: 'CK 1995/049701/23   •   VAT 4240154593   •   Inexpro is an authorised financial services provider   •   FSP licence number: 7591',
              size: 14, color: GREY_MD,
            })],
          }),
        ],
      }),
    },
    children,
  }],
});

(async () => {
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(OUT, buf);
  const sz = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log(`✅ Wrote ${OUT}  (${sz} KB, ${children.length} blocks)`);
})().catch(e => { console.error(e); process.exit(1); });
