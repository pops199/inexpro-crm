# Inexpro CRM — Release Notes

Per-version notes shown in **Admin → Settings → System Update**. Every
version bump appends a new `## vX.Y.Z` section here. The newest version
sits at the top.

---

## v1.0.52 — 2026-05-18

**User delete fixed for compliance tables · GIT Confirmation: Client/Company fields, signed PDF mirrors unsigned · signer-name no longer pre-filled**

- **User Management — Delete fixed**: the admin "Delete user" flow now
  enumerates every foreign key pointing at `users(id)` at runtime
  (`PRAGMA foreign_key_list`) and clears or reassigns each one based on
  its `ON DELETE` action and column nullability. Previously the handler
  hard-coded ~15 tables; the dozens of compliance / signature / breach
  / POPIA / FICA / workflow / notification tables added since were
  missed, which produced the *"FOREIGN KEY constraint failed"* error
  reported when deleting brokers with any activity history. The new
  pass auto-handles future tables too — adding a new `REFERENCES
  users(id)` column no longer requires updating the delete route.
- **GIT Confirmation — Client Name & Company Name**: new pair of inputs
  at the bottom of the GIT Confirmation modal (Acknowledgement of
  Receipt section). Pre-filled from the policy's contact / account but
  fully editable. The typed values now print into the "I __ representing
  __" line on the PDF instead of underscored blanks, and flow through
  to the signed copy as the authoritative client identity.
- **GIT Confirmation — Signed PDF matches the unsigned layout**: the
  signed page no longer looks like a separate "signature receipt" — it
  now re-renders the same Acknowledgement of Receipt block the client
  saw, with the names filled in, "Signed on this Xth day of Month YYYY",
  the signature image stamped over the **For** line, the **Witness**
  underline kept blank (e-sign has no witness), and the 14-day
  deemed-accepted clause preserved. An audit footer at the bottom logs
  the ISO timestamp, IP, user-agent, and the typed name when it differs
  from the broker-entered Client Name.
- **GIT Confirmations tab**: new tab on the Transport policy detail
  view listing every GIT Confirmation signature request (pending +
  signed) attached to that policy. Pending rows show an "Open link"
  button; signed rows link the auto-attached PDF. Powered by
  `GET /api/signature-requests?template_key=git_confirmation&policy_id=...`
  which now also LEFT-JOINs `documents` for filename / size.
- **Public signing page — "Full name (printed)" no longer pre-fills**:
  the field used to come pre-populated with the policy-holder's name
  from the contact record, which meant most clients clicked through
  without typing their own name. It now renders blank on every signing
  page (POPIA, GIT, ROA) and stays compulsory.

## v1.0.51 — 2026-05-18

**Workflows "All" tab now hides Completed**

- The **All** tab in the Workflows module now shows only open work —
  Assigned, Open, In Progress and On Hold. Completed tasks are filtered
  out and live exclusively under the dedicated **Completed** tab. The
  All-tab count badge updates accordingly. Other tabs are unchanged.

## v1.0.50 — 2026-05-18

**Weekly auto-scan for new releases + in-app notifications; "Retail Value" added to Basis of Cover**

- **Weekly system-update auto-scan**: every Monday at 07:00 (local time)
  the server runs the same "check for updates" routine as the admin
  button, and if a newer `v*` tag is available on GitHub, drops an
  in-app notification on every active **admin / admin_only** user.
  Cadence is read from `system_settings` (`weekly_update_check_day`,
  `weekly_update_check_hour`) so it can be retuned without a restart.
- **Manual button now notifies too**: clicking **Admin → System
  Update → Check for Updates** also fires the same notification when
  a new release is found. Idempotent per release tag — re-clicking
  while v1.2.3 is the latest never produces a duplicate notification.
  Dedup key is `system_update_available:<tag>`, so each admin sees one
  notification per version, ever.
- **No email**: this is in-app only. The bell badge polls every minute,
  so admins see the new notification without refreshing the page.
- **Assets — Basis of Cover**: new "Retail Value" option added to the
  dropdown (between "Replacement Value" and "Market Value"). Existing
  assets are unchanged; reports and CSV import accept the new value
  automatically.

## v1.0.49 — 2026-05-15

**ROA library entries become per-record e-sign requests; uploads move to `client/uploads/`**

- **Email composer library**: the generic "Record of Advice" signable
  template is no longer shown on every contact / account. ROAs now
  only surface as **per-record entries under the Engagements group**
  (already filtered to *this* contact / account). Picking one and
  sending creates a per-ROA `signature_request` and embeds a styled
  "Click here to review and sign" link in the email body (labelled
  with the ROA's reference number). Replaces the older "attach
  pre-generated ROA PDF as email attachment" behaviour.
- **`/send-email` payload**: now accepts a richer `signable_templates:
  [{template_key, form_data?}]` field alongside the existing
  `signable_template_keys`. For ROA picks, the server looks up the
  advice record and uses its actual contact / account / policy FKs
  as the request destination so the signed PDF lands on every linked
  record (including the ROA's own Documents tab).
- **Upload directory moved to `client/uploads/`**. `getUploadRoot()`
  in `server/routes/documents.js` and the parallel helpers in
  `assets.js`, `broker-profiles.js`, `policies.js`,
  `public-signing.js` and `settings.js` now default to
  `<repo>/client/uploads` (still overridable via the `UPLOAD_PATH`
  env var). `.gitignore` updated to keep `client/uploads/` out of
  version control.

**Migration note**: existing deployments with files at `<repo>/uploads`
must either move that directory to `<repo>/client/uploads/`, or set
`UPLOAD_PATH=./uploads` in their `.env` to keep the old location.

## v1.0.48 — 2026-05-15

**Record of Advice: e-sign flow via the existing Send ROA button**

The Record of Advice module now uses the same e-signature flow as POPIA
and GIT Confirmation. There's no separate "Send for Signature" button —
the existing Send ROA button now drives the whole flow.

- **ROA detail header**: the old emoji "📧 Send ROA" and the interim
  "✍ Send for Signature" buttons are replaced by a single **Send ROA**
  button.
- **Click flow**: creates a pending signature_request for the ROA, then
  opens the email modal pre-populated with the client's email, a
  default subject (`Record of Advice - <number>`), and a message body
  with the signing link rendered as a styled button plus a raw URL for
  forwarding. The broker tweaks the wording and clicks Send ROA — the
  email goes out via `/api/settings/send-email`.
- **Client side**: clicking the link opens the public signing page
  (`/sign/<token>`), shows the ROA contents pulled from the linked
  advice_record, captures a signature on a canvas, submits.
- **Server side**: signed PDF (with Inexpro letterhead, footer, and
  stamped signature) is now linked to:
  - **the ROA itself** (`advice_record_id`) — surfaces under the ROA's
    Documents tab
  - the contact (`contact_id`)
  - the account (`account_id`) when applicable
  - the policy (`policy_id`) when applicable
- **New shared module** `server/lib/roa-pdf.js` renders the signed ROA
  PDF using the same letterhead + footer chrome and proper-margin /
  cursor-saving patterns as the POPIA + GIT renderers.
- **New signable template** `roa_confirmation` registered server-side
  (dynamic — body content comes from the linked advice_record row).
- **New endpoint** `POST /api/advice-records/:id/sign-request` creates
  the signature_request and returns the public URL.

## v1.0.47 — 2026-05-15

**e-Signature flow · POPIA notices & GIT Confirmation**

A new server-hosted e-signature flow lets a broker email a client a
one-time link, the client signs on a public page, and the signed PDF
is automatically filed under the right record. No third-party service.

- **Signable templates** registered server-side
  (`server/lib/signable-templates.js`). Three templates shipped:
  - **New Prospect / First Time Enquiries / New Onboarding** (POPIA)
  - **Existing Clients / Lapsed Clients / Anyone Already on File** (POPIA)
  - **GIT Confirmation of Insurance** (Transport policies; dynamic —
    body content comes from a broker-filled form)
- **`signature_requests` table** (migration `0005`) tracks each pending
  / signed / expired request with a 24-byte URL-safe token, 30-day
  expiry, destination linkage (contact / account / policy), signer
  audit fields (IP, user-agent, typed name, timestamp), marketing
  consent, and the resulting `document_id`. Migration `0006` adds a
  nullable `form_data` JSON column for templates that carry per-request
  payload (currently GIT).
- **Email composer (Contacts + Accounts)**: the **+ Add Attachment**
  library now lists signable templates under a **POPIA / FICA** group.
  Picking one creates the request on send and embeds a styled
  "Click here to review and sign" button in the email body. Templates
  are fetched dynamically from `/api/signature-requests/templates`
  so future templates surface without a frontend change.
- **Public signing page** (`/sign/<token>`): clean, mobile-friendly
  page renders the notice, YES/NO marketing consent radios when
  applicable, a touch / mouse signature canvas, name + date inputs.
  For dynamic templates (GIT) it builds the document HTML from the
  stored `form_data` so the client reviews the exact terms.
- **Signed PDF generator** uses the Inexpro letterhead on page 1 and
  the branded footer (`letterhead-footer.jpg`) on every page. Long
  notices automatically wrap to extra pages without overlapping the
  footer. Friendly filename `POPIA Consent - <Client Name>.pdf` or
  `GIT Confirmation - <Client Name>.pdf` (taken from the typed signer
  name, sanitised for filesystem / header safety). The signed PDF
  lands in the encrypted `documents/` store, linked to the right
  contact / account / policy, and immediately appears in the Add
  Attachment library for future emails.
- **GIT Confirmation** (Transport policies): the modal now offers
  **Download Unsigned PDF** (preview) AND **Send for Signature**.
  Send creates the signature request with the captured form payload
  (insured, addresses, coverage limits, vehicle groups, etc.) and
  shows the public URL with copy + preview buttons. The shared
  PDF renderer (`server/lib/git-confirmation-pdf.js`) is used for
  both the unsigned preview and the signed output — the only
  difference is the optional `signature` argument that replaces
  the printed Acknowledgement page with a stamped signature.

**Fixes incidental to the new flow**

- `/send-email` was attaching documents by raw file path, bundling
  encrypted ciphertext into outgoing emails — now decrypts via
  `readDecryptedFile` before nodemailer sees the buffer.
- PDF generator: proper `margins.top` / `margins.bottom` so long
  text auto-wraps before the footer instead of running into it.
- Page-2 font no longer shrank to footer size — `drawFooter` now
  saves and restores font name + font size around the footer draw
  (PDFKit's `save()`/`restore()` only covers graphics state, not
  font state).
- `drawFooter` now restores `pdfDoc.x` / `pdfDoc.y` too — fixed a
  cascade of 50+ blank pages caused by the cursor being left at
  the bottom of the page after a footer draw.

## v1.0.46 — 2026-05-15

**Email composer document library · GIT Confirmation generator**

- **Email composer overhaul (Contacts + Accounts).** The "+ Add Attachment"
  button now opens a **document-library picker** instead of a file dialog.
  The picker lists every standard group — Contact/Account Documents,
  Policies, Claims, Engagements, Complaints, Reviews, Assets — even when a
  group is empty, with collapsible sections, per-group "Select all",
  search, and a 👁 preview link per row.
  - **Synthetic entries** are merged in so users can pick generated PDFs
    the same way they pick real uploads:
    - 🧾 **Policy Schedule (generated PDF)** — always available under
      *Policies*.
    - 🧾 **Default claim-form templates** — under *Claims*.
    - 🧾 **Record of Advice per advice record** — under *Engagements*.
  - The old Policy Schedule checkbox, ROA checkbox+list, and Claim Form
    dropdown have been removed (consolidated into the library).
  - A separate **"+ Upload from Computer"** button keeps the local-file
    flow for fresh uploads.
  - Server `/api/documents/related?module=…&record_id=…` aggregates
    docs across the related policies / claims / ROAs / etc.
  - The picker fetches advice records live so newly-added ROAs show up
    without reopening the email modal.
  - **Bug fix:** `/api/settings/send-email` was attaching documents by raw
    file path, which bundled encrypted ciphertext into emails. Documents
    now decrypt server-side via `readDecryptedFile` before nodemailer sees
    them.
- **GIT Confirmation of Insurance generator.** A new **GIT Confirmation**
  button appears at the top of the policy detail page next to *Create
  Amendment Mail* — visible only for Transport policies (`policy_type`
  or `product_category` = Transport). It opens a form pre-filled from the
  policy/insured records: confirmation + renewal dates, insured + risk
  addresses, insurer, policy number, brokers, prepared-by, premium note,
  **7 editable coverage limits**, **First Loss / All Risk Policy / SASRIA**
  checkboxes, **repeating vehicle-limit groups** (description + R-amount
  + vehicles), and territorial limits. Generates a multi-page A4 PDF
  built from the *04 Confirmation of Insurance* template — header letter,
  coverage tables, vehicle limit detail, standard property definition,
  excluded goods, territorial limits, general exclusions, first-loss
  clause, proportionate consignment clause, sign-off, and a second-page
  Acknowledgement of Receipt block. Audit log records the export.
- **PDF chrome.** Inexpro letterhead now renders on page 1 only.
  A new `client/public/letterhead-footer.jpg` asset is reused as the page
  footer banner — it's stamped at the bottom of **every page**, with the
  firm's contact and FSP-licence disclosure overlaid as selectable text.

## v1.0.45 — 2026-05-14

**Broker CPD register — inline Certificate Addendum**

- Each broker section in the **Broker CPD Activity Report** now ends with
  a **Certificate Addendum** listing every certificate file linked to
  that broker's CPD activities, embedded inline:
  - PDFs render in an `<iframe>` (scroll inside to view all pages).
  - Images (jpg/png/etc.) render via `<img>` full-width.
  - Other file types fall back to a "Open in new tab" link.
- Each block is labelled with the sub-activity title + activity date and
  the original filename. Print rules force a page break before each
  certificate so on-screen review and print order stay clean.
- Backend bundles certificates per activity (`documents.cpd_activity_id`
  → grouped post-query) to avoid row-multiplication when an activity has
  multiple files.

**Browser-print note:** Chrome inlines each embedded PDF in the print
output but typically captures only its first page — a long-standing
browser limitation. Server-side multi-page PDF merging is a future
option if exact printed addenda are needed.

## v1.0.44 — 2026-05-14

**Broker CPD register · default-broker filters · Assets pagination + search**

- **New report — Broker CPD Activity Report.** Predefined report rendering an
  FSCA-style CPD register: per broker a `Surname / Name / ID Number /
  Current CPD Cycle / CPD Required / CPD Outstanding / Compliant` header
  block, followed by an `Activity / CPD Provider / Reference No / Date /
  Certificate / CPD Hours` table. ID numbers are decrypted server-side;
  packed `activity_title` strings are split into one line per sub-activity
  using the embedded reference (FPI / EVT formats with whitespace-tolerant
  matching). Print and Excel export from the report window.
- **Default broker filter for admins** now also applies to **Policies**,
  **Claims**, and **Accounts** (matching the Contacts behaviour shipped in
  v1.0.43). Admins land on their own book; the dropdown still allows
  picking another broker and the Clear button shows All Brokers.
- **Assets — pagination.** Switched from a single 200-row pull to true
  server pagination (50 per page) with Prev / Next controls and a "Page X
  of Y · N assets" footer; filter changes reset to page 1.
- **Assets — search fix.** Client previously sent `q=` while the server
  expected `search=`, so search silently fell back to JS-filtering the
  first 200 rows. Search now goes server-side and matches across
  `asset_name`, `registration_number`, `vin_number`, `serial_number`,
  `make`, `model`, **contact first/last name**, **account name**, and
  **policy name / number**.

## v1.0.43 — 2026-05-07

**Contacts list: admins default to "my contacts"**

- Admins (`role === 'admin'`) now land on the Contacts page with the
  Broker filter pre-set to their own user — so they see their own book
  first instead of the full multi-broker list. The dropdown still lets
  them pick another broker, and the **Clear** button explicitly resets
  to All Brokers (passes `broker_id: ''`, which overrides the default).
- Brokers fall through unchanged — they're already broker-isolated
  server-side. `admin_only` users keep the all-contacts view (they
  aren't selectable as brokers, so a self-filter would return zero).

## v1.0.42 — 2026-05-07

**Commission tab: Delete button with centred confirm modal**

- Each row in the policy Commission tab now has a red **Delete** button
  next to **Edit**. Click → centred confirm modal asks "Delete the
  {type} commission entry? This cannot be undone." with **Delete** /
  **Cancel** buttons. On confirm: `Api.commissionLog.delete(id)`,
  toast, and the commission table refreshes.
- The confirm uses `confirmDialogAsync` (already in `utils.js`) — an
  in-page centred overlay rather than the native browser `confirm()`
  popup. Enter confirms, Escape cancels.
- Server route `DELETE /api/commission-log/:id` already existed and is
  gated by the `canDelete` middleware, so non-deleter roles get a clean
  error toast instead of a partial state.

## v1.0.41 — 2026-05-07

**Commission modal: + Add More button & stale-banner fix**

- **+ Add More button** added to the Commission Entry popup (Add mode
  only — hidden when editing). Positioned on the far left of the modal
  footer via `margin-right:auto`, with Save and Close clustered on the
  right. Click saves the current entry, refreshes the commission table
  behind the modal, then resets the form (R/% toggle back to %, "Other"
  business-class panel collapsed) and re-focuses the Commission Type
  dropdown so the broker can keep entering rows without re-opening the
  popup.
- Both **Save** and **+ Add More** share a single `performSave({
  keepOpen })` function so the create/update path stays consistent.
- **Bug fix:** the red "Commission entry missing" banner above the tabs
  was rendered from a server-computed flag at detail-load time and never
  updated after the first save — so the warning lingered even though
  the entry was visible in the Commission table. The save handler now
  removes the banner from the DOM as soon as a commission entry is
  successfully created or updated.

## v1.0.40 — 2026-05-07

**Fresh-policy save → Commission Entry modal pops automatically**

- Saving a new policy for the first time now navigates to the policy
  detail with the Commission tab pre-selected and the
  **+ Add Commission Entry** modal already open. The broker captures
  remuneration in the same flow as the policy itself instead of having
  to find the tab.
- Wired via a `?openCommission=1` flag on the navigation hash. The
  router strips query strings before matching, so the existing route
  still resolves; the policy detail reads the flag with the existing
  `getFiltersFromHash()` helper, switches to the commission tab, and
  programmatically clicks the same Add button the user would. The flag
  is then `replaceState`-stripped so a refresh doesn't re-pop the modal.
- The Commission tab itself, the modal HTML, the save handler, and the
  follow-up **+ Add Commission Entry** button are all unchanged — saving
  still writes to the commission table the same way, and additional
  entries are added through the existing button.

## v1.0.39 — 2026-05-07

**POPIA + FICA search & sortable columns · supplier visibility · claim form cross-filter & auto-fill**

- **POPIA / FICA modules**
  - Search box now lives in the top header, centred, styled to match the
    Assets module (same `height:28px;font-size:.78rem;width:200px;` pill).
    FICA gains a search box (it had none); POPIA's wider 340px input was
    replaced.
  - Every non-`actions` column is now sortable. Click a header to toggle
    asc/desc with ▲/▼. The encrypted `fica_document_reference` column is
    deliberately left non-sortable (sorting on ciphertext is meaningless).
  - Catalog flags in `view-prefs.js` flipped to `sortable: true` to match.
- **Supplier visibility (cross-broker)**
  - Supplier contacts (`contact_type = 'Supplier' AND client_category =
    'Supplier'`) are now visible to every broker regardless of who owns
    them. Suppliers are shared infrastructure — panel-beaters, assessors,
    service providers — and brokers need to be able to pick them as the
    Contact on a claim or in a related-contacts row.
  - `GET /api/contacts` broker-isolation predicate widened to
    `(assigned_broker_id = ? OR is-supplier)`. `GET /api/contacts/:id` 403
    check bypassed for suppliers.
  - **Edit / Delete** on a supplier still gates on broker ownership — only
    the assigned broker can change supplier contact details. POPIA / FICA
    / TCF dashboards continue to exclude suppliers (they're not data
    subjects).
- **Claim form cross-filter & auto-fill**
  - Selecting **Policy / Contact / Account** narrows the **Asset**
    dropdown to assets that match all selections. Selecting **Asset**
    auto-fills Policy + Account/Contact based on the asset's links and
    re-narrows the dropdowns.
  - Opening the form from `?policy_id=X` (Policy → Claims tab),
    `?account_id=X`, `?contact_id=X`, or `?asset_id=X` (Asset → Claims
    tab) now correctly prefills every related field.
  - **Bug fix:** `makeSearchable` in `utils.js` froze its option cache
    and visible text on first wrap, so programmatic `sel.value =` and
    `sel.innerHTML =` updates from the cross-filter logic were invisible
    on screen. Added `sel._searchableSync()` that rebuilds the option
    cache and rewrites the visible input text. Cross-filter calls sync
    after every mutation.

## v1.0.38 — 2026-05-07

**Pagination fix: dropdowns no longer truncate at 25 records · new asset type "Speciality" · two new policy sections**

- **Bug fix (load-bearing):** the policies, engagements, and policy-sections
  list endpoints hardcoded a page size of 25 and silently ignored the
  `?limit=` query parameter. Symptom in the wild: the Belogix CC account
  has two active policies, but the New Claim form's policy dropdown only
  showed one — because the second sat at rank 26 in the global
  `updated_at DESC` order. Same truncation lurked in every dropdown that
  fetches engagements or policy sections.
  - All three routes now honour `?limit=` (capped at 1000), default 25.
  - Existing front-end calls already pass `limit: 500`, so the fix is
    transparent — every dropdown that previously truncated now returns
    the full set.
- **Asset catalog:**
  - New asset type **Speciality** added to the asset-type dropdown.
  - New policy section **Motor – Heavy Commercial Trailer > 7 500kg**,
    surfaced when the Motor asset type is selected.
  - New policy section **Value Added Services**, surfaced when the new
    Speciality asset type is selected.
  - DB schema unchanged — `assets.asset_type` and `assets.asset_section`
    are plain TEXT, no CHECK constraint.

## v1.0.37 — 2026-05-06

**Policy → Assets tab: search box + sortable columns**

- Added a centered **search box** above the column headers on the Assets
  tab. Filters across asset name, type, section, make/model/year,
  registration, VIN, serial, item, fleet, status, contact/account,
  policy, and policy section. Empty-state message switches to
  "No matches." while a query is active.
- **Sortable columns** — clicking any sortable header (per the column
  catalog) toggles asc/desc with a ▲/▼ indicator. Numeric columns
  (Value, Sum Insured, Premium) sort numerically; date columns by
  ISO date; composite fields (Make/Model/Year, Contact/Account, Policy,
  Policy Section) sort by their displayed value.
- Because the Assets tab uses a shared renderer, the same search and
  sort also light up on the **Claims** module's Assets tab and the
  **policy section** "Assets in this Section" view — no duplicate
  wiring.

## v1.0.36 — 2026-05-06

**Custom report builder — every column exposed, ghost-column crashes fixed**

- **Bug fix:** `advice_records` exposed 10 columns that don't exist in
  the schema (`client_understood_advice`, `client_decline_reason`,
  `replacement_product_involved/_details`, `financial_interest_*`,
  `fais_disclosure_given`, `popi_disclosure_given`, `status`,
  `advice_notes`). Selecting any of them crashed the report at runtime.
  Removed; replaced with the real columns (`client_understanding_confirmed`,
  `client_rejection_reason`, plus the rest of the COFI-aligned set).
- Every reportable source's field list expanded to cover **every real
  column** on the underlying table. Encrypted columns
  (`policies.account_number_enc`, `users.password_hash`) deliberately
  excluded.
  - **Contacts** 32 → 80 fields: title / gender / language / occupation
    block, structured `phys_*` + `post_*` address, full POPIA detail
    (consent method/scope, retention, info officer, privacy notice),
    full FICA detail (verification, PEP, CIPC, beneficial owner),
    driver-licence info, `last_activity_date`.
  - **Accounts** 22 → 60: structured address, full POPIA + FICA detail.
  - **Policies** 29 → 47: `co_insured*`, `currency`, `product_id`, full
    debit-order / banking block, broker-code snapshot.
  - **Assets / Policy Sections** 80 → 95: `item_number`, `product_id`,
    `currency`, structured address (complex / country / gps), excess
    percentage breakdown, `additional_covers`, `vehicle_extras`,
    `extras_in_total`, `excesses`, `related_contacts`, financial-interest
    fields, vehicle parking + tracker.
  - **Claims** 29 → 51: `claim_category`, `claim_reference_number`,
    `currency`, full driver-details block (Motor / GIT), repudiation
    reason + notes, `outcome_vs_roa_expectation`,
    `post_claim_satisfaction`, `complaint_arising`,
    excess percentage breakdown, `claim_related_contacts`.
  - **Client Engagements** 39 → 50: `currency`, full COFI disclosure
    block (FSP licence / broker identity / product costs / material
    risks / complaints process / method / timestamp).
  - **Complaints** 28 → 56: `severity_rating`, `complaint_sub_category`,
    full SLA tracking (acknowledgement / target / supervisor / handler /
    Day-3/21/30 alerts / escalation / senior management), full resolution
    block, withdrawal block, `fsca_reportable`.
  - **Records of Advice** 36 (with 10 ghosts) → 60: `currency`,
    `product_id`, `client_risk_appetite`, `total_financial_exposure`,
    full conflict-of-interest + commission disclosure block, target-
    market block, supervisor co-approval block, full acknowledgement
    block, `re5_flag`, `fair_outcome_considered`.
- All exposed fields validated against the live schema — every column
  in the picker is queryable.
- JOIN definitions checked; left unchanged (no broken joins found).
  `policy_sections` source continues to alias the `assets` table
  (section data lives on assets in this codebase; the real
  `policy_sections` table is empty).

---

## v1.0.35 — 2026-05-06

**SASRIA assets: drop the building-address requirement**

- The asset address validator was matching the word "Fire" in section
  names and was forcing SASRIA – Material Damage (Fire Coupon) assets
  to have a street + city/suburb. SASRIA coupons (Material Damage /
  Motor / Contract Works / Goods in Transit / Money) sit on top of an
  underlying policy and don't have an asset-level address. The
  validator now short-circuits when `asset_section` or `asset_type`
  starts with "SASRIA". Other Property / Fire / Building / Homeowners
  sections still require an address.

---

## v1.0.34 — 2026-05-06

**Asset amendment-mail: full-asset dump on create + range selector**

- The "Send to insurer" popup that fires straight after creating a new
  asset now lists **every populated field** as `Label: value` lines
  instead of the (empty) last-24h diff. Body wording switches to
  "Please add the following new asset…" with subject "New asset to
  add to Policy …".
- The **Create Amendment Mail** button on the asset detail page now has
  a **Show** dropdown inside the popup with four options — Initial
  creation (all field values) / Changes in the last 24 hours / Changes
  in the last 7 days / All changes since asset created. Switching the
  dropdown re-fetches and re-renders the body. Manually edited subjects
  are preserved across switches.
- Server: `GET /api/assets/:id/amendment-changes` now accepts
  `?range=24h|week|all|new` (default `24h`, preserves existing
  behaviour) and returns `range`, `range_label`, `is_new_asset`. The
  `new` mode iterates every populated field, formatted in a sensible
  order (identity → identifiers → cover/financials → dates → notes),
  using the existing currency/JSON formatters.

---

## v1.0.33 — 2026-05-05

**Centered Roll back modal**

- Admin → System Update → **Roll back** no longer opens a native
  browser confirm popup. It now opens a centered overlay modal that
  matches the Apply Update one — header with × close, bullet-listed
  consequences (data-loss warning highlighted in danger colour),
  Cancel / **Roll back** (red) buttons. Default focus is Cancel so an
  Enter keypress doesn't accidentally roll back. Keyboard: Esc cancels,
  Enter rolls back.

---

## v1.0.32 — 2026-05-05

**Action-cell overlap fix; centered Apply Update modal**

- The previous one-row action-button fix used `display: flex` on the
  table cell, which ignores column boundaries and caused the buttons
  to overflow into the Broker (or previous) column. Switched to
  inline-block buttons with `white-space: nowrap`, `text-align: right`,
  `width: 1%` on the cell, and sibling `margin-left` for spacing.
  Buttons now stay on one row AND stay inside the Actions column on
  every list (policies, contacts, accounts, claims, engagements, ROAs,
  complaints, reviews, etc.).
- Admin → System Update → **Apply update** no longer opens a native
  browser confirm popup at the top of the screen. It now opens a
  centered overlay modal that matches the rest of the app's modals
  (header with × close, bullet-listed actions, Cancel / Apply update
  footer). Keyboard: Esc cancels, Enter applies.

---

## v1.0.31 — 2026-05-05

**Action-button row fix; backfill old asset Note descriptions**

- **Action buttons stay on one row.** Tables across every module
  (policies, contacts, accounts, claims, engagements, ROAs, complaints,
  reviews, etc.) had View / Edit / Delete wrapping onto multiple lines
  when the actions column got narrow. The no-wrap CSS rule was scoped
  to `.actions` but the cells use `.actions-cell` / `.table-actions`,
  so the rule never matched. Rule now covers all three variants, plus
  `flex-shrink: 0` on each button and `width: 1%` on the cell so the
  column sizes itself to the buttons. Mobile auto-card layout
  unaffected.
- **Backfill old asset Note descriptions.** v1.0.30 renamed the asset
  Amendments tab to Notes, but historic audit_log rows still read
  "Amendment …". Migration `0004` rewrites every pre-rename row
  scoped to `module = 'assets'`: `Amendment added/updated/deleted on
  asset` → `Note added/updated/deleted on asset`. Idempotent and
  scoped — does not touch the unrelated "Create Amendment Mail"
  feature's audit entries.

---

## v1.0.30 — 2026-05-05

**Asset Notes (rename) + policy Sections tab mobile fix**

- The asset **Amendments** tab is now called **Notes** — tab label,
  toolbar button (`+ Add Note`), form titles (`New Note` / `Edit Note`),
  submit button (`Save Note`), placeholder, empty state, toasts, and
  the delete-confirm prompt all read as Note. Audit-log / timeline
  descriptions on create / update / delete now also read as Note
  (existing pre-rename rows keep their original wording). The
  underlying API, database column names, and document module key are
  unchanged so existing data is preserved.
- **Policy → Sections tab on mobile.** The wide breakdown table was
  rendering each section as a 15-line stack on phones. Mobile now
  hides the breakdown-only columns so each section card shows just
  Section, Assets, Asset Value, Total Premium (simple-mode hides
  SASRIA / Excess too). The wide totals strip above the table is
  hidden on mobile — the footer Totals card now carries the same
  numbers. Globally, table footer rows now also stack as a card on
  mobile (previously they overflowed horizontally) — affects every
  module with a `<tfoot>` Totals row.

---

## v1.0.29 — 2026-05-05

**Asset amendments edit + role-gated delete; email audit + timeline; mobile tabs**

- **Asset amendments — edit + role-gated delete.** Every amendment row
  now has an Edit button (visible to all roles); the form opens
  pre-populated and submits as an UPDATE. Files added during edit are
  appended to the amendment. The Delete button (and per-attachment
  `×` chip) only renders for the `admin` role. The DELETE endpoint is
  now gated with `requireAdmin`, so brokers and admin_only get 403 if
  they hit it directly.
- **Mobile tab bar fix.** The `@media (max-width: 767px)` rule was
  targeting `.tab-header` (no `s`) but every detail page uses
  `.tabs-header`, so on mobile tabs were stacking vertically. Mobile
  tab bars now scroll horizontally with momentum on touch (no
  scrollbar) and tab buttons get a 36 px touch-friendly hit area.
  Affects every module (assets, policies, contacts, accounts, claims,
  engagements, ROAs, complaints, reviews, etc.).
- **Email audit + timeline integration.** Every email sent through the
  shared `lib/mailer.js` helper now writes an audit_log row on success.
  Always writes a generic `module: 'emails'` entry (global audit-log
  visibility); when the caller passes `audit: { module, recordId }`,
  it also writes a record-specific row so the email appears on that
  record's Timeline tab. Wired through:
  - POPIA breach notifications → recipient's contact/account timeline.
  - Complaint SLA scanner (Day 3 / 21 / 30) → complaint timeline.
  - New-complaint handler notification → complaint timeline.
  - Complaint test send → complaint timeline.
  - ROA acknowledgement reminders → ROA timeline.
  - Broker-fitness alerts → broker profile timeline.
  - Weekly broker-fitness digest → global audit log only.
  ROA send and Confirmation of Cover already audited correctly and
  needed no change.

---

## v1.0.28 — 2026-05-05

**Engagement timeline fix + tab order**

- The Timeline tab on a Client Engagement was empty even though changes
  were being audit-logged. The audit_log stores engagement entries under
  `client_engagements`, but the frontend was querying with `engagements`,
  so the strict module match returned no rows. The frontend now queries
  the correct canonical name and existing history appears immediately.
- Tab order on the engagement detail is now **Documents, Timeline**, with
  Documents as the default-active tab.

---

## v1.0.27 — 2026-05-05

**Email signatures linked on the user profile**

- Each user now has a **Signature** field on their profile (Admin → Users
  → Edit). The dropdown lists every image file in `/signatures/` and shows
  a live thumbnail of the selected one. New schema column
  `users.signature_filename` is added by migration `0003`, which auto-
  applies on boot.
- The email-signature helper now looks up the per-user value first,
  falling back to the legacy admin SMTP "From-list" mapping, then to a
  text-block ("Kind regards, …") fallback. Every outgoing email signed
  by a user (ROA send, admin send-email, POPIA breach notifications,
  complaint notifications) picks up the signature without any extra
  admin configuration.
- Validation rejects signature filenames that aren't a real file in
  `/signatures/` so a typo or path-traversal attempt fails closed.

---

## v1.0.26 — 2026-05-05

**Asset amendments tab + per-user email signatures across all modules**

- **Assets → Amendments tab.** New tab on the asset detail (now the default
  tab; tab order is Amendments, Claims, Documents, Workflows, Versions,
  Timeline). Capture multiple notes per asset with date, optional type,
  free-text details, and any number of attached files (pdf / jpg / png /
  docx / xlsx / csv, 20 MB max each). Files can be added or deleted on a
  saved amendment, and deleting an amendment cleans up its files from disk.
  Broker isolation is enforced via the linked policy. New tables
  `asset_amendments` and a new `documents.asset_amendment_id` FK come
  in via migrations `0001` and `0002` (auto-applied on boot).
- **User signatures on every outgoing email.** Introduced a single
  signature helper (`server/lib/email-signature.js`). When a user sends
  mail, their signature is now appended automatically — the image-based
  signature mapped in *Admin → Settings → SMTP From-list* if available,
  or a `Kind regards, <Full Name>` text-block fallback so a signature
  appears even without per-user image config. The shared `lib/mailer.js`
  helper now accepts `userId`, applies the signature, overrides the From
  header, adds the inline image attachment, and auto-CCs the sender.
  Wired through the ROA send (advice-records), the admin send-email panel
  (settings), POPIA breach notifications, and the new-complaint /
  test-complaint sends. Background system messages (weekly broker-fitness
  digest, broker-fitness alerts, ROA acknowledgement reminders, complaint
  SLA scanner) are intentionally left unsigned — they are system-generated,
  not "from a user".

---

## v1.0.25 — 2026-05-03

**User Manual layout fixes (re-published PDF)**

- Tab-content screenshots throughout the manual are now tight-clipped
  to the actual rendered content, removing the trailing grey strip
  that used to extend a screenshot to the bottom of its PDF page
  (most visible on the contact-detail Timeline tab and the policy
  Commission / Versions / Quotes tabs).
- Tall ruleTable rows and tall callouts are now `cantSplit` so they
  migrate whole to the next page instead of bleeding shaded space at
  the bottom of the previous one.
- Replaced the broken "Policy Sections list" figure (it was a 404
  capture — that route doesn't exist) with corrected text explaining
  that Policy Sections live inside the Sections tab on a policy /
  contact / account.
- `client/public/Inexpro_CRM_User_Manual.pdf` refreshed so the v1.0.24
  in-app notification continues to point at the corrected PDF.

---

## v1.0.24 — 2026-05-03

**User Manual v3.0 published + in-app notification for every user**

- Inexpro CRM User Manual rebuilt at version 3.0 (PDF + DOCX). Bigger
  scope than the v1.0 manual — adds a 14-step quick-start guide, full
  per-module breakdown of every detail-view tab, the edit-lock and
  admin-OTP flow, full coverage of the new Sections breakdown and
  per-row "In total" tickboxes on Vehicle Extras + Additional Covers,
  the customizable column engine, dark mode, 2FA, and the in-app
  System Update flow. New navy + gold branding throughout — header
  band, gold underline, Inexpro logo on the cover, FSP licence info
  in the footer.
- PDF served as a static asset at `/Inexpro_CRM_User_Manual.pdf`
  (`client/public/Inexpro_CRM_User_Manual.pdf`).
- New seeded notification — every active user gets a one-time
  "New User Manual available" entry in their bell-icon inbox the
  first time the v1.0.24 server boots. Idempotent (`dedup_key =
  seed:manual_v3`); re-running the server doesn't dupe.
- Notification renderer: external / static-asset links (anything
  that isn't a `#/` hash route) now open in a new tab so the SPA
  isn't navigated away from when clicking Open on the manual entry.

---

## v1.0.23 — 2026-05-03

**Per-row "In total" tickbox on Additional Covers + R-prefix layout fix**

- Additional Cover grid now mirrors Vehicle Extras: each row has its
  own **In total** tickbox. The premium of every cover always counts
  toward the asset's Premium; only the cover amount is gated.
- The Cover Amount and Premium inputs no longer break onto two lines —
  the `R` currency prefix now reliably sits inline next to the input
  (we forced `display:flex; align-items:center;` on the prefix
  wrapper so grid cells can't push the prefix above).
- `additional_covers[]` JSON gains a per-row `include_in_total` flag.
  Older rows missing the flag default to "included" (the pre-tickbox
  behaviour), so existing assets keep the same Asset Value totals.
- Asset detail Additional Cover table grew the same `In Total` ✓ / ✗
  column with a dimmed "excluded" row state and an "of which
  included / excluded" footer when the split is non-trivial.
- Insurance Financials breakdown, Sections tab summary + breakdown
  table, "Assets in this Section" totals card and the policy-detail
  premium-breakdown panel all now show *Additional Covers (in total)*
  vs *Additional Covers (excluded)* as separate lines/columns.

---

## v1.0.22 — 2026-05-03

**Per-row "In total" tickbox on Vehicle Extras**

- Vehicle Extras grid: replaced the single global "Extras included
  in total asset value" checkbox with a per-row **In total** tickbox.
  Each extra can now individually choose whether its amount counts
  toward the asset's Sum Insured / Asset Value. The premium of every
  extra still always counts toward Total Premium.
- Form's auto-calculated Asset Value now sums only the extras whose
  per-row tickbox is on. Per-row totals footer shows the *included*
  amount and total premium separately.
- Asset detail page: Vehicle Extras table grew an "In Total" column
  (✓ / ✗ per row), and excluded rows are dimmed. Footer adds
  "of which included / excluded" lines when the split is non-trivial.
- Insurance Financials breakdown now shows two distinct rows —
  *Vehicle Extras (in total)* and *Vehicle Extras (excluded)* — so
  you can see the full picture without losing the totals.
- Sections tab breakdown table replaces the single "Extras Amt"
  column with separate "Extras (in)" and "Extras (excl)" columns.
  "Assets in this Section" totals card and the policy-detail
  breakdown panel show the same split.
- Backwards-compatible: assets saved before this version (no per-row
  flag, only the legacy `asset.extras_in_total` boolean) inherit
  that boolean as the include flag for every extra. Re-saving an
  asset persists per-row flags going forward, and the legacy
  `extras_in_total` column is now derived from "any row included".

---

## v1.0.21 — 2026-05-03

**Sum-Insured / Premium breakdown toggles + section-assets customisable columns**

- Policy → Sections tab → opening a section now uses the same
  customizable column engine as the Assets tab (⚙ Columns + sort).
- "Assets in this Section" gets a search box (name, registration,
  make, model, VIN, serial, contact, account, year). Filter is
  client-side and debounced.
- New `Assets.calcAssetBreakdown` / `calcAggregateBreakdown` helpers
  are now the single source of truth for how Asset Value and Premium
  are composed from the underlying parts. Asset Value =
  `sum_insured` + Σ `additional_covers[].cover_amount`
  + (`extras_in_total` ? Σ `vehicle_extras[].amount` : 0). Premium =
  `sum_insured_premium` + `sasria` + Σ extras / additional-covers /
  excesses premiums (matches the server's
  `computePolicyTotalPremium`).
- Asset form: the existing **Extras included in total asset value**
  checkbox is now wired into the auto-calculator. Untick it and the
  asset's Asset Value drops the vehicle-extras amount.
- New "Show breakdown" toggle in four places, each remembers its
  state in `localStorage`:
  - **Asset detail → Insurance Financials** card.
  - **Policy detail → Financial & Dates** card (lazy-loads the
    aggregate across all linked active assets).
  - **Policy → Sections tab** (switches between the 6-column summary
    and a 13-column per-component breakdown).
  - **Policy → Sections tab → "Assets in this Section"** (totals
    card switches between combined and per-part breakdown).

---

## v1.0.20 — 2026-05-02

**Dark mode polish — round 5 (modal close buttons + 2FA modal)**

- Every modal close ✕ button across the app now uses the same
  `.modal-close` style (matching the Edit Dashboard / Columns
  picker close button). Previously some modals had inline-styled
  buttons with hard-coded `color:#666` that washed out in dark mode.
- Two-Factor Authentication setup modal had a hard-coded white
  background, light grey divider and grey body text. All replaced
  with theme vars so the QR code panel and the rest of the modal
  match dark mode.
- `.btn-close` (used by the legacy Edit User / mail / amendment
  modals) is now styled identically to `.modal-close`, so visual
  treatment is consistent regardless of which class a modal uses.
- 2FA "Manual secret" code block also re-themed — was a near-white
  pill in dark mode, now uses the dark `--bg-alt` surface with a
  themed border.

---

## v1.0.19 — 2026-05-02

**Dark mode polish — round 4**

- "Log new data subject request" modal had the same hard-coded white
  frame and dotted-grey dividers as the data-breach modal in the
  previous round. All replaced with theme-aware vars.
- Inner per-right blocks (Right to Access / Correction / Erasure /
  Object / Withdraw) and their helper text now read on dark.
- Alert boxes (`.alert-info`, `.alert-warning`, `.alert-danger`,
  `.alert-success`) get translucent backgrounds with light-tinted
  text on dark mode, so the POPIA s5 reminder and similar in-modal
  notes are legible.

---

## v1.0.18 — 2026-05-02

**Dark mode polish — round 3**

- Modal footers (Edit User, etc.) no longer render as a glaring white
  strip below the body — they now use a subtle dark-tinted surface
  via the new `--bg-alt` variable.
- "Log new data breach" modal had hard-coded white background, light
  borders and grey text. All replaced with theme-aware vars so the
  popup matches the rest of dark mode.
- "Categories of advice authorised" checkbox card on the broker
  profile form had a hard-coded white container that hid the labels.
  Now uses `var(--card-bg)`.
- Asset Value / Premium auto-calculated readonly inputs no longer
  show a near-white background when in dark mode — they pick up the
  `--bg-alt` dark surface and a muted text colour.

---

## v1.0.17 — 2026-05-02

**Dark mode polish — admin password modals**

- The two admin-password / authorisation prompts (the encrypted-field
  reveal modal and the locked-record edit-unlock modal) had a
  hard-coded white background and grey body text. Both now read
  their colours from the active theme — dark surface, light text,
  themed border — so they no longer flash white in dark mode.

---

## v1.0.16 — 2026-05-02

**Dark mode polish**

- Table row separators no longer render as glaring near-white lines
  in dark mode — they now use the same dark-grey border colour as
  the rest of the dark UI.
- View / ⚙ Columns / Clear / Cancel and other secondary buttons are
  now readable in dark mode (dark fill with light text instead of
  white-on-near-white).
- Outline buttons (pagination ← Prev etc.) get a matching dark-mode
  treatment.
- Dashboard charts (bar, doughnut, line) read tick/legend/grid
  colours from the active theme — labels are no longer mid-grey on
  near-black, and grid lines tone down to a faint white tint.
- The "Customise dashboard" / "⚙ Columns" modal panels are no
  longer flashing white inside the dark modal — the column-picker
  and visible-list panels now use a dark surface tint.

---

## v1.0.15 — 2026-05-02

**Dashboard switcher: buttons on desktop, dropdown on mobile**

- The Main / TCF dashboard switcher is now the original button pair
  on full-size browser windows, and only collapses to the dropdown
  on mobile (≤767px). v1.0.13 had reduced both to a dropdown
  unconditionally.

---

## v1.0.14 — 2026-05-02

**Release Notes Browser fix**

- Picking a release in the browser no longer fails with `git log:
  v1.0.X~50..v1.0.X: unknown revision` when the tag has fewer than
  50 ancestor commits behind it. The fallback now walks back from the
  tag with `--max-count` instead of using a fixed `~50..` range.

---

## v1.0.13 — 2026-05-02

**Mobile responsiveness pass**

- Admin module no longer cramps the content pane on a phone: the
  Settings sub-sidebar now scrolls horizontally above the content
  instead of stealing 230px of width, and the top tab bar (Audit /
  Settings / Broker Profiles / Products / Data Breach) wraps into a
  horizontal scroll strip rather than spilling onto multiple lines.
- Dashboard switcher (Main / TCF) is now a dropdown instead of a row
  of buttons, so it stops overlapping the header title on small
  screens. Works the same way on desktop, just compacter.
- ROA detail/form action buttons (Save / Mark Complete / Cancel)
  stack vertically on mobile and each take the full width — no more
  buttons getting cut off the edge of the screen.
- Repeating row grids (alternatives, vehicle extras, excesses,
  additional covers) collapse to a single column on mobile.
- "← Back" links across Compliance, Workflows and Schedule are now
  hidden on mobile (the device's hardware/gesture back covers it).
  In-page wizard step-back buttons (Reports wizard) stay visible.
- All inline `max-width` on detail-section cards is now overridden on
  mobile so cards fill the viewport.

---

## v1.0.12 — 2026-05-02

**Release Notes Browser**

- Admin → Settings → System Update has a new **Release Notes Browser**
  card. Pick any past version from the dropdown to see its notes —
  not just the latest one. Defaults to the version you're currently
  running.
- Server-side: new `GET /api/admin/system/release-tags` and
  `GET /api/admin/system/release-notes?tag=vX.Y.Z` endpoints, both
  admin-only.

---

## v1.0.11 — 2026-05-02

**System Notifications panel**

- Admin → Settings → Notifications now also shows a **System
  Notifications** card under the Notification History card. It lists
  every automated alert the CRM has sent — broker fitness, ROA
  acknowledgement reminders, commission-gap warnings, seeded onboarding
  notes, etc. — newest first, grouped by send-second so a single
  scheduler pass appears as one row.
- Click any system notification to open the same detail modal used for
  broadcasts; the modal now also shows the category (e.g. "Broker
  Fitness", "ROA Reminder").

---

## v1.0.10 — 2026-05-02

**Release notes, predefined reports layout, notification history**

- The System Update panel now pulls release notes from this file
  (`RELEASES.md`). Earlier versions only showed the bare annotated tag
  message ("v1.0.7"), which was unhelpful when you wanted to know what
  actually changed.
- The updater still falls back to the tag's annotated message if a
  version has no `RELEASES.md` section.
- Predefined reports are now laid out as a 2-column grid of clickable
  cards. The redundant ▶ Run button has been removed — clicking a card
  already opens the report's parameter modal.
- Admin → Settings → Notifications now shows a **Notification History**
  panel next to the Send Notification box (admin-only). Past
  broadcasts are listed newest-first; clicking one opens a modal with
  the full subject, body, severity, link and recipient list. The list
  refreshes automatically after every send.

---

## v1.0.9 — 2026-05-02

**Standardised row action buttons**

- View / Edit / Delete buttons in **Contacts**, **Accounts** and
  **Assets** list rows now match the size used in **Policies** and
  **Claims** (`btn-sm` instead of `btn-xs`, with consistent
  secondary / primary / danger colours).

---

## v1.0.8 — 2026-05-01

**Product Library — header search & filters**

- Admin → Product Library now has a centred header strip with a search
  box, an Insurer dropdown (auto-populated from existing products) and
  a Category dropdown — mirroring the Contacts module's filters.
- Server `GET /api/products` accepts an `insurer` query parameter; the
  `/options` endpoint returns the distinct insurer list.

---

## v1.0.7 — 2026-05-01

**Company Details visible to all roles**

- Bug fix: the Company Details section under Admin → Settings was
  nested inside an admin-only template branch, so non-admin users got a
  sidebar entry pointing at an empty pane. The section now renders for
  every role; edit / upload / delete controls remain admin-only.

---

## v1.0.6 — 2026-05-01

**Broker Profiles + editable CPD activities**

- Renamed the "Broker Fitness" admin tab to **Broker Profiles** (page
  title and breadcrumb match).
- Each CPD activity row in a broker's profile now has an Edit button
  alongside Delete. The CPD modal pre-fills all fields and lets you
  upload a replacement certificate or keep the existing one.

---

## v1.0.5 — 2026-05-01

**ROA reminders, asset rules, company access, maps link, ID drop**

- ROA acknowledgement reminders fire to the assigned broker at 3, 7,
  14 and 30 days after issue (email + in-app notification), and stop
  once the client acknowledges.
- Assets now require a Policy Section before save (server + client
  validation).
- Company Details and uploaded documents are viewable by all
  authenticated users; admin role is still required to edit / upload /
  delete.
- The asset Building/Risk Address card gets the same "Open in Google
  Maps" + GPS link buttons used on contacts and accounts.
- Removed the client SA ID number from the generated ROA PDF and HTML
  preview output.

---

## v1.0.4 — 2026-05-01

**Updater hardening**

- Auto-reset tracked-file drift before fetching new releases; switched
  the install step to `npm ci --omit=dev` so `package-lock.json` no
  longer flips the working tree to "dirty".
- Clear stale `.update-lock` at server boot.
- Ignore mode-only diffs when checking for working-tree changes
  (Docker overlayfs noise).
- Per-snapshot rollback (one-click revert to the most recent
  pre-update DB snapshot).

---

## v1.0.3 — 2026-05-01

**Admin convenience polish**

- Release-notes panel scaffolding inside System Update.
- Sticky sub-sidebar on the Admin → Settings page so the active pane
  stays scrollable while the nav stays in view.
- Manual Backup & Restore card under Settings → Backup.

---

## v1.0.2 and earlier

Initial public + Docker hardening. See `git log` for details.
