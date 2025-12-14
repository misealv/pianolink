/**
 * /public/js/Main.js
 * Controlador Principal - PianoLink V3
 */
import { SocketClient } from './modules/SocketClient.js';
import { AudioEngine } from './modules/AudioEngine.js';
import { Whiteboard } from './modules/Whiteboard.js';
import { UIManager } from './modules/UIManager.js';
import { ScoreLogic } from './modules/ScoreLogic.js'; // ✅ Importamos el nuevo módulo

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

// 3. INICIALIZAR LÓGICA DE PARTITURAS
const scoreLogic = new ScoreLogic(socketManager.socket); 

// 4. ARRANQUE
(async () => {
    console.log("🚀 Iniciando PianoLink V3 Modular...");
    await audio.init();
})();

// ... en Main.js ...

// ============================================
// 5. ORQUESTACIÓN DE EVENTOS (CABLEADO)
// ============================================

// --- FLUJO DE AUDIO Y NOTAS (CORREGIDO) ---

bus.on("local-note", (data) => {
    // 1. Enviar siempre a la red (el servidor decide a quién retransmitir)
    socketManager.sendMidi(data.status, data.data1, data.data2);

    // 2. Procesar visualmente según el tipo de mensaje
    processMidiMessage(data, true); // true = es local
});

bus.on("remote-note", (data) => {
    // 1. Sonido (AudioEngine ya tiene su propio filtro interno para notas)
    audio.playRemote(data);

    // 2. Procesar visualmente
    processMidiMessage(data, false); // false = es remoto
});

// FUNCIÓN HELPER PARA SEPARAR NOTAS DE PEDALES
function processMidiMessage(data, isLocal) {
    const s = data.status;
    const d1 = data.data1;
    const d2 = data.data2;

    // A) ES UNA NOTA (Status 144 = NoteOn, 128 = NoteOff)
    // (Aceptamos canales 1-16, por eso el rango 144-159)
    if ((s >= 144 && s <= 159) || (s >= 128 && s <= 143)) {
        ui.highlightKey(d1, d2);
        whiteboard.handleNote(d1, d2);
    }
    
    // B) ES EL PEDAL SUSTAIN (Status 176-191 = ControlChange, Data1 64 = Sustain)
    else if (s >= 176 && s <= 191 && d1 === 64) {
        ui.handlePedal(d2); // d2 es la intensidad (0-127)
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

bus.on("room-joined", (code) => bus.emit("room-info", code));
bus.on("room-created", (code) => bus.emit("room-info", code));

bus.on("class-status", (status) => {
    ui.handleClassStatus(status.isActive);
});

// --- FLUJO DE BIBLIOTECA (PDF) ---

bus.on("ui-tab-change", (tab) => {
    ui.switchTab(tab); 
});

// ✅ CABLEADO DE VISTA ALUMNO (Actualizado: Sin confirmación)
bus.on("ui-spy-user", (pdfState) => {
    // Carga directa y silenciosa
    scoreLogic.silentLoad(pdfState.url, pdfState.page);
});

// --- GESTIÓN DE SALIDA Y CIERRE ---

// ✅ CABLEADO DE AUDIO CUE (SOLO)
bus.on("ui-toggle-cue", (userId) => {
    // userId es el socket.id del alumno o null para escuchar a todos
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