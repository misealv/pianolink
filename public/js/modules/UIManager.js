/**
 * /public/js/modules/UIManager.js
 * FINAL: UI Manager Completo (Split, Cue, Resizer, Pedal, Espía)
 */
export class UIManager {
    constructor(eventBus) {
        this.bus = eventBus;
        
        // --- REFERENCIAS DOM ---
        this.piano = document.getElementById("piano");
        this.participantsList = document.getElementById("participantsList");
        
        // Botones Principales
        this.btnMagicLink = document.getElementById("btnMagicLink");
        this.inputName = document.getElementById("inputName");
        this.btnEndClass = document.getElementById("btnEndClass");
        
        // Sala de Espera / Unirse
        this.waitingOverlay = document.getElementById("waitingRoomOverlay");
        this.btnExitClass = document.getElementById("btnExitClass");
        this.joinControls = document.getElementById("joinControls");
        
        // Log System
        this.logTerminal = document.getElementById("log");
        this.logPanel = this.logTerminal ? this.logTerminal.closest('.panel') : null;

        // --- CONTROLES SPLIT (Opción B) ---
        this.splitNoteInput = document.getElementById("splitNoteInput");
        this.colorLeftInput = document.getElementById("colorLeftInput");
        this.colorRightInput = document.getElementById("colorRightInput");
        this.btnSplitToggle = document.getElementById("btnSplitToggle");

        // --- ESTADO INTERNO ---
        this.baseColor = "#ff764d"; 
        this.splitColorL = "#5dade2"; // Azul default
        this.splitColorR = "#f1c40f"; // Amarillo default
        this.isSplit = false;
        this.splitPoint = 60; // C4 default
        this.currentSoloId = null; // Para el botón CUE

        // --- INICIALIZACIÓN ---
        this.initListeners();
        this.initLogger();
        this.setupUrlParams();
        this.loadIdentity();
        
        // Construimos el piano inicial
        this.buildPiano(); 
        
        // Activamos el Resizer (Arrastrar pizarra)
        this.initResizer();
        
        console.log("✅ UIManager Listo. Overlay detectado:", !!this.waitingOverlay);
    }

    initListeners() {
        // Eventos Generales
        if (this.btnMagicLink) this.btnMagicLink.addEventListener("click", () => this.handleMagicLink());
        if (this.btnEndClass) this.btnEndClass.addEventListener("click", () => this.bus.emit("ui-end-class"));
        if (this.btnExitClass) this.btnExitClass.addEventListener("click", () => this.bus.emit("ui-leave"));
        
        document.getElementById("btnUnirse")?.addEventListener("click", () => this.handleJoin());
        document.getElementById("panicBtn")?.addEventListener("click", () => this.bus.emit("ui-panic"));
        document.getElementById("baseColorPicker")?.addEventListener("input", (e) => this.baseColor = e.target.value);

        // --- LÓGICA SPLIT AVANZADA ---
        const chkSplit = document.getElementById("chkSplit");
        const splitControls = document.getElementById("splitControls");
        const inputPoint = document.getElementById("splitPointInput");
        const colorL = document.getElementById("leftColorPicker");
        const colorR = document.getElementById("rightColorPicker");

        // 1. Activar Split y Mostrar Menú
        if (chkSplit) {
            chkSplit.addEventListener("change", (e) => {
                this.isSplit = e.target.checked;
                // Mostrar/Ocultar controles extra
                if (splitControls) {
                    if (this.isSplit) splitControls.classList.remove("hidden");
                    else splitControls.classList.add("hidden");
                }
                // Refrescar piano para aplicar/quitar colores de zona
                this.buildPiano();
                
                // Notificar cambio
                this.emitSplitChange();
            });
        }

        // 2. Cambiar Punto de División (Nota MIDI)
        if (inputPoint) {
            inputPoint.addEventListener("input", (e) => {
                let val = parseInt(e.target.value);
                // Limitamos entre 21 (A0) y 108 (C8)
                if (val < 21) val = 21;
                if (val > 108) val = 108;
                this.splitPoint = val;
                this.buildPiano(); // Redibujar zonas
                this.emitSplitChange();
            });
        }

        // 3. Cambiar Colores en Tiempo Real
        if (colorL) colorL.addEventListener("input", (e) => {
            this.splitColorL = e.target.value;
            this.buildPiano();
            this.emitSplitChange();
        });
        
        if (colorR) colorR.addEventListener("input", (e) => {
            this.splitColorR = e.target.value;
            this.buildPiano();
            this.emitSplitChange();
        });
    }

    emitSplitChange() {
        this.bus.emit("ui-split-toggle", {
            isActive: this.isSplit,
            splitPoint: this.splitPoint,
            colorLeft: this.splitColorL,
            colorRight: this.splitColorR
        });
    }

    // --- CONSTRUCCIÓN DEL PIANO (CON SPLIT) ---
    buildPiano() {
        if (!this.piano) return;
        this.piano.innerHTML = "";
        const WHITE_W = 24, BLACK_W = 14;
        this.piano.style.width = ((52 * WHITE_W) + 20) + "px";
        let whiteIndex = 0;
        
        for (let note = 21; note <= 108; note++) {
            const octave = note % 12;
            const isWhite = [0, 2, 4, 5, 7, 9, 11].includes(octave);
            const key = document.createElement("div");
            
            // Atributo CLAVE para highlightKey
            key.setAttribute('data-note-midi', note);
            key.setAttribute('data-note', note); // Compatibilidad extra
            
            key.classList.add("key");
            
            if (isWhite) {
                key.classList.add("white-key");
                key.style.left = (whiteIndex * WHITE_W) + "px";
                key.style.width = WHITE_W + "px";
                whiteIndex++;
            } else {
                key.classList.add("black-key");
                key.style.left = ((whiteIndex * WHITE_W) - (BLACK_W / 2)) + "px";
                key.style.width = BLACK_W + "px";
            }
            this.piano.appendChild(key);
        }

        // Aplicar colores de zona si el split está activo
        this.piano.querySelectorAll('.key').forEach(key => {
            const note = parseInt(key.getAttribute('data-note-midi'), 10);
            this.restoreKeyColor(key, note);
        });
    }

    // --- ILUMINACIÓN DE TECLAS (CON SPLIT) ---
    highlightKey(note, velocity) {
        // Buscamos la tecla (asegurando compatibilidad de selectores)
        const key = this.piano.querySelector(`.key[data-note-midi="${note}"]`);
        if (!key) return;

        let color = this.baseColor;
        
        // A) Determinar el color si el split está activo
        if (this.isSplit) {
            color = (note < this.splitPoint) ? this.splitColorL : this.splitColorR;
        }

        // B) Aplicar el color y el brillo
        if (velocity > 0) {
            const opacity = 0.4 + (velocity / 127) * 0.6;
            key.style.backgroundColor = this.hexToRgba(color, opacity);
            key.style.boxShadow = `0 0 10px ${color}`;
            key.classList.add("note-active");
        } else {
            key.classList.remove("note-active");
            this.restoreKeyColor(key, note);
        }
    }

    // Helper para restaurar el color de reposo (Negro/Blanco o Zona Split)
    restoreKeyColor(key, note) {
        if (!key) return;
        const isBlack = key.classList.contains('black-key');
        
        if (this.isSplit) {
            // Si split activo: Sombra sutil del color de zona
            const baseColor = (note < this.splitPoint) ? this.splitColorL : this.splitColorR;
            key.style.backgroundColor = isBlack ? '#111' : '#ccc'; 
            key.style.boxShadow = `inset 0 0 10px ${baseColor}`; 
            key.style.borderColor = baseColor; 
        } else {
            // Si split inactivo: Normal
            key.style.backgroundColor = ""; 
            key.style.boxShadow = 'none';
            key.style.borderColor = "#000";
        }
    }

    // --- VISUALIZACIÓN DEL PEDAL ---
    handlePedal(velocity) {
        const isActive = velocity > 64;
        const pedalBar = document.querySelector('.pedal-active');
        if (pedalBar) {
            pedalBar.style.opacity = isActive ? '1' : '0';
        }
    }

    // --- LISTA DE PARTICIPANTES (CUE + ESPÍA) ---
    updateParticipants(users) {
        if(!this.participantsList) return;
        this.lastUserList = users;
        
        if (!users || users.length === 0) {
            this.participantsList.innerHTML = '<div style="color:#666; font-size:10px; padding:5px;">Esperando conexiones...</div>';
            return;
        }

        const myParams = new URLSearchParams(window.location.search);
        let myRole = myParams.get("role"); 
        if (!myRole) {
            try {
                const saved = JSON.parse(localStorage.getItem('pianoUser') || '{}');
                myRole = (saved.role === 'admin') ? 'teacher' : saved.role;
            } catch(e) {}
        }
        const isMeTeacher = (myRole === 'teacher');

        this.participantsList.innerHTML = users.map(u => {
            const isUserTeacher = (u.role === 'teacher');
            const icon = (u.pdfState && u.pdfState.url) ? '📄' : '👤';
            
            const pageInfo = (u.pdfState && u.pdfState.url) 
                ? `<span style="font-size:9px; color:#aaa; margin-left:5px;">(Pág ${u.pdfState.page})</span>` 
                : '';

            let controls = '';
            
            if (isMeTeacher && !isUserTeacher) {
                // A) BOTÓN CUE (🎧)
                const isSoloActive = (this.currentSoloId === u.socketId);
                const cueColor = isSoloActive ? '#2ecc71' : '#bbb'; 
                const cueBg = isSoloActive ? 'rgba(46, 204, 113, 0.15)' : 'rgba(255, 255, 255, 0.1)';

                controls += `
                    <button class="btn-cue" data-id="${u.socketId}" title="CUE: Escuchar solo a este alumno"
                        style="background:${cueBg}; border:1px solid ${cueColor}; color:${cueColor}; 
                               border-radius:4px; margin-right:8px; cursor:pointer; 
                               padding:2px 6px; font-size:14px; transition: all 0.2s;">
                        🎧
                    </button>
                `;

                // B) BOTÓN OJO (👁️)
                if (u.pdfState && u.pdfState.url) {
                    const safeData = encodeURIComponent(JSON.stringify(u.pdfState));
                    controls += `
                        <button class="btn-spy" data-pdf="${safeData}" title="Ver Partitura" 
                            style="background:none; border:none; cursor:pointer; font-size:15px; opacity:0.8;">
                            👁️
                        </button>`;
                }
            }

            return `
            <div class="participant-row" style="display:flex; align-items:center; padding:5px; border-bottom:1px solid #333;">
                <div style="display:flex; align-items:center; gap:6px; flex:1;">
                    <span style="font-size:14px;">${icon}</span>
                    <div style="display:flex; flex-direction:column; line-height:1.1;">
                        <strong style="font-size:12px; color:${isUserTeacher ? 'var(--accent)' : '#fff'}">
                            ${u.name} ${isUserTeacher ? '<span style="font-size:9px; opacity:0.7">[PROFE]</span>' : ''}
                        </strong>
                        ${pageInfo}
                    </div>
                </div>
                <div style="display:flex; align-items:center;">
                    ${controls}
                </div>
            </div>`;
        }).join('');

        // Listeners Spy
        this.participantsList.querySelectorAll('.btn-spy').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                try {
                    const pdfData = JSON.parse(decodeURIComponent(btn.dataset.pdf));
                    this.bus.emit("ui-spy-user", pdfData);
                } catch(err) { console.error("Error spy:", err); }
            });
        });

        // Listeners Cue
        this.participantsList.querySelectorAll('.btn-cue').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetId = btn.dataset.id;
                const newSoloId = (this.currentSoloId === targetId) ? null : targetId;
                this.currentSoloId = newSoloId;
                if(this.lastUserList) this.updateParticipants(this.lastUserList);
                this.bus.emit("ui-toggle-cue", newSoloId);
            });
        });
    }

    // --- FUNCIONALIDAD RESIZER (Arrastrar Pizarra) ---
    initResizer() {
        const handle = document.getElementById('resizeHandle');
        const board = document.querySelector('.board-container');
        if (!handle || !board) return;

        let startY, startHeight;

        const doDrag = (e) => {
            const delta = e.clientY - startY;
            const newHeight = startHeight + delta;
            if (newHeight > 200 && newHeight < window.innerHeight - 150) {
                board.style.height = `${newHeight}px`;
                board.style.flex = "none"; 
            }
        };

        const stopDrag = () => {
            document.documentElement.removeEventListener('mousemove', doDrag);
            document.documentElement.removeEventListener('mouseup', stopDrag);
            document.body.style.cursor = ''; 
            document.body.style.userSelect = ''; 
        };

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault(); 
            startY = e.clientY;
            startHeight = parseInt(window.getComputedStyle(board).height, 10);
            document.documentElement.addEventListener('mousemove', doDrag);
            document.documentElement.addEventListener('mouseup', stopDrag);
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
        });
    }

    // --- IDENTIDAD Y OVERLAY ---
    loadIdentity() {
        const params = new URLSearchParams(window.location.search);
        if (params.get("role") === "student") {
            if (this.inputName) this.inputName.value = ""; 
            this.toggleOverlay(true, "👋 BIENVENIDO", "Escribe tu nombre en el menú izquierdo para entrar.");
            return; 
        }
        try {
            const saved = localStorage.getItem('pianoUser');
            if (saved) {
                const data = JSON.parse(saved);
                if (data.name && this.inputName) this.inputName.value = data.name;
            }
        } catch (e) {}
    }

    toggleOverlay(show, title = "", msg = "") {
        if (!this.waitingOverlay) return;
        if (show) {
            this.waitingOverlay.style.display = "flex";
            this.waitingOverlay.style.opacity = "1";
            this.waitingOverlay.innerHTML = `
                <div style="font-size:40px; margin-bottom:10px;">🎹</div>
                <h2 style="color:var(--accent); margin-bottom:5px;">${title}</h2>
                <p style="margin-bottom:30px;">${msg}</p>
            `;
        } else {
            this.waitingOverlay.style.display = "none";
        }
    }

    handleClassStatus(isActive) {
        let role = new URLSearchParams(window.location.search).get("role");
        if (!role) {
            try { role = JSON.parse(localStorage.getItem('pianoUser')).role; } catch(e) {}
        }

        if (role === 'teacher') {
            this.toggleOverlay(false);
            if (this.btnEndClass) this.btnEndClass.style.display = isActive ? 'block' : 'none';
            return;
        }

        if (isActive) {
            this.toggleOverlay(false);
            if (this.btnExitClass) this.btnExitClass.style.display = 'block';
            if (this.joinControls) this.joinControls.style.display = 'none';
        } else {
            this.toggleOverlay(true, "☕ SALA DE ESPERA", "Tu piano se activará cuando el profesor inicie la clase.");
            if (this.btnExitClass) this.btnExitClass.style.display = 'none';
        }
    }

    // --- HELPERS Y UI GENERAL ---
    handleJoin() {
        const name = this.inputName.value.trim();
        const code = document.getElementById("codigoSala").value.toUpperCase();
        if (!name) { alert("⚠️ Escribe tu nombre."); return; }
        this.toggleOverlay(true, "⌛ CONECTANDO...", "Entrando al aula...");
        this.saveIdentity(name, 'student');
        if(code) this.bus.emit("ui-join", { name, code });
    }

    async handleMagicLink() {
        const currentName = this.inputName.value.trim() || "Profesor";
        this.saveIdentity(currentName, 'teacher');
        let roomCode = window.PREDEFINED_ROOM || "SALA-" + Math.floor(Math.random() * 10000);
        this.bus.emit("ui-create", { name: currentName, code: roomCode });
        const url = `${window.location.origin}/?role=student&sala=${roomCode.toLowerCase()}`;
        try {
            await navigator.clipboard.writeText(url);
            this.btnMagicLink.innerText = "✅ LINK COPIADO";
            this.btnMagicLink.style.backgroundColor = "#28a745";
            this.btnMagicLink.style.color = "#fff";
            setTimeout(() => {
                this.btnMagicLink.innerText = "🔗 GENERAR LINK A ALUMNO";
                this.btnMagicLink.style.backgroundColor = "";
                this.btnMagicLink.style.color = "";
            }, 3000);
            if(this.btnEndClass) this.btnEndClass.style.display = "block";
        } catch (err) { this.log("Error copiando link", 'error'); }
    }

    saveIdentity(name, role) {
        localStorage.setItem('pianoUser', JSON.stringify({ name, role }));
    }

    setupUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const r = params.get("role");
        const s = params.get("sala") || params.get("room");
        if (r) {
            const radio = document.querySelector(`input[value="${r}"]`);
            if(radio) radio.checked = true;
            this.updateUIForRole(r);
        }
        if(s && document.getElementById("codigoSala")) {
            document.getElementById("codigoSala").value = s;
        }
    }

    updateUIForRole(role) {
        const createCard = document.getElementById("cardCrearSala");
        const joinCard = document.getElementById("cardUnirseSala");
        const indicator = document.getElementById("roleIndicator");
        const roleToggles = document.querySelector('.role-toggles');

        if (role === 'teacher') {
            if(createCard) createCard.style.display = 'block';
            if(joinCard) joinCard.style.display = 'none';
            if(indicator) { indicator.innerText = "PROFESOR"; indicator.style.background = "var(--prof-color)"; }
            if (this.logPanel) this.logPanel.style.display = 'flex';
        } else {
            if(createCard) createCard.style.display = 'none';
            if(joinCard) joinCard.style.display = 'block';
            if(indicator) { indicator.innerText = "ALUMNO"; indicator.style.background = "var(--alum-color)"; }
            if (this.logPanel) this.logPanel.style.display = 'none';
            if(roleToggles && new URLSearchParams(window.location.search).get("role") === "student") {
                roleToggles.style.display = 'none';
            }
        }
    }

    switchTab(mode) {
        const music = document.getElementById("modeMusic");
        const pdf = document.getElementById("modePdf");
        const btnM = document.getElementById("tabMusicBtn");
        const btnP = document.getElementById("tabPdfBtn");
        if (mode === 'music') {
            music?.classList.remove("hidden");
            if(pdf) { pdf.classList.add("hidden"); pdf.style.display = "none"; }
            btnM?.classList.add("active"); btnP?.classList.remove("active");
        } else {
            music?.classList.add("hidden");
            if(pdf) { pdf.classList.remove("hidden"); pdf.style.display = "flex"; }
            btnP?.classList.add("active"); btnM?.classList.remove("active");
        }
    }

    initLogger() {
        if (!this.logTerminal) return;
        this.bus.on("net-status", (status) => this.log(`Red: ${status}`, status === 'ONLINE' ? 'success' : 'error'));
        this.bus.on("room-created", (code) => this.log(`Sala Creada: ${code}`, 'success'));
        this.bus.on("room-joined", (code) => this.log(`Unido a Sala: ${code}`, 'success'));
        this.bus.on("ui-panic", () => this.log("⚠️ Reset", 'warn'));
        this.log("Sistema V3 Listo.", "info");
    }

    log(msg, type = 'info') {
        if (!this.logTerminal) return;
        const div = document.createElement("div");
        div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
        if (type === 'error') div.style.color = '#ff4d4d';
        else if (type === 'success') div.style.color = '#b4e080';
        else if (type === 'warn') div.style.color = '#f1c40f';
        else div.style.color = '#ccc';
        this.logTerminal.appendChild(div);
        this.logTerminal.scrollTop = this.logTerminal.scrollHeight;
    }

    hexToRgba(hex, alpha) {
        let r=0, g=0, b=0;
        if (hex.length === 4) {
            r = parseInt("0x" + hex[1] + hex[1]);
            g = parseInt("0x" + hex[2] + hex[2]);
            b = parseInt("0x" + hex[3] + hex[3]);
        } else if (hex.length === 7) {
            r = parseInt("0x" + hex[1] + hex[2]);
            g = parseInt("0x" + hex[3] + hex[4]);
            b = parseInt("0x" + hex[5] + hex[6]);
        }
        return `rgba(${r},${g},${b},${alpha})`;
    }
}