const BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

function get(url) { return request(url); }
function post(url, data) { return request(url, { method: 'POST', body: JSON.stringify(data) }); }
function put(url, data) { return request(url, { method: 'PUT', body: JSON.stringify(data) }); }
function del(url) { return request(url, { method: 'DELETE' }); }

async function uploadFile(url, file, extraFields = {}) {
  const form = new FormData();
  form.append('file', file);
  Object.entries(extraFields).forEach(([k, v]) => form.append(k, v));
  const res = await fetch(`${BASE}${url}`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Upload failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Equipment
  equipment: {
    list: (params) => get(`/equipment${params ? '?' + new URLSearchParams(params) : ''}`),
    get: (id) => get(`/equipment/${id}`),
    create: (data) => post('/equipment', data),
    update: (id, data) => put(`/equipment/${id}`, data),
    delete: (id) => del(`/equipment/${id}`),
  },

  // Price Lists
  priceLists: {
    list: () => get('/pricelists'),
    get: (id) => get(`/pricelists/${id}`),
    items: (id, params) => get(`/pricelists/${id}/items${params ? '?' + new URLSearchParams(params) : ''}`),
    upload: (file, meta) => uploadFile('/pricelists/upload', file, meta),
    update: (id, data) => put(`/pricelists/${id}`, data),
    updateItem: (id, itemId, data) => put(`/pricelists/${id}/items/${itemId}`, data),
    addItem: (id, data) => post(`/pricelists/${id}/items`, data),
    delete: (id) => del(`/pricelists/${id}`),
  },

  // Fleets
  fleet: {
    list: () => get('/fleet'),
    get: (id) => get(`/fleet/${id}`),
    create: (data) => post('/fleet', data),
    update: (id, data) => put(`/fleet/${id}`, data),
    delete: (id) => del(`/fleet/${id}`),
    addUnit: (id, data) => post(`/fleet/${id}/units`, data),
    updateUnit: (id, unitId, data) => put(`/fleet/${id}/units/${unitId}`, data),
    deleteUnit: (id, unitId) => del(`/fleet/${id}/units/${unitId}`),
  },

  // Maintenance
  maintenance: {
    listSchedules: () => get('/maintenance/schedules'),
    getSchedule: (id) => get(`/maintenance/schedules/${id}`),
    createSchedule: (data) => post('/maintenance/schedules', data),
    updateSchedule: (id, data) => put(`/maintenance/schedules/${id}`, data),
    deleteSchedule: (id) => del(`/maintenance/schedules/${id}`),
    addTask: (scheduleId, data) => post(`/maintenance/schedules/${scheduleId}/tasks`, data),
    updateTask: (taskId, data) => put(`/maintenance/tasks/${taskId}`, data),
    deleteTask: (taskId) => del(`/maintenance/tasks/${taskId}`),
    addTaskPart: (taskId, data) => post(`/maintenance/tasks/${taskId}/parts`, data),
    deleteTaskPart: (id) => del(`/maintenance/task-parts/${id}`),
  },

  // Scenarios
  scenarios: {
    list: () => get('/scenarios'),
    get: (id) => get(`/scenarios/${id}`),
    create: (data) => post('/scenarios', data),
    update: (id, data) => put(`/scenarios/${id}`, data),
    delete: (id) => del(`/scenarios/${id}`),
    saveSnapshot: (id) => post(`/scenarios/${id}/snapshot`),
    snapshots: (id) => get(`/scenarios/${id}/snapshots`),
  },

  // Analysis
  analysis: {
    calculate: (scenarioId) => post('/analysis/calculate', { scenario_id: scenarioId }),
    compare: (scenarioIds) => post('/analysis/compare', { scenario_ids: scenarioIds }),
    quickCalc: (params) => post('/analysis/quick-calculate', params),
  }
};
