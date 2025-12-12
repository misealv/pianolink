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

        // 🟢 NUEVO: Lista de IDs permitidos (Filtro CUE Estricto)
        this.soloList = new Set();

        // CABLEADO INTERNO: Red -> Audio
        this.net.onDataReceived((buffer, fromSocketId) => {
            // console.log("🌐 [WebRTCEngine] onDataReceived len:", buffer.byteLength); 

            const data = MidiProtocol.decode(buffer);

            if (data) {
                data.fromSocketId = fromSocketId;
                data.originalBuffer = buffer; 

                // 🟢 FILTRO ESTRICTO (SOLUCIÓN FINAL)
                // Solo permitimos el paso si el ID está explícitamente en la lista.
                // Si la lista está vacía, no suena nadie (Silencio Total).
                const isAllowed = this.soloList.has(fromSocketId);

                if (isAllowed) {
                    // 1. Sonido
                    this.audio.scheduleNote(data);
                    
                    // 2. Visual (Feedback)
                    // Al estar dentro del if, el piano visual también se apaga si no está permitido
                    this.emit('noteReceived', data);
                }
            } // <--- ESTA LLAVE FALTABA (Cierre del if(data))
        }); // <--- Cierre del callback onDataReceived

        // Eventos internos de estado
        document.addEventListener('stats-update', (e) => this.emit('stats', e.detail));
        
        // Cuando WebRTC conecta (al menos un peer), iniciamos Sync
        document.addEventListener('webrtc-connected', () => {
            // El Host (Profe) es el maestro del reloj
            this.timeSync.start(this.isHost);
            this.emit('connected');
        });

    } // <--- ESTA LLAVE ES CRÍTICA (Cierre del Constructor)

    // 🟢 NUEVO: Actualizar filtro desde la UI
    setSoloList(socketIdsArray) {
        this.soloList = new Set(socketIdsArray);
        // console.log("🎚️ Filtro actualizado:", this.soloList);
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
            this.net.broadcast(buffer);
            
            this.emit('noteSent', { status, data1, data2 });
        };

        // Smart Routing (Búsqueda automática de salida)
        const outputs = Array.from(this.midiAccess.outputs.values());
        
        let match = outputs.find(out => out.name === input.name);
        
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
    async generateInvitation() { console.warn("Usa connectToStudent en modo V2"); return null; }
    async processInvitation(c) { console.warn("Usa handleIncomingSignal en modo V2"); return null; }
    async confirmConnection(c) { console.warn("Usa handleIncomingSignal en modo V2"); }
}