const express = require('express');
const path = require('path');
const config = require('./config');
const { 
  initDatabase, 
  getBookings, 
  createBooking, 
  deleteBooking, 
  checkBookingExists, 
  getClosures, 
  addClosure, 
  removeClosure,
  closePool 
} = require('./database').default;

const app = express();
const PORT = config.port;

// Config negocio
const OPEN_HOUR = config.business.openHour;   // 10:00
const CLOSE_HOUR = config.business.closeHour;  // 19:00 (excluido)
const SLOT_MINUTES = config.business.slotMinutes;

function buildDaySlots() {
  const slots = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    }
  }
  return slots; // 10:00 ... 18:30
}

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

    // si es hoy, filtrar los horarios que ya pasaron
    const now = new Date();
    const nowMin = now.getHours()*60 + now.getMinutes();

    const free = all.filter(t => {
      const [hh, mm] = t.split(':').map(Number);
      const mins = hh*60 + mm;
      const notTaken = !taken.has(t);
      const notPastToday = d.getTime() > today.getTime() || mins > nowMin;
      return notTaken && notPastToday;
    });

    res.json({ date, slots: free });
  } catch (error) {
    console.error('Error en /api/availability:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Reservar
app.post('/api/book', async (req, res) => {
  try {
    const { nombre, apellido, date, time } = req.body || {};
    if (!nombre || !apellido || !date || !time) {
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

    const exists = await checkBookingExists(date, time);
    if (exists) return res.status(409).json({ error: 'turno ya tomado' });

    const newBooking = await createBooking({ nombre, apellido, date, time });
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
app.delete('/api/book/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await deleteBooking(id);
    
    if (!result.deleted) {
      return res.status(404).json({ error: 'turno no encontrado' });
    }
    
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
