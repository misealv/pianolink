/**
 * Core Engine: Protocolo Binario V2 - HIGH-PRIORITY MIDI STREAM
 * Soporta mensajes individuales Y bundles para máxima eficiencia
 * 
 * FORMATO INDIVIDUAL (13 bytes):
 * [SeqID(2) + Timestamp(8) + Status(1) + Data1(1) + Data2(1)]
 * 
 * FORMATO BUNDLE (variable):
 * [SeqID(2) + BundleFlag(1) + MessageCount(1) + Messages...]
 * Cada mensaje: [Timestamp(8) + Status(1) + Data1(1) + Data2(1)]
 */
export class MidiProtocolV2 {
    constructor() {
        this.seq = 0;
        
        // Buffer para mensajes individuales (reutilizable)
        this.singleBuffer = new ArrayBuffer(13);
        this.singleView = new DataView(this.singleBuffer);
        
        console.log('[MidiProtocolV2] 🚀 Protocolo de bundles activado');
    }

    /**
     * Empaqueta UN mensaje MIDI individual
     * @param {number} status - Byte de estado (ej: 144 NoteOn)
     * @param {number} data1 - Nota (0-127)
     * @param {number} data2 - Velocidad (0-127)
     * @param {number} timestamp - performance.now() del emisor
     * @returns {ArrayBuffer}
     */
    encodeSingle(status, data1, data2, timestamp = performance.now()) {
        // Offset 0: Secuencia (2 bytes)
        this.singleView.setUint16(0, this.seq++, true);
        
        // Offset 2: Timestamp (8 bytes) - Alta precisión
        this.singleView.setFloat64(2, timestamp, true);
        
        // Offset 10-12: Datos MIDI (3 bytes)
        this.singleView.setUint8(10, status);
        this.singleView.setUint8(11, data1);
        this.singleView.setUint8(12, data2);

        return this.singleBuffer.slice(0);
    }
    
    /**
     * Empaqueta MÚLTIPLES mensajes MIDI en un bundle
     * @param {Array} messages - Array de {status, data1, data2, timestamp}
     * @returns {ArrayBuffer}
     */
    encodeBundle(messages) {
        if (!messages || messages.length === 0) {
            console.warn('[MidiProtocolV2] Bundle vacío, ignorando');
            return null;
        }
        
        // Si es un solo mensaje, usar formato individual (más eficiente)
        if (messages.length === 1) {
            const msg = messages[0];
            return this.encodeSingle(msg.status, msg.data1, msg.data2, msg.timestamp);
        }
        
        // === FORMATO BUNDLE ===
        // Header: 4 bytes [SeqID(2) + BundleFlag(1) + MessageCount(1)]
        // Body: MessageCount * 11 bytes [Timestamp(8) + Status(1) + Data1(1) + Data2(1)]
        const headerSize = 4;
        const messageSize = 11;
        const totalSize = headerSize + (messages.length * messageSize);
        
        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        
        // === HEADER ===
        view.setUint16(0, this.seq++, true);     // SeqID
        view.setUint8(2, 0xFF);                  // BundleFlag (0xFF = bundle)
        view.setUint8(3, messages.length);       // MessageCount
        
        // === BODY ===
        let offset = headerSize;
        for (const msg of messages) {
            view.setFloat64(offset, msg.timestamp, true);  // Timestamp (8 bytes)
            view.setUint8(offset + 8, msg.status);         // Status (1 byte)
            view.setUint8(offset + 9, msg.data1);          // Data1 (1 byte)
            view.setUint8(offset + 10, msg.data2);         // Data2 (1 byte)
            offset += messageSize;
        }
        
        console.debug(`[MidiProtocolV2] Bundle creado: ${messages.length} mensajes en ${totalSize} bytes`);
        return buffer;
    }

    /**
     * Desempaqueta binario recibido (individual O bundle)
     * @param {ArrayBuffer} buffer 
     * @returns {Array<Object>} - Array de mensajes (puede ser 1 o múltiples)
     */
    static decode(buffer) {
        if (!buffer || buffer.byteLength < 13) {
            console.warn('[MidiProtocolV2] Buffer inválido o corrupto');
            return [];
        }
        
        const view = new DataView(buffer);
        
        // === DETECTAR FORMATO ===
        // Si byte 2 es 0xFF, es un bundle
        const bundleFlag = view.getUint8(2);
        
        if (bundleFlag === 0xFF) {
            return this._decodeBundle(buffer, view);
        } else {
            return this._decodeSingle(buffer, view);
        }
    }
    
    /**
     * Decodifica mensaje individual
     * @private
     */
    static _decodeSingle(buffer, view) {
        if (buffer.byteLength !== 13) {
            console.warn('[MidiProtocolV2] Tamaño incorrecto para mensaje individual');
            return [];
        }
        
        return [{
            timestamp: view.getFloat64(2, true),
            status: view.getUint8(10),
            data1: view.getUint8(11),
            data2: view.getUint8(12)
        }];
    }
    
    /**
     * Decodifica bundle de mensajes
     * @private
     */
    static _decodeBundle(buffer, view) {
        const messageCount = view.getUint8(3);
        const messages = [];
        
        const headerSize = 4;
        const messageSize = 11;
        const expectedSize = headerSize + (messageCount * messageSize);
        
        if (buffer.byteLength !== expectedSize) {
            console.error(`[MidiProtocolV2] Bundle corrupto: esperado ${expectedSize} bytes, recibido ${buffer.byteLength}`);
            return [];
        }
        
        let offset = headerSize;
        for (let i = 0; i < messageCount; i++) {
            messages.push({
                timestamp: view.getFloat64(offset, true),
                status: view.getUint8(offset + 8),
                data1: view.getUint8(offset + 9),
                data2: view.getUint8(offset + 10)
            });
            offset += messageSize;
        }
        
        console.debug(`[MidiProtocolV2] Bundle decodificado: ${messageCount} mensajes`);
        return messages;
    }
}
