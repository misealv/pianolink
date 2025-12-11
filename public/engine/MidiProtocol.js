/**
 * /engine/MidiProtocol.js
 * Implementación del Protocolo Binario de Baja Latencia v2.0
 * Referencia SRS: REQ-BIN-01, REQ-BIN-02, REQ-BIN-03
 */

export class MidiProtocol {
    constructor() {
        // REQ-BIN-03: Reutilizamos el mismo buffer para evitar basura (GC) en el envío
        this.buffer = new ArrayBuffer(13);
        this.view = new DataView(this.buffer);
        this.sequenceCounter = 0;
    }

    /**
     * Empaqueta un evento MIDI en 13 bytes binarios.
     * @param {number} status - Byte de estado (ej. 144 para NoteOn)
     * @param {number} data1 - Nota (0-127)
     * @param {number} data2 - Velocidad (0-127)
     * @param {number} globalTime - Tiempo Global Sincronizado
     * @returns {ArrayBuffer} - El buffer listo para enviar por WebRTC
     */
    encode(status, data1, data2, globalTime) {
        // 1. Sequence ID (2 Bytes) - Uint16 - Offset 0
        // REQ-BIN-02: Little Endian = true
        this.view.setUint16(0, this.sequenceCounter, true);
        
        // Incrementamos contador (0-65535) para detectar packet loss [cite: 16]
        this.sequenceCounter = (this.sequenceCounter + 1) % 65536;

        // 2. Timestamp (8 Bytes) - Float64 - Offset 2
        this.view.setFloat64(2, globalTime, true);

        // 3. MIDI Data (3 Bytes) - Uint8 - Offset 10, 11, 12
        this.view.setUint8(10, status);
        this.view.setUint8(11, data1);
        this.view.setUint8(12, data2);

        return this.buffer;
    }

    /**
     * Desempaqueta un buffer binario recibido.
     * @param {ArrayBuffer} buffer - Datos recibidos por WebRTC
     * @returns {Object|null} - Objeto estructurado o null si es inválido
     */
    static decode(buffer) {
        // REQ-SEC-01: Validación de Longitud 
        if (buffer.byteLength !== 13) {
            console.warn(`[MidiProtocol] Paquete descartado. Longitud inválida: ${buffer.byteLength}`);
            return null;
        }

        const view = new DataView(buffer);

        // Lectura usando Little Endian explícito 
        return {
            sequenceId: view.getUint16(0, true),
            timestamp: view.getFloat64(2, true), // Este es el timestamp_origin [cite: 15]
            status: view.getUint8(10),
            data1: view.getUint8(11),
            data2: view.getUint8(12)
        };
    }
}