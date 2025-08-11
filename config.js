// Configuración de la aplicación
require('dotenv').config();

module.exports = {
  // Configuración del servidor
  port: process.env.PORT || 3000,
  
  // Configuración de la base de datos PostgreSQL
  database: {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'peluqueria',
    password: process.env.DB_PASSWORD || 'tu_password',
    port: process.env.DB_PORT || 5432,
    // Configuraciones adicionales del pool de conexiones
    max: 20, // máximo de conexiones en el pool
    idleTimeoutMillis: 30000, // tiempo máximo que una conexión puede estar inactiva
    connectionTimeoutMillis: 2000, // tiempo máximo para establecer una conexión
  },
  
  // Configuración del negocio
  business: {
    openHour: 10,      // Hora de apertura
    closeHour: 19,     // Hora de cierre
    slotMinutes: 30,   // Duración de cada turno en minutos
  }
};
