const express = require('express');
const router = express.Router();
const { db } = require('../database');

// GET / - List all fleets with unit counts
router.get('/', (req, res) => {
  try {
    const fleets = db.prepare(`
      SELECT f.*,
        COALESCE(SUM(fu.quantity), 0) AS total_units,
        COUNT(fu.id) AS unit_line_count
      FROM fleets f
      LEFT JOIN fleet_units fu ON fu.fleet_id = f.id
      GROUP BY f.id
      ORDER BY f.updated_at DESC
    `).all();

    res.json(fleets);
  } catch (err) {
    console.error('Error listing fleets:', err);
    res.status(500).json({ error: 'Failed to list fleets', details: err.message });
  }
});

// GET /:id - Get fleet with all units (joined with equipment_models)
router.get('/:id', (req, res) => {
  try {
    const fleet = db.prepare('SELECT * FROM fleets WHERE id = ?').get(req.params.id);
    if (!fleet) {
      return res.status(404).json({ error: 'Fleet not found' });
    }

    const units = db.prepare(`
      SELECT fu.*,
        em.model_number,
        em.manufacturer,
        em.engine_type,
        em.engine_family,
        em.power_rating_kw,
        em.power_rating_hp,
        em.application_types,
        em.fuel_consumption_rate_full,
        em.fuel_consumption_rate_75,
        em.fuel_consumption_rate_50,
        em.fuel_consumption_unit,
        em.default_annual_hours_standby,
        em.default_annual_hours_prime,
        em.default_annual_hours_ltp,
        em.default_annual_hours_continuous
      FROM fleet_units fu
      JOIN equipment_models em ON em.id = fu.equipment_model_id
      WHERE fu.fleet_id = ?
      ORDER BY fu.unit_name, em.model_number
    `).all(req.params.id);

    // Parse JSON fields
    const parsedUnits = units.map(u => ({
      ...u,
      application_types: u.application_types ? JSON.parse(u.application_types) : []
    }));

    // Calculate fleet summary
    const totalUnits = parsedUnits.reduce((sum, u) => sum + u.quantity, 0);
    const totalKw = parsedUnits.reduce((sum, u) => sum + (u.power_rating_kw * u.quantity), 0);

    res.json({
      ...fleet,
      units: parsedUnits,
      summary: {
        total_units: totalUnits,
        total_kw: totalKw,
        unit_line_count: parsedUnits.length
      }
    });
  } catch (err) {
    console.error('Error getting fleet:', err);
    res.status(500).json({ error: 'Failed to get fleet', details: err.message });
  }
});

// POST / - Create fleet
router.post('/', (req, res) => {
  try {
    const { name, description, location } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }

    const result = db.prepare(`
      INSERT INTO fleets (name, description, location) VALUES (?, ?, ?)
    `).run(name, description || null, location || null);

    const created = db.prepare('SELECT * FROM fleets WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('Error creating fleet:', err);
    res.status(500).json({ error: 'Failed to create fleet', details: err.message });
  }
});

// PUT /:id - Update fleet
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM fleets WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Fleet not found' });
    }

    const fields = ['name', 'description', 'location'];
    const updates = [];
    const values = [];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);

    db.prepare(`UPDATE fleets SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM fleets WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error updating fleet:', err);
    res.status(500).json({ error: 'Failed to update fleet', details: err.message });
  }
});

// DELETE /:id - Delete fleet (cascade deletes units)
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM fleets WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Fleet not found' });
    }

    db.prepare('DELETE FROM fleets WHERE id = ?').run(req.params.id);

    res.json({ message: 'Fleet deleted', id: Number(req.params.id) });
  } catch (err) {
    console.error('Error deleting fleet:', err);
    res.status(500).json({ error: 'Failed to delete fleet', details: err.message });
  }
});

// POST /:id/units - Add unit to fleet
router.post('/:id/units', (req, res) => {
  try {
    const fleet = db.prepare('SELECT * FROM fleets WHERE id = ?').get(req.params.id);
    if (!fleet) {
      return res.status(404).json({ error: 'Fleet not found' });
    }

    const {
      equipment_model_id, unit_name, quantity, application_type,
      annual_hours, duty_cycle, fuel_type, fuel_quality,
      environment, ambient_temp_min_f, ambient_temp_max_f, altitude_ft,
      installation_date, commissioning_rate_per_month, notes
    } = req.body;

    if (!equipment_model_id) {
      return res.status(400).json({ error: 'Missing required field: equipment_model_id' });
    }

    // Verify equipment model exists
    const model = db.prepare('SELECT * FROM equipment_models WHERE id = ?').get(equipment_model_id);
    if (!model) {
      return res.status(400).json({ error: 'Equipment model not found' });
    }

    // Determine annual hours from defaults if not specified
    let resolvedAnnualHours = annual_hours;
    if (resolvedAnnualHours == null) {
      const appType = application_type || 'prime';
      const hoursKey = `default_annual_hours_${appType}`;
      resolvedAnnualHours = model[hoursKey] || model.default_annual_hours_prime;
    }

    const result = db.prepare(`
      INSERT INTO fleet_units (
        fleet_id, equipment_model_id, unit_name, quantity, application_type,
        annual_hours, duty_cycle, fuel_type, fuel_quality,
        environment, ambient_temp_min_f, ambient_temp_max_f, altitude_ft,
        installation_date, commissioning_rate_per_month, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.id,
      equipment_model_id,
      unit_name || null,
      quantity || 1,
      application_type || 'prime',
      resolvedAnnualHours,
      duty_cycle ?? 0.75,
      fuel_type || 'natural_gas',
      fuel_quality || 'pipeline',
      environment || 'normal',
      ambient_temp_min_f ?? 20,
      ambient_temp_max_f ?? 100,
      altitude_ft ?? 500,
      installation_date || null,
      commissioning_rate_per_month ?? 1,
      notes || null
    );

    // Return the unit with model info joined
    const created = db.prepare(`
      SELECT fu.*,
        em.model_number,
        em.manufacturer,
        em.engine_type,
        em.power_rating_kw,
        em.power_rating_hp
      FROM fleet_units fu
      JOIN equipment_models em ON em.id = fu.equipment_model_id
      WHERE fu.id = ?
    `).get(result.lastInsertRowid);

    // Update fleet timestamp
    db.prepare('UPDATE fleets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

    res.status(201).json(created);
  } catch (err) {
    console.error('Error adding unit to fleet:', err);
    res.status(500).json({ error: 'Failed to add unit to fleet', details: err.message });
  }
});

// PUT /:id/units/:unitId - Update unit
router.put('/:id/units/:unitId', (req, res) => {
  try {
    const unit = db.prepare(
      'SELECT * FROM fleet_units WHERE id = ? AND fleet_id = ?'
    ).get(req.params.unitId, req.params.id);

    if (!unit) {
      return res.status(404).json({ error: 'Fleet unit not found' });
    }

    const fields = [
      'equipment_model_id', 'unit_name', 'quantity', 'application_type',
      'annual_hours', 'duty_cycle', 'fuel_type', 'fuel_quality',
      'environment', 'ambient_temp_min_f', 'ambient_temp_max_f', 'altitude_ft',
      'installation_date', 'commissioning_rate_per_month', 'notes'
    ];

    const updates = [];
    const values = [];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // If changing equipment_model_id, verify it exists
    if (req.body.equipment_model_id) {
      const model = db.prepare('SELECT id FROM equipment_models WHERE id = ?').get(req.body.equipment_model_id);
      if (!model) {
        return res.status(400).json({ error: 'Equipment model not found' });
      }
    }

    values.push(req.params.unitId);
    db.prepare(`UPDATE fleet_units SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // Update fleet timestamp
    db.prepare('UPDATE fleets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

    const updated = db.prepare(`
      SELECT fu.*,
        em.model_number,
        em.manufacturer,
        em.engine_type,
        em.power_rating_kw,
        em.power_rating_hp
      FROM fleet_units fu
      JOIN equipment_models em ON em.id = fu.equipment_model_id
      WHERE fu.id = ?
    `).get(req.params.unitId);

    res.json(updated);
  } catch (err) {
    console.error('Error updating fleet unit:', err);
    res.status(500).json({ error: 'Failed to update fleet unit', details: err.message });
  }
});

// DELETE /:id/units/:unitId - Remove unit from fleet
router.delete('/:id/units/:unitId', (req, res) => {
  try {
    const unit = db.prepare(
      'SELECT * FROM fleet_units WHERE id = ? AND fleet_id = ?'
    ).get(req.params.unitId, req.params.id);

    if (!unit) {
      return res.status(404).json({ error: 'Fleet unit not found' });
    }

    db.prepare('DELETE FROM fleet_units WHERE id = ?').run(req.params.unitId);

    // Update fleet timestamp
    db.prepare('UPDATE fleets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

    res.json({ message: 'Unit removed from fleet', id: Number(req.params.unitId) });
  } catch (err) {
    console.error('Error removing unit from fleet:', err);
    res.status(500).json({ error: 'Failed to remove unit from fleet', details: err.message });
  }
});

module.exports = router;
