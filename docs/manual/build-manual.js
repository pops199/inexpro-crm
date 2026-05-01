// Builds Inexpro_CRM_User_Manual.docx from screenshots + text blocks.
// Run: node docs/manual/build-manual.js

const fs = require('fs');
const path = require('path');
const sizeOf = (() => { try { return require('image-size'); } catch (_) { return null; } })();

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle,
  PageBreak, ShadingType, LevelFormat, Footer, Header, PageNumber, NumberFormat,
} = require('docx');

const SHOTS = path.join(__dirname, 'screenshots');
const OUT = path.join(__dirname, '..', '..', 'Inexpro_CRM_User_Manual.docx');
const TODAY = new Date().toISOString().slice(0, 10);

// --- helpers ---------------------------------------------------------------

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
    spacing: { before: 360, after: 200 },
    pageBreakBefore: true,
    children: [new TextRun({ text, bold: true, size: 36, color: '0B3D5C' })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true, size: 28, color: '0B3D5C' })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, color: '155A8A' })],
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

function gateCallout(text) {
  return callout('🚦 GATE', text, 'FBE9E9', '8A1A1A');
}

function tipCallout(text) {
  return callout('💡 Tip', text, 'E5F1FB', '0B3D5C');
}

function ruleTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: rows[0].map(text => new TableCell({
          shading: { type: ShadingType.CLEAR, fill: '0B3D5C' },
          children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 20 })] })],
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
      new TextRun({ text: `Step ${num}.  `, bold: true, color: 'C00000', size: 26 }),
      new TextRun({ text: title, bold: true, color: '0B3D5C', size: 26 }),
    ],
  });
}

function spacer(after = 100) {
  return new Paragraph({ spacing: { after }, children: [new TextRun('')] });
}

// --- Content ---------------------------------------------------------------

const children = [];

// COVER
children.push(
  new Paragraph({ spacing: { before: 1800 }, children: [new TextRun('')] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'INEXPRO CRM', bold: true, size: 64, color: '0B3D5C' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [new TextRun({ text: 'User Manual', size: 36, color: '555555' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [new TextRun({ text: 'A workflow-driven, compliance-aware guide for brokers, admin staff and supervisors.', italics: true, size: 22, color: '555555' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 1200 },
    children: [new TextRun({ text: `Version 1.0  ·  ${TODAY}`, size: 20, color: '777777' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Inexpro Insurance Brokers (Pty) Ltd', size: 20, color: '777777' })],
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
  '   •  You cannot create a policy for a client whose FICA is not verified.\n' +
  '   •  You cannot activate a policy until at least one quote is uploaded and approved.\n' +
  '   •  You cannot mark a complaint Resolved until the root cause is recorded.\n' +
  '   •  You cannot delete a complaint — ever. (You can withdraw it.)\n' +
  '   •  You cannot raise a claim against a Pending policy.\n' +
  '   •  You cannot save an asset without selecting a product from the Product Library.'
));

children.push(h2('1.4 How to read this manual'));
children.push(p('The chapters follow the natural sequence of a client relationship — onboarding first, then engagement, advice, policy issue, then ongoing service (claims, complaints, reviews). Each step shows the screen you will see, calls out the fields that matter for compliance, and flags any gates that block the next step.'));
children.push(p('If a screenshot in this manual differs slightly from what you see on screen, the system will always reflect the latest version — the rules described in the captions remain authoritative.'));

// =========================================================================
// 2. GETTING STARTED
// =========================================================================
children.push(h1('2. Getting started'));

children.push(h2('2.1 Logging in'));
children.push(p('Open the Inexpro CRM URL in your browser. You will be presented with the sign-in screen.'));
children.push(img('01-login.png', 480));
children.push(caption('Figure 2.1 — Sign-in screen'));
children.push(p('Enter the username and password supplied to you by your administrator and click Sign In. The system will remember your session in this browser until you log out or your session expires.'));
children.push(tipCallout('Change your password from Admin → User Management the first time you sign in. The default admin password (admin / admin123) must be changed immediately on first deployment.'));

children.push(h2('2.2 The dashboard'));
children.push(p('After signing in, you land on the main dashboard. This is your at-a-glance view of the business: active contacts, open engagements, active policies, open claims, upcoming renewals, and overdue reviews.'));
children.push(img('02-dashboard.png'));
children.push(caption('Figure 2.2 — Main dashboard with KPIs and charts'));
children.push(p('There are two dashboard views, switchable at the top right:'));
children.push(bullet('Main Dashboard — operational view (clients, policies, claims, engagement pipeline).'));
children.push(bullet('TCF Dashboard — compliance view oriented around the six Treating Customers Fairly outcomes (admin / admin_only roles only).'));

children.push(h2('2.3 Navigation'));
children.push(p('The left-hand sidebar gives you access to every module. The modules are presented in roughly the order you will use them during a client lifecycle:'));
children.push(bullet('Dashboards · Contacts · Accounts · Covers (policy sections) · Policies · Claims · Client Engagements · Records of Advice · Risk Details · POPIA · FICA · Complaints · Workflows · Reports · Admin'));
children.push(p('You can also click any client / policy / engagement name in a list to drill into its detail view, which collects everything related to that record (documents, timeline, related claims, etc.) onto a single page.'));

children.push(h2('2.4 Roles and what each can do'));
children.push(p('There are three roles. Your administrator assigns one when they create your user account.', { bold: false }));
children.push(spacer());
children.push(ruleTable([
  ['Capability', 'admin', 'broker', 'admin_only'],
  ['View all clients (across brokers)', 'Yes', 'Own only', 'Yes'],
  ['Create / edit clients, policies, RoAs', 'Yes', 'Yes', 'Yes'],
  ['Edit other brokers\' records', 'Yes', 'No', 'Yes'],
  ['Delete records', 'Yes', 'Own only', 'No'],
  ['Manage users', 'Yes', 'No', 'No'],
  ['View audit log', 'Yes', 'Yes', 'Yes'],
  ['TCF dashboard / broker fitness / Product Library', 'Yes', 'No', 'Yes'],
  ['Supervisor co-approval on RoA mismatches', 'Yes', 'No', 'Yes'],
]));
children.push(spacer(220));
children.push(p('Brokers see only their own clients (data isolation). Admin and admin_only users see everything. Only admins can manage users; only admins or owning brokers can delete records.'));

// =========================================================================
// 3. THE GOLDEN RULE — GATES
// =========================================================================
children.push(h1('3. The golden rule — workflow gates'));
children.push(lead('The single most important page in this manual. Everything else makes sense once you internalise these gates.'));

children.push(h2('3.1 Quick-reference table'));
children.push(p('Read this table left-to-right: "If you want to do the thing in column 1, you must first have done everything in column 2."'));
children.push(spacer());
children.push(ruleTable([
  ['You want to…', 'You must first…'],
  ['Set a Contact to Active Client', 'Verify FICA · Capture POPIA consent · Record a POPIA lawful basis'],
  ['Set a business Account to Active', 'Verify FICA on the account'],
  ['Create a Policy for an individual', 'Verify FICA on the contact · Capture POPIA consent on the contact'],
  ['Create a Policy for a business', 'Verify FICA on the account'],
  ['Set a Policy to Active', 'Save the policy as Pending · Upload a quote · Approve the quote'],
  ['Save an Asset', 'Pick a Product from the Product Library (must be Active)'],
  ['Save a building / structure asset', 'Capture a physical address (street + city/suburb)'],
  ['Create a Record of Advice (RoA)', 'Have a Client Engagement on the contact/account with all pre-sale disclosure complete'],
  ['Mark an RoA Complete', 'Tick all explanation flags · Declare COI · If target market mismatch, get supervisor co-approval'],
  ['Raise a Claim', 'The policy must be Active (not Pending/Cancelled/Lapsed/Expired)'],
  ['Raise a Claim', 'An Active asset must be selected on the claim'],
  ['Mark a Complaint Resolved or Closed', 'Record the root cause'],
  ['Delete a Complaint', 'Not allowed. Use Withdraw instead.'],
  ['Delete a record (as admin_only)', 'Not allowed. Ask an admin or the owning broker.'],
  ['Issue an RoA from a Review', 'Tick "Advice record required" on the review and create the linked RoA'],
]));
children.push(spacer(200));
children.push(p('Every gate above is enforced server-side; the system will return a clear error message if you try to bypass it. If you ever see one of these errors, the message will tell you what to do.', { italics: true }));

// =========================================================================
// 4. ONBOARDING A NEW CLIENT — Individual
// =========================================================================
children.push(h1('4. Onboarding an individual client (Prospect → Active → Policy)'));
children.push(lead('This is the canonical workflow. Master this and you understand the system. The example uses a fictional prospect, Thandiwe Mokoena, who progresses through onboarding to become an Active Client (Sarah Naidoo in our seed data shows the end state).'));

// 4.1
children.push(step('4.1', 'Create the prospect contact'));
children.push(p('From the sidebar, click Contacts. You see the list of all your contacts. Click + New Contact (top right).'));
children.push(img('03-contacts-list.png'));
children.push(caption('Figure 4.1a — Contacts list. Each row shows name, status, FICA state and assigned broker.'));
children.push(img('04-contact-new-form.png'));
children.push(caption('Figure 4.1b — New Contact form. The form is long; capture the personal details and minimum required fields, then save.'));
children.push(p('Required at this point:'));
children.push(bullet('First name, Last name'));
children.push(bullet('Contact type (default: Individual Client)'));
children.push(bullet('Client category (Personal Lines / Commercial Lines / etc.)'));
children.push(bullet('Contact status — leave at Prospect.'));
children.push(bullet('FICA status — usually starts as Not Started.'));
children.push(bullet('POPIA consent obtained — usually 0 (No) at this stage.'));
children.push(spacer());
children.push(gateCallout('Do NOT set Contact Status to Active Client at this point. The system will refuse the save: a contact cannot be activated until FICA is verified and a POPIA lawful basis is recorded. We will do those next.'));

// 4.2 FICA
children.push(step('4.2', 'Verify FICA'));
children.push(p('Open the contact you just created. Look in the Compliance Snapshot panel and click "Open FICA Record →", or use FICA in the sidebar and pick this contact.'));
children.push(img('05-contact-prospect-detail.png'));
children.push(caption('Figure 4.2a — A new prospect\'s detail page. Compliance Snapshot shows FICA and POPIA both incomplete.'));
children.push(img('06-contact-fica-prospect.png'));
children.push(caption('Figure 4.2b — Empty FICA record for a prospect. Capture the verification details here.'));
children.push(p('Capture, at minimum:'));
children.push(bullet('Verification method — South African ID document, Passport, CIPC registration, Driver\'s licence, Biometric, or Other certified document.'));
children.push(bullet('Verification date — the date you actually sighted and verified the documents.'));
children.push(bullet('Beneficial owner confirmed — Yes / No / Pending.'));
children.push(bullet('PEP check — Yes — clear, Yes — flagged for review, or Not yet performed.'));
children.push(bullet('ID document received — tick.'));
children.push(bullet('Proof of address received — tick.'));
children.push(p('Save. The system automatically calculates the 5-year FICA expiry date from your verification date — there is nothing else for you to do for that field.'));
children.push(img('10-contact-fica-verified.png'));
children.push(caption('Figure 4.2c — A verified FICA record. Note the Verified status badge and the auto-calculated expiry.'));

// 4.3 POPIA
children.push(step('4.3', 'Capture POPIA consent and lawful basis'));
children.push(p('Back on the contact, click "Open POPIA Record →" in the Compliance Snapshot, or use POPIA in the sidebar.'));
children.push(img('07-contact-popia-prospect.png'));
children.push(caption('Figure 4.3a — Empty POPIA record. The lawful basis is the most important field here.'));
children.push(p('Capture:'));
children.push(bullet('Data processing basis (lawful basis under POPIA s11) — Consent, Contractual necessity, Legal obligation, Legitimate interest, or Vital interest. For typical insurance advisory, "Consent" is the most common.'));
children.push(bullet('Consent obtained — set to Yes.'));
children.push(bullet('Consent date — the date the client signed the consent form / opted in.'));
children.push(bullet('Consent method — Signed form, Digital opt-in, Email, or Verbal.'));
children.push(bullet('Purpose of processing — describe in plain language (e.g. "Insurance advice, intermediary services and policy administration").'));
children.push(bullet('Retention period (years) — defaults to 5 years; adjust if your retention policy differs.'));
children.push(img('11-contact-popia-consented.png'));
children.push(caption('Figure 4.3b — A completed POPIA record. The lawful basis and consent date are now on file.'));

// 4.4 Activate
children.push(step('4.4', 'Promote the contact to Active Client'));
children.push(p('Now go back to the contact, click Edit (top right), and change Contact Status from Prospect to Active Client. Save.'));
children.push(img('12-gate-activation-error.png'));
children.push(caption('Figure 4.4 — The Edit Contact form. Change Contact Status to "Active Client" and save.'));
children.push(gateCallout(
  'If the system rejects the save with "POPIA: a Data Processing Basis must be recorded before this contact can be set to Active Client" — go back to the POPIA record and capture the lawful basis. ' +
  'If the FICA status on the contact is anything other than Verified, the policy creation in step 4.8 will also fail with a clear error.'
));
children.push(img('09-contact-active-detail.png'));
children.push(caption('Figure 4.4b — The contact, now Active. The Compliance Snapshot shows POPIA Consent + Data Processing Basis + FICA all green.'));

// 4.5 Engagement
children.push(step('4.5', 'Create a Client Engagement'));
children.push(p('A Client Engagement is the advisory pipeline for this client. It captures the conversation: fact-find, needs analysis, quotes, and ultimately the advice presented. You cannot record a Record of Advice (RoA) without first creating an engagement, because the engagement is where pre-sale disclosure (FAIS GCC §4) is captured.'));
children.push(p('From the sidebar click Client Engagements, then + New Engagement.'));
children.push(img('16-engagements-list.png'));
children.push(caption('Figure 4.5a — Engagements list. Each shows the client, current stage, and disclosure status.'));
children.push(img('17-engagement-new-form.png'));
children.push(caption('Figure 4.5b — New Engagement form.'));
children.push(p('Required:'));
children.push(bullet('Engagement name (e.g. "Sarah Naidoo — Household & Motor 2026")'));
children.push(bullet('Engagement type (New Business / Renewal / Amendment / etc.)'));
children.push(bullet('Assigned broker'));
children.push(bullet('At least one of: Contact OR Account'));
children.push(p('The engagement starts in stage "Prospect". As you advance through fact-find, needs analysis, quote and presentation, you progress the stage:'));
children.push(p('Prospect → Initial Contact → Appointment Scheduled → Fact Find Completed → Needs Analysis Completed → Quote / Proposal Prepared → Advice Presented → Client Decision Pending → Accepted - Implementation → Implemented / Active', { italics: true }));

// 4.6 Disclosure
children.push(step('4.6', 'Capture the pre-sale disclosure (FAIS GCC §4)'));
children.push(p('Inside the engagement, the Pre-Sale Disclosure section is where you record what was disclosed and how. The system computes whether the disclosure is "Complete" or "Incomplete" — and this status is required before you can save a Record of Advice.'));
children.push(img('18-engagement-detail.png'));
children.push(caption('Figure 4.6 — A completed engagement showing the Pre-Sale Disclosure panel marked Complete. Note the Process Completion checklist tracking each conversation step.'));
children.push(p('For disclosure to compute as Complete, ALL of the following must be captured:'));
children.push(bullet('FSP licence disclosed — Yes — Written OR Yes — Verbal.'));
children.push(bullet('Broker identity disclosed — ticked.'));
children.push(bullet('Product costs disclosed — ticked AND notes filled in (premium, intermediary fee, any other charges).'));
children.push(bullet('Material risks disclosed — ticked AND notes filled in (excesses, exclusions, waiting periods).'));
children.push(bullet('Complaints process disclosed — Yes — Written, Yes — Verbal, OR Complaints form provided.'));
children.push(bullet('Disclosure method — In-person meeting, Phone call, Video call, Email, WhatsApp, OR Signed form.'));
children.push(spacer());
children.push(gateCallout('If any one of these six fields is missing or invalid, the disclosure status reads Incomplete and the system will block any RoA creation against this engagement with a message naming the missing item.'));

// 4.7 RoA
children.push(step('4.7', 'Create the Record of Advice'));
children.push(p('From the engagement detail page click "Create RoA" (green button, top right). Or from the sidebar choose Records of Advice → + New Record.'));
children.push(img('19-advice-list.png'));
children.push(caption('Figure 4.7a — Records of Advice list.'));
children.push(img('20-advice-new-form.png'));
children.push(caption('Figure 4.7b — New RoA form. The fields here mirror the FAIS s9 record-of-advice requirements.'));
children.push(p('Required to save as draft:'));
children.push(bullet('Broker · Prepared by · Advice date · Advice type (New Business / Amendment / Cancellation / Review / Claims-Driven Advice).'));
children.push(bullet('Trigger event (Client Engagement / Policy Amendment / Cancellation / Review / Claim / Enquiry).'));
children.push(bullet('Client needs identified — narrative.'));
children.push(bullet('Risk analysis summary — narrative.'));
children.push(bullet('Recommendation given — what you advised and why.'));
children.push(bullet('Reason product is suitable — link the recommendation to the client\'s needs.'));
children.push(bullet('Conflict of Interest declared — Yes or No (cannot be left blank). If Yes, the description is also required.'));
children.push(p('Required to mark the RoA "Complete" (this is the final step that produces the record-of-advice document):'));
children.push(bullet('All explanation flags ticked: Risks Explained · Costs Explained · Excess Explained · Waiting Period & Limitations Explained · Exclusions Explained · Client Understanding Confirmed · Fair Outcome Considered.'));
children.push(bullet('Client decision — Accepted, Declined, Deferred, or Pending. If Declined, you must capture the rejection reason.'));
children.push(img('21-advice-detail.png'));
children.push(caption('Figure 4.7c — A completed RoA detail page. The auto-generated AR-YYYYMMDD-XXXX number identifies it permanently.'));
children.push(gateCallout(
  'Target-market check: when the RoA is linked to a product from the Product Library, the system evaluates whether the client falls within that product\'s target market. If the result is "Mismatch", a supervisor (admin or admin_only) must co-approve before the RoA can be saved as complete. If the result is "Review Required", you must enter a written suitability override reason.'
));

// 4.8 Policy
children.push(step('4.8', 'Create the policy'));
children.push(p('Click Policies in the sidebar, then + New Policy.'));
children.push(img('22-policies-list.png'));
children.push(caption('Figure 4.8a — Policies list.'));
children.push(img('23-policy-new-form.png'));
children.push(caption('Figure 4.8b — New Policy form.'));
children.push(p('Required:'));
children.push(bullet('Policy number (must be unique).'));
children.push(bullet('Policy name (a friendly description).'));
children.push(bullet('Insurer.'));
children.push(bullet('Product category.'));
children.push(bullet('Inception date.'));
children.push(bullet('Assigned broker.'));
children.push(bullet('At least one of Contact or Account.'));
children.push(spacer());
children.push(gateCallout(
  'Two creation gates here:\n' +
  '   1. The policy cannot be created with status Active. Save it as Pending first.\n' +
  '   2. The linked contact must have FICA = Verified AND POPIA consent obtained. The linked account must have FICA = Verified. ' +
  'If either is missing, the system returns a 422 error naming the client and explaining why.'
));

// 4.9 Quote
children.push(step('4.9', 'Upload and approve a quote'));
children.push(p('Open the policy detail. You will see tabs at the bottom — Sections, Assets, Claims, Commission, Post-Sale Events, Documents, Timeline, Versions, and Quotes. Click Quotes.'));
children.push(p('Drag-and-drop or browse to upload the insurer\'s quote document (PDF, Word, or Excel are all accepted). Once uploaded, the quote appears in the list. Click "Approve" and enter the date you approved the quote on behalf of the client.'));
children.push(tipCallout('Why is the quote required? Because it is the documentary evidence that the price and cover the client accepted match what was placed on cover. Without it, you cannot prove the policy reflects the agreed terms — which is a TCF Outcome 3 issue.'));

// 4.10 Activate
children.push(step('4.10', 'Activate the policy'));
children.push(p('Edit the policy, change status from Pending to Active, save.'));
children.push(gateCallout('The system checks: at least one quote must be uploaded AND have an "approved on" date. If no approved quote is on file, the save is rejected with: "This policy cannot be set to Active — upload a quote in the Quotes tab and mark it approved before activating the policy."'));
children.push(img('24-policy-detail.png'));
children.push(caption('Figure 4.10 — A policy now Active. The status badge confirms the activation; the policy can now accept assets and claims.'));

// 4.11 Asset
children.push(step('4.11', 'Add the insured asset(s)'));
children.push(p('On the policy detail, in the Assets tab, click + Add Asset. (Or use Risk Details → Assets in the sidebar.)'));
children.push(img('26-assets-list.png'));
children.push(caption('Figure 4.11a — Assets list.'));
children.push(img('27-asset-new-form.png'));
children.push(caption('Figure 4.11b — New Asset form.'));
children.push(p('Required:'));
children.push(bullet('Asset name (e.g. "Toyota Corolla Cross — CA 123-456").'));
children.push(bullet('Asset type (Motor Vehicle / Building / Contents / Electronic Equipment / etc.).'));
children.push(bullet('Asset status (default Active).'));
children.push(bullet('Product (from the Product Library — must be Active).'));
children.push(bullet('Sum insured & premium.'));
children.push(spacer());
children.push(gateCallout('Buildings and structures additionally require a physical address (street + city/suburb). The system will block the save with the error "A physical address … is required" if missing.'));
children.push(img('28-asset-detail.png'));
children.push(caption('Figure 4.11c — A saved asset linked to a policy.'));

// 4.12 Schedule
children.push(step('4.12', 'Generate the policy schedule'));
children.push(p('Open the policy detail and click "Show Schedule" (top right). The schedule pulls together all the assets and produces a printable summary you can send to the client.'));
children.push(img('25-policy-schedule.png'));
children.push(caption('Figure 4.12 — Policy schedule view.'));

// =========================================================================
// 5. BUSINESS CLIENTS (Accounts)
// =========================================================================
children.push(h1('5. Business clients (Accounts)'));
children.push(p('Accounts are non-natural persons: companies, close corporations, sole proprietors, partnerships, trusts, NPOs, schools, churches, body corporates. The workflow mirrors the contact flow with two important differences:'));
children.push(bullet('POPIA consent does not apply to accounts (POPIA covers natural persons only). You only need FICA verified to activate an account.'));
children.push(bullet('Business type is required at creation: Company, Close Corporation, Sole Proprietor, Partnership, Trust, NPO, School, Church, Body Corporate, or Other.'));

children.push(h2('5.1 Create the account'));
children.push(img('13-accounts-list.png'));
children.push(caption('Figure 5.1a — Accounts list.'));
children.push(img('14-account-new-form.png'));
children.push(caption('Figure 5.1b — New Account form.'));

children.push(h2('5.2 Verify FICA, then activate'));
children.push(img('15-account-detail.png'));
children.push(caption('Figure 5.2 — Business account detail. FICA must be Verified before you can change client status to Active.'));
children.push(p('From the account detail, the FICA panel works the same way as the contact FICA panel — capture verification method, date, beneficial owner, and PEP check, save. Then edit the account and change Client Status to Active Client.'));

children.push(h2('5.3 Engagements, RoAs, policies, and assets'));
children.push(p('Once the account is Active, the engagement / RoA / policy / asset workflow is identical to the individual flow described in Chapter 4 — except you select the Account on each form instead of the Contact.'));

// =========================================================================
// 6. CLAIMS HANDLING
// =========================================================================
children.push(h1('6. Claims handling'));
children.push(lead('Claims are TCF Outcome 5 territory: customers should not face unreasonable post-sale barriers when they need to claim. This module is designed to evidence that you handled the claim fairly, kept the client informed, and produced a justifiable outcome.'));

children.push(h2('6.1 Logging a claim'));
children.push(p('From the sidebar click Claims, then + New Claim.'));
children.push(img('29-claims-list.png'));
children.push(caption('Figure 6.1a — Claims list.'));
children.push(img('30-claim-new-form.png'));
children.push(caption('Figure 6.1b — New Claim form.'));
children.push(p('Required:'));
children.push(bullet('Claim number (unique — typically the insurer\'s reference).'));
children.push(bullet('Policy — must be selected, and must currently be Active.'));
children.push(bullet('Asset — which insured item this claim relates to. Must be selected and must be Active.'));
children.push(bullet('Claim date and date reported.'));
children.push(bullet('Claim type — Motor, Property, Liability, GIT, Theft, Fire, Other.'));
children.push(bullet('Incident description — narrative.'));
children.push(bullet('Claim status — defaults to Notified.'));
children.push(spacer());
children.push(gateCallout(
  'Two gates apply when raising a claim:\n' +
  '   1. The linked policy must be Active. You cannot log a claim against a Pending, Cancelled, Lapsed, or Expired policy.\n' +
  '   2. An asset must be selected, and that asset must currently be Active.'
));

children.push(h2('6.2 Working a claim'));
children.push(p('Open the claim detail. The status flows: Notified → In Progress → Awaiting Documents → Settled / Rejected / Closed (or Disputed if it goes south).'));
children.push(img('31-claim-detail.png'));
children.push(caption('Figure 6.2 — Claim detail.'));
children.push(p('Important during the claim:'));
children.push(bullet('Keep "Last client update date" current. If you don\'t update for 7+ days while the claim is in progress, the system flags it as delayed.'));
children.push(bullet('Tick "Client kept informed" each time you communicate.'));
children.push(bullet('If the insurer indicates rejection, capture the repudiation reason AND the broker\'s dispute action — both are required when a claim involves repudiation. This is the evidence trail TCF requires.'));

children.push(h2('6.3 Settlement and closure'));
children.push(p('When the insurer settles, change status to Settled and capture the settlement amount and date. Once you\'ve confirmed the client is satisfied, move to Closed and capture outcome notes.'));

// =========================================================================
// 7. COMPLAINTS
// =========================================================================
children.push(h1('7. Complaints'));
children.push(lead('Complaints are sensitive — both regulatorily (FAIS GCC, the Ombud rules) and reputationally. The complaints module enforces the timelines and the root-cause discipline so your complaints register stands up to scrutiny.'));

children.push(h2('7.1 Logging a complaint'));
children.push(img('32-complaints-list.png'));
children.push(caption('Figure 7.1a — Complaints list.'));
children.push(img('33-complaint-new-form.png'));
children.push(caption('Figure 7.1b — New Complaint form. The complaint number is auto-generated as COMP-YYYYMMDD-XXXX.'));
children.push(p('Required:'));
children.push(bullet('Complaint date.'));
children.push(bullet('Complaint summary — short narrative.'));
children.push(bullet('Complaint status — defaults to Open.'));
children.push(p('Strongly recommended:'));
children.push(bullet('Severity — Low / Medium / High / Critical.'));
children.push(bullet('Category — Service Quality, Incorrect Advice, Claims Handling, Premium Dispute, Policy Cancellation, POPIA Breach, Conduct, Other.'));
children.push(bullet('Received via — Email, Phone, In Person, Letter, etc.'));

children.push(h2('7.2 Acknowledgement and the SLA clock'));
children.push(p('From the moment a complaint is logged the system tracks how many days it has been open. The escalations are automatic:'));
children.push(spacer());
children.push(ruleTable([
  ['Day', 'Trigger', 'Action by system'],
  ['Day 3+', 'No acknowledgement recorded', 'Email handler and supervisor; flag alert sent'],
  ['Day 21+', 'Still unresolved', 'Email supervisors; flag alert sent'],
  ['Day 30+', 'Still unresolved', 'Severity auto-escalated to Critical; senior management notified by email'],
]));
children.push(spacer(200));
children.push(p('To stop the Day-3 alert, capture the acknowledgement date and assigned handler as soon as you receive the complaint.'));

children.push(h2('7.3 Investigation and root cause'));
children.push(p('As you investigate, populate:'));
children.push(bullet('Root cause identified — what actually caused the complaint.'));
children.push(bullet('Root cause category — for trend analysis.'));
children.push(bullet('Corrective action taken — what you (or the FSP) did to fix it.'));
children.push(img('34-complaint-detail.png'));
children.push(caption('Figure 7.3 — Complaint detail. Note the auto-generated number, severity, and resolution panel.'));

children.push(h2('7.4 Resolving and closing'));
children.push(gateCallout('You cannot move a complaint to Resolved or Closed without first recording the root cause (root_cause_identified or root_cause_category). The system blocks the save with: "Cannot mark Resolved/Closed — root cause must be recorded first."'));
children.push(p('When the complaint is genuinely resolved:'));
children.push(bullet('Set status to Resolved (or Closed once the file is finalised).'));
children.push(bullet('Capture the resolution date, summary, and outcome — Upheld (full / partial remedy), Not upheld, Withdrawn by client, or Referred to Ombudsman.'));

children.push(h2('7.5 Withdrawing a complaint (the only way to "remove" one)'));
children.push(gateCallout('Complaints CANNOT be deleted. This is a regulatory requirement — your complaints register is permanent. If a complaint was logged in error or the client withdraws it, use the Withdraw action instead. The record stays on file with a "Withdrawn" outcome.'));

// =========================================================================
// 8. REVIEWS
// =========================================================================
children.push(h1('8. Reviews'));
children.push(lead('Annual and ad-hoc reviews evidence ongoing service. They also capture changes in risk that may require new advice.'));

children.push(h2('8.1 Creating a review'));
children.push(img('35-reviews-list.png'));
children.push(caption('Figure 8.1a — Reviews list.'));
children.push(img('36-review-new-form.png'));
children.push(caption('Figure 8.1b — New Review form.'));
children.push(p('Required:'));
children.push(bullet('Review type — Annual Review, Mid-Year Review, Renewal Review, Claims Review, Ad Hoc Review, or Complaint Review.'));
children.push(bullet('Review date.'));
children.push(bullet('At least one of: Contact, Account, or Policy.'));

children.push(h2('8.2 Recording the review'));
children.push(p('Capture:'));
children.push(bullet('Changes in risk profile / assets / exposure.'));
children.push(bullet('Gaps identified.'));
children.push(bullet('Recommendations.'));
children.push(bullet('Review outcome — No Changes Required, Changes Recommended, Urgent Action Required, Policy Cancelled, or Follow-Up Required.'));

children.push(h2('8.3 When the review triggers a new RoA'));
children.push(p('If the review outcome is "Changes Recommended" (or stronger), tick "Advice record required". Then create a new Record of Advice and link it back to this review using the "Linked Advice Record" field. This produces a clean audit chain: review identified gap → RoA captured the new recommendation → policy amended.'));

// =========================================================================
// 9. REPORTS
// =========================================================================
children.push(h1('9. Reports'));
children.push(lead('The Reports module gives you both predefined compliance reports and a custom report builder backed by AI.'));

children.push(img('38-reports.png'));
children.push(caption('Figure 9.1 — Reports landing page.'));

children.push(h2('9.1 Predefined reports'));
children.push(p('Useful for routine compliance reviews — pick a template, choose date ranges, run.'));

children.push(h2('9.2 The AI-assisted custom report builder'));
children.push(p('Type a plain-English description of the report you want — for example "Show me all clients with FICA expiring in the next 90 days, grouped by broker" — and click Ask AI. The system pre-fills the Custom Report Builder with the fields, filters, and grouping. Review and adjust before running.'));
children.push(tipCallout('You never see raw SQL. The AI generates the report definition; the system runs it inside the same data isolation rules that govern the rest of the app, so brokers will still only see their own data.'));

// =========================================================================
// 10. COMPLIANCE MONITORING
// =========================================================================
children.push(h1('10. Compliance monitoring'));
children.push(lead('Three views are central to ongoing compliance: the TCF Dashboard, the Broker Fitness panel, and the Audit Log.'));

children.push(h2('10.1 TCF Dashboard'));
children.push(p('Available to admin and admin_only roles. Real-time view of how the FSP is performing against the six TCF outcomes — disclosure completeness, advice quality, claims fairness, post-sale event handling, and complaints metrics.'));
children.push(img('42-tcf-dashboard.png'));
children.push(caption('Figure 10.1 — TCF Dashboard.'));

children.push(h2('10.2 Broker Fitness'));
children.push(img('41-broker-profiles.png'));
children.push(caption('Figure 10.2 — Broker Profiles / Fitness Dashboard.'));
children.push(p('Tracks each broker\'s qualifications, RE5 status, CPD points, and fit-and-proper status. Used during supervisor audits.'));

children.push(h2('10.3 Audit log'));
children.push(p('Every CREATE, UPDATE, DELETE, LOGIN, LOGOUT, EXPORT and EMAIL action is logged automatically. The log records: who did it, when, on which record, the old value, the new value, and a human-readable description.'));
children.push(img('45-admin-audit.png'));
children.push(caption('Figure 10.3 — Audit log.'));

children.push(h2('10.4 POPIA and FICA overviews'));
children.push(p('Two dedicated views surface clients whose POPIA / FICA status needs attention — expired retention, missing consent, FICA overdue for refresh.'));
children.push(img('46-popia-overview.png'));
children.push(caption('Figure 10.4a — POPIA overview.'));
children.push(img('47-fica-overview.png'));
children.push(caption('Figure 10.4b — FICA overview.'));

children.push(h2('10.5 Data Breach Log'));
children.push(img('43-data-breaches.png'));
children.push(caption('Figure 10.5 — Data Breach Log. POPIA s22 requires a register of breaches; this is where you maintain it.'));

// =========================================================================
// 11. ADMIN
// =========================================================================
children.push(h1('11. Admin functions'));
children.push(lead('Reserved for users with the admin role (and partly for admin_only).'));

children.push(h2('11.1 User management'));
children.push(img('44-admin-users.png'));
children.push(caption('Figure 11.1 — User Management.'));
children.push(p('Create, edit, deactivate users. Assign roles. The role determines what each user can see and do (Section 2.4).'));

children.push(h2('11.2 Product Library'));
children.push(img('40-products.png'));
children.push(caption('Figure 11.2 — Product Library.'));
children.push(p('Maintain the list of insurance products you advise on. For each product capture target market, geographic scope, insurable value range, key exclusions, suitable risk appetite, and product status. The Product Library is what powers the target-market check on every Record of Advice.'));

children.push(h2('11.3 Notifications'));
children.push(img('48-notifications.png'));
children.push(caption('Figure 11.3 — Notification centre.'));
children.push(p('Central inbox of system-generated alerts: complaint SLA breaches, broker fitness expiries, FICA renewals due, policy renewals upcoming, etc.'));

children.push(h2('11.4 Workflows / Tasks'));
children.push(img('37-workflows-list.png'));
children.push(caption('Figure 11.4 — Workflows / Tasks.'));
children.push(p('A simple task queue you can use to assign follow-ups to yourself or other users.'));

// =========================================================================
// 12. APPENDICES
// =========================================================================
children.push(h1('12. Appendix — picklist reference'));
children.push(lead('Useful for capturing data correctly the first time.'));

children.push(h2('12.1 Contact lifecycle'));
children.push(p('Contact statuses: Prospect · Active Client · Inactive Client · Former Client · Do Not Service · Deceased.'));
children.push(p('FICA statuses: Not Started · Pending Documents · In Review · Verified · Expired · Exempt.'));

children.push(h2('12.2 Engagement stages (in order)'));
children.push(p('Prospect → Initial Contact → Appointment Scheduled → Fact Find Completed → Needs Analysis Completed → Quote / Proposal Prepared → Advice Presented → Client Decision Pending → Accepted - Implementation → Implemented / Active. Plus terminal stages: Lost / Declined and On Hold.'));

children.push(h2('12.3 Disclosure picklists'));
children.push(p('FSP licence disclosed: Yes — Written / Yes — Verbal / No.'));
children.push(p('Complaints process disclosed: Yes — Written / Yes — Verbal / Complaints form provided / No.'));
children.push(p('Disclosure method: In-person meeting / Phone call / Video call / Email / WhatsApp / Signed form.'));

children.push(h2('12.4 Policy & cover'));
children.push(p('Policy statuses: Pending · Active · Amended · Cancelled · Lapsed · Expired.'));
children.push(p('Policy section needs analysis status: Not Assessed · Assessed · Recommendation Made · Accepted · Declined · Implemented · Not Applicable.'));

children.push(h2('12.5 Claims'));
children.push(p('Claim statuses: Notified · In Progress · Awaiting Documents · Settled · Rejected · Closed · Disputed.'));
children.push(p('Claim types: Motor · Property · Liability · GIT · Theft · Fire · Other.'));

children.push(h2('12.6 Complaints'));
children.push(p('Statuses: Open · In Progress · Awaiting Response · Resolved · Closed · Escalated.'));
children.push(p('Severity: Low · Medium · High · Critical.'));
children.push(p('Categories: Service Quality · Incorrect Advice · Claims Handling · Premium Dispute · Policy Cancellation · POPIA Breach · Conduct · Other.'));
children.push(p('Outcomes: Upheld — full remedy · Upheld — partial remedy · Not upheld · Withdrawn by client · Referred to Ombudsman.'));

children.push(h2('12.7 POPIA lawful bases'));
children.push(p('Consent · Contractual necessity · Legal obligation · Legitimate interest · Vital interest. Of these, "Consent" is by far the most common for insurance advisory.'));

children.push(h2('12.8 FICA verification methods'));
children.push(p('South African ID document · Passport · CIPC registration (company) · Driver\'s licence · Biometric · Other certified document.'));

// END
children.push(h1('Document end'));
children.push(p(`Inexpro CRM User Manual · Version 1.0 · ${TODAY}`, { italics: true }));
children.push(p('Compiled from the live application. The rules described here are enforced in code; if a workflow described here ever differs from what the application allows, trust the application — and please report the documentation drift so this manual can be updated.'));

// --- Build doc -------------------------------------------------------------

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
        margin: { top: 1000, right: 1100, bottom: 1000, left: 1100 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: 'Inexpro CRM — User Manual', size: 16, color: '888888' })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'Page ', size: 16, color: '888888' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '888888' }),
            new TextRun({ text: ' of ', size: 16, color: '888888' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '888888' }),
          ],
        })],
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
