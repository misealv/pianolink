/**
 * /public/js/Main.js
 * Controlador Principal - PianoLink V4 (Fase 1-5 Integrado)
 */
import { SocketClient } from './modules/SocketClient.js';
import { AudioEngine } from './modules/AudioEngine.js';
import { Whiteboard } from './modules/Whiteboard.js';
import { UIManager } from './modules/UIManager.js';
import { ScoreLogic } from './modules/ScoreLogic.js'; 
import { FreeBoard } from './modules/FreeBoard.js';
import { DiagnosticSidebar } from './modules/DiagnosticSidebar.js';

// 1. EVENT BUS (Sistema nervioso central)
class EventBus extends EventTarget {
    emit(eventName, detail) {
        this.dispatchEvent(new CustomEvent(eventName, { detail: detail }));
    }
    on(eventName, callback) {
        this.addEventListener(eventName, function(e) { 
            callback(e.detail); 
        });
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

// 2.5. HELPER FUNCTION (Debe estar ANTES de usarse)
const checkTeacherRole = function() {
    try {
        const saved = JSON.parse(localStorage.getItem('pianoUser') || '{}');
        return saved.role === 'teacher' || saved.role === 'admin';
    } catch(e) { 
        console.warn('[Main] Error verificando rol de usuario:', e);
        return false; 
    }
};

// 2.6. DIAGNOSTIC SIDEBAR (Fase 4.5) - CON GRACEFUL DEGRADATION
let diagnosticSidebar = null;
const initDiagnosticSidebar = function() {
    try {
        if (checkTeacherRole()) {
            diagnosticSidebar = new DiagnosticSidebar(bus, audio, socketManager);
            console.log('🔬 [Main] Diagnostic Sidebar inicializado.');
        } else {
            console.log('[Main] Diagnostic Sidebar: Solo disponible para profesores.');
        }
    } catch (error) {
        console.error('[Main] ⚠️ Error inicializando Diagnostic Sidebar (no crítico):', error);
    }
};

// Estado Global
let currentBroadcaster = null;
let teacherId = null;
let myId = null;
let spiedUserId = null;

// 3. GESTIÓN VISUAL DEL ESTADO
const statusDiv = document.getElementById('status');
const socket = socketManager.socket;

if (statusDiv && socket) {
    socket.on('connect', function() {
        statusDiv.innerHTML = '🟢 Conectado';
        statusDiv.classList.add('connected');
        myId = socket.id; 
    });

    socket.on('disconnect', function() {
        statusDiv.innerHTML = '🔴 Desconectado';
        statusDiv.classList.remove('connected');
    });
}

// 4. FUNCIÓN DE ARRANQUE PRINCIPAL
async function bootstrap() {
    try {
        console.log("🚀 Iniciando PianoLink V4 Modular + State Management...");
        
        // Init crítico de audio
        await audio.init();
        console.log('✅ [Main] AudioEngine inicializado.');
        
        // Init no-crítico del sidebar (no debe bloquear)
        initDiagnosticSidebar();
        
        // Init de UI
        initResizer();
        bindToolbarExtra();
        
        // Configurar event listeners DESPUÉS de que todo esté inicializado
        setupEventHandlers();
        
        console.log('✅ [Main] Sistema completamente inicializado.');
    } catch (error) {
        console.error('❌ [Main] ERROR CRÍTICO en inicialización:', error);
        alert('Error al inicializar PianoLink. Por favor, recarga la página.');
    }
}

// Ejecutar bootstrap cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}

// ==================================================
// FASE 3: GESTIÓN GLOBAL DE CICLO DE VIDA
// ==================================================

/**
 * Cleanup global al cerrar o recargar la página
 */
window.addEventListener('beforeunload', function() {
    console.log('[Lifecycle] Página cerrándose. Limpiando recursos...');
    
    // Limpiar todos los módulos
    if (audio) audio.dispose();
    if (socketManager) socketManager.dispose();
    if (diagnosticSidebar) diagnosticSidebar.dispose();
});

/**
 * Manejo de errores no capturados (última línea de defensa)
 */
window.addEventListener('error', function(e) {
    console.error('[Global Error]', e.error);
    // En caso de error crítico, intentar limpiar
    try {
        if (audio) audio.stopAll();
    } catch (cleanupError) {
        console.error('[Cleanup Error]', cleanupError);
    }
});

/**
 * Manejo de promesas rechazadas
 */
window.addEventListener('unhandledrejection', function(e) {
    console.error('[Unhandled Rejection]', e.reason);
});

// --- MONITOR DE LATENCIA DISCRETO (SOLO PROFE) ---
function setupLatencyMonitor() {
    if (checkTeacherRole()) {
        bus.on("net-latency", function(rtt) {
            ui.updateLatencyUI(rtt);
        });
        setInterval(function() {
            socketManager.sendPing();
        }, 5000);
    }
}

// --- GESTIÓN DEL RESIZER (PIZARRA VS PIANO) ---
function initResizer() {
    const handle = document.getElementById('resizeHandle');
    const board = document.querySelector('.board-container');
    const container = document.querySelector('.main-stage');

    if (!handle || !board || !container) return;

    let isResizing = false;

    handle.addEventListener('mousedown', function(e) {
        isResizing = true;
        document.body.style.cursor = 'row-resize';
        e.preventDefault();
    });

    window.addEventListener('mousemove', function(e) {
        if (!isResizing) return;
        const containerRect = container.getBoundingClientRect();
        const newHeight = e.clientY - containerRect.top;
        const minSize = 100;
        const maxSize = containerRect.height - minSize;

        if (newHeight > minSize && newHeight < maxSize) {
            const percentage = (newHeight / containerRect.height) * 100;
            board.style.flex = '0 0 ' + percentage + '%';
            board.style.height = percentage + '%';
        }
    });

    window.addEventListener('mouseup', function() {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
            window.dispatchEvent(new Event('resize'));
        }
    });
}

// --- VINCULACIÓN DE HERRAMIENTAS EXTRAS (GOMA) ---
function bindToolbarExtra() {
    // Helper para gestionar la clase CSS 'active' en la barra
    function updateActiveTool(activeBtn) {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        if (activeBtn) activeBtn.classList.add('active');
    }
    
    // Aquí iría lógica adicional para herramientas extras (por ahora placeholder)
    console.log('[Main] ✅ Toolbar extra vinculado.');
}


// ============================================
// 5. ORQUESTACIÓN DE EVENTOS (CABLEADO)
// ============================================

function setupEventHandlers() {
    // --- MONITOR DE LATENCIA ---
    setupLatencyMonitor();
    
    // --- FLUJO DE AUDIO Y NOTAS ---

    bus.on("local-note", function(data) {
        socketManager.sendMidi(data.status, data.data1, data.data2);
        processMidiMessage(data, true); 
    });

    bus.on("remote-note", function(data) {
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

    // --- FLUJO DE UI Y SALA ---

    bus.on("ui-join", function(data) {
        audio.resume(); 
        socketManager.joinRoom(data.code, data.name, "student");
    });

    bus.on("ui-create", function(data) {
        audio.resume(); 
        socketManager.createRoom(data); 
    });

    bus.on("room-users", function(users) {
        const teacher = users.find(function(u) { return u.role === 'teacher'; });
        if (teacher) teacherId = teacher.socketId;
        ui.updateParticipants(users);
    });

    bus.on("room-joined", function(code) {
        if(statusDiv) statusDiv.innerHTML = '🟢 En Sala: ' + code;
        scoreLogic.setRoomCode(code); 
    });

    bus.on("room-created", function(code) {
        if(statusDiv) statusDiv.innerHTML = '🟢 Sala Creada: ' + code;
        scoreLogic.setRoomCode(code);
    });

    bus.on("class-status", function(status) {
        ui.handleClassStatus(status.isActive);
    });

    bus.on("net-broadcaster-changed", function(id) {
        currentBroadcaster = id;
        ui.handleBroadcasterChange(id, myId);
    });
    
    bus.on("ui-set-broadcaster", function(id) {
        socketManager.setBroadcaster(id);
    });
    
    // --- FASE 4: GESTIÓN DE MIDI OUTPUT ---
    bus.on("ui-select-midi-output", async function(outputId) {
        const success = await audio.selectMidiOutput(outputId);
        if (success) {
            console.log('[Main] MIDI Output seleccionado correctamente.');
        } else {
            console.error('[Main] Error seleccionando MIDI Output.');
        }
    });
    
    // --- NUEVOS: GESTIÓN DE STATE MANAGER Y SNAPSHOT PROTOCOL ---

    // Limpieza al desconectarse (previene notas pegadas)
    bus.on("net-disconnect-cleanup", function() {
        console.warn("[Main] Conexión perdida. Liberando todas las notas...");
        audio.stopAll();
    });

    // Reconciliación con snapshots (Fase 2 - Reemplaza heartbeat)
    bus.on("midi-snapshot", function(snapshot) {
        audio.reconcile(snapshot);
    });

    // Sincronización de reloj (NTP básico)
    let clockOffset = 0;
    bus.on("clock-sync-response", function(data) {
        const clientReceiveTime = Date.now();
        const rtt = clientReceiveTime - data.clientTimestamp;
        const serverTime = data.serverTimestamp + (rtt / 2);
        clockOffset = serverTime - clientReceiveTime;
        
        console.log('[ClockSync] RTT: ' + rtt + 'ms, Offset: ' + clockOffset + 'ms');
    });

    // Solicitar sincronización de reloj cada 10 segundos
    setInterval(function() {
        if (socketManager.socket.connected) {
            socketManager.requestClockSync();
        }
    }, 10000);

    // Debug: Mostrar stats del state manager (solo para desarrollo)
    if (checkTeacherRole()) {
        setInterval(function() {
            const stats = audio.getStats();
            if (stats.duplicateNoteOns > 0 || stats.autoReleases > 0) {
                console.log("[StateManager Stats]", stats);
            }
        }, 30000);
    }

    // --- FLUJO DE BIBLIOTECA Y PIZARRA ---

    bus.on("ui-tab-change", function(tab) {
        ui.switchTab(tab); 
        scoreLogic.switchTab(tab);
    });

    bus.on("ui-spy-user", function(data) {
        // Si el ojo aparece, data debe tener userId, url, page y scoreId
        spiedUserId = data.userId; 
        scoreLogic.pageData = {}; // Limpiar dibujos locales del profe antes de entrar
        
        if (data.url) {
            console.log('👁️ Entrando en Modo Espía para: ' + data.userId);
            scoreLogic.silentLoad(data.url, data.page, data.scoreId);
        } else {
            alert("El alumno no tiene ninguna partitura abierta.");
        }
    });

    bus.on("remote-pdf", function(data) {
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
    bus.on("ui-panic", function() {
        audio.scheduler.stopAll(); 
        ui.clearPiano();           
        whiteboard.drawEmpty();    
        if (scoreLogic.activeEngine) scoreLogic.activeEngine.clear(true);
        console.log('[Main] 🚨 PÁNICO ejecutado - Sistema reseteado.');
    });

    // --- GESTIÓN DE SALIDA Y CIERRE ---

    bus.on("ui-toggle-cue", function(userId) { audio.setSoloUser(userId); });

    bus.on("ui-end-class", function() {
        if(confirm("¿Seguro que quieres cerrar la clase para todos?")) {
            socketManager.endClass(); 
        }
    });

    bus.on("ui-leave", function() {
        if(confirm("¿Quieres salir de la clase?")) window.location.href = "/goodbye.html";
    });

    bus.on("app-force-exit", function() { window.location.href = "/goodbye.html"; });

    // --- TECLADO ---
    window.addEventListener('keydown', function(e) {
        if ((e.key === 'Delete' || e.key === 'Backspace') && scoreLogic.activeEngine) {
            // Solo borramos si no estamos escribiendo en un input
            if (document.activeElement.tagName !== 'INPUT') {
                scoreLogic.activeEngine.deleteSelected();
            }
        }
    });
}

function processMidiMessage(data, isLocal) {
    const { status: s, data1: d1, data2: d2 } = data;
    if ((s >= 144 && s <= 159) || (s >= 128 && s <= 143)) {
        ui.highlightKey(d1, d2);
        whiteboard.handleNote(d1, d2);
    } else if (s >= 176 && s <= 191 && d1 === 64) {
        ui.handlePedal(d2); 
    }
}

