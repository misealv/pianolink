/**
 * /public/js/Main.js
 * Controlador Principal - PianoLink V3 (Actualizado: Pizarra Inteligente)
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
const freeBoard = new FreeBoard(scoreLogic); 

// Estado Global
let currentBroadcaster = null;
let teacherId = null;
let myId = null;
let spiedUserId = null;

// 3. GESTIÓN VISUAL DEL ESTADO
const statusDiv = document.getElementById('status');
const socket = socketManager.socket;

if (statusDiv && socket) {
    socket.on('connect', () => {
        statusDiv.innerHTML = '🟢 Conectado';
        statusDiv.classList.add('connected');
        myId = socket.id; 
    });

    socket.on('disconnect', () => {
        statusDiv.innerHTML = '🔴 Desconectado';
        statusDiv.classList.remove('connected');
    });
}

// 4. ARRANQUE
(async () => {
    console.log("🚀 Iniciando PianoLink V3 Modular...");
    await audio.init();
    initResizer(); // Inicializar el arrastre de paneles
    bindToolbarExtra(); // Vincular nuevas herramientas (Goma)
})();

// --- MONITOR DE LATENCIA DISCRETO (SOLO PROFE) ---
const checkTeacherRole = () => {
    try {
        const saved = JSON.parse(localStorage.getItem('pianoUser') || '{}');
        return saved.role === 'teacher' || saved.role === 'admin';
    } catch(e) { return false; }
};

if (checkTeacherRole()) {
    bus.on("net-latency", (rtt) => ui.updateLatencyUI(rtt));
    setInterval(() => socketManager.sendPing(), 5000);
}

// --- GESTIÓN DEL RESIZER (PIZARRA VS PIANO) ---
function initResizer() {
    const handle = document.getElementById('resizeHandle');
    const board = document.querySelector('.board-container');
    const container = document.querySelector('.main-stage');

    if (!handle || !board || !container) return;

    let isResizing = false;

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'row-resize';
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const containerRect = container.getBoundingClientRect();
        const newHeight = e.clientY - containerRect.top;
        const minSize = 100;
        const maxSize = containerRect.height - minSize;

        if (newHeight > minSize && newHeight < maxSize) {
            const percentage = (newHeight / containerRect.height) * 100;
            board.style.flex = `0 0 ${percentage}%`;
            board.style.height = `${percentage}%`;
        }
    });

    window.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
            window.dispatchEvent(new Event('resize'));
        }
    });
}

// --- VINCULACIÓN DE HERRAMIENTAS EXTRAS (GOMA) ---

    // Helper para gestionar la clase CSS 'active' en la barra
    function updateActiveTool(activeBtn) {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        if (activeBtn) activeBtn.classList.add('active');
    }
    
   


// ============================================
// 5. ORQUESTACIÓN DE EVENTOS (CABLEADO)
// ============================================

// --- FLUJO DE AUDIO Y NOTAS ---

bus.on("local-note", (data) => {
    socketManager.sendMidi(data.status, data.data1, data.data2);
    processMidiMessage(data, true); 
});

bus.on("remote-note", (data) => {
    const senderId = data.fromId;
    const myRole = JSON.parse(localStorage.getItem('pianoUser') || '{}').role;
    const iAmTeacher = (myRole === 'teacher' || myRole === 'admin');

    let shouldPlay = true;

    if (currentBroadcaster) {
        if (!iAmTeacher && senderId !== teacherId && senderId !== currentBroadcaster) {
            shouldPlay = false; 
        }
    }

    if (shouldPlay) {
        audio.playRemote(data);
        processMidiMessage(data, false);
    }
});

function processMidiMessage(data, isLocal) {
    const { status: s, data1: d1, data2: d2 } = data;
    if ((s >= 144 && s <= 159) || (s >= 128 && s <= 143)) {
        ui.highlightKey(d1, d2);
        whiteboard.handleNote(d1, d2);
    } else if (s >= 176 && s <= 191 && d1 === 64) {
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
    const teacher = users.find(u => u.role === 'teacher');
    if (teacher) teacherId = teacher.socketId;
    ui.updateParticipants(users);
});

bus.on("room-joined", (code) => {
    if(statusDiv) statusDiv.innerHTML = `🟢 En Sala: ${code}`;
    scoreLogic.setRoomCode(code); 
});

bus.on("room-created", (code) => {
    if(statusDiv) statusDiv.innerHTML = `🟢 Sala Creada: ${code}`;
    scoreLogic.setRoomCode(code);
});

bus.on("class-status", (status) => ui.handleClassStatus(status.isActive));

bus.on("net-broadcaster-changed", (id) => {
    currentBroadcaster = id;
    ui.handleBroadcasterChange(id, myId);
});
bus.on("ui-set-broadcaster", (id) => socketManager.setBroadcaster(id));

// --- FLUJO DE BIBLIOTECA Y PIZARRA ---

bus.on("ui-tab-change", (tab) => {
    ui.switchTab(tab); 
    scoreLogic.switchTab(tab); // Sincroniza el motor de dibujo con la pestaña activa
});

bus.on("ui-spy-user", (data) => {
    // Si el ojo aparece, data debe tener userId, url, page y scoreId
    spiedUserId = data.userId; 
    scoreLogic.pageData = {}; // Limpiar dibujos locales del profe antes de entrar
    
    if (data.url) {
        console.log(`👁️ Entrando en Modo Espía para: ${data.userId}`);
        scoreLogic.silentLoad(data.url, data.page, data.scoreId);
    } else {
        alert("El alumno no tiene ninguna partitura abierta.");
    }
});

bus.on("remote-pdf", (data) => {
    const senderId = data.userId; 
    let userRole = 'student';
    try {
        const saved = localStorage.getItem('pianoUser');
        if (saved) userRole = JSON.parse(saved).role || 'student';
    } catch(e) {}
    
    const iAmTeacher = (userRole === 'teacher' || userRole === 'admin');
    let shouldSync = false;

    if (currentBroadcaster && senderId === currentBroadcaster) shouldSync = true;
    else if (!iAmTeacher && !currentBroadcaster && senderId === teacherId) shouldSync = true;
    else if (iAmTeacher && senderId === spiedUserId) shouldSync = true;

    if (shouldSync) {
        if (ui.currentTab !== 'pdf') ui.switchTab('pdf'); 
        scoreLogic.handleRemoteUpdate(data);
    }
});

// --- RESET Y EMERGENCIA ---
bus.on("ui-panic", () => {
    audio.scheduler.stopAll(); 
    ui.clearPiano();           
    whiteboard.drawEmpty();    
    if (scoreLogic.activeEngine) scoreLogic.activeEngine.clear(true);
});

// --- GESTIÓN DE SALIDA Y CIERRE ---

bus.on("ui-toggle-cue", (userId) => audio.setSoloUser(userId));

bus.on("ui-end-class", () => {
    if(confirm("¿Seguro que quieres cerrar la clase para todos?")) {
        socketManager.endClass(); 
    }
});

bus.on("ui-leave", () => {
    if(confirm("¿Quieres salir de la clase?")) window.location.href = "/goodbye.html";
});

bus.on("app-force-exit", () => window.location.href = "/goodbye.html");

window.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && scoreLogic.activeEngine) {
        // Solo borramos si no estamos escribiendo en un input
        if (document.activeElement.tagName !== 'INPUT') {
            scoreLogic.activeEngine.deleteSelected();
        }
    }
});

