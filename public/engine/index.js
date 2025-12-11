/**
 * /engine/index.js
 * Fachada pública del Motor PianoLink v2.0
 * Mantiene la complejidad encapsulada.
 */
import { NetworkTransport } from './NetworkTransport.js';
import { MidiProtocol } from './MidiProtocol.js';
import { TimeSync } from './TimeSync.js';
import { AudioScheduler } from './AudioScheduler.js';

export class PianoLinkEngine {
    constructor() {
        this.network = new NetworkTransport();
        this.protocol = new MidiProtocol();
        this.timeSync = new TimeSync(this.network);
        this.audio = new AudioScheduler(this.timeSync);
        
        this.eventListeners = {};
        
        // Cableado interno: Cuando llega red -> Decodificar -> Agendar Audio
        this.network.onDataReceived((buffer) => {
            const data = MidiProtocol.decode(buffer);
            if (data) {
                // 1. Tocar nota (Magia del Buffer)
                this.audio.scheduleNote(data);
                
                // 2. Avisar a la UI (Para iluminar teclas visuales)
                this.emit('note-received', data);
            }
        });
        
        // Cableado del Reloj para el HUD
        document.addEventListener('stats-update', (e) => {
            this.emit('stats', e.detail);
        });
    }

    /**
     * Inicia la sesión (Llamar al entrar a la sala)
     */
    async init(isHost) {
        // Iniciar Audio Context (requiere interacción usuario previo)
        await this.audio.init();
        
        // Iniciar Red
        await this.network.init(isHost);
        
        // Iniciar Sincronización
        // Damos un pequeño margen para asegurar conexión antes de sincronizar
        setTimeout(() => {
            this.timeSync.start(isHost);
        }, 1000);
    }

    /**
     * Método para enviar notas (Usar en tu onmidimessage actual)
     */
    sendNote(status, note, velocity) {
        const now = this.timeSync.getNow();
        const buffer = this.protocol.encode(status, note, velocity, now);
        this.network.send(buffer);
        
        // Emitir localmente para que el que toca también vea su tecla iluminada/suene
        // (Opcional: depende de si usas Local Monitoring)
    }

    // --- Gestión de Eventos Simple para la UI ---
    on(event, callback) {
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(callback);
    }

    emit(event, data) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(cb => cb(data));
        }
    }
    
    // Métodos pasarela para WebRTC (Oferta/Respuesta)
    // Tu código actual de Sockets llamará a estos métodos
    async getOffer() { return await this.network.createOffer(); }
    async handleAnswer(answer) { await this.network.handleAnswer(answer); }
    async handleOffer(offer) { return await this.network.receiveOffer(offer); }
    async addIceCandidate(candidate) { await this.network.addIceCandidate(candidate); }
}