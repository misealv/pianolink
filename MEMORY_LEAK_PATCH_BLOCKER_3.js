/**
 * PARCHE DE MEMORY LEAK #3: Graceful Shutdown + Limpieza de Intervalos
 * Aplicar al final de server.js (después de la línea 441)
 */

// === VARIABLE GLOBAL PARA TRACKING DE INTERVALOS ===
// Añadir al inicio del archivo después de: const rooms = {};
let snapshotHeartbeatInterval = null;
let roomCleanupInterval = null;

// === REEMPLAZO DEL setInterval GLOBAL (línea 420) ===
// BUSCAR:
setInterval(() => {
    Object.keys(rooms).forEach(roomCode => {
        sendSnapshot(roomCode);
    });
}, 5000);

// REEMPLAZAR POR:
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
    
    console.log('[Lifecycle] Snapshot heartbeat iniciado.');
}

// Iniciar el heartbeat
startSnapshotHeartbeat();

// === NUEVO: LIMPIEZA AUTOMÁTICA DE SALAS VACÍAS ===
function startRoomCleanup() {
    roomCleanupInterval = setInterval(() => {
        Object.keys(rooms).forEach(roomCode => {
            const room = rooms[roomCode];
            const userCount = Object.keys(room.users || {}).length;
            
            // Eliminar salas vacías que llevan más de 5 minutos sin usuarios
            if (userCount === 0) {
                console.log(`[Cleanup] Eliminando sala vacía: ${roomCode}`);
                
                // Limpiar timers de la sala
                if (room.snapshotTimer) clearTimeout(room.snapshotTimer);
                if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
                
                delete rooms[roomCode];
            }
        });
    }, 300000); // 5 minutos
    
    console.log('[Lifecycle] Room cleanup iniciado.');
}

startRoomCleanup();

// === GRACEFUL SHUTDOWN ===
// Añadir al final del archivo (después de server.listen())

/**
 * Manejo de señales de terminación (SIGTERM, SIGINT)
 */
function gracefulShutdown(signal) {
    console.log(`\n[Shutdown] Señal ${signal} recibida. Cerrando servidor...`);
    
    // 1. Detener intervalos globales
    if (snapshotHeartbeatInterval) {
        clearInterval(snapshotHeartbeatInterval);
        console.log('[Shutdown] Snapshot heartbeat detenido.');
    }
    
    if (roomCleanupInterval) {
        clearInterval(roomCleanupInterval);
        console.log('[Shutdown] Room cleanup detenido.');
    }
    
    // 2. Cerrar todas las salas activas
    Object.keys(rooms).forEach(roomCode => {
        const room = rooms[roomCode];
        
        // Notificar a usuarios
        io.to(roomCode).emit('force-disconnect', { 
            reason: 'Servidor en mantenimiento' 
        });
        
        // Limpiar timers
        if (room.snapshotTimer) clearTimeout(room.snapshotTimer);
        if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
        
        console.log(`[Shutdown] Sala cerrada: ${roomCode}`);
    });
    
    // 3. Cerrar servidor Socket.IO
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
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Ctrl+C

// Capturar errores no manejados (última defensa)
process.on('uncaughtException', (error) => {
    console.error('[Critical Error] Excepción no capturada:', error);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Critical Error] Promesa rechazada no manejada:', reason);
    gracefulShutdown('unhandledRejection');
});

console.log('[Lifecycle] Graceful shutdown configurado.');
