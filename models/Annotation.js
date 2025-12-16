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

module.exports = mongoose.model('Annotation', AnnotationSchema);