// ESTADO: Aquí guardamos los datos de la canción
export const leccion = {
    meta: {
        tempo: 120,
        titulo: "Nueva Grabación"
    },
    notas: [] // Aquí se guardarán las notas: {midi, tiempo, duracion}
};

export function guardarNota(nota) {
    leccion.notas.push(nota);
    console.log("Nota guardada:", nota);
}

export function limpiarNotas() {
    leccion.notas = [];
}