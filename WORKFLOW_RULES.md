# Inexpro CRM — Workflow Rules & Gates

This document maps every workflow rule, lifecycle gate, and prerequisite enforced in the Inexpro CRM codebase. It is the source of truth for the end-user training manual.

> Conventions: every rule cites `path/to/file.js:line` so it can be re-verified against the live code.

---

## 1. Lifecycle stages by entity

### 1.1 Contact (individual client)
**Schema:** `server/db/schema.sql:22-67`

`contact_status` values: `Prospect`, `Active Client`, `Inactive Client`, `Former Client`, `Do Not Service`, `Deceased`.

`fica_status` values: `Not Started`, `Pending Documents`, `In Review`, `Verified`, `Expired`, `Exempt`.

**Prospect → Active Client gate:**
- `fica_status` must be `Verified` (`server/routes/contacts.js:315`).
- `popia_consent_obtained` must be 1 (`server/routes/policies.js:79-81` for downstream; checked on contact update too).
- `data_processing_basis` (POPIA lawful basis) must be recorded and non-empty (`server/routes/contacts.js:184-190`, `server/routes/contacts.js:314-319`).
- Failure → 400/422 with message: *"POPIA: a Data Processing Basis must be recorded before this contact can be set to Active Client."*

### 1.2 Account (business client)
**Schema:** `server/db/schema.sql:73-108`

`client_status` values: `Prospect`, `Active Client`, `Inactive Client`, `Former Client`, `Do Not Service`.

**Prospect → Active gate:** `fica_status` must be `Verified`. Accounts do not require POPIA consent (POPIA applies only to natural persons).

### 1.3 Client Engagement (advisory pipeline)
**Schema:** `server/db/schema.sql:116-172`

`stage` values, in order:
1. Prospect
2. Initial Contact
3. Appointment Scheduled
4. Fact Find Completed
5. Needs Analysis Completed
6. Quote / Proposal Prepared
7. Advice Presented
8. Client Decision Pending
9. Accepted - Implementation
10. Implemented / Active
11. Lost / Declined
12. On Hold

Stage order array: `server/routes/engagements.js:44-57`.

**Pre-sale disclosure status (computed):** `Complete` only when ALL of:
- `fsp_licence_disclosed` ∈ {`Yes — Written`, `Yes — Verbal`}
- `broker_identity_disclosed` = 1
- `product_costs_disclosed` = 1 AND `product_costs_disclosed_notes` populated
- `material_risks_disclosed` = 1 AND `material_risks_disclosed_notes` populated
- `complaints_process_disclosed` ∈ {`Yes — Written`, `Yes — Verbal`, `Complaints form provided`}
- `disclosure_method` is set
(`server/routes/engagements.js:23-41`)

**Creation requirements:** `engagement_name`, `assigned_broker_id`, `engagement_type`, plus at least one of `contact_id` or `account_id` (`server/routes/engagements.js:206-226`).

### 1.4 Policy
**Schema:** `server/db/schema.sql:177-213`

`policy_status` values: `Pending`, `Active`, `Amended`, `Cancelled`, `Lapsed`, `Expired`. Default on create: `Pending`.

**Creation gates** (`server/routes/policies.js:68-94`):
- Linked Contact must have `fica_status = 'Verified'` AND `popia_consent_obtained = 1`.
- Linked Account must have `fica_status = 'Verified'`.

**Pending → Active gate** (`server/routes/policies.js:610-620`):
- Must have at least one approved quote on file.
- Cannot be created directly in `Active`. Error 422: *"A policy cannot be created in Active status. Save it first (e.g. as Pending), upload at least one quote and approve it, then change the status to Active."*

**Cancellation cascade** (`server/routes/policies.js:122-218`): cancelling a policy snapshots all linked assets to `policy_asset_history`, zeroes monetary fields, sets `asset_status='Inactive'`, and unlinks them.

### 1.5 Policy Sections (cover layer / gap analysis)
**Schema:** `server/db/schema.sql:218-287`

`needs_analysis_status`: `Not Assessed`, `Assessed`, `Recommendation Made`, `Accepted`, `Declined`, `Implemented`, `Not Applicable`.

**Gap rule:** `gap_identified = 1` automatically when `risk_exists = 1` AND `recommended_for_cover = 1` AND `implemented = 0` (enforced server-side on save).

### 1.6 Advice Records (RoA)
**Schema:** `server/db/schema.sql:397-443`

`advice_type`: `New Business`, `Amendment`, `Cancellation`, `Review`, `Claims-Driven Advice`.
`trigger_event`: `Client Engagement`, `Policy Amendment`, `Cancellation`, `Review`, `Claim`, `Enquiry`.
`client_decision`: `Accepted`, `Declined`, `Deferred`, `Pending`.

**Mark-as-complete gates** (`server/routes/advice-records.js:318-420`):
- Mandatory: `broker_id`, `prepared_by_id`, `advice_date`, `advice_type`, `client_needs_identified`, `risk_analysis_summary`, `recommendation_given`, `reason_product_suitable`.
- `conflict_of_interest_declared` must be `Yes` or `No` (not blank).
- If COI = `Yes`: `conflict_of_interest_description` required.
- If `client_decision = 'Declined'`: `client_rejection_reason` required.
- `acknowledgement_date` (if set) must be ≥ `advice_date`.
- Target market evaluation against Product Library (`server/routes/advice-records.js:104-109`):
  - Status `Mismatch` → `supervisor_co_approved_by_id` required.
  - Status `Review Required` → `suitability_override_reason` required.

### 1.7 Claims
**Schema:** `server/db/schema.sql:357-392`

`claim_status`: `Notified`, `In Progress`, `Awaiting Documents`, `Settled`, `Rejected`, `Closed`, `Disputed`. Default: `Notified`.

**Creation requirements** (`server/routes/claims.js:178-246`): `claim_number` (unique), `policy_id`, `claim_date`, `date_reported`, `claim_type` (one of `Motor`, `Property`, `Liability`, `GIT`, `Theft`, `Fire`, `Other`), `incident_description`, `claim_status`.

**Additional creation gates** (`server/routes/claims.js:267-300`):
- Linked policy must be `Active` (not `Pending`/`Cancelled`/`Lapsed`/`Expired`).
- Linked policy must not have a cancellation date on record.
- An `asset_id` must be selected and the asset must be `Active`.

**Repudiation:** when claim involves repudiation, both `repudiation_reason` and `broker_dispute_action` must be recorded (`server/routes/claims.js:249-250`).

**Auto delay flag:** Claims in `In Progress`/`Awaiting Documents` with no client update for 7+ days are auto-flagged.

### 1.8 Complaints
**Schema:** `server/db/schema.sql:448-487`

`complaint_status`: `Open`, `In Progress`, `Awaiting Response`, `Resolved`, `Closed`, `Escalated`.
`severity_rating`: `Low`, `Medium`, `High`, `Critical`.
`resolution_outcome`: `Upheld — full remedy`, `Upheld — partial remedy`, `Not upheld`, `Withdrawn by client`, `Referred to Ombudsman`.

**Resolution gate** (`server/routes/complaints.js:421-426`): cannot transition to `Resolved` or `Closed` without either `root_cause_identified` OR `root_cause_category` populated. Error 400.

**Deletion blocked** (`server/routes/complaints.js:541-547`): complaints can never be deleted. Use `POST /:id/withdraw` to mark withdrawn. Error 405.

**Auto-escalation** (`server/routes/complaints.js:43-112`, runs on startup + every 6h):
- Day 3+: no acknowledgment → set `alert_day3_sent`, email handler+supervisor.
- Day 21+: unresolved → set `alert_day21_sent`, email supervisors.
- Day 30+: unresolved → severity escalates to `Critical`, `senior_management_notified` set, email senior management.

**Auto-numbering:** `COMP-YYYYMMDD-XXXX` (`server/routes/complaints.js:130-148`).

### 1.9 Reviews
**Schema:** `server/db/schema.sql:492-522`

`review_type`: `Annual Review`, `Mid-Year Review`, `Renewal Review`, `Claims Review`, `Ad Hoc Review`, `Complaint Review`.
`review_outcome`: `No Changes Required`, `Changes Recommended`, `Urgent Action Required`, `Policy Cancelled`, `Follow-Up Required`.

If `advice_record_required = 1`, link to a new RoA via `linked_advice_record_id`.

### 1.10 Assets
**Schema:** `server/db/schema.sql:292-315`

`asset_status`: `Active`, `Inactive` (default `Active`).

Building/structure assets require physical address (street + city/suburb) — `server/routes/assets.js:247,261-264,336`.

A `product_id` from the Product Library is **mandatory** when creating an asset, and the product must be `Active` (`server/routes/assets.js:209-213`). Error 422: *"A product must be selected from the Product Library before an asset can be saved."*

### 1.11 Risk Details
**Schema:** `server/db/schema.sql:320-352`

`risk_type`: `Motor Risk`, `Building Risk`, `Contents Risk`, `GIT Risk`, `Liability Risk`, `Electronic Equipment Risk`, `Specialist Risk`. Required: `risk_detail_name`, `risk_type`.

---

## 2. Gate summary table

| Entity | Gate | Prerequisite | Code |
|---|---|---|---|
| Contact | Prospect → Active | `fica_status='Verified'` | `contacts.js:315` |
| Contact | Prospect → Active | POPIA consent + lawful basis | `contacts.js:184-190,314-319` |
| Account | Prospect → Active | `fica_status='Verified'` | fica route |
| Policy | Create | Contact: FICA verified + POPIA consent | `policies.js:68-94` |
| Policy | Create | Account: FICA verified | `policies.js:88-90` |
| Policy | Create | Cannot be created in `Active` | `policies.js:477-479` |
| Policy | Pending → Active | ≥1 approved quote | `policies.js:610-620` |
| Engagement | Create | Required fields + contact OR account | `engagements.js:206-226` |
| RoA | Mark complete | All explanation flags + COI declared | `advice-records.js:318-420` |
| RoA | Mark complete | Supervisor co-approval if target market mismatch | `advice-records.js:408-413` |
| RoA | Mark complete | Override reason if review-required | `advice-records.js:414-421` |
| Claim | Create | All required fields | `claims.js:234-246` |
| Complaint | Resolve / Close | `root_cause_identified` set | `complaints.js:421-426` |
| Complaint | Delete | Blocked (use Withdraw) | `complaints.js:541-547` |
| Asset | Create | Active product from Product Library | `assets.js:209-213` |
| Asset (building) | Create | Physical address | `assets.js:247,261-264` |
| Claim | Create | Linked policy must be `Active` (no cancel/lapse/expiry) | `claims.js:267-282` |
| Claim | Create | Linked asset must be selected and `Active` | `claims.js:286-300` |
| RoA | Create | Linked engagement's pre-sale disclosure must be `Complete` | `advice-records.js` (FAIS GCC §4) |
| Engagement | Pre-sale disclosure complete | `disclosure_method` ∈ `In-person meeting`, `Phone call`, `Video call`, `Email`, `WhatsApp`, `Signed form` | `engagements.js:28-30` |
| Any record | Delete by `admin_only` | Blocked | `auth.js:35-40` (`canDelete`) |

---

## 3. Roles & data isolation

**Roles** (`server/db/schema.sql:7-16`, `server/middleware/auth.js`):
- `admin` — full access, can delete.
- `broker` — own records only (data isolation), can delete own records.
- `admin_only` — view/edit all data, cannot delete.

**Middleware:** `requireAuth`, `requireAdmin`, `requireAdminAny`, `canDelete`, `getBrokerId(req)`.

**Isolation pattern:** broker user requests get their `userId` injected into list queries (`assigned_broker_id = ?` or `broker_id = ?`). Detail endpoints add an explicit ownership check, e.g.:
```js
if (scopedBrokerId && contact.assigned_broker_id !== scopedBrokerId)
  return res.status(403).json({ error: 'Access denied' });
```
(`server/routes/contacts.js:161-165`)

**Permissions matrix:**

| Feature | admin | broker | admin_only |
|---|---|---|---|
| View all clients | ✓ | own only | ✓ |
| Create client / policy / RoA | ✓ | ✓ | ✓ |
| Edit own records | ✓ | ✓ | ✓ |
| Edit other brokers' records | ✓ | ✗ | ✓ |
| Delete | ✓ | own only | ✗ |
| Manage users | ✓ | ✗ | ✗ |
| Audit log | ✓ | ✓ | ✓ |
| TCF dashboard / broker fitness / product library | ✓ | ✗ | ✓ |
| Supervisor co-approve RoA | ✓ | ✗ | ✓ |

---

## 4. End-to-end workflow chains

### 4.1 Onboarding: Prospect → Active Client → Policy
1. **Create contact (Prospect)** — `#/contacts/new`. Status defaults to `Prospect`.
2. **Verify FICA** — `#/fica/:id`. Set `fica_status='Verified'`, verification date, method, beneficial-owner confirmation, PEP check. Five-year expiry auto-calculated.
3. **Capture POPIA consent + lawful basis** — `#/popia/:id`. Pick `data_processing_basis` (Consent / Contractual necessity / Legal obligation / Legitimate interest / Vital interest). If Consent, also record consent date + method.
4. **Promote to Active Client** — edit contact, change `contact_status` to `Active Client`. Gates: FICA verified, POPIA basis recorded.
5. **Create client engagement** — `#/engagements/new`. Required: name, broker, type, contact OR account. Default stage `Prospect`.
6. **Progress engagement through stages** — capture pre-sale disclosure (FSP licence, broker identity, costs, material risks, complaints process, disclosure method) as you advance.
7. **Create RoA (draft)** — `#/advice-records/new`. Required: broker, prepared_by, advice date, advice type, client needs, risk analysis, recommendation, reason suitable, COI declaration.
8. **Mark RoA complete** — explanation flags all set; if target market mismatch, supervisor co-approves; if review required, override reason captured.
9. **Create policy** — `#/policies/new`. Saved as `Pending`. Linked contact/account must be FICA-verified (and POPIA-consented for individuals).
10. **Upload quote** — Quotes tab on policy detail. PDF/Word/Excel supported.
11. **Approve quote** — sets `approved_at`.
12. **Activate policy** — edit policy, change status to `Active`. Gate: ≥1 approved quote.

### 4.2 Complaints
1. **Log complaint** — `#/complaints/new`. Number auto-generated.
2. **Acknowledge** — set acknowledgement date and assigned handler. (Day 3 alert if missed.)
3. **Investigate** — populate root cause, root cause category, corrective action.
4. **Resolve** — change status to `Resolved`. Gate: `root_cause_identified` populated.
5. **Close** — populate resolution date, summary, outcome.
6. **(Alternative) Withdraw** — `POST /complaints/:id/withdraw`. Deletion is blocked.
7. **(System) Day-21 + Day-30 escalations** run automatically.

### 4.3 Claims
1. **Notify claim** — `#/claims/new`. Required: number, policy, dates, type, description, status. Default `Notified`.
2. **Update status** — `In Progress` → `Awaiting Documents` → `Settled` / `Rejected` / `Closed`. Keep `last_client_update_date` current to avoid the 7-day delay flag.
3. **Settle** — set settlement amount + date.
4. **Close** — record outcome notes.
5. **Repudiation** — if rejecting, record `repudiation_reason` + `broker_dispute_action`.

### 4.4 Annual review
1. **Create review** — `#/reviews/new` linked to contact/account/policy.
2. **Assess** — record changes in risk profile / assets / exposure, gaps, recommendations.
3. **Complete** — set `review_completed=1`.
4. **(If changes) Trigger RoA** — set `advice_record_required=1` and create the linked RoA per Section 4.1 step 7.

---

## 5. Audit trail

Every CREATE / UPDATE / DELETE / LOGIN / LOGOUT / EXPORT / EMAIL writes to `audit_log` (`server/db/schema.sql:553-563`, `server/middleware/audit.js`):
- `user_id`, `action`, `module`, `record_id`, `old_value`, `new_value`, `description`, `ip_address`, `timestamp`.

Routes call `res.locals.logAudit({...})` before responding.

---

## 6. Computed (not stored) statuses

These are calculated on read, not stored — always current:
- **Pre-sale disclosure status** (engagements) — derived from 6 disclosure fields.
- **FICA status** — derived from verification + 5-year expiry date.
- **POPIA status** — derived from basis + consent + retention expiry + open erasure requests.

---

## 7. Auto-generated numbers
- RoA: `AR-YYYYMMDD-XXXX` (`advice-records.js:162-180`).
- Complaint: `COMP-YYYYMMDD-XXXX` (`complaints.js:130-148`).

---

## 8. Critical "you cannot do X until Y" cheat sheet

| You want to… | You must first… |
|---|---|
| Set a contact to **Active Client** | Verify FICA + capture POPIA consent + lawful basis |
| Create a **policy** for an individual | Verify FICA + capture POPIA consent on the contact |
| Create a **policy** for a business | Verify FICA on the account |
| Set a policy to **Active** | Save as Pending, upload a quote, approve the quote |
| Create an **RoA** | Have a client engagement on the contact/account |
| Mark an RoA **complete** | Tick all explanation flags, declare COI; if target-market mismatch, get supervisor co-approval |
| Mark a complaint **Resolved/Closed** | Record root cause |
| **Delete** a complaint | (Not allowed — withdraw it instead) |
| **Delete** anything as `admin_only` | (Not allowed — needs `admin` or owner `broker`) |
| Issue an RoA from a **review** | Set `advice_record_required=1`, create linked RoA |
| Create an **asset** | Pick a product from the Product Library (Active status) |
| Log a **claim** | Have an Active policy + an Active asset linked to it |
| Create an **RoA** | Have an engagement with all pre-sale disclosure complete (FSP licence, broker identity, costs+notes, material risks+notes, complaints process, disclosure method) |
