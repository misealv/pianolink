/* public/js/modules/AnnotationLayer.js */
export class AnnotationLayer {
    constructor(canvasId) {
        this.canvas = new fabric.Canvas(canvasId, {
            isDrawingMode: false,
            selection: true,
            preserveObjectStacking: true
        });

        this.pencilBrush = new fabric.PencilBrush(this.canvas);
        this.pencilBrush.width = 3;
        this.pencilBrush.color = "#ff0000";

        this.eraserBrush = null;
        if (typeof fabric.EraserBrush === 'function') {
            this.eraserBrush = new fabric.EraserBrush(this.canvas);
            this.eraserBrush.width = 15;
        }

        this.currentScale = 1.0;
        this.textColor = "#ff0000";
        this.currentMode = 'move'; 
        
        // ⚡ LÁSER: Callback para emitir posición
        this.onLaserMoveCallback = null;

        this.initEvents();
    }

    initEvents() {
        // ⚡ LÁSER: Detectar movimiento del mouse usando coordenadas del canvas HTML
        this.canvas.on('mouse:move', (opt) => {
            if (this.currentMode === 'laser' && this.onLaserMoveCallback) {
                // Obtener coordenadas relativas al canvas HTML (no transformadas por zoom)
                const canvasEl = this.canvas.getElement();
                const rect = canvasEl.getBoundingClientRect();
                const e = opt.e;
                
                // Coordenadas del mouse relativas al canvas
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                
                // Normalizar usando el tamaño visual del canvas
                const xPercent = Math.max(0, Math.min(1, mouseX / rect.width));
                const yPercent = Math.max(0, Math.min(1, mouseY / rect.height));
                
                this.onLaserMoveCallback({ 
                    xPercent: xPercent, 
                    yPercent: yPercent,
                    visible: true
                });
            }
        });
        
        // ⚡ LÁSER: Ocultar cuando el mouse sale del canvas
        this.canvas.on('mouse:out', () => {
            if (this.currentMode === 'laser' && this.onLaserMoveCallback) {
                this.onLaserMoveCallback({ visible: false });
            }
        });
        
        this.canvas.on('mouse:down', (opt) => {
            if (opt.target && this.currentMode === 'move') return;
            const pointer = this.canvas.getPointer(opt.e);
            const musicalModes = ['sol', 'fa', 'do', 'redonda', 'blanca', 'negra', 'circle', 'stave', 'timesig', 'barline'];

            if (this.currentMode === 'text') {
                this.addTextAt(pointer);
            } else if (this.currentMode === 'stave') {
                this.addStaveAt(pointer);
            } else if (musicalModes.includes(this.currentMode)) {
                if (this.currentMode === 'barline') {
                    this.addBarlineAt(pointer);
                } else if (this.currentMode === 'timesig') {
                    this.addTimeSigAt(pointer);
                } else {
                    this.addMusicalSymbol(pointer, this.currentMode);
                }
            }
        });

        this.canvas.on('path:created', (e) => {
            if (!e.path.remote) {
                e.path.set({ id: this.generateUid() });
                this.emitCreation(e.path);
            }
        });
    }

    setMode(mode) {
        this.currentMode = mode;
        this.canvas.isDrawingMode = (mode === 'draw' || mode === 'eraser');
        this.canvas.selection = (mode === 'move'); // Desactiva el cuadro azul al poner notas
        
        const isDrawingTool = mode !== 'move';
        this.canvas.getObjects().forEach(o => {
            o.set({ selectable: !isDrawingTool, evented: !isDrawingTool });
        });

        if (mode === 'draw') this.canvas.freeDrawingBrush = this.pencilBrush;
        if (mode === 'eraser' && this.eraserBrush) this.canvas.freeDrawingBrush = this.eraserBrush;
        this.canvas.requestRenderAll();
    }

    addMusicalSymbol(pointer, type) {
        const glyphs = { 
            'sol': '\uD834\uDD1E', 'fa': '\uD834\uDD22', 'do': '\uD834\uDD21',
            'redonda': '\uD834\uDD5D', 'blanca': '\uD834\uDD5E', 'negra': '\uD834\uDD5F', 'circle': '●' 
        };
        // DIFERENCIADO: Círculos pequeños (30px), figuras musicales grandes (72px)
        const fontSize = (type === 'circle') ? 30 * this.currentScale : 72 * this.currentScale;
        const finalY = this.calculateMagneticY(pointer.y); 

        const symbol = new fabric.IText(glyphs[type] || '●', {
            left: pointer.x, top: finalY, fontSize: fontSize,
            fontFamily: 'Bravura, serif', fill: this.textColor,
            originY: 'center', id: this.generateUid()
        });
        this.canvas.add(symbol);
        this.emitCreation(symbol);
    }

    addStaveAt(pointer) {
        const staveWidth = 800 * this.currentScale;
        // OPTIMIZADO: Spacing aumentado de 12px a 15px para mejor legibilidad
        const spacing = 15 * this.currentScale;
        const createStaveGroup = (yOffset) => {
            const lines = [];
            for (let i = 0; i < 5; i++) {
                lines.push(new fabric.Line([0, i * spacing, staveWidth, i * spacing], {
                    stroke: this.textColor, strokeWidth: 1.5, selectable: false
                }));
            }
            return new fabric.Group(lines, {
                left: pointer.x, top: pointer.y + yOffset,
                data: { type: 'stave', spacing: spacing },
                id: this.generateUid(), selectable: true
            });
        };
        const s1 = createStaveGroup(0);
        const s2 = createStaveGroup(spacing * 7);
        this.canvas.add(s1, s2);
        this.emitCreation(s1); this.emitCreation(s2);
        this.canvas.requestRenderAll();
    }

    calculateMagneticY(y) {
        let finalY = y;
        const staves = this.canvas.getObjects().filter(o => o.data?.type === 'stave');
        staves.forEach(stave => {
            if (y > stave.top - 25 && y < (stave.top + stave.height * stave.scaleY) + 25) {
                // Actualizado default spacing de 12 a 15 para consistencia
                const step = ((stave.data.spacing || 15) * stave.scaleY) / 2;
                finalY = stave.top + Math.round((y - stave.top) / step) * step;
            }
        });
        return finalY;
    }

    addTextAt(pointer) {
        const text = new fabric.IText('Texto...', {
            left: pointer.x, top: pointer.y,
            fontFamily: 'Arial', fontSize: 20 * this.currentScale,
            fill: this.textColor, id: this.generateUid()
        });
        this.canvas.add(text);
        this.emitCreation(text);
    }

    addBarlineAt(pointer) {
        const stave = this.canvas.getObjects().find(obj => 
            obj.data?.type === 'stave' && 
            pointer.y > obj.top - 20 && pointer.y < (obj.top + obj.height * obj.scaleY) + 20
        );
        const height = stave ? (stave.height * stave.scaleY) : 60;
        const top = stave ? stave.top : pointer.y - 30;
        const line = new fabric.Line([pointer.x, top, pointer.x, top + height], {
            stroke: this.textColor, strokeWidth: 2, id: this.generateUid()
        });
        this.canvas.add(line);
        this.emitCreation(line);
    }

    addTimeSigAt(pointer) {
        const text = new fabric.IText('4\n4', {
            left: pointer.x, top: this.calculateMagneticY(pointer.y),
            fontFamily: 'serif', fontSize: 45 * this.currentScale,
            textAlign: 'center', fill: this.textColor, originY: 'center', id: this.generateUid()
        });
        this.canvas.add(text);
        this.emitCreation(text);
    }

    generateUid() { return Math.random().toString(36).substr(2, 9) + '_' + Date.now(); }
    emitCreation(obj) {
        if (this.onPathCreatedCallback) {
            this.onPathCreatedCallback(obj.toObject(['id', 'data', 'selectable', 'evented', 'scaleX', 'scaleY']));
        }
    }

    drawRemotePath(pathData) {
        fabric.util.enlivenObjects([pathData], (objects) => {
            objects.forEach((o) => {
                const existing = this.canvas.getObjects().find(old => old.id === o.id);
                if (existing) this.canvas.remove(existing);
                o.remote = true;
                this.canvas.add(o);
            });
            this.canvas.requestRenderAll();
        });
    }

    removeObjectById(id) {
        const obj = this.canvas.getObjects().find(o => o.id === id);
        if (obj) { this.canvas.remove(obj); this.canvas.requestRenderAll(); }
    }

    getJSON() { return JSON.stringify(this.canvas.toJSON(['id', 'data'])); }

    loadJSON(json) {
        if (!json) return;
        this.canvas.loadFromJSON(json, () => {
            this.canvas.getObjects().forEach(obj => {
                const user = JSON.parse(localStorage.getItem('pianoUser') || '{}');
                if (user.role !== 'teacher') { obj.set({ selectable: false, evented: false }); }
            });
            this.canvas.requestRenderAll();
        }, (o, object) => { object.id = o.id; object.data = o.data; });
    }

    clear(emit = true) {
        // OPTIMIZACIÓN: Limpiar listeners de objetos antes de borrar
        this.canvas.getObjects().forEach(obj => {
            if (obj.dispose) obj.dispose();
        });
        this.canvas.clear();
        this.canvas.requestRenderAll();
        if (emit && this.onClearCallback) this.onClearCallback();
    }

    updateDimensions(w, h, s) {
        this.currentScale = s || 1;
        this.canvas.setDimensions({width: w, height: h});
        this.canvas.setZoom(s);
        this.canvas.requestRenderAll();
    }

    setBrushColor(color) { this.textColor = color; this.pencilBrush.color = color; }

    deleteSelected() {
        const activeObjects = this.canvas.getActiveObjects();
        if (activeObjects.length) {
            activeObjects.forEach(obj => {
                // OPTIMIZACIÓN: Limpiar recursos antes de remover
                if (obj.dispose) obj.dispose();
                if (this.onObjectRemovedCallback) this.onObjectRemovedCallback(obj.id);
                this.canvas.remove(obj);
            });
            this.canvas.discardActiveObject().requestRenderAll();
        }
    }

    onPathCreated(cb) { this.onPathCreatedCallback = cb; }
    onObjectRemoved(cb) { this.onObjectRemovedCallback = cb; }
    onClear(cb) { this.onClearCallback = cb; }
    
    // ⚡ LÁSER: Registrar callback para emitir posición
    onLaserMove(cb) { this.onLaserMoveCallback = cb; }
}