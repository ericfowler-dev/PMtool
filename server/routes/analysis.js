const express = require('express');
const router = express.Router();
const { db } = require('../database');

// ─────────────────────────────────────────────────────────────
// Helper: Load all data needed for an analysis from a scenario
// ─────────────────────────────────────────────────────────────
function loadScenarioData(scenarioId) {
  const scenario = db.prepare(`
    SELECT s.*,
      f.name AS fleet_name,
      ps.name AS pm_schedule_name,
      pl.name AS price_list_name
    FROM scenarios s
    LEFT JOIN fleets f ON f.id = s.fleet_id
    LEFT JOIN pm_schedules ps ON ps.id = s.pm_schedule_id
    LEFT JOIN price_lists pl ON pl.id = s.price_list_id
    WHERE s.id = ?
  `).get(scenarioId);

  if (!scenario) return null;

  // Fleet units with model info
  const fleetUnits = scenario.fleet_id
    ? db.prepare(`
        SELECT fu.*,
          em.model_number, em.manufacturer, em.engine_type, em.engine_family,
          em.power_rating_kw, em.power_rating_hp,
          em.fuel_consumption_rate_full, em.fuel_consumption_rate_75,
          em.fuel_consumption_rate_50, em.fuel_consumption_unit,
          em.default_annual_hours_standby, em.default_annual_hours_prime,
          em.default_annual_hours_ltp, em.default_annual_hours_continuous
        FROM fleet_units fu
        JOIN equipment_models em ON em.id = fu.equipment_model_id
        WHERE fu.fleet_id = ?
      `).all(scenario.fleet_id)
    : [];

  // PM tasks with parts
  const pmTasks = scenario.pm_schedule_id
    ? db.prepare('SELECT * FROM pm_tasks WHERE pm_schedule_id = ? ORDER BY sort_order').all(scenario.pm_schedule_id)
    : [];

  const getTaskParts = db.prepare('SELECT * FROM pm_task_parts WHERE pm_task_id = ?');
  for (const task of pmTasks) {
    task.parts = getTaskParts.all(task.id);
  }

  // Price list items (indexed by part_number for quick lookup)
  const priceMap = {};
  if (scenario.price_list_id) {
    const items = db.prepare('SELECT * FROM price_list_items WHERE price_list_id = ?').all(scenario.price_list_id);
    for (const item of items) {
      priceMap[item.part_number] = item;
    }
  }

  // Component lifecycles for all models in the fleet
  const modelIds = [...new Set(fleetUnits.map(u => u.equipment_model_id))];
  const componentLifecycles = modelIds.length > 0
    ? db.prepare(`
        SELECT * FROM component_lifecycles
        WHERE equipment_model_id IN (${modelIds.map(() => '?').join(',')})
      `).all(...modelIds)
    : [];

  return { scenario, fleetUnits, pmTasks, priceMap, componentLifecycles };
}

// ─────────────────────────────────────────────────────────────
// Helper: Get the labor rate for a given skill level
// ─────────────────────────────────────────────────────────────
function getLaborRate(scenario, skillLevel) {
  switch ((skillLevel || 'technician').toLowerCase()) {
    case 'specialist':
      return scenario.labor_rate_specialist;
    case 'engineer':
      return scenario.labor_rate_engineer;
    case 'technician':
    default:
      return scenario.labor_rate;
  }
}

// ─────────────────────────────────────────────────────────────
// Helper: Look up price of a part, applying discount
// ─────────────────────────────────────────────────────────────
function getPartCost(priceMap, partNumber, quantity, discountPct) {
  if (!partNumber || !priceMap[partNumber]) return 0;
  const unitPrice = priceMap[partNumber].unit_price;
  const discount = discountPct / 100;
  return unitPrice * (1 - discount) * quantity;
}

// ─────────────────────────────────────────────────────────────
// Core calculation engine
// ─────────────────────────────────────────────────────────────
function runAnalysis(data) {
  const { scenario, fleetUnits, pmTasks, priceMap, componentLifecycles } = data;

  const analysisPeriod = scenario.analysis_period_years;
  const discountRate = scenario.discount_rate_pct / 100;
  const inflationRate = scenario.inflation_rate_pct / 100;
  const overheadMarkup = scenario.overhead_markup_pct / 100;
  const partsDiscount = scenario.parts_discount_pct;
  const availableHoursPerTech = scenario.working_days_per_year * scenario.hours_per_day * (scenario.target_utilization_pct / 100);

  // ── Aggregate fleet info ──
  const totalUnits = fleetUnits.reduce((sum, u) => sum + u.quantity, 0);
  const totalKw = fleetUnits.reduce((sum, u) => sum + (u.power_rating_kw * u.quantity), 0);

  // Weighted average annual hours across the fleet
  const totalWeightedHours = fleetUnits.reduce((sum, u) => {
    const hours = u.annual_hours || getDefaultHours(u);
    return sum + hours * u.quantity;
  }, 0);
  const avgAnnualHours = totalUnits > 0 ? totalWeightedHours / totalUnits : 0;

  // ── PM cost breakdown by task ──
  const taskBreakdown = [];
  let totalAnnualLaborHours = 0;
  let totalAnnualLaborCost = 0;
  let totalAnnualPartsCost = 0;

  for (const task of pmTasks) {
    let servicesPerYear;

    if (task.is_one_time) {
      // One-time services: spread over the fleet during first year
      servicesPerYear = totalUnits; // once per unit, in the first year
    } else if (task.interval_hours) {
      // Hours-based interval: (total_units * avg_annual_hours) / interval_hours
      servicesPerYear = (totalUnits * avgAnnualHours) / task.interval_hours;
    } else if (task.interval_months) {
      // Calendar-based interval: total_units * (12 / interval_months)
      servicesPerYear = totalUnits * (12 / task.interval_months);
    } else {
      servicesPerYear = 0;
    }

    const laborRate = getLaborRate(scenario, task.skill_level);
    const laborHoursPerYear = servicesPerYear * task.labor_hours;
    const laborCostPerYear = laborHoursPerYear * laborRate;

    // Parts cost per service
    let partsPerService = 0;
    const partDetails = [];
    for (const part of task.parts) {
      if (part.is_optional) continue; // Skip optional parts in base calculation
      const cost = getPartCost(priceMap, part.part_number, part.quantity, partsDiscount);
      partsPerService += cost;
      partDetails.push({
        part_number: part.part_number,
        description: part.description,
        quantity: part.quantity,
        unit_cost: priceMap[part.part_number] ? priceMap[part.part_number].unit_price : 0,
        discounted_cost: cost / (part.quantity || 1),
        total_cost_per_service: cost
      });
    }

    const partsCostPerYear = partsPerService * servicesPerYear;

    totalAnnualLaborHours += laborHoursPerYear;
    totalAnnualLaborCost += laborCostPerYear;
    totalAnnualPartsCost += partsCostPerYear;

    taskBreakdown.push({
      task_id: task.id,
      task_name: task.name,
      skill_level: task.skill_level,
      is_one_time: !!task.is_one_time,
      interval_hours: task.interval_hours,
      interval_months: task.interval_months,
      services_per_year: round2(servicesPerYear),
      labor_hours_per_service: task.labor_hours,
      labor_hours_per_year: round2(laborHoursPerYear),
      labor_rate: laborRate,
      labor_cost_per_year: round2(laborCostPerYear),
      parts_cost_per_service: round2(partsPerService),
      parts_cost_per_year: round2(partsCostPerYear),
      total_cost_per_year: round2(laborCostPerYear + partsCostPerYear),
      parts: partDetails
    });
  }

  // Apply overhead markup to maintenance costs
  const annualMaintenanceCostBase = totalAnnualLaborCost + totalAnnualPartsCost;
  const annualOverhead = annualMaintenanceCostBase * overheadMarkup;
  const totalAnnualMaintenanceCost = annualMaintenanceCostBase + annualOverhead;

  // ── Staffing requirements ──
  const safetyFactor = 1.15;
  const techniciansNeeded = availableHoursPerTech > 0
    ? Math.ceil((totalAnnualLaborHours * safetyFactor) / availableHoursPerTech)
    : 0;

  const staffing = {
    total_annual_labor_hours: round2(totalAnnualLaborHours),
    available_hours_per_technician: round2(availableHoursPerTech),
    safety_factor: safetyFactor,
    technicians_needed: techniciansNeeded,
    utilization_without_safety: availableHoursPerTech > 0
      ? round2((totalAnnualLaborHours / (techniciansNeeded * availableHoursPerTech)) * 100)
      : 0
  };

  // ── Fuel cost projections ──
  let annualFuelCost = 0;
  const fuelDetails = [];

  if (scenario.include_fuel_costs) {
    for (const unit of fleetUnits) {
      const hours = unit.annual_hours || getDefaultHours(unit);
      const dutyCycle = unit.duty_cycle || 0.75;

      // Use fuel rate based on duty cycle
      let fuelRate;
      if (dutyCycle >= 0.85) {
        fuelRate = unit.fuel_consumption_rate_full || 0;
      } else if (dutyCycle >= 0.6) {
        fuelRate = unit.fuel_consumption_rate_75 || unit.fuel_consumption_rate_full || 0;
      } else {
        fuelRate = unit.fuel_consumption_rate_50 || unit.fuel_consumption_rate_75 || unit.fuel_consumption_rate_full || 0;
      }

      const unitFuelCost = fuelRate * hours * scenario.fuel_cost_per_unit * unit.quantity;
      annualFuelCost += unitFuelCost;

      fuelDetails.push({
        unit_name: unit.unit_name || unit.model_number,
        model_number: unit.model_number,
        quantity: unit.quantity,
        annual_hours: hours,
        duty_cycle: dutyCycle,
        fuel_rate: fuelRate,
        fuel_unit: unit.fuel_consumption_unit || 'therms/hr',
        annual_fuel_cost: round2(unitFuelCost)
      });
    }
  }

  // ── Component replacement schedule ──
  const componentReplacements = [];
  let totalComponentCostOverPeriod = 0;

  for (const lifecycle of componentLifecycles) {
    // Find fleet units matching this component's model
    const matchingUnits = fleetUnits.filter(u => u.equipment_model_id === lifecycle.equipment_model_id);
    if (matchingUnits.length === 0) continue;

    for (const unit of matchingUnits) {
      const hours = unit.annual_hours || getDefaultHours(unit);
      if (hours <= 0 || lifecycle.expected_life_hours <= 0) continue;

      const yearsPerReplacement = lifecycle.expected_life_hours / hours;
      const replacementsOverPeriod = Math.floor(analysisPeriod / yearsPerReplacement);

      if (replacementsOverPeriod <= 0) continue;

      // Estimate replacement cost: labor + look up parts in price list if available
      const laborRate = getLaborRate(scenario, 'specialist');
      const laborCost = lifecycle.replacement_labor_hours * laborRate;

      // Try to find parts cost from price list (match by component name as part number)
      let partsCost = getPartCost(priceMap, lifecycle.component_name, 1, partsDiscount);

      const costPerReplacement = laborCost + partsCost;

      // Calculate each replacement year and accumulate NPV
      const schedule = [];
      for (let r = 1; r <= replacementsOverPeriod; r++) {
        const year = Math.ceil(yearsPerReplacement * r);
        if (year > analysisPeriod) break;

        const inflatedCost = costPerReplacement * Math.pow(1 + inflationRate, year);
        totalComponentCostOverPeriod += inflatedCost;

        schedule.push({
          replacement_number: r,
          year,
          estimated_cost: round2(inflatedCost)
        });
      }

      componentReplacements.push({
        component_name: lifecycle.component_name,
        category: lifecycle.category,
        model_number: unit.model_number,
        unit_name: unit.unit_name,
        quantity: unit.quantity,
        expected_life_hours: lifecycle.expected_life_hours,
        years_per_replacement: round2(yearsPerReplacement),
        replacements_over_period: schedule.length,
        labor_hours: lifecycle.replacement_labor_hours,
        cost_per_replacement: round2(costPerReplacement),
        criticality: lifecycle.criticality,
        schedule
      });
    }
  }

  // ── Downtime cost estimates ──
  let annualDowntimeCost = 0;
  if (scenario.include_downtime_costs) {
    // Estimate downtime from PM tasks (each service causes some downtime)
    const totalServicesPerYear = taskBreakdown.reduce((sum, t) => sum + t.services_per_year, 0);
    // Average downtime per service = labor hours * 1.5 (includes setup/teardown/testing)
    const avgDowntimePerService = pmTasks.length > 0
      ? (totalAnnualLaborHours / totalServicesPerYear) * 1.5
      : 0;
    const totalDowntimeHours = totalServicesPerYear * avgDowntimePerService;
    annualDowntimeCost = totalDowntimeHours * scenario.downtime_cost_per_hour;
  }

  // ── Annual cost projections (year-by-year with inflation) ──
  const annualProjections = [];
  let cumulativeCost = 0;
  let npvTotal = 0;

  for (let year = 1; year <= analysisPeriod; year++) {
    const inflationMultiplier = Math.pow(1 + inflationRate, year - 1);
    const discountMultiplier = Math.pow(1 + discountRate, year);

    // Maintenance costs (with inflation)
    let yearMaintenanceCost = totalAnnualMaintenanceCost * inflationMultiplier;

    // One-time tasks only in year 1
    const oneTimeCosts = taskBreakdown
      .filter(t => t.is_one_time)
      .reduce((sum, t) => sum + t.total_cost_per_year, 0);

    // For one-time tasks, only include in year 1; remove from other years
    if (year > 1) {
      yearMaintenanceCost -= oneTimeCosts * inflationMultiplier;
      // But inflate the recurring portion
    }

    // Fuel costs (with inflation)
    const yearFuelCost = scenario.include_fuel_costs
      ? annualFuelCost * inflationMultiplier
      : 0;

    // Downtime costs (with inflation)
    const yearDowntimeCost = scenario.include_downtime_costs
      ? annualDowntimeCost * inflationMultiplier
      : 0;

    // Component replacement costs for this specific year
    let yearComponentCost = 0;
    for (const comp of componentReplacements) {
      for (const sched of comp.schedule) {
        if (sched.year === year) {
          yearComponentCost += sched.estimated_cost * comp.quantity;
        }
      }
    }

    const yearTotalCost = yearMaintenanceCost + yearFuelCost + yearDowntimeCost + yearComponentCost;
    cumulativeCost += yearTotalCost;

    const yearNpv = yearTotalCost / discountMultiplier;
    npvTotal += yearNpv;

    // Fleet deployment ramp: how many units are commissioned by this year
    let unitsCommissioned = 0;
    for (const unit of fleetUnits) {
      const rate = unit.commissioning_rate_per_month || 1;
      const monthsToFullDeploy = Math.ceil(unit.quantity / rate);
      const yearsToFullDeploy = monthsToFullDeploy / 12;
      if (year >= Math.ceil(yearsToFullDeploy)) {
        unitsCommissioned += unit.quantity;
      } else {
        // Partial deployment: how many units commissioned by this year-end
        const monthsElapsed = year * 12;
        const deployed = Math.min(unit.quantity, Math.floor(monthsElapsed * rate));
        unitsCommissioned += deployed;
      }
    }

    // Staffing ramp
    const yearLaborHoursScaled = totalUnits > 0
      ? totalAnnualLaborHours * (unitsCommissioned / totalUnits)
      : 0;
    const yearTechsNeeded = availableHoursPerTech > 0
      ? Math.ceil((yearLaborHoursScaled * safetyFactor) / availableHoursPerTech)
      : 0;

    annualProjections.push({
      year,
      units_commissioned: unitsCommissioned,
      technicians_needed: yearTechsNeeded,
      maintenance_cost: round2(yearMaintenanceCost),
      fuel_cost: round2(yearFuelCost),
      downtime_cost: round2(yearDowntimeCost),
      component_replacement_cost: round2(yearComponentCost),
      total_cost: round2(yearTotalCost),
      cumulative_cost: round2(cumulativeCost),
      npv_of_year: round2(yearNpv)
    });
  }

  // ── Cost per kWh ──
  const totalAnnualKwh = totalKw * avgAnnualHours;
  const costPerKwh = totalAnnualKwh > 0
    ? totalAnnualMaintenanceCost / totalAnnualKwh
    : 0;

  // ── TCO Summary ──
  const tco = {
    total_npv: round2(npvTotal),
    total_nominal: round2(cumulativeCost),
    analysis_period_years: analysisPeriod,
    average_annual_cost: round2(cumulativeCost / analysisPeriod),
    average_annual_cost_npv: round2(npvTotal / analysisPeriod)
  };

  return {
    scenario_id: scenario.id,
    scenario_name: scenario.name,
    calculated_at: new Date().toISOString(),

    fleet_summary: {
      fleet_name: scenario.fleet_name,
      total_units: totalUnits,
      total_kw: round2(totalKw),
      average_annual_hours: round2(avgAnnualHours),
      total_annual_kwh: round2(totalAnnualKwh)
    },

    maintenance_cost_summary: {
      annual_labor_cost: round2(totalAnnualLaborCost),
      annual_parts_cost: round2(totalAnnualPartsCost),
      annual_overhead: round2(annualOverhead),
      overhead_markup_pct: scenario.overhead_markup_pct,
      total_annual_maintenance_cost: round2(totalAnnualMaintenanceCost)
    },

    pm_task_breakdown: taskBreakdown,

    staffing,

    fuel_summary: {
      enabled: !!scenario.include_fuel_costs,
      fuel_cost_per_unit: scenario.fuel_cost_per_unit,
      annual_fuel_cost: round2(annualFuelCost),
      details: fuelDetails
    },

    downtime_summary: {
      enabled: !!scenario.include_downtime_costs,
      downtime_cost_per_hour: scenario.downtime_cost_per_hour,
      annual_downtime_cost: round2(annualDowntimeCost)
    },

    component_replacements: {
      total_cost_over_period: round2(totalComponentCostOverPeriod),
      components: componentReplacements
    },

    cost_per_kwh: round2(costPerKwh),

    tco,

    annual_projections: annualProjections,

    parameters: {
      analysis_period_years: analysisPeriod,
      labor_rate: scenario.labor_rate,
      labor_rate_specialist: scenario.labor_rate_specialist,
      labor_rate_engineer: scenario.labor_rate_engineer,
      parts_discount_pct: scenario.parts_discount_pct,
      overhead_markup_pct: scenario.overhead_markup_pct,
      discount_rate_pct: scenario.discount_rate_pct,
      inflation_rate_pct: scenario.inflation_rate_pct,
      fuel_cost_per_unit: scenario.fuel_cost_per_unit,
      downtime_cost_per_hour: scenario.downtime_cost_per_hour
    }
  };
}

// ─────────────────────────────────────────────────────────────
// Helper: Get default hours from equipment model based on app type
// ─────────────────────────────────────────────────────────────
function getDefaultHours(unit) {
  const appType = unit.application_type || 'prime';
  const key = `default_annual_hours_${appType}`;
  return unit[key] || unit.default_annual_hours_prime || 6500;
}

// ─────────────────────────────────────────────────────────────
// Helper: Round to 2 decimal places
// ─────────────────────────────────────────────────────────────
function round2(val) {
  return Math.round((val || 0) * 100) / 100;
}

// ═════════════════════════════════════════════════════════════
// POST /calculate - Run full analysis for a scenario
// ═════════════════════════════════════════════════════════════
router.post('/calculate', (req, res) => {
  try {
    const { scenario_id } = req.body;

    if (!scenario_id) {
      return res.status(400).json({ error: 'Missing required field: scenario_id' });
    }

    const data = loadScenarioData(scenario_id);
    if (!data) {
      return res.status(404).json({ error: 'Scenario not found' });
    }

    if (!data.scenario.fleet_id) {
      return res.status(400).json({ error: 'Scenario has no fleet assigned' });
    }

    if (!data.scenario.pm_schedule_id) {
      return res.status(400).json({ error: 'Scenario has no PM schedule assigned' });
    }

    if (data.fleetUnits.length === 0) {
      return res.status(400).json({ error: 'Fleet has no units' });
    }

    const results = runAnalysis(data);

    res.json(results);
  } catch (err) {
    console.error('Error running analysis:', err);
    res.status(500).json({ error: 'Failed to run analysis', details: err.message });
  }
});

// ═════════════════════════════════════════════════════════════
// POST /compare - Compare multiple scenarios side by side
// ═════════════════════════════════════════════════════════════
router.post('/compare', (req, res) => {
  try {
    const { scenario_ids } = req.body;

    if (!scenario_ids || !Array.isArray(scenario_ids) || scenario_ids.length < 2) {
      return res.status(400).json({ error: 'Provide at least 2 scenario_ids as an array' });
    }

    const results = [];
    const errors = [];

    for (const scenarioId of scenario_ids) {
      const data = loadScenarioData(scenarioId);
      if (!data) {
        errors.push({ scenario_id: scenarioId, error: 'Scenario not found' });
        continue;
      }

      if (!data.scenario.fleet_id || !data.scenario.pm_schedule_id || data.fleetUnits.length === 0) {
        errors.push({
          scenario_id: scenarioId,
          error: 'Scenario is incomplete (missing fleet, PM schedule, or fleet has no units)'
        });
        continue;
      }

      try {
        results.push(runAnalysis(data));
      } catch (calcErr) {
        errors.push({ scenario_id: scenarioId, error: calcErr.message });
      }
    }

    if (results.length === 0) {
      return res.status(400).json({ error: 'No valid scenarios to compare', details: errors });
    }

    // Build comparison summary
    const comparison = {
      scenarios: results.map(r => ({
        scenario_id: r.scenario_id,
        scenario_name: r.scenario_name,
        total_units: r.fleet_summary.total_units,
        total_kw: r.fleet_summary.total_kw,
        annual_maintenance_cost: r.maintenance_cost_summary.total_annual_maintenance_cost,
        annual_fuel_cost: r.fuel_summary.annual_fuel_cost,
        annual_downtime_cost: r.downtime_summary.annual_downtime_cost,
        cost_per_kwh: r.cost_per_kwh,
        technicians_needed: r.staffing.technicians_needed,
        tco_npv: r.tco.total_npv,
        tco_nominal: r.tco.total_nominal,
        average_annual_cost: r.tco.average_annual_cost
      })),
      full_results: results,
      errors: errors.length > 0 ? errors : undefined
    };

    // Determine the lowest-cost scenario
    if (comparison.scenarios.length >= 2) {
      const sorted = [...comparison.scenarios].sort((a, b) => a.tco_npv - b.tco_npv);
      comparison.lowest_tco = {
        scenario_id: sorted[0].scenario_id,
        scenario_name: sorted[0].scenario_name,
        tco_npv: sorted[0].tco_npv,
        savings_vs_highest: round2(sorted[sorted.length - 1].tco_npv - sorted[0].tco_npv)
      };
    }

    res.json(comparison);
  } catch (err) {
    console.error('Error comparing scenarios:', err);
    res.status(500).json({ error: 'Failed to compare scenarios', details: err.message });
  }
});

// ═════════════════════════════════════════════════════════════
// POST /quick-calculate - Quick calculation without saving
// ═════════════════════════════════════════════════════════════
router.post('/quick-calculate', (req, res) => {
  try {
    const {
      // Fleet definition (inline)
      fleet_units: inlineUnits,
      // Or reference existing fleet
      fleet_id,

      // PM schedule (inline tasks)
      pm_tasks: inlineTasks,
      // Or reference existing schedule
      pm_schedule_id,

      // Price list reference
      price_list_id,

      // Analysis parameters with defaults
      analysis_period_years = 20,
      labor_rate = 120,
      labor_rate_specialist = 180,
      labor_rate_engineer = 250,
      parts_discount_pct = 20,
      overhead_markup_pct = 15,
      working_days_per_year = 250,
      hours_per_day = 8,
      target_utilization_pct = 75,
      discount_rate_pct = 5,
      inflation_rate_pct = 3,
      fuel_cost_per_unit = 1.0,
      downtime_cost_per_hour = 500,
      include_fuel_costs = true,
      include_downtime_costs = true
    } = req.body;

    // Build synthetic scenario object
    const scenario = {
      id: null,
      name: 'Quick Calculation',
      fleet_id,
      pm_schedule_id,
      price_list_id,
      analysis_period_years,
      labor_rate,
      labor_rate_specialist,
      labor_rate_engineer,
      parts_discount_pct,
      overhead_markup_pct,
      working_days_per_year,
      hours_per_day,
      target_utilization_pct,
      discount_rate_pct,
      inflation_rate_pct,
      fuel_cost_per_unit,
      downtime_cost_per_hour,
      include_fuel_costs: include_fuel_costs ? 1 : 0,
      include_downtime_costs: include_downtime_costs ? 1 : 0,
      fleet_name: 'Quick Calculation Fleet'
    };

    // Resolve fleet units
    let fleetUnits = [];
    if (fleet_id) {
      fleetUnits = db.prepare(`
        SELECT fu.*,
          em.model_number, em.manufacturer, em.engine_type, em.engine_family,
          em.power_rating_kw, em.power_rating_hp,
          em.fuel_consumption_rate_full, em.fuel_consumption_rate_75,
          em.fuel_consumption_rate_50, em.fuel_consumption_unit,
          em.default_annual_hours_standby, em.default_annual_hours_prime,
          em.default_annual_hours_ltp, em.default_annual_hours_continuous
        FROM fleet_units fu
        JOIN equipment_models em ON em.id = fu.equipment_model_id
        WHERE fu.fleet_id = ?
      `).all(fleet_id);
    } else if (inlineUnits && Array.isArray(inlineUnits)) {
      // Inline units: each must have equipment_model_id
      for (const iu of inlineUnits) {
        if (!iu.equipment_model_id) continue;
        const model = db.prepare('SELECT * FROM equipment_models WHERE id = ?').get(iu.equipment_model_id);
        if (!model) continue;

        fleetUnits.push({
          id: null,
          fleet_id: null,
          equipment_model_id: iu.equipment_model_id,
          unit_name: iu.unit_name || model.model_number,
          quantity: iu.quantity || 1,
          application_type: iu.application_type || 'prime',
          annual_hours: iu.annual_hours || null,
          duty_cycle: iu.duty_cycle ?? 0.75,
          fuel_type: iu.fuel_type || 'natural_gas',
          fuel_quality: iu.fuel_quality || 'pipeline',
          environment: iu.environment || 'normal',
          commissioning_rate_per_month: iu.commissioning_rate_per_month ?? 1,
          model_number: model.model_number,
          manufacturer: model.manufacturer,
          engine_type: model.engine_type,
          engine_family: model.engine_family,
          power_rating_kw: model.power_rating_kw,
          power_rating_hp: model.power_rating_hp,
          fuel_consumption_rate_full: model.fuel_consumption_rate_full,
          fuel_consumption_rate_75: model.fuel_consumption_rate_75,
          fuel_consumption_rate_50: model.fuel_consumption_rate_50,
          fuel_consumption_unit: model.fuel_consumption_unit,
          default_annual_hours_standby: model.default_annual_hours_standby,
          default_annual_hours_prime: model.default_annual_hours_prime,
          default_annual_hours_ltp: model.default_annual_hours_ltp,
          default_annual_hours_continuous: model.default_annual_hours_continuous
        });
      }
    }

    if (fleetUnits.length === 0) {
      return res.status(400).json({
        error: 'No fleet units provided. Supply fleet_id or fleet_units array with equipment_model_id.'
      });
    }

    // Resolve PM tasks
    let pmTasks = [];
    if (pm_schedule_id) {
      pmTasks = db.prepare('SELECT * FROM pm_tasks WHERE pm_schedule_id = ? ORDER BY sort_order').all(pm_schedule_id);
      const getTaskParts = db.prepare('SELECT * FROM pm_task_parts WHERE pm_task_id = ?');
      for (const task of pmTasks) {
        task.parts = getTaskParts.all(task.id);
      }
    } else if (inlineTasks && Array.isArray(inlineTasks)) {
      pmTasks = inlineTasks.map((t, idx) => ({
        id: null,
        pm_schedule_id: null,
        name: t.name || `Task ${idx + 1}`,
        description: t.description || null,
        interval_hours: t.interval_hours || null,
        interval_months: t.interval_months || null,
        labor_hours: t.labor_hours ?? 1,
        skill_level: t.skill_level || 'technician',
        is_one_time: t.is_one_time ? 1 : 0,
        is_automated: t.is_automated ? 1 : 0,
        is_locked: t.is_locked ? 1 : 0,
        can_extend_interval: t.can_extend_interval !== false ? 1 : 0,
        max_extension_pct: t.max_extension_pct ?? 0.6,
        sort_order: t.sort_order ?? idx,
        parts: (t.parts || []).map(p => ({
          part_number: p.part_number || null,
          description: p.description || null,
          quantity: p.quantity ?? 1,
          is_optional: p.is_optional ? 1 : 0
        }))
      }));
    }

    if (pmTasks.length === 0) {
      return res.status(400).json({
        error: 'No PM tasks provided. Supply pm_schedule_id or pm_tasks array.'
      });
    }

    // Price map
    const priceMap = {};
    if (price_list_id) {
      const items = db.prepare('SELECT * FROM price_list_items WHERE price_list_id = ?').all(price_list_id);
      for (const item of items) {
        priceMap[item.part_number] = item;
      }
    }

    // Component lifecycles
    const modelIds = [...new Set(fleetUnits.map(u => u.equipment_model_id))];
    const componentLifecycles = modelIds.length > 0
      ? db.prepare(`
          SELECT * FROM component_lifecycles
          WHERE equipment_model_id IN (${modelIds.map(() => '?').join(',')})
        `).all(...modelIds)
      : [];

    const data = { scenario, fleetUnits, pmTasks, priceMap, componentLifecycles };
    const results = runAnalysis(data);

    res.json(results);
  } catch (err) {
    console.error('Error in quick calculation:', err);
    res.status(500).json({ error: 'Failed to run quick calculation', details: err.message });
  }
});

module.exports = router;
