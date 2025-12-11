/**
 * /engine/implementations/WebRTCEngine.js
 * Motor WebRTC V2 con soporte para Clase Grupal (Topología Estrella)
 */
import { IPianoEngine } from '../interfaces/IPianoEngine.js';
import { NetworkTransport } from '../NetworkTransport.js';
import { MidiProtocol } from '../MidiProtocol.js';
import { TimeSync } from '../TimeSync.js';
import { AudioScheduler } from '../AudioScheduler.js';

export class WebRTCEngine extends IPianoEngine {
    constructor() {
        super();
        
        this.net = new NetworkTransport();
        this.protocol = new MidiProtocol();
        this.timeSync = new TimeSync(this.net);
        this.audio = new AudioScheduler(this.timeSync);
        
        this.midiAccess = null;
        this.isHost = false;

        // CABLEADO INTERNO: Red -> Audio
        // Ahora recibimos (buffer, fromSocketId) gracias al nuevo NetworkTransport
        // CABLEADO INTERNO: Red -> Audio
// Ahora recibimos (buffer, fromSocketId) gracias al nuevo NetworkTransport
this.net.onDataReceived((buffer, fromSocketId) => {
    console.log("🌐 [WebRTCEngine] onDataReceived, len:", buffer.byteLength, "from:", fromSocketId);

    const data = MidiProtocol.decode(buffer);
    console.log("🌐 [WebRTCEngine] decode ->", data);

    if (data) {
        // 1. Quién tocó (ID del peer)
        data.fromSocketId = fromSocketId;
        
        // 2. Guardamos el buffer original por si hay que hacer Relay (Masterclass)
        data.originalBuffer = buffer; 

        // 3. Sonido local en el lado que recibe
        this.audio.scheduleNote(data);
        
        // 4. Avisamos a la UI (piano visual, pizarra, etc.)
        console.log("🎹 [WebRTCEngine] EMIT noteReceived");
        this.emit('noteReceived', data);
    } else {
        console.warn("⚠️ [WebRTCEngine] decode devolvió null");
    }
});

        // Eventos internos de estado
        document.addEventListener('stats-update', (e) => this.emit('stats', e.detail));
        
        // Cuando WebRTC conecta (al menos un peer), iniciamos Sync
        document.addEventListener('webrtc-connected', () => {
            // El Host (Profe) es el maestro del reloj
            this.timeSync.start(this.isHost);
            this.emit('connected');
        });
    }

    // --- MÉTODOS BASE DEL CONTRATO ---

    async initAudio() {
        await this.audio.init();
    }

    async initNetwork(isHost) {
        this.isHost = isHost;
        // La inicialización real ocurre dinámicamente al conectar alumnos
    }

    // --- SEÑALIZACIÓN DINÁMICA (CLASE GRUPAL) ---

    // 1. Iniciar conexión hacia un alumno específico (Rol: Profesor)
    async connectToStudent(studentId) {
        // true = Initiator (crea la oferta)
        const pc = this.net.getOrCreatePeer(studentId, true);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        return offer;
    }

    // 2. Manejar señal entrante (Oferta, Respuesta o Candidato)
    async handleIncomingSignal(fromId, type, payload) {
        // Delega la complejidad al transporte
        const answer = await this.net.handleSignal(fromId, type, payload);
        return answer; // Si recibimos oferta, devolvemos respuesta. Si no, null.
    }

    // --- FUNCIONES AVANZADAS: BROADCAST & RELAY ---

    // Enviar a TODOS (Ej: Profesor tocando para la clase)
    broadcastNote(buffer) {
        this.net.broadcast(buffer);
    }

    // Retransmitir una nota recibida a los demás (Modo Masterclass)
    // excludeSourceId = El ID del alumno que tocó (para no devolvérsela y crear eco)
    relayNote(data, excludeSourceId) {
        if (data.originalBuffer) {
            this.net.broadcast(data.originalBuffer, excludeSourceId);
        } else {
            // Fallback: Si no tenemos el buffer crudo, recodificamos
            const buffer = this.protocol.encode(data.status, data.data1, data.data2, data.timestamp);
            this.net.broadcast(buffer, excludeSourceId);
        }
    }

    // --- CONTROL DE AUDIO ---
    setBufferLatency(ms) {
        this.audio.setBufferLatency(ms);
    }

    // --- GESTIÓN DE HARDWARE MIDI ---

    async initMidi() {
        try {
            this.midiAccess = await navigator.requestMIDIAccess();
            return {
                inputs: Array.from(this.midiAccess.inputs.values()),
                outputs: Array.from(this.midiAccess.outputs.values())
            };
        } catch (e) {
            console.error("Midi Access Error", e);
            throw e;
        }
    }

    selectInput(inputId) {
        const input = this.midiAccess.inputs.get(inputId);
        if (!input) return null;

        console.log(`🔌 Motor WebRTC: Entrada -> ${input.name}`);
        
        input.onmidimessage = (msg) => {
            const [status, data1, data2] = msg.data;
            if (status >= 240) return;
            
            const now = this.timeSync.getNow();
            const buffer = this.protocol.encode(status, data1, data2, now);
            
            // MODIFICADO: Usamos broadcast() por defecto.
            // - Si soy Alumno: Envía a mi único peer (El Profe).
            // - Si soy Profe: Envía a TODOS los alumnos conectados.
            this.net.broadcast(buffer);
            
            this.emit('noteSent', { status, data1, data2 });
        };

        // Smart Routing (Búsqueda automática de salida)
        const outputs = Array.from(this.midiAccess.outputs.values());
        
        // 1. Coincidencia Exacta
        let match = outputs.find(out => out.name === input.name);
        
        // 2. Coincidencia Fuzzy (Aproximada)
        if (!match) {
            match = outputs.find(out => out.name.includes(input.name) || input.name.includes(out.name));
        }

        if (match) {
            console.log(`✨ Motor WebRTC: Auto-Ruteo a -> ${match.name}`);
            this.audio.setMidiOutput(match);
            return match;
        }
        return null;
    }

    selectOutput(outputId) {
        const output = this.midiAccess.outputs.get(outputId);
        if (output) {
            this.audio.setMidiOutput(output);
        }
    }

    // --- MÉTODOS MANUALES (LEGACY / FALLBACK) ---
    // Se mantienen vacíos o como wrappers por compatibilidad con IPianoEngine
    async generateInvitation() { console.warn("Usa connectToStudent en modo V2"); return null; }
    async processInvitation(c) { console.warn("Usa handleIncomingSignal en modo V2"); return null; }
    async confirmConnection(c) { console.warn("Usa handleIncomingSignal en modo V2"); }
}