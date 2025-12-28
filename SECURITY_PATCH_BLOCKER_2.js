/**
 * PARCHE DE SEGURIDAD #2: Validación de RoomCode y Autorización
 * Aplicar en server.js después de la línea 95
 */

// === HELPER: Validar autorización de usuario ===
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

// === REEMPLAZO: socket.on("midi-binary") ===
// BUSCAR (líneas ~95-170):
socket.on("midi-binary", (buffer) => {
    const roomCode = getUserRoom(socket.id);
    // ... código existente ...
});

// REEMPLAZAR POR:
socket.on("midi-binary", (buffer) => {
    const roomCode = getUserRoom(socket.id);
    
    // VALIDACIÓN DE SEGURIDAD
    if (!validateUserInRoom(socket, roomCode)) {
        return; // Silenciar mensaje no autorizado
    }
    
    const room = rooms[roomCode];
    
    // Solo permitir MIDI si la clase está activa
    if (!room.isActive) {
        return;
    }
    
    // ... resto del código existente (decodificación, tracking de notas, etc.) ...
    
    // Al hacer broadcast, incluir identificación verificada
    const user = room.users[socket.id];
    socket.broadcast.to(roomCode).emit("midi-binary", {
        src: socket.id,
        dat: buffer,
        userId: user.name // Identificación del servidor
    });
});

// === REEMPLAZO: socket.on("end-class") ===
// BUSCAR (línea ~210):
socket.on("end-class", (roomCode) => {
    // ... código existente ...
});

// REEMPLAZAR POR:
socket.on("end-class", (roomCode) => {
    // VALIDACIÓN: Solo profesores pueden cerrar la clase
    if (!validateUserInRoom(socket, roomCode, 'teacher')) {
        socket.emit('error', { message: 'No autorizado para cerrar la clase' });
        return;
    }
    
    const room = rooms[roomCode];
    if (!room) return;
    
    room.isActive = false;
    io.to(roomCode).emit("class-status", false);
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

// === REEMPLAZO: socket.on("set-broadcaster") ===
// BUSCAR (línea ~225):
socket.on("set-broadcaster", (userId) => {
    // ... código existente ...
});

// REEMPLAZAR POR:
socket.on("set-broadcaster", (userId) => {
    const roomCode = getUserRoom(socket.id);
    
    // VALIDACIÓN: Solo profesores pueden cambiar el broadcaster
    if (!validateUserInRoom(socket, roomCode, 'teacher')) {
        socket.emit('error', { message: 'No autorizado para cambiar broadcaster' });
        return;
    }
    
    io.to(roomCode).emit("broadcaster-changed", userId);
    console.log(`[Admin] Broadcaster cambiado a ${userId} en sala ${roomCode}`);
});
