/* public/js/modules/ScoreLogic.js */
import { AnnotationLayer } from './AnnotationLayer.js';

export class ScoreLogic {
    constructor(socket) {
        this.socket = socket;
        this.pdfDoc = null;
        this.pageNum = 1;
        this.pageRendering = false;
        this.pageNumPending = null;
        this.currentUrl = null;
        
        // --- ESTADO ---
        this.zoomLevel = 1.0;
        this.baseScale = 1.0; 
        this.annotations = null;
        this.pageData = {}; 
        
        // ESTADO DE SALA (Controlado por Main.js)
        this.currentRoomCode = null;

        // Bindings
        this.handleRemoteUpdate = this.handleRemoteUpdate.bind(this);

        this.init();
    }

    el(id) { return document.getElementById(id); }

    // --- NUEVO: MÉTODO PARA RECIBIR LA SALA DESDE MAIN.JS ---
    setRoomCode(code) {
        this.currentRoomCode = code;
        console.log("🎯 ScoreLogic: Sala establecida a", code);
    }

    getRoomCode() {
        // Prioridad 1: La sala que nos pasó Main.js
        if (this.currentRoomCode) return this.currentRoomCode;
        
        // Prioridad 2: Variable global (Legacy)
        if (window.PREDEFINED_ROOM) return window.PREDEFINED_ROOM;
        
        // Fallback: URL
        const params = new URLSearchParams(window.location.search);
        return (params.get('sala') || 'GENERAL').toUpperCase();
    }
    init() {
        console.log("📚 ScoreLogic: Iniciando...");
        
        // 1. CAPA DE ANOTACIONES
        if (this.el('annotation-layer')) {
            this.annotations = new AnnotationLayer('annotation-layer');

            // --- EMITIR (Profesor) ---
            
            this.annotations.onPathCreated((pathData) => {
                const room = this.getRoomCode();
                if (!room || room === 'GENERAL') console.warn("⚠️ Dibujando sin sala definida");
                
                this.socket.emit('wb-draw', { 
                    room: room, 
                    path: pathData,
                    page: this.pageNum 
                });
            });

            this.annotations.onClear(() => {
                this.socket.emit('wb-clear', { 
                    room: this.getRoomCode(),
                    page: this.pageNum
                });
            });

            // EMITIR LÁSER
            this.annotations.onPointerMove((coords) => {
                const room = this.getRoomCode();
                // console.log("🔴 Emitiendo láser:", coords); // Descomenta si quieres ver salida
                this.socket.emit('wb-pointer', { 
                    room, 
                    x: coords.x, 
                    y: coords.y,
                    page: this.pageNum
                });
            });
        }

        // --- RECIBIR (Alumno) ---

        this.socket.on('wb-draw', (data) => {
            if (this.annotations && parseInt(data.page) === parseInt(this.pageNum)) {
                this.annotations.drawRemotePath(data.path);
            }
        });

        this.socket.on('wb-clear', (data) => {
            if (this.annotations && parseInt(data.page) === parseInt(this.pageNum)) {
                this.annotations.clear(false); 
            }
        });

        // 👇👇 AQUÍ ESTÁ EL LOG Y EL LISTENER QUE FALTABA 👇👇
        this.socket.on('wb-pointer', (data) => {
            
            // LOG DE DEPURACIÓN (Mira la consola del alumno)
            console.log("🔴 LÁSER RECIBIDO:", data);

            if (this.annotations && parseInt(data.page) === parseInt(this.pageNum)) {
                this.annotations.updateRemoteLaser(data.x, data.y);
            }
        });
        // 👆👆👆

        // 2. UI: LISTENERS
        this.bindUI();
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
        if(tabMusic) tabMusic.onclick = () => this.switchTab('music');
        if(tabPdf) tabPdf.onclick = () => this.switchTab('pdf');

        // Estante
        const btnOpen = this.el('btnOpenShelf');
        const btnClose = this.el('btnCloseShelf');
        if(btnOpen) btnOpen.onclick = () => { this.el('shelf-modal').style.display = 'block'; this.loadShelf(); };
        if(btnClose) btnClose.onclick = () => this.el('shelf-modal').style.display = 'none';

        // Paginación
        const btnPrev = this.el('prev-page');
        const btnNext = this.el('next-page');
        if(btnPrev) btnPrev.onclick = () => this.changePage(-1);
        if(btnNext) btnNext.onclick = () => this.changePage(1);
        
        // Subida
        const btnUpload = this.el('btnUploadScore');
        if(btnUpload) btnUpload.onclick = () => this.uploadScore();

        // --- BARRA DE HERRAMIENTAS CORREGIDA ---
        const toolbar = this.el('drawing-toolbar');
        const btnMove = this.el('tool-move');
        const btnPencil = this.el('tool-pencil');
        const btnLaser = this.el('tool-laser'); // Ahora sí lo usaremos
        const btnClear = this.el('tool-clear');
        const colorPicker = this.el('tool-color');

        if (this.annotations && toolbar) {
            toolbar.style.display = 'flex'; 

            // Función helper para iluminar el botón activo
            const setActive = (btn) => {
                [btnMove, btnPencil, btnLaser].forEach(b => {
                    if(b) b.classList.remove('active');
                });
                if(btn) btn.classList.add('active');
            };

            // MODO MOVER (MANO)
            btnMove.onclick = () => {
                this.annotations.setMode('move');
                setActive(btnMove);
            };

            // MODO LÁPIZ
            btnPencil.onclick = () => {
                this.annotations.setMode('draw');
                setActive(btnPencil);
            };

            // MODO LÁSER (ESTO FALTABA)
            if(btnLaser) {
                btnLaser.onclick = () => {
                    console.log("🔴 Activando Láser");
                    this.annotations.setMode('laser');
                    setActive(btnLaser);
                };
            }

            // COLOR
            colorPicker.oninput = (e) => {
                this.annotations.setBrushColor(e.target.value);
                // Si seleccionas color, asumimos que quieres dibujar
                if (!this.annotations.canvas.isDrawingMode) {
                    this.annotations.setMode('draw');
                    setActive(btnPencil);
                }
            };

            // BORRAR
            btnClear.onclick = () => {
                if(confirm("¿Borrar hoja?")) {
                    this.annotations.clear();
                    delete this.pageData[this.pageNum];
                }
            };
            
            // Iniciar por defecto en mover
            btnMove.click(); 
        }
    }

    // --- MÉTODOS CORE ---

    changeZoom(delta) {
        if(!this.pdfDoc) return;
        let newZoom = this.zoomLevel + delta;
        newZoom = Math.max(0.5, Math.min(newZoom, 3.0));
        this.zoomLevel = newZoom;
        this.renderPage(this.pageNum);
    }

    switchTab(tab) {
        const modeMusic = this.el('modeMusic');
        const modePdf = this.el('modePdf');
        const tabMusic = this.el('tabMusicBtn');
        const tabPdf = this.el('tabPdfBtn');
        if (!modeMusic || !modePdf) return;

        if(tab === 'music') {
            modeMusic.style.display = 'flex';
            modePdf.classList.add('hidden');
            modePdf.style.display = 'none';
            if(tabMusic) tabMusic.classList.add('active');
            if(tabPdf) tabPdf.classList.remove('active');
        } else {
            modeMusic.style.display = 'none';
            modePdf.classList.remove('hidden');
            modePdf.style.display = 'flex';
            if(tabMusic) tabMusic.classList.remove('active');
            if(tabPdf) tabPdf.classList.add('active');
            this.loadShelf();
            if(this.pdfDoc) setTimeout(() => this.renderPage(this.pageNum), 100);
        }
    }

    changePage(offset) {
        if(!this.pdfDoc) return;
        const newPage = this.pageNum + offset;
        
        if(newPage >= 1 && newPage <= this.pdfDoc.numPages) {
            // Guardar dibujo
            if (this.annotations) {
                try {
                    const currentJson = this.annotations.getJSON();
                    if (currentJson) this.pageData[this.pageNum] = currentJson;
                    else delete this.pageData[this.pageNum];
                    this.annotations.clear(false);
                } catch(e) {}
            }

            this.pageNum = newPage;
            this.renderPage(this.pageNum);
            
            // AVISAR AL SERVER (Esto activa la sincronización de PDF)
            this.socket.emit('update-pdf-state', { 
                url: this.currentUrl, 
                page: this.pageNum,
                roomCode: this.getRoomCode() 
            });
        }
    }

    openPdf(url, title, initialPage = 1) {
        if (!url) return;
        this.currentUrl = url;
        this.pageData = {}; 
        
        const titleEl = this.el('current-score-title');
        if(titleEl) titleEl.innerText = title || "Documento";
        
        const loader = this.el('pdf-loading-msg');
        const controls = this.el('pdfFloatingControls');
        if(loader) loader.style.display = 'block';
        if(controls) controls.style.display = 'flex';

        this.zoomLevel = 1.0;

        pdfjsLib.getDocument(url).promise.then(pdf => {
            this.pdfDoc = pdf;
            if(this.el('page-count')) this.el('page-count').textContent = this.pdfDoc.numPages;
            if(loader) loader.style.display = 'none';
            
            this.pageNum = parseInt(initialPage) || 1;
            this.renderPage(this.pageNum);
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
                
                if (this.annotations) {
                    this.annotations.updateDimensions(viewport.width, viewport.height, finalScale);
                    const savedData = this.pageData[num];
                    this.annotations.loadJSON(savedData || null);
                }
            });
        });
        if(this.el('page-num')) this.el('page-num').textContent = num;
    }

    // --- SINCRONIZACIÓN PDF (Llamado desde Main.js) ---
    handleRemoteUpdate(data) {
        const state = data.pdfState;
        if(!state) return;

        // 1. Cargar PDF si es diferente
        if (state.url && state.url !== this.currentUrl) {
            this.openPdf(state.url, "VISTA SINCRONIZADA", state.page);
        } 
        // 2. Cambiar página si es diferente
        else if (state.page && parseInt(state.page) !== parseInt(this.pageNum)) {
            // Guardar dibujo actual antes de que me cambien la hoja
            if(this.annotations) this.pageData[this.pageNum] = this.annotations.getJSON();
            
            this.pageNum = parseInt(state.page);
            if(this.pdfDoc) this.renderPage(this.pageNum);
        }
    }

    // Método de ayuda para spy (silencioso)
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

    // --- SUBIDA / GESTIÓN ---
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
                    if(e.target.classList.contains('btn-delete')) { this.deleteScore(e.target.dataset.id, e); return; }
                    this.openPdf(score.url, score.title);
                    this.el('shelf-modal').style.display = 'none';
                    this.socket.emit('update-pdf-state', { url: score.url, page: 1, roomCode: room });
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