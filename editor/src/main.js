// src/main.js

// 1. CORRECCIÓN AQUÍ: Importamos 'actualizarPartitura' en vez de la vieja 'actualizarVisualizacion'
import { renderizarInterfaz, setEstadoGrabacion, actualizarPartitura } from './view.js';
import { iniciarAudio, pedirPermisoMIDI, toggleGrabacion } from './audio.js';
import { guardarNota, leccion, limpiarNotas } from './state.js';

document.addEventListener('DOMContentLoaded', async () => {
    renderizarInterfaz();
    
    // Obtenemos referencias a los botones (ahora que existen en el DOM)
    const btnGrabar = document.getElementById('btn-grabar');
    const btnParar = document.getElementById('btn-parar');

    // CONFIGURACIÓN DE LOS BOTONES
    
    btnGrabar.addEventListener('click', async () => {
        await iniciarAudio(); // Activa Tone.js (requerido por navegador)
        limpiarNotas();       // Borra grabación anterior
        toggleGrabacion(true);
        setEstadoGrabacion(true);
        
        // CORRECCIÓN AQUÍ TAMBIÉN: Limpiamos la partitura visualmente al empezar
        actualizarPartitura([]); 
        
        // Escuchamos el MIDI
        pedirPermisoMIDI((nota) => {
            guardarNota(nota);
            // CORRECCIÓN AQUÍ: Llamamos a la nueva función de VexFlow
            actualizarPartitura(leccion.notas);
        });
    });

    btnParar.addEventListener('click', () => {
        toggleGrabacion(false);
        setEstadoGrabacion(false);
    });
});