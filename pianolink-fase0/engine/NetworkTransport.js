/**
 * /engine/NetworkTransport.js
 * Capa de transporte WebRTC (UDP-like) con soporte para Señalización Manual
 */
export class NetworkTransport {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.onDataCallback = null;
        this.candidatesQueue = [];
    }

    // Inicializa la conexión
    async init(isInitiator) {
        const config = {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] // STUN de Google
        };
        this.peerConnection = new RTCPeerConnection(config);

        // Lógica del Data Channel
        if (isInitiator) {
            // REQ-NET-01: UDP Mode (ordered: false, maxRetransmits: 0)
            this.dataChannel = this.peerConnection.createDataChannel("midi-fast", {
                ordered: false,
                maxRetransmits: 0
            });
            this._setupDataChannel();
        } else {
            this.peerConnection.ondatachannel = (event) => {
                this.dataChannel = event.channel;
                this._setupDataChannel();
            };
        }

        // Recolección de candidatos ICE
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.candidatesQueue.push(event.candidate);
            }
        };
    }

    _setupDataChannel() {
        if (!this.dataChannel) return;
        this.dataChannel.binaryType = 'arraybuffer';
        
        this.dataChannel.onopen = () => {
            console.log("%c🚀 Canal WebRTC Abierto y Listo", "color: lime; font-weight:bold;");
            document.dispatchEvent(new Event('webrtc-connected'));
        };

        this.dataChannel.onmessage = (event) => {
            if (this.onDataCallback) this.onDataCallback(event.data);
        };
    }

    send(buffer) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(buffer);
        }
    }

    onDataReceived(callback) {
        this.onDataCallback = callback;
    }

    // --- MÉTODOS PARA SEÑALIZACIÓN MANUAL (COPY/PASTE) ---

    async createOfferCode() {
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        
        // Esperamos 2 segundos para recolectar candidatos ICE y empaquetarlos
        return new Promise(resolve => {
            setTimeout(() => {
                const code = JSON.stringify({
                    sdp: this.peerConnection.localDescription,
                    ice: this.candidatesQueue
                });
                resolve(btoa(code)); // Convertimos a Base64 para que sea más fácil copiar
            }, 2000);
        });
    }

    async createAnswerCode(offerString) {
        const remoteData = JSON.parse(atob(offerString));
        
        // 1. Establecer descripción remota
        await this.peerConnection.setRemoteDescription(remoteData.sdp);
        
        // 2. Añadir candidatos ICE del otro lado
        remoteData.ice.forEach(c => this.peerConnection.addIceCandidate(c));

        // 3. Crear respuesta
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        // 4. Esperar y empaquetar nuestra respuesta
        return new Promise(resolve => {
            setTimeout(() => {
                const code = JSON.stringify({
                    sdp: this.peerConnection.localDescription,
                    ice: this.candidatesQueue
                });
                resolve(btoa(code));
            }, 2000);
        });
    }

    async completeConnection(answerString) {
        const remoteData = JSON.parse(atob(answerString));
        await this.peerConnection.setRemoteDescription(remoteData.sdp);
        remoteData.ice.forEach(c => this.peerConnection.addIceCandidate(c));
    }
}