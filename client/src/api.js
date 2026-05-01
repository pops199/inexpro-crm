/* =============================================================
   api.js  —  Global Api object for Inexpro CRM
   Loaded as a plain <script> tag; Api is a global.

   All methods return Promises.
   On HTTP 401  → calls window.handleLogout() and throws.
   On other err → throws an Error with the server's message.
   ============================================================= */

// ── Core fetch wrapper ──────────────────────────────────────────

/**
 * Perform an authenticated fetch against the CRM backend.
 *
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method
 * @param {string}  path        e.g. '/api/contacts'
 * @param {*}       [body]      JS object (JSON) or FormData
 * @param {boolean} [isFormData] When true, omit Content-Type so the browser
 *                               sets it automatically with the multipart boundary.
 * @returns {Promise<any>}  Parsed JSON response body (or null for 204).
 */
async function apiFetch(method, path, body, opts4) {
  // Backwards-compat: opts4 may be a boolean (legacy `isFormData`) or a config
  // object { isFormData }.
  const cfg = (typeof opts4 === 'object' && opts4 !== null) ? opts4 : { isFormData: !!opts4 };
  const isFormData = !!cfg.isFormData;

  // Edit-lock: if this is a write to a locked-module URL AND the user has
  // already entered the admin password earlier (via EditLock.requestEditAccess
  // when they clicked Edit), bundle it into the body. Without this, the
  // server will return 423 EDIT_LOCKED. New-record POSTs go through untouched
  // because the cache is keyed by recordId.
  let _editLockHit = null;
  if (!isFormData && (method === 'PUT' || method === 'PATCH') &&
      typeof EditLock !== 'undefined') {
    _editLockHit = EditLock.lookupForUrl(path);
    if (_editLockHit) {
      body = { ...(body || {}), _admin_password: _editLockHit.password };
    }
  }

  const opts = {
    method,
    credentials: 'include',           // send session cookie
    headers: {},
  };

  if (body !== undefined && body !== null) {
    if (isFormData) {
      // Let the browser set Content-Type (includes boundary)
      opts.body = body;
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }

  let response;
  try {
    response = await fetch(path, opts);
  } catch (networkErr) {
    throw new Error('Network error — please check your connection.');
  }

  // No-content responses
  if (response.status === 204) return null;

  // Attempt to parse JSON regardless of success/failure so we can
  // extract the server's error message if present.
  let data;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }
  } else {
    // For non-JSON responses (e.g. CSV / PDF downloads) return the raw Response
    if (!response.ok) {
      const e = new Error(`Request failed with status ${response.status}.`);
      e.status = response.status;
      throw e;
    }
    return response;
  }

  // Session expired / not authenticated — only trigger logout when the server
  // didn't return an application-level error code (e.g. BAD_PASSWORD,
  // EDIT_LOCKED). Application 401s should bubble up to the caller intact.
  if (response.status === 401 && !(data && data.code)) {
    if (typeof window.handleLogout === 'function') {
      window.handleLogout();
    }
    const e = new Error('Your session has expired. Please sign in again.');
    e.status = 401;
    throw e;
  }

  // 423 EDIT_LOCKED is normally handled up-front (router intercepts /edit
  // routes; password is cached and auto-attached above). For inline edit
  // flows that aren't routed (FICA/POPIA inline panels, completed-ROA edits)
  // we fall back to a Save-time prompt so the user is never silently blocked.
  const isLocked = response.status === 423 ||
                   (data && data.code === 'EDIT_LOCKED');
  if (isLocked && method !== 'GET' && typeof EditLock !== 'undefined' && !cfg._noLockRetry) {
    const m = String(path).match(/\/api\/([^\/]+(?:\/[^\/]+)?)\/(\d+)/);
    const moduleName = m ? m[1].replace(/-/g, '_').replace(/\//g, '_') : 'record';
    const recordId   = m ? m[2] : '';
    const pw = await EditLock.requestUnlock({
      module:   moduleName,
      recordId,
      subject:  null,
      intent:   'save changes to',
    });
    if (!pw) {
      const cancel = new Error('Edit cancelled — admin password not provided.');
      cancel.status = 423;
      cancel.code = 'EDIT_CANCELLED';
      throw cancel;
    }
    // Cache for any follow-up PUTs in the same session.
    EditLock.setPassword(moduleName, recordId, pw);
    const retryBody = { ...(body || {}), _admin_password: pw };
    return apiFetch(method, path, retryBody, { isFormData, _noLockRetry: true });
  }

  if (!response.ok) {
    const msg =
      (data && (data.error || data.message || data.detail)) ||
      `Request failed with status ${response.status}.`;
    const e = new Error(msg);
    e.status = response.status;
    if (data && data.code) e.code = data.code;
    if (data) e.body = data;
    throw e;
  }

  // Clear the cached unlock password after a successful write so the next
  // Edit click re-prompts. The form's pending Save has already used the
  // password — there's no reason to keep it warm beyond this single request.
  if (_editLockHit && typeof EditLock !== 'undefined') {
    EditLock.clearPassword(_editLockHit.module, _editLockHit.recordId);
  }

  return data;
}

// ══════════════════════════════════════════════════════════════
//  Global Api namespace
// ══════════════════════════════════════════════════════════════

const Api = {

  // ── Authentication ────────────────────────────────────────────
  auth: {
    /** POST /api/auth/login */
    login(username, password) {
      return apiFetch('POST', '/api/auth/login', { username, password });
    },
    /** POST /api/auth/logout */
    logout() {
      return apiFetch('POST', '/api/auth/logout');
    },
    /** GET /api/auth/me — returns current user or 401 */
    me() {
      return apiFetch('GET', '/api/auth/me');
    },
    /** POST /api/auth/verify-password — verify password without re-login */
    verifyPassword(password) {
      return apiFetch('POST', '/api/auth/verify-password', { password });
    },
    /** POST /api/auth/login-2fa — second-step login with TOTP / recovery code.
     *  Pass `remember=true` to set a 30-day trusted-device cookie. */
    login2fa(code, remember) {
      return apiFetch('POST', '/api/auth/login-2fa', { code, remember: !!remember });
    },
    // Self-service profile
    profile()                        { return apiFetch('GET',  '/api/auth/profile'); },
    changePassword(current, next)    { return apiFetch('PUT',  '/api/auth/profile/password', { current_password: current, new_password: next }); },
    profile2faStatus()               { return apiFetch('GET',  '/api/auth/profile/2fa'); },
    profile2faEnroll()               { return apiFetch('POST', '/api/auth/profile/2fa/enroll'); },
    profile2faVerify(code)           { return apiFetch('POST', '/api/auth/profile/2fa/verify', { code }); },
    profile2faDisable(currentPwd)    { return apiFetch('POST', '/api/auth/profile/2fa/disable', { current_password: currentPwd }); },
  },

  // ── Contacts ─────────────────────────────────────────────────
  contacts: {
    /** GET /api/contacts?...params */
    list(params) {
      return apiFetch('GET', '/api/contacts' + buildQueryString(params));
    },
    /** GET /api/contacts/:id */
    get(id) {
      return apiFetch('GET', `/api/contacts/${id}`);
    },
    /** POST /api/contacts */
    create(data) {
      return apiFetch('POST', '/api/contacts', data);
    },
    /** PUT /api/contacts/:id */
    update(id, data) {
      return apiFetch('PUT', `/api/contacts/${id}`, data);
    },
    /** DELETE /api/contacts/:id */
    delete(id) {
      return apiFetch('DELETE', `/api/contacts/${id}`);
    },
    /** GET /api/contacts/:id/documents */
    documents(id) {
      return apiFetch('GET', `/api/contacts/${id}/documents`);
    },
  },

  // ── Accounts ─────────────────────────────────────────────────
  accounts: {
    list(params) {
      return apiFetch('GET', '/api/accounts' + buildQueryString(params));
    },
    get(id) {
      return apiFetch('GET', `/api/accounts/${id}`);
    },
    create(data) {
      return apiFetch('POST', '/api/accounts', data);
    },
    update(id, data) {
      return apiFetch('PUT', `/api/accounts/${id}`, data);
    },
    delete(id) {
      return apiFetch('DELETE', `/api/accounts/${id}`);
    },
    /** GET /api/accounts/:id/contacts */
    contacts(id) {
      return apiFetch('GET', `/api/accounts/${id}/contacts`);
    },
  },

  // ── Engagements ───────────────────────────────────────────────
  engagements: {
    list(params) {
      return apiFetch('GET', '/api/engagements' + buildQueryString(params));
    },
    get(id) {
      return apiFetch('GET', `/api/engagements/${id}`);
    },
    create(data) {
      return apiFetch('POST', '/api/engagements', data);
    },
    update(id, data) {
      return apiFetch('PUT', `/api/engagements/${id}`, data);
    },
    delete(id) {
      return apiFetch('DELETE', `/api/engagements/${id}`);
    },
  },

  // ── Policies ──────────────────────────────────────────────────
  policies: {
    list(params) {
      return apiFetch('GET', '/api/policies' + buildQueryString(params));
    },
    get(id) {
      return apiFetch('GET', `/api/policies/${id}`);
    },
    create(data) {
      return apiFetch('POST', '/api/policies', data);
    },
    update(id, data) {
      return apiFetch('PUT', `/api/policies/${id}`, data);
    },
    delete(id) {
      return apiFetch('DELETE', `/api/policies/${id}`);
    },
    /** GET /api/policies/:id/sections */
    sections(id) {
      return apiFetch('GET', `/api/policies/${id}/sections`);
    },
    /** Quotes */
    quotesList(policyId)            { return apiFetch('GET', `/api/policies/${policyId}/quotes`); },
    quoteUpload(policyId, formData) { return apiFetch('POST', `/api/policies/${policyId}/quotes`, formData, true); },
    quoteApprove(quoteId, data)     { return apiFetch('POST', `/api/policies/quotes/${quoteId}/approve`, data); },
    quoteDelete(quoteId)            { return apiFetch('DELETE', `/api/policies/quotes/${quoteId}`); },
    quoteViewUrl(quoteId)           { return `/api/policies/quotes/${quoteId}/view`; },
    quoteDownloadUrl(quoteId)       { return `/api/policies/quotes/${quoteId}/download`; },
    /** GET /api/policies/:id/claims */
    claims(id) {
      return apiFetch('GET', `/api/policies/${id}/claims`);
    },
    /** GET /api/policies/:id/asset-history */
    assetHistory(id) {
      return apiFetch('GET', `/api/policies/${id}/asset-history`);
    },
  },

  // ── Policy Sections ───────────────────────────────────────────
  policySections: {
    list(params) {
      return apiFetch('GET', '/api/policy-sections' + buildQueryString(params));
    },
    get(id) {
      return apiFetch('GET', `/api/policy-sections/${id}`);
    },
    create(data) {
      return apiFetch('POST', '/api/policy-sections', data);
    },
    update(id, data) {
      return apiFetch('PUT', `/api/policy-sections/${id}`, data);
    },
    delete(id) {
      return apiFetch('DELETE', `/api/policy-sections/${id}`);
    },
  },

  // ── Assets ────────────────────────────────────────────────────
  assets: {
    list(params) {
      return apiFetch('GET', '/api/assets' + buildQueryString(params));
    },
    get(id) {
      return apiFetch('GET', `/api/assets/${id}`);
    },
    create(data) {
      return apiFetch('POST', '/api/assets', data);
    },
    update(id, data) {
      return apiFetch('PUT', `/api/assets/${id}`, data);
    },
    delete(id) {
      return apiFetch('DELETE', `/api/assets/${id}`);
    },
  },

  // ── Risk Details ──────────────────────────────────────────────
  riskDetails: {
    list(params) {
      return apiFetch('GET', '/api/risk-details' + buildQueryString(params));
    },
    get(id) {
      return apiFetch('GET', `/api/risk-details/${id}`);
    },
    create(data) {
      return apiFetch('POST', '/api/risk-details', data);
    },
    update(id, data) {
      return apiFetch('PUT', `/api/risk-details/${id}`, data);
    },
    delete(id) {
      return apiFetch('DELETE', `/api/risk-details/${id}`);
    },
  },

  // ── Claims ────────────────────────────────────────────────────
  claims: {
    list(params) {
      return apiFetch('GET', '/api/claims' + buildQueryString(params));
    },
    get(id) {
      return apiFetch('GET', `/api/claims/${id}`);
    },
    create(data) {
      return apiFetch('POST', '/api/claims', data);
    },
    update(id, data) {
      return apiFetch('PUT', `/api/claims/${id}`, data);
    },
    delete(id) {
      return apiFetch('DELETE', `/api/claims/${id}`);
    },
    reopen(id) {
      return apiFetch('POST', `/api/claims/${id}/reopen`);
    },
    // Claim Notes
    notesList(claimId) {
      return apiFetch('GET', `/api/claims/${claimId}/notes`);
    },
    notesCreate(claimId, data) {
      return apiFetch('POST', `/api/claims/${claimId}/notes`, data);
    },
    notesDelete(claimId, noteId) {
      return apiFetch('DELETE', `/api/claims/${claimId}/notes/${noteId}`);
    },
    // Claim Third Parties
    thirdPartiesList(claimId) {
      return apiFetch('GET', `/api/claims/${claimId}/third-parties`);
    },
    thirdPartiesCreate(claimId, data) {
      return apiFetch('POST', `/api/claims/${claimId}/third-parties`, data);
    },
    thirdPartiesUpdate(claimId, tpId, data) {
      return apiFetch('PUT', `/api/claims/${claimId}/third-parties/${tpId}`, data);
    },
    thirdPartiesDelete(claimId, tpId) {
      return apiFetch('DELETE', `/api/claims/${claimId}/third-parties/${tpId}`);
    },
  },

  // ── Advice Records ────────────────────────────────────────────
  adviceRecords: {
    list(params) {
      return apiFetch('GET', '/api/advice-records' + buildQueryString(params));
    },
    get(id) {
      return apiFetch('GET', `/api/advice-records/${id}`);
    },
    create(data) {
      return apiFetch('POST', '/api/advice-records', data);
    },
    update(id, data) {
      return apiFetch('PUT', `/api/advice-records/${id}`, data);
    },
    delete(id) {
      return apiFetch('DELETE', `/api/advice-records/${id}`);
    },
    sendRoa(id, data) {
      return apiFetch('POST', `/api/advice-records/${id}/send-roa`, data);
    },
    complete(id) {
      return apiFetch('POST', `/api/advice-records/${id}/complete`);
    },
  },

  // ── Complaints ────────────────────────────────────────────────
  complaints: {
    list(params) {
      return apiFetch('GET', '/api/complaints' + buildQueryString(params));
    },
    get(id) {
      return apiFetch('GET', `/api/complaints/${id}`);
    },
    create(data) {
      return apiFetch('POST', '/api/complaints', data);
    },
    withdraw(id, reason) {
      return apiFetch('POST', `/api/complaints/${id}/withdraw`, { reason });
    },
    activeAlerts() {
      return apiFetch('GET', '/api/complaints/alerts/active');
    },
    update(id, data) {
      return apiFetch('PUT', `/api/complaints/${id}`, data);
    },
    delete(id) {
      return apiFetch('DELETE', `/api/complaints/${id}`);
    },
  },

  // ── Reviews ───────────────────────────────────────────────────
  reviews: {
    list(params) {
      return apiFetch('GET', '/api/reviews' + buildQueryString(params));
    },
    get(id) {
      return apiFetch('GET', `/api/reviews/${id}`);
    },
    create(data) {
      return apiFetch('POST', '/api/reviews', data);
    },
    update(id, data) {
      return apiFetch('PUT', `/api/reviews/${id}`, data);
    },
    delete(id) {
      return apiFetch('DELETE', `/api/reviews/${id}`);
    },
  },

  // ── Documents ─────────────────────────────────────────────────
  documents: {
    /**
     * POST /api/documents/upload  (multipart/form-data)
     * @param {FormData} formData
     */
    upload(formDataOrModule, recordId, file, description) {
      let formData = formDataOrModule;
      if (!(formDataOrModule instanceof FormData)) {
        formData = new FormData();
        formData.append('file', file);
        formData.append('module', formDataOrModule);
        formData.append('record_id', String(recordId));
        if (description) formData.append('description', description);
      }
      return apiFetch('POST', '/api/documents/upload', formData, true);
    },
    /** GET /api/documents?...params */
    list(params, recordId) {
      if (typeof params === 'string') {
        params = { module: params, record_id: recordId };
      }
      return apiFetch('GET', '/api/documents' + buildQueryString(params));
    },
    /** DELETE /api/documents/:id */
    delete(id) {
      return apiFetch('DELETE', `/api/documents/${id}`);
    },
    /** Return the direct view URL for a document. */
    viewUrl(id) {
      return `/api/documents/${id}/view`;
    },
    /** Return the direct download URL for a document. */
    downloadUrl(id) {
      return `/api/documents/${id}/download`;
    },
  },

  // ── Reports ───────────────────────────────────────────────────
  reports: {
    /** GET /api/reports/predefined — list available predefined reports */
    predefined() {
      return apiFetch('GET', '/api/reports/predefined');
    },
    /** POST /api/reports/predefined/:key/run — run a predefined report */
    runPredefined(key, params) {
      return apiFetch('POST', `/api/reports/predefined/${key}/run`, params || {});
    },
    /**
     * POST /api/reports/predefined/:key/export-csv
     * Returns the raw fetch Response so the caller can trigger a file download.
     */
    exportPredefinedCsv(key, params) {
      return apiFetch('POST', `/api/reports/predefined/${key}/export-csv`, params || {});
    },
    /** POST /api/reports/custom/run — run an ad-hoc report */
    runCustom(config) {
      return apiFetch('POST', '/api/reports/custom/run', config);
    },
    /** POST /api/reports/custom/export-csv */
    exportCustomCsv(config) {
      return apiFetch('POST', '/api/reports/custom/export-csv', config);
    },
    /** POST /api/reports/custom/export-pdf */
    exportCustomPdf(config) {
      return apiFetch('POST', '/api/reports/custom/export-pdf', config);
    },
    /** POST /api/reports/custom/ai-query */
    aiQuery(query) {
      return apiFetch('POST', '/api/reports/custom/ai-query', { query });
    },
    /** GET /api/reports/saved */
    savedList() {
      return apiFetch('GET', '/api/reports/saved');
    },
    /** POST /api/reports/saved */
    savedCreate(data) {
      return apiFetch('POST', '/api/reports/saved', data);
    },
    /** PUT /api/reports/saved/:id */
    savedUpdate(id, data) {
      return apiFetch('PUT', `/api/reports/saved/${id}`, data);
    },
    /** DELETE /api/reports/saved/:id */
    savedDelete(id) {
      return apiFetch('DELETE', `/api/reports/saved/${id}`);
    },
    /** POST /api/reports/saved/:id/run */
    savedRun(id, overrides) {
      return apiFetch('POST', `/api/reports/saved/${id}/run`, overrides || {});
    },
  },

  // ── Workflows ─────────────────────────────────────────────────
  workflows: {
    list(params)   { return apiFetch('GET',    '/api/workflows' + buildQueryString(params)); },
    get(id)        { return apiFetch('GET',   `/api/workflows/${id}`); },
    create(data)   { return apiFetch('POST',   '/api/workflows', data); },
    update(id, d)  { return apiFetch('PUT',   `/api/workflows/${id}`, d); },
    delete(id)     { return apiFetch('DELETE',`/api/workflows/${id}`); },
    notesList(id)                { return apiFetch('GET',   `/api/workflows/${id}/notes`); },
    notesCreate(id, data)        { return apiFetch('POST',  `/api/workflows/${id}/notes`, data); },
    notesDelete(id, noteId)      { return apiFetch('DELETE',`/api/workflows/${id}/notes/${noteId}`); },
  },

  // ── Timeline ──────────────────────────────────────────────────
  timeline: {
    /** GET /api/timeline?module=X&record_id=Y */
    forRecord(module, recordId) {
      return apiFetch('GET', `/api/timeline?module=${encodeURIComponent(module)}&record_id=${encodeURIComponent(recordId)}`);
    },
    /** GET /api/timeline/contact/:id — all activity for a contact + linked records */
    forContact(id) {
      return apiFetch('GET', `/api/timeline/contact/${id}`);
    },
    /** GET /api/timeline/account/:id — all activity for an account + linked records */
    forAccount(id) {
      return apiFetch('GET', `/api/timeline/account/${id}`);
    },
  },

  // ── Settings ──────────────────────────────────────────────────
  settings: {
    get()           { return apiFetch('GET', '/api/settings'); },
    save(data)      { return apiFetch('PUT', '/api/settings', data); },
    testEmail()     { return apiFetch('POST', '/api/settings/test-email'); },
    sendEmail(data) { return apiFetch('POST', '/api/settings/send-email', data); },
    signatures()    { return apiFetch('GET', '/api/settings/signatures'); },
    claimForms()    { return apiFetch('GET', '/api/settings/claim-forms'); },
    securityPublic(){ return apiFetch('GET', '/api/settings/security-public'); },
    // Company details + documents
    companyGet()                      { return apiFetch('GET',    '/api/settings/company'); },
    companySave(data)                 { return apiFetch('PUT',    '/api/settings/company', data); },
    companyDocs()                     { return apiFetch('GET',    '/api/settings/company/documents'); },
    companyDocUpload(formData)        { return apiFetch('POST',   '/api/settings/company/documents', formData, true); },
    companyDocDelete(name)            { return apiFetch('DELETE', `/api/settings/company/documents/${encodeURIComponent(name)}`); },
    companyDocUrl(name)               { return `/api/settings/company/documents/${encodeURIComponent(name)}`; },
    companyDocViewUrl(name)           { return `/api/settings/company/documents/${encodeURIComponent(name)}/view`; },
    // Email templates (all authenticated users)
    listTemplates()            { return apiFetch('GET', '/api/settings/templates'); },
    saveTemplate(key, data)    { return apiFetch('PUT', `/api/settings/templates/${key}`, data); },
    deleteTemplate(key)        { return apiFetch('DELETE', `/api/settings/templates/${key}`); },
  },

  // ── View Preferences (per-user list-view columns + sort) ──────
  viewPrefs: {
    /** GET /api/view-prefs/:module — catalog + user's current config */
    get(moduleKey)          { return apiFetch('GET',    `/api/view-prefs/${encodeURIComponent(moduleKey)}`); },
    /** PUT /api/view-prefs/:module — save the user's config */
    save(moduleKey, config) { return apiFetch('PUT',    `/api/view-prefs/${encodeURIComponent(moduleKey)}`, { config }); },
    /** DELETE /api/view-prefs/:module — reset to default */
    reset(moduleKey)        { return apiFetch('DELETE', `/api/view-prefs/${encodeURIComponent(moduleKey)}`); },
  },

  // ── Dashboard (user-configurable widgets) ─────────────────────
  dashboard: {
    /** GET /api/dashboard/catalog */
    catalog()       { return apiFetch('GET',  '/api/dashboard/catalog'); },
    /** GET /api/dashboard/config — current user's layout */
    getConfig()     { return apiFetch('GET',  '/api/dashboard/config'); },
    /** PUT /api/dashboard/config */
    saveConfig(config) {
      return apiFetch('PUT', '/api/dashboard/config', { config });
    },
    /** POST /api/dashboard/config/reset */
    resetConfig()   { return apiFetch('POST', '/api/dashboard/config/reset'); },
    /** GET /api/dashboard/default — company default layout */
    getDefault()    { return apiFetch('GET',  '/api/dashboard/default'); },
    /** PUT /api/dashboard/default (admin only) */
    saveDefault(config) {
      return apiFetch('PUT', '/api/dashboard/default', { config });
    },
    /** POST /api/dashboard/data — batch-fetch widget data */
    data(widgetIds) {
      return apiFetch('POST', '/api/dashboard/data', { widgetIds });
    },
  },

  // ── Admin ─────────────────────────────────────────────────────
  admin: {
    /** GET /api/admin/users */
    users() {
      return apiFetch('GET', '/api/admin/users');
    },
    /** POST /api/admin/users */
    createUser(data) {
      return apiFetch('POST', '/api/admin/users', data);
    },
    /** PUT /api/admin/users/:id */
    updateUser(id, data) {
      return apiFetch('PUT', `/api/admin/users/${id}`, data);
    },
    /** DELETE /api/admin/users/:id */
    deleteUser(id) {
      return apiFetch('DELETE', `/api/admin/users/${id}`);
    },
    /** GET /api/admin/users/:id/broker-codes */
    listBrokerCodes(userId) {
      return apiFetch('GET', `/api/admin/users/${userId}/broker-codes`);
    },
    /** POST /api/admin/users/:id/broker-codes */
    createBrokerCode(userId, data) {
      return apiFetch('POST', `/api/admin/users/${userId}/broker-codes`, data);
    },
    /** PUT /api/admin/broker-codes/:id */
    updateBrokerCode(id, data) {
      return apiFetch('PUT', `/api/admin/broker-codes/${id}`, data);
    },
    /** DELETE /api/admin/broker-codes/:id */
    deleteBrokerCode(id) {
      return apiFetch('DELETE', `/api/admin/broker-codes/${id}`);
    },
    /** GET /api/admin/audit-log?...params */
    auditLog(params) {
      return apiFetch('GET', '/api/admin/audit-log' + buildQueryString(params));
    },
    /** GET /api/admin/dashboard-stats */
    dashboardStats() {
      return apiFetch('GET', '/api/admin/dashboard-stats');
    },
    chartData()      { return apiFetch('GET', '/api/admin/chart-data'); },
    /** GET /api/admin/exportable-modules */
    exportableModules() {
      return apiFetch('GET', '/api/admin/exportable-modules');
    },
    /** Returns the download URL for a module CSV export. */
    exportModuleUrl(moduleKey) {
      return `/api/admin/export/${encodeURIComponent(moduleKey)}`;
    },
    /** Returns the download URL for a module Excel (.xlsx) export. */
    exportModuleXlsxUrl(moduleKey) {
      return `/api/admin/export-xlsx/${encodeURIComponent(moduleKey)}`;
    },
    // ── OTP (Security tab) ──
    listOtps()                 { return apiFetch('GET', '/api/admin/otps'); },
    createOtp(data)            { return apiFetch('POST', '/api/admin/otps', data); },
    revokeOtp(id)              { return apiFetch('POST', `/api/admin/otps/${id}/revoke`); },
    // ── 2FA (per user) ──
    twoFaStatus(userId)        { return apiFetch('GET',  `/api/admin/users/${userId}/2fa`); },
    twoFaEnroll(userId)        { return apiFetch('POST', `/api/admin/users/${userId}/2fa/enroll`); },
    twoFaVerify(userId, code)  { return apiFetch('POST', `/api/admin/users/${userId}/2fa/verify`, { code }); },
    twoFaDisable(userId)       { return apiFetch('POST', `/api/admin/users/${userId}/2fa/disable`); },
    twoFaRecoveryCodes(userId) { return apiFetch('GET',  `/api/admin/users/${userId}/2fa/recovery-codes`); },
    twoFaRegenCodes(userId)    { return apiFetch('POST', `/api/admin/users/${userId}/2fa/regenerate-codes`); },
    // ── System Update ──
    systemStatus()             { return apiFetch('GET',  '/api/admin/system/status'); },
    systemCheckUpdates()       { return apiFetch('POST', '/api/admin/system/check-updates'); },
    systemApplyUpdate(opts)    { return apiFetch('POST', '/api/admin/system/apply', opts || {}); },
    systemRollback(snapshotId) { return apiFetch('POST', '/api/admin/system/rollback', snapshotId ? { snapshotId } : {}); },
    systemSnapshots()          { return apiFetch('GET',  '/api/admin/system/snapshots'); },
    /** Triggers a browser download of a fresh DB snapshot. Not a JSON call. */
    systemBackupUrl()          { return '/api/admin/system/backup'; },
    /** Uploads a .db file to replace the live database. The current DB
     *  is snapshotted first so the restore can be rolled back. */
    systemRestore(file) {
      const fd = new FormData();
      fd.append('dbfile', file);
      return apiFetch('POST', '/api/admin/system/restore', fd, { isFormData: true });
    },
  },

  // ── POPIA ─────────────────────────────────────────────────────
  popia: {
    options()                 { return apiFetch('GET', '/api/popia/options'); },
    list()                    { return apiFetch('GET', '/api/popia/list'); },
    getContact(contactId)     { return apiFetch('GET', `/api/popia/contact/${contactId}`); },
    updateContact(cId, data)  { return apiFetch('PUT', `/api/popia/contact/${cId}`, data); },
    createRequest(cId, data)  { return apiFetch('POST', `/api/popia/contact/${cId}/requests`, data); },
    getAccount(accountId)     { return apiFetch('GET', `/api/popia/account/${accountId}`); },
    updateAccount(aId, data)  { return apiFetch('PUT', `/api/popia/account/${aId}`, data); },
    createAccountRequest(aId, data) { return apiFetch('POST', `/api/popia/account/${aId}/requests`, data); },
    updateRequest(rId, data)  { return apiFetch('PUT', `/api/popia/requests/${rId}`, data); },
    deleteRequest(rId)        { return apiFetch('DELETE', `/api/popia/requests/${rId}`); },
    listBreaches()            { return apiFetch('GET', '/api/popia/breaches'); },
    breachRecipients(params)  { return apiFetch('GET', '/api/popia/breach-recipients' + buildQueryString(params)); },
    complianceReport()        { return apiFetch('GET', '/api/popia/compliance-report'); },
    getBreach(id)             { return apiFetch('GET', `/api/popia/breaches/${id}`); },
    createBreach(data)        { return apiFetch('POST', '/api/popia/breaches', data); },
    updateBreach(id, data)    { return apiFetch('PUT', `/api/popia/breaches/${id}`, data); },
  },

  // ── FICA ──────────────────────────────────────────────────────
  fica: {
    options()                 { return apiFetch('GET', '/api/fica/options'); },
    list()                    { return apiFetch('GET', '/api/fica/list'); },
    getContact(contactId)     { return apiFetch('GET', `/api/fica/contact/${contactId}`); },
    updateContact(cId, data)  { return apiFetch('PUT', `/api/fica/contact/${cId}`, data); },
    getAccount(accountId)     { return apiFetch('GET', `/api/fica/account/${accountId}`); },
    updateAccount(aId, data)  { return apiFetch('PUT', `/api/fica/account/${aId}`, data); },
    complianceReport()        { return apiFetch('GET', '/api/fica/compliance-report'); },
  },

  // ── Broker Profiles ───────────────────────────────────────────
  brokerProfiles: {
    list()                    { return apiFetch('GET', '/api/broker-profiles'); },
    me()                      { return apiFetch('GET', '/api/broker-profiles/me'); },
    getByUser(userId)         { return apiFetch('GET', `/api/broker-profiles/user/${userId}`); },
    get(id)                   { return apiFetch('GET', `/api/broker-profiles/${id}`); },
    create(data)              { return apiFetch('POST', '/api/broker-profiles', data); },
    update(id, data)          { return apiFetch('PUT', `/api/broker-profiles/${id}`, data); },
    cpdList(id)               { return apiFetch('GET', `/api/broker-profiles/${id}/cpd`); },
    cpdCreate(id, data)       { return apiFetch('POST', `/api/broker-profiles/${id}/cpd`, data); },
    cpdUpdate(cpdId, data)    { return apiFetch('PUT', `/api/broker-profiles/cpd/${cpdId}`, data); },
    cpdDelete(cpdId)          { return apiFetch('DELETE', `/api/broker-profiles/cpd/${cpdId}`); },
    auditReport(id, params)   { return apiFetch('GET', `/api/broker-profiles/${id}/audit-report` + buildQueryString(params)); },
    myAlerts()                { return apiFetch('GET', '/api/broker-profiles/me/alerts'); },
    alerts(id)                { return apiFetch('GET', `/api/broker-profiles/${id}/alerts`); },
    runAlerts()               { return apiFetch('POST', '/api/broker-profiles/admin/run-alerts'); },
    runDigest()               { return apiFetch('POST', '/api/broker-profiles/admin/run-digest'); },
  },

  // ── Notifications ─────────────────────────────────────────────
  notifications: {
    list(params)              { return apiFetch('GET', '/api/notifications' + buildQueryString(params)); },
    unreadCount()             { return apiFetch('GET', '/api/notifications/unread-count'); },
    read(id)                  { return apiFetch('POST', `/api/notifications/${id}/read`); },
    readAll()                 { return apiFetch('POST', '/api/notifications/read-all'); },
    dismiss(id)               { return apiFetch('POST', `/api/notifications/${id}/dismiss`); },
    clearDismissed()          { return apiFetch('POST', '/api/notifications/clear-dismissed'); },
    adminBroadcast(payload)   { return apiFetch('POST', '/api/admin/notifications/broadcast', payload); },
    adminBroadcastHistory()   { return apiFetch('GET',  '/api/admin/notifications/broadcast-history'); },
    adminSystemHistory()      { return apiFetch('GET',  '/api/admin/notifications/system-history'); },
  },

  // ── Products ──────────────────────────────────────────────────
  products: {
    options()                 { return apiFetch('GET', '/api/products/options'); },
    list(params)              { return apiFetch('GET', '/api/products' + buildQueryString(params)); },
    get(id)                   { return apiFetch('GET', `/api/products/${id}`); },
    create(data)              { return apiFetch('POST', '/api/products', data); },
    update(id, data)          { return apiFetch('PUT', `/api/products/${id}`, data); },
    delete(id)                { return apiFetch('DELETE', `/api/products/${id}`); },
    checkSuitability(data)    { return apiFetch('POST', '/api/products/check-suitability', data); },
  },

  // ── Post-Sale Events ──────────────────────────────────────────
  postSaleEvents: {
    options()                 { return apiFetch('GET', '/api/post-sale-events/options'); },
    list(params)              { return apiFetch('GET', '/api/post-sale-events' + buildQueryString(params)); },
    get(id)                   { return apiFetch('GET', `/api/post-sale-events/${id}`); },
    create(data)              { return apiFetch('POST', '/api/post-sale-events', data); },
    update(id, data)          { return apiFetch('PUT', `/api/post-sale-events/${id}`, data); },
    delete(id)                { return apiFetch('DELETE', `/api/post-sale-events/${id}`); },
    barriers()                { return apiFetch('GET', '/api/post-sale-events/barriers'); },
  },

  // ── Commission Log ────────────────────────────────────────────
  commissionLog: {
    options()                 { return apiFetch('GET', '/api/commission-log/options'); },
    list(params)              { return apiFetch('GET', '/api/commission-log' + buildQueryString(params)); },
    get(id)                   { return apiFetch('GET', `/api/commission-log/${id}`); },
    create(data)              { return apiFetch('POST', '/api/commission-log', data); },
    update(id, data)          { return apiFetch('PUT', `/api/commission-log/${id}`, data); },
    delete(id)                { return apiFetch('DELETE', `/api/commission-log/${id}`); },
  },

  // ── TCF MI Dashboard ──────────────────────────────────────────
  tcf: {
    metrics()                 { return apiFetch('GET', '/api/tcf/metrics'); },
    evidencePackUrl()         { return '/api/tcf/evidence-pack'; },
  },
};
