/**
 * DiagnosticAudit.js - Modelo para Auditoría de Diagnóstico
 * 
 * Guarda sesiones de auditoría completas con todos los eventos
 * capturados durante una clase/sesión de PianoLink
 */

const mongoose = require('mongoose');

// Esquema para eventos individuales dentro de una auditoría
const DiagnosticEventSchema = new mongoose.Schema({
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
            'connection',      // Conexiones/desconexiones de socket
            'midi',            // Mensajes MIDI
            'room',            // Eventos de sala (crear, unirse, salir)
            'audio',           // Eventos de audio/video
            'error',           // Errores
            'performance',     // Métricas de performance
            'user',            // Acciones de usuario
            'network',         // Latencia, pérdida de paquetes
            'system'           // Eventos del sistema
        ],
        required: true
    },
    
    // Tipo específico de evento
    type: {
        type: String,
        required: true
        // Ejemplos: 'socket_connect', 'midi_note_on', 'room_join', etc.
    },
    
    // Datos del evento (flexibles según tipo)
    data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    
    // Usuario relacionado (si aplica)
    userId: {
        type: String
    },
    
    // Socket ID relacionado
    socketId: {
        type: String
    },
    
    // Sala relacionada
    roomCode: {
        type: String
    },
    
    // Severidad del evento
    severity: {
        type: String,
        enum: ['debug', 'info', 'warning', 'error', 'critical'],
        default: 'info'
    },
    
    // Latencia medida (si aplica)
    latencyMs: {
        type: Number
    },
    
    // Tamaño en bytes (si aplica, para MIDI bundles, etc.)
    sizeBytes: {
        type: Number
    }
}, { _id: false }); // Sin _id individual para optimizar espacio

// Esquema principal de Auditoría
const DiagnosticAuditSchema = new mongoose.Schema({
    // ID de la sesión de auditoría
    auditId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    
    // Estado de la auditoría
    status: {
        type: String,
        enum: ['active', 'completed', 'archived'],
        default: 'active'
    },
    
    // Quién activó la auditoría
    activatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // Timestamps
    startedAt: {
        type: Date,
        default: Date.now
    },
    
    endedAt: {
        type: Date
    },
    
    // Duración en segundos
    durationSeconds: {
        type: Number
    },
    
    // Configuración de qué capturar
    captureConfig: {
        midi: { type: Boolean, default: true },
        connections: { type: Boolean, default: true },
        rooms: { type: Boolean, default: true },
        errors: { type: Boolean, default: true },
        performance: { type: Boolean, default: true },
        network: { type: Boolean, default: true },
        userActions: { type: Boolean, default: true },
        audio: { type: Boolean, default: true }
    },
    
    // Filtros aplicados
    filters: {
        roomCodes: [String],        // Solo estas salas (vacío = todas)
        userIds: [String],          // Solo estos usuarios (vacío = todos)
        minSeverity: {              // Severidad mínima a capturar
            type: String,
            enum: ['debug', 'info', 'warning', 'error', 'critical'],
            default: 'debug'
        }
    },
    
    // Resumen de la auditoría
    summary: {
        totalEvents: { type: Number, default: 0 },
        eventsByCategory: { type: Map, of: Number, default: {} },
        eventsBySeverity: { type: Map, of: Number, default: {} },
        uniqueUsers: { type: Number, default: 0 },
        uniqueRooms: { type: Number, default: 0 },
        errorCount: { type: Number, default: 0 },
        avgLatencyMs: { type: Number, default: 0 },
        maxLatencyMs: { type: Number, default: 0 },
        midiMessagesTotal: { type: Number, default: 0 },
        reconnections: { type: Number, default: 0 },
        peakConnections: { type: Number, default: 0 }
    },
    
    // Eventos capturados (array embebido para auditorías cortas)
    // Para auditorías largas, se usa la colección separada
    events: [DiagnosticEventSchema],
    
    // Si hay demasiados eventos, se guardan en colección separada
    eventsOverflow: {
        type: Boolean,
        default: false
    },
    
    // Notas del administrador
    notes: {
        type: String
    },
    
    // Tags para búsqueda
    tags: [String],
    
    // Snapshot del estado del servidor al inicio
    serverSnapshot: {
        nodeVersion: String,
        platform: String,
        memoryMB: Number,
        uptime: Number,
        activeConnections: Number,
        activeRooms: Number
    }
}, {
    timestamps: true,
    collection: 'diagnostic_audits'
});

// Índices para búsqueda eficiente
DiagnosticAuditSchema.index({ status: 1, startedAt: -1 });
DiagnosticAuditSchema.index({ 'events.timestamp': 1 });
DiagnosticAuditSchema.index({ 'events.category': 1 });
DiagnosticAuditSchema.index({ tags: 1 });

// Límite de eventos embebidos antes de overflow
DiagnosticAuditSchema.statics.MAX_EMBEDDED_EVENTS = 10000;

module.exports = mongoose.model('DiagnosticAudit', DiagnosticAuditSchema);
