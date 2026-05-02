# Inexpro CRM — Release Notes

Per-version notes shown in **Admin → Settings → System Update**. Every
version bump appends a new `## vX.Y.Z` section here. The newest version
sits at the top.

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
