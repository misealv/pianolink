const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// servir "public"
app.use(express.static(path.join(__dirname, "public")));

// --- NUEVO: Generador de códigos aleatorios ---
function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("Nuevo cliente conectado:", socket.id);

  // --- NUEVO: Crear Sala ---
  socket.on("create-room", ({ username }) => {
    const code = generateCode();
    socket.join(code);
    console.log(`Socket ${socket.id} (${username}) creó sala: ${code}`);
    // Respondemos al creador con el código
    socket.emit("room-created", code);
  });

  // Unirse a sala existente
  socket.on("join-room", (roomCode) => {
    socket.join(roomCode);
    console.log(`Socket ${socket.id} se unió a sala: ${roomCode}`);
  });

  socket.on("midi-message", ({ roomCode, message }) => {
    socket.to(roomCode).emit("midi-message", {
      ...message,
      fromSocketId: socket.id,
    });
  });

  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
});