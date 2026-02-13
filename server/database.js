const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
});

// Helper: run a query and return rows
async function query(text, params) {
  const res = await pool.query(text, params);
  return res.rows;
}

// Helper: run a query and return first row
async function queryOne(text, params) {
  const res = await pool.query(text, params);
  return res.rows[0] || null;
}

// Helper: run an INSERT/UPDATE/DELETE and return result
async function execute(text, params) {
  return pool.query(text, params);
}

async function initialize() {
  await pool.query(`
    -- Equipment models catalog
    CREATE TABLE IF NOT EXISTS equipment_models (
      id SERIAL PRIMARY KEY,
      model_number TEXT NOT NULL UNIQUE,
      manufacturer TEXT DEFAULT 'PSI',
      engine_family TEXT,
      engine_type TEXT NOT NULL,
      power_rating_kw REAL NOT NULL,
      power_rating_hp REAL,
      voltage TEXT DEFAULT '480V',
      frequency TEXT DEFAULT '60Hz',
      application_types TEXT NOT NULL,
      default_annual_hours_standby REAL DEFAULT 200,
      default_annual_hours_prime REAL DEFAULT 6500,
      default_annual_hours_ltp REAL DEFAULT 4000,
      default_annual_hours_continuous REAL DEFAULT 8760,
      fuel_consumption_rate_full REAL,
      fuel_consumption_rate_75 REAL,
      fuel_consumption_rate_50 REAL,
      fuel_consumption_unit TEXT DEFAULT 'therms/hr',
      oil_capacity_gallons REAL,
      coolant_capacity_gallons REAL,
      weight_lbs REAL,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS price_lists (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      file_name TEXT,
      file_path TEXT,
      effective_date DATE,
      expiration_date DATE,
      status TEXT DEFAULT 'active',
      uploaded_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS price_list_items (
      id SERIAL PRIMARY KEY,
      price_list_id INTEGER NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
      part_number TEXT NOT NULL,
      description TEXT,
      category TEXT,
      subcategory TEXT,
      unit_price REAL NOT NULL,
      unit TEXT DEFAULT 'each',
      applicable_models TEXT,
      lead_time_days INTEGER,
      notes TEXT,
      UNIQUE(price_list_id, part_number)
    );

    CREATE TABLE IF NOT EXISTS fleets (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      location TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fleet_units (
      id SERIAL PRIMARY KEY,
      fleet_id INTEGER NOT NULL REFERENCES fleets(id) ON DELETE CASCADE,
      equipment_model_id INTEGER NOT NULL REFERENCES equipment_models(id),
      unit_name TEXT,
      quantity INTEGER DEFAULT 1,
      application_type TEXT NOT NULL DEFAULT 'prime',
      annual_hours REAL,
      duty_cycle REAL DEFAULT 0.75,
      fuel_type TEXT DEFAULT 'natural_gas',
      fuel_quality TEXT DEFAULT 'pipeline',
      environment TEXT DEFAULT 'normal',
      ambient_temp_min_f REAL DEFAULT 20,
      ambient_temp_max_f REAL DEFAULT 100,
      altitude_ft REAL DEFAULT 500,
      installation_date DATE,
      commissioning_rate_per_month REAL DEFAULT 1,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS pm_schedules (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      equipment_model_id INTEGER REFERENCES equipment_models(id),
      application_type TEXT,
      is_default BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pm_tasks (
      id SERIAL PRIMARY KEY,
      pm_schedule_id INTEGER NOT NULL REFERENCES pm_schedules(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      interval_hours REAL,
      interval_months REAL,
      labor_hours REAL NOT NULL DEFAULT 1,
      skill_level TEXT DEFAULT 'technician',
      is_one_time BOOLEAN DEFAULT FALSE,
      is_automated BOOLEAN DEFAULT FALSE,
      is_locked BOOLEAN DEFAULT FALSE,
      can_extend_interval BOOLEAN DEFAULT TRUE,
      max_extension_pct REAL DEFAULT 0.6,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS pm_task_parts (
      id SERIAL PRIMARY KEY,
      pm_task_id INTEGER NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
      part_number TEXT,
      description TEXT,
      quantity REAL DEFAULT 1,
      is_optional BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS component_lifecycles (
      id SERIAL PRIMARY KEY,
      equipment_model_id INTEGER REFERENCES equipment_models(id),
      component_name TEXT NOT NULL,
      category TEXT,
      expected_life_hours REAL NOT NULL,
      expected_life_hours_min REAL,
      expected_life_hours_max REAL,
      replacement_labor_hours REAL DEFAULT 8,
      failure_mode TEXT,
      criticality TEXT DEFAULT 'medium',
      weibull_shape REAL DEFAULT 2.5,
      weibull_scale REAL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS scenarios (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      fleet_id INTEGER REFERENCES fleets(id),
      pm_schedule_id INTEGER REFERENCES pm_schedules(id),
      price_list_id INTEGER REFERENCES price_lists(id),
      analysis_period_years INTEGER DEFAULT 20,
      labor_rate REAL DEFAULT 120,
      labor_rate_specialist REAL DEFAULT 180,
      labor_rate_engineer REAL DEFAULT 250,
      parts_discount_pct REAL DEFAULT 20,
      overhead_markup_pct REAL DEFAULT 15,
      working_days_per_year INTEGER DEFAULT 250,
      hours_per_day REAL DEFAULT 8,
      target_utilization_pct REAL DEFAULT 75,
      discount_rate_pct REAL DEFAULT 5,
      inflation_rate_pct REAL DEFAULT 3,
      fuel_cost_per_unit REAL DEFAULT 1.0,
      downtime_cost_per_hour REAL DEFAULT 500,
      include_fuel_costs BOOLEAN DEFAULT TRUE,
      include_downtime_costs BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS analysis_snapshots (
      id SERIAL PRIMARY KEY,
      scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
      name TEXT,
      result_data TEXT NOT NULL,
      calculated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_price_list_items_list ON price_list_items(price_list_id);
    CREATE INDEX IF NOT EXISTS idx_price_list_items_part ON price_list_items(part_number);
    CREATE INDEX IF NOT EXISTS idx_fleet_units_fleet ON fleet_units(fleet_id);
    CREATE INDEX IF NOT EXISTS idx_pm_tasks_schedule ON pm_tasks(pm_schedule_id);
    CREATE INDEX IF NOT EXISTS idx_pm_task_parts_task ON pm_task_parts(pm_task_id);
    CREATE INDEX IF NOT EXISTS idx_component_lifecycles_model ON component_lifecycles(equipment_model_id);
  `);
}

module.exports = { pool, query, queryOne, execute, initialize };
