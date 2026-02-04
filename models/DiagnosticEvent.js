/**
 * DiagnosticEvent.js - Modelo para Eventos de Diagnóstico (Overflow)
 * 
 * Cuando una auditoría tiene más de 10,000 eventos, se guardan aquí
 * en lugar de embebidos en el documento principal
 */

const mongoose = require('mongoose');

const DiagnosticEventSchema = new mongoose.Schema({
    // Referencia a la auditoría padre
    auditId: {
        type: String,
        required: true,
        index: true
    },
    
    // Timestamp del evento
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    
    // Categoría del evento
    category: {
        type: String,
        enum: [
            'connection',
            'midi',
            'room',
            'audio',
            'error',
            'performance',
            'user',
            'network',
            'system'
        ],
        required: true,
        index: true
    },
    
    // Tipo específico
    type: {
        type: String,
        required: true,
        index: true
    },
    
    // Datos del evento
    data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    
    // Usuario relacionado
    userId: String,
    
    // Socket ID
    socketId: String,
    
    // Sala
    roomCode: {
        type: String,
        index: true
    },
    
    // Severidad
    severity: {
        type: String,
        enum: ['debug', 'info', 'warning', 'error', 'critical'],
        default: 'info',
        index: true
    },
    
    // Métricas opcionales
    latencyMs: Number,
    sizeBytes: Number
}, {
    timestamps: false, // Usamos timestamp propio
    collection: 'diagnostic_events'
});

// Índice compuesto para consultas eficientes
DiagnosticEventSchema.index({ auditId: 1, timestamp: 1 });
DiagnosticEventSchema.index({ auditId: 1, category: 1, timestamp: 1 });

// TTL: Eliminar eventos después de 30 días
DiagnosticEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('DiagnosticEvent', DiagnosticEventSchema);
