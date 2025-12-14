const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

// 1. Configuración Inicial
dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);

// Configuración Socket.io para Binarios
const io = new Server(server, {
    cors: { origin: "*" },
    maxHttpBufferSize: 1e7 // 10 MB (Suficiente para PDFs y MIDI)
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
            // Si la sala no existe, la creamos inactiva (sala de espera)
            rooms[roomCode] = { users: {}, isActive: false };
        }
        
        setupUserInRoom(socket, roomCode, payload.username || "Alumno", payload.userRole || "student");
        
        socket.emit("room-joined", roomCode);
        if(rooms[roomCode].isActive) socket.broadcast.to(roomCode).emit("user-entered-sound");
        
        syncRoomState(roomCode);
    });

    // --- RELAY DE AUDIO/MIDI (EL NÚCLEO V3) ---
    
    // Recibimos un ArrayBuffer (Binario puro)
    socket.on("midi-binary", (buffer) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms[roomCode]) return;

        // VOLATILE: Si el cliente está lento, no encolamos paquetes. Se pierden.
        // Esto evita que el piano suene "acelerado" después de un lag.
        socket.broadcast.to(roomCode).volatile.emit("midi-binary", {
            src: socket.id, // Source ID (¿Quién tocó?)
            dat: buffer     // Payload Binario
        });
    });

    // --- GESTIÓN DE ESTADO (PDF Y CLASE) ---

    socket.on("update-pdf-state", (newState) => {
        const room = rooms[socket.roomCode];
        if (!room || !room.users[socket.id]) return;

        // Actualizar memoria del servidor
        const userState = room.users[socket.id].pdfState;
        if (newState.url) userState.url = newState.url;
        if (newState.page) userState.page = newState.page;

        // Rebotar a todos (para modo espía instantáneo)
        io.to(socket.roomCode).emit("user-pdf-updated", {
            userId: socket.id,
            pdfState: userState
        });
        
        // Actualizar lista de participantes (para iconos)
        broadcastUserList(socket.roomCode);
    });

    socket.on("end-class", (roomCode) => {
        if (rooms[roomCode]) {
            rooms[roomCode].isActive = false;
            io.to(roomCode).emit("class-status", { isActive: false });
            io.to(roomCode).emit("force-disconnect");
            delete rooms[roomCode]; // Limpieza
        }
    });
    
    socket.on("set-broadcaster", (targetId) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms[roomCode]) return;
        
        // Seguridad: Solo el profesor
        if (socket.userRole !== 'teacher') return;
    
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
    // Desconexión
    socket.on("disconnect", () => {
        const roomCode = socket.roomCode;
        if (roomCode && rooms[roomCode]) {
            delete rooms[roomCode].users[socket.id];
            // Si no queda nadie, borramos la sala tras un tiempo (opcional) o inmediatamente
            if (Object.keys(rooms[roomCode].users).length === 0) {
                delete rooms[roomCode];
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
            broadcaster: null // <--- Estado del alumno estrella
        };
    }
    
    // 2. GUARDAR AL USUARIO (¡Esta es la parte que faltaba!)
    rooms[roomCode].users[socket.id] = {
        name: name,
        role: role,
        pdfState: { url: null, page: 1 } // Estado inicial del PDF
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎹 PianoLink V3 (Relay) corriendo en puerto ${PORT}`));