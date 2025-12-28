/**
 * DraggableVideo.js - Sistema de Arrastre Independiente
 * 
 * Gestión de ventanas flotantes con drag & drop resiliente:
 * - Z-Index Manager: 900-950 (debajo de sidebar 1000+)
 * - Bounds checking: ventanas no pueden salir del viewport
 * - Click-to-focus: ventana activa sube a z-index superior
 * - Cleanup automático: remueve listeners al destruir
 * 
 * MODULARIDAD: Funciona aunque VideoManager falle
 * Si no encuentra elementos, simplemente no hace nada (graceful degradation)
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
        this.zIndexBase = 900; // Base para ventanas de video
        this.zIndexActive = 950; // Para ventana activa (click-to-focus)
        this.activeHandlers = []; // Para cleanup
        
        console.log('[DraggableVideo] Sistema de arrastre creado');
    }

    /**
     * Inicializa el sistema de arrastre para elementos específicos
     * @param {Array<string>} selectors - Array de selectores CSS (ej: ['#local-video', '#remote-video'])
     */
    DraggableVideo.prototype.init = function(selectors) {
        var self = this;
        
        if (!selectors || !Array.isArray(selectors)) {
            console.warn('[DraggableVideo] Selectores inválidos, usando defaults');
            selectors = ['.video-window'];
        }
        
        console.log('[DraggableVideo] Inicializando drag para:', selectors);
        
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
        
        console.log('[DraggableVideo] ✅ Sistema de arrastre inicializado');
    };

    /**
     * Hace un elemento específico draggable
     * @param {HTMLElement} element - Elemento a hacer draggable
     * @private
     */
    DraggableVideo.prototype._makeDraggable = function(element) {
        var self = this;
        
        if (!element) {
            console.warn('[DraggableVideo] Elemento nulo, saltando');
            return;
        }
        
        // Buscar el header como handle (si existe)
        var handle = element.querySelector('.video-header');
        if (!handle) {
            console.warn('[DraggableVideo] No se encontró .video-header, usando elemento completo');
            handle = element;
        }
        
        // Configurar cursor y z-index inicial
        handle.style.cursor = 'move';
        element.style.zIndex = self.zIndexBase;
        element.style.position = 'fixed'; // Asegurar posicionamiento
        
        // Event Listeners
        var onMouseDown = function(e) {
            self._onMouseDown(e, element, handle);
        };
        
        var onClickToFocus = function() {
            self._bringToFront(element);
        };
        
        handle.addEventListener('mousedown', onMouseDown);
        element.addEventListener('click', onClickToFocus);
        
        // Guardar handlers para cleanup
        self.activeHandlers.push({
            element: handle,
            event: 'mousedown',
            handler: onMouseDown
        });
        self.activeHandlers.push({
            element: element,
            event: 'click',
            handler: onClickToFocus
        });
        
        console.log('[DraggableVideo] Elemento draggable:', element.id || element.className);
    };

    /**
     * Handler de mousedown (inicio de drag)
     * @private
     */
    DraggableVideo.prototype._onMouseDown = function(e, element, handle) {
        var self = this;
        
        // Prevenir selección de texto
        e.preventDefault();
        
        self.isDragging = true;
        self.draggedElement = element;
        
        // Calcular offset relativo al cursor
        var rect = element.getBoundingClientRect();
        self.offsetX = e.clientX - rect.left;
        self.offsetY = e.clientY - rect.top;
        
        // Traer ventana al frente
        self._bringToFront(element);
        
        // Agregar listeners globales
        var onMouseMove = function(e) {
            self._onMouseMove(e);
        };
        
        var onMouseUp = function() {
            self._onMouseUp();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        
        console.log('[DraggableVideo] Drag iniciado:', element.id);
    };

    /**
     * Handler de mousemove (durante drag)
     * @private
     */
    DraggableVideo.prototype._onMouseMove = function(e) {
        var self = this;
        
        if (!self.isDragging || !self.draggedElement) {
            return;
        }
        
        // Calcular nueva posición
        var newX = e.clientX - self.offsetX;
        var newY = e.clientY - self.offsetY;
        
        // Bounds checking (no salir del viewport)
        var rect = self.draggedElement.getBoundingClientRect();
        var viewportWidth = window.innerWidth;
        var viewportHeight = window.innerHeight;
        
        // Límites X
        newX = Math.max(0, Math.min(newX, viewportWidth - rect.width));
        
        // Límites Y
        newY = Math.max(0, Math.min(newY, viewportHeight - rect.height));
        
        // Aplicar nueva posición
        self.draggedElement.style.left = newX + 'px';
        self.draggedElement.style.top = newY + 'px';
    };

    /**
     * Handler de mouseup (fin de drag)
     * @private
     */
    DraggableVideo.prototype._onMouseUp = function() {
        var self = this;
        
        if (self.isDragging && self.draggedElement) {
            console.log('[DraggableVideo] Drag finalizado:', self.draggedElement.id);
        }
        
        self.isDragging = false;
        self.draggedElement = null;
    };

    /**
     * Trae un elemento al frente (z-index)
     * @param {HTMLElement} element - Elemento a traer al frente
     * @private
     */
    DraggableVideo.prototype._bringToFront = function(element) {
        var self = this;
        
        // Resetear todos los video-window al z-index base
        var allWindows = document.querySelectorAll('.video-window');
        allWindows.forEach(function(win) {
            win.style.zIndex = self.zIndexBase;
        });
        
        // Traer elemento actual al frente
        element.style.zIndex = self.zIndexActive;
    };

    /**
     * Destruye el sistema de arrastre (cleanup)
     * Remueve todos los event listeners
     */
    DraggableVideo.prototype.destroy = function() {
        var self = this;
        
        console.log('[DraggableVideo] 🧹 Limpiando event listeners...');
        
        self.activeHandlers.forEach(function(handler) {
            if (handler.element && handler.handler) {
                handler.element.removeEventListener(handler.event, handler.handler);
            }
        });
        
        self.activeHandlers = [];
        self.isDragging = false;
        self.draggedElement = null;
        
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
