# 📊 Sistema de Análisis de Profesores - PianoLink

## 🎯 Descripción General

Sistema completo de tracking y análisis de sesiones de profesores en tiempo real. Registra automáticamente métricas detalladas de cada clase para proporcionar insights sobre el rendimiento y uso de la plataforma.

---

## 📈 Métricas Recopiladas

### ⏱️ **Temporales**
- **Inicio de sesión**: Timestamp exacto cuando se crea la sala
- **Duración**: Tiempo total de la sesión
- **Fin de sesión**: Normal (profesor), desconexión o crash

### 👥 **Estudiantes**
- **Lista de estudiantes**: Nombre, rol, socketId
- **Tiempos individuales**: Join/leave timestamps por estudiante
- **Duración por estudiante**: Calculado automáticamente

### 🎹 **Actividad MIDI**
- **Notas enviadas**: Total de notas MIDI que el profesor envió
- **Notas recibidas**: Total de notas MIDI recibidas de estudiantes
- **Picos de actividad**: Momentos de alta intensidad (>60 notas/min)
- **Notas por minuto**: Promedio calculado al finalizar

### 🎥 **Video/Audio**
- **Cambios de modo audio**: Conteo de cambios de perfil (video+audio, solo audio, etc.)
- **Mutes remotos**: Cuántas veces el profesor silenció estudiantes

### 📚 **Recursos**
- **PDFs abiertos**: Conteo de partituras cargadas
- **Anotaciones whiteboard**: Uso del pizarrón digital
- **Laser pointer**: Uso del puntero láser

### 🤖 **Interacciones PLB**
- **Queries PLB**: Consultas al asistente IA
- **Mejoras PLB**: Feedback del profesor al sistema

### 📊 **Calidad de Conexión**
- **Latencia promedio**: Medida de ping
- **Reconexiones**: Conteo de desconexiones/reconexiones
- **Packet loss**: Porcentaje de pérdida de paquetes

### ⚙️ **Estado**
- **Clase activada**: Si se activó isActive
- **Finalizada por profesor**: True si usó "Terminar clase"
- **Crash detectado**: True si hubo cierre abrupto

---

## 🔧 Arquitectura Técnica

### **Componentes**

1. **Session Model** (`models/Session.js`)
   - Schema MongoDB con 15+ métricas
   - Método `finalize()` para cálculos finales
   - Método estático `getTeacherStats()` para agregaciones

2. **SessionTracker Service** (`services/SessionTracker.js`)
   - Singleton que mantiene sesiones activas en memoria
   - 20+ métodos de tracking para eventos específicos
   - Peak detection para MIDI (ventana de 60 segundos)
   - Auto-persistencia a MongoDB

3. **Analytics Routes** (`routes/analyticsRoutes.js`)
   - 7 endpoints REST para consultar estadísticas
   - Filtros por profesor, período, límite
   - Rankings y dashboards

4. **Admin UI** (`public/admin.html`)
   - Sección "📈 Estadísticas" en panel admin
   - Selector de profesor y período
   - Visualización de métricas y sesiones recientes

---

## 📡 API Endpoints

### **GET /api/analytics/sessions**
Lista paginada de sesiones con filtros.

**Query params:**
- `teacherId`: ID del profesor (opcional)
- `limit`: Número de resultados (default: 20)
- `skip`: Offset para paginación

**Response:**
```json
{
  "sessions": [
    {
      "roomCode": "ABC123",
      "startTime": "2024-01-15T10:30:00.000Z",
      "duration": 3600000,
      "teacher": { "userId": "...", "email": "...", "name": "..." },
      "students": [...],
      "midiStats": {...},
      "resourcesUsed": {...}
    }
  ],
  "total": 45
}
```

### **GET /api/analytics/teacher/:teacherId/stats**
Estadísticas agregadas de un profesor.

**Query params:**
- `period`: `today`, `week`, `month`, `year`, `all` (default: `week`)
- `startDate`: Fecha inicio custom (ISO string)
- `endDate`: Fecha fin custom (ISO string)

**Response:**
```json
{
  "totalSessions": 12,
  "totalDuration": 43200000,
  "avgDuration": 3600000,
  "uniqueStudents": 8,
  "totalMidiSent": 15234,
  "totalMidiReceived": 8721,
  "totalMidiPeaks": 45,
  "totalPDFs": 18,
  "totalWhiteboardUses": 142,
  "totalPLBQueries": 6,
  "totalAudioModeChanges": 23,
  "totalRemoteMutes": 5
}
```

### **GET /api/analytics/teachers/ranking**
Ranking de profesores por métrica.

**Query params:**
- `by`: `sessions`, `duration`, `students`, `midi` (default: `sessions`)
- `limit`: Top N profesores (default: 10)
- `period`: Período de tiempo (default: `month`)

**Response:**
```json
{
  "ranking": [
    {
      "teacher": { "userId": "...", "name": "Miguel", "email": "..." },
      "value": 25,
      "rank": 1
    }
  ]
}
```

### **GET /api/analytics/active-sessions**
Sesiones activas en este momento.

**Response:**
```json
{
  "activeSessions": [
    {
      "roomCode": "XYZ789",
      "teacher": { "name": "Ana" },
      "startTime": "2024-01-15T11:00:00.000Z",
      "studentCount": 3,
      "midiActivity": 1245
    }
  ]
}
```

### **GET /api/analytics/session/:sessionId**
Detalle completo de una sesión específica.

**Response:**
```json
{
  "session": {
    "roomCode": "ABC123",
    "teacher": {...},
    "students": [{...}],
    "midiStats": {
      "notesSent": 1234,
      "notesReceived": 567,
      "peaks": [{ "timestamp": "...", "notesPerMinute": 82 }],
      "avgNotesPerMinute": 45.2
    },
    "videoStats": {...},
    "audioStats": {...},
    "resourcesUsed": {...},
    "interactions": {...},
    "connectionQuality": {...}
  }
}
```

### **GET /api/analytics/dashboard**
Métricas globales de la plataforma.

**Query params:**
- `period`: Período de tiempo (default: `week`)

**Response:**
```json
{
  "totalSessions": 124,
  "totalDuration": 445200000,
  "activeTeachers": 8,
  "totalStudents": 45,
  "avgSessionDuration": 3600000,
  "topTeacher": { "name": "...", "sessions": 25 }
}
```

---

## 🎨 Admin UI - Uso

### **Acceso**
1. Login en `/admin.html` como admin
2. Click en botón **📈 Estadísticas**

### **Filtros**
- **Profesor**: Dropdown con todos los profesores registrados
- **Período**: Hoy, Última semana, Último mes, Último año, Todo

### **Visualización**

#### **Métricas principales** (4 cards)
- Sesiones totales
- Horas totales
- Estudiantes únicos
- Promedio por sesión

#### **Actividad MIDI**
- Notas enviadas
- Notas recibidas
- Picos de actividad

#### **Recursos Utilizados**
- PDFs abiertos
- Anotaciones
- Queries PLB

#### **Sesiones Recientes** (Lista scrollable)
- Sala, fecha, duración
- Cantidad de estudiantes
- Notas MIDI
- Estado de finalización

---

## 🚀 Eventos Trackeados Automáticamente

### **Socket.io Events**

| Evento | Método SessionTracker | Descripción |
|--------|----------------------|-------------|
| `create-room` | `startSession()` | Inicia tracking cuando profesor crea sala |
| `join-room` | `addStudent()` | Registra estudiante que se une |
| `disconnect` | `removeStudent()` | Registra salida de estudiante |
| `end-class` | `endSession(true)` | Finaliza sesión normalmente |
| `midi-binary` | `trackMidi()` | Cuenta notas MIDI enviadas/recibidas |
| `update-pdf-state` | `trackPDF()` | Registra carga de PDF |
| `wb-draw` | `trackWhiteboard()` | Cuenta anotaciones en pizarra |
| `plb-transcript` | `trackPLBQuery()` | Registra consulta al asistente |
| `plb-improve` | `trackPLBImprovement()` | Registra feedback del profesor |
| `change-audio-mode` | `trackAudioMode()` | Registra cambio de perfil audio |
| `remote-mute` | `trackRemoteMute()` | Registra mute remoto |
| `set-broadcaster` | `trackBroadcasterChange()` | Registra cambio de broadcaster |

---

## 💾 Estructura de Datos en MongoDB

### **Collection: sessions**

```javascript
{
  _id: ObjectId,
  roomCode: "ABC123",
  
  teacher: {
    userId: "65abc...",
    email: "profesor@example.com",
    name: "Miguel"
  },
  
  startTime: ISODate("2024-01-15T10:30:00.000Z"),
  endTime: ISODate("2024-01-15T11:30:00.000Z"),
  duration: 3600000, // milisegundos
  
  students: [
    {
      socketId: "socket-123",
      name: "Ana",
      role: "student",
      joinTime: ISODate("..."),
      leaveTime: ISODate("..."),
      duration: 3600000
    }
  ],
  
  midiStats: {
    notesSent: 1234,
    notesReceived: 567,
    peaks: [
      { timestamp: ISODate("..."), notesPerMinute: 82 }
    ],
    avgNotesPerMinute: 45.2
  },
  
  videoStats: {
    toggleCount: 5
  },
  
  audioStats: {
    modeChanges: 3,
    remoteMutes: 2
  },
  
  resourcesUsed: {
    pdfCount: 2,
    pdfIds: ["score1", "score2"],
    whiteboardAnnotations: 45,
    laserPointerUses: 12
  },
  
  interactions: {
    plbQueries: 3,
    plbImprovements: 1,
    broadcasterChanges: 2
  },
  
  connectionQuality: {
    avgLatency: 85,
    reconnections: 1,
    packetLoss: 0.5
  },
  
  classActivated: true,
  teacherEnded: true,
  crashed: false
}
```

---

## 🧪 Testing

### **1. Crear una sesión de prueba**
```bash
# Iniciar servidor
npm start

# En navegador, crear sala como profesor
# URL: http://localhost:3000/dashboard.html
```

### **2. Verificar tracking en tiempo real**
```javascript
// En consola del servidor, verás logs:
[SessionTracker] ✅ Sesión iniciada: ABC123
[SessionTracker] 👤 Estudiante agregado a ABC123
[Track] MIDI tracked: sent 15 notes
[Track] PDF tracked: score_id_123
```

### **3. Consultar API**
```bash
# Ver sesiones
curl http://localhost:3000/api/analytics/sessions

# Ver stats de profesor
curl http://localhost:3000/api/analytics/teacher/TEACHER_ID/stats?period=today

# Ver sesiones activas
curl http://localhost:3000/api/analytics/active-sessions
```

### **4. Verificar en Admin UI**
1. Login en `/admin.html`
2. Click en "📈 Estadísticas"
3. Seleccionar profesor
4. Ver métricas actualizadas

---

## ⚡ Performance

- **Memoria**: Sesiones activas en RAM (Map), persistidas a MongoDB al finalizar
- **MIDI Peak Detection**: Buffer circular de 60 segundos
- **Async Operations**: Todos los inserts/updates son no-bloqueantes
- **Indexes**: MongoDB indexes en `teacher.userId`, `startTime`, `roomCode`

---

## 🔮 Próximas Mejoras

1. **Gráficos**: Integrar Chart.js para visualizaciones
2. **Exportar**: Botón para descargar CSV/Excel
3. **Alertas**: Notificaciones cuando sesión supera X duración
4. **Comparativas**: Comparar 2 profesores lado a lado
5. **Heatmaps**: Días/horas más activos por profesor
6. **Predicciones**: ML para predecir abandono de estudiantes

---

## 📝 Notas Técnicas

- **Singleton Pattern**: SessionTracker usa patrón singleton para mantener estado global
- **Graceful Degradation**: Si tracking falla, sesión continúa normalmente (no bloquea)
- **Time Zones**: Todos los timestamps en UTC, conversión en frontend
- **Session Cleanup**: En disconnect, si room queda vacía, sesión se finaliza automáticamente

---

## 🆘 Troubleshooting

### **No se registran métricas**
- Verificar que SessionTracker se inicializó: buscar log `[SessionTracker] 📊 Servicio inicializado`
- Verificar que hay tracking hooks en socket events: buscar `[Track]` en logs

### **Estadísticas no aparecen en Admin**
- Verificar que hay sesiones en MongoDB: `db.sessions.find()`
- Verificar que profesor tiene sesiones: buscar por `teacher.userId`
- Verificar endpoint: `curl /api/analytics/teacher/ID/stats`

### **Crash detection no funciona**
- SessionTracker.endSession() debe ser llamado con `crashed: true`
- Verificar que disconnect event llama a removeStudent() correctamente

---

## 📧 Contacto

Para consultas sobre el sistema de analytics:
- **Documentación técnica**: `/docs/TEACHER_ANALYTICS_SYSTEM.md`
- **Código fuente**: `services/SessionTracker.js`, `models/Session.js`, `routes/analyticsRoutes.js`

---

**Versión**: 1.0.0  
**Última actualización**: 2024-01-15  
**Autor**: PianoLink Team
