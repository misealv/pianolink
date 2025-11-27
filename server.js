const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// servir "public"
app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  console.log("Nuevo cliente conectado:", socket.id);

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

// 👇 ESTA LÍNEA ES IMPORTANTE PARA RENDER
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
});
