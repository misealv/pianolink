# 🎹 PianoLink V4 - Plataforma de Enseñanza Musical en Tiempo Real

<div align="center">

![Version](https://img.shields.io/badge/version-4.0.0--beta-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)
![WebMIDI](https://img.shields.io/badge/WebMIDI-2.0-orange.svg)

**Plataforma colaborativa de piano MIDI con sincronización de baja latencia, gestión de estado resiliente y herramientas pedagógicas avanzadas.**

[Características](#-características-principales) •
[Arquitectura](#-arquitectura) •
[Instalación](#-instalación) •
[Configuración](#-configuración) •
[Despliegue](#-despliegue)

</div>

---

## 📖 ¿Qué es PianoLink?

PianoLink es una aplicación web de enseñanza musical en tiempo real que permite a profesores y estudiantes compartir interpretaciones de piano MIDI a través de Internet con latencia ultra-baja (< 50ms). 

### Casos de Uso

- **Clases de Piano Remotas**: Profesor y alumno tocan simultáneamente, escuchando el instrumento del otro en tiempo real
- **Masterclasses Colaborativas**: Un profesor puede "espiar" las partituras de múltiples alumnos y proyectar la de uno específico al resto
- **Anotaciones Sincronizadas**: Dibujo sobre partituras PDF con sincronización instantánea
- **Gestión de Repertorio**: Biblioteca de partituras en la nube con carpetas compartidas y privadas

---

## 🚀 Características Principales

### 🎹 Motor MIDI de Bajo Nivel
- **Input Gate Anti-Loop**: Previene ecos de dispositivos MIDI virtuales
- **Jitter Buffer**: Compensa variaciones de latencia de red (30-50ms)
- **State Manager**: Tracking de notas activas con watchdog anti-cuelgue (2s)
- **Hot-Plug Support**: Reconexión automática de dispositivos USB

### 🌐 Protocolo de Red Optimizado
- **Snapshot Protocol**: Reconciliación automática de estado (cada 5s)
- **Clock Sync (NTP básico)**: Sincronización de timestamps cliente-servidor
- **Binary MIDI over WebSockets**: 13 bytes por evento (vs. 100+ bytes JSON)
- **Reactive Snapshots**: Detección de cambios con throttling inteligente (200ms)

### 📚 Sistema de Partituras
- **Renderizado PDF con PDF.js**: Carga progresiva y zoom adaptativo
- **Annotation Layer (Fabric.js)**: Dibujo vectorial con persistencia en MongoDB
- **Modo Espía**: Profesor puede ver la partitura de cualquier alumno en tiempo real
- **Broadcaster**: Proyección de partitura de un alumno destacado a toda la clase

### 🛡️ Seguridad y Resiliencia
- **Validación de Roles**: Solo profesores pueden cerrar clases o cambiar broadcasters
- **Graceful Shutdown**: Limpieza ordenada de recursos en SIGTERM/SIGINT
- **Dispose Pattern**: Liberación completa de listeners, intervalos y contextos de audio
- **Exponential Backoff**: Reconexión inteligente en caso de caída del servidor

### 🔬 Herramientas de Diagnóstico (Solo Profesor)
- **Diagnostic Sidebar**: Panel de telemetría con métricas MIDI en tiempo real
- **Latency Monitor**: RTT (Round Trip Time) con indicadores visuales
- **Activity Bar**: Tasa de mensajes MIDI por segundo
- **Connection Status**: Estado de conexión con historial de eventos

---

## 🏗️ Arquitectura

### Stack Tecnológico

**Frontend:**
```
- Vanilla JavaScript (ES6 Modules)
- WebMIDI API 2.0
- Web Audio API
- Socket.IO Client 4.x
- PDF.js
- Fabric.js (Canvas)
- VexFlow (Notación Musical)
- Tonal.js (Teoría Musical)
```

**Backend:**
```
- Node.js 16+
- Express.js
- Socket.IO Server 4.x
- MongoDB (Atlas)
- Cloudinary (Almacenamiento de PDFs)
- JWT (Autenticación)
```

### Módulos Principales

#### Frontend Core

```
public/js/
├── Main.js                      # Orquestador principal
├── core/
│   ├── AudioScheduler.js        # Gestión de AudioContext + Jitter Buffer
│   ├── MidiProtocol.js          # Codificación binaria (13 bytes)
│   ├── MidiStateManager.js      # State tracking + Watchdog (Fase 3)
│   └── MidiOutputManager.js     # Output físico + Echo filter (Fase 4)
├── modules/
│   ├── AudioEngine.js           # Abstracción de WebMIDI + WebAudio
│   ├── SocketClient.js          # Middleware de red con hibernación
│   ├── UIManager.js             # Control de interfaz
│   ├── ScoreLogic.js            # Gestión de PDFs y anotaciones
│   ├── Whiteboard.js            # Notación musical (VexFlow + Tonal)
│   ├── DiagnosticSidebar.js     # Panel de telemetría (profesor)
│   └── AutoMuteManager.js       # Silenciado automático por frases
```

#### Backend

```
server.js                         # Relay de eventos MIDI + Snapshot Protocol
├── Gestión de Salas
├── Validación de Seguridad
├── State Tracking (Teacher Active Notes)
└── Graceful Shutdown
```

### Flujo de Datos MIDI

```
Piano Físico → WebMIDI Input → Input Gate (Anti-Loop) 
    ↓
MidiProtocol.encode() → 13 bytes
    ↓
Socket.IO Binary → Servidor (Validación de Seguridad)
    ↓
Broadcast a Sala → Clientes
    ↓
AudioScheduler (Jitter Buffer 30ms) → WebAudio Output / MIDI Output Físico
```

### Gestión de Estado (State Management)

```
┌─────────────────────────────────────────┐
│      MidiStateManager (Cliente)         │
├─────────────────────────────────────────┤
│ • activeNotes: Map<noteId, metadata>   │
│ • lastActivity: Map<noteId, timestamp>  │
│ • Watchdog: Detecta notas colgadas (2s) │
│ • Health Monitor: Reconciliación (30s)  │
└─────────────────────────────────────────┘
              ↕ Sincronización
┌─────────────────────────────────────────┐
│   Servidor (Room State Tracking)        │
├─────────────────────────────────────────┤
│ • teacherActiveNotes: Set<noteId>      │
│ • Snapshot Protocol: Broadcast cada 5s  │
│ • Reactive Snapshots: Al detectar cambio│
└─────────────────────────────────────────┘
```

---

## 💻 Instalación

### Requisitos Previos

- **Node.js** 16.x o superior
- **MongoDB** Atlas (o instancia local)
- **Cloudinary** Account (para almacenamiento de PDFs)
- **Navegador compatible** con WebMIDI:
  - Chrome/Edge 90+
  - Opera 76+
  - ⚠️ Firefox/Safari NO soportan WebMIDI

### Instalación Local

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/pianolink.git
cd pianolink

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
nano .env  # Editar con tus credenciales

# 4. Crear usuario administrador
node createAdmin.js

# 5. Iniciar servidor de desarrollo
npm start
```

El servidor estará disponible en `http://localhost:3000`

---

## ⚙️ Configuración

### Variables de Entorno (`.env`)

```env
# Puerto del servidor
PORT=3000

# MongoDB Connection
MONGO_URI=mongodb+srv://usuario:password@cluster.mongodb.net/pianolink

# JWT Secret (Generar con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_SECRET=tu_secret_aqui_128_caracteres

# Cloudinary (Almacenamiento de PDFs)
CLOUDINARY_CLOUD_NAME=tu_cloud_name
CLOUDINARY_API_KEY=tu_api_key
CLOUDINARY_API_SECRET=tu_api_secret
```

### Rotación de Credenciales

Antes del primer despliegue a producción, ejecuta:

```bash
chmod +x rotate_credentials.sh
./rotate_credentials.sh
```

Este script:
1. Genera un nuevo `JWT_SECRET` criptográficamente seguro
2. Te guía para rotar la contraseña de MongoDB
3. Te guía para regenerar el API Secret de Cloudinary
4. Crea un archivo `.env.production` con las nuevas credenciales

⚠️ **NUNCA** commitees el archivo `.env` o `.env.production` a Git.

---

## 🚀 Despliegue

### Opción 1: Heroku

```bash
# 1. Crear app en Heroku
heroku create pianolink-prod

# 2. Configurar variables de entorno
heroku config:set NODE_ENV=production
heroku config:set MONGO_URI='tu_uri_aqui'
heroku config:set JWT_SECRET='tu_secret_aqui'
heroku config:set CLOUDINARY_CLOUD_NAME='tu_cloud'
heroku config:set CLOUDINARY_API_KEY='tu_key'
heroku config:set CLOUDINARY_API_SECRET='tu_secret'

# 3. Deploy
git push heroku main

# 4. Verificar logs
heroku logs --tail
```

### Opción 2: Railway

1. Conecta tu repositorio de GitHub
2. Configura las variables de entorno en el dashboard
3. Railway desplegará automáticamente

### Opción 3: Docker

```dockerfile
# Dockerfile incluido
docker build -t pianolink .
docker run -p 3000:3000 --env-file .env.production pianolink
```

### Configuración de GitHub Secrets (CI/CD)

Para configurar despliegue automático con GitHub Actions:

1. Ve a tu repositorio → **Settings** → **Secrets and variables** → **Actions**
2. Añade los siguientes secrets:

```
MONGO_URI              # URI de MongoDB Atlas
JWT_SECRET             # Secret de 128 caracteres
CLOUDINARY_CLOUD_NAME  # Tu cloud name de Cloudinary
CLOUDINARY_API_KEY     # Tu API key
CLOUDINARY_API_SECRET  # Tu API secret
HEROKU_API_KEY         # (Si usas Heroku) Tu API key
```

3. Ejemplo de workflow (`.github/workflows/deploy.yml`):

```yaml
name: Deploy to Production
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: akhileshns/heroku-deploy@v3.12.12
        with:
          heroku_api_key: ${{secrets.HEROKU_API_KEY}}
          heroku_app_name: "pianolink-prod"
          heroku_email: "tu@email.com"
```

---

## 🔒 Seguridad

### Medidas Implementadas

- **Validación de Roles**: Comandos administrativos restringidos a profesores
- **Rate Limiting**: Protección contra fuerza bruta en `/api/auth/login`
- **Sanitización de Inputs**: Validación de `roomCode` y `userId` en servidor
- **JWT Tokens**: Autenticación segura con expiración de 7 días
- **CORS Configurado**: Restricción de orígenes en producción
- **Graceful Shutdown**: Cierre ordenado ante SIGTERM/SIGINT

### Auditoría de Seguridad

Consulta [PRODUCTION_AUDIT_REPORT.md](PRODUCTION_AUDIT_REPORT.md) para el informe completo de auditoría pre-producción.

---

## 📊 Monitoreo y Debugging

### Modo Debug (Frontend)

Activa logs detallados en la consola del navegador:

```javascript
localStorage.setItem('PIANOLINK_DEBUG', 'true');
location.reload();
```

### Herramientas de Diagnóstico (Solo Profesor)

Al entrar como profesor, presiona **`Ctrl+D`** para abrir el Diagnostic Sidebar:

- **Latency Monitor**: RTT en tiempo real
- **Activity Bar**: Mensajes MIDI por segundo
- **Connection Status**: Estado de Socket.IO
- **Quick Actions**: Panic (All Notes Off), Resync

### Logs del Servidor

```bash
# Desarrollo
npm start

# Producción con PM2
pm2 start server.js --name pianolink
pm2 logs pianolink
```

---

## 🧪 Testing

```bash
# Tests unitarios (TODO: Implementar)
npm test

# Prueba de carga manual
# 1. Abre 10+ pestañas del navegador
# 2. Une todos a la misma sala
# 3. Verifica latencia en Diagnostic Sidebar
```

---

## 📚 Documentación Adicional

- [AUTOPSY_INITIALIZATION.md](AUTOPSY_INITIALIZATION.md) - Análisis del flujo de arranque
- [LIFECYCLE_DOCUMENTATION.md](LIFECYCLE_DOCUMENTATION.md) - Gestión de ciclo de vida (Dispose Pattern)
- [DIAGNOSTIC_SIDEBAR_README.md](DIAGNOSTIC_SIDEBAR_README.md) - Guía del panel de telemetría
- [PRODUCTION_AUDIT_REPORT.md](PRODUCTION_AUDIT_REPORT.md) - Auditoría de seguridad pre-producción

---

## 🤝 Contribución

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama (`git checkout -b feature/nueva-caracteristica`)
3. Commit tus cambios (`git commit -m 'feat: Agregar nueva característica'`)
4. Push a la rama (`git push origin feature/nueva-caracteristica`)
5. Abre un Pull Request

### Estándares de Código

- ES6+ (módulos, async/await)
- Comentarios JSDoc en funciones públicas
- Dispose Pattern en todos los módulos con recursos
- Logs estratificados (`Logger.log()` vs `console.error()`)

---

## 📝 Licencia

MIT License - ver [LICENSE](LICENSE) para más detalles.

---

## 👥 Autores

- **Equipo PianoLink** - Desarrollo inicial

---

## 🙏 Agradecimientos

- **WebMIDI API** - Por hacer posible el acceso de bajo nivel a dispositivos MIDI
- **Socket.IO** - Por la infraestructura de tiempo real
- **VexFlow** - Por el motor de notación musical
- **PDF.js** - Por el renderizado de partituras

---

## 📞 Soporte

¿Problemas? Abre un [Issue](https://github.com/tu-usuario/pianolink/issues) o contacta a soporte@pianolink.com

---

<div align="center">

**Construido con ❤️ para la educación musical**

[⬆ Volver arriba](#-pianolink-v4---plataforma-de-enseñanza-musical-en-tiempo-real)

</div>
