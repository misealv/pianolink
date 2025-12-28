const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const Annotation = require('./models/Annotation');

// 1. Configuración Inicial
dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);

// Configuración Socket.io para Binarios con Keepalive Anti-Zombie
const io = new Server(server, {
    cors: { origin: "*" },
    maxHttpBufferSize: 1e7, // 10 MB (Suficiente para PDFs y MIDI)
    pingTimeout: 60000,     // 60s antes de considerar desconexión
    pingInterval: 25000,    // Enviar ping cada 25s
    connectTimeout: 45000,  // Timeout para establecer conexión inicial
    transports: ['websocket', 'polling'] // Fallback a polling si websocket falla
});

// 2. Middlewares y Rutas
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, "public"), { index: false }));

// Rutas API (Mantenemos tu lógica de negocio intacta)
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/teacher', require('./routes/teacherRoutes'));
app.use('/api/scores', require('./routes/scoreRoutes'));
app.use('/admin', require('./routes/adminRoutes'));

// ==================================================
// AGORA AV - FASE 0: ENDPOINT RESILIENTE
// ==================================================
/**
 * Endpoint para obtener credenciales de Agora
 * RESILIENCIA: Nunca falla, retorna valores vacíos si no existen variables
 */
app.get('/api/agora/credentials', (req, res) => {
    const appId = process.env.AGORA_APP_ID || '';
    const appCertificate = process.env.AGORA_APP_CERTIFICATE || '';
    
    if (!appId) {
        console.warn('[Agora] ⚠️ AGORA_APP_ID no configurado en .env');
    }
    
    if (!appCertificate) {
        console.warn('[Agora] ⚠️ AGORA_APP_CERTIFICATE no configurado en .env');
    }
    
    // SIEMPRE responde 200 OK, nunca 500
    res.status(200).json({
        success: !!appId, // true si existe AppId
        appId: appId,
        hasToken: !!appCertificate, // Indica si hay certificado (para tokens futuros)
        timestamp: Date.now()
    });
});

app.get('/', (req, res) => {
  // A) Si la URL tiene parámetros (ej: ?sala=123 o ?role=student) -> Mostrar Piano
  if (req.query.sala || req.query.room || req.query.role || req.query.code) {
      return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  
  // B) Si entra limpio (localhost:3000) -> Mostrar Login
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});


// Rutas de Entrada (SPA)
app.get(['/', '/c/:slug'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================================================
// 3. LÓGICA DE TIEMPO REAL (RELAY V3)
// ==================================================
const rooms = {};
let snapshotHeartbeatInterval = null; // Heartbeat global del snapshot protocol

// === SEGURIDAD: Validación de autorización de usuario ===
function validateUserInRoom(socket, roomCode, requiredRole = null) {
    const room = rooms[roomCode];
    
    if (!room) {
        console.warn(`[Security] Sala inexistente: ${roomCode}`);
        return false;
    }
    
    const user = room.users[socket.id];
    
    if (!user) {
        console.warn(`[Security] Usuario no autorizado en sala ${roomCode}: ${socket.id}`);
        return false;
    }
    
    if (requiredRole && user.role !== requiredRole) {
        console.warn(`[Security] Usuario sin permisos (requiere ${requiredRole}): ${socket.id}`);
        return false;
    }
    
    return true;
}

io.on("connection", (socket) => {
    // console.log(`🔌 Cliente conectado: ${socket.id}`);

    // --- GESTIÓN DE SALAS ---
    
    // Crear Sala (Profesor)
    socket.on("create-room", (payload) => {
        const roomCode = (payload.roomCode || generateCode()).toUpperCase();
        setupUserInRoom(socket, roomCode, payload.username || "Profesor", "teacher");
        
        rooms[roomCode].isActive = true; // El profe activa la sala
        socket.emit("room-created", roomCode);
        syncRoomState(roomCode);
    });

    // Unirse a Sala (Alumno)
    socket.on("join-room", (payload) => {
        const roomCode = (payload.roomCode || "").toUpperCase();
        if (!rooms[roomCode]) {
            rooms[roomCode] = { users: {}, isActive: false };
        }
        
        setupUserInRoom(socket, roomCode, payload.username || "Alumno", payload.userRole || "student");
        
        socket.emit("room-joined", roomCode);
        if(rooms[roomCode].isActive) socket.broadcast.to(roomCode).emit("user-entered-sound");
        
        syncRoomState(roomCode);
        
        // --- FULL SNAPSHOT AL UNIRSE (CRÍTICO PARA RECONEXIÓN) ---
        setTimeout(() => {
            const room = rooms[roomCode];
            if (room && room.teacherActiveNotes) {
                const snapshot = Array.from(room.teacherActiveNotes);
                socket.emit('midi-snapshot', {
                    notes: snapshot,
                    timestamp: Date.now(),
                    type: 'full'
                });
                console.log(`[Snapshot] Full snapshot enviado a ${socket.id}: ${snapshot.length} notas`);
            }
        }, 100); // Pequeño delay para asegurar que el cliente esté listo
    });

    // --- RELAY DE AUDIO/MIDI (V4 CON SNAPSHOT REACTIVO) ---
    
    // Recibimos un ArrayBuffer (Binario puro)
    socket.on("midi-binary", (buffer) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms[roomCode]) return;
        
        // VALIDACIÓN DE SEGURIDAD
        if (!validateUserInRoom(socket, roomCode)) {
            return; // Silenciar mensaje no autorizado
        }
        
        const room = rooms[roomCode];
        
        // Solo permitir MIDI si la clase está activa
        if (!room.isActive) {
            return;
        }

        // --- STATE TRACKING MIDI (SERVER-SIDE) ---
        try {
            const view = new DataView(buffer);
            if (buffer.byteLength === 13) {
                const status = view.getUint8(10);
                const noteId = view.getUint8(11);
                const velocity = view.getUint8(12);

                const isNoteOn = (status >= 144 && status <= 159) && velocity > 0;
                const isNoteOff = (status >= 128 && status <= 143) || (status >= 144 && velocity === 0);

                const user = rooms[roomCode].users[socket.id];
                const room = rooms[roomCode];
                
                if (user) {
                    let stateChanged = false;
                    
                    if (isNoteOn) {
                        user.activeNotes.add(noteId);
                        if (socket.userRole === 'teacher') {
                            room.teacherActiveNotes.add(noteId);
                            stateChanged = true;
                        }
                    } else if (isNoteOff) {
                        user.activeNotes.delete(noteId);
                        if (socket.userRole === 'teacher') {
                            room.teacherActiveNotes.delete(noteId);
                            stateChanged = true;
                        }
                    }

                    // --- SNAPSHOT REACTIVO ---
                    if (stateChanged && socket.userRole === 'teacher') {
                        room.lastActivityTime = Date.now();
                        
                        // Limpiar timer de inactividad anterior
                        if (room.inactivityTimer) {
                            clearTimeout(room.inactivityTimer);
                        }
                        
                        // Si todas las notas se apagaron, enviar snapshot vacío inmediato
                        if (room.teacherActiveNotes.size === 0 && room.lastSnapshot.length > 0) {
                            const emptySnapshot = new Int8Array(0);
                            io.to(roomCode).emit('midi-snapshot', {
                                notes: Array.from(emptySnapshot),
                                timestamp: Date.now(),
                                type: 'immediate'
                            });
                            room.lastSnapshot = [];
                            console.log(`[Snapshot] Sala ${roomCode}: Snapshot vacío inmediato enviado`);
                        } else {
                            // Programar snapshot reactivo después de 200ms de inactividad
                            room.inactivityTimer = setTimeout(() => {
                                sendSnapshot(roomCode);
                            }, 200);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[MIDI State] Error decodificando:', e.message);
        }
       
        // Broadcast con identificación verificada del servidor
        const user = room.users[socket.id];
        socket.broadcast.to(roomCode).emit("midi-binary", {
            src: socket.id,
            dat: buffer,
            userId: user.name // Identificación verificada
        });
    });
   
   //Ping para saber latencia
    socket.on("latency-ping", (startTime) => {
        socket.emit("latency-pong", startTime); 
    });
    
    // Heartbeat del cliente para mantener conexión viva
    socket.on("client-heartbeat", (data) => {
        const room = rooms[data.roomCode];
        if (room && room.users[socket.id]) {
            room.users[socket.id].lastHeartbeat = Date.now();
            // Responder para confirmar (opcional)
            socket.emit("heartbeat-ack", { timestamp: Date.now() });
        }
    });
    
   // --- GESTIÓN DE ESTADO (PDF Y CLASE) ---

   socket.on("update-pdf-state", (newState) => {
    const room = rooms[socket.roomCode];
    if (!room || !room.users[socket.id]) return;

    // Actualizar memoria del servidor
    const userState = room.users[socket.id].pdfState;
    if (newState.url) userState.url = newState.url;
    if (newState.page) userState.page = newState.page;
    
    // --- FIX: GUARDAR SCORE ID ---
    // Esto permite que el profesor sepa qué anotaciones buscar en la DB al usar el modo espía
    if (newState.scoreId) userState.scoreId = newState.scoreId; 
    // -----------------------------

    // Rebotar a todos (para modo espía instantáneo)
    io.to(socket.roomCode).emit("user-pdf-updated", {
        userId: socket.id,
        pdfState: userState
    });
    
    // Actualizar lista de participantes (para iconos)
    broadcastUserList(socket.roomCode);
});

    socket.on("end-class", (roomCode) => {
        // VALIDACIÓN: Solo profesores pueden cerrar la clase
        if (!validateUserInRoom(socket, roomCode, 'teacher')) {
            socket.emit('error', { message: 'No autorizado para cerrar la clase' });
            return;
        }
        
        const room = rooms[roomCode];
        if (!room) return;
        
        room.isActive = false;
        io.to(roomCode).emit("class-status", { isActive: false });
        io.to(roomCode).emit("force-disconnect");
        console.log(`[Admin] Clase cerrada por profesor: ${roomCode}`);
        
        // Limpiar sala
        Object.keys(room.users).forEach(sid => {
            const s = io.sockets.sockets.get(sid);
            if (s) s.leave(roomCode);
        });
        
        if (room.snapshotTimer) clearTimeout(room.snapshotTimer);
        if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
        delete rooms[roomCode];
    });
    
    socket.on("set-broadcaster", (targetId) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms[roomCode]) return;
        
        // VALIDACIÓN: Solo profesores pueden cambiar broadcaster
        if (!validateUserInRoom(socket, roomCode, 'teacher')) {
            socket.emit('error', { message: 'No autorizado para cambiar broadcaster' });
            return;
        }
    
        // Toggle (encender/apagar)
        const current = rooms[roomCode].broadcaster;
        const newBroadcaster = (current === targetId) ? null : targetId;
        
        rooms[roomCode].broadcaster = newBroadcaster;
    
        // 1. Avisar quién es la nueva estrella
        io.to(roomCode).emit("broadcaster-changed", newBroadcaster);
    
        // 2. MAGIA DE SINCRONIZACIÓN INMEDIATA (NUEVO)
        // Si hay un nuevo broadcaster, enviamos SU partitura a todos YA.
        if (newBroadcaster) {
            const broadcasterUser = rooms[roomCode].users[newBroadcaster];
            // Verificamos que el usuario exista y tenga un PDF abierto
            if (broadcasterUser && broadcasterUser.pdfState && broadcasterUser.pdfState.url) {
                io.to(roomCode).emit("user-pdf-updated", {
                    userId: newBroadcaster,
                    pdfState: broadcasterUser.pdfState
                });
            }
        }
    });

    // --- PIZARRA CON BASE DE DATOS ---

    // DIBUJAR: Rebotar y Guardar
    socket.on('wb-draw', async (data) => {
        // 1. Enviar a los demás (Rápido)
        socket.to(data.room).emit('wb-draw', data);

        // 2. Guardar en MongoDB (Si es una partitura guardada)
        if (data.scoreId) {
            try {
                await Annotation.create({
                    scoreId: data.scoreId,
                    page: data.page,
                    data: data.path // El trazo JSON
                });
            } catch (e) {
                console.error("Error guardando trazo:", e);
            }
        }
    });

    // NUEVO: BORRAR OBJETO INDIVIDUAL
    socket.on('wb-delete', async (data) => {
        // 1. Avisar a los demás
        socket.to(data.room).emit('wb-delete', data);

        // 2. Borrar de la BD
        if (data.scoreId && data.id) {
            try {
                // Buscamos el documento donde annotation.data.id coincida con el ID recibido
                await Annotation.deleteOne({ 
                    scoreId: data.scoreId,
                    page: data.page,
                    "data.id": data.id 
                });
                console.log(`🗑️ Elemento borrado: ${data.id}`);
            } catch (e) {
                console.error("Error borrando elemento:", e);
            }
        }
    });

    // BORRAR TODO (CLEAR): Rebotar y Actualizar BD
    socket.on('wb-clear', async (data) => {
        socket.to(data.room).emit('wb-clear', data);

        if (data.scoreId) {
            try {
                // Borrar anotaciones de ESA página
                await Annotation.deleteMany({ 
                    scoreId: data.scoreId, 
                    page: data.page 
                });
            } catch (e) {
                console.error("Error borrando anotaciones:", e);
            }
        }
    });

    // LÁSER (No se guarda, solo rebota)
    socket.on('wb-pointer', (data) => {
        socket.to(data.room).volatile.emit('wb-pointer', data);
    });

    // Desconexión
    socket.on("disconnect", () => {
        const roomCode = socket.roomCode;
        if (roomCode && rooms[roomCode]) {
            const room = rooms[roomCode];
            
            // Limpiar timers de snapshot si existen
            if (room.snapshotTimer) clearTimeout(room.snapshotTimer);
            if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
            
            // Si era el profesor, limpiar las notas globales
            if (socket.userRole === 'teacher' && room.teacherActiveNotes) {
                room.teacherActiveNotes.clear();
            }
            
            delete room.users[socket.id];
            
            if (Object.keys(room.users).length === 0) {
                // Última persona saliendo: limpiar sala completamente
                console.log(`[Cleanup] Sala ${roomCode} vacía. Limpiando recursos...`);
                
                // Limpiar timers de la sala si no fueron limpiados antes
                if (room.snapshotTimer) clearTimeout(room.snapshotTimer);
                if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
                
                delete rooms[roomCode];
                
                // Si no quedan salas activas, detener el heartbeat global
                if (Object.keys(rooms).length === 0 && snapshotHeartbeatInterval) {
                    console.log('[Snapshot] No hay salas activas. Deteniendo heartbeat.');
                    clearInterval(snapshotHeartbeatInterval);
                    snapshotHeartbeatInterval = null;
                }
            } else {
                broadcastUserList(roomCode);
            }
        }
    });
});

// --- Helpers ---
function setupUserInRoom(socket, roomCode, name, role) {
    socket.roomCode = roomCode;
    socket.userName = name;
    socket.userRole = role;
    socket.join(roomCode);

    // 1. Si la sala no existe, la creamos con la estructura completa (incluyendo broadcaster)
    if (!rooms[roomCode]) {
        rooms[roomCode] = { 
            users: {}, 
            isActive: false,
            broadcaster: null,
            teacherActiveNotes: new Set(),
            // --- SNAPSHOT PROTOCOL V2 ---
            lastSnapshot: [],
            lastActivityTime: Date.now(),
            snapshotTimer: null,
            inactivityTimer: null
        };
        
        // Reiniciar heartbeat si estaba detenido
        if (!snapshotHeartbeatInterval) {
            console.log('[Snapshot] Primera sala creada. Iniciando heartbeat...');
            startSnapshotHeartbeat();
        }
    }
    
    // 2. GUARDAR AL USUARIO
    rooms[roomCode].users[socket.id] = {
        name: name,
        role: role,
        pdfState: { url: null, page: 1 }, // Estado inicial del PDF
        activeNotes: new Set() // <--- NUEVO: Notas activas de este usuario
    };
}

function syncRoomState(roomCode) {
    if(!rooms[roomCode]) return;
    io.to(roomCode).emit("class-status", { isActive: rooms[roomCode].isActive });
    //  Sincronizar Broadcaster
    io.to(roomCode).emit("broadcaster-changed", rooms[roomCode].broadcaster);
    broadcastUserList(roomCode);
}

function broadcastUserList(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    const list = Object.entries(room.users).map(([id, u]) => ({
        socketId: id,
        name: u.name,
        role: u.role,
        pdfState: u.pdfState
    }));
    io.to(roomCode).emit("room-users", list);
}

function generateCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// ==================================================
// 4. SNAPSHOT PROTOCOL (OPTIMIZADO Y REACTIVO)
// ==================================================

/**
 * Envía un snapshot del estado actual de una sala
 */
function sendSnapshot(roomCode) {
    const room = rooms[roomCode];
    if (!room || !room.isActive) return;
    
    const currentNotes = Array.from(room.teacherActiveNotes || []);
    
    // Solo enviar si el snapshot cambió
    const snapshotChanged = JSON.stringify(currentNotes) !== JSON.stringify(room.lastSnapshot);
    
    if (snapshotChanged || currentNotes.length > 0) {
        io.to(roomCode).emit('midi-snapshot', {
            notes: currentNotes,
            timestamp: Date.now(),
            type: 'periodic'
        });
        
        room.lastSnapshot = currentNotes;
        
        if (currentNotes.length > 0) {
            console.log(`[Snapshot] Sala ${roomCode}: ${currentNotes.length} notas [${currentNotes.join(', ')}]`);
        }
    }
}

// Heartbeat periódico cada 5 segundos (backup del sistema reactivo)
function startSnapshotHeartbeat() {
    // Limpiar intervalo anterior si existe
    if (snapshotHeartbeatInterval) {
        clearInterval(snapshotHeartbeatInterval);
    }
    
    snapshotHeartbeatInterval = setInterval(() => {
        Object.keys(rooms).forEach(roomCode => {
            sendSnapshot(roomCode);
        });
    }, 5000);
    
    console.log('[Snapshot] Heartbeat iniciado.');
}

// Iniciar el heartbeat
startSnapshotHeartbeat();

// ==================================================
// 5. CLOCK SYNC PROTOCOL (NTP BÁSICO)
// ==================================================
io.on("connection", (socket) => {
    socket.on('clock-sync-request', (clientTimestamp) => {
        const serverTimestamp = Date.now();
        socket.emit('clock-sync-response', {
            clientTimestamp,
            serverTimestamp,
            serverResponseTime: Date.now()
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎹 PianoLink V4 (State-Aware Relay) corriendo en puerto ${PORT}`));