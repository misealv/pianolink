/**
 * PIANO LINK GRUPAL - Código de Referencia
 * =========================================
 * Este archivo contiene las implementaciones propuestas para el backend.
 * NO ES UN ARCHIVO DE PRODUCCIÓN - Es documentación de código.
 * 
 * Copiar las secciones relevantes a server.js durante la implementación.
 */

// ==============================================================================
// SECCIÓN 1: NUEVA ESTRUCTURA DE SALA
// ==============================================================================

/**
 * Estructura extendida para soportar clases grupales
 * Reemplaza la función setupUserInRoom en server.js
 */
function setupUserInRoomV2(socket, roomCode, name, role) {
    socket.roomCode = roomCode;
    socket.userName = name;
    socket.userRole = role;
    socket.join(roomCode);

    // Si la sala no existe, crearla con estructura grupal completa
    if (!rooms[roomCode]) {
        rooms[roomCode] = { 
            // === METADATA ===
            isActive: false,
            phase: 'INDIVIDUAL',  // 'INDIVIDUAL' | 'GLOBAL'
            createdAt: Date.now(),
            
            // === USUARIOS ===
            users: {}, 
            
            // === ENRUTAMIENTO MIDI GRUPAL ===
            midiRouting: {
                teacherToAll: false,       // Solo true en GLOBAL
                studentToTeacher: true,    // Solo si está FOCUSED
                studentToStudent: false    // Solo true en GLOBAL
            },
            
            // === GAMIFICACIÓN ===
            gamification: {
                active: false,
                mode: null,     // 'SYNC' | 'BATTLE' | 'FREE'
                scores: {},     // userId -> score
                currentRound: 0,
                targetNote: null
            },
            
            // === ESTADO HEREDADO (mantener compatibilidad) ===
            broadcaster: null,
            teacherActiveNotes: new Set(),
            lastSnapshot: [],
            lastActivityTime: Date.now(),
            snapshotTimer: null,
            inactivityTimer: null
        };
        
        console.log(`[Grupal] Nueva sala creada: ${roomCode} (Fase: INDIVIDUAL)`);
    }
    
    // Crear usuario con estructura extendida
    const isTeacher = role === 'teacher' || role === 'admin';
    
    rooms[roomCode].users[socket.id] = {
        // Datos base
        name: name,
        role: role,
        pdfState: { url: null, page: 1, scoreId: null },
        activeNotes: new Set(),
        
        // === NUEVO: Estado grupal ===
        state: isTeacher ? 'TEACHING' : 'PRACTICING',  // PRACTICING | FOCUSED | GLOBAL | TEACHING
        isBeingObserved: false,
        lastMidiActivity: Date.now(),
        
        // === Solo para profesores ===
        ...(isTeacher && {
            focusedStudent: null,      // socketId del alumno visitado
            lastFocusSwitch: null
        })
    };
    
    console.log(`[Grupal] Usuario ${name} (${role}) unido a sala ${roomCode}`);
}


// ==============================================================================
// SECCIÓN 2: MATRIZ DE CONMUTACIÓN MIDI
// ==============================================================================

/**
 * Determina a quién enviar un mensaje MIDI basado en la fase y el focus
 * @param {string} roomCode - Código de la sala
 * @param {string} senderSocketId - ID del socket que envía
 * @returns {string[]} - Array de socket IDs que deben recibir el MIDI
 */
function getMidiRoutingTargets(roomCode, senderSocketId) {
    const room = rooms[roomCode];
    if (!room) return [];
    
    const sender = room.users[senderSocketId];
    if (!sender) return [];
    
    const targets = [];
    
    // === FASE GLOBAL ===
    if (room.phase === 'GLOBAL') {
        Object.keys(room.users).forEach(socketId => {
            if (socketId !== senderSocketId) {
                targets.push(socketId);
            }
        });
        
        console.log(`[MIDI Routing] GLOBAL: ${senderSocketId} → ${targets.length} usuarios`);
        return targets;
    }
    
    // === FASE INDIVIDUAL ===
    const senderRole = sender.role;
    
    // Caso 1: Profesor envía MIDI
    if (senderRole === 'teacher' || senderRole === 'admin') {
        // Solo enviar al alumno enfocado (si hay uno)
        if (sender.focusedStudent && room.users[sender.focusedStudent]) {
            targets.push(sender.focusedStudent);
            console.log(`[MIDI Routing] Profesor → Alumno enfocado: ${sender.focusedStudent}`);
        }
        return targets;
    }
    
    // Caso 2: Alumno envía MIDI
    if (senderRole === 'student') {
        // Enviar a todos los profesores que lo tengan enfocado
        Object.entries(room.users).forEach(([socketId, user]) => {
            const isTeacher = user.role === 'teacher' || user.role === 'admin';
            if (isTeacher && user.focusedStudent === senderSocketId) {
                targets.push(socketId);
                console.log(`[MIDI Routing] Alumno ${senderSocketId} → Profesor ${socketId}`);
            }
        });
        
        // En INDIVIDUAL, alumnos NO escuchan a otros alumnos
        return targets;
    }
    
    return targets;
}


// ==============================================================================
// SECCIÓN 3: HANDLER DE MIDI BINARIO (MODIFICADO)
// ==============================================================================

/**
 * Handler modificado para midi-binary que usa enrutamiento selectivo
 * Reemplazar el handler existente en server.js
 */
socket.on("midi-binary", (buffer) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    
    if (!validateUserInRoom(socket, roomCode)) return;
    
    const room = rooms[roomCode];
    if (!room.isActive) return;

    // Normalizar buffer
    let arrayBuffer;
    if (Buffer.isBuffer(buffer)) {
        arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } else if (buffer instanceof ArrayBuffer) {
        arrayBuffer = buffer;
    } else {
        console.error('[MIDI] Buffer inválido');
        return;
    }

    // Decodificar
    const messages = decodeMidiBundle(arrayBuffer);
    const MAX_ACTIVE_NOTES = 128;
    
    // State tracking
    messages.forEach(msg => {
        try {
            const { status, data1: noteId, data2: velocity } = msg;
            const isNoteOn = (status >= 144 && status <= 159) && velocity > 0;
            const isNoteOff = (status >= 128 && status <= 143) || (status >= 144 && velocity === 0);

            const user = room.users[socket.id];
            if (user) {
                // Actualizar timestamp de actividad MIDI
                user.lastMidiActivity = Date.now();
                
                if (isNoteOn) {
                    if (user.activeNotes.size >= MAX_ACTIVE_NOTES) {
                        const oldest = user.activeNotes.values().next().value;
                        user.activeNotes.delete(oldest);
                    }
                    user.activeNotes.add(noteId);
                } else if (isNoteOff) {
                    user.activeNotes.delete(noteId);
                }
            }
        } catch (e) {
            console.warn('[MIDI State] Error:', e.message);
        }
    });
   
    // Filtrar Program Change
    const filteredMessages = messages.filter(msg => {
        return !(msg.status >= 192 && msg.status <= 207);
    });
    
    if (filteredMessages.length === 0) return;
    
    // Recodificar
    const filteredBuffer = encodeMidiBundle(filteredMessages);
    
    // === NUEVO: ENRUTAMIENTO SELECTIVO ===
    const targets = getMidiRoutingTargets(roomCode, socket.id);
    
    if (targets.length === 0) {
        // Nadie escucha a este usuario actualmente
        return;
    }
    
    // Enviar solo a los targets específicos
    const user = room.users[socket.id];
    const packet = {
        src: socket.id,
        dat: filteredBuffer,
        userId: user.name
    };
    
    targets.forEach(targetId => {
        io.to(targetId).emit("midi-binary", packet);
    });
});


// ==============================================================================
// SECCIÓN 4: EVENTOS DE FOCUS Y VISITA
// ==============================================================================

/**
 * Evento: Profesor enfoca a un alumno
 * Activa la "visita" bidireccional
 */
socket.on("focus-student", (targetStudentId) => {
    const roomCode = socket.roomCode;
    const room = rooms[roomCode];
    
    // Validación
    if (!validateUserInRoom(socket, roomCode, 'teacher')) {
        socket.emit('error', { message: 'Solo profesores pueden enfocar alumnos' });
        return;
    }
    
    const teacher = room.users[socket.id];
    const previousFocus = teacher.focusedStudent;
    
    // === PASO 1: LIMPIAR FOCUS ANTERIOR ===
    if (previousFocus && room.users[previousFocus]) {
        const prevStudent = room.users[previousFocus];
        
        // Enviar MIDI Flush al profesor
        socket.emit('midi-flush', createMidiFlush(previousFocus));
        
        // Actualizar estado del alumno anterior
        prevStudent.state = 'PRACTICING';
        prevStudent.isBeingObserved = false;
        
        // Notificar al alumno
        io.to(previousFocus).emit('observation-ended', {
            teacherId: socket.id,
            duration: Date.now() - (teacher.lastFocusSwitch || Date.now())
        });
        
        console.log(`[Focus] Profesor ${socket.id} dejó de observar a ${previousFocus}`);
    }
    
    // === PASO 2: ACTIVAR NUEVO FOCUS ===
    if (targetStudentId === null) {
        // Profesor vuelve a modo overview (sin focus)
        teacher.focusedStudent = null;
        teacher.lastFocusSwitch = Date.now();
        
        socket.emit('focus-cleared');
        broadcastUserList(roomCode);
        return;
    }
    
    // Validar que el target existe y es estudiante
    const targetStudent = room.users[targetStudentId];
    if (!targetStudent || targetStudent.role !== 'student') {
        socket.emit('error', { message: 'Alumno no encontrado' });
        return;
    }
    
    // Actualizar estado
    teacher.focusedStudent = targetStudentId;
    teacher.lastFocusSwitch = Date.now();
    
    targetStudent.state = 'FOCUSED';
    targetStudent.isBeingObserved = true;
    
    // Notificar al nuevo alumno
    io.to(targetStudentId).emit('observation-started', {
        teacherId: socket.id,
        teacherName: teacher.name,
        timestamp: Date.now()
    });
    
    // Enviar estado PDF del alumno al profesor
    socket.emit('sync-student-pdf', {
        studentId: targetStudentId,
        pdfState: targetStudent.pdfState
    });
    
    // Enviar snapshot de notas activas del alumno
    if (targetStudent.activeNotes.size > 0) {
        socket.emit('midi-snapshot', {
            notes: Array.from(targetStudent.activeNotes),
            userId: targetStudentId,
            timestamp: Date.now(),
            type: 'focus-switch'
        });
    }
    
    console.log(`[Focus] Profesor ${socket.id} ahora observa a ${targetStudentId}`);
    
    // Actualizar UI de todos
    broadcastUserList(roomCode);
});

/**
 * Crea un mensaje MIDI Flush para limpiar notas pegadas
 */
function createMidiFlush(targetId) {
    return {
        targetId: targetId,
        messages: [
            { status: 176, data1: 123, data2: 0 },  // All Notes Off (CC 123)
            { status: 176, data1: 64, data2: 0 },   // Sustain Off (CC 64)
            { status: 176, data1: 66, data2: 0 },   // Sostenuto Off (CC 66)
            { status: 176, data1: 67, data2: 0 }    // Soft Pedal Off (CC 67)
        ],
        timestamp: Date.now()
    };
}


// ==============================================================================
// SECCIÓN 5: CAMBIO DE FASE (INDIVIDUAL ↔ GLOBAL)
// ==============================================================================

/**
 * Evento: Cambiar fase de la clase
 */
socket.on("set-phase", (data) => {
    const roomCode = socket.roomCode;
    const room = rooms[roomCode];
    
    if (!validateUserInRoom(socket, roomCode, 'teacher')) {
        socket.emit('error', { message: 'Solo profesores pueden cambiar la fase' });
        return;
    }
    
    const { phase, gamificationMode } = data;
    
    if (!['INDIVIDUAL', 'GLOBAL'].includes(phase)) {
        socket.emit('error', { message: 'Fase inválida' });
        return;
    }
    
    const previousPhase = room.phase;
    room.phase = phase;
    
    // Actualizar routing
    if (phase === 'GLOBAL') {
        room.midiRouting = {
            teacherToAll: true,
            studentToTeacher: true,
            studentToStudent: true
        };
        
        // Activar gamificación si se especificó modo
        if (gamificationMode) {
            room.gamification = {
                active: true,
                mode: gamificationMode,
                scores: {},
                currentRound: 0,
                targetNote: null
            };
        }
        
        // Limpiar todos los focus
        Object.values(room.users).forEach(user => {
            if (user.role === 'teacher' || user.role === 'admin') {
                user.focusedStudent = null;
            }
            if (user.role === 'student') {
                user.state = 'GLOBAL';
                user.isBeingObserved = false;
            }
        });
        
    } else {
        // Volver a INDIVIDUAL
        room.midiRouting = {
            teacherToAll: false,
            studentToTeacher: true,
            studentToStudent: false
        };
        
        room.gamification.active = false;
        
        // Todos los estudiantes vuelven a PRACTICING
        Object.values(room.users).forEach(user => {
            if (user.role === 'student') {
                user.state = 'PRACTICING';
            }
        });
    }
    
    // Notificar a todos
    io.to(roomCode).emit('phase-changed', {
        phase: phase,
        previousPhase: previousPhase,
        initiatedBy: socket.id,
        gamificationMode: gamificationMode || null,
        timestamp: Date.now()
    });
    
    console.log(`[Phase] Sala ${roomCode}: ${previousPhase} → ${phase}`);
    
    broadcastUserList(roomCode);
});


// ==============================================================================
// SECCIÓN 6: MONITOR DE ACTIVIDAD MIDI
// ==============================================================================

/**
 * Emite actualizaciones de actividad MIDI para el dashboard
 * Llamar en un intervalo (ej: cada 500ms)
 */
function broadcastMidiActivity(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    
    const now = Date.now();
    const ACTIVITY_WINDOW = 5000; // Considerar "activo" si hubo MIDI en últimos 5s
    
    const activityMap = {};
    
    Object.entries(room.users).forEach(([socketId, user]) => {
        if (user.role === 'student') {
            const timeSinceActivity = now - (user.lastMidiActivity || 0);
            const isActive = timeSinceActivity < ACTIVITY_WINDOW;
            const activityLevel = isActive 
                ? Math.max(0, 1 - (timeSinceActivity / ACTIVITY_WINDOW))
                : 0;
            
            activityMap[socketId] = {
                level: activityLevel,          // 0.0 - 1.0
                activeNotes: user.activeNotes.size,
                lastActivity: user.lastMidiActivity
            };
        }
    });
    
    // Enviar solo a profesores
    Object.entries(room.users).forEach(([socketId, user]) => {
        if (user.role === 'teacher' || user.role === 'admin') {
            io.to(socketId).emit('midi-activity-update', activityMap);
        }
    });
}

// Iniciar monitor de actividad cuando hay sala activa
function startMidiActivityMonitor(roomCode) {
    const interval = setInterval(() => {
        if (!rooms[roomCode]) {
            clearInterval(interval);
            return;
        }
        broadcastMidiActivity(roomCode);
    }, 500);
    
    // Guardar referencia para limpieza
    rooms[roomCode].activityMonitorInterval = interval;
}


// ==============================================================================
// SECCIÓN 7: BROADCAST DE USER LIST EXTENDIDO
// ==============================================================================

/**
 * Versión extendida de broadcastUserList con estado grupal
 */
function broadcastUserListV2(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    
    const list = Object.entries(room.users).map(([id, u]) => ({
        socketId: id,
        name: u.name,
        role: u.role,
        pdfState: u.pdfState,
        
        // === NUEVO: Estado grupal ===
        state: u.state,
        isBeingObserved: u.isBeingObserved,
        
        // Para profesores: a quién están enfocando
        ...(u.focusedStudent && { focusedStudent: u.focusedStudent }),
        
        // Indicador de actividad reciente
        hasRecentActivity: (Date.now() - (u.lastMidiActivity || 0)) < 5000
    }));
    
    // Añadir metadata de la sala
    const roomMeta = {
        phase: room.phase,
        gamification: room.gamification.active ? {
            mode: room.gamification.mode,
            scores: room.gamification.scores
        } : null
    };
    
    io.to(roomCode).emit("room-users", { users: list, meta: roomMeta });
}
