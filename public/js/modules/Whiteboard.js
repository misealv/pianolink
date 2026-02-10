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
        
        // ⚡ FAIL-SAFE: TTL para notas en la partitura (mismo que teclas visuales)
        this.noteTimestamps = new Map(); // { note: timestamp }
        this.noteTimeouts = new Map(); // { note: timeoutId }
        
        // ⏳ TTL configurable (se actualiza vía DecayConfigManager)
        this._whiteboardTTLMs = 8000;
        
        // OPTIMIZACIÓN: Mantener renderer y contexto vivos para evitar recrear SVG
        this.renderer = null;
        this.ctx = null;
        this.lastRenderedNotes = "";
        
        // NUEVO: Contador de frames para debugging
        this.renderCount = 0;
        this.lastRenderTime = 0;
        
        // Inicializar (Dibujamos el Grand Staff vacío al arrancar)
        this.drawEmpty();
    }

    /**
     * Procesa una nota entrante (local o remota)
     */
    handleNote(note, velocity) {
        if (velocity > 0) {
            this.teacherActiveNotes.add(note);
            this.noteTimestamps.set(note, Date.now());
            
            // ⚡ TTL: Auto-limpiar si no llega noteOff (configurable)
            if (this.noteTimeouts.has(note)) {
                clearTimeout(this.noteTimeouts.get(note));
            }
            
            const ttlMs = this._whiteboardTTLMs || 8000;
            const timeout = setTimeout(() => {
                console.warn(`⏱️ [Whiteboard TTL] Nota ${note} liberada de partitura (${ttlMs}ms)`);
                this.teacherActiveNotes.delete(note);
                this.noteTimestamps.delete(note);
                this.noteTimeouts.delete(note);
                this.scheduleRender();
            }, ttlMs);
            
            this.noteTimeouts.set(note, timeout);
            
        } else {
            this.teacherActiveNotes.delete(note);
            this.noteTimestamps.delete(note);
            
            // Limpiar timeout si existe
            if (this.noteTimeouts.has(note)) {
                clearTimeout(this.noteTimeouts.get(note));
                this.noteTimeouts.delete(note);
            }
        }
        this.scheduleRender();
    }

    scheduleRender() {
        if (this.renderTimeout) clearTimeout(this.renderTimeout);
        // OPTIMIZACIÓN: Aumentar debounce de 50ms a 150ms para redes lentas
        // Esto permite acumular eventos antes de renderizar
        this.renderTimeout = setTimeout(() => this.render(), 150); // ⬅️ AUMENTADO
    }

    render() {
        if (typeof Vex === 'undefined' || typeof Tonal === 'undefined') return;

        // Ordenamos las notas de grave a agudo
        const notes = Array.from(this.teacherActiveNotes).sort((a,b) => a-b);
        
        // ⚡ FAIL-SAFE: Detectar cambio drástico de armonía
        const notesKey = notes.join(',');
        if (notesKey !== this.lastRenderedNotes) {
            // Si cambió la armonía, limpiar teclas "pegadas" sospechosas
            if (this.lastRenderedNotes && notes.length > 0) {
                console.log('[Whiteboard] 🔄 Cambio de armonía detectado - Limpiando teclas obsoletas');
                // Llamar al UIManager para limpiar teclas viejas
                if (window.uiManager && typeof window.uiManager.clearStaleKeys === 'function') {
                    window.uiManager.clearStaleKeys();
                }
                
                // ⚡ NUEVO: También limpiar notas obsoletas de la partitura
                this.clearStaleNotes();
            }
        }
        
        // OPTIMIZACIÓN: Evitar re-render si las notas no cambiaron
        if (notesKey === this.lastRenderedNotes) return;
        
        // NUEVO: Logging de performance para debugging
        const now = performance.now();
        if (now - this.lastRenderTime < 100) {
            console.warn(`[Whiteboard] Render rápido detectado (${(now - this.lastRenderTime).toFixed(0)}ms). Posible lag de red.`);
        }
        this.lastRenderTime = now;
        this.renderCount++;
        
        this.lastRenderedNotes = notesKey;

        // 1. Detección de Acordes con limpieza de texto anterior
        const chordDisplayEl = this.chordDisplay;
        if (notes.length > 0) {
            const names = notes.map(n => this.getNoteName(n));
            let chord = Tonal.Chord.detect(names)[0];
            if (!chord && names.length > 2) chord = Tonal.Chord.detect(names.slice(0,3))[0];
            
            // ⚡ FAIL-SAFE: Limpiar texto anterior antes de actualizar
            chordDisplayEl.style.opacity = '0';
            setTimeout(() => {
                chordDisplayEl.innerText = chord ? chord : names.join(" ");
                chordDisplayEl.style.opacity = '1';
            }, 50); // Micro-fade para evitar solapamiento visual
        } else {
            chordDisplayEl.style.opacity = '0';
            setTimeout(() => {
                chordDisplayEl.innerText = "--";
                chordDisplayEl.style.opacity = '1';
            }, 50);
            this.drawEmpty(); // Si no hay notas, dibujamos el pentagrama vacío con llave
            return;
        }

        // 2. Renderizado Visual
        try {
            this.drawGrandStaff(notes);
        } catch (e) {
            console.warn("[Whiteboard] VexFlow render error:", e);
            // FAILSAFE: Si el render falla, limpiar y reintentar en el próximo evento
            this.lastRenderedNotes = "";
        }
    }
    
    // ⚡ NUEVO: Limpieza de notas obsoletas en la partitura
    // Similar a clearStaleKeys() de UIManager pero para el Set de VexFlow
    clearStaleNotes() {
        const now = Date.now();
        let clearedCount = 0;
        
        this.teacherActiveNotes.forEach(note => {
            const timestamp = this.noteTimestamps.get(note) || 0;
            const age = now - timestamp;
            
            // Si la nota lleva más de 2s activa, es sospechosa
            if (age > 2000) {
                console.warn(`🧹 [Whiteboard] Auto-limpieza: Nota ${note} (${age}ms en partitura)`);
                this.teacherActiveNotes.delete(note);
                this.noteTimestamps.delete(note);
                
                // Limpiar timeout asociado
                if (this.noteTimeouts.has(note)) {
                    clearTimeout(this.noteTimeouts.get(note));
                    this.noteTimeouts.delete(note);
                }
                
                clearedCount++;
            }
        });
        
        if (clearedCount > 0) {
            console.log(`✅ [Whiteboard] Limpieza preventiva: ${clearedCount} notas liberadas de partitura`);
            this.scheduleRender(); // Re-dibujar partitura sin las notas obsoletas
        }
    }
    
    // NUEVO: Método de limpieza manual (llamado desde reconciliación)
    forceReleaseNote(note) {
        this.teacherActiveNotes.delete(note);
        this.noteTimestamps.delete(note);
        
        if (this.noteTimeouts.has(note)) {
            clearTimeout(this.noteTimeouts.get(note));
            this.noteTimeouts.delete(note);
        }
        
        this.scheduleRender();
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