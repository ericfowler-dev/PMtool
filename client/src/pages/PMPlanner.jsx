import { useState } from 'react';
import { Wrench, Plus, Pencil, Trash2, ChevronRight, AlertTriangle, Clock, Zap, Lock, ToggleLeft, ToggleRight, Settings, Cog, Package } from 'lucide-react';
import Modal from '../components/Modal';
import { api } from '../api';
import { useApiQuery, useApiMutation } from '../hooks/useApi';

const SKILL_LEVELS = ['basic', 'intermediate', 'advanced', 'specialist'];

const skillBadge = {
  basic: 'bg-green-100 text-green-800',
  intermediate: 'bg-blue-100 text-blue-800',
  advanced: 'bg-purple-100 text-purple-800',
  specialist: 'bg-red-100 text-red-800',
};

const emptyScheduleForm = {
  name: '',
  equipment_model_id: '',
  application_type: 'prime',
  description: '',
};

const emptyTaskForm = {
  name: '',
  interval_hours: '',
  interval_months: '',
  labor_hours: '',
  skill_level: 'intermediate',
  is_one_time: false,
  is_automated: false,
  is_locked: false,
  enabled: true,
  description: '',
};

const emptyPartForm = {
  part_number: '',
  description: '',
  quantity: 1,
  unit_cost: '',
};

const APPLICATION_TYPES = ['standby', 'prime', 'ltp', 'continuous'];

export default function PMPlanner() {
  const [selectedScheduleId, setSelectedScheduleId] = useState(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [partModalOpen, setPartModalOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState(null);
  const [editTask, setEditTask] = useState(null);
  const [scheduleForm, setScheduleForm] = useState(emptyScheduleForm);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [partForm, setPartForm] = useState(emptyPartForm);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteType, setDeleteType] = useState(null);
  const [editingField, setEditingField] = useState(null);

  const { data: schedules, isLoading: schedulesLoading } = useApiQuery('schedules', () => api.maintenance.listSchedules());
  const { data: equipment } = useApiQuery('equipment', () => api.equipment.list());

  const scheduleQuery = useApiQuery(
    ['schedule', selectedScheduleId],
    () => api.maintenance.getSchedule(selectedScheduleId),
    { enabled: !!selectedScheduleId }
  );

  const createScheduleMutation = useApiMutation((data) => api.maintenance.createSchedule(data), {
    invalidateKeys: ['schedules'],
    onSuccess: () => { setScheduleModalOpen(false); setScheduleForm(emptyScheduleForm); },
  });

  const updateScheduleMutation = useApiMutation(({ id, data }) => api.maintenance.updateSchedule(id, data), {
    invalidateKeys: ['schedules', ['schedule', selectedScheduleId]],
    onSuccess: () => { setScheduleModalOpen(false); setEditSchedule(null); },
  });

  const deleteScheduleMutation = useApiMutation((id) => api.maintenance.deleteSchedule(id), {
    invalidateKeys: ['schedules'],
    onSuccess: () => { setDeleteConfirm(null); setSelectedScheduleId(null); },
  });

  const addTaskMutation = useApiMutation(({ scheduleId, data }) => api.maintenance.addTask(scheduleId, data), {
    invalidateKeys: [['schedule', selectedScheduleId], 'schedules'],
    onSuccess: () => { setTaskModalOpen(false); setTaskForm(emptyTaskForm); },
  });

  const updateTaskMutation = useApiMutation(({ taskId, data }) => api.maintenance.updateTask(taskId, data), {
    invalidateKeys: [['schedule', selectedScheduleId]],
  });

  const deleteTaskMutation = useApiMutation((taskId) => api.maintenance.deleteTask(taskId), {
    invalidateKeys: [['schedule', selectedScheduleId], 'schedules'],
    onSuccess: () => setDeleteConfirm(null),
  });

  const addPartMutation = useApiMutation(({ taskId, data }) => api.maintenance.addTaskPart(taskId, data), {
    invalidateKeys: [['schedule', selectedScheduleId]],
    onSuccess: () => { setPartModalOpen(false); setPartForm(emptyPartForm); },
  });

  const deletePartMutation = useApiMutation((id) => api.maintenance.deleteTaskPart(id), {
    invalidateKeys: [['schedule', selectedScheduleId]],
  });

  const scheduleList = Array.isArray(schedules) ? schedules : [];
  const equipmentList = Array.isArray(equipment) ? equipment : [];
  const selectedSchedule = scheduleQuery.data;
  const tasks = selectedSchedule?.tasks || [];

  const getModelName = (id) => equipmentList.find((eq) => eq.id === id)?.model_number || 'Unknown';

  const openCreateSchedule = () => {
    setEditSchedule(null);
    setScheduleForm(emptyScheduleForm);
    setScheduleModalOpen(true);
  };

  const openEditSchedule = (schedule) => {
    setEditSchedule(schedule);
    setScheduleForm({
      name: schedule.name || '',
      equipment_model_id: schedule.equipment_model_id || '',
      application_type: schedule.application_type || 'prime',
      description: schedule.description || '',
    });
    setScheduleModalOpen(true);
  };

  const handleScheduleSubmit = (e) => {
    e.preventDefault();
    const payload = { ...scheduleForm, equipment_model_id: Number(scheduleForm.equipment_model_id) };
    if (editSchedule) {
      updateScheduleMutation.mutate({ id: editSchedule.id, data: payload });
    } else {
      createScheduleMutation.mutate(payload);
    }
  };

  const openAddTask = () => {
    setEditTask(null);
    setTaskForm(emptyTaskForm);
    setTaskModalOpen(true);
  };

  const handleTaskSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...taskForm,
      interval_hours: taskForm.interval_hours ? Number(taskForm.interval_hours) : null,
      interval_months: taskForm.interval_months ? Number(taskForm.interval_months) : null,
      labor_hours: taskForm.labor_hours ? Number(taskForm.labor_hours) : null,
    };
    if (editTask) {
      updateTaskMutation.mutate({ taskId: editTask.id, data: payload });
      setTaskModalOpen(false);
      setEditTask(null);
    } else {
      addTaskMutation.mutate({ scheduleId: selectedScheduleId, data: payload });
    }
  };

  const handlePartSubmit = (e) => {
    e.preventDefault();
    addPartMutation.mutate({
      taskId: activeTaskId,
      data: {
        ...partForm,
        quantity: Number(partForm.quantity),
        unit_cost: partForm.unit_cost ? Number(partForm.unit_cost) : null,
      },
    });
  };

  const toggleTaskEnabled = (task) => {
    updateTaskMutation.mutate({ taskId: task.id, data: { enabled: !task.enabled } });
  };

  const handleInlineEdit = (task, field, value) => {
    updateTaskMutation.mutate({ taskId: task.id, data: { [field]: Number(value) } });
    setEditingField(null);
  };

  const applyPreset = (multiplier) => {
    tasks.forEach((task) => {
      if (!task.is_locked && task.interval_hours) {
        updateTaskMutation.mutate({
          taskId: task.id,
          data: { interval_hours: Math.round(task.interval_hours * multiplier) },
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wrench size={28} className="text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">PM Schedule Planner</h1>
            <p className="text-sm text-gray-500">Design and manage preventive maintenance schedules</p>
          </div>
        </div>
        <button onClick={openCreateSchedule} className="btn btn-primary">
          <Plus size={16} className="mr-1" /> New PM Schedule
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Schedule List */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Schedules</h2>

          {schedulesLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : scheduleList.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <Settings size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">No PM schedules yet.</p>
              <p className="text-xs text-gray-400 mt-1">Create a schedule to define maintenance tasks for your equipment.</p>
            </div>
          ) : (
            scheduleList.map((schedule) => (
              <div
                key={schedule.id}
                onClick={() => setSelectedScheduleId(schedule.id)}
                className={`bg-white rounded-xl border p-4 cursor-pointer transition-all duration-200 ${
                  selectedScheduleId === schedule.id
                    ? 'border-brand-500 ring-2 ring-brand-100 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{schedule.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{getModelName(schedule.equipment_model_id)}</p>
                    {schedule.application_type && (
                      <span className="inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {schedule.application_type}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); openEditSchedule(schedule); }} className="p-1 rounded text-gray-400 hover:text-brand-600">
                      <Pencil size={14} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(schedule); setDeleteType('schedule'); }} className="p-1 rounded text-gray-400 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                    <ChevronRight size={16} className={`text-gray-400 transition-transform ${selectedScheduleId === schedule.id ? 'rotate-90' : ''}`} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Tasks View */}
        <div className="lg:col-span-3">
          {!selectedScheduleId ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Cog size={48} className="mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-500">Select a PM Schedule</h3>
              <p className="text-sm text-gray-400 mt-1">Choose a schedule to view and manage its maintenance tasks.</p>
            </div>
          ) : scheduleQuery.isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selectedSchedule?.name} - Tasks</h2>
                  <p className="text-sm text-gray-500">{tasks.length} maintenance tasks</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Preset Buttons */}
                  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                    <span className="text-xs font-medium text-gray-500 px-2">Presets:</span>
                    <button onClick={() => applyPreset(1)} className="px-2 py-1 rounded text-xs font-medium text-gray-700 hover:bg-white hover:shadow-sm transition-all">
                      OEM (1x)
                    </button>
                    <button onClick={() => applyPreset(1.3)} className="px-2 py-1 rounded text-xs font-medium text-blue-700 hover:bg-white hover:shadow-sm transition-all">
                      Optimized (1.3x)
                    </button>
                    <button onClick={() => applyPreset(1.6)} className="px-2 py-1 rounded text-xs font-medium text-orange-700 hover:bg-white hover:shadow-sm transition-all">
                      Aggressive (1.6x)
                    </button>
                  </div>
                  <button onClick={openAddTask} className="btn btn-primary btn-sm">
                    <Plus size={14} className="mr-1" /> Add Task
                  </button>
                </div>
              </div>

              {tasks.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                  <Wrench size={40} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm text-gray-500">No tasks in this schedule yet.</p>
                  <p className="text-xs text-gray-400 mt-1">Add maintenance tasks to build your PM plan.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`bg-white rounded-xl border p-4 transition-all ${
                        task.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900 text-sm truncate">{task.name}</h3>
                            {task.is_locked && <Lock size={12} className="text-amber-500 flex-shrink-0" />}
                          </div>
                          {task.description && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{task.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                          <button
                            onClick={() => toggleTaskEnabled(task)}
                            className="p-1 rounded"
                            title={task.enabled ? 'Disable' : 'Enable'}
                          >
                            {task.enabled ? (
                              <ToggleRight size={20} className="text-green-500" />
                            ) : (
                              <ToggleLeft size={20} className="text-gray-400" />
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setEditTask(task);
                              setTaskForm({
                                name: task.name || '',
                                interval_hours: task.interval_hours || '',
                                interval_months: task.interval_months || '',
                                labor_hours: task.labor_hours || '',
                                skill_level: task.skill_level || 'intermediate',
                                is_one_time: task.is_one_time || false,
                                is_automated: task.is_automated || false,
                                is_locked: task.is_locked || false,
                                enabled: task.enabled !== false,
                                description: task.description || '',
                              });
                              setTaskModalOpen(true);
                            }}
                            className="p-1 rounded text-gray-400 hover:text-brand-600"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => { setDeleteConfirm(task); setDeleteType('task'); }}
                            className="p-1 rounded text-gray-400 hover:text-red-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Task Details */}
                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div className="bg-gray-50 rounded-lg p-2">
                          <span className="text-gray-500">Interval (hrs)</span>
                          {editingField === `${task.id}-hours` ? (
                            <input
                              type="number"
                              className="input mt-0.5 text-xs py-1"
                              defaultValue={task.interval_hours}
                              autoFocus
                              onBlur={(e) => handleInlineEdit(task, 'interval_hours', e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleInlineEdit(task, 'interval_hours', e.target.value); if (e.key === 'Escape') setEditingField(null); }}
                            />
                          ) : (
                            <div
                              className={`font-semibold text-gray-900 mt-0.5 ${!task.is_locked ? 'cursor-pointer hover:text-brand-600' : ''}`}
                              onClick={() => !task.is_locked && setEditingField(`${task.id}-hours`)}
                            >
                              {task.interval_hours ? new Intl.NumberFormat('en-US').format(task.interval_hours) : '-'}
                            </div>
                          )}
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2">
                          <span className="text-gray-500">Interval (months)</span>
                          <div className="font-semibold text-gray-900 mt-0.5">{task.interval_months || '-'}</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2">
                          <span className="text-gray-500">Labor Hours</span>
                          {editingField === `${task.id}-labor` ? (
                            <input
                              type="number"
                              step="0.5"
                              className="input mt-0.5 text-xs py-1"
                              defaultValue={task.labor_hours}
                              autoFocus
                              onBlur={(e) => handleInlineEdit(task, 'labor_hours', e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleInlineEdit(task, 'labor_hours', e.target.value); if (e.key === 'Escape') setEditingField(null); }}
                            />
                          ) : (
                            <div
                              className="font-semibold text-gray-900 mt-0.5 cursor-pointer hover:text-brand-600"
                              onClick={() => setEditingField(`${task.id}-labor`)}
                            >
                              {task.labor_hours || '-'}
                            </div>
                          )}
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2">
                          <span className="text-gray-500">Skill Level</span>
                          <div className="mt-0.5">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${skillBadge[task.skill_level] || skillBadge.intermediate}`}>
                              {task.skill_level || 'intermediate'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Flags */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {task.is_one_time && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            <Clock size={10} /> One-time
                          </span>
                        )}
                        {task.is_automated && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800">
                            <Zap size={10} /> Automated
                          </span>
                        )}
                        {task.is_locked && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
                            <Lock size={10} /> Locked
                          </span>
                        )}
                      </div>

                      {/* Task Parts */}
                      <div className="border-t border-gray-100 pt-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-gray-500">Parts Required</span>
                          <button
                            onClick={() => { setActiveTaskId(task.id); setPartForm(emptyPartForm); setPartModalOpen(true); }}
                            className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                          >
                            + Add Part
                          </button>
                        </div>
                        {(task.parts || []).length === 0 ? (
                          <p className="text-xs text-gray-400 italic">No parts specified</p>
                        ) : (
                          <div className="space-y-1">
                            {(task.parts || []).map((part) => (
                              <div key={part.id} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1.5">
                                <div>
                                  <span className="font-medium text-gray-800">{part.part_number}</span>
                                  {part.description && <span className="text-gray-500 ml-1">- {part.description}</span>}
                                  <span className="text-gray-400 ml-1">x{part.quantity}</span>
                                </div>
                                <button
                                  onClick={() => deletePartMutation.mutate(part.id)}
                                  className="p-0.5 rounded text-gray-400 hover:text-red-500"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Schedule Modal */}
      <Modal open={scheduleModalOpen} onClose={() => { setScheduleModalOpen(false); setEditSchedule(null); }} title={editSchedule ? 'Edit PM Schedule' : 'New PM Schedule'} size="md">
        <form onSubmit={handleScheduleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Schedule Name *</label>
            <input type="text" className="input" value={scheduleForm.name} onChange={(e) => setScheduleForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Equipment Model *</label>
            <select className="input" value={scheduleForm.equipment_model_id} onChange={(e) => setScheduleForm((f) => ({ ...f, equipment_model_id: e.target.value }))} required>
              <option value="">Select model...</option>
              {equipmentList.map((eq) => (
                <option key={eq.id} value={eq.id}>{eq.model_number}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Application Type</label>
            <select className="input" value={scheduleForm.application_type} onChange={(e) => setScheduleForm((f) => ({ ...f, application_type: e.target.value }))}>
              {APPLICATION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea className="input" rows={2} value={scheduleForm.description} onChange={(e) => setScheduleForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => { setScheduleModalOpen(false); setEditSchedule(null); }} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={createScheduleMutation.isPending || updateScheduleMutation.isPending} className="btn btn-primary">
              {(createScheduleMutation.isPending || updateScheduleMutation.isPending) ? 'Saving...' : editSchedule ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Task Modal */}
      <Modal open={taskModalOpen} onClose={() => { setTaskModalOpen(false); setEditTask(null); }} title={editTask ? 'Edit Task' : 'Add Task'} size="md">
        <form onSubmit={handleTaskSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Task Name *</label>
            <input type="text" className="input" value={taskForm.name} onChange={(e) => setTaskForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Interval (Hours)</label>
              <input type="number" className="input" value={taskForm.interval_hours} onChange={(e) => setTaskForm((f) => ({ ...f, interval_hours: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Interval (Months)</label>
              <input type="number" className="input" value={taskForm.interval_months} onChange={(e) => setTaskForm((f) => ({ ...f, interval_months: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Labor Hours</label>
              <input type="number" step="0.5" className="input" value={taskForm.labor_hours} onChange={(e) => setTaskForm((f) => ({ ...f, labor_hours: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Skill Level</label>
              <select className="input" value={taskForm.skill_level} onChange={(e) => setTaskForm((f) => ({ ...f, skill_level: e.target.value }))}>
                {SKILL_LEVELS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea className="input" rows={2} value={taskForm.description} onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="rounded border-gray-300 text-brand-500" checked={taskForm.is_one_time} onChange={(e) => setTaskForm((f) => ({ ...f, is_one_time: e.target.checked }))} />
              <span className="text-sm text-gray-700">One-time task</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="rounded border-gray-300 text-brand-500" checked={taskForm.is_automated} onChange={(e) => setTaskForm((f) => ({ ...f, is_automated: e.target.checked }))} />
              <span className="text-sm text-gray-700">Automated</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="rounded border-gray-300 text-brand-500" checked={taskForm.is_locked} onChange={(e) => setTaskForm((f) => ({ ...f, is_locked: e.target.checked }))} />
              <span className="text-sm text-gray-700">Locked (no interval editing)</span>
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => { setTaskModalOpen(false); setEditTask(null); }} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={addTaskMutation.isPending || updateTaskMutation.isPending} className="btn btn-primary">
              {(addTaskMutation.isPending || updateTaskMutation.isPending) ? 'Saving...' : editTask ? 'Update Task' : 'Add Task'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Part Modal */}
      <Modal open={partModalOpen} onClose={() => setPartModalOpen(false)} title="Add Part to Task" size="sm">
        <form onSubmit={handlePartSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Part Number *</label>
            <input type="text" className="input" value={partForm.part_number} onChange={(e) => setPartForm((f) => ({ ...f, part_number: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input type="text" className="input" value={partForm.description} onChange={(e) => setPartForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input type="number" className="input" min="1" value={partForm.quantity} onChange={(e) => setPartForm((f) => ({ ...f, quantity: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost</label>
              <input type="number" step="0.01" className="input" value={partForm.unit_cost} onChange={(e) => setPartForm((f) => ({ ...f, unit_cost: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => setPartModalOpen(false)} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={addPartMutation.isPending} className="btn btn-primary">
              {addPartMutation.isPending ? 'Adding...' : 'Add Part'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title={`Delete ${deleteType === 'schedule' ? 'Schedule' : 'Task'}`} size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
            <p className="text-sm text-gray-700">
              Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>?
              {deleteType === 'schedule' && ' All tasks in this schedule will be removed.'}
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteConfirm(null)} className="btn btn-ghost">Cancel</button>
            <button
              onClick={() => {
                if (deleteType === 'schedule') deleteScheduleMutation.mutate(deleteConfirm.id);
                else deleteTaskMutation.mutate(deleteConfirm.id);
              }}
              disabled={deleteScheduleMutation.isPending || deleteTaskMutation.isPending}
              className="btn bg-red-600 text-white hover:bg-red-700"
            >
              {(deleteScheduleMutation.isPending || deleteTaskMutation.isPending) ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
