/**
 * CEMS - College Event Management System
 * Aravali College of Engineering and Management
 *
 * Express backend with a JSON-file database (no native modules needed).
 * Run:  npm install && npm start
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

/* ------------------------------------------------------------------ */
/* Tiny JSON database                                                  */
/* ------------------------------------------------------------------ */
function daysFromNow(n, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function seedData() {
  return {
    nextEventId: 7,
    nextRegId: 1,
    events: [
      {
        id: 1, title: 'TechNova Hackathon 2026', category: 'Technical',
        date: daysFromNow(12, 9), venue: 'Main Campus Labs', capacity: 120,
        description: '24-hour coding marathon. Build real solutions in teams of up to 4 with mentors from the industry. Cash prizes and internship opportunities for winners.',
        organizer: 'Department of CSE', imageUrl: '', featured: true
      },
      {
        id: 2, title: 'Aravali Rang - Cultural Fest', category: 'Cultural',
        date: daysFromNow(20, 17), venue: 'Open Air Theatre', capacity: 400,
        description: 'An evening of music, dance, theatre and fashion. Open auditions for solo and group performances. Come celebrate the colours of Aravali.',
        organizer: 'Cultural Committee', imageUrl: '', featured: false
      },
      {
        id: 3, title: 'Inter-College Cricket Cup', category: 'Sports',
        date: daysFromNow(27, 8), venue: 'College Sports Ground', capacity: 150,
        description: 'T20 knockout tournament featuring 8 colleges of the region. Register your team squad or just come to cheer.',
        organizer: 'Sports Council', imageUrl: '', featured: false
      },
      {
        id: 4, title: 'AI & Machine Learning Workshop', category: 'Workshop',
        date: daysFromNow(6, 11), venue: 'Seminar Hall A', capacity: 60,
        description: 'Hands-on workshop covering neural networks, model training and deployment using Python. Laptops required. Certificate on completion.',
        organizer: 'AI Club', imageUrl: '', featured: false
      },
      {
        id: 5, title: 'Placement Prep Bootcamp', category: 'Career',
        date: daysFromNow(34, 10), venue: 'Auditorium', capacity: 250,
        description: 'Resume reviews, mock interviews and aptitude strategies led by alumni working at top companies.',
        organizer: 'Training & Placement Cell', imageUrl: '', featured: false
      },
      {
        id: 6, title: 'Robo Wars', category: 'Technical',
        date: daysFromNow(41, 10), venue: 'Mechanical Workshop', capacity: 48,
        description: 'Build a bot, enter the arena and battle. Weight classes: 8 kg and 15 kg. Rulebook shared after registration.',
        organizer: 'Robotics Society', imageUrl: '', featured: false
      }
    ],
    registrations: []
  };
}

let db;

function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    db = seedData();
    saveDb();
    return;
  }
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    console.error('Could not read db.json, starting with fresh seed data:', err.message);
    fs.copyFileSync(DB_FILE, DB_FILE + '.corrupt-' + Date.now());
    db = seedData();
    saveDb();
  }
}

function saveDb() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

loadDb();

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const CATEGORIES = ['Technical', 'Cultural', 'Sports', 'Workshop', 'Career', 'Other'];
const BRANCHES = ['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE', 'MBA', 'Other'];

function activeRegs(eventId) {
  return db.registrations.filter(r => r.eventId === eventId && r.status === 'confirmed');
}

function publicEvent(e) {
  const taken = activeRegs(e.id).length;
  return {
    ...e,
    registered: taken,
    seatsLeft: Math.max(0, e.capacity - taken),
    isPast: new Date(e.date).getTime() < Date.now()
  };
}

function makeTicketCode() {
  let code;
  do {
    code = 'ACEM-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  } while (db.registrations.some(r => r.ticketCode === code));
  return code;
}

const clean = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function validateEventBody(b) {
  const title = clean(b.title, 120);
  const category = CATEGORIES.includes(b.category) ? b.category : 'Other';
  const venue = clean(b.venue, 120);
  const description = clean(b.description, 1500);
  const organizer = clean(b.organizer, 120);
  const imageUrl = clean(b.imageUrl, 500);
  const capacity = parseInt(b.capacity, 10);
  const date = new Date(b.date);

  if (!title) return { error: 'Title is required.' };
  if (!venue) return { error: 'Venue is required.' };
  if (isNaN(date.getTime())) return { error: 'A valid date and time is required.' };
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000) {
    return { error: 'Capacity must be a number between 1 and 100000.' };
  }
  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
    return { error: 'Image URL must start with http:// or https://' };
  }
  return {
    value: {
      title, category, venue, description, organizer, imageUrl, capacity,
      date: date.toISOString(), featured: !!b.featured
    }
  };
}

/* ------------------------------------------------------------------ */
/* Admin sessions (in-memory tokens)                                   */
/* ------------------------------------------------------------------ */
const sessions = new Map(); // token -> expiry ms
const SESSION_MS = 8 * 60 * 60 * 1000;

function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const exp = sessions.get(token);
  if (!exp || exp < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Admin login required.' });
  }
  next();
}

// Very small rate limit on login attempts (per IP)
const loginAttempts = new Map();
function loginLimiter(req, res, next) {
  const key = req.ip;
  const now = Date.now();
  const rec = (loginAttempts.get(key) || []).filter(t => now - t < 10 * 60 * 1000);
  if (rec.length >= 10) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  }
  rec.push(now);
  loginAttempts.set(key, rec);
  next();
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */
const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- Public API ---------- */
app.get('/api/meta', (req, res) => {
  res.json({ categories: CATEGORIES, branches: BRANCHES });
});

app.get('/api/events', (req, res) => {
  const list = db.events
    .map(publicEvent)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  res.json(list);
});

app.get('/api/events/:id', (req, res) => {
  const ev = db.events.find(e => e.id === Number(req.params.id));
  if (!ev) return res.status(404).json({ error: 'Event not found.' });
  res.json(publicEvent(ev));
});

app.post('/api/register', (req, res) => {
  const b = req.body || {};
  const eventId = Number(b.eventId);
  const name = clean(b.name, 100);
  const email = clean(b.email, 150).toLowerCase();
  const phone = clean(b.phone, 20);
  const rollNo = clean(b.rollNo, 40);
  const branch = BRANCHES.includes(b.branch) ? b.branch : 'Other';
  const year = clean(b.year, 10);

  const ev = db.events.find(e => e.id === eventId);
  if (!ev) return res.status(404).json({ error: 'Event not found.' });
  if (new Date(ev.date).getTime() < Date.now()) {
    return res.status(400).json({ error: 'This event has already taken place.' });
  }
  if (!name) return res.status(400).json({ error: 'Please enter your name.' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!/^[0-9+\-\s]{7,20}$/.test(phone)) {
    return res.status(400).json({ error: 'Please enter a valid phone number.' });
  }
  if (!rollNo) return res.status(400).json({ error: 'Please enter your roll number.' });

  const dup = db.registrations.find(
    r => r.eventId === eventId && r.email === email && r.status === 'confirmed'
  );
  if (dup) {
    return res.status(409).json({
      error: 'This email is already registered for this event.',
      ticketCode: dup.ticketCode
    });
  }
  if (activeRegs(eventId).length >= ev.capacity) {
    return res.status(409).json({ error: 'Sorry, this event is fully booked.' });
  }

  const reg = {
    id: db.nextRegId++,
    eventId, name, email, phone, rollNo, branch, year,
    ticketCode: makeTicketCode(),
    status: 'confirmed',
    checkedIn: false,
    createdAt: new Date().toISOString()
  };
  db.registrations.push(reg);
  saveDb();
  res.status(201).json({ registration: reg, event: publicEvent(ev) });
});

// Look up tickets by email
app.get('/api/my-registrations', (req, res) => {
  const email = clean(req.query.email, 150).toLowerCase();
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  const regs = db.registrations
    .filter(r => r.email === email)
    .map(r => ({ ...r, event: db.events.find(e => e.id === r.eventId) || null }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(regs);
});

// Cancel own registration (needs ticket code + email)
app.post('/api/cancel', (req, res) => {
  const code = clean(req.body && req.body.ticketCode, 30).toUpperCase();
  const email = clean(req.body && req.body.email, 150).toLowerCase();
  const reg = db.registrations.find(r => r.ticketCode === code && r.email === email);
  if (!reg) return res.status(404).json({ error: 'Registration not found.' });
  if (reg.status === 'cancelled') return res.json({ ok: true });
  reg.status = 'cancelled';
  reg.cancelledAt = new Date().toISOString();
  saveDb();
  res.json({ ok: true });
});

/* ---------- Admin API ---------- */
app.post('/api/admin/login', loginLimiter, (req, res) => {
  const given = Buffer.from(String((req.body && req.body.password) || ''));
  const real = Buffer.from(ADMIN_PASSWORD);
  const ok = given.length === real.length && crypto.timingSafeEqual(given, real);
  if (!ok) return res.status(401).json({ error: 'Incorrect password.' });
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_MS);
  res.json({ token });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  sessions.delete((req.get('authorization') || '').slice(7));
  res.json({ ok: true });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const confirmed = db.registrations.filter(r => r.status === 'confirmed');
  const upcoming = db.events.filter(e => new Date(e.date).getTime() >= Date.now());
  const byEvent = db.events.map(e => ({
    id: e.id, title: e.title, capacity: e.capacity, registered: activeRegs(e.id).length
  }));
  const byBranch = {};
  confirmed.forEach(r => { byBranch[r.branch] = (byBranch[r.branch] || 0) + 1; });
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    last7.push({
      day: key,
      count: confirmed.filter(r => r.createdAt.slice(0, 10) === key).length
    });
  }
  res.json({
    totalEvents: db.events.length,
    upcomingEvents: upcoming.length,
    totalRegistrations: confirmed.length,
    checkedIn: confirmed.filter(r => r.checkedIn).length,
    byEvent, byBranch, last7
  });
});

app.get('/api/admin/events', requireAdmin, (req, res) => {
  res.json(db.events.map(publicEvent).sort((a, b) => new Date(a.date) - new Date(b.date)));
});

app.post('/api/admin/events', requireAdmin, (req, res) => {
  const { value, error } = validateEventBody(req.body || {});
  if (error) return res.status(400).json({ error });
  const ev = { id: db.nextEventId++, ...value };
  db.events.push(ev);
  saveDb();
  res.status(201).json(publicEvent(ev));
});

app.put('/api/admin/events/:id', requireAdmin, (req, res) => {
  const ev = db.events.find(e => e.id === Number(req.params.id));
  if (!ev) return res.status(404).json({ error: 'Event not found.' });
  const { value, error } = validateEventBody(req.body || {});
  if (error) return res.status(400).json({ error });
  const taken = activeRegs(ev.id).length;
  if (value.capacity < taken) {
    return res.status(400).json({
      error: `Capacity cannot be lower than current registrations (${taken}).`
    });
  }
  Object.assign(ev, value);
  saveDb();
  res.json(publicEvent(ev));
});

app.delete('/api/admin/events/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const idx = db.events.findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Event not found.' });
  db.events.splice(idx, 1);
  db.registrations = db.registrations.filter(r => r.eventId !== id);
  saveDb();
  res.json({ ok: true });
});

app.get('/api/admin/registrations', requireAdmin, (req, res) => {
  const eventId = req.query.eventId ? Number(req.query.eventId) : null;
  const list = db.registrations
    .filter(r => (eventId ? r.eventId === eventId : true))
    .map(r => {
      const ev = db.events.find(e => e.id === r.eventId);
      return { ...r, eventTitle: ev ? ev.title : '(deleted event)' };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});

app.post('/api/admin/checkin', requireAdmin, (req, res) => {
  const code = clean(req.body && req.body.ticketCode, 30).toUpperCase();
  const reg = db.registrations.find(r => r.ticketCode === code);
  if (!reg) return res.status(404).json({ error: 'Ticket not found.' });
  if (reg.status !== 'confirmed') return res.status(400).json({ error: 'This ticket was cancelled.' });
  if (reg.checkedIn) {
    return res.status(409).json({ error: 'Already checked in.', registration: reg });
  }
  reg.checkedIn = true;
  reg.checkedInAt = new Date().toISOString();
  saveDb();
  const ev = db.events.find(e => e.id === reg.eventId);
  res.json({ registration: reg, eventTitle: ev ? ev.title : '' });
});

app.delete('/api/admin/registrations/:id', requireAdmin, (req, res) => {
  const idx = db.registrations.findIndex(r => r.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Registration not found.' });
  db.registrations.splice(idx, 1);
  saveDb();
  res.json({ ok: true });
});

// CSV export - token passed as query param so a plain link/download works
app.get('/api/admin/export.csv', (req, res) => {
  const exp = sessions.get(String(req.query.token || ''));
  if (!exp || exp < Date.now()) return res.status(401).send('Admin login required.');
  const eventId = req.query.eventId ? Number(req.query.eventId) : null;
  const esc = v => {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // neutralise spreadsheet formulas
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const header = ['Ticket', 'Event', 'Name', 'Email', 'Phone', 'Roll No', 'Branch', 'Year', 'Status', 'Checked In', 'Registered At'];
  const rows = db.registrations
    .filter(r => (eventId ? r.eventId === eventId : true))
    .map(r => {
      const ev = db.events.find(e => e.id === r.eventId);
      return [r.ticketCode, ev ? ev.title : '', r.name, r.email, r.phone, r.rollNo, r.branch,
        r.year, r.status, r.checkedIn ? 'Yes' : 'No', r.createdAt].map(esc).join(',');
    });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="registrations.csv"');
  res.send([header.map(esc).join(','), ...rows].join('\n'));
});

/* ---------- Fallbacks ---------- */
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`\n  CEMS Aravali running:  http://localhost:${PORT}`);
  console.log(`  Admin panel:           http://localhost:${PORT}/admin.html`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log('  (!) Using default admin password "admin123". Set ADMIN_PASSWORD to change it.\n');
  }
});
