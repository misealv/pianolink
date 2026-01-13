/* models/Annotation.js */
const mongoose = require('mongoose');

const AnnotationSchema = new mongoose.Schema({
    scoreId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Score', 
        required: true 
    },
    page: { 
        type: Number, 
        required: true 
    },
    // Guardamos el objeto JSON completo que genera Fabric.js
    data: { 
        type: Object, 
        required: true 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

// === ÍNDICES PARA PERFORMANCE ===
// Índice compuesto para búsquedas por partitura y página (uso más común)
AnnotationSchema.index({ scoreId: 1, page: 1 });

// Índice para búsqueda por ID de objeto (para borrado individual)
AnnotationSchema.index({ scoreId: 1, "data.id": 1 });

// Índice para limpieza por antigüedad (opcional, para mantenimiento)
AnnotationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 }); // TTL 1 año

module.exports = mongoose.model('Annotation', AnnotationSchema);