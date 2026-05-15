'use strict';

// Library of signable templates that brokers can send for client e-signature.
// Each entry defines:
//   key         - stable id used in URLs, signature_requests.template_key,
//                 documents.description, and the email payload field.
//   label       - shown in the library picker (Add Attachment → POPIA/FICA).
//   category    - group label in the library picker.
//   title       - heading used on the signing page and the generated PDF.
//   filename    - basename used when saving the signed PDF to documents.
//   bodyHtml(placeholders) - HTML rendered on the public signing page.
//                            Placeholders: {{client_name}}, {{broker_name}}, …
//   pdfBlocks(answers, placeholders) - structured blocks for the generator
//                                       to pour into the signed PDF.
//
// The HTML and PDF blocks share the same source of truth here so the
// document the client sees matches the document we file against the contact.

const POPIA_CONSENT_BODY_HTML = `
<h2>POPIA Consent Notice &mdash; Inexpro Advisory</h2>

<p>Dear {{client_name}},</p>

<p>Thank you for contacting Inexpro. Before we proceed with your enquiry / quote / application, we are required by the <strong>Protection of Personal Information Act, 2013 ("POPIA")</strong> to give you a clear notice of how we will handle your personal information, and to obtain your specific and informed consent.</p>

<h3>Who we are</h3>
<p>Inexpro is an authorised Financial Services Provider (FSP Licence No. 7591), registered at 14 Olienhout Street, Brackenfell, 7560. Our Information Officer is <strong>Steph van der Vyver</strong> (<a href="mailto:steph@inexpro.co.za">steph@inexpro.co.za</a> / 021 981 1612).</p>

<h3>What information we will collect</h3>
<p>To provide you with a quote, advice and (where applicable) to arrange cover, we will need to collect: your full name and ID number, contact details, financial information relevant to the cover, and risk/property information about the assets you wish to insure. If your product requires it, we may also collect health information or claims history. We will only collect what is strictly necessary (POPIA s10).</p>

<h3>Why we need it</h3>
<p>We will use your information for the following purposes only:</p>
<ol>
  <li><strong>Insurance administration</strong> &mdash; preparing quotes, placing cover, issuing policy documents, processing endorsements and renewals</li>
  <li><strong>Claims processing</strong> &mdash; should you ever need to claim</li>
  <li><strong>Risk assessment and advice</strong> &mdash; preparing your needs analysis, gap analysis and Record of Advice in terms of FAIS s8 and s9</li>
  <li><strong>Regulatory compliance</strong> &mdash; meeting our FICA verification, FAIS record-keeping and POPIA obligations</li>
  <li><strong>Sharing with insurers and service providers</strong> &mdash; strictly to the extent needed to deliver the service to you (e.g., underwriters, surveyors, loss adjusters)</li>
</ol>

<h3>Voluntary or mandatory? (POPIA s18(1)(d)&ndash;(e))</h3>
<p>Providing this information is <strong>voluntary</strong>. However, if you choose not to provide it, we will not be able to obtain a quote or arrange cover for you, as insurers require this information to underwrite the risk.</p>

<h3>How long we will keep your information</h3>
<p>We retain your records for at least <strong>5 years</strong> after our relationship ends, as required by law. If you do not proceed with cover, we will retain your enquiry information for a maximum of 12 months and then delete it.</p>

<h3>Your rights</h3>
<p>At any time, you may request access to, correction of, or deletion of your information; you may object to processing; you may withdraw your consent; and you may complain to the Information Regulator (<a href="mailto:inforeg@justice.gov.za">inforeg@justice.gov.za</a>). Just reply to this email or contact the Information Officer above.</p>
`;

const POPIA_CONSENT_FOOTER_HTML = `
<h3>Your consent</h3>
<p>By signing below, you confirm that:</p>
<ol>
  <li>You have read and understood this notice</li>
  <li>You consent to Inexpro processing your personal information for the purposes listed above</li>
  <li>You have indicated your direct marketing preference</li>
</ol>
<p>We look forward to assisting you.</p>

<p>Kind regards,<br><strong>{{broker_name}}</strong><br>Inexpro Short Term Insurance</p>
`;

// ─── Existing-client POPIA notice ──────────────────────────────────────────
// Used for clients already on the books: confirms what info Inexpro holds,
// gives them a chance to update it, and captures fresh consent + marketing
// preference. The body text below is the legal notice; the signing page
// renders the YES/NO radios + signature box between body and footer.

const POPIA_EXISTING_BODY_HTML = `
<h2>POPIA Notice &mdash; Inexpro</h2>

<p>Dear {{client_name}},</p>

<p>We are writing to you in terms of the <strong>Protection of Personal Information Act, 2013 ("POPIA")</strong>. The purpose of this notice is to confirm what personal information Inexpro holds about you, why we hold it, who we share it with, and to give you the opportunity to confirm, update or withdraw your consent.</p>

<h3>About us (the Responsible Party)</h3>
<p>Inexpro Advisory is an authorised Financial Services Provider (FSP Licence No. 7591). Our registered address is 14 Olienhout Street, Brackenfell, 7560. Our designated Information Officer is <strong>Steph van der Vyver</strong>, who can be reached at <a href="mailto:steph@inexpro.co.za">steph@inexpro.co.za</a> or 021 981 1612.</p>

<h3>The personal information we hold about you</h3>
<p>According to our records, we currently process the following categories of your personal information: ID number, contact details, financial information, and claims history. This information was either provided directly by you, obtained from your previous broker, or supplied by the insurer.</p>

<h3>Why we process your information (purpose specification, s13)</h3>
<p>We process your personal information for the following purposes, each of which is a legitimate purpose connected to our business as a short-term insurance broker:</p>
<ul>
  <li><strong>Insurance administration</strong> &mdash; placing, amending, renewing and cancelling policies on your behalf</li>
  <li><strong>Claims processing</strong> &mdash; submitting, managing and finalising claims with insurers</li>
  <li><strong>Risk assessment</strong> &mdash; preparing needs analyses, gap analyses and records of advice</li>
  <li><strong>Regulatory compliance</strong> &mdash; meeting our obligations under FAIS, FICA, the Short-Term Insurance Act and POPIA</li>
  <li><strong>Third-party sharing</strong> &mdash; sharing necessary information with insurers, surveyors, loss adjusters and other parties strictly to the extent required to deliver the service to you</li>
</ul>

<h3>How long we keep your information (retention)</h3>
<p>We retain your records for at least <strong>5 years</strong> after our relationship ends, as required by FAIS s18 and FICA s23. After that period, your information will be securely deleted or anonymised, unless we are required by law to retain it for longer.</p>

<h3>Your rights as a data subject (POPIA s5, s23&ndash;25)</h3>
<p>You have the right at any time to:</p>
<ul>
  <li>Request access to the personal information we hold about you</li>
  <li>Request correction of inaccurate or outdated information</li>
  <li>Request deletion of information we no longer have a lawful basis to hold</li>
  <li>Object to the processing of your information</li>
  <li>Withdraw any consent you have previously given (without affecting the lawfulness of past processing)</li>
  <li>Lodge a complaint with the Information Regulator (<a href="mailto:inforeg@justice.gov.za">inforeg@justice.gov.za</a> / <a href="https://www.inforegulator.org.za">www.inforegulator.org.za</a>)</li>
</ul>
<p>To exercise any of these rights, simply reply to this email or contact our Information Officer using the details above. We will respond within the timeframes prescribed by POPIA.</p>

<h3>What we need from you</h3>
<p>Please confirm that the information we hold about you remains accurate (or let your broker know what needs updating), indicate your direct marketing preference below, and sign at the bottom of this page.</p>
`;

const POPIA_EXISTING_FOOTER_HTML = `
<p>Thank you for trusting Inexpro with your insurance needs.</p>

<p>Kind regards,<br><strong>{{broker_name}}</strong><br>Inexpro Short Term Insurance</p>
`;

const TEMPLATES = {
  popia_consent: {
    key:        'popia_consent',
    label:      'New Prospect / First Time Enquiries / New Onboarding',
    category:   'POPIA / FICA',
    title:      'New Prospect / First Time Enquiries / New Onboarding',
    filename:   'new-prospect-onboarding-consent.pdf',
    description: 'New Prospect / First Time Enquiries / New Onboarding — signed by client',
    hasMarketingConsent: true,
    bodyHtml:   POPIA_CONSENT_BODY_HTML,
    footerHtml: POPIA_CONSENT_FOOTER_HTML,
  },
  popia_existing_client: {
    key:        'popia_existing_client',
    label:      'Existing Clients / Lapsed Clients / Anyone Already on File',
    category:   'POPIA / FICA',
    title:      'Existing Clients / Lapsed Clients / Anyone Already on File',
    filename:   'existing-client-popia-notice.pdf',
    description: 'Existing Clients / Lapsed Clients / Anyone Already on File — signed by client',
    hasMarketingConsent: true,
    bodyHtml:   POPIA_EXISTING_BODY_HTML,
    footerHtml: POPIA_EXISTING_FOOTER_HTML,
  },
  // GIT Confirmation of Insurance — DYNAMIC template. Body content comes
  // from the broker-filled form (insured / risk address / coverage limits
  // / vehicle groups …) stored in signature_requests.form_data. The
  // signing page builds the document from that JSON and the signed PDF
  // re-renders the same content with the signature stamped on.
  git_confirmation: {
    key:        'git_confirmation',
    label:      'GIT Confirmation of Insurance',
    category:   'Policies',
    title:      'Confirmation of Insurance',
    filename:   'git-confirmation.pdf',
    description: 'Goods-in-Transit Confirmation of Insurance — signed by client',
    hasMarketingConsent: false,
    dynamic:    true,
    bodyHtml:   '',
    footerHtml: '',
  },
};

function listTemplates() {
  return Object.values(TEMPLATES).map(t => ({
    key:      t.key,
    label:    t.label,
    category: t.category,
    title:    t.title,
  }));
}

function getTemplate(key) {
  return TEMPLATES[key] || null;
}

function applyPlaceholders(html, ph) {
  if (!html) return '';
  return html.replace(/\{\{(\w+)\}\}/g, (m, k) => (ph && ph[k] != null) ? String(ph[k]) : '');
}

module.exports = { listTemplates, getTemplate, applyPlaceholders };
