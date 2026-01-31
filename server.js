const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const Annotation = require('./models/Annotation');

// 1. Configuración Inicial
dotenv.config();

console.log('[SERVER] 🚀 Iniciando PianoLink...');
console.log(`[SERVER] 🌍 Entorno: ${process.env.NODE_ENV}`);

connectDB();

// ✨ NUEVO: Inicializar sistema de eventos y listeners
console.log('[SERVER] 📬 Registrando listeners de email...');
const { registerEmailListeners } = require('./listeners/emailListeners');
registerEmailListeners(); // Registra listeners de email al iniciar la app

// Verificar configuración de email
const emailService = require('./services/EmailService');
const emailStatus = emailService.getStatus();
console.log('[SERVER] 📧 Estado del servicio de email:', JSON.stringify(emailStatus, null, 2));

const app = express();
const server = http.createServer(app);

// Configuración Socket.io para Binarios con Keepalive Anti-Zombie
// HIGH-PRIORITY MIDI STREAM (Fase 5)
const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? (process.env.CORS_ORIGINS || 'https://pianolink.com').split(',').map(o => o.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

const io = new Server(server, {
    cors: { 
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
    },
    maxHttpBufferSize: 1e7, // 10 MB (Suficiente para PDFs y MIDI)
    pingTimeout: 120000,    // 120s antes de considerar desconexión (aumentado de 60s)
    pingInterval: 25000,    // Enviar ping cada 25s
    connectTimeout: 45000,  // Timeout para establecer conexión inicial
    transports: ['websocket', 'polling'], // Fallback a polling si websocket falla
    
    // === OPTIMIZACIÓN DE LATENCIA PARA MIDI ===
    perMessageDeflate: false,  // Desactivar compresión (latencia > compresión para MIDI)
    httpCompression: false,    // Sin compresión HTTP (MIDI binario no comprime bien)
    allowUpgrades: true,       // Permitir upgrade de polling → websocket
    upgradeTimeout: 10000,     // 10s para upgrade
    
    // === PRIORIZACIÓN DE MENSAJES ===
    // Socket.io v4 no soporta priorización nativa, pero podemos usar:
    // - Eventos separados para MIDI vs otros (implementado)
    // - Compression solo para datos grandes (PDF), no para MIDI
});

// 2. Middlewares y Rutas
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, "public"), { index: false }));

// Rutas API (Mantenemos tu lógica de negocio intacta)
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/teacher', require('./routes/teacherRoutes'));
app.use('/api/scores', require('./routes/scoreRoutes'));
app.use('/api/leads', require('./routes/leadRoutes')); // Lead generation
app.use('/api/calendar', require('./routes/calendarRoutes')); // Google Calendar integration
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

// ==================================================
// EMAIL SERVICE - ENDPOINT DE DIAGNÓSTICO
// ==================================================
/**
 * Endpoint para verificar el estado del servicio de emails
 * Útil para debugging en producción
 */
app.get('/api/email/status', (req, res) => {
    const emailService = require('./services/EmailService');
    const eventService = require('./services/EventService');
    
    const status = {
        email: emailService.getStatus(),
        events: {
            listenerCount: eventService.listenerCount('teacher.created'),
            maxListeners: eventService.getMaxListeners()
        },
        env: {
            NODE_ENV: process.env.NODE_ENV,
            RESEND_API_KEY_SET: !!process.env.RESEND_API_KEY,
            EMAIL_FROM: process.env.EMAIL_FROM,
            EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
            FRONTEND_URL: process.env.FRONTEND_URL
        }
    };
    
    res.json(status);
});

// ==================================================
// PLB (PIANO LINK BRAIN) - ENDPOINT DE STATUS
// ==================================================
/**
 * Endpoint para verificar el estado del servicio PLB
 */
app.get('/api/plb/status', (req, res) => {
    const PLBService = require('./services/PLBService');
    res.json(PLBService.getMetrics());
});

app.get('/', (req, res) => {
  // A) Si la URL tiene parámetros (ej: ?sala=123 o ?role=student) -> Mostrar Piano
  if (req.query.sala || req.query.room || req.query.role || req.query.code) {
      return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  
  // B) Si entra limpio (localhost:3000) -> Mostrar Landing Page
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});


// Rutas de Entrada (SPA)
app.get(['/c/:slug'], (req, res) => {
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
    
    // ⚡ FIX: 'admin' tiene mismos permisos que 'teacher'
    if (requiredRole) {
        const userRole = user.role;
        const hasPermission = (requiredRole === 'teacher') 
            ? (userRole === 'teacher' || userRole === 'admin')
            : (userRole === requiredRole);
            
        if (!hasPermission) {
            console.warn(`[Security] Usuario sin permisos (requiere ${requiredRole}, tiene ${userRole}): ${socket.id}`);
            return false;
        }
    }
    
    return true;
}

// === MIDI BUNDLE DECODER (SERVER-SIDE) ===
/**
 * Decodifica mensajes MIDI (individual O bundle)
 * Soporta formato V1 (13 bytes) y V2 (bundles)
 * @param {ArrayBuffer} buffer - Buffer recibido del cliente
 * @returns {Array<Object>} - Array de mensajes {status, data1, data2, timestamp}
 */
function decodeMidiBundle(buffer) {
    if (!buffer || buffer.byteLength < 13) {
        console.warn('[MIDI Decoder] Buffer inválido o corrupto');
        return [];
    }
    
    const view = new DataView(buffer);
    
    // === DETECTAR FORMATO ===
    // Si byte 2 es 0xFF, es un bundle V2
    const bundleFlag = view.getUint8(2);
    
    if (bundleFlag === 0xFF) {
        // === FORMATO BUNDLE V2 ===
        const messageCount = view.getUint8(3);
        const messages = [];
        
        const headerSize = 4;
        const messageSize = 11;
        const expectedSize = headerSize + (messageCount * messageSize);
        
        if (buffer.byteLength !== expectedSize) {
            console.error(`[MIDI Decoder] Bundle corrupto: esperado ${expectedSize} bytes, recibido ${buffer.byteLength}`);
            return [];
        }
        
        let offset = headerSize;
        for (let i = 0; i < messageCount; i++) {
            messages.push({
                timestamp: view.getFloat64(offset, true),
                status: view.getUint8(offset + 8),
                data1: view.getUint8(offset + 9),
                data2: view.getUint8(offset + 10)
            });
            offset += messageSize;
        }
        
        return messages;
        
    } else {
        // === FORMATO INDIVIDUAL V1 (13 bytes) ===
        if (buffer.byteLength !== 13) {
            console.warn('[MIDI Decoder] Tamaño incorrecto para mensaje individual');
            return [];
        }
        
        return [{
            timestamp: view.getFloat64(2, true),
            status: view.getUint8(10),
            data1: view.getUint8(11),
            data2: view.getUint8(12)
        }];
    }
}

// === FUNCIÓN PARA RECODIFICAR BUNDLE SIN PROGRAM CHANGE ===
function encodeMidiBundle(messages) {
    if (messages.length === 0) return null;
    
    if (messages.length === 1) {
        // === FORMATO INDIVIDUAL V1 (13 bytes) ===
        const buffer = new ArrayBuffer(13);
        const view = new DataView(buffer);
        const msg = messages[0];
        
        view.setUint16(0, 0xFFFF, true); // Magic header
        view.setFloat64(2, msg.timestamp, true);
        view.setUint8(10, msg.status);
        view.setUint8(11, msg.data1);
        view.setUint8(12, msg.data2);
        
        return buffer;
    } else {
        // === FORMATO BUNDLE V2 ===
        const headerSize = 4;
        const messageSize = 11;
        const bufferSize = headerSize + (messages.length * messageSize);
        const buffer = new ArrayBuffer(bufferSize);
        const view = new DataView(buffer);
        
        // Header
        view.setUint16(0, 0xFFFF, true); // Magic
        view.setUint8(2, 0xFF); // Bundle flag
        view.setUint8(3, messages.length); // Message count
        
        // Messages
        let offset = headerSize;
        for (const msg of messages) {
            view.setFloat64(offset, msg.timestamp, true);
            view.setUint8(offset + 8, msg.status);
            view.setUint8(offset + 9, msg.data1);
            view.setUint8(offset + 10, msg.data2);
            offset += messageSize;
        }
        
        return buffer;
    }
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

    // --- RELAY DE AUDIO/MIDI (V5 CON BUNDLE SUPPORT) ---
    
    // Recibimos un ArrayBuffer (Binario puro - individual O bundle)
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

        // === NORMALIZAR BUFFER (Socket.io puede enviar Buffer de Node.js) ===
        let arrayBuffer;
        if (Buffer.isBuffer(buffer)) {
            // Convertir Buffer de Node.js a ArrayBuffer
            arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        } else if (buffer instanceof ArrayBuffer) {
            arrayBuffer = buffer;
        } else {
            console.error('[MIDI] Tipo de buffer inválido:', typeof buffer);
            return;
        }

        // === DECODIFICAR BUNDLE (puede ser 1 o múltiples mensajes) ===
        const messages = decodeMidiBundle(arrayBuffer);
        
        // === CONSTANTES DE SEGURIDAD ===
        const MAX_ACTIVE_NOTES = 128; // Máximo de notas en un piano estándar
        
        // === STATE TRACKING MIDI (SERVER-SIDE) - Procesar cada mensaje ===
        messages.forEach(msg => {
            try {
                const { status, data1: noteId, data2: velocity } = msg;
                
                const isNoteOn = (status >= 144 && status <= 159) && velocity > 0;
                const isNoteOff = (status >= 128 && status <= 143) || (status >= 144 && velocity === 0);
                const isCC = (status >= 176 && status <= 191); // Control Change

                const user = room.users[socket.id];
                
                if (user) {
                    let stateChanged = false;
                    
                    if (isNoteOn) {
                        // SEGURIDAD: Límite de notas activas para prevenir memory leak
                        if (user.activeNotes.size >= MAX_ACTIVE_NOTES) {
                            const oldestNote = user.activeNotes.values().next().value;
                            user.activeNotes.delete(oldestNote);
                            console.warn(`[MIDI] Límite notas usuario: ${socket.id}, liberando ${oldestNote}`);
                        }
                        user.activeNotes.add(noteId);
                        
                        if (socket.userRole === 'teacher') {
                            if (room.teacherActiveNotes.size >= MAX_ACTIVE_NOTES) {
                                const oldestNote = room.teacherActiveNotes.values().next().value;
                                room.teacherActiveNotes.delete(oldestNote);
                                console.warn(`[MIDI] Límite notas sala ${roomCode}, liberando ${oldestNote}`);
                            }
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
                    // Control Change (pedal, etc.) no afecta state tracking pero debe retransmitirse

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
            } catch (e) {
                console.warn('[MIDI State] Error procesando mensaje del bundle:', e.message);
            }
        });
       
        // === FILTRAR PROGRAM CHANGE (192-207) ===
        // Cada usuario debe mantener su propio instrumento configurado
        const filteredMessages = messages.filter(msg => {
            const isProgramChange = (msg.status >= 192 && msg.status <= 207);
            return !isProgramChange;
        });
        
        // === BROADCAST CON PRIORIDAD ALTA ===
        // Si no hay mensajes después del filtro, no enviar nada
        if (filteredMessages.length === 0) return;
        
        // Recodificar bundle sin Program Change
        const filteredBuffer = encodeMidiBundle(filteredMessages);
        
        const user = room.users[socket.id];
        socket.broadcast.to(roomCode).emit("midi-binary", {
            src: socket.id,
            dat: filteredBuffer,
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
        console.log(`[EndClass] Solicitud de ${socket.id} para cerrar sala: ${roomCode}`);
        console.log(`[EndClass] Socket.roomCode: ${socket.roomCode}`);
        
        // VALIDACIÓN: Solo profesores/admin pueden cerrar la clase
        if (!validateUserInRoom(socket, roomCode, 'teacher')) {
            console.log(`[EndClass] ❌ Rechazado - usuario no autorizado`);
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
        
        // Limpiar estado PLB de la sala
        const PLBService = require('./services/PLBService');
        PLBService.clearRoomState(roomCode);
        
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
    // ==================================================
    // SEGURIDAD: Rate Limiting y Validación de Sala
    // ==================================================
    const wbRateLimiter = new Map(); // socketId -> { count, resetTime }
    const WB_RATE_LIMIT = 30; // máximo 30 trazos por segundo
    const WB_RATE_WINDOW = 1000; // ventana de 1 segundo
    
    function checkWbRateLimit(socketId) {
        const now = Date.now();
        let state = wbRateLimiter.get(socketId);
        
        if (!state || now > state.resetTime) {
            state = { count: 0, resetTime: now + WB_RATE_WINDOW };
        }
        
        state.count++;
        wbRateLimiter.set(socketId, state);
        
        return state.count <= WB_RATE_LIMIT;
    }
    
    function sanitizeWbData(data, socketRoomCode) {
        // Validar que el usuario está en la sala que indica
        if (data.room !== socketRoomCode) {
            return null; // Intento de inyección cross-room
        }
        
        return {
            room: data.room,
            page: data.page,
            scoreId: data.scoreId ? String(data.scoreId).substring(0, 50) : null,
            path: data.path,
            id: data.id ? String(data.id).substring(0, 50) : null
        };
    }

    // DIBUJAR: Rebotar y Guardar (CON SEGURIDAD)
    socket.on('wb-draw', async (data) => {
        // SEGURIDAD: Rate limiting
        if (!checkWbRateLimit(socket.id)) {
            console.warn(`[Security] wb-draw rate limit: ${socket.id}`);
            return;
        }
        
        // SEGURIDAD: Validar sala y sanitizar
        const sanitized = sanitizeWbData(data, socket.roomCode);
        if (!sanitized) {
            console.warn(`[Security] wb-draw cross-room blocked: ${socket.id} → ${data.room}`);
            return;
        }
        
        // 1. Enviar a los demás (Rápido - prioridad alta)
        socket.to(sanitized.room).emit('wb-draw', sanitized);

        // 2. Guardar en MongoDB (Background - prioridad baja, no bloqueante)
        if (sanitized.scoreId) {
            setImmediate(async () => {
                try {
                    await Annotation.create({
                        scoreId: sanitized.scoreId,
                        page: sanitized.page,
                        data: sanitized.path
                    });
                } catch (e) {
                    console.error("[wb-draw] Error guardando:", e.message);
                }
            });
        }
    });

    // NUEVO: BORRAR OBJETO INDIVIDUAL (CON SEGURIDAD)
    socket.on('wb-delete', async (data) => {
        // SEGURIDAD: Rate limiting
        if (!checkWbRateLimit(socket.id)) {
            return;
        }
        
        // SEGURIDAD: Validar sala
        const sanitized = sanitizeWbData(data, socket.roomCode);
        if (!sanitized) {
            console.warn(`[Security] wb-delete cross-room blocked: ${socket.id}`);
            return;
        }
        
        // 1. Avisar a los demás
        socket.to(sanitized.room).emit('wb-delete', sanitized);

        // 2. Borrar de la BD (Background)
        if (sanitized.scoreId && sanitized.id) {
            setImmediate(async () => {
                try {
                    await Annotation.deleteOne({ 
                        scoreId: sanitized.scoreId,
                        page: sanitized.page,
                        "data.id": sanitized.id 
                    });
                    console.log(`🗑️ Elemento borrado: ${sanitized.id}`);
                } catch (e) {
                    console.error("[wb-delete] Error:", e.message);
                }
            });
        }
    });

    // BORRAR TODO (CLEAR): Rebotar y Actualizar BD (CON SEGURIDAD)
    socket.on('wb-clear', async (data) => {
        // SEGURIDAD: Validar sala
        const sanitized = sanitizeWbData(data, socket.roomCode);
        if (!sanitized) {
            console.warn(`[Security] wb-clear cross-room blocked: ${socket.id}`);
            return;
        }
        
        socket.to(sanitized.room).emit('wb-clear', sanitized);

        if (sanitized.scoreId) {
            setImmediate(async () => {
                try {
                    await Annotation.deleteMany({ 
                        scoreId: sanitized.scoreId, 
                        page: sanitized.page 
                    });
                } catch (e) {
                    console.error("[wb-clear] Error:", e.message);
                }
            });
        }
    });

    // LÁSER (No se guarda, solo rebota) - Validación ligera
    socket.on('wb-pointer', (data) => {
        if (data.room !== socket.roomCode) return;
        socket.to(data.room).volatile.emit('wb-pointer', data);
    });
    
    // SINCRONIZACIÓN: Solicitar estado actual de la pizarra
    // Nota: Para pizarra libre (whiteboard) no hay persistencia en servidor
    // Solo funciona si otro usuario tiene el estado y lo comparte
    socket.on('wb-request-sync', (data) => {
        if (data.room !== socket.roomCode) return;
        // Pedir a otros usuarios de la sala que compartan su estado
        socket.to(data.room).emit('wb-sync-request', {
            requester: socket.id,
            page: data.page
        });
    });
    
    // Respuesta de sincronización (otro usuario comparte su canvas)
    socket.on('wb-sync-share', (data) => {
        // Enviar directamente al usuario que lo solicitó
        io.to(data.requester).emit('wb-sync-response', {
            page: data.page,
            canvasState: data.canvasState
        });
    });

    // ==================================================
    // AUDIO STATE MANAGER - CONTROL REMOTO
    // ==================================================
    
    /**
     * PROFESOR → ESTUDIANTE: Cambiar modo de audio
     * Solo profesores/admins pueden enviar este comando
     */
    socket.on('change-audio-mode', (data) => {
        const roomCode = socket.roomCode;
        
        // Validar que sea profesor/admin
        if (socket.userRole !== 'teacher' && socket.userRole !== 'admin') {
            console.log('[AudioControl] ⛔ Rechazado: usuario no autorizado', socket.userRole);
            return;
        }
        
        // Validar sala
        if (!roomCode || !rooms[roomCode]) {
            console.log('[AudioControl] ⛔ Sala no válida');
            return;
        }
        
        console.log('[AudioControl] 🔄 change-audio-mode:', data.profile, '→ target:', data.targetUserId || 'broadcast');
        
        // Preparar payload con info del origen
        const payload = {
            profile: data.profile,
            fromUserId: socket.id,
            fromRole: socket.userRole,
            timestamp: Date.now()
        };
        
        // Si hay target específico, enviar solo a ese usuario
        if (data.targetUserId) {
            io.to(data.targetUserId).emit('change-audio-mode', payload);
        } else {
            // Broadcast a toda la sala (excepto al profesor)
            socket.to(roomCode).emit('change-audio-mode', payload);
        }
    });
    
    /**
     * PROFESOR → ESTUDIANTE: Mute remoto
     * Silencia el micrófono del estudiante remotamente
     */
    socket.on('remote-mute', (data) => {
        const roomCode = socket.roomCode;
        
        // Validar que sea profesor/admin
        if (socket.userRole !== 'teacher' && socket.userRole !== 'admin') {
            console.log('[AudioControl] ⛔ Remote mute rechazado: no autorizado');
            return;
        }
        
        if (!roomCode || !rooms[roomCode]) {
            console.log('[AudioControl] ⛔ Sala no válida para remote mute');
            return;
        }
        
        console.log('[AudioControl] 🔇 remote-mute:', data.muted ? 'MUTE' : 'UNMUTE', '→ target:', data.targetUserId || 'broadcast');
        
        const payload = {
            muted: data.muted,
            fromUserId: socket.id,
            fromRole: socket.userRole,
            timestamp: Date.now()
        };
        
        if (data.targetUserId) {
            io.to(data.targetUserId).emit('remote-mute', payload);
        } else {
            socket.to(roomCode).emit('remote-mute', payload);
        }
    });
    
    /**
     * ESTUDIANTE → PROFESOR: Confirmación de cambio de modo
     */
    socket.on('audio-mode-confirmed', (data) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms[roomCode]) return;
        
        console.log('[AudioControl] ✅ Estudiante confirmó modo:', data.profile);
        
        // Broadcast a profesores de la sala
        const room = rooms[roomCode];
        Object.entries(room.users).forEach(([socketId, user]) => {
            if (user.role === 'teacher' || user.role === 'admin') {
                io.to(socketId).emit('audio-mode-confirmed', {
                    userId: socket.id,
                    userName: socket.userName,
                    profile: data.profile,
                    success: data.success
                });
            }
        });
    });
    
    /**
     * ESTUDIANTE → PROFESOR: Confirmación de mute remoto
     */
    socket.on('remote-mute-confirmed', (data) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms[roomCode]) return;
        
        console.log('[AudioControl] ✅ Estudiante confirmó mute:', data.muted);
        
        const room = rooms[roomCode];
        Object.entries(room.users).forEach(([socketId, user]) => {
            if (user.role === 'teacher' || user.role === 'admin') {
                io.to(socketId).emit('remote-mute-confirmed', {
                    userId: socket.id,
                    userName: socket.userName,
                    muted: data.muted,
                    success: data.success
                });
            }
        });
    });

    // ==================================================
    // PLB (PIANO LINK BRAIN) - EVENTOS DE IA
    // ==================================================
    const PLBService = require('./services/PLBService');
    
    /**
     * CLIENTE → SERVIDOR: Transcripción de audio
     * Solo procesa si el usuario está en la lista permitida
     */
    socket.on('plb-transcript', async (data) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms[roomCode]) return;
        
        // Obtener email del usuario (guardado en socket o data)
        const userEmail = data.userEmail || socket.userEmail;
        
        if (!userEmail) {
            return; // Sin email, ignorar silenciosamente
        }
        
        // Verificar si puede usar PLB
        if (!PLBService.isUserAllowed(userEmail)) {
            return; // No autorizado, ignorar silenciosamente
        }
        
        console.log(`[PLB] 📝 Transcripción de ${data.speaker}: "${data.text.substring(0, 50)}..."`);
        
        // Procesar transcripción
        const result = await PLBService.processTranscript(roomCode, userEmail, {
            text: data.text,
            speaker: data.speaker || 'unknown'
        });
        
        // Si hay un hint, enviarlo solo al profesor de la sala
        if (result && result.hint) {
            const room = rooms[roomCode];
            Object.entries(room.users).forEach(([socketId, user]) => {
                if (user.role === 'teacher' || user.role === 'admin') {
                    io.to(socketId).emit('plb-hint', {
                        hint: result.hint,
                        latency: result.latency,
                        timestamp: result.timestamp,
                        context: result.context // Contexto para feedback/mejora
                    });
                }
            });
        }
    });
    
    /**
     * CLIENTE → SERVIDOR: Guardar email del usuario para PLB
     */
    socket.on('plb-register', (data) => {
        if (data.email) {
            socket.userEmail = data.email.toLowerCase();
            console.log(`[PLB] 📧 Usuario registrado: ${socket.userEmail}`);
            
            // Informar al cliente si tiene PLB habilitado
            const isAllowed = PLBService.isUserAllowed(socket.userEmail);
            socket.emit('plb-status', { 
                enabled: isAllowed,
                email: socket.userEmail
            });
        }
    });
    
    /**
     * SERVIDOR → CLIENTE: Métricas de PLB (solo para admins)
     */
    socket.on('plb-get-metrics', () => {
        if (socket.userRole === 'admin') {
            socket.emit('plb-metrics', PLBService.getMetrics());
        }
    });

    /**
     * CLIENTE → SERVIDOR: Guardar mejora de respuesta PLB
     * El profesor puede mejorar las respuestas del asistente
     */
    socket.on('plb-improve', async (data) => {
        // Obtener email del socket o del data enviado
        const userEmail = socket.userEmail || data.userEmail;
        
        if (!userEmail) {
            socket.emit('plb-improve-result', { success: false, error: 'No autenticado' });
            return;
        }
        
        // Solo usuarios permitidos pueden enviar mejoras
        if (!PLBService.isUserAllowed(userEmail)) {
            socket.emit('plb-improve-result', { success: false, error: 'No autorizado' });
            return;
        }
        
        try {
            const result = await PLBService.saveImprovement({
                context: data.context,
                originalResponse: data.originalResponse,
                improvedResponse: data.improvedResponse,
                teacherEmail: userEmail
            });
            
            console.log(`[PLB] 📚 Mejora guardada por ${userEmail}: "${data.context?.substring(0, 30)}..."`);
            socket.emit('plb-improve-result', { success: true, exampleId: result._id });
        } catch (error) {
            console.error('[PLB] Error guardando mejora:', error);
            socket.emit('plb-improve-result', { success: false, error: error.message });
        }
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

// ⚡ Heartbeat periódico cada 2 segundos (REDUCIDO de 5s para mayor resiliencia)
// Esto sincroniza el estado completo del piano incluso durante legatos sostenidos
function startSnapshotHeartbeat() {
    // Limpiar intervalo anterior si existe
    if (snapshotHeartbeatInterval) {
        clearInterval(snapshotHeartbeatInterval);
    }
    
    snapshotHeartbeatInterval = setInterval(() => {
        Object.keys(rooms).forEach(roomCode => {
            sendSnapshot(roomCode);
        });
    }, 2000); // ⚡ REDUCIDO a 2000ms (era 5000ms)
    
    console.log('[Snapshot] ⚡ Heartbeat MIDI iniciado (cada 2s).');
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

// ==================================================
// 6. GRACEFUL SHUTDOWN (PRODUCCIÓN)
// ==================================================
function gracefulShutdown(signal) {
    console.log(`\n[Shutdown] Señal ${signal} recibida. Iniciando cierre limpio...`);
    
    // 1. Detener heartbeat de snapshots
    if (snapshotHeartbeatInterval) {
        clearInterval(snapshotHeartbeatInterval);
        console.log('[Shutdown] Heartbeat de snapshots detenido.');
    }
    
    // 2. Limpiar todas las salas y sus timers
    Object.keys(rooms).forEach(roomCode => {
        const room = rooms[roomCode];
        if (room.snapshotTimer) clearTimeout(room.snapshotTimer);
        if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
        
        // Notificar a usuarios de la desconexión
        io.to(roomCode).emit('server-shutdown', { 
            message: 'Servidor reiniciando, reconecta en unos segundos' 
        });
    });
    console.log('[Shutdown] Salas limpiadas y usuarios notificados.');
    
    // 3. Cerrar Socket.IO
    io.close(() => {
        console.log('[Shutdown] Socket.IO cerrado.');
        
        // 4. Cerrar servidor HTTP
        server.close(() => {
            console.log('[Shutdown] Servidor HTTP cerrado.');
            console.log('[Shutdown] ✅ Limpieza completa. Saliendo...');
            process.exit(0);
        });
    });
    
    // 5. Timeout de seguridad (si el cierre tarda más de 10s, forzar salida)
    setTimeout(() => {
        console.error('[Shutdown] ⚠️ Timeout alcanzado. Forzando salida...');
        process.exit(1);
    }, 10000);
}

// Capturar señales de terminación
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Capturar errores no manejados (última defensa)
process.on('uncaughtException', (error) => {
    console.error('[Critical Error] Excepción no capturada:', error);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Critical Error] Promesa rechazada no manejada:', reason);
    // No cerramos aquí, solo logueamos - para evitar crasheos innecesarios
});

// ==================================================
// 7. HEALTH CHECK ENDPOINT
// ==================================================
app.get('/health', (req, res) => {
    const mongoose = require('mongoose');
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: Date.now(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        rooms: Object.keys(rooms).length,
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎹 PianoLink V4 (State-Aware Relay) corriendo en puerto ${PORT}`);
    console.log(`📡 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔒 CORS: ${process.env.NODE_ENV === 'production' ? 'Restringido' : 'Desarrollo'}`);
    console.log('[Lifecycle] Graceful shutdown configurado.');
    
    // Notificar a PM2 que estamos listos
    if (process.send) {
        process.send('ready');
    }
});