import { useState } from 'react';
import { LayoutDashboard, Cpu, Ship, DollarSign, Wrench, Calculator, TrendingUp, Clock, Activity } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import MetricCard from '../components/MetricCard';
import { api } from '../api';
import { useApiQuery, useApiMutation } from '../hooks/useApi';

const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
const num = (v) => new Intl.NumberFormat('en-US').format(v);

const APPLICATION_TYPES = [
  { value: 'standby', label: 'Standby' },
  { value: 'prime', label: 'Prime' },
  { value: 'ltp', label: 'Limited Time Prime (LTP)' },
  { value: 'continuous', label: 'Continuous' },
];

export default function Dashboard() {
  const { data: equipment, isLoading: eqLoading } = useApiQuery('equipment', () => api.equipment.list());
  const { data: fleets, isLoading: flLoading } = useApiQuery('fleets', () => api.fleet.list());
  const { data: priceLists, isLoading: plLoading } = useApiQuery('priceLists', () => api.priceLists.list());
  const { data: schedules, isLoading: schLoading } = useApiQuery('schedules', () => api.maintenance.listSchedules());

  const [calcForm, setCalcForm] = useState({
    equipment_model_id: '',
    application_type: 'prime',
    fleet_size: 10,
    annual_hours: 4000,
    labor_rate: 85,
    parts_discount: 0,
  });
  const [calcResults, setCalcResults] = useState(null);

  const calcMutation = useApiMutation(
    (params) => api.analysis.quickCalc(params),
    {
      onSuccess: (data) => setCalcResults(data),
    }
  );

  const handleCalc = (e) => {
    e.preventDefault();
    calcMutation.mutate({
      ...calcForm,
      equipment_model_id: Number(calcForm.equipment_model_id),
      fleet_size: Number(calcForm.fleet_size),
      annual_hours: Number(calcForm.annual_hours),
      labor_rate: Number(calcForm.labor_rate),
      parts_discount: Number(calcForm.parts_discount),
    });
  };

  const updateField = (field, value) => setCalcForm((prev) => ({ ...prev, [field]: value }));

  const equipmentList = Array.isArray(equipment) ? equipment : [];
  const fleetList = Array.isArray(fleets) ? fleets : [];
  const priceListList = Array.isArray(priceLists) ? priceLists : [];
  const scheduleList = Array.isArray(schedules) ? schedules : [];

  const isLoading = eqLoading || flLoading || plLoading || schLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <LayoutDashboard size={28} className="text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Power generation fleet management overview</p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Equipment Models"
          value={isLoading ? '...' : num(equipmentList.length)}
          subtitle="In equipment library"
          color="blue"
          icon={Cpu}
        />
        <MetricCard
          label="Active Fleets"
          value={isLoading ? '...' : num(fleetList.length)}
          subtitle="Fleet configurations"
          color="green"
          icon={Ship}
        />
        <MetricCard
          label="Active Price Lists"
          value={isLoading ? '...' : num(priceListList.length)}
          subtitle="Parts pricing sets"
          color="purple"
          icon={DollarSign}
        />
        <MetricCard
          label="PM Schedules"
          value={isLoading ? '...' : num(scheduleList.length)}
          subtitle="Maintenance plans"
          color="orange"
          icon={Wrench}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick TCO Calculator */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-5">
            <Calculator size={20} className="text-brand-600" />
            <h2 className="text-lg font-bold text-gray-900">Quick TCO Calculator</h2>
          </div>

          <form onSubmit={handleCalc} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Equipment Model</label>
                <select
                  className="input"
                  value={calcForm.equipment_model_id}
                  onChange={(e) => updateField('equipment_model_id', e.target.value)}
                  required
                >
                  <option value="">Select model...</option>
                  {equipmentList.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.model_number}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Application Type</label>
                <select
                  className="input"
                  value={calcForm.application_type}
                  onChange={(e) => updateField('application_type', e.target.value)}
                >
                  {APPLICATION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fleet Size</label>
                <input
                  type="number"
                  className="input"
                  value={calcForm.fleet_size}
                  onChange={(e) => updateField('fleet_size', e.target.value)}
                  min="1"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Annual Hours</label>
                <input
                  type="number"
                  className="input"
                  value={calcForm.annual_hours}
                  onChange={(e) => updateField('annual_hours', e.target.value)}
                  min="1"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Labor Rate ($/hr)</label>
                <input
                  type="number"
                  className="input"
                  value={calcForm.labor_rate}
                  onChange={(e) => updateField('labor_rate', e.target.value)}
                  min="0"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parts Discount (%)</label>
                <input
                  type="number"
                  className="input"
                  value={calcForm.parts_discount}
                  onChange={(e) => updateField('parts_discount', e.target.value)}
                  min="0"
                  max="100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={calcMutation.isPending || !calcForm.equipment_model_id}
              className="btn btn-primary"
            >
              {calcMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Calculating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Calculator size={16} />
                  Calculate
                </span>
              )}
            </button>
          </form>

          {calcMutation.isError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {calcMutation.error?.message || 'Calculation failed. Please check your inputs and try again.'}
            </div>
          )}

          {calcResults && (
            <div className="mt-6 space-y-4">
              <div className="h-px bg-gray-200" />
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Results</h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg p-4 border border-emerald-100">
                  <div className="text-xs text-emerald-600 font-medium">Annual Maintenance Cost</div>
                  <div className="text-xl font-bold text-emerald-800 mt-1">
                    {fmt(calcResults.annual_maintenance_cost || 0)}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
                  <div className="text-xs text-blue-600 font-medium">Cost / Operating Hour</div>
                  <div className="text-xl font-bold text-blue-800 mt-1">
                    ${(calcResults.cost_per_operating_hour || 0).toFixed(2)}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-100">
                  <div className="text-xs text-purple-600 font-medium">Technicians Required</div>
                  <div className="text-xl font-bold text-purple-800 mt-1">
                    {(calcResults.technicians_required || 0).toFixed(1)}
                  </div>
                </div>
              </div>

              {calcResults.five_year_projection && calcResults.five_year_projection.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">5-Year TCO Projection</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={calcResults.five_year_projection}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => fmt(v)} />
                      <Area
                        type="monotone"
                        dataKey="cumulative_cost"
                        stroke="#6366f1"
                        fill="url(#tcoGradient)"
                        name="Cumulative TCO"
                      />
                      <defs>
                        <linearGradient id="tcoGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {!calcResults && !calcMutation.isPending && (
            <div className="mt-6 text-center py-8 text-gray-400">
              <TrendingUp size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Select an equipment model and configure parameters to see a quick TCO estimate.</p>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-5">
            <Activity size={20} className="text-brand-600" />
            <h2 className="text-lg font-bold text-gray-900">Recent Activity</h2>
          </div>

          <div className="space-y-4">
            {fleetList.length > 0 ? (
              fleetList.slice(0, 5).map((fleet, i) => (
                <div key={fleet.id || i} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Ship size={14} className="text-brand-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{fleet.name}</p>
                    <p className="text-xs text-gray-500">
                      {fleet.location || 'No location'} &middot; {fleet.units?.length || 0} units
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-gray-400">
                <Clock size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No recent activity yet.</p>
                <p className="text-xs mt-1">Add equipment, create fleets, and run analyses to see activity here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
