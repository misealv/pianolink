/**
 * /engine/interfaces/IPianoEngine.js
 * CONTRATO BASE: Todos los motores deben heredar o implementar esto.
 * Esto garantiza que tu aplicación no se rompa si cambias el motor.
 */
export class IPianoEngine {
    constructor() {
        if (this.constructor === IPianoEngine) {
            throw new Error("No puedes instanciar la interfaz IPianoEngine directamente.");
        }
        this.listeners = {};
    }

    // --- MÉTODOS OBLIGATORIOS ---

    async initAudio() { throw new Error("Método initAudio no implementado"); }
    
    // Conexión genérica (puede ser host, guest, o id de sala)
    async connect(params) { throw new Error("Método connect no implementado"); }
    
    // Señalización (opcional, depende del motor)
    async getInvitationCode() { return ""; }
    async processInvitationCode(code) { return ""; }
    async finalizeConnection(response) {}

    // Hardware MIDI
    async initMidi() { throw new Error("Método initMidi no implementado"); }
    selectInput(id) { throw new Error("Método selectInput no implementado"); }
    selectOutput(id) { throw new Error("Método selectOutput no implementado"); }

    // Configuración
    setBufferLatency(ms) { throw new Error("Método setBufferLatency no implementado"); }

    // --- SISTEMA DE EVENTOS (Ya implementado para todos) ---
    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        if (this.listeners[event]) this.listeners[event].forEach(cb => cb(data));
    }
}