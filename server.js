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

// --- Generador de códigos aleatorios ---
function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// ===============================
// Almacenamiento simple en memoria
// ===============================
// rooms[roomCode] = {
//   users: {
//     socketId: { name, role }
//   }
// };
const rooms = {};

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
// SOCKET.IO
// ===============================
io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);

  // -------------------------------
  // Crear sala
  // -------------------------------
  socket.on("create-room", (payload) => {
    // Compatibilidad con versión anterior: payload = { username }
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
    };

    socket.join(roomCode);

    // Mantener contrato anterior: emitir SOLO el código
    socket.emit("room-created", roomCode);

    broadcastRoomUsers(roomCode);

    console.log(
      `Sala creada ${roomCode} por ${username} (${role}) [socket ${socket.id}]`
    );
  });

  // -------------------------------
  // Unirse a sala
  // -------------------------------
  socket.on("join-room", (payload) => {
    let roomCode;
    let username;
    let role;

    if (typeof payload === "string") {
      // Versión antigua: solo el código
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

    broadcastRoomUsers(roomCode);

    console.log(
      `Socket ${socket.id} se une a sala ${roomCode} como ${username} (${role})`
    );
  });

  // -------------------------------
  // MIDI
  // -------------------------------
  socket.on("midi-message", (message) => {
    // Usar roomCode desde el socket (nuevo)
    // o desde el mensaje (viejo).
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
  // Desconexión
  // -------------------------------
  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);

    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;

    delete rooms[roomCode].users[socket.id];

    if (Object.keys(rooms[roomCode].users).length === 0) {
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
