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
let lastPedalTime = 0; 

// Board Logic
let teacherActiveNotes = new Set();
let heldNotes = new Set();
let sustainActive = false;
let renderTimeout = null; 

/* ------------ UTILIDADES UI (LOG MEJORADO) ------------ */

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

// --- EL PROFE RESPONDE A PETICIONES DE SINCRONIZACIÓN ---
socket.on("teacher-sync-request", (requestingSocketId) => {
   if (rol === 'teacher') {
       const activeNotesArray = Array.from(teacherActiveNotes);
       socket.emit("midi-message", {
           type: "board-sync", 
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

  log("🔄 Sincronizando pizarra...", 'warn');
  socket.emit("request-full-state", code);

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
/* Reemplaza el bloque de eventos de roles con esto: */
document.querySelectorAll("input[name=rol]").forEach(radio => {
  radio.addEventListener("change", () => {
    const requestedRole = radio.value;
    if (lockStudentRole && requestedRole === "teacher") {
      document.querySelector('input[name=rol][value="student"]').checked = true;
      rol = "student";
    } else if (radio.checked) {
      rol = requestedRole;
    }

    const cardCrear = document.getElementById("cardCrearSala");
    const cardUnir = document.getElementById("cardUnirseSala");
    
    // Mostrar/Ocultar paneles básicos
    if (cardCrear) cardCrear.style.display = (rol === "teacher") ? "block" : "none";
    if (cardUnir) cardUnir.style.display = (rol === "teacher") ? "none" : "block";

    // Mostrar/Ocultar Masterclass de forma segura
    if (masterclassSection) {
      if (rol === "teacher") {
          masterclassSection.classList.remove("hidden");
          masterclassSection.style.display = "block";
      } else {
          masterclassSection.classList.add("hidden");
          masterclassSection.style.display = "none";
      }
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
    d.style.color = "var(--text-muted)"; d.textContent = "Nadie conectado.";
    participantsList.appendChild(d); return;
  }

  const soyProfe = (rol === "teacher");

  participants.forEach(u => {
    const row = document.createElement("div");
    row.className = "participant-row";

    const left = document.createElement("div");
    // Icono si tiene PDF
    if (u.pdfUrl) {
        const icon = document.createElement("span");
        icon.textContent = "📄 ";
        icon.title = "Tiene partitura";
        icon.style.cursor = "help";
        left.appendChild(icon);
    }
    
    const n = document.createElement("span");
    n.style.fontWeight = "bold"; n.textContent = u.name;
    const r = document.createElement("span");
    r.style.marginLeft = "6px"; r.style.fontSize = "10px";
    r.style.color = "var(--text-muted)";
    r.textContent = (u.role === "teacher" ? "[PROFE]" : "[ALUMNO]");
    left.appendChild(n); left.appendChild(r);

    const right = document.createElement("div");

    if (soyProfe && u.role !== "teacher" && u.socketId !== mySocketId) {
      // Botón VER PDF
      if (u.pdfUrl) {
          const btnPdf = document.createElement("button");
          btnPdf.textContent = "VER PDF";
          btnPdf.style.padding = "2px 4px";
          btnPdf.style.fontSize = "9px";
          btnPdf.style.marginRight = "6px";
          btnPdf.style.background = "#fff";
          btnPdf.style.color = "#000";
          btnPdf.onclick = () => {
              loadPdf(u.pdfUrl, false); 
              switchTab('pdf');
              log(`👁️ Viendo partitura de ${u.name}`, "info");
          };
          right.appendChild(btnPdf);
      }

      // Checkbox "Escuchar" (CUE)
      const listenLabel = document.createElement("label");
      listenLabel.style.display="inline"; listenLabel.style.marginRight="8px";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = (listeningTo.size === 0) || listeningTo.has(u.socketId);
      cb.addEventListener("change", () => toggleListen(u.socketId, cb.checked));
      listenLabel.appendChild(cb); listenLabel.appendChild(document.createTextNode(" CUE"));
      right.appendChild(listenLabel);

      // Radio "En Vivo" (ON AIR) - AQUÍ ESTABA EL ERROR
      const liveLabel = document.createElement("label");
      liveLabel.style.display="inline";
      liveLabel.style.color = "var(--danger)"; // Rojo para resaltar
      
      const rb = document.createElement("input");
      rb.type = "radio"; 
      rb.name = "liveStudent";
      rb.checked = (liveStudentId === u.socketId);
      
      rb.addEventListener("change", () => {
        if (rb.checked) {
          // FIX: Verificamos que el toggle exista antes de marcarlo
          if (masterclassToggle) masterclassToggle.checked = true;
          sendLiveStudent(u.socketId);
        }
      });
      
      liveLabel.appendChild(rb); 
      liveLabel.appendChild(document.createTextNode(" ON AIR"));
      right.appendChild(liveLabel);

    } else if (u.socketId === mySocketId) {
      right.textContent = " (Tú)"; right.style.fontSize = "10px"; right.style.color = "var(--text-muted)";
    }

    row.appendChild(left); row.appendChild(right);
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

/* ------------ WEB MIDI ------------ */
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
    if (e.port.state === "connected" || e.port.state === "disconnected") {
        refreshDevices();
    }
  };
}

function refreshDevices() {
  if (!midiAccess) return;

  const currentOut = midiOutputSelect.value;
  midiOutputSelect.innerHTML = '<option value="">(ninguna)</option>';
  for (let output of midiAccess.outputs.values()) {
    const opt = document.createElement("option");
    opt.value = output.id;
    opt.textContent = output.name;
    midiOutputSelect.appendChild(opt);
  }
  if (currentOut) midiOutputSelect.value = currentOut;

  const currentIn = midiInputSelect.value;
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

midiInputSelect.addEventListener("change", updateInputListener);

function updateInputListener() {
    if (!midiAccess) return;
    
    for (let input of midiAccess.inputs.values()) {
        input.onmidimessage = null; 
    }

    const selectedId = midiInputSelect.value;
    const selectedName = midiInputSelect.options[midiInputSelect.selectedIndex]?.text;

    if (selectedId) {
        const input = midiAccess.inputs.get(selectedId);
        if (input) {
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

/* ------------ MANEJO DE MENSAJES LOCALES ------------ */
function handleLocalMIDIMessage(event) {
  const [status, data1, data2] = event.data;
  const cmd = status & 0xf0;
  const note = data1;
  const velocity = data2;

  // 1. MANEJO DE NOTAS
  if (cmd === 0x90 || cmd === 0x80) {
    const isNoteOn = (cmd === 0x90 && velocity > 0);
    
    lightKey(note, isNoteOn, velocity);
    
    if (rol === 'teacher') updateMusicBoard(note, isNoteOn);

    if (enableMidiOut && midiOutput) {
      try { midiOutput.send([cmd, note, velocity]); } catch (e) {}
    }

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

  // 2. MANEJO DE PEDAL
  if (cmd === 0xB0) {
    const controller = data1;
    const value = data2;

    if (controller === 64) { 
       const now = Date.now();
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
       if (salaActual) {
          socket.emit("midi-message", { type: "cc", status, controller, value, fromRole: rol, roomCode: salaActual, timestamp: Date.now() });
       }
    }
  }
}

/* ------------ PIANO VISUAL ------------ */
let currentBaseColor = "#ff764d"; 
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
  const WHITE_KEY_WIDTH = 24; 
  const BLACK_KEY_WIDTH = 14; 
  
  piano.innerHTML = "";
  
  piano.style.width = ((52 * WHITE_KEY_WIDTH) + 20) + "px";

  let whiteKeyIndex = 0;

  for (let note = 21; note <= 108; note++) {
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
  const k = piano.querySelector(`.key[data-note='${note}']`);
  if (!k) return;

  if (on) {
    let targetHex = currentBaseColor;
    if (isSplitActive) {
        targetHex = (note < splitPoint) ? currentLeftColor : currentRightColor;
    }

    let alpha = Math.pow(velocity / 127, 2); 
    if (alpha < 0.15) alpha = 0.15; 
    if (alpha > 1.0) alpha = 1.0;

    const rgb = hexToRgb(targetHex);
    k.classList.add("note-active");
    k.style.backgroundColor = `rgba(${rgb}, ${alpha})`; 
  } else {
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
    if (renderTimeout) clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => {
      renderMusicBoard();
    }, 50);
  }
}

/* ------------ MIDI REMOTO ------------ */
function handleRemoteOrLocalNote(msg) {
  if (msg.type === "board-sync") {
     if (rol === 'student') {
         teacherActiveNotes.clear();
         heldNotes.clear();
         msg.notes.forEach(n => {
             teacherActiveNotes.add(n);
             heldNotes.add(n);
         });
         renderMusicBoard();
         log("✅ Pizarra reparada y sincronizada.", "success");
     }
     return; 
  }

  let cmd, note, velocity, role, type, fromSocketId = msg.fromSocketId || null;

  if (msg.timestamp) {
      const latency = Date.now() - msg.timestamp;
      if (latency > 2000) {
          log(`⛔ RÁFAGA BLOQUEADA: Datos viejos (${latency}ms).`, 'error');
          return; 
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
  teacherActiveNotes.clear();
  heldNotes.clear();
  sustainActive = false;
  
  if(renderTimeout) clearTimeout(renderTimeout);
  renderMusicBoard();

  if (midiOutput) {
    for (let n = 0; n < 128; n++) midiOutput.send([0x80, n, 0]);
  }
  updatePedalVisual(0);
  log("Panic: RESET LOCAL", 'warn');

  if (rol === 'student' && salaActual) {
      log("📡 Solicitando sincronización al profesor...", "warn");
      socket.emit("request-full-state", salaActual);
  }
});

/* ------------ PIZARRA MUSICAL (VexFlow) ------------ */
function updateMusicBoard(note, isNoteOn) {
  if (isNoteOn) {
    heldNotes.add(note); teacherActiveNotes.add(note);
  } else {
    heldNotes.delete(note);
    if (!sustainActive) teacherActiveNotes.delete(note);
  }
  
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
  
  let detectedChords = Tonal.Chord.detect(noteNames);
  if ((!detectedChords || detectedChords.length === 0) && noteNames.length > 4) {
      detectedChords = Tonal.Chord.detect(noteNames.slice(0, 4));
  }

  if (detectedChords && detectedChords.length > 0) {
    let chordName = detectedChords[0];
    if (/^[A-G](?:#|b)?M$/.test(chordName)) chordName = chordName.replace("M", "");
    chordDisplay.textContent = chordName;
  } else {
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
  
  renderer.resize(420, 450); 
  const context = renderer.getContext();
  
  const startX = 30; 
  const staveWidth = 350;

  const staveTreble = new Vex.Flow.Stave(startX, 100, staveWidth);
  staveTreble.addClef("treble").setContext(context).draw();
  
  const staveBass = new Vex.Flow.Stave(startX, 250, staveWidth);
  staveBass.addClef("bass").setContext(context).draw();

  new Vex.Flow.StaveConnector(staveTreble, staveBass).setType(3).setContext(context).draw();
  new Vex.Flow.StaveConnector(staveTreble, staveBass).setType(1).setContext(context).draw();
  new Vex.Flow.StaveConnector(staveTreble, staveBass).setType(6).setContext(context).draw();
}

drawEmptyStaff();

function drawGrandStaff(midiNotes) {
  staffContainer.innerHTML = "";
  const renderer = new Vex.Flow.Renderer(staffContainer, Vex.Flow.Renderer.Backends.SVG);
  
  const width = 420; 
  renderer.resize(width, 450);
  const context = renderer.getContext();

  const startX = 30; 
  const staveWidth = 350; 

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

  const staveTreble = new Vex.Flow.Stave(startX, 100, staveWidth);
  staveTreble.addClef("treble").setContext(context).draw();

  const staveBass = new Vex.Flow.Stave(startX, 250, staveWidth);
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
            
            new Vex.Flow.Formatter().joinVoices([voiceT]).format([voiceT], staveWidth - 50);
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
            
            new Vex.Flow.Formatter().joinVoices([voiceB]).format([voiceB], staveWidth - 50);
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

    foundersModal.addEventListener("click", (e) => {
        if (e.target === foundersModal) {
            foundersModal.classList.remove("visible");
        }
    });
}

/* ------------ GESTOR DE PDF Y PESTAÑAS ------------ */
// Referencias DOM
const tabMusicBtn = document.getElementById("tabMusicBtn");
const tabPdfBtn = document.getElementById("tabPdfBtn");
const modeMusic = document.getElementById("modeMusic");
const modePdf = document.getElementById("modePdf");

const pdfInput = document.getElementById("pdfInput");
const btnLoadPdf = document.getElementById("btnLoadPdf");
const pdfFrame = document.getElementById("pdfFrame");
const pdfPlaceholder = document.getElementById("pdfPlaceholder");

// 1. CAMBIO DE PESTAÑAS
function switchTab(mode) {
    if (mode === 'music') {
        tabMusicBtn.classList.add("active"); tabPdfBtn.classList.remove("active");
        modeMusic.classList.remove("hidden"); modePdf.classList.add("hidden");
    } else {
        tabPdfBtn.classList.add("active"); tabMusicBtn.classList.remove("active");
        modePdf.classList.remove("hidden"); modeMusic.classList.add("hidden");
    }
}

if(tabMusicBtn && tabPdfBtn) {
    tabMusicBtn.addEventListener("click", () => switchTab('music'));
    tabPdfBtn.addEventListener("click", () => switchTab('pdf'));
}

// 2. CARGAR PDF
if(btnLoadPdf) {
    btnLoadPdf.addEventListener("click", () => {
        const rawUrl = pdfInput.value.trim();
        if (!rawUrl) return;
        loadPdf(rawUrl, true); // true = emitir a los demás
    });
}

function loadPdf(url, broadcast = false) {
    // TRUCO: Convertir links de Drive/Dropbox para que sean "embeddables"
    let cleanUrl = url;
    
    // Google Drive: cambiar /view por /preview
    if (cleanUrl.includes("drive.google.com") && cleanUrl.includes("/view")) {
        cleanUrl = cleanUrl.replace("/view", "/preview");
    }
    // Dropbox: cambiar dl=0 por raw=1
    if (cleanUrl.includes("dropbox.com") && cleanUrl.includes("dl=0")) {
        cleanUrl = cleanUrl.replace("dl=0", "raw=1");
    }

    // Renderizar
    pdfFrame.src = cleanUrl;
    pdfFrame.classList.add("visible");
    pdfPlaceholder.style.display = "none";
    
    // Si soy yo quien lo cargó, aviso a la sala para que el profe sepa
    if (broadcast && salaActual) {
        socket.emit("pdf-update", { roomCode: salaActual, url: cleanUrl });
        log("📄 PDF cargado. El profesor ya puede verlo.", "success");
    }
}

// 3. RECIBIR PDF DE OTROS (SOCKET)
socket.on("pdf-update", (payload) => {
    // payload trae { fromSocketId, url }
    const user = participants.find(p => p.socketId === payload.fromSocketId);
    if (user) {
        user.pdfUrl = payload.url; // Guardamos el link en memoria
        renderParticipants(); // Actualizamos la lista para mostrar el botón "VER PDF"
        log(`📄 ${user.name} ha cargado una partitura nueva.`, "info");
    }
});

/* ------------ REDIMENSIONAR PIZARRA ------------ */
(function initResizer() {
  const handle = document.getElementById("resizeHandle");
  const board = document.querySelector(".board-container");
  // Seleccionamos también el contenedor del PDF para forzar repintado si es necesario
  const pdfFrame = document.getElementById("pdfFrame");
  
  let isResizing = false;
  let startY = 0;
  let startHeight = 0;

  if (!handle || !board) return;

  handle.addEventListener("mousedown", (e) => {
      isResizing = true;
      startY = e.clientY;
      // Obtenemos la altura calculada actual
      startHeight = parseInt(document.defaultView.getComputedStyle(board).height, 10);
      
      handle.classList.add("active");
      document.body.style.cursor = "ns-resize"; // Forzar cursor en todo el body
      e.preventDefault(); // Evitar selección de texto
  });

  // Usamos window para no perder el foco si el mouse sale rápido del div
  window.addEventListener("mousemove", (e) => {
      if (!isResizing) return;

      const dy = e.clientY - startY;
      const newHeight = startHeight + dy;

      // Aplicamos la nueva altura (CSS min-height/max-height limitarán esto automáticamente)
      board.style.height = `${newHeight}px`;
      
      // Fix para que iframes no capturen el mouse durante el resize
      if(pdfFrame) pdfFrame.style.pointerEvents = "none";
  });

  window.addEventListener("mouseup", () => {
      if (isResizing) {
          isResizing = false;
          handle.classList.remove("active");
          document.body.style.cursor = "default";
          if(pdfFrame) pdfFrame.style.pointerEvents = "auto"; // Reactivar interacción con PDF
      }
  });
})();