/* public/js/modules/FreeBoard.js */
export class FreeBoard {
    constructor(scoreLogic) {
        this.logic = scoreLogic; // Referencia a ScoreLogic para acceder al motor activo
        this.init();
    }

    init() {
        console.log("🎼 FreeBoard: Inicializando pizarra musical inteligente...");

        // Escuchar cuando se activa la pestaña de pizarra
        window.addEventListener('whiteboard-active', () => {
            this.setupWhiteboard();
        });

        // Vincular los botones de la interfaz
        const btnStave = document.getElementById('btn-add-stave');
        const btnGrandStave = document.getElementById('btn-add-grand-stave');
        if (btnStave) {
            btnStave.onclick = () => {
                const engine = this.logic.activeEngine;
                if (!engine) return;

                // CIRUGÍA: Lógica inteligente de creación
                // Si la pizarra está vacía, iniciamos con un Gran Staff (Piano)
                const hasStaves = engine.canvas.getObjects().some(obj => obj.data?.type === 'stave');
                
                if (!hasStaves) {
                    console.log("🎹 Creando sistema de piano inicial...");
                    this.addGrandStave();
                } else {
                    // Si ya hay pentagramas, añadimos uno simple debajo del último
                    console.log("🎼 Añadiendo pentagrama adicional...");
                    const lastStave = engine.canvas.getObjects().filter(o => o.data?.type === 'stave').pop();
                    const newTop = lastStave ? (lastStave.top + 150) : 150;
                    this.addStave(newTop);
                }
            };
        }
    }

    /**
     * Prepara el lienzo de la pizarra blanca
     */
    setupWhiteboard() {
        const engine = this.logic.activeEngine; 
        if (!engine) return;
    
        engine.canvas.setBackgroundImage(null, engine.canvas.renderAll.bind(engine.canvas));
        engine.canvas.backgroundColor = '#ffffff'; 
        
        // CIRUGÍA: Usar el wrapper correcto y dimensiones fijas para asegurar el dibujo
        const container = document.getElementById('whiteboard-wrapper');
        if (container) {
            // Forzamos un ancho mínimo para que el pentagrama de 350px siempre quepa
            const width = Math.max(container.clientWidth, 800); 
            const height = Math.max(container.clientHeight, 600);
            engine.updateDimensions(width, height, 1);
        }
        
        engine.canvas.renderAll();
    }

    /**
     * Agrega un pentagrama que el motor reconoce como "magnético"
     */
    addStave(topPosition = 100) {
        const engine = this.logic.activeEngine;
        if (!engine) return;

        const width = engine.canvas.width - 100; // Margen lateral
        const left = 50;
        const spacing = 15; // Espacio entre líneas musicalmente estándar
        const lines = [];

        // Crear las 5 líneas del pentagrama
        for (let i = 0; i < 5; i++) {
            const line = new fabric.Line([0, i * spacing, width, i * spacing], {
                stroke: '#000000',
                strokeWidth: 2,
                selectable: false // Las líneas internas no se tocan solas
            });
            lines.push(line);
        }

        // Agrupar las líneas para que sean un solo objeto móvil
        const staveGroup = new fabric.Group(lines, {
            left: left,
            top: topPosition,
            originX: 'left',  
            originY: 'top',   
            selectable: true,
            hasControls: true, // Permite al profesor estirar el pentagrama si quiere
            hasBorders: true,
            lockScalingY: false, // Permitimos escalar en Y para ajustar el "ancho" musical
            hoverCursor: 'grab',
            moveCursor: 'grabbing',
            // META-DATA CRÍTICA: Esto es lo que lee AnnotationLayer para el imán
            data: { 
                type: 'stave', 
                spacing: spacing 
            }
        });

        engine.canvas.add(staveGroup);
        engine.canvas.setActiveObject(staveGroup);
        
        // SINCRONIZACIÓN: Enviamos el pentagrama a José inmediatamente
        engine.emitCreation(staveGroup);
        engine.canvas.renderAll();
    }

    /**
     * Agrega el sistema de piano (Gran Staff: Sol + Fa)
     */
    addGrandStave() {
        // Añadimos dos sistemas con una separación de 135px (75px de pentagrama + 60px de aire)
        this.addStave(100); // Clave de Sol aproximada
        this.addStave(235); // Clave de Fa aproximada
    }
}