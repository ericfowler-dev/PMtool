const express = require('express');
const router = express.Router();
const { query, queryOne, execute } = require('../database');

// GET / - List all equipment models with optional filters
router.get('/', async (req, res) => {
  try {
    const { engine_type, application_type, min_kw, max_kw } = req.query;

    let sql = 'SELECT * FROM equipment_models WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (engine_type) {
      sql += ` AND engine_type = $${paramIndex++}`;
      params.push(engine_type);
    }

    if (application_type) {
      // application_types is a JSON array stored as text, search within it
      sql += ` AND application_types LIKE $${paramIndex++}`;
      params.push(`%"${application_type}"%`);
    }

    if (min_kw) {
      sql += ` AND power_rating_kw >= $${paramIndex++}`;
      params.push(Number(min_kw));
    }

    if (max_kw) {
      sql += ` AND power_rating_kw <= $${paramIndex++}`;
      params.push(Number(max_kw));
    }

    sql += ' ORDER BY manufacturer, model_number';

    const models = await query(sql, params);

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
router.get('/:id', async (req, res) => {
  try {
    const model = await queryOne('SELECT * FROM equipment_models WHERE id = $1', [req.params.id]);

    if (!model) {
      return res.status(404).json({ error: 'Equipment model not found' });
    }

    model.application_types = JSON.parse(model.application_types || '[]');

    // Get component lifecycles for this model
    const lifecycles = await query(
      'SELECT * FROM component_lifecycles WHERE equipment_model_id = $1 ORDER BY category, component_name',
      [req.params.id]
    );

    res.json({ ...model, component_lifecycles: lifecycles });
  } catch (err) {
    console.error('Error getting equipment model:', err);
    res.status(500).json({ error: 'Failed to get equipment model', details: err.message });
  }
});

// POST / - Create new equipment model
router.post('/', async (req, res) => {
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

    const inserted = await queryOne(`
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
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      ) RETURNING id
    `, [
      model_number, manufacturer || 'PSI', engine_family, engine_type,
      power_rating_kw, power_rating_hp, voltage || '480V', frequency || '60Hz',
      appTypesJson,
      default_annual_hours_standby ?? 200, default_annual_hours_prime ?? 6500,
      default_annual_hours_ltp ?? 4000, default_annual_hours_continuous ?? 8760,
      fuel_consumption_rate_full, fuel_consumption_rate_75,
      fuel_consumption_rate_50, fuel_consumption_unit || 'therms/hr',
      oil_capacity_gallons, coolant_capacity_gallons, weight_lbs, notes
    ]);

    const created = await queryOne('SELECT * FROM equipment_models WHERE id = $1', [inserted.id]);
    created.application_types = JSON.parse(created.application_types || '[]');

    res.status(201).json(created);
  } catch (err) {
    if (err.message.includes('unique') || err.message.includes('duplicate key')) {
      return res.status(409).json({ error: 'A model with this model_number already exists' });
    }
    console.error('Error creating equipment model:', err);
    res.status(500).json({ error: 'Failed to create equipment model', details: err.message });
  }
});

// PUT /:id - Update equipment model
router.put('/:id', async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM equipment_models WHERE id = $1', [req.params.id]);
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
    let paramIndex = 1;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        if (field === 'application_types' && Array.isArray(value)) {
          value = JSON.stringify(value);
        }
        updates.push(`${field} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    await execute(`UPDATE equipment_models SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);

    const updated = await queryOne('SELECT * FROM equipment_models WHERE id = $1', [req.params.id]);
    updated.application_types = JSON.parse(updated.application_types || '[]');

    res.json(updated);
  } catch (err) {
    if (err.message.includes('unique') || err.message.includes('duplicate key')) {
      return res.status(409).json({ error: 'A model with this model_number already exists' });
    }
    console.error('Error updating equipment model:', err);
    res.status(500).json({ error: 'Failed to update equipment model', details: err.message });
  }
});

// DELETE /:id - Delete equipment model
router.delete('/:id', async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM equipment_models WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Equipment model not found' });
    }

    await execute('DELETE FROM equipment_models WHERE id = $1', [req.params.id]);

    res.json({ message: 'Equipment model deleted', id: Number(req.params.id) });
  } catch (err) {
    console.error('Error deleting equipment model:', err);
    res.status(500).json({ error: 'Failed to delete equipment model', details: err.message });
  }
});

module.exports = router;
