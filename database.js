const { Pool } = require('pg');
const config = require('./config');

// Configuración de la conexión a PostgreSQL
const pool = new Pool(config.database);

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
      INSERT INTO bookings (nombre, apellido, date, time)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const result = await client.query(query, [
      booking.nombre, 
      booking.apellido, 
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
async function closePool() {
  await pool.end();
}

module.exports = {
  initDatabase,
  getBookings,
  createBooking,
  deleteBooking,
  checkBookingExists,
  getClosures,
  addClosure,
  removeClosure,
  closePool
};
