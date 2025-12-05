// src/view.js

// NOTA: No importamos Vex aquí porque usamos la versión global del HTML (window.Vex)

export function renderizarInterfaz() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="controls" style="margin-bottom: 20px;">
            <button id="btn-grabar" style="font-size: 1.2rem; padding: 10px 20px;">🔴 Grabar</button>
            <button id="btn-parar" disabled style="font-size: 1.2rem; padding: 10px 20px;">⬛ Detener</button>
            <span id="status" style="margin-left: 10px;">Listo para tocar</span>
        </div>
        <div id="visor-notas" style="background: white; padding: 10px; border: 1px solid #ccc; min-height: 150px; display: flex; justify-content: center;"></div>
    `;
}

export function setEstadoGrabacion(grabando) {
    const btnGrabar = document.getElementById('btn-grabar');
    const btnParar = document.getElementById('btn-parar');
    const status = document.getElementById('status');

    if (grabando) {
        btnGrabar.disabled = true;
        btnParar.disabled = false;
        status.textContent = "Grabando... (Toca tu piano)";
        status.style.color = "red";
    } else {
        btnGrabar.disabled = false;
        btnParar.disabled = true;
        status.textContent = "Grabación detenida";
        status.style.color = "black";
    }
}

// --- LÓGICA DE PARTITURA (VexFlow Mejorada) ---

export function actualizarPartitura(notas) {
    // 1. Limpiar el lienzo anterior
    const div = document.getElementById("visor-notas");
    div.innerHTML = ""; 

    // 2. Preparar VexFlow
    const { Factory } = Vex.Flow;
    // Creamos el renderer con un tamaño fijo por ahora
    const vf = new Factory({ renderer: { elementId: 'visor-notas', width: 500, height: 200 } });
    const score = vf.EasyScore();
    const system = vf.System();

    // 3. Lógica de dibujo
    if (notas.length === 0) {
        // A) Si no hay notas, dibujamos un compás de silencio para que se vea el pentagrama
        system.addStave({
            voices: [score.voice(score.notes('b4/1/r', { stem: 'up' }))] // /1/r significa Redonda de silencio (rest)
        }).addClef('treble').addTimeSignature('4/4');
        
        vf.draw();
        return;
    }

    // B) Si HAY notas, las convertimos al formato que VexFlow ama
    // Tomamos máximo las últimas 8 notas para que no se desborde el compás
    const notasRecientes = notas.slice(-8); 

    // Convertimos [ {midi: 60}, {midi: 62} ]  --->  "C4/q, D4/q"
    // Usamos "/q" (quarter/negra) por defecto para todo por ahora
    const stringDeNotas = notasRecientes
        .map(n => {
            const nombre = midiAString(n.midi);
            return `${nombre}/q`; 
        })
        .join(", ");

    try {
        // Dibujamos las notas
        system.addStave({
            voices: [
                score.voice(score.notes(stringDeNotas, { stem: 'up' }))
            ]
        }).addClef('treble'); // Puedes agregar .addTimeSignature('4/4') si quieres ver el 4/4

        vf.draw();
    } catch (error) {
        console.error("Error dibujando VexFlow:", error);
        div.innerHTML = "<p style='color:red'>Error al dibujar nota (Revisa consola)</p>";
    }
}

// Función auxiliar: Convierte 60 -> "C4", 61 -> "C#4"
function midiAString(midi) {
    const notas = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const octava = Math.floor(midi / 12) - 1;
    const nombreNota = notas[midi % 12];
    
    // VexFlow prefiere formato "C4", "C#4", etc.
    return nombreNota + octava;
}