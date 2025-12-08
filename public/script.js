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
  if (!salaActual) return;
  
  // Solo intentamos actualizar si los elementos viejos existen
  const oldInput = document.getElementById("inviteLink");
  if (oldInput) {
      oldInput.value = getInviteUrl(); // Si por alguna razón los dejaste
  }
  // (Ya no hace falta hacer nada más, el botón nuevo copia directo de la memoria)
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

/* ------------ NUEVO BOTÓN COPIAR INTELIGENTE ------------ */
const btnSmartCopy = document.getElementById("btnSmartCopy");
const smartFeedback = document.getElementById("smartFeedback");

if (btnSmartCopy) {
    btnSmartCopy.addEventListener("click", async () => {
        // 1. Obtenemos el link (siempre en minúsculas gracias a tu arreglo anterior)
        const url = getInviteUrl();
        
        if (!url || !salaActual) {
            smartFeedback.style.color = "var(--danger)";
            smartFeedback.textContent = "⚠️ Primero genera la invitación.";
            setTimeout(() => smartFeedback.textContent = "", 2500);
            return;
        }

        try {
            // 2. Copiamos al portapapeles
            await navigator.clipboard.writeText(url);
            
            // 3. Feedback visual (Cambia el texto del botón temporalmente)
            const originalText = btnSmartCopy.textContent;
            btnSmartCopy.textContent = "✅ ¡ENLACE COPIADO!";
            btnSmartCopy.style.borderColor = "#b4e080";
            btnSmartCopy.style.color = "#b4e080";
            
            smartFeedback.textContent = "Listo para enviar a tu alumno.";

            // 4. Restaurar botón a los 3 segundos
            setTimeout(() => {
                btnSmartCopy.textContent = originalText;
                btnSmartCopy.style.borderColor = "#555";
                btnSmartCopy.style.color = "#aaa";
                smartFeedback.textContent = "";
            }, 3000);

        } catch (e) {
            smartFeedback.style.color = "var(--danger)";
            smartFeedback.textContent = "Error al copiar manual.";
        }
    });
}
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
/* ------------ PARTICIPANTES ------------ */
// Asegúrate de que las variables globales (listeningTo, liveStudentId, etc.) estén declaradas al inicio del script.

function renderParticipants() {
  // 1. Detección de variables globales
  const currentListeningTo = typeof listeningTo !== 'undefined' ? listeningTo : new Set();
  const currentLiveStudentId = typeof liveStudentId !== 'undefined' ? liveStudentId : null;
  const mtToggle = document.getElementById("masterclassToggle");

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
    
    // --- ICONO DE PARTITURA ACTIVA (SIMPLIFICADO) ---
    // Usamos la nueva estructura de estado para mostrar el icono
    const pdfIsActive = (u.pdfState && u.pdfState.url);
    if (pdfIsActive) {
        const icon = document.createElement("span");
        icon.textContent = "📄 ";
        icon.title = "Atril activo";
        icon.style.cursor = "help";
        icon.style.color = "var(--accent)";
        left.appendChild(icon);
    }
    // NOTA: Eliminamos la vieja lógica de if (u.pdfUrl) de aquí.

    // Nombre y Rol
    const n = document.createElement("span");
    n.style.fontWeight = "bold"; n.textContent = u.name;
    const r = document.createElement("span");
    r.style.marginLeft = "6px"; r.style.fontSize = "10px";
    r.style.color = "var(--text-muted)";
    r.textContent = (u.role === "teacher" ? "[PROFE]" : "[ALUMNO]");
    left.appendChild(n); left.appendChild(r);

    const right = document.createElement("div");

    if (soyProfe && u.role !== "teacher" && u.socketId !== mySocketId) {
      
      const userPdfUrl = pdfIsActive ? u.pdfState.url : null; 
      
      // 1. BOTÓN ESPIAR (👁️) - SOLO SI HAY UN PDF ACTIVO
      if (pdfIsActive) { 
          const btnSpy = document.createElement("button");
          btnSpy.innerHTML = "👁️"; 
          btnSpy.title = "Ver partitura en tiempo real";
          
          btnSpy.style.padding = "2px 6px";
          btnSpy.style.fontSize = "12px";
          btnSpy.style.marginRight = "8px";
          btnSpy.style.background = "#333";
          btnSpy.style.border = "1px solid #555";
          btnSpy.style.borderRadius = "4px";
          btnSpy.style.cursor = "pointer";
          btnSpy.style.color = "var(--accent)"; 

          btnSpy.onclick = () => {
            if (window.startSpying && window.loadScoreToStand) {
                // Página actual del alumno según el servidor
                const initialPage =
                    (u.pdfState && typeof u.pdfState.page === "number" && u.pdfState.page >= 1)
                        ? u.pdfState.page
                        : 1;
    
                // 1) Cargar el PDF ya en la página donde va el alumno
                window.loadScoreToStand(
                    userPdfUrl,
                    `Viendo atril de ${u.name}`,
                    initialPage
                );
    
                // 2) Activar modo espejo hacia ese alumno
                window.startSpying(u.socketId, u.name);
            } else {
                console.error("Módulo de sincronización no cargado.");
            }
        };
    
    
        
          right.appendChild(btnSpy);
      }

      // 2. CHECKBOX "ESCUCHAR" (CUE) - (INTACTO)
      const listenLabel = document.createElement("label");
      listenLabel.style.display="inline"; listenLabel.style.marginRight="8px";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      // Usamos currentListeningTo
      cb.checked = (currentListeningTo.size === 0) || currentListeningTo.has(u.socketId);
      cb.addEventListener("change", () => toggleListen(u.socketId, cb.checked));
      listenLabel.appendChild(cb); listenLabel.appendChild(document.createTextNode(" CUE"));
      right.appendChild(listenLabel);

      // 3. RADIO "EN VIVO" (ON AIR) - (INTACTO)
      const liveLabel = document.createElement("label");
      liveLabel.style.display="inline";
      liveLabel.style.color = "var(--danger)";
      
      const rb = document.createElement("input");
      rb.type = "radio"; 
      rb.name = "liveStudent";
      // Usamos currentLiveStudentId
      rb.checked = (currentLiveStudentId === u.socketId);
      
      rb.addEventListener("change", () => {
        if (rb.checked) {
          if (mtToggle) mtToggle.checked = true; // masterclassToggle
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

// Asegúrate de que esta función (toggleListen) esté definida en algún lugar si no lo está:
// function toggleListen(id, checked) { ... }

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

/* ------------ BOTÓN MÁGICO: ACTIVAR SALA + COPIAR LINK ------------ */
const btnMagicLink = document.getElementById("btnMagicLink");
const magicFeedback = document.getElementById("magicFeedback");

if (btnMagicLink) {
  btnMagicLink.addEventListener("click", async () => {
    // 1. ACTIVAR EL MOTOR (AUDIO/MIDI)
    const name = inputName.value.trim() || "Profesor";
    myName = name;
    
    // Usamos el nombre de la sala que ya tenemos (ej: miguel-antonio)
    let codeToUse = window.PREDEFINED_ROOM || salaActual; 
    
    // Si por alguna razón no hay sala, creamos una random (seguridad)
    if (!codeToUse) codeToUse = "SALA-" + Math.floor(Math.random()*1000);

    // ENVIAR SEÑAL AL SERVIDOR (Esto es lo que activa el MIDI)
    const payload = { 
        username: name, 
        userRole: "teacher",
        roomCode: codeToUse
    };
    socket.emit("create-room", payload);


    // 2. COPIAR EL LINK (EN MINÚSCULAS)
    const url = window.location.origin + "/?role=student&sala=" + codeToUse.toLowerCase();

    try {
        await navigator.clipboard.writeText(url);
        
        // 3. FEEDBACK VISUAL (Verde)
        const originalText = btnMagicLink.textContent;
        const originalColor = btnMagicLink.style.backgroundColor;
        
        btnMagicLink.textContent = "✅ ENLACE COPIADO Y SALA ACTIVA";
        btnMagicLink.style.backgroundColor = "#28a745"; // Verde éxito
        btnMagicLink.style.borderColor = "#28a745";
        
        if(magicFeedback) magicFeedback.textContent = "Listo. Pégalo en WhatsApp.";

        // Restaurar botón a los 3 segundos
        setTimeout(() => {
            btnMagicLink.textContent = originalText;
            btnMagicLink.style.backgroundColor = originalColor;
            btnMagicLink.style.borderColor = ""; 
            if(magicFeedback) magicFeedback.textContent = "";
        }, 3000);

    } catch (err) {
        console.error("Error copiando:", err);
        if(magicFeedback) magicFeedback.textContent = "Sala activa, pero copia el link manualmente.";
    }
  });
}

socket.on("room-created", (roomCode) => {
  salaActual = roomCode;
  codigoSala.value = roomCode; 
  updateInviteLink();
  log("Sala ID: " + roomCode, 'success');
});

/* ------------ UNIRSE A SALA (CON TRANSICIÓN SUAVE) ------------ */
btnUnirse.addEventListener("click", () => {
  const name = inputName.value.trim();
  if (!name) return alert("Por favor, ingresa tu nombre para entrar.");
  
  const code = codigoSala.value.trim().toUpperCase();
  if (!code) return alert("Falta el código de la sala.");

  myName = name;
  salaActual = code;

  // 1. TRUCO UX: Mostrar la pantalla de espera INMEDIATAMENTE
  // Ponemos un mensaje de "Cargando" para que se sienta fluido
  if (waitingOverlay) {
      waitingOverlay.style.display = "flex";
      waitingOverlay.innerHTML = `
          <div style="font-size:40px; margin-bottom:20px;">⌛</div>
          <h2 style="color:var(--accent);">Tocando la puerta...</h2>
          <p style="font-size:12px; color:#aaa;">Conectando con el estudio...</p>
      `;
  }

  // 2. Conectamos al servidor
  socket.emit("join-room", { roomCode: code, username: name, userRole: rol });
  log("Uniéndose a " + code + "...");
});

/* ------------ INICIALIZAR DESDE URL ------------ */
/* script.js - Reemplazo de initFromUrl */

/* ------------ INICIALIZAR DESDE URL (MEJORADO) ------------ */
// Hacemos la función global para que el script de Branding pueda llamarla
/* script.js - Versión Segura de initPianoLink */

window.initPianoLink = function() {
  try {
      const params = new URLSearchParams(window.location.search);
      let roomFound = false;

      // 1. Revisar si hay sala predefinida por el Branding
      if (typeof window.PREDEFINED_ROOM !== 'undefined' && window.PREDEFINED_ROOM) {
          salaActual = window.PREDEFINED_ROOM.toUpperCase();
          
          const inputCode = document.getElementById("codigoSala");
          if (inputCode) {
              inputCode.value = salaActual;
              inputCode.disabled = true; 
          }
          
          if(typeof updateStatus === 'function') updateStatus("SALA PROFESOR: " + salaActual);
          roomFound = true;
      }

      // 2. Si no hay sala de profe, miramos la URL normal
      if (!roomFound) {
          const urlSala = params.get("sala") || params.get("room");
          if (urlSala) {
            salaActual = urlSala.toUpperCase();
            const inputCode = document.getElementById("codigoSala");
            if(inputCode) inputCode.value = salaActual; 
          }
      }

      // 3. Roles y Pantalla de Bienvenida
      const urlRole = params.get("role");
      
      if (urlRole && urlRole.toLowerCase() === "student") {
        rol = "student";
        
        // Forzar UI de alumno
        const radioStudent = document.querySelector('input[name=rol][value="student"]');
        if(radioStudent) {
            radioStudent.click(); 
            lockStudentRole = true; 
        }

        // --- AQUÍ ESTABA EL ERROR, AHORA ESTÁ CORREGIDO ---
        // Buscamos el elemento aquí mismo para asegurar que existe
        const overlayRef = document.getElementById("waitingRoomOverlay");
        
        if (overlayRef) {
            overlayRef.style.display = "flex"; // Bajamos el telón
            
            // Mensaje de bienvenida
            overlayRef.innerHTML = `
            <div style="font-size:50px; margin-bottom:10px;">👋</div>
            <h2 style="color:var(--accent); margin-bottom:5px;">HOLA</h2>
            <p style="margin-bottom:30px;">Escribe tu nombre a la izquierda para entrar.</p>

            <div style="background:rgba(255,255,255,0.08); padding:15px; border-radius:8px; max-width:350px; text-align:left; border:1px solid #444;">
                <h3 style="color:#f1c40f; font-size:12px; margin-top:0; margin-bottom:10px;">🎹 CONFIGURA TU PIANO AHORA:</h3>
                <ol style="font-size:11px; color:#ccc; padding-left:20px; margin:0; line-height:1.6;">
                    <li>Conecta tu piano al computador por USB.</li>
                    <li>Enciende el teclado.</li>
                    <li>Si el navegador pide permiso, dale a <strong>"Permitir"</strong>.</li>
                    <li>Selecciona tu piano en el panel izquierdo (MIDI I/O).</li>
                </ol>
            </div>
            `;
        }
        // ---------------------------------------------------
      }
  } catch (err) {
      console.error("Error en initPianoLink:", err);
      // Si falla algo, no detenemos el resto del script para que el piano cargue igual
  }
};

// Ejecutamos una vez al inicio (por si entran sin link de profesor)
window.initPianoLink();

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

/* --------------------------------------------------------
   AUTO-RELLENO DE IDENTIDAD (INTELIGENTE)
   -------------------------------------------------------- */
   (function autoFillIdentity() {
    try {
        // 1. PRIMERO: Revisamos si vengo con invitación de alumno
        const params = new URLSearchParams(window.location.search);
        
        if (params.get('role') === 'student') {
            // ¡ALTO! Si soy alumno invitado, NO uso los datos guardados del profesor.
            // Solo marco la casilla de "Alumno" y dejo el nombre vacío.
            const radioAlumno = document.querySelector('input[value="student"]');
            if(radioAlumno) radioAlumno.checked = true;
            
            // Forzamos la variable global
            if(typeof rol !== 'undefined') rol = 'student';
            
            return; // Salimos de la función aquí.
        }

        // 2. SEGUNDO: Si NO soy alumno invitado, busco si hay sesión de profesor guardada
        const sessionData = localStorage.getItem('pianoUser');
        if (sessionData) {
            const user = JSON.parse(sessionData);
            
            if (typeof inputName !== 'undefined' && user.name) {
                inputName.value = user.name; // Aquí sí ponemos el nombre del profe
                
                if (user.role === 'teacher') {
                   const radioProfe = document.querySelector('input[value="teacher"]'); 
                   if(radioProfe) radioProfe.checked = true;
                   if(typeof rol !== 'undefined') rol = 'teacher';
                }
            }
        }
    } catch (e) {
        console.log("No se pudo autorrellenar la identidad", e);
    }
})();

/* --------------------------------------------------------
   🎨 IDENTIDAD VISUAL DEL PROFESOR (BRANDING)
   Detecta el dueño de la sala y aplica sus colores/logo
   tanto para el Profe (/c/slug) como para el Alumno (?sala=slug)
   -------------------------------------------------------- */
   (async function applyBranding() {
    try {
        // 1. DETECTAR SLUG (Nombre de la sala)
        // Buscamos primero en los parámetros (?sala=...)
        const params = new URLSearchParams(window.location.search);
        let slug = params.get('sala') || params.get('room');

        // Si no está en parámetros, buscamos en la URL amigable (/c/...)
        if (!slug) {
            const pathParts = window.location.pathname.split('/');
            // Si la URL es /c/miguel, el slug está en la posición 2
            if (pathParts[1] === 'c' && pathParts[2]) {
                slug = pathParts[2];
            }
        }

        // Si no encontramos sala, no hacemos nada (se queda branding por defecto)
        if (!slug) return;

        console.log("🎨 Cargando identidad visual para sala:", slug);

        // 2. CONSULTAR DATOS PÚBLICOS AL SERVIDOR
        // Usamos la ruta que ya tenías creada: /api/auth/public/:slug
        const response = await fetch(`/api/auth/public/${slug}`);
        
        if (!response.ok) return; // Si no existe el profe, abortamos

        const teacher = await response.json();
        
        if (!teacher.branding) return;

        // 3. APLICAR LOGO (Si el profesor tiene uno)
        if (teacher.branding.logoUrl) {
            const brandHeader = document.querySelector('.brand');
            if (brandHeader) {
                // Reemplazamos el texto "Piano Link" por el logo del profesor
                brandHeader.innerHTML = `
                    <div style="display:flex; align-items:center; gap:12px;">
                        <img src="${teacher.branding.logoUrl}" alt="Logo Studio" 
                             style="height: 32px; width:auto; object-fit:contain; border-radius:4px;">
                        <span style="font-size:14px; opacity:0.9; letter-spacing:1px; color:#fff;">
                            ${teacher.name.toUpperCase()} <span style="color:${teacher.branding.colors.base || 'var(--accent)'}">// CLASS</span>
                        </span>
                    </div>
                `;
            }
        }

        // 4. APLICAR COLORES (Inyectar variables CSS)
        const colors = teacher.branding.colors;
        const root = document.documentElement;

        if (colors.base) {
            // Color Principal (Naranja por defecto) -> Botones, acentos
            root.style.setProperty('--accent', colors.base);
            
            // Forzamos el cambio en elementos que quizás no usen la variable
            document.querySelectorAll('.btn-main, button[type="submit"]').forEach(btn => {
                btn.style.backgroundColor = colors.base;
                btn.style.borderColor = colors.base;
            });
            
            // Cambiar color de selección (radio buttons)
            const style = document.createElement('style');
            style.innerHTML = `
                input[type="radio"]:checked:after { background-color: ${colors.base} !important; }
                .btn-main:hover { filter: brightness(1.1); }
                a { color: ${colors.base}; }
            `;
            document.head.appendChild(style);
        }

        if (colors.bg) {
            // Fondo de la página
            document.body.style.backgroundColor = colors.bg;
        }

        if (colors.panel) {
            // Fondo de los paneles (negro suave)
            // Asumimos que tus cajas tienen clase .control-group o .chat-container o similar
            // Ajustamos --bg-panel si usas variables, o pintamos directo
            root.style.setProperty('--bg-panel', colors.panel);
            
            const panels = document.querySelectorAll('.control-group, .participant-item, .chat-box, .modal-content');
            panels.forEach(p => p.style.backgroundColor = colors.panel);
        }

    } catch (error) {
        console.error("Error aplicando branding:", error);
    }
})();
/* --------------------------------------------------------
   PASO 3: LÓGICA DE ACADEMIA (ESPERA, SONIDO Y SALIDA)
   -------------------------------------------------------- */

// Referencias a los elementos nuevos que creamos en el HTML
const waitingOverlay = document.getElementById("waitingRoomOverlay");
const joinSound = document.getElementById("joinSound");
const btnEndClass = document.getElementById("btnEndClass");
const btnExitClass = document.getElementById("btnExitClass");
const joinControls = document.getElementById("joinControls");

// 1. SONIDO DE PUERTA (DING MEJORADO)
socket.on("user-entered-sound", () => {
  try {
      if (joinSound) {
          joinSound.currentTime = 0; // Reinicia el audio por si sonó hace poco
          joinSound.volume = 1.0;    // Volumen al máximo para asegurar que se oiga
          
          // Promesa de reproducción (para evitar errores de navegador)
          const playPromise = joinSound.play();
          
          if (playPromise !== undefined) {
              playPromise.catch(error => {
                  console.log("🔊 El navegador bloqueó el sonido. Interactúa con la página primero.");
              });
          }
          log("🔔 Ding: Alguien ha entrado a la clase.", "success");
      }
  } catch (e) {
      console.error("Error de audio:", e);
  }
});

// 2. GESTOR DE ESTADO DE LA CLASE (El semáforo)
socket.on("class-status", (status) => {
    console.log("🚦 Estado de la clase recibido:", status);
    
    // A) LOGICA PARA EL PROFESOR
    if (rol === 'teacher') {
        // Al profesor nunca le mostramos la sala de espera
        if (waitingOverlay) waitingOverlay.style.display = "none";
        
        // Si la clase está activa, mostramos el botón rojo de terminar
        if (status.isActive) {
            if(btnEndClass) btnEndClass.style.display = "block";
            // Cambiamos el texto del botón principal para confirmar
            const magicBtn = document.getElementById("btnMagicLink");
            if(magicBtn && !magicBtn.textContent.includes("✅")) {
                 magicBtn.textContent = "✅ CLASE ACTIVA (LINK LISTO)";
                 magicBtn.style.borderColor = "#28a745";
                 magicBtn.style.color = "#28a745";
            }
        } else {
            if(btnEndClass) btnEndClass.style.display = "none";
        }
        return;
    }

    // B) LOGICA PARA EL ALUMNO
    if (status.isActive) {
        // ¡Clase abierta! Quitamos la pantalla negra
        if(waitingOverlay) waitingOverlay.style.display = "none";
        
        // Mostramos botón de salir y ocultamos el input de código manual
        if(btnExitClass) btnExitClass.style.display = "block";
        if(joinControls) joinControls.style.display = "none";
        
        log("🟢 El profesor ha abierto la sala.", "success");
      } else {
        // Clase cerrada -> Pantalla negra
        if(waitingOverlay) {
            waitingOverlay.style.display = "flex";
            // RESTAURAMOS EL MENSAJE ORIGINAL (CAFÉ)
            // Esto borra el "Tocando la puerta..." y pone el mensaje de espera real
            waitingOverlay.innerHTML = `
            <div style="font-size:40px; margin-bottom:10px;">☕</div>
            <h2 style="color:var(--accent); margin-bottom:5px;">SALA DE ESPERA</h2>
            <p style="margin-bottom:30px;">Tu piano se activará cuando llegue el profesor.</p>

            <div style="background:rgba(255,255,255,0.08); padding:15px; border-radius:8px; max-width:350px; text-align:left; border:1px solid #444;">
                <h3 style="color:#f1c40f; font-size:12px; margin-top:0; margin-bottom:10px;">💡 MIENTRAS ESPERAS:</h3>
                <ul style="font-size:11px; color:#ccc; padding-left:20px; margin:0; line-height:1.6;">
                    <li>Verifica que el cable USB esté bien conectado.</li>
                    <li>Prueba tocar unas teclas (aún no sonarán).</li>
                    <li>Ten tus partituras a mano.</li>
                </ul>
            </div>
            `;
        }
        if(btnExitClass) btnExitClass.style.display = "none";
    }
});

// 3. EXPULSIÓN (Cuando el profe termina la clase)
socket.on("force-disconnect", () => {
  // Redirigimos a la página amable
  window.location.href = "/goodbye.html"; 
});

// 4. BOTÓN: TERMINAR CLASE (Solo Profe)
if (btnEndClass) {
    btnEndClass.addEventListener("click", () => {
        if(!confirm("¿Seguro que quieres cerrar la sala y desconectar a todos?")) return;
        
        // Enviamos la orden al servidor
        if(salaActual) socket.emit("end-class", salaActual);
        
        // Recargamos la página del profe para limpiar todo
        setTimeout(() => window.location.reload(), 500);
    });
}

// 5. BOTÓN: SALIR DE CLASE (Solo Alumno)
if (btnExitClass) {
  btnExitClass.addEventListener("click", () => {
      if(!confirm("¿Quieres salir de la clase?")) return;
      
      // Redirigimos a la página amable
      window.location.href = "/goodbye.html"; 
  });
}

/* ================================================================
   🟢 NUEVO MÓDULO: BIBLIOTECA COLABORATIVA (VERSIÓN CORREGIDA)
   ================================================================ */

   (function initLibraryModule() {
    console.log("📚 Inicializando módulo de Biblioteca...");

    // Referencias DOM
    const pdfCanvas = document.getElementById('pdf-render');
    const pdfCtx = pdfCanvas ? pdfCanvas.getContext('2d') : null;
    const shelfModal = document.getElementById('shelf-modal');
    const shelfList = document.getElementById('shelf-list');
    const btnOpenShelf = document.getElementById('btnOpenShelf'); 
    const btnCloseShelf = document.getElementById('btnCloseShelf');
    const btnUploadScore = document.getElementById('btnUploadScore');
    const msgPdfLoading = document.getElementById('pdf-loading-msg');
    const controlsFloating = document.getElementById('pdfFloatingControls');
    const tabPdfBtn = document.getElementById('tabPdfBtn'); // Pestaña principal

    // Variables de Estado
    let pdfDoc = null;
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;
    let currentPdfUrl = null;
    
    // Variables de espionaje
    let isSpying = false;
    let spyingTargetId = null;

    // --- 1. BOTÓN DE PESTAÑA PRINCIPAL ---
    // Si haces clic en "BIBLIOTECA PDF" y está vacío, abrimos el estante
    if (tabPdfBtn) {
        tabPdfBtn.addEventListener('click', () => {
            // Esperamos un poco para que cambie la pestaña visualmente
            setTimeout(() => {
                if (!currentPdfUrl) {
                    openShelf();
                }
            }, 100);
        });
    }

    // --- 2. ABRIR / CERRAR ESTANTE ---
    if(btnOpenShelf) btnOpenShelf.addEventListener('click', openShelf);
    if(btnCloseShelf) btnCloseShelf.addEventListener('click', () => shelfModal.style.display = 'none');

    function openShelf() {
        // USAMOS LA VARIABLE GLOBAL CORRECTA: 'salaActual'
        if(!salaActual) {
            alert("⚠️ Primero debes crear o unirte a una sala.");
            return;
        }
        
        shelfModal.style.display = 'block';
        const displayCode = document.getElementById('display-room-code');
        if(displayCode) displayCode.innerText = salaActual;
        
        loadShelfContent();
    }

    // --- 3. CARGAR LISTA ---
    async function loadShelfContent() {
        if(!shelfList) return;
        shelfList.innerHTML = '<p style="color:#aaa; grid-column:1/-1; text-align:center;">Cargando partituras...</p>';

        try {
            // USAMOS 'salaActual'
            const res = await fetch(`/api/scores/${salaActual}`);
            const scores = await res.json();

            shelfList.innerHTML = '';

            if(scores.length === 0) {
                shelfList.innerHTML = '<p style="color:#666; grid-column:1/-1; text-align:center;">El estante está vacío. ¡Sube la primera partitura!</p>';
                return;
            }

            scores.forEach(score => {
                const card = document.createElement('div');
                card.className = 'score-card';
                card.innerHTML = `
                    <div class="score-icon">📄</div>
                    <strong class="score-title" title="${score.title}">${score.title}</strong>
                    <div class="score-meta">Subido por: ${score.uploaderName}</div>
                `;
                card.onclick = () => loadScoreToStand(score.url, score.title);
                shelfList.appendChild(card);
            });

        } catch (err) {
            console.error("Error biblioteca:", err);
            shelfList.innerHTML = '<p style="color:#e74c3c">Error de conexión.</p>';
        }
    }

    // --- 4. SUBIR ARCHIVO ---
    if(btnUploadScore) {
        btnUploadScore.addEventListener('click', async () => {
            const fileInput = document.getElementById('file-upload');
            const titleInput = document.getElementById('upload-title');
            const statusMsg = document.getElementById('upload-status');

            if (!fileInput.files[0]) return alert("Selecciona un PDF.");
            if (!salaActual) return alert("No hay sala activa.");

            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            formData.append('roomCode', salaActual); // CORREGIDO
            formData.append('title', titleInput.value.trim());
            // Usamos 'myName' que es tu variable global de usuario
            formData.append('uploaderName', (typeof myName !== 'undefined' ? myName : 'Anónimo'));

            statusMsg.innerText = "Subiendo... ☁️";
            statusMsg.style.color = "#f1c40f";

            try {
                const res = await fetch('/api/scores/upload', { method: 'POST', body: formData });
                if(res.ok) {
                    statusMsg.innerText = "¡Listo! ✅";
                    statusMsg.style.color = "#2ecc71";
                    loadShelfContent(); 
                    titleInput.value = "";
                    fileInput.value = "";
                } else {
                    throw new Error("Fallo en servidor");
                }
            } catch (err) {
                console.error(err);
                statusMsg.innerText = "Error al subir ❌";
                statusMsg.style.color = "#e74c3c";
            }
        });
    }

   // --- 5. VISOR PDF (PDF.JS) ---
   window.loadScoreToStand = function (url, title, initialPage) {
    shelfModal.style.display = 'none';

    // Simular click en pestaña PDF para cambiar vista
    if (tabPdfBtn) {
        // Forzamos el cambio de clase visual manualmente también
        document.getElementById('modeMusic').classList.add('hidden');
        document.getElementById('modePdf').classList.remove('hidden');
        document.getElementById('modePdf').style.display = 'flex';
        document.getElementById('tabMusicBtn').classList.remove('active');
        tabPdfBtn.classList.add('active');
    }

    if (msgPdfLoading) msgPdfLoading.style.display = 'block';
    if (controlsFloating) controlsFloating.style.display = 'flex';

    const titleLabel = document.getElementById('current-score-title');
    if (titleLabel) titleLabel.innerText = title || "Documento";

    currentPdfUrl = url;

    // 👉 Usar la página inicial si viene desde el estado del alumno
    if (typeof initialPage === "number" && initialPage >= 1) {
        pageNum = initialPage;
    } else {
        pageNum = 1;
    }

    if (isSpying) stopSpying();

    renderPdf(url);

    // Avisar al servidor del estado de ESTE cliente (profe / alumno)
    if (socket && salaActual) {
        socket.emit('update-pdf-state', { url: url, page: pageNum });
    }
};



    function renderPdf(url) {
        if(!pdfjsLib) return console.error("PDF.js no cargado");
        
        pdfjsLib.getDocument(url).promise.then(doc => {
            pdfDoc = doc;
            const countEl = document.getElementById('page-count');
            if(countEl) countEl.textContent = pdfDoc.numPages;
            if(msgPdfLoading) msgPdfLoading.style.display = 'none';
            renderPage(pageNum);
        }).catch(err => {
            console.error("Error cargando PDF:", err);
            if(msgPdfLoading) msgPdfLoading.innerText = "Error al cargar PDF";
        });
    }

    function renderPage(num) {
        pageRendering = true;
        pdfDoc.getPage(num).then(page => {
            if(!pdfCanvas) return;
            
            const container = document.getElementById('pdf-container');
            const containerWidth = container ? container.clientWidth : 800;
            
            const viewportUnscaled = page.getViewport({scale: 1});
            const scaleFit = (containerWidth * 0.95) / viewportUnscaled.width;
            
            const viewport = page.getViewport({scale: scaleFit});
            pdfCanvas.height = viewport.height;
            pdfCanvas.width = viewport.width;

            const renderContext = { canvasContext: pdfCtx, viewport: viewport };
            const renderTask = page.render(renderContext);

            renderTask.promise.then(() => {
                pageRendering = false;
                if (pageNumPending !== null) {
                    renderPage(pageNumPending);
                    pageNumPending = null;
                }
            });
        });

        const pageNumEl = document.getElementById('page-num');
        if(pageNumEl) pageNumEl.textContent = num;
    }

    function queueRenderPage(num) {
        if (pageRendering) pageNumPending = num;
        else renderPage(num);
    }

  // Botones Paginación
const btnPrev = document.getElementById('prev-page');
const btnNext = document.getElementById('next-page');

if (btnPrev) btnPrev.addEventListener('click', () => {
    if (pageNum <= 1) return;
    pageNum--;
    queueRenderPage(pageNum);

    // Alumno avisa cambio de página (si no está espiando)
    if (!isSpying && socket) {
        socket.emit('update-pdf-state', { page: pageNum });
    }
});

if (btnNext) btnNext.addEventListener('click', () => {
    if (!pdfDoc || pageNum >= pdfDoc.numPages) return;
    pageNum++;
    queueRenderPage(pageNum);

    // Alumno avisa cambio de página (si no está espiando)
    if (!isSpying && socket) {
        socket.emit('update-pdf-state', { page: pageNum });
    }
});


   
    

    // --- 6. ESPIONAJE ---
    window.startSpying = function(studentSocketId, studentName) {
        if(!studentSocketId) return;
        isSpying = true;
        spyingTargetId = studentSocketId;

        const label = document.getElementById('current-score-title');
        if(label) {
            label.innerText = `👁️ Viendo a: ${studentName}`;
            label.style.color = "#e67e22";
        }
        
        if(tabPdfBtn) tabPdfBtn.click();
    };

    function stopSpying() {
        isSpying = false;
        spyingTargetId = null;
        const label = document.getElementById('current-score-title');
        if(label) {
            label.style.color = "#aaa";
            label.innerText = "Documento";
        }
    }

    if(socket) {
        socket.on('user-pdf-updated', (payload) => {
            if (isSpying && payload.userId === spyingTargetId) {
                const state = payload.pdfState;
                if (state.url && state.url !== currentPdfUrl) {
                    currentPdfUrl = state.url;
                    renderPdf(state.url);
                }
                if (state.page && state.page !== pageNum) {
                    pageNum = state.page;
                    queueRenderPage(pageNum);
                }
            }
        });
    }

})();