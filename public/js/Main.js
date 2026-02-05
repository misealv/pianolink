/**
 * /public/js/Main.js
 * Controlador Principal - PianoLink V4 (Fase 1-5 Integrado)
 */
console.log('📦 [Main.js] Archivo cargado correctamente');

import { SocketClient } from './modules/SocketClient.js';
import { AudioEngine } from './modules/AudioEngine.js';
import { Whiteboard } from './modules/Whiteboard.js';
import { UIManager } from './modules/UIManager.js';
import { ScoreLogic } from './modules/ScoreLogic.js'; 
import { FreeBoard } from './modules/FreeBoard.js';
import { DiagnosticSidebar } from './modules/DiagnosticSidebar.js';
import { DraggableToolbar } from './modules/DraggableToolbar.js';
import { PLBTranscriber } from './modules/PLBTranscriber.js';
import { PLBHud } from './modules/PLBHud.js';
import { ConnectionQualityMonitor } from './modules/ConnectionQualityMonitor.js';

console.log('📦 [Main.js] Todos los imports completados');

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
// PLB (PIANO LINK BRAIN) - VARIABLES GLOBALES
// ==================================================
let plbTranscriber = null;
let plbHud = null;

// ==================================================
// AGORA AV - FASE 0: VARIABLES GLOBALES
// ==================================================
let videoManager = null; // Se inicializa de forma diferida (3 segundos después del bootstrap)
let audioStateManager = null; // Gestor de perfiles de audio (3 modos)

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
let connectionQualityMonitor = null; // Monitor de calidad de conexión

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

// 2.6b. CONNECTION QUALITY MONITOR - Para detectar problemas de red en tiempo real
const initConnectionQualityMonitor = function() {
    try {
        // Disponible para todos los usuarios (profesor y alumno)
        connectionQualityMonitor = new ConnectionQualityMonitor(bus, socketManager);
        console.log('📶 [Main] Connection Quality Monitor inicializado.');
    } catch (error) {
        console.error('[Main] ⚠️ Error inicializando Connection Quality Monitor (no crítico):', error);
    }
};

// ==================================================
// 2.7. PLB (PIANO LINK BRAIN) - INICIALIZACIÓN
// ==================================================
const initPLB = function() {
    console.log('[Main] 🔍 initPLB() ejecutándose...');
    try {
        const user = JSON.parse(localStorage.getItem('pianoUser') || '{}');
        console.log('[Main] 🔍 Usuario completo:', JSON.stringify(user));
        console.log('[Main] 🔍 Email detectado:', user.email || '(ninguno)');
        
        // Crear el HUD (solo se muestra para profesores)
        plbHud = new PLBHud(bus, socketManager.socket);
        
        // El transcriber se activa para todos, pero el servidor
        // solo procesa para demo@pianolink.com
        plbTranscriber = new PLBTranscriber(bus, socketManager.socket);
        
        // Exponer globalmente para debugging
        window.bus = bus;
        window.plbTranscriber = plbTranscriber;
        window.plbHud = plbHud;
        
        // Si el usuario tiene email, intentar activar PLB
        if (user.email) {
            console.log(`[Main] 🧠 Intentando activar PLB para: ${user.email}`);
            const started = plbTranscriber.start(user.email);
            console.log(`[Main] 🧠 PLB start() resultado: ${started}`);
        } else {
            console.warn('[Main] ⚠️ PLB: Usuario sin email - no se puede activar transcriber');
            console.warn('[Main] ⚠️ Para activar PLB, ejecuta en consola:');
            console.warn('[Main] ⚠️   const u = JSON.parse(localStorage.pianoUser);');
            console.warn('[Main] ⚠️   u.email = "demo@pianolink.com";');
            console.warn('[Main] ⚠️   localStorage.pianoUser = JSON.stringify(u);');
            console.warn('[Main] ⚠️   location.reload();');
        }
        
        console.log('[Main] 🧠 PLB inicializado.');
    } catch (error) {
        console.error('[Main] ⚠️ Error inicializando PLB (no crítico):', error);
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
                    
                    // ========================================
                    // AUDIO STATE MANAGER - Inicializar después de VideoManager
                    // ========================================
                    _initAudioStateManager();
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
 * Inicializa el AudioStateManager para control de perfiles de audio
 * 3 MODOS: MIDI_HYBRID (piano), CONVERSATION (voz), EMERGENCY (raw)
 * @private
 */
const _initAudioStateManager = function() {
    try {
        // Verificar que AudioStateManager esté disponible
        if (typeof AudioStateManager === 'undefined') {
            console.warn('[Main] ⚠️ AudioStateManager no disponible - Módulo no cargado');
            return;
        }
        
        // Verificar VideoManager
        if (!videoManager) {
            console.warn('[Main] ⚠️ VideoManager no disponible para AudioStateManager');
            return;
        }
        
        // Obtener datos de usuario
        let userRole = 'student';
        let userId = socket ? socket.id : null;
        
        try {
            const saved = JSON.parse(localStorage.getItem('pianoUser') || '{}');
            userRole = saved.role || 'student';
        } catch (e) {
            console.warn('[Main] Error leyendo rol de usuario:', e);
        }
        
        // Crear instancia
        audioStateManager = new AudioStateManager({
            bus: bus,
            socket: socket,
            videoManager: videoManager
        });
        
        // Inicializar con rol
        audioStateManager.init(userRole, userId);
        
        // Exponer globalmente para acceso desde panel de control
        window.audioStateManager = audioStateManager;
        
        console.log('✅ [Main] AudioStateManager inicializado');
        console.log('  - Rol:', userRole);
        console.log('  - Perfil inicial: MIDI_HYBRID');
        
        // Si es profesor, conectar controles de audio integrados en ventana de video
        if (userRole === 'teacher' || userRole === 'admin') {
            // Los controles se conectan cuando la ventana de video esté lista
            bus.on('video-joined-channel', function() {
                _connectIntegratedAudioControls();
            });
        }
        
        bus.emit('audio-state-manager-ready');
        
    } catch (error) {
        console.error('[Main] ❌ Error inicializando AudioStateManager:', error);
    }
};

/**
 * Conecta los controles de audio integrados en la ventana de video remoto
 * NUEVA VERSIÓN: Controles directamente sobre el video del estudiante
 * @private
 */
const _connectIntegratedAudioControls = function() {
    // Verificar que los elementos existan (solo para profesores)
    const modeButtons = document.querySelectorAll('.audio-mode-btn');
    const muteBtn = document.getElementById('remote-mute-btn');
    const statusDiv = document.getElementById('audio-control-status');
    
    if (modeButtons.length === 0) {
        console.log('[Main] Controles de audio no presentes (no es profesor)');
        return;
    }
    
    let isStudentMuted = false;
    let currentMode = 'MIDI_HYBRID';
    
    // === BOTONES DE MODO ===
    modeButtons.forEach(function(btn) {
        btn.addEventListener('click', function() {
            if (!audioStateManager) {
                console.error('[AudioControls] AudioStateManager no disponible');
                return;
            }
            
            const mode = this.getAttribute('data-mode');
            
            // Actualizar UI inmediatamente
            modeButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            this.classList.add('flash');
            setTimeout(() => this.classList.remove('flash'), 300);
            
            // Enviar a todos los estudiantes
            audioStateManager.sendChangeMode(null, mode);
            currentMode = mode;
            
            // Actualizar indicador de estado
            _updateModeIndicator(mode);
            
            console.log('[AudioControls] Modo cambiado:', mode);
        });
    });
    
    // === BOTÓN DE MUTE ===
    if (muteBtn) {
        muteBtn.addEventListener('click', function() {
            if (!audioStateManager) {
                console.error('[AudioControls] AudioStateManager no disponible');
                return;
            }
            
            isStudentMuted = !isStudentMuted;
            
            // Enviar a todos los estudiantes
            audioStateManager.sendRemoteMute(null, isStudentMuted);
            
            // Actualizar UI
            this.textContent = isStudentMuted ? '🔇' : '🔊';
            this.classList.toggle('muted', isStudentMuted);
            
            console.log('[AudioControls] Mute remoto:', isStudentMuted);
        });
    }
    
    // === ESCUCHAR CONFIRMACIONES ===
    bus.on('audio-mode-change-confirmed', function(data) {
        if (statusDiv) {
            const modeIcon = data.profile === 'MIDI_HYBRID' ? '🎹' : 
                            data.profile === 'CONVERSATION' ? '💬' : '🔴';
            statusDiv.querySelector('.mode-indicator').innerHTML = 
                modeIcon + ' ' + _getModeDisplayName(data.profile) + ' ✓';
        }
    });
    
    bus.on('remote-mute-confirmed', function(data) {
        console.log('[AudioControls] Confirmación de mute recibida:', data);
    });
    
    // Actualizar título de ventana remota cuando se conecta un usuario
    socket.on('room-users', function(users) {
        const students = users.filter(u => u.role === 'student');
        const titleEl = document.getElementById('remote-video-title');
        
        if (titleEl && students.length > 0) {
            titleEl.textContent = '👥 ' + students[0].name;
        } else if (titleEl) {
            titleEl.textContent = '👥 Esperando...';
        }
    });
    
    console.log('[Main] ✅ Controles de audio integrados conectados');
};

/**
 * Actualiza el indicador de modo en la UI
 * @param {string} mode
 * @private
 */
const _updateModeIndicator = function(mode) {
    const statusDiv = document.getElementById('audio-control-status');
    if (!statusDiv) return;
    
    const indicator = statusDiv.querySelector('.mode-indicator');
    if (!indicator) return;
    
    const modeIcon = mode === 'MIDI_HYBRID' ? '🎹' : 
                    mode === 'CONVERSATION' ? '💬' : '🔴';
    const modeColor = mode === 'MIDI_HYBRID' ? '#4CAF50' : 
                     mode === 'CONVERSATION' ? '#2196F3' : '#F44336';
    
    indicator.textContent = modeIcon + ' ' + _getModeDisplayName(mode);
    indicator.style.color = modeColor;
};

/**
 * Obtiene el nombre para mostrar de un modo de audio
 * @param {string} mode
 * @returns {string}
 * @private
 */
const _getModeDisplayName = function(mode) {
    switch(mode) {
        case 'MIDI_HYBRID': return 'Piano + Voz';
        case 'CONVERSATION': return 'Solo Voz';
        case 'EMERGENCY': return 'Sin Filtros';
        default: return mode;
    }
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
    console.log("🚀 Iniciando PianoLink V4 Modular + State Management + Agora AV (Fase 0)...");
    
    // ========================================
    // PRIORIDAD ALTA: MIDI y Logs (CRÍTICO)
    // ========================================
    
    // Inicializar AudioEngine (lazy - el AudioContext se reanudará con primer click)
    try {
        await audio.init();
        console.log('✅ [Main] AudioEngine inicializado.');
        
        // Reanudar AudioContext con primer click del usuario (browser autoplay policy)
        const resumeAudioContext = function() {
            if (audio.scheduler && audio.scheduler.ctx && audio.scheduler.ctx.state === 'suspended') {
                audio.scheduler.ctx.resume().then(function() {
                    console.log('✅ [Main] AudioContext reanudado después de user gesture');
                }).catch(function(err) {
                    console.warn('[Main] Error reanudando AudioContext:', err);
                });
            }
            // Remover listener después del primer click
            document.removeEventListener('click', resumeAudioContext);
            document.removeEventListener('keydown', resumeAudioContext);
        };
        document.addEventListener('click', resumeAudioContext, { once: true });
        document.addEventListener('keydown', resumeAudioContext, { once: true });
    } catch (error) {
        console.warn('[Main] ⚠️ AudioEngine no pudo inicializarse:', error);
        console.warn('[Main] La app continuará sin soporte de audio MIDI.');
    }
    
    // Init no-crítico del sidebar (error silencioso)
    try {
        initDiagnosticSidebar();
    } catch (error) {
        console.warn('[Main] ⚠️ DiagnosticSidebar no disponible:', error);
    }
    
    // Init monitor de calidad de conexión
    try {
        initConnectionQualityMonitor();
    } catch (error) {
        console.warn('[Main] ⚠️ ConnectionQualityMonitor no disponible:', error);
    }
    
    // ==================================================
    // PLB (PIANO LINK BRAIN) - INICIALIZACIÓN INMEDIATA
    // ==================================================
    console.log('[Main] 🔍 Intentando inicializar PLB...');
    try {
        initPLB();
    } catch (error) {
        console.error('[Main] ⚠️ PLB no disponible:', error);
    }
    
    // Init de UI (resiliente a fallos)
    try {
        initResizer();
        bindToolbarExtra();
    } catch (error) {
        console.warn('[Main] ⚠️ Error en UI auxiliar:', error);
    }
    
    // ========================================
    // NUEVO: TOOLBAR DRAGGABLE
    // ========================================
    try {
        const draggableToolbar = new DraggableToolbar('drawing-toolbar');
        console.log('✅ [Main] Toolbar draggable inicializado.');
    } catch (error) {
        console.warn('[Main] ⚠️ Toolbar no disponible:', error);
    }
    
    // NOTA: Los osciladores web están permanentemente deshabilitados
    // No se necesita listener para silenciar AudioScheduler
    
    // Configurar event listeners (resiliente)
    try {
        setupEventHandlers();
    } catch (error) {
        console.warn('[Main] ⚠️ Error configurando event handlers:', error);
    }
    
    // ========================================
    // ⚡ SPRINT FINAL P2: CONNECTION MANAGER
    // ========================================
    try {
        initConnectionManager();
    } catch (error) {
        console.warn('[Main] ⚠️ ConnectionManager no disponible:', error);
    }
    
    // ========================================
    // ⚡ SPRINT FINAL P3: UX DEFENSIVA
    // ========================================
    try {
        initHealthIndicators();
    } catch (error) {
        console.warn('[Main] ⚠️ Health indicators no disponibles:', error);
    }
    
    try {
        initPreFlightCheck(); // Se muestra automáticamente después de 1s
    } catch (error) {
        console.warn('[Main] ⚠️ PreFlightCheck no disponible:', error);
    }
    
    console.log('✅ [Main] Sistema CRÍTICO inicializado (MIDI/Logs operativos).');
    
    // ========================================
    // PRIORIDAD BAJA: Video (NO CRÍTICO - DELAYED 3s)
    // ========================================
    // Video se inicializa SIN await y con delay de 3 segundos
    // Esto asegura que el hilo principal esté libre para MIDI/Logs
    setTimeout(function() {
        try {
            initVideoManager(); // Sin await - ejecuta en background
        } catch (error) {
            console.warn('[Main] ⚠️ VideoManager no pudo inicializarse:', error);
        }
    }, 3000);
    
    console.log('✅ [Main] Sistema completamente inicializado (Video se cargará en 3s).');
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
    if (connectionQualityMonitor) connectionQualityMonitor.dispose();
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

// --- GESTIÓN DEL RESIZER (PIZARRA VS PIANO) - POINTER EVENTS ---
function initResizer() {
    const handle = document.getElementById('resizeHandle');
    const board = document.querySelector('.board-container');
    const container = document.querySelector('.main-stage');

    if (!handle || !board || !container) return;

    let isResizing = false;
    let rafId = null;
    let pendingHeight = 0;
    let activePointerId = null;

    // CSS para touch
    handle.style.touchAction = 'none';

    handle.addEventListener('pointerdown', function(e) {
        isResizing = true;
        activePointerId = e.pointerId;
        document.body.style.cursor = 'row-resize';
        
        // Capturar pointer
        handle.setPointerCapture(e.pointerId);
        
        e.preventDefault();
    });

    handle.addEventListener('pointermove', function(e) {
        if (!isResizing) return;
        if (e.pointerId !== activePointerId) return;
        
        e.preventDefault();
        
        const containerRect = container.getBoundingClientRect();
        const newHeight = e.clientY - containerRect.top;
        const minSize = 100;
        const maxSize = containerRect.height - minSize;

        if (newHeight > minSize && newHeight < maxSize) {
            pendingHeight = newHeight;
            
            // RAF para fluidez
            if (!rafId) {
                rafId = requestAnimationFrame(function() {
                    const percentage = (pendingHeight / container.getBoundingClientRect().height) * 100;
                    board.style.flex = '0 0 ' + percentage + '%';
                    board.style.height = percentage + '%';
                    rafId = null;
                });
            }
        }
    });

    const stopResize = function(e) {
        if (!isResizing) return;
        if (e.pointerId !== activePointerId) return;
        
        // Liberar captura
        if (handle.hasPointerCapture && handle.hasPointerCapture(e.pointerId)) {
            handle.releasePointerCapture(e.pointerId);
        }
        
        isResizing = false;
        activePointerId = null;
        document.body.style.cursor = 'default';
        
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        
        window.dispatchEvent(new Event('resize'));
    };
    
    handle.addEventListener('pointerup', stopResize);
    handle.addEventListener('pointercancel', stopResize);
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
    const bannerIcon = banner ? banner.querySelector('.banner-icon') : null;
    
    const overlay = document.getElementById('connectionOverlay');
    const overlayMessage = document.getElementById('overlayMessage');
    const overlayProgressBar = document.getElementById('overlayProgressBar');
    
    // Null-check: Si elementos críticos no existen, abortar silenciosamente
    if (!banner || !bannerTitle || !bannerSubtitle || !bannerIcon || !overlay) {
        console.warn('[ConnectionManager] Elementos DOM no encontrados. Funcionalidad deshabilitada.');
        return;
    }
    
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
    
    // --- AGORA AUDIT EVENTS (enviar al servidor via socket) ---
    bus.on("agora-audit-event", function(data) {
        if (socket && socket.connected) {
            socket.emit("agora-event", data);
        }
    });
    
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

    // === ⚡ RATE LIMITING PARA CC FLOODS ===
    // Throttle adicional para CC ruidosos (Expression, Modulation, Breath)
    const ccThrottleState = {
        lastCC: new Map(),       // key: "cc-channel-control", value: timestamp
        CC_FLOOD_THROTTLE: 16,   // 16ms = max 62.5 CC/s por control (profesional)
        NOISY_CCS: [1, 2, 7, 11, 64, 74] // Modulation, Breath, Volume, Expression, Sustain, Brightness
    };
    
    bus.on("local-note", function(data) {
        // === RATE LIMITING: Prevenir CC floods ===
        const isCC = (data.status >= 176 && data.status <= 191);
        if (isCC && ccThrottleState.NOISY_CCS.includes(data.data1)) {
            const channel = data.status - 176;
            const ccKey = `${channel}-${data.data1}`;
            const now = performance.now();
            const lastTime = ccThrottleState.lastCC.get(ccKey) || 0;
            
            if (now - lastTime < ccThrottleState.CC_FLOOD_THROTTLE) {
                // Throttle: ignorar este CC para no saturar socket
                return;
            }
            ccThrottleState.lastCC.set(ccKey, now);
        }
        
        socketManager.sendMidi(data.status, data.data1, data.data2);
        processMidiMessage(data, true);
        
        // === LOCAL ECHO: Enviar CC al hardware local ===
        // Las notas NO se envían (el usuario ya las escucha directamente del piano)
        // pero CC (pedal, volumen, etc.) SÍ deben reenviarse para que funcionen
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

    // 🔐 Manejar error de sala (membresía inactiva)
    bus.on("room-error", function(error) {
        console.error('[Main] Room error:', error);
        
        if (error.code === 'MEMBERSHIP_INACTIVE') {
            // Mostrar pantalla de membresía requerida
            showMembershipRequiredScreen(error.message);
        } else if (error.code === 'CREDENTIALS_REQUIRED') {
            // Credenciales no encontradas - pedir re-login
            showReloginRequiredScreen(error.message);
        } else {
            // Error genérico
            if(statusDiv) statusDiv.innerHTML = '🔴 Error: ' + (error.message || 'No se pudo acceder a la sala');
        }
    });
    
    // Función para mostrar pantalla cuando necesita re-login
    function showReloginRequiredScreen(message) {
        const container = document.getElementById('piano-container') || document.body;
        container.innerHTML = `
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 80vh;
                text-align: center;
                font-family: system-ui, -apple-system, sans-serif;
                padding: 40px;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                color: white;
            ">
                <div style="font-size: 64px; margin-bottom: 20px;">🔐</div>
                <h1 style="font-size: 28px; margin-bottom: 16px; color: #f59e0b;">Sesión Requerida</h1>
                <p style="font-size: 16px; color: rgba(255,255,255,0.8); max-width: 400px; line-height: 1.6; margin-bottom: 30px;">
                    ${message || 'Por favor, cierra sesión y vuelve a ingresar para verificar tu membresía.'}
                </p>
                <div style="display: flex; gap: 15px; flex-wrap: wrap; justify-content: center;">
                    <a href="/login.html" onclick="localStorage.removeItem('pianoUser'); localStorage.removeItem('token');" style="
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                        padding: 14px 28px;
                        background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                        color: white;
                        text-decoration: none;
                        border-radius: 10px;
                        font-weight: 700;
                        font-size: 14px;
                        box-shadow: 0 4px 15px rgba(99,102,241,0.4);
                        transition: all 0.3s;
                    " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                        🔑 Volver a Ingresar
                    </a>
                </div>
            </div>
        `;
    }
    
    // Función para mostrar pantalla de membresía requerida
    function showMembershipRequiredScreen(message) {
        const container = document.getElementById('piano-container') || document.body;
        container.innerHTML = `
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 80vh;
                text-align: center;
                font-family: system-ui, -apple-system, sans-serif;
                padding: 40px;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                color: white;
            ">
                <div style="font-size: 64px; margin-bottom: 20px;">🎹</div>
                <h1 style="font-size: 28px; margin-bottom: 16px; color: #f59e0b;">Membresía Requerida</h1>
                <p style="font-size: 16px; color: rgba(255,255,255,0.8); max-width: 400px; line-height: 1.6; margin-bottom: 30px;">
                    ${message || 'Tu membresía no está activa. Actívala desde tu panel para acceder a tu sala de clases.'}
                </p>
                <div style="display: flex; gap: 15px; flex-wrap: wrap; justify-content: center;">
                    <a href="/dashboard.html" style="
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                        padding: 14px 28px;
                        background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                        color: white;
                        text-decoration: none;
                        border-radius: 10px;
                        font-weight: 700;
                        font-size: 14px;
                        box-shadow: 0 4px 15px rgba(99,102,241,0.4);
                        transition: all 0.3s;
                    " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                        💳 Activar Membresía
                    </a>
                    <a href="/dashboard.html" style="
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                        padding: 14px 28px;
                        background: transparent;
                        color: white;
                        text-decoration: none;
                        border-radius: 10px;
                        font-weight: 600;
                        font-size: 14px;
                        border: 2px solid rgba(255,255,255,0.3);
                        transition: all 0.3s;
                    " onmouseover="this.style.borderColor='rgba(255,255,255,0.6)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.3)'">
                        ← Volver al Panel
                    </a>
                </div>
            </div>
        `;
    }

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
        const savedRoom = localStorage.getItem('pianolink-last-room');
        const roomCode = savedRoom || pianoUser.roomCode;
        
        if (roomCode && socketManager.socket.connected) {
            console.log(`[Main] 🔄 Re-uniéndose a sala después de reconexión: ${roomCode}`);
            // Usar los parámetros correctos de joinRoom: (code, name, role)
            socketManager.joinRoom(
                roomCode,
                pianoUser.username || pianoUser.name || 'Usuario',
                pianoUser.role || 'student'
            );
            
            // Notificar UI que volvimos a la sala
            bus.emit('room-rejoined', roomCode);
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
            overlay.classList.add('active');
        } else {
            overlay.classList.remove('active');
        }
    }
    
    window.addEventListener('resize', handleResize);
    handleResize(); // Ejecutar al inicio
    
    console.log('[SidebarManager] ✅ Inicializado');
}

// ============================================
// ⚡ SPRINT FINAL P3: PRE-FLIGHT CHECK SYSTEM
// ============================================

/**
 * Sistema de Verificación de Dispositivos Pre-Vuelo
 * Verifica MIDI, Audio y Video antes de entrar a la sala
 */
function initPreFlightCheck() {
    const modal = document.getElementById('preFlightModal');
    const btnEnter = document.getElementById('btnEnterRoom');
    const btnSkip = document.getElementById('btnSkipPreflight');
    
    // Null-check: Si elementos críticos no existen, abortar silenciosamente
    if (!modal || !btnEnter || !btnSkip) {
        console.warn('[PreFlightCheck] Elementos DOM no encontrados. Funcionalidad deshabilitada.');
        return;
    }
    
    // Estados de verificación
    const checks = {
        midi: { passed: false, optional: true },
        audio: { passed: false, optional: true },
        video: { passed: false, optional: true }
    };
    
    let audioStream = null;
    let videoStream = null;
    
    /**
     * Actualiza el indicador visual de un check
     */
    function updateCheckStatus(type, status, message) {
        const item = document.querySelector(`.preflight-item:has(#${type}Indicator)`);
        const indicator = document.getElementById(`${type}Indicator`);
        const statusText = document.getElementById(`${type}Status`);
        
        if (!item || !indicator || !statusText) return;
        
        // Remover clases anteriores
        item.classList.remove('success', 'warning', 'error');
        
        // Aplicar nuevo estado
        if (status === 'success') {
            item.classList.add('success');
            indicator.textContent = '✅';
            checks[type].passed = true;
        } else if (status === 'warning') {
            item.classList.add('warning');
            indicator.textContent = '⚠️';
        } else if (status === 'error') {
            item.classList.add('error');
            indicator.textContent = '❌';
        } else {
            indicator.textContent = '⏳';
        }
        
        statusText.textContent = message;
        
        // Actualizar botón de entrada
        updateEnterButton();
    }
    
    /**
     * Actualiza estado del botón de entrada
     */
    function updateEnterButton() {
        const anyPassed = checks.midi.passed || checks.audio.passed || checks.video.passed;
        
        if (anyPassed) {
            btnEnter.disabled = false;
            btnEnter.textContent = '🚀 Entrar a la Sala';
        } else {
            btnEnter.disabled = false; // Permitir entrar de todos modos
            btnEnter.textContent = '⚠️ Entrar Sin Dispositivos';
        }
    }
    
    /**
     * Verifica dispositivos MIDI
     */
    async function checkMIDI() {
        updateCheckStatus('midi', 'loading', 'Buscando pianos...');
        
        if (!navigator.requestMIDIAccess) {
            updateCheckStatus('midi', 'error', 'WebMIDI no soportado en este navegador');
            return;
        }
        
        try {
            const access = await navigator.requestMIDIAccess();
            const inputs = Array.from(access.inputs.values());
            
            if (inputs.length > 0) {
                const deviceName = inputs[0].name || 'Dispositivo MIDI';
                updateCheckStatus('midi', 'success', `Conectado: ${deviceName}`);
            } else {
                updateCheckStatus('midi', 'warning', 'No se detectó ningún piano MIDI');
            }
        } catch (error) {
            console.error('[PreFlight] Error MIDI:', error);
            updateCheckStatus('midi', 'error', 'Error al acceder a MIDI');
        }
    }
    
    /**
     * Verifica micrófono con nivel de audio visual
     */
    async function checkAudio() {
        updateCheckStatus('audio', 'loading', 'Solicitando permisos...');
        
        // Null-check: navigator.mediaDevices puede no estar disponible (HTTP no seguro)
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn('[PreFlight] getUserMedia no disponible (requiere HTTPS)');
            updateCheckStatus('audio', 'warning', 'Requiere conexión segura (HTTPS)');
            return;
        }
        
        try {
            audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Crear analizador de audio para mostrar nivel
            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(audioStream);
            const analyzer = audioContext.createAnalyser();
            analyzer.fftSize = 256;
            source.connect(analyzer);
            
            const dataArray = new Uint8Array(analyzer.frequencyBinCount);
            const levelFill = document.getElementById('audioLevelFill');
            
            // Función para animar nivel de audio
            function updateLevel() {
                if (!modal.classList.contains('visible')) {
                    return; // Detener si el modal se cerró
                }
                
                analyzer.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                const percentage = Math.min((average / 128) * 100, 100);
                
                if (levelFill) {
                    levelFill.style.width = `${percentage}%`;
                }
                
                requestAnimationFrame(updateLevel);
            }
            
            updateLevel();
            updateCheckStatus('audio', 'success', 'Micrófono funcionando correctamente');
        } catch (error) {
            console.error('[PreFlight] Error Audio:', error);
            if (error.name === 'NotAllowedError') {
                updateCheckStatus('audio', 'error', 'Permisos de micrófono denegados');
            } else {
                updateCheckStatus('audio', 'error', 'No se detectó micrófono');
            }
        }
    }
    
    /**
     * Verifica cámara con preview
     */
    async function checkVideo() {
        updateCheckStatus('video', 'loading', 'Solicitando permisos...');
        
        // Null-check: navigator.mediaDevices puede no estar disponible (HTTP no seguro)
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn('[PreFlight] getUserMedia no disponible (requiere HTTPS)');
            updateCheckStatus('video', 'warning', 'Requiere conexión segura (HTTPS)');
            return;
        }
        
        try {
            videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
            
            const videoPreview = document.getElementById('videoPreview');
            const previewVideo = document.getElementById('previewVideo');
            
            if (previewVideo && videoPreview) {
                previewVideo.srcObject = videoStream;
                videoPreview.classList.add('active');
            }
            
            updateCheckStatus('video', 'success', 'Cámara funcionando correctamente');
        } catch (error) {
            console.error('[PreFlight] Error Video:', error);
            if (error.name === 'NotAllowedError') {
                updateCheckStatus('video', 'error', 'Permisos de cámara denegados');
            } else {
                updateCheckStatus('video', 'error', 'No se detectó cámara');
            }
        }
    }
    
    /**
     * Ejecuta todas las verificaciones
     */
    async function runAllChecks() {
        try {
            await Promise.all([
                checkMIDI().catch(err => console.warn('[PreFlight] Error en checkMIDI:', err)),
                checkAudio().catch(err => console.warn('[PreFlight] Error en checkAudio:', err)),
                checkVideo().catch(err => console.warn('[PreFlight] Error en checkVideo:', err))
            ]);
        } catch (error) {
            console.warn('[PreFlight] Error ejecutando checks:', error);
        }
    }
    
    /**
     * Limpia recursos al cerrar
     */
    function cleanup() {
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
        }
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
    }
    
    /**
     * Cierra el modal y entra a la sala
     */
    function enterRoom() {
        cleanup();
        modal.classList.remove('visible');
        modal.classList.add('hidden');
        console.log('✅ [PreFlight] Entrada confirmada');
    }
    
    // Event listeners
    btnEnter.addEventListener('click', enterRoom);
    btnSkip.addEventListener('click', enterRoom);
    
    // Mostrar modal automáticamente después de 1s
    setTimeout(() => {
        modal.classList.remove('hidden');
        modal.classList.add('visible');
        runAllChecks();
    }, 1000);
    
    console.log('✅ [Main] PreFlightCheck inicializado');
}

// ============================================
// ⚡ SPRINT FINAL P3: HEALTH INDICATORS
// ============================================

/**
 * Inicializa indicadores de salud en el header
 */
function initHealthIndicators() {
    const latencyValue = document.getElementById('latencyValue');
    const latencyIcon = document.getElementById('latencyIcon');
    const midiHealthStatus = document.getElementById('midiHealthStatus');
    const midiHealthIcon = document.getElementById('midiHealthIcon');
    
    // Null-check: Si elementos críticos no existen, abortar silenciosamente
    if (!latencyValue || !midiHealthIcon || !midiHealthStatus) {
        console.warn('[HealthIndicators] Elementos DOM no encontrados. Funcionalidad deshabilitada.');
        return;
    }
    
    // Listener para actualizar latencia
    bus.on('net-latency', (rtt) => {
        if (!latencyValue) return;
        
        latencyValue.textContent = `${rtt}ms`;
        
        // Cambiar color según latencia
        latencyValue.classList.remove('good', 'fair', 'poor');
        if (rtt < 100) {
            latencyValue.classList.add('good');
            latencyIcon.textContent = '📶';
        } else if (rtt < 300) {
            latencyValue.classList.add('fair');
            latencyIcon.textContent = '📡';
        } else {
            latencyValue.classList.add('poor');
            latencyIcon.textContent = '⚠️';
        }
    });
    
    // Listener para actividad MIDI
    bus.on('local-note', (data) => {
        if (!midiHealthStatus) return;
        
        // Activar indicador temporalmente
        midiHealthStatus.classList.add('active');
        midiHealthStatus.classList.remove('inactive');
        
        // Desactivar después de 2s de inactividad
        clearTimeout(window._midiHealthTimeout);
        window._midiHealthTimeout = setTimeout(() => {
            midiHealthStatus.classList.remove('active');
            midiHealthStatus.classList.add('inactive');
        }, 2000);
    });
    
    // Estado inicial
    if (midiHealthStatus) {
        midiHealthStatus.classList.add('inactive');
    }
    
    console.log('✅ [Main] Health Indicators inicializados');
}

/**
 * Inicializa el sistema de sidebar colapsable
 */
function initSidebarToggle_OLD() {
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
    
    // ⚡ FIX STACCATO: Detectar correctamente NoteOn vs NoteOff
    const isNoteOn = (s >= 144 && s <= 159) && d2 > 0;
    const isNoteOff = (s >= 128 && s <= 143) || ((s >= 144 && s <= 159) && d2 === 0);
    
    if (isNoteOn) {
        ui.highlightKey(d1, d2);
        whiteboard.handleNote(d1, d2);
    } else if (isNoteOff) {
        // NoteOff SIEMPRE pasa velocity 0 para forzar apagado visual
        ui.highlightKey(d1, 0);
        whiteboard.handleNote(d1, 0);
    } else if (s >= 176 && s <= 191 && d1 === 64) {
        ui.handlePedal(d2); 
    }
}

