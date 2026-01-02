# 🚀 MIGRATION BLUEPRINT: PianoLink v4
## De Render (PaaS) a VPS/Servidor Dedicado

**Documento Técnico para Arquitecto de Sistemas**  
**Versión:** 1.0  
**Fecha:** Enero 2026  
**Clasificación:** Confidencial - Infraestructura

---

## 📋 TABLA DE CONTENIDOS

1. [Stack Tecnológico Exacto](#1-stack-tecnológico-exacto)
2. [Comandos de Ciclo de Vida](#2-comandos-de-ciclo-de-vida)
3. [Matriz de Variables de Entorno](#3-matriz-de-variables-de-entorno)
4. [Requisitos del Servidor (Sizing)](#4-requisitos-del-servidor-sizing)
5. [Estrategia de Almacenamiento](#5-estrategia-de-almacenamiento)
6. [Configuración de Red y Seguridad](#6-configuración-de-red-y-seguridad)
7. [Gestión de Procesos (PM2)](#7-gestión-de-procesos-pm2)
8. [Lista de Tareas Pre-Migración](#8-lista-de-tareas-pre-migración)
9. [Checklist de Despliegue](#9-checklist-de-despliegue)

---

## 1. STACK TECNOLÓGICO EXACTO

### Runtime Principal
| Componente | Versión Requerida | Notas |
|------------|-------------------|-------|
| **Node.js** | `>=16.0.0` (Recomendado: 18 LTS o 20 LTS) | Verificar: `node -v` |
| **NPM** | `>=8.0.0` | Verificar: `npm -v` |
| **Sistema Operativo** | Ubuntu 22.04 LTS / Debian 12 | 64-bit requerido |

### Base de Datos
| Servicio | Versión | Proveedor Actual | Notas |
|----------|---------|------------------|-------|
| **MongoDB** | 6.x | MongoDB Atlas (Cloud) | Conexión remota via `MONGO_URI` |

> ⚠️ **CRÍTICO**: La base de datos NO está en el servidor. Se conecta a MongoDB Atlas externamente. No necesita instalación local de MongoDB.

### Servicios Externos (SaaS)
| Servicio | Propósito | Dependencia |
|----------|-----------|-------------|
| **Cloudinary** | Almacenamiento de PDFs (partituras) | Crítica |
| **MongoDB Atlas** | Base de datos | Crítica |
| **Agora.io** | Video/Audio WebRTC | Opcional (degradación elegante) |

### Dependencias NPM (Producción)
```json
{
  "bcryptjs": "^2.4.3",      // Hashing de contraseñas
  "cloudinary": "^1.41.3",   // Storage de archivos
  "dotenv": "^10.0.0",       // Variables de entorno
  "express": "^4.22.1",      // Framework HTTP
  "jsonwebtoken": "^8.5.1",  // Autenticación JWT
  "mongoose": "^6.10.0",     // ODM para MongoDB
  "multer": "^2.0.2",        // Upload de archivos
  "multer-storage-cloudinary": "^4.0.0",  // Integración Multer-Cloudinary
  "socket.io": "^4.8.1"      // WebSockets tiempo real
}
```

---

## 2. COMANDOS DE CICLO DE VIDA

### Instalación Inicial
```bash
# 1. Clonar repositorio
git clone https://github.com/misealv/pianolink.git
cd pianolink

# 2. Instalar dependencias
npm install --production

# 3. Configurar variables de entorno
cp .env.example .env
nano .env  # Editar con valores reales
```

### Build
```bash
# No hay paso de build - Vanilla JS (sin transpilación)
# Los assets estáticos se sirven directamente desde /public
```

### Arranque Producción
```bash
# Desarrollo (NO usar en producción)
npm start

# Producción con PM2 (RECOMENDADO)
pm2 start server.js --name "pianolink" -i max
pm2 save
pm2 startup
```

### Health Check
```bash
# Verificar que el servidor responde
curl -I http://localhost:3000/
# Debe retornar: HTTP/1.1 200 OK
```

---

## 3. MATRIZ DE VARIABLES DE ENTORNO

### Variables Críticas (Obligatorias)

| Variable | Descripción | Ejemplo | Sensibilidad |
|----------|-------------|---------|--------------|
| `PORT` | Puerto del servidor HTTP | `3000` | Pública |
| `NODE_ENV` | Entorno de ejecución | `production` | Pública |
| `MONGO_URI` | Cadena de conexión MongoDB Atlas | `mongodb+srv://user:pass@cluster.mongodb.net/pianolink` | 🔴 SECRETA |
| `JWT_SECRET` | Clave para firmar tokens JWT | `una-clave-muy-larga-y-segura-32chars` | 🔴 SECRETA |

### Variables de Almacenamiento (Cloudinary)

| Variable | Descripción | Ejemplo | Sensibilidad |
|----------|-------------|---------|--------------|
| `CLOUDINARY_CLOUD_NAME` | Nombre del cloud | `dxyz12345` | ⚠️ Privada |
| `CLOUDINARY_API_KEY` | API Key | `123456789012345` | ⚠️ Privada |
| `CLOUDINARY_API_SECRET` | API Secret | `AbCdEfGhIjKlMnOpQrStUvWxYz` | 🔴 SECRETA |

### Variables de Video (Agora.io) - Opcionales

| Variable | Descripción | Ejemplo | Sensibilidad |
|----------|-------------|---------|--------------|
| `AGORA_APP_ID` | App ID de Agora | `abc123def456` | ⚠️ Privada |
| `AGORA_APP_CERTIFICATE` | Certificado para tokens | `xyz789...` | 🔴 SECRETA |

> ℹ️ **Nota**: Si Agora no está configurado, el sistema funciona sin video. La degradación es elegante.

### Archivo .env de Ejemplo
```env
# === SERVIDOR ===
PORT=3000
NODE_ENV=production

# === BASE DE DATOS ===
MONGO_URI=mongodb+srv://pianolink:PASSWORD@cluster.mongodb.net/pianolink?retryWrites=true&w=majority

# === AUTENTICACIÓN ===
JWT_SECRET=tu-clave-jwt-super-secreta-de-32-caracteres-minimo

# === ALMACENAMIENTO (Cloudinary) ===
CLOUDINARY_CLOUD_NAME=tu-cloud-name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=tu-api-secret

# === VIDEO (Agora - Opcional) ===
AGORA_APP_ID=tu-agora-app-id
AGORA_APP_CERTIFICATE=tu-agora-certificate
```

---

## 4. REQUISITOS DEL SERVIDOR (SIZING)

### Carga Esperada
| Métrica | Valor Inicial | Escalado (6 meses) |
|---------|---------------|-------------------|
| Usuarios concurrentes | 10-20 | 50-100 |
| Salas activas simultáneas | 5-10 | 20-40 |
| Tráfico WebSocket | ~500 msg/seg | ~2000 msg/seg |
| Ancho de banda | ~10 Mbps | ~50 Mbps |

### Especificaciones Recomendadas

#### Opción A: Inicio (10-50 usuarios)
| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| **CPU** | 2 vCPU | 4 vCPU |
| **RAM** | 2 GB | 4 GB |
| **Disco** | 20 GB SSD | 40 GB SSD |
| **Ancho de banda** | 100 Mbps | 1 Gbps |

#### Opción B: Escalado (50-200 usuarios)
| Recurso | Recomendado |
|---------|-------------|
| **CPU** | 8 vCPU |
| **RAM** | 8 GB |
| **Disco** | 80 GB NVMe |
| **Ancho de banda** | 1 Gbps simétrico |

### Ubicación Geográfica (Latencia)

Considerando usuarios en Chile, Europa y Australia:

| Opción | Ubicación | Latencia Chile | Latencia Europa | Latencia Australia |
|--------|-----------|----------------|-----------------|---------------------|
| **A** | Miami, FL (USA) | ~60ms | ~120ms | ~200ms |
| **B** | Oregon, USA | ~80ms | ~140ms | ~150ms |
| **C** | Frankfurt, DE | ~180ms | ~20ms | ~280ms |

> **Recomendación**: Si la mayoría de usuarios está en **Latinoamérica**, usar **Miami** o **São Paulo**.

---

## 5. ESTRATEGIA DE ALMACENAMIENTO

### Análisis de Persistencia de Archivos

| Tipo de Dato | Almacenamiento Actual | Persistencia | Acción Requerida |
|--------------|----------------------|--------------|------------------|
| **PDFs (Partituras)** | ☁️ Cloudinary | ✅ Persistente | Ninguna |
| **Imágenes** | ☁️ Cloudinary | ✅ Persistente | Ninguna |
| **Base de Datos** | ☁️ MongoDB Atlas | ✅ Persistente | Ninguna |
| **Sesiones Socket.io** | 🔵 RAM | ⚠️ Volátil | Esperado (stateless) |
| **Código Fuente** | 📁 `/app` local | ✅ Git | Deploy via Git |

### ✅ BUENAS NOTICIAS: NO hay filesystem local crítico

La aplicación **NO usa `fs.writeFile`** ni almacena archivos localmente. Todos los uploads van directamente a Cloudinary.

```javascript
// config/cloudinary.js - El storage es 100% en la nube
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => ({
        folder: `pianolink/${room}/${folder}`,
        allowed_formats: ['pdf'],
        resource_type: 'raw'
    })
});
```

### Recomendación de Disco

- **Sistema Operativo + Node.js + Código**: ~5 GB
- **Logs (con rotación)**: ~2 GB
- **Margen de seguridad**: ~10 GB
- **TOTAL MÍNIMO**: 20 GB SSD

> No se requiere bucket S3 adicional. Cloudinary maneja todo el almacenamiento de archivos.

---

## 6. CONFIGURACIÓN DE RED Y SEGURIDAD

### ⚠️ ALERTA: CORS Abierto

**Estado actual (RIESGO)**:
```javascript
// server.js:18
const io = new Server(server, {
    cors: { origin: "*" },  // ← ABIERTO A TODO
    // ...
});
```

**Acción requerida para producción**:
```javascript
const io = new Server(server, {
    cors: { 
        origin: [
            "https://pianolink.com",
            "https://www.pianolink.com",
            "https://app.pianolink.com"
        ],
        methods: ["GET", "POST"],
        credentials: true
    },
    // ...
});
```

### Puertos Requeridos

| Puerto | Protocolo | Servicio | Acceso |
|--------|-----------|----------|--------|
| `22` | TCP | SSH | Solo IPs admin |
| `80` | TCP | HTTP (redirect) | Público |
| `443` | TCP | HTTPS | Público |
| `3000` | TCP | Node.js (interno) | Solo Nginx |

### Configuración Nginx Recomendada

```nginx
# /etc/nginx/sites-available/pianolink
upstream pianolink {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name pianolink.com www.pianolink.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name pianolink.com www.pianolink.com;

    ssl_certificate /etc/letsencrypt/live/pianolink.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pianolink.com/privkey.pem;

    # WebSocket support
    location / {
        proxy_pass http://pianolink;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts para WebSocket largo
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

### Middleware de Seguridad Faltantes

| Middleware | Estado | Impacto | Prioridad |
|------------|--------|---------|-----------|
| `helmet` | ❌ No instalado | Headers de seguridad | 🟡 Media |
| `express-rate-limit` | ❌ No instalado | Protección DDoS | 🟡 Media |
| `cors` (Express) | ❌ No usado | CORS headers HTTP | 🟢 Baja |

---

## 7. GESTIÓN DE PROCESOS (PM2)

### ✅ BUENAS NOTICIAS: Graceful Shutdown Implementado

El código ya tiene manejo de señales de terminación:

```javascript
// MEMORY_LEAK_PATCH_BLOCKER_3.js (debe integrarse a server.js)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => {
    console.error('[Critical Error]:', error);
    gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
    console.error('[Unhandled Rejection]:', reason);
    gracefulShutdown('unhandledRejection');
});
```

### Configuración PM2 Recomendada

Crear archivo `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'pianolink',
    script: 'server.js',
    instances: 'max',        // Usar todos los CPUs
    exec_mode: 'cluster',    // Modo cluster para alta disponibilidad
    
    // Variables de entorno
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    
    // Reinicio automático
    watch: false,
    max_memory_restart: '500M',  // Reiniciar si usa >500MB
    
    // Logs
    log_file: '/var/log/pianolink/combined.log',
    error_file: '/var/log/pianolink/error.log',
    out_file: '/var/log/pianolink/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Graceful shutdown
    kill_timeout: 10000,         // 10s para cerrar limpiamente
    wait_ready: true,
    listen_timeout: 10000
  }]
};
```

### Comandos PM2

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar con ecosystem
pm2 start ecosystem.config.js --env production

# Guardar configuración para auto-inicio
pm2 save
pm2 startup  # Seguir instrucciones que aparecen

# Monitoreo
pm2 monit
pm2 logs pianolink --lines 100

# Reload sin downtime (graceful)
pm2 reload pianolink
```

---

## 8. LISTA DE TAREAS PRE-MIGRACIÓN

### 🔴 CRÍTICAS (Hacer antes de migrar)

| # | Tarea | Archivo | Esfuerzo |
|---|-------|---------|----------|
| 1 | Integrar graceful shutdown al server.js | `server.js` | 15 min |
| 2 | Restringir CORS a dominios finales | `server.js:18` | 10 min |
| 3 | Eliminar JWT_SECRET hardcodeado de fallback | `authController.js:11` | 5 min |
| 4 | Crear archivo `.env.example` sin secretos | Raíz | 5 min |

### 🟡 RECOMENDADAS (Mejoran seguridad)

| # | Tarea | Archivo | Esfuerzo |
|---|-------|---------|----------|
| 5 | Instalar y configurar `helmet` | `server.js` | 20 min |
| 6 | Agregar rate limiting a rutas de auth | `routes/authRoutes.js` | 30 min |
| 7 | Crear `ecosystem.config.js` para PM2 | Raíz | 10 min |
| 8 | Limpiar archivos .md de documentación interna | Raíz | 5 min |

### 🟢 OPCIONALES (Post-lanzamiento)

| # | Tarea | Descripción | Esfuerzo |
|---|-------|-------------|----------|
| 9 | Agregar health check endpoint | `GET /health` con status de MongoDB | 15 min |
| 10 | Implementar logs estructurados (Winston) | Mejor debugging en producción | 1 hora |
| 11 | Configurar alertas de PM2 (Keymetrics) | Monitoreo proactivo | 30 min |

---

## 9. CHECKLIST DE DESPLIEGUE

### Fase 1: Preparación del Servidor

- [ ] Servidor provisionado (Ubuntu 22.04 LTS)
- [ ] Actualizar sistema: `apt update && apt upgrade -y`
- [ ] Instalar Node.js 18 LTS via NodeSource
- [ ] Instalar PM2: `npm install -g pm2`
- [ ] Instalar Nginx: `apt install nginx -y`
- [ ] Configurar Firewall (UFW): puertos 22, 80, 443
- [ ] Crear usuario no-root para la aplicación

### Fase 2: Despliegue de Código

- [ ] Clonar repositorio en `/var/www/pianolink`
- [ ] Copiar `.env` con variables de producción
- [ ] Ejecutar `npm install --production`
- [ ] Verificar conexión a MongoDB: `node -e "require('./config/db')()"`
- [ ] Iniciar con PM2: `pm2 start ecosystem.config.js`

### Fase 3: Configuración de Red

- [ ] Configurar Nginx como reverse proxy
- [ ] Instalar Certbot: `apt install certbot python3-certbot-nginx`
- [ ] Obtener certificado SSL: `certbot --nginx -d pianolink.com`
- [ ] Verificar WebSocket funciona via HTTPS
- [ ] Configurar renovación automática de SSL

### Fase 4: Validación

- [ ] Test de conexión desde cliente externo
- [ ] Verificar upload de PDF a Cloudinary
- [ ] Test de latencia MIDI (< 100ms RTT)
- [ ] Test de reconexión tras `pm2 reload`
- [ ] Verificar logs en `/var/log/pianolink/`

### Fase 5: Producción

- [ ] Actualizar DNS a IP del nuevo servidor
- [ ] Monitorear logs las primeras 24 horas
- [ ] Configurar backups de `.env`
- [ ] Documentar credenciales en gestor seguro

---

## 📊 RESUMEN EJECUTIVO

| Categoría | Estado | Notas |
|-----------|--------|-------|
| **Persistencia de Archivos** | ✅ OK | Todo en Cloudinary (cloud) |
| **Variables de Entorno** | ⚠️ Revisar | Hay fallback JWT hardcodeado |
| **Gestión de Procesos** | ✅ Preparado | Graceful shutdown existe (integrar) |
| **CORS** | 🔴 Cambiar | Actualmente `origin: "*"` |
| **Rate Limiting** | ❌ Falta | Recomendado agregar |
| **SSL/TLS** | ⏳ Pendiente | Configurar en Nginx |

### Riesgo General de Migración: 🟢 BAJO

La aplicación está bien diseñada para migración. Los únicos cambios requeridos son configuraciones de seguridad estándar para producción.

---

**Documento preparado para:** Arquitecto de Sistemas  
**Próximo paso:** Revisar y aprobar especificaciones de servidor  
**Contacto técnico:** Equipo PianoLink
