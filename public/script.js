const socket = io();

// DOM References
const statusDiv = document.getElementById("status");
const inputName = document.getElementById("inputName");
const codigoSala = document.getElementById("codigoSala");
const btnCrear = document.getElementById("btnCrear");
const btnUnirse = document.getElementById("btnUnirse");
const inviteLink = document.getElementById("inviteLink");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const copyStatus = document.getElementById("copyStatus");
const roleIndicator = document.getElementById("roleIndicator");
const liveStatus = document.getElementById("liveStatus");
const liveBadge = document.getElementById("liveBadge");
const piano = document.getElementById("piano");
const pedalIndicator = document.getElementById("pedalIndicator");
const panicBtn = document.getElementById("panicBtn");

const participantsList = document.getElementById("participantsList");
const logDiv = document.getElementById("log");
const toggleMidiOut = document.getElementById("toggleMidiOut");
const midiOutputSelect = document.getElementById("midiOutputSelect");
const masterclassSection = document.getElementById("masterclassSection");
const masterclassToggle = document.getElementById("masterclassToggle");
const clearLiveBtn = document.getElementById("clearLiveBtn");
const teacherRoleLabel = document.getElementById("teacherRoleLabel");

const chordDisplay = document.getElementById("chordDisplay");
const staffContainer = document.getElementById("staffContainer");

// Logic Vars


let rol = "teacher";
let myName = "";
let salaActual = null;
let mySocketId = null;

let participants = [];
let listeningTo = new Set();
let liveStudentId = null;
let masterclassEnabled = false;

let midiOutput = null;
let midiAccess = null;
let enableMidiOut = false;

let lockStudentRole = false;
let lastPedalTime = 0; // <--- AGREGA ESTO

// Board Logic
let teacherActiveNotes = new Set();
let heldNotes = new Set();
let sustainActive = false;
let renderTimeout = null; // [MEJORA 4: DEBOUNCE]

/* ------------ UTILIDADES UI (LOG MEJORADO) ------------ */

// [MEJORA 1: LOG MEJORADO] Timestamp + Colores
function log(msg, type = 'info') {
  const el = document.createElement("div");
  
  const time = new Date().toLocaleTimeString([], { hour12: false });
  el.textContent = `[${time}] ${msg}`;
  
  if (type === 'error') el.style.color = 'var(--danger)';
  else if (type === 'warn') el.style.color = '#f1c40f';
  else if (type === 'success') el.style.color = 'var(--success)';
  
  logDiv.appendChild(el);
  logDiv.scrollTop = logDiv.scrollHeight;
}

function updateStatus(msg) {
  statusDiv.textContent = msg;
}

function getInviteUrl() {
  if (!salaActual) return "";
  return window.location.origin + "/?role=student&sala=" + salaActual;
}

function updateInviteLink() {
  if (!salaActual) {
    inviteLink.textContent = "Esperando sala...";
    return;
  }
  const url = getInviteUrl();
  inviteLink.textContent = url;
}

function updateRoleIndicator() {
  if (rol === "teacher") {
    roleIndicator.textContent = "PROFESOR";
    roleIndicator.style.background = "var(--prof-color)";
    roleIndicator.style.color = "#000";
  } else {
    roleIndicator.textContent = "ALUMNO";
    roleIndicator.style.background = "var(--alum-color)";
    roleIndicator.style.color = "#000";
  }
}

function updateLiveBadge() {
  if (!liveBadge) return;
  if (rol === "student" && masterclassEnabled && liveStudentId === mySocketId) {
    liveBadge.classList.add("visible");
  } else {
    liveBadge.classList.remove("visible");
  }
}

function updateLiveStatusUI() {
  if (!liveStatus) return;

  if (rol === "teacher") {
    if (masterclassEnabled && liveStudentId) {
      liveStatus.textContent = "BROADCAST ACTIVO";
      liveStatus.style.color = "var(--danger)";
    } else {
      liveStatus.textContent = "MONITORIZACIÓN LOCAL";
      liveStatus.style.color = "var(--text-muted)";
    }
  } else {
    if (masterclassEnabled && liveStudentId === mySocketId) {
      liveStatus.textContent = "ESTÁS EN EL AIRE";
      liveStatus.style.color = "var(--danger)";
    } else if (masterclassEnabled && liveStudentId) {
      liveStatus.textContent = "ESCUCHANDO COMPAÑERO";
      liveStatus.style.color = "var(--text-muted)";
    } else {
      liveStatus.textContent = "PRACTICA LOCAL";
      liveStatus.style.color = "var(--text-muted)";
    }
  }
  updateLiveBadge();
}

/* ------------ SOCKET.IO (MEJORADO) ------------ */

socket.on("connect", () => {
  mySocketId = socket.id;
  updateStatus("ONLINE ✔️");

  // [MEJORA 2: RECONEXIÓN AUTOMÁTICA]
  if (salaActual && myName) {
    log(`🔄 Reconexión detectada. Reingresando a sala ${salaActual}...`, 'warn');
    socket.emit("join-room", { 
        roomCode: salaActual, 
        username: myName, 
        userRole: rol 
    });
  } else {
    log("🟢 Conectado al servidor.", 'success');
  }
});

socket.on("disconnect", (reason) => {
  updateStatus("OFFLINE ❌");
  log(`🔴 Desconectado: ${reason}`, 'error');
});

socket.on("connect_error", (err) => {
  updateStatus("RETRYING...");
  log(`⚠️ Error de conexión: ${err.message}`, 'warn');
});

socket.on("room-users", (users) => {
  participants = users || [];
  renderParticipants();
});

socket.on("live-student-changed", (payload) => {
  liveStudentId = payload && payload.liveStudentId ? payload.liveStudentId : null;
  masterclassEnabled = !!liveStudentId;

  if (rol === "teacher" && masterclassToggle) {
    masterclassToggle.checked = masterclassEnabled;
  }

  renderParticipants();
  updateLiveStatusUI();
});

socket.on("midi-message", (msg) => {
  handleRemoteOrLocalNote(msg);
});


// --- NUEVO: EL PROFE RESPONDE A PETICIONES DE SINCRONIZACIÓN ---
socket.on("teacher-sync-request", (requestingSocketId) => {
   if (rol === 'teacher') {
       // Empaquetamos las notas que el profe tiene activas AHORA MISMO
       const activeNotesArray = Array.from(teacherActiveNotes);
       
       socket.emit("midi-message", {
           type: "board-sync", // Mensaje especial de reparación
           roomCode: salaActual,
           notes: activeNotesArray,
           timestamp: Date.now()
       });
       log("🔄 Enviando reparación de pizarra al alumno...", "info");
   }
});


socket.on("room-joined", (code) => {
  salaActual = code;
  log("✅ Te has unido correctamente a la sala " + code, 'success');
  updateStatus("EN SALA: " + code);

  // --- NUEVO: PEDIR ESTADO ACTUAL DE LA PIZARRA ---
  log("🔄 Sincronizando pizarra...", 'warn');
  socket.emit("request-full-state", code);
  // ------------------------------------------------

  if (rol === "student") {
      const btn = document.getElementById("btnUnirse");
      const input = document.getElementById("codigoSala");
      if(btn) {
          btn.textContent = "DENTRO";
          btn.disabled = true;
          btn.style.background = "var(--success)";
          btn.style.color = "#000";
      }
      if(input) input.disabled = true;
  }
});
/* ------------ BOTÓN COPIAR ENLACE ------------ */

copyLinkBtn.addEventListener("click", async () => {
  const url = getInviteUrl();
  if (!url) {
    copyStatus.style.color = "var(--danger)";
    copyStatus.textContent = "Crea una sala primero.";
    setTimeout(() => (copyStatus.textContent = ""), 2500);
    return;
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const temp = document.createElement("textarea");
      temp.value = url;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      document.body.removeChild(temp);
    }
    copyStatus.style.color = "var(--success)";
    copyStatus.textContent = "Copiado.";
  } catch (e) {
    copyStatus.textContent = "Error al copiar.";
  }
  setTimeout(() => (copyStatus.textContent = ""), 2500);
});

/* ------------ SELECCIÓN DE ROL ------------ */

document.querySelectorAll("input[name=rol]").forEach(radio => {
  radio.addEventListener("change", () => {
    const requestedRole = radio.value;
    if (lockStudentRole && requestedRole === "teacher") {
      document.querySelector('input[name=rol][value="student"]').checked = true;
      rol = "student";
    } else if (radio.checked) {
      rol = requestedRole;
    }

    document.getElementById("cardCrearSala").style.display =
      (rol === "teacher") ? "block" : "none";
    document.getElementById("cardUnirseSala").style.display =
      (rol === "teacher") ? "none" : "block";

    if (masterclassSection) {
      masterclassSection.style.display = (rol === "teacher") ? "block" : "none";
    } else if(rol === "teacher") {
         document.getElementById("masterclassSection").classList.remove("hidden");
    } else {
         document.getElementById("masterclassSection").classList.add("hidden");
    }

    updateRoleIndicator();
    updateLiveStatusUI();
  });
});

if (rol === "teacher") {
    if(masterclassSection) masterclassSection.classList.remove("hidden");
    document.getElementById("cardCrearSala").style.display = "block";
    document.getElementById("cardUnirseSala").style.display = "none";
}

updateRoleIndicator();
updateLiveStatusUI();

/* ------------ PARTICIPANTES ------------ */

function renderParticipants() {
  participantsList.innerHTML = "";
  if (!participants.length) {
    const d = document.createElement("div");
    d.style.color = "var(--text-muted)";
    d.textContent = "Nadie conectado.";
    participantsList.appendChild(d);
    return;
  }

  const soyProfe = (rol === "teacher");

  participants.forEach(u => {
    const row = document.createElement("div");
    row.className = "participant-row";

    const left = document.createElement("div");
    const n = document.createElement("span");
    n.style.fontWeight = "bold";
    n.textContent = u.name;
    const r = document.createElement("span");
    r.style.marginLeft = "6px";
    r.style.fontSize = "10px";
    r.style.color = "var(--text-muted)";
    r.textContent = (u.role === "teacher" ? "[PROFE]" : "[ALUMNO]");
    left.appendChild(n);
    left.appendChild(r);

    const right = document.createElement("div");

    if (soyProfe && u.role !== "teacher" && u.socketId !== mySocketId) {
      // Checkbox "Escuchar"
      const listenLabel = document.createElement("label");
      listenLabel.style.display="inline"; 
      listenLabel.style.marginRight="8px";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = (listeningTo.size === 0) || listeningTo.has(u.socketId);
      cb.addEventListener("change", () => toggleListen(u.socketId, cb.checked));
      listenLabel.appendChild(cb);
      listenLabel.appendChild(document.createTextNode(" CUE"));
      right.appendChild(listenLabel);

      // Radio "En Vivo"
      const liveLabel = document.createElement("label");
      liveLabel.style.display="inline";
      const rb = document.createElement("input");
      rb.type = "radio";
      rb.name = "liveStudent";
      rb.checked = (liveStudentId === u.socketId);
      rb.addEventListener("change", () => {
        if (rb.checked) {
          masterclassToggle.checked = true;
          sendLiveStudent(u.socketId);
        }
      });
      liveLabel.appendChild(rb);
      liveLabel.appendChild(document.createTextNode(" ON AIR"));
      right.appendChild(liveLabel);
    } else if (u.socketId === mySocketId) {
      right.textContent = " (Tú)";
      right.style.fontSize = "10px";
      right.style.color = "var(--text-muted)";
    }

    row.appendChild(left);
    row.appendChild(right);
    participantsList.appendChild(row);
  });
}

function toggleListen(id, checked) {
  if (checked) listeningTo.add(id);
  else listeningTo.delete(id);
}

function sendLiveStudent(studentSocketId) {
  if (!salaActual) return;
  liveStudentId = studentSocketId || null;
  masterclassEnabled = !!liveStudentId;
  socket.emit("set-live-student", {
    roomCode: salaActual,
    studentSocketId: liveStudentId
  });
  updateLiveStatusUI();
  renderParticipants();
}

if (masterclassToggle) {
  masterclassToggle.addEventListener("change", () => {
    if (!masterclassToggle.checked) {
      sendLiveStudent(null);
    } else {
      if (liveStudentId) sendLiveStudent(liveStudentId);
    }
  });
}

if (clearLiveBtn) {
  clearLiveBtn.addEventListener("click", () => {
    sendLiveStudent(null);
    if (masterclassToggle) masterclassToggle.checked = false;
  });
}

/* ------------ CREAR / UNIR SALA ------------ */

btnCrear.addEventListener("click", () => {
  const name = inputName.value.trim();
  if (!name) return alert("Ingresa tu nombre.");
  myName = name;
  socket.emit("create-room", { username: name, userRole: "teacher" });
  log("Creando sala...");
});

socket.on("room-created", (roomCode) => {
  salaActual = roomCode;
  codigoSala.value = roomCode; 
  updateInviteLink();
  log("Sala ID: " + roomCode, 'success');
});

btnUnirse.addEventListener("click", () => {
  const name = inputName.value.trim();
  if (!name) return alert("Ingresa tu nombre.");
  const code = codigoSala.value.trim().toUpperCase();
  if (!code) return alert("Ingresa el código.");
  myName = name;
  salaActual = code;
  socket.emit("join-room", { roomCode: code, username: name, userRole: rol });
  log("Uniéndose a " + code + "...");
});

/* ------------ INICIALIZAR DESDE URL ------------ */

(function initFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlRole = params.get("role");
    const urlSala = params.get("sala") || params.get("room");

    if (urlSala) {
      salaActual = urlSala.toUpperCase();
      codigoSala.value = salaActual; 
    }

    if (urlRole && urlRole.toLowerCase() === "student") {
      rol = "student";
      lockStudentRole = true;
      const studentRadio = document.querySelector('input[name="rol"][value="student"]');
      const teacherRadio = document.querySelector('input[name="rol"][value="teacher"]');
      if (studentRadio) studentRadio.checked = true;
      if (teacherRadio) {
        teacherRadio.checked = false;
        teacherRadio.disabled = true;
      }
      if (teacherRoleLabel) teacherRoleLabel.style.display = "none";

      document.getElementById("cardCrearSala").style.display = "none";
      document.getElementById("cardUnirseSala").style.display = "block";
      if (masterclassSection) masterclassSection.classList.add("hidden");
    }

    updateRoleIndicator();
    updateLiveStatusUI();
  } catch (e) {
    console.warn("URL Params Error", e);
  }
})();

/* ------------ WEB MIDI (CON PROTECCIÓN DE BUCLE) ------------ */

const midiInputSelect = document.getElementById("midiInputSelect");
let activeInput = null;

if (navigator.requestMIDIAccess) {
  navigator.requestMIDIAccess().then(onMIDISuccess, err => {
    log("MIDI Access Error: " + err, 'error');
  });
} else {
  log("Browser MIDI not supported.", 'warn');
}

function onMIDISuccess(access) {
  midiAccess = access;
  refreshDevices();
  
  access.onstatechange = (e) => {
    // Solo refrescar si cambia la conexión física
    if (e.port.state === "connected" || e.port.state === "disconnected") {
        refreshDevices();
    }
  };
}

function refreshDevices() {
  if (!midiAccess) return;

  // 1. Llenar Select de SALIDAS
  const currentOut = midiOutputSelect.value;
  midiOutputSelect.innerHTML = '<option value="">(ninguna)</option>';
  for (let output of midiAccess.outputs.values()) {
    const opt = document.createElement("option");
    opt.value = output.id;
    opt.textContent = output.name;
    midiOutputSelect.appendChild(opt);
  }
  if (currentOut) midiOutputSelect.value = currentOut;

  // 2. Llenar Select de ENTRADAS (¡Aquí está la protección!)
  const currentIn = midiInputSelect.value;
  // Eliminamos la opción automática "Todas". Ahora el usuario DEBE elegir.
  midiInputSelect.innerHTML = '<option value="">(Selecciona tu Piano...)</option>';
  
  for (let input of midiAccess.inputs.values()) {
    const opt = document.createElement("option");
    opt.value = input.id;
    opt.textContent = input.name;
    midiInputSelect.appendChild(opt);
  }
  if (currentIn) midiInputSelect.value = currentIn;
  
  updateInputListener();
}

// Cuando el usuario cambia la entrada en el menú
midiInputSelect.addEventListener("change", updateInputListener);

function updateInputListener() {
    if (!midiAccess) return;
    
    // 1. Desconectar todo lo anterior (Romper el bucle)
    for (let input of midiAccess.inputs.values()) {
        input.onmidimessage = null; 
    }

    const selectedId = midiInputSelect.value;
    const selectedName = midiInputSelect.options[midiInputSelect.selectedIndex]?.text;

    if (selectedId) {
        const input = midiAccess.inputs.get(selectedId);
        if (input) {
            // PROTECCIÓN EXTRA: Si eliges el IAC Driver como entrada, te avisamos
            if (selectedName.includes("IAC") || selectedName.includes("loopMIDI")) {
                log("⚠️ CUIDADO: Has seleccionado un cable virtual como entrada.", "warn");
            }

            input.onmidimessage = handleLocalMIDIMessage;
            log(`MIDI In: Escuchando solo a [${input.name}]`, 'success');
        }
    } else {
        log("MIDI In: Desactivado.", 'warn');
    }
}

midiOutputSelect.addEventListener("change", () => {
  const id = midiOutputSelect.value;
  midiOutput = id ? midiAccess.outputs.get(id) : null;
});

toggleMidiOut.addEventListener("change", () => {
  enableMidiOut = toggleMidiOut.checked;
  if (enableMidiOut) log("Salida MIDI activada.", "info");
  else log("Salida MIDI desactivada.", "info");
});

/* ------------ MANEJO DE MENSAJES LOCALES (LA PIEZA PERDIDA) ------------ */
function handleLocalMIDIMessage(event) {
  const [status, data1, data2] = event.data;
  const cmd = status & 0xf0;
  const note = data1;
  const velocity = data2;

  // 1. MANEJO DE NOTAS
  if (cmd === 0x90 || cmd === 0x80) {
    const isNoteOn = (cmd === 0x90 && velocity > 0);
    
    // A. Pintar en mi pantalla (Feedback visual inmediato)
    lightKey(note, isNoteOn, velocity);
    
    // B. Actualizar Pizarra (Solo si soy Profe)
    if (rol === 'teacher') updateMusicBoard(note, isNoteOn);

    // C. Enviar a sintetizador externo (Si está activado)
    if (enableMidiOut && midiOutput) {
      try { midiOutput.send([cmd, note, velocity]); } catch (e) {}
    }

    // D. Enviar al Servidor (Para que lo vea el alumno)
    if (salaActual) {
      socket.emit("midi-message", {
        type: "note", 
        command: cmd, 
        note, 
        velocity, 
        fromRole: rol, 
        roomCode: salaActual,
        timestamp: Date.now()
      });
    }
  }

  // 2. MANEJO DE PEDAL (CON FRENO ANTI-RÁFAGA)
  if (cmd === 0xB0) {
    const controller = data1;
    const value = data2;

    if (controller === 64) { // Pedal Sustain
       const now = Date.now();
       // Filtro: Solo pasa si han pasado 50ms O si es soltar (0) O pisar a fondo (127)
       if (value === 0 || value === 127 || (now - lastPedalTime > 50)) {
           lastPedalTime = now;
           
           updatePedalVisual(value);
           if (rol === 'teacher') handleTeacherPedal(value);

           if (salaActual) {
             socket.emit("midi-message", {
               type: "cc", 
               status, 
               controller, 
               value, 
               fromRole: rol, 
               roomCode: salaActual,
               timestamp: Date.now()
             });
           }
       }
    } else {
       // Otros controladores (Modulation, Pitch Bend)
       if (salaActual) {
          socket.emit("midi-message", { type: "cc", status, controller, value, fromRole: rol, roomCode: salaActual, timestamp: Date.now() });
       }
    }
  }
}

/* ------------ PIANO VISUAL (REESCRITO MATEMÁTICAMENTE) ------------ */

let currentBaseColor = "#ff764d"; // Matches CSS Accent
let isSplitActive = false;
let splitPoint = 60; 
let currentLeftColor = "#5dade2";
let currentRightColor = "#f1c40f";

const baseColorPicker = document.getElementById("baseColorPicker");
const chkSplit = document.getElementById("chkSplit");
const splitControlsDiv = document.getElementById("splitControls");
const splitPointInput = document.getElementById("splitPointInput");
const leftColorPicker = document.getElementById("leftColorPicker");
const rightColorPicker = document.getElementById("rightColorPicker");

if(baseColorPicker) baseColorPicker.addEventListener("input", (e) => currentBaseColor = e.target.value);
if(chkSplit) {
  chkSplit.addEventListener("change", (e) => {
    isSplitActive = e.target.checked;
    if(isSplitActive) splitControlsDiv.classList.remove("hidden");
    else splitControlsDiv.classList.add("hidden");
  });
}
if(splitPointInput) splitPointInput.addEventListener("input", (e) => splitPoint = parseInt(e.target.value));
if(leftColorPicker) leftColorPicker.addEventListener("input", (e) => currentLeftColor = e.target.value);
if(rightColorPicker) rightColorPicker.addEventListener("input", (e) => currentRightColor = e.target.value);

buildPiano();

function buildPiano() {
  // MEJORA MATEMÁTICA: Anchos fijos y cálculo relativo a teclas blancas
  const WHITE_KEY_WIDTH = 24; 
  const BLACK_KEY_WIDTH = 14; 
  
  piano.innerHTML = "";
  
  // Total white keys from 21 (A0) to 108 (C8) is 52.
  // Width = 52 * 24 = 1248px + padding
  piano.style.width = ((52 * WHITE_KEY_WIDTH) + 20) + "px";

  let whiteKeyIndex = 0;

  for (let note = 21; note <= 108; note++) {
    // Pattern of MIDI notes starting at C (0): W, B, W, B, W, W, B, W, B, W, B, W
    // A0 is 21. 21 % 12 = 9 (A). 
    // Indices in octave: 0=C, 1=C#, 2=D, 3=D#, 4=E, 5=F, 6=F#, 7=G, 8=G#, 9=A, 10=A#, 11=B
    const octaveIndex = note % 12;
    const isWhite = [0, 2, 4, 5, 7, 9, 11].includes(octaveIndex);

    const key = document.createElement("div");
    key.dataset.note = note;

    if (isWhite) {
        key.className = "key white-key";
        key.style.left = (whiteKeyIndex * WHITE_KEY_WIDTH) + "px";
        key.style.width = WHITE_KEY_WIDTH + "px";
        whiteKeyIndex++;
    } else {
        key.className = "key black-key";
        // LOGICA: La tecla negra va entre la tecla blanca anterior (whiteKeyIndex - 1)
        // y la actual (que se dibujará después).
        // Posición borde derecho tecla blanca anterior: (whiteKeyIndex * WHITE_KEY_WIDTH)
        // Restamos mitad del ancho negro para centrar.
        key.style.left = ((whiteKeyIndex * WHITE_KEY_WIDTH) - (BLACK_KEY_WIDTH / 2)) + "px";
        key.style.width = BLACK_KEY_WIDTH + "px";
    }
    piano.appendChild(key);
  }
}

function hexToRgb(hex) {
  const bigint = parseInt(hex.replace('#', ''), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r},${g},${b}`;
}

function lightKey(note, on = true, velocity = 127) {
  // Busca el elemento HTML de la tecla correspondiente
  const k = piano.querySelector(`.key[data-note='${note}']`);
  if (!k) return;

  if (on) {
    // 1. Determinar el color base (Split o Normal)
    let targetHex = currentBaseColor;
    if (isSplitActive) {
        targetHex = (note < splitPoint) ? currentLeftColor : currentRightColor;
    }

    // 2. CÁLCULO DE OPACIDAD (Aquí está la magia)
    // velocity va de 0 a 127.
    // Math.pow hace que la curva sea exponencial, no lineal.
    // Esto exagera el efecto: si tocas suave, será MUY transparente.
    // Si tocas fuerte, será totalmente sólido.
    let alpha = Math.pow(velocity / 127, 2); 

    // Limites de seguridad para que siempre se vea algo (mínimo 0.15)
    if (alpha < 0.15) alpha = 0.15; 
    if (alpha > 1.0) alpha = 1.0;

    const rgb = hexToRgb(targetHex);

    // 3. Aplicar el color
    k.classList.add("note-active");
    // El color se pinta sobre la tecla. 
    // Alpha bajo = Se ve el color de fondo de la tecla (Blanco/Negro) = "Claro"
    // Alpha alto = Se ve el color naranja a tope = "Oscuro/Sólido"
    k.style.backgroundColor = `rgba(${rgb}, ${alpha})`; 
  } else {
    // Al soltar la tecla, quitamos el color y la clase
    k.classList.remove("note-active");
    k.style.backgroundColor = ""; 
  }
}

function updatePedalVisual(value) {
  const active = value >= 64;
  if (!pedalIndicator) return;
  if (active) pedalIndicator.classList.add("active");
  else pedalIndicator.classList.remove("active");
}

function handleTeacherPedal(value) {
  const isDown = value >= 64;
  sustainActive = isDown;
  if (!isDown) {
    teacherActiveNotes = new Set(heldNotes);
    // [MEJORA 4: DEBOUNCE EN PEDAL]
    if (renderTimeout) clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => {
      renderMusicBoard();
    }, 50);
  }
}

/* ------------ MIDI REMOTO ------------ */

function handleRemoteOrLocalNote(msg) {

  // --- NUEVO: BLOQUE DE REPARACIÓN DE PIZARRA ---
  if (msg.type === "board-sync") {
     if (rol === 'student') {
         // 1. Borramos nuestra pizarra corrupta
         teacherActiveNotes.clear();
         heldNotes.clear();
         
         // 2. Copiamos la verdad del profesor
         msg.notes.forEach(n => {
             teacherActiveNotes.add(n);
             heldNotes.add(n);
         });

         // 3. Renderizamos forzosamente
         renderMusicBoard();
         log("✅ Pizarra reparada y sincronizada.", "success");
     }
     return; // No hacemos nada más con este mensaje
  }
  // ------------------------------------------------
  let cmd, note, velocity, role, type, fromSocketId = msg.fromSocketId || null;

  // [MEJORA 3: FILTRO ANTI-RÁFAGA RECEPTOR]
  if (msg.timestamp) {
      const latency = Date.now() - msg.timestamp;
      if (latency > 2000) {
          log(`⛔ RÁFAGA BLOQUEADA: Datos viejos (${latency}ms).`, 'error');
          return; // Ignorar esta nota vieja
      }
      if (latency > 300) {
          log(`⚠️ Lag alto: ${latency}ms`, 'warn');
      }
  }

  if (msg.type === "raw_midi") {
    cmd = msg.command; note = msg.note; velocity = msg.velocity; role = msg.fromRole; type = "raw";
  } else if (msg.type === "note") {
    cmd = msg.command & 0xf0; note = msg.note; velocity = msg.velocity; role = msg.fromRole; type = "remote";
  } else {
    return handleOtherMessages(msg);
  }

  const isNoteOn = (cmd === 0x90 && velocity > 0);
  lightKey(note, isNoteOn, velocity);

  if (role === 'teacher') updateMusicBoard(note, isNoteOn);

  const soyProfe = (rol === "teacher");
  const vieneDeProfe = (role === "teacher");
  let deboReproducir = false;

  if (enableMidiOut && midiOutput) {
    if (soyProfe) {
      if (!vieneDeProfe) deboReproducir = true;
    } else {
      if (vieneDeProfe) deboReproducir = true;
      else if (masterclassEnabled && liveStudentId && fromSocketId === liveStudentId && fromSocketId !== mySocketId) {
        deboReproducir = true;
      }
    }
  }

  if (soyProfe && !vieneDeProfe && deboReproducir) {
    if (listeningTo.size > 0 && fromSocketId && !listeningTo.has(fromSocketId)) deboReproducir = false;
  }

  if (deboReproducir) {
    try { midiOutput.send([isNoteOn ? 0x90 : 0x80, note, velocity]); } catch (e) {}
  }
}

function handleOtherMessages(msg) {
  if (msg.type === "raw_midi") {
    if ((msg.command & 0xf0) === 0xb0 && msg.note === 64) updatePedalVisual(msg.velocity);
    return;
  }
  if (msg.type === "cc" && msg.controller === 64) {
    updatePedalVisual(msg.value);
    if (msg.fromRole === 'teacher') handleTeacherPedal(msg.value);
  }

  const soyProfe = (rol === "teacher");
  const vieneDeProfe = (msg.fromRole === "teacher");
  const fromSocketId = msg.fromSocketId || null;
  let deboReproducir = false;

  if (enableMidiOut && midiOutput) {
    if (soyProfe) {
      if (!vieneDeProfe) deboReproducir = true;
    } else {
      if (vieneDeProfe) deboReproducir = true;
      else if (masterclassEnabled && liveStudentId && fromSocketId === liveStudentId && fromSocketId !== mySocketId) {
        deboReproducir = true;
      }
    }
  }

  if (soyProfe && !vieneDeProfe && deboReproducir) {
    if (listeningTo.size > 0 && fromSocketId && !listeningTo.has(fromSocketId)) deboReproducir = false;
  }

  if (deboReproducir && msg.type === "cc") {
    midiOutput.send([msg.status, msg.controller, msg.value]);
  }
}

panicBtn.addEventListener("click", () => {
  // 1. Limpieza Local (Lo que ya tenías)
  teacherActiveNotes.clear();
  heldNotes.clear();
  sustainActive = false;
  
  // Forzar renderizado inmediato en Panic
  if(renderTimeout) clearTimeout(renderTimeout);
  renderMusicBoard();

  if (midiOutput) {
    for (let n = 0; n < 128; n++) midiOutput.send([0x80, n, 0]);
  }
  updatePedalVisual(0);
  log("Panic: RESET LOCAL", 'warn');

  // 2. NUEVO: Pedir rescate al profesor (Si soy alumno y estoy en sala)
  if (rol === 'student' && salaActual) {
      log("📡 Solicitando sincronización al profesor...", "warn");
      socket.emit("request-full-state", salaActual);
  }
});

/* ------------ PIZARRA MUSICAL (VexFlow + DEBOUNCE + ROBUST CHORD) ------------ */

function updateMusicBoard(note, isNoteOn) {
  if (isNoteOn) {
    heldNotes.add(note); teacherActiveNotes.add(note);
  } else {
    heldNotes.delete(note);
    if (!sustainActive) teacherActiveNotes.delete(note);
  }
  
  // [MEJORA 4: DEBOUNCE] Esperar 50ms antes de renderizar
  if (renderTimeout) {
      clearTimeout(renderTimeout);
  }

  renderTimeout = setTimeout(() => {
      renderMusicBoard();
  }, 50);
}

function getMidiNameSharp(midi) {
    let noteName = Tonal.Note.fromMidi(midi);
    if (noteName.includes("b")) noteName = Tonal.Note.enharmonic(noteName);
    return noteName;
}

function renderMusicBoard() {
  const notesArray = Array.from(teacherActiveNotes).sort((a, b) => a - b);
  
  if (notesArray.length === 0) {
    chordDisplay.innerHTML = '<span class="chord-placeholder">--</span>';
    drawEmptyStaff();
    return;
  }

  const noteNames = notesArray.map(n => getMidiNameSharp(n));
  
  // [MEJORA 5: ROBUSTEZ DE ACORDES]
  // Paso A: Detectar con todas las notas
  let detectedChords = Tonal.Chord.detect(noteNames);
  
  // Paso B: Fallback - Si falla y hay muchas notas, probar con las primeras 4
  if ((!detectedChords || detectedChords.length === 0) && noteNames.length > 4) {
      detectedChords = Tonal.Chord.detect(noteNames.slice(0, 4));
  }

  // Paso C: Sanitización y Display
  if (detectedChords && detectedChords.length > 0) {
    let chordName = detectedChords[0];
    // Eliminar "M" final redundante de mayores
    if (/^[A-G](?:#|b)?M$/.test(chordName)) chordName = chordName.replace("M", "");
    chordDisplay.textContent = chordName;
  } else {
    // Mostrar "??" si no se detecta nada
    chordDisplay.innerHTML = '<span class="chord-placeholder" style="font-size:20px">??</span>';
  }

  try {
    drawGrandStaff(notesArray);
  } catch (err) {
    console.error("VexFlow Err:", err);
  }
}

function drawEmptyStaff() {
  staffContainer.innerHTML = "";
  const renderer = new Vex.Flow.Renderer(staffContainer, Vex.Flow.Renderer.Backends.SVG);
  renderer.resize(400, 450);
  const context = renderer.getContext();
  
  const staveTreble = new Vex.Flow.Stave(10, 100, 300);
  staveTreble.addClef("treble").setContext(context).draw();
  
  const staveBass = new Vex.Flow.Stave(10, 250, 300);
  staveBass.addClef("bass").setContext(context).draw();

  new Vex.Flow.StaveConnector(staveTreble, staveBass).setType(3).setContext(context).draw();
  new Vex.Flow.StaveConnector(staveTreble, staveBass).setType(1).setContext(context).draw();
  new Vex.Flow.StaveConnector(staveTreble, staveBass).setType(6).setContext(context).draw();
}

drawEmptyStaff();

function drawGrandStaff(midiNotes) {
  staffContainer.innerHTML = "";
  const renderer = new Vex.Flow.Renderer(staffContainer, Vex.Flow.Renderer.Backends.SVG);
  const width = 400;
  renderer.resize(width, 450);
  const context = renderer.getContext();

  const trebleNotes = [];
  const bassNotes = [];

  midiNotes.forEach(midi => {
    const tonalNote = getMidiNameSharp(midi);
    const noteInfo = Tonal.Note.get(tonalNote); 
    const letter = tonalNote.slice(0, -1).toLowerCase();
    const octave = tonalNote.slice(-1);
    const vfKey = `${letter}/${octave}`;

    const staveNote = new Vex.Flow.StaveNote({ 
      clef: midi >= 60 ? "treble" : "bass", 
      keys: [vfKey], 
      duration: "w", 
      align_center: true 
    });

    if (noteInfo.acc === '#') staveNote.addModifier(new Vex.Flow.Accidental("#"));
    else if (noteInfo.acc === 'b') staveNote.addModifier(new Vex.Flow.Accidental("b"));

    if (midi >= 60) trebleNotes.push(staveNote);
    else bassNotes.push(staveNote);
  });

  const staveTreble = new Vex.Flow.Stave(10, 100, width - 20);
  staveTreble.addClef("treble").setContext(context).draw();

  const staveBass = new Vex.Flow.Stave(10, 250, width - 20);
  staveBass.addClef("bass").setContext(context).draw();

  new Vex.Flow.StaveConnector(staveTreble, staveBass).setType(3).setContext(context).draw(); 
  new Vex.Flow.StaveConnector(staveTreble, staveBass).setType(1).setContext(context).draw(); 
  new Vex.Flow.StaveConnector(staveTreble, staveBass).setType(6).setContext(context).draw(); 

  if (trebleNotes.length > 0) {
    const trebleMidiVals = midiNotes.filter(n => n >= 60);
    const keysTreble = trebleMidiVals.map(n => {
         const tn = getMidiNameSharp(n);
         return `${tn.slice(0, -1).toLowerCase()}/${tn.slice(-1)}`;
    });

    if (keysTreble.length > 0) {
        const chordTreble = new Vex.Flow.StaveNote({ clef: "treble", keys: keysTreble, duration: "w" });
        trebleMidiVals.forEach((m, index) => {
            const info = Tonal.Note.get(getMidiNameSharp(m));
            if (info.acc === "#") chordTreble.addModifier(new Vex.Flow.Accidental("#"), index);
            if (info.acc === "b") chordTreble.addModifier(new Vex.Flow.Accidental("b"), index);
        });
        const voiceT = new Vex.Flow.Voice({num_beats: 4, beat_value: 4});
        voiceT.addTickables([chordTreble]);
        new Vex.Flow.Formatter().joinVoices([voiceT]).format([voiceT], width - 50);
        voiceT.draw(context, staveTreble);
    }
  }

  if (bassNotes.length > 0) {
     const bassMidiVals = midiNotes.filter(n => n < 60);
     const keysBass = bassMidiVals.map(n => {
         const tn = getMidiNameSharp(n);
         return `${tn.slice(0, -1).toLowerCase()}/${tn.slice(-1)}`;
    });

    if (keysBass.length > 0) {
        const chordBass = new Vex.Flow.StaveNote({ clef: "bass", keys: keysBass, duration: "w" });
        bassMidiVals.forEach((m, index) => {
            const info = Tonal.Note.get(getMidiNameSharp(m));
            if (info.acc === "#") chordBass.addModifier(new Vex.Flow.Accidental("#"), index);
            if (info.acc === "b") chordBass.addModifier(new Vex.Flow.Accidental("b"), index);
        });
        const voiceB = new Vex.Flow.Voice({num_beats: 4, beat_value: 4});
        voiceB.addTickables([chordBass]);
        new Vex.Flow.Formatter().joinVoices([voiceB]).format([voiceB], width - 50);
        voiceB.draw(context, staveBass);
    }
  }
}

/* --- LÓGICA DEL MODAL DE FUNDADORES --- */
const foundersModal = document.getElementById("foundersModal");
const btnOpenFounders = document.getElementById("btnOpenFounders");
const closeFoundersBtn = document.getElementById("closeFoundersBtn");

if (btnOpenFounders && foundersModal) {
btnOpenFounders.addEventListener("click", () => {
foundersModal.classList.add("visible");
});

closeFoundersBtn.addEventListener("click", () => {
foundersModal.classList.remove("visible");
});

// Cerrar si haces clic fuera de la tarjeta (en el fondo oscuro)
foundersModal.addEventListener("click", (e) => {
if (e.target === foundersModal) {
  foundersModal.classList.remove("visible");
}
});
}