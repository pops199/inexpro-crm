'use strict';

// Single source of truth for the Inexpro CC Statutory Intermediary Disclosure
// Notice. Both the public HTML signing page (server/routes/public-signing.js)
// and the signed PDF generator (server/lib/inexpro-disclosure-pdf.js) consume
// the same SECTIONS data so the document the client reads on screen matches the
// PDF that is filed against the contact. Mirrors "Inexpro Intermediary
// Disclosure 2026.docx", with the docx's two-column tables preserved.
//
// Block grammar (inside a section `body`):
//   { p:   'text' }            paragraph
//   { sub: 'text' }            sub-heading
//   { table: [[label,value]] } two-column table (as in the docx)
//   { ul:  ['item', ...] }     bullet list
//   { note:'text' }            italic note
//
// CLIENT_FIELDS are the fill-in fields the client completes on the signing
// page (section 17). The signer's full name + signature + date are captured by
// the signing page's standard controls, so they are not repeated here.

const INTRO =
  'This Disclosure Notice is provided to you in compliance with the Financial ' +
  'Advisory and Intermediary Services Act, 37 of 2002 (“FAIS”) and the General ' +
  'Code of Conduct for Authorised FSPs and Representatives (“GCoC”); the ' +
  'Short-term Insurance Act, 53 of 1998 and the Policyholder Protection Rules ' +
  '(“PPR”); the Protection of Personal Information Act, 4 of 2013 (“POPIA”); ' +
  'the Financial Intelligence Centre Act, 38 of 2001 (“FICA”); and in ' +
  'anticipation of the Conduct of Financial Institutions Act (“COFI”). Please ' +
  'read it carefully before entering into any transaction. You are entitled to ' +
  'have anything given to you orally confirmed in writing within 30 days.';

const SECTIONS = [
  {
    h: '1. Financial Services Provider Particulars',
    body: [
      { table: [
        ['Full registered name', 'Inexpro CC'],
        ['Trading name', 'Inexpro (also marketed as Inexpro Short Term Insurance)'],
        ['Legal form', 'Close Corporation'],
        ['Members', 'Steph van der Vyver and Sybil Goosen'],
        ['Company registration number', '1995/049701/23'],
        ['VAT number', '4240154593'],
        ['FSCA FSP Licence Number', '7591'],
        ['FSP Category', 'Category I – Authorised to render Advice and Intermediary Services'],
        ['Date of original authorisation', '30 September 2004'],
        ['Most recent licence endorsement', '2025 – licence extended to include additional product categories (refer to section 3 below)'],
        ['Primary activity', 'Short-term insurance brokerage – Personal and Commercial Lines'],
        ['Additional activities', 'Long-term insurance, retail pension benefits, pension funds benefits, and investment-related advisory services (see section 3)'],
      ] },
      { sub: 'Physical & Postal Address' },
      { table: [
        ['Physical address', '14 Olienhout Street, Brackenfell, 7560, Western Cape, South Africa'],
        ['Postal address', '14 Olienhout Street, Brackenfell, 7560'],
        ['Telephone (landline)', '+27 (0)21 981 1612'],
        ['Telephone (VOIP)', '+27 (0)21 492 6811'],
        ['Mobile', '+27 (0)83 708 3130'],
        ['E-mail (general)', 'steph@inexpro.co.za'],
        ['Website', 'www.inexpro.co.za'],
        ['Office hours', 'Monday to Friday, 08:30 – 17:00 (excluding public holidays)'],
      ] },
    ],
  },
  {
    h: '2. Key Individuals, Representatives & Fit-and-Proper Status',
    body: [
      { p: 'Inexpro CC has two approved Key Individuals, who together carry responsibility for the management and oversight of the financial services rendered under FSP licence number 7591.' },
      { sub: '2.1 Key Individuals' },
      { sub: 'Steph van der Vyver — Key Individual (Short-term Insurance)' },
      { table: [
        ['Scope of oversight', 'Short-Term Insurance Personal Lines, Short-Term Insurance Personal Lines A1, and Short-Term Insurance Commercial Lines'],
        ['Formal qualification', 'Diploma in Business Administration'],
        ['Professional designation', 'Fellow of the Institute of Administration & Commerce of Southern Africa (FIAC)'],
        ['Regulatory Examinations', 'RE1 (Key Individuals) and RE5 (Representatives) – Passed'],
      ] },
      { sub: 'Andries Johannes van der Vyver (“André”) — Key Individual (all other categories)' },
      { table: [
        ['Scope of oversight', 'All product categories on the FSP licence OTHER than Short-term Insurance — i.e. Long-Term Insurance sub-categories A, B1, B1-A, B2, B2-A and C; Retail Pension Benefits; Pension Funds Benefits; Friendly Society Benefits; Shares; Money Market Instruments; Debentures and Securitised Debt; Warrants, Certificates and other Instruments; Bonds; Derivative Instruments; Participatory Interests in a Collective Investment Scheme; Forex Investment; Long- and Short-term Deposits; Structured Deposits; and Securities and Instruments'],
        ['Regulatory Examinations', 'RE1 – Key Individuals (Certificate 20715, passed 16/08/2011); RE5 – Representatives (Certificate 20679, passed 16/08/2011)'],
        ['Formal qualification', 'National Certificate in Financial Services: Wealth Management, NQF Level 5 (NLRD No 23973) – Financial Planning Institute of South Africa, 2011'],
        ['Functional role', 'Senior Financial Adviser (non-executive). Manages a legacy Long-term Insurance client book as part of an ongoing succession arrangement; professional indemnity cover administered via Inexpro CC.'],
      ] },
      { sub: '2.2 Representatives' },
      { p: 'The following natural persons are appointed as Representatives of Inexpro CC in terms of section 13 of the FAIS Act. The FSCA-maintained Register of Representatives is available at www.fsca.co.za (search FSP 7591).' },
      { sub: 'Steph van der Vyver — Member, Key Individual & Representative' },
      { table: [
        ['Authorised for', 'Short-Term Insurance Personal Lines; Personal Lines A1; and Commercial Lines'],
        ['Supervision & qualifications', 'Fully authorised – not under supervision. RE1 and RE5 passed. Diploma in Business Administration; Fellow of the Institute of Administration & Commerce of Southern Africa (FIAC).'],
      ] },
      { sub: 'Andries Johannes van der Vyver — Key Individual (non-STI) & Representative' },
      { table: [
        ['Authorised for', 'All product categories on the FSP licence other than Short-term Insurance (see section 2.1). Current active servicing is focused on Long-Term Insurance (legacy client book).'],
        ['Supervision & qualifications', 'Fully authorised – not under supervision. RE1 (Cert. 20715) and RE5 (Cert. 20679) passed 16/08/2011. National Certificate in Financial Services: Wealth Management (NQF 5, NLRD 23973), 2011.'],
      ] },
      { sub: 'Sybil Goosen — Member & Representative' },
      { table: [
        ['Authorised for', 'Fully authorised: Short-Term Insurance Personal Lines and Commercial Lines. Currently onboarding: Long-Term Insurance (under supervision).'],
        ['Supervision & qualifications', 'Under supervision of Andries Johannes van der Vyver (Key Individual) for Long-Term Insurance, in accordance with FSCA Board Notice 194 of 2017. National Diploma in Financial Management; National Diploma in Cost and Management Accounting (UNISA, 2015); CIMA Certificate in Business Accounting (2018).'],
      ] },
      { sub: 'Johannes Meyer Steenkamp (“Hannes”) — Representative, Heidelberg region' },
      { table: [
        ['Authorised for', 'Short-Term Insurance only (Personal and Commercial Lines).'],
        ['Supervision & qualifications', 'Fully authorised – not under supervision. RE5 passed. IISA Certificate of Proficiency in Short Term Insurance (NQF 4, Distinction, 2003); Intermediate Certificate in Business Studies – Short Term Insurance (IISA, 2004-2005); Santam Commercial Insurance skills programme (NQF 4, 32 credits, 2009).'],
      ] },
      { sub: '2.3 Administrative & Claims Support Staff' },
      { p: 'The following staff members provide administrative and operational support under the supervision of the Key Individuals. They do NOT render financial advice or intermediary services themselves:' },
      { ul: ['Elzaan Nel – Administrative Officer and Claims Manager: policy underwriting administration, premium follow-ups, documentation control, claims reporting, client liaison and FAIS record-keeping.'] },
      { sub: '2.4 Fit & Proper and Debarment' },
      { ul: [
        'All Key Individuals and Representatives meet the Fit and Proper requirements set out in FSCA Board Notice 194 of 2017, including honesty and integrity, competence (qualifications, regulatory examinations, class of business and product-specific training), operational ability and financial soundness.',
        'Continuous Professional Development (CPD) is current for all Key Individuals and Representatives in respect of each authorised sub-category.',
        'No Key Individual or Representative of Inexpro CC has been debarred in terms of section 14 of the FAIS Act, and none is subject to any pending debarment enquiry.',
        'Where a Representative is rendering services under supervision, the Key Individual will review and sign off on advice provided, and the client will be informed of the supervision arrangement on request.',
      ] },
    ],
  },
  {
    h: '3. Financial Products & Services Authorised',
    body: [
      { p: 'Inexpro CC is authorised by the Financial Sector Conduct Authority (FSCA) to render Advice and Intermediary Services (Category I) in respect of the following financial products. A certified copy of the FSP licence and annexure is available on request, or can be verified at www.fsca.co.za (search FSP 7591).' },
      { sub: '3.1 Short-term Insurance – Primary Business' },
      { ul: ['Short-Term Insurance Personal Lines', 'Short-Term Insurance Personal Lines A1', 'Short-Term Insurance Commercial Lines'] },
      { p: 'Key Individual: Steph van der Vyver' },
      { sub: '3.2 Long-term Insurance' },
      { ul: ['Long-Term Insurance sub-category A', 'Long-Term Insurance sub-category B1', 'Long-Term Insurance sub-category B1-A', 'Long-Term Insurance sub-category B2', 'Long-Term Insurance sub-category B2-A', 'Long-Term Insurance sub-category C', 'Friendly Society Benefits'] },
      { sub: '3.3 Retirement & Pension Products' },
      { ul: ['Retail Pension Benefits', 'Pension Funds Benefits'] },
      { sub: '3.4 Investment Products' },
      { ul: ['Shares', 'Money Market Instruments', 'Debentures and Securitised Debt', 'Warrants, Certificates and other Instruments', 'Bonds', 'Derivative Instruments', 'Participatory Interests in a Collective Investment Scheme', 'Securities and Instruments'] },
      { sub: '3.5 Deposits & Forex' },
      { ul: ['Long-term Deposits', 'Short-term Deposits', 'Structured Deposits', 'Forex Investment'] },
      { p: 'Key Individual for all products listed in sections 3.2 to 3.5: André van der Vyver' },
      { sub: '3.6 Form of service' },
      { p: 'All advice is rendered on a non-automated basis. Intermediary services are rendered on an “other” (non-scripted) basis, as set out in the FSP annexure.' },
      { sub: '3.7 Scope of active services' },
      { p: 'Although Inexpro is authorised by the FSCA for all the product categories listed above, the services currently actively rendered are focused on:' },
      { ul: [
        'Short-term Insurance – Personal and Commercial Lines (primary business).',
        'Long-term Insurance – servicing of the existing legacy client book under André van der Vyver’s oversight.',
      ] },
      { p: 'The remaining product categories on the licence (pensions, investments, deposits, forex) are authorised capabilities that may be offered to clients on a case-by-case basis and subject to the following specific scope limitations:' },
      { ul: [
        'Pension advice is limited to Retail Pension Benefits and Pension Funds Benefits financial advice and planning. Inexpro does NOT perform pension fund administration.',
        'Inexpro does NOT actively render any advice or intermediary services relating to foreign exchange investments, crypto currencies, crypto assets or crypto products. These categories are expressly excluded from Inexpro’s Professional Indemnity cover.',
      ] },
    ],
  },
  {
    h: '4. Product Suppliers & Legal Relationships',
    body: [
      { p: 'Inexpro has intermediary agreements in place with the product suppliers listed below. We are an independent intermediary — we are not a tied agent of any single insurer.' },
      { ul: [
        'Santam Limited',
        'Old Mutual Insure Limited',
        'Auto & General Insurance Company Limited',
        'Santam Marine Underwriters',
        'Western National Insurance Company Limited',
        'ONE Insurance Underwriters (Pty) Ltd',
        'Senate (a division of an authorised insurer)',
        'CEU (Commercial & Energy Underwriters)',
        'Camargue Underwriting Managers (Pty) Ltd',
        'Miway Insurance Limited',
      ] },
      { sub: 'Legal & Contractual Status with Product Suppliers' },
      { ul: [
        'Inexpro is an independent intermediary – not a representative or tied agent of any specific insurer.',
        'Inexpro does NOT directly or indirectly hold more than 10% of the issued shares of any product supplier listed above.',
        'Inexpro has NOT received more than 30% of its total commission and remuneration from any single product supplier in the preceding 12 months.',
        'Inexpro is NOT an associated company of any insurer or product supplier.',
        'Inexpro holds current binder / outsourcing agreements with the insurers listed only to the extent disclosed on the applicable policy schedule.',
      ] },
    ],
  },
  {
    h: '5. Professional Indemnity, Fidelity & Cover Details',
    body: [
      { p: 'Inexpro CC maintains Intermediaries Professional Indemnity cover in compliance with section 13 of the FAIS General Code of Conduct. Particulars are as follows:' },
      { table: [
        ['Policy Number', 'J/OSS/22/0593'],
        ['Insurer', 'Old Mutual Insure Limited (Reg. No. 1970/006619/06)'],
        ['Underwriting manager', 'Sintelum (Pty) Ltd (Reg. No. 2009/0044225/07)'],
        ['Insurance broker / Coverholder', 'Aon South Africa (Pty) Ltd (FSP 20555)'],
        ['Period of insurance', '01 October 2025 to 30 September 2026 (renewable annually)'],
        ['Limit of indemnity – PI', 'R5 000 000 in the annual aggregate, including costs and expenses'],
        ['Reinstatement', 'Two (2) reinstatements of the indemnity limit'],
        ['Retroactive date', '1 October 2004 (R2 000 000) and 1 October 2005 onwards (R5 000 000)'],
        ['Fidelity Guarantee sub-limit', 'R150 000 in the annual aggregate (retroactive: 1 October 2019 R100 000 / 1 October 2022 R150 000)'],
        ['Directors & Officers extension', 'R2 500 000'],
        ['Employment Practice Liability extension', 'R500 000'],
        ['Data Protection (Cyber / POPIA) extension', 'R1 000 000 (underwritten by ITOO Special Risks / The Hollard Insurance Company Limited)'],
        ['Additional extensions', 'General Public Liability; Legal Defence Costs; Support Staff; Liability following Staff Dishonesty; Liability following Loss of Documentation; Defamation and Slander; Computer Crime; Internal Compliance Officer Errors & Omissions; Claims Preparation Costs R50 000; Loss of Documentation R25 000'],
        ['Territorial limits', 'Worldwide, excluding USA and Canada'],
        ['Cover scope', 'Restricted to Inexpro’s Category I insurance and investment broking activities as authorised by the FSCA'],
        ['Key exclusions (client-relevant)', 'Foreign exchange investments and crypto-related products/services; Electronic Payments Clause exclusion (2.27 of policy wording); Cyber Exclusion Clause LMA 5458 (from 1 January 2024)'],
      ] },
      { p: 'Inexpro CC accepts responsibility for the advice and intermediary services rendered by its Key Individuals and Representatives, in accordance with section 13 of the FAIS General Code of Conduct. A copy of the current PI certificate is available on reasonable written request.' },
    ],
  },
  {
    h: '6. Conflict of Interest Management',
    body: [
      { p: 'In terms of section 3A of the General Code of Conduct, Inexpro has adopted a written Conflict of Interest Management Policy. A copy is available free of charge on request or on our website at www.inexpro.co.za.' },
      { sub: 'Specific Disclosures' },
      { ul: [
        'At the date of signature, Inexpro is not aware of any actual or potential conflict of interest in relation to the proposed transaction.',
        'Inexpro does not receive, accept or offer any non-cash incentive, immaterial financial interest or other benefit that is prohibited in terms of section 3A(1)(b) of the Code.',
        'A Gift Register is maintained and is available for inspection on reasonable written request.',
        'Any third-party relationships that may constitute a conflict (such as binder, outsourcing or referral arrangements) will be disclosed in writing to you before a transaction is concluded.',
        'Inexpro has appointed its Key Individuals, Steph van der Vyver and André van der Vyver, to jointly monitor compliance with the Conflict of Interest Management Policy within their respective scopes of responsibility.',
      ] },
    ],
  },
  {
    h: '7. Remuneration, Commission & Fees',
    body: [
      { p: 'Inexpro does NOT charge any fees to clients. No broker fees, advice fees, policy fees, administration fees, section 8(5) fees or fees of any other description are levied on, deducted from, or added to the premium or investment amount payable by the client.' },
      { p: 'Inexpro is remunerated exclusively through commission and/or fees paid by the product supplier (insurer, investment product provider or administrator), in accordance with the Regulations and the applicable product supplier agreements:' },
      { ul: [
        'Short-term Insurance – statutory commission: motor up to 12.5% (plus VAT); non-motor up to 20% (plus VAT) of premium.',
        'Long-term Insurance – commission as regulated by Part 3 of the Regulations under the Long-term Insurance Act.',
        'Retail Pension Benefits, Pension Funds Benefits and investment products – ongoing service fees and/or upfront advice commission as disclosed by the relevant product supplier and reflected on the product quotation or schedule.',
      ] },
      { p: 'The commission/service fee is paid by the product supplier out of the premium or investment contribution you pay – it is not an additional cost to you. The exact amount and frequency applicable to your policy or investment will be disclosed on the quotation, policy schedule or investment statement.' },
      { p: 'Inexpro does not receive any soft-dollar benefits, sign-on bonuses, override commissions, binder fees, outsourcing fees or any other remuneration that is not permitted under the General Code of Conduct or the applicable insurance and investment regulations.' },
      { p: 'Should this position ever change in future, you will be notified in writing and no fee will be charged without your express prior written consent.' },
    ],
  },
  {
    h: '8. Treating Customers Fairly (TCF) Commitment',
    body: [
      { p: 'Inexpro is committed to the six Treating Customers Fairly outcomes prescribed by the FSCA:' },
      { ul: [
        'Outcome 1: You are confident that fair treatment of customers is central to Inexpro’s culture.',
        'Outcome 2: Products and services are designed to meet the needs of identified customer groups and are targeted accordingly.',
        'Outcome 3: You are given clear information and kept appropriately informed before, during and after the point of sale.',
        'Outcome 4: Where advice is given, it is suitable and takes account of your circumstances.',
        'Outcome 5: Products perform as Inexpro has led you to expect, and service is of an acceptable standard.',
        'Outcome 6: You do not face unreasonable post-sale barriers to change product, switch provider, submit a claim or make a complaint.',
      ] },
    ],
  },
  {
    h: '9. Statutory Policyholder Protection Rule Disclosures',
    body: [
      { sub: '9.1 Duty of Disclosure' },
      { p: 'You are required to disclose all material information which is likely to influence the insurer in deciding whether to accept the risk or on what terms. Failure to do so, or any misrepresentation, may render the policy void and/or result in the repudiation of a claim. If you are uncertain whether a fact is material, you should disclose it. You must check all details on your policy schedule and notify us of any inaccuracies immediately.' },
      { sub: '9.2 Cooling-off Period' },
      { p: 'In terms of PPR Rule 4, you may cancel a new short-term insurance policy in writing within 14 days of receiving the policy documents, provided no benefit has been paid, no claim has been made and no event giving rise to a claim has occurred. Any premiums paid will be refunded less the cost of risk cover for the period on cover.' },
      { sub: '9.3 Premium Payment & Grace Period' },
      { p: 'Premiums are payable on the due date stipulated in your policy. A 15-day grace period applies to monthly policies (30 days for annual policies) from the second month’s premium. Non-payment within the grace period may result in no cover for losses occurring in that period, and the insurer may cancel the policy in terms of section 52 of the Short-term Insurance Act.' },
      { sub: '9.4 Variation & Cancellation' },
      { p: 'The insurer must give you at least 31 days’ written notice before cancelling or varying your policy. You may cancel your policy at any time in writing without penalty (subject to premium paid for cover already enjoyed).' },
      { sub: '9.5 Plain Language' },
      { p: 'All documentation provided to you will be in plain language. If you do not understand any part of your policy or any communication from us, please contact us immediately.' },
      { sub: '9.6 Warnings' },
      { ul: [
        'Do NOT sign any blank or partially completed application form. Ensure all information is correct before signing.',
        'Do NOT provide inaccurate information – misrepresentation may void your policy.',
        'You are entitled to a copy of all policy documents free of charge.',
        'Where information is provided orally, you may request written confirmation within 30 days.',
      ] },
    ],
  },
  {
    h: '10. Claims Notification Procedure',
    body: [
      { p: 'On the occurrence of any event which may give rise to a claim, notify Inexpro immediately:' },
      { ul: [
        'Telephone: +27 (0)21 981 1612  |  After-hours mobile: +27 (0)83 708 3130',
        'E-mail: steph@inexpro.co.za',
      ] },
      { p: 'You must take all reasonable steps to mitigate the loss. Do not admit liability to any third party, make any payment, or repair any damage without the insurer’s prior written consent. Certain perils (e.g. theft, hijacking, malicious damage) require a SAPS case number. For your protection, some product suppliers record all telephone calls.' },
    ],
  },
  {
    h: '11. Complaints Procedure',
    body: [
      { p: 'Inexpro has a documented Complaints Management Policy (available on request) which complies with PPR Rule 17 and FAIS section 16 requirements.' },
      { sub: 'Step 1 – Submit to Inexpro' },
      { table: [
        ['Submit in writing to', 'Steph van der Vyver (Key Individual & Complaints Officer)'],
        ['E-mail', 'steph@inexpro.co.za'],
        ['Telephone', '+27 (0)21 981 1612'],
        ['Postal', '14 Olienhout Street, Brackenfell, 7560'],
      ] },
      { p: 'We will acknowledge receipt within 3 business days and provide a substantive response within 6 weeks. If we cannot resolve it within that period, we will notify you in writing of the reasons and expected resolution date.' },
      { sub: 'Step 2 – If unresolved: escalate to the appropriate external body' },
      { sub: 'Claims and product-related complaints (Short-term Insurance) — National Financial Ombud Scheme SA (NFO), Non-Life Insurance Division' },
      { table: [
        ['Physical address', '110 Oxford Road, Houghton Estate, Johannesburg, 2198'],
        ['Postal address', 'PO Box 41, Saxonwold, 2132'],
        ['Sharecall', '0860 800 900'],
        ['Telephone', '+27 (0)11 726 8900'],
        ['E-mail', 'info@nfosa.co.za'],
        ['Website', 'www.nfosa.co.za'],
      ] },
      { note: 'Note: The NFO commenced operations on 1 March 2024 and replaces the former Ombudsman for Short-Term Insurance (OSTI).' },
      { sub: 'Advice or intermediary service complaints (FAIS) — FAIS Ombud' },
      { table: [
        ['Physical address', 'Sussex Office Park, Ground Floor, Block B, 473 Lynnwood Road, Lynnwood, Pretoria, 0081'],
        ['Postal address', 'PO Box 41, Menlyn Park, 0063'],
        ['Telephone', '+27 (0)12 762 5000 / 012 470 9080'],
        ['E-mail', 'info@faisombud.co.za'],
        ['Website', 'www.faisombud.co.za'],
      ] },
      { sub: 'Regulatory conduct or market abuse — Financial Sector Conduct Authority (FSCA)' },
      { table: [
        ['Address', 'Riverwalk Office Park, Block B, 41 Matroosberg Road, Ashlea Gardens, Pretoria, 0081'],
        ['Toll-free', '0800 20 37 22'],
        ['E-mail', 'info@fsca.co.za'],
        ['Website', 'www.fsca.co.za'],
      ] },
    ],
  },
  {
    h: '12. External Compliance Officer',
    body: [
      { table: [
        ['Compliance Practice', 'Moonstone Compliance (Pty) Ltd'],
        ['FSCA approved compliance practice number', '—'],
        ['Representative compliance officer', 'Cobus Gresse'],
        ['Physical address', 'Valerida Centre, 1st Floor, Piet Retief Street, Stellenbosch, 7600'],
        ['Telephone', '+27 (0)21 883 8000'],
        ['E-mail', 'compliance@moonstonecompliance.co.za'],
        ['Website', 'www.moonstonecompliance.co.za'],
      ] },
    ],
  },
  {
    h: '13. Protection of Personal Information (POPIA)',
    body: [
      { p: 'Inexpro is a responsible party as defined in POPIA and is committed to lawfully processing your personal information.' },
      { table: [
        ['Information Officer', 'Steph van der Vyver'],
        ['Registered with the Information Regulator', 'Yes – as required by section 55 of POPIA'],
        ['Contact for privacy matters', 'privacy@inexpro.co.za  |  +27 (0)21 981 1612'],
        ['PAIA Manual', 'Available at www.inexpro.co.za or on request (Promotion of Access to Information Act, 2 of 2000)'],
      ] },
      { p: 'Lawful basis and purpose: We process your personal information for the following purposes — providing advice and intermediary services; obtaining quotations; placing, renewing, amending and cancelling policies and investment products; handling claims; verifying identity in terms of FICA; preventing fraud; complying with our regulatory, record-keeping and audit obligations; and communicating with you about your policies and investments.' },
      { p: 'Cyber and data breach protection: In addition to technical and organisational security measures, Inexpro maintains a Data Protection (Cyber) extension of R1 000 000 under its Professional Indemnity policy (underwritten by ITOO Special Risks / The Hollard Insurance Company Limited – see section 5), which responds to claims arising from data breaches, POPIA contraventions, and related cyber events.' },
      { p: 'Sharing of information: Your information may be shared with the insurers listed in section 4 above, and with FICA-accredited verification services, regulators (FSCA, SARB, FIC, NFO, SARS), auditors and our external compliance practice. We will not share or sell your information for unrelated marketing purposes without your consent.' },
      { sub: 'Your rights under POPIA' },
      { ul: [
        'To be notified of the processing of your information.',
        'To access personal information held about you.',
        'To request correction, deletion or destruction of inaccurate or outdated information.',
        'To object to processing and to withdraw consent.',
        'To lodge a complaint with the Information Regulator: complaints.IR@inforegulator.org.za  |  www.inforegulator.org.za',
      ] },
    ],
  },
  {
    h: '14. Financial Intelligence Centre Act (FICA)',
    body: [
      { p: 'Inexpro is an Accountable Institution in terms of Schedule 1 of FICA (as amended by Act 1 of 2017 and Act 22 of 2022). We are required to:' },
      { ul: [
        'Identify and verify the identity of clients and beneficial owners (Customer Due Diligence).',
        'Maintain records of client identification and transactions for at least 5 years.',
        'Report suspicious and unusual transactions, cash threshold transactions and terrorist property to the Financial Intelligence Centre.',
        'Implement and maintain a Risk Management and Compliance Programme (RMCP).',
      ] },
      { p: 'You are required to provide the information and documentation requested to enable us to comply with these obligations. Failure to do so may result in us being unable to place or maintain cover on your behalf.' },
    ],
  },
  {
    h: '15. Conduct of Financial Institutions (COFI) Readiness',
    body: [
      { p: 'The Conduct of Financial Institutions Bill is expected to be enacted during 2026 with a transitional period of approximately three years. COFI will consolidate and replace FAIS, the Short-term Insurance Act and the Long-term Insurance Act (amongst others) and will introduce an activity-based licensing regime focused on customer outcomes and market conduct.' },
      { p: 'In preparation for COFI, Inexpro confirms that:' },
      { ul: [
        'Our Key Individual and any Representatives satisfy the Fit and Proper requirements set out in Board Notice 194 of 2017 and will meet the enhanced fit-and-proper standards anticipated under COFI.',
        'We maintain a Governance Framework, a Conflict of Interest Management Policy, a Complaints Management Policy, a Remuneration Policy, a Risk Management and Compliance Programme (FICA/POPIA) and a Product Oversight and Suitability framework.',
        'A Transformation Policy aligned with the Financial Sector Code and anticipated COFI requirements is maintained and reviewed annually.',
        'We keep records of all financial services rendered for a minimum of 5 years and will extend retention if required under COFI or any subsidiary Conduct Standard.',
        'We will update this Disclosure Notice and re-license under COFI within the transitional period once the Act and its Conduct Standards are published in final form.',
      ] },
    ],
  },
  {
    h: '16. Other Important Matters',
    body: [
      { ul: [
        'Any material change to the information in this disclosure will be communicated to you in writing without delay.',
        'You are entitled, at no cost, to a copy of your policy documents and of this Disclosure Notice.',
        'For your protection and ours, certain telephone calls may be recorded.',
        'This document is version-controlled. See the version and review date in the footer.',
        'No guarantee is given regarding the future financial standing of any insurer or product supplier.',
      ] },
    ],
  },
  {
    h: '17. Client Acknowledgement & Signature',
    body: [
      { p: 'I/we, the undersigned, confirm that:' },
      { ul: [
        'I/we have received, read and understood this Intermediary Disclosure Notice.',
        'The Key Individual has brought to my/our attention the matters set out in sections 1 – 16 above.',
        'I/we understand my/our duty of disclosure and the consequences of misrepresentation.',
        'I/we consent to the processing of my/our personal information as described in section 13 for the purposes stated.',
        'I/we have had an opportunity to ask questions and have had them answered to my/our satisfaction.',
      ] },
    ],
  },
];

// Fill-in fields the client completes on the signing page (section 17 "Client
// details"). `name` is posted back in form_answers and stamped into the PDF.
// The signer's full name + signature + date come from the signing page's own
// controls, so they are not duplicated here.
const CLIENT_FIELDS = [
  { name: 'client_entity_name', label: 'Full name(s) of client / entity', required: true },
  { name: 'id_or_reg_number',   label: 'ID / Company registration number', required: false },
  { name: 'policy_reference',   label: 'Policy reference / quote number', required: false },
  { name: 'contact_number',     label: 'Contact number', required: false },
  { name: 'email_address',      label: 'E-mail address', required: false },
  { name: 'signing_capacity',   label: 'Capacity (if signed on behalf of an entity)', required: false },
  { name: 'signing_place',      label: 'Place', required: false },
];

// ── HTML rendering (public signing page) ─────────────────────────────────────
function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _blockHtml(b) {
  if (b.p)   return `<p>${_esc(b.p)}</p>`;
  if (b.sub) return `<h4 style="color:#1a5276;margin:18px 0 6px;font-size:15px;">${_esc(b.sub)}</h4>`;
  if (b.note) return `<p style="font-style:italic;color:#555;">${_esc(b.note)}</p>`;
  if (b.ul)  return `<ul>${b.ul.map(i => `<li>${_esc(i)}</li>`).join('')}</ul>`;
  if (b.table) {
    const rows = b.table.map(([l, v]) =>
      `<tr>
        <th style="text-align:left;vertical-align:top;padding:6px 10px;border:1px solid #cbd5e0;background:#f2f6fa;font-weight:600;width:38%;">${_esc(l)}</th>
        <td style="vertical-align:top;padding:6px 10px;border:1px solid #cbd5e0;">${_esc(v)}</td>
      </tr>`).join('');
    return `<table role="presentation" style="border-collapse:collapse;width:100%;font-size:13.5px;line-height:1.5;margin:8px 0 14px;">${rows}</table>`;
  }
  return '';
}

/**
 * Render sections 1–17 of the disclosure as the signing-page body. The
 * fill-in client fields + signature are rendered by the signing page itself
 * (after this body), and the broker line is appended here for context.
 *
 * @param {{ broker_name?: string }} [ph]
 */
function renderDisclosureBodyHtml(ph = {}) {
  const brokerName = ph.broker_name || 'Inexpro Broker';
  const sectionsHtml = SECTIONS.map(s =>
    `<h3 style="color:#1a5276;margin:24px 0 8px;font-size:17px;">${_esc(s.h)}</h3>` +
    s.body.map(_blockHtml).join('')
  ).join('');

  return `
    <h2 style="text-align:center;">Statutory Disclosure Notice to Clients</h2>
    <p style="text-align:center;color:#555;margin-top:-6px;">Inexpro Short Term Insurance — Authorised FSP No. 7591</p>
    <p>${_esc(INTRO)}</p>
    ${sectionsHtml}
    <h4 style="color:#1a5276;margin:18px 0 6px;font-size:15px;">Client details</h4>
    <p style="font-size:13px;color:#555;">Please complete the fields below, then sign at the bottom of the page.</p>
    <p style="margin-top:18px;"><strong>On behalf of Inexpro CC:</strong> ${_esc(brokerName)} (signature applied to the filed copy).</p>
  `;
}

module.exports = { INTRO, SECTIONS, CLIENT_FIELDS, renderDisclosureBodyHtml };
