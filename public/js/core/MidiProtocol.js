/**
 * Core Engine: Protocolo Binario
 * Convierte eventos MIDI a ArrayBuffer y viceversa.
 * Optimizado para PianoLink V3 (Socket Relay)
 */
export class MidiProtocol {
    constructor() {
        // Buffer reutilizable para evitar Garbage Collection (latencia)
        // 13 Bytes: [SeqID(2) + Time(8) + Status(1) + Data1(1) + Data2(1)]
        this.buffer = new ArrayBuffer(13);
        this.view = new DataView(this.buffer);
        this.seq = 0;
    }

    /**
     * Empaqueta un evento MIDI
     * @param {number} status - Byte de estado (ej: 144 NoteOn)
     * @param {number} data1 - Nota (0-127)
     * @param {number} data2 - Velocidad (0-127)
     * @returns {ArrayBuffer}
     */
    encode(status, data1, data2) {
        // Offset 0: Secuencia (2 bytes) para detectar paquetes perdidos
        this.view.setUint16(0, this.seq++, true);
        
        // Offset 2: Timestamp (8 bytes) - Alta precisión
        this.view.setFloat64(2, performance.now(), true);
        
        // Offset 10-12: Datos MIDI (3 bytes)
        this.view.setUint8(10, status);
        this.view.setUint8(11, data1);
        this.view.setUint8(12, data2);

        return this.buffer.slice(0); // Retorna la referencia al buffer
    }

    /**
     * Desempaqueta el binario recibido
     * @param {ArrayBuffer} buffer 
     * @returns {Object|null}
     */
    static decode(buffer) {
        // Validación estricta: Si no son 13 bytes, es basura.
        if (buffer.byteLength !== 13) return null;
        
        const view = new DataView(buffer);
        
        return {
            // Saltamos seq (bytes 0-2) porque en TCP/Socket.io el orden está garantizado
            timestamp: view.getFloat64(2, true),
            status: view.getUint8(10),
            data1: view.getUint8(11),
            data2: view.getUint8(12)
        };
    }
}