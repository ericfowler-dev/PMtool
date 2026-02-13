import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts';
import {
  GitCompare, CheckSquare, Square, Play, AlertTriangle, Trophy, TrendingDown,
  DollarSign, Clock, Users,
} from 'lucide-react';
import { api } from '../api';
import { useApiQuery, useApiMutation } from '../hooks/useApi';

const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
const num = (v) => new Intl.NumberFormat('en-US').format(v);

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const METRIC_LABELS = {
  annual_maintenance_cost: { label: 'Annual Maintenance Cost', format: 'currency', icon: DollarSign },
  cost_per_operating_hour: { label: 'Cost / Operating Hour', format: 'rate', icon: Clock },
  cost_per_kwh: { label: 'Cost / kWh', format: 'rate4', icon: TrendingDown },
  technicians_required: { label: 'Technicians Required', format: 'decimal', icon: Users },
  npv_20_year: { label: '20-Year NPV', format: 'currency', icon: DollarSign },
  total_labor_hours: { label: 'Total Labor Hours/Year', format: 'number', icon: Clock },
  total_parts_cost: { label: 'Total Parts Cost/Year', format: 'currency', icon: DollarSign },
  total_labor_cost: { label: 'Total Labor Cost/Year', format: 'currency', icon: DollarSign },
  annual_fuel_cost: { label: 'Annual Fuel Cost', format: 'currency', icon: DollarSign },
  utilization: { label: 'Utilization (%)', format: 'percent', icon: TrendingDown },
};

function formatMetric(value, format) {
  if (value == null) return '-';
  switch (format) {
    case 'currency': return fmt(value);
    case 'rate': return `$${Number(value).toFixed(2)}`;
    case 'rate4': return `$${Number(value).toFixed(4)}`;
    case 'decimal': return Number(value).toFixed(1);
    case 'number': return num(Math.round(value));
    case 'percent': return `${Number(value).toFixed(1)}%`;
    default: return String(value);
  }
}

// Determine if lower is better (true for costs, false for utilization)
function isLowerBetter(metricKey) {
  return metricKey !== 'utilization';
}

export default function ScenarioComparison() {
  const [selectedIds, setSelectedIds] = useState([]);
  const [results, setResults] = useState(null);

  const { data: scenarios, isLoading } = useApiQuery('scenarios', () => api.scenarios.list());

  const compareMutation = useApiMutation(
    (ids) => api.analysis.compare(ids),
    {
      onSuccess: (data) => setResults(data),
    }
  );

  const scenarioList = Array.isArray(scenarios) ? scenarios : [];

  const toggleScenario = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleCompare = () => {
    if (selectedIds.length >= 2) {
      compareMutation.mutate(selectedIds);
    }
  };

  // Build comparison data
  const comparisonScenarios = results?.scenarios || [];
  const metricKeys = Object.keys(METRIC_LABELS);

  // Determine best value for each metric
  const bestValues = {};
  metricKeys.forEach((key) => {
    const values = comparisonScenarios
      .map((sc) => ({ id: sc.id || sc.scenario_id, value: sc.results?.[key] ?? sc[key] }))
      .filter((v) => v.value != null);
    if (values.length > 0) {
      const sorted = [...values].sort((a, b) => a.value - b.value);
      bestValues[key] = isLowerBetter(key) ? sorted[0].id : sorted[sorted.length - 1].id;
    }
  });

  // Build chart data for key metrics
  const chartMetrics = ['annual_maintenance_cost', 'cost_per_operating_hour', 'technicians_required', 'npv_20_year'];
  const chartData = chartMetrics.map((metricKey) => {
    const entry = { metric: METRIC_LABELS[metricKey]?.label || metricKey };
    comparisonScenarios.forEach((sc, i) => {
      entry[sc.name || `Scenario ${i + 1}`] = sc.results?.[metricKey] ?? sc[metricKey] ?? 0;
    });
    return entry;
  });

  // Build grouped bar chart data (per scenario, multiple metrics)
  const barComparisonData = comparisonScenarios.map((sc, i) => ({
    name: sc.name || `Scenario ${i + 1}`,
    'Annual Cost': sc.results?.annual_maintenance_cost ?? sc.annual_maintenance_cost ?? 0,
    'Cost/Hr': sc.results?.cost_per_operating_hour ?? sc.cost_per_operating_hour ?? 0,
    'Technicians': sc.results?.technicians_required ?? sc.technicians_required ?? 0,
    '20yr NPV': sc.results?.npv_20_year ?? sc.npv_20_year ?? 0,
  }));

  // Normalized bar chart for visual comparison (normalize each metric 0-100)
  const normalizedData = comparisonScenarios.map((sc, i) => {
    const entry = { name: sc.name || `Scenario ${i + 1}` };
    chartMetrics.forEach((key) => {
      const values = comparisonScenarios.map((s) => s.results?.[key] ?? s[key] ?? 0);
      const max = Math.max(...values, 1);
      entry[METRIC_LABELS[key]?.label || key] = Math.round(((sc.results?.[key] ?? sc[key] ?? 0) / max) * 100);
    });
    return entry;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <GitCompare size={28} className="text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scenario Comparison</h1>
          <p className="text-sm text-gray-500">Compare TCO scenarios side by side</p>
        </div>
      </div>

      {/* Scenario Selection */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Select Scenarios to Compare</h2>
          <button
            onClick={handleCompare}
            disabled={selectedIds.length < 2 || compareMutation.isPending}
            className="btn btn-primary"
          >
            {compareMutation.isPending ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Comparing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Play size={16} />
                Compare Selected ({selectedIds.length})
              </span>
            )}
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : scenarioList.length === 0 ? (
          <div className="text-center py-12">
            <GitCompare size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500">No scenarios available.</p>
            <p className="text-xs text-gray-400 mt-1">Create scenarios in the TCO Analysis page first, then come back to compare them.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {scenarioList.map((sc) => {
              const isSelected = selectedIds.includes(sc.id);
              return (
                <div
                  key={sc.id}
                  onClick={() => toggleScenario(sc.id)}
                  className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  {isSelected ? (
                    <CheckSquare size={20} className="text-brand-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Square size={20} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 text-sm truncate">{sc.name}</h3>
                    {sc.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{sc.description}</p>
                    )}
                    {sc.created_at && (
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(sc.created_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selectedIds.length > 0 && selectedIds.length < 2 && (
          <p className="text-sm text-amber-600 mt-3">Select at least 2 scenarios to compare.</p>
        )}
      </div>

      {compareMutation.isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Comparison Failed</p>
            <p className="text-sm text-red-600 mt-0.5">{compareMutation.error?.message || 'An error occurred.'}</p>
          </div>
        </div>
      )}

      {/* Comparison Results */}
      {results && comparisonScenarios.length > 0 && (
        <div className="space-y-6">
          {/* Comparison Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Metric Comparison</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="table-auto w-full">
                <thead>
                  <tr>
                    <th className="text-left px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider w-56">
                      Metric
                    </th>
                    {comparisonScenarios.map((sc, i) => (
                      <th key={sc.id || i} className="text-right px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                          {sc.name || `Scenario ${i + 1}`}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {metricKeys.map((key) => {
                    const meta = METRIC_LABELS[key];
                    const IconComp = meta.icon;
                    return (
                      <tr key={key} className="hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <IconComp size={14} className="text-gray-400" />
                            <span className="text-sm font-medium text-gray-700">{meta.label}</span>
                          </div>
                        </td>
                        {comparisonScenarios.map((sc, i) => {
                          const value = sc.results?.[key] ?? sc[key];
                          const isBest = bestValues[key] === (sc.id || sc.scenario_id);
                          return (
                            <td key={sc.id || i} className="px-5 py-3 text-right">
                              <div className={`inline-flex items-center gap-1.5 ${isBest ? 'text-emerald-700 font-bold' : 'text-gray-900'}`}>
                                {isBest && <Trophy size={14} className="text-emerald-500" />}
                                <span className="font-mono text-sm">
                                  {formatMetric(value, meta.format)}
                                </span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bar Chart - Key Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Annual Cost Comparison */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Annual Maintenance Cost</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={comparisonScenarios.map((sc, i) => ({
                  name: sc.name || `Scenario ${i + 1}`,
                  value: sc.results?.annual_maintenance_cost ?? sc.annual_maintenance_cost ?? 0,
                  color: CHART_COLORS[i % CHART_COLORS.length],
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => fmt(v)} />
                  <Bar dataKey="value" name="Annual Cost" radius={[4, 4, 0, 0]}>
                    {comparisonScenarios.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Normalized Comparison (Grouped Bar) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Normalized Metric Comparison</h3>
              <p className="text-xs text-gray-400 mb-4">Each metric normalized to the highest value (100%)</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={normalizedData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {chartMetrics.map((key, i) => (
                    <Bar
                      key={key}
                      dataKey={METRIC_LABELS[key]?.label || key}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                      radius={[0, 2, 2, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Cost per Hour Comparison */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Cost per Operating Hour & Technicians Required</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={comparisonScenarios.map((sc, i) => ({
                name: sc.name || `Scenario ${i + 1}`,
                'Cost/Hour': sc.results?.cost_per_operating_hour ?? sc.cost_per_operating_hour ?? 0,
                'Technicians': sc.results?.technicians_required ?? sc.technicians_required ?? 0,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(1)}`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="Cost/Hour" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="Technicians" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Winner Summary */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={20} className="text-emerald-600" />
              <h3 className="text-sm font-semibold text-emerald-800">Best Value Summary</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {metricKeys.map((key) => {
                const bestId = bestValues[key];
                const bestSc = comparisonScenarios.find((sc) => (sc.id || sc.scenario_id) === bestId);
                const meta = METRIC_LABELS[key];
                if (!bestSc) return null;
                return (
                  <div key={key} className="bg-white/60 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{meta.label}</p>
                    <p className="text-sm font-semibold text-emerald-800 mt-0.5">
                      {bestSc.name || 'Scenario'}: {formatMetric(bestSc.results?.[key] ?? bestSc[key], meta.format)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!results && !compareMutation.isPending && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <GitCompare size={48} className="mx-auto mb-3 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-500">
            {scenarioList.length < 2
              ? 'Need More Scenarios'
              : 'Ready to Compare'}
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            {scenarioList.length < 2
              ? 'Create at least 2 scenarios in TCO Analysis to enable comparison.'
              : 'Select two or more scenarios above and click Compare to see side-by-side results.'}
          </p>
        </div>
      )}
    </div>
  );
}
