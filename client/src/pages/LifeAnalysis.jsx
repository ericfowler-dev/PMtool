import { useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts';
import {
  Activity, Plus, Pencil, Trash2, AlertTriangle, Shield, Cpu,
  Clock, DollarSign, Target,
} from 'lucide-react';
import MetricCard from '../components/MetricCard';
import Modal from '../components/Modal';
import { api } from '../api';
import { useApiQuery, useApiMutation } from '../hooks/useApi';

const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
const num = (v) => new Intl.NumberFormat('en-US').format(v);

const CATEGORIES = ['engine', 'turbo', 'cooling', 'fuel_system', 'electrical', 'exhaust', 'lubrication', 'controls', 'structural', 'other'];
const CRITICALITIES = ['low', 'medium', 'high', 'critical'];
const FAILURE_MODES = ['wear', 'fatigue', 'corrosion', 'overheating', 'contamination', 'electrical_failure', 'vibration', 'other'];

const criticalityColor = {
  low: { badge: 'bg-green-100 text-green-800', bar: '#10b981' },
  medium: { badge: 'bg-yellow-100 text-yellow-800', bar: '#f59e0b' },
  high: { badge: 'bg-orange-100 text-orange-800', bar: '#f97316' },
  critical: { badge: 'bg-red-100 text-red-800', bar: '#ef4444' },
};

const categoryBadge = {
  engine: 'bg-indigo-100 text-indigo-800',
  turbo: 'bg-red-100 text-red-800',
  cooling: 'bg-cyan-100 text-cyan-800',
  fuel_system: 'bg-orange-100 text-orange-800',
  electrical: 'bg-yellow-100 text-yellow-800',
  exhaust: 'bg-gray-200 text-gray-800',
  lubrication: 'bg-amber-100 text-amber-800',
  controls: 'bg-purple-100 text-purple-800',
  structural: 'bg-blue-100 text-blue-800',
  other: 'bg-gray-100 text-gray-700',
};

const emptyComponentForm = {
  name: '',
  category: 'engine',
  life_hours_min: '',
  life_hours_avg: '',
  life_hours_max: '',
  replacement_cost: '',
  labor_hours: '',
  criticality: 'medium',
  failure_mode: 'wear',
  weibull_shape: '',
  weibull_scale: '',
  notes: '',
};

export default function LifeAnalysis() {
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editComponent, setEditComponent] = useState(null);
  const [form, setForm] = useState(emptyComponentForm);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const { data: equipment, isLoading: eqLoading } = useApiQuery('equipment', () => api.equipment.list());
  const equipmentList = Array.isArray(equipment) ? equipment : [];

  // Fetch equipment detail which includes lifecycle components
  const modelQuery = useApiQuery(
    ['equipment', selectedModelId],
    () => api.equipment.get(selectedModelId),
    { enabled: !!selectedModelId }
  );

  const createMutation = useApiMutation(
    (data) => api.equipment.update(selectedModelId, { add_component: data }),
    {
      invalidateKeys: [['equipment', selectedModelId]],
      onSuccess: () => { setModalOpen(false); setForm(emptyComponentForm); setEditComponent(null); },
    }
  );

  const updateMutation = useApiMutation(
    ({ componentId, data }) => api.equipment.update(selectedModelId, { update_component: { id: componentId, ...data } }),
    {
      invalidateKeys: [['equipment', selectedModelId]],
      onSuccess: () => { setModalOpen(false); setEditComponent(null); },
    }
  );

  const deleteMutation = useApiMutation(
    (componentId) => api.equipment.update(selectedModelId, { delete_component: componentId }),
    {
      invalidateKeys: [['equipment', selectedModelId]],
      onSuccess: () => setDeleteConfirm(null),
    }
  );

  const modelData = modelQuery.data;
  const components = modelData?.components || modelData?.lifecycle_components || [];

  // Compute timeline data for 20 years
  const timelineData = useMemo(() => {
    if (!components.length) return [];
    return components
      .filter((c) => c.life_hours_avg)
      .map((c) => ({
        name: c.name,
        lifeHours: c.life_hours_avg,
        criticality: c.criticality || 'medium',
      }))
      .sort((a, b) => a.lifeHours - b.lifeHours);
  }, [components]);

  // Weibull failure probability curve
  const weibullCurve = useMemo(() => {
    if (!selectedComponent) return [];
    const shape = selectedComponent.weibull_shape || 2.5;
    const scale = selectedComponent.weibull_scale || selectedComponent.life_hours_avg || 10000;
    const points = [];
    const maxHours = scale * 2;
    for (let h = 0; h <= maxHours; h += maxHours / 50) {
      const t = h / scale;
      const cdf = 1 - Math.exp(-Math.pow(t, shape));
      points.push({ hours: Math.round(h), probability: Math.round(cdf * 10000) / 100 });
    }
    return points;
  }, [selectedComponent]);

  // Summary metrics
  const totalComponents = components.length;
  const avgReplacementCost = totalComponents > 0
    ? components.reduce((sum, c) => sum + (c.replacement_cost || 0), 0) / totalComponents
    : 0;
  const mostCritical = components.find((c) => c.criticality === 'critical')
    || components.find((c) => c.criticality === 'high')
    || components[0];
  const annualBudget = components.reduce((sum, c) => {
    if (c.life_hours_avg && c.replacement_cost) {
      // Assume 8000 operating hours/year
      const replacementsPerYear = 8000 / c.life_hours_avg;
      return sum + (replacementsPerYear * c.replacement_cost);
    }
    return sum;
  }, 0);

  // Enhanced predictive analytics
  const predictiveInsights = useMemo(() => {
    const insights = [];
    const currentHours = 8000; // Assume current operating hours

    components.forEach((comp) => {
      if (!comp.life_hours_avg) return;

      const remainingLife = comp.life_hours_avg - currentHours;
      const lifeUsed = (currentHours / comp.life_hours_avg) * 100;

      // Weibull-based risk assessment
      const shape = comp.weibull_shape || 2.5;
      const scale = comp.weibull_scale || comp.life_hours_avg;
      const t = currentHours / scale;
      const failureProb = 1 - Math.exp(-Math.pow(t, shape));

      let riskLevel = 'low';
      let recommendation = '';

      if (failureProb > 0.8) riskLevel = 'critical';
      else if (failureProb > 0.6) riskLevel = 'high';
      else if (failureProb > 0.3) riskLevel = 'medium';

      if (remainingLife < 1000) {
        recommendation = 'Schedule replacement soon';
      } else if (lifeUsed > 80) {
        recommendation = 'Monitor closely';
      } else if (failureProb > 0.5) {
        recommendation = 'Consider condition monitoring';
      }

      insights.push({
        component: comp,
        remainingLife,
        lifeUsed: Math.round(lifeUsed),
        failureProbability: Math.round(failureProb * 100),
        riskLevel,
        recommendation,
      });
    });

    return insights.sort((a, b) => {
      const riskOrder = { critical: 3, high: 2, medium: 1, low: 0 };
      return riskOrder[b.riskLevel] - riskOrder[a.riskLevel];
    });
  }, [components]);

  const openCreate = () => {
    setEditComponent(null);
    setForm(emptyComponentForm);
    setModalOpen(true);
  };

  const openEdit = (comp) => {
    setEditComponent(comp);
    setForm({
      name: comp.name || '',
      category: comp.category || 'engine',
      life_hours_min: comp.life_hours_min || '',
      life_hours_avg: comp.life_hours_avg || '',
      life_hours_max: comp.life_hours_max || '',
      replacement_cost: comp.replacement_cost || '',
      labor_hours: comp.labor_hours || '',
      criticality: comp.criticality || 'medium',
      failure_mode: comp.failure_mode || 'wear',
      weibull_shape: comp.weibull_shape || '',
      weibull_scale: comp.weibull_scale || '',
      notes: comp.notes || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      life_hours_min: form.life_hours_min ? Number(form.life_hours_min) : null,
      life_hours_avg: form.life_hours_avg ? Number(form.life_hours_avg) : null,
      life_hours_max: form.life_hours_max ? Number(form.life_hours_max) : null,
      replacement_cost: form.replacement_cost ? Number(form.replacement_cost) : null,
      labor_hours: form.labor_hours ? Number(form.labor_hours) : null,
      weibull_shape: form.weibull_shape ? Number(form.weibull_shape) : null,
      weibull_scale: form.weibull_scale ? Number(form.weibull_scale) : null,
    };
    if (editComponent) {
      updateMutation.mutate({ componentId: editComponent.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity size={28} className="text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Component Lifecycle Analysis</h1>
            <p className="text-sm text-gray-500">Track and analyze component lifecycles and replacement costs</p>
          </div>
        </div>
      </div>

      {/* Model Selection */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Equipment Model</label>
            <select
              className="input w-auto min-w-[250px]"
              value={selectedModelId}
              onChange={(e) => { setSelectedModelId(e.target.value); setSelectedComponent(null); }}
            >
              <option value="">Select a model...</option>
              {equipmentList.map((eq) => (
                <option key={eq.id} value={eq.id}>{eq.model_number} - {eq.engine_family || eq.engine_type}</option>
              ))}
            </select>
          </div>
          {selectedModelId && (
            <button onClick={openCreate} className="btn btn-primary btn-sm">
              <Plus size={14} className="mr-1" /> Add Component
            </button>
          )}
        </div>
      </div>

      {!selectedModelId && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Cpu size={48} className="mx-auto mb-3 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-500">Select an Equipment Model</h3>
          <p className="text-sm text-gray-400 mt-1">Choose a model to view and manage its component lifecycle data.</p>
        </div>
      )}

      {selectedModelId && modelQuery.isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {selectedModelId && !modelQuery.isLoading && (
        <>
          {/* Summary Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Total Components Tracked"
              value={num(totalComponents)}
              color="blue"
              icon={Target}
            />
            <MetricCard
              label="Avg Replacement Cost"
              value={fmt(avgReplacementCost)}
              color="green"
              icon={DollarSign}
            />
            <MetricCard
              label="Most Critical Component"
              value={mostCritical?.name || 'N/A'}
              subtitle={mostCritical?.criticality || ''}
              color="red"
              icon={Shield}
            />
            <MetricCard
              label="Est. Annual Replacement Budget"
              value={fmt(annualBudget)}
              subtitle="At 8,000 hrs/year"
              color="purple"
              icon={Clock}
            />
          </div>

          {components.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Activity size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">No components tracked for this model yet.</p>
              <p className="text-xs text-gray-400 mt-1">Click "Add Component" to start tracking component lifecycles.</p>
            </div>
          ) : (
            <>
              {/* Timeline Chart */}
              {timelineData.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Component Replacement Timeline (Average Life Hours)</h3>
                  <ResponsiveContainer width="100%" height={Math.max(250, timelineData.length * 40)}>
                    <BarChart data={timelineData} layout="vertical" margin={{ left: 120, right: 20, top: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${num(v)} hrs`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                      <Tooltip formatter={(v) => `${num(v)} hours`} />
                      <Bar dataKey="lifeHours" name="Average Life (hours)" radius={[0, 4, 4, 0]}>
                        {timelineData.map((entry, i) => (
                          <Cell key={i} fill={criticalityColor[entry.criticality]?.bar || '#6366f1'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                    {Object.entries(criticalityColor).map(([key, val]) => (
                      <div key={key} className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: val.bar }} />
                        <span className="capitalize">{key}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Component Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {components.map((comp) => (
                  <div
                    key={comp.id}
                    onClick={() => setSelectedComponent(comp)}
                    className={`bg-white rounded-xl border p-4 cursor-pointer transition-all duration-200 ${
                      selectedComponent?.id === comp.id
                        ? 'border-brand-500 ring-2 ring-brand-100 shadow-md'
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 text-sm">{comp.name}</h4>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${categoryBadge[comp.category] || categoryBadge.other}`}>
                            {(comp.category || 'other').replace('_', ' ')}
                          </span>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${criticalityColor[comp.criticality]?.badge || criticalityColor.medium.badge}`}>
                            {comp.criticality || 'medium'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(comp); }}
                          className="p-1 rounded text-gray-400 hover:text-brand-600"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(comp); }}
                          className="p-1 rounded text-gray-400 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-gray-50 rounded-lg p-2">
                        <span className="text-gray-500">Life Hours (avg)</span>
                        <div className="font-semibold text-gray-900 mt-0.5">
                          {comp.life_hours_avg ? num(comp.life_hours_avg) : '-'}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2">
                        <span className="text-gray-500">Range</span>
                        <div className="font-semibold text-gray-900 mt-0.5">
                          {comp.life_hours_min && comp.life_hours_max
                            ? `${num(comp.life_hours_min)} - ${num(comp.life_hours_max)}`
                            : '-'}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2">
                        <span className="text-gray-500">Replace Cost</span>
                        <div className="font-semibold text-gray-900 mt-0.5">
                          {comp.replacement_cost ? fmt(comp.replacement_cost) : '-'}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2">
                        <span className="text-gray-500">Labor Hours</span>
                        <div className="font-semibold text-gray-900 mt-0.5">{comp.labor_hours || '-'}</div>
                      </div>
                    </div>

                    {comp.failure_mode && (
                      <div className="mt-2 text-xs text-gray-500">
                        Failure mode: <span className="font-medium text-gray-700">{comp.failure_mode.replace('_', ' ')}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Predictive Maintenance Insights */}
              {predictiveInsights.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                    <Shield size={16} />
                    Predictive Maintenance Recommendations
                  </h3>
                  <div className="space-y-3">
                    {predictiveInsights.slice(0, 5).map((insight, i) => (
                      <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${
                        insight.riskLevel === 'critical' ? 'bg-red-50 border-red-200' :
                        insight.riskLevel === 'high' ? 'bg-orange-50 border-orange-200' :
                        insight.riskLevel === 'medium' ? 'bg-yellow-50 border-yellow-200' :
                        'bg-green-50 border-green-200'
                      }`}>
                        <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${
                          insight.riskLevel === 'critical' ? 'bg-red-500' :
                          insight.riskLevel === 'high' ? 'bg-orange-500' :
                          insight.riskLevel === 'medium' ? 'bg-yellow-500' :
                          'bg-green-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-900 text-sm">{insight.component.name}</span>
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              insight.riskLevel === 'critical' ? 'bg-red-100 text-red-800' :
                              insight.riskLevel === 'high' ? 'bg-orange-100 text-orange-800' :
                              insight.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {insight.riskLevel} risk
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-xs text-gray-600 mb-2">
                            <div>Life used: <span className="font-medium">{insight.lifeUsed}%</span></div>
                            <div>Failure prob: <span className="font-medium">{insight.failureProbability}%</span></div>
                            <div>Remaining: <span className="font-medium">{num(insight.remainingLife)} hrs</span></div>
                          </div>
                          {insight.recommendation && (
                            <p className="text-xs text-gray-700 font-medium">{insight.recommendation}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {predictiveInsights.length > 5 && (
                    <p className="text-xs text-gray-500 mt-3 text-center">
                      Showing top 5 recommendations. {predictiveInsights.length - 5} more components need attention.
                    </p>
                  )}
                </div>
              )}

              {/* Weibull Curve for Selected Component */}
              {selectedComponent && weibullCurve.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-1">
                    Probability of Failure - {selectedComponent.name}
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">
                    Weibull distribution (shape={selectedComponent.weibull_shape || 2.5}, scale={num(selectedComponent.weibull_scale || selectedComponent.life_hours_avg || 10000)} hrs)
                  </p>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={weibullCurve}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="hours"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                        label={{ value: 'Operating Hours', position: 'insideBottom', offset: -5, fontSize: 12 }}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `${v}%`}
                        domain={[0, 100]}
                        label={{ value: 'Failure Probability (%)', angle: -90, position: 'insideLeft', fontSize: 12 }}
                      />
                      <Tooltip
                        formatter={(v) => `${v}%`}
                        labelFormatter={(v) => `${num(v)} hours`}
                      />
                      <Line
                        type="monotone"
                        dataKey="probability"
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={false}
                        name="Failure Probability"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Add / Edit Component Modal */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditComponent(null); }} title={editComponent ? 'Edit Component' : 'Add Component'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Component Name *</label>
              <input type="text" className="input" value={form.name} onChange={(e) => updateField('name', e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select className="input" value={form.category} onChange={(e) => updateField('category', e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Criticality</label>
              <select className="input" value={form.criticality} onChange={(e) => updateField('criticality', e.target.value)}>
                {CRITICALITIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Failure Mode</label>
              <select className="input" value={form.failure_mode} onChange={(e) => updateField('failure_mode', e.target.value)}>
                {FAILURE_MODES.map((f) => (
                  <option key={f} value={f}>{f.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Expected Life (Operating Hours)</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Minimum</label>
                <input type="number" className="input" value={form.life_hours_min} onChange={(e) => updateField('life_hours_min', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Average *</label>
                <input type="number" className="input" value={form.life_hours_avg} onChange={(e) => updateField('life_hours_avg', e.target.value)} required />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Maximum</label>
                <input type="number" className="input" value={form.life_hours_max} onChange={(e) => updateField('life_hours_max', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Cost and Labor</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Replacement Cost ($)</label>
                <input type="number" step="0.01" className="input" value={form.replacement_cost} onChange={(e) => updateField('replacement_cost', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Labor Hours</label>
                <input type="number" step="0.5" className="input" value={form.labor_hours} onChange={(e) => updateField('labor_hours', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Weibull Parameters (Optional)</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Shape (Beta)</label>
                <input type="number" step="0.1" className="input" placeholder="Default: 2.5" value={form.weibull_shape} onChange={(e) => updateField('weibull_shape', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Scale (Eta)</label>
                <input type="number" className="input" placeholder="Default: avg life hours" value={form.weibull_scale} onChange={(e) => updateField('weibull_scale', e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => updateField('notes', e.target.value)} />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => { setModalOpen(false); setEditComponent(null); }} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="btn btn-primary">
              {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : editComponent ? 'Update Component' : 'Add Component'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Component" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
            <p className="text-sm text-gray-700">
              Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This cannot be undone.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteConfirm(null)} className="btn btn-ghost">Cancel</button>
            <button
              onClick={() => deleteMutation.mutate(deleteConfirm.id)}
              disabled={deleteMutation.isPending}
              className="btn bg-red-600 text-white hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
