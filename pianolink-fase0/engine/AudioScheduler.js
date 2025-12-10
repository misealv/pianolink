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
  /**
     * Recibe un paquete MIDI decodificado y lo agenda en el futuro.
     */
  scheduleNote(midiEvent) {
    if (!this.ctx) return;

    const nowGlobal = this.timeSync.getNow();
    
    // Latencia: Cuánto tiempo "real" viajó por el cable
    // Si (nowGlobal < timestamp), significa que el reloj cree que el mensaje viene del futuro (Clock Skew negativo)
    const networkLatency = nowGlobal - midiEvent.timestamp;

    // Cálculo del momento de reproducción
    let timeToPlayMs = this.bufferMs - networkLatency;

    // --- CORRECCIÓN DE LATENCIA EXTREMA (VÁLVULA DE SEGURIDAD) ---
    
    // CASO 1: La nota llegó tardísimo (Buffer Underrun) -> Tocar YA
    if (timeToPlayMs < 0) {
        // console.warn("⚠️ Late note"); // Descomentar para debug
        timeToPlayMs = 0;
    } 
    
    // CASO 2: La nota viene "del futuro" por más de 1 segundo (Error de Reloj) -> Tocar YA
    // Esto arregla tu problema de los 4 segundos
    else if (timeToPlayMs > 1000) {
        console.warn(`🕒 Error de Sync detectado (${(timeToPlayMs/1000).toFixed(1)}s). Forzando reproducción inmediata.`);
        timeToPlayMs = 0;
    }
    // -------------------------------------------------------------

    const timeToPlaySeconds = timeToPlayMs / 1000;
    const when = this.ctx.currentTime + timeToPlaySeconds;

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