/* ═══════════════════════════════════════════════════════════════════════════
   Dashboard — user-configurable widget system
   ═══════════════════════════════════════════════════════════════════════════
   This module exposes:
     GET  /api/dashboard/catalog   — all available widgets (chip/chart/table)
     GET  /api/dashboard/config    — current user's dashboard layout
     PUT  /api/dashboard/config    — save current user's dashboard layout
     POST /api/dashboard/config/reset  — reset user layout to company default
     GET  /api/dashboard/default   — current company default layout
     PUT  /api/dashboard/default   — set company default layout (admin only)
     POST /api/dashboard/data      — batch-fetch data for a list of widgets

   Widget categories:
     - metric : a single number (used as KPI chip or standalone card)
     - chart  : a grouped dataset rendered as bar/doughnut/line
     - table  : a small list of rows

   Broker scoping is applied per widget using req-bound brokerId from
   getBrokerId(). Admins see company-wide data.
   ═══════════════════════════════════════════════════════════════════════════ */

const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, requireAdmin, getBrokerId } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

/* ───────────────────── Widget registry ─────────────────────
   Each widget is an object:
     id           : stable identifier (used in user config JSON)
     label        : user-visible label
     category     : 'metric' | 'chart' | 'table'
     group        : grouping for the picker UI ("Clients","Policies",...)
     description  : short help text shown in the picker
     displayModes : array of allowed display modes
                     metric → ['chip']
                     chart  → subset of ['bar','doughnut','line']
                     table  → ['table']
     defaultMode  : default display mode
     color        : accent colour for chip (metric only)
     run(db,brokerId) → returns value (metric) | array (chart/table)
   ─────────────────────────────────────────────────────────── */

// broker-filter helper: returns an AND-prefixed fragment + param array
function bFilter(brokerId, col) {
  if (!brokerId) return { sql: '', params: [] };
  return { sql: ` AND ${col} = ?`, params: [brokerId] };
}
function bWhere(brokerId, col) {
  if (!brokerId) return { sql: '', params: [] };
  return { sql: ` WHERE ${col} = ?`, params: [brokerId] };
}

const WIDGETS = [
  /* ─────────── METRIC (CHIP) WIDGETS ─────────── */
  {
    id: 'active_contacts',
    label: 'Active Contacts',
    category: 'metric',
    group: 'Clients',
    description: 'Contacts with status Active Client',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#2980b9',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`SELECT COUNT(*) AS c FROM contacts WHERE contact_status = 'Active Client'${f.sql}`).get(...f.params).c;
    },
  },
  {
    id: 'prospect_contacts',
    label: 'Prospects',
    category: 'metric',
    group: 'Clients',
    description: 'Contacts with status Prospect',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#3498db',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`SELECT COUNT(*) AS c FROM contacts WHERE contact_status = 'Prospect'${f.sql}`).get(...f.params).c;
    },
  },
  {
    id: 'inactive_contacts',
    label: 'Inactive Contacts',
    category: 'metric',
    group: 'Clients',
    description: 'Contacts with status Inactive / Former',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#95a5a6',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`SELECT COUNT(*) AS c FROM contacts WHERE contact_status IN ('Inactive Client','Former Client')${f.sql}`).get(...f.params).c;
    },
  },
  {
    id: 'active_accounts',
    label: 'Active Accounts',
    category: 'metric',
    group: 'Clients',
    description: 'Business accounts with Active Client status',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#16a085',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`SELECT COUNT(*) AS c FROM accounts WHERE client_status = 'Active Client'${f.sql}`).get(...f.params).c;
    },
  },
  {
    id: 'popia_pending',
    label: 'POPIA Consent Pending',
    category: 'metric',
    group: 'Compliance',
    description: 'Contacts + accounts without recorded POPIA consent',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#e67e22',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      const c = db.prepare(`SELECT COUNT(*) AS c FROM contacts WHERE popia_consent_obtained = 0${f.sql}`).get(...f.params).c;
      const a = db.prepare(`SELECT COUNT(*) AS c FROM accounts WHERE COALESCE(popia_consent_obtained,0) = 0${f.sql}`).get(...f.params).c;
      return c + a;
    },
  },
  {
    id: 'popia_incomplete',
    label: 'POPIA Incomplete',
    category: 'metric',
    group: 'Compliance',
    description: 'Contacts + accounts missing data processing basis OR retention expired',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#e67e22',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      const c = db.prepare(
        `SELECT COUNT(*) AS c FROM contacts
         WHERE (data_processing_basis IS NULL OR data_processing_basis = ''
                OR (retention_expiry_date IS NOT NULL AND date(retention_expiry_date) < date('now')))
           ${f.sql}`).get(...f.params).c;
      const a = db.prepare(
        `SELECT COUNT(*) AS c FROM accounts
         WHERE (data_processing_basis IS NULL OR data_processing_basis = ''
                OR (retention_expiry_date IS NOT NULL AND date(retention_expiry_date) < date('now')))
           ${f.sql}`).get(...f.params).c;
      return c + a;
    },
  },
  {
    id: 'fica_not_verified',
    label: 'FICA Not Verified',
    category: 'metric',
    group: 'Compliance',
    description: 'Contacts + accounts whose FICA status is not Verified or Exempt',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#e67e22',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      const c = db.prepare(`SELECT COUNT(*) AS c FROM contacts WHERE fica_status NOT IN ('Verified','Exempt')${f.sql}`).get(...f.params).c;
      const a = db.prepare(`SELECT COUNT(*) AS c FROM accounts WHERE fica_status NOT IN ('Verified','Exempt')${f.sql}`).get(...f.params).c;
      return c + a;
    },
  },
  {
    id: 'fica_expired',
    label: 'FICA Expired',
    category: 'metric',
    group: 'Compliance',
    description: 'Contacts + accounts whose FICA status is Expired (or 5-year expiry passed)',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#e74c3c',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      const c = db.prepare(
        `SELECT COUNT(*) AS c FROM contacts
         WHERE (fica_status = 'Expired'
                OR (fica_five_year_expiry IS NOT NULL AND date(fica_five_year_expiry) < date('now')))
           ${f.sql}`).get(...f.params).c;
      const a = db.prepare(
        `SELECT COUNT(*) AS c FROM accounts
         WHERE (fica_status = 'Expired'
                OR (fica_five_year_expiry IS NOT NULL AND date(fica_five_year_expiry) < date('now')))
           ${f.sql}`).get(...f.params).c;
      return c + a;
    },
  },
  {
    id: 'conduct_flags',
    label: 'Conduct Flags',
    category: 'metric',
    group: 'Compliance',
    description: 'Contacts with a conduct risk flag raised',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#c0392b',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`SELECT COUNT(*) AS c FROM contacts WHERE conduct_risk_flag = 1${f.sql}`).get(...f.params).c;
    },
  },
  {
    id: 'open_engagements',
    label: 'Open Engagements',
    category: 'metric',
    group: 'Engagements',
    description: 'Engagements not yet implemented, declined, or on hold',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#27ae60',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`SELECT COUNT(*) AS c FROM client_engagements WHERE stage NOT IN ('Implemented / Active','Lost / Declined','On Hold')${f.sql}`).get(...f.params).c;
    },
  },
  {
    id: 'engagements_needing_advice',
    label: 'Engagements Needing Advice',
    category: 'metric',
    group: 'Engagements',
    description: 'Engagements with completed needs analysis but no advice presented',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#f39c12',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`SELECT COUNT(*) AS c FROM client_engagements WHERE needs_analysis_completed = 1 AND advice_presented = 0${f.sql}`).get(...f.params).c;
    },
  },
  {
    id: 'engagements_conduct_concern',
    label: 'Engagement Conduct Concerns',
    category: 'metric',
    group: 'Engagements',
    description: 'Engagements flagged with a conduct concern',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#c0392b',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`SELECT COUNT(*) AS c FROM client_engagements WHERE conduct_concern_flag = 1${f.sql}`).get(...f.params).c;
    },
  },
  {
    id: 'active_policies',
    label: 'Active Policies',
    category: 'metric',
    group: 'Policies',
    description: 'Policies currently in force',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#8e44ad',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`SELECT COUNT(*) AS c FROM policies WHERE policy_status = 'Active'${f.sql}`).get(...f.params).c;
    },
  },
  {
    id: 'policies_due_renewal_30',
    label: 'Renewals (30 days)',
    category: 'metric',
    group: 'Policies',
    description: 'Active policies renewing in the next 30 days',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#f39c12',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`
        SELECT COUNT(*) AS c FROM policies
        WHERE policy_status = 'Active'
          AND renewal_date IS NOT NULL
          AND renewal_date BETWEEN date('now') AND date('now', '+30 days')${f.sql}
      `).get(...f.params).c;
    },
  },
  {
    id: 'policies_due_renewal_60',
    label: 'Renewals (60 days)',
    category: 'metric',
    group: 'Policies',
    description: 'Active policies renewing in the next 60 days',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#f39c12',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`
        SELECT COUNT(*) AS c FROM policies
        WHERE policy_status = 'Active'
          AND renewal_date IS NOT NULL
          AND renewal_date BETWEEN date('now') AND date('now', '+60 days')${f.sql}
      `).get(...f.params).c;
    },
  },
  {
    id: 'policies_lapsed',
    label: 'Lapsed Policies',
    category: 'metric',
    group: 'Policies',
    description: 'Policies with status Lapsed',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#d35400',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`SELECT COUNT(*) AS c FROM policies WHERE policy_status = 'Lapsed'${f.sql}`).get(...f.params).c;
    },
  },
  {
    id: 'policies_without_advice',
    label: 'Policies Without Advice Record',
    category: 'metric',
    group: 'Compliance',
    description: 'Active policies not linked to any advice record',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#c0392b',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'p.assigned_broker_id');
      return db.prepare(`
        SELECT COUNT(*) AS c FROM policies p
        WHERE p.policy_status = 'Active'
          AND NOT EXISTS (SELECT 1 FROM advice_records a WHERE a.policy_id = p.id)${f.sql}
      `).get(...f.params).c;
    },
  },
  {
    id: 'gap_sections_count',
    label: 'Gap Sections',
    category: 'metric',
    group: 'Compliance',
    description: 'Policy sections with an identified coverage gap',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#16a085',
    run(db, brokerId) {
      if (!brokerId) {
        return db.prepare(`SELECT COUNT(*) AS c FROM policy_sections WHERE gap_identified = 1`).get().c;
      }
      return db.prepare(`
        SELECT COUNT(*) AS c FROM policy_sections ps
        JOIN policies p ON p.id = ps.policy_id
        WHERE ps.gap_identified = 1 AND p.assigned_broker_id = ?
      `).get(brokerId).c;
    },
  },
  {
    id: 'gap_critical',
    label: 'Critical Gap Sections',
    category: 'metric',
    group: 'Compliance',
    description: 'Gap sections rated Critical severity',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#e74c3c',
    run(db, brokerId) {
      if (!brokerId) {
        return db.prepare(`SELECT COUNT(*) AS c FROM policy_sections WHERE gap_identified = 1 AND gap_severity = 'Critical'`).get().c;
      }
      return db.prepare(`
        SELECT COUNT(*) AS c FROM policy_sections ps
        JOIN policies p ON p.id = ps.policy_id
        WHERE ps.gap_identified = 1 AND ps.gap_severity = 'Critical' AND p.assigned_broker_id = ?
      `).get(brokerId).c;
    },
  },
  {
    id: 'active_assets',
    label: 'Active Assets',
    category: 'metric',
    group: 'Assets',
    description: 'Currently active insured assets',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#1abc9c',
    run(db, brokerId) {
      if (!brokerId) {
        return db.prepare(`SELECT COUNT(*) AS c FROM assets WHERE asset_status = 'Active'`).get().c;
      }
      return db.prepare(`
        SELECT COUNT(*) AS c FROM assets a
        LEFT JOIN policies p ON p.id = a.policy_id
        WHERE a.asset_status = 'Active' AND (p.assigned_broker_id = ? OR a.created_by = ?)
      `).get(brokerId, brokerId).c;
    },
  },
  {
    id: 'open_claims',
    label: 'Open Claims',
    category: 'metric',
    group: 'Claims',
    description: 'Claims not settled, rejected, or closed',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#e74c3c',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'broker_id');
      return db.prepare(`SELECT COUNT(*) AS c FROM claims WHERE claim_status NOT IN ('Settled','Rejected','Closed')${f.sql}`).get(...f.params).c;
    },
  },
  {
    id: 'claims_delay_flag',
    label: 'Claims with Delay Flag',
    category: 'metric',
    group: 'Claims',
    description: 'Claims flagged as delayed',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#e67e22',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'broker_id');
      return db.prepare(`SELECT COUNT(*) AS c FROM claims WHERE delay_flag = 1${f.sql}`).get(...f.params).c;
    },
  },
  {
    id: 'claims_fair_process_concern',
    label: 'Claims — Fair Process Concerns',
    category: 'metric',
    group: 'Claims',
    description: 'Claims with a fair-process concern raised',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#c0392b',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'broker_id');
      return db.prepare(`SELECT COUNT(*) AS c FROM claims WHERE fair_process_concern = 1${f.sql}`).get(...f.params).c;
    },
  },
  {
    id: 'claims_disputed',
    label: 'Disputed Claims',
    category: 'metric',
    group: 'Claims',
    description: 'Claims with status Disputed',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#e67e22',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'broker_id');
      return db.prepare(`SELECT COUNT(*) AS c FROM claims WHERE claim_status = 'Disputed'${f.sql}`).get(...f.params).c;
    },
  },
  {
    id: 'complaints_open',
    label: 'Open Complaints',
    category: 'metric',
    group: 'Complaints',
    description: 'Complaints not yet resolved or closed',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#e67e22',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'broker_id');
      return db.prepare(`SELECT COUNT(*) AS c FROM complaints WHERE complaint_status NOT IN ('Resolved','Closed')${f.sql}`).get(...f.params).c;
    },
  },
  {
    id: 'complaints_escalated',
    label: 'Complaints Escalated to Ombud',
    category: 'metric',
    group: 'Complaints',
    description: 'Complaints escalated externally to the ombud',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#c0392b',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'broker_id');
      return db.prepare(`SELECT COUNT(*) AS c FROM complaints WHERE external_ombud_escalation = 1${f.sql}`).get(...f.params).c;
    },
  },
  {
    id: 'complaints_overdue',
    label: 'Complaints — Overdue Response',
    category: 'metric',
    group: 'Complaints',
    description: 'Open complaints whose response due date has passed',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#e74c3c',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'broker_id');
      return db.prepare(`
        SELECT COUNT(*) AS c FROM complaints
        WHERE complaint_status NOT IN ('Resolved','Closed')
          AND response_due_date IS NOT NULL
          AND response_due_date < date('now')${f.sql}
      `).get(...f.params).c;
    },
  },
  {
    id: 'reviews_overdue',
    label: 'Overdue Reviews',
    category: 'metric',
    group: 'Reviews',
    description: 'Reviews past their scheduled date and not yet completed',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#e67e22',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'broker_id');
      return db.prepare(`SELECT COUNT(*) AS c FROM reviews WHERE review_completed = 0 AND review_date < date('now')${f.sql}`).get(...f.params).c;
    },
  },
  {
    id: 'advice_records_30d',
    label: 'Advice Records (30 days)',
    category: 'metric',
    group: 'Advice',
    description: 'Records of Advice issued in the last 30 days',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#2980b9',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'broker_id');
      return db.prepare(`SELECT COUNT(*) AS c FROM advice_records WHERE advice_date >= date('now','-30 days')${f.sql}`).get(...f.params).c;
    },
  },
  {
    id: 'workflows_open',
    label: 'Open Workflow Tasks',
    category: 'metric',
    group: 'Workflows',
    description: 'Workflow tasks not yet completed',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#3498db',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`SELECT COUNT(*) AS c FROM workflows WHERE status != 'Completed'${f.sql}`).get(...f.params).c;
    },
  },
  {
    id: 'workflows_overdue',
    label: 'Overdue Workflow Tasks',
    category: 'metric',
    group: 'Workflows',
    description: 'Open workflow tasks past their due date',
    displayModes: ['chip'],
    defaultMode: 'chip',
    color: '#e74c3c',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`
        SELECT COUNT(*) AS c FROM workflows
        WHERE status != 'Completed' AND due_date IS NOT NULL AND due_date < date('now')${f.sql}
      `).get(...f.params).c;
    },
  },

  /* ─────────── CHART WIDGETS ─────────── */
  {
    id: 'engagements_by_stage',
    label: 'Engagements by Stage',
    category: 'chart',
    group: 'Engagements',
    description: 'Open engagements grouped by pipeline stage',
    displayModes: ['bar', 'doughnut'],
    defaultMode: 'bar',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`
        SELECT stage AS label, COUNT(*) AS count
        FROM client_engagements
        WHERE stage NOT IN ('Implemented / Active','Lost / Declined','On Hold')${f.sql}
        GROUP BY stage ORDER BY count DESC
      `).all(...f.params);
    },
  },
  {
    id: 'engagements_by_type',
    label: 'Engagements by Type',
    category: 'chart',
    group: 'Engagements',
    description: 'All engagements grouped by engagement_type',
    displayModes: ['bar', 'doughnut'],
    defaultMode: 'doughnut',
    run(db, brokerId) {
      const w = bWhere(brokerId, 'assigned_broker_id');
      return db.prepare(`
        SELECT engagement_type AS label, COUNT(*) AS count
        FROM client_engagements${w.sql}
        GROUP BY engagement_type ORDER BY count DESC
      `).all(...w.params);
    },
  },
  {
    id: 'policies_by_type',
    label: 'Active Policies by Type',
    category: 'chart',
    group: 'Policies',
    description: 'Active policies grouped by policy_type',
    displayModes: ['bar', 'doughnut'],
    defaultMode: 'doughnut',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`
        SELECT COALESCE(policy_type,'Unspecified') AS label, COUNT(*) AS count
        FROM policies WHERE policy_status = 'Active'${f.sql}
        GROUP BY label ORDER BY count DESC
      `).all(...f.params);
    },
  },
  {
    id: 'policies_by_status',
    label: 'Policies by Status',
    category: 'chart',
    group: 'Policies',
    description: 'All policies grouped by policy_status',
    displayModes: ['bar', 'doughnut'],
    defaultMode: 'doughnut',
    run(db, brokerId) {
      const w = bWhere(brokerId, 'assigned_broker_id');
      return db.prepare(`
        SELECT policy_status AS label, COUNT(*) AS count
        FROM policies${w.sql}
        GROUP BY label ORDER BY count DESC
      `).all(...w.params);
    },
  },
  {
    id: 'policies_by_insurer',
    label: 'Active Policies by Insurer',
    category: 'chart',
    group: 'Policies',
    description: 'Active policies grouped by insurer (top 10)',
    displayModes: ['bar', 'doughnut'],
    defaultMode: 'bar',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`
        SELECT insurer AS label, COUNT(*) AS count
        FROM policies WHERE policy_status = 'Active'${f.sql}
        GROUP BY insurer ORDER BY count DESC LIMIT 10
      `).all(...f.params);
    },
  },
  {
    id: 'renewals_by_month',
    label: 'Renewals — Next 12 Months',
    category: 'chart',
    group: 'Policies',
    description: 'Active policy renewals grouped by month',
    displayModes: ['line', 'bar'],
    defaultMode: 'line',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`
        SELECT strftime('%Y-%m', renewal_date) AS label, COUNT(*) AS count
        FROM policies
        WHERE policy_status = 'Active'
          AND renewal_date BETWEEN date('now') AND date('now', '+12 months')${f.sql}
        GROUP BY label ORDER BY label ASC
      `).all(...f.params);
    },
  },
  {
    id: 'policies_premium_by_type',
    label: 'Premium by Policy Type',
    category: 'chart',
    group: 'Policies',
    description: 'Total premium (ZAR) on active policies grouped by type',
    displayModes: ['bar', 'doughnut'],
    defaultMode: 'bar',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`
        SELECT COALESCE(policy_type,'Unspecified') AS label, ROUND(SUM(COALESCE(premium,0)),2) AS count
        FROM policies WHERE policy_status = 'Active'${f.sql}
        GROUP BY label ORDER BY count DESC
      `).all(...f.params);
    },
  },
  {
    id: 'contacts_by_status',
    label: 'Contacts by Status',
    category: 'chart',
    group: 'Clients',
    description: 'Contacts grouped by contact_status',
    displayModes: ['doughnut', 'bar'],
    defaultMode: 'doughnut',
    run(db, brokerId) {
      const w = bWhere(brokerId, 'assigned_broker_id');
      return db.prepare(`
        SELECT contact_status AS label, COUNT(*) AS count
        FROM contacts${w.sql}
        GROUP BY label ORDER BY count DESC
      `).all(...w.params);
    },
  },
  {
    id: 'contacts_by_category',
    label: 'Contacts by Category',
    category: 'chart',
    group: 'Clients',
    description: 'Contacts grouped by client_category (Personal / Commercial / …)',
    displayModes: ['doughnut', 'bar'],
    defaultMode: 'bar',
    run(db, brokerId) {
      const w = bWhere(brokerId, 'assigned_broker_id');
      return db.prepare(`
        SELECT client_category AS label, COUNT(*) AS count
        FROM contacts${w.sql}
        GROUP BY label ORDER BY count DESC
      `).all(...w.params);
    },
  },
  {
    id: 'contacts_by_segment',
    label: 'Contacts by Segment',
    category: 'chart',
    group: 'Clients',
    description: 'Contacts grouped by client_segment (A/B/C/VIP/…)',
    displayModes: ['doughnut', 'bar'],
    defaultMode: 'doughnut',
    run(db, brokerId) {
      const w = bWhere(brokerId, 'assigned_broker_id');
      return db.prepare(`
        SELECT COALESCE(client_segment,'Unsegmented') AS label, COUNT(*) AS count
        FROM contacts${w.sql}
        GROUP BY label ORDER BY count DESC
      `).all(...w.params);
    },
  },
  {
    id: 'contacts_fica_status',
    label: 'Contacts by FICA Status',
    category: 'chart',
    group: 'Compliance',
    description: 'Contacts grouped by FICA status',
    displayModes: ['doughnut', 'bar'],
    defaultMode: 'doughnut',
    run(db, brokerId) {
      const w = bWhere(brokerId, 'assigned_broker_id');
      return db.prepare(`
        SELECT fica_status AS label, COUNT(*) AS count
        FROM contacts${w.sql}
        GROUP BY label ORDER BY count DESC
      `).all(...w.params);
    },
  },
  {
    id: 'claims_by_status',
    label: 'Claims by Status',
    category: 'chart',
    group: 'Claims',
    description: 'All claims grouped by status',
    displayModes: ['doughnut', 'bar'],
    defaultMode: 'doughnut',
    run(db, brokerId) {
      const w = bWhere(brokerId, 'broker_id');
      return db.prepare(`
        SELECT claim_status AS label, COUNT(*) AS count
        FROM claims${w.sql}
        GROUP BY label ORDER BY count DESC
      `).all(...w.params);
    },
  },
  {
    id: 'claims_by_type',
    label: 'Claims by Type',
    category: 'chart',
    group: 'Claims',
    description: 'All claims grouped by claim_type',
    displayModes: ['bar', 'doughnut'],
    defaultMode: 'bar',
    run(db, brokerId) {
      const w = bWhere(brokerId, 'broker_id');
      return db.prepare(`
        SELECT claim_type AS label, COUNT(*) AS count
        FROM claims${w.sql}
        GROUP BY label ORDER BY count DESC
      `).all(...w.params);
    },
  },
  {
    id: 'claims_settlement_value',
    label: 'Settled Claims — Value by Type',
    category: 'chart',
    group: 'Claims',
    description: 'Total settlement amounts for settled claims, grouped by type',
    displayModes: ['bar', 'doughnut'],
    defaultMode: 'bar',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'broker_id');
      return db.prepare(`
        SELECT claim_type AS label, ROUND(SUM(COALESCE(settlement_amount,0)),2) AS count
        FROM claims
        WHERE claim_status = 'Settled'${f.sql}
        GROUP BY label ORDER BY count DESC
      `).all(...f.params);
    },
  },
  {
    id: 'gap_severity_breakdown',
    label: 'Gap Severity Breakdown',
    category: 'chart',
    group: 'Compliance',
    description: 'Identified policy-section gaps by severity',
    displayModes: ['doughnut', 'bar'],
    defaultMode: 'doughnut',
    run(db, brokerId) {
      if (!brokerId) {
        return db.prepare(`
          SELECT COALESCE(gap_severity,'Unrated') AS label, COUNT(*) AS count
          FROM policy_sections WHERE gap_identified = 1
          GROUP BY label ORDER BY count DESC
        `).all();
      }
      return db.prepare(`
        SELECT COALESCE(ps.gap_severity,'Unrated') AS label, COUNT(*) AS count
        FROM policy_sections ps
        JOIN policies p ON p.id = ps.policy_id
        WHERE ps.gap_identified = 1 AND p.assigned_broker_id = ?
        GROUP BY label ORDER BY count DESC
      `).all(brokerId);
    },
  },
  {
    id: 'complaint_root_cause',
    label: 'Complaint Root Cause',
    category: 'chart',
    group: 'Complaints',
    description: 'Complaints grouped by root_cause_category',
    displayModes: ['doughnut', 'bar'],
    defaultMode: 'doughnut',
    run(db, brokerId) {
      const w = bWhere(brokerId, 'broker_id');
      return db.prepare(`
        SELECT COALESCE(root_cause_category,'Unassigned') AS label, COUNT(*) AS count
        FROM complaints${w.sql}
        GROUP BY label ORDER BY count DESC
      `).all(...w.params);
    },
  },
  {
    id: 'complaints_by_category',
    label: 'Complaints by Category',
    category: 'chart',
    group: 'Complaints',
    description: 'Complaints grouped by complaint_category',
    displayModes: ['bar', 'doughnut'],
    defaultMode: 'bar',
    run(db, brokerId) {
      const w = bWhere(brokerId, 'broker_id');
      return db.prepare(`
        SELECT COALESCE(complaint_category,'Uncategorised') AS label, COUNT(*) AS count
        FROM complaints${w.sql}
        GROUP BY label ORDER BY count DESC
      `).all(...w.params);
    },
  },
  {
    id: 'reviews_by_outcome',
    label: 'Reviews by Outcome',
    category: 'chart',
    group: 'Reviews',
    description: 'Completed reviews grouped by outcome',
    displayModes: ['doughnut', 'bar'],
    defaultMode: 'doughnut',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'broker_id');
      return db.prepare(`
        SELECT COALESCE(review_outcome,'Pending') AS label, COUNT(*) AS count
        FROM reviews WHERE review_completed = 1${f.sql}
        GROUP BY label ORDER BY count DESC
      `).all(...f.params);
    },
  },
  {
    id: 'advice_by_type',
    label: 'Advice Records by Type',
    category: 'chart',
    group: 'Advice',
    description: 'Advice records grouped by advice_type',
    displayModes: ['doughnut', 'bar'],
    defaultMode: 'doughnut',
    run(db, brokerId) {
      const w = bWhere(brokerId, 'broker_id');
      return db.prepare(`
        SELECT advice_type AS label, COUNT(*) AS count
        FROM advice_records${w.sql}
        GROUP BY label ORDER BY count DESC
      `).all(...w.params);
    },
  },
  {
    id: 'assets_by_type',
    label: 'Assets by Type',
    category: 'chart',
    group: 'Assets',
    description: 'Active assets grouped by asset_type',
    displayModes: ['bar', 'doughnut'],
    defaultMode: 'bar',
    run(db, brokerId) {
      if (!brokerId) {
        return db.prepare(`
          SELECT asset_type AS label, COUNT(*) AS count
          FROM assets WHERE asset_status = 'Active'
          GROUP BY label ORDER BY count DESC
        `).all();
      }
      return db.prepare(`
        SELECT a.asset_type AS label, COUNT(*) AS count
        FROM assets a
        LEFT JOIN policies p ON p.id = a.policy_id
        WHERE a.asset_status = 'Active' AND (p.assigned_broker_id = ? OR a.created_by = ?)
        GROUP BY label ORDER BY count DESC
      `).all(brokerId, brokerId);
    },
  },
  {
    id: 'workflows_by_status',
    label: 'Workflows by Status',
    category: 'chart',
    group: 'Workflows',
    description: 'Workflow tasks grouped by status',
    displayModes: ['doughnut', 'bar'],
    defaultMode: 'doughnut',
    run(db, brokerId) {
      const w = bWhere(brokerId, 'assigned_broker_id');
      return db.prepare(`
        SELECT status AS label, COUNT(*) AS count
        FROM workflows${w.sql}
        GROUP BY label ORDER BY count DESC
      `).all(...w.params);
    },
  },

  /* ─────────── TABLE WIDGETS ─────────── */
  {
    id: 'tbl_upcoming_workflows',
    label: 'Upcoming Workflow Tasks',
    category: 'table',
    group: 'Workflows',
    description: 'Next 8 open tasks due in the coming 30 days',
    displayModes: ['table'],
    defaultMode: 'table',
    columns: ['Task', 'Due Date', 'Responsible', 'Status'],
    linkHref: w => `#/workflows/${w.id}`,
    rowShape: 'workflow',
    viewAllHref: '#/workflows',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'w.assigned_broker_id');
      return db.prepare(`
        SELECT w.id, w.description, w.due_date, w.status,
               u.full_name AS broker_name
        FROM workflows w
        LEFT JOIN users u ON u.id = w.assigned_broker_id
        WHERE w.status != 'Completed'
          AND w.due_date IS NOT NULL
          AND w.due_date <= date('now','+30 days')${f.sql}
        ORDER BY w.due_date ASC LIMIT 8
      `).all(...f.params);
    },
  },
  {
    id: 'tbl_overdue_workflows',
    label: 'Overdue Workflow Tasks',
    category: 'table',
    group: 'Workflows',
    description: 'Open workflow tasks past their due date',
    displayModes: ['table'],
    defaultMode: 'table',
    columns: ['Task', 'Due Date', 'Responsible', 'Status'],
    rowShape: 'workflow',
    viewAllHref: '#/workflows',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'w.assigned_broker_id');
      return db.prepare(`
        SELECT w.id, w.description, w.due_date, w.status,
               u.full_name AS broker_name
        FROM workflows w
        LEFT JOIN users u ON u.id = w.assigned_broker_id
        WHERE w.status != 'Completed'
          AND w.due_date IS NOT NULL
          AND w.due_date < date('now')${f.sql}
        ORDER BY w.due_date ASC LIMIT 10
      `).all(...f.params);
    },
  },
  {
    id: 'tbl_recent_engagements',
    label: 'Recent Engagements',
    category: 'table',
    group: 'Engagements',
    description: '5 most recently-updated engagements',
    displayModes: ['table'],
    defaultMode: 'table',
    columns: ['Name', 'Stage', 'Broker', 'Updated'],
    rowShape: 'engagement',
    viewAllHref: '#/engagements',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'e.assigned_broker_id');
      return db.prepare(`
        SELECT e.id, e.engagement_name, e.stage, e.updated_at,
               u.full_name AS broker_name
        FROM client_engagements e
        LEFT JOIN users u ON u.id = e.assigned_broker_id
        WHERE 1=1${f.sql}
        ORDER BY e.updated_at DESC LIMIT 5
      `).all(...f.params);
    },
  },
  {
    id: 'tbl_upcoming_renewals',
    label: 'Upcoming Renewals (30 days)',
    category: 'table',
    group: 'Policies',
    description: 'Active policies renewing in the next 30 days',
    displayModes: ['table'],
    defaultMode: 'table',
    columns: ['Policy', 'Insurer', 'Renewal Date', 'Client'],
    rowShape: 'renewal',
    viewAllHref: '#/policies',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'p.assigned_broker_id');
      return db.prepare(`
        SELECT p.id, p.policy_name, p.insurer, p.renewal_date,
               COALESCE(c.first_name || ' ' || c.last_name, a.account_name) AS client_name
        FROM policies p
        LEFT JOIN contacts c ON c.id = p.contact_id
        LEFT JOIN accounts a ON a.id = p.account_id
        WHERE p.policy_status = 'Active'
          AND p.renewal_date IS NOT NULL
          AND p.renewal_date BETWEEN date('now') AND date('now','+30 days')${f.sql}
        ORDER BY p.renewal_date ASC LIMIT 10
      `).all(...f.params);
    },
  },
  {
    id: 'tbl_overdue_reviews',
    label: 'Overdue Reviews',
    category: 'table',
    group: 'Reviews',
    description: 'Reviews past their scheduled date',
    displayModes: ['table'],
    defaultMode: 'table',
    columns: ['Review', 'Type', 'Date', 'Broker'],
    rowShape: 'review',
    viewAllHref: '#/reviews',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'r.broker_id');
      return db.prepare(`
        SELECT r.id, r.review_number, r.review_type, r.review_date,
               u.full_name AS broker_name
        FROM reviews r
        LEFT JOIN users u ON u.id = r.broker_id
        WHERE r.review_completed = 0 AND r.review_date < date('now')${f.sql}
        ORDER BY r.review_date ASC LIMIT 10
      `).all(...f.params);
    },
  },
  {
    id: 'tbl_open_complaints',
    label: 'Open Complaints',
    category: 'table',
    group: 'Complaints',
    description: 'Complaints not yet resolved',
    displayModes: ['table'],
    defaultMode: 'table',
    columns: ['Number', 'Category', 'Due Date', 'Status'],
    rowShape: 'complaint',
    viewAllHref: '#/complaints',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'broker_id');
      return db.prepare(`
        SELECT id, complaint_number, complaint_category, response_due_date, complaint_status
        FROM complaints
        WHERE complaint_status NOT IN ('Resolved','Closed') AND COALESCE(withdrawn,0) = 0${f.sql}
        ORDER BY response_due_date ASC LIMIT 10
      `).all(...f.params);
    },
  },
  {
    id: 'tbl_complaint_alerts',
    label: 'Complaint SLA Alerts',
    category: 'table',
    group: 'Complaints',
    description: 'Open complaints with days-open and SLA alert level',
    displayModes: ['table'],
    defaultMode: 'table',
    columns: ['Number', 'Days Open', 'Alert', 'Status'],
    rowShape: 'complaint_alert',
    viewAllHref: '#/complaints',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'c.broker_id');
      const rows = db.prepare(`
        SELECT c.id, c.complaint_number, c.complaint_status, c.severity_rating,
               c.complaint_date, c.acknowledgment_date, c.target_resolution_date,
               c.alert_day3_sent, c.alert_day21_sent, c.alert_day30_sent,
               CAST(julianday('now') - julianday(c.complaint_date) AS INTEGER) AS days_open
        FROM complaints c
        WHERE c.complaint_status NOT IN ('Resolved','Closed') AND COALESCE(c.withdrawn,0) = 0${f.sql}
        ORDER BY days_open DESC LIMIT 10
      `).all(...f.params);
      return rows.map(r => {
        let level = 'normal';
        if (r.days_open >= 30) level = 'critical';
        else if (r.days_open >= 21) level = 'escalation';
        else if (r.days_open >= 3 && !r.acknowledgment_date) level = 'unacknowledged';
        return { ...r, alert_level: level };
      });
    },
  },
  {
    id: 'tbl_open_claims',
    label: 'Open Claims',
    category: 'table',
    group: 'Claims',
    description: 'Claims not yet settled, rejected or closed',
    displayModes: ['table'],
    defaultMode: 'table',
    columns: ['Claim #', 'Type', 'Reported', 'Status'],
    rowShape: 'claim',
    viewAllHref: '#/claims',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'broker_id');
      return db.prepare(`
        SELECT id, claim_number, claim_type, date_reported, claim_status
        FROM claims
        WHERE claim_status NOT IN ('Settled','Rejected','Closed')${f.sql}
        ORDER BY date_reported DESC LIMIT 10
      `).all(...f.params);
    },
  },
  {
    id: 'tbl_critical_gap_sections',
    label: 'Critical Gap Sections',
    category: 'table',
    group: 'Compliance',
    description: 'Policy sections with Critical severity gaps',
    displayModes: ['table'],
    defaultMode: 'table',
    columns: ['Section', 'Policy', 'Severity', 'Status'],
    rowShape: 'gap_section',
    viewAllHref: '#/policy-sections',
    run(db, brokerId) {
      if (!brokerId) {
        return db.prepare(`
          SELECT ps.id, ps.section_name, ps.gap_severity, ps.needs_analysis_status,
                 p.policy_name
          FROM policy_sections ps
          JOIN policies p ON p.id = ps.policy_id
          WHERE ps.gap_identified = 1 AND ps.gap_severity = 'Critical'
          ORDER BY ps.updated_at DESC LIMIT 10
        `).all();
      }
      return db.prepare(`
        SELECT ps.id, ps.section_name, ps.gap_severity, ps.needs_analysis_status,
               p.policy_name
        FROM policy_sections ps
        JOIN policies p ON p.id = ps.policy_id
        WHERE ps.gap_identified = 1 AND ps.gap_severity = 'Critical'
          AND p.assigned_broker_id = ?
        ORDER BY ps.updated_at DESC LIMIT 10
      `).all(brokerId);
    },
  },
  {
    id: 'tbl_fica_expiring',
    label: 'FICA — Not Verified',
    category: 'table',
    group: 'Compliance',
    description: 'Contacts whose FICA is expired or not verified',
    displayModes: ['table'],
    defaultMode: 'table',
    columns: ['Name', 'FICA Status', 'Category', 'Last Review'],
    rowShape: 'fica_contact',
    viewAllHref: '#/contacts',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'assigned_broker_id');
      return db.prepare(`
        SELECT id, first_name, last_name, fica_status, client_category, last_review_date
        FROM contacts
        WHERE fica_status NOT IN ('Verified','Exempt')${f.sql}
        ORDER BY
          CASE fica_status WHEN 'Expired' THEN 0 ELSE 1 END,
          last_review_date ASC NULLS LAST
        LIMIT 10
      `).all(...f.params);
    },
  },
  {
    id: 'tbl_recent_advice',
    label: 'Recent Advice Records',
    category: 'table',
    group: 'Advice',
    description: 'Most recently-issued Records of Advice',
    displayModes: ['table'],
    defaultMode: 'table',
    columns: ['Number', 'Type', 'Date', 'Decision'],
    rowShape: 'advice',
    viewAllHref: '#/advice-records',
    run(db, brokerId) {
      const f = bFilter(brokerId, 'broker_id');
      return db.prepare(`
        SELECT id, advice_record_number, advice_type, advice_date, client_decision
        FROM advice_records
        WHERE 1=1${f.sql}
        ORDER BY advice_date DESC LIMIT 10
      `).all(...f.params);
    },
  },
];

const WIDGET_BY_ID = Object.fromEntries(WIDGETS.map(w => [w.id, w]));

/* ───────── Public catalog shape (strip SQL, expose only metadata) ───────── */
function toCatalog(w) {
  const { run, ...meta } = w;
  return meta;
}

/* ───────── Default config (used for new users / reset) ───────── */
const BUILTIN_DEFAULT_CONFIG = {
  chips: [
    { widgetId: 'active_contacts',      mode: 'chip' },
    { widgetId: 'open_engagements',     mode: 'chip' },
    { widgetId: 'active_policies',      mode: 'chip' },
    { widgetId: 'open_claims',          mode: 'chip' },
    { widgetId: 'policies_due_renewal_30', mode: 'chip' },
    { widgetId: 'reviews_overdue',      mode: 'chip' },
    { widgetId: 'gap_sections_count',   mode: 'chip' },
    { widgetId: 'active_assets',        mode: 'chip' },
  ],
  charts: [
    { widgetId: 'engagements_by_stage', mode: 'bar' },
    { widgetId: 'policies_by_type',     mode: 'doughnut' },
    { widgetId: 'contacts_by_status',   mode: 'doughnut' },
    { widgetId: 'claims_by_type',       mode: 'bar' },
    { widgetId: 'policies_by_status',   mode: 'doughnut' },
    { widgetId: 'contacts_by_category', mode: 'bar' },
    { widgetId: 'claims_by_status',     mode: 'doughnut' },
    { widgetId: 'renewals_by_month',    mode: 'line' },
  ],
  tables: [
    { widgetId: 'tbl_upcoming_workflows' },
    { widgetId: 'tbl_recent_engagements' },
    { widgetId: 'tbl_upcoming_renewals' },
  ],
};

/* ───────── Config storage helpers ───────── */

function getCompanyDefault(db) {
  const row = db.prepare(`SELECT value FROM system_settings WHERE key = 'dashboard_default_config'`).get();
  if (row && row.value) {
    try { return JSON.parse(row.value); } catch (_) {}
  }
  return BUILTIN_DEFAULT_CONFIG;
}

function setCompanyDefault(db, cfg) {
  const json = JSON.stringify(cfg);
  db.prepare(`
    INSERT INTO system_settings (key, value, updated_at) VALUES ('dashboard_default_config', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(json);
}

function getUserConfig(db, userId) {
  const row = db.prepare(`SELECT config FROM user_dashboard_config WHERE user_id = ?`).get(userId);
  if (row && row.config) {
    try { return JSON.parse(row.config); } catch (_) {}
  }
  return null;
}

function setUserConfig(db, userId, cfg) {
  const json = JSON.stringify(cfg);
  db.prepare(`
    INSERT INTO user_dashboard_config (user_id, config, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET config = excluded.config, updated_at = CURRENT_TIMESTAMP
  `).run(userId, json);
}

/* ───────── Config validation / normalization ───────── */

function sanitizeConfig(cfg) {
  const out = { chips: [], charts: [], tables: [] };
  if (!cfg || typeof cfg !== 'object') return out;

  const sections = [
    ['chips',  ['chip']],
    ['charts', ['bar', 'doughnut', 'line']],
    ['tables', ['table']],
  ];

  for (const [key, validModes] of sections) {
    const arr = Array.isArray(cfg[key]) ? cfg[key] : [];
    for (const entry of arr) {
      if (!entry || typeof entry !== 'object') continue;
      const w = WIDGET_BY_ID[entry.widgetId];
      if (!w) continue;
      // widget must belong to this section
      if (key === 'chips'  && w.category !== 'metric') continue;
      if (key === 'charts' && w.category !== 'chart')  continue;
      if (key === 'tables' && w.category !== 'table')  continue;

      let mode = entry.mode || w.defaultMode;
      if (!validModes.includes(mode) || !w.displayModes.includes(mode)) {
        mode = w.defaultMode;
      }
      out[key].push({ widgetId: w.id, mode });
    }
  }
  return out;
}

/* ══════════════════════════════ ROUTES ══════════════════════════════ */

// GET /catalog — all widget metadata (no SQL exposed)
router.get('/catalog', (_req, res) => {
  const items = WIDGETS.map(toCatalog);
  // Build a grouped view for the picker
  const groups = {};
  for (const w of items) {
    (groups[w.group] = groups[w.group] || []).push(w);
  }
  res.json({ widgets: items, groups });
});

// GET /config — current user's layout (falls back to company default)
router.get('/config', (req, res) => {
  const db = getDb();
  const user = getUserConfig(db, req.session.userId);
  const cfg  = sanitizeConfig(user || getCompanyDefault(db));
  res.json({ config: cfg, source: user ? 'user' : 'default' });
});

// PUT /config — save current user's layout
router.put('/config', (req, res) => {
  const db = getDb();
  const cfg = sanitizeConfig(req.body && req.body.config);
  setUserConfig(db, req.session.userId, cfg);
  res.locals.logAudit?.({
    action: 'UPDATE',
    module: 'dashboard_config',
    recordId: req.session.userId,
    description: 'User updated dashboard layout',
  });
  res.json({ config: cfg });
});

// POST /config/reset — delete user's layout so they fall back to default
router.post('/config/reset', (req, res) => {
  const db = getDb();
  db.prepare(`DELETE FROM user_dashboard_config WHERE user_id = ?`).run(req.session.userId);
  const cfg = sanitizeConfig(getCompanyDefault(db));
  res.locals.logAudit?.({
    action: 'UPDATE',
    module: 'dashboard_config',
    recordId: req.session.userId,
    description: 'User reset dashboard layout to default',
  });
  res.json({ config: cfg, source: 'default' });
});

// GET /default — company default
router.get('/default', (_req, res) => {
  const db = getDb();
  res.json({ config: sanitizeConfig(getCompanyDefault(db)) });
});

// PUT /default — admin only
router.put('/default', requireAdmin, (req, res) => {
  const db = getDb();
  const cfg = sanitizeConfig(req.body && req.body.config);
  setCompanyDefault(db, cfg);
  res.locals.logAudit?.({
    action: 'UPDATE',
    module: 'dashboard_config',
    description: 'Admin updated company default dashboard layout',
  });
  res.json({ config: cfg });
});

// POST /data — run a batch of widget IDs and return their values
router.post('/data', (req, res) => {
  const db = getDb();
  const brokerId = getBrokerId(req);
  const ids = Array.isArray(req.body && req.body.widgetIds) ? req.body.widgetIds : [];

  const results = {};
  for (const id of ids) {
    const w = WIDGET_BY_ID[id];
    if (!w) { results[id] = { error: 'unknown widget' }; continue; }
    try {
      results[id] = { value: w.run(db, brokerId) };
    } catch (err) {
      results[id] = { error: err.message };
    }
  }
  res.json({ data: results });
});

module.exports = router;
