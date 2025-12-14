/**
 * Core Engine: Programador de Audio
 * Maneja osciladores web y salidas MIDI físicas con corrección de tiempo.
 */
export class AudioScheduler {
    constructor() {
        this.ctx = null;
        this.midiOutput = null; 
        this.activeVoices = new Map(); // Polifonía: { nota: {osc, gain} }
    }

    async init() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        // Resume necesario por políticas de navegadores
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        console.log("🔊 Motor de Audio V3 iniciado.");
    }

    setMidiOutput(device) {
        this.midiOutput = device;
        console.log(`🎹 Salida Física asignada: ${device.name}`);
    }

    /**
     * Toca una nota inmediatamente (o con el jitter buffer de red)
     * @param {Object} event - { status, data1, data2 } 
     */
    play(event) {
        if (!this.ctx) return;

        const { status, data1, data2 } = event;
        const now = this.ctx.currentTime;

        // Lógica MIDI estándar
        const isNoteOn = (status >= 144 && status <= 159) && data2 > 0;
        const isNoteOff = (status >= 128 && status <= 143) || (status >= 144 && data2 === 0);

        // 1. SONIDO WEB (Sintetizador)
        if (isNoteOn) this._noteOn(data1, data2, now);
        else if (isNoteOff) this._noteOff(data1, now);

        // 2. SONIDO FÍSICO (Relay al piano USB)
        if (this.midiOutput) {
            try {
                // Enviamos sin delay (0) para mínima latencia en V3
                this.midiOutput.send([status, data1, data2]); 
            } catch (e) { console.warn(e); }
        }
    }

    _noteOn(note, velocity, time) {
        this._noteOff(note, time); // Matar voz anterior si existe (re-trigger)

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        // Fórmula de frecuencia MIDI
        osc.frequency.value = 440 * Math.pow(2, (note - 69) / 12);
        
        const vol = velocity / 127;
        
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(vol * 0.2, time + 0.01); // Ataque rápido
        gain.gain.linearRampToValueAtTime(vol * 0.1, time + 0.5);  // Sustain suave

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(time);
        
        this.activeVoices.set(note, { osc, gain });
    }

    _noteOff(note, time) {
        const voice = this.activeVoices.get(note);
        if (voice) {
            // Release suave para evitar "click"
            voice.gain.gain.cancelScheduledValues(time);
            voice.gain.gain.setValueAtTime(voice.gain.gain.value, time);
            voice.gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
            
            voice.osc.stop(time + 0.15);
            this.activeVoices.delete(note);
        }
    }
}