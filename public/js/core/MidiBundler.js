/**
 * /public/js/core/MidiBundler.js
 * HIGH-PRIORITY MIDI STREAM - Sistema de Agrupación Inteligente
 * 
 * Características:
 * - Micro-buffer de 15ms para agrupar mensajes
 * - Filtrado de Control Change redundantes
 * - Timestamping de precisión con performance.now()
 * - Priorización de Note On/Off sobre CC
 */

export class MidiBundler {
    constructor(sendCallback) {
        this.sendCallback = sendCallback; // Función para enviar al servidor
        
        // === MICRO-BUFFER CONFIG (OPTIMIZADO PARA RENDER FREE) ===
        // 16ms = 60fps (balanceado entre latencia y eficiencia de red)
        this.BUNDLE_INTERVAL_MS = 16; // Aumentado de 10ms a 16ms
        this.bundleTimer = null;
        this.messageQueue = [];
        
        // === 🔒 MUTEX ANTI-RACE CONDITION ===
        this._isFlushing = false;      // Lock para flush atómico
        
        // === FILTRADO DE CC REDUNDANTES ===
        this.lastCCValues = new Map(); // key: "channel-cc", value: {value, timestamp}
        this.CC_THROTTLE_MS = 25;      // Aumentado de 20ms a 25ms
        this.CC_VALUE_THRESHOLD = 3;   // Aumentado de 2 a 3 (menos sensible)
        
        // === NUEVO: RATE LIMIT PARA RÁFAGAS ===
        this._lastFlushTime = 0;
        this.MIN_FLUSH_INTERVAL_MS = 8; // Mínimo 8ms entre envíos (125 paquetes/seg máx)
        
        // === ESTADÍSTICAS (para debugging) ===
        this.stats = {
            messagesSent: 0,
            messagesFiltered: 0,
            bundlesSent: 0,
            avgBundleSize: 0,
            raceConditionsPrevented: 0,  // Contador de races evitadas
            rateLimited: 0               // Contador de rate limits
        };
        
        console.log('[MidiBundler] ⚡ High-Priority MIDI Stream (Optimizado para red limitada)');
        console.log(`  - Bundle interval: ${this.BUNDLE_INTERVAL_MS}ms`);
        console.log(`  - Min flush interval: ${this.MIN_FLUSH_INTERVAL_MS}ms`);
        console.log(`  - CC throttle: ${this.CC_THROTTLE_MS}ms`);
    }
    
    /**
     * Añade un mensaje MIDI al bundle
     * @param {number} status - Byte de estado MIDI
     * @param {number} data1 - Primer data byte
     * @param {number} data2 - Segundo data byte
     */
    addMessage(status, data1, data2) {
        const now = performance.now();
        
        // === IDENTIFICAR TIPO DE MENSAJE ===
        const messageType = this._getMessageType(status);
        
        // === FILTRADO DE CC REDUNDANTES ===
        if (messageType === 'CC') {
            if (this._shouldFilterCC(status, data1, data2, now)) {
                this.stats.messagesFiltered++;
                console.debug(`[MidiBundler] CC filtrado: CC${data1} = ${data2} (redundante)`);
                return; // NO agregar al bundle
            }
        }
        
        // === PRIORIZACIÓN: Note On/Off Y SUSTAIN PEDAL ===
        // Pedal sustain (CC 64) tiene prioridad alta para evitar delays
        const isSustainPedal = (messageType === 'CC' && data1 === 64);
        const priority = (messageType === 'NoteOn' || messageType === 'NoteOff' || isSustainPedal) ? 'high' : 'low';
        
        // === AGREGAR A COLA CON TIMESTAMP ===
        this.messageQueue.push({
            status,
            data1,
            data2,
            timestamp: now,
            priority,
            type: messageType
        });
        
        // === ENVÍO CON RATE LIMIT (ANTI-RÁFAGAS) ===
        const timeSinceLastFlush = now - this._lastFlushTime;
        
        if (priority === 'high') {
            // Notas y pedal tienen prioridad pero respetan rate limit mínimo
            if (timeSinceLastFlush >= this.MIN_FLUSH_INTERVAL_MS) {
                this._flushBundle();
            } else {
                // Programar flush para cuando pase el rate limit
                this.stats.rateLimited++;
                if (!this.bundleTimer) {
                    const delay = this.MIN_FLUSH_INTERVAL_MS - timeSinceLastFlush;
                    this.bundleTimer = setTimeout(() => {
                        this._flushBundle();
                    }, Math.max(1, delay));
                }
            }
        } else {
            // === PROGRAMAR ENVÍO AGRUPADO PARA CC/OTROS ===
            if (!this.bundleTimer) {
                this.bundleTimer = setTimeout(() => {
                    this._flushBundle();
                }, this.BUNDLE_INTERVAL_MS);
            }
        }
    }
    
    /**
     * Filtra Control Change redundantes
     * @private
     */
    _shouldFilterCC(status, cc, value, now) {
        const channel = status & 0x0F;
        const key = `${channel}-${cc}`;
        
        const lastCC = this.lastCCValues.get(key);
        
        // === EXCEPCIÓN PRIORITARIA: PEDAL DE SUSTAIN (CC 64) ===
        // SIEMPRE enviar cambios de estado del pedal (On/Off) sin throttling
        if (cc === 64) {
            // Si no hay valor previo, enviar
            if (!lastCC) {
                this.lastCCValues.set(key, { value, timestamp: now });
                return false; // NO filtrar
            }
            
            // Detectar cambio de estado: Off→On o On→Off
            const wasPedalDown = lastCC.value >= 64;
            const isPedalDown = value >= 64;
            
            if (wasPedalDown !== isPedalDown) {
                // CAMBIO DE ESTADO: Enviar inmediatamente
                this.lastCCValues.set(key, { value, timestamp: now });
                return false; // NO filtrar
            }
            
            // Si no cambió de estado pero el valor cambió ligeramente, ignorar
            const delta = Math.abs(value - lastCC.value);
            if (delta < this.CC_VALUE_THRESHOLD) {
                return true; // FILTRAR (misma posición del pedal)
            }
            
            // Cambio significativo sin cambio de estado (ej: 127→100)
            this.lastCCValues.set(key, { value, timestamp: now });
            return false;
        }
        
        if (!lastCC) {
            // Primera vez que vemos este CC
            this.lastCCValues.set(key, { value, timestamp: now });
            return false; // NO filtrar
        }
        
        // === FILTRO 1: TIEMPO (Throttling) ===
        const timeSinceLastSend = now - lastCC.timestamp;
        if (timeSinceLastSend < this.CC_THROTTLE_MS) {
            // Muy pronto, verificar si el cambio es significativo
            const valueDelta = Math.abs(value - lastCC.value);
            
            if (valueDelta < this.CC_VALUE_THRESHOLD) {
                return true; // FILTRAR (cambio insignificante)
            }
        }
        
        // Actualizar último valor
        this.lastCCValues.set(key, { value, timestamp: now });
        return false; // NO filtrar
    }
    
    /**
     * Envía el bundle acumulado (CON MUTEX ANTI-RACE)
     * @private
     */
    _flushBundle() {
        // === 🔒 MUTEX: Evitar doble flush ===
        if (this._isFlushing) {
            this.stats.raceConditionsPrevented++;
            console.debug('[MidiBundler] ⚠️ Race condition prevenida (flush en progreso)');
            return;
        }
        
        if (this.messageQueue.length === 0) return;
        
        // Adquirir lock
        this._isFlushing = true;
        
        try {
            // Cancelar timer si existe
            if (this.bundleTimer) {
                clearTimeout(this.bundleTimer);
                this.bundleTimer = null;
            }
            
            // === ORDENAR POR PRIORIDAD (High primero) ===
            this.messageQueue.sort((a, b) => {
                if (a.priority === 'high' && b.priority === 'low') return -1;
                if (a.priority === 'low' && b.priority === 'high') return 1;
                return 0; // Mantener orden temporal si misma prioridad
            });
            
            // === ENVIAR BUNDLE ===
            const bundle = this.messageQueue.slice(); // Copia
            this.sendCallback(bundle);
            
            // === REGISTRAR TIEMPO DE FLUSH (para rate limit) ===
            this._lastFlushTime = performance.now();
            
            // === ESTADÍSTICAS ===
            this.stats.bundlesSent++;
            this.stats.messagesSent += bundle.length;
            this.stats.avgBundleSize = this.stats.messagesSent / this.stats.bundlesSent;
            
            // Limpiar cola
            this.messageQueue = [];
            
            console.debug(`[MidiBundler] Bundle enviado: ${bundle.length} mensajes`);
        } finally {
            // Liberar lock SIEMPRE
            this._isFlushing = false;
        }
    }
    
    /**
     * Identifica el tipo de mensaje MIDI
     * @private
     */
    _getMessageType(status) {
        const command = status & 0xF0;
        
        switch (command) {
            case 0x80: return 'NoteOff';
            case 0x90: return 'NoteOn';
            case 0xB0: return 'CC';
            case 0xC0: return 'ProgramChange';
            case 0xD0: return 'AfterTouch';
            case 0xE0: return 'PitchBend';
            default: return 'Other';
        }
    }
    
    /**
     * Obtiene estadísticas del bundler
     */
    getStats() {
        return {
            ...this.stats,
            queueLength: this.messageQueue.length,
            ccCacheSize: this.lastCCValues.size
        };
    }
    
    /**
     * Limpieza de recursos
     */
    dispose() {
        if (this.bundleTimer) {
            clearTimeout(this.bundleTimer);
            this.bundleTimer = null;
        }
        
        this._flushBundle(); // Enviar mensajes pendientes
        this.messageQueue = [];
        this.lastCCValues.clear();
        
        console.log('[MidiBundler] ✅ Recursos liberados');
    }
}
