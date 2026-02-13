const { db, initialize } = require('./database');

console.log('Initializing database...');
initialize();

console.log('Seeding equipment models...');

const insertModel = db.prepare(`
  INSERT OR IGNORE INTO equipment_models
  (model_number, manufacturer, engine_family, engine_type, power_rating_kw, power_rating_hp, voltage, frequency,
   application_types, default_annual_hours_standby, default_annual_hours_prime, default_annual_hours_ltp, default_annual_hours_continuous,
   fuel_consumption_rate_full, fuel_consumption_rate_75, fuel_consumption_rate_50, fuel_consumption_unit,
   oil_capacity_gallons, coolant_capacity_gallons, weight_lbs, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const models = [
  // PSI Natural Gas Generators
  ['PSI-8.8L-NG-100', 'PSI', '8.8L', 'natural_gas', 100, 134, '480V', '60Hz', '["standby","prime","ltp"]', 200, 6500, 4000, 8760, 1050, 790, 530, 'CFH', 6, 8, 4200, 'PSI 8.8L Natural Gas 100kW'],
  ['PSI-8.8L-NG-150', 'PSI', '8.8L', 'natural_gas', 150, 201, '480V', '60Hz', '["standby","prime","ltp"]', 200, 6500, 4000, 8760, 1530, 1150, 765, 'CFH', 6, 8, 4500, 'PSI 8.8L Natural Gas 150kW'],
  ['PSI-8.8L-NG-200', 'PSI', '8.8L', 'natural_gas', 200, 268, '480V', '60Hz', '["standby","prime","ltp"]', 200, 6500, 4000, 8760, 2010, 1510, 1005, 'CFH', 6, 10, 5000, 'PSI 8.8L Natural Gas 200kW'],
  ['PSI-11.1L-NG-250', 'PSI', '11.1L', 'natural_gas', 250, 335, '480V', '60Hz', '["standby","prime","ltp","continuous"]', 200, 6500, 4000, 8760, 2500, 1875, 1250, 'CFH', 8, 12, 5800, 'PSI 11.1L Natural Gas 250kW'],
  ['PSI-11.1L-NG-300', 'PSI', '11.1L', 'natural_gas', 300, 402, '480V', '60Hz', '["standby","prime","ltp","continuous"]', 200, 6500, 4000, 8760, 2940, 2205, 1470, 'CFH', 8, 12, 6200, 'PSI 11.1L Natural Gas 300kW'],
  ['PSI-11.1L-NG-350', 'PSI', '11.1L', 'natural_gas', 350, 469, '480V', '60Hz', '["standby","prime","ltp","continuous"]', 200, 6500, 4000, 8760, 3430, 2573, 1715, 'CFH', 8, 14, 6600, 'PSI 11.1L Natural Gas 350kW'],
  ['PSI-11.1L-NG-400', 'PSI', '11.1L', 'natural_gas', 400, 536, '480V', '60Hz', '["standby","prime","ltp","continuous"]', 200, 6500, 4000, 8760, 3920, 2940, 1960, 'CFH', 8, 14, 7000, 'PSI 11.1L Natural Gas 400kW'],

  // Larger PSI units
  ['PSI-22.0L-NG-500', 'PSI', '22.0L', 'natural_gas', 500, 671, '480V', '60Hz', '["standby","prime","continuous"]', 200, 6500, 4000, 8760, 4900, 3675, 2450, 'CFH', 14, 20, 10500, 'PSI 22.0L Natural Gas 500kW'],
  ['PSI-22.0L-NG-600', 'PSI', '22.0L', 'natural_gas', 600, 805, '480V', '60Hz', '["standby","prime","continuous"]', 200, 6500, 4000, 8760, 5880, 4410, 2940, 'CFH', 14, 20, 11000, 'PSI 22.0L Natural Gas 600kW'],
  ['PSI-44.0L-NG-800', 'PSI', '44.0L', 'natural_gas', 800, 1073, '480V', '60Hz', '["standby","prime"]', 200, 6500, 4000, 8760, 7840, 5880, 3920, 'CFH', 24, 32, 16000, 'PSI 44.0L Natural Gas 800kW'],
  ['PSI-44.0L-NG-1000', 'PSI', '44.0L', 'natural_gas', 1000, 1341, '480V', '60Hz', '["standby","prime"]', 200, 6500, 4000, 8760, 9800, 7350, 4900, 'CFH', 24, 32, 17500, 'PSI 44.0L Natural Gas 1000kW'],

  // Biogas variants
  ['PSI-8.8L-BG-100', 'PSI', '8.8L', 'biogas', 100, 134, '480V', '60Hz', '["prime","continuous"]', 200, 8000, 6000, 8760, 1200, 900, 600, 'CFH', 6, 8, 4300, 'PSI 8.8L Biogas 100kW - landfill/digester gas'],
  ['PSI-11.1L-BG-250', 'PSI', '11.1L', 'biogas', 250, 335, '480V', '60Hz', '["prime","continuous"]', 200, 8000, 6000, 8760, 2800, 2100, 1400, 'CFH', 8, 12, 6000, 'PSI 11.1L Biogas 250kW - landfill/digester gas'],
  ['PSI-22.0L-BG-500', 'PSI', '22.0L', 'biogas', 500, 671, '480V', '60Hz', '["prime","continuous"]', 200, 8000, 6000, 8760, 5500, 4125, 2750, 'CFH', 14, 20, 10800, 'PSI 22.0L Biogas 500kW - landfill/digester gas'],

  // Propane variants
  ['PSI-8.8L-LP-80', 'PSI', '8.8L', 'propane', 80, 107, '480V', '60Hz', '["standby","prime"]', 200, 6500, 4000, 8760, 8.5, 6.4, 4.3, 'gal/hr', 6, 8, 4100, 'PSI 8.8L Propane 80kW'],
  ['PSI-11.1L-LP-200', 'PSI', '11.1L', 'propane', 200, 268, '480V', '60Hz', '["standby","prime"]', 200, 6500, 4000, 8760, 21.0, 15.8, 10.5, 'gal/hr', 8, 12, 5600, 'PSI 11.1L Propane 200kW'],

  // Diesel units
  ['PSI-D-150', 'PSI', 'Diesel', 'diesel', 150, 201, '480V', '60Hz', '["standby","prime","ltp"]', 200, 4000, 3000, 8760, 8.5, 6.4, 4.3, 'gal/hr', 8, 10, 5200, 'PSI Diesel 150kW'],
  ['PSI-D-300', 'PSI', 'Diesel', 'diesel', 300, 402, '480V', '60Hz', '["standby","prime","ltp"]', 200, 4000, 3000, 8760, 17.0, 12.8, 8.5, 'gal/hr', 12, 16, 7800, 'PSI Diesel 300kW'],
  ['PSI-D-500', 'PSI', 'Diesel', 'diesel', 500, 671, '480V', '60Hz', '["standby","prime"]', 200, 4000, 3000, 8760, 28.0, 21.0, 14.0, 'gal/hr', 20, 28, 12000, 'PSI Diesel 500kW'],
];

for (const m of models) {
  insertModel.run(...m);
}

console.log(`Seeded ${models.length} equipment models`);

// ─── Default PM Schedules ───
console.log('Seeding PM schedules...');

const insertSchedule = db.prepare(`
  INSERT OR IGNORE INTO pm_schedules (name, description, equipment_model_id, application_type, is_default)
  VALUES (?, ?, ?, ?, 1)
`);

const insertTask = db.prepare(`
  INSERT INTO pm_tasks (pm_schedule_id, name, description, interval_hours, interval_months, labor_hours, skill_level, is_one_time, is_automated, is_locked, can_extend_interval, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertTaskPart = db.prepare(`
  INSERT INTO pm_task_parts (pm_task_id, part_number, description, quantity, is_optional)
  VALUES (?, ?, ?, ?, ?)
`);

// Schedule: Natural Gas - Standby
const s1 = insertSchedule.run('NG Standby - OEM Baseline', 'Standard OEM maintenance for natural gas standby generators', null, 'standby');
const sId1 = s1.lastInsertRowid;

const standbyTasks = [
  ['Initial 50-Hour Service', 'Break-in oil change, initial inspections, torque checks', 50, null, 17.2, 'technician', 1, 0, 1, 0, 1],
  ['500-Hour / Annual Service', 'Oil change, filter replacement, coolant check, belt inspection', 500, 12, 8.5, 'technician', 0, 0, 0, 1, 2],
  ['1,000-Hour / 2-Year Service', 'Major inspection, valve adjustment, spark plug replacement, load bank test', 1000, 24, 12.0, 'technician', 0, 0, 0, 1, 3],
  ['2,000-Hour / 4-Year Service', 'Comprehensive overhaul check, coolant flush, ignition system service', 2000, 48, 24.0, 'specialist', 0, 0, 0, 1, 4],
];

for (const t of standbyTasks) {
  const result = insertTask.run(sId1, ...t);
  const taskId = result.lastInsertRowid;
  // Add common parts
  if (t[0].includes('50-Hour')) {
    insertTaskPart.run(taskId, 'OIL-FILTER-88', 'Oil Filter - 8.8L Engine', 1, 0);
    insertTaskPart.run(taskId, 'ENG-OIL-15W40-5', 'Engine Oil 15W-40 (5 gal)', 1, 0);
  }
  if (t[0].includes('500-Hour') || t[0].includes('Annual')) {
    insertTaskPart.run(taskId, 'OIL-FILTER-88', 'Oil Filter - 8.8L Engine', 1, 0);
    insertTaskPart.run(taskId, 'AIR-FILTER-88', 'Air Filter - 8.8L Engine', 1, 0);
    insertTaskPart.run(taskId, 'ENG-OIL-15W40-5', 'Engine Oil 15W-40 (5 gal)', 1, 0);
    insertTaskPart.run(taskId, 'FUEL-FILTER-NG', 'Natural Gas Fuel Filter', 1, 0);
  }
  if (t[0].includes('1,000-Hour')) {
    insertTaskPart.run(taskId, 'OIL-FILTER-88', 'Oil Filter - 8.8L Engine', 1, 0);
    insertTaskPart.run(taskId, 'AIR-FILTER-88', 'Air Filter - 8.8L Engine', 1, 0);
    insertTaskPart.run(taskId, 'ENG-OIL-15W40-5', 'Engine Oil 15W-40 (5 gal)', 1, 0);
    insertTaskPart.run(taskId, 'SPARK-PLUG-NG-88', 'Spark Plug Set - 8.8L NG', 1, 0);
    insertTaskPart.run(taskId, 'COOLANT-5GAL', 'Coolant / Antifreeze (5 gal)', 1, 0);
    insertTaskPart.run(taskId, 'BELT-SERP-88', 'Serpentine Belt - 8.8L', 1, 1);
  }
}

// Schedule: Natural Gas - Prime
const s2 = insertSchedule.run('NG Prime - OEM Baseline', 'Standard OEM maintenance for natural gas prime power generators', null, 'prime');
const sId2 = s2.lastInsertRowid;

const primeTasks = [
  ['Initial 50-Hour Service', 'Break-in oil change, initial inspections, torque checks', 50, null, 17.2, 'technician', 1, 0, 1, 0, 1],
  ['Daily Operational Checks', 'Automated sensor-based monitoring: oil pressure, coolant temp, voltage', 24, null, 0.9, 'technician', 0, 1, 1, 0, 2],
  ['250-Hour Service', 'Oil sample, filter check, visual inspection, fluid levels', 250, null, 0.9, 'technician', 0, 0, 0, 1, 3],
  ['750-Hour Service', 'Oil & filter change, air filter, coolant analysis, belt inspection, battery test', 750, null, 14.7, 'technician', 0, 0, 0, 1, 4],
  ['8,760-Hour / Annual Service', 'Comprehensive annual: valve adjustment, ignition timing, load bank test, emissions check', 8760, 12, 10.7, 'specialist', 0, 0, 1, 1, 5],
  ['24,000-Hour Top End Overhaul', 'Cylinder head service, turbo inspection, exhaust manifold, ignition system rebuild', 24000, null, 82.7, 'specialist', 0, 0, 0, 1, 6],
  ['48,000-Hour Major Overhaul', 'Full engine overhaul: bearings, pistons, rings, seals, alternator inspection', 48000, null, 182.0, 'engineer', 0, 0, 0, 1, 7],
];

for (const t of primeTasks) {
  const result = insertTask.run(sId2, ...t);
  const taskId = result.lastInsertRowid;
  if (t[0].includes('50-Hour')) {
    insertTaskPart.run(taskId, 'OIL-FILTER-88', 'Oil Filter - 8.8L Engine', 1, 0);
    insertTaskPart.run(taskId, 'ENG-OIL-15W40-5', 'Engine Oil 15W-40 (5 gal)', 1, 0);
  }
  if (t[0].includes('250-Hour')) {
    insertTaskPart.run(taskId, 'OIL-SAMPLE-KIT', 'Oil Sample Kit', 1, 0);
  }
  if (t[0].includes('750-Hour')) {
    insertTaskPart.run(taskId, 'OIL-FILTER-88', 'Oil Filter - 8.8L Engine', 1, 0);
    insertTaskPart.run(taskId, 'AIR-FILTER-88', 'Air Filter - 8.8L Engine', 1, 0);
    insertTaskPart.run(taskId, 'ENG-OIL-15W40-5', 'Engine Oil 15W-40 (5 gal)', 1, 0);
    insertTaskPart.run(taskId, 'FUEL-FILTER-NG', 'Natural Gas Fuel Filter', 1, 0);
    insertTaskPart.run(taskId, 'COOLANT-TEST-KIT', 'Coolant Test Strip Kit', 1, 0);
  }
  if (t[0].includes('8,760') || t[0].includes('Annual')) {
    insertTaskPart.run(taskId, 'OIL-FILTER-88', 'Oil Filter - 8.8L Engine', 1, 0);
    insertTaskPart.run(taskId, 'AIR-FILTER-88', 'Air Filter - 8.8L Engine', 1, 0);
    insertTaskPart.run(taskId, 'ENG-OIL-15W40-5', 'Engine Oil 15W-40 (5 gal)', 2, 0);
    insertTaskPart.run(taskId, 'SPARK-PLUG-NG-88', 'Spark Plug Set - 8.8L NG', 1, 0);
    insertTaskPart.run(taskId, 'BELT-SERP-88', 'Serpentine Belt - 8.8L', 1, 0);
    insertTaskPart.run(taskId, 'COOLANT-5GAL', 'Coolant / Antifreeze (5 gal)', 1, 1);
    insertTaskPart.run(taskId, 'IGNITION-COIL-88', 'Ignition Coil Set - 8.8L', 1, 1);
  }
  if (t[0].includes('24,000')) {
    insertTaskPart.run(taskId, 'TOP-END-KIT-88', 'Top End Overhaul Kit - 8.8L', 1, 0);
    insertTaskPart.run(taskId, 'TURBO-REBUILD-KIT', 'Turbocharger Rebuild Kit', 1, 0);
    insertTaskPart.run(taskId, 'EXHAUST-GASKET-SET', 'Exhaust Manifold Gasket Set', 1, 0);
    insertTaskPart.run(taskId, 'HEAD-GASKET-SET-88', 'Head Gasket Set - 8.8L', 1, 0);
  }
  if (t[0].includes('48,000')) {
    insertTaskPart.run(taskId, 'MAJOR-OH-KIT-88', 'Major Overhaul Kit - 8.8L', 1, 0);
    insertTaskPart.run(taskId, 'BEARING-SET-88', 'Main & Rod Bearing Set - 8.8L', 1, 0);
    insertTaskPart.run(taskId, 'PISTON-KIT-88', 'Piston & Ring Kit - 8.8L (set)', 1, 0);
    insertTaskPart.run(taskId, 'SEAL-KIT-FULL-88', 'Full Seal & Gasket Kit - 8.8L', 1, 0);
    insertTaskPart.run(taskId, 'WATER-PUMP-88', 'Water Pump Assembly - 8.8L', 1, 0);
    insertTaskPart.run(taskId, 'OIL-PUMP-88', 'Oil Pump Assembly - 8.8L', 1, 1);
  }
}

// Schedule: Natural Gas - LTP
const s3 = insertSchedule.run('NG LTP - OEM Baseline', 'Standard OEM maintenance for natural gas limited time power generators', null, 'ltp');
const sId3 = s3.lastInsertRowid;

// LTP uses same tasks as Prime
for (const t of primeTasks) {
  insertTask.run(sId3, ...t);
}

// Schedule: Biogas - Continuous
const s4 = insertSchedule.run('Biogas Continuous - OEM Baseline', 'Standard OEM maintenance for biogas continuous duty generators', null, 'continuous');
const sId4 = s4.lastInsertRowid;

const biogasTasks = [
  ['Initial 50-Hour Service', 'Break-in oil change, initial inspections', 50, null, 17.2, 'technician', 1, 0, 1, 0, 1],
  ['Daily Operational Checks', 'Automated sensor monitoring', 24, null, 0.9, 'technician', 0, 1, 1, 0, 2],
  ['200-Hour Service', 'Oil sample, moisture trap drain, gas filter check', 200, null, 1.5, 'technician', 0, 0, 0, 1, 3],
  ['500-Hour Service', 'Oil & filter change, air filter, gas train inspection', 500, null, 12.0, 'technician', 0, 0, 0, 1, 4],
  ['4,000-Hour Service', 'Comprehensive: valve adjustment, spark plugs, ignition timing, emissions', 4000, 6, 16.0, 'specialist', 0, 0, 0, 1, 5],
  ['8,760-Hour / Annual Service', 'Annual overhaul check, load test, exhaust system, catalyst inspection', 8760, 12, 24.0, 'specialist', 0, 0, 1, 1, 6],
  ['20,000-Hour Top End', 'Cylinder heads, turbo, exhaust manifold overhaul', 20000, null, 90.0, 'specialist', 0, 0, 0, 1, 7],
  ['40,000-Hour Major Overhaul', 'Full engine overhaul including short block', 40000, null, 200.0, 'engineer', 0, 0, 0, 1, 8],
];

for (const t of biogasTasks) {
  insertTask.run(sId4, ...t);
}

// ─── Component Lifecycles ───
console.log('Seeding component lifecycles...');

const insertLifecycle = db.prepare(`
  INSERT INTO component_lifecycles
  (equipment_model_id, component_name, category, expected_life_hours, expected_life_hours_min, expected_life_hours_max,
   replacement_labor_hours, failure_mode, criticality, weibull_shape, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Get all model IDs for natural gas models
const ngModels = db.prepare("SELECT id FROM equipment_models WHERE engine_type = 'natural_gas'").all();

for (const model of ngModels) {
  const components = [
    [model.id, 'Spark Plugs', 'ignition', 4000, 3000, 6000, 2.0, 'Electrode erosion', 'low', 3.0, 'Replace as set'],
    [model.id, 'Ignition Coils', 'ignition', 12000, 8000, 16000, 3.0, 'Insulation breakdown', 'medium', 2.5, null],
    [model.id, 'Turbocharger', 'air_system', 30000, 20000, 45000, 16.0, 'Bearing wear / shaft play', 'high', 2.8, 'Rebuild or replace'],
    [model.id, 'Water Pump', 'cooling', 25000, 18000, 35000, 6.0, 'Seal failure / bearing wear', 'high', 2.5, null],
    [model.id, 'Alternator Bearings', 'electrical', 40000, 30000, 60000, 12.0, 'Bearing fatigue', 'high', 3.5, null],
    [model.id, 'Exhaust Manifold', 'exhaust', 35000, 25000, 50000, 8.0, 'Thermal fatigue cracking', 'medium', 2.0, null],
    [model.id, 'Coolant Hoses', 'cooling', 20000, 15000, 30000, 4.0, 'Material degradation', 'medium', 2.2, 'Replace as set'],
    [model.id, 'Serpentine Belt', 'mechanical', 8000, 6000, 12000, 1.0, 'Stretch / cracking', 'low', 3.0, null],
    [model.id, 'Starter Motor', 'electrical', 15000, 10000, 25000, 4.0, 'Brush / solenoid wear', 'medium', 2.0, null],
    [model.id, 'Oxygen Sensors', 'emissions', 8000, 5000, 12000, 1.5, 'Contamination / degradation', 'medium', 2.0, null],
    [model.id, 'Catalytic Converter', 'emissions', 20000, 15000, 30000, 8.0, 'Catalyst degradation', 'medium', 2.5, 'If equipped'],
    [model.id, 'Governor / Throttle Actuator', 'fuel_system', 25000, 18000, 35000, 6.0, 'Mechanical wear', 'high', 2.8, null],
    [model.id, 'Engine Control Module', 'controls', 60000, 40000, 80000, 4.0, 'Electronic failure', 'critical', 1.5, 'Rare but critical'],
    [model.id, 'Crankshaft Main Bearings', 'engine_core', 48000, 35000, 65000, 80.0, 'Fatigue / wear', 'critical', 3.5, 'Part of major overhaul'],
    [model.id, 'Cylinder Heads', 'engine_core', 24000, 18000, 35000, 40.0, 'Valve seat recession / cracks', 'critical', 2.5, 'Part of top end overhaul'],
  ];
  for (const c of components) {
    insertLifecycle.run(...c);
  }
}

// ─── Default Price List ───
console.log('Seeding default price list...');

const priceList = db.prepare(`
  INSERT INTO price_lists (name, description, status, effective_date)
  VALUES ('PSI Standard Parts Price List', 'Default price list with standard PSI parts pricing', 'active', '2025-01-01')
`).run();
const plId = priceList.lastInsertRowid;

const insertItem = db.prepare(`
  INSERT INTO price_list_items (price_list_id, part_number, description, category, unit_price, unit, applicable_models)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const parts = [
  // Oil Filters
  [plId, 'OIL-FILTER-88', 'Oil Filter - 8.8L Engine', 'filter', 28.50, 'each', null],
  [plId, 'OIL-FILTER-111', 'Oil Filter - 11.1L Engine', 'filter', 35.00, 'each', null],
  [plId, 'OIL-FILTER-220', 'Oil Filter - 22.0L Engine', 'filter', 52.00, 'each', null],
  [plId, 'OIL-FILTER-440', 'Oil Filter - 44.0L Engine', 'filter', 68.00, 'each', null],

  // Air Filters
  [plId, 'AIR-FILTER-88', 'Air Filter Element - 8.8L Engine', 'filter', 65.00, 'each', null],
  [plId, 'AIR-FILTER-111', 'Air Filter Element - 11.1L Engine', 'filter', 85.00, 'each', null],
  [plId, 'AIR-FILTER-220', 'Air Filter Element - 22.0L Engine', 'filter', 120.00, 'each', null],
  [plId, 'AIR-FILTER-440', 'Air Filter Element - 44.0L Engine', 'filter', 165.00, 'each', null],

  // Fuel Filters
  [plId, 'FUEL-FILTER-NG', 'Natural Gas Fuel Filter', 'filter', 42.00, 'each', null],
  [plId, 'FUEL-FILTER-BG', 'Biogas Fuel Filter (heavy duty)', 'filter', 68.00, 'each', null],
  [plId, 'FUEL-FILTER-DSL', 'Diesel Fuel Filter', 'filter', 38.00, 'each', null],

  // Engine Oil
  [plId, 'ENG-OIL-15W40-5', 'Engine Oil 15W-40 (5 gallon pail)', 'fluid', 85.00, '5gal', null],
  [plId, 'ENG-OIL-15W40-55', 'Engine Oil 15W-40 (55 gallon drum)', 'fluid', 750.00, '55gal', null],
  [plId, 'ENG-OIL-SYNTH-5', 'Synthetic Engine Oil 5W-40 (5 gallon)', 'fluid', 145.00, '5gal', null],

  // Coolant
  [plId, 'COOLANT-5GAL', 'Extended Life Coolant / Antifreeze (5 gal)', 'fluid', 52.00, '5gal', null],
  [plId, 'COOLANT-SCA', 'Supplemental Coolant Additive (1 gal)', 'fluid', 28.00, 'gal', null],
  [plId, 'COOLANT-TEST-KIT', 'Coolant Test Strip Kit (50 strips)', 'consumable', 15.00, 'kit', null],

  // Spark Plugs & Ignition
  [plId, 'SPARK-PLUG-NG-88', 'Spark Plug Set - 8.8L NG (6 plugs)', 'ignition', 180.00, 'set', null],
  [plId, 'SPARK-PLUG-NG-111', 'Spark Plug Set - 11.1L NG (8 plugs)', 'ignition', 240.00, 'set', null],
  [plId, 'IGNITION-COIL-88', 'Ignition Coil Pack Set - 8.8L', 'ignition', 450.00, 'set', null],
  [plId, 'IGNITION-COIL-111', 'Ignition Coil Pack Set - 11.1L', 'ignition', 600.00, 'set', null],
  [plId, 'SPARK-PLUG-WIRE-SET', 'Spark Plug Wire Set', 'ignition', 125.00, 'set', null],

  // Belts
  [plId, 'BELT-SERP-88', 'Serpentine Belt - 8.8L Engine', 'mechanical', 45.00, 'each', null],
  [plId, 'BELT-SERP-111', 'Serpentine Belt - 11.1L Engine', 'mechanical', 55.00, 'each', null],
  [plId, 'BELT-SERP-220', 'Serpentine Belt - 22.0L Engine', 'mechanical', 72.00, 'each', null],
  [plId, 'BELT-TENSIONER-88', 'Belt Tensioner Assembly - 8.8L', 'mechanical', 165.00, 'each', null],

  // Overhaul Kits
  [plId, 'TOP-END-KIT-88', 'Top End Overhaul Kit - 8.8L', 'major_component', 8500.00, 'kit', null],
  [plId, 'TOP-END-KIT-111', 'Top End Overhaul Kit - 11.1L', 'major_component', 12000.00, 'kit', null],
  [plId, 'MAJOR-OH-KIT-88', 'Major Overhaul Kit - 8.8L', 'major_component', 22000.00, 'kit', null],
  [plId, 'MAJOR-OH-KIT-111', 'Major Overhaul Kit - 11.1L', 'major_component', 28000.00, 'kit', null],
  [plId, 'MAJOR-OH-KIT-220', 'Major Overhaul Kit - 22.0L', 'major_component', 45000.00, 'kit', null],

  // Bearings & Pistons
  [plId, 'BEARING-SET-88', 'Main & Rod Bearing Set - 8.8L', 'major_component', 2800.00, 'set', null],
  [plId, 'PISTON-KIT-88', 'Piston & Ring Kit - 8.8L (complete set)', 'major_component', 4200.00, 'set', null],
  [plId, 'SEAL-KIT-FULL-88', 'Full Seal & Gasket Kit - 8.8L', 'gasket', 1800.00, 'kit', null],
  [plId, 'HEAD-GASKET-SET-88', 'Cylinder Head Gasket Set - 8.8L', 'gasket', 650.00, 'set', null],

  // Turbo
  [plId, 'TURBO-REBUILD-KIT', 'Turbocharger Rebuild Kit (universal)', 'major_component', 1200.00, 'kit', null],
  [plId, 'TURBO-ASSY-88', 'Turbocharger Assembly - 8.8L (new)', 'major_component', 3500.00, 'each', null],
  [plId, 'TURBO-ASSY-111', 'Turbocharger Assembly - 11.1L (new)', 'major_component', 4200.00, 'each', null],

  // Water Pump & Cooling
  [plId, 'WATER-PUMP-88', 'Water Pump Assembly - 8.8L', 'cooling', 380.00, 'each', null],
  [plId, 'WATER-PUMP-111', 'Water Pump Assembly - 11.1L', 'cooling', 450.00, 'each', null],
  [plId, 'THERMOSTAT-88', 'Thermostat - 8.8L Engine', 'cooling', 42.00, 'each', null],
  [plId, 'RADIATOR-HOSE-KIT', 'Radiator Hose Kit (upper + lower)', 'cooling', 95.00, 'kit', null],

  // Exhaust
  [plId, 'EXHAUST-GASKET-SET', 'Exhaust Manifold Gasket Set', 'gasket', 125.00, 'set', null],
  [plId, 'O2-SENSOR', 'Oxygen Sensor (wideband)', 'sensor', 185.00, 'each', null],
  [plId, 'CATALYST-ELEMENT', 'Catalytic Converter Element', 'emissions', 2200.00, 'each', null],

  // Electrical
  [plId, 'STARTER-MOTOR-88', 'Starter Motor - 8.8L (remanufactured)', 'electrical', 650.00, 'each', null],
  [plId, 'ALTERNATOR-BEARING-KIT', 'Alternator Bearing Kit', 'electrical', 280.00, 'kit', null],
  [plId, 'BATTERY-12V-AGM', 'Starting Battery 12V AGM (heavy duty)', 'electrical', 220.00, 'each', null],

  // Oil Pump
  [plId, 'OIL-PUMP-88', 'Oil Pump Assembly - 8.8L', 'major_component', 520.00, 'each', null],

  // Consumables / Misc
  [plId, 'OIL-SAMPLE-KIT', 'Oil Sample Kit (bottle + label)', 'consumable', 8.50, 'each', null],
  [plId, 'GOVERNOR-ACTUATOR', 'Governor / Throttle Actuator', 'fuel_system', 1450.00, 'each', null],
  [plId, 'ECM-MODULE', 'Engine Control Module (ECM)', 'controls', 3800.00, 'each', null],
];

for (const p of parts) {
  insertItem.run(...p);
}

console.log(`Seeded ${parts.length} parts in default price list`);

// ─── Default Fleet ───
console.log('Seeding sample fleet...');

const fleet = db.prepare(`
  INSERT INTO fleets (name, description, location) VALUES ('Sample Fleet - 10 Unit NG Prime', 'Sample fleet of 10 PSI natural gas generators for prime power', 'Industrial Park, TX')
`).run();
const fleetId = fleet.lastInsertRowid;

// Get model IDs
const model300 = db.prepare("SELECT id FROM equipment_models WHERE model_number = 'PSI-11.1L-NG-300'").get();
const model200 = db.prepare("SELECT id FROM equipment_models WHERE model_number = 'PSI-8.8L-NG-200'").get();

if (model300 && model200) {
  db.prepare(`
    INSERT INTO fleet_units (fleet_id, equipment_model_id, unit_name, quantity, application_type, annual_hours, duty_cycle, fuel_type, fuel_quality, environment, commissioning_rate_per_month)
    VALUES (?, ?, 'Primary 300kW Units', 6, 'prime', 6500, 0.75, 'natural_gas', 'pipeline', 'normal', 2)
  `).run(fleetId, model300.id);

  db.prepare(`
    INSERT INTO fleet_units (fleet_id, equipment_model_id, unit_name, quantity, application_type, annual_hours, duty_cycle, fuel_type, fuel_quality, environment, commissioning_rate_per_month)
    VALUES (?, ?, 'Secondary 200kW Units', 4, 'prime', 6500, 0.65, 'natural_gas', 'pipeline', 'normal', 2)
  `).run(fleetId, model200.id);
}

// ─── Default Scenario ───
console.log('Seeding sample scenario...');

const scheduleId = sId2; // NG Prime schedule
db.prepare(`
  INSERT INTO scenarios (name, description, fleet_id, pm_schedule_id, price_list_id, analysis_period_years,
    labor_rate, labor_rate_specialist, labor_rate_engineer, parts_discount_pct, overhead_markup_pct,
    working_days_per_year, hours_per_day, target_utilization_pct, discount_rate_pct, inflation_rate_pct,
    fuel_cost_per_unit, downtime_cost_per_hour)
  VALUES ('Sample: 10-Unit NG Prime TCO', 'Total cost of ownership analysis for a 10-unit natural gas prime power fleet',
    ?, ?, ?, 20, 120, 180, 250, 20, 15, 250, 8, 75, 5, 3, 1.05, 500)
`).run(fleetId, scheduleId, plId);

console.log('Seed complete!');
