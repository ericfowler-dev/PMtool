const express = require('express');
const router = express.Router();
const { db } = require('../database');

// GET / - List all equipment models with optional filters
router.get('/', (req, res) => {
  try {
    const { engine_type, application_type, min_kw, max_kw } = req.query;

    let sql = 'SELECT * FROM equipment_models WHERE 1=1';
    const params = [];

    if (engine_type) {
      sql += ' AND engine_type = ?';
      params.push(engine_type);
    }

    if (application_type) {
      // application_types is a JSON array, search within it
      sql += ' AND application_types LIKE ?';
      params.push(`%"${application_type}"%`);
    }

    if (min_kw) {
      sql += ' AND power_rating_kw >= ?';
      params.push(Number(min_kw));
    }

    if (max_kw) {
      sql += ' AND power_rating_kw <= ?';
      params.push(Number(max_kw));
    }

    sql += ' ORDER BY manufacturer, model_number';

    const models = db.prepare(sql).all(...params);

    // Parse JSON fields
    const result = models.map(m => ({
      ...m,
      application_types: JSON.parse(m.application_types || '[]')
    }));

    res.json(result);
  } catch (err) {
    console.error('Error listing equipment models:', err);
    res.status(500).json({ error: 'Failed to list equipment models', details: err.message });
  }
});

// GET /:id - Get single model with component lifecycles
router.get('/:id', (req, res) => {
  try {
    const model = db.prepare('SELECT * FROM equipment_models WHERE id = ?').get(req.params.id);

    if (!model) {
      return res.status(404).json({ error: 'Equipment model not found' });
    }

    model.application_types = JSON.parse(model.application_types || '[]');

    // Get component lifecycles for this model
    const lifecycles = db.prepare(
      'SELECT * FROM component_lifecycles WHERE equipment_model_id = ? ORDER BY category, component_name'
    ).all(req.params.id);

    res.json({ ...model, component_lifecycles: lifecycles });
  } catch (err) {
    console.error('Error getting equipment model:', err);
    res.status(500).json({ error: 'Failed to get equipment model', details: err.message });
  }
});

// POST / - Create new equipment model
router.post('/', (req, res) => {
  try {
    const {
      model_number, manufacturer, engine_family, engine_type,
      power_rating_kw, power_rating_hp, voltage, frequency,
      application_types,
      default_annual_hours_standby, default_annual_hours_prime,
      default_annual_hours_ltp, default_annual_hours_continuous,
      fuel_consumption_rate_full, fuel_consumption_rate_75,
      fuel_consumption_rate_50, fuel_consumption_unit,
      oil_capacity_gallons, coolant_capacity_gallons, weight_lbs, notes
    } = req.body;

    if (!model_number || !engine_type || power_rating_kw == null || !application_types) {
      return res.status(400).json({
        error: 'Missing required fields: model_number, engine_type, power_rating_kw, application_types'
      });
    }

    const appTypesJson = Array.isArray(application_types)
      ? JSON.stringify(application_types)
      : application_types;

    const result = db.prepare(`
      INSERT INTO equipment_models (
        model_number, manufacturer, engine_family, engine_type,
        power_rating_kw, power_rating_hp, voltage, frequency,
        application_types,
        default_annual_hours_standby, default_annual_hours_prime,
        default_annual_hours_ltp, default_annual_hours_continuous,
        fuel_consumption_rate_full, fuel_consumption_rate_75,
        fuel_consumption_rate_50, fuel_consumption_unit,
        oil_capacity_gallons, coolant_capacity_gallons, weight_lbs, notes
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      model_number, manufacturer || 'PSI', engine_family, engine_type,
      power_rating_kw, power_rating_hp, voltage || '480V', frequency || '60Hz',
      appTypesJson,
      default_annual_hours_standby ?? 200, default_annual_hours_prime ?? 6500,
      default_annual_hours_ltp ?? 4000, default_annual_hours_continuous ?? 8760,
      fuel_consumption_rate_full, fuel_consumption_rate_75,
      fuel_consumption_rate_50, fuel_consumption_unit || 'therms/hr',
      oil_capacity_gallons, coolant_capacity_gallons, weight_lbs, notes
    );

    const created = db.prepare('SELECT * FROM equipment_models WHERE id = ?').get(result.lastInsertRowid);
    created.application_types = JSON.parse(created.application_types || '[]');

    res.status(201).json(created);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'A model with this model_number already exists' });
    }
    console.error('Error creating equipment model:', err);
    res.status(500).json({ error: 'Failed to create equipment model', details: err.message });
  }
});

// PUT /:id - Update equipment model
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM equipment_models WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Equipment model not found' });
    }

    const fields = [
      'model_number', 'manufacturer', 'engine_family', 'engine_type',
      'power_rating_kw', 'power_rating_hp', 'voltage', 'frequency',
      'application_types',
      'default_annual_hours_standby', 'default_annual_hours_prime',
      'default_annual_hours_ltp', 'default_annual_hours_continuous',
      'fuel_consumption_rate_full', 'fuel_consumption_rate_75',
      'fuel_consumption_rate_50', 'fuel_consumption_unit',
      'oil_capacity_gallons', 'coolant_capacity_gallons', 'weight_lbs', 'notes'
    ];

    const updates = [];
    const values = [];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        if (field === 'application_types' && Array.isArray(value)) {
          value = JSON.stringify(value);
        }
        updates.push(`${field} = ?`);
        values.push(value);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    db.prepare(`UPDATE equipment_models SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM equipment_models WHERE id = ?').get(req.params.id);
    updated.application_types = JSON.parse(updated.application_types || '[]');

    res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'A model with this model_number already exists' });
    }
    console.error('Error updating equipment model:', err);
    res.status(500).json({ error: 'Failed to update equipment model', details: err.message });
  }
});

// DELETE /:id - Delete equipment model
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM equipment_models WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Equipment model not found' });
    }

    db.prepare('DELETE FROM equipment_models WHERE id = ?').run(req.params.id);

    res.json({ message: 'Equipment model deleted', id: Number(req.params.id) });
  } catch (err) {
    console.error('Error deleting equipment model:', err);
    res.status(500).json({ error: 'Failed to delete equipment model', details: err.message });
  }
});

module.exports = router;
