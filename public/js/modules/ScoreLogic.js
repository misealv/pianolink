/* public/js/modules/ScoreLogic.js */
import { AnnotationLayer } from './AnnotationLayer.js';

export class ScoreLogic {
    constructor(socket) {
        this.socket = socket;
        this.pdfDoc = null;
        
        // Estado de Navegación
        this.pageNum = 1;         // Puede ser numero (PDF) o 'whiteboard'
        this.lastPdfPage = 1;     // Para recordar donde estabas al volver del PDF
        
        this.pageRendering = false;
        this.pageNumPending = null;
        this.currentUrl = null;
        this.currentTab = 'music'; // music, pdf, whiteboard
        
        // --- ESTADO ---
        this.currentScoreId = null; 
        this.zoomLevel = 1.0;
        this.baseScale = 1.0; 
        this.annotations = null; // Instancia dinámica
        this.pageData = {}; // Memoria de todas las páginas y pizarras
        
        // ESTADO DE SALA
        this.currentRoomCode = null;

        // Bindings
        this.handleRemoteUpdate = this.handleRemoteUpdate.bind(this);

        this.init();
    }

    el(id) { return document.getElementById(id); }

    setRoomCode(code) {
        this.currentRoomCode = code;
        console.log("🎯 ScoreLogic: Sala establecida a", code);
    }

    getRoomCode() {
        if (this.currentRoomCode) return this.currentRoomCode;
        if (window.PREDEFINED_ROOM) return window.PREDEFINED_ROOM;
        const params = new URLSearchParams(window.location.search);
        return (params.get('sala') || 'GENERAL').toUpperCase();
    }

    // --- HELPER: GUARDADO LOCAL ---
    saveLocalState() {
        if (this.annotations) {
            const currentJson = this.annotations.getJSON();
            // Guardamos usando la página actual (sea numero o 'whiteboard')
            if (currentJson) {
                this.pageData[this.pageNum] = currentJson;
            } else {
                delete this.pageData[this.pageNum];
            }
        }
    }

    init() {
        console.log("📚 ScoreLogic: Iniciando...");
        this.bindUI();
        
        // --- LISTENERS DE SOCKET (Entrantes) ---
        
        // A) RECIBIR DIBUJO (Tiempo Real)
        this.socket.on('wb-draw', (data) => {
            // Usamos comparación laxa (==) por si string vs number
            if (this.annotations && data.page == this.pageNum) {
                this.annotations.drawRemotePath(data.path);
                this.saveLocalState();
            } else {
                // Si no estamos viendo esa página, guardamos el cambio en memoria para verlo después
                // (Opcional: Podría requerir lógica más compleja para mergear JSON, 
                // por ahora confiamos en el sync al cambiar de página)
            }
        });

        // B) RECIBIR BORRADO INDIVIDUAL
        this.socket.on('wb-delete', (data) => {
            if (this.annotations && data.page == this.pageNum) {
                this.annotations.removeObjectById(data.id);
                this.saveLocalState();
            }
        });

        // C) RECIBIR BORRADO TOTAL
        this.socket.on('wb-clear', (data) => {
            if (this.annotations && data.page == this.pageNum) {
                this.annotations.clear(false); 
                delete this.pageData[this.pageNum];
            }
        });

        // D) RECIBIR LÁSER
        this.socket.on('wb-pointer', (data) => {
            if (this.annotations && data.page == this.pageNum) {
                this.annotations.updateRemoteLaser(data.x, data.y);
            }
        });

        // E) RECIBIR SINCRONIZACIÓN (Soy el alumno que llegó tarde)
        this.socket.on('wb-sync-response', (data) => {
            // Si estoy viendo la página que me mandaron, la cargo
            if (data.page == this.pageNum && data.canvasState) {
                console.log("📥 Recibida sincronización de pizarra completa");
                if(this.annotations) {
                    this.annotations.loadJSON(data.canvasState);
                    this.saveLocalState();
                }
            } 
            // También guardamos en memoria por si acaso cambio a esa página luego
            if (data.canvasState) {
                this.pageData[data.page] = data.canvasState;
            }
        });
        
        // F) SOLICITUD DE SYNC (Soy el profesor y alguien me pide datos)
        this.socket.on('wb-request-sync', (data) => {
            const user = JSON.parse(localStorage.getItem('pianoUser') || '{}');
            
            // Solo el profesor responde para no saturar la red con respuestas de todos los alumnos
            if (user.role !== 'teacher') return;

            let stateToSend = null;

            // Opción 1: Estoy mirando la pizarra ahora mismo
            if (this.pageNum == data.page && this.annotations) {
                stateToSend = this.annotations.getJSON();
            } 
            // Opción 2: No la estoy mirando (estoy en PDF), pero tengo datos guardados en memoria
            else if (this.pageData[data.page]) {
                stateToSend = this.pageData[data.page];
            }

            if (stateToSend) {
                console.log(`📤 Enviando estado de pizarra (${data.page}) a nuevo usuario`);
                this.socket.emit('wb-sync-response', {
                    room: this.getRoomCode(),
                    page: data.page,
                    canvasState: stateToSend
                });
            }
        });

        // 3. OBSERVER PARA REDIMENSIONAR (Responsive)
        window.addEventListener('resize', () => {
             if (this.currentTab === 'whiteboard') {
                 this.resizeWhiteboard();
             } else if (this.currentTab === 'pdf') {
                 if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
                 this.resizeTimeout = setTimeout(() => {
                     if (this.pdfDoc) this.renderPage(this.pageNum);
                 }, 200);
             }
        });
    }

    // --- Ajuste de tamaño específico para Pizarra ---
    resizeWhiteboard() {
        if (this.currentTab !== 'whiteboard' || !this.annotations) return;
        
        const wrapper = this.el('whiteboard-wrapper');
        if (wrapper) {
            const width = wrapper.clientWidth;
            const height = wrapper.clientHeight;
            
            if (width === 0 || height === 0) return;
            this.annotations.updateDimensions(width, height, 1); 
        }
    }

    // --- GESTIÓN DE CANVAS DINÁMICO ---
    setupCanvasContext(canvasId) {
        console.log(`🖌️ ScoreLogic: Contexto dibujo -> '${canvasId}'`);
        // Nota: AnnotationLayer se encarga de limpiar listeners viejos si el canvas se reusa
        this.annotations = new AnnotationLayer(canvasId);
        this.bindAnnotationEvents();
    }

    bindAnnotationEvents() {
        if (!this.annotations) return;

        this.annotations.onPathCreated((pathData) => {
            this.socket.emit('wb-draw', { 
                room: this.getRoomCode(), 
                path: pathData, 
                page: this.pageNum, 
                scoreId: this.currentScoreId
            });
            this.saveLocalState();
        });

        this.annotations.onObjectRemoved((objectId) => {
            this.socket.emit('wb-delete', {
                room: this.getRoomCode(),
                id: objectId,
                page: this.pageNum,
                scoreId: this.currentScoreId
            });
            this.saveLocalState();
        });

        this.annotations.onClear(() => {
            this.socket.emit('wb-clear', { 
                room: this.getRoomCode(), 
                page: this.pageNum, 
                scoreId: this.currentScoreId
            });
            delete this.pageData[this.pageNum];
        });

        this.annotations.onPointerMove((coords) => {
            this.socket.emit('wb-pointer', { 
                room: this.getRoomCode(), 
                x: coords.x, 
                y: coords.y, 
                page: this.pageNum
            });
        });
    }

    // --- CARGAR ANOTACIONES (BD) ---
    async loadAnnotationsFromDB(scoreId) {
        if (!scoreId) return;
        try {
            const res = await fetch(`/api/scores/${scoreId}/annotations`);
            if (!res.ok) return;
            const annotations = await res.json(); 

            this.pageData = {};
            const map = {};
            annotations.forEach(note => {
                if(!map[note.page]) map[note.page] = [];
                map[note.page].push(note.data);
            });

            for (const [page, objects] of Object.entries(map)) {
                this.pageData[page] = JSON.stringify({ version: "5.3.0", objects: objects });
            }
            
            // Cargar datos actuales si existen
            if (this.annotations && this.pageData[this.pageNum]) {
                this.annotations.loadJSON(this.pageData[this.pageNum]);
            }
            
        } catch (e) { console.error("Error cargando notas:", e); }
    }

    bindUI() {
        // Zoom
        const btnZoomIn = this.el('zoom-in');
        const btnZoomOut = this.el('zoom-out');
        if(btnZoomIn) btnZoomIn.onclick = () => this.changeZoom(0.2);
        if(btnZoomOut) btnZoomOut.onclick = () => this.changeZoom(-0.2);

        // Pestañas
        const tabMusic = this.el('tabMusicBtn');
        const tabPdf = this.el('tabPdfBtn');
        const tabBoard = this.el('tabBoardBtn');
        
        if(tabMusic) tabMusic.onclick = () => { this.saveLocalState(); this.switchTab('music'); };
        if(tabPdf) tabPdf.onclick = () => { this.saveLocalState(); this.switchTab('pdf'); };
        if(tabBoard) tabBoard.onclick = () => { this.saveLocalState(); this.switchTab('whiteboard'); };

        // Estante y Paginación
        const btnOpen = this.el('btnOpenShelf');
        const btnClose = this.el('btnCloseShelf');
        if(btnOpen) btnOpen.onclick = () => { this.el('shelf-modal').style.display = 'block'; this.loadShelf(); };
        if(btnClose) btnClose.onclick = () => this.el('shelf-modal').style.display = 'none';
        
        const btnPrev = this.el('prev-page');
        const btnNext = this.el('next-page');
        if(btnPrev) btnPrev.onclick = () => this.changePage(-1);
        if(btnNext) btnNext.onclick = () => this.changePage(1);
        
        const btnUpload = this.el('btnUploadScore');
        if(btnUpload) btnUpload.onclick = () => this.uploadScore();

        // --- BARRA DE HERRAMIENTAS ---
        const toolbar = this.el('drawing-toolbar');
        if (toolbar) {
            const btnMove = this.el('tool-move');
            const btnPencil = this.el('tool-pencil');
            const btnText = this.el('tool-text');
            const btnCircle = this.el('tool-circle'); 
            const btnLaser = this.el('tool-laser');
            const btnClear = this.el('tool-clear');
            const colorPicker = this.el('tool-color');

            const setActive = (btn) => {
                [btnMove, btnPencil, btnText, btnCircle, btnLaser].forEach(b => {
                    if(b) b.classList.remove('active');
                });
                if(btn) btn.classList.add('active');
            };

            btnMove.onclick = () => { if(this.annotations) { this.annotations.setMode('move'); setActive(btnMove); } };
            
            btnPencil.onclick = () => { 
                if(this.annotations) { 
                    this.annotations.setMode('draw'); 
                    setActive(btnPencil); 
                    if(colorPicker) this.annotations.setBrushColor(colorPicker.value);
                } 
            };
            
            if(btnText) btnText.onclick = () => { if(this.annotations) { this.annotations.setMode('text'); setActive(btnText); } };
            
            if(btnCircle) btnCircle.onclick = () => { 
                if(this.annotations) { 
                    this.annotations.setMode('circle'); 
                    setActive(btnCircle); 
                    if(colorPicker) this.annotations.setBrushColor(colorPicker.value);
                } 
            };

            if(btnLaser) btnLaser.onclick = () => { if(this.annotations) { this.annotations.setMode('laser'); setActive(btnLaser); } };

            colorPicker.oninput = (e) => {
                if(this.annotations) {
                    this.annotations.setBrushColor(e.target.value);
                    if (!this.annotations.canvas.isDrawingMode) {
                        this.annotations.setMode('draw'); setActive(btnPencil);
                    }
                }
            };

            btnClear.onclick = () => {
                if(!this.annotations) return;
                if(this.annotations.canvas.getActiveObject()) {
                    this.annotations.deleteSelected();
                } else {
                    if(confirm("¿Borrar todo?")) {
                        this.annotations.clear();
                        delete this.pageData[this.pageNum];
                    }
                }
            };
        }
    }

    changeZoom(delta) {
        if(!this.pdfDoc) return;
        let newZoom = this.zoomLevel + delta;
        newZoom = Math.max(0.5, Math.min(newZoom, 3.0));
        this.zoomLevel = newZoom;
        this.renderPage(this.pageNum);
    }

    // --- LÓGICA DE PESTAÑAS Y ACTIVACIÓN ---
    switchTab(tab) {
        this.currentTab = tab;
        
        const modeMusic = this.el('modeMusic');
        const modePdf = this.el('modePdf');
        const modeBoard = this.el('modeWhiteboard');

        const btnMusic = this.el('tabMusicBtn');
        const btnPdf = this.el('tabPdfBtn');
        const btnBoard = this.el('tabBoardBtn');
        const toolbar = this.el('drawing-toolbar');

        // 1. Ocultar todo
        [modeMusic, modePdf, modeBoard].forEach(el => { if(el) { el.classList.add('hidden'); el.style.display = 'none'; }});
        [btnMusic, btnPdf, btnBoard].forEach(el => { if(el) el.classList.remove('active'); });

        // 2. Activar seleccionado
        if (tab === 'music') {
            if(modeMusic) { modeMusic.classList.remove('hidden'); modeMusic.style.display = 'flex'; }
            if(btnMusic) btnMusic.classList.add('active');
            if(toolbar) toolbar.style.display = 'none';

        } else if (tab === 'pdf') {
            if (this.pageNum === 'whiteboard') this.pageNum = this.lastPdfPage || 1;
            
            if(modePdf) { modePdf.classList.remove('hidden'); modePdf.style.display = 'flex'; }
            if(btnPdf) btnPdf.classList.add('active');
            if(toolbar) toolbar.style.display = 'flex';
            
            this.setupCanvasContext('annotation-layer');

            if(this.pdfDoc) setTimeout(() => this.renderPage(this.pageNum), 100);
            else this.loadShelf();

        } else if (tab === 'whiteboard') {
            // Guardar última página PDF
            if (typeof this.pageNum === 'number') this.lastPdfPage = this.pageNum;
            this.pageNum = 'whiteboard'; 

            if(modeBoard) { modeBoard.classList.remove('hidden'); modeBoard.style.display = 'flex'; }
            if(btnBoard) btnBoard.classList.add('active');
            if(toolbar) toolbar.style.display = 'flex';
            
            this.setupCanvasContext('wb-layer'); 
            
            setTimeout(() => {
                this.resizeWhiteboard();
                window.dispatchEvent(new CustomEvent('whiteboard-active')); 
                
                // LÓGICA DE PERSISTENCIA Y SYNC
                if (this.pageData['whiteboard']) {
                    // Si ya tengo datos locales, los cargo
                    this.annotations.loadJSON(this.pageData['whiteboard']);
                } else {
                    // Si no tengo datos, los PIDO A LA SALA (Sync tardío)
                    console.log("📡 Nuevo en pizarra: Pidiendo estado al profesor...");
                    this.socket.emit('wb-request-sync', { room: this.getRoomCode(), page: 'whiteboard' });
                }
            }, 50);
        }
    }

    changePage(offset) {
        if(!this.pdfDoc || this.currentTab !== 'pdf') return;
        const newPage = this.pageNum + offset;
        
        if(newPage >= 1 && newPage <= this.pdfDoc.numPages) {
            this.saveLocalState();
            if(this.annotations) this.annotations.clear(false);

            this.pageNum = newPage;
            this.renderPage(this.pageNum);
            
            this.socket.emit('update-pdf-state', { 
                url: this.currentUrl, 
                page: this.pageNum,
                roomCode: this.getRoomCode(),
                scoreId: this.currentScoreId
            });
        }
    }

    openPdf(url, title, initialPage = 1, scoreId = null) {
        if (!url) return;
        this.currentUrl = url;
        this.currentScoreId = scoreId;
        
        const titleEl = this.el('current-score-title');
        if(titleEl) titleEl.innerText = title || "Documento";
        
        const loader = this.el('pdf-loading-msg');
        const controls = this.el('pdfFloatingControls');
        if(loader) loader.style.display = 'block';
        if(controls) controls.style.display = 'flex';

        this.zoomLevel = 1.0;
        if(scoreId) this.loadAnnotationsFromDB(scoreId);

        pdfjsLib.getDocument(url).promise.then(pdf => {
            this.pdfDoc = pdf;
            if(this.el('page-count')) this.el('page-count').textContent = this.pdfDoc.numPages;
            if(loader) loader.style.display = 'none';
            
            this.pageNum = parseInt(initialPage) || 1;
            this.lastPdfPage = this.pageNum; 
            
            if(this.currentTab === 'pdf') this.renderPage(this.pageNum);
            
        }).catch(err => {
            console.error("Error PDF:", err);
            if(loader) loader.innerText = "Error al abrir PDF.";
        });
    }

    renderPage(num) {
        this.pageRendering = true;
        this.pdfDoc.getPage(num).then(page => {
            const container = this.el('pdf-container');
            const canvas = this.el('pdf-render');
            if(!container || !canvas) return;

            const viewportRaw = page.getViewport({scale: 1});
            const availableWidth = container.clientWidth * 0.95;
            this.baseScale = availableWidth / viewportRaw.width;
            const finalScale = this.baseScale * this.zoomLevel;
            const viewport = page.getViewport({scale: finalScale});

            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const ctx = canvas.getContext('2d');
            page.render({ canvasContext: ctx, viewport: viewport }).promise.then(() => {
                this.pageRendering = false;
                
                if (this.annotations && this.currentTab === 'pdf') {
                    this.annotations.updateDimensions(viewport.width, viewport.height, finalScale);
                    const savedData = this.pageData[num];
                    this.annotations.loadJSON(savedData || null);
                }
            });
        });
        if(this.el('page-num')) this.el('page-num').textContent = num;
    }

    handleRemoteUpdate(data) {
        const state = data.pdfState;
        if(!state) return;

        if (state.url && state.url !== this.currentUrl) {
            this.openPdf(state.url, "Sincronizado", state.page, data.scoreId); 
        } else if (state.page && parseInt(state.page) !== parseInt(this.pageNum)) {
            if (this.currentTab === 'pdf') {
                this.saveLocalState();
                this.pageNum = parseInt(state.page);
                if(this.pdfDoc) this.renderPage(this.pageNum);
            } else {
                this.lastPdfPage = parseInt(state.page);
            }
        }
    }

    silentLoad(url, page) {
        if(!url) return;
        this.switchTab('pdf'); 
        if (this.currentUrl !== url) {
            this.openPdf(url, "Modo Espía", page);
        } else {
            this.pageNum = parseInt(page);
            this.renderPage(this.pageNum);
        }
    }

    async uploadScore() {
        const fileInput = this.el('file-upload');
        const titleInput = this.el('upload-title');
        const status = this.el('upload-status');
        const user = JSON.parse(localStorage.getItem('pianoUser') || '{}');
        const room = this.getRoomCode();

        if(fileInput.files.length === 0) return alert("Selecciona un PDF");
        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', titleInput.value);
        formData.append('roomCode', room);
        formData.append('uploaderName', user.name || "Anonimo");

        status.innerText = "Subiendo... ⏳";
        try {
            const res = await fetch('/api/scores/upload', { method: 'POST', body: formData });
            if(res.ok) {
                status.innerText = "¡Listo!";
                fileInput.value = ""; titleInput.value = "";
                this.loadShelf();
            } else { status.innerText = "Error"; }
        } catch(e) { console.error(e); }
    }

    async loadShelf() {
        const list = this.el('shelf-list');
        if(!list) return;
        const room = this.getRoomCode();
        if(this.el('display-room-code')) this.el('display-room-code').innerText = room;
        const isTeacher = (JSON.parse(localStorage.getItem('pianoUser') || '{}').role === 'teacher');
        
        try {
            const res = await fetch(`/api/scores/${room}`);
            const scores = await res.json();
            list.innerHTML = '';
            scores.forEach(score => {
                const div = document.createElement('div');
                div.className = 'score-card';
                div.innerHTML = `<div class="score-icon">📄</div><span class="score-title">${score.title}</span>`;
                if(isTeacher) div.innerHTML += ` <button class="btn-delete" data-id="${score._id}" style="color:red;border:none;background:none;">[x]</button>`;
                div.onclick = (e) => {
                    if(e.target.classList.contains('btn-delete')) { this.deleteScore(score._id, e); return; }
                    this.el('shelf-modal').style.display = 'none';
                    this.openPdf(score.url, score.title, 1, score._id);
                    this.switchTab('pdf'); 
                    
                    this.socket.emit('update-pdf-state', { 
                        url: score.url, 
                        page: 1, 
                        roomCode: room,
                        scoreId: score._id
                    });
                };
                list.appendChild(div);
            });
        } catch(e) {}
    }

    async deleteScore(id, e) {
        e.stopPropagation();
        if(!confirm("¿Borrar?")) return;
        await fetch(`/api/scores/${id}`, { method: 'DELETE' });
        this.loadShelf();
    }
}