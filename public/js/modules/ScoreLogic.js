/* public/js/modules/ScoreLogic.js */
import { AnnotationLayer } from './AnnotationLayer.js';

export class ScoreLogic {
    constructor(socket) {
        this.socket = socket;
        this.pdfDoc = null;
        this.renderTask = null; 
        
        this.pageNum = 1;         
        this.lastPdfPage = 1;     
        this.pageRendering = false;
        this.currentUrl = null;
        this.currentTab = 'music'; 
        
        this.pdfEngine = null;
        this.whiteboardEngine = null;
        this.activeEngine = null; 
        
        this.currentScoreId = null; 
        this.zoomLevel = 1.0;
        this.baseScale = 1.0; 
        this.pageData = {}; 
        
        this.currentRoomCode = null;
        this.currentFolder = null;
        this.localFolders = new Set(['Tareas', 'Metodos']);

        this.handleRemoteUpdate = this.handleRemoteUpdate.bind(this);
        this.init();
    }

    // ⚡ HELPER: Obtener headers de autorización para APIs protegidas
    getAuthHeaders() {
        try {
            const user = JSON.parse(localStorage.getItem('pianoUser') || '{}');
            if (user.token) {
                return {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token}`
                };
            }
        } catch (e) {}
        return { 'Content-Type': 'application/json' };
    }

    // ⚡ HELPER: Verificar si el usuario es profesor
    isTeacher() {
        try {
            const user = JSON.parse(localStorage.getItem('pianoUser') || '{}');
            return user.role === 'teacher' || user.role === 'admin';
        } catch (e) {
            return false;
        }
    }
    
    switchTab(tab) {
        this.currentTab = tab;
        const modeMusic = this.el('modeMusic');
        const modePdf = this.el('modePdf');
        const modeBoard = this.el('modeWhiteboard');
        const btnMusic = this.el('tabMusicBtn');
        const btnPdf = this.el('tabPdfBtn');
        const btnBoard = this.el('tabBoardBtn');
        const toolbar = this.el('drawing-toolbar');

        [modeMusic, modePdf, modeBoard].forEach(el => { if(el) { el.classList.add('hidden'); el.style.display = 'none'; }});
        [btnMusic, btnPdf, btnBoard].forEach(el => { if(el) el.classList.remove('active'); });

        // ⚡ Helper: Controlar toolbar via CLASES (Single Source of Truth)
        const showToolbar = (visible) => {
            if (!toolbar) return;
            if (visible) {
                toolbar.classList.remove('toolbar-hidden');
                toolbar.classList.add('toolbar-visible');
            } else {
                toolbar.classList.remove('toolbar-visible');
                toolbar.classList.add('toolbar-hidden');
            }
        };

        if (tab === 'music') {
            if(modeMusic) { modeMusic.classList.remove('hidden'); modeMusic.style.display = 'flex'; }
            if(btnMusic) btnMusic.classList.add('active');
            showToolbar(false); // Ocultar en modo música
        } else if (tab === 'pdf') {
            if (this.pageNum === 'whiteboard') this.pageNum = this.lastPdfPage || 1;
            if(modePdf) { modePdf.classList.remove('hidden'); modePdf.style.display = 'flex'; }
            if(btnPdf) btnPdf.classList.add('active');
            showToolbar(true); // ⚡ FIX: Mostrar toolbar para anotar sobre PDF
            
            this.setupEngine('annotation-layer', 'pdf');
            if(this.pdfDoc) setTimeout(() => this.renderPage(this.pageNum), 100);
            else this.loadShelf();
        } else if (tab === 'whiteboard') {
            if (typeof this.pageNum === 'number') this.lastPdfPage = this.pageNum;
            this.pageNum = 'whiteboard'; 
            if(modeBoard) { modeBoard.classList.remove('hidden'); modeBoard.style.display = 'flex'; }
            if(btnBoard) btnBoard.classList.add('active');
            showToolbar(true); // Mostrar toolbar en pizarra
            
            this.setupEngine('wb-layer', 'whiteboard');
            setTimeout(() => {
                this.resizeWhiteboard();
                window.dispatchEvent(new CustomEvent('whiteboard-active')); 
                if (this.pageData['whiteboard']) this.activeEngine.loadJSON(this.pageData['whiteboard']);
                else this.socket.emit('wb-request-sync', { room: this.getRoomCode(), page: 'whiteboard' });
            }, 50);
        }
    }

    el(id) { return document.getElementById(id); }
    setRoomCode(code) { this.currentRoomCode = code; }
    getRoomCode() {
        if (this.currentRoomCode) return this.currentRoomCode;
        if (window.PREDEFINED_ROOM) return window.PREDEFINED_ROOM;
        const params = new URLSearchParams(window.location.search);
        return (params.get('sala') || 'GENERAL').toUpperCase();
    }

    saveLocalState() {
        if (this.activeEngine) {
            const currentJson = this.activeEngine.getJSON();
            if (currentJson) this.pageData[this.pageNum] = currentJson;
            else delete this.pageData[this.pageNum];
        }
    }

    init() {
        this.bindUI();
        this.socket.on('wb-draw', (data) => {
            if (this.activeEngine && data.page == this.pageNum) {
                this.activeEngine.drawRemotePath(data.path);
                this.saveLocalState();
            } else { this.pageData[data.page] = data.path; }
        });
        this.socket.on('wb-delete', (data) => {
            if (this.activeEngine && data.page == this.pageNum) {
                this.activeEngine.removeObjectById(data.id);
                this.saveLocalState();
            }
        });
        this.socket.on('wb-clear', (data) => {
            if (this.activeEngine && data.page == this.pageNum) {
                this.activeEngine.clear(false); 
                delete this.pageData[this.pageNum];
            }
        });
        
        // ⚡ LÁSER: Recibir posición del puntero remoto (profesor → alumno)
        this.socket.on('wb-pointer', (data) => {
            // Solo mostrar si estamos en la misma página
            if (data.page == this.pageNum) {
                this.showRemoteLaser(data.xPercent, data.yPercent, data.visible);
            }
        });
        
        this.socket.on('wb-sync-response', (data) => {
            if (data.canvasState) {
                this.pageData[data.page] = data.canvasState;
                if (this.activeEngine && data.page == this.pageNum) {
                    this.activeEngine.loadJSON(data.canvasState);
                    this.saveLocalState();
                }
            }
        });
        
        // ⚡ SYNC: Responder a solicitudes de sincronización de otros usuarios
        this.socket.on('wb-sync-request', (data) => {
            // Solo responder si tenemos datos para esa página
            const pageData = this.pageData[data.page];
            if (pageData || (this.activeEngine && data.page == this.pageNum)) {
                const canvasState = pageData || this.activeEngine.getJSON();
                if (canvasState) {
                    this.socket.emit('wb-sync-share', {
                        requester: data.requester,
                        page: data.page,
                        canvasState: canvasState
                    });
                    console.log(`[ScoreLogic] 📤 Compartiendo estado de página ${data.page} con ${data.requester}`);
                }
            }
        });
        
        window.addEventListener('resize', () => {
             if (this.currentTab === 'whiteboard') this.resizeWhiteboard();
             else if (this.currentTab === 'pdf') {
                 if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
                 this.resizeTimeout = setTimeout(() => { if (this.pdfDoc) this.renderPage(this.pageNum); }, 200);
             }
        });
    }

    resizeWhiteboard() {
        if (this.currentTab !== 'whiteboard' || !this.whiteboardEngine) return;
        const container = this.el('whiteboard-wrapper');
        if (container) this.whiteboardEngine.updateDimensions(container.clientWidth, container.clientHeight, 1);
    }

    setupEngine(canvasId, type) {
        if (type === 'pdf') {
            if (!this.pdfEngine) {
                this.pdfEngine = new AnnotationLayer(canvasId);
                this.bindAnnotationEvents(this.pdfEngine);
            }
            this.activeEngine = this.pdfEngine;
        } else {
            if (!this.whiteboardEngine) {
                this.whiteboardEngine = new AnnotationLayer(canvasId);
                this.bindAnnotationEvents(this.whiteboardEngine);
            }
            this.activeEngine = this.whiteboardEngine;
        }
    }

    bindAnnotationEvents(engine) {
        if (!engine) return;
        engine.onPathCreated((pathData) => {
            this.socket.emit('wb-draw', { room: this.getRoomCode(), path: pathData, page: this.pageNum, scoreId: this.currentScoreId });
            this.saveLocalState();
        });
        engine.onObjectRemoved((objectId) => {
            this.socket.emit('wb-delete', { room: this.getRoomCode(), id: objectId, page: this.pageNum, scoreId: this.currentScoreId });
            this.saveLocalState();
        });
        engine.onClear(() => {
            this.socket.emit('wb-clear', { room: this.getRoomCode(), page: this.pageNum, scoreId: this.currentScoreId });
            delete this.pageData[this.pageNum];
        });
        
        // ⚡ LÁSER: Emitir posición del puntero cuando profesor mueve mouse en modo láser
        engine.onLaserMove((pos) => {
            this.socket.volatile.emit('wb-pointer', { 
                room: this.getRoomCode(), 
                xPercent: pos.xPercent,  // Coordenadas normalizadas (0-1)
                yPercent: pos.yPercent,
                visible: pos.visible !== false, // true por defecto
                page: this.pageNum 
            });
            // También mostrar láser local (para feedback visual)
            if (pos.visible !== false) {
                this.showLaserNormalized(pos.xPercent, pos.yPercent);
            } else {
                this.hideLaser();
            }
        });
    }
    
    // ⚡ LÁSER: Mostrar punto rojo remoto (para alumnos que lo ven)
    showRemoteLaser(xPercent, yPercent, visible) {
        if (visible === false) {
            this.hideLaser();
        } else {
            this.showLaserNormalized(xPercent, yPercent);
        }
    }
    
    // ⚡ LÁSER: Ocultar el punto rojo
    hideLaser() {
        const laserPdf = this.el('remote-laser');
        const laserWb = this.el('wb-laser');
        if (laserPdf) laserPdf.classList.remove('active');
        if (laserWb) laserWb.classList.remove('active');
    }
    
    // ⚡ LÁSER: Mostrar el punto rojo con coordenadas normalizadas
    showLaserNormalized(xPercent, yPercent) {
        let laserDot, referenceEl;
        
        if (this.currentTab === 'whiteboard') {
            laserDot = this.el('wb-laser');
            // Para whiteboard, usar el canvas de Fabric
            referenceEl = this.el('wb-layer');
        } else {
            laserDot = this.el('remote-laser');
            // Para PDF, usar el canvas de anotaciones (mismo tamaño que PDF)
            referenceEl = this.el('annotation-layer');
        }
        
        if (!laserDot || !referenceEl) return;
        
        // Obtener dimensiones visuales reales del canvas
        const rect = referenceEl.getBoundingClientRect();
        
        // Desnormalizar: convertir porcentajes a píxeles
        const x = xPercent * rect.width;
        const y = yPercent * rect.height;
        
        laserDot.style.left = x + 'px';
        laserDot.style.top = y + 'px';
        laserDot.classList.add('active');
    }

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
            if (this.activeEngine && this.currentTab === 'pdf') {
                const currentPageData = this.pageData[this.pageNum];
                if (currentPageData) this.activeEngine.loadJSON(currentPageData);
            }
        } catch (e) { console.error("Error cargando notas:", e); }
    }

    bindUI() {
        const toolbar = this.el('drawing-toolbar');
        const btnNotation = this.el('tool-notation');
        const groupNotation = btnNotation?.parentElement;
        const setActive = (btn) => {
            toolbar.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            if(btn) btn.classList.add('active');
        };

        this.el('zoom-in').onclick = () => this.changeZoom(0.2);
        this.el('zoom-out').onclick = () => this.changeZoom(-0.2);
        this.el('tabMusicBtn').onclick = () => this.switchTab('music');
        this.el('tabPdfBtn').onclick = () => this.switchTab('pdf');
        this.el('tabBoardBtn').onclick = () => this.switchTab('whiteboard');
        this.el('prev-page').onclick = () => this.changePage(-1);
        this.el('next-page').onclick = () => this.changePage(1);
        this.el('btnOpenShelf').onclick = () => { this.el('shelf-modal').style.display = 'block'; this.loadShelf(); };
        this.el('btnCloseShelf').onclick = () => { this.el('shelf-modal').style.display = 'none'; };
        this.el('btnUploadScore').onclick = () => this.uploadScore();

        // HERRAMIENTAS
        this.el('tool-move').onclick = () => { if(this.activeEngine) { this.activeEngine.setMode('move'); setActive(this.el('tool-move')); } };
        this.el('tool-pencil').onclick = () => { if(this.activeEngine) { this.activeEngine.setMode('draw'); setActive(this.el('tool-pencil')); } };
        this.el('tool-eraser').onclick = () => { if(this.activeEngine) { this.activeEngine.setMode('eraser'); setActive(this.el('tool-eraser')); } };
        this.el('tool-text').onclick = () => { if(this.activeEngine) { this.activeEngine.setMode('text'); setActive(this.el('tool-text')); } };
        this.el('tool-laser').onclick = () => { if(this.activeEngine) { this.activeEngine.setMode('laser'); setActive(this.el('tool-laser')); } };
        this.el('tool-stave').onclick = () => { if(this.activeEngine) { this.activeEngine.setMode('stave'); setActive(this.el('tool-stave')); } };
        // NUEVO: Handler para línea de compás
        if (this.el('tool-barline')) this.el('tool-barline').onclick = () => { if(this.activeEngine) { this.activeEngine.setMode('barline'); setActive(this.el('tool-barline')); } };
        
        if (this.el('btn-export-pdf')) this.el('btn-export-pdf').onclick = () => this.exportAsTask();
        this.el('tool-color').oninput = (e) => { if(this.activeEngine) this.activeEngine.setBrushColor(e.target.value); };
        this.el('tool-clear').onclick = () => {
            if(!this.activeEngine) return;
            if(this.activeEngine.canvas.getActiveObject()) this.activeEngine.deleteSelected();
            else if(confirm("¿Borrar todo?")) { this.activeEngine.clear(); delete this.pageData[this.pageNum]; }
        };

        if (btnNotation) {
            btnNotation.onclick = (e) => { 
                e.stopPropagation(); 
                groupNotation.classList.toggle('open'); 
                
                // Posicionar submenú con position: fixed
                if (groupNotation.classList.contains('open')) {
                    const submenu = document.getElementById('notation-submenu');
                    const btnRect = btnNotation.getBoundingClientRect();
                    if (submenu) {
                        submenu.style.right = (window.innerWidth - btnRect.left + 8) + 'px';
                        submenu.style.top = (btnRect.top - 5) + 'px';
                    }
                }
            };
            const musicTools = ['tool-sol', 'tool-fa', 'tool-do', 'tool-redonda', 'tool-blanca', 'tool-negra', 'tool-circle', 'tool-timesig'];
            musicTools.forEach(toolId => {
                const btn = this.el(toolId);
                if (btn) btn.onclick = (e) => {
                    e.stopPropagation();
                    if (this.activeEngine) {
                        this.activeEngine.setMode(toolId.replace('tool-', ''));
                        setActive(btnNotation);
                        groupNotation.classList.remove('open');
                    }
                };
            });
        }
        document.addEventListener('click', () => groupNotation?.classList.remove('open'));
    }

    renderPage(num) {
        if (!this.pdfDoc) return;
        if (this.renderTask) this.renderTask.cancel();
        
        // ⚡ FIX: Actualizar contador de página en UI
        const pageNumEl = this.el('page-num');
        if (pageNumEl) pageNumEl.textContent = num;
        
        this.pdfDoc.getPage(num).then(page => {
            const canvas = this.el('pdf-render');
            const container = this.el('pdf-container');
            const viewportRaw = page.getViewport({scale: 1});
            const scale = (container.clientWidth * 0.95) / viewportRaw.width;
            const finalScale = scale * this.zoomLevel;
            const viewport = page.getViewport({scale: finalScale});
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            this.renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport });
            this.renderTask.promise.then(() => {
                this.renderTask = null;
                if (this.activeEngine && this.currentTab === 'pdf') {
                    // ⚡ FIX: Actualizar dimensiones del canvas de Fabric
                    this.activeEngine.updateDimensions(viewport.width, viewport.height, finalScale);
                    
                    // ⚡ FIX CRITICO: Limpiar canvas ANTES de cargar datos de nueva página
                    this.activeEngine.clear(false); // false = no emitir wb-clear a red
                    
                    // ⚡ FIX: Cargar dibujos guardados para esta página
                    const savedData = this.pageData[num];
                    if (savedData) {
                        console.log(`[ScoreLogic] ✏️ Cargando anotaciones para página ${num}`);
                        this.activeEngine.loadJSON(savedData);
                    } else {
                        console.log(`[ScoreLogic] 📄 Página ${num} limpia (sin anotaciones)`);
                    }
                }
            }).catch(() => {});
        });
    }

    openPdf(url, title, initialPage = 1, scoreId = null) {
        // ⚡ FIX: Si cambiamos de archivo, limpiar TODO
        if (this.currentUrl !== url) {
            console.log('[ScoreLogic] 📂 Nuevo archivo PDF - Limpiando canvas y cache');
            // Limpiar canvas de Fabric
            if (this.activeEngine) {
                this.activeEngine.clear(false);
            }
            // Limpiar cache de dibujos del archivo anterior
            this.pageData = {};
        }
        
        this.currentUrl = url; 
        this.currentScoreId = scoreId;
        this.pageNum = parseInt(initialPage) || 1;
        this.el('current-score-title').innerText = title || "Documento";
        if(scoreId) this.loadAnnotationsFromDB(scoreId);

        // Avisar al servidor para el ojo spy
        this.socket.emit('update-pdf-state', { url: this.currentUrl, page: this.pageNum, roomCode: this.getRoomCode(), scoreId: this.currentScoreId });

        pdfjsLib.getDocument(url).promise.then(pdf => {
            this.pdfDoc = pdf;
            this.el('page-count').textContent = pdf.numPages;
            // ⚡ FIX: Actualizar página inicial en UI
            const pageNumEl = this.el('page-num');
            if (pageNumEl) pageNumEl.textContent = this.pageNum;
            this.el('pdfFloatingControls').style.display = 'flex';
            this.renderPage(this.pageNum);
        });
    }

    silentLoad(url, page, scoreId) {
        if(!url) return;
        this.switchTab('pdf'); 
        this.currentScoreId = scoreId;
        if(scoreId) this.loadAnnotationsFromDB(scoreId);
        if (this.currentUrl !== url) this.openPdf(url, "Modo Espía", page, scoreId);
        else {
            this.pageNum = parseInt(page);
            setTimeout(() => { if(this.pdfDoc) this.renderPage(this.pageNum); }, 100);
        }
    }

    handleRemoteUpdate(data) {
        const state = data.pdfState;
        if (state.scoreId && state.scoreId !== this.currentScoreId) {
            this.currentScoreId = state.scoreId;
            this.loadAnnotationsFromDB(state.scoreId);
        }
        if (state.url && state.url !== this.currentUrl) this.openPdf(state.url, "Sincronizado", state.page, state.scoreId);
        else if (state.page && this.pageNum !== state.page) {
            this.pageNum = state.page;
            this.renderPage(state.page);
        }
    }

    changePage(offset) {
        if(!this.pdfDoc) return;
        const newPage = this.pageNum + offset;
        if(newPage >= 1 && newPage <= this.pdfDoc.numPages) {
            // ⚡ PASO 1: Guardar dibujos de la página actual ANTES de cambiar
            this.saveLocalState();
            
            // ⚡ PASO 2: Cambiar a nueva página (renderPage se encarga de limpiar y cargar)
            this.pageNum = newPage;
            this.renderPage(newPage);
            
            // ⚡ PASO 3: Sincronizar con otros usuarios
            this.socket.emit('update-pdf-state', { url: this.currentUrl, page: this.pageNum, roomCode: this.getRoomCode(), scoreId: this.currentScoreId });
            
            console.log(`[ScoreLogic] 📄 Cambiado a página ${newPage}`);
        }
    }

    changeZoom(delta) {
        this.zoomLevel = Math.max(0.5, Math.min(this.zoomLevel + delta, 3.0));
        this.renderPage(this.pageNum);
    }

    async loadShelf() {
        const list = this.el('shelf-list');
        try {
            const res = await fetch(`/api/scores/${this.getRoomCode()}`);
            const scores = await res.json();
            list.innerHTML = '';
            if (this.currentFolder) {
                const back = document.createElement('div');
                back.className = 'score-card folder-card';
                back.innerHTML = `⬅️ Volver`;
                back.onclick = () => { this.currentFolder = null; this.loadShelf(); };
                list.appendChild(back);
                this.renderShelfFiles(scores.filter(s => s.folder === this.currentFolder), list, true);
            } else {
                const dbFolders = [...new Set(scores.filter(s => s.folder).map(s => s.folder))];
                [...new Set([...dbFolders, ...this.localFolders])].forEach(f => {
                    const div = document.createElement('div');
                    div.className = 'score-card folder-card';
                    div.innerHTML = `📁 ${f}`;
                    div.onclick = () => { this.currentFolder = f; this.loadShelf(); };
                    list.appendChild(div);
                });
                this.renderShelfFiles(scores.filter(s => !s.folder), list, true);
            }
        } catch (e) {}
    }

    renderShelfFiles(files, container, isTeacher) {
        files.forEach(score => {
            const div = document.createElement('div');
            div.className = 'score-card';
            div.innerHTML = `<div class="score-icon">📄</div><span class="score-title">${score.title}</span>`;
            div.onclick = () => {
                this.el('shelf-modal').style.display = 'none';
                this.openPdf(score.url, score.title, 1, score._id);
                this.switchTab('pdf');
            };
            container.appendChild(div);
        });
    }

    async exportAsTask() {
        if (!this.whiteboardEngine || this.currentTab !== 'whiteboard') {
            return alert("❌ Debes estar en la pestaña PIZARRA para guardar una tarea.");
        }
        const taskName = prompt("Nombre de la tarea:", `Tarea-${new Date().toLocaleTimeString()}`);
        if (!taskName) return;
        
        try {
            console.log('[ExportTask] Generando imagen del canvas...');
            // OPTIMIZADO: Usar multiplier 1.5 en lugar de 2 para reducir tamaño de archivo
            const dataUrl = this.whiteboardEngine.canvas.toDataURL({ 
                format: 'jpeg', // JPEG en lugar de PNG para menor tamaño
                quality: 0.85,  // 85% calidad - buen balance
                multiplier: 1.5 // Reducido de 2 a 1.5
            });
            
            console.log('[ExportTask] Creando PDF...');
            const { jsPDF } = window.jspdf;
            
            // Calcular dimensiones optimizadas (máximo A4 landscape)
            const maxWidth = 1200;
            const maxHeight = 850;
            let width = this.whiteboardEngine.canvas.width;
            let height = this.whiteboardEngine.canvas.height;
            
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width = width * ratio;
                height = height * ratio;
                console.log(`[ExportTask] Redimensionando a ${width}x${height}`);
            }
            
            const doc = new jsPDF({ 
                orientation: 'l', 
                unit: 'px', 
                format: [width, height] 
            });
            doc.addImage(dataUrl, 'JPEG', 0, 0, width, height);
            
            console.log('[ExportTask] Preparando upload...');
            const blob = doc.output('blob');
            console.log(`[ExportTask] Tamaño del PDF: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
            
            if (blob.size > 45 * 1024 * 1024) {
                return alert("❌ El archivo es demasiado grande (>45MB). Intenta con menos contenido.");
            }
            
            const formData = new FormData();
            formData.append('file', blob, `${taskName}.pdf`);
            formData.append('title', taskName);
            formData.append('roomCode', this.getRoomCode());
            formData.append('category', 'tareas');
            formData.append('folder', 'Tareas'); 
            
            console.log('[ExportTask] Subiendo a servidor...');
            const res = await fetch('/api/scores/upload', { method: 'POST', body: formData });
            
            if (res.ok) { 
                const data = await res.json();
                console.log('[ExportTask] ✅ Tarea guardada:', data);
                alert("✅ Tarea guardada en carpeta 'Tareas'!"); 
                this.loadShelf(); 
            } else {
                const errorText = await res.text();
                console.error('[ExportTask] ❌ Error del servidor:', errorText);
                alert(`❌ Error al guardar: ${res.status} - Archivo muy grande o error del servidor`);
            }
        } catch (error) { 
            console.error('[ExportTask] ❌ Error:', error); 
            alert(`❌ Error al exportar tarea: ${error.message}`);
        }
    }

    // ⚡ CRUD DE ARCHIVOS Y CARPETAS (SOLO PROFESORES)
    async createNewFolder(name) { 
        this.localFolders.add(name); 
        this.loadShelf(); 
    }
    
    async moveScoreToFolder(scoreId, folderName) {
        if (!this.isTeacher()) {
            alert('⚠️ Solo el profesor puede mover archivos');
            return;
        }
        const res = await fetch(`/api/scores/${scoreId}/move`, { 
            method: 'PATCH', 
            headers: this.getAuthHeaders(), 
            body: JSON.stringify({ folderName }) 
        });
        if (!res.ok) {
            alert('❌ Error al mover archivo. Solo profesores autorizados.');
        }
        this.loadShelf();
    }
    
    async deleteFolder(folderName) { 
        if (!this.isTeacher()) {
            alert('⚠️ Solo el profesor puede borrar carpetas');
            return;
        }
        if (confirm("¿Borrar carpeta y todos sus archivos?")) { 
            const res = await fetch(`/api/scores/folder/${folderName}?room=${this.getRoomCode()}`, { 
                method: 'DELETE',
                headers: this.getAuthHeaders()
            }); 
            if (!res.ok) {
                alert('❌ Error al borrar. Solo profesores autorizados.');
                return;
            }
            this.localFolders.delete(folderName); 
            this.loadShelf(); 
        }
    }
    
    async deleteScore(id) { 
        if (!this.isTeacher()) {
            alert('⚠️ Solo el profesor puede borrar archivos');
            return;
        }
        if (confirm("¿Borrar este archivo?")) { 
            const res = await fetch(`/api/scores/${id}`, { 
                method: 'DELETE',
                headers: this.getAuthHeaders()
            }); 
            if (!res.ok) {
                alert('❌ Error al borrar. Solo profesores autorizados.');
            }
            this.loadShelf(); 
        } 
    }
    
    async renameFolder(oldName) {
        if (!this.isTeacher()) {
            alert('⚠️ Solo el profesor puede renombrar carpetas');
            return;
        }
        const newName = prompt("Nuevo nombre:", oldName);
        if (newName) { 
            const res = await fetch('/api/scores/folder/rename', { 
                method: 'PATCH', 
                headers: this.getAuthHeaders(), 
                body: JSON.stringify({ oldName, newName, room: this.getRoomCode() }) 
            }); 
            if (!res.ok) {
                alert('❌ Error al renombrar. Solo profesores autorizados.');
                return;
            }
            this.localFolders.delete(oldName); 
            this.localFolders.add(newName); 
            this.loadShelf(); 
        }
    }
    
    async renameScore(id, oldTitle) {
        if (!this.isTeacher()) {
            alert('⚠️ Solo el profesor puede renombrar archivos');
            return;
        }
        const newTitle = prompt("Nuevo nombre:", oldTitle);
        if (newTitle) { 
            const res = await fetch(`/api/scores/${id}/rename`, { 
                method: 'PATCH', 
                headers: this.getAuthHeaders(), 
                body: JSON.stringify({ newTitle }) 
            }); 
            if (!res.ok) {
                alert('❌ Error al renombrar. Solo profesores autorizados.');
            }
            this.loadShelf(); 
        }
    }
    
    async promptMoveScore(scoreId) {
        if (!this.isTeacher()) {
            alert('⚠️ Solo el profesor puede mover archivos');
            return;
        }
        const folder = prompt("¿Carpeta?");
        if (folder !== null) this.moveScoreToFolder(scoreId, folder || null);
    }

    // ⚡ FIX: Método faltante para subir PDFs desde el modal de biblioteca
    async uploadScore() {
        const fileInput = this.el('file-upload');
        const titleInput = this.el('upload-title');
        const statusEl = this.el('upload-status');
        const uploadBtn = this.el('btnUploadScore');
        
        if (!fileInput || !fileInput.files[0]) {
            alert('⚠️ Selecciona un archivo PDF primero');
            return;
        }
        
        const file = fileInput.files[0];
        
        // Validar tipo
        if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
            alert('⚠️ Solo se permiten archivos PDF');
            return;
        }
        
        // Validar tamaño (máx 50MB)
        if (file.size > 50 * 1024 * 1024) {
            alert('⚠️ El archivo es demasiado grande (máximo 50MB)');
            return;
        }
        
        // Feedback visual
        const originalText = uploadBtn?.textContent || '☁️ Subir';
        if (uploadBtn) {
            uploadBtn.textContent = '⏳ Subiendo...';
            uploadBtn.disabled = true;
        }
        if (statusEl) statusEl.textContent = 'Subiendo archivo...';
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', titleInput?.value || file.name.replace('.pdf', ''));
        formData.append('roomCode', this.getRoomCode());
        formData.append('folder', this.currentFolder || '');
        
        try {
            const res = await fetch('/api/scores/upload', { method: 'POST', body: formData });
            
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || `Error ${res.status}`);
            }
            
            const data = await res.json();
            console.log('✅ PDF subido:', data);
            
            // Limpiar inputs
            fileInput.value = '';
            if (titleInput) titleInput.value = '';
            if (statusEl) statusEl.textContent = '✅ Subido correctamente';
            
            // Recargar biblioteca
            this.loadShelf();
            
            // Limpiar mensaje después de 3s
            setTimeout(() => {
                if (statusEl) statusEl.textContent = '';
            }, 3000);
            
        } catch (err) {
            console.error('❌ Error subiendo PDF:', err);
            if (statusEl) statusEl.textContent = `❌ Error: ${err.message}`;
            alert(`❌ Error al subir el archivo:\n${err.message}`);
        } finally {
            if (uploadBtn) {
                uploadBtn.textContent = originalText;
                uploadBtn.disabled = false;
            }
        }
    }
}