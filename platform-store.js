const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dbPath = path.join(__dirname, 'coaching.db');
const db = new DatabaseSync(dbPath);
db.exec(`
CREATE TABLE IF NOT EXISTS site_content (
  id INTEGER PRIMARY KEY CHECK(id=1),
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workout_sessions (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  day_index INTEGER NOT NULL,
  day_title TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  snapshot TEXT NOT NULL,
  results TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_client ON workout_sessions(client_id, started_at DESC);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EGP',
  status TEXT NOT NULL DEFAULT 'paid',
  paid_at TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(paid_at DESC);
CREATE TABLE IF NOT EXISTS weekly_checkins (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  weight REAL,
  adherence INTEGER NOT NULL,
  sleep_quality INTEGER NOT NULL,
  energy INTEGER NOT NULL,
  hunger INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_checkins_client ON weekly_checkins(client_id, submitted_at DESC);
`);

function clean(v, max = 1000) {
  return String(v ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
}
function contentGet() {
  const row = db.prepare('SELECT payload,updated_at FROM site_content WHERE id=1').get();
  if (!row) return { exists: false, content: null, updatedAt: null };
  try { return { exists: true, content: JSON.parse(row.payload), updatedAt: row.updated_at } }
  catch { return { exists: false, content: null, updatedAt: null } }
}
function contentSave(content) {
  const updatedAt = new Date().toISOString();
  const payload = JSON.stringify(materializeImages(content && typeof content === 'object' ? content : {}));
  db.prepare(`INSERT INTO site_content(id,payload,updated_at) VALUES(1,?,?)
    ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`).run(payload, updatedAt);
  return { content: JSON.parse(payload), updatedAt };
}
function materializeImages(value) {
  if (Array.isArray(value)) return value.map(materializeImages);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materializeImages(item)]));
  if (typeof value !== 'string' || !value.startsWith('data:image/')) return value;
  const match = value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return '';
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 5000000) return '';
  const dir = path.join(__dirname, 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1], name = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(dir, name), bytes);
  return `/uploads/${name}`;
}
function backup() {
  const dir = path.join(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  try { db.exec('PRAGMA wal_checkpoint(FULL)') } catch {}
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(dir, `coaching-${stamp}.db`);
  fs.copyFileSync(dbPath, target);
  const reviews = path.join(__dirname, 'reviews.json');
  if (fs.existsSync(reviews)) fs.copyFileSync(reviews, path.join(dir, `reviews-${stamp}.json`));
  const uploads = path.join(__dirname, 'uploads');
  if (fs.existsSync(uploads)) fs.cpSync(uploads, path.join(dir, `uploads-${stamp}`), { recursive: true });
  return path.basename(target);
}
function startSession(client, dayIndex) {
  const day = client.workoutDays?.[dayIndex];
  if (!day) return null;
  const snapshot = {
    title: clean(day.title, 100),
    exercises: (day.exercises || []).map((x, index) => ({
      index, name: clean(x.name, 100), sets: clean(x.sets, 20), reps: clean(x.reps, 20),
      rest: clean(x.rest, 30), notes: clean(x.notes, 500), image: clean(x.image, 5000000),
      video: clean(x.video, 500), trackingMode: x.trackingMode === 'sets' ? 'sets' : 'summary'
    }))
  };
  const results = snapshot.exercises.map(x => ({
    exerciseIndex: x.index, completed: false, weight: '', reps: '', rpe: '', notes: '',
    sets: x.trackingMode === 'sets' ? Array.from({ length: Math.max(1, Math.min(12, Number.parseInt(x.sets) || 1)) }, (_, i) => ({ set: i + 1, weight: '', reps: '', rpe: '' })) : []
  }));
  const previousRows = db.prepare('SELECT snapshot,results FROM workout_sessions WHERE client_id=? AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 20').all(client.id);
  for (const result of results) {
    const exercise = snapshot.exercises[result.exerciseIndex];
    for (const row of previousRows) {
      const oldSnapshot = JSON.parse(row.snapshot), oldResults = JSON.parse(row.results), oldIndex = oldSnapshot.exercises.findIndex(x => x.name === exercise.name);
      if (oldIndex < 0 || !oldResults[oldIndex]) continue;
      const old = oldResults[oldIndex];
      result.weight = old.weight || ''; result.reps = old.reps || ''; result.rpe = old.rpe || '';
      if (result.sets.length && old.sets?.length) result.sets = result.sets.map((set, index) => ({ ...set, weight: old.sets[index]?.weight || '', reps: old.sets[index]?.reps || '', rpe: old.sets[index]?.rpe || '' }));
      break;
    }
  }
  const session = { id: crypto.randomUUID(), clientId: client.id, dayIndex, dayTitle: snapshot.title, startedAt: new Date().toISOString(), completedAt: null, notes: '', snapshot, results };
  db.prepare('INSERT INTO workout_sessions(id,client_id,day_index,day_title,started_at,completed_at,notes,snapshot,results) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(session.id, session.clientId, dayIndex, session.dayTitle, session.startedAt, null, '', JSON.stringify(snapshot), JSON.stringify(results));
  return session;
}
function sessionRow(row) {
  return row ? { id: row.id, clientId: row.client_id, dayIndex: row.day_index, dayTitle: row.day_title, startedAt: row.started_at, completedAt: row.completed_at, notes: row.notes, snapshot: JSON.parse(row.snapshot), results: JSON.parse(row.results) } : null;
}
function getSession(id) { return sessionRow(db.prepare('SELECT * FROM workout_sessions WHERE id=?').get(id)) }
function updateSession(id, clientId, input, admin = false) {
  const session = getSession(id);
  if (!session || (!admin && session.clientId !== clientId)) return { error: 'not_found' };
  if (!admin && Date.now() - new Date(session.startedAt).getTime() > 86400000) return { error: 'locked' };
  if (Array.isArray(input.results)) session.results = input.results.slice(0, session.snapshot.exercises.length).map((r, i) => ({
    exerciseIndex: i, completed: Boolean(r.completed), weight: clean(r.weight, 30), reps: clean(r.reps, 30),
    rpe: clean(r.rpe, 10), notes: clean(r.notes, 500),
    sets: Array.isArray(r.sets) ? r.sets.slice(0, 12).map((s, n) => ({ set: n + 1, weight: clean(s.weight, 30), reps: clean(s.reps, 20), rpe: clean(s.rpe, 10) })) : []
  }));
  if (input.notes !== undefined) session.notes = clean(input.notes, 1000);
  if (input.complete === true && !session.completedAt) session.completedAt = new Date().toISOString();
  db.prepare('UPDATE workout_sessions SET completed_at=?,notes=?,results=? WHERE id=?').run(session.completedAt, session.notes, JSON.stringify(session.results), id);
  return session;
}
function clientHistory(clientId, limit = 30) {
  return db.prepare('SELECT * FROM workout_sessions WHERE client_id=? ORDER BY started_at DESC LIMIT ?').all(clientId, Math.min(100, limit)).map(sessionRow);
}
function checkinRow(row) {
  return row ? { id: row.id, clientId: row.client_id, submittedAt: row.submitted_at, weight: row.weight, adherence: row.adherence, sleepQuality: row.sleep_quality, energy: row.energy, hunger: row.hunger, notes: row.notes } : null;
}
function clientCheckins(clientId, limit = 12) {
  return db.prepare('SELECT * FROM weekly_checkins WHERE client_id=? ORDER BY submitted_at DESC LIMIT ?').all(clientId, Math.min(100, limit)).map(checkinRow);
}
function checkinSave(clientId, input) {
  const rating = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5 ? Number(value) : null;
  const adherence = Number(input.adherence), sleepQuality = rating(input.sleepQuality), energy = rating(input.energy), hunger = rating(input.hunger);
  const weight = input.weight === '' || input.weight === undefined ? null : Number(input.weight);
  if (!Number.isInteger(adherence) || adherence < 0 || adherence > 100 || sleepQuality === null || energy === null || hunger === null || (weight !== null && (!Number.isFinite(weight) || weight < 20 || weight > 500))) return null;
  const checkin = { id: crypto.randomUUID(), clientId, submittedAt: new Date().toISOString(), weight: weight === null ? null : Math.round(weight * 10) / 10, adherence, sleepQuality, energy, hunger, notes: clean(input.notes, 1000) };
  db.prepare('INSERT INTO weekly_checkins(id,client_id,submitted_at,weight,adherence,sleep_quality,energy,hunger,notes) VALUES(?,?,?,?,?,?,?,?,?)').run(checkin.id, checkin.clientId, checkin.submittedAt, checkin.weight, checkin.adherence, checkin.sleepQuality, checkin.energy, checkin.hunger, checkin.notes);
  return checkin;
}
function dashboard(clients) {
  const now = Date.now(), week = now - 7 * 86400000;
  const sessions = db.prepare('SELECT * FROM workout_sessions ORDER BY started_at DESC LIMIT 100').all().map(sessionRow);
  const rows = clients.map(client => {
    const own = sessions.filter(s => s.clientId === client.id);
    const weekly = own.filter(s => new Date(s.startedAt).getTime() >= week && s.completedAt);
    const ends = client.subscriptionEndsAt ? new Date(client.subscriptionEndsAt).getTime() : null;
    return { id: client.id, name: client.name, phone: client.phone, subscriptionEndsAt: client.subscriptionEndsAt || null,
      status: ends && ends <= now ? 'expired' : ends && ends <= now + 7 * 86400000 ? 'expiring' : 'active',
      lastActivity: own[0]?.startedAt || null, completedThisWeek: weekly.length,
      plannedDays: client.workoutDays?.length || 0, adherence: client.workoutDays?.length ? Math.min(100, Math.round(weekly.length / client.workoutDays.length * 100)) : 0 };
  });
  return {
    totals: { clients: rows.length, active: rows.filter(x => x.status === 'active').length, expired: rows.filter(x => x.status === 'expired').length, expiring: rows.filter(x => x.status === 'expiring').length },
    clients: rows, recentSessions: sessions.slice(0, 20).map(s => ({ ...s, clientName: clients.find(c => c.id === s.clientId)?.name || 'عميل' }))
  };
}
function paymentRow(row) {
  return { id: row.id, clientId: row.client_id, clientName: row.client_name, planName: row.plan_name, amount: row.amount, currency: row.currency, status: row.status, paidAt: row.paid_at, notes: row.notes };
}
function paymentsList(limit = 200) {
  return db.prepare('SELECT * FROM payments ORDER BY paid_at DESC LIMIT ?').all(Math.min(500, limit)).map(paymentRow);
}
function paymentsSummary() {
  const rows = paymentsList(5000), now = new Date(), month = now.getUTCFullYear() + '-' + String(now.getUTCMonth() + 1).padStart(2, '0');
  const sum = (status, list = rows) => list.filter(x => !status || x.status === status).reduce((a, x) => a + Number(x.amount || 0), 0);
  return { totals: { all: sum('paid'), pending: sum('pending'), refunded: sum('refunded'), month: sum('paid', rows.filter(x => String(x.paidAt).slice(0, 7) === month)) }, payments: rows };
}
function paymentSave(input, clients) {
  const client = clients.find(x => x.id === input.clientId);
  const amount = Number(input.amount), status = ['paid', 'pending', 'refunded'].includes(input.status) ? input.status : 'paid';
  if (!client || !Number.isFinite(amount) || amount < 0 || amount > 100000000) return null;
  const payment = { id: crypto.randomUUID(), clientId: client.id, clientName: clean(client.name, 100), planName: clean(input.planName || 'اشتراك', 100), amount: Math.round(amount * 100) / 100, currency: 'EGP', status, paidAt: input.paidAt && !Number.isNaN(Date.parse(input.paidAt)) ? new Date(input.paidAt).toISOString() : new Date().toISOString(), notes: clean(input.notes, 500) };
  db.prepare('INSERT INTO payments(id,client_id,client_name,plan_name,amount,currency,status,paid_at,notes) VALUES(?,?,?,?,?,?,?,?,?)').run(payment.id, payment.clientId, payment.clientName, payment.planName, payment.amount, payment.currency, payment.status, payment.paidAt, payment.notes);
  return payment;
}
function paymentUpdate(id, input) {
  const current = db.prepare('SELECT * FROM payments WHERE id=?').get(id);
  if (!current) return null;
  const status = ['paid', 'pending', 'refunded'].includes(input.status) ? input.status : current.status;
  const amount = input.amount === undefined ? current.amount : Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) return null;
  db.prepare('UPDATE payments SET amount=?,status=?,notes=? WHERE id=?').run(Math.round(amount * 100) / 100, status, clean(input.notes ?? current.notes, 500), id);
  return paymentRow(db.prepare('SELECT * FROM payments WHERE id=?').get(id));
}
function paymentDelete(id) { return db.prepare('DELETE FROM payments WHERE id=?').run(id).changes > 0 }

module.exports = { contentGet, contentSave, backup, startSession, getSession, updateSession, clientHistory, clientCheckins, checkinSave, dashboard, paymentsSummary, paymentSave, paymentUpdate, paymentDelete };
