# Inexpro CRM — Release Notes

Per-version notes shown in **Admin → Settings → System Update**. Every
version bump appends a new `## vX.Y.Z` section here. The newest version
sits at the top.

---

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
