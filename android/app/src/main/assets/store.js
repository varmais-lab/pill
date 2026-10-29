'use strict';

// Offline Android data adapter; native private storage is authoritative on Android.
(() => {
  const key = 'tablet-reminder-demo-v1';
  const demoToken = 'tablet-demo-session';
  const seed = {
    patients: [
      { id: 'p1', name: 'Lakshmi', age: 66, relation: 'Mother', color: '#ffe8d8' },
      { id: 'p2', name: 'Ravi', age: 42, relation: 'Self', color: '#e2e9fc' }
    ],
    medicines: [
      { id: 'm1', patientId: 'p1', name: 'Demo Vitamin', type: 'Tablet', dose: '1 tablet', times: ['08:00', '20:00'], instructions: 'After food', active: true },
      { id: 'm2', patientId: 'p1', name: 'Demo Eye Drops', type: 'Eye drops', dose: '1 drop (example only)', times: ['09:00', '21:00'], instructions: 'Follow doctor instructions', active: true },
      { id: 'm3', patientId: 'p2', name: 'Demo Supplement', type: 'Tablet', dose: '1 tablet', times: ['13:00'], instructions: 'Demo schedule', active: true }
    ],
    logs: []
  };
  const copy = value => JSON.parse(JSON.stringify(value));
  let memory = copy(seed);
  function read() {
    if (window.TabletAndroid) {
      const raw = window.TabletAndroid.loadData();
      if (raw) memory = JSON.parse(raw);
      else save(memory);
      return copy(memory);
    }
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved && ['patients', 'medicines', 'logs'].every(name => Array.isArray(saved[name]))) memory = saved;
    } catch (_) {}
    return copy(memory);
  }
  function save(value) {
    if (window.TabletAndroid && !window.TabletAndroid.saveData(JSON.stringify(value))) throw Error('Could not save data on this phone');
    memory = copy(value);
    if (!window.TabletAndroid) localStorage.setItem(key, JSON.stringify(value));
    if (window.refreshAndroidStatus) setTimeout(window.refreshAndroidStatus, 0);
  }
  const str = (value, max = 100) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const time = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const id = () => typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join('');
  function guard() {
    if (sessionStorage.getItem('tablet_admin') !== demoToken) throw Error('Admin login required');
  }
  window.tabletDemoApi = async (route, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : {};
    if (route === '/api/health') return { ok: true, mode: 'browser-demo' };
    if (route === '/api/login' && method === 'POST') {
      if (body.password !== 'demo123') throw Error('Incorrect password');
      return { token: demoToken };
    }
    if (route === '/api/data' && method === 'GET') return read();
    const data = read();
    if (route === '/api/patients' && method === 'POST') {
      guard();
      if (!str(body.name)) throw Error('Patient name required');
      const patient = { id: id(), name: str(body.name), relation: str(body.relation, 40) || 'Family', age: Math.max(0, Math.min(120, Number(body.age) || 0)), color: '#e3f1e8' };
      data.patients.push(patient);
      save(data);
      return copy(patient);
    }
    if (route === '/api/medicines' && method === 'POST') {
      guard();
      if (!data.patients.some(patient => patient.id === body.patientId) || !str(body.name) || !Array.isArray(body.times) || !body.times.length || body.times.length > 12 || !body.times.every(time)) {
        throw Error('Patient, medicine name, valid times required');
      }
      const medicine = { id: id(), patientId: body.patientId, name: str(body.name), type: str(body.type, 30) || 'Tablet', dose: str(body.dose, 70) || 'As prescribed', times: [...new Set(body.times)].sort(), instructions: str(body.instructions, 160), active: true };
      data.medicines.push(medicine);
      save(data);
      return copy(medicine);
    }
    if (route.startsWith('/api/medicines/') && method === 'DELETE') {
      guard();
      const medicineId = decodeURIComponent(route.split('/').pop());
      data.medicines = data.medicines.filter(medicine => medicine.id !== medicineId);
      save(data);
      return { ok: true };
    }
    if (route === '/api/logs' && method === 'POST') {
      if (!data.medicines.some(medicine => medicine.id === body.medicineId) || !time(body.time) || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || !['taken', 'skipped', 'snoozed'].includes(body.status)) {
        throw Error('Invalid entry');
      }
      data.logs = data.logs.filter(log => !(log.medicineId === body.medicineId && log.time === body.time && log.date === body.date));
      const log = { id: id(), medicineId: body.medicineId, date: body.date, time: body.time, status: body.status, recordedAt: new Date().toISOString() };
      data.logs.push(log);
      save(data);
      return copy(log);
    }
    if (route === '/api/reset' && method === 'POST') {
      guard();
      save(seed);
      if (window.TabletAndroid) window.TabletAndroid.resetReminders();
      return { ok: true };
    }
    throw Error('Unknown demo action');
  };
})();
