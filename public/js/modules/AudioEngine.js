/* public/js/modules/AudioEngine.js */
import { AudioScheduler } from '../core/AudioScheduler.js';
import { MidiOutputManager } from '../core/MidiOutputManager.js';

export class AudioEngine {
    constructor(eventBus) {
        this.bus = eventBus;
        this.scheduler = new AudioScheduler();
        this.midiAccess = null;
        this.soloUserId = null;
        
        // --- FASE 4: MIDI OUTPUT MANAGER ---
        this.outputManager = new MidiOutputManager();
        
        // --- FASE 3: GESTIÓN DE CICLO DE VIDA ---
        this._isDisposed = false;
        this._midiInputs = new Map(); // Tracking de listeners activos
        this._visibilityHandler = null;
        this._keepAliveInterval = null;
        this._reconnectAttempts = 0;
        this.MAX_RECONNECT_ATTEMPTS = 3;
        
        // --- WATCHDOG MIDI ---
        this._lastMidiActivity = 0; // Timestamp de última actividad MIDI
        this._midiWatchdogInterval = null; // Interval para verificar listeners
        
        // ⚡ NUEVO: FAIL-SAFE ANTI-STICKY (Sprint Final)
        this._pedalTimeout = null; // Timeout para pedal sustain
        this._silentPanicInterval = null; // Pánico en segundo plano
        this._lastChordNotes = []; // Tracking para detección de cambio de acorde
        
        // ⚡ SPRINT FINAL P2: BLOQUEO MIDI DURANTE DESCONEXIÓN
        this._midiBlocked = false; // Flag para bloquear emisión MIDI
    }

    async init() {
        if (this._isDisposed) {
            console.error('[AudioEngine] No se puede inicializar una instancia disposed.');
            return;
        }
        
        // Inicializar AudioContext
        await this.scheduler.init();
        
        // --- FASE 4: CONECTAR OUTPUT MANAGER CON SCHEDULER ---
        this.scheduler.setOutputManager(this.outputManager);
        this.outputManager.start();
        
        // --- PAGE VISIBILITY API (ANTI-SUSPENSIÓN) ---
        this._setupVisibilityHandling();
        
        // --- KEEP-ALIVE DEL AUDIOCONTEXT ---
        this._startKeepAlive();
        
        // Inicializar WebMIDI si está disponible
        if (navigator.requestMIDIAccess) {
            try {
                this.midiAccess = await navigator.requestMIDIAccess();
                this.scanDevices();
                
                // Escuchar cambios de conexión USB (HOT-PLUG INTELIGENTE)
                this.midiAccess.onstatechange = (e) => this._handleMidiStateChange(e);
                console.log("🎹 Motor MIDI: Listo y escuchando.");
            } catch (e) {
                console.warn("WebMIDI no soportado o denegado:", e);
            }
        }
        
        // ⚡ NUEVO: Iniciar pánico silencioso (cada 10s)
        this._startSilentPanic();
    }

    scanDevices() {
        if (!this.midiAccess) return;
        
        try {
            const inputs = Array.from(this.midiAccess.inputs.values());
            const outputs = Array.from(this.midiAccess.outputs.values());
            
            console.log(`[MIDI] Escaneando dispositivos: ${inputs.length} inputs, ${outputs.length} outputs`);
            
            this.updateSelects(inputs, outputs);
            
            // --- FASE 4: ACTUALIZAR OUTPUT MANAGER ---
            this.outputManager.updateAvailableOutputs(outputs);
            
            // --- HIGIENE MIDI: REMOVER LISTENERS ANTIGUOS ---
            this._midiInputs.forEach((oldListener, inputId) => {
                const input = this.midiAccess.inputs.get(inputId);
                if (input) {
                    try {
                        input.onmidimessage = null;
                    } catch (e) {
                        console.warn(`[MIDI] Error limpiando listener de ${input.name}:`, e);
                    }
                }
            });
            this._midiInputs.clear();
            
            // --- RECONECTAR LISTENERS CON INPUT GATE (ANTI-LOOP) ---
            inputs.forEach(i => {
                const handler = (msg) => {
                    const [s, d1, d2] = msg.data;
                    
                    // Ignorar Clock/SysEx (248+)
                    if (s >= 248) return;
                    
                    // --- FIREWALL: INPUT GATE (FASE 4) ---
                    // Verificar si este mensaje es un echo de lo que acabamos de enviar
                    if (this.outputManager.isEcho(s, d1, d2)) {
                        // Echo detectado, NO retransmitir
                        return;
                    }
                    
                    // Actualizar timestamp de última actividad MIDI
                    this._lastMidiActivity = performance.now();
                    
                    // Mensaje legítimo del usuario local
                    this.bus.emit('local-note', { status: s, data1: d1, data2: d2 });
                };
                
                i.onmidimessage = handler;
                this._midiInputs.set(i.id, handler);
                console.log(`[MIDI] Listener conectado a: ${i.name}`);
            });
            
            // === WATCHDOG: Detectar desconexión silenciosa del listener ===
            if (!this._midiWatchdogInterval) {
                this._midiWatchdogInterval = setInterval(() => {
                    // Si no hay actividad MIDI por 60 segundos, verificar listeners
                    const timeSinceActivity = performance.now() - (this._lastMidiActivity || 0);
                    if (timeSinceActivity > 60000) {
                        console.warn('[MIDI Watchdog] Sin actividad por 60s, verificando listeners...');
                        
                        // Verificar que los listeners aún existen
                        let listenersOk = true;
                        this._midiInputs.forEach((handler, inputId) => {
                            const input = this.midiAccess.inputs.get(inputId);
                            if (!input || !input.onmidimessage) {
                                console.error(`[MIDI Watchdog] ❌ Listener perdido en: ${inputId}`);
                                listenersOk = false;
                            }
                        });
                        
                        if (!listenersOk) {
                            console.warn('[MIDI Watchdog] 🔄 Reconectando listeners...');
                            this.scanDevices(); // Re-escanear y reconectar
                        }
                        
                        // Resetear timestamp para no spamear logs
                        this._lastMidiActivity = performance.now();
                    }
                }, 30000); // Verificar cada 30 segundos
            }
        } catch (error) {
            console.error('[MIDI] Error en scanDevices:', error);
            // Reintentar en 2 segundos
            setTimeout(() => this.scanDevices(), 2000);
        }
    }
    // Apagado de emergencia
    stopAll() {
        // Delegar al scheduler que ahora tiene el state manager integrado
        this.scheduler.stopAll();
        console.log("🔇 SILENCIO TOTAL EJECUTADO");
    }

    updateSelects(inputs, outputs) {
        const inSelect = document.getElementById('midiInputSelect');
        const outSelect = document.getElementById('midiOutputSelect');
        
        // 1. Guardar selección actual antes de borrar (Memoria)
        const savedIn = inSelect ? inSelect.value : "";
        const savedOut = outSelect ? outSelect.value : "";
        
        if(inSelect) {
            inSelect.innerHTML = '<option value="">-- Entrada MIDI --</option>';
            inputs.forEach(i => {
                // Restaurar si coincide el ID
                const isSelected = (i.id === savedIn) ? 'selected' : '';
                inSelect.innerHTML += `<option value="${i.id}" ${isSelected}>${i.name}</option>`;
            });
        }

        if(outSelect) {
            outSelect.innerHTML = '<option value="">-- Salida (Sonido) --</option>';
            outputs.forEach(o => {
                const isSelected = (o.id === savedOut) ? 'selected' : '';
                outSelect.innerHTML += `<option value="${o.id}" ${isSelected}>${o.name}</option>`;
            });
            
            // Reasignar el evento onchange
            outSelect.onchange = (e) => {
                const device = outputs.find(o => o.id === e.target.value);
                if(device) this.scheduler.setMidiOutput(device);
            };
        }
    }

    playRemote(data) {
        // Si hay modo "Solo" y no es el usuario elegido, silenciar
        if (this.soloUserId && data.userId !== this.soloUserId) return;
        
        // Pasar al Scheduler para el Jitter Buffer
        this.scheduler.play(data);
    }
    
    /**
     * Procesa un mensaje MIDI local (del propio usuario)
     * Solo para Control Change - las notas se escuchan directamente del piano
     */
    playLocal(data) {
        const { status, data1, data2 } = data;
        
        // Solo procesar Control Change (pedal, volumen, etc.)
        const isCC = (status >= 176 && status <= 191);
        if (!isCC) return;
        
        // Enviar directamente al hardware con source='LOCAL'
        if (this.outputManager) {
            this.outputManager.send(status, data1, data2, 'LOCAL');
        }
    }

    resume() {
        if (this.scheduler.ctx && this.scheduler.ctx.state === 'suspended') {
            this.scheduler.ctx.resume();
        }
    }
    
    setSoloUser(userId) {
        this.soloUserId = userId;
    }

    /**
     * Obtener estadísticas del state manager para debugging
     */
    getStats() {
        return this.scheduler.getStats();
    }

    /**
     * Protocolo de reconciliación (para usar con heartbeat del servidor)
     */
    reconcile(serverNotes) {
        this.scheduler.reconcile(serverNotes);
    }
    
    // ==================================================
    // FASE 4: API PÚBLICA PARA MIDI OUTPUT MANAGER
    // ==================================================
    
    /**
     * Obtiene la lista de dispositivos de salida MIDI disponibles
     */
    getAvailableMidiOutputs() {
        return this.outputManager.availableOutputs;
    }
    
    /**
     * Selecciona un dispositivo de salida MIDI
     * @param {string} outputId - ID del dispositivo
     */
    async selectMidiOutput(outputId) {
        return await this.outputManager.selectOutput(outputId);
    }
    
    /**
     * Obtiene información del output actual
     */
    getCurrentMidiOutput() {
        return this.outputManager.getCurrentOutputInfo();
    }
    
    /**
     * Desactiva el output actual
     */
    async deactivateMidiOutput() {
        await this.outputManager.deactivateOutput();
    }
    
    /**
     * Obtiene estadísticas del output manager
     */
    getOutputStats() {
        return this.outputManager.getStats();
    }
    
    // ==================================================
    // ⚡ SPRINT FINAL: FAIL-SAFE ANTI-STICKY
    // ==================================================
    
    // ⏳ Timers configurables (se actualizan vía DecayConfigManager)
    _silentPanicThresholdMs = 12000;
    _pedalWatchdogMs = 15000;
    
    /**
     * Pánico Silencioso: Verificar y limpiar notas zombies cada 10s
     * Se ejecuta en segundo plano sin notificar al usuario
     * @private
     */
    _startSilentPanic() {
        this._silentPanicInterval = setInterval(() => {
            const stats = this.scheduler.getStats();
            const activeCount = stats.activeNotes;
            
            // Si hay notas activas, verificar si son legítimas
            if (activeCount > 0) {
                const activeNotes = Array.from(this.scheduler.stateManager._activeNotes.entries());
                const now = performance.now();
                let zombiesFound = 0;
                
                activeNotes.forEach(([noteId, noteState]) => {
                    const age = now - noteState.timestamp;
                    
                    // Si una nota lleva más de el umbral configurado sonando, es zombie
                    if (age > this._silentPanicThresholdMs) {
                        console.warn(`🧹 [SilentPanic] Nota zombie detectada: ${noteId} (${(age/1000).toFixed(1)}s). Auto-release.`);
                        this.scheduler.stateManager.handleNoteOff(noteId, 'SILENT_PANIC');
                        zombiesFound++;
                    }
                });
                
                if (zombiesFound > 0) {
                    console.log(`✅ [SilentPanic] ${zombiesFound} zombies eliminados`);
                    // Notificar a UI para que limpie también
                    this.bus.emit('zombie-cleanup', { count: zombiesFound });
                }
            }
        }, 10000); // Cada 10 segundos
        
        console.log('🛡️ [AudioEngine] Pánico silencioso activado (cada 10s)');
    }
    
    /**
     * Watchdog para pedal sustain (CC64)
     * Fuerza release si el pedal lleva más de 15s presionado
     * @param {number} channel - Canal MIDI (0-15)
     * @param {number} value - Valor del pedal (0-127)
     */
    handlePedalSustain(channel, value) {
        // Limpiar timeout anterior
        if (this._pedalTimeout) {
            clearTimeout(this._pedalTimeout);
            this._pedalTimeout = null;
        }
        
        // Si el pedal está presionado (>64), iniciar watchdog
        if (value > 64) {
            this._pedalTimeout = setTimeout(() => {
                console.warn('⚠️ [PedalWatchdog] Pedal sustain trabado detectado. Forzando release.');
                
                // Forzar CC64 = 0 (release)
                if (this.outputManager) {
                    this.outputManager.send(176 + channel, 64, 0, 'WATCHDOG');
                }
                
                // Notificar UI
                this.bus.emit('pedal-watchdog-triggered');
            }, this._pedalWatchdogMs);
        }
    }
    
    /**
     * Bloquea o desbloquea la emisión de MIDI
     * @param {boolean} blocked - true para bloquear, false para permitir
     */
    setMidiBlocked(blocked) {
        this._midiBlocked = blocked;
        
        if (blocked) {
            console.warn('🚫 [AudioEngine] Emisión MIDI bloqueada (desconectado)');
        } else {
            console.log('✅ [AudioEngine] Emisión MIDI desbloqueada (conectado)');
        }
    }
    
    /**
     * Verifica si MIDI está bloqueado
     * @returns {boolean}
     */
    isMidiBlocked() {
        return this._midiBlocked;
    }
    
    /**
     * Detecta cambio drástico de armonía y limpia notas antiguas
     * @param {Array<number>} newNotes - Notas del nuevo acorde
     */
    detectChordChange(newNotes) {
        // Si hay más de 3 notas nuevas simultáneas, es posible cambio de acorde
        if (newNotes.length >= 3) {
            const activeNotes = Array.from(this.scheduler.stateManager._activeNotes.keys());
            const notInNewChord = activeNotes.filter(n => !newNotes.includes(n));
            
            // Si hay notas activas que NO están en el nuevo acorde, limpiarlas
            if (notInNewChord.length > 0) {
                const now = performance.now();
                
                notInNewChord.forEach(noteId => {
                    const noteState = this.scheduler.stateManager._activeNotes.get(noteId);
                    if (noteState) {
                        const age = now - noteState.timestamp;
                        
                        // Solo limpiar notas antiguas (>2s)
                        if (age > 2000) {
                            console.log(`🎵 [ChordChange] Limpiando nota obsoleta: ${noteId} (${(age/1000).toFixed(1)}s)`);
                            this.scheduler.stateManager.handleNoteOff(noteId, 'CHORD_CHANGE');
                        }
                    }
                });
            }
        }
        
        this._lastChordNotes = newNotes;
    }
    
    // ==================================================
    // FASE 3: GESTIÓN DE CICLO DE VIDA Y RECURSOS
    // ==================================================
    
    /**
     * Configura el manejo de visibilidad de página (Anti-Suspensión)
     * @private
     */
    _setupVisibilityHandling() {
        this._visibilityHandler = () => {
            if (document.hidden) {
                console.log('[AudioEngine] Página en background. Entrando en modo ahorro.');
                // No hacer nada drástico, el keep-alive mantendrá el AudioContext
            } else {
                console.log('[AudioEngine] Página visible. Reactivando AudioContext.');
                this.resume();
            }
        };
        
        document.addEventListener('visibilitychange', this._visibilityHandler);
    }
    
    /**
     * Keep-Alive del AudioContext (pulso imperceptible cada 30s)
     * @private
     */
    _startKeepAlive() {
        this._keepAliveInterval = setInterval(() => {
            if (this.scheduler.ctx && this.scheduler.ctx.state === 'suspended') {
                console.warn('[AudioEngine] AudioContext suspendido. Intentando reanudar...');
                // No podemos hacer resume() sin interacción del usuario
                // Pero registramos el evento para debugging
            } else if (this.scheduler.ctx && this.scheduler.ctx.state === 'running') {
                // KEEP-ALIVE DESHABILITADO - No necesitamos pulsos de audio
                // PianoLink usa solo MIDI físico, sin osciladores web
                console.debug('[AudioEngine] Keep-alive check (osciladores deshabilitados)');
            }
        }, 30000); // Cada 30 segundos
    }
    
    /**
     * Maneja cambios de estado de dispositivos MIDI (HOT-PLUG)
     * @private
     */
    _handleMidiStateChange(event) {
        const port = event.port;
        const state = port.state;
        const connection = port.connection;
        
        console.log(`[MIDI] Dispositivo ${port.name}: ${state} (${connection})`);
        
        if (state === 'connected') {
            // Dispositivo conectado, rescanear
            this._reconnectAttempts = 0;
            this.scanDevices();
        } else if (state === 'disconnected') {
            // Dispositivo desconectado
            console.warn(`[MIDI] Dispositivo desconectado: ${port.name}`);
            this._midiInputs.delete(port.id);
            
            // Intentar reconectar si es un input conocido
            if (this._reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
                this._reconnectAttempts++;
                setTimeout(() => this.scanDevices(), 1000);
            }
        }
    }
    
    /**
     * DISPOSE PATTERN: Limpieza completa de recursos
     */
    async dispose() {
        if (this._isDisposed) {
            console.warn('[AudioEngine] Ya fue disposed.');
            return;
        }
        
        console.log('[AudioEngine] Iniciando limpieza de recursos...');
        
        // 1. PÁNICO: Silenciar todas las notas
        this.stopAll();
        
        // 2. Limpiar Page Visibility listener
        if (this._visibilityHandler) {
            document.removeEventListener('visibilitychange', this._visibilityHandler);
            this._visibilityHandler = null;
        }
        
        // 3. Detener keep-alive
        if (this._keepAliveInterval) {
            clearInterval(this._keepAliveInterval);
            this._keepAliveInterval = null;
        }
        
        // 3.5. Detener MIDI watchdog
        if (this._midiWatchdogInterval) {
            clearInterval(this._midiWatchdogInterval);
            this._midiWatchdogInterval = null;
        }
        
        // ⚡ NUEVO: Detener pánico silencioso y watchdog de pedal
        if (this._silentPanicInterval) {
            clearInterval(this._silentPanicInterval);
            this._silentPanicInterval = null;
        }
        if (this._pedalTimeout) {
            clearTimeout(this._pedalTimeout);
            this._pedalTimeout = null;
        }
        
        // 4. Limpiar listeners MIDI
        if (this.midiAccess) {
            this._midiInputs.forEach((handler, inputId) => {
                const input = this.midiAccess.inputs.get(inputId);
                if (input) {
                    input.onmidimessage = null;
                }
            });
            this._midiInputs.clear();
            
            // Remover listener de statechange
            this.midiAccess.onstatechange = null;
            this.midiAccess = null;
        }
        
        // 5. Destruir MidiOutputManager (Fase 4)
        if (this.outputManager) {
            await this.outputManager.dispose();
            this.outputManager = null;
        }
        
        // 6. Destruir AudioScheduler (cierra AudioContext)
        if (this.scheduler) {
            this.scheduler.destroy();
        }
        
        // 7. Limpiar referencia al bus
        this.bus = null;
        
        this._isDisposed = true;
        console.log('[AudioEngine] ✅ Recursos liberados completamente.');
    }
}