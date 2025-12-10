import { MidiProtocol } from './engine/MidiProtocol.js';
import { NetworkTransport } from './engine/NetworkTransport.js';
import { TimeSync } from './engine/TimeSync.js';
import { AudioScheduler } from './engine/AudioScheduler.js';

console.log("=== PIANOLINK FASE 0: REMOTE EDITION (SMART ROUTING) ===");

// --- INSTANCIAS DEL MOTOR ---
const net = new NetworkTransport();
const protocol = new MidiProtocol();
const timeSync = new TimeSync(net);
const audio = new AudioScheduler(timeSync);

let midiAccess = null;
let isHost = false;

// --- 1. CONFIGURACIÓN DE RED Y AUDIO ---

// Cuando recibimos notas del OTRO lado -> Suenan
net.onDataReceived((buffer) => {
    const data = MidiProtocol.decode(buffer);
    if (data) {
        audio.scheduleNote(data);
        // console.log(`🎵 Nota recibida: ${data.data1}`); // Descomentar para debug
    }
});

// Actualizar el HUD (Monitor Negro)
document.addEventListener('stats-update', (e) => {
    const stats = e.detail;
    document.getElementById('val-rtt').innerText = stats.rtt;
    document.getElementById('val-offset').innerText = stats.offset;
    document.getElementById('val-jitter').innerText = stats.jitter;
});

// Cuando la conexión se establece
document.addEventListener('webrtc-connected', () => {
    document.getElementById('connectionStatus').innerText = "✅ CONEXIÓN ESTABLECIDA";
    document.getElementById('connectionStatus').style.color = "lime";
    document.getElementById('step3-box').style.display = 'none'; 
    
    // Iniciar Sincronización de Relojes
    timeSync.start(isHost);
});


// --- 2. INTERFAZ Y SEÑALIZACIÓN (COPY/PASTE) ---

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

// MODO PROFESOR (HOST)
document.getElementById('btnHost').addEventListener('click', async () => {
    isHost = true;
    setupUI('host');
    await audio.init(); // Iniciar AudioContext
    await net.init(true); // true = Initiator
    
    hostZone.offer.value = "⏳ Generando código...";
    const code = await net.createOfferCode();
    hostZone.offer.value = code;
    document.getElementById('hostStep1').style.display = 'block';
    
    // Iniciar sistema MIDI
    initMidiSystem();
});

hostZone.btnCopy.addEventListener('click', () => copyToClipboard(hostZone.offer, hostZone.btnCopy));

hostZone.btnConnect.addEventListener('click', async () => {
    const answer = hostZone.answer.value.trim();
    if(!answer) return alert("Pega primero la respuesta del alumno.");
    try {
        await net.completeConnection(answer);
    } catch(e) { alert(e.message); }
});


// MODO ALUMNO (GUEST)
document.getElementById('btnGuest').addEventListener('click', async () => {
    isHost = false;
    setupUI('guest');
    await audio.init();
    await net.init(false); // false = Receiver
    document.getElementById('guestStep1').style.display = 'block';
    
    // Iniciar sistema MIDI
    initMidiSystem();
});

guestZone.btnProcess.addEventListener('click', async () => {
    const offer = guestZone.offer.value.trim();
    if(!offer) return alert("Pega primero la invitación del profesor.");
    
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


// --- 3. SISTEMA MIDI INTELIGENTE (SMART ROUTING) ---

async function initMidiSystem() {
    try {
        midiAccess = await navigator.requestMIDIAccess();
        
        // Referencias UI
        const selectIn = document.getElementById('midiInputSelect');
        const selectOut = document.getElementById('midiOutputSelect');
        
        // Habilitar selectores
        selectIn.disabled = false;
        selectOut.disabled = false;
        
        // Limpiar listas
        selectIn.innerHTML = '<option value="-1">-- Selecciona Entrada (Tu Teclado) --</option>';
        selectOut.innerHTML = '<option value="-1">-- Selecciona Salida (Sonido) --</option>';

        // Llenar INPUTS
        midiAccess.inputs.forEach(input => {
            const opt = document.createElement('option');
            opt.value = input.id;
            opt.text = input.name;
            selectIn.appendChild(opt);
        });

        // Llenar OUTPUTS
        midiAccess.outputs.forEach(output => {
            const opt = document.createElement('option');
            opt.value = output.id;
            opt.text = output.name;
            selectOut.appendChild(opt);
        });

        // --- LÓGICA PRINCIPAL: CAMBIO DE ENTRADA ---
        selectIn.addEventListener('change', (e) => {
            const inputId = e.target.value;
            const inputPort = midiAccess.inputs.get(inputId);
            
            if(inputPort) {
                console.log(`🔌 Entrada conectada: ${inputPort.name}`);
                
                // 1. Configurar envío de datos a la red
                input.onmidimessage = (msg) => {
                    const [status, data1, data2] = msg.data;
                    if(status >= 240) return; // Ignorar clocks
                    
                    const now = timeSync.getNow();
                    const buffer = protocol.encode(status, data1, data2, now);
                    net.send(buffer);
                };

                // 2. SMART ROUTING (Búsqueda automática de Salida)
                // Buscamos si existe una salida con el MISMO nombre
                const outputs = Array.from(midiAccess.outputs.values());
                const matchingOutput = outputs.find(out => out.name === inputPort.name);

                if (matchingOutput) {
                    console.log(`✨ Coincidencia encontrada: ${matchingOutput.name}`);
                    
                    // Conectar automáticamente en el motor
                    audio.setMidiOutput(matchingOutput);
                    
                    // Actualizar visualmente el selector de salida
                    selectOut.value = matchingOutput.id;
                    
                    // Feedback visual temporal
                    selectOut.style.border = "2px solid lime";
                    setTimeout(() => selectOut.style.border = "1px solid #555", 1000);
                    
                } else {
                    console.log("⚠️ No hay coincidencia exacta. Seleccione manual.");
                }
            }
        });

        // --- LÓGICA SECUNDARIA: CAMBIO DE SALIDA MANUAL ---
        selectOut.addEventListener('change', (e) => {
            const portId = e.target.value;
            if (portId !== "-1") {
                const outputPort = midiAccess.outputs.get(portId);
                if (outputPort) {
                    audio.setMidiOutput(outputPort);
                    console.log(`🎹 Salida manual configurada: ${outputPort.name}`);
                    
                    // Prueba de sonido suave
                    try {
                        outputPort.send([144, 60, 40]); 
                        setTimeout(() => outputPort.send([128, 60, 0]), 200);
                    } catch(err) {}
                }
            }
        });

        document.getElementById('midiStatus').innerText = "✅ MIDI In/Out Listo";
        document.getElementById('midiStatus').style.color = "lime";

    } catch (e) {
        console.error("Error MIDI:", e);
        document.getElementById('midiStatus').innerText = "❌ Error MIDI: " + e.message;
        document.getElementById('midiStatus').style.color = "red";
    }
}


// --- 4. UTILIDADES UI ---

function setupUI(role) {
    document.getElementById('roleSelector').style.display = 'none';
    document.getElementById('connectionZone').style.display = 'block';
    document.getElementById('roleTitle').innerText = role === 'host' ? 'MODO PROFESOR' : 'MODO ALUMNO';
}

function copyToClipboard(textareaElem, btnElem) {
    if (!textareaElem.value) return;
    textareaElem.select();
    navigator.clipboard.writeText(textareaElem.value).then(() => {
        const oldText = btnElem.innerText;
        btnElem.innerText = "✅ ¡COPIADO!";
        btnElem.style.background = "#28a745";
        setTimeout(() => {
            btnElem.innerText = oldText;
            btnElem.style.background = ""; // Volver a original
        }, 2000);
    }).catch(err => {
        console.error('Error copy:', err);
        alert("Copia manual: Ctrl+C");
    });
}

// Control del Slider de Latencia
const slider = document.getElementById('bufferSlider');
if (slider) {
    slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        document.getElementById('bufferValue').innerText = `${val} ms`;
        audio.setBufferLatency(val);
    });
}