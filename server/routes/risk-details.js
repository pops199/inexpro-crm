const express = require('express');
const router = express.Router();
const { requireAuth, canDelete } = require('../middleware/auth');
const { getDb } = require('../db/database');
const { resolveSort } = require('./view-prefs');

// All routes require authentication
router.use(requireAuth);

// ============================================================
// GET / — list risk details with filters and pagination
// ============================================================
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const {
      policy_section_id,
      asset_id,
      risk_type,
      contact_id,
      page = 1,
      limit = 25
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];

    if (policy_section_id) {
      conditions.push('rd.policy_section_id = ?');
      params.push(policy_section_id);
    }
    if (asset_id) {
      conditions.push('rd.asset_id = ?');
      params.push(asset_id);
    }
    if (risk_type) {
      conditions.push('rd.risk_type = ?');
      params.push(risk_type);
    }
    if (contact_id) {
      conditions.push('rd.contact_id = ?');
      params.push(contact_id);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const baseQuery = `
      FROM risk_details rd
      LEFT JOIN policy_sections ps ON rd.policy_section_id = ps.id
      LEFT JOIN assets a ON rd.asset_id = a.id
      LEFT JOIN contacts c ON rd.contact_id = c.id
      LEFT JOIN accounts ac ON rd.account_id = ac.id
      LEFT JOIN policies p ON rd.policy_id = p.id
      ${where}
    `;

    const countRow = db.prepare(`SELECT COUNT(*) AS total ${baseQuery}`).get(...params);

    const resolved = resolveSort('risk_details', req.query.sort, req.query.dir);
    const orderBy = resolved
      ? `ORDER BY ${resolved.sql} ${resolved.dir}, rd.id DESC`
      : `ORDER BY rd.created_at DESC`;

    const rows = db.prepare(`
      SELECT
        rd.*,
        ps.section_name AS policy_section_name,
        ps.section_type AS policy_section_type,
        a.asset_name,
        a.asset_type,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        ac.account_name,
        p.policy_name,
        p.policy_number
      ${baseQuery}
      ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    res.json({
      data: rows,
      pagination: {
        total: countRow.total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countRow.total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('GET /risk-details error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve risk details' });
  }
});

// ============================================================
// GET /:id — single risk detail with joins
// ============================================================
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT
        rd.*,
        ps.section_name AS policy_section_name,
        ps.section_type AS policy_section_type,
        ps.section_category AS policy_section_category,
        a.asset_name,
        a.asset_type,
        a.asset_section AS asset_section_text,
        a.registration_number AS asset_registration_number,
        a.make AS asset_make,
        a.model AS asset_model,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        c.email AS contact_email,
        ac.account_name,
        p.policy_name,
        p.policy_number
      FROM risk_details rd
      LEFT JOIN policy_sections ps ON rd.policy_section_id = ps.id
      LEFT JOIN assets a ON rd.asset_id = a.id
      LEFT JOIN contacts c ON rd.contact_id = c.id
      LEFT JOIN accounts ac ON rd.account_id = ac.id
      LEFT JOIN policies p ON rd.policy_id = p.id
      WHERE rd.id = ?
    `).get(req.params.id);

    if (row) {
      // Prefer the policy_section row name, fall back to the asset's text label.
      row.section_display = row.policy_section_name || row.asset_section_text || null;
    }

    if (!row) {
      return res.status(404).json({ error: 'Risk detail not found' });
    }
    res.json(row);
  } catch (err) {
    console.error('GET /risk-details/:id error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve risk detail' });
  }
});

// ============================================================
// POST / — create risk detail
// ============================================================
router.post('/', (req, res) => {
  try {
    let {
      risk_detail_name,
      policy_section_id,
      risk_type,
      asset_id,
      policy_id,
      contact_id,
      account_id,
      occupancy_use,
      security_details,
      construction_type,
      roof_construction,
      wall_construction,
      stored_parked_overnight,
      tracking_device_fitted,
      route_operating_area,
      distance_to_water,
      flood_exposure,
      fire_exposure,
      goods_load_type,
      maximum_exposure_value,
      risk_notes,
      last_updated
    } = req.body;

    // Validation — only name and risk_type are mandatory; other links are
    // derived from the asset if not supplied.
    if (!risk_detail_name || !risk_type) {
      return res.status(400).json({
        error: 'risk_detail_name and risk_type are required'
      });
    }

    const db = getDb();

    // Derive policy_section_id / policy_id / contact_id / account_id from the
    // selected asset when the caller didn't provide them. This lets brokers
    // just pick an asset and let the relationships fill themselves in.
    if (asset_id) {
      const asset = db.prepare(
        'SELECT policy_section_id, policy_id, contact_id, account_id FROM assets WHERE id = ?'
      ).get(asset_id);
      if (asset) {
        if (!policy_section_id && asset.policy_section_id) policy_section_id = asset.policy_section_id;
        if (!policy_id         && asset.policy_id)         policy_id         = asset.policy_id;
        if (!contact_id        && asset.contact_id)        contact_id        = asset.contact_id;
        if (!account_id        && asset.account_id)        account_id        = asset.account_id;
      }
    }
    const stmt = db.prepare(`
      INSERT INTO risk_details (
        risk_detail_name, policy_section_id, risk_type,
        asset_id, policy_id, contact_id, account_id,
        occupancy_use, security_details, construction_type,
        roof_construction, wall_construction, stored_parked_overnight,
        tracking_device_fitted, route_operating_area,
        distance_to_water, flood_exposure, fire_exposure,
        goods_load_type, maximum_exposure_value, risk_notes, last_updated,
        created_by, created_at, updated_at
      ) VALUES (
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);

    const result = stmt.run(
      risk_detail_name, policy_section_id, risk_type,
      asset_id || null, policy_id || null, contact_id || null, account_id || null,
      occupancy_use || null, security_details || null, construction_type || null,
      roof_construction || null, wall_construction || null, stored_parked_overnight || null,
      tracking_device_fitted ? 1 : 0, route_operating_area || null,
      distance_to_water || null, flood_exposure || null, fire_exposure || null,
      goods_load_type || null, maximum_exposure_value ?? null, risk_notes || null, last_updated || null,
      req.session.userId
    );

    const newRecord = db.prepare('SELECT * FROM risk_details WHERE id = ?').get(result.lastInsertRowid);

    res.locals.logAudit({
      action: 'CREATE',
      module: 'risk_details',
      recordId: result.lastInsertRowid,
      newValue: newRecord,
      description: `Risk detail created: ${risk_detail_name}`
    });

    res.status(201).json(newRecord);
  } catch (err) {
    console.error('POST /risk-details error:', err.message);
    res.status(500).json({ error: 'Failed to create risk detail' });
  }
});

// ============================================================
// PUT /:id — update risk detail
// ============================================================
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM risk_details WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Risk detail not found' });
    }

    let {
      risk_detail_name,
      policy_section_id,
      risk_type,
      asset_id,
      policy_id,
      contact_id,
      account_id,
      occupancy_use,
      security_details,
      construction_type,
      roof_construction,
      wall_construction,
      stored_parked_overnight,
      tracking_device_fitted,
      route_operating_area,
      distance_to_water,
      flood_exposure,
      fire_exposure,
      goods_load_type,
      maximum_exposure_value,
      risk_notes,
      last_updated
    } = req.body;

    // Derive links from the asset when the caller didn't provide them.
    if (asset_id) {
      const asset = db.prepare(
        'SELECT policy_section_id, policy_id, contact_id, account_id FROM assets WHERE id = ?'
      ).get(asset_id);
      if (asset) {
        if (!policy_section_id && asset.policy_section_id) policy_section_id = asset.policy_section_id;
        if (!policy_id         && asset.policy_id)         policy_id         = asset.policy_id;
        if (!contact_id        && asset.contact_id)        contact_id        = asset.contact_id;
        if (!account_id        && asset.account_id)        account_id        = asset.account_id;
      }
    }

    db.prepare(`
      UPDATE risk_details SET
        risk_detail_name       = COALESCE(?, risk_detail_name),
        policy_section_id      = COALESCE(?, policy_section_id),
        risk_type              = COALESCE(?, risk_type),
        asset_id               = COALESCE(?, asset_id),
        policy_id              = COALESCE(?, policy_id),
        contact_id             = COALESCE(?, contact_id),
        account_id             = COALESCE(?, account_id),
        occupancy_use          = COALESCE(?, occupancy_use),
        security_details       = COALESCE(?, security_details),
        construction_type      = COALESCE(?, construction_type),
        roof_construction      = COALESCE(?, roof_construction),
        wall_construction      = COALESCE(?, wall_construction),
        stored_parked_overnight = COALESCE(?, stored_parked_overnight),
        tracking_device_fitted = COALESCE(?, tracking_device_fitted),
        route_operating_area   = COALESCE(?, route_operating_area),
        distance_to_water      = COALESCE(?, distance_to_water),
        flood_exposure         = COALESCE(?, flood_exposure),
        fire_exposure          = COALESCE(?, fire_exposure),
        goods_load_type        = COALESCE(?, goods_load_type),
        maximum_exposure_value = COALESCE(?, maximum_exposure_value),
        risk_notes             = COALESCE(?, risk_notes),
        last_updated           = COALESCE(?, last_updated),
        updated_at             = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      risk_detail_name ?? null, policy_section_id ?? null, risk_type ?? null,
      asset_id ?? null, policy_id ?? null, contact_id ?? null, account_id ?? null,
      occupancy_use ?? null, security_details ?? null, construction_type ?? null,
      roof_construction ?? null, wall_construction ?? null, stored_parked_overnight ?? null,
      tracking_device_fitted !== undefined ? (tracking_device_fitted ? 1 : 0) : null,
      route_operating_area ?? null, distance_to_water ?? null,
      flood_exposure ?? null, fire_exposure ?? null, goods_load_type ?? null,
      maximum_exposure_value ?? null, risk_notes ?? null, last_updated ?? null,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM risk_details WHERE id = ?').get(req.params.id);

    res.locals.logAudit({
      action: 'UPDATE',
      module: 'risk_details',
      recordId: parseInt(req.params.id),
      oldValue: existing,
      newValue: updated,
      description: `Risk detail updated: ${updated.risk_detail_name}`
    });

    res.json(updated);
  } catch (err) {
    console.error('PUT /risk-details/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update risk detail' });
  }
});

// ============================================================
// DELETE /:id — delete risk detail
// ============================================================
router.delete('/:id', canDelete, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM risk_details WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Risk detail not found' });
    }

    db.prepare('DELETE FROM risk_details WHERE id = ?').run(req.params.id);

    res.locals.logAudit({
      action: 'DELETE',
      module: 'risk_details',
      recordId: parseInt(req.params.id),
      oldValue: existing,
      description: `Risk detail deleted: ${existing.risk_detail_name}`
    });

    res.json({ message: 'Risk detail deleted successfully' });
  } catch (err) {
    console.error('DELETE /risk-details/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete risk detail' });
  }
});

module.exports = router;
