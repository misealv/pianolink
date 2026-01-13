# 🔬 INFORME DE AUDITORÍA TÉCNICA - PianoLink

**Fecha:** 12 de Enero 2026  
**Auditor:** Principal Systems Architect  
**Objetivo:** Validación de Production Readiness  
**Versión Auditada:** v4 (State-Aware Relay)

---

## 📊 1. MAPA DE SALUD DEL SISTEMA

| Módulo | Estado | Calificación | Notas |
|--------|--------|--------------|-------|
| **MIDI Relay** | 🟢 Estable | 92/100 | Protocolo binario optimizado, snapshots cada 2s |
| **State Management** | 🟢 Estable | 88/100 | Watchdog activo, reconciliación funcional |
| **Socket.io Core** | 🟢 Estable | 90/100 | Exponential backoff, heartbeat implementado |
| **PDF/Partitura** | 🟡 Moderado | 75/100 | Race conditions potenciales en cambio de página |
| **Pizarra (Fabric.js)** | 🟡 Moderado | 72/100 | Sin transacciones atómicas en sincronización |
| **Persistencia (MongoDB)** | 🟡 Moderado | 78/100 | Falta índices compuestos |
| **Audio/Video (Agora)** | 🟢 Estable | 85/100 | Inicialización diferida correcta |
| **Autenticación** | 🟢 Estable | 90/100 | JWT con expiración, bcrypt para passwords |
| **Memory Management** | 🟡 Moderado | 70/100 | Timers limpiados, pero Sets pueden crecer |

### Puntuación General: **82/100** - Listo para Producción con Monitoreo

---

## 🚨 2. MATRIZ DE RIESGOS

### 2.1 Riesgos Críticos (Requieren Acción Inmediata)

| ID | Riesgo | Probabilidad | Impacto | Ubicación | Mitigación |
|----|--------|--------------|---------|-----------|------------|
| R1 | **Memory Leak en teacherActiveNotes** | Media | Alto | server.js:765 | El Set no tiene límite de tamaño |
| R2 | **Race Condition en cambio de página** | Alta | Medio | ScoreLogic.js:90 | Sin mutex para operaciones async |
| R3 | **DoS por flood de wb-draw** | Media | Alto | server.js:514 | Sin rate limiting en eventos de pizarra |

### 2.2 Riesgos Moderados

| ID | Riesgo | Probabilidad | Impacto | Ubicación | Mitigación |
|----|--------|--------------|---------|-----------|------------|
| R4 | Mensajes huérfanos en hibernación | Baja | Medio | SocketClient.js:30 | _pendingMessages sin flush automático |
| R5 | Falta índice compuesto en Annotation | Media | Medio | models/Annotation.js | Queries lentas con muchas anotaciones |
| R6 | Snapshot broadcast a todos | Media | Bajo | server.js:830 | Debería ser solo a estudiantes |

### 2.3 Single Points of Failure (SPOF)

```
┌─────────────────────────────────────────────────────────────────┐
│                    ARQUITECTURA ACTUAL                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   [Cliente A]──┐                                               │
│   [Cliente B]──┼──▶ [Socket.io Server] ◀── SPOF #1            │
│   [Cliente C]──┘         │                                     │
│                          ▼                                      │
│                    [MongoDB Atlas] ◀── SPOF #2                 │
│                          │                                      │
│                          ▼                                      │
│                    [Cloudinary CDN] ◀── Dependencia externa    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**SPOF #1:** Servidor único de Socket.io  
**SPOF #2:** Base de datos MongoDB  
**Mitigación:** PM2 cluster mode + MongoDB replica set (para VPS dedicado)

---

## 🔍 3. HALLAZGOS DETALLADOS POR ÁREA

### 3.1 Gestión de Memoria y Event Loops

#### ✅ Buenas Prácticas Encontradas:
```javascript
// server.js:755-770 - Limpieza correcta en desconexión
socket.on("disconnect", () => {
    // Limpiar timers de snapshot si existen
    if (room.snapshotTimer) clearTimeout(room.snapshotTimer);
    if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
    
    // Si era el profesor, limpiar las notas globales
    if (socket.userRole === 'teacher' && room.teacherActiveNotes) {
        room.teacherActiveNotes.clear();
    }
    
    delete room.users[socket.id];
    // ... limpieza de sala cuando está vacía
});
```

#### ⚠️ Problemas Encontrados:

**PROBLEMA 1: Set sin límite de tamaño**
```javascript
// server.js:765 - teacherActiveNotes puede crecer indefinidamente
if (!rooms[roomCode]) {
    rooms[roomCode] = { 
        users: {}, 
        teacherActiveNotes: new Set(), // ← Sin límite máximo
        // ...
    };
}
```

**PROBLEMA 2: Operación síncrona bloqueante en wb-draw**
```javascript
// server.js:514 - Escritura a DB en el event loop principal
socket.on('wb-draw', async (data) => {
    socket.to(data.room).emit('wb-draw', data); // ← Rápido
    if (data.scoreId) {
        await Annotation.create({...}); // ← BLOQUEANTE
    }
});
```

### 3.2 Integridad del Estado MIDI

#### ✅ Mecanismos de Resiliencia Implementados:

1. **Snapshot Protocol (server.js:825-870)**
   - Heartbeat cada 2 segundos
   - Snapshot reactivo en inactividad
   - Full snapshot al unirse a sala

2. **MidiStateManager (cliente)**
   - Watchdog cada 2s para notas colgadas
   - Grace period de 500ms para reconciliación
   - Idempotencia en NoteOn

3. **State Tracking Server-Side**
   - Set de notas activas del profesor
   - Limpieza automática en desconexión

#### ⚠️ Escenario de Fallo Identificado:

```
Escenario: Pérdida de paquete NoteOff
─────────────────────────────────────
1. Profesor toca nota 60 (Do central)
2. Server registra: teacherActiveNotes.add(60) ✓
3. Profesor suelta la tecla (NoteOff)
4. ❌ Paquete UDP se pierde en la red
5. Server: nota 60 sigue en el Set
6. 2 segundos después: Snapshot envía [60] a estudiante
7. Estudiante: Reconciliación detecta nota huérfana
8. ✓ Se fuerza NoteOff

TIEMPO DE RECUPERACIÓN: 2-4 segundos (aceptable para uso pedagógico)
```

### 3.3 Sincronización PDF + Pizarra

#### ⚠️ Race Condition Identificada:

```javascript
// ScoreLogic.js:90 - Cambio de tab sin protección
switchTab(tab) {
    // PROBLEMA: Estas operaciones NO son atómicas
    this.saveLocalState();           // Operación 1
    this.currentTab = tab;           // Operación 2
    // Si llega un evento remoto entre 1 y 2...
    // el estado puede corromperse
    
    if (tab === 'whiteboard') {
        this.setupEngine('wb-layer', 'whiteboard');
        setTimeout(() => {
            this.resizeWhiteboard();
            // ... carga de datos
        }, 50);
    }
}
```

### 3.4 Seguridad y Aislamiento de Salas

#### ✅ Validación de Autorización Implementada:
```javascript
// server.js:110 - Función de validación
function validateUserInRoom(socket, roomCode, requiredRole = null) {
    const room = rooms[roomCode];
    if (!room) return false;
    const user = room.users[socket.id];
    if (!user) return false;
    // Verificación de rol con soporte admin=teacher
    if (requiredRole) {
        const hasPermission = (requiredRole === 'teacher') 
            ? (userRole === 'teacher' || userRole === 'admin')
            : (userRole === requiredRole);
        if (!hasPermission) return false;
    }
    return true;
}
```

#### ⚠️ Vulnerabilidad: Eventos de pizarra sin validación
```javascript
// server.js:514 - wb-draw NO valida autorización
socket.on('wb-draw', async (data) => {
    socket.to(data.room).emit('wb-draw', data);
    // ❌ No verifica si socket.id pertenece a data.room
    // Un atacante podría inyectar a cualquier sala
});
```

### 3.5 Manejo de Errores y Reconexión

#### ✅ Exponential Backoff Implementado:
```javascript
// SocketClient.js:14-20
this.socket = io({ 
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,      // Inicio: 1s
    reconnectionDelayMax: 5000,   // Máximo: 5s
    timeout: 20000
});
```

#### ✅ Graceful Shutdown Implementado:
```javascript
// server.js:880-930
function gracefulShutdown(signal) {
    // 1. Detener heartbeat
    // 2. Limpiar salas y timers
    // 3. Notificar usuarios
    // 4. Cerrar Socket.IO
    // 5. Cerrar HTTP
    // 6. Timeout de seguridad 10s
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => gracefulShutdown('uncaughtException'));
```

---

## 🛠️ 4. REFACTORIZACIONES SUGERIDAS

### 4.1 FIX CRÍTICO: Validación de sala en eventos de pizarra

```javascript
// server.js - ANTES (INSEGURO)
socket.on('wb-draw', async (data) => {
    socket.to(data.room).emit('wb-draw', data);
    // ...
});

// server.js - DESPUÉS (SEGURO)
socket.on('wb-draw', async (data) => {
    // SEGURIDAD: Verificar que el usuario está en la sala
    if (data.room !== socket.roomCode) {
        console.warn(`[Security] wb-draw rechazado: ${socket.id} intentó escribir en ${data.room}`);
        return;
    }
    
    // SEGURIDAD: Sanitizar datos antes de retransmitir
    const sanitizedData = {
        room: data.room,
        page: parseInt(data.page) || 1,
        scoreId: data.scoreId ? String(data.scoreId).substring(0, 50) : null,
        path: data.path // Fabric.js object (validar estructura si necesario)
    };
    
    socket.to(data.room).emit('wb-draw', sanitizedData);
    
    if (sanitizedData.scoreId) {
        try {
            await Annotation.create({
                scoreId: sanitizedData.scoreId,
                page: sanitizedData.page,
                data: sanitizedData.path
            });
        } catch (e) {
            console.error("[wb-draw] Error guardando:", e.message);
        }
    }
});
```

### 4.2 FIX: Rate Limiting para eventos de pizarra

```javascript
// server.js - Agregar al inicio
const wbRateLimiter = new Map(); // socketId -> { count, resetTime }
const WB_RATE_LIMIT = 30; // máximo 30 trazos por segundo
const WB_RATE_WINDOW = 1000; // ventana de 1 segundo

function checkWbRateLimit(socketId) {
    const now = Date.now();
    const state = wbRateLimiter.get(socketId) || { count: 0, resetTime: now + WB_RATE_WINDOW };
    
    if (now > state.resetTime) {
        state.count = 0;
        state.resetTime = now + WB_RATE_WINDOW;
    }
    
    state.count++;
    wbRateLimiter.set(socketId, state);
    
    return state.count <= WB_RATE_LIMIT;
}

// Uso en el evento
socket.on('wb-draw', async (data) => {
    if (!checkWbRateLimit(socket.id)) {
        console.warn(`[RateLimit] wb-draw bloqueado para ${socket.id}`);
        return;
    }
    // ... resto del código
});
```

### 4.3 FIX: Índices compuestos para Annotation

```javascript
// models/Annotation.js - Agregar después del schema
AnnotationSchema.index({ scoreId: 1, page: 1 }); // Índice compuesto
AnnotationSchema.index({ scoreId: 1, "data.id": 1 }); // Para búsqueda por ID

module.exports = mongoose.model('Annotation', AnnotationSchema);
```

### 4.4 FIX: Límite de notas activas

```javascript
// server.js - En el handler de midi-binary
const MAX_ACTIVE_NOTES = 128; // Máximo de notas en un piano

if (isNoteOn) {
    if (room.teacherActiveNotes.size >= MAX_ACTIVE_NOTES) {
        console.warn(`[MIDI] Límite de notas alcanzado en sala ${roomCode}`);
        // Limpiar las notas más antiguas (no debería pasar en uso normal)
        const oldestNote = room.teacherActiveNotes.values().next().value;
        room.teacherActiveNotes.delete(oldestNote);
    }
    room.teacherActiveNotes.add(noteId);
}
```

### 4.5 FIX: Operación no bloqueante en wb-draw

```javascript
// server.js - Usar setImmediate para no bloquear el event loop
socket.on('wb-draw', async (data) => {
    // 1. Retransmitir inmediatamente (prioridad alta)
    socket.to(data.room).emit('wb-draw', data);

    // 2. Guardar en background (prioridad baja)
    if (data.scoreId) {
        setImmediate(async () => {
            try {
                await Annotation.create({
                    scoreId: data.scoreId,
                    page: data.page,
                    data: data.path
                });
            } catch (e) {
                console.error("[wb-draw] Error guardando:", e.message);
            }
        });
    }
});
```

---

## 📈 5. PRUEBA DE ESTRÉS TEÓRICA

### Estimación de Capacidad (VPS 4GB RAM)

```
CONFIGURACIÓN ASUMIDA:
- Node.js: ~150MB base
- Socket.io: ~50KB por conexión
- Estado de sala: ~2KB por sala
- PM2 cluster: 2 workers

CÁLCULOS:
RAM disponible para conexiones = 4GB - 500MB (OS) - 300MB (Node x2) = 3.2GB
RAM por clase = 2 usuarios × 50KB + 2KB sala = 102KB ≈ 100KB

Clases simultáneas máximas = 3.2GB / 100KB = ~32,000 teóricas
```

### Límites Realistas

| Factor | Límite | Razón |
|--------|--------|-------|
| **CPU (event loop)** | 50-100 clases | MIDI binario es CPU-light pero snapshots cada 2s |
| **Bandwidth** | 200 clases | MIDI: ~5KB/s por clase, Snapshot: ~1KB cada 2s |
| **MongoDB** | 100-150 clases | Anotaciones generan escrituras frecuentes |
| **Socket.io** | 500 conexiones | Límite recomendado por instancia |

### **ESTIMACIÓN FINAL: 80-100 clases simultáneas en VPS 4GB RAM**

Con PM2 cluster mode (2 workers) y MongoDB Atlas M10.

---

## ✅ 6. CHECKLIST PRE-PRODUCCIÓN

### Inmediato (Antes del Deploy)
- [ ] Aplicar fix de seguridad en wb-draw, wb-delete, wb-clear
- [ ] Agregar rate limiting a eventos de pizarra
- [ ] Crear índices compuestos en MongoDB
- [ ] Agregar límite de 128 notas en teacherActiveNotes

### Corto Plazo (Primera Semana)
- [ ] Configurar PM2 en cluster mode
- [ ] Agregar monitoreo de memoria (PM2 metrics o similar)
- [ ] Implementar health check endpoint con métricas detalladas
- [ ] Configurar logs rotados

### Medio Plazo (Primer Mes)
- [ ] Implementar Redis para sesiones (escalar horizontalmente)
- [ ] Agregar circuit breaker para MongoDB
- [ ] Implementar queue para persistencia de anotaciones

---

## 📋 7. RESUMEN EJECUTIVO

**PianoLink está listo para producción** con las siguientes condiciones:

1. **Crítico:** Aplicar fixes de seguridad en eventos de pizarra (30 min)
2. **Importante:** Agregar rate limiting (1 hora)
3. **Recomendado:** Crear índices MongoDB (5 min)

**Capacidad estimada:** 80-100 clases simultáneas en VPS 4GB

**Próximo milestone:** Escalar a 500+ clases con Redis + MongoDB replica set

---

*Informe generado por GitHub Copilot - Principal Systems Architect*
