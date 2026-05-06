/* ═══════════════════════════════════════════════════════════════════════════
   Reports component  —  Predefined Reports + Custom Report Builder
   ═══════════════════════════════════════════════════════════════════════════ */

const Reports = (() => {

  // ── Module-level state ───────────────────────────────────────────────────

  // Custom builder wizard state
  const _wizard = {
    step: 1,
    source: '',
    columns: [],
    allColumns: [],
    filters: [],
    filterLogic: 'AND',
    joins: [],
    joinFields: {},
    sortField: '',
    sortDir: 'asc',
    groupField: '',
    results: null,
    resultsPage: 1,
  };

  // Predefined results keyed by report key
  const _preResults = {};

  // Saved reports list cache
  let _savedReports = [];

  // Admin users cache (for broker filter)
  let _adminUsers = [];

  // ── Data-source field definitions ────────────────────────────────────────

  // NOTE: keep this list in sync with server/routes/reports.js → SOURCE_FIELDS.
  // Removed broken advice_records fields that don't exist in the schema:
  //   client_understood_advice, client_decline_reason, replacement_product_*,
  //   financial_interest_*, fais_disclosure_given, popi_disclosure_given,
  //   status, advice_notes.
  const SOURCE_FIELDS = {
    contacts: [
      'id','full_name','first_name','last_name','title','gender','language',
      'marital_status','occupation','employer','income_band','nationality',
      'email','mobile','work_number','preferred_communication',
      'date_of_birth','sa_id_number','passport_number','alternative_id_type','next_of_kin',
      'contact_type','client_category','client_segment','existing_client',
      'date_became_client','contact_status','primary_client_record',
      'assigned_broker_id','assigned_admin_id','related_account_id',
      'source_of_lead',
      'physical_address','postal_address',
      'phys_street_address','phys_complex_building','phys_suburb','phys_city','phys_province','phys_postal_code','phys_country','phys_gps_lat','phys_gps_lng',
      'post_street_address','post_complex_building','post_suburb','post_city','post_province','post_postal_code','post_country',
      'dl_codes','dl_restrictions','dl_first_issue_date',
      'data_processing_basis','consent_method','consent_scope','direct_marketing_consent',
      'data_source','data_categories_held','third_party_sharing','third_party_sharing_notes',
      'retention_period_years','retention_expiry_date','information_officer_id',
      'privacy_notice_provided','privacy_notice_date',
      'popia_consent_obtained','popia_consent_date',
      'fica_status','fica_verification_date','fica_verification_method','fica_document_reference',
      'fica_verified_by_id','fica_five_year_expiry','fica_re_verification_date',
      'fica_cipc_number','fica_beneficial_owner_confirmed','fica_pep_check','fica_pep_check_date',
      'conduct_risk_flag','conduct_risk_notes',
      'last_activity_date','last_review_date','next_review_date',
      'notes','created_by','created_at','updated_at',
    ],
    accounts: [
      'id','account_name','registration_number','vat_number','industry','business_type',
      'number_of_employees','annual_turnover_band',
      'main_contact_id','assigned_broker_id','assigned_admin_id','client_status',
      'physical_address','postal_address',
      'phys_street_address','phys_complex_building','phys_suburb','phys_city','phys_province','phys_postal_code','phys_country','phys_gps_lat','phys_gps_lng',
      'post_street_address','post_complex_building','post_suburb','post_city','post_province','post_postal_code','post_country',
      'data_processing_basis','popia_consent_obtained','popia_consent_date','consent_method','consent_scope',
      'direct_marketing_consent','data_source','data_categories_held','third_party_sharing',
      'third_party_sharing_notes','retention_period_years','retention_expiry_date',
      'information_officer_id','privacy_notice_provided','privacy_notice_date',
      'fica_status','fica_verification_date','fica_verification_method','fica_document_reference',
      'fica_verified_by_id','fica_five_year_expiry','fica_re_verification_date',
      'fica_cipc_number','fica_beneficial_owner_confirmed','fica_pep_check','fica_pep_check_date',
      'date_became_client','last_activity_date','last_review_date','next_review_date',
      'notes','created_by','created_at','updated_at',
    ],
    policies: [
      'id','policy_name','policy_number','contact_id','account_id','engagement_id','advice_record_id',
      'co_insured','co_insured_id_number','co_insured_contact_id','other_contact_ids',
      'insurer','product_id','product_category','policy_type','cover_description',
      'premium','currency',
      'inception_date','renewal_date','policy_status',
      'payment_method','premium_frequency','debit_order_date',
      'bank_name','branch_code','account_type','account_holder_name',
      'mandate_status','mandate_auth_date','debit_order_reference',
      'broker_code_id','broker_code_snapshot','broker_code_description_snapshot',
      'assigned_broker_id','assigned_admin_id',
      'disclosure_completed','last_review_date','next_review_date',
      'amendment_count','claims_count',
      'cancellation_date','cancellation_reason','replacement_policy_id',
      'notes','created_by','created_at','updated_at',
    ],
    policy_sections: [
      'id','asset_name','asset_type','asset_status','asset_section','item_number',
      'contact_id','account_id','policy_id','policy_section_id','product_id','currency',
      'registration_number','vin_number','engine_number','make','model','year',
      'serial_number','mm_number','fleet_number',
      'address','complex_building','suburb','city','province','postal_code','country','gps_lat','gps_lng',
      'sum_insured','sum_insured_premium','asset_value','premium','sasria',
      'excess','excess_pct_claim','excess_pct_insured','minimum_excess',
      'date_acquired','date_sold',
      'use_type','vehicle_use','gvm','tracking_device','tracker_fitted','territory','cover_type','regular_driver','credit_shortfall',
      'parking_type','parking_other',
      'construction_type','roof_type','occupancy','flat_no_floors','perils_covered','subsidence_cover','geyser_cover','security_measures',
      'contents_category','unspecified_items','specified_items','theft_extension','power_surge_cover',
      'stock_category','declaration_basis','cold_storage','avg_stock_value','max_stock_value',
      'replacement_value','portable','maintenance_contract','breakdown_cover',
      'vessel_name','vessel_type','hull_length','motor_details','mooring','navigational_limits','skipper_qualification',
      'breed','gender','animal_count','identification_method','premises_address',
      'commodity','conveyance_type','route','max_single_load',
      'limit_of_indemnity','aggregate_limit','business_activity','turnover','employee_count','retroactive_date','trigger_basis','defence_costs',
      'basis_of_cover',
      'additional_covers','vehicle_extras','extras_in_total','excesses','related_contacts',
      'conditions','extensions','exclusions',
      'financial_interest_noted','financial_institution','finance_contract_number','contract_expiry_date',
      'notes','created_by','created_at','updated_at',
    ],
    assets: [
      'id','asset_name','asset_type','asset_status','asset_section','item_number',
      'contact_id','account_id','policy_id','policy_section_id','product_id','currency',
      'registration_number','vin_number','engine_number','make','model','year',
      'serial_number','mm_number','fleet_number',
      'address','complex_building','suburb','city','province','postal_code','country','gps_lat','gps_lng',
      'sum_insured','sum_insured_premium','asset_value','premium','sasria',
      'excess','excess_pct_claim','excess_pct_insured','minimum_excess',
      'date_acquired','date_sold',
      'use_type','vehicle_use','gvm','tracking_device','tracker_fitted','territory','cover_type','regular_driver','credit_shortfall',
      'parking_type','parking_other',
      'construction_type','roof_type','occupancy','flat_no_floors','perils_covered','subsidence_cover','geyser_cover','security_measures',
      'contents_category','unspecified_items','specified_items','theft_extension','power_surge_cover',
      'stock_category','declaration_basis','cold_storage','avg_stock_value','max_stock_value',
      'replacement_value','portable','maintenance_contract','breakdown_cover',
      'vessel_name','vessel_type','hull_length','motor_details','mooring','navigational_limits','skipper_qualification',
      'breed','gender','animal_count','identification_method','premises_address',
      'commodity','conveyance_type','route','max_single_load',
      'limit_of_indemnity','aggregate_limit','business_activity','turnover','employee_count','retroactive_date','trigger_basis','defence_costs',
      'basis_of_cover',
      'additional_covers','vehicle_extras','extras_in_total','excesses','related_contacts',
      'conditions','extensions','exclusions',
      'financial_interest_noted','financial_institution','finance_contract_number','contract_expiry_date',
      'notes','created_by','created_at','updated_at',
    ],
    claims: [
      'id','claim_number','claim_reference_number','claim_category','claim_type',
      'contact_id','account_id','policy_id','policy_section_id','asset_id',
      'broker_id','claims_handler_admin_id','claims_handler_name',
      'claim_date','date_reported','insurer_assessment_date',
      'incident_description','estimated_value','currency','claim_status',
      'client_kept_informed','last_client_update_date',
      'delay_flag','fair_process_concern',
      'dispute_raised','dispute_details','broker_dispute_action',
      'settlement_amount','settlement_date',
      'rejection_reason','repudiation_reason','repudiation_reason_notes',
      'outcome_notes','outcome_vs_roa_expectation',
      'post_claim_satisfaction','complaint_arising','related_advice_record_id',
      'excess','excess_pct_claim','excess_pct_insured','minimum_excess',
      'driver_name','driver_id_number','driver_licence_number','driver_licence_code',
      'driver_cell','driver_relationship','driver_date_of_birth','driver_years_experience',
      'claim_related_contacts',
      'notes','created_by','created_at','updated_at',
    ],
    client_engagements: [
      'id','engagement_name','contact_id','account_id','assigned_broker_id','assigned_admin_id',
      'stage','engagement_type','source_of_lead','currency',
      'current_insurer','current_premium','existing_cover_summary','identified_risks',
      'client_needs_summary','risk_priority',
      'fact_find_completed','needs_analysis_completed','proposal_prepared',
      'advice_presented','disclosure_completed','policy_wording_provided',
      'key_risks_explained','excess_explained','premium_explained','limitations_explained',
      'client_questions_answered',
      'fsp_licence_disclosed','broker_identity_disclosed',
      'product_costs_disclosed','product_costs_disclosed_notes',
      'material_risks_disclosed','material_risks_disclosed_notes',
      'complaints_process_disclosed','disclosure_method','disclosure_timestamp','disclosing_broker_id',
      'client_decision','decline_reason','inception_date','expected_premium',
      'suitability_confirmed','client_understanding_confirmed',
      'alternative_options_considered',
      'conduct_concern_flag','conduct_notes',
      'notes','created_by','created_at','updated_at',
    ],
    risk_details: [
      'id','risk_detail_name','policy_section_id','asset_id','policy_id','contact_id','account_id',
      'risk_type','occupancy_use','security_details','construction_type',
      'roof_construction','wall_construction','stored_parked_overnight',
      'tracking_device_fitted','route_operating_area','distance_to_water','flood_exposure',
      'fire_exposure','goods_load_type','maximum_exposure_value',
      'risk_notes','last_updated','created_by','created_at','updated_at',
    ],
    complaints: [
      'id','complaint_number','contact_id','account_id','policy_id','claim_id',
      'broker_id','complaint_owner_id','assigned_handler_id','assigned_to_id',
      'complaint_date','received_via','complaint_category','complaint_sub_category',
      'severity_rating','complaint_summary','detailed_complaint','complaint_status',
      'acknowledgment_date','acknowledgment_method','target_resolution_date','response_due_date',
      'supervisor_notified','supervisor_notified_at','handler_notified_at',
      'alert_day3_sent','alert_day3_sent_at','alert_day21_sent','alert_day21_sent_at',
      'alert_day30_sent','alert_day30_sent_at','escalated_to_critical_at',
      'senior_management_notified','senior_management_notified_at',
      'resolution_date','resolution_summary','resolution_outcome','remedy_provided',
      'compensation_paid','client_acceptance','fair_outcome_achieved',
      'root_cause_identified','root_cause_category','corrective_action_taken',
      'process_change_triggered','process_change_notes',
      'complaint_escalated_internally','external_ombud_escalation','fsca_reportable',
      'withdrawn','withdrawn_at','withdrawn_by_id','withdrawn_reason',
      'notes','created_by','created_at','updated_at',
    ],
    reviews: [
      'id','review_number','contact_id','account_id','policy_id','broker_id','assigned_admin_id',
      'review_type','review_date','review_outcome',
      'changes_in_risk_profile','changes_in_assets_exposure','gaps_identified',
      'recommendations','follow_up_actions','next_review_date','review_completed',
      'advice_record_required','linked_advice_record_id',
      'notes','created_by','created_at','updated_at',
    ],
    advice_records: [
      'id','advice_record_number','contact_id','account_id','engagement_id','policy_id','product_id',
      'broker_id','prepared_by_id','advice_date','advice_type','trigger_event','currency',
      'client_risk_appetite','total_financial_exposure','client_needs_identified',
      'risk_analysis_summary','current_cover_considered','existing_cover_summary_auto',
      'shortfalls_identified','identified_gaps','identified_gaps_notes',
      'recommendation_given','recommendation_rationale',
      'alternative_options_considered','alternatives_considered_list',
      'reason_product_suitable','consequences_of_not_proceeding',
      'suitability_match_score','suitability_override_reason',
      'risks_explained','costs_explained','excess_explained',
      'waiting_period_limitations_explained','exclusions_explained',
      'client_understanding_confirmed','fair_outcome_considered',
      'conflict_of_interest_flag','conflict_of_interest_description',
      'commission_disclosed','commission_rate_type','commission_rate_value',
      'client_decision','decision_date','decision_notes',
      'client_rejection_reason','client_rejection_notes',
      'target_market_status','target_market_mismatches',
      'roa_generated','roa_generation_date','final_document_issued','issue_date',
      'roa_completed','roa_completed_at',
      'client_acknowledgement_received','acknowledgement_date',
      'client_acknowledgment_method','acknowledgment_witness_name',
      'supervisor_co_approval_required','supervisor_co_approved_by_id','supervisor_co_approved_at',
      're5_flag',
      'notes','created_by','created_at','updated_at',
    ],
  };

  const SOURCE_LABELS = {
    contacts:           'Contacts',
    accounts:           'Accounts',
    policies:           'Policies',
    policy_sections:    'Policy Sections',
    assets:             'Assets',
    claims:             'Claims',
    client_engagements: 'Client Engagements',
    risk_details:       'Risk Details',
    advice_records:     'Records of Advice',
    complaints:         'Complaints',
    reviews:            'Reviews',
  };

  // Every module can be joined with every other module
  const _ALL_MODULES = Object.keys(SOURCE_LABELS);
  // Only modules that have assigned_broker_id / assigned_admin_id FK columns support broker/admin joins
  const _MODULES_WITH_BROKER_ADMIN = new Set([
    'contacts', 'accounts', 'policies', 'client_engagements',
    'claims', 'complaints', 'reviews', 'advice_records',
  ]);
  const RELATED_MODULES = Object.fromEntries(
    _ALL_MODULES.map(mod => [
      mod,
      [
        ..._ALL_MODULES.filter(m => m !== mod),
        ...(_MODULES_WITH_BROKER_ADMIN.has(mod) ? ['broker', 'admin'] : []),
      ],
    ])
  );

  // ── Field display labels (overrides default underscore→space conversion) ──
  const _FIELD_DISPLAY = {
    asset_section: 'policy section',
  };
  function fieldLabel(f) {
    if (_FIELD_DISPLAY[f]) return _FIELD_DISPLAY[f];
    // Handle table-prefixed names like "assets_asset_section"
    for (const [key, label] of Object.entries(_FIELD_DISPLAY)) {
      if (f.endsWith('_' + key)) {
        const prefix = f.slice(0, f.length - key.length - 1);
        return prefix.replace(/_/g, ' ') + ' ' + label;
      }
    }
    return f.replace(/_/g, ' ');
  }

  // ── Utility helpers ──────────────────────────────────────────────────────

  function esc(str) { return Utils.esc(str); }

  function paginationHtml(page, pages, prefix) {
    if (pages <= 1) return '';
    const prev = page > 1
      ? `<button class="btn btn-sm btn-secondary" data-pgprefix="${esc(prefix)}" data-page="${page - 1}">← Prev</button>`
      : `<button class="btn btn-sm btn-secondary" disabled>← Prev</button>`;
    const next = page < pages
      ? `<button class="btn btn-sm btn-secondary" data-pgprefix="${esc(prefix)}" data-page="${page + 1}">Next →</button>`
      : `<button class="btn btn-sm btn-secondary" disabled>Next →</button>`;
    return `
      <div class="pagination" style="display:flex;align-items:center;gap:.5rem;margin-top:.75rem;">
        ${prev}
        <span style="font-size:.82rem;color:var(--text-light);">Page ${page} of ${pages}</span>
        ${next}
      </div>`;
  }

  function renderResultTable(data, page, pages, prefix) {
    if (!data || !data.length) {
      return `<p style="color:var(--text-light);font-size:.85rem;padding:.75rem 0;">No results found.</p>`;
    }
    const cols = Object.keys(data[0]);
    const rows = data.map(row => {
      const cells = cols.map(c => `<td>${esc(row[c] != null ? row[c] : '—')}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    const headers = cols.map(c => `<th>${esc(c.replace(/_/g, ' '))}</th>`).join('');
    return `
      <div class="table-responsive" style="margin-top:.75rem;">
        <table class="table table-sm">
          <thead><tr>${headers}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${paginationHtml(page, pages, prefix)}`;
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function downloadResponse(responsePromise, filename) {
    try {
      const resp = await responsePromise;
      if (resp && resp.blob) {
        const blob = await resp.blob();
        triggerDownload(blob, filename);
      }
    } catch (err) {
      showToast('Export failed: ' + (err.message || 'Unknown error'), 'error');
    }
  }

  // ── Load helpers ─────────────────────────────────────────────────────────

  async function loadUsers() {
    if (_adminUsers.length) return _adminUsers;
    try {
      const res = await Api.admin.users();
      _adminUsers = res.data || [];
    } catch (_) {
      _adminUsers = [];
    }
    return _adminUsers;
  }

  async function loadSavedReports() {
    try {
      const res = await Api.reports.savedList();
      _savedReports = res.data || res || [];
    } catch (_) {
      _savedReports = [];
    }
  }

  // ── Sidebar panel HTML ───────────────────────────────────────────────────

  function savedPanelHtml() {
    const items = _savedReports.length
      ? _savedReports.map(r => {
        const typeBadge   = `<span class="badge badge-info"  style="font-size:.7rem;">${esc(r.report_type || 'custom')}</span>`;
        const sharedBadge = r.is_shared
          ? `<span class="badge badge-success" style="font-size:.7rem;">Shared</span>`
          : '';
        return `
          <div class="saved-report-item" data-id="${r.id}" style="
            padding:.6rem .75rem; border-bottom:1px solid var(--border);
            background:var(--card-bg);
          ">
            <div style="font-weight:600;font-size:.82rem;margin-bottom:.25rem;">${esc(r.name)}</div>
            <div style="display:flex;gap:.3rem;flex-wrap:wrap;margin-bottom:.4rem;">
              ${typeBadge}${sharedBadge}
            </div>
            <div style="display:flex;gap:.3rem;flex-wrap:wrap;">
              <button class="btn btn-sm btn-primary" data-action="run-saved"   data-id="${r.id}" title="Run">▶ Run</button>
              <button class="btn btn-sm btn-secondary" data-action="edit-saved"  data-id="${r.id}" title="Edit">✎ Edit</button>
              <button class="btn btn-sm btn-secondary" data-action="dupe-saved"  data-id="${r.id}" title="Duplicate">⧉ Dupe</button>
              <button class="btn btn-sm btn-danger"    data-action="del-saved"   data-id="${r.id}" title="Delete">✕</button>
            </div>
          </div>`;
      }).join('')
      : `<p style="padding:.75rem;color:var(--text-muted);font-size:.82rem;">No saved reports yet.</p>`;

    return `
      <div style="width:220px;min-width:220px;background:var(--card-bg);
                  border-right:1px solid var(--border);display:flex;flex-direction:column;
                  overflow:hidden;flex-shrink:0;">
        <div style="padding:.75rem;border-bottom:1px solid var(--border);
                    font-weight:700;font-size:.85rem;background:#f8f9fa;">
          My Reports
        </div>
        <div id="saved-reports-list" style="overflow-y:auto;flex:1;">
          ${items}
        </div>
      </div>`;
  }

  // ── Predefined Reports tab ───────────────────────────────────────────────

  // Cached reports + brokers used by the predefined modal
  let _preReports = [];
  let _preBrokerOpts = '';

  async function renderPredefined(container) {
    container.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    let reports = [];
    let users   = [];
    try {
      [reports, users] = await Promise.all([
        Api.reports.predefined(),
        loadUsers(),
      ]);
      reports = Array.isArray(reports) ? reports : (reports.data || []);
    } catch (err) {
      container.innerHTML = Utils.errorHtml('Failed to load predefined reports.', err);
      return;
    }

    _preReports = reports;
    _preBrokerOpts = `<option value="">All Brokers</option>` +
      users.filter(u => u.role === 'broker' || u.role === 'admin')
           .map(u => `<option value="${u.id}">${esc(u.full_name)}</option>`)
           .join('');

    container.innerHTML = `
      <div style="margin-bottom:.75rem;">
        <input type="text" id="predefined-search" class="form-control"
          placeholder="🔍 Search reports by name or description…"
          style="font-size:.9rem;" />
      </div>
      <div id="predefined-list" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem;"></div>`;

    const listEl   = container.querySelector('#predefined-list');
    const searchEl = container.querySelector('#predefined-search');

    const renderList = (filter) => {
      const term = (filter || '').trim().toLowerCase();
      const filtered = term
        ? _preReports.filter(r =>
            r.name.toLowerCase().includes(term) ||
            (r.description || '').toLowerCase().includes(term))
        : _preReports;

      const rows = filtered.map(r => `
        <div class="predefined-report-row" data-key="${esc(r.key)}" style="
          background:var(--card-bg);border:1px solid var(--border);
          border-radius:var(--border-radius);padding:.85rem 1rem;cursor:pointer;
          transition:background var(--transition),border-color var(--transition);
          display:flex;flex-direction:column;gap:.2rem;
        ">
          <div style="font-weight:600;font-size:.92rem;color:var(--text);">
            ${esc(r.name)}
          </div>
          <div style="font-size:.82rem;color:var(--text-light);line-height:1.4;">
            ${esc(r.description || '')}
          </div>
        </div>`).join('');

      listEl.innerHTML = rows ||
        `<p style="padding:1rem;color:var(--text-muted);font-size:.85rem;grid-column:1 / -1;">
          ${term ? 'No reports match your search.' : 'No predefined reports available.'}
        </p>`;

      listEl.querySelectorAll('.predefined-report-row').forEach(row => {
        row.addEventListener('mouseenter', () => { row.style.background = 'var(--hover-bg, #f5f7fa)'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'var(--card-bg)'; });
        row.addEventListener('click', () => {
          const key = row.dataset.key;
          const report = _preReports.find(r => r.key === key);
          if (report) _openPredefinedModal(report);
        });
      });
    };

    renderList('');
    searchEl.addEventListener('input', () => renderList(searchEl.value));
  }

  function _openPredefinedModal(report) {
    const existing = document.getElementById('predefined-report-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'predefined-report-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="width:480px;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title">${esc(report.name)}</h3>
          <button class="modal-close" id="pre-modal-close">×</button>
        </div>
        <div class="modal-body">
          <p style="font-size:.85rem;color:var(--text-light);margin-bottom:1rem;line-height:1.5;">
            ${esc(report.description || '')}
          </p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:.75rem;">
            <div class="form-group" style="margin:0;">
              <label class="form-label">From</label>
              <input type="date" class="form-control" id="pre-modal-date-from" />
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label">To</label>
              <input type="date" class="form-control" id="pre-modal-date-to" />
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Broker</label>
            <select class="form-control" id="pre-modal-broker">
              ${_preBrokerOpts}
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="pre-modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="pre-modal-run">▶ Run Report</button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    /* backdrop-close disabled */
    modal.querySelector('#pre-modal-close').addEventListener('click', close);
    modal.querySelector('#pre-modal-cancel').addEventListener('click', close);

    const runBtn = modal.querySelector('#pre-modal-run');
    runBtn.addEventListener('click', async () => {
      const dateFrom = modal.querySelector('#pre-modal-date-from').value || '';
      const dateTo   = modal.querySelector('#pre-modal-date-to').value   || '';
      const brokerId = modal.querySelector('#pre-modal-broker').value    || '';

      runBtn.disabled = true;
      runBtn.textContent = 'Loading…';
      try {
        await loadUsers();
        const params = { page: 1, limit: 500 };
        if (dateFrom) params.date_from = dateFrom;
        if (dateTo)   params.date_to   = dateTo;
        if (brokerId) params.broker_id = brokerId;

        const res  = await Api.reports.runPredefined(report.key, params);
        const rows = res.data || res.rows || [];

        _preResults[report.key] = rows;
        close();
        _openReportWindow(report.key, report.name, rows, dateFrom, dateTo);
      } catch (err) {
        showToast('Report failed: ' + (err.message || err), 'error');
        runBtn.disabled = false;
        runBtn.textContent = '▶ Run Report';
      }
    });
  }

  // Columns that hold user FK ids — replaced with full names in reports
  const _USER_ID_COLS = new Set([
    'assigned_broker_id','assigned_admin_id','broker_id','admin_id',
    'created_by','claims_handler_admin_id','complaint_owner_id',
    'assigned_to_id','prepared_by_id','conducted_by_id',
  ]);

  // Known table prefixes used in custom report column aliases (e.g. "policies_broker_id")
  const _TABLE_PREFIXES = [
    'contacts','accounts','policies','policy_sections','assets','claims',
    'client_engagements','risk_details','advice_records','complaints','reviews',
  ];

  /**
   * Given a column name (possibly prefixed with a table name), return the bare
   * field name if it is a user-ID column, or null otherwise.
   * Handles both plain names ("broker_id") and prefixed names ("policies_broker_id").
   */
  function _bareUserIdField(col) {
    if (_USER_ID_COLS.has(col)) return col;
    for (const prefix of _TABLE_PREFIXES) {
      if (col.startsWith(prefix + '_')) {
        const field = col.slice(prefix.length + 1);
        if (_USER_ID_COLS.has(field)) return field;
      }
    }
    return null;
  }

  /**
   * Replace raw user-ID values with full_name strings.
   * Handles both plain column names and table-prefixed aliases from custom reports.
   * Renames the column header (strips _id suffix → _name).
   */
  function _resolveUserNames(rows) {
    if (!rows.length || !_adminUsers.length) return rows;
    const userMap = {};
    _adminUsers.forEach(u => { userMap[String(u.id)] = u.full_name; });

    // Find which columns in this result set are user-ID columns
    const cols   = Object.keys(rows[0]);
    const idCols = cols.filter(c => _bareUserIdField(c) !== null);
    if (!idCols.length) return rows;

    return rows.map(row => {
      const newRow = { ...row };
      idCols.forEach(col => {
        const raw   = row[col];
        const name  = raw != null ? (userMap[String(raw)] || raw) : null;
        // Build a friendly label: strip _id → _name
        const label = col.replace(/_id$/, '_name');
        delete newRow[col];
        newRow[label] = name;
      });
      return newRow;
    });
  }

  function _openReportWindow(key, title, rows, dateFrom, dateTo) {
    if (!rows.length) {
      showToast('No data found for the selected filters.', 'warning');
      return;
    }

    // Resolve user-ID columns to names before rendering
    const resolved = _resolveUserNames(rows);
    const cols    = Object.keys(resolved[0]);
    const headers = cols.map(c => `<th>${esc(fieldLabel(c).replace(/\b\w/g,l=>l.toUpperCase()))}</th>`).join('');
    const tableRows = resolved.map(row =>
      `<tr>${cols.map(c => `<td>${esc(row[c] != null ? String(row[c]) : '—')}</td>`).join('')}</tr>`
    ).join('');

    const subtitle = [dateFrom, dateTo].filter(Boolean).join(' → ') || 'All Dates';

    // Build CSV data for the download button
    const csvHeader = cols.map(c => `"${fieldLabel(c)}"`).join(',');
    const csvRows   = resolved.map(row =>
      cols.map(c => `"${String(row[c] != null ? row[c] : '').replace(/"/g,'""')}"`).join(',')
    );
    const csvText   = [csvHeader, ...csvRows].join('\r\n');

    // Build Excel-compatible HTML table for the .xls download
    const escXml = s => String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    const xlsHeaders = cols.map(c => `<th style="background:#2980b9;color:#fff;border:1px solid #999;padding:6px 10px;">${escXml(fieldLabel(c).replace(/\b\w/g,l=>l.toUpperCase()))}</th>`).join('');
    const xlsRows = resolved.map(row =>
      `<tr>${cols.map(c => {
        const v = row[c] != null ? row[c] : '';
        const isNum = typeof v === 'number';
        return `<td style="border:1px solid #ddd;padding:5px 10px;${isNum ? 'text-align:right;' : ''}">${escXml(v)}</td>`;
      }).join('')}</tr>`
    ).join('');
    const xlsHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>${escXml(title).slice(0,31)}</x:Name>
<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>td{mso-number-format:"\\@";}</style>
</head>
<body>
<h2>${escXml(title)}</h2>
<p>Period: ${escXml(subtitle)} | Generated: ${escXml(new Date().toLocaleString())}</p>
<table border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:11pt;">
<thead><tr>${xlsHeaders}</tr></thead>
<tbody>${xlsRows}</tbody>
</table>
</body></html>`;

    const win = window.open('', '_blank', 'width=1280,height=820,menubar=yes,toolbar=yes,scrollbars=yes');
    if (!win) { showToast('Pop-up blocked — please allow pop-ups for this site.', 'error'); return; }

    win.document.write(`<!DOCTYPE html><html lang="en"><head>
      <meta charset="UTF-8">
      <title>${esc(title)}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: Arial, sans-serif; font-size: 12px; color: #222; background: #fff;
          padding: 28px 32px;
        }
        .report-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          margin-bottom: 20px; border-bottom: 2px solid #2980b9; padding-bottom: 14px;
        }
        .report-header h1 { font-size: 20px; color: #2980b9; }
        .report-header .meta { font-size: 12px; color: #666; margin-top: 6px; }
        .toolbar { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
        .btn {
          padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;
          font-size: 12.5px; font-weight: 600; white-space: nowrap;
        }
        .btn-primary { background: #2980b9; color: #fff; }
        .btn-primary:hover { background: #2471a3; }
        .btn-success { background: #27ae60; color: #fff; }
        .btn-success:hover { background: #219a52; }
        .btn-excel  { background: #1f6e43; color: #fff; }
        .btn-excel:hover  { background: #185635; }
        .count { font-size: 12px; color: #666; margin-bottom: 12px; }
        .table-wrap {
          overflow-x: auto; max-height: calc(100vh - 220px); overflow-y: auto;
          border: 1px solid #ddd; border-radius: 4px; background: #fff;
        }
        table {
          border-collapse: collapse; font-size: 12px; width: max-content; min-width: 100%;
        }
        th {
          background: #2980b9; color: #fff;
          padding: 10px 14px; text-align: left;
          white-space: nowrap; position: sticky; top: 0; z-index: 2;
          font-weight: 600; border-right: 1px solid rgba(255,255,255,.2);
        }
        td {
          padding: 8px 14px; border-bottom: 1px solid #e8e8e8;
          vertical-align: top; min-width: 90px; max-width: 360px;
          word-break: break-word; line-height: 1.45;
        }
        tr:nth-child(even) td { background: #f7f9fc; }
        tr:hover td { background: #eaf3fb; }
        @media print {
          .toolbar { display: none !important; }
          body { padding: 14px; font-size: 10.5px; }
          th { background: #ddd !important; color: #000 !important; -webkit-print-color-adjust: exact; padding: 6px 8px; }
          td { padding: 5px 8px; max-width: none; }
          .table-wrap { max-height: none; overflow: visible; border: none; }
          table { width: 100%; }
        }
      </style>
    </head><body>
      <div class="report-header">
        <div>
          <h1>${esc(title)}</h1>
          <div class="meta">Period: ${esc(subtitle)} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString()}</div>
        </div>
      </div>
      <div class="toolbar">
        <button class="btn btn-primary" onclick="window.print()">🖨 Print / Save PDF</button>
        <button class="btn btn-excel"   id="xls-btn">↓ Download Excel</button>
        <button class="btn btn-success" id="csv-btn">↓ Download CSV</button>
      </div>
      <div class="count">${resolved.length} record(s)</div>
      <div class="table-wrap">
        <table>
          <thead><tr>${headers}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      <script>
        function _download(blob, filename) {
          const url = URL.createObjectURL(blob);
          const a   = document.createElement('a');
          a.href = url; a.download = filename;
          document.body.appendChild(a); a.click();
          document.body.removeChild(a); URL.revokeObjectURL(url);
        }
        document.getElementById('csv-btn').addEventListener('click', function() {
          const csv = ${JSON.stringify(csvText)};
          _download(new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
                    ${JSON.stringify(`report-${key}.csv`)});
        });
        document.getElementById('xls-btn').addEventListener('click', function() {
          const xls = ${JSON.stringify(xlsHtml)};
          _download(new Blob(['﻿' + xls], { type: 'application/vnd.ms-excel;charset=utf-8;' }),
                    ${JSON.stringify(`report-${key}.xls`)});
        });
      <\/script>
    </body></html>`);
    win.document.close();
    win.focus();
  }

  // ── Custom Report Builder wizard ─────────────────────────────────────────

  function wizardStepsNav() {
    const steps = ['Data Source','Columns','Filters','Joins','Sort & Group','Run'];
    return `
      <div id="wizard-steps-nav" style="
        display:flex;gap:0;border-bottom:2px solid var(--border);
        margin-bottom:1.25rem;overflow-x:auto;
      ">
        ${steps.map((s, i) => {
          const n    = i + 1;
          const active  = n === _wizard.step ? 'style="border-bottom:3px solid var(--primary);color:var(--primary);font-weight:700;"' : '';
          const done    = n < _wizard.step ? 'style="color:var(--success);"' : '';
          const disable = n > _wizard.step ? 'style="color:var(--text-muted);"' : '';
          const style   = active || done || disable || '';
          return `
            <button class="btn btn-sm" ${style} data-step="${n}"
              style="${n === _wizard.step
                ? 'border-bottom:3px solid var(--primary);border-radius:0;color:var(--primary);font-weight:700;'
                : n < _wizard.step
                  ? 'border-radius:0;color:var(--success);'
                  : 'border-radius:0;color:var(--text-muted);cursor:default;'}
              padding:.5rem .85rem;font-size:.82rem;background:transparent;border:none;"
              ${n > _wizard.step ? 'disabled' : ''}
              id="wizard-step-btn-${n}">
              ${n < _wizard.step ? '✓ ' : ''}${s}
            </button>`;
        }).join('')}
      </div>`;
  }

  function renderWizardStep(container) {
    const inner = container.querySelector('#wizard-inner');
    if (!inner) return;

    inner.innerHTML = wizardStepsNav() + stepContent();

    // Nav step clicks (only for completed steps)
    inner.querySelectorAll('[data-step]').forEach(btn => {
      btn.addEventListener('click', () => {
        const n = parseInt(btn.dataset.step, 10);
        if (n < _wizard.step) {
          _wizard.step = n;
          renderWizardStep(container);
        }
      });
    });

    wireStepEvents(inner, container);
  }

  function stepContent() {
    switch (_wizard.step) {
      case 1: return step1Html();
      case 2: return step2Html();
      case 3: return step3Html();
      case 4: return step4Html();
      case 5: return step5Html();
      case 6: return step6Html();
      default: return '';
    }
  }

  // Step 1: Data source
  function step1Html() {
    const sources = Object.entries(SOURCE_LABELS);
    const radios  = sources.map(([val, label]) => `
      <label style="display:flex;align-items:center;gap:.5rem;padding:.3rem 0;cursor:pointer;">
        <input type="radio" name="wizard-source" value="${esc(val)}"
          ${_wizard.source === val ? 'checked' : ''} />
        ${esc(label)}
      </label>`).join('');
    return `
      <div>
        <h4 style="margin-bottom:.75rem;">Step 1 — Choose a Data Source</h4>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:.25rem .5rem;">
          ${radios}
        </div>
        <div style="margin-top:1rem;">
          <button id="step1-next" class="btn btn-primary" ${_wizard.source ? '' : 'disabled'}>
            Next: Choose Columns →
          </button>
        </div>
      </div>`;
  }

  // Step 2: Columns
  function step2Html() {
    const fields  = SOURCE_FIELDS[_wizard.source] || [];
    const allChk  = _wizard.columns.length === fields.length && fields.length > 0;
    const checks  = fields.map(f => `
      <label style="display:flex;align-items:center;gap:.4rem;font-size:.83rem;cursor:pointer;">
        <input type="checkbox" class="col-check" value="${esc(f)}"
          ${_wizard.columns.includes(f) ? 'checked' : ''} />
        ${esc(fieldLabel(f))}
      </label>`).join('');
    return `
      <div>
        <h4 style="margin-bottom:.75rem;">Step 2 — Choose Columns</h4>
        <label style="display:flex;align-items:center;gap:.4rem;font-weight:600;
                      margin-bottom:.6rem;cursor:pointer;">
          <input type="checkbox" id="col-all" ${allChk ? 'checked' : ''} />
          All Columns
        </label>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.2rem .75rem;
                    max-height:260px;overflow-y:auto;border:1px solid var(--border);
                    border-radius:var(--border-radius-sm);padding:.5rem;">
          ${checks}
        </div>
        <div style="margin-top:1rem;display:flex;gap:.5rem;">
          <button id="step-back" class="btn btn-secondary">← Back</button>
          <button id="step2-next" class="btn btn-primary"
            ${_wizard.columns.length ? '' : 'disabled'}>
            Next: Filters →
          </button>
        </div>
      </div>`;
  }

  // Step 3: Filters
  const OPERATORS = [
    { value: 'equals',       label: 'equals' },
    { value: 'not_equals',   label: 'not equals' },
    { value: 'contains',     label: 'contains' },
    { value: 'is_empty',     label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
    { value: 'greater_than', label: 'greater than' },
    { value: 'less_than',    label: 'less than' },
    { value: 'between',      label: 'between' },
    { value: 'is_one_of',    label: 'is one of' },
  ];

  function filterRowHtml(f, idx) {
    const fields = SOURCE_FIELDS[_wizard.source] || [];
    const fOpts  = fields.map(field =>
      `<option value="${esc(field)}" ${f.field === field ? 'selected' : ''}>${esc(fieldLabel(field))}</option>`
    ).join('');
    const opOpts = OPERATORS.map(op =>
      `<option value="${esc(op.value)}" ${f.op === op.value ? 'selected' : ''}>${esc(op.label)}</option>`
    ).join('');
    const showVal = !['is_empty','is_not_empty'].includes(f.op);
    return `
      <div class="filter-row" data-idx="${idx}" style="
        display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;
        padding:.4rem;background:#f8f9fa;border-radius:var(--border-radius-sm);
        margin-bottom:.3rem;
      ">
        <select class="form-control form-control-sm filter-field" style="flex:1;min-width:120px;" data-idx="${idx}">
          <option value="">— Field —</option>${fOpts}
        </select>
        <select class="form-control form-control-sm filter-op" style="flex:1;min-width:120px;" data-idx="${idx}">
          ${opOpts}
        </select>
        <input type="text" class="form-control form-control-sm filter-val" data-idx="${idx}"
          value="${esc(f.value || '')}"
          style="flex:2;min-width:120px;${showVal ? '' : 'display:none;'}"
          placeholder="Value" />
        <button class="btn btn-sm btn-danger filter-remove" data-idx="${idx}" title="Remove">✕</button>
      </div>`;
  }

  function step3Html() {
    const filterRows = _wizard.filters.map((f, i) => filterRowHtml(f, i)).join('');
    return `
      <div>
        <h4 style="margin-bottom:.75rem;">Step 3 — Filters</h4>
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem;">
          <strong style="font-size:.83rem;">Logic:</strong>
          <label style="cursor:pointer;font-size:.83rem;">
            <input type="radio" name="filter-logic" value="AND"
              ${_wizard.filterLogic === 'AND' ? 'checked' : ''} /> AND
          </label>
          <label style="cursor:pointer;font-size:.83rem;">
            <input type="radio" name="filter-logic" value="OR"
              ${_wizard.filterLogic === 'OR' ? 'checked' : ''} /> OR
          </label>
        </div>
        <div id="filter-rows">${filterRows}</div>
        <button id="add-filter" class="btn btn-sm btn-secondary" style="margin-top:.4rem;">
          + Add Filter
        </button>
        <div style="margin-top:1rem;display:flex;gap:.5rem;">
          <button id="step-back" class="btn btn-secondary">← Back</button>
          <button id="step3-next" class="btn btn-primary">Next: Joins →</button>
        </div>
      </div>`;
  }

  // Step 4: Joins
  function step4Html() {
    const available = (RELATED_MODULES[_wizard.source] || []);
    if (!available.length) {
      return `
        <div>
          <h4 style="margin-bottom:.75rem;">Step 4 — Joins (Optional)</h4>
          <p style="color:var(--text-muted);font-size:.85rem;">No related modules available for this data source.</p>
          <div style="margin-top:1rem;display:flex;gap:.5rem;">
            <button id="step-back" class="btn btn-secondary">← Back</button>
            <button id="step4-next" class="btn btn-primary">Next: Sort & Group →</button>
          </div>
        </div>`;
    }

    const joinSections = available.map(mod => {
      const modFields = SOURCE_FIELDS[mod] || [];
      const selected  = _wizard.joinFields[mod] || [];
      const fieldChks = modFields.map(f => `
        <label style="display:flex;align-items:center;gap:.3rem;font-size:.8rem;cursor:pointer;">
          <input type="checkbox" class="join-field-check" data-mod="${esc(mod)}" value="${esc(f)}"
            ${selected.includes(f) ? 'checked' : ''} />
          ${esc(fieldLabel(f))}
        </label>`).join('');
      const isJoined = _wizard.joins.includes(mod);
      return `
        <div class="join-section" style="border:1px solid var(--border);border-radius:var(--border-radius-sm);
              padding:.6rem;margin-bottom:.5rem;">
          <label style="display:flex;align-items:center;gap:.5rem;font-weight:600;cursor:pointer;margin-bottom:.4rem;">
            <input type="checkbox" class="join-mod-check" value="${esc(mod)}" ${isJoined ? 'checked' : ''} />
            ${esc(SOURCE_LABELS[mod] || mod)}
          </label>
          <div class="join-fields-container" ${isJoined ? '' : 'style="display:none;"'}
            style="display:${isJoined ? 'grid' : 'none'};grid-template-columns:repeat(3,1fr);gap:.2rem .5rem;padding-left:1rem;">
            ${fieldChks}
          </div>
        </div>`;
    }).join('');

    return `
      <div>
        <h4 style="margin-bottom:.75rem;">Step 4 — Joins (Optional)</h4>
        <p style="font-size:.82rem;color:var(--text-light);margin-bottom:.6rem;">
          Select related modules to join and which fields to include.
        </p>
        ${joinSections}
        <div style="margin-top:1rem;display:flex;gap:.5rem;">
          <button id="step-back" class="btn btn-secondary">← Back</button>
          <button id="step4-next" class="btn btn-primary">Next: Sort & Group →</button>
        </div>
      </div>`;
  }

  // Step 5: Sort & Group
  function step5Html() {
    const fields    = SOURCE_FIELDS[_wizard.source] || [];
    const fieldOpts = `<option value="">— None —</option>` +
      fields.map(f =>
        `<option value="${esc(f)}" ${_wizard.sortField === f ? 'selected' : ''}>${esc(fieldLabel(f))}</option>`
      ).join('');
    const groupOpts = `<option value="">— None —</option>` +
      fields.map(f =>
        `<option value="${esc(f)}" ${_wizard.groupField === f ? 'selected' : ''}>${esc(fieldLabel(f))}</option>`
      ).join('');
    return `
      <div>
        <h4 style="margin-bottom:.75rem;">Step 5 — Sort &amp; Group</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
          <div>
            <label class="form-label">Sort By</label>
            <select id="sort-field" class="form-control">${fieldOpts}</select>
          </div>
          <div>
            <label class="form-label">Sort Direction</label>
            <div style="display:flex;gap:1rem;margin-top:.4rem;">
              <label style="cursor:pointer;">
                <input type="radio" name="sort-dir" value="asc"
                  ${_wizard.sortDir === 'asc' ? 'checked' : ''} /> Ascending
              </label>
              <label style="cursor:pointer;">
                <input type="radio" name="sort-dir" value="desc"
                  ${_wizard.sortDir === 'desc' ? 'checked' : ''} /> Descending
              </label>
            </div>
          </div>
        </div>
        <div>
          <label class="form-label">Group By (Optional)</label>
          <select id="group-field" class="form-control" style="max-width:280px;">${groupOpts}</select>
        </div>
        <div style="margin-top:1rem;display:flex;gap:.5rem;">
          <button id="step-back" class="btn btn-secondary">← Back</button>
          <button id="step5-next" class="btn btn-primary">Next: Run →</button>
        </div>
      </div>`;
  }

  // Step 6: Run
  function step6Html() {
    const summaryLines = [
      `<strong>Source:</strong> ${esc(SOURCE_LABELS[_wizard.source] || _wizard.source)}`,
      `<strong>Columns:</strong> ${esc(_wizard.columns.join(', ') || 'All')}`,
      _wizard.filters.length
        ? `<strong>Filters:</strong> ${_wizard.filters.length} filter(s) [${esc(_wizard.filterLogic)}]`
        : null,
      _wizard.joins.length
        ? `<strong>Joins:</strong> ${_wizard.joins.map(j => esc(SOURCE_LABELS[j] || j)).join(', ')}`
        : null,
      _wizard.sortField
        ? `<strong>Sort:</strong> ${esc(_wizard.sortField)} ${esc(_wizard.sortDir)}`
        : null,
      _wizard.groupField
        ? `<strong>Group By:</strong> ${esc(_wizard.groupField)}`
        : null,
    ].filter(Boolean).map(l => `<li style="font-size:.83rem;">${l}</li>`).join('');

    return `
      <div>
        <h4 style="margin-bottom:.75rem;">Step 6 — Run Report</h4>
        <ul style="list-style:none;padding:0;margin-bottom:1rem;
                   background:#f8f9fa;border-radius:var(--border-radius-sm);padding:.75rem;">
          ${summaryLines}
        </ul>
        <p style="font-size:.82rem;color:var(--text-light);margin-bottom:.85rem;">
          Results will open in a new window with Print and CSV export options.
        </p>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
          <button id="step-back"       class="btn btn-secondary">← Back</button>
          <button id="custom-run-btn"  class="btn btn-primary">▶ Run Report</button>
          <button id="custom-save-btn" class="btn btn-secondary">💾 Save Report</button>
        </div>
        <div id="custom-results"></div>
      </div>`;
  }

  function buildCustomConfig() {
    return {
      source:       _wizard.source,
      columns:      _wizard.columns,
      filters:      _wizard.filters.map(f => ({
        field:    f.field,
        operator: f.op,
        value:    f.value,
        value2:   f.value2,
      })),
      filter_logic: _wizard.filterLogic,
      joins:        _wizard.joins.map(mod => ({
        module: mod,
        fields: _wizard.joinFields[mod] || [],
      })),
      sort_field:   _wizard.sortField,
      sort_dir:     _wizard.sortDir,
      group_by:     _wizard.groupField || null,
    };
  }

  // ── Wire step events ─────────────────────────────────────────────────────

  function wireStepEvents(inner, container) {
    const source = _wizard.source;

    // Step 1 source selection
    inner.querySelectorAll('[name="wizard-source"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const prev = _wizard.source;
        _wizard.source = radio.value;
        if (prev !== _wizard.source) {
          // Reset downstream state
          _wizard.columns    = [];
          _wizard.filters    = [];
          _wizard.joins      = [];
          _wizard.joinFields = {};
          _wizard.sortField  = '';
          _wizard.groupField = '';
          _wizard.results    = null;
        }
        const nextBtn = inner.querySelector('#step1-next');
        if (nextBtn) nextBtn.disabled = !_wizard.source;
      });
    });

    const step1Next = inner.querySelector('#step1-next');
    if (step1Next) {
      step1Next.addEventListener('click', () => {
        if (!_wizard.source) return;
        _wizard.allColumns = SOURCE_FIELDS[_wizard.source] || [];
        if (!_wizard.columns.length) _wizard.columns = [..._wizard.allColumns];
        _wizard.step = 2;
        renderWizardStep(container);
      });
    }

    // Step 2 column toggles
    const colAll = inner.querySelector('#col-all');
    if (colAll) {
      colAll.addEventListener('change', () => {
        const all  = SOURCE_FIELDS[_wizard.source] || [];
        _wizard.columns = colAll.checked ? [...all] : [];
        renderWizardStep(container);
      });
    }
    inner.querySelectorAll('.col-check').forEach(chk => {
      chk.addEventListener('change', () => {
        const val = chk.value;
        if (chk.checked) {
          if (!_wizard.columns.includes(val)) _wizard.columns.push(val);
        } else {
          _wizard.columns = _wizard.columns.filter(c => c !== val);
        }
        const nextBtn = inner.querySelector('#step2-next');
        if (nextBtn) nextBtn.disabled = !_wizard.columns.length;
        const allChk = inner.querySelector('#col-all');
        if (allChk) {
          const fields = SOURCE_FIELDS[_wizard.source] || [];
          allChk.checked = _wizard.columns.length === fields.length;
        }
      });
    });
    const step2Next = inner.querySelector('#step2-next');
    if (step2Next) {
      step2Next.addEventListener('click', () => {
        if (!_wizard.columns.length) return;
        _wizard.step = 3;
        renderWizardStep(container);
      });
    }

    // Step 3 filter events
    inner.querySelectorAll('[name="filter-logic"]').forEach(r => {
      r.addEventListener('change', () => { _wizard.filterLogic = r.value; });
    });
    const addFilter = inner.querySelector('#add-filter');
    if (addFilter) {
      addFilter.addEventListener('click', () => {
        _wizard.filters.push({ field: '', op: 'equals', value: '' });
        const filterRows = inner.querySelector('#filter-rows');
        if (filterRows) {
          const idx = _wizard.filters.length - 1;
          const div = document.createElement('div');
          div.innerHTML = filterRowHtml(_wizard.filters[idx], idx);
          filterRows.appendChild(div.firstElementChild);
          wireFilterRow(div.firstElementChild, inner);
        }
      });
    }
    inner.querySelectorAll('.filter-row').forEach(row => wireFilterRow(row, inner));
    const step3Next = inner.querySelector('#step3-next');
    if (step3Next) {
      step3Next.addEventListener('click', () => {
        _wizard.step = 4;
        renderWizardStep(container);
      });
    }

    // Step 4 join toggles
    inner.querySelectorAll('.join-mod-check').forEach(chk => {
      chk.addEventListener('change', () => {
        const mod = chk.value;
        if (chk.checked) {
          if (!_wizard.joins.includes(mod)) _wizard.joins.push(mod);
        } else {
          _wizard.joins = _wizard.joins.filter(j => j !== mod);
          delete _wizard.joinFields[mod];
        }
        const fieldsContainer = chk.closest('.join-section').querySelector('.join-fields-container');
        if (fieldsContainer) fieldsContainer.style.display = chk.checked ? 'grid' : 'none';
      });
    });
    inner.querySelectorAll('.join-field-check').forEach(chk => {
      chk.addEventListener('change', () => {
        const mod = chk.dataset.mod;
        const val = chk.value;
        if (!_wizard.joinFields[mod]) _wizard.joinFields[mod] = [];
        if (chk.checked) {
          if (!_wizard.joinFields[mod].includes(val)) _wizard.joinFields[mod].push(val);
        } else {
          _wizard.joinFields[mod] = _wizard.joinFields[mod].filter(f => f !== val);
        }
      });
    });
    const step4Next = inner.querySelector('#step4-next');
    if (step4Next) {
      step4Next.addEventListener('click', () => {
        _wizard.step = 5;
        renderWizardStep(container);
      });
    }

    // Step 5 sort/group
    const sortField = inner.querySelector('#sort-field');
    if (sortField) {
      sortField.addEventListener('change', () => { _wizard.sortField = sortField.value; });
    }
    inner.querySelectorAll('[name="sort-dir"]').forEach(r => {
      r.addEventListener('change', () => { _wizard.sortDir = r.value; });
    });
    const groupField = inner.querySelector('#group-field');
    if (groupField) {
      groupField.addEventListener('change', () => { _wizard.groupField = groupField.value; });
    }
    const step5Next = inner.querySelector('#step5-next');
    if (step5Next) {
      step5Next.addEventListener('click', () => {
        _wizard.step = 6;
        renderWizardStep(container);
      });
    }

    // Step 6 run
    const customRunBtn = inner.querySelector('#custom-run-btn');
    if (customRunBtn) {
      customRunBtn.addEventListener('click', () => runCustomReport(inner));
    }
    const customSaveBtn = inner.querySelector('#custom-save-btn');
    if (customSaveBtn) {
      customSaveBtn.addEventListener('click', () => openSaveDialog());
    }

    // Back button (shared across all steps)
    const backBtn = inner.querySelector('#step-back');
    if (backBtn && _wizard.step > 1) {
      backBtn.addEventListener('click', () => {
        _wizard.step--;
        renderWizardStep(container);
      });
    }
  }

  function wireFilterRow(row, inner) {
    const fieldEl = row.querySelector('.filter-field');
    const opEl    = row.querySelector('.filter-op');
    const valEl   = row.querySelector('.filter-val');
    const remBtn  = row.querySelector('.filter-remove');

    if (fieldEl) fieldEl.addEventListener('change', () => {
      const idx = parseInt(row.dataset.idx, 10);
      if (!_wizard.filters[idx]) return;
      _wizard.filters[idx].field = fieldEl.value;
    });
    if (opEl) opEl.addEventListener('change', () => {
      const idx = parseInt(row.dataset.idx, 10);
      if (!_wizard.filters[idx]) return;
      _wizard.filters[idx].op = opEl.value;
      const hideVal = ['is_empty','is_not_empty'].includes(opEl.value);
      if (valEl) valEl.style.display = hideVal ? 'none' : '';
    });
    if (valEl) valEl.addEventListener('input', () => {
      const idx = parseInt(row.dataset.idx, 10);
      if (!_wizard.filters[idx]) return;
      _wizard.filters[idx].value = valEl.value;
    });
    if (remBtn) remBtn.addEventListener('click', () => {
      const idx = parseInt(row.dataset.idx, 10);
      _wizard.filters.splice(idx, 1);
      row.remove();
      // Re-index remaining rows
      const filterRows = inner.querySelector('#filter-rows');
      if (filterRows) {
        filterRows.querySelectorAll('.filter-row').forEach((r, i) => {
          r.dataset.idx = i;
          r.querySelectorAll('[data-idx]').forEach(el => { el.dataset.idx = i; });
        });
      }
    });
  }

  async function runCustomReport(inner) {
    const resultsEl = inner.querySelector('#custom-results');
    const runBtn    = inner.querySelector('#custom-run-btn');

    if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Loading…'; }
    if (resultsEl) resultsEl.innerHTML = '';

    // Make sure users are loaded so name resolution works
    await loadUsers();

    try {
      const config = { ...buildCustomConfig(), page: 1, limit: 500 };
      const res  = await Api.reports.runCustom(config);
      const rows = res.data || res.rows || [];

      _wizard.results = res;

      const sourceLabel = SOURCE_LABELS[_wizard.source] || _wizard.source || 'Custom';
      _openReportWindow('custom', sourceLabel + ' Report', rows, '', '');
    } catch (err) {
      if (resultsEl) resultsEl.innerHTML = Utils.errorHtml('Report failed.', err);
      else showToast('Report failed: ' + (err.message || err), 'error');
    } finally {
      if (runBtn) { runBtn.disabled = false; runBtn.textContent = '▶ Run Report'; }
    }
  }

  // ── Save Report dialog ───────────────────────────────────────────────────

  function openSaveDialog() {
    const modal    = document.getElementById('global-modal');
    const title    = document.getElementById('global-modal-title');
    const body     = document.getElementById('global-modal-body');
    const footer   = document.getElementById('global-modal-footer');
    const closeBtn = document.getElementById('global-modal-close');

    title.textContent = 'Save Report';
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Report Name <span class="required">*</span></label>
        <input type="text" id="save-report-name" class="form-control" placeholder="Enter report name" />
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea id="save-report-desc" class="form-control" rows="2"
          placeholder="Optional description"></textarea>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;">
          <input type="checkbox" id="save-report-shared" />
          Share with all users
        </label>
      </div>`;
    footer.innerHTML = `
      <button id="save-report-cancel" class="btn btn-secondary">Cancel</button>
      <button id="save-report-confirm" class="btn btn-primary">Save</button>`;

    modal.style.display = '';

    function close() { modal.style.display = 'none'; }
    closeBtn.onclick                 = close;
    footer.querySelector('#save-report-cancel').onclick = close;
    footer.querySelector('#save-report-confirm').onclick = async () => {
      const name = document.getElementById('save-report-name')?.value.trim();
      if (!name) {
        showToast('Report name is required.', 'error');
        return;
      }
      const desc   = document.getElementById('save-report-desc')?.value.trim() || '';
      const shared = document.getElementById('save-report-shared')?.checked || false;
      try {
        await Api.reports.savedCreate({
          name,
          description: desc,
          is_shared:   shared,
          report_type: 'custom',
          config:      buildCustomConfig(),
        });
        showToast('Report saved successfully.', 'success');
        close();
        await loadSavedReports();
        const panel = document.getElementById('saved-reports-list');
        if (panel) refreshSavedPanel(panel);
      } catch (err) {
        showToast('Save failed: ' + (err.message || 'Unknown error'), 'error');
      }
    };
  }

  // ── Refresh saved-reports panel ──────────────────────────────────────────

  function refreshSavedPanel(panel) {
    const items = _savedReports.length
      ? _savedReports.map(r => {
        const typeBadge   = `<span class="badge badge-info"  style="font-size:.7rem;">${esc(r.report_type || 'custom')}</span>`;
        const sharedBadge = r.is_shared
          ? `<span class="badge badge-success" style="font-size:.7rem;">Shared</span>`
          : '';
        return `
          <div class="saved-report-item" data-id="${r.id}" style="
            padding:.6rem .75rem;border-bottom:1px solid var(--border);background:var(--card-bg);">
            <div style="font-weight:600;font-size:.82rem;margin-bottom:.25rem;">${esc(r.name)}</div>
            <div style="display:flex;gap:.3rem;flex-wrap:wrap;margin-bottom:.4rem;">
              ${typeBadge}${sharedBadge}
            </div>
            <div style="display:flex;gap:.3rem;flex-wrap:wrap;">
              <button class="btn btn-sm btn-primary" data-action="run-saved"  data-id="${r.id}">▶ Run</button>
              <button class="btn btn-sm btn-secondary" data-action="edit-saved" data-id="${r.id}">✎ Edit</button>
              <button class="btn btn-sm btn-secondary" data-action="dupe-saved" data-id="${r.id}">⧉ Dupe</button>
              <button class="btn btn-sm btn-danger"    data-action="del-saved"  data-id="${r.id}">✕</button>
            </div>
          </div>`;
      }).join('')
      : `<p style="padding:.75rem;color:var(--text-muted);font-size:.82rem;">No saved reports yet.</p>`;
    panel.innerHTML = items;
  }

  // ── AI query ─────────────────────────────────────────────────────────────

  // ── Audit Trail report ───────────────────────────────────────────────────

  const _AUDIT_MODULES = [
    'contacts','accounts','policies','policy_sections','assets','claims',
    'client_engagements','risk_details','advice_records','complaints','reviews','users',
  ];
  const _AUDIT_MODULE_LABELS = {
    contacts:'Contacts', accounts:'Accounts', policies:'Policies',
    policy_sections:'Policy Sections', assets:'Assets', claims:'Claims',
    client_engagements:'Client Engagements', risk_details:'Risk Details',
    advice_records:'Records of Advice', complaints:'Complaints',
    reviews:'Reviews', users:'Users',
  };
  const _AUDIT_SKIP = new Set([
    'id','created_at','updated_at','created_by','password_hash',
    'last_login','session_token','reset_token','reset_token_expires',
  ]);
  const _AUDIT_FIELD_LABELS = {
    policy_name:'Policy Name', policy_number:'Policy Number', policy_status:'Status',
    policy_type:'Policy Type', product_category:'Product Category', insurer:'Insurer',
    premium:'Premium', inception_date:'Inception Date', renewal_date:'Renewal Date',
    cancellation_date:'Cancellation Date', cover_description:'Cover Description',
    disclosure_completed:'Disclosure Completed', amendment_count:'Amendment Count',
    claims_count:'Claims Count', last_review_date:'Last Review Date',
    next_review_date:'Next Review Date', assigned_broker_id:'Assigned Broker',
    assigned_admin_id:'Assigned Admin', contact_id:'Contact', account_id:'Account',
    engagement_id:'Engagement', advice_record_id:'Advice Record',
    first_name:'First Name', last_name:'Last Name', contact_status:'Status',
    contact_type:'Contact Type', client_category:'Category', client_segment:'Segment',
    email:'Email', mobile:'Mobile', phone:'Phone', id_number:'ID Number',
    date_of_birth:'Date of Birth', popia_consent_obtained:'POPIA Consent',
    fica_status:'FICA Status', account_name:'Account Name', account_type:'Account Type',
    account_status:'Status', registration_number:'Reg Number', vat_number:'VAT Number',
    section_name:'Section Name', section_type:'Section Type', section_category:'Category',
    needs_analysis_status:'NA Status', gap_identified:'Gap Identified',
    gap_severity:'Gap Severity', risk_exists:'Risk Exists', cover_required:'Cover Required',
    currently_covered:'Currently Covered', recommended_for_cover:'Recommended',
    implemented:'Implemented', sum_insured_limit:'Sum Insured', excess:'Excess',
    claim_reference:'Claim Ref', claim_type:'Claim Type', claim_status:'Status',
    date_of_loss:'Date of Loss', claim_amount:'Claim Amount',
    settlement_amount:'Settlement Amount', engagement_name:'Engagement Name',
    engagement_type:'Type', stage:'Stage', client_decision:'Client Decision',
    fact_find_completed:'Fact Find', needs_analysis_completed:'Needs Analysis',
    proposal_prepared:'Proposal Prepared', advice_presented:'Advice Presented',
    suitability_confirmed:'Suitability Confirmed', advice_record_number:'ROA Number',
    advice_type:'Advice Type', advice_date:'Advice Date', status:'Status',
    roa_reference:'ROA Reference', asset_name:'Asset Name', asset_type:'Asset Type',
    asset_status:'Asset Status', mm_number:'M & M Number',
    risk_detail_name:'Risk Detail Name', risk_type:'Risk Type',
    review_date:'Review Date', review_type:'Review Type', review_completed:'Completed',
    complaint_reference:'Complaint Ref', complaint_category:'Category',
    complaint_status:'Status', date_received:'Date Received',
    notes:'Notes', conduct_concern_flag:'Conduct Concern',
    full_name:'Full Name', username:'Username', role:'Role', active:'Active',
  };

  function _auditFmtVal(v) {
    if (v === null || v === undefined || v === '') return '(empty)';
    if (v === 1 || v === true)  return 'Yes';
    if (v === 0 || v === false) return 'No';
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Utils.formatDate(s);
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return Utils.formatDate(s);
    return s;
  }

  function _auditBuildDiff(oldJson, newJson) {
    try {
      const oldObj = typeof oldJson === 'string' ? JSON.parse(oldJson) : (oldJson || {});
      const newObj = typeof newJson === 'string' ? JSON.parse(newJson) : (newJson || {});
      const changes = [];
      const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
      for (const key of keys) {
        if (_AUDIT_SKIP.has(key)) continue;
        const oldVal = oldObj[key];
        const newVal = newObj[key];
        const norm = v => (v === null || v === undefined) ? '' : String(v);
        if (norm(oldVal) === norm(newVal)) continue;
        const label = _AUDIT_FIELD_LABELS[key] || key.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
        changes.push({ label, from: _auditFmtVal(oldVal), to: _auditFmtVal(newVal) });
      }
      return changes;
    } catch (_) { return []; }
  }

  // State for current audit results (for CSV export)
  let _auditResults = [];
  let _auditFilters = {};

  async function renderAuditTrail(container) {
    const users = await loadUsers();
    const userOpts = `<option value="">All Users</option>` +
      users.map(u => `<option value="${u.id}">${esc(u.full_name)}</option>`).join('');

    const moduleOpts = `<option value="">All Modules</option>` +
      _AUDIT_MODULES.map(m => `<option value="${m}">${esc(_AUDIT_MODULE_LABELS[m] || m)}</option>`).join('');

    // Default dates: first day of current month → today
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const defaultFrom = firstOfMonth.toISOString().slice(0, 10);
    const defaultTo   = today.toISOString().slice(0, 10);

    container.innerHTML = `
      <div class="card" style="margin-bottom:1rem;">
        <div class="card-header" style="padding:.75rem 1rem;">
          <h4 style="margin:0;font-size:.95rem;font-weight:700;">Audit Trail — Changes Report</h4>
        </div>
        <div style="padding:.85rem 1rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.75rem;align-items:end;">
          <div class="form-group" style="margin:0;">
            <label class="form-label" style="font-size:.78rem;">From Date</label>
            <input type="date" id="at-from" class="form-control form-control-sm" value="${defaultFrom}" />
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label" style="font-size:.78rem;">To Date</label>
            <input type="date" id="at-to" class="form-control form-control-sm" value="${defaultTo}" />
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label" style="font-size:.78rem;">Module</label>
            <select id="at-module" class="form-control form-control-sm">${moduleOpts}</select>
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label" style="font-size:.78rem;">Action</label>
            <select id="at-action" class="form-control form-control-sm">
              <option value="">All Actions</option>
              <option value="CREATE">Create</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
            </select>
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label" style="font-size:.78rem;">User</label>
            <select id="at-user" class="form-control form-control-sm">${userOpts}</select>
          </div>
          <div style="display:flex;gap:.4rem;align-items:flex-end;padding-bottom:1px;">
            <button id="at-run-btn" class="btn btn-primary btn-sm">▶ Run</button>
            <button id="at-csv-btn" class="btn btn-secondary btn-sm" style="display:none;">↓ CSV</button>
            <button id="at-print-btn" class="btn btn-secondary btn-sm" style="display:none;">🖨 Print</button>
          </div>
        </div>
      </div>
      <div id="at-results"></div>`;

    container.querySelector('#at-run-btn').addEventListener('click', () => runAuditTrail(container, 1));
    container.querySelector('#at-csv-btn').addEventListener('click', () => exportAuditCsv(container));
    container.querySelector('#at-print-btn').addEventListener('click', () => printAuditTrail());

    // Pagination delegation
    container.addEventListener('click', e => {
      const pg = e.target.closest('[data-at-page]');
      if (pg) runAuditTrail(container, parseInt(pg.dataset.atPage, 10));
    });

    // Auto-run on load
    runAuditTrail(container, 1);
  }

  async function runAuditTrail(container, page = 1) {
    const fromVal   = container.querySelector('#at-from')?.value   || '';
    const toVal     = container.querySelector('#at-to')?.value     || '';
    const moduleVal = container.querySelector('#at-module')?.value || '';
    const actionVal = container.querySelector('#at-action')?.value || '';
    const userVal   = container.querySelector('#at-user')?.value   || '';
    const runBtn    = container.querySelector('#at-run-btn');
    const csvBtn    = container.querySelector('#at-csv-btn');
    const printBtn  = container.querySelector('#at-print-btn');
    const resultsEl = container.querySelector('#at-results');

    if (!resultsEl) return;
    resultsEl.innerHTML = `<div class="loading-spinner-wrapper" style="min-height:80px;"><div class="loading-spinner"></div></div>`;
    if (runBtn) runBtn.disabled = true;

    _auditFilters = { from: fromVal, to: toVal, module: moduleVal, action: actionVal, user_id: userVal };

    // Add 1 day to "to" so it's inclusive of the full end date
    const toInclusive = toVal ? toVal + 'T23:59:59' : '';

    try {
      const params = { page, limit: 50 };
      if (fromVal)   params.from    = fromVal;
      if (toVal)     params.to      = toInclusive;
      if (moduleVal) params.module  = moduleVal;
      if (actionVal) params.action  = actionVal;
      if (userVal)   params.user_id = userVal;

      const res  = await Api.admin.auditLog(params);
      const rows = res.data || [];
      const pg   = res.pagination?.page       || page;
      const pgs  = res.pagination?.totalPages || 1;
      const tot  = res.pagination?.total      || rows.length;

      _auditResults = rows;

      if (!rows.length) {
        resultsEl.innerHTML = `<p class="tab-empty">No changes found for the selected filters.</p>`;
        if (csvBtn)   csvBtn.style.display   = 'none';
        if (printBtn) printBtn.style.display = 'none';
        return;
      }

      if (csvBtn)   csvBtn.style.display   = '';
      if (printBtn) printBtn.style.display = '';

      const actionBadge = a => {
        const colours = { CREATE:'#27ae60', UPDATE:'#2980b9', DELETE:'#e74c3c' };
        return `<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:.73rem;font-weight:700;color:#fff;background:${colours[a]||'#7f8c8d'};">${esc(a)}</span>`;
      };

      const tableRows = rows.map(r => {
        const modLabel  = esc(_AUDIT_MODULE_LABELS[r.module] || r.module || '—');
        const diffHtml  = r.action === 'UPDATE'
          ? _auditBuildDiff(r.old_value, r.new_value)
              .map(c => `<div style="font-size:.75rem;line-height:1.5;">
                <strong>${esc(c.label)}:</strong>
                <span style="color:#c0392b;text-decoration:line-through;">${esc(c.from)}</span>
                <span style="color:var(--text-light);"> → </span>
                <span style="color:#27ae60;font-weight:500;">${esc(c.to)}</span>
              </div>`).join('')
          : '';

        return `
          <tr>
            <td style="white-space:nowrap;font-size:.78rem;">${r.timestamp ? Utils.formatDate(r.timestamp) + '<br><span style="color:var(--text-light);">' + (r.timestamp.split('T')[1]||'').slice(0,5) + '</span>' : '—'}</td>
            <td><span class="badge badge-info" style="font-size:.73rem;">${modLabel}</span></td>
            <td>${actionBadge(r.action)}</td>
            <td style="font-size:.78rem;color:var(--text-light);">${esc(String(r.record_id || '—'))}</td>
            <td style="font-size:.82rem;">${esc(r.user_full_name || r.user_name || '—')}</td>
            <td style="font-size:.82rem;">${esc(r.description || '—')}</td>
            <td>${diffHtml || '<span style="color:var(--text-light);font-size:.75rem;">—</span>'}</td>
          </tr>`;
      }).join('');

      const paginationHtmlAt = (pg, pgs) => {
        if (pgs <= 1) return '';
        const prev = pg > 1   ? `<button class="btn btn-sm btn-secondary" data-at-page="${pg-1}">← Prev</button>` : `<button class="btn btn-sm btn-secondary" disabled>← Prev</button>`;
        const next = pg < pgs ? `<button class="btn btn-sm btn-secondary" data-at-page="${pg+1}">Next →</button>` : `<button class="btn btn-sm btn-secondary" disabled>Next →</button>`;
        return `<div style="display:flex;align-items:center;gap:.5rem;margin-top:.75rem;">${prev}<span style="font-size:.82rem;color:var(--text-light);">Page ${pg} of ${pgs} (${tot} records)</span>${next}</div>`;
      };

      resultsEl.innerHTML = `
        <div style="font-size:.8rem;color:var(--text-light);margin-bottom:.5rem;">${tot} record(s) found</div>
        <div class="table-responsive">
          <table class="table table-sm" style="font-size:.82rem;">
            <thead>
              <tr>
                <th>Date/Time</th>
                <th>Module</th>
                <th>Action</th>
                <th>Record ID</th>
                <th>Changed By</th>
                <th>Description</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
        ${paginationHtmlAt(pg, pgs)}`;

    } catch (err) {
      resultsEl.innerHTML = `<div class="alert alert-danger">Failed to load audit trail: ${esc(err.message || err)}</div>`;
    } finally {
      if (runBtn) runBtn.disabled = false;
    }
  }

  function exportAuditCsv(container) {
    if (!_auditResults.length) { showToast('No data to export.', 'warning'); return; }
    const cols = ['timestamp','module','action','record_id','user_full_name','description','changes'];
    const header = cols.map(c => c.replace(/_/g,' ').toUpperCase()).join(',');
    const rows = _auditResults.map(r => {
      const changes = r.action === 'UPDATE'
        ? _auditBuildDiff(r.old_value, r.new_value)
            .map(c => `${c.label}: [${c.from}] → [${c.to}]`)
            .join(' | ')
        : '';
      const vals = [
        r.timestamp || '',
        _AUDIT_MODULE_LABELS[r.module] || r.module || '',
        r.action || '',
        r.record_id || '',
        r.user_full_name || r.user_name || '',
        r.description || '',
        changes,
      ];
      return vals.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
    });
    const csv  = [header, ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `audit-trail-${_auditFilters.from||'all'}-to-${_auditFilters.to||'all'}.csv`);
  }

  function printAuditTrail() {
    const resultsEl = document.querySelector('#at-results');
    if (!resultsEl) return;
    const win = window.open('', '_blank', 'width=1100,height=800');
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Audit Trail Report</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; }
        h2 { font-size: 15px; margin-bottom: 12px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ccc; padding: 4px 7px; text-align: left; vertical-align: top; }
        th { background: #f0f0f0; font-weight: 700; font-size: 10px; }
        .badge { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 10px; font-weight: 700; color: #fff; }
        .del { color: #c0392b; text-decoration: line-through; }
        .add { color: #27ae60; font-weight: 600; }
        @media print { body { padding: 0; } }
      </style>
    </head><body>
      <h2>Audit Trail Report — ${esc(_auditFilters.from||'All')} to ${esc(_auditFilters.to||'All')}</h2>
      ${resultsEl.innerHTML}
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  }

  // ── Main render ──────────────────────────────────────────────────────────

  async function render() {
    setPageTitle('Reports');
    setBreadcrumb(['Home', 'Reports']);

    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    await loadSavedReports();

    el.innerHTML = `
      <div style="display:flex;height:100%;gap:0;min-height:0;">

        <!-- Left: saved reports sidebar -->
        ${savedPanelHtml()}

        <!-- Right: main panel -->
        <div style="flex:1;overflow-y:auto;padding:1.25rem;min-width:0;">

          <!-- Tab strip -->
          <div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:1.25rem;">
            <button data-tab="predefined" class="btn reports-tab active-tab"
              style="border-radius:0;padding:.5rem 1rem;font-size:.88rem;border:none;
                     border-bottom:3px solid var(--primary);font-weight:700;">
              Predefined Reports
            </button>
            <button data-tab="custom" class="btn reports-tab"
              style="border-radius:0;padding:.5rem 1rem;font-size:.88rem;border:none;
                     border-bottom:3px solid transparent;color:var(--text-light);">
              Custom Report Builder
            </button>
            <button data-tab="audit" class="btn reports-tab"
              style="border-radius:0;padding:.5rem 1rem;font-size:.88rem;border:none;
                     border-bottom:3px solid transparent;color:var(--text-light);">
              📋 Audit Trail
            </button>
          </div>

          <!-- Predefined tab -->
          <div id="tab-predefined"></div>

          <!-- Custom tab -->
          <div id="tab-custom" style="display:none;">
            <div id="wizard-inner"></div>
          </div>

          <!-- Audit Trail tab -->
          <div id="tab-audit" style="display:none;"></div>

        </div>
      </div>`;

    // Tabs
    let activeTab = 'predefined';
    const tabs    = el.querySelectorAll('.reports-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        tabs.forEach(t => {
          const isActive = t.dataset.tab === activeTab;
          t.style.borderBottom  = isActive ? '3px solid var(--primary)' : '3px solid transparent';
          t.style.fontWeight    = isActive ? '700' : '400';
          t.style.color         = isActive ? 'var(--text)' : 'var(--text-light)';
        });
        el.querySelector('#tab-predefined').style.display = activeTab === 'predefined' ? '' : 'none';
        el.querySelector('#tab-custom').style.display     = activeTab === 'custom'     ? '' : 'none';
        el.querySelector('#tab-audit').style.display      = activeTab === 'audit'      ? '' : 'none';
        if (activeTab === 'custom' && !el.querySelector('#wizard-inner').children.length) {
          renderWizardStep(el.querySelector('#tab-custom'));
        }
        if (activeTab === 'audit' && !el.querySelector('#tab-audit').children.length) {
          renderAuditTrail(el.querySelector('#tab-audit'));
        }
      });
    });

    // Load predefined tab
    renderPredefined(el.querySelector('#tab-predefined'));

    // Wire saved reports sidebar actions
    const savedPanel = el.querySelector('#saved-reports-list');
    if (savedPanel) {
      savedPanel.addEventListener('click', async e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id     = btn.dataset.id;

        if (action === 'run-saved') {
          try {
            const res  = await Api.reports.savedRun(id);
            const rows = res.data || res.rows || [];
            const pg   = res.page  || 1;
            const pgs  = res.pages || 1;

            // Switch to custom tab and show results in step 6
            activeTab = 'custom';
            tabs.forEach(t => {
              const isActive = t.dataset.tab === 'custom';
              t.style.borderBottom = isActive ? '3px solid var(--primary)' : '3px solid transparent';
              t.style.fontWeight   = isActive ? '700' : '400';
              t.style.color        = isActive ? 'var(--text)' : 'var(--text-light)';
            });
            el.querySelector('#tab-predefined').style.display = 'none';
            el.querySelector('#tab-custom').style.display     = '';
            const wizEl = el.querySelector('#tab-custom');
            _wizard.step = 6;
            renderWizardStep(wizEl);
            const customResults = wizEl.querySelector('#custom-results');
            if (customResults) customResults.innerHTML = renderResultTable(rows, pg, pgs, 'custom');
            const csvBtn  = wizEl.querySelector('#custom-csv-btn');
            const pdfBtn  = wizEl.querySelector('#custom-pdf-btn');
            const saveBtn = wizEl.querySelector('#custom-save-btn');
            if (csvBtn)  csvBtn.style.display  = '';
            if (pdfBtn)  pdfBtn.style.display  = '';
            if (saveBtn) saveBtn.style.display = '';
          } catch (err) {
            showToast('Run failed: ' + (err.message || 'Unknown error'), 'error');
          }
        }

        if (action === 'edit-saved') {
          try {
            const saved = _savedReports.find(r => String(r.id) === String(id));
            if (!saved || !saved.config) return;
            const cfg = saved.config;
            _wizard.source      = cfg.source      || '';
            _wizard.columns     = cfg.columns     || [];
            _wizard.filters     = cfg.filters     || [];
            _wizard.filterLogic = cfg.filter_logic || 'AND';
            _wizard.joins       = cfg.joins       || [];
            _wizard.joinFields  = cfg.join_fields  || {};
            _wizard.sortField   = cfg.sort_field  || '';
            _wizard.sortDir     = cfg.sort_dir    || 'asc';
            _wizard.groupField  = cfg.group_field || '';
            _wizard.step        = 1;
            const customTab = document.querySelector('[data-tab="custom"]');
            if (customTab) customTab.click();
          } catch (_) {}
        }

        if (action === 'dupe-saved') {
          const saved = _savedReports.find(r => String(r.id) === String(id));
          if (!saved) return;
          try {
            await Api.reports.savedCreate({
              name:        `${saved.name} (copy)`,
              description: saved.description || '',
              is_shared:   false,
              report_type: saved.report_type || 'custom',
              config:      saved.config,
            });
            showToast('Report duplicated.', 'success');
            await loadSavedReports();
            refreshSavedPanel(savedPanel);
          } catch (err) {
            showToast('Duplicate failed: ' + (err.message || 'Unknown error'), 'error');
          }
        }

        if (action === 'del-saved') {
          if (!confirmDialog('Delete this saved report?')) return;
          try {
            await Api.reports.savedDelete(id);
            showToast('Report deleted.', 'success');
            await loadSavedReports();
            refreshSavedPanel(savedPanel);
          } catch (err) {
            showToast('Delete failed: ' + (err.message || 'Unknown error'), 'error');
          }
        }
      });
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────
  return { render };

})();
