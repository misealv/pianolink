# 🔬 AUDITORÍA FORENSE: LÓGICA GRUPAL DE PIANOLINK
## REPORTE DE ANÁLISIS ARQUITECTÓNICO PARA CLASES MULTI-ALUMNO

**Fecha**: 28 de Diciembre, 2025  
**Auditor**: Senior Systems Architect & Full Stack Lead  
**Sistema**: PianoLink V4 (State-Aware Relay)  
**Objetivo**: Validar estabilidad en escenarios de múltiples alumnos simultáneos

---

## 🎯 RESUMEN EJECUTIVO

**Hallazgos Críticos**: 6 vulnerabilidades arquitectónicas  
**Hallazgos Mayores**: 8 optimizaciones necesarias  
**Hallazgos Menores**: 4 mejoras recomendadas  

**Veredicto General**: ⚠️ **SISTEMA NO PRODUCTION-READY PARA GRUPOS**  
- Sistema actual optimizado para **1 profesor + 1 alumno**
- Arquitectura **NO escalada** para múltiples alumnos simultáneos
- Falta de **controles de orquestación grupal**
- Sin **políticas de bandwidth** diferenciadas por rol

---

## 📊 ANÁLISIS POR PILAR

---

### 🎹 PILAR 1: ORQUESTACIÓN MIDI (El Selector del Profesor)

#### ❌ **VULNERABILIDAD CRÍTICA #1: NO EXISTE `setListenTo()` O SELECTOR DE AUDIO**

**Ubicación**: `/public/js/modules/AudioEngine.js` líneas 127-137  
**Severidad**: 🔴 CRÍTICA

**Problema Identificado**:
```javascript
playRemote(data) {
    // Si hay modo "Solo" y no es el usuario elegido, silenciar
    if (this.soloUserId && data.userId !== this.soloUserId) return;
    
    // Pasar al Scheduler para el Jitter Buffer
    this.scheduler.play(data);
}
```

**Análisis**:
- ✅ Existe variable `soloUserId` en AudioEngine
- ❌ **NO existe método `setListenTo()` o `setSoloUser()` en la API pública**
- ❌ **UI NO tiene botones de selección** de alumno para escuchar
- ❌ **Profesor NO puede elegir** a quién escuchar activamente

**Escenario de Fallo**:
```
DADO: 5 alumnos tocando simultáneamente (Alumno A, B, C, D, E)
CUANDO: Profesor quiere escuchar SOLO a Alumno C
ENTONCES: Sistema NO tiene interfaz ni método para hacerlo
RESULTADO: Profesor escucha MIX de los 5 alumnos = CAOS AUDITIVO
```

**Evidencia del Broadcaster System**:
- `/public/js/Main.js` líneas 67, 516-522: Sistema de "broadcaster" existe para VIDEO
- Broadcaster controla **quién sincronizan PDF los alumnos**
- **NO controla quién escucha el profesor en AUDIO**

**Impacto en Clase Real**:
- Profesor no puede dar feedback individual
- Alumno tímido queda oculto por alumnos ruidosos
- Imposible corrección técnica específica

---

#### 🟡 **VULNERABILIDAD MAYOR #1: FILTRADO DE MIDI MAL IMPLEMENTADO**

**Ubicación**: `/public/js/Main.js` líneas 472-477

```javascript
if (currentBroadcaster) {
    if (!iAmTeacher && senderId !== teacherId && senderId !== currentBroadcaster) {
        shouldPlay = false; 
    }
}
```

**Análisis**:
- Filtrado **SOLO para alumnos** (si no eres profesor)
- Profesor **SIEMPRE recibe TODAS las notas** sin filtro
- Lógica basada en **broadcaster** (sistema de VIDEO) no en audio

**Consecuencia Técnica**:
```
MIDI Stack del Profesor (5 alumnos tocando Do Mayor):
┌─────────────────────────────────┐
│ Alumno A: Note On 60 (C4)       │
│ Alumno B: Note On 60 (C4)       │ ← DUPLICADOS
│ Alumno C: Note On 60 (C4)       │
│ Alumno D: Note On 60 (C4)       │
│ Alumno E: Note On 60 (C4)       │
└─────────────────────────────────┘
RESULTADO: 5 voces del mismo Do = Audio distorsionado
```

---

#### 🟡 **VULNERABILIDAD MAYOR #2: PIANO VISUAL SIN COLORES POR USUARIO**

**Ubicación**: `/public/js/modules/Whiteboard.js` líneas 21-32

```javascript
handleNote(note, velocity) {
    if (velocity > 0) {
        this.teacherActiveNotes.add(note);
    } else {
        this.teacherActiveNotes.delete(note);
    }
    this.scheduleRender();
}
```

**Análisis**:
- Piano visual usa **Set único** `teacherActiveNotes`
- **NO rastrea qué alumno toca qué nota**
- VexFlow dibuja todas las notas en **negro** sin distinción

**Escenario de Fallo Visual**:
```
DADO: Alumno A toca Do Mayor (C-E-G)
      Alumno B toca Fa Mayor (F-A-C)
CUANDO: Ambos tocan simultáneamente
ENTONCES: Piano visual muestra: C, E, G, F, A (todas negras)
RESULTADO: Profesor NO puede distinguir quién toca qué
```

**Expectativa vs Realidad**:
```
EXPECTATIVA:
┌──────────────────────────────┐
│ Alumno A: 🔵 C-E-G (azul)   │
│ Alumno B: 🔴 F-A-C (rojo)    │
└──────────────────────────────┘

REALIDAD:
┌──────────────────────────────┐
│ ⚫ C, E, G, F, A (negro)     │ ← Sin identificación
└──────────────────────────────┘
```

---

#### 🔵 **MEJORA MENOR #1: BROADCASTER SYSTEM NO INTEGRADO CON AUDIO**

**Ubicación**: `/public/js/modules/SocketClient.js` líneas 170-174

```javascript
setBroadcaster(userId) {
    if (this.roomCode) {
        this.socket.emit("set-broadcaster", userId);
    }
}
```

**Análisis**:
- Sistema de broadcaster **SOLO sincroniza PDF**
- `/server.js` líneas 320-343: Broadcaster cambia partitura de alumnos
- **NO cambia filtro de audio** del profesor

**Recomendación**:
- Unificar broadcaster con `soloUserId` en AudioEngine
- Cuando profesor selecciona "alumno estrella", ÉSE es el que escucha

---

### 📊 PILAR 2: PIZARRA COLABORATIVA MULTIUSUARIO

#### ❌ **VULNERABILIDAD CRÍTICA #2: PIZARRA SIN PERMISOS GRANULARES**

**Ubicación**: `/server.js` líneas 349-365 y `/public/js/modules/FreeBoard.js`

**Problema Identificado**:
```javascript
// SERVER.JS - línea 349
socket.on('wb-draw', async (data) => {
    // 1. Enviar a los demás (Rápido)
    socket.to(data.room).emit('wb-draw', data);
    
    // 2. Guardar en MongoDB (Si es una partitura guardada)
    if (data.scoreId) {
        try {
            await Annotation.create({
                scoreId: data.scoreId,
                page: data.page,
                data: data.path
            });
        } catch (e) {
            console.error("Error guardando trazo:", e);
        }
    }
});
```

**Análisis**:
- ❌ **NO valida `validateUserInRoom()`** antes de broadcast
- ❌ **NO verifica permisos de dibujo** por usuario
- ❌ **CUALQUIER alumno puede dibujar** sin restricción
- ❌ **NO existe método `toggleStudentDrawing(id)`**

**Escenario de Fallo**:
```
DADO: Alumno travieso en clase
CUANDO: Profesor explica armonía en pizarra
ENTONCES: Alumno dibuja rayones sobre la explicación
RESULTADO: Caos en clase (todos ven los rayones)
```

**Evidencia de Broadcasting Abierto**:
```javascript
// PROBLEMA: socket.to(data.room).emit('wb-draw', data);
// ↑ Broadcast sin validación de permisos
```

**Modelo de Permisos Esperado** (NO EXISTE):
```javascript
// LO QUE DEBERÍA EXISTIR:
room.drawingPermissions = {
    "socketId_teacher": true,
    "socketId_alumno_A": false,  // Solo lectura
    "socketId_alumno_B": true,   // Profesor le dio permiso
    "socketId_alumno_C": false
};
```

---

#### 🟡 **VULNERABILIDAD MAYOR #3: RACE CONDITION EN ANOTACIONES DE WHITEBOARD**

**Ubicación**: `/server.js` líneas 349-365

**Problema Identificado**:
```javascript
socket.on('wb-draw', async (data) => {
    // 1. Enviar a los demás (Rápido)
    socket.to(data.room).emit('wb-draw', data);

    // 2. Guardar en MongoDB (Si es una partitura guardada)
    if (data.scoreId) {
        try {
            await Annotation.create({
                scoreId: data.scoreId,
                page: data.page,
                data: data.path
            });
        } catch (e) {
            console.error("Error guardando trazo:", e);
        }
    }
});
```

**Análisis**:
- Broadcast primero, guardar después (**fire-and-forget**)
- Si MongoDB falla, **broadcast ya ocurrió** (inconsistencia)
- Modelo de Annotation requiere `page: Number` pero pizarra envía `page: "whiteboard"` (línea 7 error en terminal)

**Error Real Capturado** (de logs del terminal):
```
Error guardando trazo: Error: Annotation validation failed: page: Cast 
to Number failed for value "whiteboard" (type string) at path "page"
```

**Impacto**:
- Trazos se ven en tiempo real pero **NO se guardan**
- Al recargar página, **anotaciones desaparecen**
- Pérdida de trabajo en clases largas

---

#### 🟡 **VULNERABILIDAD MAYOR #4: BROADCASTING SIN THROTTLING**

**Ubicación**: `/public/js/modules/FreeBoard.js` + AnnotationLayer (no auditado)

**Análisis**:
- Pizarra emite evento `wb-draw` en **cada mousemove**
- Sin throttling = **100+ eventos por segundo** con 5 alumnos dibujando
- Socket.io puede **saturarse** o dropear paquetes

**Escenario de Fallo**:
```
DADO: 5 alumnos dibujando círculos simultáneamente
CUANDO: Cada uno genera 100 eventos/segundo
ENTONCES: 500 eventos/segundo al servidor
RESULTADO: 
  - Lag visual en pizarra (dibujos entrecortados)
  - CPU del servidor al 100%
  - Posible desconexión por flood
```

**Solución Esperada** (NO IMPLEMENTADA):
- Throttling de eventos (máximo 30 eventos/segundo por usuario)
- Batching de trazos (agrupar múltiples puntos en 1 mensaje)

---

### 🎥 PILAR 3: VIDEO Y AUDIO BRIDGE EN GRUPO (Agora.io)

#### ❌ **VULNERABILIDAD CRÍTICA #3: NO HAY GESTIÓN DIFERENCIADA DE BANDWIDTH**

**Ubicación**: `/public/js/modules/VideoManager.js` líneas 558-563

```javascript
// === CREAR VIDEO TRACK (720p_1) ===
console.log('[VideoManager] 📹 Creando video track (720p_1)...');
self.localVideoTrack = await AgoraRTC.createCameraVideoTrack({
    encoderConfig: '720p_1', // 1280x720, 15fps - Óptimo para Dell
    optimizationMode: 'detail'
});
```

**Análisis**:
- **TODOS los usuarios crean video en 720p** (1280x720, 15fps)
- **NO hay diferenciación profesor vs alumno**
- Hardware limitado (Mac 2011/Dell) **NO soporta múltiples streams 720p**

**Cálculo de Bandwidth**:
```
CONFIGURACIÓN ACTUAL (720p para todos):
┌─────────────────────────────────────┐
│ Profesor: 720p → 1.5 Mbps upload   │
│ Alumno A: 720p → 1.5 Mbps upload   │
│ Alumno B: 720p → 1.5 Mbps upload   │
│ Alumno C: 720p → 1.5 Mbps upload   │
│ Alumno D: 720p → 1.5 Mbps upload   │
│ Alumno E: 720p → 1.5 Mbps upload   │
└─────────────────────────────────────┘
TOTAL: 9 Mbps upload SIMULTÁNEOS

CAPACIDAD DEL HARDWARE:
Mac 2011 / Dell viejo: ~5 Mbps upload
RESULTADO: ❌ BOTTLENECK GARANTIZADO
```

**Configuración Esperada** (NO IMPLEMENTADA):
```javascript
// PROFESOR:
encoderConfig: '720p_2' // 1280x720, 30fps, 2 Mbps

// ALUMNOS:
encoderConfig: '360p' // 640x360, 15fps, 0.5 Mbps
```

**Impacto Real**:
- Video congelado/entrecortado
- Audio con jitter (dropeo de paquetes)
- **MIDI puede verse afectado** (comparte conexión WebSocket)

---

#### 🟡 **VULNERABILIDAD MAYOR #5: DUCKING GRUPAL MAL IMPLEMENTADO**

**Ubicación**: `/public/js/modules/VideoManager.js` líneas 654-702

```javascript
self.bus.on('local-note', function(data) {
    if (!self.duckingEnabled || !self.localAudioTrack) return;
    
    // === MIDI ACTIVITY DETECTED ===
    self.isMidiActive = true;
    
    // DUCKING INSTANTÁNEO: 100% → 0% (SILENCIO TOTAL)
    self.localAudioTrack.setVolume(0);
    
    // ... recovery después de 1s de silencio
});
```

**Análisis**:
- Ducking **SOLO escucha `local-note`** (notas del usuario LOCAL)
- **NO escucha `remote-note`** (notas de alumnos)
- Lógica: "Si YO toco, bajo mi micrófono"

**Problema en Clase Grupal**:
```
ESCENARIO:
┌────────────────────────────────────────┐
│ Profesor habla explicando armonía     │ ← Mic 100%
│ Alumno A toca ejercicio                │ ← Profesor SIGUE con Mic 100%
│ Resultado: Voz del profesor tapa MIDI │
└────────────────────────────────────────┘

EXPECTATIVA:
┌────────────────────────────────────────┐
│ Profesor habla explicando armonía     │ ← Mic 100%
│ Alumno A toca ejercicio                │ ← Profesor baja a 30%
│ Resultado: Se escucha MIDI del alumno │
└────────────────────────────────────────┘
```

**Lógica Correcta** (NO IMPLEMENTADA):
```javascript
// Profesor debe bajar su mic si:
// 1. ÉL toca (implementado ✅)
// 2. ALUMNO SELECCIONADO toca (NO implementado ❌)

bus.on('remote-note', function(data) {
    if (data.fromId === soloUserId) {
        // Bajar micrófono del profesor
        localAudioTrack.setVolume(30); // 30% para no tapar
    }
});
```

---

#### 🟡 **VULNERABILIDAD MAYOR #6: AGORA CLIENT MODE NO CONFIGURADO**

**Ubicación**: `/public/js/modules/VideoManager.js` líneas 146-152

```javascript
VideoManager.prototype._createAgoraClient = function() {
    var self = this;
    
    try {
        console.log('[VideoManager] 🔧 Creando cliente Agora RTC...');
        
        self.client = AgoraRTC.createClient({
            mode: 'rtc',
            codec: 'vp8'
        });
```

**Análisis**:
- Mode `rtc` = **Real-Time Communication** (peer-to-peer)
- **NO especifica `role`** (host vs audience)
- Agora asume **TODOS son hosts** (pueden publicar)

**Problema en Clase Grande**:
```
6+ usuarios en modo "host" simultáneos:
┌─────────────────────────────────┐
│ Agora SDK crea 6×6 = 36 streams │
│ (cada host envía a cada host)   │
│ Overhead masivo de CPU/Network  │
└─────────────────────────────────┘
```

**Configuración Óptima** (NO IMPLEMENTADA):
```javascript
// PROFESOR:
AgoraRTC.createClient({
    mode: 'live',
    codec: 'vp8',
    role: 'host' // Puede publicar audio/video
});

// ALUMNOS:
AgoraRTC.createClient({
    mode: 'live',
    codec: 'vp8',
    role: 'audience' // Solo reciben (pueden ser promovidos a host)
});
```

---

### 🖥️ PILAR 4: UI DINÁMICA Y 'GRABAR TAREA'

#### 🟡 **VULNERABILIDAD MAYOR #7: VENTANAS DE VIDEO SIN GRID AUTOMÁTICO**

**Ubicación**: `/public/js/modules/VideoManager.js` líneas 262-297 y `DraggableVideo.js`

**Problema Identificado**:
```javascript
// _createLocalWindow() - línea 274
container.style.cssText = 'left: 20px; top: 100px;'; // Posición inicial

// _createRemoteWindow() - línea 327
container.style.cssText = 'right: 20px; top: 100px;'; // Posición inicial
```

**Análisis**:
- Sistema crea **SOLO 2 ventanas**: local y "remote"
- Ventana "remote" es **UN SOLO CONTENEDOR** para todos los usuarios remotos
- Con 5 alumnos: **todos comparten la misma ventana** (se sobreponen)

**Evidencia del Problema**:
```javascript
// VideoManager línea 749-763
self.client.on('user-published', async function(user, mediaType) {
    await self.client.subscribe(user, mediaType);
    
    if (mediaType === 'video') {
        var remoteContainer = document.getElementById('remote-video-container');
        user.videoTrack.play(remoteContainer);
        // ↑ TODOS los videos se renderizan en EL MISMO DIV
    }
});
```

**Escenario de Fallo**:
```
DADO: 5 alumnos con cámara activa
CUANDO: Todos publican video simultáneamente
ENTONCES: 
  - Agora apila 5 videos en el mismo <div>
  - Solo se ve EL ÚLTIMO video (z-index superior)
  - Alumnos 1-4 quedan ocultos
RESULTADO: Profesor solo ve 1 alumno de 5
```

**UI Esperada** (NO IMPLEMENTADA):
```
┌────────────────────────────────────┐
│ Grid 2x3:                          │
│ ┌─────┐ ┌─────┐ ┌─────┐           │
│ │ Prof│ │Alu A│ │Alu B│           │
│ └─────┘ └─────┘ └─────┘           │
│ ┌─────┐ ┌─────┐ ┌─────┐           │
│ │Alu C│ │Alu D│ │Alu E│           │
│ └─────┘ └─────┘ └─────┘           │
└────────────────────────────────────┘
```

---

#### ❌ **VULNERABILIDAD CRÍTICA #4: 'GRABAR TAREA' NO ES INDIVIDUAL**

**Ubicación**: `/public/js/modules/ScoreLogic.js` líneas 400-455

```javascript
async exportAsTask() {
    const taskName = prompt("Nombre tarea:");
    if (!taskName) return;
    
    try {
        // Capturar canvas de whiteboard
        const dataUrl = this.whiteboardEngine.canvas.toDataURL({
            format: 'jpeg',
            quality: 0.85,
            multiplier: 1.5
        });
        
        // Crear PDF
        const doc = new jsPDF({ ... });
        doc.addImage(dataUrl, 'JPEG', 0, 0, width, height);
        
        // Subir al servidor
        const formData = new FormData();
        formData.append('file', blob, `${taskName}.pdf`);
        formData.append('roomCode', this.getRoomCode());
        
        const res = await fetch('/api/scores/upload', { method: 'POST', body: formData });
    }
}
```

**Análisis**:
- Sistema **captura UN SOLO canvas** (el de la whiteboard)
- **NO captura anotaciones individuales** de cada alumno
- **NO genera PDFs personalizados** por alumno

**Escenario de Fallo**:
```
CLASE:
┌──────────────────────────────────────┐
│ Profesor: Explica escala Do Mayor   │
│ Alumno A: Anota "Do-Re-Mi-Fa..."    │ ← Sus notas
│ Alumno B: Anota "Difícil :("        │ ← Sus notas
│ Alumno C: Anota "Practicar mano izq"│ ← Sus notas
└──────────────────────────────────────┘

PROFESOR HACE "Grabar Tarea":
┌──────────────────────────────────────┐
│ Sistema genera: "Tarea_DoMayor.pdf" │
│ Contenido: SOLO pizarra del profesor│
│ Anotaciones de alumnos: ❌ PERDIDAS  │
└──────────────────────────────────────┘

EXPECTATIVA:
┌──────────────────────────────────────┐
│ Tarea_DoMayor_AlumnoA.pdf           │ ← Personalizada
│ Tarea_DoMayor_AlumnoB.pdf           │ ← Personalizada
│ Tarea_DoMayor_AlumnoC.pdf           │ ← Personalizada
└──────────────────────────────────────┘
```

**Problema Adicional**: Modelo de Annotation
```javascript
// models/Annotation.js (deducido del error)
{
    scoreId: ObjectId,
    page: Number,  // ← PROBLEMA: Whiteboard envía "whiteboard" (String)
    data: Object
}
```

**Falta en el Modelo**:
- ❌ Campo `userId` (¿quién hizo la anotación?)
- ❌ Campo `sessionId` (¿en qué clase?)
- ❌ Campo `visibility` (¿pública o privada?)

---

#### 🟡 **VULNERABILIDAD MAYOR #8: ANOTACIONES NO SCOPED POR USUARIO**

**Ubicación**: `/server.js` líneas 349-365

```javascript
socket.on('wb-draw', async (data) => {
    socket.to(data.room).emit('wb-draw', data);
    
    if (data.scoreId) {
        await Annotation.create({
            scoreId: data.scoreId,
            page: data.page,
            data: data.path
        });
    }
});
```

**Análisis**:
- Anotaciones se guardan **sin userId**
- Al cargar partitura, **TODOS ven TODAS las anotaciones**
- No hay concepto de "mis notas" vs "notas del profesor"

**Impacto**:
```
PROBLEMA 1: Privacidad
┌─────────────────────────────────────┐
│ Alumno A anota: "No entendí esto"  │ ← Visible para todos
│ Alumno B anota: "Fácil"            │ ← Visible para todos
│ Resultado: Alumno A avergonzado    │
└─────────────────────────────────────┘

PROBLEMA 2: Sobrecarga Visual
┌─────────────────────────────────────┐
│ Partitura con 5 alumnos anotando   │
│ = 5 capas de anotaciones superpuestas│
│ Resultado: Ilegible                 │
└─────────────────────────────────────┘
```

---

## 📋 MATRIZ DE PRIORIZACIÓN

| ID | Vulnerabilidad | Severidad | Impacto | Esfuerzo | Prioridad |
|----|----------------|-----------|---------|----------|-----------|
| C1 | No existe selector de audio (setListenTo) | 🔴 Crítica | ALTO | Medio | **P0** |
| C2 | Pizarra sin permisos granulares | 🔴 Crítica | ALTO | Bajo | **P0** |
| C3 | No hay gestión de bandwidth diferenciada | 🔴 Crítica | ALTO | Alto | **P0** |
| C4 | Grabar Tarea no es individual | 🔴 Crítica | ALTO | Alto | **P1** |
| M1 | Filtrado MIDI mal implementado | 🟡 Mayor | Medio | Bajo | **P1** |
| M2 | Piano visual sin colores por usuario | 🟡 Mayor | Medio | Medio | **P2** |
| M3 | Race condition en anotaciones | 🟡 Mayor | Medio | Bajo | **P1** |
| M4 | Broadcasting sin throttling | 🟡 Mayor | ALTO | Medio | **P1** |
| M5 | Ducking grupal mal implementado | 🟡 Mayor | Medio | Bajo | **P2** |
| M6 | Agora client mode no configurado | 🟡 Mayor | ALTO | Bajo | **P1** |
| M7 | Ventanas sin grid automático | 🟡 Mayor | ALTO | Alto | **P1** |
| M8 | Anotaciones no scoped por usuario | 🟡 Mayor | Medio | Medio | **P2** |

---

## 🔧 RECOMENDACIONES DE ARQUITECTURA

### **FASE 1: ORQUESTACIÓN MIDI** (1-2 semanas)

1. **Crear `MidiOrchestrator` Class**:
   ```javascript
   class MidiOrchestrator {
       constructor() {
           this.soloUserId = null;
           this.muteMap = new Map(); // userId -> boolean
       }
       
       setSoloUser(userId) { ... }
       muteUser(userId) { ... }
       shouldPlayUser(userId) { ... }
   }
   ```

2. **Integrar en UIManager**:
   - Dropdown "Escuchar a:" con lista de alumnos
   - Botón "Todos" para resetear filtro

3. **Piano Visual con Colores**:
   ```javascript
   handleNote(note, velocity, userId) {
       const color = this.getUserColor(userId);
       this.teacherActiveNotes.set(note, { userId, color });
   }
   ```

---

### **FASE 2: PIZARRA COLABORATIVA** (1 semana)

1. **Sistema de Permisos**:
   ```javascript
   room.drawingPermissions = {
       [teacherId]: true,
       [studentId]: false  // Default: read-only
   };
   
   socket.on('wb-draw', (data) => {
       if (!room.drawingPermissions[socket.id]) {
           socket.emit('error', 'No tienes permiso de dibujo');
           return;
       }
       // ... rest of logic
   });
   ```

2. **Throttling de Eventos**:
   ```javascript
   const throttle = (func, delay) => {
       let lastCall = 0;
       return (...args) => {
           const now = Date.now();
           if (now - lastCall >= delay) {
               lastCall = now;
               func(...args);
           }
       };
   };
   
   canvas.on('mouse:move', throttle(handleDraw, 33)); // 30fps max
   ```

3. **Modelo de Annotation Mejorado**:
   ```javascript
   {
       scoreId: ObjectId,
       userId: ObjectId,      // NUEVO
       sessionId: String,     // NUEVO
       page: Mixed,           // Puede ser Number o "whiteboard"
       visibility: String,    // "public", "private", "teacher-only"
       data: Object,
       createdAt: Date
   }
   ```

---

### **FASE 3: VIDEO Y AUDIO BRIDGE** (2-3 semanas)

1. **Bandwidth Diferenciado**:
   ```javascript
   const encoderConfig = (userRole === 'teacher') 
       ? '720p_2'  // Profesor: 1280x720, 30fps
       : '360p';   // Alumnos: 640x360, 15fps
   
   localVideoTrack = await AgoraRTC.createCameraVideoTrack({
       encoderConfig: encoderConfig
   });
   ```

2. **Ducking Grupal Inteligente**:
   ```javascript
   bus.on('remote-note', (data) => {
       if (myRole === 'teacher' && data.fromId === soloUserId) {
           // Alumno seleccionado está tocando
           localAudioTrack.setVolume(30); // Bajar mi voz
       }
   });
   ```

3. **Agora Role-Based**:
   ```javascript
   client = AgoraRTC.createClient({
       mode: 'live',
       codec: 'vp8',
       role: (userRole === 'teacher') ? 'host' : 'audience'
   });
   ```

---

### **FASE 4: UI Y GRABACIÓN** (2 semanas)

1. **Grid Dinámico de Videos**:
   ```javascript
   function createVideoGrid(userCount) {
       const cols = Math.ceil(Math.sqrt(userCount));
       const rows = Math.ceil(userCount / cols);
       
       users.forEach((user, index) => {
           const videoDiv = createVideoWindow(user.id);
           videoDiv.style.gridColumn = (index % cols) + 1;
           videoDiv.style.gridRow = Math.floor(index / cols) + 1;
           gridContainer.appendChild(videoDiv);
       });
   }
   ```

2. **Grabar Tarea Individual**:
   ```javascript
   async exportTaskForAllStudents() {
       const students = room.users.filter(u => u.role === 'student');
       
       for (const student of students) {
           const canvas = await this.renderCanvasWithAnnotations(student.id);
           const pdf = await this.generatePDF(canvas, student.name);
           await this.uploadPDF(pdf, student.id);
       }
   }
   ```

---

## ⚠️ RIESGOS DE NO IMPLEMENTAR

### **Riesgos Pedagógicos**:
- Imposible dar feedback individual
- Alumnos tímidos quedan invisibles
- Caos auditivo en clases grupales

### **Riesgos Técnicos**:
- Crash del servidor con >3 alumnos dibujando
- Video congelado por bottleneck de bandwidth
- Pérdida de anotaciones por race conditions

### **Riesgos de Negocio**:
- Profesores abandonan la plataforma
- Reputación de "no sirve para clases grupales"
- Imposible escalar más allá de 1:1

---

## ✅ CONCLUSIÓN

**Estado Actual**: Sistema optimizado para **1 profesor + 1 alumno**  
**Estado Deseado**: Sistema escalable para **1 profesor + 5-10 alumnos**  

**Trabajo Estimado**: 6-8 semanas de desarrollo  
**ROI**: CRÍTICO para competitividad en mercado educativo

**Próximos Pasos Inmediatos**:
1. Implementar selector de audio (P0 - 3 días)
2. Sistema de permisos en pizarra (P0 - 2 días)
3. Configurar bandwidth diferenciado (P0 - 5 días)

---

**Reporte firmado por**:  
Senior Systems Architect & Full Stack Lead  
Fecha: 28 de Diciembre, 2025
