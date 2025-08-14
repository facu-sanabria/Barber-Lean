require('dotenv').config();
const express = require('express');
const path = require('path');
const config = require('./config');
const nodemailer = require('nodemailer');
const { 
  initDatabase, 
  getBookings, 
  createBooking, 
  deleteBooking, 
  checkBookingExists, 
  getClosures, 
  addClosure, 
  removeClosure,
  getBlockedSlots,
  addBlockedSlots,
  removeBlockedSlots,
  closePool 
} = require('./database').default;

// --- BASIC AUTH PARA ADMIN ---
function basicAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const [type, encoded] = auth.split(' ');
  if (type === 'Basic' && encoded) {
    const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
    if (user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS) {
      return next();
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  return res.status(401).send('Auth required');
}

const app = express();
// Email (nodemailer)
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT || 587),
  secure: false,
  auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
});
async function sendMail({to, subject, html}) {
  if (!to) return;
  await transporter.sendMail({ from: process.env.MAIL_FROM || 'no-reply@example.com', to, subject, html });
}
function bookingHtmlConfirm(b){ return `
  <div style="font-family:sans-serif">
    <h2>✅ Turno confirmado</h2>
    <p>Hola ${b.nombre} ${b.apellido}, tu turno fue confirmado.</p>
    <p><strong>Fecha:</strong> ${b.date} — <strong>Horario:</strong> ${b.time}</p>
    <p>Tel: ${b.telefono ?? '-'} · Email: ${b.email ?? '-'}</p>
  </div>`; }
function bookingHtmlCancel(b){ return `
  <div style="font-family:sans-serif">
    <h2>❌ Turno cancelado</h2>
    <p>Hola ${b.nombre} ${b.apellido}, lamentamos informarte que tu turno fue cancelado.</p>
    <p><strong>Fecha:</strong> ${b.date} — <strong>Horario:</strong> ${b.time}</p>
  </div>`; }

const PORT = process.env.PORT || (config && config.port) || 3000;

// Config negocio
const OPEN_HOUR = config.business.openHour;   // 10:00
const CLOSE_HOUR = config.business.closeHour;  // 19:00 (excluido)
const SLOT_MINUTES = config.business.slotMinutes;

function buildDaySlots() {
  return [
    "11:00","11:30","12:00","12:30","13:00","13:30",
    "15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30","19:00"
  ];
}

// Proteger la página del admin
app.get('/admin.html', basicAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Proteger endpoints de administración
app.use(['/api/bookings', '/api/blocked', '/api/closures'], basicAuth);


// Middlewares
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Disponibilidad
app.get('/api/availability', async (req, res) => {
  try {
    const date = req.query.date; // YYYY-MM-DD
    if (!date) return res.status(400).json({ error: 'date requerido' });

    const d = new Date(date + 'T00:00:00');
    const today = new Date(); today.setHours(0,0,0,0);

    // domingo o pasado => vacío
    if (d.getDay() === 0 || d.getTime() < today.getTime()) {
      return res.json({ date, slots: [] });
    }

    const closures = await getClosures();
    if (closures.includes(date)) {
      return res.json({ date, slots: [] });
    }

    const all = buildDaySlots();
    const db = await getBookings(date);
    const taken = new Set(db.map(b => b.time));

    const blockedList = await getBlockedSlots(date);
    // Normalizar a "HH:MM" por si vienen como "HH:MM:SS"
    const blocked = new Set((blockedList || []).map(t => (t || '').slice(0, 5)));

    // si es hoy, filtrar los horarios que ya pasaron
    const now = new Date();
    const nowMin = now.getHours()*60 + now.getMinutes();

    const free = all.filter(t => {
      const [hh, mm] = t.split(':').map(Number);
      const mins = hh*60 + mm;
      const notTaken = !taken.has(t);
      const notPastToday = d.getTime() > today.getTime() || mins > nowMin;
      const notBlocked = !blocked.has(t);
      return notTaken && notPastToday && notBlocked;
    });

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json({ date, slots: free });
  } catch (error) {
    console.error('Error en /api/availability:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Reservar
app.post('/api/book', async (req, res) => {
  try {
    const { nombre, apellido, telefono, email, date, time } = req.body || {};
    if (!nombre || !apellido || !telefono || !email || !date || !time) {
      return res.status(400).json({ error: 'faltan datos' });
    }

    const d = new Date(date + 'T00:00:00');
    const today = new Date(); today.setHours(0,0,0,0);

    // domingo o pasado
    if (d.getDay() === 0 || d.getTime() < today.getTime()) {
      return res.status(400).json({ error: 'fecha no disponible' });
    }

    const closures = await getClosures();
    if (closures.includes(date)) {
      return res.status(400).json({ error: 'día cerrado (no disponible)' });
    }

    if (!buildDaySlots().includes(time)) {
      return res.status(400).json({ error: 'hora inválida' });
    }
    const blocked = (await getBlockedSlots(date) || []).map(t => (t || '').slice(0, 5));
    if (blocked.includes(time)) {
      return res.status(400).json({ error: 'horario bloqueado' });
    }



    const exists = await checkBookingExists(date, time);
    if (exists) return res.status(409).json({ error: 'turno ya tomado' });

    const newBooking = await createBooking({ nombre, apellido, telefono, email, date, time });

    try { await sendMail({ to: newBooking.email, subject: 'Turno confirmado', html: bookingHtmlConfirm(newBooking) }); } catch(e){ console.error('Mail confirm error', e); }
    res.json({ ok: true, booking: newBooking });
  } catch (error) {
    console.error('Error en /api/book:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/bookings', async (req, res) => {
  try {
    const { date } = req.query;
    const list = await getBookings(date);
    res.json(list);
  } catch (error) {
    console.error('Error en /api/bookings:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --- CANCELAR turno por ID
app.delete('/api/book/:id', basicAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await deleteBooking(id);
    
    if (!result.deleted) {
      return res.status(404).json({ error: 'turno no encontrado' });
    }
    
    try { await sendMail({ to: result.booking.email, subject: 'Turno cancelado', html: bookingHtmlCancel(result.booking) }); } catch(e){ console.error('Mail cancel error', e); }
    res.json({ ok: true, deleted: result.booking });
  } catch (error) {
    console.error('Error en /api/book/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/closures', async (_req, res) => {
  try {
    const closures = await getClosures();
    res.json(closures);
  } catch (error) {
    console.error('Error en /api/closures:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST cerrar un día { date: 'YYYY-MM-DD' }
app.post('/api/closures', async (req, res) => {
  try {
    const { date } = req.body || {};
    if (!date) return res.status(400).json({ error: 'date requerido' });

    const d = new Date(date + 'T00:00:00');
    const today = new Date(); today.setHours(0,0,0,0);

    if (d.getTime() < today.getTime()) {
      return res.status(400).json({ error: 'no se puede cerrar una fecha pasada' });
    }

    const result = await addClosure(date);
    res.json({ ok: true, added: result.added });
  } catch (error) {
    console.error('Error en /api/closures:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});



// Bloqueos de horarios
app.get('/api/blocked', async (req, res) => {
  try {
    const { date } = req.query || {};
    if (!date) return res.status(400).json({ error: 'Falta date' });
    const slots = await getBlockedSlots(date);
    res.json({ date, slots });
  } catch (error) {
    console.error('Error en GET /api/blocked:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/blocked', async (req, res) => {
  try {
    const { date, slots } = req.body || {};
    if (!date || !Array.isArray(slots)) return res.status(400).json({ error: 'Faltan datos' });
    const updated = await addBlockedSlots(date, slots);
    res.json({ ok: true, slots: updated });
  } catch (error) {
    console.error('Error en POST /api/blocked:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.delete('/api/blocked', async (req, res) => {
  try {
    const { date, slots } = req.body || {};
    if (!date || !Array.isArray(slots)) return res.status(400).json({ error: 'Faltan datos' });
    const updated = await removeBlockedSlots(date, slots);
    res.json({ ok: true, slots: updated });
  } catch (error) {
    console.error('Error en DELETE /api/blocked:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});
// DELETE reabrir día
app.delete('/api/closures/:date', async (req, res) => {
  try {
    const date = req.params.date;
    const result = await removeClosure(date);
    
    if (!result.removed) {
      return res.status(404).json({ error: 'día no estaba cerrado' });
    }
    
    res.json({ ok: true, removed: result.closure });
  } catch (error) {
    console.error('Error en /api/closures/:date:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta de salud para mantener vivo el servicio
app.get('/health', (_req, res) => res.sendStatus(200));


// raíz -> tu index.html
app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Manejo de cierre graceful del servidor
process.on('SIGINT', async () => {
  console.log('\n🔄 Cerrando servidor...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 Cerrando servidor...');
  await closePool();
  process.exit(0);
});

// Inicializar base de datos y arrancar servidor
async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`✅ Servidor escuchando en http://localhost:${PORT}`);
      console.log(`🗄️  Base de datos PostgreSQL conectada`);
    });
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
}

startServer();