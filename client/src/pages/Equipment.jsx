import { useState } from 'react';
import { Cpu, Plus, Pencil, Trash2, Filter, AlertTriangle } from 'lucide-react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { api } from '../api';
import { useApiQuery, useApiMutation } from '../hooks/useApi';

const ENGINE_TYPES = ['diesel', 'gas', 'dual-fuel', 'hfo'];
const APPLICATION_TYPES = ['standby', 'prime', 'ltp', 'continuous'];

const emptyForm = {
  model_number: '',
  engine_family: '',
  engine_type: 'diesel',
  power_kw: '',
  bore_mm: '',
  stroke_mm: '',
  cylinders: '',
  displacement_l: '',
  compression_ratio: '',
  rated_speed_rpm: '',
  application_types: [],
  oil_capacity_l: '',
  coolant_capacity_l: '',
  fuel_consumption_lph: '',
  notes: '',
};

const engineTypeBadge = {
  diesel: 'bg-amber-100 text-amber-800',
  gas: 'bg-blue-100 text-blue-800',
  'dual-fuel': 'bg-purple-100 text-purple-800',
  hfo: 'bg-gray-100 text-gray-800',
};

const appBadge = {
  standby: 'bg-yellow-100 text-yellow-800',
  prime: 'bg-green-100 text-green-800',
  ltp: 'bg-blue-100 text-blue-800',
  continuous: 'bg-red-100 text-red-800',
};

export default function Equipment() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [filters, setFilters] = useState({ engine_type: '', application_type: '', power_min: '', power_max: '' });
  const [showFilters, setShowFilters] = useState(false);

  const { data: equipment, isLoading, error } = useApiQuery('equipment', () => api.equipment.list());

  const createMutation = useApiMutation((data) => api.equipment.create(data), {
    invalidateKeys: ['equipment'],
    onSuccess: () => closeModal(),
  });

  const updateMutation = useApiMutation(({ id, data }) => api.equipment.update(id, data), {
    invalidateKeys: ['equipment'],
    onSuccess: () => closeModal(),
  });

  const deleteMutation = useApiMutation((id) => api.equipment.delete(id), {
    invalidateKeys: ['equipment'],
    onSuccess: () => setDeleteConfirm(null),
  });

  const equipmentList = Array.isArray(equipment) ? equipment : [];

  const filteredData = equipmentList.filter((eq) => {
    if (filters.engine_type && eq.engine_type !== filters.engine_type) return false;
    if (filters.application_type && !(eq.application_types || []).includes(filters.application_type)) return false;
    if (filters.power_min && eq.power_kw < Number(filters.power_min)) return false;
    if (filters.power_max && eq.power_kw > Number(filters.power_max)) return false;
    return true;
  });

  const openCreate = () => {
    setEditItem(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({
      model_number: item.model_number || '',
      engine_family: item.engine_family || '',
      engine_type: item.engine_type || 'diesel',
      power_kw: item.power_kw || '',
      bore_mm: item.bore_mm || '',
      stroke_mm: item.stroke_mm || '',
      cylinders: item.cylinders || '',
      displacement_l: item.displacement_l || '',
      compression_ratio: item.compression_ratio || '',
      rated_speed_rpm: item.rated_speed_rpm || '',
      application_types: item.application_types || [],
      oil_capacity_l: item.oil_capacity_l || '',
      coolant_capacity_l: item.coolant_capacity_l || '',
      fuel_consumption_lph: item.fuel_consumption_lph || '',
      notes: item.notes || '',
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditItem(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      power_kw: form.power_kw ? Number(form.power_kw) : null,
      bore_mm: form.bore_mm ? Number(form.bore_mm) : null,
      stroke_mm: form.stroke_mm ? Number(form.stroke_mm) : null,
      cylinders: form.cylinders ? Number(form.cylinders) : null,
      displacement_l: form.displacement_l ? Number(form.displacement_l) : null,
      compression_ratio: form.compression_ratio ? Number(form.compression_ratio) : null,
      rated_speed_rpm: form.rated_speed_rpm ? Number(form.rated_speed_rpm) : null,
      oil_capacity_l: form.oil_capacity_l ? Number(form.oil_capacity_l) : null,
      coolant_capacity_l: form.coolant_capacity_l ? Number(form.coolant_capacity_l) : null,
      fuel_consumption_lph: form.fuel_consumption_lph ? Number(form.fuel_consumption_lph) : null,
    };

    if (editItem) {
      updateMutation.mutate({ id: editItem.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const toggleAppType = (type) => {
    setForm((prev) => ({
      ...prev,
      application_types: prev.application_types.includes(type)
        ? prev.application_types.filter((t) => t !== type)
        : [...prev.application_types, type],
    }));
  };

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const columns = [
    { key: 'model_number', header: 'Model Number', accessor: 'model_number' },
    { key: 'engine_family', header: 'Engine Family', accessor: 'engine_family' },
    {
      key: 'engine_type',
      header: 'Engine Type',
      accessor: 'engine_type',
      render: (row) => (
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${engineTypeBadge[row.engine_type] || 'bg-gray-100 text-gray-700'}`}>
          {row.engine_type}
        </span>
      ),
    },
    {
      key: 'power_kw',
      header: 'Power (kW)',
      accessor: 'power_kw',
      render: (row) => (
        <span className="font-mono text-sm">{row.power_kw ? new Intl.NumberFormat('en-US').format(row.power_kw) : '-'}</span>
      ),
    },
    {
      key: 'application_types',
      header: 'Application Types',
      accessor: (row) => (row.application_types || []).join(', '),
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {(row.application_types || []).map((t) => (
            <span key={t} className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${appBadge[t] || 'bg-gray-100 text-gray-700'}`}>
              {t}
            </span>
          ))}
          {(!row.application_types || row.application_types.length === 0) && (
            <span className="text-gray-400 text-xs">None</span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      sortable: false,
      render: (row) => (
        <div className="flex items-center gap-1">
          <button onClick={() => openEdit(row)} className="p-1.5 rounded-lg text-gray-500 hover:text-brand-600 hover:bg-brand-50 transition-colors">
            <Pencil size={15} />
          </button>
          <button onClick={() => setDeleteConfirm(row)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Cpu size={28} className="text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Equipment Library</h1>
            <p className="text-sm text-gray-500">{equipmentList.length} equipment models</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilters((f) => !f)} className={`btn ${showFilters ? 'btn-primary' : 'btn-ghost'}`}>
            <Filter size={16} className="mr-1" /> Filters
          </button>
          <button onClick={openCreate} className="btn btn-primary">
            <Plus size={16} className="mr-1" /> Add Equipment
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      {showFilters && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Engine Type</label>
              <select className="input" value={filters.engine_type} onChange={(e) => setFilters((f) => ({ ...f, engine_type: e.target.value }))}>
                <option value="">All Types</option>
                {ENGINE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Application Type</label>
              <select className="input" value={filters.application_type} onChange={(e) => setFilters((f) => ({ ...f, application_type: e.target.value }))}>
                <option value="">All Applications</option>
                {APPLICATION_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Min Power (kW)</label>
              <input type="number" className="input" placeholder="0" value={filters.power_min} onChange={(e) => setFilters((f) => ({ ...f, power_min: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Max Power (kW)</label>
              <input type="number" className="input" placeholder="Any" value={filters.power_max} onChange={(e) => setFilters((f) => ({ ...f, power_max: e.target.value }))} />
            </div>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-500">
            <AlertTriangle size={32} className="mx-auto mb-2" />
            <p className="text-sm">{error.message || 'Failed to load equipment'}</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredData}
            emptyMessage="No equipment models found. Click 'Add Equipment' to create your first model."
          />
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal open={modalOpen} onClose={closeModal} title={editItem ? 'Edit Equipment Model' : 'Add Equipment Model'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Model Number *</label>
              <input type="text" className="input" value={form.model_number} onChange={(e) => updateField('model_number', e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Engine Family</label>
              <input type="text" className="input" value={form.engine_family} onChange={(e) => updateField('engine_family', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Engine Type</label>
              <select className="input" value={form.engine_type} onChange={(e) => updateField('engine_type', e.target.value)}>
                {ENGINE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Power (kW)</label>
              <input type="number" className="input" value={form.power_kw} onChange={(e) => updateField('power_kw', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bore (mm)</label>
              <input type="number" className="input" value={form.bore_mm} onChange={(e) => updateField('bore_mm', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stroke (mm)</label>
              <input type="number" className="input" value={form.stroke_mm} onChange={(e) => updateField('stroke_mm', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cylinders</label>
              <input type="number" className="input" value={form.cylinders} onChange={(e) => updateField('cylinders', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Displacement (L)</label>
              <input type="number" step="0.01" className="input" value={form.displacement_l} onChange={(e) => updateField('displacement_l', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Compression Ratio</label>
              <input type="number" step="0.1" className="input" value={form.compression_ratio} onChange={(e) => updateField('compression_ratio', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rated Speed (RPM)</label>
              <input type="number" className="input" value={form.rated_speed_rpm} onChange={(e) => updateField('rated_speed_rpm', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Oil Capacity (L)</label>
              <input type="number" step="0.1" className="input" value={form.oil_capacity_l} onChange={(e) => updateField('oil_capacity_l', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Coolant Capacity (L)</label>
              <input type="number" step="0.1" className="input" value={form.coolant_capacity_l} onChange={(e) => updateField('coolant_capacity_l', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Consumption (L/hr)</label>
              <input type="number" step="0.1" className="input" value={form.fuel_consumption_lph} onChange={(e) => updateField('fuel_consumption_lph', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Application Types</label>
            <div className="flex flex-wrap gap-2">
              {APPLICATION_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleAppType(type)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    form.application_types.includes(type)
                      ? 'bg-brand-500 text-white border-brand-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-brand-300'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea className="input" rows={3} value={form.notes} onChange={(e) => updateField('notes', e.target.value)} />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={closeModal} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={isSaving} className="btn btn-primary">
              {isSaving ? 'Saving...' : editItem ? 'Update Model' : 'Create Model'}
            </button>
          </div>

          {(createMutation.isError || updateMutation.isError) && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {createMutation.error?.message || updateMutation.error?.message || 'Save failed'}
            </div>
          )}
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Equipment Model" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-700">
                Are you sure you want to delete <strong>{deleteConfirm?.model_number}</strong>? This action cannot be undone.
              </p>
            </div>
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
          {deleteMutation.isError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {deleteMutation.error?.message || 'Delete failed'}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
