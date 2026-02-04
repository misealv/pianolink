# 🎹 PianoLink - Calendario & Reservas: Blueprint Técnico

## 1. ARQUITECTURA DE DATOS (MongoDB)

### 1.1 Modelo: `AvailabilityTemplate` (Plantilla recurrente del profesor)
```javascript
{
  teacherId: ObjectId,
  name: String,                    // "Horario de Verano"
  timezone: String,                // "America/Santiago"
  bufferMinutes: Number,           // 10 (colchón entre clases)
  defaultDuration: Number,         // 45 (minutos)
  weeklySlots: [{
    dayOfWeek: Number,             // 0=Dom, 1=Lun...
    startTime: String,             // "09:00" (hora local)
    endTime: String,               // "18:00"
    slotDuration: Number,          // override o null
    maxStudents: Number            // 1=individual, >1=grupal
  }],
  exceptions: [{                   // Días específicos bloqueados
    date: Date,                    // UTC midnight
    reason: String
  }],
  validFrom: Date,
  validUntil: Date,
  isActive: Boolean
}
```

### 1.2 Modelo: `TimeSlot` (Instancia concreta de disponibilidad)
```javascript
{
  _id: ObjectId,
  teacherId: ObjectId,
  templateId: ObjectId,            // Referencia a plantilla origen
  
  // === TIEMPO (TODO EN UTC) ===
  startTime: Date,                 // UTC
  endTime: Date,                   // UTC
  duration: Number,                // minutos
  
  // === ESTADO ===
  status: {
    type: String,
    enum: ['available', 'pending', 'booked', 'completed', 'cancelled', 'no-show']
  },
  
  // === RESERVA (cuando status !== 'available') ===
  booking: {
    studentId: ObjectId,
    studentName: String,           // Cache para UI
    bookedAt: Date,
    confirmedAt: Date,
    notes: String,
    
    // === CLASES GRUPALES (futuro) ===
    participants: [{
      studentId: ObjectId,
      studentName: String,
      joinedAt: Date,
      status: String               // 'confirmed', 'pending', 'cancelled'
    }]
  },
  
  // === SESIÓN MIDI ===
  midiSession: {
    sessionId: String,             // UUID único para Agora/WebRTC
    channelName: String,           // "pl_{slotId}_{timestamp}"
    token: String,                 // Token temporal Agora
    tokenExpiry: Date,
    roomUrl: String                // URL completa para unirse
  },
  
  // === CLASE GRUPAL ===
  classType: {
    type: String,
    enum: ['individual', 'group'],
    default: 'individual'
  },
  maxParticipants: Number,         // 1 para individual
  currentParticipants: Number,
  
  // === META ===
  createdAt: Date,
  updatedAt: Date,
  version: Number                  // Optimistic locking
}
```

### 1.3 Modelo: `Booking` (Registro histórico de reservas)
```javascript
{
  slotId: ObjectId,
  teacherId: ObjectId,
  studentId: ObjectId,
  clientId: ObjectId,              // Apoderado si aplica
  
  // === TIEMPO SNAPSHOT ===
  scheduledStart: Date,
  scheduledEnd: Date,
  teacherTimezone: String,
  studentTimezone: String,
  
  // === ESTADO LIFECYCLE ===
  status: String,                  // 'scheduled','completed','cancelled','no-show'
  statusHistory: [{
    status: String,
    changedAt: Date,
    changedBy: ObjectId,
    reason: String
  }],
  
  // === CLASE ===
  classConsumed: Boolean,          // ¿Se descontó del saldo?
  rating: Number,
  feedback: String,
  
  // === SESIÓN ===
  midiSessionId: String,
  actualStart: Date,
  actualEnd: Date,
  recordingUrl: String
}
```

---

## 2. ÍNDICES CRÍTICOS

```javascript
// TimeSlot - Búsqueda de disponibilidad
db.timeslots.createIndex({ teacherId: 1, startTime: 1, status: 1 })
db.timeslots.createIndex({ startTime: 1, status: 1 })  // Global search
db.timeslots.createIndex({ "booking.studentId": 1, startTime: 1 })

// Prevención double-booking (índice único parcial)
db.timeslots.createIndex(
  { teacherId: 1, startTime: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['available', 'pending', 'booked'] } } }
)
```

---

## 3. LÓGICA DE NEGOCIO

### 3.1 Generación de Slots (Cron Job o On-Demand)

```
ALGORITMO: generateSlotsFromTemplate(templateId, fromDate, toDate)

1. Cargar template con weeklySlots
2. Para cada día en rango [fromDate, toDate]:
   a. Obtener dayOfWeek
   b. Filtrar weeklySlots que apliquen
   c. Para cada weeklySlot:
      - Convertir startTime/endTime a UTC usando teacher.timezone
      - Verificar que no esté en exceptions[]
      - Verificar que no exista slot duplicado (upsert)
      - Crear TimeSlot con status='available'
3. Retornar slots creados
```

### 3.2 Flujo de Reserva (Anti Double-Booking)

```
ALGORITMO: bookSlot(slotId, studentId)

1. INICIAR TRANSACCIÓN
2. Buscar slot con findOneAndUpdate:
   - Filtro: { _id: slotId, status: 'available', version: currentVersion }
   - Update: { status: 'pending', booking: {...}, version: version+1 }
3. Si no encuentra (otro lo tomó):
   - ROLLBACK
   - Retornar { error: 'SLOT_UNAVAILABLE' }
4. Verificar saldo de clases del estudiante/cliente
5. Si saldo insuficiente:
   - Revertir slot a 'available'
   - ROLLBACK
   - Retornar { error: 'INSUFFICIENT_CLASSES' }
6. Descontar clase del saldo
7. Actualizar slot a status='booked'
8. Crear registro en Booking
9. Generar midiSession.sessionId y token
10. COMMIT
11. Enviar notificaciones (email, push)
12. Retornar { success: true, booking, joinUrl }
```

### 3.3 Buffer Time (Colchón)

```
ALGORITMO: getAvailableSlots(teacherId, date, studentTimezone)

1. Cargar slots del profesor para date con status='available'
2. Cargar slots 'booked' del mismo día
3. Para cada slot disponible:
   a. Calcular conflictoAnterior = slot.startTime - bufferMinutes
   b. Calcular conflictoPosterior = slot.endTime + bufferMinutes
   c. Si algún slot 'booked' intersecta [conflictoAnterior, conflictoPosterior]:
      - Marcar como NO disponible (soft-filter, no en DB)
4. Convertir horarios a studentTimezone para display
5. Retornar slots filtrados
```

---

## 4. API ENDPOINTS

### 4.1 Profesor
```
POST   /api/availability/template          → Crear plantilla
PUT    /api/availability/template/:id      → Editar plantilla
POST   /api/availability/generate          → Generar slots desde plantilla
GET    /api/availability/my-slots          → Ver mis slots (calendario)
PUT    /api/slots/:id/cancel               → Cancelar slot específico
POST   /api/slots/:id/block                → Bloquear horario manualmente
```

### 4.2 Estudiante
```
GET    /api/teachers/:id/availability      → Ver disponibilidad de profesor
GET    /api/availability/search            → Buscar slots (filtros: fecha, hora, profesor)
POST   /api/bookings                       → Reservar slot
DELETE /api/bookings/:id                   → Cancelar reserva
GET    /api/bookings/my                    → Mis reservas
```

### 4.3 Sesión MIDI
```
POST   /api/sessions/:bookingId/join       → Obtener token para unirse
POST   /api/sessions/:bookingId/start      → Profesor inicia sesión
POST   /api/sessions/:bookingId/end        → Finalizar y registrar
```

---

## 5. INTEGRACIÓN MIDI LINK

### 5.1 Generación de Sesión Única

```javascript
// Servicio: MidiSessionService.js

async function createMidiSession(booking) {
  const sessionId = `pl_${booking._id}_${Date.now()}`;
  const channelName = sessionId; // Agora usa esto
  
  // Generar token Agora con expiración
  const token = await agoraService.generateToken({
    channelName,
    uid: 0, // Server-side, students get unique UIDs
    role: 'publisher',
    expiresIn: booking.duration * 60 + 600 // +10min buffer
  });
  
  return {
    sessionId,
    channelName,
    token,
    tokenExpiry: new Date(Date.now() + (booking.duration + 10) * 60000),
    roomUrl: `${FRONTEND_URL}/class/${sessionId}`
  };
}
```

### 5.2 Arquitectura para Clases Grupales

```javascript
// El midiSession soporta múltiples participantes

midiSession: {
  sessionId: String,
  channelName: String,
  
  // Tokens por participante (grupales)
  participantTokens: [{
    odId: ObjectId,          // ID de participante
    role: String,              // 'teacher' | 'student'
    uid: Number,               // Agora UID único
    token: String,
    joined: Boolean,
    joinedAt: Date
  }],
  
  // Configuración MIDI grupal
  midiConfig: {
    teacherIsMaster: Boolean,  // Solo profesor envía MIDI
    allowStudentMidi: Boolean, // Estudiantes pueden tocar
    syncMode: String           // 'broadcast' | 'selective'
  }
}
```

---

## 6. UI/UX RECOMENDACIÓN

### 6.1 Módulo Profesor: Constructor Híbrido

```
┌─────────────────────────────────────────────────────────────┐
│  📅 Mi Disponibilidad                      [+ Nueva Plantilla] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PLANTILLA ACTIVA: "Horario Regular"                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Lun   Mar   Mié   Jue   Vie   Sáb   Dom            │    │
│  │ [■]   [■]   [■]   [■]   [■]   [ ]   [ ]            │    │
│  │                                                     │    │
│  │ Horario: [09:00] - [18:00]  Duración: [45 min ▼]   │    │
│  │ Colchón entre clases: [10 min]                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  EXCEPCIONES:                                               │
│  • 15 Feb 2026 - Vacaciones [Eliminar]                      │
│  [+ Agregar excepción]                                      │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  VISTA CALENDARIO (edición puntual):                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │     Lun 10    Mar 11    Mié 12    Jue 13           │    │
│  │ 09  [  ✓  ]   [  ✓  ]   [BLOQ]    [  ✓  ]          │    │
│  │ 10  [RESERV]  [  ✓  ]   [  ✓  ]   [  ✓  ]          │    │
│  │ 11  [  ✓  ]   [RESERV]  [  ✓  ]   [  ✓  ]          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Leyenda: ✓=Disponible  RESERV=Con alumno  BLOQ=Bloqueado   │
└─────────────────────────────────────────────────────────────┘
```

**Recomendación**: Constructor recurrente (plantilla) + Override manual en calendario.

### 6.2 Módulo Estudiante: Vista de Reserva

```
┌─────────────────────────────────────────────────────────────┐
│  🎹 Reservar Clase con Prof. María García                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Tu zona horaria: America/Santiago (UTC-3)  [Cambiar]       │
│                                                             │
│  Febrero 2026                        [<] Semana 2 [>]       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │     Lun 10    Mar 11    Mié 12    Jue 13    Vie 14  │    │
│  │                                                     │    │
│  │ AM  [09:00]   [09:00]   ------    [09:00]   [09:00] │    │
│  │     [10:00]   ------    ------    [10:00]   [10:00] │    │
│  │     [11:00]   [11:00]   [11:00]   [11:00]   ------  │    │
│  │                                                     │    │
│  │ PM  [14:00]   [14:00]   [14:00]   ------    [14:00] │    │
│  │     [15:00]   [15:00]   ------    [15:00]   [15:00] │    │
│  │     [16:00]   ------    [16:00]   [16:00]   [16:00] │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Slot seleccionado: Martes 11, 14:00 - 14:45 (tu hora)      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ⚠️ Verificación de Setup MIDI                       │    │
│  │                                                     │    │
│  │ [ ] Tengo piano/teclado MIDI conectado             │    │
│  │ [ ] He probado mi conexión de audio                │    │
│  │                                                     │    │
│  │ [🔌 Probar conexión MIDI ahora]                    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Clases disponibles: 3                                      │
│                                                             │
│           [Cancelar]    [✅ Confirmar Reserva]              │
└─────────────────────────────────────────────────────────────┘
```

**UX Key Points**:
1. Mostrar SIEMPRE en timezone del estudiante
2. Verificación MIDI pre-reserva (checkbox + test opcional)
3. Mostrar saldo de clases restantes
4. Slots ya tomados simplemente no aparecen (no mostrar "ocupado")

---

## 7. FLUJO DE ESTADOS

```
                    ┌──────────────┐
                    │  AVAILABLE   │
                    └──────┬───────┘
                           │ bookSlot()
                           ▼
                    ┌──────────────┐
        ┌──────────│   PENDING    │──────────┐
        │ timeout  └──────┬───────┘ confirm  │
        │                 │                   │
        ▼                 ▼                   ▼
┌──────────────┐  ┌──────────────┐    ┌──────────────┐
│  AVAILABLE   │  │   BOOKED     │    │  CANCELLED   │
└──────────────┘  └──────┬───────┘    └──────────────┘
                         │ startSession()
                         ▼
                  ┌──────────────┐
       ┌─────────│  IN_PROGRESS │─────────┐
       │         └──────────────┘         │
       │ completa                  no-show │
       ▼                                   ▼
┌──────────────┐                   ┌──────────────┐
│  COMPLETED   │                   │   NO_SHOW    │
└──────────────┘                   └──────────────┘
```

---

## 8. IMPLEMENTACIÓN SUGERIDA (Orden)

### Fase 1: Core (1-2 días)
1. Crear modelos: `AvailabilityTemplate`, `TimeSlot`, `Booking`
2. API CRUD de templates
3. Generador de slots desde template

### Fase 2: Reservas (1-2 días)
4. Endpoint GET disponibilidad con conversión timezone
5. Endpoint POST booking con transacción
6. Integración con sistema de clases (descontar saldo)

### Fase 3: UI (2-3 días)
7. Vista profesor: Constructor de plantilla + Calendario
8. Vista estudiante: Selector de slots + Verificación MIDI
9. Mis reservas (ambos roles)

### Fase 4: MIDI Link (1 día)
10. Generación de sessionId/token al confirmar booking
11. Endpoint /join para obtener credenciales
12. Integración con componente de clase existente

### Fase 5: Notificaciones (1 día)
13. Email de confirmación de reserva
14. Recordatorio 24h y 1h antes
15. Webhook para cancelaciones

---

## 9. CONSIDERACIONES TÉCNICAS

### Timezone Handling
```javascript
// SIEMPRE almacenar en UTC
const slot = {
  startTime: moment.tz('2026-02-10 09:00', teacherTimezone).utc().toDate(),
  endTime: moment.tz('2026-02-10 09:45', teacherTimezone).utc().toDate()
};

// SIEMPRE convertir al mostrar
const displayTime = moment(slot.startTime).tz(studentTimezone).format('HH:mm');
```

### Prevención de Race Conditions
```javascript
// Usar findOneAndUpdate con version check
const result = await TimeSlot.findOneAndUpdate(
  { _id: slotId, status: 'available', version: expectedVersion },
  { 
    $set: { status: 'pending', 'booking.studentId': studentId },
    $inc: { version: 1 }
  },
  { new: true }
);

if (!result) throw new Error('SLOT_UNAVAILABLE');
```

### Limpieza de Slots Pendientes (Cron)
```javascript
// Cada 5 minutos, revertir slots 'pending' > 10 min
await TimeSlot.updateMany(
  { 
    status: 'pending',
    'booking.bookedAt': { $lt: new Date(Date.now() - 10 * 60000) }
  },
  { $set: { status: 'available' }, $unset: { booking: 1 } }
);
```

---

## 10. ARCHIVOS A CREAR

```
models/
  ├── AvailabilityTemplate.js
  ├── TimeSlot.js
  └── Booking.js

services/
  ├── AvailabilityService.js    # Generación de slots
  ├── BookingService.js         # Lógica de reserva
  └── MidiSessionService.js     # Tokens Agora

routes/
  ├── availabilityRoutes.js
  └── bookingRoutes.js

public/
  ├── teacher-calendar.html     # Vista profesor
  └── student-booking.html      # Vista estudiante

public/js/
  ├── teacher-calendar.js
  └── student-booking.js
```

---

*Blueprint creado: 4 Feb 2026 | PianoLink v2.0*
