/**
 * MidiOutputManager.js - Fase 4
 * Gestión segura de salida MIDI con Firewall Anti-Loop
 * 
 * Responsabilidades:
 * - Enrutamiento dinámico a dispositivos MIDI físicos
 * - Source tagging (REMOTE vs LOCAL)
 * - Input gate para prevenir echo loops
 * - Higiene de hardware (All Notes Off)
 * - Filtrado de mensajes no esenciales
 */

export class MidiOutputManager {
    constructor() {
        // --- DEVICE MANAGEMENT ---
        this.currentOutput = null;
        this.availableOutputs = [];
        
        // --- FIREWALL ANTI-LOOP ---
        this._recentlySentMessages = new Map(); // { messageKey: timestamp }
        this.ECHO_FILTER_WINDOW_MS = 50; // Ventana de filtrado de echo
        this._cleanupInterval = null;
        
        // --- STATISTICS ---
        this.stats = {
            messagesSent: 0,
            messagesFiltered: 0,
            deviceSwitches: 0,
            echoesBlocked: 0
        };
        
        // --- LIFECYCLE ---
        this._isDisposed = false;
        
        // --- CALLBACKS ---
        this.onOutputChanged = null; // (outputId, outputName) => void
        this.onError = null; // (error) => void
    }
    
    /**
     * Inicializa el manager
     */
    start() {
        // Limpiar mensajes antiguos del echo filter cada segundo
        this._cleanupInterval = setInterval(() => {
            this._cleanupEchoFilter();
        }, 1000);
        
        console.log('[MidiOutputManager] Iniciado con echo filter window:', this.ECHO_FILTER_WINDOW_MS, 'ms');
    }
    
    /**
     * Actualiza la lista de dispositivos disponibles
     * @param {Array<MIDIOutput>} outputs - Array de MIDIOutput del Web MIDI API
     */
    updateAvailableOutputs(outputs) {
        this.availableOutputs = outputs.map(output => ({
            id: output.id,
            name: output.name,
            manufacturer: output.manufacturer,
            state: output.state,
            connection: output.connection,
            device: output
        }));
        
        console.log(`[MidiOutputManager] ${outputs.length} dispositivos de salida disponibles:`,
            this.availableOutputs.map(o => o.name));
    }
    
    /**
     * Selecciona un dispositivo de salida
     * @param {string} outputId - ID del MIDIOutput
     * @returns {boolean} - true si se cambió exitosamente
     */
    async selectOutput(outputId) {
        if (this._isDisposed) {
            console.error('[MidiOutputManager] No se puede seleccionar output, está disposed.');
            return false;
        }
        
        const outputInfo = this.availableOutputs.find(o => o.id === outputId);
        
        if (!outputInfo) {
            console.error('[MidiOutputManager] Output no encontrado:', outputId);
            return false;
        }
        
        // --- HIGIENE: Limpiar dispositivo anterior ---
        if (this.currentOutput) {
            await this._cleanupPreviousOutput();
        }
        
        // --- ACTIVAR NUEVO DISPOSITIVO ---
        this.currentOutput = outputInfo.device;
        this.stats.deviceSwitches++;
        
        console.log(`[MidiOutputManager] ✅ Output seleccionado: ${outputInfo.name}`);
        
        // Notificar cambio
        if (this.onOutputChanged) {
            this.onOutputChanged(outputInfo.id, outputInfo.name);
        }
        
        return true;
    }
    
    /**
     * Envía un mensaje MIDI al dispositivo físico
     * CORE: Aquí se integra con el MidiStateManager
     * @param {number} status - Byte de estado MIDI
     * @param {number} data1 - Primer byte de datos
     * @param {number} data2 - Segundo byte de datos
     * @param {string} source - 'REMOTE' o 'LOCAL'
     */
    send(status, data1, data2, source = 'REMOTE') {
        console.log('[MidiOutputManager] send() llamado:', {
            hasOutput: !!this.currentOutput,
            outputName: this.currentOutput?.name || 'NINGUNO',
            source,
            status,
            data1,
            data2,
            isDisposed: this._isDisposed
        });
        
        if (!this.currentOutput) {
            // No hay dispositivo seleccionado, silenciosamente ignorar
            console.warn('[MidiOutputManager] NO HAY OUTPUT - mensaje ignorado');
            return;
        }
        
        if (this._isDisposed) {
            console.warn('[MidiOutputManager] Intento de envío en estado disposed.');
            return;
        }
        
        // --- FIREWALL: Solo enviar mensajes REMOTE al hardware ---
        if (source !== 'REMOTE') {
            // Esto es un mensaje local (del alumno tocando), no debe ir al output
            // porque el hardware físico ya lo genera naturalmente
            return;
        }
        
        // --- FILTRADO DE MENSAJES NO ESENCIALES ---
        if (this._shouldFilterMessage(status)) {
            this.stats.messagesFiltered++;
            return;
        }
        
        try {
            // Enviar al hardware
            this.currentOutput.send([status, data1, data2]);
            
            // --- REGISTRAR PARA ANTI-ECHO ---
            this._registerSentMessage(status, data1, data2);
            
            this.stats.messagesSent++;
            
        } catch (error) {
            console.error('[MidiOutputManager] Error enviando mensaje MIDI:', error);
            if (this.onError) {
                this.onError(error);
            }
        }
    }
    
    /**
     * INPUT GATE: Verifica si un mensaje entrante es un echo del que acabamos de enviar
     * @param {number} status 
     * @param {number} data1 
     * @param {number} data2 
     * @returns {boolean} - true si es un echo (debe ser ignorado)
     */
    isEcho(status, data1, data2) {
        const key = this._makeMessageKey(status, data1, data2);
        const sentTime = this._recentlySentMessages.get(key);
        
        if (!sentTime) {
            return false; // No lo hemos enviado recientemente
        }
        
        const age = performance.now() - sentTime;
        
        if (age < this.ECHO_FILTER_WINDOW_MS) {
            // Este mensaje fue enviado hace menos de 50ms, es muy probable que sea un echo
            this.stats.echoesBlocked++;
            console.debug(`[MidiOutputManager] 🚫 Echo bloqueado: ${status},${data1},${data2} (${age.toFixed(1)}ms)`);
            return true;
        }
        
        return false;
    }
    
    /**
     * Limpia el dispositivo anterior antes de cambiar
     * @private
     */
    async _cleanupPreviousOutput() {
        if (!this.currentOutput) return;
        
        console.log('[MidiOutputManager] Limpiando dispositivo anterior...');
        
        try {
            // ALL NOTES OFF en todos los canales (0-15)
            for (let channel = 0; channel < 16; channel++) {
                const status = 0xB0 + channel; // Control Change
                
                // CC 123: All Notes Off
                this.currentOutput.send([status, 123, 0]);
                
                // CC 121: Reset All Controllers
                this.currentOutput.send([status, 121, 0]);
                
                // Pequeño delay para que el hardware procese
                await this._sleep(5);
            }
            
            console.log('[MidiOutputManager] ✅ Dispositivo limpiado (All Notes Off enviado).');
            
        } catch (error) {
            console.error('[MidiOutputManager] Error limpiando dispositivo:', error);
        }
    }
    
    /**
     * Determina si un mensaje debe ser filtrado (no enviado)
     * @private
     */
    _shouldFilterMessage(status) {
        // Active Sensing (0xFE)
        if (status === 0xFE) return true;
        
        // System Exclusive (0xF0-0xF7, excepto 0xF1-0xF3 que son útiles)
        if (status >= 0xF0 && status <= 0xF7 && status !== 0xF1 && status !== 0xF2 && status !== 0xF3) {
            return true;
        }
        
        // Timing Clock (0xF8) - solo si queremos filtrar clock MIDI
        if (status === 0xF8) return true;
        
        return false;
    }
    
    /**
     * Registra un mensaje enviado para el echo filter
     * @private
     */
    _registerSentMessage(status, data1, data2) {
        const key = this._makeMessageKey(status, data1, data2);
        this._recentlySentMessages.set(key, performance.now());
        
        // Limitar tamaño del Map (prevención de memory leak)
        if (this._recentlySentMessages.size > 1000) {
            // Limpiar los más antiguos
            this._cleanupEchoFilter();
        }
    }
    
    /**
     * Genera una key única para un mensaje MIDI
     * @private
     */
    _makeMessageKey(status, data1, data2) {
        return `${status}-${data1}-${data2}`;
    }
    
    /**
     * Limpia mensajes antiguos del echo filter
     * @private
     */
    _cleanupEchoFilter() {
        const now = performance.now();
        const threshold = this.ECHO_FILTER_WINDOW_MS * 2; // Mantener 2x la ventana
        
        let cleaned = 0;
        
        this._recentlySentMessages.forEach((timestamp, key) => {
            if (now - timestamp > threshold) {
                this._recentlySentMessages.delete(key);
                cleaned++;
            }
        });
        
        if (cleaned > 0) {
            console.debug(`[MidiOutputManager] 🧹 ${cleaned} mensajes antiguos limpiados del echo filter.`);
        }
    }
    
    /**
     * Desactiva el output actual sin cambiar a otro
     */
    async deactivateOutput() {
        if (this.currentOutput) {
            await this._cleanupPreviousOutput();
            this.currentOutput = null;
            console.log('[MidiOutputManager] Output desactivado.');
        }
    }
    
    /**
     * Obtiene información del output actual
     */
    getCurrentOutputInfo() {
        if (!this.currentOutput) return null;
        
        return this.availableOutputs.find(o => o.id === this.currentOutput.id);
    }
    
    /**
     * Obtiene estadísticas
     */
    getStats() {
        return { ...this.stats, echoFilterSize: this._recentlySentMessages.size };
    }
    
    /**
     * Resetea estadísticas
     */
    resetStats() {
        this.stats = {
            messagesSent: 0,
            messagesFiltered: 0,
            deviceSwitches: 0,
            echoesBlocked: 0
        };
    }
    
    /**
     * Utility: Sleep
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * DISPOSE PATTERN: Limpieza completa
     */
    async dispose() {
        if (this._isDisposed) {
            console.warn('[MidiOutputManager] Ya fue disposed.');
            return;
        }
        
        console.log('[MidiOutputManager] Iniciando limpieza...');
        
        // 1. Limpiar dispositivo actual
        await this._cleanupPreviousOutput();
        
        // 2. Detener cleanup interval
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
            this._cleanupInterval = null;
        }
        
        // 3. Limpiar echo filter
        this._recentlySentMessages.clear();
        
        // 4. Limpiar referencias
        this.currentOutput = null;
        this.availableOutputs = [];
        this.onOutputChanged = null;
        this.onError = null;
        
        this._isDisposed = true;
        console.log('[MidiOutputManager] ✅ Recursos liberados.');
    }
}
