/**
 * DraggableVideo.js - Sistema de Arrastre HÍBRIDO (Mouse + Touch)
 * 
 * MIGRACIÓN A POINTER EVENTS para compatibilidad con tablets (iPad/Android)
 * 
 * Técnicas implementadas:
 * - Pointer Events API: pointerdown/pointermove/pointerup (unifica mouse + touch)
 * - setPointerCapture: mantiene el arrastre aunque el dedo salga del elemento
 * - touch-action CSS: evita interferencia del scroll nativo
 * - requestAnimationFrame: fluidez en tablets de 60fps
 * 
 * Gestión de ventanas flotantes con drag & drop resiliente:
 * - Z-Index Manager: 900-950 (debajo de sidebar 1000+)
 * - Bounds checking: ventanas no pueden salir del viewport
 * - Click-to-focus: ventana activa sube a z-index superior
 * - Cleanup automático: remueve listeners al destruir
 * 
 * @author Miguel Antonio Sepúlveda Alvarez
 * @version 2.0.0 - Pointer Events Migration
 */

(function(global) {
    'use strict';

    /**
     * Constructor del DraggableVideo
     * No requiere configuración inicial
     */
    function DraggableVideo() {
        this.draggedElement = null;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.zIndexBase = 900;
        this.zIndexActive = 950;
        this.activeHandlers = [];
        
        // RAF para optimización de rendimiento
        this.rafId = null;
        this.pendingX = 0;
        this.pendingY = 0;
        
        // Pointer ID para captura
        this.activePointerId = null;
        
        console.log('[DraggableVideo] Sistema de arrastre HÍBRIDO creado (Pointer Events)');
    }

    /**
     * Inicializa el sistema de arrastre para elementos específicos
     * @param {Array<string>} selectors - Array de selectores CSS
     */
    DraggableVideo.prototype.init = function(selectors) {
        var self = this;
        
        if (!selectors || !Array.isArray(selectors)) {
            console.warn('[DraggableVideo] Selectores inválidos, usando defaults');
            selectors = ['.video-window'];
        }
        
        console.log('[DraggableVideo] Inicializando drag híbrido para:', selectors);
        
        selectors.forEach(function(selector) {
            var elements = document.querySelectorAll(selector);
            
            if (elements.length === 0) {
                console.warn('[DraggableVideo] No se encontró elemento:', selector);
                return;
            }
            
            elements.forEach(function(element) {
                self._makeDraggable(element);
            });
        });
        
        // === HANDLER DE ORIENTACIÓN/RESIZE ===
        // Revalida posiciones cuando cambia el viewport (rotación de tablet)
        self._resizeHandler = function() {
            self._revalidatePositions();
        };
        window.addEventListener('resize', self._resizeHandler);
        
        console.log('[DraggableVideo] ✅ Sistema híbrido inicializado (mouse + touch + orientación)');
    };

    /**
     * Hace un elemento específico draggable con Pointer Events
     * @param {HTMLElement} element - Elemento a hacer draggable
     * @private
     */
    DraggableVideo.prototype._makeDraggable = function(element) {
        var self = this;
        
        if (!element) {
            console.warn('[DraggableVideo] Elemento nulo, saltando');
            return;
        }
        
        // Buscar el header como handle
        var handle = element.querySelector('.video-header');
        if (!handle) {
            console.warn('[DraggableVideo] No se encontró .video-header, usando elemento completo');
            handle = element;
        }
        
        // === CSS CRÍTICO PARA TOUCH ===
        handle.style.cursor = 'move';
        handle.style.touchAction = 'none'; // CRÍTICO: evita scroll nativo
        element.style.zIndex = self.zIndexBase;
        element.style.position = 'fixed';
        element.style.touchAction = 'none'; // También en el contenedor
        
        // === POINTER EVENT HANDLERS ===
        var onPointerDown = function(e) {
            self._onPointerDown(e, element, handle);
        };
        
        var onPointerMove = function(e) {
            self._onPointerMove(e);
        };
        
        var onPointerUp = function(e) {
            self._onPointerUp(e, handle);
        };
        
        var onPointerCancel = function(e) {
            self._onPointerUp(e, handle); // Mismo comportamiento que up
        };
        
        var onClickToFocus = function() {
            self._bringToFront(element);
        };
        
        // Registrar eventos en el HANDLE
        handle.addEventListener('pointerdown', onPointerDown);
        handle.addEventListener('pointermove', onPointerMove);
        handle.addEventListener('pointerup', onPointerUp);
        handle.addEventListener('pointercancel', onPointerCancel);
        element.addEventListener('click', onClickToFocus);
        
        // Guardar handlers para cleanup
        self.activeHandlers.push(
            { element: handle, event: 'pointerdown', handler: onPointerDown },
            { element: handle, event: 'pointermove', handler: onPointerMove },
            { element: handle, event: 'pointerup', handler: onPointerUp },
            { element: handle, event: 'pointercancel', handler: onPointerCancel },
            { element: element, event: 'click', handler: onClickToFocus }
        );
        
        console.log('[DraggableVideo] Elemento draggable (híbrido):', element.id || element.className);
    };

    /**
     * Handler de pointerdown (inicio de drag)
     * Compatible con mouse, touch y stylus
     * @private
     */
    DraggableVideo.prototype._onPointerDown = function(e, element, handle) {
        var self = this;
        
        // Prevenir comportamiento por defecto (selección de texto, etc)
        e.preventDefault();
        
        self.isDragging = true;
        self.draggedElement = element;
        self.activePointerId = e.pointerId;
        
        // === CAPTURE: Mantener eventos aunque el dedo salga del elemento ===
        handle.setPointerCapture(e.pointerId);
        
        // Calcular offset relativo al cursor/dedo
        var rect = element.getBoundingClientRect();
        self.offsetX = e.clientX - rect.left;
        self.offsetY = e.clientY - rect.top;
        
        // Traer ventana al frente
        self._bringToFront(element);
        
        // Agregar clase visual de "dragging"
        element.classList.add('dragging');
        
        console.log('[DraggableVideo] Drag iniciado (pointer):', element.id, 'PointerType:', e.pointerType);
    };

    /**
     * Handler de pointermove (durante drag)
     * Usa requestAnimationFrame para fluidez en tablets
     * @private
     */
    DraggableVideo.prototype._onPointerMove = function(e) {
        var self = this;
        
        if (!self.isDragging || !self.draggedElement) {
            return;
        }
        
        // Solo procesar el pointer que inició el drag
        if (e.pointerId !== self.activePointerId) {
            return;
        }
        
        // Prevenir scroll
        e.preventDefault();
        
        // Calcular nueva posición
        var newX = e.clientX - self.offsetX;
        var newY = e.clientY - self.offsetY;
        
        // Bounds checking
        var rect = self.draggedElement.getBoundingClientRect();
        var viewportWidth = window.innerWidth;
        var viewportHeight = window.innerHeight;
        
        newX = Math.max(0, Math.min(newX, viewportWidth - rect.width));
        newY = Math.max(0, Math.min(newY, viewportHeight - rect.height));
        
        // Guardar posición pendiente
        self.pendingX = newX;
        self.pendingY = newY;
        
        // === OPTIMIZACIÓN: requestAnimationFrame para fluidez ===
        if (!self.rafId) {
            self.rafId = requestAnimationFrame(function() {
                if (self.draggedElement) {
                    self.draggedElement.style.left = self.pendingX + 'px';
                    self.draggedElement.style.top = self.pendingY + 'px';
                }
                self.rafId = null;
            });
        }
    };

    /**
     * Handler de pointerup/pointercancel (fin de drag)
     * @private
     */
    DraggableVideo.prototype._onPointerUp = function(e, handle) {
        var self = this;
        
        if (!self.isDragging) {
            return;
        }
        
        // Solo procesar el pointer que inició el drag
        if (e.pointerId !== self.activePointerId) {
            return;
        }
        
        // Liberar captura
        if (handle && handle.hasPointerCapture && handle.hasPointerCapture(e.pointerId)) {
            handle.releasePointerCapture(e.pointerId);
        }
        
        if (self.draggedElement) {
            self.draggedElement.classList.remove('dragging');
            console.log('[DraggableVideo] Drag finalizado:', self.draggedElement.id);
        }
        
        // Cancelar RAF pendiente
        if (self.rafId) {
            cancelAnimationFrame(self.rafId);
            self.rafId = null;
        }
        
        self.isDragging = false;
        self.draggedElement = null;
        self.activePointerId = null;
    };

    /**
     * Trae un elemento al frente (z-index)
     * @param {HTMLElement} element - Elemento a traer al frente
     * @private
     */
    DraggableVideo.prototype._bringToFront = function(element) {
        var self = this;
        
        var allWindows = document.querySelectorAll('.video-window');
        allWindows.forEach(function(win) {
            win.style.zIndex = self.zIndexBase;
        });
        
        element.style.zIndex = self.zIndexActive;
    };

    /**
     * Revalida posiciones de todas las ventanas tras cambio de viewport
     * Se ejecuta en rotación de tablet o resize de ventana
     * @private
     */
    DraggableVideo.prototype._revalidatePositions = function() {
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var margin = 10;
        var adjusted = 0;
        
        document.querySelectorAll('.video-window').forEach(function(win) {
            var rect = win.getBoundingClientRect();
            var needsAdjust = false;
            
            // Si la ventana está fuera del viewport, reposicionar
            if (rect.right > vw) {
                win.style.left = Math.max(margin, vw - rect.width - margin) + 'px';
                needsAdjust = true;
            }
            if (rect.left < 0) {
                win.style.left = margin + 'px';
                needsAdjust = true;
            }
            if (rect.bottom > vh) {
                win.style.top = Math.max(margin, vh - rect.height - margin) + 'px';
                needsAdjust = true;
            }
            if (rect.top < 0) {
                win.style.top = margin + 'px';
                needsAdjust = true;
            }
            
            if (needsAdjust) adjusted++;
        });
        
        if (adjusted > 0) {
            console.log('[DraggableVideo] 📐 Viewport cambiado, ' + adjusted + ' ventana(s) reposicionada(s)');
        }
    };

    /**
     * Destruye el sistema de arrastre (cleanup)
     */
    DraggableVideo.prototype.destroy = function() {
        var self = this;
        
        console.log('[DraggableVideo] 🧹 Limpiando event listeners...');
        
        // Cancelar RAF pendiente
        if (self.rafId) {
            cancelAnimationFrame(self.rafId);
            self.rafId = null;
        }
        
        // Remover handler de resize
        if (self._resizeHandler) {
            window.removeEventListener('resize', self._resizeHandler);
            self._resizeHandler = null;
        }
        
        self.activeHandlers.forEach(function(handler) {
            if (handler.element && handler.handler) {
                handler.element.removeEventListener(handler.event, handler.handler);
            }
        });
        
        self.activeHandlers = [];
        self.isDragging = false;
        self.draggedElement = null;
        self.activePointerId = null;
        
        console.log('[DraggableVideo] ✅ Sistema de arrastre destruido');
    };

    /**
     * Re-posiciona un elemento en coordenadas específicas
     * @param {string} selector - Selector CSS del elemento
     * @param {number} x - Posición X
     * @param {number} y - Posición Y
     */
    DraggableVideo.prototype.setPosition = function(selector, x, y) {
        var element = document.querySelector(selector);
        
        if (!element) {
            console.warn('[DraggableVideo] Elemento no encontrado:', selector);
            return;
        }
        
        element.style.left = x + 'px';
        element.style.top = y + 'px';
        
        console.log('[DraggableVideo] Posición actualizada:', selector, { x: x, y: y });
    };

    // Exportar al contexto global
    global.DraggableVideo = DraggableVideo;

})(window);
