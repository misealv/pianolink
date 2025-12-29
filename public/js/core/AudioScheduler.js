/**
 * Core Engine: Programador de Audio (CON JITTER BUFFER Y STATE MANAGER)
 * Maneja osciladores web y salidas MIDI físicas con corrección de tiempo.
 * Ahora incluye gestión de estado para prevenir notas pegadas.
 */
import { MidiStateManager } from './MidiStateManager.js';

export class AudioScheduler {
    constructor() {
        this.ctx = null;
        this.midiOutput = null; // DEPRECATED: Reemplazado por outputManager (Fase 4)
        this.activeVoices = new Map(); // Polifonía: { nota: {osc, gain} }
        this.masterGain = null; // Master gain para silenciar tonos web cuando video activo
        
        // --- STATE MANAGER (NUEVA ARQUITECTURA) ---
        this.stateManager = new MidiStateManager();
        
        // --- FASE 4: OUTPUT MANAGER ---
        this.outputManager = null; // Inyectado desde AudioEngine
        
        // --- JITTER BUFFER CONFIG ---
        // 80ms balanceo entre latencia y precisión rítmica
        this.BUFFER_MS = 80; 
        this.syncOffset = 0;   // Diferencia entre reloj remoto y local
        this.isSynced = false; // ¿Ya sincronizamos la primera nota?
        this.lastSyncTime = 0; // Para re-sincronización periódica
        
        // --- LIFECYCLE ---
        this._isDestroyed = false;
    }

    async init() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        
        // Crear AudioContext
        this.ctx = new AudioContext();
        
        // Crear Master Gain (DESCONECTADO - no queremos tonos web)
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.0; // SIEMPRE en 0 - sin tonos web
        // NO conectar a destination - los osciladores no deben escucharse NUNCA
        // this.masterGain.connect(this.ctx.destination); // ← COMENTADO
        
        console.log('[AudioScheduler] ⚠️ OSCILADORES WEB DESHABILITADOS - Solo MIDI físico');
        
        // Resume necesario por políticas de navegadores
        if (this.ctx.state === 'suspended') {
            console.warn('[AudioScheduler] ⚠️ AudioContext suspended - se reanudará con primer click/tecla');
            // NO lanzamos error, simplemente avisamos
            // El contexto se reanudará automáticamente con el primer evento de usuario
        }
        
        console.log('[AudioScheduler] AudioContext creado. Estado:', this.ctx.state);
        
        // --- INICIAR STATE MANAGER Y CONECTAR CALLBACKS ---
        this.stateManager.onNoteOn = (noteId, velocity, source) => {
            this._handleStateNoteOn(noteId, velocity, source);
        };
        this.stateManager.onNoteOff = (noteId, source) => {
            this._handleStateNoteOff(noteId, source);
        };
        this.stateManager.onStateChange = (activeCount) => {
            // Útil para debugging o métricas UI
            if (activeCount === 0) {
                console.debug('[AudioScheduler] Todas las notas liberadas.');
            }
        };
        
        this.stateManager.start();
        console.log(`🔊 Motor Audio V4: Buffer ${this.BUFFER_MS}ms + State Management activo.`);
    }

    setMidiOutput(device) {
        this.midiOutput = device;
        console.log(`🎹 Salida Física asignada: ${device.name}`);
    }
    
    /**
     * FASE 4: Inyecta el OutputManager desde AudioEngine
     */
    setOutputManager(outputManager) {
        this.outputManager = outputManager;
        console.log('[AudioScheduler] MidiOutputManager conectado.');
    }
    
    /**
     * ZERO LATENCY EXPERIENCE: Controla volumen master de tonos web
     * DESHABILITADO - PianoLink usa solo MIDI físico
     * @param {number} volume - 0.0 (silencio) a 1.0 (normal)
     */
    setMasterVolume(volume) {
        // NOTA: Este método está deshabilitado porque PianoLink no usa osciladores web
        // Solo MIDI físico se transmite y reproduce en los pianos digitales
        console.log('[AudioScheduler] ℹ️ setMasterVolume ignorado (solo MIDI físico activo)');
    }

    /**
     * Toca una nota respetando su tiempo original (Anti-Ráfagas)
     * AHORA CON STATE MANAGEMENT para prevenir notas pegadas
     * @param {Object} event - { status, data1, data2, timestamp } 
     */
    play(event) {
        if (!this.ctx) return;

        const { status, data1, data2, timestamp } = event;

        // 1. CALCULAR TIEMPO EXACTO (Jitter Correction)
        let scheduledTime = this.ctx.currentTime;

        if (timestamp) {
            const now = this.ctx.currentTime * 1000;
            
            // Re-sincronizar cada 5 segundos para compensar deriva de reloj
            if (!this.isSynced || (now - this.lastSyncTime) > 5000) {
                this.syncOffset = (this.ctx.currentTime * 1000) - timestamp;
                this.isSynced = true;
                this.lastSyncTime = now;
            }

            // Calcular tiempo objetivo respetando el timestamp original
            const targetTimeMs = timestamp + this.syncOffset + this.BUFFER_MS;
            scheduledTime = targetTimeMs / 1000;

            // --- CORRECCIÓN DE DERIVA (más tolerante) ---
            const drift = scheduledTime - this.ctx.currentTime;
            if (Math.abs(drift) > 2.0) {
                // Deriva grande: re-sincronizar
                this.isSynced = false;
                scheduledTime = this.ctx.currentTime + (this.BUFFER_MS / 1000);
            } else if (scheduledTime < this.ctx.currentTime) {
                // Tiempo pasado: tocar inmediatamente
                scheduledTime = this.ctx.currentTime;
            }
        }

        // Guardar el tiempo programado para uso en callbacks
        this._scheduledTime = scheduledTime;

        // 2. PROCESAR SEGÚN TIPO DE MENSAJE
        const isNoteOn = (status >= 144 && status <= 159) && data2 > 0;
        const isNoteOff = (status >= 128 && status <= 143) || (status >= 144 && data2 === 0);
        const isCC = (status >= 176 && status <= 191); // Control Change

        if (isNoteOn) {
            // NOTAS: Pasar al state manager
            this.stateManager.handleNoteOn(data1, data2, 'REMOTE');
        } else if (isNoteOff) {
            // NOTAS OFF: Pasar al state manager
            this.stateManager.handleNoteOff(data1, 'REMOTE');
        } else if (isCC) {
            // CONTROL CHANGE: Enviar directamente al hardware (pedal, volumen, etc.)
            
            if (this.outputManager) {
                this.outputManager.send(status, data1, data2, 'REMOTE');
            } else if (this.midiOutput) {
                try {
                    const delay = Math.max(0, (scheduledTime - this.ctx.currentTime) * 1000);
                    this.midiOutput.send([status, data1, data2], window.performance.now() + delay);
                } catch (e) {
                    console.warn('[AudioScheduler] Error enviando CC a hardware:', e);
                }
            }
        }
    }

    /**
     * OSCILADORES WEB DESHABILITADOS PERMANENTEMENTE
     * PianoLink usa transmisión MIDI pura sin síntesis web
     */
    _noteOn(note, velocity, time) {
        // MÉTODO DESHABILITADO - NO CREAR OSCILADORES
        // Solo MIDI físico se reproduce en los instrumentos
        return;
    }

    /**
     * OSCILADORES WEB DESHABILITADOS PERMANENTEMENTE
     */
    _noteOff(note, time) {
        // MÉTODO DESHABILITADO - NO HAY OSCILADORES QUE DETENER
        return;
    }

    /**
     * Callbacks del State Manager (CON OUTPUT MANAGER - FASE 4)
     */
    _handleStateNoteOn(noteId, velocity, source) {
        const time = this._scheduledTime || this.ctx.currentTime;
        
        // === OSCILADORES WEB DESHABILITADOS ===
        // PianoLink usa transmisión MIDI pura.
        // Cada usuario escucha su piano físico directamente (latencia 0ms).
        // NO se generan tonos web sintéticos.
        
        // --- FASE 4: ENVIAR A HARDWARE CON SOURCE TAGGING ---
        if (this.outputManager) {
            const status = 144; // NoteOn en canal 1
            this.outputManager.send(status, noteId, velocity, source);
        } else if (this.midiOutput) {
            // Fallback al sistema antiguo (DEPRECATED)
            try {
                const status = 144;
                const delay = Math.max(0, (time - this.ctx.currentTime) * 1000);
                this.midiOutput.send([status, noteId, velocity], window.performance.now() + delay);
            } catch (e) { 
                console.warn('[AudioScheduler] Error enviando NoteOn a hardware:', e); 
            }
        }
    }

    _handleStateNoteOff(noteId, source) {
        const time = this._scheduledTime || this.ctx.currentTime;
        
        // === OSCILADORES WEB DESHABILITADOS ===
        // Solo MIDI físico, sin síntesis web
        
        // --- FASE 4: ENVIAR A HARDWARE CON SOURCE TAGGING ---
        if (this.outputManager) {
            const status = 128; // NoteOff en canal 1
            this.outputManager.send(status, noteId, 0, source);
        } else if (this.midiOutput) {
            // Fallback al sistema antiguo (DEPRECATED)
            try {
                const status = 128;
                const delay = Math.max(0, (time - this.ctx.currentTime) * 1000);
                this.midiOutput.send([status, noteId, 0], window.performance.now() + delay);
            } catch (e) { 
                console.warn('[AudioScheduler] Error enviando NoteOff a hardware:', e); 
            }
        }
    }

    /**
     * Pánico: Apagar todas las notas (MEJORADO CON STATE MANAGER)
     */
    /**
     * PÁNICO: Detener todas las notas activas
     * NOTA: Solo limpia el state manager, no hay osciladores que detener
     */
    stopAll() {
        console.log('🔇 PÁNICO: Liberando todas las notas...');
        
        // Usar el state manager para liberar
        this.stateManager.releaseAll('PANIC');
        
        // NO hay osciladores web que limpiar - solo MIDI físico
        this.activeVoices.clear();
    }

    /**
     * Protocolo de reconciliación con el servidor
     * @param {Array<number>} serverNotes - Notas que el servidor reporta como activas
     */
    reconcile(serverNotes) {
        this.stateManager.reconcile(serverNotes);
    }

    /**
     * Obtener estadísticas del state manager
     */
    getStats() {
        return this.stateManager.getStats();
    }

    /**
     * Destructor: Limpieza completa (FASE 3 MEJORADO)
     */
    destroy() {
        if (this._isDestroyed) {
            console.warn('[AudioScheduler] Ya fue destruido.');
            return;
        }
        
        console.log('[AudioScheduler] Iniciando destrucción...');
        
        // 1. Destruir state manager
        if (this.stateManager) {
            this.stateManager.destroy();
            this.stateManager = null;
        }
        
        // 2. Silenciar todo
        this.stopAll();
        
        // 3. Limpiar voces activas
        this.activeVoices.clear();
        
        // 4. Cerrar AudioContext
        if (this.ctx) {
            this.ctx.close().then(() => {
                console.log('[AudioScheduler] AudioContext cerrado.');
            }).catch(e => {
                console.warn('[AudioScheduler] Error cerrando AudioContext:', e);
            });
            this.ctx = null;
        }
        
        // 5. Limpiar MIDI output
        this.midiOutput = null;
        
        this._isDestroyed = true;
        console.log('[AudioScheduler] ✅ Destruido.');
    }
}