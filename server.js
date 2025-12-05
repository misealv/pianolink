const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ===============================
// Static (pensando en Render)
// ===============================
// 1) /public si existe
app.use(express.static(path.join(__dirname, "public")));
// 2) Raíz del proyecto (por si index.html está en la raíz)
app.use(express.static(__dirname));

// ===============================
// Salas en memoria
// ===============================
//
// rooms[roomCode] = {
//   users: { socketId: { name, role } },
//   liveStudentId: socketId | null   // alumno EN VIVO (masterclass)
// }

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
  }));

  io.to(roomCode).emit("room-users", usersArray);
}

// ===============================
// Socket.IO
// ===============================
io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);

  // -------------------------------
  // CREAR SALA
  // -------------------------------
  socket.on("create-room", (payload) => {
    const username =
      (payload && (payload.username || payload.userName)) || "Profesor";
    const role =
      (payload && (payload.userRole || payload.role)) || "teacher";

    const roomCode = generateCode();

    socket.roomCode = roomCode;
    socket.userName = username;
    socket.userRole = role;

    rooms[roomCode] = {
      users: {
        [socket.id]: { name: username, role },
      },
      liveStudentId: null,
    };

    socket.join(roomCode);

    // Se mantiene contrato anterior: se emite SOLO el código
    socket.emit("room-created", roomCode);

    broadcastRoomUsers(roomCode);

    console.log(
      `Sala creada ${roomCode} por ${username} (${role}) [socket ${socket.id}]`
    );
  });

  // -------------------------------
  // UNIRSE A SALA
  // -------------------------------
  socket.on("join-room", (payload) => {
    let roomCode;
    let username;
    let role;

    if (typeof payload === "string") {
      roomCode = payload;
    } else if (payload && typeof payload === "object") {
      roomCode = payload.roomCode || payload.code;
      username = payload.username || payload.userName;
      role = payload.userRole || payload.role;
    }

    if (!roomCode) {
      socket.emit("error-message", "No se recibió código de sala.");
      return;
    }

    if (!rooms[roomCode]) {
      socket.emit("error-message", "La sala no existe.");
      return;
    }

    username = username || "Alumno";
    role = role || "student";

    socket.roomCode = roomCode;
    socket.userName = username;
    socket.userRole = role;

    rooms[roomCode].users[socket.id] = { name: username, role };

    socket.join(roomCode);

    socket.emit("room-joined", roomCode);
    
    broadcastRoomUsers(roomCode);

    console.log(
      `Socket ${socket.id} se une a sala ${roomCode} como ${username} (${role})`
    );

    // Enviar estado de EN VIVO actual
    const liveId = rooms[roomCode].liveStudentId || null;
    if (liveId) {
      socket.emit("live-student-changed", { liveStudentId: liveId });
    }
  });

  // -------------------------------
  // MIDI
  // -------------------------------
  socket.on("midi-message", (message) => {
    // Usar roomCode desde el socket (nuevo) o desde el mensaje (viejo).
    const roomCode = socket.roomCode || message.roomCode;
    if (!roomCode) return;

    const room = rooms[roomCode];
    if (!room) return;

    const fromName = socket.userName || message.fromName || "Usuario";
    const fromRole = socket.userRole || message.fromRole;

    io.to(roomCode).emit("midi-message", {
      ...message,
      roomCode,
      fromSocketId: socket.id,
      fromName,
      fromRole,
    });
  });

  // -------------------------------
  // MASTERCLASS: alumno EN VIVO
  // -------------------------------
  socket.on("set-live-student", (payload) => {
    const roomCode = (payload && payload.roomCode) || socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;

    const room = rooms[roomCode];
    const me = room.users[socket.id];
    if (!me || me.role !== "teacher") {
      // Solo el profesor puede cambiar el alumno En Vivo
      return;
    }

    const studentSocketId = payload.studentSocketId || null;

    if (studentSocketId && !room.users[studentSocketId]) {
      room.liveStudentId = null;
    } else {
      room.liveStudentId = studentSocketId;
    }

    io.to(roomCode).emit("live-student-changed", {
      liveStudentId: room.liveStudentId,
    });

    console.log(
      `Sala ${roomCode} - liveStudentId = ${room.liveStudentId || "null"}`
    );
  });

  // -------------------------------
  // DESCONEXIÓN
  // -------------------------------
  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);

    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;

    const room = rooms[roomCode];

    delete room.users[socket.id];

    // Si el que se fue era el EN VIVO, apagar masterclass
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

// ===============================
// Iniciar servidor (Render usa process.env.PORT)
// ===============================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor PianoLink escuchando en puerto ${PORT}`);
});
