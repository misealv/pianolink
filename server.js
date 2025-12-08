const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

// --- Imports para Base de Datos y Configuración ---
const dotenv = require("dotenv");
const connectDB = require("./config/db");

// 1. Cargar variables de entorno y conectar a Mongo
dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);

// Configuración de Socket.io con soporte para CORS y buffers grandes
const io = new Server(server, {
    cors: { origin: "*" },
    maxHttpBufferSize: 1e8 // 100 MB de seguridad
});

// 2. Middleware
app.use(express.json());

// --- 3. RUTAS API (Backend) ---
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/teacher', require('./routes/teacherRoutes'));
app.use('/api/scores', require('./routes/scoreRoutes')); // <--- ¡AGREGADO! (La Biblioteca)

// ===============================
// Static y Rutas Principales
// ===============================

// Archivos Estáticos
app.use(express.static(path.join(__dirname, "public"), { index: false }));
app.use(express.static(__dirname, { index: false }));

// RUTA: La Puerta Principal (/)
app.get('/', (req, res) => {
    if (req.query.sala || req.query.room || req.query.role === 'student') {
        return res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// RUTA: Salas Personalizadas
app.get('/c/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===============================
// MEMORIA DEL SERVIDOR (El Cerebro)
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
    // <--- ACTUALIZADO: Enviamos URL y PÁGINA (Estado completo)
    pdfState: data.pdfState || { url: null, page: 1 } 
  }));

  io.to(roomCode).emit("room-users", usersArray);
}

// ===============================
// SOCKET.IO (Lógica de Tiempo Real)
// ===============================
io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);

  // 1. CREAR SALA (Profesor)
  socket.on("create-room", (payload) => {
    const username = (payload && (payload.username || payload.userName)) || "Profesor";
    const role = (payload && (payload.userRole || payload.role)) || "teacher";

    let roomCode;
    if (payload && payload.roomCode) {
        roomCode = payload.roomCode.toUpperCase();
    } else {
        roomCode = generateCode();
    }

    socket.roomCode = roomCode;
    socket.userName = username;
    socket.userRole = role;

    if (!rooms[roomCode]) {
        rooms[roomCode] = {
          users: {},
          liveStudentId: null,
          isActive: false 
        };
    }
    
    // Si entra un PROFESOR, la sala se ACTIVA
    if (role === 'teacher') {
        rooms[roomCode].isActive = true;
    }

    // Inicializamos al usuario con ESTADO DE PDF
    rooms[roomCode].users[socket.id] = { 
        name: username, 
        role,
        pdfState: { url: null, page: 1 } // <--- NUEVO: Memoria inicial
    };

    socket.join(roomCode);
    socket.emit("room-created", roomCode);
    io.to(roomCode).emit("class-status", { isActive: rooms[roomCode].isActive });
    broadcastRoomUsers(roomCode);
    
    console.log(`Sala ${roomCode} creada por ${username}`);
  });

  // 2. UNIRSE A SALA (Alumno)
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

    roomCode = roomCode.toUpperCase();
    username = username || "Alumno";
    role = role || "student";

    if (!rooms[roomCode]) {
        rooms[roomCode] = { users: {}, liveStudentId: null, isActive: false };
    } else {
        if (typeof rooms[roomCode].isActive === 'undefined') {
            rooms[roomCode].isActive = false;
        }
    }

    socket.roomCode = roomCode;
    socket.userName = username;
    socket.userRole = role;

    // Inicializamos al usuario con ESTADO DE PDF
    rooms[roomCode].users[socket.id] = { 
        name: username, 
        role,
        pdfState: { url: null, page: 1 } // <--- NUEVO: Memoria inicial
    };

    socket.join(roomCode);
    socket.emit("room-joined", roomCode);
    socket.emit("class-status", { isActive: rooms[roomCode].isActive });

    if (rooms[roomCode].isActive) {
        socket.broadcast.to(roomCode).emit("user-entered-sound");
    }

    broadcastRoomUsers(roomCode);
    
    if (rooms[roomCode].liveStudentId) {
        socket.emit("live-student-changed", { liveStudentId: rooms[roomCode].liveStudentId });
    }
  });

  // 3. TERMINAR CLASE
  socket.on("end-class", (roomCode) => {
      if(rooms[roomCode]) {
          rooms[roomCode].isActive = false;
          io.to(roomCode).emit("class-status", { isActive: false });
          io.to(roomCode).emit("force-disconnect"); 
          console.log(`Clase ${roomCode} terminada.`);
      }
  });

  // 4. NUEVO: SINCRONIZACIÓN DE PDF (MODO ESPEJO + BIBLIOTECA)
  // Reemplaza al antiguo 'pdf-update' para incluir número de página
  socket.on("update-pdf-state", (newState) => {
    // newState = { url: "...", page: 5 }
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode] || !rooms[roomCode].users[socket.id]) return;

    // A. Guardar en memoria del servidor (Persistencia)
    const currentUser = rooms[roomCode].users[socket.id];

    // Seguridad por si algo raro pasó
    if (!currentUser.pdfState) {
        currentUser.pdfState = { url: null, page: 1 };
    }
    
    if (typeof newState.url !== "undefined" && newState.url !== null) {
        currentUser.pdfState.url = newState.url;
    }
    if (typeof newState.page !== "undefined" && newState.page !== null) {
        currentUser.pdfState.page = newState.page;
    }

    // B. Avisar a la sala (Para que el profesor pueda espiar EN TIEMPO REAL)
    io.to(roomCode).emit("user-pdf-updated", {
        userId: socket.id,
        pdfState: currentUser.pdfState
    });
    
    // C. Actualizar lista general (para que renderParticipants vea el nuevo pdfState)
    broadcastRoomUsers(roomCode);
});



  // --- FUNCIONES MIDI & AUDIO (INTACTAS) ---

  socket.on("midi-message", (message) => {
    const roomCode = socket.roomCode || message.roomCode;
    if (!roomCode || !rooms[roomCode]) return;

    io.to(roomCode).volatile.emit("midi-message", {
      ...message,
      roomCode,
      fromSocketId: socket.id,
      fromName: socket.userName || message.fromName,
      fromRole: socket.userRole || message.fromRole,
    });
  });

  socket.on("set-live-student", (payload) => {
    const roomCode = (payload && payload.roomCode) || socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;

    if (rooms[roomCode].users[socket.id]?.role !== "teacher") return;

    const studentSocketId = payload.studentSocketId;

    if (!studentSocketId || !rooms[roomCode].users[studentSocketId]) {
      rooms[roomCode].liveStudentId = null;
    } else {
      rooms[roomCode].liveStudentId = studentSocketId;
    }

    io.to(roomCode).emit("live-student-changed", {
      liveStudentId: rooms[roomCode].liveStudentId,
    });
  });

  socket.on("request-full-state", (roomCode) => {
    socket.to(roomCode).emit("teacher-sync-request", socket.id); 
  });

  // DESCONEXIÓN
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

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor PianoLink 2.0 escuchando en puerto ${PORT}`);
});