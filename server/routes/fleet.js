const express = require('express');
const router = express.Router();
const { query, queryOne, execute } = require('../database');

// GET / - List all fleets with unit counts
router.get('/', async (req, res) => {
  try {
    const fleets = await query(`
      SELECT f.*,
        COALESCE(SUM(fu.quantity), 0) AS total_units,
        COUNT(fu.id) AS unit_line_count
      FROM fleets f
      LEFT JOIN fleet_units fu ON fu.fleet_id = f.id
      GROUP BY f.id
      ORDER BY f.updated_at DESC
    `);

    res.json(fleets);
  } catch (err) {
    console.error('Error listing fleets:', err);
    res.status(500).json({ error: 'Failed to list fleets', details: err.message });
  }
});

// GET /:id - Get fleet with all units (joined with equipment_models)
router.get('/:id', async (req, res) => {
  try {
    const fleet = await queryOne('SELECT * FROM fleets WHERE id = $1', [req.params.id]);
    if (!fleet) {
      return res.status(404).json({ error: 'Fleet not found' });
    }

    const units = await query(`
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
      WHERE fu.fleet_id = $1
      ORDER BY fu.unit_name, em.model_number
    `, [req.params.id]);

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
router.post('/', async (req, res) => {
  try {
    const { name, description, location } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }

    const inserted = await queryOne(`
      INSERT INTO fleets (name, description, location) VALUES ($1, $2, $3) RETURNING id
    `, [name, description || null, location || null]);

    const created = await queryOne('SELECT * FROM fleets WHERE id = $1', [inserted.id]);
    res.status(201).json(created);
  } catch (err) {
    console.error('Error creating fleet:', err);
    res.status(500).json({ error: 'Failed to create fleet', details: err.message });
  }
});

// PUT /:id - Update fleet
router.put('/:id', async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM fleets WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Fleet not found' });
    }

    const fields = ['name', 'description', 'location'];
    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(req.body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');
    values.push(req.params.id);

    await execute(`UPDATE fleets SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);

    const updated = await queryOne('SELECT * FROM fleets WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    console.error('Error updating fleet:', err);
    res.status(500).json({ error: 'Failed to update fleet', details: err.message });
  }
});

// DELETE /:id - Delete fleet (cascade deletes units)
router.delete('/:id', async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM fleets WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Fleet not found' });
    }

    await execute('DELETE FROM fleets WHERE id = $1', [req.params.id]);

    res.json({ message: 'Fleet deleted', id: Number(req.params.id) });
  } catch (err) {
    console.error('Error deleting fleet:', err);
    res.status(500).json({ error: 'Failed to delete fleet', details: err.message });
  }
});

// POST /:id/units - Add unit to fleet
router.post('/:id/units', async (req, res) => {
  try {
    const fleet = await queryOne('SELECT * FROM fleets WHERE id = $1', [req.params.id]);
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
    const model = await queryOne('SELECT * FROM equipment_models WHERE id = $1', [equipment_model_id]);
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

    const inserted = await queryOne(`
      INSERT INTO fleet_units (
        fleet_id, equipment_model_id, unit_name, quantity, application_type,
        annual_hours, duty_cycle, fuel_type, fuel_quality,
        environment, ambient_temp_min_f, ambient_temp_max_f, altitude_ft,
        installation_date, commissioning_rate_per_month, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id
    `, [
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
    ]);

    // Return the unit with model info joined
    const created = await queryOne(`
      SELECT fu.*,
        em.model_number,
        em.manufacturer,
        em.engine_type,
        em.power_rating_kw,
        em.power_rating_hp
      FROM fleet_units fu
      JOIN equipment_models em ON em.id = fu.equipment_model_id
      WHERE fu.id = $1
    `, [inserted.id]);

    // Update fleet timestamp
    await execute('UPDATE fleets SET updated_at = NOW() WHERE id = $1', [req.params.id]);

    res.status(201).json(created);
  } catch (err) {
    console.error('Error adding unit to fleet:', err);
    res.status(500).json({ error: 'Failed to add unit to fleet', details: err.message });
  }
});

// PUT /:id/units/:unitId - Update unit
router.put('/:id/units/:unitId', async (req, res) => {
  try {
    const unit = await queryOne(
      'SELECT * FROM fleet_units WHERE id = $1 AND fleet_id = $2',
      [req.params.unitId, req.params.id]
    );

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
    let paramIndex = 1;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(req.body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // If changing equipment_model_id, verify it exists
    if (req.body.equipment_model_id) {
      const model = await queryOne('SELECT id FROM equipment_models WHERE id = $1', [req.body.equipment_model_id]);
      if (!model) {
        return res.status(400).json({ error: 'Equipment model not found' });
      }
    }

    values.push(req.params.unitId);
    await execute(`UPDATE fleet_units SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);

    // Update fleet timestamp
    await execute('UPDATE fleets SET updated_at = NOW() WHERE id = $1', [req.params.id]);

    const updated = await queryOne(`
      SELECT fu.*,
        em.model_number,
        em.manufacturer,
        em.engine_type,
        em.power_rating_kw,
        em.power_rating_hp
      FROM fleet_units fu
      JOIN equipment_models em ON em.id = fu.equipment_model_id
      WHERE fu.id = $1
    `, [req.params.unitId]);

    res.json(updated);
  } catch (err) {
    console.error('Error updating fleet unit:', err);
    res.status(500).json({ error: 'Failed to update fleet unit', details: err.message });
  }
});

// DELETE /:id/units/:unitId - Remove unit from fleet
router.delete('/:id/units/:unitId', async (req, res) => {
  try {
    const unit = await queryOne(
      'SELECT * FROM fleet_units WHERE id = $1 AND fleet_id = $2',
      [req.params.unitId, req.params.id]
    );

    if (!unit) {
      return res.status(404).json({ error: 'Fleet unit not found' });
    }

    await execute('DELETE FROM fleet_units WHERE id = $1', [req.params.unitId]);

    // Update fleet timestamp
    await execute('UPDATE fleets SET updated_at = NOW() WHERE id = $1', [req.params.id]);

    res.json({ message: 'Unit removed from fleet', id: Number(req.params.unitId) });
  } catch (err) {
    console.error('Error removing unit from fleet:', err);
    res.status(500).json({ error: 'Failed to remove unit from fleet', details: err.message });
  }
});

module.exports = router;
