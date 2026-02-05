/* models/AvailabilityTemplate.js */
const mongoose = require('mongoose');

/**
 * Plantilla de disponibilidad recurrente del profesor.
 * Define horarios semanales que se convierten en TimeSlots concretos.
 */
const availabilityTemplateSchema = mongoose.Schema({
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    name: {
        type: String,
        default: 'Horario Regular'
    },
    
    // Zona horaria del profesor (para interpretar weeklySlots)
    timezone: {
        type: String,
        required: true,
        default: 'America/Santiago'
    },
    
    // Minutos de colchón entre clases
    bufferMinutes: {
        type: Number,
        default: 10,
        min: 0,
        max: 60
    },
    
    // Duración default de cada slot (minutos)
    defaultDuration: {
        type: Number,
        default: 45,
        min: 15,
        max: 120
    },
    
    // Bloques de disponibilidad semanal
    weeklySlots: [{
        dayOfWeek: {
            type: Number,  // 0=Domingo, 1=Lunes...6=Sábado
            required: true,
            min: 0,
            max: 6
        },
        startTime: {
            type: String,  // "09:00" (hora local del profesor)
            required: true
        },
        endTime: {
            type: String,  // "18:00"
            required: true
        },
        slotDuration: {
            type: Number,  // Override de defaultDuration, null para usar default
            default: null
        },
        maxStudents: {
            type: Number,  // 1=individual, >1=clase grupal
            default: 1,
            min: 1,
            max: 20
        },
        isActive: {
            type: Boolean,
            default: true
        }
    }],
    
    // Fechas específicas bloqueadas (vacaciones, etc.)
    exceptions: [{
        date: {
            type: Date,  // UTC midnight del día bloqueado
            required: true
        },
        reason: {
            type: String,
            default: ''
        },
        isBlocked: {
            type: Boolean,
            default: true
        },
        isFullDay: {
            type: Boolean,
            default: true
        },
        // Si no es día completo, especificar rango bloqueado
        blockedFrom: String,  // "09:00"
        blockedUntil: String  // "12:00"
    }],
    
    // Rango de validez de la plantilla
    validFrom: {
        type: Date,
        default: Date.now
    },
    validUntil: {
        type: Date,
        default: null  // null = indefinido
    },
    
    isActive: {
        type: Boolean,
        default: true
    },
    
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Índices
availabilityTemplateSchema.index({ teacherId: 1, isActive: 1 });

// Pre-save hook
availabilityTemplateSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Métodos virtuales
availabilityTemplateSchema.methods.isDateException = function(date) {
    const dateStr = new Date(date).toISOString().split('T')[0];
    return this.exceptions.some(e => 
        new Date(e.date).toISOString().split('T')[0] === dateStr
    );
};

availabilityTemplateSchema.methods.getSlotsForDay = function(dayOfWeek) {
    return this.weeklySlots.filter(s => s.dayOfWeek === dayOfWeek && s.isActive);
};

module.exports = mongoose.model('AvailabilityTemplate', availabilityTemplateSchema);
