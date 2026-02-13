import { useState } from 'react';
import { Ship, Plus, Pencil, Trash2, MapPin, ChevronRight, AlertTriangle, Package, Users } from 'lucide-react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { api } from '../api';
import { useApiQuery, useApiMutation } from '../hooks/useApi';

const FUEL_TYPES = [
  { value: 'pipeline_ng', label: 'Pipeline NG' },
  { value: 'field_gas_ng', label: 'Field Gas NG' },
  { value: 'lp', label: 'LP' },
  { value: 'gasoline', label: 'Gasoline' },
  { value: 'diesel', label: 'Diesel' },
];
const FUEL_QUALITY = ['premium', 'standard', 'low_grade'];
const ENVIRONMENTS = ['clean', 'dusty', 'coastal', 'humid', 'extreme_heat', 'extreme_cold'];
const APPLICATION_TYPES = ['standby', 'prime', 'ltp', 'continuous'];

const emptyFleetForm = { name: '', description: '', location: '' };
const emptyUnitForm = {
  unit_name: '',
  equipment_model_id: '',
  application_type: 'prime',
  annual_hours: 4000,
  duty_cycle: 80,
  fuel_type: 'pipeline_ng',
  fuel_quality: 'standard',
  environment: 'clean',
  ambient_temp_min: -10,
  ambient_temp_max: 45,
  altitude_m: 0,
  commissioning_rate: 0,
  quantity: 1,
};

export default function FleetManager() {
  const [selectedFleetId, setSelectedFleetId] = useState(null);
  const [fleetModalOpen, setFleetModalOpen] = useState(false);
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [editFleet, setEditFleet] = useState(null);
  const [editUnit, setEditUnit] = useState(null);
  const [fleetForm, setFleetForm] = useState(emptyFleetForm);
  const [unitForm, setUnitForm] = useState(emptyUnitForm);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteType, setDeleteType] = useState(null); // 'fleet' | 'unit'

  const { data: fleets, isLoading: fleetsLoading, error: fleetsError } = useApiQuery('fleets', () => api.fleet.list());
  const { data: equipment } = useApiQuery('equipment', () => api.equipment.list());

  const selectedFleetQuery = useApiQuery(
    ['fleet', selectedFleetId],
    () => api.fleet.get(selectedFleetId),
    { enabled: !!selectedFleetId }
  );

  const createFleetMutation = useApiMutation((data) => api.fleet.create(data), {
    invalidateKeys: ['fleets'],
    onSuccess: () => closeFleetModal(),
  });

  const updateFleetMutation = useApiMutation(({ id, data }) => api.fleet.update(id, data), {
    invalidateKeys: ['fleets', ['fleet', selectedFleetId]],
    onSuccess: () => closeFleetModal(),
  });

  const deleteFleetMutation = useApiMutation((id) => api.fleet.delete(id), {
    invalidateKeys: ['fleets'],
    onSuccess: () => { setDeleteConfirm(null); setSelectedFleetId(null); },
  });

  const addUnitMutation = useApiMutation(({ fleetId, data }) => api.fleet.addUnit(fleetId, data), {
    invalidateKeys: [['fleet', selectedFleetId], 'fleets'],
    onSuccess: () => closeUnitModal(),
  });

  const updateUnitMutation = useApiMutation(({ fleetId, unitId, data }) => api.fleet.updateUnit(fleetId, unitId, data), {
    invalidateKeys: [['fleet', selectedFleetId], 'fleets'],
    onSuccess: () => closeUnitModal(),
  });

  const deleteUnitMutation = useApiMutation(({ fleetId, unitId }) => api.fleet.deleteUnit(fleetId, unitId), {
    invalidateKeys: [['fleet', selectedFleetId], 'fleets'],
    onSuccess: () => setDeleteConfirm(null),
  });

  const fleetList = Array.isArray(fleets) ? fleets : [];
  const equipmentList = Array.isArray(equipment) ? equipment : [];
  const selectedFleet = selectedFleetQuery.data;
  const units = selectedFleet?.units || [];

  const openCreateFleet = () => {
    setEditFleet(null);
    setFleetForm(emptyFleetForm);
    setFleetModalOpen(true);
  };

  const openEditFleet = (fleet) => {
    setEditFleet(fleet);
    setFleetForm({ name: fleet.name || '', description: fleet.description || '', location: fleet.location || '' });
    setFleetModalOpen(true);
  };

  const closeFleetModal = () => {
    setFleetModalOpen(false);
    setEditFleet(null);
    setFleetForm(emptyFleetForm);
  };

  const openCreateUnit = () => {
    setEditUnit(null);
    setUnitForm(emptyUnitForm);
    setUnitModalOpen(true);
  };

  const openEditUnit = (unit) => {
    setEditUnit(unit);
    setUnitForm({
      unit_name: unit.unit_name || '',
      equipment_model_id: unit.equipment_model_id || '',
      application_type: unit.application_type || 'prime',
      annual_hours: unit.annual_hours || 4000,
      duty_cycle: unit.duty_cycle || 80,
      fuel_type: unit.fuel_type || 'pipeline_ng',
      fuel_quality: unit.fuel_quality || 'standard',
      environment: unit.environment || 'clean',
      ambient_temp_min: unit.ambient_temp_min ?? -10,
      ambient_temp_max: unit.ambient_temp_max ?? 45,
      altitude_m: unit.altitude_m || 0,
      commissioning_rate: unit.commissioning_rate || 0,
      quantity: unit.quantity || 1,
    });
    setUnitModalOpen(true);
  };

  const closeUnitModal = () => {
    setUnitModalOpen(false);
    setEditUnit(null);
    setUnitForm(emptyUnitForm);
  };

  const handleFleetSubmit = (e) => {
    e.preventDefault();
    if (editFleet) {
      updateFleetMutation.mutate({ id: editFleet.id, data: fleetForm });
    } else {
      createFleetMutation.mutate(fleetForm);
    }
  };

  const handleUnitSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...unitForm,
      equipment_model_id: Number(unitForm.equipment_model_id),
      annual_hours: Number(unitForm.annual_hours),
      duty_cycle: Number(unitForm.duty_cycle),
      ambient_temp_min: Number(unitForm.ambient_temp_min),
      ambient_temp_max: Number(unitForm.ambient_temp_max),
      altitude_m: Number(unitForm.altitude_m),
      commissioning_rate: Number(unitForm.commissioning_rate),
      quantity: Number(unitForm.quantity),
    };
    if (editUnit) {
      updateUnitMutation.mutate({ fleetId: selectedFleetId, unitId: editUnit.id, data: payload });
    } else {
      addUnitMutation.mutate({ fleetId: selectedFleetId, data: payload });
    }
  };

  const confirmDelete = (item, type) => {
    setDeleteConfirm(item);
    setDeleteType(type);
  };

  const handleDelete = () => {
    if (deleteType === 'fleet') {
      deleteFleetMutation.mutate(deleteConfirm.id);
    } else if (deleteType === 'unit') {
      deleteUnitMutation.mutate({ fleetId: selectedFleetId, unitId: deleteConfirm.id });
    }
  };

  const getModelName = (modelId) => {
    const model = equipmentList.find((eq) => eq.id === modelId);
    return model?.model_number || 'Unknown';
  };

  const formatFuelType = (fuelType) => {
    const match = FUEL_TYPES.find((type) => type.value === fuelType);
    if (match) return match.label;
    return String(fuelType || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const unitColumns = [
    { key: 'unit_name', header: 'Unit Name', accessor: 'unit_name' },
    {
      key: 'model',
      header: 'Model',
      accessor: (row) => getModelName(row.equipment_model_id),
    },
    {
      key: 'application_type',
      header: 'Application',
      accessor: 'application_type',
      render: (row) => (
        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          {row.application_type}
        </span>
      ),
    },
    { key: 'annual_hours', header: 'Annual Hours', accessor: 'annual_hours', render: (row) => <span className="font-mono text-sm">{new Intl.NumberFormat('en-US').format(row.annual_hours)}</span> },
    { key: 'duty_cycle', header: 'Duty Cycle', accessor: 'duty_cycle', render: (row) => `${row.duty_cycle}%` },
    {
      key: 'fuel_type',
      header: 'Fuel',
      accessor: 'fuel_type',
      render: (row) => formatFuelType(row.fuel_type),
    },
    { key: 'environment', header: 'Environment', accessor: 'environment' },
    { key: 'quantity', header: 'Qty', accessor: 'quantity' },
    {
      key: 'actions',
      header: 'Actions',
      sortable: false,
      render: (row) => (
        <div className="flex items-center gap-1">
          <button onClick={() => openEditUnit(row)} className="p-1.5 rounded-lg text-gray-500 hover:text-brand-600 hover:bg-brand-50">
            <Pencil size={15} />
          </button>
          <button onClick={() => confirmDelete(row, 'unit')} className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50">
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  const isFleetSaving = createFleetMutation.isPending || updateFleetMutation.isPending;
  const isUnitSaving = addUnitMutation.isPending || updateUnitMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Ship size={28} className="text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Fleet Manager</h1>
            <p className="text-sm text-gray-500">Manage your generator fleets and units</p>
          </div>
        </div>
        <button onClick={openCreateFleet} className="btn btn-primary">
          <Plus size={16} className="mr-1" /> New Fleet
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fleet List */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Fleets</h2>

          {fleetsLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : fleetsError ? (
            <div className="text-center py-12 text-red-500">
              <AlertTriangle size={24} className="mx-auto mb-2" />
              <p className="text-sm">{fleetsError.message}</p>
            </div>
          ) : fleetList.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <Ship size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">No fleets yet.</p>
              <p className="text-xs text-gray-400 mt-1">Create your first fleet to start adding generator units.</p>
            </div>
          ) : (
            fleetList.map((fleet) => (
              <div
                key={fleet.id}
                onClick={() => setSelectedFleetId(fleet.id)}
                className={`bg-white rounded-xl border p-4 cursor-pointer transition-all duration-200 ${
                  selectedFleetId === fleet.id
                    ? 'border-brand-500 ring-2 ring-brand-100 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{fleet.name}</h3>
                    {fleet.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{fleet.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      {fleet.location && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <MapPin size={12} /> {fleet.location}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Package size={12} /> {fleet.units?.length || fleet.unit_count || 0} units
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditFleet(fleet); }}
                      className="p-1 rounded text-gray-400 hover:text-brand-600"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); confirmDelete(fleet, 'fleet'); }}
                      className="p-1 rounded text-gray-400 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                    <ChevronRight size={16} className={`text-gray-400 transition-transform ${selectedFleetId === fleet.id ? 'rotate-90' : ''}`} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Fleet Details / Units */}
        <div className="lg:col-span-2">
          {!selectedFleetId ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Users size={48} className="mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-500">Select a Fleet</h3>
              <p className="text-sm text-gray-400 mt-1">Choose a fleet from the left to view and manage its units.</p>
            </div>
          ) : selectedFleetQuery.isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selectedFleet?.name} - Units</h2>
                  <p className="text-sm text-gray-500">{units.length} units configured</p>
                </div>
                <button onClick={openCreateUnit} className="btn btn-primary btn-sm">
                  <Plus size={14} className="mr-1" /> Add Unit
                </button>
              </div>

              <DataTable
                columns={unitColumns}
                data={units}
                emptyMessage="No units in this fleet. Click 'Add Unit' to configure generator units."
                pageSize={10}
              />

              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                <p className="text-sm font-medium text-blue-900">How PM schedules connect to fleets</p>
                <p className="text-xs text-blue-800 mt-1">
                  PM schedules are created in <strong>PM Planner</strong> and assigned when creating or editing an
                  <strong> Analysis Scenario</strong> in <strong>TCO Analysis</strong>. Fleet units store operating context
                  (hours, fuel, environment), while PM tasks come from the selected schedule.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fleet Modal */}
      <Modal open={fleetModalOpen} onClose={closeFleetModal} title={editFleet ? 'Edit Fleet' : 'New Fleet'} size="sm">
        <form onSubmit={handleFleetSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fleet Name *</label>
            <input type="text" className="input" value={fleetForm.name} onChange={(e) => setFleetForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea className="input" rows={2} value={fleetForm.description} onChange={(e) => setFleetForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input type="text" className="input" value={fleetForm.location} onChange={(e) => setFleetForm((f) => ({ ...f, location: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={closeFleetModal} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={isFleetSaving} className="btn btn-primary">
              {isFleetSaving ? 'Saving...' : editFleet ? 'Update Fleet' : 'Create Fleet'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Unit Modal */}
      <Modal open={unitModalOpen} onClose={closeUnitModal} title={editUnit ? 'Edit Unit' : 'Add Unit'} size="lg">
        <form onSubmit={handleUnitSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Name</label>
              <input type="text" className="input" value={unitForm.unit_name} onChange={(e) => setUnitForm((f) => ({ ...f, unit_name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Equipment Model *</label>
              <select className="input" value={unitForm.equipment_model_id} onChange={(e) => setUnitForm((f) => ({ ...f, equipment_model_id: e.target.value }))} required>
                <option value="">Select model...</option>
                {equipmentList.map((eq) => (
                  <option key={eq.id} value={eq.id}>{eq.model_number}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Application Type</label>
              <select className="input" value={unitForm.application_type} onChange={(e) => setUnitForm((f) => ({ ...f, application_type: e.target.value }))}>
                {APPLICATION_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Annual Hours</label>
              <input type="number" className="input" value={unitForm.annual_hours} onChange={(e) => setUnitForm((f) => ({ ...f, annual_hours: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duty Cycle (%)</label>
              <input type="number" className="input" min="0" max="100" value={unitForm.duty_cycle} onChange={(e) => setUnitForm((f) => ({ ...f, duty_cycle: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Type</label>
              <select className="input" value={unitForm.fuel_type} onChange={(e) => setUnitForm((f) => ({ ...f, fuel_type: e.target.value }))}>
                {FUEL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Quality</label>
              <select className="input" value={unitForm.fuel_quality} onChange={(e) => setUnitForm((f) => ({ ...f, fuel_quality: e.target.value }))}>
                {FUEL_QUALITY.map((t) => (
                  <option key={t} value={t}>{t.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Environment</label>
              <select className="input" value={unitForm.environment} onChange={(e) => setUnitForm((f) => ({ ...f, environment: e.target.value }))}>
                {ENVIRONMENTS.map((t) => (
                  <option key={t} value={t}>{t.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input type="number" className="input" min="1" value={unitForm.quantity} onChange={(e) => setUnitForm((f) => ({ ...f, quantity: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Ambient Temp (C)</label>
              <input type="number" className="input" value={unitForm.ambient_temp_min} onChange={(e) => setUnitForm((f) => ({ ...f, ambient_temp_min: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Ambient Temp (C)</label>
              <input type="number" className="input" value={unitForm.ambient_temp_max} onChange={(e) => setUnitForm((f) => ({ ...f, ambient_temp_max: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Altitude (m)</label>
              <input type="number" className="input" value={unitForm.altitude_m} onChange={(e) => setUnitForm((f) => ({ ...f, altitude_m: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Commissioning Rate (units/month)</label>
              <input type="number" className="input" min="0" value={unitForm.commissioning_rate} onChange={(e) => setUnitForm((f) => ({ ...f, commissioning_rate: e.target.value }))} />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={closeUnitModal} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={isUnitSaving} className="btn btn-primary">
              {isUnitSaving ? 'Saving...' : editUnit ? 'Update Unit' : 'Add Unit'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title={`Delete ${deleteType === 'fleet' ? 'Fleet' : 'Unit'}`} size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
            <p className="text-sm text-gray-700">
              Are you sure you want to delete <strong>{deleteConfirm?.name || deleteConfirm?.unit_name}</strong>?
              {deleteType === 'fleet' && ' All units in this fleet will also be removed.'}
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteConfirm(null)} className="btn btn-ghost">Cancel</button>
            <button
              onClick={handleDelete}
              disabled={deleteFleetMutation.isPending || deleteUnitMutation.isPending}
              className="btn bg-red-600 text-white hover:bg-red-700"
            >
              {(deleteFleetMutation.isPending || deleteUnitMutation.isPending) ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
