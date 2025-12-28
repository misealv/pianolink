/**
 * AutoMuteManager.js
 * Gestiona la política de silencio automática basada en actividad MIDI.
 * Implementa histéresis para evitar rebotes en la API de Zoom.
 */

export default class AutoMuteManager {
    constructor(socketClient) {
        this.socket = socketClient;
        
        // Configuración
        this.RELEASE_TIME_MS = 2000; // Tiempo de gracia después de soltar la última tecla
        
        // Estado
        this.activeNoteCount = 0;
        this.isMutingStudents = false;
        this.releaseTimer = null;

        // Bindings
        this.handleNoteOn = this.handleNoteOn.bind(this);
        this.handleNoteOff = this.handleNoteOff.bind(this);
    }

    /**
     * Llamar cuando se detecta un NoteOn MIDI local (del profesor)
     */
    handleNoteOn() {
        this.activeNoteCount++;

        // Si hay un temporizador de desbloqueo pendiente, lo cancelamos.
        // Significa que el profesor volvió a tocar dentro del tiempo de gracia.
        if (this.releaseTimer) {
            clearTimeout(this.releaseTimer);
            this.releaseTimer = null;
            console.log('[AutoMute] Frase continuada, cancelando unmute.');
        }

        // Si no estábamos muteando, enviamos la señal INMEDIATAMENTE.
        if (!this.isMutingStudents) {
            this.isMutingStudents = true;
            this.sendMuteCommand(true);
        }
    }

    /**
     * Llamar cuando se detecta un NoteOff MIDI local
     */
    handleNoteOff() {
        this.activeNoteCount--;
        
        // Protección contra conteos negativos (por si se pierden eventos o se inicia con teclas pulsadas)
        if (this.activeNoteCount < 0) this.activeNoteCount = 0;

        // Solo consideramos levantar el silencio si NO hay teclas presionadas
        if (this.activeNoteCount === 0) {
            // Iniciamos el periodo de histéresis (Cooldown)
            this.releaseTimer = setTimeout(() => {
                this.executeUnmute();
            }, this.RELEASE_TIME_MS);
        }
    }

    /**
     * Ejecuta el desbloqueo real después del tiempo de gracia
     */
    executeUnmute() {
        if (this.activeNoteCount === 0) { // Doble verificación
            this.isMutingStudents = false;
            this.releaseTimer = null;
            this.sendMuteCommand(false);
            console.log('[AutoMute] Fin de frase, desmuteando alumnos.');
        }
    }

    /**
     * Envía la orden al servidor vía WebSocket
     * @param {boolean} shouldMute 
     */
    sendMuteCommand(shouldMute) {
        // Evitar envíos redundantes si el socket no está listo
        if (!this.socket) return;

        const event = shouldMute ? 'admin:mute_all_students' : 'admin:unmute_all_students';
        
        console.log(`[AutoMute] Enviando orden: ${event}`);
        
        // Asumiendo que tu SocketClient tiene un método emit o access directo al socket
        // Ajusta esto según tu implementación real de SocketClient.js
        if (this.socket.emit) {
            this.socket.emit(event, { source: 'midi_automute' });
        } else if (this.socket.socket && this.socket.socket.emit) {
            this.socket.socket.emit(event, { source: 'midi_automute' });
        }
    }

    /**
     * Reset de emergencia (pánico)
     */
    reset() {
        this.activeNoteCount = 0;
        if (this.releaseTimer) clearTimeout(this.releaseTimer);
        this.isMutingStudents = false;
        this.sendMuteCommand(false);
    }
}
