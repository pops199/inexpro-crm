# Inexpro CRM

COFI-Aligned Insurance Brokerage CRM — Node.js + Express + SQLite + Vanilla JS SPA.

## Quick Start

```bash
cd inexpro-crm
npm install
npm run seed      # creates default admin user
npm start         # starts server on http://localhost:3000
```

Default login: **admin / admin123** — change this immediately after first login.

## Setup

### 1. Environment variables

Copy `.env.example` to `.env` and update the values:

```env
PORT=3000
SESSION_SECRET=replace-with-a-long-random-string
DB_PATH=./server/db/inexpro.db
UPLOAD_PATH=./uploads
REPORTS_PATH=./reports
ANTHROPIC_API_KEY=your-api-key   # Required for AI-assisted report builder
NODE_ENV=production
```

### 2. Install and seed

```bash
npm install
npm run seed
npm start
```

### 3. First admin account

The seed creates `admin / admin123`. Log in, go to **Admin → User Management**, and:
- Change the admin password
- Create broker accounts for your team
- Set roles: `admin` (full access), `broker` (own records), `admin_only` (data entry, no deletion)

## Development mode (auto-restart)

```bash
npm run dev
```

## Claude Code — how to start the server

When running from Claude Code (bash shell), `node` is not in the default PATH.
Use the Node.js bundled with Visual Studio, and **always run from the project root**:

```bash
cd "C:\Users\Johan Odendaal\Documents\Personal\Claude\Inexpro\inexpro-crm"
"/c/Program Files/Microsoft Visual Studio/2022/Community/MSBuild/Microsoft/VisualStudio/NodeJs/node.exe" server/app.js
```

Run in background with the Bash tool (`run_in_background: true`), then check output after ~3 seconds.
The entry point is `server/app.js` (not `server.js`).
The DB path (`./server/db/inexpro.db`) is resolved relative to the working directory, so the
server **must** be started from the project root, not from inside `server/`.

## Running tests

```bash
npm run test:seed
```

This runs `test_seed.js` (inserts 3 realistic test clients) followed by `validate.js` (checks every table, foreign key, picklist, and the gap logic rule). All checks must pass.

## Project structure

```
inexpro-crm/
├── server/
│   ├── app.js                  # Express entry point
│   ├── routes/                 # One file per module
│   ├── middleware/             # auth.js, audit.js, error.js
│   └── db/
│       ├── schema.sql          # All 15 tables
│       ├── database.js         # better-sqlite3 connection
│       ├── seed.js             # Default admin setup
│       ├── test_seed.js        # 3 test subjects
│       └── validate.js         # Full validation suite
├── client/
│   ├── public/index.html       # SPA shell
│   └── src/
│       ├── main.js             # App bootstrap
│       ├── router.js           # Hash-based router
│       ├── api.js              # All API calls
│       ├── utils.js            # Shared utilities
│       ├── styles/main.css     # Full UI stylesheet
│       └── components/         # One JS file per module
├── uploads/                    # File attachments (local disk)
├── reports/                    # Generated report files
├── .env                        # Secrets (never commit this)
└── package.json
```

## Modules

| Module | Phase | Description |
|--------|-------|-------------|
| Contacts | 1 | Individual clients and contact persons |
| Accounts | 1 | Business entities, trusts, organisations |
| Client Engagements | 1 | Advice and onboarding pipeline |
| Policies | 1 | Insurance contracts |
| Policy Sections | 1 | Cover layer with gap analysis |
| Assets | 1 | Insured physical items |
| Risk Details | 1 | Underwriting and exposure data |
| Claims | 1 | Claim event tracking |
| Reports | 1 | Predefined + custom builder + AI |
| Admin | 1 | Users and audit log |
| Advice Records | 2 | ROA and advice justification (scaffolded) |
| Complaints | 2 | Conduct and complaints register (scaffolded) |
| Reviews | 2 | Post-sale review evidence (scaffolded) |

## Key business rules

- **Gap logic**: `policy_sections.gap_identified` is automatically set to `1` when `risk_exists=1` AND `recommended_for_cover=1` AND `implemented=0`. Enforced server-side on every save.
- **Stage progression**: Client Engagements cannot advance past "Advice Presented" unless `disclosure_completed=1` and `client_decision='Accepted'`.
- **Delay flag**: Claims in "In Progress" or "Awaiting Documents" with no client update in 7+ days are auto-flagged.
- **Compliance fields**: POPIA and FICA fields are visually distinct in the UI (yellow bordered).

## Database migrations

The schema is designed for forward migration. To add columns to `policy_sections` (as expected in the spec):

```sql
ALTER TABLE policy_sections ADD COLUMN new_field TEXT;
```

Run this against the live `.db` file. No rebuild required.

## Roles

| Role | Can create | Can edit | Can delete | Admin panel |
|------|-----------|----------|------------|-------------|
| admin | ✅ | ✅ | ✅ | ✅ |
| broker | ✅ | ✅ | ✅ | ❌ |
| admin_only | ✅ | ✅ | ❌ | ❌ |

## AI-assisted report builder

Set `ANTHROPIC_API_KEY` in `.env`. In the Reports tab, type a plain-English description of the report you want and click **Ask AI**. The system will pre-fill the Custom Report Builder. You can review and adjust before running — no raw SQL is ever shown.

## File uploads

Supported: PDF, JPG, PNG, DOCX. Files are stored at `uploads/<module>/<record_id>/`. Metadata is in the `documents` table. The database stores the file path, not the binary.

## Compliance notes

- **POPIA**: `popia_consent_obtained` and `popia_consent_date` are marked as required on all contact forms.
- **FICA**: `fica_status` is required on both contacts and accounts.
- **COFI**: All advice, gaps, conduct flags, and client decisions are logged. Every change is recorded in `audit_log`.
- **Audit log**: Every CREATE, UPDATE, DELETE, LOGIN, LOGOUT, and EXPORT is logged with old/new values.
