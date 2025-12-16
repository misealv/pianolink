export class FreeBoard {
    constructor(scoreLogic) {
        this.logic = scoreLogic; // Referencia a la lógica principal
        this.init();
    }

    get canvas() {
        // Accedemos al canvas de Fabric.js a través de la capa de anotaciones
        return this.logic.annotations ? this.logic.annotations.canvas : null;
    }

    init() {
        console.log("🎼 FreeBoard: Inicializando pizarra musical...");

        // 1. Escuchar cuando se activa el modo Pizarra
        window.addEventListener('whiteboard-active', () => {
            this.setupWhiteboard();
        });

        // 2. Vincular botones (Asegúrate de tener estos botones en tu HTML)
        const btnStave = document.getElementById('btn-add-stave');
        const btnGrandStave = document.getElementById('btn-add-grand-stave');

        if (btnStave) {
            btnStave.onclick = () => this.addStave();
        }
        if (btnGrandStave) {
            btnGrandStave.onclick = () => this.addGrandStave();
        }
    }

    setupWhiteboard() {
        if (!this.canvas) return;

        // Limpiamos el fondo (quitamos la imagen del PDF si había una)
        this.canvas.setBackgroundImage(null, this.canvas.renderAll.bind(this.canvas));
        this.canvas.backgroundColor = '#ffffff'; // Fondo blanco puro
        
        // Ajustamos dimensiones al contenedor
        const container = document.getElementById('pdf-container');
        if (container) {
            this.canvas.setWidth(container.clientWidth);
            this.canvas.setHeight(window.innerHeight * 0.8); // 80% del alto de la ventana
        }
        
        this.canvas.renderAll();
    }

    // --- AGREGAR PENTAGRAMA SIMPLE (Clave de Sol) ---
    addStave(topPosition = 100) {
        if (!this.canvas) return;

        const width = this.canvas.width - 100; // Margen de 50px a cada lado
        const left = 50;
        const spacing = 15; // Espacio entre líneas
        const lines = [];

        // Crear las 5 líneas
        for (let i = 0; i < 5; i++) {
            const line = new fabric.Line([0, i * spacing, width, i * spacing], {
                stroke: '#000000',
                strokeWidth: 2,
                selectable: false // Las líneas individuales no se seleccionan, solo el grupo
            });
            lines.push(line);
        }

        // Agrupar las líneas para moverlas juntas
        const staveGroup = new fabric.Group(lines, {
            left: left,
            top: topPosition,
            selectable: true,
            hasControls: false, // No permitir rotar ni escalar deformando
            hasBorders: true,
            lockScalingX: true, // Bloquear escalado para mantener el grosor de línea
            lockScalingY: true,
            hoverCursor: 'grab',
            moveCursor: 'grabbing',
            data: { type: 'stave' } // Meta-data para identificarlo
        });

        this.canvas.add(staveGroup);
        this.canvas.setActiveObject(staveGroup);
        this.canvas.renderAll();

        // Opcional: Sincronizar creación (si tu AnnotationLayer soporta sync de objetos)
        // this.logic.socket.emit('wb-object-add', staveGroup.toJSON());
    }

    // --- AGREGAR GRAN PENTAGRAMA (Piano: Sol + Fa) ---
    addGrandStave() {
        if (!this.canvas) return;

        // Pentagrama superior (Sol)
        this.addStave(100);
        
        // Pentagrama inferior (Fa) - un poco más abajo
        // 5 líneas * 15px = 75px de altura del pentagrama. 
        // Dejamos 60px de separación interna para notas centrales.
        this.addStave(100 + 75 + 60);

        // Nota: Aquí podrías dibujar la llave { que une ambos si quieres hacerlo avanzado
    }
}