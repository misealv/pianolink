/**
 * models/Room.js
 * Modelo de Sala Persistente - PianoLink v2.0
 * 
 * La sala es el recurso central que persiste en la DB.
 * Guarda la biblioteca de PDFs y el estado actual.
 */

const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    // Código único de 4 caracteres (ABCD)
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        minlength: 4,
        maxlength: 6
    },

    // Profesor dueño de la sala
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Nombre descriptivo
    name: {
        type: String,
        default: 'Mi Sala de Piano'
    },

    // === BIBLIOTECA DE PDFs ===
    library: [{
        filename: String,
        url: String,              // URL de Cloudinary
        publicId: String,         // ID de Cloudinary para borrar
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        uploadedAt: {
            type: Date,
            default: Date.now
        },
        metadata: {
            pages: Number,
            size: Number
        }
    }],

    // === ESTADO ACTUAL (se sincroniza) ===
    currentPDF: {
        pdfId: String,            // ID del PDF en library
        url: String,
        page: {
            type: Number,
            default: 1
        },
        scrollPosition: {
            type: Number,
            default: 0
        },
        loadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        loadedAt: Date
    },

    // Estado del piano (para reconexiones)
    pianoState: {
        activeNotes: {
            type: [Number],
            default: []
        },
        broadcaster: String,      // socketId del broadcaster actual
        settings: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        }
    },

    // === CONFIGURACIÓN ===
    settings: {
        allowGuestAccess: {
            type: Boolean,
            default: true         // Permitir invitados cuando el profe está
        },
        autoSyncPDF: {
            type: Boolean,
            default: true         // Sincronizar PDF automáticamente
        },
        theme: {
            type: String,
            default: 'dark'
        }
    },

    // === ESTADO EN TIEMPO REAL ===
    isLive: {
        type: Boolean,
        default: false            // true = profesor conectado ahora
    },

    // Para cron job de limpieza
    lastActivityAt: {
        type: Date,
        default: Date.now
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Índices para búsquedas eficientes
roomSchema.index({ code: 1 });
roomSchema.index({ teacherId: 1 });
roomSchema.index({ lastActivityAt: 1 });
roomSchema.index({ isLive: 1 });

// Método para actualizar actividad
roomSchema.methods.updateActivity = function() {
    this.lastActivityAt = new Date();
    return this.save();
};

// Método para limpiar estado temporal (cron job)
roomSchema.methods.cleanupState = function() {
    this.pianoState = { activeNotes: [], broadcaster: null, settings: {} };
    this.currentPDF = {};
    return this.save();
};

// Statics para queries comunes
roomSchema.statics.findByCode = function(code) {
    return this.findOne({ code: code.toUpperCase() });
};

roomSchema.statics.findByTeacher = function(teacherId) {
    return this.findOne({ teacherId });
};

roomSchema.statics.getInactiveRooms = function(days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return this.find({
        lastActivityAt: { $lt: cutoffDate },
        isLive: false
    });
};

module.exports = mongoose.model('Room', roomSchema);
