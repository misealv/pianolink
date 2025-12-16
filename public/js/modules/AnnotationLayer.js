/* public/js/modules/AnnotationLayer.js */
export class AnnotationLayer {
    constructor(canvasId) {
        this.canvas = new fabric.Canvas(canvasId, {
            isDrawingMode: false,
            selection: false,
            preserveObjectStacking: true
        });

        // Configuración inicial
        this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
        this.canvas.freeDrawingBrush.width = 3;
        this.canvas.freeDrawingBrush.color = "#ff0000";
        this.currentScale = 1.0;
        this.isLaserMode = false;
        this.textColor = "#ff0000";
        this.currentMode = 'move'; 

        this.laserEl = document.getElementById('remote-laser');

        // --- EVENTOS INTERNOS ---

        // 1. DIBUJO CREADO (Lápiz)
        this.canvas.on('path:created', (e) => {
            if (!e.path.remote) {
                e.path.set({ id: this.generateUid(), selectable: false, evented: false });
                this.emitCreation(e.path);
            }
        });

        // 2. DETECTAR CLIC PARA CREAR OBJETOS (Texto o Círculos)
        this.canvas.on('mouse:down', (opt) => {
            if (opt.target) return; // Si clicamos sobre un objeto, no crear nada nuevo

            const pointer = this.canvas.getPointer(opt.e);

            if (this.currentMode === 'text') {
                this.addTextAt(pointer);
            } else if (this.currentMode === 'circle') {
                this.addCircleAt(pointer);
            }
        });

        // 3. TEXTO TERMINADO
        this.canvas.on('text:editing:exited', (e) => {
            if (!e.target.remote) {
                e.target.set({ selectable: true, evented: true });
                if(!e.target.id) {
                    e.target.set('id', this.generateUid());
                    this.emitCreation(e.target);
                }
            }
        });

        // 4. LÁSER
        this.canvas.on('mouse:move', (opt) => {
            if (this.isLaserMode && this.onPointerMoveCallback) {
                const pointer = this.canvas.getPointer(opt.e);
                this.onPointerMoveCallback({ 
                    x: pointer.x / this.canvas.width, 
                    y: pointer.y / this.canvas.height 
                });
            }
        });

        // 5. BORRAR CON TECLADO
        window.addEventListener('keydown', (e) => {
            if(this.canvas.getActiveObject()) {
                if(e.key === 'Delete' || e.key === 'Backspace') {
                    if(this.canvas.getActiveObject().isEditing) return;
                    this.deleteSelected();
                }
            }
        });
    }

    // --- MÉTODOS DE CREACIÓN ---

    generateUid() {
        return Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    emitCreation(obj) {
        if (this.onPathCreatedCallback) {
            // Serializamos propiedades clave incluyendo el radio y colores
            this.onPathCreatedCallback(obj.toObject(['id', 'type', 'left', 'top', 'radius', 'stroke', 'strokeWidth', 'fill', 'width', 'height', 'scaleX', 'scaleY']));
        }
    }

    addTextAt(pointer) {
        const text = new fabric.IText('Texto', {
            left: pointer.x, top: pointer.y,
            fontFamily: 'Arial', fill: this.textColor, fontSize: 20 * this.currentScale,
            id: this.generateUid(), selectable: true, evented: true
        });
        this.canvas.add(text);
        this.canvas.setActiveObject(text);
        text.enterEditing();
        text.selectAll();
    }

    // --- CÍRCULO AJUSTADO A PENTAGRAMA ---
    addCircleAt(pointer) {
        // Radio 7px = Diámetro 14px (ideal para espacios de 15px)
        const radius = 7 * this.currentScale; 
        
        const circle = new fabric.Circle({
            left: pointer.x - radius, // Centrado exacto en el clic
            top: pointer.y - radius,
            radius: radius,
            fill: 'transparent',
            stroke: this.textColor,
            strokeWidth: 2, // Borde un poco más fino para mayor precisión
            id: this.generateUid(),
            selectable: true,
            evented: true,
            perPixelTargetFind: true // Facilita seleccionar solo tocando el borde
        });
        
        this.canvas.add(circle);
        this.canvas.setActiveObject(circle);
        this.emitCreation(circle); 
    }

    // --- ACCIONES PÚBLICAS ---

    deleteSelected() {
        const activeObjects = this.canvas.getActiveObjects();
        if (activeObjects.length) {
            this.canvas.discardActiveObject();
            activeObjects.forEach((obj) => {
                const id = obj.id;
                this.canvas.remove(obj);
                if (this.onObjectRemovedCallback && id) {
                    this.onObjectRemovedCallback(id);
                }
            });
        }
    }

    removeObjectById(id) {
        const objects = this.canvas.getObjects();
        const obj = objects.find(o => o.id === id);
        if (obj) {
            this.canvas.remove(obj);
            this.canvas.requestRenderAll();
        }
    }

    // --- CALLBACKS ---
    onPathCreated(cb) { this.onPathCreatedCallback = cb; }
    onClear(cb) { this.onClearCallback = cb; }
    onPointerMove(cb) { this.onPointerMoveCallback = cb; }
    onObjectRemoved(cb) { this.onObjectRemovedCallback = cb; }

    // --- MODOS Y VISUALIZACIÓN ---
    updateDimensions(w, h, s) {
        this.currentScale = s || 1;
        this.canvas.setDimensions({width: w, height: h});
        this.canvas.setZoom(s);
        this.canvas.requestRenderAll();
    }

    setMode(mode) {
        const wrapper = document.getElementById('score-wrapper');
        this.currentMode = mode;
        this.isLaserMode = false;
        
        this.canvas.discardActiveObject();
        this.canvas.requestRenderAll();

        // 1. DIBUJO LIBRE
        if (mode === 'draw') {
            this.canvas.isDrawingMode = true;
            this.canvas.selection = false;
            this.canvas.getObjects().forEach(o => o.set({ selectable: false, evented: false }));
            if(wrapper) wrapper.classList.remove('hand-mode');
            this.canvas.defaultCursor = 'crosshair';
        } 
        // 2. MODOS DE OBJETO (Texto, Círculo)
        else if (mode === 'text' || mode === 'circle') {
            this.canvas.isDrawingMode = false;
            this.canvas.selection = true;
            this.canvas.getObjects().forEach(o => o.set({ selectable: true, evented: true }));
            if(wrapper) wrapper.classList.remove('hand-mode');
            this.canvas.defaultCursor = 'copy'; 
        }
        // 3. LÁSER
        else if (mode === 'laser') {
            this.canvas.isDrawingMode = false;
            this.isLaserMode = true;
            this.canvas.selection = false;
            this.canvas.getObjects().forEach(o => o.set({ selectable: false, evented: false }));
            if(wrapper) wrapper.classList.remove('hand-mode');
            this.canvas.defaultCursor = 'cell';
        }
        // 4. MOVER (MANO)
        else { 
            this.canvas.isDrawingMode = false;
            this.canvas.selection = false;
            this.canvas.getObjects().forEach(o => o.set({ selectable: false, evented: false }));
            if(wrapper) wrapper.classList.add('hand-mode');
            this.canvas.defaultCursor = 'grab';
        }
        this.canvas.requestRenderAll();
    }

    setBrushColor(c) {
        this.textColor = c; 
        this.canvas.freeDrawingBrush.color = c;
        
        const active = this.canvas.getActiveObject();
        if(active) {
            if (active.type === 'i-text') active.set('fill', c);
            if (active.type === 'circle') active.set('stroke', c);
            
            this.canvas.requestRenderAll();
            this.emitCreation(active); 
        }
    }

    clear(emit = true) {
        this.canvas.clear();
        if (emit && this.onClearCallback) this.onClearCallback();
    }
    
    drawRemotePath(pathData) {
        fabric.util.enlivenObjects([pathData], (objects) => {
            objects.forEach((o) => {
                o.remote = true;
                o.selectable = false; 
                o.evented = false;
                if(pathData.id) o.id = pathData.id; 
                this.canvas.add(o);
            });
            this.canvas.requestRenderAll();
        });
    }

    updateRemoteLaser(x, y) {
        if (!this.laserEl) return;
        this.laserEl.style.left = `${x * this.canvas.width}px`;
        this.laserEl.style.top = `${y * this.canvas.height}px`;
        this.laserEl.classList.add('active');
        if (this.tOut) clearTimeout(this.tOut);
        this.tOut = setTimeout(() => this.laserEl.classList.remove('active'), 2000);
    }
    
    getJSON() { return JSON.stringify(this.canvas.toJSON(['id'])); }
    loadJSON(j) { this.canvas.clear(); if(j) this.canvas.loadFromJSON(j, () => this.canvas.requestRenderAll()); }
}