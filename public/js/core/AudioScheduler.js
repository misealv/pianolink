/**
 * Core Engine: Programador de Audio (CON JITTER BUFFER)
 * Maneja osciladores web y salidas MIDI físicas con corrección de tiempo.
 */
export class AudioScheduler {
    constructor() {
        this.ctx = null;
        this.midiOutput = null; 
        this.activeVoices = new Map(); // Polifonía: { nota: {osc, gain} }
        
        // --- JITTER BUFFER CONFIG ---
        // 300ms es un valor seguro para transoceánico (Australia->Chile). 
        // Puedes bajarlo a 100ms para conexiones locales.
        this.BUFFER_MS = 300; 
        this.syncOffset = 0;   // Diferencia entre reloj remoto y local
        this.isSynced = false; // ¿Ya sincronizamos la primera nota?
    }

    async init() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        // Resume necesario por políticas de navegadores
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        console.log(`🔊 Motor Audio V3: Buffer de seguridad ${this.BUFFER_MS}ms activo.`);
    }

    setMidiOutput(device) {
        this.midiOutput = device;
        console.log(`🎹 Salida Física asignada: ${device.name}`);
    }

    /**
     * Toca una nota respetando su tiempo original (Anti-Ráfagas)
     * @param {Object} event - { status, data1, data2, timestamp } 
     */
    play(event) {
        if (!this.ctx) return;

        const { status, data1, data2, timestamp } = event; // timestamp viene de MidiProtocol

        // 1. CALCULAR TIEMPO EXACTO (Jitter Correction)
        let scheduledTime = this.ctx.currentTime; // Por defecto: YA

if (timestamp) {
    if (!this.isSynced) {
        this.syncOffset = (this.ctx.currentTime * 1000) - timestamp;
        this.isSynced = true;
    }

    const targetTimeMs = timestamp + this.syncOffset + this.BUFFER_MS;
    scheduledTime = targetTimeMs / 1000;

    // --- CORRECCIÓN DE DERIVA ---
    // Si la nota llega con más de 1.5 segundos de desvío del reloj actual,
    // forzamos una re-sincronización en la siguiente nota.
    if (Math.abs(scheduledTime - this.ctx.currentTime) > 1.5) {
        this.isSynced = false; 
    }

    if (scheduledTime < this.ctx.currentTime) {
        scheduledTime = this.ctx.currentTime;
    }
}

        // Lógica MIDI estándar
        const isNoteOn = (status >= 144 && status <= 159) && data2 > 0;
        const isNoteOff = (status >= 128 && status <= 143) || (status >= 144 && data2 === 0);

        // 2. SONIDO WEB (Sintetizador Agendado)
       // if (isNoteOn) this._noteOn(data1, data2, scheduledTime);
        //else if (isNoteOff) this._noteOff(data1, scheduledTime);

        // 3. SONIDO FÍSICO (Relay al piano USB)
        // Nota: WebMIDI no siempre soporta agendado futuro preciso, 
        // pero intentamos enviar con timestamp si el driver lo permite.
        if (this.midiOutput) {
            try {
                // Calculamos el delay en ms para el send()
                const delay = (scheduledTime - this.ctx.currentTime) * 1000;
                // Si el delay es positivo, lo usamos. Si es negativo, 0.
                const safeDelay = Math.max(0, delay); 
                
                this.midiOutput.send([status, data1, data2], window.performance.now() + safeDelay); 
            } catch (e) { console.warn(e); }
        }
    }

    _noteOn(note, velocity, time) {
        this._noteOff(note, time); // Matar voz anterior

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        // Fórmula de frecuencia MIDI
        osc.frequency.value = 440 * Math.pow(2, (note - 69) / 12);
        
        const vol = velocity / 127;
        
        // Usamos 'time' (futuro) en lugar de 'currentTime' (ahora)
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(vol * 0.2, time + 0.01); // Ataque rápido
        gain.gain.linearRampToValueAtTime(vol * 0.1, time + 0.5);  // Sustain suave

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(time); // <--- AQUÍ ESTÁ LA MAGIA DE LA FLUIDEZ
        
        this.activeVoices.set(note, { osc, gain });
    }

    _noteOff(note, time) {
        const voice = this.activeVoices.get(note);
        if (voice) {
            // Release suave para evitar "click"
            voice.gain.gain.cancelScheduledValues(time);
            voice.gain.gain.setValueAtTime(voice.gain.gain.value, time);
            voice.gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
            
            voice.osc.stop(time + 0.15); // Detener en el futuro
            this.activeVoices.delete(note);
        }
    }
}