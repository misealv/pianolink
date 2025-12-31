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
import { DraggableToolbar } from './modules/DraggableToolbar.js';

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

// ⚡ Exponer uiManager globalmente para acceso desde Whiteboard
window.uiManager = ui; 

// ==================================================
// AGORA AV - FASE 0: VARIABLES GLOBALES
// ==================================================
let videoManager = null; // Se inicializa de forma diferida (3 segundos después del bootstrap)

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

// ==================================================
// AGORA AV - FASE 0: INICIALIZACIÓN NO BLOQUEANTE
// ==================================================
/**
 * Inicializa el VideoManager de forma diferida y resiliente
 * NO BLOQUEA el bootstrap principal
 * Si falla, el sistema MIDI/Logs sigue funcionando
 */
const initVideoManager = function() {
    console.log('[Main] ⏳ Iniciando VideoManager (delayed initialization)...');
    
    return new Promise(function(resolve) {
        try {
            // Verificar que el SDK esté cargado
            if (typeof AgoraRTC === 'undefined') {
                console.warn('[Main] ⚠️ Agora SDK no disponible - Fase AV deshabilitada');
                return resolve();
            }

            if (typeof VideoManager === 'undefined') {
                console.warn('[Main] ⚠️ VideoManager no disponible - Módulo no cargado');
                return resolve();
            }

            // Crear VideoManager
            videoManager = new VideoManager({ bus: bus });

            // Inicializar con circuit breaker (fetch con timeout)
            videoManager.initialize()
                .then(function() {
                    console.log('✅ [Main] VideoManager inicializado correctamente');
                    bus.emit('video-manager-ready');
                    
                    // Mostrar botón de video una vez que el sistema está listo
                    _showVideoButton();
                })
                .catch(function(error) {
                    console.error('[Main] ❌ VideoManager falló (no crítico):', error.message);
                    videoManager = null; // Limpiamos si falla
                })
                .finally(function() {
                    resolve(); // SIEMPRE resuelve, nunca bloquea
                });

        } catch (error) {
            console.error('[Main] ❌ Error inesperado en initVideoManager:', error);
            videoManager = null;
            resolve();
        }
    });
};

/**
 * Muestra el botón de video una vez que VideoManager está listo
 * @private
 */
const _showVideoButton = function() {
    const videoBtn = document.getElementById('videoToggleBtn');
    
    if (!videoBtn) {
        console.warn('[Main] Botón de video no encontrado en el DOM');
        return;
    }
    
    // Mostrar botón
    videoBtn.style.display = 'inline-block';
    
    // Agregar event listener
    videoBtn.addEventListener('click', async function() {
        if (!videoManager || !videoManager.isReady()) {
            console.error('[Main] VideoManager no está listo');
            alert('Sistema de video no disponible');
            return;
        }
        
        // Obtener roomCode del socketManager
        const roomCode = socketManager.roomCode;
        
        if (!roomCode) {
            alert('Debes estar en una sala para activar el video');
            console.error('[Main] No hay roomCode disponible');
            return;
        }
        
        // Deshabilitar botón mientras se activa
        videoBtn.disabled = true;
        videoBtn.textContent = '⏳ Activando...';
        
        try {
            // Activar UI de video (incluye join automático)
            const activated = await videoManager.activateUI(roomCode);
            
            if (activated) {
                console.log('✅ [Main] Sistema de video activado completamente');
                videoBtn.textContent = '✅ Video Activo';
                videoBtn.style.background = '#00ff00';
                
                // Conectar event handlers de botones de control
                _connectVideoControls();
            } else {
                throw new Error('No se pudo activar el sistema de video');
            }
        } catch (error) {
            console.error('[Main] Error activando video:', error);
            alert('Error al activar video: ' + error.message);
            videoBtn.disabled = false;
            videoBtn.textContent = '📹 Video';
            videoBtn.style.background = '#00aaff';
        }
    });
    
    console.log('[Main] 📹 Botón de video habilitado');
};

/**
 * Conecta event handlers de los botones de control de video
 * @private
 */
const _connectVideoControls = function() {
    // Botón mute audio
    const muteAudioBtn = document.getElementById('local-mute-audio');
    if (muteAudioBtn) {
        muteAudioBtn.addEventListener('click', async function() {
            if (!videoManager) return;
            
            const isMuted = videoManager.isMuted.audio;
            await videoManager.muteAudio(!isMuted);
            
            // Update UI
            this.textContent = isMuted ? '🎤' : '🔇';
            this.style.opacity = isMuted ? '1' : '0.5';
        });
    }
    
    // Botón mute video
    const muteVideoBtn = document.getElementById('local-mute-video');
    if (muteVideoBtn) {
        muteVideoBtn.addEventListener('click', async function() {
            if (!videoManager) return;
            
            const isMuted = videoManager.isMuted.video;
            await videoManager.muteVideo(!isMuted);
            
            // Update UI
            this.textContent = isMuted ? '📹' : '🚫';
            this.style.opacity = isMuted ? '1' : '0.5';
        });
    }
    
    // Botón minimize local
    const minimizeLocalBtn = document.getElementById('local-minimize');
    if (minimizeLocalBtn) {
        minimizeLocalBtn.addEventListener('click', function() {
            const container = document.getElementById('local-video');
            if (container) {
                container.classList.toggle('minimized');
            }
        });
    }
    
    // Botón minimize remote
    const minimizeRemoteBtn = document.getElementById('remote-minimize');
    if (minimizeRemoteBtn) {
        minimizeRemoteBtn.addEventListener('click', function() {
            const container = document.getElementById('remote-video');
            if (container) {
                container.classList.toggle('minimized');
            }
        });
    }
    
    console.log('[Main] ✅ Controles de video conectados');
};

// 4. FUNCIÓN DE ARRANQUE PRINCIPAL
async function bootstrap() {
    try {
        console.log("🚀 Iniciando PianoLink V4 Modular + State Management + Agora AV (Fase 0)...");
        
        // ========================================
        // PRIORIDAD ALTA: MIDI y Logs (CRÍTICO)
        // ========================================
        
        // Inicializar AudioEngine (el AudioContext se reanudará con primer click/teclado)
        await audio.init();
        console.log('✅ [Main] AudioEngine inicializado.');
        
        // Reanudar AudioContext con primer click del usuario (browser autoplay policy)
        const resumeAudioContext = function() {
            if (audio.scheduler.ctx.state === 'suspended') {
                audio.scheduler.ctx.resume().then(function() {
                    console.log('✅ [Main] AudioContext reanudado después de user gesture');
                });
            }
            // Remover listener después del primer click
            document.removeEventListener('click', resumeAudioContext);
            document.removeEventListener('keydown', resumeAudioContext);
        };
        document.addEventListener('click', resumeAudioContext, { once: true });
        document.addEventListener('keydown', resumeAudioContext, { once: true });
        
        // Init no-crítico del sidebar (no debe bloquear)
        initDiagnosticSidebar();
        
        // Init de UI
        initResizer();
        bindToolbarExtra();
        
        // ========================================
        // NUEVO: TOOLBAR DRAGGABLE
        // ========================================
        const draggableToolbar = new DraggableToolbar('drawing-toolbar');
        console.log('✅ [Main] Toolbar draggable inicializado.');
        
        // NOTA: Los osciladores web están permanentemente deshabilitados
        // No se necesita listener para silenciar AudioScheduler
        
        // Configurar event listeners DESPUÉS de que todo esté inicializado
        setupEventHandlers();
        
        // ========================================
        // ⚡ SPRINT FINAL P2: CONNECTION MANAGER
        // ========================================
        initConnectionManager();
        
        console.log('✅ [Main] Sistema CRÍTICO inicializado (MIDI/Logs operativos).');
        
        // ========================================
        // PRIORIDAD BAJA: Video (NO CRÍTICO - DELAYED 3s)
        // ========================================
        // Video se inicializa SIN await y con delay de 3 segundos
        // Esto asegura que el hilo principal esté libre para MIDI/Logs
        setTimeout(function() {
            initVideoManager(); // Sin await - ejecuta en background
        }, 3000);
        
        console.log('✅ [Main] Sistema completamente inicializado (Video se cargará en 3s).');
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
// ⚡ SPRINT FINAL P2: CONNECTION MANAGER
// ============================================

/**
 * Gestión Global de Estado de Conexión (UX Defensiva)
 * Controla banners, overlays y bloqueo de MIDI durante desconexiones
 */
function initConnectionManager() {
    const banner = document.getElementById('connectionBanner');
    const bannerTitle = document.getElementById('bannerTitle');
    const bannerSubtitle = document.getElementById('bannerSubtitle');
    const bannerIcon = banner.querySelector('.banner-icon');
    
    const overlay = document.getElementById('connectionOverlay');
    const overlayMessage = document.getElementById('overlayMessage');
    const overlayProgressBar = document.getElementById('overlayProgressBar');
    
    let disconnectTimer = null; // Timer para mostrar overlay después de 5s
    let reconnectAttempt = 0;
    
    // --- EVENTO: CONEXIÓN PERDIDA ---
    bus.on('connection-lost', (data) => {
        console.warn('[ConnectionManager] 🔴 Conexión perdida:', data.reason);
        reconnectAttempt = 0;
        
        // 1. Bloquear emisión MIDI inmediatamente
        audio.setMidiBlocked(true);
        
        // 2. Mostrar banner de advertencia
        bannerTitle.textContent = 'Conexión perdida';
        bannerSubtitle.textContent = 'Reconectando automáticamente...';
        bannerIcon.textContent = '⚠️';
        banner.classList.remove('success', 'hidden');
        banner.classList.add('visible');
        
        // 3. Si no se reconecta en 5s, mostrar overlay bloqueante
        disconnectTimer = setTimeout(() => {
            console.warn('[ConnectionManager] Desconexión prolongada (>5s). Bloqueando UI.');
            overlay.classList.remove('hidden');
            overlay.classList.add('visible');
            overlayMessage.textContent = 'Conexión interrumpida. Esperando reconexión...';
            overlayProgressBar.style.width = '0%';
        }, 5000);
    });
    
    // --- EVENTO: PROGRESO DE RECONEXIÓN ---
    bus.on('reconnect-progress', (data) => {
        reconnectAttempt = data.attempt;
        console.log(`[ConnectionManager] 🔄 Intento de reconexión: ${reconnectAttempt}`);
        
        // Actualizar UI con progreso
        if (overlay.classList.contains('visible')) {
            overlayMessage.textContent = `Intento ${reconnectAttempt} de reconexión...`;
            const progress = Math.min(reconnectAttempt * 20, 90); // Max 90% hasta que conecte
            overlayProgressBar.style.width = `${progress}%`;
        }
        
        bannerSubtitle.textContent = `Intento ${reconnectAttempt}...`;
    });
    
    // --- EVENTO: CONEXIÓN RESTAURADA ---
    bus.on('connection-restored', () => {
        console.log('[ConnectionManager] ✅ Conexión restaurada');
        
        // 1. Cancelar timer de overlay si está pendiente
        if (disconnectTimer) {
            clearTimeout(disconnectTimer);
            disconnectTimer = null;
        }
        
        // 2. Desbloquear MIDI
        audio.setMidiBlocked(false);
        
        // 3. Ocultar overlay inmediatamente
        overlay.classList.remove('visible');
        overlay.classList.add('hidden');
        overlayProgressBar.style.width = '100%';
        
        // 4. Mostrar banner de éxito por 3 segundos
        bannerTitle.textContent = 'Conexión restablecida';
        bannerSubtitle.textContent = 'Puedes continuar con normalidad';
        bannerIcon.textContent = '✅';
        banner.classList.remove('visible');
        banner.classList.add('success', 'visible');
        
        setTimeout(() => {
            banner.classList.remove('visible');
            banner.classList.add('hidden');
            
            // Después de ocultar, remover clase success
            setTimeout(() => {
                banner.classList.remove('success');
            }, 300);
        }, 3000);
        
        // 5. Solicitar sincronización de estado
        if (socketManager.roomCode) {
            console.log('[ConnectionManager] Solicitando sincronización de estado...');
            socketManager.socket.emit('request-full-sync', { 
                roomCode: socketManager.roomCode 
            });
        }
    });
    
    // --- EVENTO: ERROR DE CONEXIÓN ---
    this.socket?.on('connect_error', (error) => {
        console.error('[ConnectionManager] ❌ Error de conexión:', error.message);
        
        // Mostrar mensaje de error en overlay si está visible
        if (overlay.classList.contains('visible')) {
            overlayMessage.textContent = 'Error al conectar. Verifica tu internet.';
        }
    });
    
    console.log('✅ [Main] ConnectionManager inicializado');
}

// ============================================
// 5. ORQUESTACIÓN DE EVENTOS (CABLEADO)
// ============================================

function setupEventHandlers() {
    // --- MONITOR DE LATENCIA ---
    setupLatencyMonitor();
    
    // --- VIDEO ERROR HANDLING (Silent) ---
    bus.on("video-error", function(data) {
        console.error('[Main] Video error:', data.type, data.message);
        
        // Si es error silencioso, solo loguear (no bloquear MIDI)
        if (data.silent) {
            // TODO: Mostrar en DiagnosticSidebar si está disponible
            if (diagnosticSidebar) {
                // diagnosticSidebar.addLog('video-error', data.message);
            }
        } else {
            // Error crítico - mostrar al usuario
            alert('Error de video: ' + data.message);
        }
    });
    
    // --- FLUJO DE AUDIO Y NOTAS ---
    
    // ⚡ NUEVO: Sincronizar limpieza de zombies con UI
    bus.on("zombie-cleanup", function(data) {
        console.log(`[Main] 🧹 Sincronizando limpieza de ${data.count} zombies con UI`);
        
        // Obtener notas que aún están activas en el scheduler
        const activeNotes = Array.from(audio.scheduler.stateManager._activeNotes.keys());
        
        // Sincronizar con UI: Si una tecla está iluminada pero no está en activeNotes, apagarla
        const allKeys = document.querySelectorAll('.key.note-active');
        allKeys.forEach(key => {
            const note = parseInt(key.dataset.noteMidi);
            if (!activeNotes.includes(note)) {
                console.log(`[Main] Limpiando tecla visual zombie: ${note}`);
                ui.highlightKey(note, 0); // Apagar visualmente
            }
        });
    });

    bus.on("local-note", function(data) {
        socketManager.sendMidi(data.status, data.data1, data.data2);
        processMidiMessage(data, true);
        
        // === LOCAL ECHO: Enviar CC al hardware local ===
        // Las notas NO se envían (el usuario ya las escucha directamente del piano)
        // pero CC (pedal, volumen, etc.) SÍ deben reenviarse para que funcionen
        const isCC = (data.status >= 176 && data.status <= 191);
        if (isCC) {
            audio.playLocal(data); // Enviar CC al hardware local
        }
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

        if (shouldPlay) {            // ⚡ NUEVO: Detectar si es Control Change (pedal sustain)
            const isCC = (data.status >= 176 && data.status <= 191);
            const isSustainPedal = isCC && data.data1 === 64;
            
            if (isSustainPedal) {
                // Activar watchdog de pedal
                const channel = data.status - 176;
                audio.handlePedalSustain(channel, data.data2);
            }
            
            // ⚡ NUEVO: Detectar cambio de acorde (NoteOn múltiple)
            const isNoteOn = (data.status >= 144 && data.status <= 159) && data.data2 > 0;
            if (isNoteOn) {
                // Obtener notas actualmente sonando
                const stats = audio.getStats();
                if (stats.activeNotes >= 3) {
                    // Posible acorde, notificar al engine
                    const activeNotes = Array.from(audio.scheduler.stateManager._activeNotes.keys());
                    audio.detectChordChange(activeNotes);
                }
            }
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

    // NUEVO: Recuperación total MIDI después de reconexión
    bus.on("net-midi-recovery", function() {
        console.log("[Main] 🔄 Reconexión detectada. Reinicializando MIDI...");
        
        // 1. Detener todo audio y limpiar estado
        audio.stopAll();
        
        // 2. Re-escanear dispositivos MIDI (hot-plug recovery)
        audio.scanDevices();
        
        // 3. Re-unirse a la sala si estamos en una
        const pianoUser = JSON.parse(localStorage.getItem('pianoUser') || '{}');
        const roomCode = pianoUser.roomCode;
        
        if (roomCode && socketManager.socket.connected) {
            console.log(`[Main] Re-uniéndose a sala: ${roomCode}`);
            socketManager.joinRoom({
                roomCode: roomCode,
                username: pianoUser.username || 'Usuario',
                userRole: pianoUser.role || 'student'
            });
        }
        
        // 4. Solicitar snapshot del estado actual
        setTimeout(() => {
            if (socketManager.socket.connected) {
                socketManager.socket.emit('request-snapshot', { roomCode: roomCode });
            }
        }, 500);
    });

    // Reconciliación con snapshots (Fase 2 - Reemplaza heartbeat)
    // MEJORADO: Limpia UI también
    bus.on("midi-snapshot", function(snapshot) {
        audio.reconcile(snapshot);
        
        // NUEVO: Sincronizar UI con el snapshot autoritativo
        if (snapshot.notes && snapshot.type === 'periodic') {
            // Obtener notas que el servidor reporta como activas
            const serverNotes = new Set(snapshot.notes);
            
            // Limpiar notas huérfanas en el piano visual
            const allKeys = document.querySelectorAll('.key.note-active');
            allKeys.forEach(function(key) {
                const noteId = parseInt(key.getAttribute('data-note-midi'));
                if (!serverNotes.has(noteId)) {
                    console.log('[Main] 🧹 Limpiando nota huérfana del UI: ' + noteId);
                    ui.forceReleaseKey(noteId);
                    whiteboard.forceReleaseNote(noteId);
                }
            });
        }
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
    
    // ==================================================
    // SIDEBAR MANAGER: Toggle colapsable
    // ==================================================
    initSidebarToggle();
}

/**
 * Inicializa el sistema de sidebar colapsable
 */
function initSidebarToggle() {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');
    const mainStage = document.querySelector('.main-stage');
    
    if (!sidebar || !toggleBtn || !mainStage) {
        console.warn('[SidebarManager] Elementos no encontrados');
        return;
    }
    
    // Crear overlay para cerrar en mobile/click fuera
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
    }
    
    // Estado persistente (localStorage)
    let isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    
    // Función para colapsar
    function collapse() {
        sidebar.classList.add('collapsed');
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        toggleBtn.classList.remove('open');
        toggleBtn.querySelector('.hamburger-icon').textContent = '☰';
        isCollapsed = true;
        localStorage.setItem('sidebar-collapsed', 'true');
        console.log('[SidebarManager] Sidebar colapsado');
    }
    
    // Función para expandir
    function expand() {
        sidebar.classList.remove('collapsed');
        sidebar.classList.add('open');
        
        // En desktop, no mostrar overlay; en mobile sí
        if (window.innerWidth <= 900) {
            overlay.classList.add('active');
        }
        
        toggleBtn.classList.add('open');
        toggleBtn.querySelector('.hamburger-icon').textContent = '✕';
        isCollapsed = false;
        localStorage.setItem('sidebar-collapsed', 'false');
        console.log('[SidebarManager] Sidebar expandido');
    }
    
    // Función toggle
    function toggle() {
        if (isCollapsed) {
            expand();
        } else {
            collapse();
        }
    }
    
    // Aplicar estado inicial
    if (isCollapsed) {
        collapse();
    }
    
    // Event listeners
    toggleBtn.addEventListener('click', toggle);
    overlay.addEventListener('click', collapse);
    
    // Cerrar con tecla ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && !isCollapsed) {
            collapse();
        }
    });
    
    // Responsive: en mobile, empezar colapsado
    function handleResize() {
        if (window.innerWidth <= 900 && !isCollapsed) {
            // En mobile, si está abierto, mostrar overlay
            overlay.classList.add('active');
        } else {
            // En desktop, quitar overlay
            overlay.classList.remove('active');
        }
    }
    
    window.addEventListener('resize', handleResize);
    handleResize(); // Ejecutar al inicio
    
    console.log('[SidebarManager] ✅ Inicializado');
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

