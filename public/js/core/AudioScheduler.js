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
        
        // --- STATE MANAGER (NUEVA ARQUITECTURA) ---
        this.stateManager = new MidiStateManager();
        
        // --- FASE 4: OUTPUT MANAGER ---
        this.outputManager = null; // Inyectado desde AudioEngine
        
        // --- JITTER BUFFER CONFIG ---
        // Reducido de 300ms a 150ms después de implementar state management
        this.BUFFER_MS = 150; 
        this.syncOffset = 0;   // Diferencia entre reloj remoto y local
        this.isSynced = false; // ¿Ya sincronizamos la primera nota?
        
        // --- LIFECYCLE ---
        this._isDestroyed = false;
    }

    async init() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        // Resume necesario por políticas de navegadores
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        
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
            if (!this.isSynced) {
                this.syncOffset = (this.ctx.currentTime * 1000) - timestamp;
                this.isSynced = true;
            }

            const targetTimeMs = timestamp + this.syncOffset + this.BUFFER_MS;
            scheduledTime = targetTimeMs / 1000;

            // --- CORRECCIÓN DE DERIVA ---
            if (Math.abs(scheduledTime - this.ctx.currentTime) > 1.5) {
                this.isSynced = false; 
            }

            if (scheduledTime < this.ctx.currentTime) {
                scheduledTime = this.ctx.currentTime;
            }
        }

        // Guardar el tiempo programado para uso en callbacks
        this._scheduledTime = scheduledTime;

        // 2. PASAR AL STATE MANAGER (NUEVA ARQUITECTURA)
        // El state manager decide si esta nota debe procesarse o ignorarse
        const isNoteOn = (status >= 144 && status <= 159) && data2 > 0;
        const isNoteOff = (status >= 128 && status <= 143) || (status >= 144 && data2 === 0);

        if (isNoteOn) {
            this.stateManager.handleNoteOn(data1, data2, 'REMOTE');
        } else if (isNoteOff) {
            this.stateManager.handleNoteOff(data1, 'REMOTE');
        }
    }

    _noteOn(note, velocity, time) {
        this._noteOff(note, time); // Matar voz anterior

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        // Fórmula de frecuencia MIDI
        osc.frequency.value = 440 * Math.pow(2, (note - 69) / 12);
        
        const vol = velocity / 127;
        
        // Usamos 'time' (futuro) en lugar de 'currentTime' (ahora)
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(vol * 0.2, time + 0.01); // Ataque rápido
        gain.gain.linearRampToValueAtTime(vol * 0.1, time + 0.5);  // Sustain suave

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(time); // <--- AQUÍ ESTÁ LA MAGIA DE LA FLUIDEZ
        
        this.activeVoices.set(note, { osc, gain });
    }

    _noteOff(note, time) {
        const voice = this.activeVoices.get(note);
        if (voice) {
            // Release suave para evitar "click"
            voice.gain.gain.cancelScheduledValues(time);
            voice.gain.gain.setValueAtTime(voice.gain.gain.value, time);
            voice.gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
            
            voice.osc.stop(time + 0.15);
            this.activeVoices.delete(note);
        }
    }

    /**
     * Callbacks del State Manager (CON OUTPUT MANAGER - FASE 4)
     */
    _handleStateNoteOn(noteId, velocity, source) {
        const time = this._scheduledTime || this.ctx.currentTime;
        
        // Ejecutar síntesis web
        this._noteOn(noteId, velocity, time);
        
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
        
        // Ejecutar síntesis web
        this._noteOff(noteId, time);
        
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
    stopAll() {
        console.log('🔇 PÁNICO: Liberando todas las notas...');
        
        // Usar el state manager para liberar
        this.stateManager.releaseAll('PANIC');
        
        // Limpieza manual del sintetizador web por si acaso
        this.activeVoices.forEach((voice) => {
            try {
                voice.gain.gain.cancelScheduledValues(this.ctx.currentTime);
                voice.gain.gain.setValueAtTime(0, this.ctx.currentTime);
                voice.osc.stop();
            } catch(e) {}
        });
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