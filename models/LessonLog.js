/**
 * models/LessonLog.js
 * 
 * Bitácora de clases: registro cronológico por alumno.
 * El profesor llena después de cada clase (o como nota libre).
 * El alumno ve las entradas con visibility: 'shared'.
 */
const mongoose = require('mongoose');

const lessonLogSchema = new mongoose.Schema({
    // Relación alumno-profesor
    enrollment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StudentEnrollment',
        required: true,
        index: true
    },

    // Referencias directas para queries rápidas
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Booking asociado (null si es nota libre)
    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        default: null
    },

    // Fecha de la entrada (fecha de la clase o del momento de la nota)
    date: {
        type: Date,
        default: Date.now,
        index: true
    },

    // Tipo de entrada
    type: {
        type: String,
        enum: ['class_notes', 'homework', 'progress', 'general'],
        default: 'class_notes'
    },

    // Temas cubiertos en la clase
    topics: [{
        type: String,
        trim: true
    }],

    // Contenido libre del profesor
    content: {
        type: String,
        default: '',
        maxlength: 2000
    },

    // Tarea asignada
    homework: {
        type: String,
        default: '',
        maxlength: 1000
    },

    // Indicador de progreso
    progress: {
        type: String,
        enum: ['needs_work', 'progressing', 'good', 'excellent', null],
        default: null
    },

    // Visibilidad: ¿el alumno puede ver esta entrada?
    visibility: {
        type: String,
        enum: ['shared', 'teacher_only'],
        default: 'shared'
    }
}, {
    timestamps: true
});

// Índices compuestos para consultas frecuentes
lessonLogSchema.index({ enrollment: 1, date: -1 });
lessonLogSchema.index({ teacher: 1, student: 1, date: -1 });
lessonLogSchema.index({ student: 1, visibility: 1, date: -1 });

module.exports = mongoose.model('LessonLog', lessonLogSchema);
