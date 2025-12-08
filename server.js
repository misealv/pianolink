const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

// --- NUEVO: Imports para Base de Datos ---
const dotenv = require("dotenv");
const connectDB = require("./config/db");
// ----------------------------------------

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- NUEVO: Conexión y Rutas de Usuario ---

// 1. Cargar variables de entorno y conectar a Mongo
dotenv.config();
connectDB();

// 2. Middleware (Vital para que funcione el Login)
app.use(express.json());



// 3. Rutas de Autenticación
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/teacher', require('./routes/teacherRoutes'));
// ------------------------------------------

/// ===============================
// Static y Rutas Principales (INTELIGENTE)
// ===============================

// 1. Archivos Estáticos (CSS, JS, Imágenes)
// "index: false" es el TRUCO para que NO cargue el piano automáticamente
app.use(express.static(path.join(__dirname, "public"), { index: false }));
app.use(express.static(__dirname, { index: false }));

// 2. RUTA: La Puerta Principal (/)
app.get('/', (req, res) => {
    // LÓGICA DE PORTERO:
    // ¿Trae invitación? (ej: ?sala=PEDRO o ?role=student) -> Pasa al Piano
    if (req.query.sala || req.query.room || req.query.role === 'student') {
        return res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
    
    // ¿Viene sin nada? -> Mándalo al Login
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 3. RUTA: Salas Personalizadas (/c/nombre) -> Pasa al Piano
app.get('/c/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// ===============================
// Salas en memoria
// ===============================
const rooms = {};

function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function broadcastRoomUsers(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const usersArray = Object.entries(room.users).map(([socketId, data]) => ({
    socketId,
    name: data.name,
    role: data.role,
    pdfUrl: data.pdfUrl || null // <--- ¡ESTO ES LO QUE FALTABA!
  }));

  io.to(roomCode).emit("room-users", usersArray);
}

// ===============================
// Socket.IO (Lógica del Servidor Actualizada)
// ===============================
io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);

  // 1. EL PROFESOR ACTIVA LA SALA (create-room)
  socket.on("create-room", (payload) => {
    const username = (payload && (payload.username || payload.userName)) || "Profesor";
    const role = (payload && (payload.userRole || payload.role)) || "teacher";

    // Definir código de sala
    let roomCode;
    if (payload && payload.roomCode) {
        roomCode = payload.roomCode.toUpperCase();
    } else {
        roomCode = generateCode();
    }

    socket.roomCode = roomCode;
    socket.userName = username;
    socket.userRole = role;

    // Crear sala si no existe
    if (!rooms[roomCode]) {
        rooms[roomCode] = {
          users: {},
          liveStudentId: null,
          isActive: false // <--- NUEVO: Por defecto cerrada
        };
    }
    
    // Si entra un PROFESOR, la sala se ACTIVA (abre la puerta)
    if (role === 'teacher') {
        rooms[roomCode].isActive = true;
    }

    rooms[roomCode].users[socket.id] = { name: username, role };

    socket.join(roomCode);
    socket.emit("room-created", roomCode);
    
    // NUEVO: Avisar a todos que la clase está ACTIVA (quita la pantalla de espera)
    io.to(roomCode).emit("class-status", { isActive: rooms[roomCode].isActive });
    
    broadcastRoomUsers(roomCode);
    console.log(`Sala ${roomCode} gestionada por ${username} (Activa: ${rooms[roomCode].isActive})`);
  });

  // 2. EL ALUMNO SE UNE (join-room)
  socket.on("join-room", (payload) => {
    let roomCode, username, role;

    if (typeof payload === "string") {
      roomCode = payload;
    } else {
      roomCode = payload.roomCode || payload.code;
      username = payload.username || payload.userName;
      role = payload.userRole || payload.role;
    }

    if (!roomCode) {
      socket.emit("error-message", "Falta código de sala.");
      return;
    }

    // Limpieza
    roomCode = roomCode.toUpperCase();
    username = username || "Alumno";
    role = role || "student";

    // Si la sala no existe, la creamos "en espera" (isActive: false)
    if (!rooms[roomCode]) {
        rooms[roomCode] = {
            users: {},
            liveStudentId: null,
            isActive: false // Esperando al profe
        };
    } else {
        // Si ya existe, nos aseguramos que tenga la propiedad isActive
        if (typeof rooms[roomCode].isActive === 'undefined') {
            rooms[roomCode].isActive = false;
        }
    }

    socket.roomCode = roomCode;
    socket.userName = username;
    socket.userRole = role;

    rooms[roomCode].users[socket.id] = { name: username, role };
    socket.join(roomCode);

    socket.emit("room-joined", roomCode);
    
    // NUEVO: Le decimos al alumno el estado real de la clase
    socket.emit("class-status", { isActive: rooms[roomCode].isActive });

    // NUEVO: Sonido de "Ding" para los demás (solo si la clase ya está activa)
    if (rooms[roomCode].isActive) {
        socket.broadcast.to(roomCode).emit("user-entered-sound");
    }

    broadcastRoomUsers(roomCode);
    
    // Sincronizar estado si hay clase
    const liveId = rooms[roomCode].liveStudentId || null;
    if (liveId) socket.emit("live-student-changed", { liveStudentId: liveId });
  });

  // 3. NUEVO: TERMINAR CLASE (Botón Rojo)
  socket.on("end-class", (roomCode) => {
      if(rooms[roomCode]) {
          rooms[roomCode].isActive = false; // Cerramos la sala
          
          // Avisamos a todos (esto activará la pantalla de espera o los sacará)
          io.to(roomCode).emit("class-status", { isActive: false });
          io.to(roomCode).emit("force-disconnect"); 
          
          console.log(`Clase ${roomCode} terminada por el profesor.`);
      }
  });

  // --- MANTENEMOS TUS FUNCIONES EXACTAS PARA QUE NADA FALLE ---

  // MIDI (Intacto)
  socket.on("midi-message", (message) => {
    const roomCode = socket.roomCode || message.roomCode;
    if (!roomCode || !rooms[roomCode]) return;

    const fromName = socket.userName || message.fromName || "Usuario";
    const fromRole = socket.userRole || message.fromRole;

    io.to(roomCode).volatile.emit("midi-message", {
      ...message,
      roomCode,
      fromSocketId: socket.id,
      fromName,
      fromRole,
    });
  });

  // MASTERCLASS (Intacto)
  socket.on("set-live-student", (payload) => {
    const roomCode = (payload && payload.roomCode) || socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;

    const room = rooms[roomCode];
    const me = room.users[socket.id];
    if (!me || me.role !== "teacher") return;

    const studentSocketId = payload.studentSocketId || null;

    if (studentSocketId && !room.users[studentSocketId]) {
      room.liveStudentId = null;
    } else {
      room.liveStudentId = studentSocketId;
    }

    io.to(roomCode).emit("live-student-changed", {
      liveStudentId: room.liveStudentId,
    });
  });

  // SINCRONIZACIÓN (Intacto)
  socket.on("request-full-state", (roomCode) => {
    socket.to(roomCode).emit("teacher-sync-request", socket.id); 
  });

  // PDF (Intacto)
  socket.on("pdf-update", (payload) => {
    const roomCode = payload.roomCode || socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;

    // 1. Guardar la URL en la memoria del servidor
    if (rooms[roomCode].users[socket.id]) {
      rooms[roomCode].users[socket.id].pdfUrl = payload.url;
    }

    // 2. Avisar a todos
    io.to(roomCode).emit("pdf-update", {
      fromSocketId: socket.id,
      url: payload.url
    });
    
    // 3. Actualizar lista
    broadcastRoomUsers(roomCode);
  });

  // DESCONEXIÓN (Intacto)
  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);

    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;

    const room = rooms[roomCode];

    delete room.users[socket.id];

    if (room.liveStudentId === socket.id) {
      room.liveStudentId = null;
      io.to(roomCode).emit("live-student-changed", { liveStudentId: null });
    }

    if (Object.keys(room.users).length === 0) {
      delete rooms[roomCode];
      console.log(`Sala ${roomCode} eliminada (vacía).`);
    } else {
      broadcastRoomUsers(roomCode);
    }
  });

}); // <--- AQUÍ TERMINA LA CONEXIÓN (IMPORTANTE)
// ===============================
// Iniciar servidor
// ===============================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor PianoLink escuchando en puerto ${PORT}`);
});