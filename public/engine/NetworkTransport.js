/**
 * /engine/NetworkTransport.js
 * Soporte Multi-Peer (Clase Grupal) - VERSIÓN MIDI STRICT (DATA ONLY)
 * Soluciona error: "m-lines mismatch" y "wrong state: stable"
 */
export class NetworkTransport {
    constructor() {
        // Mapa de conexiones activas: { "socketId": RTCPeerConnection }
        this.peers = new Map();
        // Mapa de canales de datos: { "socketId": RTCDataChannel }
        this.dataChannels = new Map();
        this.onDataCallback = null;
        
        // Configuración STUN (Servidores de Google)
        this.config = {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        };
    }

    // Callback para cuando llega data MIDI de CUALQUIER alumno
    onDataReceived(callback) {
        this.onDataCallback = callback;
    }

    /**
     * Crea o recupera una conexión. 
     * @param {string} targetSocketId - ID del socket destino
     * @param {boolean} isInitiator - Si somos nosotros quienes llamamos
     * @param {boolean} forceReset - (NUEVO) Obliga a destruir la conexión anterior
     */
    getOrCreatePeer(targetSocketId, isInitiator, forceReset = false) {
        // 1. LIMPIEZA DE ZOMBIES (Solución al error "m-lines")
        // Si nos llega una OFERTA nueva (forceReset=true), matamos lo viejo sin piedad.
        if (forceReset && this.peers.has(targetSocketId)) {
            console.warn(`♻️ [Network] Destruyendo conexión antigua con ${targetSocketId} para evitar conflictos.`);
            this.disconnectPeer(targetSocketId);
        }

        // Si ya existe y está sana, la devolvemos
        if (this.peers.has(targetSocketId)) {
            return this.peers.get(targetSocketId);
        }

        console.log(`🔌 [Network] Creando NUEVA conexión WebRTC (Data Only) con: ${targetSocketId}`);
        const pc = new RTCPeerConnection(this.config);
        
        // Guardamos en el mapa
        this.peers.set(targetSocketId, pc);

        // Manejo de ICE Candidates (Salida a Internet)
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                document.dispatchEvent(new CustomEvent('webrtc-signal-out', {
                    detail: {
                        target: targetSocketId,
                        type: 'candidate',
                        payload: event.candidate
                    }
                }));
            }
        };

        // Monitoreo de estado (opcional, ayuda a debug)
        pc.onconnectionstatechange = () => {
            console.log(`📶 Estado con ${targetSocketId}: ${pc.connectionState}`);
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                // Opcional: Auto-limpieza si falla
                // this.disconnectPeer(targetSocketId);
            }
        };

        // 2. CONFIGURACIÓN DEL DATA CHANNEL (MIDI)
        if (isInitiator) {
            // SI SOMOS PROFE (o quien llama): Creamos el canal
            // 'negotiated: false' es el estándar. Creamos el canal y esperamos que el otro lado responda.
            const dc = pc.createDataChannel("midi-fast", { 
                ordered: false, // UDP-like (Mejor para tiempo real)
                maxRetransmits: 0 
            });
            this._setupDataChannel(dc, targetSocketId);
        } else {
            // SI SOMOS ALUMNO (o quien recibe): Esperamos que el canal aparezca
            pc.ondatachannel = (e) => {
                console.log(`📥 [Network] Recibido DataChannel de ${targetSocketId}`);
                this._setupDataChannel(e.channel, targetSocketId);
            };
        }

        return pc;
    }

    _setupDataChannel(dc, peerId) {
        dc.binaryType = 'arraybuffer';
        this.dataChannels.set(peerId, dc);

        dc.onopen = () => console.log(`🎹 [MIDI] Canal ABIERTO y listo con ${peerId} 🚀`);
        
        dc.onclose = () => {
            console.log(`❌ [MIDI] Canal cerrado con ${peerId}`);
            this.disconnectPeer(peerId);
        };
        
        dc.onerror = (err) => console.error("⚠️ Error en DataChannel:", err);

        dc.onmessage = (event) => {
            if (this.onDataCallback) {
                // Pasamos el buffer crudo y el ID de quien lo envió
                this.onDataCallback(event.data, peerId);
            }
        };
    }

    sendTo(targetId, buffer) {
        const dc = this.dataChannels.get(targetId);
        // Validación estricta: El canal debe existir y estar ABIERTO
        if (dc && dc.readyState === 'open') {
            try {
                dc.send(buffer);
            } catch (e) {
                console.warn("Error enviando datos:", e);
            }
        }
    }

    broadcast(buffer, excludeId = null) {
        this.dataChannels.forEach((dc, peerId) => {
            if (peerId !== excludeId && dc.readyState === 'open') {
                try {
                    dc.send(buffer);
                } catch (e) {
                    console.warn("Error broadcast:", e);
                }
            }
        });
    }

    disconnectPeer(peerId) {
        const pc = this.peers.get(peerId);
        if (pc) {
            try {
                pc.close(); // Cierra WebRTC
            } catch(e) {}
            this.peers.delete(peerId);
            this.dataChannels.delete(peerId);
        }
    }

    // --- MÉTODOS DE SEÑALIZACIÓN (EL CEREBRO DE LA CONEXIÓN) ---

    async handleSignal(fromId, type, payload) {
        try {
            // 3. LÓGICA CRÍTICA DE ORDEN
            // Si llega un 'offer', es una llamada NUEVA -> Force Reset = TRUE
            const isOffer = (type === 'offer');
            
            // Si es oferta, no somos initiator (false). Si es respuesta, sí fuimos initiator (true).
            // Lo más importante es el tercer parámetro: isOffer (forceReset)
            const pc = this.getOrCreatePeer(fromId, false, isOffer); 

            if (type === 'offer') {
                console.log("📩 [Signal] Procesando Oferta...");
                
                // Aceptamos la descripción remota
                await pc.setRemoteDescription(new RTCSessionDescription(payload));
                
                // Creamos la respuesta
                const answer = await pc.createAnswer();
                
                // Establecemos nuestra descripción local
                await pc.setLocalDescription(answer);
                
                return answer; // Devolvemos la respuesta para que script.js la envíe
            } 
            else if (type === 'answer') {
                console.log("✅ [Signal] Respuesta recibida. Conectando...");
                
                // Evitamos el error "Called in wrong state: stable"
                if (pc.signalingState !== "stable") {
                    await pc.setRemoteDescription(new RTCSessionDescription(payload));
                }
            } 
            else if (type === 'candidate') {
                try { 
                    // Solo agregamos candidatos si la conexión remota ya está establecida
                    if (pc.remoteDescription && pc.remoteDescription.type) {
                        await pc.addIceCandidate(new RTCIceCandidate(payload)); 
                    }
                } catch(e) { 
                    console.warn("Candidate ignorado (timing):", e); 
                }
            }
        } catch (error) {
            console.error(`🚨 Error Crítico WebRTC (${type}):`, error);
        }
    }

    // Método helper para crear oferta (usado por el Host/Profe)
    async createOffer() {
         // Este método se llamaba desde WebRTCEngine, pero getOrCreatePeer ya devuelve el PC.
         // Mantendremos la lógica en WebRTCEngine.connectToStudent, pero si necesitas un helper aquí:
         return null; 
    }
}