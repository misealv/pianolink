/* public/js/modules/AnnotationLayer.js */
export class AnnotationLayer {
    constructor(canvasId) {
        this.canvas = new fabric.Canvas(canvasId, {
            isDrawingMode: false,
            selection: false,
            preserveObjectStacking: true
        });

        this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
        this.canvas.freeDrawingBrush.width = 3;
        this.canvas.freeDrawingBrush.color = "#ff0000";
        this.currentScale = 1.0;
        this.isLaserMode = false;

        this.laserEl = document.getElementById('remote-laser');

        // Eventos
        this.canvas.on('path:created', (e) => {
            if (!e.path.remote && this.onPathCreatedCallback) {
                this.onPathCreatedCallback(e.path.toJSON());
            }
        });

        this.canvas.on('mouse:move', (opt) => {
            if (this.isLaserMode && this.onPointerMoveCallback) {
                const pointer = this.canvas.getPointer(opt.e);
                const x = pointer.x / this.canvas.width;
                const y = pointer.y / this.canvas.height;
                this.onPointerMoveCallback({ x, y });
            }
        });
    }

    // Callbacks
    onPathCreated(callback) { this.onPathCreatedCallback = callback; }
    onClear(callback) { this.onClearCallback = callback; }
    onPointerMove(callback) { this.onPointerMoveCallback = callback; }

    // Visuales
    updateDimensions(width, height, scale) {
        this.currentScale = scale;
        this.canvas.setDimensions({ width: width, height: height });
        this.canvas.setZoom(scale);
        this.canvas.requestRenderAll();
    }

    // --- AQUÍ ESTÁ EL MÉTODO QUE FALTABA "setMode" ---
    setMode(mode) {
        const scoreWrapper = document.getElementById('score-wrapper');
        this.isLaserMode = false; 

        if (mode === 'draw') {
            this.canvas.isDrawingMode = true;
            if(scoreWrapper) scoreWrapper.classList.remove('hand-mode');
            this.canvas.defaultCursor = 'crosshair';
            this.canvas.hoverCursor = 'crosshair';
        } 
        else if (mode === 'laser') {
            this.canvas.isDrawingMode = false;
            this.isLaserMode = true;
            if(scoreWrapper) scoreWrapper.classList.remove('hand-mode');
            this.canvas.defaultCursor = 'cell'; 
            this.canvas.hoverCursor = 'cell';
            this.canvas.requestRenderAll(); // Forzar actualización cursor
        }
        else { // mode === 'move'
            this.canvas.isDrawingMode = false;
            if(scoreWrapper) scoreWrapper.classList.add('hand-mode');
            this.canvas.defaultCursor = 'grab';
            this.canvas.hoverCursor = 'grab';
        }
    }

    // Compatibilidad
    toggleDrawing(enable) { this.setMode(enable ? 'draw' : 'move'); }

    setBrushColor(color) { this.canvas.freeDrawingBrush.color = color; }

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
                this.canvas.add(o);
            });
            this.canvas.requestRenderAll();
        });
    }

    updateRemoteLaser(xPercent, yPercent) {
        if (!this.laserEl) return;
        const left = xPercent * this.canvas.width;
        const top = yPercent * this.canvas.height;
        this.laserEl.style.left = `${left}px`;
        this.laserEl.style.top = `${top}px`;
        this.laserEl.classList.add('active');
        if (this.laserTimeout) clearTimeout(this.laserTimeout);
        this.laserTimeout = setTimeout(() => {
            this.laserEl.classList.remove('active');
        }, 2000);
    }

    getJSON() {
        if (this.canvas.getObjects().length > 0) return JSON.stringify(this.canvas.toJSON());
        return null;
    }
    loadJSON(jsonString) {
        this.canvas.clear();
        if (jsonString) this.canvas.loadFromJSON(jsonString, () => this.canvas.requestRenderAll());
    }
}