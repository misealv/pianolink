/**
 * /public/js/modules/DraggableToolbar.js
 * Sistema draggable HÍBRIDO para la barra de herramientas de dibujo.
 * 
 * MIGRACIÓN A POINTER EVENTS - Compatible con tablets (iPad/Android)
 * 
 * Técnicas implementadas:
 * - Pointer Events API: unifica mouse, touch y stylus
 * - setPointerCapture: mantiene el arrastre aunque el dedo salga del elemento
 * - touch-action CSS: evita interferencia del scroll nativo
 * - requestAnimationFrame: fluidez en tablets de 60fps
 * 
 * @version 2.0.0 - Pointer Events Migration
 */
export class DraggableToolbar {
    constructor(toolbarId) {
        this.toolbar = document.getElementById(toolbarId);
        if (!this.toolbar) {
            console.warn(`[DraggableToolbar] ⚠️ No se encontró toolbar con ID: ${toolbarId}`);
            return;
        }

        console.log('[DraggableToolbar] ✅ Toolbar encontrado, inicializando con Pointer Events...');
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.initialLeft = 0;
        this.initialTop = 0;
        
        this.snapThreshold = 20;
        this.snapEnabled = true;
        
        // RAF para optimización
        this.rafId = null;
        this.pendingLeft = 0;
        this.pendingTop = 0;
        
        // Pointer tracking
        this.activePointerId = null;
        this.dragHandle = null;
        
        this.init();
    }

    init() {
        // Configurar toolbar
        this.toolbar.style.userSelect = 'none';
        this.toolbar.style.touchAction = 'none'; // CRÍTICO: evita scroll nativo
        
        // Encontrar el header como drag handle
        this.dragHandle = this.toolbar.querySelector('.toolbar-header');
        if (this.dragHandle) {
            this.dragHandle.style.touchAction = 'none';
        }
        
        // Restaurar posición guardada
        this.loadPosition();

        // === POINTER EVENTS (unificados) ===
        this.toolbar.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        this.toolbar.addEventListener('pointermove', (e) => this.onPointerMove(e));
        this.toolbar.addEventListener('pointerup', (e) => this.onPointerUp(e));
        this.toolbar.addEventListener('pointercancel', (e) => this.onPointerUp(e));
        
        // === HANDLER DE ORIENTACIÓN/RESIZE ===
        this._resizeHandler = () => this.ensureVisible();
        window.addEventListener('resize', this._resizeHandler);
        
        console.log('[DraggableToolbar] ✅ Pointer Events inicializados (híbrido mouse+touch+orientación)');
    }

    onPointerDown(e) {
        // Solo permitir drag desde el header
        const isDragHandle = e.target.classList.contains('toolbar-header') || 
                             e.target.classList.contains('toolbar-title') ||
                             e.target.classList.contains('toolbar-drag-hint');
        
        if (!isDragHandle) {
            return;
        }
        
        this.isDragging = true;
        this.activePointerId = e.pointerId;
        this.startX = e.clientX;
        this.startY = e.clientY;
        
        const rect = this.toolbar.getBoundingClientRect();
        this.initialLeft = rect.left;
        this.initialTop = rect.top;
        
        // === CAPTURE: Mantener eventos aunque el dedo salga del elemento ===
        this.toolbar.setPointerCapture(e.pointerId);
        
        // Agregar clase visual
        this.toolbar.classList.add('dragging');
        
        e.preventDefault();
        
        console.log('[DraggableToolbar] Drag iniciado, PointerType:', e.pointerType);
    }

    onPointerMove(e) {
        if (!this.isDragging) return;
        
        // Solo procesar el pointer que inició el drag
        if (e.pointerId !== this.activePointerId) return;
        
        e.preventDefault();

        const deltaX = e.clientX - this.startX;
        const deltaY = e.clientY - this.startY;
        
        let newLeft = this.initialLeft + deltaX;
        let newTop = this.initialTop + deltaY;
        
        // Límites del viewport
        const rect = this.toolbar.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width - 10;
        const maxY = window.innerHeight - rect.height - 10;
        
        newLeft = Math.max(10, Math.min(newLeft, maxX));
        newTop = Math.max(10, Math.min(newTop, maxY));
        
        // Guardar posición pendiente
        this.pendingLeft = newLeft;
        this.pendingTop = newTop;
        
        // === OPTIMIZACIÓN: requestAnimationFrame para fluidez ===
        if (!this.rafId) {
            this.rafId = requestAnimationFrame(() => {
                this.toolbar.style.left = this.pendingLeft + 'px';
                this.toolbar.style.top = this.pendingTop + 'px';
                this.toolbar.style.right = 'auto';
                this.toolbar.style.bottom = 'auto';
                this.rafId = null;
            });
        }
    }

    onPointerUp(e) {
        if (!this.isDragging) return;
        
        // Solo procesar el pointer que inició el drag
        if (e.pointerId !== this.activePointerId) return;
        
        // Liberar captura
        if (this.toolbar.hasPointerCapture && this.toolbar.hasPointerCapture(e.pointerId)) {
            this.toolbar.releasePointerCapture(e.pointerId);
        }
        
        this.isDragging = false;
        this.activePointerId = null;
        this.toolbar.classList.remove('dragging');
        
        // Cancelar RAF pendiente
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        
        // Aplicar snap si está habilitado
        if (this.snapEnabled) {
            this.applySnap();
        }
        
        // Guardar posición
        this.savePosition();
        
        console.log('[DraggableToolbar] Drag finalizado');
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
                
                // Verificar que esté visible en viewport
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
    
    destroy() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        
        // Remover handler de resize
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        
        console.log('[DraggableToolbar] 🧹 Destruido');
    }
}
