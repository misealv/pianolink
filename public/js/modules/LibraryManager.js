/**
 * /public/js/modules/LibraryManager.js
 * Gestiona la carga, visualización y sincronización de PDFs.
 */
export class LibraryManager {
    constructor(eventBus) {
        this.bus = eventBus;
        
        // Estado
        this.pdfDoc = null;
        this.pageNum = 1;
        this.currentUrl = null;
        this.isSpying = false; // Modo espejo
        this.spyTargetId = null;

        // Referencias DOM
        this.ui = {
            modal: document.getElementById('shelf-modal'),
            list: document.getElementById('shelf-list'),
            canvas: document.getElementById('pdf-render'),
            ctx: document.getElementById('pdf-render')?.getContext('2d'),
            container: document.getElementById('pdf-container'),
            loading: document.getElementById('pdf-loading-msg'),
            
            // Botones
            btnOpen: document.getElementById('btnOpenShelf'),
            btnClose: document.getElementById('btnCloseShelf'),
            btnUpload: document.getElementById('btnUploadScore'),
            btnPrev: document.getElementById('prev-page'),
            btnNext: document.getElementById('next-page'),
            
            // Displays
            pageCount: document.getElementById('page-count'),
            pageNum: document.getElementById('page-num'),
            title: document.getElementById('current-score-title')
        };

        this.init();
    }

    init() {
        // Listeners de UI local
        this.ui.btnOpen?.addEventListener('click', () => this.openShelf());
        this.ui.btnClose?.addEventListener('click', () => this.ui.modal.style.display = 'none');
        
        this.ui.btnPrev?.addEventListener('click', () => this.changePage(-1));
        this.ui.btnNext?.addEventListener('click', () => this.changePage(1));

        // Subida de Archivos
        this.ui.btnUpload?.addEventListener('click', () => this.handleUpload());

        // Eventos del BUS (Lo que viene de la red)
        this.bus.on('remote-pdf', (data) => this.handleRemoteUpdate(data));
        this.bus.on('room-info', (roomCode) => this.currentRoom = roomCode);
    }

    // --- LÓGICA DE PDF ---

    async loadPdf(url, title, page = 1) {
        if (!url) return;
        if (typeof pdfjsLib === 'undefined') return console.error("Falta PDF.js");

        this.currentUrl = url;
        this.pageNum = page;
        
        // UI Updates
        this.ui.modal.style.display = 'none';
        if(this.ui.loading) this.ui.loading.style.display = 'block';
        if(this.ui.title) this.ui.title.innerText = title || "Documento";

        // Cambiar a pestaña PDF (Disparar evento de UI)
        this.bus.emit("ui-tab-change", "pdf");

        try {
            this.pdfDoc = await pdfjsLib.getDocument(url).promise;
            if(this.ui.pageCount) this.ui.pageCount.textContent = this.pdfDoc.numPages;
            if(this.ui.loading) this.ui.loading.style.display = 'none';
            
            this.renderPage(this.pageNum);

            // Avisar a la red que cambié de PDF (si no estoy espiando)
            if (!this.isSpying) {
                this.bus.emit("pdf-sync-out", { url: this.currentUrl, page: this.pageNum });
            }

        } catch (e) {
            console.error("Error PDF:", e);
            if(this.ui.loading) this.ui.loading.innerText = "Error carga";
        }
    }

    renderPage(num) {
        if (!this.pdfDoc) return;
        
        this.pdfDoc.getPage(num).then(page => {
            const containerWidth = this.ui.container?.clientWidth || 800;
            const viewportRaw = page.getViewport({scale: 1});
            const scale = (containerWidth * 0.95) / viewportRaw.width;
            const viewport = page.getViewport({scale: scale});

            this.ui.canvas.height = viewport.height;
            this.ui.canvas.width = viewport.width;

            const renderCtx = {
                canvasContext: this.ui.ctx,
                viewport: viewport
            };
            page.render(renderCtx);
        });

        if(this.ui.pageNum) this.ui.pageNum.textContent = num;
    }

    changePage(offset) {
        if (!this.pdfDoc) return;
        const newPage = this.pageNum + offset;
        if (newPage >= 1 && newPage <= this.pdfDoc.numPages) {
            this.pageNum = newPage;
            this.renderPage(this.pageNum);
            
            // Sincronizar salida
            if (!this.isSpying) {
                this.bus.emit("pdf-sync-out", { page: this.pageNum });
            }
        }
    }

    // --- GESTIÓN DE BIBLIOTECA (API) ---

    async openShelf() {
        if (!this.currentRoom) return alert("Entra a una sala primero.");
        this.ui.modal.style.display = 'block';
        
        try {
            const res = await fetch(`/api/scores/${this.currentRoom}`);
            const scores = await res.json();
            this.ui.list.innerHTML = '';
            
            scores.forEach(s => {
                const div = document.createElement('div');
                div.className = 'score-card';
                div.innerHTML = `📄 <strong>${s.title}</strong>`;
                div.onclick = () => this.loadPdf(s.url, s.title);
                this.ui.list.appendChild(div);
            });
        } catch (e) {
            this.ui.list.innerHTML = "Error cargando lista.";
        }
    }

    async handleUpload() {
        const fileInput = document.getElementById('file-upload');
        const titleInput = document.getElementById('upload-title');
        
        if (!fileInput.files[0]) return;
        
        const fd = new FormData();
        fd.append('file', fileInput.files[0]);
        fd.append('roomCode', this.currentRoom);
        fd.append('title', titleInput.value || "Partitura");
        
        await fetch('/api/scores/upload', { method: 'POST', body: fd });
        this.openShelf(); // Recargar lista
    }

    // --- MODO ESPEJO (SPIING) ---

    startSpying(targetId) {
        this.isSpying = true;
        this.spyTargetId = targetId;
        console.log(`👁️ Espiando a ${targetId}`);
        this.bus.emit("ui-tab-change", "pdf");
    }

    handleRemoteUpdate(data) {
        // data = { userId, pdfState: { url, page } }
        
        // Solo actualizamos si estamos espiando a ESTE usuario
        if (this.isSpying && data.userId === this.spyTargetId) {
            const state = data.pdfState;
            
            if (state.url && state.url !== this.currentUrl) {
                this.loadPdf(state.url, "Modo Espejo", state.page);
            } else if (state.page && state.page !== this.pageNum) {
                this.pageNum = state.page;
                this.renderPage(this.pageNum);
            }
        }
    }
}