const { query, queryOne } = require('../database');

/**
 * Core TCO & maintenance cost calculation engine.
 * Accepts a fully-resolved scenario config and returns comprehensive results.
 */
function calculateFullAnalysis(config) {
  const {
    fleet_units,         // array of { quantity, annual_hours, duty_cycle, application_type, equipment_model_id, commissioning_rate_per_month, fuel_consumption_rate, power_rating_kw }
    pm_tasks,            // array of { name, interval_hours, interval_months, labor_hours, skill_level, is_one_time, is_automated, is_locked, parts: [{ part_number, quantity, unit_price }] }
    labor_rate = 120,
    labor_rate_specialist = 180,
    labor_rate_engineer = 250,
    parts_discount_pct = 20,
    overhead_markup_pct = 15,
    working_days_per_year = 250,
    hours_per_day = 8,
    target_utilization_pct = 75,
    analysis_period_years = 20,
    discount_rate_pct = 5,
    inflation_rate_pct = 3,
    fuel_cost_per_unit = 1.0,
    downtime_cost_per_hour = 500,
    include_fuel_costs = true,
    include_downtime_costs = true,
    component_lifecycles = [],  // array of { component_name, category, expected_life_hours, replacement_labor_hours, weibull_shape, weibull_scale, replacement_cost }
    // Enhanced cost categories
    energy_efficiency_cost_per_kw = 0.02,  // $/kW/year for energy efficiency programs
    environmental_compliance_cost_per_unit = 50,  // $/unit/year for emissions monitoring
    training_cost_per_technician = 2000,  // $/technician/year for ongoing training
    insurance_cost_pct = 1.5,  // % of equipment value for insurance
    warranty_cost_pct = 0.5,  // % of equipment value for extended warranty
    equipment_value_per_kw = 1000,  // $/kW for equipment valuation
  } = config;

  const partsDiscount = parts_discount_pct / 100;
  const overheadMarkup = overhead_markup_pct / 100;
  const discountRate = discount_rate_pct / 100;
  const inflationRate = inflation_rate_pct / 100;
  const utilization = target_utilization_pct / 100;
  const availableHoursPerTech = working_days_per_year * hours_per_day * utilization;

  // Aggregate fleet totals
  let totalUnits = 0;
  let weightedAnnualHours = 0;
  let totalPowerKw = 0;
  let maxCommissioningMonths = 0;
  let totalFuelConsumptionPerHour = 0;

  for (const unit of fleet_units) {
    const qty = unit.quantity || 1;
    const hours = unit.annual_hours || 6500;
    const rate = unit.commissioning_rate_per_month || qty;
    totalUnits += qty;
    weightedAnnualHours += qty * hours;
    totalPowerKw += qty * (unit.power_rating_kw || 0);
    if (rate > 0) {
      maxCommissioningMonths = Math.max(maxCommissioningMonths, Math.ceil(qty / rate));
    }
    // fuel_consumption_rate is in native units (CFH for gas, gal/hr for liquid)
    // fuel_cost_per_unit is per therm (gas) or per gallon (liquid)
    // For CFH: 1 therm ≈ 100 cubic feet, so divide by 100
    const fuelRate = unit.fuel_consumption_rate || 0;
    const fuelUnit = unit.fuel_consumption_unit || 'CFH';
    const normalizedFuelRate = fuelUnit === 'CFH' ? fuelRate / 100 : fuelRate;
    totalFuelConsumptionPerHour += qty * normalizedFuelRate * (unit.duty_cycle || 0.75);
  }

  const avgAnnualHours = totalUnits > 0 ? weightedAnnualHours / totalUnits : 6500;
  const totalAnnualOperatingHours = weightedAnnualHours;

  // ─── PM Task Cost Breakdown ───
  const taskBreakdown = [];
  let totalAnnualServices = 0;
  let totalAnnualLaborHours = 0;
  let totalAnnualLaborCost = 0;
  let totalAnnualPartsCost = 0;

  for (const task of pm_tasks) {
    if (task.is_automated) {
      taskBreakdown.push({
        name: task.name,
        status: 'automated',
        interval_hours: task.interval_hours,
        services_per_year: 0,
        labor_hours_per_year: 0,
        labor_cost_per_year: 0,
        parts_cost_per_year: 0,
        total_cost_per_year: 0,
        pct_of_workload: 0,
      });
      continue;
    }

    if (task.enabled === false) {
      taskBreakdown.push({
        name: task.name,
        status: 'disabled',
        interval_hours: task.interval_hours,
        services_per_year: 0,
        labor_hours_per_year: 0,
        labor_cost_per_year: 0,
        parts_cost_per_year: 0,
        total_cost_per_year: 0,
        pct_of_workload: 0,
      });
      continue;
    }

    const rate = task.skill_level === 'engineer' ? labor_rate_engineer
      : task.skill_level === 'specialist' ? labor_rate_specialist
      : labor_rate;

    let servicesPerYear, laborHoursPerYear, partsPerService;

    // Calculate parts cost per service
    partsPerService = 0;
    if (task.parts && task.parts.length > 0) {
      for (const part of task.parts) {
        partsPerService += (part.unit_price || 0) * (part.quantity || 1) * (1 - partsDiscount);
      }
    }

    if (task.is_one_time) {
      // One-time services spread across commissioning period (assume ~3 months average)
      servicesPerYear = totalUnits;
      laborHoursPerYear = (totalUnits * task.labor_hours) / 3;
      const partsCostPerYear = (totalUnits * partsPerService) / 3;
      const laborCostPerYear = laborHoursPerYear * rate;

      totalAnnualServices += servicesPerYear;
      totalAnnualLaborHours += laborHoursPerYear;
      totalAnnualLaborCost += laborCostPerYear;
      totalAnnualPartsCost += partsCostPerYear;

      taskBreakdown.push({
        name: task.name,
        status: 'active',
        type: 'one-time',
        interval_hours: task.interval_hours,
        services_per_year: servicesPerYear,
        labor_hours_per_year: Math.round(laborHoursPerYear * 10) / 10,
        labor_cost_per_year: Math.round(laborCostPerYear),
        parts_cost_per_year: Math.round(partsCostPerYear),
        total_cost_per_year: Math.round(laborCostPerYear + partsCostPerYear),
        pct_of_workload: 0, // calculated after
      });
    } else {
      // Recurring service
      const interval = task.interval_hours || 500;
      servicesPerYear = Math.round(totalAnnualOperatingHours / interval);
      laborHoursPerYear = servicesPerYear * task.labor_hours;
      const laborCostPerYear = laborHoursPerYear * rate;
      const partsCostPerYear = servicesPerYear * partsPerService;

      totalAnnualServices += servicesPerYear;
      totalAnnualLaborHours += laborHoursPerYear;
      totalAnnualLaborCost += laborCostPerYear;
      totalAnnualPartsCost += partsCostPerYear;

      taskBreakdown.push({
        name: task.name,
        status: 'active',
        type: 'recurring',
        interval_hours: interval,
        services_per_year: servicesPerYear,
        labor_hours_per_year: Math.round(laborHoursPerYear * 10) / 10,
        labor_cost_per_year: Math.round(laborCostPerYear),
        parts_cost_per_year: Math.round(partsCostPerYear),
        total_cost_per_year: Math.round(laborCostPerYear + partsCostPerYear),
        pct_of_workload: 0,
      });
    }
  }

  // Calculate workload percentages (two-pass to avoid running total bug)
  for (const task of taskBreakdown) {
    task.pct_of_workload = totalAnnualLaborHours > 0
      ? Math.round(task.labor_hours_per_year / totalAnnualLaborHours * 1000) / 10
      : 0;
  }

  // ─── Overhead ───
  const maintenanceCostBeforeOverhead = totalAnnualLaborCost + totalAnnualPartsCost;
  const annualOverhead = maintenanceCostBeforeOverhead * overheadMarkup;
  const totalAnnualMaintenanceCost = maintenanceCostBeforeOverhead + annualOverhead;

  // ─── Staffing ───
  const techsRequired = availableHoursPerTech > 0
    ? Math.ceil(totalAnnualLaborHours / availableHoursPerTech * 1.15)
    : 0;

  // ─── Staffing Ramp Timeline ───
  const staffingTimeline = [];
  const rampMonths = Math.min(36, Math.max(12, maxCommissioningMonths + 6));
  for (let m = 1; m <= rampMonths; m++) {
    let unitsActive = 0;
    for (const unit of fleet_units) {
      const rate = unit.commissioning_rate_per_month || unit.quantity || 1;
      unitsActive += Math.min(unit.quantity || 1, rate * m);
    }
    const proportionalTechs = totalUnits > 0
      ? Math.ceil((unitsActive / totalUnits) * techsRequired)
      : 0;
    staffingTimeline.push({ month: m, label: `Month ${m}`, units_active: unitsActive, technicians: proportionalTechs });
  }

  // ─── Fuel Costs ───
  const annualFuelCost = include_fuel_costs
    ? totalFuelConsumptionPerHour * avgAnnualHours * fuel_cost_per_unit
    : 0;

  // ─── Downtime Estimate ───
  // Estimate ~2% unplanned downtime based on maintenance quality
  const estimatedDowntimeHours = totalAnnualOperatingHours * 0.02;
  const annualDowntimeCost = include_downtime_costs
    ? estimatedDowntimeHours * downtime_cost_per_hour
    : 0;

  // ─── Enhanced Cost Categories ───
  // Energy efficiency costs (programs, monitoring, optimization)
  const annualEnergyEfficiencyCost = totalPowerKw * energy_efficiency_cost_per_kw;

  // Environmental compliance costs (emissions monitoring, regulatory compliance)
  const annualEnvironmentalComplianceCost = totalUnits * environmental_compliance_cost_per_unit;

  // Training and certification costs (ongoing skill development)
  const annualTrainingCost = techsRequired * training_cost_per_technician;

  // Insurance costs (% of equipment value)
  const totalEquipmentValue = totalPowerKw * equipment_value_per_kw;
  const annualInsuranceCost = totalEquipmentValue * (insurance_cost_pct / 100);

  // Warranty costs (extended warranty premiums)
  const annualWarrantyCost = totalEquipmentValue * (warranty_cost_pct / 100);

  // ─── Component Replacement Costs ───
  const componentReplacements = [];
  let totalReplacementCostOverPeriod = 0;

  for (const comp of component_lifecycles) {
    const lifeHours = comp.expected_life_hours || 50000;
    const yearsToReplacement = lifeHours / avgAnnualHours;
    const replacementsInPeriod = Math.floor(analysis_period_years / yearsToReplacement);
    const laborCost = (comp.replacement_labor_hours || 8) * labor_rate;
    const totalPerReplacement = (comp.replacement_cost || 0) + laborCost;

    const schedule = [];
    for (let r = 1; r <= replacementsInPeriod; r++) {
      const year = Math.ceil(yearsToReplacement * r);
      if (year <= analysis_period_years) {
        schedule.push({ year, cost: totalPerReplacement });
        totalReplacementCostOverPeriod += totalPerReplacement * totalUnits;
      }
    }

    componentReplacements.push({
      component_name: comp.component_name,
      category: comp.category,
      expected_life_hours: lifeHours,
      years_to_replacement: Math.round(yearsToReplacement * 10) / 10,
      replacements_in_period: replacementsInPeriod,
      cost_per_replacement: Math.round(totalPerReplacement),
      total_cost: Math.round(totalPerReplacement * replacementsInPeriod * totalUnits),
      schedule,
    });
  }

  // ─── Year-by-Year Projection ───
  const yearlyProjection = [];
  let cumulativeCost = 0;
  let npv = 0;

  for (let year = 1; year <= analysis_period_years; year++) {
    const inflationFactor = Math.pow(1 + inflationRate, year - 1);
    const discountFactor = Math.pow(1 + discountRate, year);

    const maintenance = totalAnnualMaintenanceCost * inflationFactor;
    const fuel = annualFuelCost * inflationFactor;
    const downtime = annualDowntimeCost * inflationFactor;

    // Component replacements this year
    let replacements = 0;
    for (const comp of componentReplacements) {
      for (const s of comp.schedule) {
        if (s.year === year) {
          replacements += s.cost * totalUnits * inflationFactor;
        }
      }
    }

    const yearTotal = maintenance + fuel + downtime + replacements;
    cumulativeCost += yearTotal;
    npv += yearTotal / discountFactor;

    yearlyProjection.push({
      year,
      maintenance: Math.round(maintenance),
      fuel: Math.round(fuel),
      downtime: Math.round(downtime),
      replacements: Math.round(replacements),
      total: Math.round(yearTotal),
      cumulative: Math.round(cumulativeCost),
      npv_cumulative: Math.round(npv),
    });
  }

  // ─── Cost per kWh ───
  const annualEnergyKwh = totalPowerKw * avgAnnualHours * 0.75; // assume avg 75% load
  const costPerKwh = annualEnergyKwh > 0
    ? totalAnnualMaintenanceCost / annualEnergyKwh
    : 0;

  // ─── Cost per operating hour ───
  const costPerOperatingHour = totalAnnualOperatingHours > 0
    ? totalAnnualMaintenanceCost / totalAnnualOperatingHours
    : 0;

  // ─── Cost Breakdown ───
  const costBreakdown = [
    { name: 'Labor', value: Math.round(totalAnnualLaborCost) },
    { name: 'Parts', value: Math.round(totalAnnualPartsCost) },
    { name: 'Overhead', value: Math.round(annualOverhead) },
  ];
  if (include_fuel_costs && annualFuelCost > 0) {
    costBreakdown.push({ name: 'Fuel', value: Math.round(annualFuelCost) });
  }
  if (include_downtime_costs && annualDowntimeCost > 0) {
    costBreakdown.push({ name: 'Est. Downtime', value: Math.round(annualDowntimeCost) });
  }
  if (annualEnergyEfficiencyCost > 0) {
    costBreakdown.push({ name: 'Energy Efficiency', value: Math.round(annualEnergyEfficiencyCost) });
  }
  if (annualEnvironmentalComplianceCost > 0) {
    costBreakdown.push({ name: 'Environmental Compliance', value: Math.round(annualEnvironmentalComplianceCost) });
  }
  if (annualTrainingCost > 0) {
    costBreakdown.push({ name: 'Training & Certification', value: Math.round(annualTrainingCost) });
  }
  if (annualInsuranceCost > 0) {
    costBreakdown.push({ name: 'Insurance', value: Math.round(annualInsuranceCost) });
  }
  if (annualWarrantyCost > 0) {
    costBreakdown.push({ name: 'Warranty', value: Math.round(annualWarrantyCost) });
  }

  return {
    summary: {
      total_units: totalUnits,
      avg_annual_hours: Math.round(avgAnnualHours),
      total_annual_operating_hours: Math.round(totalAnnualOperatingHours),
      total_power_kw: Math.round(totalPowerKw),
      annual_maintenance_cost: Math.round(totalAnnualMaintenanceCost),
      annual_labor_cost: Math.round(totalAnnualLaborCost),
      annual_parts_cost: Math.round(totalAnnualPartsCost),
      annual_overhead: Math.round(annualOverhead),
      annual_fuel_cost: Math.round(annualFuelCost),
      annual_downtime_cost: Math.round(annualDowntimeCost),
      annual_energy_efficiency_cost: Math.round(annualEnergyEfficiencyCost),
      annual_environmental_compliance_cost: Math.round(annualEnvironmentalComplianceCost),
      annual_training_cost: Math.round(annualTrainingCost),
      annual_insurance_cost: Math.round(annualInsuranceCost),
      annual_warranty_cost: Math.round(annualWarrantyCost),
      annual_total_cost: Math.round(
        totalAnnualMaintenanceCost + annualFuelCost + annualDowntimeCost +
        annualEnergyEfficiencyCost + annualEnvironmentalComplianceCost +
        annualTrainingCost + annualInsuranceCost + annualWarrantyCost
      ),
      cost_per_kwh: Math.round(costPerKwh * 10000) / 10000,
      cost_per_operating_hour: Math.round(costPerOperatingHour * 100) / 100,
      technicians_required: techsRequired,
      annual_services: totalAnnualServices,
      total_labor_hours: Math.round(totalAnnualLaborHours),
      npv_total_cost: Math.round(npv),
      analysis_period_years,
    },
    task_breakdown: taskBreakdown,
    cost_breakdown: costBreakdown,
    yearly_projection: yearlyProjection,
    staffing_timeline: staffingTimeline,
    component_replacements: componentReplacements,
  };
}

/**
 * Resolve a scenario from the database into a full config for calculation.
 */
async function resolveScenario(scenarioId) {
  const scenario = await queryOne('SELECT * FROM scenarios WHERE id = $1', [scenarioId]);
  if (!scenario) throw new Error('Scenario not found');

  // Get fleet units with equipment info
  let fleet_units = [];
  if (scenario.fleet_id) {
    fleet_units = await query(`
      SELECT fu.*, em.power_rating_kw, em.fuel_consumption_rate_75 as fuel_consumption_rate,
             em.fuel_consumption_unit, em.model_number
      FROM fleet_units fu
      JOIN equipment_models em ON fu.equipment_model_id = em.id
      WHERE fu.fleet_id = $1
    `, [scenario.fleet_id]);
  }

  // Get PM tasks with parts (resolved from price list)
  let pm_tasks = [];
  if (scenario.pm_schedule_id) {
    const tasks = await query(
      'SELECT * FROM pm_tasks WHERE pm_schedule_id = $1 ORDER BY sort_order, id',
      [scenario.pm_schedule_id]);

    for (const task of tasks) {
      const taskParts = await query(`
        SELECT tp.*, pli.unit_price, pli.description as part_description
        FROM pm_task_parts tp
        LEFT JOIN price_list_items pli ON tp.part_number = pli.part_number
          AND pli.price_list_id = $1
        WHERE tp.pm_task_id = $2
      `, [scenario.price_list_id || 0, task.id]);

      pm_tasks.push({
        ...task,
        enabled: true,
        parts: taskParts,
      });
    }
  }

  // Get component lifecycles
  let component_lifecycles = [];
  if (scenario.fleet_id) {
    const modelIds = [...new Set(fleet_units.map(u => u.equipment_model_id))];
    if (modelIds.length > 0) {
      component_lifecycles = await query(
        'SELECT * FROM component_lifecycles WHERE equipment_model_id = ANY($1::int[])',
        [modelIds]);
    }
  }

  return {
    fleet_units,
    pm_tasks,
    component_lifecycles,
    labor_rate: scenario.labor_rate,
    labor_rate_specialist: scenario.labor_rate_specialist,
    labor_rate_engineer: scenario.labor_rate_engineer,
    parts_discount_pct: scenario.parts_discount_pct,
    overhead_markup_pct: scenario.overhead_markup_pct,
    working_days_per_year: scenario.working_days_per_year,
    hours_per_day: scenario.hours_per_day,
    target_utilization_pct: scenario.target_utilization_pct,
    analysis_period_years: scenario.analysis_period_years,
    discount_rate_pct: scenario.discount_rate_pct,
    inflation_rate_pct: scenario.inflation_rate_pct,
    fuel_cost_per_unit: scenario.fuel_cost_per_unit,
    downtime_cost_per_hour: scenario.downtime_cost_per_hour,
    include_fuel_costs: !!scenario.include_fuel_costs,
    include_downtime_costs: !!scenario.include_downtime_costs,
  };
}

module.exports = { calculateFullAnalysis, resolveScenario };
