# Inexpro CRM — Release Notes

Per-version notes shown in **Admin → Settings → System Update**. Every
version bump appends a new `## vX.Y.Z` section here. The newest version
sits at the top.

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
