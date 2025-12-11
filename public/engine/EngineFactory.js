/**
 * /engine/EngineFactory.js
 * Patrón Factory: Entrega la instancia correcta del motor.
 */
import { WebRTCEngine } from './implementations/WebRTCEngine.js';

export class EngineFactory {
    /**
     * @param {string} type - Tipo de motor ('v2-webrtc')
     * @returns {IPianoEngine} Instancia del motor
     */
    static create(type = 'v2-webrtc') {
        switch (type) {
            case 'v2-webrtc':
                console.log("🏭 EngineFactory: Creando Motor V2 (WebRTC/UDP)");
                return new WebRTCEngine();
                
            case 'v1-legacy':
                throw new Error("Motor V1 (Legacy) no disponible en esta arquitectura.");
                
            default:
                console.warn(`Motor desconocido '${type}', usando V2 por defecto.`);
                return new WebRTCEngine();
        }
    }
}