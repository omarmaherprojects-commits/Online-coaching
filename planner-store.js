const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(path.join(__dirname, 'coaching.db'));
db.exec(`CREATE TABLE IF NOT EXISTS planner_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL
)`);

const defaults = {
  exercises: [
    { id: crypto.randomUUID(), name: 'بنش بريس', image: '', video: '', sets: '4', reps: '8-10', weight: '', rest: '90 ثانية', notes: '' },
    { id: crypto.randomUUID(), name: 'سكوات', image: '', video: '', sets: '4', reps: '8-12', weight: '', rest: '120 ثانية', notes: '' },
    { id: crypto.randomUUID(), name: 'لات بول داون', image: '', video: '', sets: '3', reps: '10-12', weight: '', rest: '60 ثانية', notes: '' }
  ],
  foods: [
    { id: crypto.randomUUID(), name: 'صدور فراخ', image: '', unit: 'جم', amount: '200', notes: '' },
    { id: crypto.randomUUID(), name: 'أرز أبيض', image: '', unit: 'جم', amount: '150', notes: '' },
    { id: crypto.randomUUID(), name: 'بيض', image: '', unit: 'بيضة', amount: '3', notes: '' }
  ],
  clients: [],
  workoutTemplates: [],
  foodTemplates: []
};

if (!db.prepare('SELECT 1 FROM planner_state WHERE id=1').get()) {
  db.prepare('INSERT INTO planner_state(id,payload) VALUES(1,?)').run(JSON.stringify(defaults));
}

function read() {
  try {
    const state = JSON.parse(db.prepare('SELECT payload FROM planner_state WHERE id=1').get().payload);
    if (!Array.isArray(state.workoutTemplates)) state.workoutTemplates = (state.templates || []).filter(x => Array.isArray(x.workoutDays) && x.workoutDays.length).map(x => ({ id: x.id, name: x.name, workoutDays: x.workoutDays }));
    if (!Array.isArray(state.foodTemplates)) state.foodTemplates = (state.templates || []).filter(x => Array.isArray(x.nutrition) && x.nutrition.length).map(x => ({ id: x.id, name: x.name, nutrition: x.nutrition }));
    return state;
  }
  catch { return structuredClone(defaults) }
}
function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(pin), salt, 32).toString('hex') };
}
function verifyPin(pin, salt, expected) {
  const actual = crypto.scryptSync(String(pin), salt, 32);
  const target = Buffer.from(expected || '', 'hex');
  return actual.length === target.length && crypto.timingSafeEqual(actual, target);
}
function cleanText(v, max = 1000) { return String(v || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max) }
function imageValue(value) {
  const raw = String(value || '');
  if (!raw.startsWith('data:image/')) return cleanText(raw, 500);
  const match = raw.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return '';
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 5000000) return '';
  const dir = path.join(__dirname, 'uploads'); fs.mkdirSync(dir, { recursive: true });
  const name = `${crypto.randomUUID()}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
  fs.writeFileSync(path.join(dir, name), bytes);
  return `/uploads/${name}`;
}
function sanitizeItem(item, type) {
  const base = { id: cleanText(item.id, 80) || crypto.randomUUID(), name: cleanText(item.name, 100), image: imageValue(item.image) };
  return type === 'exercise'
    ? { ...base, video: cleanText(item.video, 500), muscle: cleanText(item.muscle, 50), equipment: cleanText(item.equipment, 50), trackingMode: item.trackingMode === 'sets' ? 'sets' : 'summary', sets: cleanText(item.sets, 20), reps: cleanText(item.reps, 20), weight: cleanText(item.weight, 30), rest: cleanText(item.rest, 30), notes: cleanText(item.notes, 500) }
    : { ...base, unit: cleanText(item.unit, 30), amount: cleanText(item.amount, 30), calories: cleanText(item.calories, 20), protein: cleanText(item.protein, 20), carbs: cleanText(item.carbs, 20), fat: cleanText(item.fat, 20), notes: cleanText(item.notes, 500) };
}
function adminGet() {
  const state = read();
  return { ...state, clients: state.clients.map(({ pinHash, pinSalt, ...client }) => ({ ...client, pinSet: Boolean(pinHash), pin: '', renewalDays: '' })) };
}
function adminSave(input) {
  const previous = read();
  const oldById = new Map(previous.clients.map(x => [x.id, x]));
  const exercises = (input.exercises || []).map(x => sanitizeItem(x, 'exercise')).filter(x => x.name);
  const foods = (input.foods || []).map(x => sanitizeItem(x, 'food')).filter(x => x.name);
  const workoutTemplates = (input.workoutTemplates || []).map(raw => ({
    id: cleanText(raw.id, 80) || crypto.randomUUID(), name: cleanText(raw.name, 100),
    workoutDays: (Array.isArray(raw.workoutDays) ? raw.workoutDays : []).slice(0, 7).map((day, index) => ({
      title: cleanText(day.title, 100) || `اليوم ${index + 1}`,
      exercises: (day.exercises || []).slice(0, 100).map(x => ({ ...x, name: cleanText(x.name, 100), image: imageValue(x.image), video: cleanText(x.video, 500), trackingMode: x.trackingMode === 'sets' ? 'sets' : 'summary' })).filter(x => x.name)
    }))
  })).filter(x => x.name);
  const foodTemplates = (input.foodTemplates || []).map(raw => ({
    id: cleanText(raw.id, 80) || crypto.randomUUID(), name: cleanText(raw.name, 100),
    nutrition: Array.isArray(raw.nutrition) ? raw.nutrition.slice(0, 200).map(x => ({ ...x, name: cleanText(x.name, 100), image: imageValue(x.image), notes: cleanText(x.notes, 500) })).filter(x => x.name) : []
  })).filter(x => x.name);
  const clients = (input.clients || []).map(raw => {
    const id = cleanText(raw.id, 80) || crypto.randomUUID();
    const old = oldById.get(id);
    const client = {
      id, token: cleanText(raw.token, 100) || old?.token || crypto.randomBytes(24).toString('hex'),
      name: cleanText(raw.name, 100), phone: cleanText(raw.phone, 40), goal: cleanText(raw.goal, 300),
      age: cleanText(raw.age, 3), height: cleanText(raw.height, 10), initialWeight: cleanText(raw.initialWeight, 10),
      injuries: cleanText(raw.injuries, 600), activityLevel: cleanText(raw.activityLevel, 50), dietaryPreferences: cleanText(raw.dietaryPreferences, 600),
      active: raw.active !== false,
      subscriptionEndsAt: old?.subscriptionEndsAt || cleanText(raw.subscriptionEndsAt, 40),
      workoutDays: (Array.isArray(raw.workoutDays) ? raw.workoutDays : (Array.isArray(raw.workout) && raw.workout.length ? [{ title: 'اليوم الأول', exercises: raw.workout }] : [])).slice(0,7).map((day,index)=>({title:cleanText(day.title,100)||`اليوم ${index+1}`,exercises:(day.exercises||[]).slice(0,100).map(x=>({...x,name:cleanText(x.name,100),image:imageValue(x.image),video:cleanText(x.video,500),trackingMode:x.trackingMode==='sets'?'sets':'summary'}))})),
      workout: [],
      nutrition: Array.isArray(raw.nutrition) ? raw.nutrition.slice(0,200).map(x=>({...x,name:cleanText(x.name,100),image:imageValue(x.image),notes:cleanText(x.notes,500)})) : []
    };
    const renewalDays = Math.floor(Number(raw.renewalDays));
    if (Number.isFinite(renewalDays) && renewalDays > 0) client.subscriptionEndsAt = new Date(Date.now() + renewalDays * 86400000).toISOString();
    if (String(raw.pin || '').length >= 4) {
      const secured = hashPin(raw.pin);
      client.pinSalt = secured.salt; client.pinHash = secured.hash;
    } else if (old?.pinHash) {
      client.pinSalt = old.pinSalt; client.pinHash = old.pinHash;
    } else {
      const secured = hashPin('1234'); client.pinSalt = secured.salt; client.pinHash = secured.hash;
    }
    return client;
  }).filter(x => x.name);
  db.prepare('UPDATE planner_state SET payload=? WHERE id=1').run(JSON.stringify({ exercises, foods, clients, workoutTemplates, foodTemplates }));
  return adminGet();
}
function clientAccess(token, pin) {
  const client = read().clients.find(x => x.token === token && x.active);
  if (!client || (client.subscriptionEndsAt && new Date(client.subscriptionEndsAt).getTime() <= Date.now()) || !verifyPin(pin, client.pinSalt, client.pinHash)) return null;
  const { pinHash, pinSalt, ...safe } = client;
  return safe;
}
function authenticateClient(token, pin) {
  const client = read().clients.find(x => x.token === token && x.active);
  if (!client || !verifyPin(pin, client.pinSalt, client.pinHash)) return { error: 'invalid' };
  if (client.subscriptionEndsAt && new Date(client.subscriptionEndsAt).getTime() <= Date.now()) return { error: 'expired', subscriptionEndsAt: client.subscriptionEndsAt };
  return { client };
}
function rawClients() { return read().clients }
function renewClient(id, days) {
  const state = read(), client = state.clients.find(x => x.id === id), amount = Math.floor(Number(days));
  if (!client || !Number.isFinite(amount) || amount < 1 || amount > 730) return null;
  const current = client.subscriptionEndsAt ? new Date(client.subscriptionEndsAt).getTime() : 0;
  client.subscriptionEndsAt = new Date(Math.max(Date.now(), current) + amount * 86400000).toISOString();
  db.prepare('UPDATE planner_state SET payload=? WHERE id=1').run(JSON.stringify(state));
  return { id: client.id, subscriptionEndsAt: client.subscriptionEndsAt };
}

function updateClientWeight(token, pin, dayIndex, exerciseIndex, weight) {
  const state = read();
  const client = state.clients.find(x => x.token === token && x.active);
  if (!client || (client.subscriptionEndsAt && new Date(client.subscriptionEndsAt).getTime() <= Date.now()) || !verifyPin(pin, client.pinSalt, client.pinHash)) return false;
  const days = Array.isArray(client.workoutDays) ? client.workoutDays : [];
  const exercise = days[dayIndex]?.exercises?.[exerciseIndex];
  if (!exercise) return false;
  exercise.weight = cleanText(weight, 30);
  db.prepare('UPDATE planner_state SET payload=? WHERE id=1').run(JSON.stringify(state));
  return true;
}

module.exports = { adminGet, adminSave, clientAccess, authenticateClient, rawClients, renewClient, updateClientWeight };
