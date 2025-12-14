/* public/js/modules/ScoreLogic.js */

export class ScoreLogic {
    constructor(socket) {
        this.socket = socket;
        this.pdfDoc = null;
        this.pageNum = 1;
        this.pageRendering = false;
        this.pageNumPending = null;
        this.currentUrl = null;
        
        // Inicializamos
        this.init();
    }

    // Helper seguro para obtener elementos
    el(id) { return document.getElementById(id); }

    init() {
        console.log("📚 ScoreLogic: Iniciando...");
        
        // 1. Pestañas
        const tabMusic = this.el('tabMusicBtn');
        const tabPdf = this.el('tabPdfBtn');

        if(tabMusic) tabMusic.onclick = () => this.switchTab('music');
        if(tabPdf) tabPdf.onclick = () => this.switchTab('pdf');

        // 2. Botón Abrir Estante (Validamos que exista)
        const btnOpen = this.el('btnOpenShelf');
        if(btnOpen) {
            btnOpen.onclick = () => {
                const modal = this.el('shelf-modal');
                if(modal) {
                    modal.style.display = 'block';
                    this.loadShelf();
                } else {
                    console.error("❌ Error: No se encuentra el modal 'shelf-modal'");
                }
            };
        }

        // 3. Botón Cerrar Estante
        const btnClose = this.el('btnCloseShelf');
        if(btnClose) btnClose.onclick = () => {
            const modal = this.el('shelf-modal');
            if(modal) modal.style.display = 'none';
        };

        // Cerrar al hacer click fuera
        window.onclick = (e) => {
            const modal = this.el('shelf-modal');
            if (modal && e.target == modal) {
                modal.style.display = 'none';
            }
        };

        // 4. Botón Subir
        const btnUpload = this.el('btnUploadScore');
        if(btnUpload) btnUpload.onclick = () => this.uploadScore();

        // 5. Controles de Página
        const btnPrev = this.el('prev-page');
        const btnNext = this.el('next-page');
        if(btnPrev) btnPrev.onclick = () => this.changePage(-1);
        if(btnNext) btnNext.onclick = () => this.changePage(1);

        // 6. Sockets
        if(this.socket) {
            this.socket.on('user-pdf-updated', (data) => this.handleRemoteUpdate(data));
        }
    }

    switchTab(tab) {
        const modeMusic = this.el('modeMusic');
        const modePdf = this.el('modePdf');
        const tabMusic = this.el('tabMusicBtn');
        const tabPdf = this.el('tabPdfBtn');

        if (!modeMusic || !modePdf) return;

        if(tab === 'music') {
            modeMusic.style.display = 'flex';
            modePdf.style.display = 'none';
            modePdf.classList.add('hidden'); // Ocultar bien
            
            if(tabMusic) tabMusic.classList.add('active');
            if(tabPdf) tabPdf.classList.remove('active');
        } else {
            modeMusic.style.display = 'none';
            
            // CORRECCIÓN CLAVE: Quitar la clase 'hidden' y forzar flex
            modePdf.classList.remove('hidden');
            modePdf.style.display = 'flex';
            
            if(tabMusic) tabMusic.classList.remove('active');
            if(tabPdf) tabPdf.classList.add('active');
            
            // Cargar estante en segundo plano al abrir pestaña
            this.loadShelf(); 
        }
    }

// --- VALIDACIÓN DE TAMAÑO AL SUBIR ---
async uploadScore() {
    const fileInput = this.el('file-upload');
    const titleInput = this.el('upload-title');
    const status = this.el('upload-status');
    
    const user = JSON.parse(localStorage.getItem('pianoUser') || '{}');
    const currentRoom = window.PREDEFINED_ROOM || 'GENERAL'; 
    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB en bytes

    if(fileInput.files.length === 0) return alert("Selecciona un PDF");

    const file = fileInput.files[0];

    // 1. VALIDACIÓN DE TAMAÑO (NUEVO)
    if (file.size > MAX_SIZE) {
        alert("⚠️ El archivo es muy pesado (Más de 10MB).\nPor favor usa el enlace para comprimirlo.");
        status.innerText = "❌ Error: Archivo > 10MB";
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', titleInput.value);
    formData.append('roomCode', currentRoom);
    formData.append('uploaderName', user.name || "Anonimo");

    status.innerText = "Subiendo... ⏳";
    
    try {
        const res = await fetch('/api/scores/upload', { method: 'POST', body: formData });
        if(res.ok) {
            status.innerText = "¡Listo! ✅";
            fileInput.value = ""; titleInput.value = "";
            this.loadShelf();
        } else {
            status.innerText = "Error subida";
        }
    } catch(e) { console.error(e); status.innerText = "Error de conexión"; }
}

// --- LISTAR Y OCULTAR BOTÓN BORRAR ---
async loadShelf() {
    const list = this.el('shelf-list');
    if(!list) return;

    const currentRoom = window.PREDEFINED_ROOM || 'GENERAL';
    const displayCode = this.el('display-room-code');
    if(displayCode) displayCode.innerText = currentRoom.toUpperCase();

    // Verificar si soy profesor
    const user = JSON.parse(localStorage.getItem('pianoUser') || '{}');
    // Aceptamos rol 'teacher' o 'admin'
    const isTeacher = (user.role === 'teacher' || user.role === 'admin');

    try {
        const res = await fetch(`/api/scores/${currentRoom}`);
        const scores = await res.json();
        
        list.innerHTML = '';
        
        if(!Array.isArray(scores) || scores.length === 0) {
            list.innerHTML = '<p style="color:#666; grid-column:1/-1; text-align:center;">La biblioteca está vacía.</p>';
            return;
        }

        scores.forEach(score => {
            const div = document.createElement('div');
            div.className = 'score-card';

            // Solo generamos el botón si es profesor
            const deleteBtn = isTeacher 
                ? `<button class="btn-delete" data-id="${score._id}" style="background:none; border:none; color:#ff4d4d; font-size:10px; cursor:pointer;">[Borrar]</button>`
                : '';

            div.innerHTML = `
                <div class="score-icon">📄</div>
                <span class="score-title">${score.title}</span>
                <span class="score-meta" style="font-size:9px; color:#777;">${score.uploaderName || 'Anon'}</span>
                ${deleteBtn}
            `;
            
            div.onclick = (e) => {
                if(e.target.classList.contains('btn-delete')) {
                    this.deleteScore(e.target.dataset.id, e);
                    return;
                }
                this.openPdf(score.url, score.title);
                const modal = this.el('shelf-modal');
                if(modal) modal.style.display = 'none';
                
                this.socket.emit('update-pdf-state', { url: score.url, page: 1 });
            };
            list.appendChild(div);
        });
    } catch(e) { console.error(e); }
}

    async deleteScore(id, e) {
        e.stopPropagation();
        if(!confirm("¿Borrar partitura?")) return;
        try {
            await fetch(`/api/scores/${id}`, { method: 'DELETE' });
            this.loadShelf();
        } catch(e) { console.error(e); }
    }

    // --- PDF.JS (Visor) ---

    openPdf(url, title) {
        this.currentUrl = url;
        const titleEl = this.el('current-score-title');
        if(titleEl) titleEl.innerText = title || "Documento";
        
        const loader = this.el('pdf-loading-msg');
        const controls = this.el('pdfFloatingControls');

        if(loader) loader.style.display = 'block';
        if(controls) controls.style.display = 'flex';

        // Usamos librería global
        if(typeof pdfjsLib === 'undefined') {
            alert("Error: La librería PDF.js no se cargó correctamente.");
            return;
        }

        pdfjsLib.getDocument(url).promise.then(pdf => {
            this.pdfDoc = pdf;
            const countEl = this.el('page-count');
            if(countEl) countEl.textContent = this.pdfDoc.numPages;
            
            if(loader) loader.style.display = 'none';
            this.pageNum = 1;
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
            if(!container) return;

            // Ajuste de escala al ancho del contenedor
            const containerWidth = container.clientWidth * 0.95;
            const viewport = page.getViewport({scale: 1});
            const scale = containerWidth / viewport.width;
            const scaledViewport = page.getViewport({scale: scale});

            const canvas = this.el('pdf-render');
            const ctx = canvas.getContext('2d');

            canvas.height = scaledViewport.height;
            canvas.width = scaledViewport.width;

            const renderCtx = { canvasContext: ctx, viewport: scaledViewport };
            
            page.render(renderCtx).promise.then(() => {
                this.pageRendering = false;
                if (this.pageNumPending !== null) {
                    this.renderPage(this.pageNumPending);
                    this.pageNumPending = null;
                }
            });
        });
        const pageNumEl = this.el('page-num');
        if(pageNumEl) pageNumEl.textContent = num;
    }

    changePage(offset) {
        if(!this.pdfDoc) return;
        const newPage = this.pageNum + offset;
        if(newPage >= 1 && newPage <= this.pdfDoc.numPages) {
            this.pageNum = newPage;
            this.renderPage(this.pageNum); // Render local rápido
            this.socket.emit('update-pdf-state', { page: this.pageNum }); // Avisar red
        }
    }

    handleRemoteUpdate(data) {
        const state = data.pdfState;
        if(!state) return;

        if (state.url && state.url !== this.currentUrl) {
            this.openPdf(state.url, "Sincronizado");
        }
        if (state.page && state.page !== this.pageNum) {
            this.pageNum = state.page;
            if(this.pdfDoc) this.renderPage(this.pageNum);
        }
    }

// ... dentro de la clase ScoreLogic ...

    // MUESTRA UN PDF SIN AVISAR A LA RED (Modo Espía)
    silentLoad(url, page) {
        if(!url) return;
        console.log("🕵️ MODO ESPÍA: Viendo", url, "Pag", page);
        
        // Abrimos la pestaña PDF forzosamente
        this.switchTab('pdf'); 

        // Si ya es el mismo PDF, solo cambiamos página
        if (this.currentUrl === url) {
            this.pageNum = page || 1;
            if(this.pdfDoc) this.renderPage(this.pageNum);
        } else {
            // Si es otro PDF, lo cargamos completo
            this.openPdf(url, "VISTA ALUMNO");
            // Esperamos un poco a que cargue para poner la página
            setTimeout(() => {
                if(this.pdfDoc && page) {
                    this.pageNum = page;
                    this.renderPage(page);
                }
            }, 1000); // Pequeño delay para asegurar carga
        }
    }




}

