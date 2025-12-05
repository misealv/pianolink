// AUDIO: Se encarga del MIDI y el Sonido
let isRecording = false;
let startTime = 0;

export async function iniciarAudio() {
    await Tone.start();
    console.log("Audio Context iniciado");
}

export function pedirPermisoMIDI(callbackNota) {
    if (navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess().then(access => {
            const inputs = access.inputs.values();
            for (let input of inputs) {
                input.onmidimessage = (message) => manejarMensajeMIDI(message, callbackNota);
            }
            console.log("MIDI Conectado 🎹");
        });
    } else {
        alert("Tu navegador no soporta MIDI (Usa Chrome o Edge)");
    }
}

function manejarMensajeMIDI(message, callbackNota) {
    const [command, note, velocity] = message.data;
    
    // 144 es 'Note On' (Nota presionada)
    if (command === 144 && velocity > 0) {
        // Reproducir sonido para feedback
        const synth = new Tone.Synth().toDestination();
        synth.triggerAttackRelease(Tone.Frequency(note, "midi"), "8n");
        
        // Si estamos grabando, enviamos la nota al sistema
        if (isRecording) {
            const tiempoRelativo = Tone.now() - startTime;
            callbackNota({ midi: note, time: tiempoRelativo, velocity: velocity });
        }
    }
}

export function toggleGrabacion(estado) {
    isRecording = estado;
    if (isRecording) {
        startTime = Tone.now(); // Marcamos el tiempo cero
    }
}