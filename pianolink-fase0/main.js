import { MidiProtocol } from './engine/MidiProtocol.js';
import { NetworkTransport } from './engine/NetworkTransport.js';
import { TimeSync } from './engine/TimeSync.js';
import { AudioScheduler } from './engine/AudioScheduler.js';

console.log("=== PIANOLINK FASE 0: REMOTE EDITION ===");

// Instancia ÚNICA
const net = new NetworkTransport();
const protocol = new MidiProtocol();
const timeSync = new TimeSync(net);
const audio = new AudioScheduler(timeSync);
let midiAccess = null;
let isHost = false;

// --- 1. CONFIGURACIÓN MOTORES ---

net.onDataReceived((buffer) => {
    const data = MidiProtocol.decode(buffer);
    if (data) {
        audio.scheduleNote(data);
        console.log(`🎵 Recibido: Nota ${data.data1}`);
    }
});

document.addEventListener('stats-update', (e) => {
    const stats = e.detail;
    document.getElementById('val-rtt').innerText = stats.rtt;
    document.getElementById('val-offset').innerText = stats.offset;
    document.getElementById('val-jitter').innerText = stats.jitter;
});

document.addEventListener('webrtc-connected', () => {
    document.getElementById('connectionStatus').innerText = "✅ CONEXIÓN ESTABLECIDA";
    document.getElementById('connectionStatus').style.color = "lime";
    document.getElementById('step3-box').style.display = 'none'; 
    timeSync.start(isHost);
});

// --- 2. INTERFAZ Y SEÑALIZACIÓN ---

const hostZone = {
    offer: document.getElementById('offerCode'),
    answer: document.getElementById('answerCode'),
    btnCopy: document.getElementById('btnCopyOffer'),
    btnConnect: document.getElementById('btnConnectHost')
};

const guestZone = {
    offer: document.getElementById('offerCodeGuest'),
    answer: document.getElementById('answerCodeGuest'),
    btnProcess: document.getElementById('btnProcessInvite'),
    btnCopy: document.getElementById('btnCopyAnswer')
};

// MODO PROFESOR
document.getElementById('btnHost').addEventListener('click', async () => {
    isHost = true;
    setupUI('host');
    await audio.init();
    await net.init(true);
    
    hostZone.offer.value = "⏳ Generando...";
    const code = await net.createOfferCode();
    hostZone.offer.value = code;
    document.getElementById('hostStep1').style.display = 'block';
    initMidiSystem();
});

hostZone.btnCopy.addEventListener('click', () => copyToClipboard(hostZone.offer, hostZone.btnCopy));

hostZone.btnConnect.addEventListener('click', async () => {
    const answer = hostZone.answer.value.trim();
    if(!answer) return alert("Pega la respuesta del alumno primero.");
    try {
        await net.completeConnection(answer);
    } catch(e) { alert(e.message); }
});

// MODO ALUMNO
document.getElementById('btnGuest').addEventListener('click', async () => {
    isHost = false;
    setupUI('guest');
    await audio.init();
    await net.init(false);
    document.getElementById('guestStep1').style.display = 'block';
    initMidiSystem();
});

guestZone.btnProcess.addEventListener('click', async () => {
    const offer = guestZone.offer.value.trim();
    if(!offer) return alert("Pega la invitación primero.");
    
    const btn = guestZone.btnProcess;
    btn.disabled = true;
    btn.innerText = "⏳ Procesando...";
    
    try {
        const answerCode = await net.createAnswerCode(offer);
        guestZone.answer.value = answerCode;
        document.getElementById('guestStep2').style.display = 'block';
    } catch(e) {
        alert("Error: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "⬇️ Generar Respuesta";
    }
});

guestZone.btnCopy.addEventListener('click', () => copyToClipboard(guestZone.answer, guestZone.btnCopy));

// --- 3. HARDWARE MIDI ---

async function initMidiSystem() {
    try {
        midiAccess = await navigator.requestMIDIAccess();
        const select = document.getElementById('midiInputSelect');
        select.disabled = false;
        select.innerHTML = '<option value="-1">-- Selecciona teclado --</option>';
        
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
                    const now = timeSync.getNow();
                    const buffer = protocol.encode(status, data1, data2, now);
                    net.send(buffer);
                };
            }
        });
        document.getElementById('midiStatus').innerText = "✅ MIDI Listo";
        document.getElementById('midiStatus').style.color = "lime";
    } catch (e) {
        console.error(e);
    }
}

// --- UTILIDADES ---

function setupUI(role) {
    document.getElementById('roleSelector').style.display = 'none';
    document.getElementById('connectionZone').style.display = 'block';
    document.getElementById('roleTitle').innerText = role === 'host' ? 'MODO PROFESOR' : 'MODO ALUMNO';
}

function copyToClipboard(elem, btn) {
    elem.select();
    navigator.clipboard.writeText(elem.value).then(() => {
        const old = btn.innerText;
        btn.innerText = "✅ COPIADO";
        setTimeout(() => btn.innerText = old, 2000);
    });
}

const slider = document.getElementById('bufferSlider');
slider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('bufferValue').innerText = `${val} ms`;
    audio.setBufferLatency(val);
});