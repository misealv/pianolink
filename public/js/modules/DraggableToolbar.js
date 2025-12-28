/**
 * /public/js/modules/DraggableToolbar.js
 * Sistema draggable para la barra de herramientas de dibujo.
 * Similar a DraggableVideo.js pero optimizado para toolbar vertical.
 */
export class DraggableToolbar {
    constructor(toolbarId) {
        this.toolbar = document.getElementById(toolbarId);
        if (!this.toolbar) {
            console.warn(`[DraggableToolbar] ⚠️ No se encontró toolbar con ID: ${toolbarId}`);
            return;
        }

        console.log('[DraggableToolbar] ✅ Toolbar encontrado, inicializando...');
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.initialLeft = 0;
        this.initialTop = 0;
        
        this.snapThreshold = 20; // Pixeles desde el borde para activar snap
        this.snapEnabled = true; // Activado por defecto
        
        this.init();
    }

    init() {
        // Configurar toolbar
        this.toolbar.style.userSelect = 'none';
        
        // Restaurar posición guardada
        this.loadPosition();

        // Event listeners
        this.toolbar.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', () => this.onMouseUp());
        
        // Touch events para móvil
        this.toolbar.addEventListener('touchstart', (e) => this.onTouchStart(e));
        document.addEventListener('touchmove', (e) => this.onTouchMove(e));
        document.addEventListener('touchend', () => this.onTouchEnd());
    }

    onMouseDown(e) {
        // SIMPLIFICADO: Solo permitir drag desde el header (evita conflictos con submenú)
        const isDragHandle = e.target.classList.contains('toolbar-header') || 
                             e.target.classList.contains('toolbar-title') ||
                             e.target.classList.contains('toolbar-drag-hint');
        
        if (!isDragHandle) {
            return;
        }
        
        this.isDragging = true;
        this.startX = e.clientX;
        this.startY = e.clientY;
        
        const rect = this.toolbar.getBoundingClientRect();
        this.initialLeft = rect.left;
        this.initialTop = rect.top;
        
        // NO cambiar cursor - CSS lo maneja con hover
        e.preventDefault();
    }

    onMouseMove(e) {
        if (!this.isDragging) return;

        const deltaX = e.clientX - this.startX;
        const deltaY = e.clientY - this.startY;
        
        let newLeft = this.initialLeft + deltaX;
        let newTop = this.initialTop + deltaY;
        
        // Límites del viewport (con margen de seguridad)
        const rect = this.toolbar.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width - 10;
        const maxY = window.innerHeight - rect.height - 10;
        
        newLeft = Math.max(10, Math.min(newLeft, maxX));
        newTop = Math.max(10, Math.min(newTop, maxY));
        
        this.toolbar.style.left = newLeft + 'px';
        this.toolbar.style.top = newTop + 'px';
        this.toolbar.style.right = 'auto';
        this.toolbar.style.bottom = 'auto';
    }

    onMouseUp() {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        // NO cambiar cursor aquí - dejar que CSS maneje el estado normal
        
        // Aplicar snap si está habilitado
        if (this.snapEnabled) {
            this.applySnap();
        }
        
        // Guardar posición
        this.savePosition();
    }

    onTouchStart(e) {
        // SIMPLIFICADO: Solo permitir drag desde el header
        const isDragHandle = e.target.classList.contains('toolbar-header') || 
                             e.target.classList.contains('toolbar-title') ||
                             e.target.classList.contains('toolbar-drag-hint');
        
        if (!isDragHandle) {
            return;
        }
        
        this.isDragging = true;
        const touch = e.touches[0];
        this.startX = touch.clientX;
        this.startY = touch.clientY;
        
        const rect = this.toolbar.getBoundingClientRect();
        this.initialLeft = rect.left;
        this.initialTop = rect.top;
        
        e.preventDefault();
    }

    onTouchMove(e) {
        if (!this.isDragging) return;
        
        const touch = e.touches[0];
        const deltaX = touch.clientX - this.startX;
        const deltaY = touch.clientY - this.startY;
        
        let newLeft = this.initialLeft + deltaX;
        let newTop = this.initialTop + deltaY;
        
        const rect = this.toolbar.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width;
        const maxY = window.innerHeight - rect.height;
        
        newLeft = Math.max(0, Math.min(newLeft, maxX));
        newTop = Math.max(0, Math.min(newTop, maxY));
        
        this.toolbar.style.left = newLeft + 'px';
        this.toolbar.style.top = newTop + 'px';
        this.toolbar.style.right = 'auto';
        this.toolbar.style.bottom = 'auto';
    }

    onTouchEnd() {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        
        if (this.snapEnabled) {
            this.applySnap();
        }
        
        this.savePosition();
    }

    applySnap() {
        const rect = this.toolbar.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        let snapped = false;
        
        // Snap a izquierda
        if (rect.left < this.snapThreshold) {
            this.toolbar.style.left = '10px';
            this.toolbar.style.right = 'auto';
            snapped = true;
        }
        
        // Snap a derecha
        else if ((viewportWidth - rect.right) < this.snapThreshold) {
            this.toolbar.style.right = '10px';
            this.toolbar.style.left = 'auto';
            snapped = true;
        }
        
        // Snap a arriba
        if (rect.top < this.snapThreshold) {
            this.toolbar.style.top = '10px';
            this.toolbar.style.bottom = 'auto';
            snapped = true;
        }
        
        // Snap a abajo
        else if ((viewportHeight - rect.bottom) < this.snapThreshold) {
            this.toolbar.style.bottom = '10px';
            this.toolbar.style.top = 'auto';
            snapped = true;
        }
        
        if (snapped) {
            console.log('[DraggableToolbar] ⚡ Snap aplicado');
        }
    }

    savePosition() {
        const position = {
            left: this.toolbar.style.left,
            top: this.toolbar.style.top,
            right: this.toolbar.style.right,
            bottom: this.toolbar.style.bottom
        };
        localStorage.setItem('toolbar-position', JSON.stringify(position));
    }

    loadPosition() {
        const saved = localStorage.getItem('toolbar-position');
        if (saved) {
            try {
                const position = JSON.parse(saved);
                if (position.left && position.left !== 'auto') this.toolbar.style.left = position.left;
                if (position.top && position.top !== 'auto') this.toolbar.style.top = position.top;
                if (position.right && position.right !== 'auto') this.toolbar.style.right = position.right;
                if (position.bottom && position.bottom !== 'auto') this.toolbar.style.bottom = position.bottom;
                console.log('[DraggableToolbar] ✅ Posición restaurada:', position);
                
                // NUEVO: Verificar que esté visible en viewport
                setTimeout(() => this.ensureVisible(), 100);
            } catch (e) {
                console.warn('[DraggableToolbar] Error restaurando posición:', e);
                this.resetPosition();
            }
        } else {
            console.log('[DraggableToolbar] Sin posición guardada, usando posición por defecto');
        }
    }
    
    ensureVisible() {
        const rect = this.toolbar.getBoundingClientRect();
        const isOutside = rect.right < 0 || rect.left > window.innerWidth || 
                         rect.bottom < 0 || rect.top > window.innerHeight;
        
        if (isOutside) {
            console.warn('[DraggableToolbar] ⚠️ Toolbar fuera del viewport, reseteando...');
            this.resetPosition();
        }
    }

    resetPosition() {
        this.toolbar.style.left = 'auto';
        this.toolbar.style.top = '10px';
        this.toolbar.style.right = '20px';
        this.toolbar.style.bottom = 'auto';
        localStorage.removeItem('toolbar-position');
        console.log('[DraggableToolbar] ♻️ Posición reseteada');
    }

    setSnapEnabled(enabled) {
        this.snapEnabled = enabled;
        console.log(`[DraggableToolbar] Snap ${enabled ? 'activado' : 'desactivado'}`);
    }
}
