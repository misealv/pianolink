/**
 * /engine/NetworkTransport.js
 * Capa de transporte WebRTC Manual (Copy/Paste Friendly)
 */
export class NetworkTransport {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.onDataCallback = null;
        this.candidatesQueue = [];
    }

    async init(isInitiator) {
        const config = {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        };
        this.peerConnection = new RTCPeerConnection(config);

        if (isInitiator) {
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
            console.log("%c🚀 Canal WebRTC Abierto", "color: lime; font-weight:bold;");
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

    // --- MÉTODOS MANUALES ROBUSTOS ---

    async createOfferCode() {
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        
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

    async createAnswerCode(offerString) {
        let remoteData;
        try {
            // LIMPIEZA: Quitamos espacios, saltos de linea y comillas extrañas
            const cleanStr = offerString.replace(/\s/g, '').replace(/"/g, '');
            remoteData = JSON.parse(atob(cleanStr));
        } catch (e) {
            console.error(e);
            throw new Error("El código es inválido. Asegúrate de copiar TODO el texto.");
        }
        
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(remoteData.sdp));
        
        if (remoteData.ice) {
            remoteData.ice.forEach(c => this.peerConnection.addIceCandidate(new RTCIceCandidate(c)));
        }

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

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
        let remoteData;
        try {
            const cleanStr = answerString.replace(/\s/g, '').replace(/"/g, '');
            remoteData = JSON.parse(atob(cleanStr));
        } catch (e) {
            throw new Error("Código de respuesta inválido.");
        }

        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(remoteData.sdp));
        if (remoteData.ice) {
            remoteData.ice.forEach(c => this.peerConnection.addIceCandidate(new RTCIceCandidate(c)));
        }
    }
}