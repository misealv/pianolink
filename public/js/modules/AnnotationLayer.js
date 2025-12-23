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

        this.initEvents();
    }

    initEvents() {
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
        const fontSize = 40 * this.currentScale;
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
        const spacing = 12 * this.currentScale;
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
                const step = ((stave.data.spacing || 12) * stave.scaleY) / 2;
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
            fontFamily: 'serif', fontSize: 30 * this.currentScale,
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
        this.canvas.clear();
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
                if (this.onObjectRemovedCallback) this.onObjectRemovedCallback(obj.id);
                this.canvas.remove(obj);
            });
            this.canvas.discardActiveObject().requestRenderAll();
        }
    }

    onPathCreated(cb) { this.onPathCreatedCallback = cb; }
    onObjectRemoved(cb) { this.onObjectRemovedCallback = cb; }
    onClear(cb) { this.onClearCallback = cb; }
}