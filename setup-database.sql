-- Script para configurar la base de datos PostgreSQL para la peluquería
-- Ejecutar como usuario postgres o con permisos de superusuario

-- Crear la base de datos
CREATE DATABASE peluqueria;

-- Crear tabla de reservas
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(date, time)
);

-- Crear tabla de días cerrados
CREATE TABLE IF NOT EXISTS closures (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
CREATE INDEX IF NOT EXISTS idx_bookings_datetime ON bookings(date, time);
CREATE INDEX IF NOT EXISTS idx_closures_date ON closures(date);

-- Insertar algunos datos de ejemplo (opcional)
-- INSERT INTO bookings (nombre, apellido, date, time) VALUES 
--   ('Juan', 'Pérez', '2024-01-15', '10:00:00'),
--   ('María', 'García', '2024-01-15', '11:00:00');

