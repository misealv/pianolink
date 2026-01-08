/**
 * /public/js/modules/UIManager.js
 * FINAL: UI Manager Completo (Split, Cue, Resizer, Pedal, Espía)
 */
export class UIManager {
    constructor(eventBus) {
        this.bus = eventBus;
        this.currentTab = 'music';
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
        
        // Para el auto-release automático
        this.noteTimeouts = new Map();
        
        // ⚡ INICIALIZAR ESTADO DE TOOLBAR
        this.initToolbarVisibility();

        console.log("✅ UIManager Listo. Overlay detectado:", !!this.waitingOverlay);
    }
    
    /**
     * Inicializa visibilidad de toolbar según pestaña activa
     */
    initToolbarVisibility() {
        const toolbar = document.getElementById('drawing-toolbar');
        if (!toolbar) {
            console.warn('[UIManager] ⚠️ Toolbar NO encontrado en DOM');
            return;
        }
        
        console.log('[UIManager] 🔧 Inicializando toolbar, currentTab:', this.currentTab);
        
        // ⚡ SINGLE SOURCE OF TRUTH: Solo clases controlan visibilidad
        // Toolbar visible en: whiteboard Y pdf (para anotaciones)
        if (this.currentTab === 'whiteboard' || this.currentTab === 'pdf') {
            toolbar.classList.remove('toolbar-hidden');
            toolbar.classList.add('toolbar-visible');
            console.log('[UIManager] ✅ Toolbar VISIBLE (' + this.currentTab + ')');
        } else {
            toolbar.classList.remove('toolbar-visible');
            toolbar.classList.add('toolbar-hidden');
            console.log('[UIManager] 🚫 Toolbar OCULTA (' + this.currentTab + ')');
        }
    }

    initListeners() {
        // Eventos Generales
        if (this.btnMagicLink) this.btnMagicLink.addEventListener("click", () => this.handleMagicLink());
        if (this.btnEndClass) this.btnEndClass.addEventListener("click", () => this.bus.emit("ui-end-class"));
        if (this.btnExitClass) this.btnExitClass.addEventListener("click", () => this.bus.emit("ui-leave"));
        
        document.getElementById("btnUnirse")?.addEventListener("click", () => this.handleJoin());
        document.getElementById("panicBtn")?.addEventListener("click", () => this.bus.emit("ui-panic"));
        document.getElementById("baseColorPicker")?.addEventListener("input", (e) => this.baseColor = e.target.value);

        // --- FASE 4: SELECTOR DE MIDI OUTPUT ---
        const midiOutputSelect = document.getElementById("midiOutputSelect");
        if (midiOutputSelect) {
            midiOutputSelect.addEventListener("change", (e) => {
                const outputId = e.target.value;
                if (outputId) {
                    this.bus.emit("ui-select-midi-output", outputId);
                }
            });
        }

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

    // --- ILUMINACIÓN DE TECLAS (CON SPLIT + FAIL-SAFE + STACCATO FIX) ---
    highlightKey(note, velocity) {
        // ⚡ FIX STACCATO: Velocity 0 = NoteOff con MÁXIMA PRIORIDAD
        // Procesar inmediatamente sin pasar por lógica de encendido
        if (velocity === 0) {
            return this._forceKeyOff(note);
        }

        // 1. Buscar la tecla física en el piano visual
        const key = this.piano.querySelector(`.key[data-note-midi="${note}"]`);
        if (!key) return; // Si la nota está fuera del rango (21-108), salir
    
        // 2. GESTIÓN DEL WATCHDOG (Limpieza automática) - Cancelar timer anterior
        if (this.noteTimeouts.has(note)) {
            clearTimeout(this.noteTimeouts.get(note));
            this.noteTimeouts.delete(note);
        }
    
        // 3. LÓGICA DE COLOREADO (NoteOn)
        // Determinamos el color (Normal o Split)
        let color = this.baseColor;
        if (this.isSplit) {
            color = (note < this.splitPoint) ? this.splitColorL : this.splitColorR;
        }

        // Aplicamos el estilo visual
        const opacity = 0.4 + (velocity / 127) * 0.6;
        key.style.backgroundColor = this.hexToRgba(color, opacity);
        key.style.boxShadow = `0 0 10px ${color}`;
        key.classList.add("note-active");
        
        // Guardar timestamp para detección de acordes
        key.dataset.activatedAt = Date.now();

        // ⚡ FAIL-SAFE STACCATO: TTL reducido a 3s (era 8s)
        // Si no llega NoteOff en 3s, liberar automáticamente
        const timeout = setTimeout(() => {
            console.warn(`⏱️ UI Watchdog: Nota ${note} liberada por TTL (3s)`);
            this._forceKeyOff(note); 
        }, 3000); // ⬅️ REDUCIDO de 8s a 3s para staccatos

        this.noteTimeouts.set(note, timeout);
    }

    // ⚡ NUEVO: Apagado forzado de tecla con prioridad absoluta
    // Este método NUNCA espera animaciones, actúa síncronamente
    _forceKeyOff(note) {
        // 1. Cancelar cualquier timer pendiente INMEDIATAMENTE
        if (this.noteTimeouts.has(note)) {
            clearTimeout(this.noteTimeouts.get(note));
            this.noteTimeouts.delete(note);
        }

        // 2. Buscar y apagar la tecla SIN TRANSICIONES
        const key = this.piano.querySelector(`.key[data-note-midi="${note}"]`);
        if (key) {
            // Forzar reflow para cancelar cualquier animación CSS en curso
            key.style.transition = 'none';
            key.classList.remove("note-active");
            delete key.dataset.activatedAt;
            this.restoreKeyColor(key, note);
            
            // Restaurar transiciones después de un frame
            requestAnimationFrame(() => {
                key.style.transition = '';
            });
        }
    }
    
    // ⚡ Limpieza forzada de todas las teclas activas
    // Llamado cuando se detecta un cambio drástico de armonía
    clearStaleKeys() {
        const activeKeys = this.piano.querySelectorAll('.key.note-active');
        const now = Date.now();
        let clearedCount = 0;
        
        activeKeys.forEach(key => {
            const note = parseInt(key.dataset.noteMidi);
            const activatedAt = parseInt(key.dataset.activatedAt || 0);
            const age = now - activatedAt;
            
            // Si la tecla lleva más de 2s activa, es sospechosa
            if (age > 2000) {
                console.warn(`🧹 Auto-limpieza: Tecla ${note} (${age}ms activa) - Asumiendo noteOff perdido`);
                this._forceKeyOff(note);
                clearedCount++;
            }
        });
        
        if (clearedCount > 0) {
            console.log(`✅ Limpieza preventiva: ${clearedCount} teclas liberadas`);
        }
    }
    
    // Método de limpieza manual (llamado desde reconciliación)
    // Redirige al método optimizado _forceKeyOff
    forceReleaseKey(note) {
        this._forceKeyOff(note);
    }
    clearPiano() {
        if (!this.piano) return;
        // Buscamos todas las teclas que tengan la clase de actividad
        const activeKeys = this.piano.querySelectorAll(".note-active");
        activeKeys.forEach(key => {
            key.classList.remove("note-active");
            const note = parseInt(key.getAttribute('data-note-midi'), 10);
            this.restoreKeyColor(key, note); // Restauramos color original según Split
        });
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
                // C) BOTÓN BROADCAST (NUEVO)
                const isBroadcasting = (this.currentBroadcasterId === u.socketId);
                const castColor = isBroadcasting ? '#e74c3c' : '#bbb'; 
                const castBg = isBroadcasting ? 'rgba(231, 76, 60, 0.2)' : 'rgba(255, 255, 255, 0.1)';

                controls += `
                    <button class="btn-cast" data-id="${u.socketId}" title="Transmitir a toda la clase"
                        style="background:${castBg}; border:1px solid ${castColor}; color:${castColor}; 
                            border-radius:4px; margin-right:8px; cursor:pointer; 
                            padding:2px 6px; font-size:14px;">
                        📡
                    </button>
                `;
               // B) BOTÓN OJO (👁️)
               if (u.pdfState && u.pdfState.url) {
                // El scoreId debe venir dentro de pdfState (lo configuramos en server.js)
                const safeData = encodeURIComponent(JSON.stringify(u.pdfState));
                controls += `
                <button class="btn-spy" 
                data-pdf="${safeData}" 
                data-user-id="${u.socketId}" 
                title="Ver Partitura"
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
                    const pdfState = JSON.parse(decodeURIComponent(btn.dataset.pdf));
                    const targetUserId = btn.dataset.userId; // <--- CAPTURAMOS EL ID
        
                    this.bus.emit("ui-spy-user", {
                        url: pdfState.url,
                        page: pdfState.page,
                        scoreId: pdfState.scoreId,
                        userId: targetUserId // <--- ENVIAMOS EL ID AL BUS
                    });
                    
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

        // Listener Broadcast 
        this.participantsList.querySelectorAll('.btn-cast').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.bus.emit("ui-set-broadcaster", btn.dataset.id);
            });
        });
    }

    // --- FUNCIONALIDAD RESIZER (Arrastrar Pizarra) ---
    initResizer() {
        const handle = document.getElementById('resizeHandle');
        const board = document.querySelector('.board-container');
        if (!handle || !board) return;

        let startY, startHeight;
        let rafId = null;
        let pendingHeight = 0;
        let activePointerId = null;

        // === CSS PARA TOUCH ===
        handle.style.touchAction = 'none';

        const doDrag = (e) => {
            // Solo procesar el pointer que inició
            if (e.pointerId !== activePointerId) return;
            
            e.preventDefault();
            const delta = e.clientY - startY;
            const newHeight = startHeight + delta;
            
            if (newHeight > 200 && newHeight < window.innerHeight - 150) {
                pendingHeight = newHeight;
                
                // RAF para fluidez
                if (!rafId) {
                    rafId = requestAnimationFrame(() => {
                        board.style.height = `${pendingHeight}px`;
                        board.style.flex = "none"; 
                        rafId = null;
                    });
                }
            }
        };

        const stopDrag = (e) => {
            if (e.pointerId !== activePointerId) return;
            
            // Liberar captura
            if (handle.hasPointerCapture && handle.hasPointerCapture(e.pointerId)) {
                handle.releasePointerCapture(e.pointerId);
            }
            
            handle.removeEventListener('pointermove', doDrag);
            handle.removeEventListener('pointerup', stopDrag);
            handle.removeEventListener('pointercancel', stopDrag);
            
            document.body.style.cursor = ''; 
            document.body.style.userSelect = '';
            activePointerId = null;
            
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        };

        handle.addEventListener('pointerdown', (e) => {
            e.preventDefault(); 
            activePointerId = e.pointerId;
            startY = e.clientY;
            startHeight = parseInt(window.getComputedStyle(board).height, 10);
            
            // Capturar pointer
            handle.setPointerCapture(e.pointerId);
            
            handle.addEventListener('pointermove', doDrag);
            handle.addEventListener('pointerup', stopDrag);
            handle.addEventListener('pointercancel', stopDrag);
            
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
        if (this.currentTab === mode) return; 
        this.currentTab = mode;
    
        const music = document.getElementById("modeMusic");
        const pdf = document.getElementById("modePdf");
        const board = document.getElementById("modeWhiteboard");
        const toolbar = document.getElementById("drawing-toolbar");
        
        const btnM = document.getElementById("tabMusicBtn");
        const btnP = document.getElementById("tabPdfBtn");
        const btnB = document.getElementById("tabBoardBtn");
    
        // 1. Ocultar contenedores
        [music, pdf, board].forEach(el => {
            if (el) {
                el.classList.add("hidden");
                el.style.display = "none";
            }
        });
        [btnM, btnP, btnB].forEach(btn => btn?.classList.remove("active"));
    
        // 2. Mostrar modo seleccionado
        if (mode === 'music') {
            if (music) { music.classList.remove("hidden"); music.style.display = "flex"; }
            btnM?.classList.add("active");
            // ⚡ SINGLE SOURCE OF TRUTH: Ocultar toolbar via clases
            if (toolbar) {
                toolbar.classList.remove('toolbar-visible');
                toolbar.classList.add('toolbar-hidden');
                console.log('[UIManager] 🚫 Toolbar oculta (música)');
            }
        } else if (mode === 'pdf') {
            if (pdf) { pdf.classList.remove("hidden"); pdf.style.display = "flex"; }
            btnP?.classList.add("active");
            // ⚡ FIX: MOSTRAR toolbar en modo PDF para poder anotar sobre partituras
            if (toolbar) {
                toolbar.classList.remove('toolbar-hidden');
                toolbar.classList.add('toolbar-visible');
                console.log('[UIManager] ✅ 🎨 TOOLBAR VISIBLE (PDF - Anotaciones)');
            }
        } else if (mode === 'whiteboard') {
            if (board) { board.classList.remove("hidden"); board.style.display = "flex"; }
            btnB?.classList.add("active");
            // ⚡ SINGLE SOURCE OF TRUTH: Mostrar toolbar via clases
            if (toolbar) {
                toolbar.classList.remove('toolbar-hidden');
                toolbar.classList.add('toolbar-visible');
                console.log('[UIManager] ✅ 🎨 TOOLBAR VISIBLE (Pizarra)');
            }
        }
        
        // 3. FIX: Delay para que el navegador recalcule dimensiones (Evita pantalla gris)
        // Usamos un pequeño delay para asegurar que el display:flex ya sea efectivo
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 20); 
    }
    initLogger() {
        if (!this.logTerminal) return;
        
        // Estado de red mejorado con indicador visual
        this.bus.on("net-status", (status) => {
            let logType, icon;
            if (status === 'ONLINE') {
                logType = 'success';
                icon = '🟢';
                this.updateConnectionIndicator('online');
            } else if (status === 'WARNING') {
                logType = 'warn';
                icon = '⚠️';
                this.updateConnectionIndicator('warning');
            } else if (status === 'RECONNECTING') {
                logType = 'error';
                icon = '🔄';
                this.updateConnectionIndicator('reconnecting');
            } else {
                logType = 'error';
                icon = '🔴';
                this.updateConnectionIndicator('offline');
            }
            this.log(`${icon} Red: ${status}`, logType);
        });
        
        this.bus.on("room-created", (code) => this.log(`Sala Creada: ${code}`, 'success'));
        this.bus.on("room-joined", (code) => this.log(`Unido a Sala: ${code}`, 'success'));
        this.bus.on("ui-panic", () => this.log("⚠️ Reset", 'warn'));
        this.log("Sistema V3 Listo.", "info");
    }
    
    // Indicador visual de estado de conexión en UI
    updateConnectionIndicator(status) {
        // Buscar o crear indicador de conexión
        let indicator = document.getElementById('connectionIndicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'connectionIndicator';
            indicator.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                padding: 8px 12px;
                border-radius: 6px;
                font-weight: bold;
                font-size: 12px;
                z-index: 9500;
                transition: all 0.3s ease;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            `;
            document.body.appendChild(indicator);
        }
        
        // Actualizar estilo según estado
        if (status === 'online') {
            indicator.textContent = '🟢 CONECTADO';
            indicator.style.backgroundColor = '#27ae60';
            indicator.style.color = 'white';
        } else if (status === 'warning') {
            indicator.textContent = '⚠️ CONEXIÓN DÉBIL';
            indicator.style.backgroundColor = '#f39c12';
            indicator.style.color = 'white';
            indicator.style.animation = 'pulse 2s infinite';
        } else if (status === 'reconnecting') {
            indicator.textContent = '🔄 RECONECTANDO...';
            indicator.style.backgroundColor = '#e74c3c';
            indicator.style.color = 'white';
            indicator.style.animation = 'pulse 1s infinite';
        } else {
            indicator.textContent = '🔴 DESCONECTADO';
            indicator.style.backgroundColor = '#c0392b';
            indicator.style.color = 'white';
        }
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
        //  Manejar aviso visual de "En Vivo"
    handleBroadcasterChange(broadcasterId, myId) {
        this.currentBroadcasterId = broadcasterId;
        if (this.lastUserList) this.updateParticipants(this.lastUserList); // Refrescar botones

        const statusDiv = document.getElementById('status');
        if (!statusDiv) return;

        if (broadcasterId && broadcasterId === myId) {
            // SOY YO
            statusDiv.innerHTML = `🔴 <b>TRANSMITIENDO EN VIVO</b>`;
            statusDiv.style.background = "#e74c3c";
            statusDiv.style.color = "#fff";
            document.body.style.border = "4px solid #e74c3c";
        } else {
            // RESTAURAR
            const code = document.getElementById("codigoSala")?.value || "";
            statusDiv.innerHTML = `🟢 En Sala: ${code}`;
            statusDiv.style.background = "";
            statusDiv.style.color = "";
            document.body.style.border = "none";
        }
    }

    updateLatencyUI(rtt) {
        // Buscamos el div de estado que ya tienes en el HTML
        const statusDiv = document.getElementById('status');
        if (!statusDiv) return;
    
        // Determinamos un color sutil (gris si está bien, naranja si hay riesgo)
        let color = "#666"; // Muy discreto
        if (rtt > 300) color = "#e67e22"; // Naranja si supera el Jitter Buffer
    
        // Buscamos o creamos un pequeño span para no romper el texto actual
        let latencySpan = document.getElementById('latency-monitor');
        if (!latencySpan) {
            latencySpan = document.createElement('span');
            latencySpan.id = 'latency-monitor';
            latencySpan.style.fontSize = '9px';
            latencySpan.style.marginLeft = '10px';
            latencySpan.style.opacity = '0.7';
            statusDiv.appendChild(latencySpan);
        }
    
        latencySpan.innerText = `[Ping: ${rtt}ms]`;
        latencySpan.style.color = color;
    }

}