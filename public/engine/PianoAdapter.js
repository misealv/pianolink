/**
 * /engine/PianoAdapter.js
 * Puente entre cualquier Motor de Audio (V2/V3) y la Interfaz de PianoLink.
 * Maneja la señalización, el filtrado de roles y el ruteo de mensajes.
 */
export class PianoAdapter {
    constructor(engine, socket, callbacks) {
        this.engine = engine;
        this.socket = socket;
        this.callbacks = callbacks || {}; // { onNote, onStats }
        
        // Estado interno del contexto (se actualiza desde script.js)
        this.context = {
            role: 'student',
            participants: [],
            listeningTo: new Set(),
            liveStudentId: null,
            masterclassEnabled: false
        };

        this._setupEngineListeners();
        this._setupSocketSignaling();
    }

    // --- API PÚBLICA (Lo que llamas desde script.js) ---

    async start(isHost) {
        console.log("🚀 Adapter: Iniciando motores...");
        await this.engine.initAudio();
        await this.engine.initNetwork(isHost);
    }

    async initMidi() {
        return await this.engine.initMidi();
    }

    selectMidiInput(id) {
        return this.engine.selectInput(id); // Retorna el output automático si hubo match
    }

    selectMidiOutput(id) {
        this.engine.selectOutput(id);
    }

    updateContext(newContext) {
        // Actualizamos solo lo que venga definido
        Object.assign(this.context, newContext);
    }

    // --- LÓGICA PRIVADA (El cerebro) ---

    _setupEngineListeners() {
        // 1. NOTAS ENTRANTES (Desde la Red)
        this.engine.on('noteReceived', (data) => {
            const senderId = data.fromSocketId;
            const ctx = this.context;

            // A. Identificar Rol
            let originRole = 'student';
            let userFound = false;
            if (senderId && Array.isArray(ctx.participants)) {
                const u = ctx.participants.find(p => p.socketId === senderId);
                if (u) { userFound = true; if (u.role) originRole = u.role; }
            }

            // B. Parche de Seguridad (Si soy alumno, todo lo que llega es 'teacher')
            if (ctx.role === 'student' && (!userFound || originRole !== 'teacher')) {
                originRole = 'teacher';
            }
            if (!senderId && ctx.role === 'teacher') originRole = 'teacher'; // Eco

            // C. Lógica de Profesor (Filtrado y Relay)
            if (ctx.role === 'teacher') {
                const debeSonar = (ctx.listeningTo.size === 0) || (senderId && ctx.listeningTo.has(senderId));
                
                // Relay Masterclass
                if (ctx.masterclassEnabled && ctx.liveStudentId === senderId && data.originalBuffer) {
                    try { this.engine.relayNote(data, senderId); } catch(e) {}
                }
            }

            // D. Entregar a la UI limpio
            this._emitToUI(data, originRole, senderId);
        });

        // 2. FEEDBACK LOCAL (Lo que yo toco)
        this.engine.on('noteSent', (data) => {
            this._emitToUI(data, this.context.role, this.socket.id);
        });

        // 3. SEÑALIZACIÓN SALIENTE (ICE Candidates)
        document.addEventListener("webrtc-signal-out", (e) => {
            const { target, type, payload } = e.detail;
            const room = this.socket.roomCode || window.salaActual;
            if (room) {
                this.socket.emit("signal-webrtc", { room, target, type, payload });
            }
        });
    }

    _emitToUI(data, role, socketId) {
        const cmd = data.status & 0xF0;
        const msgType = (cmd === 0xB0) ? "cc" : "note";

        if (this.callbacks.onNote) {
            this.callbacks.onNote({
                type: msgType,
                command: data.status,
                status: data.status,
                note: data.data1,
                velocity: data.data2,
                controller: data.data1,
                value: data.data2,
                fromRole: role,
                fromSocketId: socketId,
                timestamp: Date.now()
            });
        }
    }

    _setupSocketSignaling() {
        // Cuando entran usuarios (Profe llama)
        this.socket.on("room-users", async (users) => {
            // Actualizamos la lista interna
            this.updateContext({ participants: users || [] });
            
            if (this.context.role === 'teacher') {
                this.context.participants.forEach(async (u) => {
                    if (u.role === 'student' && u.socketId !== this.socket.id) {
                        const offer = await this.engine.connectToStudent(u.socketId);
                        if (offer) {
                            this.socket.emit("signal-webrtc", { 
                                target: u.socketId, type: 'offer', payload: offer 
                            });
                        }
                    }
                });
            }
        });

        // Manejo de señales entrantes
        this.socket.on("signal-webrtc", async (msg) => {
            const answer = await this.engine.handleIncomingSignal(msg.fromSocketId, msg.type, msg.payload);
            if (answer) {
                this.socket.emit("signal-webrtc", {
                    target: msg.fromSocketId, type: 'answer', payload: answer
                });
            }
        });
    }
}