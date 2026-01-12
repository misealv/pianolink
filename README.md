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
[Documentación](#-documentación)

---

### 👨‍🎨 Creado por

<img src="https://img.shields.io/badge/Autor-Miguel%20Antonio%20Sep%C3%BAlveda%20Alvarez-ff764d?style=for-the-badge&logo=piano&logoColor=white" alt="Autor"/>

## **Miguel Antonio Sepúlveda Alvarez**  
### 🎹 *Pianista* • 🎼 *Compositor* • 👨‍🏫 *Docente*

*"Conectando el talento musical a través de la tecnología"*

---

</div>

## 📖 ¿Qué es PianoLink?

PianoLink es una aplicación web de enseñanza musical en tiempo real que permite a profesores y estudiantes compartir interpretaciones de piano MIDI a través de Internet con latencia ultra-baja (< 50ms). 

### Casos de Uso

- 🎹 **Clases de Piano Remotas**: Profesor y alumno tocan simultáneamente, escuchando el instrumento del otro en tiempo real
- 👁️ **Masterclasses Colaborativas**: Un profesor puede "espiar" las partituras de múltiples alumnos y proyectar la de uno específico al resto
- ✏️ **Anotaciones Sincronizadas**: Dibujo sobre partituras PDF con sincronización instantánea
- 📚 **Gestión de Repertorio**: Biblioteca de partituras en la nube con carpetas compartidas y privadas
- 🎥 **Video Integrado**: Comunicación audiovisual vía Agora.io con Audio Bridge inteligente

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
- **Láser Sincronizado**: Puntero láser para señalar partes del PDF en tiempo real
- **Modo Espía**: Profesor puede ver la partitura de cualquier alumno
- **Broadcaster**: Proyección de partitura de un alumno destacado a toda la clase

### 🛡️ Seguridad y Resiliencia
- **Validación de Roles**: Solo profesores pueden cerrar clases o cambiar broadcasters
- **Graceful Shutdown**: Limpieza ordenada de recursos en SIGTERM/SIGINT
- **Dispose Pattern**: Liberación completa de listeners, intervalos y contextos de audio
- **CORS Configurable**: Restricción de orígenes por entorno

### 🔬 Herramientas de Diagnóstico (Solo Profesor)
- **Diagnostic Sidebar**: Panel de telemetría con métricas MIDI en tiempo real
- **Latency Monitor**: RTT (Round Trip Time) con indicadores visuales
- **Activity Bar**: Tasa de mensajes MIDI por segundo
- **Health Check Endpoint**: `/health` para monitoreo de infraestructura

---

## 🏗️ Arquitectura

### Stack Tecnológico

| Capa | Tecnologías |
|------|-------------|
| **Frontend** | Vanilla JS (ES6 Modules), WebMIDI API, Web Audio API, Socket.IO, PDF.js, Fabric.js, VexFlow, Tonal.js |
| **Backend** | Node.js 16+, Express.js, Socket.IO, MongoDB Atlas, Cloudinary, JWT |
| **Video** | Agora.io WebRTC (opcional) |
| **Deploy** | Render / VPS con PM2 |

### Estructura del Proyecto

```
pianolink/
├── server.js                 # Servidor principal (Relay MIDI + WebSocket)
├── ecosystem.config.js       # Configuración PM2 para producción
├── package.json
├── .env.example              # Plantilla de variables de entorno
│
├── config/
│   ├── db.js                 # Conexión MongoDB
│   └── cloudinary.js         # Storage de PDFs
│
├── controllers/
│   ├── authController.js     # Login/Registro
│   └── teacherController.js  # Operaciones de profesor
│
├── models/
│   ├── User.js               # Modelo de usuario
│   ├── Score.js              # Modelo de partitura
│   └── Annotation.js         # Modelo de anotación
│
├── routes/
│   ├── authRoutes.js
│   ├── scoreRoutes.js
│   └── teacherRoutes.js
│
├── public/
│   ├── index.html            # SPA principal
│   ├── login.html
│   ├── css/style.css
│   └── js/
│       ├── Main.js           # Orquestador principal
│       ├── core/             # Protocolos MIDI
│       └── modules/          # Componentes modulares
│
├── docs/                     # 📁 Documentación activa
│   ├── MIGRATION_BLUEPRINT.md
│   ├── DIAGNOSTIC_SIDEBAR_README.md
│   ├── WHITEBOARD_QUICK_START.md
│   └── ...
│
└── archive/                  # 📦 Documentación histórica
    ├── auditorías completadas
    └── fixes implementados
```

---

## 💻 Instalación

### Requisitos Previos

- **Node.js** 16.x o superior
- **MongoDB** Atlas (o instancia local)
- **Cloudinary** Account (para almacenamiento de PDFs)
- **Navegador compatible** con WebMIDI: Chrome/Edge 90+, Opera 76+

> ⚠️ Firefox y Safari NO soportan WebMIDI

### Instalación Local

```bash
# 1. Clonar el repositorio
git clone https://github.com/misealv/pianolink.git
cd pianolink

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
nano .env  # Editar con tus credenciales

# 4. Crear usuario administrador
node createAdmin.js

# 5. Iniciar servidor
npm start
```

El servidor estará disponible en `http://localhost:3000`

---

## ⚙️ Configuración

### Variables de Entorno

Copia `.env.example` y configura:

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `PORT` | Puerto del servidor | ✅ |
| `NODE_ENV` | `development` o `production` | ✅ |
| `MONGO_URI` | URI de MongoDB Atlas | ✅ |
| `JWT_SECRET` | Clave para tokens (32+ chars) | ✅ |
| `CLOUDINARY_CLOUD_NAME` | Nombre del cloud | ✅ |
| `CLOUDINARY_API_KEY` | API Key de Cloudinary | ✅ |
| `CLOUDINARY_API_SECRET` | API Secret de Cloudinary | ✅ |
| `AGORA_APP_ID` | App ID de Agora (video) | Opcional |
| `AGORA_APP_CERTIFICATE` | Certificado de Agora | Opcional |
| `CORS_ORIGINS` | Dominios permitidos (producción) | Opcional |

---

## 🚀 Despliegue

### Producción con PM2

```bash
# Instalar PM2
npm install -g pm2

# Iniciar con configuración de producción
pm2 start ecosystem.config.js --env production

# Guardar para auto-inicio
pm2 save
pm2 startup
```

### Health Check

```bash
curl http://localhost:3000/health
```

Retorna estado del servidor, MongoDB y uso de memoria.

---

## 📚 Documentación

| Documento | Descripción |
|-----------|-------------|
| [docs/MIGRATION_BLUEPRINT.md](docs/MIGRATION_BLUEPRINT.md) | Guía completa para migrar a VPS |
| [docs/DIAGNOSTIC_SIDEBAR_README.md](docs/DIAGNOSTIC_SIDEBAR_README.md) | Manual del panel de diagnóstico |
| [docs/WHITEBOARD_QUICK_START.md](docs/WHITEBOARD_QUICK_START.md) | Guía rápida de la pizarra |
| [docs/SMART_AUDIO_BRIDGE_IMPLEMENTATION.md](docs/SMART_AUDIO_BRIDGE_IMPLEMENTATION.md) | Arquitectura del sistema de audio |
| [docs/TEST_VIDEO_AUDIO.md](docs/TEST_VIDEO_AUDIO.md) | Guía de testing de video/audio |

> 📦 La carpeta `/archive` contiene documentación histórica de auditorías y fixes completados.

---

## 🔒 Seguridad

- ✅ Validación de roles en servidor
- ✅ JWT con expiración configurable
- ✅ CORS restringido en producción
- ✅ Graceful shutdown implementado
- ✅ Variables sensibles en `.env` (nunca en código)

---

## 🧪 Testing Manual

```bash
# 1. Abre Chrome como profesor
http://localhost:3000

# 2. Abre otra pestaña/navegador como alumno
# 3. Únete a la misma sala
# 4. Verifica:
#    - MIDI fluye en ambas direcciones
#    - Anotaciones se sincronizan
#    - Láser aparece en pantalla del alumno
```

---

## 📝 Licencia

MIT License - ver [LICENSE](LICENSE) para más detalles.

---

<div align="center">

## 👨‍🎨 Sobre el Autor

<table>
<tr>
<td align="center" width="100%">

### **Miguel Antonio Sepúlveda Alvarez**

🎹 **Pianista** | 🎼 **Compositor** | 👨‍🏫 **Docente**

*Músico profesional con pasión por la educación y la tecnología. PianoLink nace de la necesidad real de conectar profesor y alumno de piano sin importar la distancia, manteniendo la esencia de una clase presencial.*

---

**"La música no conoce fronteras. Con PianoLink, tampoco la enseñanza."**

</td>
</tr>
</table>

---

**Construido con ❤️ para la educación musical**

[⬆ Volver arriba](#-pianolink-v4---plataforma-de-enseñanza-musical-en-tiempo-real)

</div>
# Deploy timestamp: Mon Jan 12 16:01:39 -03 2026
