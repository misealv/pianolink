/* public/js/modules/AudioEngine.js */
import { AudioScheduler } from '../core/AudioScheduler.js';

export class AudioEngine {
    constructor(eventBus) {
        this.bus = eventBus;
        this.scheduler = new AudioScheduler();
        this.midiAccess = null;
        this.soloUserId = null;
    }

    async init() {
        // Inicializar AudioContext
        await this.scheduler.init();
        
        // Inicializar WebMIDI si está disponible
        if (navigator.requestMIDIAccess) {
            try {
                this.midiAccess = await navigator.requestMIDIAccess();
                this.scanDevices();
                
                // Escuchar cambios de conexión USB (caliente)
                this.midiAccess.onstatechange = () => this.scanDevices();
                console.log("🎹 Motor MIDI: Listo y escuchando.");
            } catch (e) {
                console.warn("WebMIDI no soportado o denegado:", e);
            }
        }
    }

    scanDevices() {
        if (!this.midiAccess) return;
        const inputs = Array.from(this.midiAccess.inputs.values());
        const outputs = Array.from(this.midiAccess.outputs.values());
        
        this.updateSelects(inputs, outputs);
        
        // Reconectar listeners
        inputs.forEach(i => {
            i.onmidimessage = (msg) => {
                const [s, d1, d2] = msg.data;
                // Ignorar Clock/SysEx (248+)
                if (s >= 248) return;
                this.bus.emit('local-note', { status: s, data1: d1, data2: d2 });
            };
        });
    }

    updateSelects(inputs, outputs) {
        const inSelect = document.getElementById('midiInputSelect');
        const outSelect = document.getElementById('midiOutputSelect');
        
        if(inSelect) {
            inSelect.innerHTML = '<option value="">-- Entrada MIDI --</option>';
            inputs.forEach(i => inSelect.innerHTML += `<option value="${i.id}">${i.name}</option>`);
        }
        if(outSelect) {
            outSelect.innerHTML = '<option value="">-- Salida (Sonido) --</option>';
            outputs.forEach(o => outSelect.innerHTML += `<option value="${o.id}">${o.name}</option>`);
            
            outSelect.onchange = (e) => {
                const device = outputs.find(o => o.id === e.target.value);
                if(device) this.scheduler.setMidiOutput(device);
            };
        }
    }

    playRemote(data) {
        // Si hay modo "Solo" y no es el usuario elegido, silenciar
        if (this.soloUserId && data.userId !== this.soloUserId) return;
        
        // Pasar al Scheduler para el Jitter Buffer
        this.scheduler.play(data);
    }

    resume() {
        if (this.scheduler.ctx && this.scheduler.ctx.state === 'suspended') {
            this.scheduler.ctx.resume();
        }
    }
    
    setSoloUser(userId) {
        this.soloUserId = userId;
    }
}