import { useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart,
} from 'recharts';
import {
  TrendingUp, Play, Save, Plus, Settings, DollarSign, Clock, Users,
  Zap, AlertTriangle, ChevronDown, ChevronUp, Calculator,
} from 'lucide-react';
import MetricCard from '../components/MetricCard';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { api } from '../api';
import { useApiQuery, useApiMutation } from '../hooks/useApi';

const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
const num = (v) => new Intl.NumberFormat('en-US').format(v);

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const emptyScenarioForm = {
  name: '',
  fleet_id: '',
  schedule_id: '',
  price_list_id: '',
  labor_rate_basic: 65,
  labor_rate_intermediate: 85,
  labor_rate_advanced: 110,
  labor_rate_specialist: 150,
  parts_discount: 0,
  overhead_markup: 15,
  analysis_period_years: 20,
  discount_rate: 5,
  inflation_rate: 2.5,
  fuel_cost_per_liter: 1.2,
  downtime_cost_per_hour: 500,
  working_days_per_year: 260,
  hours_per_day: 10,
  utilization_target: 85,
};

export default function TCOAnalysis() {
  const [selectedScenarioId, setSelectedScenarioId] = useState(null);
  const [scenarioModalOpen, setScenarioModalOpen] = useState(false);
  const [scenarioForm, setScenarioForm] = useState(emptyScenarioForm);
  const [results, setResults] = useState(null);
  const [configExpanded, setConfigExpanded] = useState(true);
  const [assignPmModalOpen, setAssignPmModalOpen] = useState(false);
  const [selectedPmScheduleId, setSelectedPmScheduleId] = useState('');

  const { data: scenarios } = useApiQuery('scenarios', () => api.scenarios.list());
  const { data: fleets } = useApiQuery('fleets', () => api.fleet.list());
  const { data: schedules } = useApiQuery('schedules', () => api.maintenance.listSchedules());
  const { data: priceLists } = useApiQuery('priceLists', () => api.priceLists.list());

  const scenarioQuery = useApiQuery(
    ['scenario', selectedScenarioId],
    () => api.scenarios.get(selectedScenarioId),
    { enabled: !!selectedScenarioId }
  );

  const createScenarioMutation = useApiMutation((data) => api.scenarios.create(data), {
    invalidateKeys: ['scenarios'],
    onSuccess: (data) => {
      setScenarioModalOpen(false);
      setSelectedScenarioId(data.id);
    },
  });

  const updateScenarioMutation = useApiMutation(({ id, data }) => api.scenarios.update(id, data), {
    invalidateKeys: ['scenarios', ['scenario', selectedScenarioId]],
  });

  const calculateMutation = useApiMutation(
    (scenarioId) => api.analysis.calculate(scenarioId),
    {
      onSuccess: (data) => setResults(data),
    }
  );

  const scenarioList = Array.isArray(scenarios) ? scenarios : [];
  const fleetList = Array.isArray(fleets) ? fleets : [];
  const scheduleList = Array.isArray(schedules) ? schedules : [];
  const priceListList = Array.isArray(priceLists) ? priceLists : [];

  const selectedScenario = scenarioQuery.data;
  const selectedScenarioPmId = selectedScenario?.pm_schedule_id ?? selectedScenario?.schedule_id ?? '';

  const openCreateScenario = () => {
    setScenarioForm(emptyScenarioForm);
    setScenarioModalOpen(true);
  };

  const handleCreateScenario = (e) => {
    e.preventDefault();
    const payload = {};
    Object.entries(scenarioForm).forEach(([k, v]) => {
      payload[k] = typeof v === 'string' && !isNaN(v) && v !== '' && k !== 'name' ? Number(v) : v;
    });
    if (payload.fleet_id) payload.fleet_id = Number(payload.fleet_id);
    if (payload.schedule_id) payload.pm_schedule_id = Number(payload.schedule_id);
    if (payload.price_list_id) payload.price_list_id = Number(payload.price_list_id);
    delete payload.schedule_id;
    createScenarioMutation.mutate(payload);
  };

  const handleSelectScenario = (id) => {
    setSelectedScenarioId(id);
    setResults(null);
  };

  const handleRunAnalysis = () => {
    if (selectedScenarioId) {
      calculateMutation.mutate(selectedScenarioId);
    }
  };

  const openAssignPmModal = () => {
    setSelectedPmScheduleId(selectedScenarioPmId ? String(selectedScenarioPmId) : '');
    setAssignPmModalOpen(true);
  };

  const handleAssignPmSchedule = (e) => {
    e.preventDefault();
    if (!selectedScenarioId) return;

    updateScenarioMutation.mutate(
      {
        id: selectedScenarioId,
        data: {
          pm_schedule_id: selectedPmScheduleId ? Number(selectedPmScheduleId) : null,
        },
      },
      {
        onSuccess: () => setAssignPmModalOpen(false),
      }
    );
  };

  const updateField = (field, value) => setScenarioForm((prev) => ({ ...prev, [field]: value }));

  // Data transformations for charts
  const costBreakdown = results?.cost_breakdown
    ? Object.entries(results.cost_breakdown).map(([name, value]) => ({
        name: name.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        value,
      }))
    : [];

  const yearlyProjection = results?.yearly_projection || [];
  const taskBreakdown = results?.task_breakdown || [];
  const staffingTimeline = results?.staffing_timeline || [];
  const componentTimeline = results?.component_replacements || [];

  const taskColumns = [
    { key: 'task_name', header: 'Task', accessor: 'task_name' },
    { key: 'annual_services', header: 'Annual Services', accessor: 'annual_services', render: (row) => num(row.annual_services || 0) },
    { key: 'labor_hours', header: 'Labor Hours', accessor: 'labor_hours', render: (row) => (row.labor_hours || 0).toFixed(1) },
    { key: 'labor_cost', header: 'Labor Cost', accessor: 'labor_cost', render: (row) => fmt(row.labor_cost || 0) },
    { key: 'parts_cost', header: 'Parts Cost', accessor: 'parts_cost', render: (row) => fmt(row.parts_cost || 0) },
    {
      key: 'workload_pct',
      header: '% of Workload',
      accessor: 'workload_pct',
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.min(row.workload_pct || 0, 100)}%` }} />
          </div>
          <span className="text-xs font-mono w-10 text-right">{(row.workload_pct || 0).toFixed(1)}%</span>
        </div>
      ),
    },
  ];

  const componentColumns = [
    { key: 'component', header: 'Component', accessor: 'component' },
    { key: 'year', header: 'Replacement Year', accessor: 'year' },
    { key: 'cost', header: 'Cost', accessor: 'cost', render: (row) => fmt(row.cost || 0) },
    { key: 'reason', header: 'Reason', accessor: 'reason' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp size={28} className="text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">TCO Analysis</h1>
            <p className="text-sm text-gray-500">Total Cost of Ownership modeling and projections</p>
          </div>
        </div>
        <button onClick={openCreateScenario} className="btn btn-primary">
          <Plus size={16} className="mr-1" /> New Scenario
        </button>
      </div>

      {/* Scenario Selection */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Select Scenario</h2>
          <button onClick={() => setConfigExpanded(!configExpanded)} className="text-gray-400 hover:text-gray-600">
            {configExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {scenarioList.length === 0 ? (
            <p className="text-sm text-gray-400">No scenarios yet. Create one to get started.</p>
          ) : (
            scenarioList.map((sc) => (
              <button
                key={sc.id}
                onClick={() => handleSelectScenario(sc.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                  selectedScenarioId === sc.id
                    ? 'bg-brand-500 text-white border-brand-500 shadow-md'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-brand-300'
                }`}
              >
                {sc.name}
              </button>
            ))
          )}
        </div>

        {/* Configuration Panel */}
        {configExpanded && selectedScenario && (
          <div className="border-t border-gray-100 pt-4 space-y-4">
            <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Settings size={16} /> Scenario Configuration
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500">Fleet</span>
                <p className="font-medium text-gray-900 truncate">{fleetList.find((f) => f.id === selectedScenario.fleet_id)?.name || '-'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500">PM Schedule</span>
                <p className="font-medium text-gray-900 truncate">{scheduleList.find((s) => s.id === selectedScenarioPmId)?.name || '-'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500">Price List</span>
                <p className="font-medium text-gray-900 truncate">{priceListList.find((p) => p.id === selectedScenario.price_list_id)?.name || '-'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500">Analysis Period</span>
                <p className="font-medium text-gray-900">{selectedScenario.analysis_period_years || 20} years</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500">Discount Rate</span>
                <p className="font-medium text-gray-900">{selectedScenario.discount_rate || 5}%</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500">Inflation Rate</span>
                <p className="font-medium text-gray-900">{selectedScenario.inflation_rate || 2.5}%</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500">Parts Discount</span>
                <p className="font-medium text-gray-900">{selectedScenario.parts_discount || 0}%</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500">Overhead Markup</span>
                <p className="font-medium text-gray-900">{selectedScenario.overhead_markup || 15}%</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500">Fuel Cost/L</span>
                <p className="font-medium text-gray-900">${selectedScenario.fuel_cost_per_liter || 1.2}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500">Downtime Cost/hr</span>
                <p className="font-medium text-gray-900">${selectedScenario.downtime_cost_per_hour || 500}</p>
              </div>
            </div>

            {!selectedScenarioPmId && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p>
                    No PM Schedule is selected for this scenario. Analysis will run with <strong>zero PM task costs</strong> until you assign one.
                  </p>
                  <button type="button" onClick={openAssignPmModal} className="btn btn-ghost btn-sm">Assign PM Schedule</button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleRunAnalysis}
                disabled={calculateMutation.isPending}
                className="btn btn-primary text-base px-8 py-3"
              >
                {calculateMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Calculating...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Play size={18} />
                    Run Analysis
                  </span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {calculateMutation.isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-red-800">Analysis Failed</p>
            <p className="text-sm text-red-600 mt-0.5">{calculateMutation.error?.message || 'An error occurred while running the analysis.'}</p>
            {calculateMutation.error?.message?.toLowerCase().includes('pm schedule') && (
              <button type="button" onClick={openAssignPmModal} className="btn btn-ghost btn-sm">Assign PM Schedule</button>
            )}
          </div>
        </div>
      )}

      {/* Results Dashboard */}
      {results && (
        <div className="space-y-6">
          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricCard
              label="Annual Maint. Cost"
              value={fmt(results.annual_maintenance_cost || 0)}
              color="blue"
              icon={DollarSign}
            />
            <MetricCard
              label="Cost / kWh"
              value={`$${(results.cost_per_kwh || 0).toFixed(4)}`}
              color="green"
              icon={Zap}
            />
            <MetricCard
              label="Cost / Operating Hour"
              value={`$${(results.cost_per_operating_hour || 0).toFixed(2)}`}
              color="purple"
              icon={Clock}
            />
            <MetricCard
              label="Technicians Required"
              value={(results.technicians_required || 0).toFixed(1)}
              color="orange"
              icon={Users}
            />
            <MetricCard
              label="20-Year NPV"
              value={fmt(results.npv_20_year || 0)}
              color="red"
              icon={Calculator}
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cost Breakdown Pie */}
            {costBreakdown.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Cost Breakdown</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={costBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={110}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {costBreakdown.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Year-by-Year Projection */}
            {yearlyProjection.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Year-by-Year Cost Projection</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={yearlyProjection}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => fmt(v)} />
                    <Legend />
                    <Area type="monotone" dataKey="maintenance" stackId="1" stroke="#6366f1" fill="#6366f1" fillOpacity={0.6} name="Maintenance" />
                    <Area type="monotone" dataKey="fuel" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="Fuel" />
                    <Area type="monotone" dataKey="replacements" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} name="Replacements" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* PM Task Breakdown Table */}
          {taskBreakdown.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">PM Task Breakdown</h3>
              <DataTable
                columns={taskColumns}
                data={taskBreakdown}
                searchable={false}
                pageSize={20}
                emptyMessage="No task breakdown data available."
              />
            </div>
          )}

          {/* Staffing Timeline */}
          {staffingTimeline.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Staffing Ramp Timeline</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={staffingTimeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="stepAfter" dataKey="technicians" stroke="#6366f1" strokeWidth={2} name="Technicians Needed" dot={false} />
                  <Line type="stepAfter" dataKey="specialists" stroke="#ef4444" strokeWidth={2} name="Specialists Needed" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Component Replacement Timeline */}
          {componentTimeline.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Component Replacement Timeline</h3>
              <DataTable
                columns={componentColumns}
                data={componentTimeline}
                searchable={false}
                pageSize={15}
                emptyMessage="No component replacement data available."
              />
            </div>
          )}

          {/* No Results State */}
          {!costBreakdown.length && !yearlyProjection.length && !taskBreakdown.length && (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Calculator size={48} className="mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-500">Analysis Complete</h3>
              <p className="text-sm text-gray-400 mt-1">Results contain only summary metrics. Add more data to your scenario for detailed breakdowns.</p>
            </div>
          )}
        </div>
      )}

      {/* Empty state when no results */}
      {!results && !calculateMutation.isPending && selectedScenarioId && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Play size={48} className="mx-auto mb-3 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-500">Ready to Analyze</h3>
          <p className="text-sm text-gray-400 mt-1">Click "Run Analysis" above to generate your TCO report.</p>
        </div>
      )}

      {!selectedScenarioId && scenarioList.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <TrendingUp size={48} className="mx-auto mb-3 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-500">Select a Scenario</h3>
          <p className="text-sm text-gray-400 mt-1">Choose a scenario above to configure and run your analysis.</p>
        </div>
      )}

      <Modal open={assignPmModalOpen} onClose={() => setAssignPmModalOpen(false)} title="Assign PM Schedule" size="sm">
        <form onSubmit={handleAssignPmSchedule} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PM Schedule</label>
            <select className="input" value={selectedPmScheduleId} onChange={(e) => setSelectedPmScheduleId(e.target.value)}>
              <option value="">No PM Schedule</option>
              {scheduleList.map((schedule) => (
                <option key={schedule.id} value={schedule.id}>{schedule.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">Tip: Create schedules in PM Planner, then assign them here.</p>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className="btn btn-ghost" onClick={() => setAssignPmModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={updateScenarioMutation.isPending}>
              {updateScenarioMutation.isPending ? 'Saving...' : 'Save PM Schedule'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Create Scenario Modal */}
      <Modal open={scenarioModalOpen} onClose={() => setScenarioModalOpen(false)} title="New Analysis Scenario" size="lg">
        <form onSubmit={handleCreateScenario} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Scenario Name *</label>
              <input type="text" className="input" value={scenarioForm.name} onChange={(e) => updateField('name', e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fleet</label>
              <select className="input" value={scenarioForm.fleet_id} onChange={(e) => updateField('fleet_id', e.target.value)}>
                <option value="">Select fleet...</option>
                {fleetList.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PM Schedule</label>
              <select className="input" value={scenarioForm.schedule_id} onChange={(e) => updateField('schedule_id', e.target.value)}>
                <option value="">Select schedule...</option>
                {scheduleList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">Create schedules in PM Planner, then select one here to apply PM tasks/costs to this scenario.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price List</label>
              <select className="input" value={scenarioForm.price_list_id} onChange={(e) => updateField('price_list_id', e.target.value)}>
                <option value="">Select price list...</option>
                {priceListList.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Labor Rates ($/hr by skill level)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Basic</label>
                <input type="number" className="input" value={scenarioForm.labor_rate_basic} onChange={(e) => updateField('labor_rate_basic', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Intermediate</label>
                <input type="number" className="input" value={scenarioForm.labor_rate_intermediate} onChange={(e) => updateField('labor_rate_intermediate', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Advanced</label>
                <input type="number" className="input" value={scenarioForm.labor_rate_advanced} onChange={(e) => updateField('labor_rate_advanced', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Specialist</label>
                <input type="number" className="input" value={scenarioForm.labor_rate_specialist} onChange={(e) => updateField('labor_rate_specialist', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Financial Parameters</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Parts Discount (%)</label>
                <input type="number" className="input" value={scenarioForm.parts_discount} onChange={(e) => updateField('parts_discount', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Overhead Markup (%)</label>
                <input type="number" className="input" value={scenarioForm.overhead_markup} onChange={(e) => updateField('overhead_markup', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Analysis Period (yrs)</label>
                <input type="number" className="input" value={scenarioForm.analysis_period_years} onChange={(e) => updateField('analysis_period_years', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Discount Rate (%)</label>
                <input type="number" step="0.1" className="input" value={scenarioForm.discount_rate} onChange={(e) => updateField('discount_rate', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Inflation Rate (%)</label>
                <input type="number" step="0.1" className="input" value={scenarioForm.inflation_rate} onChange={(e) => updateField('inflation_rate', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fuel Cost ($/L)</label>
                <input type="number" step="0.01" className="input" value={scenarioForm.fuel_cost_per_liter} onChange={(e) => updateField('fuel_cost_per_liter', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Downtime Cost ($/hr)</label>
                <input type="number" className="input" value={scenarioForm.downtime_cost_per_hour} onChange={(e) => updateField('downtime_cost_per_hour', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Working Days/Year</label>
                <input type="number" className="input" value={scenarioForm.working_days_per_year} onChange={(e) => updateField('working_days_per_year', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Hours/Day</label>
                <input type="number" className="input" value={scenarioForm.hours_per_day} onChange={(e) => updateField('hours_per_day', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Utilization Target (%)</label>
                <input type="number" className="input" value={scenarioForm.utilization_target} onChange={(e) => updateField('utilization_target', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => setScenarioModalOpen(false)} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={createScenarioMutation.isPending} className="btn btn-primary">
              {createScenarioMutation.isPending ? 'Creating...' : 'Create Scenario'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
