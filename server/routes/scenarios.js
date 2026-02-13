const express = require('express');
const router = express.Router();
const { db } = require('../database');

// GET / - List all scenarios
router.get('/', (req, res) => {
  try {
    const scenarios = db.prepare(`
      SELECT s.*,
        f.name AS fleet_name,
        ps.name AS pm_schedule_name,
        pl.name AS price_list_name,
        (SELECT COUNT(*) FROM analysis_snapshots WHERE scenario_id = s.id) AS snapshot_count
      FROM scenarios s
      LEFT JOIN fleets f ON f.id = s.fleet_id
      LEFT JOIN pm_schedules ps ON ps.id = s.pm_schedule_id
      LEFT JOIN price_lists pl ON pl.id = s.price_list_id
      ORDER BY s.updated_at DESC
    `).all();

    res.json(scenarios);
  } catch (err) {
    console.error('Error listing scenarios:', err);
    res.status(500).json({ error: 'Failed to list scenarios', details: err.message });
  }
});

// GET /:id - Get scenario with full config
router.get('/:id', (req, res) => {
  try {
    const scenario = db.prepare(`
      SELECT s.*,
        f.name AS fleet_name,
        f.description AS fleet_description,
        f.location AS fleet_location,
        ps.name AS pm_schedule_name,
        pl.name AS price_list_name
      FROM scenarios s
      LEFT JOIN fleets f ON f.id = s.fleet_id
      LEFT JOIN pm_schedules ps ON ps.id = s.pm_schedule_id
      LEFT JOIN price_lists pl ON pl.id = s.price_list_id
      WHERE s.id = ?
    `).get(req.params.id);

    if (!scenario) {
      return res.status(404).json({ error: 'Scenario not found' });
    }

    // Get fleet units if fleet is assigned
    let fleet_units = [];
    if (scenario.fleet_id) {
      fleet_units = db.prepare(`
        SELECT fu.*,
          em.model_number,
          em.manufacturer,
          em.engine_type,
          em.power_rating_kw,
          em.power_rating_hp,
          em.fuel_consumption_rate_full,
          em.fuel_consumption_rate_75,
          em.fuel_consumption_rate_50,
          em.fuel_consumption_unit
        FROM fleet_units fu
        JOIN equipment_models em ON em.id = fu.equipment_model_id
        WHERE fu.fleet_id = ?
      `).all(scenario.fleet_id);
    }

    // Get PM schedule tasks if schedule is assigned
    let pm_tasks = [];
    if (scenario.pm_schedule_id) {
      pm_tasks = db.prepare(`
        SELECT * FROM pm_tasks WHERE pm_schedule_id = ? ORDER BY sort_order, name
      `).all(scenario.pm_schedule_id);

      const getParts = db.prepare('SELECT * FROM pm_task_parts WHERE pm_task_id = ?');
      pm_tasks = pm_tasks.map(task => ({
        ...task,
        parts: getParts.all(task.id)
      }));
    }

    res.json({
      ...scenario,
      fleet_units,
      pm_tasks
    });
  } catch (err) {
    console.error('Error getting scenario:', err);
    res.status(500).json({ error: 'Failed to get scenario', details: err.message });
  }
});

// POST / - Create scenario
router.post('/', (req, res) => {
  try {
    const {
      name, description, fleet_id, pm_schedule_id, price_list_id,
      analysis_period_years, labor_rate, labor_rate_specialist, labor_rate_engineer,
      parts_discount_pct, overhead_markup_pct,
      working_days_per_year, hours_per_day, target_utilization_pct,
      discount_rate_pct, inflation_rate_pct,
      fuel_cost_per_unit, downtime_cost_per_hour,
      include_fuel_costs, include_downtime_costs
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }

    // Validate references if provided
    if (fleet_id) {
      const fleet = db.prepare('SELECT id FROM fleets WHERE id = ?').get(fleet_id);
      if (!fleet) return res.status(400).json({ error: 'Fleet not found' });
    }
    if (pm_schedule_id) {
      const schedule = db.prepare('SELECT id FROM pm_schedules WHERE id = ?').get(pm_schedule_id);
      if (!schedule) return res.status(400).json({ error: 'PM schedule not found' });
    }
    if (price_list_id) {
      const pl = db.prepare('SELECT id FROM price_lists WHERE id = ?').get(price_list_id);
      if (!pl) return res.status(400).json({ error: 'Price list not found' });
    }

    const result = db.prepare(`
      INSERT INTO scenarios (
        name, description, fleet_id, pm_schedule_id, price_list_id,
        analysis_period_years, labor_rate, labor_rate_specialist, labor_rate_engineer,
        parts_discount_pct, overhead_markup_pct,
        working_days_per_year, hours_per_day, target_utilization_pct,
        discount_rate_pct, inflation_rate_pct,
        fuel_cost_per_unit, downtime_cost_per_hour,
        include_fuel_costs, include_downtime_costs
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      description || null,
      fleet_id || null,
      pm_schedule_id || null,
      price_list_id || null,
      analysis_period_years ?? 20,
      labor_rate ?? 120,
      labor_rate_specialist ?? 180,
      labor_rate_engineer ?? 250,
      parts_discount_pct ?? 20,
      overhead_markup_pct ?? 15,
      working_days_per_year ?? 250,
      hours_per_day ?? 8,
      target_utilization_pct ?? 75,
      discount_rate_pct ?? 5,
      inflation_rate_pct ?? 3,
      fuel_cost_per_unit ?? 1.0,
      downtime_cost_per_hour ?? 500,
      include_fuel_costs !== false ? 1 : 0,
      include_downtime_costs !== false ? 1 : 0
    );

    const created = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('Error creating scenario:', err);
    res.status(500).json({ error: 'Failed to create scenario', details: err.message });
  }
});

// PUT /:id - Update scenario
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Scenario not found' });
    }

    const fields = [
      'name', 'description', 'fleet_id', 'pm_schedule_id', 'price_list_id',
      'analysis_period_years', 'labor_rate', 'labor_rate_specialist', 'labor_rate_engineer',
      'parts_discount_pct', 'overhead_markup_pct',
      'working_days_per_year', 'hours_per_day', 'target_utilization_pct',
      'discount_rate_pct', 'inflation_rate_pct',
      'fuel_cost_per_unit', 'downtime_cost_per_hour',
      'include_fuel_costs', 'include_downtime_costs'
    ];

    const booleanFields = ['include_fuel_costs', 'include_downtime_costs'];
    const updates = [];
    const values = [];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        if (booleanFields.includes(field)) {
          value = value ? 1 : 0;
        }
        updates.push(`${field} = ?`);
        values.push(value);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Validate references if being changed
    if (req.body.fleet_id) {
      const fleet = db.prepare('SELECT id FROM fleets WHERE id = ?').get(req.body.fleet_id);
      if (!fleet) return res.status(400).json({ error: 'Fleet not found' });
    }
    if (req.body.pm_schedule_id) {
      const schedule = db.prepare('SELECT id FROM pm_schedules WHERE id = ?').get(req.body.pm_schedule_id);
      if (!schedule) return res.status(400).json({ error: 'PM schedule not found' });
    }
    if (req.body.price_list_id) {
      const pl = db.prepare('SELECT id FROM price_lists WHERE id = ?').get(req.body.price_list_id);
      if (!pl) return res.status(400).json({ error: 'Price list not found' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);

    db.prepare(`UPDATE scenarios SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error updating scenario:', err);
    res.status(500).json({ error: 'Failed to update scenario', details: err.message });
  }
});

// DELETE /:id - Delete scenario (cascade deletes snapshots)
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Scenario not found' });
    }

    db.prepare('DELETE FROM scenarios WHERE id = ?').run(req.params.id);

    res.json({ message: 'Scenario deleted', id: Number(req.params.id) });
  } catch (err) {
    console.error('Error deleting scenario:', err);
    res.status(500).json({ error: 'Failed to delete scenario', details: err.message });
  }
});

// POST /:id/snapshot - Save analysis snapshot
router.post('/:id/snapshot', (req, res) => {
  try {
    const scenario = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(req.params.id);
    if (!scenario) {
      return res.status(404).json({ error: 'Scenario not found' });
    }

    const { name, result_data } = req.body;

    if (!result_data) {
      return res.status(400).json({ error: 'Missing required field: result_data' });
    }

    const resultJson = typeof result_data === 'string'
      ? result_data
      : JSON.stringify(result_data);

    const result = db.prepare(`
      INSERT INTO analysis_snapshots (scenario_id, name, result_data)
      VALUES (?, ?, ?)
    `).run(
      req.params.id,
      name || `Snapshot ${new Date().toISOString()}`,
      resultJson
    );

    const created = db.prepare('SELECT * FROM analysis_snapshots WHERE id = ?').get(result.lastInsertRowid);
    created.result_data = JSON.parse(created.result_data);

    res.status(201).json(created);
  } catch (err) {
    console.error('Error saving snapshot:', err);
    res.status(500).json({ error: 'Failed to save snapshot', details: err.message });
  }
});

// GET /:id/snapshots - List snapshots for a scenario
router.get('/:id/snapshots', (req, res) => {
  try {
    const scenario = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(req.params.id);
    if (!scenario) {
      return res.status(404).json({ error: 'Scenario not found' });
    }

    const snapshots = db.prepare(`
      SELECT id, scenario_id, name, calculated_at
      FROM analysis_snapshots
      WHERE scenario_id = ?
      ORDER BY calculated_at DESC
    `).all(req.params.id);

    res.json(snapshots);
  } catch (err) {
    console.error('Error listing snapshots:', err);
    res.status(500).json({ error: 'Failed to list snapshots', details: err.message });
  }
});

module.exports = router;
