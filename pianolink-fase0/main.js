import { MidiProtocol } from './engine/MidiProtocol.js';
import { NetworkTransport } from './engine/NetworkTransport.js';
import { TimeSync } from './engine/TimeSync.js';
import { AudioScheduler } from './engine/AudioScheduler.js';

console.log("=== PIANOLINK FASE 0: REMOTE EDITION ===");

// Instancia ÚNICA para este navegador
const net = new NetworkTransport();
const protocol = new MidiProtocol();
const timeSync = new TimeSync(net);
const audio = new AudioScheduler(timeSync);

// Variables de estado
let midiAccess = null;
let isHost = false;

// --- 1. CONFIGURACIÓN DE AUDIO Y RED ---

// Cuando recibimos datos de la red (del OTRO usuario)
net.onDataReceived((buffer) => {
    const data = MidiProtocol.decode(buffer);
    if (data) {
        // Reproducir sonido
        audio.scheduleNote(data);
        // Feedback visual en consola
        console.log(`🎵 Recibido: Nota ${data.data1}`);
    }
});

// HUD Updates
document.addEventListener('stats-update', (e) => {
    const stats = e.detail;
    document.getElementById('val-rtt').innerText = stats.rtt;
    document.getElementById('val-offset').innerText = stats.offset;
    document.getElementById('val-jitter').innerText = stats.jitter;
});

// Evento cuando la conexión se establece finalmente
document.addEventListener('webrtc-connected', () => {
    document.getElementById('connectionStatus').innerText = "✅ CONEXIÓN ESTABLECIDA";
    document.getElementById('connectionStatus').style.color = "lime";
    document.getElementById('step3-box').style.display = 'none'; // Ocultar pasos de conexión
    
    // Iniciar Sincronización de Relojes
    console.log("Iniciando Sync de relojes...");
    timeSync.start(isHost); // Si soy Host, soy Maestro del reloj
});


// --- 2. LÓGICA DE SEÑALIZACIÓN MANUAL ---

const txtOffer = document.getElementById('offerCode');
const txtAnswer = document.getElementById('answerCode');

// MODO PROFESOR (HOST)
document.getElementById('btnHost').addEventListener('click', async () => {
    isHost = true;
    setupUI('host');
    await audio.init();
    await net.init(true); // true = Initiator

    console.log("Generando invitación...");
    const code = await net.createOfferCode();
    txtOffer.value = code;
    document.getElementById('hostStep1').style.display = 'block';
});

// El Profe pega la respuesta del alumno
document.getElementById('btnConnectHost').addEventListener('click', async () => {
    const answer = txtAnswer.value.trim();
    if(!answer) return alert("Pega el código que te mandó el alumno");
    await net.completeConnection(answer);
});


// MODO ALUMNO (GUEST)
document.getElementById('btnGuest').addEventListener('click', async () => {
    isHost = false;
    setupUI('guest');
    await audio.init();
    await net.init(false); // false = Receiver
    document.getElementById('guestStep1').style.display = 'block';
});

// El Alumno procesa la invitación y genera respuesta
document.getElementById('btnProcessInvite').addEventListener('click', async () => {
    const offer = txtOffer.value.trim();
    if(!offer) return alert("Pega el código de invitación del profesor");
    
    console.log("Procesando invitación...");
    const answerCode = await net.createAnswerCode(offer);
    
    txtAnswer.value = answerCode;
    document.getElementById('guestStep2').style.display = 'block';
});


// --- 3. HARDWARE MIDI (Igual que antes) ---

async function initMidiSystem() {
    try {
        midiAccess = await navigator.requestMIDIAccess();
        const select = document.getElementById('midiInputSelect');
        select.disabled = false;
        select.innerHTML = '<option value="-1">-- Selecciona tu teclado --</option>';
        
        midiAccess.inputs.forEach(input => {
            const opt = document.createElement('option');
            opt.value = input.id;
            opt.text = input.name;
            select.appendChild(opt);
        });

        select.addEventListener('change', (e) => {
            const input = midiAccess.inputs.get(e.target.value);
            if(input) {
                input.onmidimessage = (msg) => {
                    const [status, data1, data2] = msg.data;
                    if(status >= 240) return;

                    // Enviar a la red
                    const now = timeSync.getNow();
                    const buffer = protocol.encode(status, data1, data2, now);
                    net.send(buffer);
                    
                    // REQ: Feedback local (sonido local opcional, aquí solo log)
                    // audio.scheduleNote(...) <-- Si quieres escucharte a ti mismo, descomenta
                };
            }
        });
        document.getElementById('midiStatus').innerText = "✅ MIDI Listo";
        document.getElementById('midiStatus').style.color = "lime";

    } catch (e) {
        console.error(e);
    }
}

// Iniciar MIDI al cargar (o tras interacción)
document.getElementById('btnHost').addEventListener('click', initMidiSystem);
document.getElementById('btnGuest').addEventListener('click', initMidiSystem);


// --- UI Helpers ---
function setupUI(role) {
    document.getElementById('roleSelector').style.display = 'none';
    document.getElementById('connectionZone').style.display = 'block';
    document.getElementById('roleTitle').innerText = role === 'host' ? 'MODO PROFESOR (HOST)' : 'MODO ALUMNO (GUEST)';
}

// Slider
const slider = document.getElementById('bufferSlider');
slider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('bufferValue').innerText = `${val} ms`;
    audio.setBufferLatency(val);
});