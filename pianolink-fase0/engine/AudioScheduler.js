/**
 * /engine/AudioScheduler.js
 * Motor de Audio + MIDI Out con Buffer Adaptativo
 */
export class AudioScheduler {
    constructor(timeSync) {
        this.ctx = null;
        this.timeSync = timeSync;
        this.bufferMs = 150; 
        this.midiOutput = null; // <--- Referencia al puerto de salida del piano
    }

    async init() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        console.log("🔊 AudioContext Iniciado");
    }

    setBufferLatency(ms) {
        this.bufferMs = ms;
        console.log(`🎚️ Buffer ajustado a: ${ms}ms`);
    }

    // NUEVO: Conectar el puerto de salida
    setMidiOutput(outputDevice) {
        this.midiOutput = outputDevice;
        console.log(`🎹 Salida MIDI configurada hacia: ${outputDevice.name}`);
    }

    scheduleNote(midiEvent) {
        if (!this.ctx) return;

        const nowGlobal = this.timeSync.getNow();
        const networkLatency = nowGlobal - midiEvent.timestamp;
        
        // Calculamos cuándo debe sonar
        let timeToPlayMs = this.bufferMs - networkLatency;

        // --- VÁLVULAS DE SEGURIDAD (Anti-Lag extremo) ---
        if (timeToPlayMs < 0) {
            timeToPlayMs = 0; // Si llegó tarde, tocar YA
        } else if (timeToPlayMs > 1000) {
            console.warn(`🕒 corrección de sync forzada.`);
            timeToPlayMs = 0; // Si viene del futuro lejano, tocar YA
        }

        // 1. SONIDO WEB (Monitor en el navegador)
        const timeToPlaySeconds = timeToPlayMs / 1000;
        const when = this.ctx.currentTime + timeToPlaySeconds;
        this._playOscillator(midiEvent.data1, when, midiEvent.data2);

        // 2. SONIDO FÍSICO (Tu Piano Real)
        // Usamos setTimeout para respetar el buffer calculado por tu algoritmo
        if (this.midiOutput) {
            setTimeout(() => {
                try {
                    // Enviar comando MIDI crudo [Status, Nota, Velocidad]
                    this.midiOutput.send([midiEvent.status, midiEvent.data1, midiEvent.data2]);
                } catch (e) {
                    console.error("Error MIDI Out:", e);
                }
            }, timeToPlayMs);
        }
    }

    _playOscillator(note, when, velocity) {
        // Generador simple de ondas para confirmar que llega señal
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const freq = 440 * Math.pow(2, (note - 69) / 12);
        osc.frequency.value = freq;
        const vol = velocity / 127; 
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(vol * 0.2, when + 0.01); // Volumen bajo para no tapar el piano real
        gain.gain.exponentialRampToValueAtTime(0.001, when + 0.2);
        osc.start(when);
        osc.stop(when + 0.3);
    }
}