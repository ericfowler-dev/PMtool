/**
 * Component lifecycle analysis engine.
 * Calculates failure probability curves, replacement schedules, and reliability metrics.
 */

/**
 * Weibull probability density function.
 * Models component failure probability over time.
 * @param {number} t - Time (hours)
 * @param {number} beta - Shape parameter (β). β<1: infant mortality, β=1: random, β>1: wear-out
 * @param {number} eta - Scale parameter (η, characteristic life in hours)
 */
function weibullPDF(t, beta, eta) {
  if (t <= 0) return 0;
  return (beta / eta) * Math.pow(t / eta, beta - 1) * Math.exp(-Math.pow(t / eta, beta));
}

/**
 * Weibull cumulative distribution function (probability of failure by time t).
 */
function weibullCDF(t, beta, eta) {
  if (t <= 0) return 0;
  return 1 - Math.exp(-Math.pow(t / eta, beta));
}

/**
 * Weibull reliability function (probability of survival at time t).
 */
function weibullReliability(t, beta, eta) {
  return 1 - weibullCDF(t, beta, eta);
}

/**
 * Generate a failure probability curve for a component.
 */
function generateFailureCurve(expectedLifeHours, weibullShape = 2.5, points = 50) {
  // Estimate Weibull scale from expected life and shape
  // For Weibull, mean = eta * Gamma(1 + 1/beta)
  // Approximate: eta ≈ expectedLife / Gamma(1 + 1/beta)
  const beta = weibullShape;
  const gammaApprox = gammaFunction(1 + 1 / beta);
  const eta = expectedLifeHours / gammaApprox;

  const maxTime = expectedLifeHours * 2;
  const step = maxTime / points;
  const curve = [];

  for (let i = 0; i <= points; i++) {
    const t = i * step;
    curve.push({
      hours: Math.round(t),
      failure_probability: Math.round(weibullCDF(t, beta, eta) * 10000) / 10000,
      reliability: Math.round(weibullReliability(t, beta, eta) * 10000) / 10000,
      failure_rate: Math.round(weibullPDF(t, beta, eta) * 1000000) / 1000000,
    });
  }

  return {
    curve,
    parameters: {
      beta,
      eta: Math.round(eta),
      mean_life: expectedLifeHours,
      b10_life: Math.round(eta * Math.pow(0.1054, 1 / beta)),  // 10% failure point
      b50_life: Math.round(eta * Math.pow(0.6931, 1 / beta)),  // 50% failure (median)
    }
  };
}

/**
 * Calculate optimal replacement interval based on cost minimization.
 * Balances planned replacement cost vs unplanned failure cost.
 */
function optimalReplacementInterval(expectedLifeHours, weibullShape, plannedCost, unplannedCostMultiplier = 3) {
  const beta = weibullShape;
  const gammaApprox = gammaFunction(1 + 1 / beta);
  const eta = expectedLifeHours / gammaApprox;
  const unplannedCost = plannedCost * unplannedCostMultiplier;

  let bestInterval = expectedLifeHours;
  let bestCostRate = Infinity;

  // Search for cost-optimal replacement interval
  const step = expectedLifeHours / 100;
  for (let t = step; t <= expectedLifeHours * 1.5; t += step) {
    const pf = weibullCDF(t, beta, eta);  // probability of failure by time t
    const ps = 1 - pf;                     // probability of survival

    // Expected cost per cycle = planned_cost * ps + unplanned_cost * pf
    // Expected cycle length = t * ps + MTTF_truncated * pf (approximated)
    const expectedCost = plannedCost * ps + unplannedCost * pf;
    const expectedLength = t * ps + (t / 2) * pf;  // simplified

    const costRate = expectedCost / expectedLength;
    if (costRate < bestCostRate) {
      bestCostRate = costRate;
      bestInterval = t;
    }
  }

  return {
    optimal_interval_hours: Math.round(bestInterval),
    cost_per_hour: Math.round(bestCostRate * 10000) / 10000,
    vs_oem_interval: Math.round((bestInterval / expectedLifeHours) * 100),
  };
}

/**
 * Generate fleet-wide component replacement schedule over a period.
 */
function generateReplacementSchedule(components, totalUnits, avgAnnualHours, periodYears) {
  const schedule = [];

  for (let year = 1; year <= periodYears; year++) {
    const hoursAtYear = year * avgAnnualHours;
    const yearReplacements = [];

    for (const comp of components) {
      const lifeHours = comp.expected_life_hours;
      const replacementNumber = Math.floor(hoursAtYear / lifeHours);
      const previousReplacements = Math.floor((hoursAtYear - avgAnnualHours) / lifeHours);

      if (replacementNumber > previousReplacements) {
        yearReplacements.push({
          component: comp.component_name,
          category: comp.category,
          replacement_number: replacementNumber,
          units_affected: totalUnits,
          cost_per_unit: (comp.replacement_cost || 0) + (comp.replacement_labor_hours || 8) * 120,
          total_cost: ((comp.replacement_cost || 0) + (comp.replacement_labor_hours || 8) * 120) * totalUnits,
        });
      }
    }

    schedule.push({
      year,
      hours: Math.round(hoursAtYear),
      replacements: yearReplacements,
      total_cost: yearReplacements.reduce((sum, r) => sum + r.total_cost, 0),
    });
  }

  return schedule;
}

// Lanczos approximation for Gamma function
function gammaFunction(z) {
  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gammaFunction(1 - z));
  }
  z -= 1;
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

module.exports = {
  generateFailureCurve,
  optimalReplacementInterval,
  generateReplacementSchedule,
  weibullCDF,
  weibullReliability,
  weibullPDF,
};
