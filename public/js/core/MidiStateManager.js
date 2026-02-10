/**
 * Core Engine: MIDI State Manager
 * Máquina de estados con reconciliación automática para prevenir notas pegadas.
 * 
 * Resuelve:
 * - Pérdida de paquetes NoteOff (auto-detección)
 * - Duplicación de mensajes (idempotencia)
 * - Desincronización por reconnect (self-healing)
 * - Bucles de retroalimentación (source tagging)
 */

export class MidiStateManager {
    constructor() {
        // --- REGISTRO DE ESTADO PRIVADO ---
        // Key: noteId (0-127), Value: { velocity, timestamp, source }
        this._activeNotes = new Map();
        
        // --- CALLBACKS DE SALIDA (DECOUPLED) ---
        this.onNoteOn = null;   // (noteId, velocity, source) => void
        this.onNoteOff = null;  // (noteId, source) => void
        this.onStateChange = null; // (activeCount) => void
        
        // --- WATCHDOG TIMER (ANTI-HANG) ---
        // Timer configurable (se actualiza vía DecayConfigManager)
        this._hangThreshold = 3000; // Default 3s
        this._watchdogInterval = null;
        
        // --- GRACE PERIOD PARA RECONCILIACIÓN ---
        // ⚡ SPRINT FINAL: Aumentar a 500ms para evitar false positives
        this.GRACE_PERIOD_MS = 500; // ⬅️ AUMENTADO de 300ms a 500ms
        
        // --- MÉTRICAS DE DIAGNÓSTICO ---
        this.stats = {
            duplicateNoteOns: 0,
            orphanedNoteOffs: 0,
            autoReleases: 0,
            reconciliations: 0,
            notesRescuedBySnapshot: 0,
            gracePeriodSaves: 0,
            snapshotsReceived: 0
        };
    }

    /**
     * Inicia el sistema de vigilancia automática
     */
    start() {
        // Ejecutar watchdog cada 2 segundos
        this._watchdogInterval = setInterval(() => this._runWatchdog(), 2000);
        
        // Health monitor cada 30 segundos
        this._healthCheckInterval = setInterval(() => this._checkHealth(), 30000);
        
        console.log('[MidiState] Watchdog iniciado. Threshold:', this._hangThreshold, 'ms');
        console.log('[MidiState] Health monitor activo.');
    }

    /**
     * Detiene el watchdog y limpia recursos
     */
    stop() {
        if (this._watchdogInterval) {
            clearInterval(this._watchdogInterval);
            this._watchdogInterval = null;
        }
        if (this._healthCheckInterval) {
            clearInterval(this._healthCheckInterval);
            this._healthCheckInterval = null;
        }
        this.releaseAll('SYSTEM');
        console.log('[MidiState] Sistema detenido.');
    }

    /**
     * Procesa un evento NoteOn con idempotencia
     * @param {number} noteId - Número MIDI de la nota (0-127)
     * @param {number} velocity - Velocidad (1-127, 0 se trata como NoteOff)
     * @param {string} source - Identificador de origen ('REMOTE', 'LOCAL', 'RECONCILE')
     */
    handleNoteOn(noteId, velocity, source = 'REMOTE') {
        // MIDI Spec: NoteOn con velocity 0 es equivalente a NoteOff
        if (velocity === 0) {
            this.handleNoteOff(noteId, source);
            return;
        }

        // --- IDEMPOTENCIA: Detectar duplicados ---
        if (this._activeNotes.has(noteId)) {
            const existing = this._activeNotes.get(noteId);
            
            // Si la nota ya está activa y viene del mismo origen con timestamp muy cercano,
            // es probablemente un duplicado (retransmisión TCP). Ignoramos.
            const timeDiff = performance.now() - existing.timestamp;
            if (timeDiff < 50 && existing.source === source) {
                this.stats.duplicateNoteOns++;
                console.warn(`[MidiState] NoteOn duplicado ignorado: Note ${noteId} (${timeDiff.toFixed(1)}ms)`);
                return;
            }
            
            // Si es un NoteOn legítimo sobre una nota que no se apagó, forzamos apagado primero
            console.warn(`[MidiState] NoteOn sobre nota activa. Reiniciando: ${noteId}`);
            this._forceNoteOff(noteId, 'CLEANUP');
        }

        // --- REGISTRAR ESTADO ---
        this._activeNotes.set(noteId, {
            velocity: velocity,
            timestamp: performance.now(),
            source: source
        });

        // --- EMITIR EVENTO DE SALIDA ---
        if (this.onNoteOn) {
            this.onNoteOn(noteId, velocity, source);
        }

        this._notifyStateChange();
    }

    /**
     * Procesa un evento NoteOff
     * @param {number} noteId 
     * @param {string} source 
     */
    handleNoteOff(noteId, source = 'REMOTE') {
        // --- DETECTAR HUÉRFANOS ---
        if (!this._activeNotes.has(noteId)) {
            this.stats.orphanedNoteOffs++;
            // No es necesariamente un error (puede ser que el NoteOn se perdió en red)
            // pero lo registramos para debugging
            console.debug(`[MidiState] NoteOff huérfano: ${noteId} (nota no estaba activa)`);
            return;
        }

        this._forceNoteOff(noteId, source);
    }

    /**
     * Apaga una nota forzadamente (interno)
     * @private
     */
    _forceNoteOff(noteId, source) {
        this._activeNotes.delete(noteId);

        if (this.onNoteOff) {
            this.onNoteOff(noteId, source);
        }

        this._notifyStateChange();
    }

    /**
     * Protocolo de Reconciliación INTELIGENTE (FASE 2 - CON GRACE PERIOD)
     * Compara el estado local con el snapshot autoritativo del servidor.
     * Implementa ventana de gracia para evitar cortes por desincronización.
     * 
     * @param {Object} snapshot - { notes: Array<number>, timestamp: number, type: string }
     */
    reconcile(snapshot) {
        if (!snapshot || !snapshot.notes) {
            console.warn('[MidiState] Snapshot inválido recibido');
            return;
        }
        
        this.stats.reconciliations++;
        this.stats.snapshotsReceived++;
        this._lastSnapshotTime = snapshot.timestamp || Date.now();
        this._snapshotReceived = true;

        const serverNotes = new Set(snapshot.notes);
        const localNotes = Array.from(this._activeNotes.keys());
        const now = performance.now();

        let orphansFound = 0;
        let graceSaves = 0;

        localNotes.forEach(noteId => {
            if (!serverNotes.has(noteId)) {
                // Esta nota está sonando localmente pero NO en el servidor
                const noteState = this._activeNotes.get(noteId);
                const noteAge = now - noteState.timestamp;
                
                // --- VENTANA DE GRACIA (GRACE PERIOD) ---
                // Si la nota llegó hace menos de 100ms, puede ser que el snapshot
                // se generó antes de que llegara el NoteOn. No la apagamos aún.
                if (noteAge < this.GRACE_PERIOD_MS) {
                    console.debug(`[MidiState] Nota ${noteId} en ventana de gracia (${noteAge.toFixed(0)}ms). No apagando.`);
                    graceSaves++;
                    this.stats.gracePeriodSaves++;
                    return;
                }
                
                // Si la nota es antigua y no está en el snapshot, es huérfana
                console.warn(`[MidiState] Reconciliación: Apagando nota huérfana ${noteId} (edad: ${noteAge.toFixed(0)}ms)`);
                this._forceNoteOff(noteId, 'RECONCILE');
                orphansFound++;
                this.stats.notesRescuedBySnapshot++;
            }
        });

        if (orphansFound > 0) {
            console.log(`[MidiState] Reconciliación: ${orphansFound} notas corregidas, ${graceSaves} salvadas por grace period.`);
        }
        
        // Full snapshot: Sincronizar notas del servidor que no tenemos localmente
        if (snapshot.type === 'full') {
            snapshot.notes.forEach(noteId => {
                if (!this._activeNotes.has(noteId)) {
                    // El servidor reporta una nota que no tenemos. Esto es raro pero posible
                    // (por ejemplo, si nos reconectamos justo cuando el profesor está tocando)
                    console.log(`[MidiState] Full snapshot: Activando nota ${noteId} desde servidor`);
                    this.handleNoteOn(noteId, 64, 'SNAPSHOT'); // Velocity default
                }
            });
        }
    }

    /**
     * Watchdog: Detecta notas que llevan demasiado tiempo activas (hang detection)
     * @private
     */
    _runWatchdog() {
        const now = performance.now();
        const staleNotes = [];

        this._activeNotes.forEach((state, noteId) => {
            const age = now - state.timestamp;
            if (age > this._hangThreshold) {
                staleNotes.push(noteId);
            }
        });

        if (staleNotes.length > 0) {
            console.error(`[MidiState] WATCHDOG: ${staleNotes.length} notas colgadas detectadas. Auto-liberando.`);
            staleNotes.forEach(noteId => {
                this.stats.autoReleases++;
                this._forceNoteOff(noteId, 'WATCHDOG');
            });
        }
    }

    /**
     * Apaga todas las notas activas (PANIC)
     * @param {string} source 
     */
    releaseAll(source = 'PANIC') {
        const activeCount = this._activeNotes.size;
        if (activeCount > 0) {
            console.log(`[MidiState] Liberando ${activeCount} notas activas. Fuente: ${source}`);
            const notes = Array.from(this._activeNotes.keys());
            notes.forEach(noteId => this._forceNoteOff(noteId, source));
        }
    }

    /**
     * Obtiene el estado actual (para debugging o UI)
     * @returns {Array<Object>} Array de { noteId, velocity, age, source }
     */
    getActiveNotes() {
        const now = performance.now();
        return Array.from(this._activeNotes.entries()).map(([noteId, state]) => ({
            noteId: noteId,
            velocity: state.velocity,
            age: (now - state.timestamp).toFixed(0),
            source: state.source
        }));
    }

    /**
     * Verifica si una nota específica está activa
     * @param {number} noteId 
     * @returns {boolean}
     */
    isNoteActive(noteId) {
        return this._activeNotes.has(noteId);
    }

    /**
     * Obtiene el número de notas activas
     * @returns {number}
     */
    getActiveCount() {
        return this._activeNotes.size;
    }

    /**
     * Notifica cambios de estado (para UI updates)
     * @private
     */
    _notifyStateChange() {
        if (this.onStateChange) {
            this.onStateChange(this._activeNotes.size);
        }
    }

    /**
     * Health check: Analiza las métricas y alerta si hay problemas
     * @private
     */
    _checkHealth() {
        const totalEvents = this.stats.duplicateNoteOns + this.stats.orphanedNoteOffs + 
                           this.stats.autoReleases + this.stats.notesRescuedBySnapshot;
        
        if (totalEvents === 0) return; // Todo perfecto
        
        const rescueRate = (this.stats.notesRescuedBySnapshot / this.stats.snapshotsReceived) * 100;
        
        // Si más del 10% de los snapshots están rescatando notas, hay problemas de red
        if (rescueRate > 10) {
            console.warn(`[MidiState Health] ⚠️ Alta tasa de rescate: ${rescueRate.toFixed(1)}% de snapshots corrigiendo notas.`);
            console.warn('[MidiState Health] Sugerencia: Aumentar jitter buffer o revisar calidad de red.');
        }
        
        // Si hay muchos auto-releases, el watchdog está trabajando mucho
        if (this.stats.autoReleases > 5) {
            console.warn(`[MidiState Health] ⚠️ Watchdog muy activo: ${this.stats.autoReleases} auto-liberaciones.`);
            console.warn('[MidiState Health] Posible pérdida de paquetes NoteOff en la red.');
        }
        
        // Log de salud normal
        if (rescueRate < 5 && this.stats.autoReleases < 3) {
            console.log('[MidiState Health] ✅ Sistema saludable:', this.getStats());
        }
    }

    /**
     * Resetea las métricas de diagnóstico
     */
    resetStats() {
        this.stats = {
            duplicateNoteOns: 0,
            orphanedNoteOffs: 0,
            autoReleases: 0,
            reconciliations: 0,
            notesRescuedBySnapshot: 0,
            gracePeriodSaves: 0,
            snapshotsReceived: 0
        };
    }

    /**
     * Devuelve las estadísticas acumuladas
     * @returns {Object}
     */
    getStats() {
        return { ...this.stats, activeNotes: this._activeNotes.size };
    }

    /**
     * Destructor: Limpieza completa de recursos (FASE 3 MEJORADO)
     */
    destroy() {
        if (this._isDestroyed) {
            console.warn('[MidiState] Ya fue destruido.');
            return;
        }
        
        console.log('[MidiState] Iniciando destrucción...');
        
        // 1. Detener watchdog y health monitor
        this.stop();
        
        // 2. Liberar todas las notas
        this.releaseAll('DESTROY');
        
        // 3. Limpiar el Map
        this._activeNotes.clear();
        
        // 4. Remover callbacks
        this.onNoteOn = null;
        this.onNoteOff = null;
        this.onStateChange = null;
        
        // 5. Resetear stats
        this.stats = null;
        
        this._isDestroyed = true;
        console.log('[MidiState] ✅ Instancia destruida.');
    }
}
