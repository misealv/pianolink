/**
 * /public/js/modules/Whiteboard.js
 * Lógica Visual Musical (VexFlow + Tonal).
 * OPTIMIZACIÓN: Cache de renderer y SVG para hardware antiguo.
 */
export class Whiteboard {
    constructor() {
        this.container = document.getElementById("staffContainer");
        this.chordDisplay = document.getElementById("chordDisplay");
        
        this.teacherActiveNotes = new Set();
        this.renderTimeout = null;
        
        // OPTIMIZACIÓN: Mantener renderer y contexto vivos para evitar recrear SVG
        this.renderer = null;
        this.ctx = null;
        this.lastRenderedNotes = "";
        
        // Inicializar (Dibujamos el Grand Staff vacío al arrancar)
        this.drawEmpty();
    }

    /**
     * Procesa una nota entrante (local o remota)
     */
    handleNote(note, velocity) {
        if (velocity > 0) {
            this.teacherActiveNotes.add(note);
        } else {
            this.teacherActiveNotes.delete(note);
        }
        this.scheduleRender();
    }

    scheduleRender() {
        if (this.renderTimeout) clearTimeout(this.renderTimeout);
        this.renderTimeout = setTimeout(() => this.render(), 50);
    }

    render() {
        if (typeof Vex === 'undefined' || typeof Tonal === 'undefined') return;

        // Ordenamos las notas de grave a agudo
        const notes = Array.from(this.teacherActiveNotes).sort((a,b) => a-b);
        
        // OPTIMIZACIÓN: Evitar re-render si las notas no cambiaron
        const notesKey = notes.join(',');
        if (notesKey === this.lastRenderedNotes) return;
        this.lastRenderedNotes = notesKey;

        // 1. Detección de Acordes
        if (notes.length > 0) {
            const names = notes.map(n => this.getNoteName(n));
            let chord = Tonal.Chord.detect(names)[0];
            if (!chord && names.length > 2) chord = Tonal.Chord.detect(names.slice(0,3))[0];
            
            this.chordDisplay.innerText = chord ? chord : names.join(" ");
        } else {
            this.chordDisplay.innerText = "--";
            this.drawEmpty(); // Si no hay notas, dibujamos el pentagrama vacío con llave
            return;
        }

        // 2. Renderizado Visual
        try {
            this.drawGrandStaff(notes);
        } catch (e) {
            console.warn("VexFlow render error:", e);
        }
    }

    getNoteName(midi) {
        let n = Tonal.Note.fromMidi(midi);
        return n; 
    }

    // --- VEXFLOW IMPLEMENTATION ---

    // Dibuja el pentagrama con llave PERO sin notas
    drawEmpty() {
        // OPTIMIZACIÓN: Solo limpiar SVG si ya existía un renderer
        if (!this.renderer) {
            const VF = Vex.Flow;
            this.renderer = new VF.Renderer(this.container, VF.Renderer.Backends.SVG);
            this.renderer.resize(420, 450); 
            this.ctx = this.renderer.getContext();
        } else {
            // Reutilizar renderer, solo limpiar canvas
            this.ctx.clear();
        }
        
        const VF = Vex.Flow;
        
        // Creamos los pentagramas igual que en el modo activo
        const trebleStave = new VF.Stave(30, 100, 350).addClef("treble").setContext(this.ctx);
        const bassStave = new VF.Stave(30, 250, 350).addClef("bass").setContext(this.ctx);
        
        trebleStave.draw();
        bassStave.draw();

        // AGREGADO: Dibujamos la llave abrazadora (Brace) también en vacío
        new VF.StaveConnector(trebleStave, bassStave).setType(VF.StaveConnector.type.BRACE).setContext(this.ctx).draw();
        new VF.StaveConnector(trebleStave, bassStave).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(this.ctx).draw();
        
        this.lastRenderedNotes = "";
    }

    // Dibuja el pentagrama con llave Y notas
    drawGrandStaff(midiNotes) {
        // OPTIMIZACIÓN: Reutilizar renderer y contexto
        if (!this.renderer) {
            const VF = Vex.Flow;
            this.renderer = new VF.Renderer(this.container, VF.Renderer.Backends.SVG);
            this.renderer.resize(420, 450);
            this.ctx = this.renderer.getContext();
        } else {
            this.ctx.clear();
        }
        
        const VF = Vex.Flow;

        // 1. Crear Staves (Pentagramas)
        const trebleStave = new VF.Stave(30, 100, 350).addClef("treble").setContext(this.ctx);
        const bassStave = new VF.Stave(30, 250, 350).addClef("bass").setContext(this.ctx);
        trebleStave.draw();
        bassStave.draw();

        // Conector (La llave que une los dos pentagramas)
        new VF.StaveConnector(trebleStave, bassStave).setType(VF.StaveConnector.type.BRACE).setContext(this.ctx).draw();
        new VF.StaveConnector(trebleStave, bassStave).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(this.ctx).draw();

        // 2. Separar notas para cada mano
        const trebleMidis = midiNotes.filter(n => n >= 60);
        const bassMidis = midiNotes.filter(n => n < 60);

        // --- FUNCIÓN HELPER PARA DIBUJAR UNA VOZ ---
        const drawVoice = (midis, clef, stave) => {
            if (midis.length === 0) return; 

            const keys = midis.map(midi => {
                const noteName = this.getNoteName(midi); 
                return `${noteName.slice(0, -1).toLowerCase()}/${noteName.slice(-1)}`;
            });

            // Creamos un Acorde (StaveNote con múltiples keys)
            const staveNote = new VF.StaveNote({ 
                clef: clef, 
                keys: keys, 
                duration: "w", 
                align_center: true
            });

            midis.forEach((midi, index) => {
                const name = this.getNoteName(midi);
                if (name.includes("#")) {
                    staveNote.addModifier(new VF.Accidental("#"), index);
                } else if (name.includes("b")) {
                    staveNote.addModifier(new VF.Accidental("b"), index);
                }
            });

            const voice = new VF.Voice({num_beats: 4, beat_value: 4});
            voice.addTickables([staveNote]);
            
            // Ajustamos el ancho del format para centrar bien
            new VF.Formatter().joinVoices([voice]).format([voice], 300);
            voice.draw(this.ctx, stave);
        };

        // 3. Ejecutar dibujo
        drawVoice(trebleMidis, "treble", trebleStave);
        drawVoice(bassMidis, "bass", bassStave);
    }
}