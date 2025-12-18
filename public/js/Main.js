/**
 * /public/js/Main.js
 * Controlador Principal - PianoLink V3
 */
import { SocketClient } from './modules/SocketClient.js';
import { AudioEngine } from './modules/AudioEngine.js';
import { Whiteboard } from './modules/Whiteboard.js';
import { UIManager } from './modules/UIManager.js';
import { ScoreLogic } from './modules/ScoreLogic.js'; 
import { FreeBoard } from './modules/FreeBoard.js';

// 1. EVENT BUS (Sistema nervioso central)
class EventBus extends EventTarget {
    emit(eventName, detail) {
        this.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
    on(eventName, callback) {
        this.addEventListener(eventName, (e) => callback(e.detail));
    }
}
const bus = new EventBus();

// 2. INICIALIZAR MÓDULOS
const socketManager = new SocketClient(bus); 
const audio = new AudioEngine(bus);
const ui = new UIManager(bus);
const whiteboard = new Whiteboard();
const scoreLogic = new ScoreLogic(socketManager.socket); 
const freeBoard = new FreeBoard(scoreLogic); // Nueva Pizarra Musical
// Estado Global
let currentBroadcaster = null;
let teacherId = null;
let myId = null;
let spiedUserId = null;

// 3. GESTIÓN VISUAL DEL ESTADO (Corregido: Ahora lo maneja Main.js)
const statusDiv = document.getElementById('status');
const socket = socketManager.socket;

if (statusDiv && socket) {
    socket.on('connect', () => {
        statusDiv.innerHTML = '🟢 Conectado';
        statusDiv.classList.add('connected');
        console.log("✅ Socket Conectado (Main.js)");
        myId = socket.id; 
    });

    socket.on('disconnect', () => {
        statusDiv.innerHTML = '🔴 Desconectado';
        statusDiv.classList.remove('connected');
        console.log("❌ Socket Desconectado (Main.js)");
    });
}

// 4. ARRANQUE
(async () => {
    console.log("🚀 Iniciando PianoLink V3 Modular...");
    await audio.init();
})();

/* EN public/js/Main.js */

// ... (después de tus imports y lógica de conexión) ...

function initResizer() {
    const handle = document.getElementById('resizeHandle');
    const board = document.querySelector('.board-container');
    const piano = document.querySelector('.piano-container');
    const container = document.querySelector('.main-stage');

    if (!handle || !board || !piano || !container) return;

    let isResizing = false;

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'row-resize'; // Cambiar cursor global
        e.preventDefault(); // Evitar selección de texto
    });

    window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        // Calcular nueva altura
        // Restamos el offset del header y márgenes aproximados (ajustar según tu CSS)
        const containerRect = container.getBoundingClientRect();
        const newHeight = e.clientY - containerRect.top;

        // Límites (Mínimo 100px para partitura, Mínimo 100px para piano)
        const minSize = 100;
        const maxSize = containerRect.height - minSize;

        if (newHeight > minSize && newHeight < maxSize) {
            // Aplicamos altura usando porcentajes para mantener responsive
            const percentage = (newHeight / containerRect.height) * 100;
            board.style.flex = `0 0 ${percentage}%`;
            board.style.height = `${percentage}%`;
            // El piano tomará el resto del espacio automáticamente por flex-grow
        }
    });

    window.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
            
            // IMPORTANTE: Disparar evento de resize para que el PDF se ajuste
            window.dispatchEvent(new Event('resize'));
        }
    });
}

// EJECUTAR AL INICIO
document.addEventListener('DOMContentLoaded', () => {
    initResizer();
    // ... tus otras inicializaciones ...
});
// ============================================
// 5. ORQUESTACIÓN DE EVENTOS (CABLEADO)
// ============================================

// --- FLUJO DE AUDIO Y NOTAS ---

bus.on("local-note", (data) => {
    // 1. Enviar siempre a la red
    socketManager.sendMidi(data.status, data.data1, data.data2);
    // 2. Procesar visualmente
    processMidiMessage(data, true); 
});
// --- Lógica de Filtrado (Clase Magistral) ---
bus.on("remote-note", (data) => {
    const senderId = data.fromId;
    
    // Obtener rol local
    const myRole = JSON.parse(localStorage.getItem('pianoUser') || '{}').role;
    const iAmTeacher = (myRole === 'teacher' || myRole === 'admin');

    let shouldPlay = true;

    // Si hay Clase Magistral activa...
    if (currentBroadcaster) {
        const isSenderTeacher = (senderId === teacherId);
        const isSenderBroadcaster = (senderId === currentBroadcaster);

        // Si soy alumno, SOLO escucho al Profe o al Elegido
        if (!iAmTeacher) {
            if (!isSenderTeacher && !isSenderBroadcaster) {
                shouldPlay = false; // Silenciar compañeros
            }
        }
        // El profesor siempre escucha a todos (default)
    }

    if (shouldPlay) {
        audio.playRemote(data);
        processMidiMessage(data, false);
    }
});

// FUNCIÓN HELPER
function processMidiMessage(data, isLocal) {
    const s = data.status;
    const d1 = data.data1;
    const d2 = data.data2;

    if ((s >= 144 && s <= 159) || (s >= 128 && s <= 143)) {
        ui.highlightKey(d1, d2);
        whiteboard.handleNote(d1, d2);
    }
    else if (s >= 176 && s <= 191 && d1 === 64) {
        ui.handlePedal(d2); 
    }
}

// --- FLUJO DE UI Y SALA ---

bus.on("ui-join", (data) => {
    audio.resume(); 
    socketManager.joinRoom(data.code, data.name, "student");
});

bus.on("ui-create", (data) => {
    audio.resume(); 
    socketManager.createRoom(data); 
});

bus.on("room-users", (users) => {
    //  Detectar Profe
    const teacher = users.find(u => u.role === 'teacher');
    if (teacher) teacherId = teacher.socketId;
    
    ui.updateParticipants(users);
});

bus.on("room-joined", (code) => {
    bus.emit("room-info", code);
    if(statusDiv) statusDiv.innerHTML = `🟢 En Sala: ${code}`;
    
    // --- CORRECCIÓN CRÍTICA: AVISAR A SCORELOGIC ---
    console.log(`🔗 Main: Vinculando ScoreLogic a sala ${code}`);
    scoreLogic.setRoomCode(code); 
});

bus.on("room-created", (code) => {
    bus.emit("room-info", code);
    if(statusDiv) statusDiv.innerHTML = `🟢 Sala Creada: ${code}`;
    
    // --- CORRECCIÓN CRÍTICA: AVISAR A SCORELOGIC ---
    console.log(`🔗 Main: Vinculando ScoreLogic a sala ${code}`);
    scoreLogic.setRoomCode(code);
});

bus.on("class-status", (status) => {
    ui.handleClassStatus(status.isActive);
});

// Eventos Broadcaster
bus.on("net-broadcaster-changed", (id) => {
    currentBroadcaster = id;
    ui.handleBroadcasterChange(id, myId);
});
bus.on("ui-set-broadcaster", (id) => socketManager.setBroadcaster(id));

// --- FLUJO DE BIBLIOTECA (PDF) ---

bus.on("ui-tab-change", (tab) => {
    ui.switchTab(tab); 
});

bus.on("ui-spy-user", (data) => {
    spiedUserId = data.userId; 
    // Limpiamos memoria para que los dibujos del alumno anterior no se vean en el nuevo
    scoreLogic.pageData = {}; 
    scoreLogic.silentLoad(data.url, data.page, data.scoreId);
});
// 👇 NUEVO: Lógica del "Atril Compartido" (Broadcast PDF)
bus.on("remote-pdf", (data) => {
    const senderId = data.userId; 
    let userRole = 'student';
    try {
        const saved = localStorage.getItem('pianoUser');
        if (saved) userRole = JSON.parse(saved).role || 'student';
    } catch(e) {}
    
    const iAmTeacher = (userRole === 'teacher' || userRole === 'admin');
    let shouldSync = false;

    if (currentBroadcaster && senderId === currentBroadcaster) {
        shouldSync = true;
    } 
    else if (!iAmTeacher && !currentBroadcaster && senderId === teacherId) {
        shouldSync = true;
    }
    else if (iAmTeacher && senderId === spiedUserId) {
        shouldSync = true;
    }

    if (shouldSync) {
        // AUTOMÁTICO: Forzamos la pestaña PDF para asegurar que el visor exista
        // Esto evita que Aurora se quede en una pantalla muerta al iniciar broadcast
        if (ui.currentTab !== 'pdf') {
            ui.switchTab('pdf'); 
        }
        
        scoreLogic.handleRemoteUpdate(data);
    }
});

bus.on("ui-panic", () => {
    audio.scheduler.stopAll(); // Mata el sonido
    whiteboard.drawEmpty();    // Limpia las teclas rojas de la pantalla
});
// --- GESTIÓN DE SALIDA Y CIERRE ---

bus.on("ui-toggle-cue", (userId) => {
    audio.setSoloUser(userId);
});

bus.on("ui-end-class", () => {
    if(confirm("¿Seguro que quieres cerrar la clase para todos?")) {
        socketManager.endClass(); 
    }
});

bus.on("ui-leave", () => {
    if(confirm("¿Quieres salir de la clase?")) {
        window.location.href = "/goodbye.html";
    }
});

bus.on("app-force-exit", () => {
    window.location.href = "/goodbye.html";
});