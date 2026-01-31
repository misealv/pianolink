/**
 * PLBExample.js - Modelo para ejemplos de entrenamiento de PLB
 * 
 * Almacena pares (pregunta, respuesta) que el profesor considera buenos.
 * Estos ejemplos se usan como "few-shot learning" para mejorar las respuestas.
 */

const mongoose = require('mongoose');

const PLBExampleSchema = new mongoose.Schema({
    // Contexto de la conversación (lo que dijo el cliente/alumno)
    context: {
        type: String,
        required: true,
        trim: true
    },
    
    // Respuesta original de PLB (opcional, para análisis)
    originalResponse: {
        type: String,
        trim: true
    },
    
    // Respuesta mejorada por el profesor
    improvedResponse: {
        type: String,
        required: true,
        trim: true
    },
    
    // Email del profesor que hizo la mejora
    teacherEmail: {
        type: String,
        required: true
    },
    
    // Categoría para organizar ejemplos
    category: {
        type: String,
        enum: ['precio', 'comparacion', 'objecion', 'caracteristica', 'fundador', 'otro'],
        default: 'otro'
    },
    
    // Si está activo (para poder desactivar ejemplos malos)
    isActive: {
        type: Boolean,
        default: true
    },
    
    // Contador de veces que se ha usado este ejemplo
    usageCount: {
        type: Number,
        default: 0
    },
    
    // Rating del ejemplo (para ordenar por calidad)
    rating: {
        type: Number,
        default: 5,
        min: 1,
        max: 5
    }
}, {
    timestamps: true
});

// Índices para búsqueda eficiente
PLBExampleSchema.index({ isActive: 1, category: 1 });
PLBExampleSchema.index({ teacherEmail: 1 });
PLBExampleSchema.index({ createdAt: -1 });

// Método estático para obtener ejemplos activos
PLBExampleSchema.statics.getActiveExamples = async function(limit = 10) {
    return this.find({ isActive: true })
        .sort({ rating: -1, usageCount: -1 })
        .limit(limit)
        .select('context improvedResponse category')
        .lean();
};

// Método para incrementar contador de uso
PLBExampleSchema.methods.incrementUsage = async function() {
    this.usageCount += 1;
    return this.save();
};

module.exports = mongoose.model('PLBExample', PLBExampleSchema);
