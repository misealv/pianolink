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

        if (tab === 'music') {
            if(modeMusic) { modeMusic.classList.remove('hidden'); modeMusic.style.display = 'flex'; }
            if(btnMusic) btnMusic.classList.add('active');
            if(toolbar) toolbar.style.display = 'none';
        } else if (tab === 'pdf') {
            if (this.pageNum === 'whiteboard') this.pageNum = this.lastPdfPage || 1;
            if(modePdf) { modePdf.classList.remove('hidden'); modePdf.style.display = 'flex'; }
            if(btnPdf) btnPdf.classList.add('active');
            if(toolbar) toolbar.style.display = 'flex';
            
            this.setupEngine('annotation-layer', 'pdf');
            if(this.pdfDoc) setTimeout(() => this.renderPage(this.pageNum), 100);
            else this.loadShelf();
        } else if (tab === 'whiteboard') {
            if (typeof this.pageNum === 'number') this.lastPdfPage = this.pageNum;
            this.pageNum = 'whiteboard'; 
            if(modeBoard) { modeBoard.classList.remove('hidden'); modeBoard.style.display = 'flex'; }
            if(btnBoard) btnBoard.classList.add('active');
            if(toolbar) toolbar.style.display = 'flex';
            
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
        this.socket.on('wb-sync-response', (data) => {
            if (data.canvasState) {
                this.pageData[data.page] = data.canvasState;
                if (this.activeEngine && data.page == this.pageNum) {
                    this.activeEngine.loadJSON(data.canvasState);
                    this.saveLocalState();
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
        
        if (this.el('btn-export-pdf')) this.el('btn-export-pdf').onclick = () => this.exportAsTask();
        this.el('tool-color').oninput = (e) => { if(this.activeEngine) this.activeEngine.setBrushColor(e.target.value); };
        this.el('tool-clear').onclick = () => {
            if(!this.activeEngine) return;
            if(this.activeEngine.canvas.getActiveObject()) this.activeEngine.deleteSelected();
            else if(confirm("¿Borrar todo?")) { this.activeEngine.clear(); delete this.pageData[this.pageNum]; }
        };

        if (btnNotation) {
            btnNotation.onclick = (e) => { e.stopPropagation(); groupNotation.classList.toggle('open'); };
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
                    this.activeEngine.updateDimensions(viewport.width, viewport.height, finalScale);
                    const savedData = this.pageData[num];
                    if (savedData) this.activeEngine.loadJSON(savedData);
                }
            }).catch(() => {});
        });
    }

    openPdf(url, title, initialPage = 1, scoreId = null) {
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
            this.saveLocalState();
            this.pageNum = newPage;
            this.renderPage(newPage);
            this.socket.emit('update-pdf-state', { url: this.currentUrl, page: this.pageNum, roomCode: this.getRoomCode(), scoreId: this.currentScoreId });
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
        if (!this.whiteboardEngine || this.currentTab !== 'whiteboard') return alert("Abre la pizarra.");
        const taskName = prompt("Nombre de la tarea:", `Tarea-${new Date().toLocaleTimeString()}`);
        if (!taskName) return;
        try {
            const dataUrl = this.whiteboardEngine.canvas.toDataURL({ format: 'png', multiplier: 2 });
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'l', unit: 'px', format: [this.whiteboardEngine.canvas.width, this.whiteboardEngine.canvas.height] });
            doc.addImage(dataUrl, 'PNG', 0, 0, this.whiteboardEngine.canvas.width, this.whiteboardEngine.canvas.height);
            const formData = new FormData();
            formData.append('file', doc.output('blob'), `${taskName}.pdf`);
            formData.append('title', taskName);
            formData.append('roomCode', this.getRoomCode());
            formData.append('category', 'tareas');
            formData.append('folder', 'Tareas'); 
            const res = await fetch('/api/scores/upload', { method: 'POST', body: formData });
            if (res.ok) { alert("✅ Tarea guardada!"); this.loadShelf(); }
        } catch (error) { console.error(error); }
    }

    async createNewFolder(name) { this.localFolders.add(name); this.loadShelf(); }
    async moveScoreToFolder(scoreId, folderName) {
        await fetch(`/api/scores/${scoreId}/move`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderName }) });
        this.loadShelf();
    }
    async deleteFolder(folderName) { 
        if(confirm("¿Borrar?")) { await fetch(`/api/scores/folder/${folderName}?room=${this.getRoomCode()}`, { method: 'DELETE' }); this.localFolders.delete(folderName); this.loadShelf(); }
    }
    async deleteScore(id) { if(confirm("¿Borrar?")) { await fetch(`/api/scores/${id}`, { method: 'DELETE' }); this.loadShelf(); } }
    async renameFolder(oldName) {
        const newName = prompt("Nuevo nombre:", oldName);
        if(newName) { await fetch('/api/scores/folder/rename', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldName, newName, room: this.getRoomCode() }) }); this.localFolders.delete(oldName); this.localFolders.add(newName); this.loadShelf(); }
    }
    async renameScore(id, oldTitle) {
        const newTitle = prompt("Nuevo nombre:", oldTitle);
        if(newTitle) { await fetch(`/api/scores/${id}/rename`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newTitle }) }); this.loadShelf(); }
    }
    async promptMoveScore(scoreId) {
        const folder = prompt("¿Carpeta?");
        if(folder !== null) this.moveScoreToFolder(scoreId, folder || null);
    }
}