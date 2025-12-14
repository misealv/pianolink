/**
 * /public/js/Main.js
 * Controlador Principal - PianoLink V3
 */
import { SocketClient } from './modules/SocketClient.js';
import { AudioEngine } from './modules/AudioEngine.js';
import { Whiteboard } from './modules/Whiteboard.js';
import { UIManager } from './modules/UIManager.js';
import { ScoreLogic } from './modules/ScoreLogic.js'; 

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

// 3. GESTIÓN VISUAL DEL ESTADO (Corregido: Ahora lo maneja Main.js)
const statusDiv = document.getElementById('status');
const socket = socketManager.socket;

if (statusDiv && socket) {
    socket.on('connect', () => {
        statusDiv.innerHTML = '🟢 Conectado';
        statusDiv.classList.add('connected');
        console.log("✅ Socket Conectado (Main.js)");
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

bus.on("remote-note", (data) => {
    // 1. Sonido
    audio.playRemote(data);
    // 2. Procesar visualmente
    processMidiMessage(data, false); 
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
    ui.updateParticipants(users);
});

bus.on("room-joined", (code) => {
    bus.emit("room-info", code);
    if(statusDiv) statusDiv.innerHTML = `🟢 En Sala: ${code}`;
});
bus.on("room-created", (code) => {
    bus.emit("room-info", code);
    if(statusDiv) statusDiv.innerHTML = `🟢 Sala Creada: ${code}`;
});

bus.on("class-status", (status) => {
    ui.handleClassStatus(status.isActive);
});

// --- FLUJO DE BIBLIOTECA (PDF) ---

bus.on("ui-tab-change", (tab) => {
    ui.switchTab(tab); 
});

bus.on("ui-spy-user", (pdfState) => {
    scoreLogic.silentLoad(pdfState.url, pdfState.page);
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