/**
 * /engine/NetworkTransport.js
 * Soporte Multi-Peer (Clase Grupal)
 */
export class NetworkTransport {
    constructor() {
        // En lugar de una sola conexión, tenemos un Mapa: { "socketId": RTCPeerConnection }
        this.peers = new Map();
        this.dataChannels = new Map();
        this.onDataCallback = null;
        
        // Configuramos STUN servers
        this.config = {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        };
    }

    // Callback para cuando llega data de CUALQUIER alumno
    onDataReceived(callback) {
        this.onDataCallback = callback;
    }

    /**
     * Crea o recupera una conexión para un usuario específico
     */
    getOrCreatePeer(targetSocketId, isInitiator) {
        if (this.peers.has(targetSocketId)) {
            return this.peers.get(targetSocketId);
        }

        console.log(`🔌 Creando conexión WebRTC con: ${targetSocketId}`);
        const pc = new RTCPeerConnection(this.config);
        
        // Guardamos en el mapa
        this.peers.set(targetSocketId, pc);

        // Manejo de ICE Candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                // Emitimos evento para que script.js lo mande por Socket.io al destino específico
                document.dispatchEvent(new CustomEvent('webrtc-signal-out', {
                    detail: {
                        target: targetSocketId,
                        type: 'candidate',
                        payload: event.candidate
                    }
                }));
            }
        };

        // Si soy yo quien inicia (Profesor), creo el canal
        if (isInitiator) {
            const dc = pc.createDataChannel("midi-fast", { ordered: false, maxRetransmits: 0 });
            this._setupDataChannel(dc, targetSocketId);
        } else {
            // Si soy alumno, espero el canal
            pc.ondatachannel = (e) => {
                this._setupDataChannel(e.channel, targetSocketId);
            };
        }

        return pc;
    }

    _setupDataChannel(dc, peerId) {
        dc.binaryType = 'arraybuffer';
        this.dataChannels.set(peerId, dc);

        dc.onopen = () => console.log(`🚀 Canal abierto con ${peerId}`);
        dc.onclose = () => {
            console.log(`❌ Canal cerrado con ${peerId}`);
            this.disconnectPeer(peerId);
        };

        dc.onmessage = (event) => {
            // Pasamos la data Y quién la envió
            if (this.onDataCallback) {
                this.onDataCallback(event.data, peerId);
            }
        };
    }

    // Enviar a uno específico
    sendTo(targetId, buffer) {
        const dc = this.dataChannels.get(targetId);
        if (dc && dc.readyState === 'open') {
            dc.send(buffer);
        }
    }

    // Enviar a TODOS (Broadcast) - Útil para el Profesor tocando
    broadcast(buffer, excludeId = null) {
        this.dataChannels.forEach((dc, peerId) => {
            if (peerId !== excludeId && dc.readyState === 'open') {
                dc.send(buffer);
            }
        });
    }

    disconnectPeer(peerId) {
        const pc = this.peers.get(peerId);
        if (pc) {
            pc.close();
            this.peers.delete(peerId);
            this.dataChannels.delete(peerId);
        }
    }

    // --- MÉTODOS DE SEÑALIZACIÓN ---

    async handleSignal(fromId, type, payload) {
        // Si recibo oferta, soy receiver (false). Si recibo respuesta, fui initiator (true).
        const isInitiator = (type === 'answer'); 
        const pc = this.getOrCreatePeer(fromId, isInitiator);

        if (type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(payload));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            return answer; // Devolvemos la respuesta para enviarla
        } 
        else if (type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(payload));
        } 
        else if (type === 'candidate') {
            try { await pc.addIceCandidate(new RTCIceCandidate(payload)); } catch(e){}
        }
    }
}