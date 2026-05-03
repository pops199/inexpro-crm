# Inexpro CRM — Release Notes

Per-version notes shown in **Admin → Settings → System Update**. Every
version bump appends a new `## vX.Y.Z` section here. The newest version
sits at the top.

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
