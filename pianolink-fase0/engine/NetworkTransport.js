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
        console.log("1. Decodificando Oferta...");
        let remoteData;
        try {
            // Limpieza de espacios en blanco por si acaso
            const cleanStr = offerString.trim();
            remoteData = JSON.parse(atob(cleanStr));
        } catch (e) {
            console.error("Error al decodificar Base64:", e);
            throw new Error("El código de invitación no es válido (Error de formato).");
        }
        
        console.log("2. Configurando Remote Description...");
        // Importante: Reconstruir el objeto RTCSessionDescription correctamente
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(remoteData.sdp));
        
        console.log("3. Añadiendo Candidatos ICE del Profesor...");
        if (remoteData.ice && Array.isArray(remoteData.ice)) {
            for (const candidate of remoteData.ice) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        }

        console.log("4. Creando Respuesta (Answer)...");
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        // Reiniciamos la cola de candidatos locales para enviar solo los nuevos
        // (Aunque para esta prueba simple, enviar todos está bien)
        
        console.log("5. Esperando recolección de candidatos locales (2s)...");
        return new Promise(resolve => {
            setTimeout(() => {
                if (this.candidatesQueue.length === 0) {
                    console.warn("⚠️ Advertencia: No se generaron candidatos ICE locales. Puede que la conexión falle.");
                }
                
                const code = JSON.stringify({
                    sdp: this.peerConnection.localDescription,
                    ice: this.candidatesQueue
                });
                console.log("✅ Respuesta generada con éxito.");
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