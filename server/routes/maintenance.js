const express = require('express');
const router = express.Router();
const { query, queryOne, execute } = require('../database');

// GET /schedules - List all PM schedules
router.get('/schedules', async (req, res) => {
  try {
    const schedules = await query(`
      SELECT ps.*,
        em.model_number,
        em.manufacturer,
        em.engine_type,
        em.power_rating_kw,
        (SELECT COUNT(*) FROM pm_tasks WHERE pm_schedule_id = ps.id) AS task_count
      FROM pm_schedules ps
      LEFT JOIN equipment_models em ON em.id = ps.equipment_model_id
      ORDER BY ps.created_at DESC
    `);

    res.json(schedules);
  } catch (err) {
    console.error('Error listing PM schedules:', err);
    res.status(500).json({ error: 'Failed to list PM schedules', details: err.message });
  }
});

// GET /schedules/:id - Get schedule with tasks and their parts
router.get('/schedules/:id', async (req, res) => {
  try {
    const schedule = await queryOne(`
      SELECT ps.*,
        em.model_number,
        em.manufacturer,
        em.engine_type,
        em.power_rating_kw
      FROM pm_schedules ps
      LEFT JOIN equipment_models em ON em.id = ps.equipment_model_id
      WHERE ps.id = $1
    `, [req.params.id]);

    if (!schedule) {
      return res.status(404).json({ error: 'PM schedule not found' });
    }

    // Get tasks with their parts
    const tasks = await query(`
      SELECT * FROM pm_tasks WHERE pm_schedule_id = $1 ORDER BY sort_order, name
    `, [req.params.id]);

    const tasksWithParts = [];
    for (const task of tasks) {
      const parts = await query(
        'SELECT * FROM pm_task_parts WHERE pm_task_id = $1 ORDER BY id',
        [task.id]
      );
      tasksWithParts.push({ ...task, parts });
    }

    res.json({ ...schedule, tasks: tasksWithParts });
  } catch (err) {
    console.error('Error getting PM schedule:', err);
    res.status(500).json({ error: 'Failed to get PM schedule', details: err.message });
  }
});

// POST /schedules - Create schedule
router.post('/schedules', async (req, res) => {
  try {
    const { name, description, equipment_model_id, application_type, is_default } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }

    // Verify equipment model if provided
    if (equipment_model_id) {
      const model = await queryOne('SELECT id FROM equipment_models WHERE id = $1', [equipment_model_id]);
      if (!model) {
        return res.status(400).json({ error: 'Equipment model not found' });
      }
    }

    const inserted = await queryOne(`
      INSERT INTO pm_schedules (name, description, equipment_model_id, application_type, is_default)
      VALUES ($1, $2, $3, $4, $5) RETURNING id
    `, [
      name,
      description || null,
      equipment_model_id || null,
      application_type || null,
      is_default ? true : false
    ]);

    const created = await queryOne(`
      SELECT ps.*,
        em.model_number,
        em.manufacturer
      FROM pm_schedules ps
      LEFT JOIN equipment_models em ON em.id = ps.equipment_model_id
      WHERE ps.id = $1
    `, [inserted.id]);

    res.status(201).json(created);
  } catch (err) {
    console.error('Error creating PM schedule:', err);
    res.status(500).json({ error: 'Failed to create PM schedule', details: err.message });
  }
});

// PUT /schedules/:id - Update schedule
router.put('/schedules/:id', async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM pm_schedules WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'PM schedule not found' });
    }

    const fields = ['name', 'description', 'equipment_model_id', 'application_type', 'is_default'];
    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        if (field === 'is_default') {
          value = value ? true : false;
        }
        updates.push(`${field} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    await execute(`UPDATE pm_schedules SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);

    const updated = await queryOne(`
      SELECT ps.*,
        em.model_number,
        em.manufacturer
      FROM pm_schedules ps
      LEFT JOIN equipment_models em ON em.id = ps.equipment_model_id
      WHERE ps.id = $1
    `, [req.params.id]);

    res.json(updated);
  } catch (err) {
    console.error('Error updating PM schedule:', err);
    res.status(500).json({ error: 'Failed to update PM schedule', details: err.message });
  }
});

// DELETE /schedules/:id - Delete schedule (cascade deletes tasks and their parts)
router.delete('/schedules/:id', async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM pm_schedules WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'PM schedule not found' });
    }

    await execute('DELETE FROM pm_schedules WHERE id = $1', [req.params.id]);

    res.json({ message: 'PM schedule deleted', id: Number(req.params.id) });
  } catch (err) {
    console.error('Error deleting PM schedule:', err);
    res.status(500).json({ error: 'Failed to delete PM schedule', details: err.message });
  }
});

// POST /schedules/:id/tasks - Add task to schedule
router.post('/schedules/:id/tasks', async (req, res) => {
  try {
    const schedule = await queryOne('SELECT * FROM pm_schedules WHERE id = $1', [req.params.id]);
    if (!schedule) {
      return res.status(404).json({ error: 'PM schedule not found' });
    }

    const {
      name, description, interval_hours, interval_months,
      labor_hours, skill_level, is_one_time, is_automated,
      is_locked, can_extend_interval, max_extension_pct, sort_order
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }

    if (!interval_hours && !interval_months && !is_one_time) {
      return res.status(400).json({
        error: 'Task must have interval_hours, interval_months, or be marked as is_one_time'
      });
    }

    const inserted = await queryOne(`
      INSERT INTO pm_tasks (
        pm_schedule_id, name, description, interval_hours, interval_months,
        labor_hours, skill_level, is_one_time, is_automated,
        is_locked, can_extend_interval, max_extension_pct, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id
    `, [
      req.params.id,
      name,
      description || null,
      interval_hours || null,
      interval_months || null,
      labor_hours ?? 1,
      skill_level || 'technician',
      is_one_time ? true : false,
      is_automated ? true : false,
      is_locked ? true : false,
      can_extend_interval !== false ? true : false,
      max_extension_pct ?? 0.6,
      sort_order ?? 0
    ]);

    const created = await queryOne('SELECT * FROM pm_tasks WHERE id = $1', [inserted.id]);
    created.parts = [];

    res.status(201).json(created);
  } catch (err) {
    console.error('Error adding task:', err);
    res.status(500).json({ error: 'Failed to add task', details: err.message });
  }
});

// PUT /tasks/:taskId - Update task
router.put('/tasks/:taskId', async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM pm_tasks WHERE id = $1', [req.params.taskId]);
    if (!existing) {
      return res.status(404).json({ error: 'PM task not found' });
    }

    const fields = [
      'name', 'description', 'interval_hours', 'interval_months',
      'labor_hours', 'skill_level', 'is_one_time', 'is_automated',
      'is_locked', 'can_extend_interval', 'max_extension_pct', 'sort_order'
    ];

    const booleanFields = ['is_one_time', 'is_automated', 'is_locked', 'can_extend_interval'];
    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        if (booleanFields.includes(field)) {
          value = value ? true : false;
        }
        updates.push(`${field} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.taskId);
    await execute(`UPDATE pm_tasks SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);

    const updated = await queryOne('SELECT * FROM pm_tasks WHERE id = $1', [req.params.taskId]);
    const parts = await query('SELECT * FROM pm_task_parts WHERE pm_task_id = $1', [req.params.taskId]);
    updated.parts = parts;

    res.json(updated);
  } catch (err) {
    console.error('Error updating task:', err);
    res.status(500).json({ error: 'Failed to update task', details: err.message });
  }
});

// DELETE /tasks/:taskId - Delete task (cascade deletes parts)
router.delete('/tasks/:taskId', async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM pm_tasks WHERE id = $1', [req.params.taskId]);
    if (!existing) {
      return res.status(404).json({ error: 'PM task not found' });
    }

    await execute('DELETE FROM pm_tasks WHERE id = $1', [req.params.taskId]);

    res.json({ message: 'PM task deleted', id: Number(req.params.taskId) });
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Failed to delete task', details: err.message });
  }
});

// POST /tasks/:taskId/parts - Add part to task
router.post('/tasks/:taskId/parts', async (req, res) => {
  try {
    const task = await queryOne('SELECT * FROM pm_tasks WHERE id = $1', [req.params.taskId]);
    if (!task) {
      return res.status(404).json({ error: 'PM task not found' });
    }

    const { part_number, description, quantity, is_optional } = req.body;

    if (!part_number && !description) {
      return res.status(400).json({ error: 'Must provide at least part_number or description' });
    }

    const inserted = await queryOne(`
      INSERT INTO pm_task_parts (pm_task_id, part_number, description, quantity, is_optional)
      VALUES ($1, $2, $3, $4, $5) RETURNING id
    `, [
      req.params.taskId,
      part_number || null,
      description || null,
      quantity ?? 1,
      is_optional ? true : false
    ]);

    const created = await queryOne('SELECT * FROM pm_task_parts WHERE id = $1', [inserted.id]);

    res.status(201).json(created);
  } catch (err) {
    console.error('Error adding part to task:', err);
    res.status(500).json({ error: 'Failed to add part to task', details: err.message });
  }
});

// DELETE /task-parts/:id - Remove part from task
router.delete('/task-parts/:id', async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM pm_task_parts WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Task part not found' });
    }

    await execute('DELETE FROM pm_task_parts WHERE id = $1', [req.params.id]);

    res.json({ message: 'Task part removed', id: Number(req.params.id) });
  } catch (err) {
    console.error('Error removing task part:', err);
    res.status(500).json({ error: 'Failed to remove task part', details: err.message });
  }
});

module.exports = router;
