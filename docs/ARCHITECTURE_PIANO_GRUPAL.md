# 🎹 Arquitectura "Piano Link Grupal" - Laboratorio de Piano

**Versión:** 1.0.0  
**Fecha:** Enero 2026  
**Autor:** Arquitectura de Sistemas  

---

## 📋 Resumen Ejecutivo

Este documento presenta el diseño arquitectónico para evolucionar Piano Link de un modelo **1-a-1** a un modelo de **"Clase Individual en Ambiente Grupal"** (hasta 10 estudiantes simultáneos).

### Pilares del Diseño

| Pilar | Descripción |
|-------|-------------|
| **Aislamiento** | Cada alumno practica en su "burbuja" (MIDI/Audio/Video privados) |
| **Visita Selectiva** | El profesor puede entrar a la burbuja de cualquier alumno |
| **Modo Global** | Broadcast para cierres grupales y gamificación |
| **Zero Latency Switch** | Cambio instantáneo entre alumnos (<50ms) |

---

## 🔍 PARTE 1: Auditoría del Código Actual

### 1.1 Estructura Actual de Salas y Sesiones

```
📁 server.js - Líneas 850-880
────────────────────────────────────────────────────────────────────
const rooms = {
    "ABCD": {
        users: {
            "socket-id-1": { name: "Profesor", role: "teacher", pdfState: {...}, activeNotes: Set },
            "socket-id-2": { name: "Alumno1", role: "student", pdfState: {...}, activeNotes: Set }
        },
        isActive: boolean,
        broadcaster: string | null,      // ID del alumno "estrella"
        teacherActiveNotes: Set<number>, // Notas activas del profesor
        lastSnapshot: [],
        lastActivityTime: timestamp
    }
}
```

#### ✅ Fortalezas Encontradas

1. **Broadcaster System**: Ya existe lógica para designar un "alumno estrella" cuya partitura se sincroniza con toda la clase.

2. **Modo Espía (Spy Mode)**: El profesor puede ver la partitura de cualquier alumno:
   - [Main.js#L1117-L1127](public/js/Main.js#L1117-L1127) - Handler `ui-spy-user`
   - [UIManager.js#L528-L570](public/js/modules/UIManager.js#L528-L570) - Botón 👁️

3. **CUE System**: Audio puede filtrarse por usuario:
   - [AudioEngine.js#L202](public/js/modules/AudioEngine.js#L202) - `setSoloUser()`
   - [AudioEngine.js#L231](public/js/modules/AudioEngine.js#L231) - Filtrado por `soloUserId`

4. **PDF State Tracking**: Cada usuario tiene su estado de partitura independiente.

#### ⚠️ Limitaciones Identificadas

| Limitación | Archivo | Impacto |
|------------|---------|---------|
| **MIDI Broadcast Global** | server.js:410 | Todo MIDI va a todos los usuarios de la sala |
| **Sin estados de fase** | server.js:850 | No hay concepto de "Practicing", "Focused", "Global" |
| **1 Broadcaster único** | server.js:507 | No hay "focus privado" profesor-alumno |
| **Video P2P** | VideoManager.js | No escala a 10 miniaturas sin SFU |
| **Sin MIDI Flush** | - | Al cambiar de alumno, notas pueden quedar pegadas |

---

### 1.2 Flujo Actual del Modo Espía

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO MODO ESPÍA ACTUAL                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Profesor hace clic en 👁️ (botón spy)                       │
│         │                                                       │
│         ▼                                                       │
│  2. UIManager emite "ui-spy-user" con:                         │
│     { userId, url, page, scoreId }                             │
│         │                                                       │
│         ▼                                                       │
│  3. Main.js guarda spiedUserId = userId                        │
│         │                                                       │
│         ▼                                                       │
│  4. ScoreLogic.silentLoad(url, page, scoreId)                  │
│     → Carga PDF del alumno sin emitir sync                     │
│         │                                                       │
│         ▼                                                       │
│  5. Cuando alumno cambia página, Main.js detecta:              │
│     if (iAmTeacher && senderId === spiedUserId) → Sync!        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### ❌ Problema Crítico: Falta Sincronización de MIDI

Cuando el profesor "espía" a un alumno:
- ✅ Ve su PDF
- ❌ **NO escucha su MIDI** (solo si activa CUE manualmente)
- ❌ **NO activa video/audio** automáticamente

---

## 🏗️ PARTE 2: Arquitectura Propuesta

### 2.1 Nueva Estructura de Sala

```javascript
const rooms = {
    "ABCD": {
        // === METADATA ===
        isActive: boolean,
        phase: "INDIVIDUAL" | "GLOBAL",  // 🆕 Fase actual de la clase
        
        // === USUARIOS ===
        users: {
            "socket-teacher": {
                name: "Profesor",
                role: "teacher",
                pdfState: { url, page, scoreId },
                activeNotes: Set<number>,
                // 🆕 Estado del profesor en fase individual
                focusedStudent: "socket-alumno-1" | null,  // Alumno visitado
                lastFocusSwitch: timestamp
            },
            "socket-alumno-1": {
                name: "Alumno1",
                role: "student",
                pdfState: { url, page, scoreId },
                activeNotes: Set<number>,
                // 🆕 Estado del estudiante
                state: "PRACTICING" | "FOCUSED" | "GLOBAL",
                isBeingObserved: boolean,  // El profesor está visitando
                lastMidiActivity: timestamp
            }
        },
        
        // === 🆕 ENRUTAMIENTO SELECTIVO ===
        midiRouting: {
            teacherToAll: boolean,        // Profesor → Todos (solo en GLOBAL)
            studentToTeacher: boolean,    // Alumno → Profesor (solo si FOCUSED)
            studentToStudent: boolean     // Alumno → Alumno (solo en GLOBAL)
        },
        
        // === ESTADO GLOBAL ===
        broadcaster: null,               // Para GLOBAL phase
        teacherActiveNotes: Set<number>
    }
}
```

### 2.2 Diagrama de Fases

```
╔════════════════════════════════════════════════════════════════════════════╗
║                         FASES DE CLASE GRUPAL                              ║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  ┌──────────────────────────────────────────────────────────────────────┐  ║
║  │                    FASE INDIVIDUAL (90% del tiempo)                   │  ║
║  │ ┌─────────────────────────────────────────────────────────────────┐  │  ║
║  │ │                                                                 │  │  ║
║  │ │   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐           │  │  ║
║  │ │   │ Alumno1 │  │ Alumno2 │  │ Alumno3 │  │ Alumno4 │  ...      │  │  ║
║  │ │   │ 🎹 📄   │  │ 🎹 📄   │  │ 🎹 📄   │  │ 🎹 📄   │           │  │  ║
║  │ │   │ AISLADO │  │ AISLADO │  │ AISLADO │  │ AISLADO │           │  │  ║
║  │ │   └────┬────┘  └─────────┘  └─────────┘  └─────────┘           │  │  ║
║  │ │        │                                                        │  │  ║
║  │ │        │ "VISITA" (Profesor hace click)                        │  │  ║
║  │ │        ▼                                                        │  │  ║
║  │ │   ┌────────────────────────────────────────────┐               │  │  ║
║  │ │   │            BURBUJA PRIVADA                  │               │  │  ║
║  │ │   │  ┌─────────┐        ┌─────────┐            │               │  │  ║
║  │ │   │  │ PROFESOR│◄──────►│ Alumno1 │            │               │  │  ║
║  │ │   │  │ 👁️ 🎧📹 │  MIDI  │ 🎹📹🎤 │            │               │  │  ║
║  │ │   │  │         │  VIDEO │         │            │               │  │  ║
║  │ │   │  │ Anotar  │  AUDIO │ FOCUSED │            │               │  │  ║
║  │ │   │  │ PDF     │        │         │            │               │  │  ║
║  │ │   │  └─────────┘        └─────────┘            │               │  │  ║
║  │ │   └────────────────────────────────────────────┘               │  │  ║
║  │ │                                                                 │  │  ║
║  │ └─────────────────────────────────────────────────────────────────┘  │  ║
║  └──────────────────────────────────────────────────────────────────────┘  ║
║                                                                            ║
║  ┌──────────────────────────────────────────────────────────────────────┐  ║
║  │                    FASE GLOBAL (10% del tiempo)                       │  ║
║  │                                                                       │  ║
║  │     ┌─────────┐                                                       │  ║
║  │     │ PROFESOR│                                                       │  ║
║  │     │ 📡 ALL  │                                                       │  ║
║  │     └────┬────┘                                                       │  ║
║  │          │ BROADCAST                                                  │  ║
║  │    ┌─────┴─────┬─────────┬─────────┐                                 │  ║
║  │    ▼           ▼         ▼         ▼                                  │  ║
║  │ ┌─────────┐┌─────────┐┌─────────┐┌─────────┐                         │  ║
║  │ │ Alumno1 ││ Alumno2 ││ Alumno3 ││ Alumno4 │ ...                     │  ║
║  │ │ ESCUCHA ││ ESCUCHA ││ ESCUCHA ││ ESCUCHA │                         │  ║
║  │ │ VE TODO ││ VE TODO ││ VE TODO ││ VE TODO │                         │  ║
║  │ └─────────┘└─────────┘└─────────┘└─────────┘                         │  ║
║  │                                                                       │  ║
║  │  💡 Gamificación: Todos pueden enviar MIDI para juegos grupales     │  ║
║  └──────────────────────────────────────────────────────────────────────┘  ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
```

---

## 🔄 PARTE 3: Matriz de Conmutación MIDI

### 3.1 Lógica del Servidor

```javascript
// server.js - NUEVO: Matriz de Conmutación MIDI

/**
 * Determina el destino de un mensaje MIDI basado en:
 * - Fase de la clase (INDIVIDUAL vs GLOBAL)
 * - Rol del emisor (teacher vs student)
 * - Estado del focus (si hay visita activa)
 */
function getMidiRoutingTargets(roomCode, senderSocketId) {
    const room = rooms[roomCode];
    if (!room) return [];
    
    const sender = room.users[senderSocketId];
    if (!sender) return [];
    
    const targets = [];
    
    // === FASE GLOBAL ===
    if (room.phase === 'GLOBAL') {
        // Todos escuchan a todos
        Object.keys(room.users).forEach(socketId => {
            if (socketId !== senderSocketId) {
                targets.push(socketId);
            }
        });
        return targets;
    }
    
    // === FASE INDIVIDUAL ===
    
    // Caso 1: Profesor envía MIDI
    if (sender.role === 'teacher' || sender.role === 'admin') {
        // El profesor solo envía al alumno enfocado (si hay uno)
        if (sender.focusedStudent) {
            targets.push(sender.focusedStudent);
        }
        // Si no hay focus, el profesor no transmite MIDI a nadie (está en overview)
        return targets;
    }
    
    // Caso 2: Alumno envía MIDI
    if (sender.role === 'student') {
        // Buscar si algún profesor lo tiene enfocado
        Object.entries(room.users).forEach(([socketId, user]) => {
            if ((user.role === 'teacher' || user.role === 'admin') 
                && user.focusedStudent === senderSocketId) {
                // Este profesor está visitando a este alumno
                targets.push(socketId);
            }
        });
        
        // En fase individual, alumnos NO escuchan a otros alumnos
        return targets;
    }
    
    return targets;
}
```

### 3.2 Evento de Cambio de Focus

```javascript
// server.js - NUEVO: Switch de Focus con MIDI Flush

socket.on("focus-student", (targetStudentId) => {
    const roomCode = socket.roomCode;
    const room = rooms[roomCode];
    
    // Validación: Solo profesores
    if (!validateUserInRoom(socket, roomCode, 'teacher')) {
        return;
    }
    
    const teacher = room.users[socket.id];
    const previousFocus = teacher.focusedStudent;
    
    // === PASO 1: MIDI FLUSH DEL ALUMNO ANTERIOR ===
    if (previousFocus && room.users[previousFocus]) {
        const prevStudent = room.users[previousFocus];
        
        // Enviar All Notes Off (CC 123) al profesor
        const allNotesOff = createMidiFlush();
        socket.emit('midi-flush', {
            targetId: previousFocus,
            data: allNotesOff
        });
        
        // Marcar alumno como no observado
        prevStudent.state = 'PRACTICING';
        prevStudent.isBeingObserved = false;
        
        // Notificar al alumno anterior
        io.to(previousFocus).emit('observation-ended', {
            teacherId: socket.id
        });
    }
    
    // === PASO 2: ACTIVAR NUEVO FOCUS ===
    teacher.focusedStudent = targetStudentId;
    teacher.lastFocusSwitch = Date.now();
    
    if (targetStudentId && room.users[targetStudentId]) {
        const newStudent = room.users[targetStudentId];
        newStudent.state = 'FOCUSED';
        newStudent.isBeingObserved = true;
        
        // Notificar al nuevo alumno
        io.to(targetStudentId).emit('observation-started', {
            teacherId: socket.id,
            teacherName: teacher.name
        });
        
        // Enviar estado PDF del alumno al profesor
        socket.emit('sync-student-pdf', {
            studentId: targetStudentId,
            pdfState: newStudent.pdfState
        });
        
        // Enviar snapshot de notas activas del alumno
        if (newStudent.activeNotes.size > 0) {
            socket.emit('midi-snapshot', {
                notes: Array.from(newStudent.activeNotes),
                userId: targetStudentId,
                timestamp: Date.now(),
                type: 'focus-switch'
            });
        }
    }
    
    // === PASO 3: ACTUALIZAR UI DE TODOS ===
    broadcastUserList(roomCode);
});

/**
 * Crea un mensaje MIDI Flush (All Notes Off + Sustain Off)
 */
function createMidiFlush() {
    return {
        messages: [
            { status: 176, data1: 123, data2: 0 },   // All Notes Off (CC 123)
            { status: 176, data1: 64, data2: 0 },    // Sustain Off (CC 64)
            { status: 176, data1: 66, data2: 0 },    // Sostenuto Off (CC 66)
            { status: 176, data1: 67, data2: 0 }     // Soft Pedal Off (CC 67)
        ],
        timestamp: Date.now()
    };
}
```

---

## 📹 PARTE 4: Arquitectura de Video/Audio

### 4.1 Análisis de Opciones

| Opción | Pros | Contras | Recomendación |
|--------|------|---------|---------------|
| **P2P Actual** | Simple, bajo coste | No escala a 10 videos | ❌ |
| **SFU (Selective Forwarding)** | Escala bien, bajo latency | Requiere servidor dedicado | ✅ Producción |
| **MCU (Mixing)** | Un solo stream al cliente | Alta latency, coste CPU | ❌ |
| **Agora Cloud** | Ya integrado, Simulcast | Coste por minuto | ✅ MVP |

### 4.2 Diseño Dashboard del Profesor (Agora SFU)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        DASHBOARD DEL PROFESOR                              │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     VIDEO PRINCIPAL (Grande)                          │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │                                                                │  │  │
│  │  │                    ALUMNO ENFOCADO                             │  │  │
│  │  │                    📹 HD Quality                                │  │  │
│  │  │                    🎤 Audio activo                              │  │  │
│  │  │                    🎹 MIDI entrante                             │  │  │
│  │  │                                                                │  │  │
│  │  │     ┌─────────────────────────────────────────────────────┐   │  │  │
│  │  │     │  Nombre: Juan García  |  🎹 Actividad MIDI: ████░░  │   │  │  │
│  │  │     └─────────────────────────────────────────────────────┘   │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     GRID DE MINIATURAS (Thumbnails)                   │  │
│  │                                                                       │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │  │
│  │  │ 👤 A1   │ │ 👤 A2   │ │ 👤 A3   │ │ 👤 A4   │ │ 👤 A5   │        │  │
│  │  │ ████░░  │ │ ░░░░░░  │ │ ██████  │ │ ░░░░░░  │ │ ███░░░  │        │  │
│  │  │ 160x120 │ │ 160x120 │ │ 160x120 │ │ 160x120 │ │ 160x120 │        │  │
│  │  │ [Muted] │ │ [Muted] │ │ [Muted] │ │ [Muted] │ │ [Muted] │        │  │
│  │  └────┬────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘        │  │
│  │       │ Click → Focus                                                │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │  │
│  │  │ 👤 A6   │ │ 👤 A7   │ │ 👤 A8   │ │ 👤 A9   │ │ 👤 A10  │        │  │
│  │  │ ░░░░░░  │ │ █████░  │ │ ░░░░░░  │ │ ██░░░░  │ │ ░░░░░░  │        │  │
│  │  │ 160x120 │ │ 160x120 │ │ 160x120 │ │ 160x120 │ │ 160x120 │        │  │
│  │  │ [Muted] │ │ [Muted] │ │ [Muted] │ │ [Muted] │ │ [Muted] │        │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘        │  │
│  │                                                                       │  │
│  │  █████ = Actividad MIDI en tiempo real (últimos 5 segundos)          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  [🌐 MODO GLOBAL]    [🎮 GAMIFICACIÓN]    [❌ CERRAR CLASE]          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Configuración Agora Simulcast

```javascript
// VideoManager.js - Configuración para Dashboard

const SIMULCAST_CONFIG = {
    // Video del profesor (alta calidad)
    teacher: {
        encoderConfig: '720p_2',  // 1280x720, 30fps, 1130kbps
        optimizationMode: 'detail'
    },
    
    // Video de alumnos (baja calidad para grid)
    studentThumbnail: {
        encoderConfig: {
            width: 160,
            height: 120,
            frameRate: 15,
            bitrateMax: 100  // 100kbps por thumbnail
        },
        optimizationMode: 'motion'
    },
    
    // Video del alumno enfocado (calidad media-alta)
    studentFocused: {
        encoderConfig: '480p_1',  // 640x480, 15fps, 500kbps
        optimizationMode: 'detail'
    }
};

/**
 * Actualiza la calidad de video de un alumno según su estado
 */
async function updateStudentVideoQuality(studentUid, isFocused) {
    const config = isFocused 
        ? SIMULCAST_CONFIG.studentFocused 
        : SIMULCAST_CONFIG.studentThumbnail;
    
    // En Agora, esto se hace con setRemoteVideoStreamType
    // LOW = thumbnail, HIGH = focused
    const streamType = isFocused ? 0 : 1;  // 0 = HIGH, 1 = LOW
    
    await client.setRemoteVideoStreamType(studentUid, streamType);
    
    console.log(`[Video] Calidad de ${studentUid}: ${isFocused ? 'FOCUSED' : 'THUMBNAIL'}`);
}
```

### 4.4 Ancho de Banda Estimado

| Escenario | Upload Profesor | Download Profesor | Total |
|-----------|-----------------|-------------------|-------|
| 10 thumbnails (idle) | 1.1 Mbps | 1 Mbps | 2.1 Mbps |
| 9 thumbnails + 1 focused | 1.1 Mbps | 1.4 Mbps | 2.5 Mbps |
| Modo Global (todos HD) | 1.1 Mbps | 5 Mbps | 6.1 Mbps ⚠️ |

**Recomendación:** Limitar Modo Global a 15fps y 360p para alumnos.

---

## 🔔 PARTE 5: Protocolo de Notificaciones

### 5.1 Mensajes JSON

```typescript
// === EVENTOS SERVIDOR → CLIENTE ===

interface ObservationStarted {
    event: 'observation-started';
    payload: {
        teacherId: string;
        teacherName: string;
        timestamp: number;
    };
}

interface ObservationEnded {
    event: 'observation-ended';
    payload: {
        teacherId: string;
        duration: number;  // ms que duró la observación
    };
}

interface PhaseChanged {
    event: 'phase-changed';
    payload: {
        phase: 'INDIVIDUAL' | 'GLOBAL';
        initiatedBy: string;  // ID del profesor
        gamificationMode?: 'BATTLE' | 'SYNC' | 'FREE';  // Solo en GLOBAL
    };
}

interface MidiFlush {
    event: 'midi-flush';
    payload: {
        targetId: string;     // Alumno cuyas notas deben apagarse
        messages: MidiMessage[];
    };
}

interface StudentStateChanged {
    event: 'student-state-changed';
    payload: {
        studentId: string;
        newState: 'PRACTICING' | 'FOCUSED' | 'GLOBAL';
        observedBy?: string;  // Solo si FOCUSED
    };
}

// === EVENTOS CLIENTE → SERVIDOR ===

interface FocusStudent {
    event: 'focus-student';
    payload: {
        studentId: string | null;  // null para dejar de observar
    };
}

interface SetPhase {
    event: 'set-phase';
    payload: {
        phase: 'INDIVIDUAL' | 'GLOBAL';
        gamificationMode?: string;
    };
}
```

### 5.2 Indicador Visual para el Alumno

```javascript
// Cliente del alumno - Mostrar notificación elegante

socket.on('observation-started', (data) => {
    // Mostrar banner discreto pero visible
    showObservationBanner({
        message: `${data.teacherName} está observando tu clase`,
        icon: '👁️',
        color: '#3498db',
        persistent: true  // No desaparece solo
    });
    
    // Opcional: Efecto visual en el borde del visor
    document.querySelector('.main-stage').classList.add('being-observed');
});

socket.on('observation-ended', (data) => {
    hideObservationBanner();
    document.querySelector('.main-stage').classList.remove('being-observed');
    
    // Feedback breve
    showToast('El profesor continuó con otro alumno', 2000);
});
```

**CSS para efecto visual:**
```css
.main-stage.being-observed {
    box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.5);
    animation: pulse-border 2s infinite;
}

@keyframes pulse-border {
    0%, 100% { box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.5); }
    50% { box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.8); }
}
```

---

## 📊 PARTE 6: Hoja de Ruta (Phases)

### Fase 1: Backend - Enrutamiento Selectivo (2-3 semanas)

#### Entregables
1. **Nueva estructura de sala** con estados y fases
2. **Matriz de conmutación MIDI** (`getMidiRoutingTargets`)
3. **Evento `focus-student`** con MIDI Flush
4. **Eventos de fase** (INDIVIDUAL ↔ GLOBAL)

#### Archivos a Modificar
| Archivo | Cambios |
|---------|---------|
| `server.js` | Nueva estructura rooms, routing selectivo, eventos de fase |
| `SocketClient.js` | Nuevos listeners, emisión de focus-student |
| `Main.js` | Integración de focus con Modo Espía existente |

#### Tests de Aceptación
- [ ] MIDI del alumno A NO llega al alumno B en fase INDIVIDUAL
- [ ] MIDI del alumno enfocado SÍ llega al profesor
- [ ] Al cambiar de alumno, se recibe MIDI Flush (CC123)
- [ ] En fase GLOBAL, todos reciben MIDI de todos

---

### Fase 2: Dashboard del Profesor (3-4 semanas)

#### Entregables
1. **Grid de miniaturas** (10 videos simultáneos)
2. **Monitor de actividad MIDI** por alumno (barras visuales)
3. **Click para enfocar** (video grande + audio + MIDI)
4. **Indicadores de estado** (PRACTICING, FOCUSED)

#### Componentes Nuevos
```
public/js/modules/
├── TeacherDashboard.js      # Controlador principal
├── StudentThumbnail.js      # Componente de miniatura
├── MidiActivityMonitor.js   # Barras de actividad
└── FocusedView.js           # Vista del alumno enfocado
```

#### Tests de Aceptación
- [ ] 10 videos cargando sin freezear el browser
- [ ] Click en thumbnail → Video grande + Audio
- [ ] Barra de actividad MIDI se actualiza en tiempo real
- [ ] Switch entre alumnos < 200ms

---

### Fase 3: Modo Global y Gamificación (2-3 semanas)

#### Entregables
1. **Botón Modo Global** (profesor)
2. **Broadcast de MIDI** a todos
3. **Minijuego "Sync"**: Todos tocan la misma nota
4. **Minijuego "Battle"**: Competencia de velocidad/precisión

#### Mecánicas de Gamificación
```javascript
const GAME_MODES = {
    SYNC: {
        name: 'Sincronización',
        description: 'Todos tocan la nota indicada al mismo tiempo',
        scoring: (targetNote, playedNote, timing) => {
            if (playedNote !== targetNote) return 0;
            const timingPenalty = Math.abs(timing) * 0.1;
            return Math.max(0, 100 - timingPenalty);
        }
    },
    
    BATTLE: {
        name: 'Batalla',
        description: 'Toca la secuencia más rápido',
        scoring: (sequence, playedNotes, totalTime) => {
            const accuracy = calculateAccuracy(sequence, playedNotes);
            const speedBonus = Math.max(0, 5000 - totalTime) / 50;
            return accuracy * 100 + speedBonus;
        }
    },
    
    FREE: {
        name: 'Jam Session',
        description: 'Improvisación grupal',
        scoring: null  // Sin puntuación
    }
};
```

#### Tests de Aceptación
- [ ] Profesor puede activar/desactivar Modo Global
- [ ] En Global, MIDI de todos llega a todos
- [ ] Minijuego muestra puntajes en tiempo real
- [ ] Al volver a INDIVIDUAL, alumnos quedan aislados

---

## 🧮 Estimación de Recursos

### VPS Requerido para 10 Alumnos Simultáneos

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| **CPU** | 2 vCPU | 4 vCPU |
| **RAM** | 4 GB | 8 GB |
| **Bandwidth** | 100 Mbps | 250 Mbps |
| **Storage** | 40 GB SSD | 80 GB SSD |

### Coste Mensual Estimado (Render/Railway)

| Servicio | Plan | Coste/mes |
|----------|------|-----------|
| Node.js Server | Pro (2 CPU, 4GB) | $25 |
| MongoDB Atlas | M10 | $57 |
| Agora Video | 10k min/mes | $50-100 |
| Cloudinary | Pro | $89 |
| **Total** | | **$220-270/mes** |

---

## ✅ Conclusiones y Próximos Pasos

### Resumen de Viabilidad

| Aspecto | Estado | Notas |
|---------|--------|-------|
| **Backend Routing** | 🟢 Viable | Evolución natural de estructura existente |
| **Modo Espía** | 🟢 Listo | Solo falta integrar MIDI y Audio |
| **Video 10 usuarios** | 🟡 Requiere SFU | Agora Simulcast ya soportado |
| **Gamificación** | 🟢 Extensible | MIDI tracking ya funciona |

### Acciones Inmediatas

1. **Crear branch** `feature/grupal-phase-1`
2. **Implementar** nueva estructura de `rooms` con estados
3. **Agregar** evento `focus-student` con MIDI Flush
4. **Probar** con 3 usuarios antes de escalar a 10

---

**Documento preparado para revisión técnica.**

*"La transición debe ser fluida y el profesor debe sentir control total de la sala."*
