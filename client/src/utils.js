/* =============================================================
   utils.js  —  Global utility functions for Inexpro CRM
   Loaded as a plain <script> tag; all exports are globals.
   ============================================================= */

/* ── Drag-release suppression for modals ──────────────────────────
 * Problem: when a user clicks INSIDE a modal box, drags (e.g. to
 * select text), and releases the mouse OUTSIDE the box on the
 * backdrop, the browser still fires a synthetic `click` whose
 * target is the backdrop — which any "click backdrop to close"
 * handler will then act on, dismissing the form mid-edit.
 *
 * This capture-phase guard tracks where mousedown started; if it
 * started inside a `.modal` / `[role="dialog"]` and the mouseup
 * lands outside that box, we install a one-shot click suppressor
 * that swallows the next click before any backdrop handler can
 * see it. Normal in-modal clicks and out-of-modal clicks (where
 * mousedown also started outside) are unaffected.
 *
 * Belt-and-braces alongside removing per-modal backdrop-close
 * handlers — nothing else needs to change for new modals to be
 * protected automatically, as long as the inner box is marked
 * with class `modal` or role `dialog` (the existing convention).
 * ───────────────────────────────────────────────────────────────── */
(() => {
  let _mdTarget = null;
  document.addEventListener('mousedown', (e) => {
    _mdTarget = e.target;
  }, true);
  document.addEventListener('mouseup', (e) => {
    const md = _mdTarget;
    _mdTarget = null;
    if (!md || !md.closest) return;
    const innerBox = md.closest('.modal,[role="dialog"]');
    if (!innerBox) return;
    if (innerBox.contains(e.target)) return;
    // Mousedown was inside a modal; mouseup landed outside it. Suppress
    // the upcoming click event before any backdrop handler fires.
    document.addEventListener('click', function once(ev) {
      ev.stopImmediatePropagation();
      ev.preventDefault();
      document.removeEventListener('click', once, true);
    }, true);
  }, true);
})();

// ── Date / Time ────────────────────────────────────────────────

/**
 * SQLite's CURRENT_TIMESTAMP returns values like "2026-04-28 12:34:56"
 * — no `T`, no `Z`. Chromium-family browsers parse that as LOCAL time,
 * which means a UTC value renders 2 hours behind for SAST users. To
 * fix that we coerce SQLite's bare-space format into a proper ISO UTC
 * string before handing it to `new Date(...)`.
 */
function _toUtcIsoString(str) {
  let s = String(str).trim();
  // Bare SQLite "YYYY-MM-DD HH:MM:SS[.fff]" — no T, no offset → UTC
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) {
    s = s.replace(' ', 'T') + 'Z';
  }
  // ISO with T but no offset → also treat as UTC for consistency
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) {
    s += 'Z';
  }
  return s;
}

/**
 * Format an ISO date string to "DD MMM YYYY" (e.g. "15 Jan 2025").
 * Returns '' if the value is null/undefined/empty.
 */
function formatDate(str) {
  if (!str) return '';
  const d = new Date(_toUtcIsoString(str));
  if (isNaN(d.getTime())) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  const day   = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()];
  const year  = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Format an ISO date string to "DD MMM YYYY HH:MM" (e.g. "15 Jan 2025 14:30").
 * Returns '' if the value is null/undefined/empty.
 */
function formatDateTime(str) {
  if (!str) return '';
  const d = new Date(_toUtcIsoString(str));
  if (isNaN(d.getTime())) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  const day   = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()];
  const year  = d.getFullYear();
  const hh    = String(d.getHours()).padStart(2, '0');
  const mm    = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hh}:${mm}`;
}

// ── Currency ────────────────────────────────────────────────────

/**
 * Format a number as "R 1 234.56".
 * Returns 'R 0.00' if the value is null/undefined/NaN.
 */
function formatCurrency(val) {
  const num = parseFloat(val);
  if (val === null || val === undefined || isNaN(num)) return 'R 0.00';
  const fixed    = num.toFixed(2);
  const [int, dec] = fixed.split('.');
  // Add thin-space thousands separator
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `R ${intFormatted}.${dec}`;
}

// ── Multi-currency (ZAR / NAD) ─────────────────────────────────

const CURRENCY_OPTIONS = [
  { code: 'ZAR', symbol: 'R',   label: 'ZAR (R)'  },
  { code: 'NAD', symbol: 'N$',  label: 'NAD (N$)' },
];

function currencySymbol(code) {
  const c = CURRENCY_OPTIONS.find(x => x.code === code);
  return c ? c.symbol : 'R';
}

/**
 * Format a number with a currency symbol.
 * fmtMoney(1234.5, 'NAD') → "N$ 1 234.50"
 */
function fmtMoney(val, code) {
  const sym = currencySymbol(code || 'ZAR');
  const num = parseFloat(val);
  if (val === null || val === undefined || val === '' || isNaN(num)) return `${sym} 0.00`;
  const fixed    = num.toFixed(2);
  const [int, dec] = fixed.split('.');
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sym} ${intFormatted}.${dec}`;
}

/**
 * Render a <select name="currency"> HTML snippet.
 */
function currencySelectHtml(current, name) {
  const nm = name || 'currency';
  const cur = current || 'ZAR';
  return `
    <select name="${nm}" class="form-control currency-select" data-currency-select="1">
      ${CURRENCY_OPTIONS.map(o =>
        `<option value="${o.code}" ${o.code === cur ? 'selected' : ''}>${o.label}</option>`
      ).join('')}
    </select>`;
}

/**
 * Inline form group with label + currency selector. Place at the top of
 * any form whose monetary fields should all follow the chosen currency.
 */
function currencyFieldHtml(current) {
  return `
    <div class="form-group">
      <label class="form-label">Currency</label>
      ${currencySelectHtml(current, 'currency')}
    </div>`;
}

/**
 * Wire a form's currency selector so that every label element with
 * class "cur-label" gets its text updated to the chosen symbol.
 * Call after the form is inserted into the DOM.
 */
function wireCurrencySelector(formEl) {
  if (!formEl) return;
  const sel = formEl.querySelector('select[name="currency"]');
  if (!sel) return;
  function apply() {
    const sym = currencySymbol(sel.value);
    formEl.querySelectorAll('.cur-label').forEach(el => { el.textContent = sym; });
  }
  sel.addEventListener('change', apply);
  apply();
}

// ── Debounce ────────────────────────────────────────────────────

/**
 * Returns a debounced version of fn that delays invocation by `delay` ms.
 */
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ── Input Sanitisation ──────────────────────────────────────────

/**
 * Trim leading/trailing whitespace and return the string.
 * Returns '' if the value is null/undefined.
 */
function sanitiseInput(str) {
  if (str === null || str === undefined) return '';
  return String(str).trim();
}

// ── Toast Notifications ─────────────────────────────────────────

/**
 * Display a toast notification in #toast-container.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const colourMap = {
    success : '#2e7d32',
    error   : '#c62828',
    warning : '#e65100',
    info    : '#1565c0',
  };

  const iconMap = {
    success : '✓',
    error   : '✕',
    warning : '⚠',
    info    : 'ℹ',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 260px;
    max-width: 420px;
    padding: 12px 16px;
    margin-bottom: 8px;
    background: ${colourMap[type] || colourMap.info};
    color: #fff;
    border-radius: 6px;
    box-shadow: 0 3px 10px rgba(0,0,0,0.2);
    font-size: 14px;
    line-height: 1.4;
    animation: toastIn 0.25s ease;
    opacity: 1;
    transition: opacity 0.3s ease;
  `;

  const icon = document.createElement('span');
  icon.style.cssText = 'font-size:16px; flex-shrink:0;';
  icon.textContent = iconMap[type] || iconMap.info;

  const text = document.createElement('span');
  text.textContent = message;

  toast.appendChild(icon);
  toast.appendChild(text);
  container.appendChild(toast);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3000);
}

// ── Loading Spinner ─────────────────────────────────────────────

/**
 * Inject a loading spinner into the given container element.
 */
function showLoading(containerEl) {
  if (!containerEl) return;
  containerEl.innerHTML = `
    <div class="loading-spinner-wrapper" style="
      display:flex; justify-content:center; align-items:center;
      min-height:120px; width:100%;
    ">
      <div class="loading-spinner" style="
        width:36px; height:36px;
        border:3px solid rgba(0,0,0,0.1);
        border-top-color: var(--color-primary, #1a73e8);
        border-radius:50%;
        animation: spin 0.7s linear infinite;
      "></div>
    </div>`;
}

/**
 * Remove the spinner previously injected by showLoading().
 */
function hideLoading(containerEl) {
  if (!containerEl) return;
  const wrapper = containerEl.querySelector('.loading-spinner-wrapper');
  if (wrapper) wrapper.remove();
}

// ── Status Badge ────────────────────────────────────────────────

/**
 * Return an HTML string for a status badge.
 * @param {string} status
 * @returns {string}
 */
function statusBadge(status) {
  const safe = sanitiseInput(status);
  return `<span class="badge" data-status="${safe}">${safe}</span>`;
}

// ── Confirm Dialog ──────────────────────────────────────────────

/**
 * Show a native confirm dialog and return the boolean result.
 * @param {string} message
 * @returns {boolean}
 */
function confirmDialog(message) {
  return window.confirm(message);
}

/**
 * Promise-based centred confirmation modal — drop-in replacement for
 * window.confirm() that opens a styled overlay in the middle of the
 * current page (instead of a native browser-chrome popup at the top).
 *
 * Usage:  if (await confirmDialogAsync('Are you sure?')) { ... }
 *
 * Resolves to `true` when the user clicks Yes, `false` otherwise.
 */
function confirmDialogAsync(message, opts = {}) {
  const okLabel     = opts.okLabel     || 'Yes';
  const cancelLabel = opts.cancelLabel || 'No';
  const variant     = opts.variant     || 'primary'; // 'primary' | 'danger'
  return new Promise((resolve) => {
    document.getElementById('async-confirm-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'async-confirm-overlay';
    overlay.className = 'modal-overlay';
    const _esc = (s) => String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    overlay.innerHTML = `
      <div class="modal" style="width:420px;max-width:92vw;">
        <div class="modal-header" style="padding:.9rem 1.1rem;border-bottom:1px solid #eee;">
          <strong>${_esc(opts.title || 'Confirm')}</strong>
        </div>
        <div class="modal-body" style="padding:1rem 1.1rem;font-size:.9rem;line-height:1.45;">
          ${_esc(message)}
        </div>
        <div class="modal-footer" style="padding:.85rem 1.1rem;border-top:1px solid #eee;display:flex;justify-content:flex-end;gap:.5rem;">
          <button type="button" class="btn btn-secondary" id="ac-cancel">${_esc(cancelLabel)}</button>
          <button type="button" class="btn btn-${variant === 'danger' ? 'danger' : 'primary'}" id="ac-ok">${_esc(okLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector('#ac-cancel').addEventListener('click', () => close(false));
    overlay.querySelector('#ac-ok').addEventListener('click', () => close(true));
    document.addEventListener('keydown', function once(e) {
      if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', once); }
      if (e.key === 'Enter')  { close(true);  document.removeEventListener('keydown', once); }
    });
    setTimeout(() => overlay.querySelector('#ac-ok')?.focus(), 50);
  });
}

// ── Query String Helpers ────────────────────────────────────────

/**
 * Build a URL query string from a plain object.
 * Null and undefined values are skipped.
 * @param {Object} params
 * @returns {string}  e.g. "?page=1&q=foo"
 */
function buildQueryString(params) {
  if (!params || typeof params !== 'object') return '';
  const pairs = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return pairs.length ? '?' + pairs.join('&') : '';
}

/**
 * Parse the current URL's search parameters into a plain object.
 * @returns {Object}
 */
function parseQueryString() {
  const result = {};
  const search = window.location.search;
  if (!search) return result;
  const params = new URLSearchParams(search);
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

// ── Page Header Helpers ─────────────────────────────────────────

/**
 * Set the page title in the header (#header-title) and document.title.
 * @param {string} title
 */
function setPageTitle(title) {
  const el = document.getElementById('header-title');
  if (el) el.textContent = title;
  document.title = title ? `${title} — Inexpro CRM` : 'Inexpro CRM';
}

/**
 * Render breadcrumb navigation in #breadcrumb.
 * @param {string[]} parts  e.g. ['Contacts', 'View']
 */
function setBreadcrumb(parts) {
  const el = document.getElementById('breadcrumb');
  if (!el || !Array.isArray(parts)) return;
  el.innerHTML = parts
    .map((part, i) => {
      const isLast = i === parts.length - 1;
      return isLast
        ? `<span class="breadcrumb-item breadcrumb-active">${part}</span>`
        : `<span class="breadcrumb-item">${part}</span>`;
    })
    .join('<span class="breadcrumb-separator"> &rsaquo; </span>');
}

/**
 * Inject a "← Back" button next to the page title when the user is on a
 * sub-page (e.g. a detail/edit/new route). Hidden on module list pages,
 * the Dashboard, and on the Reports and Admin modules.
 */
function updateBackButton() {
  const titleArea = document.querySelector('.header-title-area');
  const existing  = document.getElementById('page-back-btn');
  if (existing) existing.remove();
  if (!titleArea) return;

  const raw = (window.location.hash || '').replace(/^#\/?/, '').split('?')[0];
  const segments = raw.split('/').filter(Boolean);
  if (segments.length < 2) return;                           // list page or dashboard

  const SKIP = new Set(['reports', 'admin', 'settings', 'audit-log', 'dashboard']);
  if (SKIP.has(segments[0])) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'page-back-btn';
  btn.className = 'btn btn-primary btn-sm';
  btn.innerHTML = '&larr; Back';
  btn.style.cssText = 'margin-right:.75rem;vertical-align:middle;';
  btn.addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else window.location.hash = '#/dashboard';
  });
  titleArea.parentNode.insertBefore(btn, titleArea);
}

window.addEventListener('hashchange', updateBackButton);
document.addEventListener('DOMContentLoaded', updateBackButton);

// ── Currency Input Formatter ────────────────────────────────────

/**
 * Attach a blur event listener to an input element that formats the
 * value as a plain decimal number (e.g. "1 234.56" → "1234.56").
 * The raw numeric value is stored in the input so form serialisation works.
 * @param {HTMLInputElement} el
 */
function currencyInput(el) {
  if (!el) return;
  el.addEventListener('blur', function () {
    // Strip anything that is not a digit, comma, or period
    const raw = el.value.replace(/[^\d.,]/g, '').replace(',', '.');
    const num  = parseFloat(raw);
    if (!isNaN(num)) {
      el.value = num.toFixed(2);
    }
  });
}

// ── File Size Formatter ─────────────────────────────────────────

/**
 * Format a file size in bytes to a human-readable string.
 * e.g. 1024 → "1.0 KB", 1048576 → "1.0 MB"
 */
function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
}

// ── Timeline / Activity Renderer ────────────────────────────────

const _ACTION_ICONS = {
  CREATE: '✚',
  UPDATE: '✎',
  DELETE: '✖',
  LOGIN:  '→',
  LOGOUT: '←',
  EXPORT: '⬇',
};
const _ACTION_COLOURS = {
  CREATE: '#27ae60',
  UPDATE: '#2980b9',
  DELETE: '#e74c3c',
  LOGIN:  '#8e44ad',
  LOGOUT: '#8e44ad',
  EXPORT: '#f39c12',
};

// Fields to skip when building a change diff (internal / housekeeping columns)
const _DIFF_SKIP = new Set([
  'id','created_at','updated_at','created_by','password_hash',
  'last_login','session_token','reset_token','reset_token_expires',
]);

// Human-readable labels for common DB column names
const _FIELD_LABELS = {
  policy_name:'Policy Name', policy_number:'Policy Number', policy_status:'Status',
  policy_type:'Policy Type', product_category:'Product Category',
  insurer:'Insurer', premium:'Premium', inception_date:'Inception Date',
  renewal_date:'Renewal Date', cancellation_date:'Cancellation Date',
  cancellation_reason:'Cancellation Reason', cover_description:'Cover Description',
  disclosure_completed:'Disclosure Completed', amendment_count:'Amendment Count',
  claims_count:'Claims Count', last_review_date:'Last Review Date',
  next_review_date:'Next Review Date', assigned_broker_id:'Assigned Broker',
  assigned_admin_id:'Assigned Admin', contact_id:'Contact', account_id:'Account',
  engagement_id:'Engagement', advice_record_id:'Advice Record',
  // Contact fields
  first_name:'First Name', last_name:'Last Name', contact_status:'Status',
  contact_type:'Contact Type', client_category:'Category', client_segment:'Segment',
  email:'Email', mobile:'Mobile', phone:'Phone',
  id_number:'ID Number', date_of_birth:'Date of Birth',
  popia_consent_obtained:'POPIA Consent', fica_status:'FICA Status',
  // Account fields
  account_name:'Account Name', account_type:'Account Type', account_status:'Status',
  registration_number:'Reg Number', vat_number:'VAT Number',
  // Policy section fields
  section_name:'Section Name', section_type:'Section Type', section_category:'Category',
  needs_analysis_status:'NA Status', gap_identified:'Gap Identified',
  gap_severity:'Gap Severity', risk_exists:'Risk Exists',
  cover_required:'Cover Required', currently_covered:'Currently Covered',
  recommended_for_cover:'Recommended', implemented:'Implemented',
  sum_insured_limit:'Sum Insured', excess:'Excess',
  // Claim fields
  claim_reference:'Claim Ref', claim_type:'Claim Type', claim_status:'Status',
  date_of_loss:'Date of Loss', claim_amount:'Claim Amount',
  settlement_amount:'Settlement Amount',
  // Engagement fields
  engagement_name:'Engagement Name', engagement_type:'Type', stage:'Stage',
  client_decision:'Client Decision', fact_find_completed:'Fact Find',
  needs_analysis_completed:'Needs Analysis', proposal_prepared:'Proposal Prepared',
  advice_presented:'Advice Presented', suitability_confirmed:'Suitability Confirmed',
  // Advice record fields
  advice_record_number:'ROA Number', advice_type:'Advice Type',
  advice_date:'Advice Date', status:'Status',
  roa_reference:'ROA Reference',
  // Asset fields
  asset_name:'Asset Name', asset_type:'Asset Type', asset_status:'Status',
  mm_number:'M & M Number',
  // Risk detail fields
  risk_detail_name:'Risk Detail Name', risk_type:'Risk Type',
  // Review fields
  review_date:'Review Date', review_type:'Review Type',
  review_completed:'Completed',
  // Complaint fields
  complaint_reference:'Complaint Ref', complaint_category:'Category',
  complaint_status:'Status', date_received:'Date Received',
  // Generic
  notes:'Notes', conduct_concern_flag:'Conduct Concern',
};

/**
 * Format a raw DB value for human display in the diff.
 */
function _fmtVal(v) {
  if (v === null || v === undefined || v === '') return '(empty)';
  if (v === 1 || v === true)  return 'Yes';
  if (v === 0 || v === false) return 'No';
  const s = String(v);
  // ISO date-only  YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return formatDate(s);
  // ISO datetime
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return formatDateTime(s);
  return s;
}

/**
 * Build a list of changed fields between two plain objects.
 * Returns array of { label, from, to } — only fields that actually changed.
 */
function _buildDiff(oldObj, newObj) {
  const changes = [];
  const keys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
  for (const key of keys) {
    if (_DIFF_SKIP.has(key)) continue;
    const oldVal = (oldObj || {})[key];
    const newVal = (newObj || {})[key];
    // Treat null/undefined/"" as equivalent for diff purposes
    const norm = v => (v === null || v === undefined) ? '' : String(v);
    if (norm(oldVal) === norm(newVal)) continue;
    const label = _FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    changes.push({ label, from: _fmtVal(oldVal), to: _fmtVal(newVal) });
  }
  return changes;
}

/**
 * Render a timeline of audit_log entries.
 * For UPDATE events, parses old_value / new_value JSON and shows a field diff.
 * @param {Array}  entries    — from /api/timeline
 * @param {string} emptyMsg   — message when no entries
 * @returns {string}  HTML
 */
function renderTimeline(entries, emptyMsg) {
  if (!entries || entries.length === 0) {
    return `<p class="tab-empty">${emptyMsg || 'No activity recorded yet.'}</p>`;
  }

  return `<div class="timeline">${entries.map(e => {
    const icon   = _ACTION_ICONS[e.action]  || '•';
    const colour = _ACTION_COLOURS[e.action] || '#7f8c8d';
    const desc   = e.description || `${e.action} on ${e.module}`;
    const who    = e.user_name ? `by ${e.user_name}` : '';
    const when   = e.timestamp ? formatDateTime(e.timestamp) : '';

    // Build change diff for UPDATE events; for CREATE, render the field list.
    let diffHtml = '';
    if (e.action === 'UPDATE' && (e.old_value || e.new_value)) {
      try {
        const oldObj = typeof e.old_value === 'string' ? JSON.parse(e.old_value) : (e.old_value || {});
        const newObj = typeof e.new_value === 'string' ? JSON.parse(e.new_value) : (e.new_value || {});
        const changes = _buildDiff(oldObj, newObj);
        if (changes.length) {
          diffHtml = `
            <div class="timeline-diff">
              ${changes.map(c => `
                <div class="timeline-diff-row">
                  <span class="timeline-diff-field">${sanitiseInput(c.label).replace(/</g,'&lt;')}</span>
                  <span class="timeline-diff-from">${sanitiseInput(c.from).replace(/</g,'&lt;')}</span>
                  <span class="timeline-diff-arrow">→</span>
                  <span class="timeline-diff-to">${sanitiseInput(c.to).replace(/</g,'&lt;')}</span>
                </div>`).join('')}
            </div>`;
        }
      } catch (_) { /* silently skip malformed JSON */ }
    } else if (e.action === 'CREATE' && e.new_value) {
      try {
        const newObj = typeof e.new_value === 'string' ? JSON.parse(e.new_value) : (e.new_value || {});
        const rows = [];
        for (const key of Object.keys(newObj)) {
          if (_DIFF_SKIP.has(key)) continue;
          const v = newObj[key];
          if (v === null || v === undefined || v === '') continue;
          const label = _FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          rows.push({ label, value: _fmtVal(v) });
        }
        if (rows.length) {
          diffHtml = `
            <div class="timeline-diff">
              ${rows.map(r => `
                <div class="timeline-diff-row">
                  <span class="timeline-diff-field">${sanitiseInput(r.label).replace(/</g,'&lt;')}</span>
                  <span class="timeline-diff-arrow">=</span>
                  <span class="timeline-diff-to">${sanitiseInput(r.value).replace(/</g,'&lt;')}</span>
                </div>`).join('')}
            </div>`;
        }
      } catch (_) {}
    } else if (e.action === 'DELETE' && e.old_value) {
      try {
        const oldObj = typeof e.old_value === 'string' ? JSON.parse(e.old_value) : (e.old_value || {});
        const rows = [];
        for (const key of Object.keys(oldObj)) {
          if (_DIFF_SKIP.has(key)) continue;
          const v = oldObj[key];
          if (v === null || v === undefined || v === '') continue;
          const label = _FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          rows.push({ label, value: _fmtVal(v) });
        }
        if (rows.length) {
          diffHtml = `
            <div class="timeline-diff">
              ${rows.slice(0, 8).map(r => `
                <div class="timeline-diff-row">
                  <span class="timeline-diff-field">${sanitiseInput(r.label).replace(/</g,'&lt;')}</span>
                  <span class="timeline-diff-arrow">×</span>
                  <span class="timeline-diff-from">${sanitiseInput(r.value).replace(/</g,'&lt;')}</span>
                </div>`).join('')}
              ${rows.length > 8 ? `<div class="timeline-diff-row" style="font-style:italic;color:#888;">…and ${rows.length - 8} more.</div>` : ''}
            </div>`;
        }
      } catch (_) {}
    }

    return `
      <div class="timeline-item">
        <div class="timeline-dot" style="background:${colour};">${icon}</div>
        <div class="timeline-body">
          <div class="timeline-desc">${sanitiseInput(desc).replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
          ${diffHtml}
          <div class="timeline-meta">${when}${who ? ' &mdash; ' + who : ''}</div>
        </div>
      </div>`;
  }).join('')}</div>`;
}

// ── Shared Documents Tab Renderer ───────────────────────────────

/**
 * Render the documents tab content (list + upload button).
 * Caller must wire the upload input after calling this.
 * @param {Array}  docs     — document records from API
 * @param {string} inputId  — id for the hidden file input
 * @returns {string}  HTML
 */
function renderDocsTabHtml(docs, inputId) {
  return `
    <div class="tab-toolbar">
      <label class="btn btn-primary btn-sm" for="${inputId}">+ Upload Document</label>
      <input type="file" id="${inputId}" style="display:none;"
        accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.csv" />
    </div>
    ${docs.length ? `
    <table class="table">
      <thead><tr><th>File Name</th><th>Size</th><th>Uploaded By</th><th>Date</th><th></th></tr></thead>
      <tbody>${docs.map(d => `
        <tr>
          <td>${sanitiseInput(d.original_name).replace(/</g,'&lt;')}</td>
          <td>${formatBytes(d.file_size)}</td>
          <td>${sanitiseInput(d.uploaded_by_name || '—').replace(/</g,'&lt;')}</td>
          <td>${d.uploaded_at ? formatDate(d.uploaded_at) : '—'}</td>
          <td class="nowrap">
            <a href="/api/documents/${d.id}/view" target="_blank" class="btn btn-xs btn-outline">View</a>
          </td>
        </tr>`).join('')}</tbody>
    </table>` : `<p class="tab-empty">No documents uploaded yet.</p>`}`;
}

// ── Role-Based Delete Button Visibility ─────────────────────────

/**
 * Check if the current user can delete records.
 * admin_only users cannot delete — this mirrors the server-side canDelete middleware.
 * @returns {boolean}
 */
function canUserDelete() {
  return window.currentUser?.role !== 'admin_only';
}

// ── Contact / Account Mutual Exclusion ──────────────────────────

/**
 * Wire up contact_id and account_id selects so that when one is chosen
 * the other is greyed out (disabled). Clearing the selected one re-enables
 * the other. Call this after rendering any form that has both fields.
 * @param {HTMLFormElement|HTMLElement} formEl — the form or container element
 */
function wireContactAccountToggle(formEl) {
  if (!formEl) return;

  // Make contact, account and policy selects searchable
  ['contact_id', 'account_id', 'policy_id'].forEach(name => {
    const s = formEl.querySelector(`select[name="${name}"]`);
    if (s) makeSearchable(s);
  });

  const contactSel = formEl.querySelector('[name="contact_id"]');
  const accountSel = formEl.querySelector('[name="account_id"]');
  if (!contactSel || !accountSel) return;

  // The searchable wrapper sits next to the hidden <select>. Disabling the
  // underlying <select> alone doesn't grey out the visible text input, so
  // target the wrapper's input and dim the wrapper.
  function visualFor(sel) {
    const wrapper = sel.parentElement;
    if (!wrapper) return { input: null, wrapper: null };
    return { input: wrapper.querySelector('input[type="text"]'), wrapper };
  }

  function setDisabled(sel, disabled) {
    sel.disabled = disabled;
    const { input, wrapper } = visualFor(sel);
    if (input) {
      input.disabled = disabled;
      input.style.background = disabled ? '#f1f3f5' : '';
      input.style.cursor = disabled ? 'not-allowed' : '';
    }
    if (wrapper) {
      wrapper.style.opacity = disabled ? '0.5' : '';
      wrapper.style.pointerEvents = disabled ? 'none' : '';
    }
    sel.style.opacity = disabled ? '0.5' : '';
  }

  function update() {
    const hasContact = contactSel.value && contactSel.value !== '';
    const hasAccount = accountSel.value && accountSel.value !== '';
    setDisabled(accountSel, hasContact);
    setDisabled(contactSel, hasAccount);
  }

  contactSel.addEventListener('change', update);
  accountSel.addEventListener('change', update);
  update();

  // Re-enable disabled selects before form submission so values are included
  if (formEl.tagName === 'FORM') {
    formEl.addEventListener('submit', () => {
      contactSel.disabled = false;
      accountSel.disabled = false;
    });
  }
}

// ── Utils namespace ─────────────────────────────────────────────

/**
 * Global Utils object — wraps the standalone util functions so components
 * can call Utils.esc(), Utils.formatDate(), etc.
 */
const Utils = {

  /**
   * HTML-escape a value for safe insertion into markup.
   * @param {*} str
   * @returns {string}
   */
  esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#39;');
  },

  /** Delegate to standalone formatDate() */
  formatDate(str)     { return formatDate(str); },

  /** Delegate to standalone formatDateTime() */
  formatDateTime(str) { return formatDateTime(str); },

  /** Delegate to standalone formatCurrency() */
  formatCurrency(val) { return formatCurrency(val); },

  /** Delegate to standalone sanitiseInput() */
  sanitise(str)       { return sanitiseInput(str); },

  /** Delegate to standalone formatBytes() */
  formatBytes(bytes)  { return formatBytes(bytes); },

  /** Render a timeline of audit log entries */
  renderTimeline(entries, emptyMsg) { return renderTimeline(entries, emptyMsg); },

  /** Render a documents tab (list + upload button) */
  renderDocsTabHtml(docs, inputId)  { return renderDocsTabHtml(docs, inputId); },

  /** Delegate to standalone buildQueryString() */
  qs(params)          { return buildQueryString(params); },

  /**
   * Return an ISO date string (YYYY-MM-DD) from a Date object.
   * @param {Date} d
   * @returns {string}
   */
  toISODate(d) {
    if (!d || isNaN(d.getTime())) return '';
    const y  = d.getFullYear();
    const m  = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dy}`;
  },

  /**
   * Render a standard error message block.
   * @param {string} msg
   * @param {Error}  [err]
   * @returns {string}  HTML string
   */
  errorHtml(msg, err) {
    const detail = err ? Utils.esc(err.message || String(err)) : '';
    return `
      <div class="alert alert-danger" style="margin:1rem 0;">
        <strong>${Utils.esc(msg)}</strong>
        ${detail ? `<div style="margin-top:.4rem;font-size:.85em;">${detail}</div>` : ''}
      </div>`;
  },
};

// ── Versions / History tab ─────────────────────────────────────
//
// Fetch audit_log UPDATE entries for a given module + record, and render
// each entry as a collapsible "version" showing timestamp, user, and field
// diffs. Clicking "View Full Snapshot" opens a modal with every field of
// the previous version. Used by asset/policy/claim detail tabs.

// Cache of version snapshot payloads keyed by `${module}:${auditId}` so the
// inline "View Full Snapshot" button can find the right record when clicked.
const __versionSnapshotCache = {};

function __prettyLabel(k) {
  return String(k).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function __fmtSnapshotValue(v, key) {
  // Mask sensitive fields
  if (key === 'account_number_enc' && v) return '<span style="letter-spacing:2px;">••••••••</span>';
  if (v === null || v === undefined || v === '') return '<span style="color:var(--text-muted);">—</span>';
  if (v === 1 || v === true)  return '<span class="bool-yes">&#10003; Yes</span>';
  if (v === 0 || v === false) return '<span class="bool-no">&#10007; No</span>';
  // Date-ish ISO string
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const dt = formatDate(v);
    if (dt) return Utils.esc(dt);
  }
  // Currency hints
  const CUR_KEYS = /(_value$|^premium$|^sasria$|^excess.*|^sum_insured$|_limit$|_turnover$|_load$|_items$|replacement_value|aggregate_limit|limit_of_indemnity|estimated_value|settlement_amount|minimum_excess)/;
  if (typeof v === 'number' && key && CUR_KEYS.test(key)) {
    return 'R ' + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (typeof v === 'object') {
    // Try to render JSON arrays (e.g. excesses / vehicle_extras) as a small table
    try {
      if (Array.isArray(v)) {
        if (!v.length) return '<span style="color:var(--text-muted);">(empty)</span>';
        const keys = Object.keys(v[0] || {});
        return `<table class="table" style="margin:0;font-size:.85em;">
          <thead><tr>${keys.map(k => `<th>${Utils.esc(__prettyLabel(k))}</th>`).join('')}</tr></thead>
          <tbody>${v.map(row => `<tr>${keys.map(k => `<td>${Utils.esc(String(row[k] ?? '—'))}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>`;
      }
    } catch(_) {}
    return '<pre style="margin:0;font-size:.8em;">' + Utils.esc(JSON.stringify(v, null, 2)) + '</pre>';
  }
  // JSON string?
  if (typeof v === 'string' && (v.startsWith('[') || v.startsWith('{'))) {
    try {
      const parsed = JSON.parse(v);
      return __fmtSnapshotValue(parsed, key);
    } catch(_) {}
  }
  return Utils.esc(String(v));
}

function openVersionSnapshot(cacheKey) {
  const payload = __versionSnapshotCache[cacheKey];
  if (!payload) return;
  const { moduleName, entry, oldObj, newObj } = payload;

  const SKIP = new Set(['id','created_at','updated_at','created_by']);
  // Order: changed fields first, then everything else alphabetically
  const allKeys = Array.from(new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]))
    .filter(k => !SKIP.has(k))
    .sort();
  const changedKeys = new Set();
  for (const k of allKeys) {
    const norm = (v) => (v === null || v === undefined) ? '' : String(v);
    if (norm(oldObj[k]) !== norm(newObj[k])) changedKeys.add(k);
  }
  const ordered = [
    ...allKeys.filter(k => changedKeys.has(k)),
    ...allKeys.filter(k => !changedKeys.has(k)),
  ];

  const ts  = entry.timestamp ? formatDateTime(entry.timestamp) : '—';
  const who = entry.user_full_name || entry.user_name || 'System';

  const modal      = document.getElementById('global-modal');
  const titleEl    = document.getElementById('global-modal-title');
  const bodyEl     = document.getElementById('global-modal-body');
  const footerEl   = document.getElementById('global-modal-footer');
  const dialogEl   = document.getElementById('global-modal-dialog');
  if (!modal || !bodyEl || !titleEl) return;

  if (dialogEl) dialogEl.style.maxWidth = '900px';

  titleEl.textContent = `Previous Version — ${__prettyLabel(moduleName)} — ${ts}`;
  bodyEl.innerHTML = `
    <div style="padding:.25rem .25rem .75rem;font-size:.82rem;color:var(--text-muted);">
      Edited by <strong>${Utils.esc(who)}</strong> on ${Utils.esc(ts)}.
      Fields highlighted in amber changed in this edit.
    </div>
    <table class="table" style="margin:0;">
      <thead>
        <tr>
          <th style="width:32%;">Field</th>
          <th style="width:34%;">Previous Value</th>
          <th style="width:34%;">New Value</th>
        </tr>
      </thead>
      <tbody>
        ${ordered.map(k => {
          const changed = changedKeys.has(k);
          const rowStyle = changed ? 'background:#fff8e1;' : '';
          return `
            <tr style="${rowStyle}">
              <td><strong>${Utils.esc(__prettyLabel(k))}</strong>${changed ? ' <span style="font-size:.7em;color:#b36a00;">(changed)</span>' : ''}</td>
              <td style="color:${changed ? '#b36a00' : 'inherit'};">${__fmtSnapshotValue(oldObj[k], k)}</td>
              <td style="color:${changed ? '#22863a' : 'inherit'};">${__fmtSnapshotValue(newObj[k], k)}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  if (footerEl) {
    footerEl.innerHTML = `<button class="btn btn-secondary" onclick="document.getElementById('global-modal').style.display='none'">Close</button>`;
  }
  modal.style.display = 'flex';

  const closeBtn = document.getElementById('global-modal-close');
  if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; };
  /* backdrop-close disabled */
}

async function renderVersionsTab(tabEl, moduleName, recordId, opts = {}) {
  if (!tabEl) return;
  tabEl.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;
  try {
    let rows;
    if (opts.useTimeline) {
      // Fetches the merged audit timeline for the parent (policies includes
      // commission_log + post_sale_events). Filter to UPDATE + CREATE so the
      // versions tab shows both edits and child-record additions.
      const tl = await Api.timeline.forRecord(moduleName, recordId);
      const all = Array.isArray(tl) ? tl : (tl.data || []);
      rows = all
        .filter(r => r.action === 'UPDATE' || r.action === 'CREATE')
        .filter(r => !(r.module === moduleName && r.action === 'CREATE'))
        .map(r => ({ ...r, user_full_name: r.user_full_name || r.user_name }));
    } else {
      const res = await Api.admin.auditLog({
        module: moduleName, record_id: recordId, action: 'UPDATE', limit: 200
      });
      rows = (res && res.data) || [];
    }
    if (!rows.length) {
      tabEl.innerHTML = '<p class="tab-empty">No previous versions recorded yet. When this record is edited, earlier values will appear here.</p>';
      return;
    }

    const SKIP = new Set(['id','created_at','updated_at','created_by','account_number_enc']);
    const esc = (s) => { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; };
    const prettyLabel = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const fmtVal = (v) => {
      if (v === null || v === undefined || v === '') return '(empty)';
      if (v === 1 || v === true)  return 'Yes';
      if (v === 0 || v === false) return 'No';
      if (typeof v === 'object')  return JSON.stringify(v);
      return String(v);
    };

    tabEl.innerHTML = `
      <div style="padding:.5rem .25rem;">
        <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 .75rem;">
          Showing <strong>${rows.length}</strong> update${rows.length !== 1 ? 's' : ''} (most recent first).
          Click a version to see what changed.
        </p>
        ${rows.map((entry, idx) => {
          let oldObj = {}, newObj = {};
          try { oldObj = typeof entry.old_value === 'string' ? JSON.parse(entry.old_value) : (entry.old_value || {}); } catch(_) {}
          try { newObj = typeof entry.new_value === 'string' ? JSON.parse(entry.new_value) : (entry.new_value || {}); } catch(_) {}

          const keys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
          const diffs = [];
          for (const k of keys) {
            if (SKIP.has(k)) continue;
            const norm = (v) => (v === null || v === undefined) ? '' : String(v);
            if (norm(oldObj[k]) !== norm(newObj[k])) {
              diffs.push({ field: k, from: oldObj[k], to: newObj[k] });
            }
          }

          const ts    = entry.timestamp ? formatDateTime(entry.timestamp) : '—';
          const who   = entry.user_full_name || entry.user_name || 'System';
          const tag   = entry.action === 'CREATE'
            ? ` (${entry.module ? entry.module.replace(/_/g, ' ') : 'related record'} added)`
            : '';
          const title = `Version ${rows.length - idx} — ${ts} by ${who}${tag}`;
          // For CREATE rows, treat all newObj fields as "added" so the diff table renders.
          if (entry.action === 'CREATE' && newObj && Object.keys(newObj).length) {
            for (const k of Object.keys(newObj)) {
              if (SKIP.has(k)) continue;
              const v = newObj[k];
              if (v === null || v === undefined || v === '') continue;
              if (!diffs.find(d => d.field === k)) {
                diffs.push({ field: k, from: '', to: v });
              }
            }
          }

          // Cache the snapshot payload so the button's onclick can find it.
          const cacheKey = `${moduleName}:${entry.id || idx}`;
          __versionSnapshotCache[cacheKey] = { moduleName, entry, oldObj, newObj };

          return `
          <details class="version-entry" style="border:1px solid var(--border-color,#dee2e6);border-radius:6px;margin-bottom:.5rem;background:var(--surface-secondary,#fafafa);">
            <summary style="padding:.6rem .85rem;cursor:pointer;font-weight:500;display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;">
              <span>${esc(title)}</span>
              <span style="margin-left:auto;font-size:.78rem;color:var(--text-muted);font-weight:400;">
                ${diffs.length} field${diffs.length !== 1 ? 's' : ''} changed
              </span>
            </summary>
            <div style="padding:.5rem .85rem .85rem;">
              <div style="margin-bottom:.6rem;">
                <button class="btn btn-sm btn-primary" onclick="openVersionSnapshot('${esc(cacheKey)}')">
                  View Full Snapshot
                </button>
              </div>
              ${diffs.length ? `
              <table class="table" style="margin:0;font-size:.85rem;">
                <thead>
                  <tr>
                    <th style="width:30%;">Field</th>
                    <th style="width:35%;">Previous</th>
                    <th style="width:35%;">New</th>
                  </tr>
                </thead>
                <tbody>
                  ${diffs.map(d => `
                    <tr>
                      <td><strong>${esc(prettyLabel(d.field))}</strong></td>
                      <td style="color:#b36a00;">${esc(fmtVal(d.from))}</td>
                      <td style="color:#22863a;">${esc(fmtVal(d.to))}</td>
                    </tr>`).join('')}
                </tbody>
              </table>` : '<p style="margin:0;font-size:.85rem;color:var(--text-muted);">No field-level changes detected in this entry.</p>'}
            </div>
          </details>`;
        }).join('')}
      </div>`;
  } catch (err) {
    tabEl.innerHTML = `<div class="alert alert-danger">Failed to load versions: ${Utils.esc(err.message || String(err))}</div>`;
  }
}

// ── Searchable Select ──────────────────────────────────────────
/**
 * Replace a <select> with a text input + hidden results list.
 * The original select is hidden; a text input shows a filtered list of matches.
 */
function makeSearchable(nameOrEl) {
  const sel = typeof nameOrEl === 'string'
    ? document.querySelector(`select[name="${nameOrEl}"]`)
    : nameOrEl;
  if (!sel || sel.dataset.searchable) return;
  sel.dataset.searchable = '1';

  const allOptions = Array.from(sel.options)
    .filter(o => o.value)
    .map(o => ({ value: o.value, text: o.textContent }));
  const emptyLabel = sel.options[0] && !sel.options[0].value ? sel.options[0].textContent : '— Select —';

  // Hide the original select but keep it in the DOM for form submission
  sel.style.display = 'none';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;';
  sel.parentNode.insertBefore(wrapper, sel);
  wrapper.appendChild(sel);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-control';
  input.placeholder = emptyLabel;
  input.autocomplete = 'off';

  // Show current selection
  const current = allOptions.find(o => o.value === sel.value);
  if (current) input.value = current.text;

  const listEl = document.createElement('div');
  listEl.style.cssText = 'display:none;position:absolute;z-index:200;width:100%;max-height:200px;overflow-y:auto;background:#fff;border:1px solid var(--border,#dee2e6);border-radius:0 0 6px 6px;box-shadow:0 4px 12px rgba(0,0,0,.12);';

  wrapper.appendChild(input);
  wrapper.appendChild(listEl);

  function renderList(q) {
    const filtered = q
      ? allOptions.filter(o => o.text.toLowerCase().includes(q.toLowerCase()))
      : allOptions;
    if (!filtered.length) {
      listEl.innerHTML = '<div style="padding:.5rem .75rem;color:var(--text-muted);font-size:.85rem;">No matches</div>';
    } else {
      listEl.innerHTML = filtered.map(o =>
        `<div class="ss-item" data-value="${Utils.esc(o.value)}" style="padding:.45rem .75rem;cursor:pointer;font-size:.9rem;border-bottom:1px solid #f0f0f0;">${Utils.esc(o.text)}</div>`
      ).join('');
    }
    listEl.style.display = '';
    // Bind click
    listEl.querySelectorAll('.ss-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault(); // prevent blur
        sel.value = item.dataset.value;
        input.value = item.textContent;
        listEl.style.display = 'none';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
      item.addEventListener('mouseenter', () => { item.style.background = '#e8f0fe'; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; });
    });
  }

  input.addEventListener('focus', () => renderList(input.value));
  input.addEventListener('input', () => renderList(input.value));
  input.addEventListener('blur', () => {
    setTimeout(() => { listEl.style.display = 'none'; }, 150);
  });

  // Clear selection if input is emptied
  input.addEventListener('change', () => {
    if (!input.value.trim()) {
      sel.value = '';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  // Allow clearing with backspace/delete
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      listEl.style.display = 'none';
      input.blur();
    }
  });
}

/* ─────────────────────────────────────────────────────────────────────────
 * Encrypted-field display + admin-password reveal
 *
 * Renders a masked value with an eye-icon button. Clicking the eye opens a
 * centered admin-password modal. On correct password, the field briefly shows
 * the plaintext (auto re-masks after 30s) and writes a REVEAL audit log entry.
 *
 * Usage in a template:
 *   ${EncryptedField.render({
 *     module:    'contacts',
 *     recordId:  c.id,
 *     field:     'sa_id_number',
 *     masked:    c.sa_id_number_masked || '••••••',
 *   })}
 *
 * Then call EncryptedField.bind(rootEl) once after injecting HTML so click
 * handlers are attached.
 * ───────────────────────────────────────────────────────────────────────── */
const EncryptedField = (() => {
  const REVEAL_TTL_MS = 30 * 1000;

  // Self-contained HTML escape so this helper has zero dependencies on the
  // calling component's local `esc()` helper.
  const _esc = (s) => {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  function render({ module, recordId, field, masked, label }) {
    const safeMasked = (masked === null || masked === undefined || masked === '') ? '—' : String(masked);
    return `
      <span class="encrypted-field" data-encrypted-field
            data-module="${_esc(module)}"
            data-record-id="${_esc(recordId)}"
            data-field="${_esc(field)}"
            data-masked="${_esc(safeMasked)}">
        <span class="encrypted-field-value" style="font-family:monospace;">${_esc(safeMasked)}</span>
        <button type="button" class="encrypted-field-eye" aria-label="Reveal ${_esc(label || field)}"
                style="margin-left:.35rem;padding:0 .15rem;background:transparent;border:none;cursor:pointer;font-size:1rem;line-height:1;">👁</button>
      </span>`;
  }

  // bind() is a no-op — the document-level delegated handler (below the IIFE)
  // catches every click on .encrypted-field-eye, including buttons rendered into
  // pages added to the DOM later. Kept for backwards compatibility with callers.
  function bind() { /* delegated; see document.addEventListener at file scope */ }

  function openPasswordModal(wrap) {
    document.getElementById('encrypted-reveal-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'encrypted-reveal-overlay';
    overlay.className = 'modal-overlay';
    // Centered, regardless of where the eye icon is on the page.
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);' +
      'display:flex;align-items:center;justify-content:center;z-index:9999;';
    overlay.innerHTML = `
      <div class="modal" style="background:#fff;padding:1.4rem 1.5rem;border-radius:8px;
                                box-shadow:0 14px 40px rgba(0,0,0,.25);width:380px;max-width:92vw;">
        <h3 style="margin:0 0 .35rem 0;font-size:1.05rem;">Admin password required</h3>
        <p style="margin:0 0 .85rem 0;color:#666;font-size:.85rem;">
          Reveal <strong>${_esc(wrap.dataset.field)}</strong> on
          <strong>${_esc(wrap.dataset.module)}</strong> record #${_esc(wrap.dataset.recordId)}.
          Enter your admin password to confirm — every reveal is audit-logged.
        </p>
        <input type="password" id="encrypted-reveal-pw" class="form-control" autocomplete="current-password"
               placeholder="Admin password"
               style="width:100%;margin-bottom:.6rem;" />
        <div id="encrypted-reveal-err"
             style="display:none;color:#a71d2a;font-size:.8rem;margin-bottom:.6rem;"></div>
        <div style="display:flex;justify-content:flex-end;gap:.5rem;">
          <button type="button" class="btn btn-sm btn-outline" id="encrypted-reveal-cancel">Cancel</button>
          <button type="button" class="btn btn-sm btn-primary" id="encrypted-reveal-submit">Reveal</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const pwInput = overlay.querySelector('#encrypted-reveal-pw');
    const errEl   = overlay.querySelector('#encrypted-reveal-err');
    const close   = () => overlay.remove();
    const submit  = async () => {
      errEl.style.display = 'none';
      const pw = pwInput.value.trim();
      if (!pw) { errEl.textContent = 'Password required.'; errEl.style.display = 'block'; return; }
      try {
        const r = await fetch('/api/admin/reveal-encrypted', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            password: pw,
            module:   wrap.dataset.module,
            record_id: wrap.dataset.recordId,
            field:    wrap.dataset.field,
          }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${r.status}`);
        }
        const { value } = await r.json();
        showRevealed(wrap, value);
        close();
      } catch (err) {
        errEl.textContent = err.message || 'Reveal failed.';
        errEl.style.display = 'block';
        pwInput.select();
      }
    };

    overlay.querySelector('#encrypted-reveal-cancel').addEventListener('click', close);
    overlay.querySelector('#encrypted-reveal-submit').addEventListener('click', submit);
    // Click-outside-to-close intentionally disabled — users were closing
    // forms by accident. Only the Cancel button or the × close it.
    pwInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') close();
    });
    setTimeout(() => pwInput.focus(), 50);
  }

  function showRevealed(wrap, plain) {
    const valueEl = wrap.querySelector('.encrypted-field-value');
    if (!valueEl) return;
    const masked = wrap.dataset.masked || '••••••';
    valueEl.textContent = plain || '—';
    valueEl.style.color = '#a71d2a';
    valueEl.style.fontWeight = '600';
    // Auto re-mask after TTL.
    setTimeout(() => {
      valueEl.textContent = masked;
      valueEl.style.color = '';
      valueEl.style.fontWeight = '';
    }, REVEAL_TTL_MS);
  }

  // Single delegated click handler. Survives any HTML re-render — every
  // encrypted-field eye icon, in every module, opens the centred admin
  // password modal without per-render re-binding.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.encrypted-field-eye');
    if (!btn) return;
    const wrap = btn.closest('[data-encrypted-field]');
    if (!wrap) return;
    e.preventDefault();
    e.stopPropagation();
    openPasswordModal(wrap);
  });

  return { render, bind };
})();

/* ─────────────────────────────────────────────────────────────────────────
 * EditLock — admin-password challenge for editing locked records
 *
 * Modules behind this gate:
 *   policies, claims, fica (contact + account), popia (contact + account),
 *   client_engagements, advice_records (only when roa_completed=1)
 *
 * Usage:
 *   const pw = await EditLock.requestUnlock({
 *     module: 'policies',
 *     recordId: 42,
 *     subject: policy.policy_name,        // optional — shown in modal
 *   });
 *   if (!pw) return;                       // user cancelled
 *   // Bundle pw into the PUT body:
 *   await Api.policies.update(42, { ...form, _admin_password: pw });
 *
 * Returns the entered password string on submit (caller is responsible for
 * passing it through to the save call), or `null` if the user cancelled.
 * Server verifies the password again on the actual PUT — this UX gate just
 * collects it and avoids opening an edit form for a locked record without
 * authorisation.
 * ───────────────────────────────────────────────────────────────────────── */
const EditLock = (() => {
  const _esc = (s) => {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /**
   * Open the centred admin-password modal. The password is verified against
   * /api/auth/verify-password BEFORE the promise resolves — wrong passwords
   * keep the modal open with an inline error, so the caller (router / form)
   * never sees an unverified password and the edit form never opens until a
   * valid admin password has actually been confirmed by the server.
   *
   * Resolves with the verified password string, or `null` if the user
   * explicitly cancelled.
   */
  // In-memory cache for the bypass flag — refreshed lazily on each prompt.
  let _bypassCache = { value: null, ts: 0 };
  async function _isBypassActive() {
    // Refresh the flag every 30s so admins toggling it don't have to refresh.
    if (_bypassCache.value !== null && Date.now() - _bypassCache.ts < 30000) {
      return _bypassCache.value;
    }
    try {
      const r = await fetch('/api/settings/security-public', { credentials: 'include' });
      if (r.ok) {
        const j = await r.json();
        _bypassCache = { value: !!j.bypass_edit_password, ts: Date.now() };
        return _bypassCache.value;
      }
    } catch (_) {}
    _bypassCache = { value: false, ts: Date.now() };
    return false;
  }

  function requestUnlock({ module, recordId, subject, intent }) {
    return new Promise(async (resolve) => {
      // When the global bypass toggle is on, skip the prompt entirely and
      // resolve with a sentinel string. apiFetch / direct callers treat any
      // truthy resolution as "verified", and the server-side gate will also
      // accept the request because the same flag short-circuits there.
      if (await _isBypassActive()) { resolve('__bypass__'); return; }

      document.getElementById('edit-lock-overlay')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'edit-lock-overlay';
      overlay.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,.45);' +
        'display:flex;align-items:center;justify-content:center;z-index:9999;';
      const subjectLine = subject
        ? `<strong>${_esc(subject)}</strong>` + (recordId ? ` <span style="color:#888;">(${_esc(module)} #${_esc(recordId)})</span>` : '')
        : `<strong>${_esc(module)}</strong> record #${_esc(recordId)}`;
      const verb = intent || 'edit';
      overlay.innerHTML = `
        <div style="background:#fff;padding:1.4rem 1.5rem;border-radius:10px;
                    box-shadow:0 14px 40px rgba(0,0,0,.25);width:420px;max-width:92vw;">
          <h3 style="margin:0 0 .4rem 0;font-size:1.05rem;">🔒 Authorisation required</h3>
          <p style="margin:0 0 .85rem 0;color:#555;font-size:.85rem;line-height:1.4;">
            This record is locked. Enter an admin password <strong>or</strong> a 6-digit
            one-time PIN to ${_esc(verb)} ${subjectLine}.
            Every attempt is audit-logged.
          </p>
          <input type="password" id="edit-lock-pw" class="form-control" autocomplete="current-password"
                 placeholder="Admin password or 6-digit PIN"
                 style="width:100%;margin-bottom:.6rem;" />
          <div id="edit-lock-err"
               style="display:none;color:#a71d2a;font-size:.8rem;margin-bottom:.6rem;"></div>
          <div style="display:flex;justify-content:flex-end;gap:.5rem;align-items:center;">
            <span id="edit-lock-spin" style="display:none;font-size:.8rem;color:#888;margin-right:auto;">Verifying…</span>
            <button type="button" class="btn btn-sm btn-outline" id="edit-lock-cancel">Cancel</button>
            <button type="button" class="btn btn-sm btn-primary" id="edit-lock-submit">Unlock</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const pwInput  = overlay.querySelector('#edit-lock-pw');
      const errEl    = overlay.querySelector('#edit-lock-err');
      const spinEl   = overlay.querySelector('#edit-lock-spin');
      const submitBtn= overlay.querySelector('#edit-lock-submit');
      const cancelBtn= overlay.querySelector('#edit-lock-cancel');
      const close = (val) => { overlay.remove(); resolve(val); };

      const showErr = (msg) => {
        errEl.textContent = msg;
        errEl.style.display = 'block';
        pwInput.select();
      };

      const submit = async () => {
        errEl.style.display = 'none';
        const pw = pwInput.value;
        if (!pw) { showErr('Password required.'); return; }

        // Verify with the server BEFORE resolving — wrong passwords keep the
        // modal open and never open the edit form.
        submitBtn.disabled = true;
        cancelBtn.disabled = true;
        spinEl.style.display = 'inline';
        try {
          const r = await fetch('/api/auth/verify-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ password: pw }),
          });
          if (r.ok) {
            close(pw);
            return;
          }
          let body = null;
          try { body = await r.json(); } catch (_) {}
          showErr((body && body.error) || `Verification failed (HTTP ${r.status}).`);
        } catch (err) {
          showErr('Network error while verifying password.');
        } finally {
          submitBtn.disabled = false;
          cancelBtn.disabled = false;
          spinEl.style.display = 'none';
        }
      };

      cancelBtn.addEventListener('click', () => close(null));
      submitBtn.addEventListener('click', submit);
      // Click-outside-to-close intentionally disabled — only Cancel / × / Escape close.
      pwInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') close(null);
      });
      setTimeout(() => pwInput.focus(), 50);
    });
  }

  /* ── Password cache (per-edit-session) ────────────────────────────────────
   * After the user successfully unlocks an edit, we hold the entered password
   * in this in-memory map keyed by `module:recordId`. apiFetch reads from it
   * when sending matching PUTs and bundles the password into the body so the
   * server-side gate accepts the write. The cache lives only for the page's
   * lifetime — a refresh clears it.
   *
   * Mapping from URL path → cache key is also defined here so apiFetch can
   * look up the right entry without each form remembering to pass it.
   * ───────────────────────────────────────────────────────────────────────── */
  const _pwCache = new Map();
  const _key = (module, recordId) => `${module}:${recordId}`;

  // URL pattern → { module, idIndex } for matching outbound PUTs.
  // idIndex is the regex capture group containing the record ID.
  const URL_PATTERNS = [
    { rx: /^\/api\/policies\/(\d+)$/,           module: 'policies' },
    { rx: /^\/api\/claims\/(\d+)$/,             module: 'claims' },
    { rx: /^\/api\/engagements\/(\d+)$/,        module: 'client_engagements' },
    { rx: /^\/api\/advice-records\/(\d+)$/,     module: 'advice_records' },
    { rx: /^\/api\/fica\/contact\/(\d+)$/,      module: 'fica_contact' },
    { rx: /^\/api\/fica\/account\/(\d+)$/,      module: 'fica_account' },
    { rx: /^\/api\/popia\/contact\/(\d+)$/,     module: 'popia_contact' },
    { rx: /^\/api\/popia\/account\/(\d+)$/,     module: 'popia_account' },
  ];

  function setPassword(module, recordId, password) {
    _pwCache.set(_key(module, recordId), password);
  }
  function getPassword(module, recordId) {
    return _pwCache.get(_key(module, recordId)) || null;
  }
  function clearPassword(module, recordId) {
    _pwCache.delete(_key(module, recordId));
  }
  function lookupForUrl(path) {
    for (const p of URL_PATTERNS) {
      const m = path.match(p.rx);
      if (m) {
        const pw = getPassword(p.module, m[1]);
        if (pw) return { password: pw, module: p.module, recordId: m[1] };
        return null;
      }
    }
    return null;
  }

  /**
   * Edit-time guard. Call this when the user clicks an "Edit" button on a
   * locked record (or before opening an inline edit panel for FICA/POPIA).
   * ALWAYS prompts for the admin password — there is no per-session bypass.
   * Each Edit click re-verifies, so a stale cached password from a previous
   * edit session cannot be used to open the form silently. The fresh password
   * is then cached just long enough for the form's eventual Save to attach it.
   *
   *   if (!await EditLock.requestEditAccess({
   *     module: 'policies', recordId: id, subject: policy.policy_name,
   *   })) return;          // user cancelled — stay put
   *   navigate(`/policies/${id}/edit`);
   */
  async function requestEditAccess(opts) {
    const { module, recordId } = opts || {};
    if (!module || !recordId) return true;
    // Drop any stale cached password BEFORE prompting so a wrong-password
    // cancel doesn't leave the previous one armed.
    clearPassword(module, recordId);
    const pw = await requestUnlock(opts);
    if (!pw) return false;
    setPassword(module, recordId, pw);
    return true;
  }

  function invalidateBypassCache() { _bypassCache = { value: null, ts: 0 }; }
  function isBypassActive()        { return _isBypassActive(); }

  return {
    requestUnlock,
    requestEditAccess,
    setPassword,
    getPassword,
    clearPassword,
    lookupForUrl,
    invalidateBypassCache,
    isBypassActive,
  };
})();
