/**
 * /engine/AudioScheduler.js
 * Motor de Audio y Buffer Adaptativo
 * Referencia SRS: REQ-AUD-01, REQ-AUD-02
 */
export class AudioScheduler {
    constructor(timeSync) {
        this.ctx = null;
        this.timeSync = timeSync;
        
        // BUFFER DE SEGURIDAD (Jitter Buffer)
        // En producción esto será dinámico (Slider en la UI). 
        // Para Fase 0 usamos 150ms fijos para asegurar fluidez total.
        this.bufferMs = 150; 
    }

    /**
     * Inicializa el Contexto de Audio.
     * Debe llamarse tras una interacción del usuario (click en botón).
     */
// --- NUEVO MÉTODO ---
setBufferLatency(ms) {
    this.bufferMs = ms;
    console.log(`🎚️ Buffer ajustado a: ${ms}ms`);
}
// --------------------


    async init() {
        // Cross-browser support
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        console.log("🔊 AudioContext Iniciado");


        
    }

    

    /**
     * Recibe un paquete MIDI decodificado y lo agenda en el futuro.
     * @param {Object} midiEvent - { data1, data2, timestamp, status }
     */
    scheduleNote(midiEvent) {
        if (!this.ctx) return;

        // 1. ¿Qué hora es ahora en el "Tiempo Global"?
        const nowGlobal = this.timeSync.getNow();

        // 2. ¿Cuánto tiempo ha pasado desde que se tocó la nota? (Latencia de Red)
        const networkLatency = nowGlobal - midiEvent.timestamp;

        // 3. Calculamos cuándo debe sonar respecto a AHORA
        // Objetivo: Que suene siempre a (Timestamp + Buffer)
        // Restamos lo que ya tardó en llegar.
        let timeToPlayMs = this.bufferMs - networkLatency;

        // Si la red fue terrible y tardó más que el buffer, suena YA (0ms)
        // Esto es un "Buffer Underrun" (Aquí podrías disparar una alerta a la UI)
        if (timeToPlayMs < 0) {
            console.warn(`⚠️ Nota tardía (${Math.abs(timeToPlayMs).toFixed(1)}ms). Aumentar buffer.`);
            timeToPlayMs = 0;
        }

        // 4. Convertir a segundos para Web Audio API
        const timeToPlaySeconds = timeToPlayMs / 1000;
        const when = this.ctx.currentTime + timeToPlaySeconds;

        // 5. Generar Sonido (Simple Oscilador para la prueba)
        this._playOscillator(midiEvent.data1, when, midiEvent.data2);
    }

    // Generador de sonido simple (Senoide)
    _playOscillator(note, when, velocity) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Frecuencia de la nota MIDI
        const freq = 440 * Math.pow(2, (note - 69) / 12);
        osc.frequency.value = freq;

        // Volumen basado en velocidad (0-127)
        const vol = velocity / 127;
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        // Envolvente simple (ADSR muy corto)
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(vol, when + 0.01); // Ataque
        gain.gain.exponentialRampToValueAtTime(0.001, when + 0.5); // Decaimiento

        osc.start(when);
        osc.stop(when + 0.6);
    }
}