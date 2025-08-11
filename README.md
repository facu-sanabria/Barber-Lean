# 🎯 Sistema de Turnos para Peluquería

Sistema web para gestionar reservas de turnos en una peluquería, con base de datos PostgreSQL.

## 🚀 Características

- ✅ Reserva de turnos online
- ✅ Calendario semanal interactivo
- ✅ Gestión de días cerrados
- ✅ Base de datos PostgreSQL robusta
- ✅ API REST completa
- ✅ Interfaz responsive con Tailwind CSS

## 📋 Requisitos Previos

- **Node.js** (versión 14 o superior)
- **PostgreSQL** (versión 12 o superior)
- **npm** o **yarn**

## 🗄️ Configuración de PostgreSQL

### 1. Instalar PostgreSQL

**Windows:**
- Descargar desde [postgresql.org](https://www.postgresql.org/download/windows/)
- Instalar con el instalador oficial

**macOS:**
```bash
brew install postgresql
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```

### 2. Crear la Base de Datos

```bash
# Conectar como usuario postgres
sudo -u postgres psql

# Crear la base de datos
CREATE DATABASE peluqueria;

# Verificar que se creó
\l

# Salir
\q
```

### 3. Ejecutar el Script de Configuración

```bash
# Conectar a la base de datos
psql -U postgres -d peluqueria -f setup-database.sql
```

## ⚙️ Instalación del Proyecto

### 1. Clonar e Instalar Dependencias

```bash
# Instalar dependencias
npm install

# Instalar pg (driver de PostgreSQL)
npm install pg
```

### 2. Configurar Variables de Entorno

Crear un archivo `.env` basado en `config.env.example`:

```bash
# Copiar el archivo de ejemplo
cp config.env.example .env

# Editar con tus credenciales
DB_USER=postgres
DB_HOST=localhost
DB_NAME=peluqueria
DB_PASSWORD=tu_password_real
DB_PORT=5432
PORT=3000
```

### 3. Ejecutar la Aplicación

```bash
# Iniciar el servidor
npm start

# O directamente con node
node server.js
```

La aplicación estará disponible en: http://localhost:3000

## 🏗️ Estructura del Proyecto

```
peluqueria-lean/
├── server.js              # Servidor Express principal
├── database.js            # Configuración y funciones de PostgreSQL
├── setup-database.sql     # Script SQL para crear la base de datos
├── config.env.example     # Variables de entorno de ejemplo
├── public/
│   ├── index.html         # Interfaz principal de reservas
│   └── admin.html         # Panel de administración
├── package.json           # Dependencias del proyecto
└── README.md              # Este archivo
```

## 🗃️ Estructura de la Base de Datos

### Tabla `bookings`
- `id`: Identificador único (SERIAL)
- `nombre`: Nombre del cliente
- `apellido`: Apellido del cliente
- `date`: Fecha del turno (DATE)
- `time`: Hora del turno (TIME)
- `created_at`: Timestamp de creación

### Tabla `closures`
- `id`: Identificador único (SERIAL)
- `date`: Fecha cerrada (DATE, UNIQUE)

## 🔌 API Endpoints

- `GET /api/availability?date=YYYY-MM-DD` - Obtener horarios disponibles
- `POST /api/book` - Crear nueva reserva
- `GET /api/bookings` - Listar todas las reservas
- `GET /api/bookings?date=YYYY-MM-DD` - Listar reservas por fecha
- `DELETE /api/book/:id` - Cancelar reserva
- `GET /api/closures` - Listar días cerrados
- `POST /api/closures` - Cerrar un día
- `DELETE /api/closures/:date` - Reabrir un día

## 🛠️ Comandos Útiles

### Verificar Estado de PostgreSQL
```bash
# Verificar que el servicio esté corriendo
sudo systemctl status postgresql

# Conectar a la base de datos
psql -U postgres -d peluqueria

# Ver tablas
\dt

# Ver estructura de una tabla
\d bookings
```

### Backup y Restore
```bash
# Crear backup
pg_dump -U postgres peluqueria > backup.sql

# Restaurar backup
psql -U postgres peluqueria < backup.sql
```

## 🚨 Solución de Problemas

### Error de Conexión a PostgreSQL
- Verificar que PostgreSQL esté corriendo
- Verificar credenciales en el archivo `.env`
- Verificar que la base de datos `peluqueria` exista

### Error de Permisos
- Asegurarse de que el usuario tenga permisos en la base de datos
- Verificar que las tablas se hayan creado correctamente

### Puerto en Uso
- Cambiar el puerto en el archivo `.env`
- O terminar procesos que usen el puerto 3000

## 📝 Licencia

Este proyecto es de código abierto y está disponible bajo la licencia MIT.

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor, abre un issue o pull request para sugerencias y mejoras.
