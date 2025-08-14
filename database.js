import { Pool } from 'pg';
let config;
try {
  config = require('./config'); // para uso local si lo necesitás
} catch (_) {
  config = {};
}

// Si hay DATABASE_URL (producción), usamos esa conexión con SSL.
// Si no, caemos a config.database (tu config local).
const useDatabaseUrl = !!process.env.DATABASE_URL;

const pool = useDatabaseUrl
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool(config.database || {});

// Inicializar la base de datos con las tablas necesarias
async function initDatabase() {
  try {
    const client = await pool.connect();
    
    // Crear tabla de reservas
    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        apellido VARCHAR(100) NOT NULL,
        date DATE NOT NULL,
        time TIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, time)
      )
    `);

    // Crear tabla de días cerrados
    await client.query(`
      CREATE TABLE IF NOT EXISTS closures (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL UNIQUE
      )
    `);

    // Crear índices para mejorar el rendimiento
    await client.query('CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_bookings_datetime ON bookings(date, time)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_closures_date ON closures(date)');
    // Nuevas columnas (si faltan)
    await client.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS telefono VARCHAR(50)");
    await client.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS email VARCHAR(150)");
    // Tabla de bloqueos por slot
    await client.query(`
      CREATE TABLE IF NOT EXISTS blocked_slots (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        time TIME NOT NULL,
        UNIQUE(date, time)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_blocked_date ON blocked_slots(date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_blocked_datetime ON blocked_slots(date, time)');


    client.release();
    console.log('✅ Base de datos PostgreSQL inicializada correctamente');
  } catch (error) {
    console.error('❌ Error al inicializar la base de datos:', error);
    throw error;
  }
}

async function getBookings(date = null) {
  const client = await pool.connect();
  let q = `
    SELECT id,
           nombre,
           apellido,
           telefono,              -- <-- agregar
           email,                 -- <-- agregar
           to_char(date, 'YYYY-MM-DD') AS date,
           to_char(time, 'HH24:MI')     AS time
    FROM bookings
  `;
  const params = [];
  if (date) { q += ' WHERE date = $1'; params.push(date); }
  q += ' ORDER BY date, time';
  const result = await client.query(q, params);
  client.release();
  return result.rows;
}


async function createBooking(booking) {
  try {
    const client = await pool.connect();
    const query = `
  INSERT INTO bookings (nombre, apellido, telefono, email, date, time)
  VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING id, nombre, apellido, telefono, email,
            to_char(date,'YYYY-MM-DD') AS date,
            to_char(time,'HH24:MI')    AS time
`;

    
    const result = await client.query(query, [
      booking.nombre,
      booking.apellido,
      booking.telefono,
      booking.email,
      booking.date,
      booking.time
    ]);
    
    client.release();
    return result.rows[0];
  } catch (error) {
    console.error('Error al crear reserva:', error);
    throw error;
  }
}

async function deleteBooking(id) {
  try {
    const client = await pool.connect();
    const query = 'DELETE FROM bookings WHERE id = $1 RETURNING *';
    
    const result = await client.query(query, [id]);
    client.release();
    
    return { deleted: result.rowCount > 0, booking: result.rows[0] };
  } catch (error) {
    console.error('Error al eliminar reserva:', error);
    throw error;
  }
}

async function checkBookingExists(date, time) {
  try {
    const client = await pool.connect();
    const query = 'SELECT COUNT(*) as count FROM bookings WHERE date = $1 AND time = $2';
    
    const result = await client.query(query, [date, time]);
    client.release();
    
    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    console.error('Error al verificar reserva:', error);
    throw error;
  }
}

// Funciones para días cerrados
// database.js
async function getClosures() {
  const client = await pool.connect();
  const result = await client.query(`
    SELECT to_char(date, 'YYYY-MM-DD') AS date
    FROM closures
    ORDER BY date
  `);
  client.release();
  return result.rows.map(r => r.date); // ["2025-09-01", ...]
}

async function addClosure(date) {
  try {
    const client = await pool.connect();
    const query = 'INSERT INTO closures (date) VALUES ($1) ON CONFLICT (date) DO NOTHING RETURNING *';
    
    const result = await client.query(query, [date]);
    client.release();
    
    return { added: result.rowCount > 0, closure: result.rows[0] };
  } catch (error) {
    console.error('Error al agregar día cerrado:', error);
    throw error;
  }
}

async function removeClosure(date) {
  try {
    const client = await pool.connect();
    const query = 'DELETE FROM closures WHERE date = $1 RETURNING *';
    
    const result = await client.query(query, [date]);
    client.release();
    
    return { removed: result.rowCount > 0, closure: result.rows[0] };
  } catch (error) {
    console.error('Error al remover día cerrado:', error);
    throw error;
  }
}

// Función para cerrar la conexión del pool

async function getBlockedSlots(date) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT to_char(time,'HH24:MI') AS time FROM blocked_slots WHERE date=$1 ORDER BY time", [date]);
    return rows.map(r=>r.time);
  } finally {
    client.release();
  }
}
async function addBlockedSlots(date, slots) {
  if (!slots?.length) return getBlockedSlots(date);
  const client = await pool.connect();
  try {
    const values = slots.map((_,i)=>`($1, $${i+2})`).join(',');
    await client.query(`INSERT INTO blocked_slots (date, time) VALUES ${values} ON CONFLICT (date,time) DO NOTHING`, [date, ...slots]);
    return getBlockedSlots(date);
  } finally { client.release(); }
}
async function removeBlockedSlots(date, slots) {
  const client = await pool.connect();
  try {
    if (!slots?.length) return getBlockedSlots(date);
    const inParams = slots.map((_,i)=>`$${i+2}`).join(',');
    await client.query(`DELETE FROM blocked_slots WHERE date=$1 AND time IN (${inParams})`, [date, ...slots]);
    return getBlockedSlots(date);
  } finally { client.release(); }
}
async function closePool() {
  await pool.end();
}

export default {
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
};
