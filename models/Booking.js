/* models/Booking.js */
const mongoose = require('mongoose');

/**
 * Registro histórico de reservas.
 * Mantiene el historial completo incluso después de que el TimeSlot cambie.
 */
const bookingSchema = mongoose.Schema({
    // Referencias principales
    slotId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TimeSlot',
        required: true
    },
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null  // Apoderado si aplica
    },
    
    // ==================== SNAPSHOT DE TIEMPO ====================
    // Guardamos copia porque el slot puede ser reutilizado
    scheduledStart: {
        type: Date,
        required: true
    },
    scheduledEnd: {
        type: Date,
        required: true
    },
    duration: {
        type: Number,  // minutos
        required: true
    },
    teacherTimezone: {
        type: String,
        required: true
    },
    studentTimezone: {
        type: String,
        required: true
    },
    
    // ==================== ESTADO LIFECYCLE ====================
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'rescheduled'],
        default: 'pending'
    },
    
    statusHistory: [{
        status: String,
        changedAt: {
            type: Date,
            default: Date.now
        },
        changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        reason: String
    }],
    
    // ==================== CANCELACIÓN ====================
    cancellation: {
        cancelledAt: Date,
        cancelledBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        reason: String,
        refundClasses: {
            type: Boolean,
            default: true
        }
    },
    
    // ==================== CLASE ====================
    classConsumed: {
        type: Boolean,
        default: false  // ¿Se descontó del saldo?
    },
    classType: {
        type: String,
        enum: ['individual', 'group'],
        default: 'individual'
    },
    
    // Para clases grupales
    groupInfo: {
        totalParticipants: Number,
        participantIndex: Number  // Posición de este estudiante en el grupo
    },
    
    // ==================== SESIÓN ====================
    midiSessionId: String,
    
    actualStart: Date,      // Cuando realmente empezó
    actualEnd: Date,        // Cuando realmente terminó
    actualDuration: Number, // Minutos reales
    
    // Métricas de sesión
    sessionMetrics: {
        teacherJoinedAt: Date,
        studentJoinedAt: Date,
        midiEventsCount: Number,
        connectionQuality: String,  // 'excellent', 'good', 'fair', 'poor'
        disconnections: Number
    },
    
    // ==================== FEEDBACK ====================
    studentRating: {
        type: Number,
        min: 1,
        max: 5
    },
    studentFeedback: String,
    
    teacherNotes: String,  // Notas privadas del profesor
    
    // Topics cubiertos en la clase
    topics: [String],
    
    // Tarea asignada
    homework: {
        description: String,
        dueDate: Date,
        completed: Boolean
    },
    
    // ==================== GRABACIÓN ====================
    recording: {
        available: {
            type: Boolean,
            default: false
        },
        url: String,
        duration: Number,
        expiresAt: Date
    },
    
    // ==================== REPROGRAMACIÓN ====================
    rescheduledFrom: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking'
    },
    rescheduledTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking'
    },
    
    // ==================== METADATA ====================
    notes: String,
    tags: [String],
    
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ==================== ÍNDICES ====================
bookingSchema.index({ studentId: 1, scheduledStart: -1 });
bookingSchema.index({ teacherId: 1, scheduledStart: -1 });
bookingSchema.index({ slotId: 1 });
bookingSchema.index({ status: 1, scheduledStart: 1 });
bookingSchema.index({ midiSessionId: 1 });

// ==================== HOOKS ====================
bookingSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    
    // Agregar al historial si el status cambió
    if (this.isModified('status')) {
        this.statusHistory.push({
            status: this.status,
            changedAt: new Date()
        });
    }
    
    next();
});

// ==================== MÉTODOS ====================
bookingSchema.methods.canBeCancelled = function() {
    // Solo se puede cancelar si está pending o confirmed
    // y faltan más de 24h para la clase
    if (!['pending', 'confirmed'].includes(this.status)) {
        return false;
    }
    const hoursUntilClass = (this.scheduledStart - new Date()) / (1000 * 60 * 60);
    return hoursUntilClass > 24;
};

bookingSchema.methods.cancel = function(userId, reason, refundClasses = true) {
    this.status = 'cancelled';
    this.cancellation = {
        cancelledAt: new Date(),
        cancelledBy: userId,
        reason,
        refundClasses
    };
};

bookingSchema.methods.markAsCompleted = function(actualEnd = new Date()) {
    this.status = 'completed';
    this.actualEnd = actualEnd;
    this.actualDuration = Math.round((actualEnd - this.actualStart) / 60000);
    this.classConsumed = true;
};

bookingSchema.methods.markAsNoShow = function(byTeacher = true) {
    this.status = 'no_show';
    this.statusHistory.push({
        status: 'no_show',
        changedAt: new Date(),
        reason: byTeacher ? 'Estudiante no se presentó' : 'Profesor no se presentó'
    });
};

// ==================== STATICS ====================
bookingSchema.statics.getUpcomingForStudent = function(studentId, limit = 10) {
    return this.find({
        studentId,
        status: { $in: ['pending', 'confirmed'] },
        scheduledStart: { $gte: new Date() }
    })
    .sort({ scheduledStart: 1 })
    .limit(limit)
    .populate('teacherId', 'name branding.profilePhotoUrl');
};

bookingSchema.statics.getUpcomingForTeacher = function(teacherId, limit = 10) {
    return this.find({
        teacherId,
        status: { $in: ['pending', 'confirmed'] },
        scheduledStart: { $gte: new Date() }
    })
    .sort({ scheduledStart: 1 })
    .limit(limit)
    .populate('studentId', 'name');
};

bookingSchema.statics.getHistoryForStudent = function(studentId, page = 1, limit = 20) {
    return this.find({
        studentId,
        status: { $in: ['completed', 'cancelled', 'no_show'] }
    })
    .sort({ scheduledStart: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

bookingSchema.statics.countCompletedThisMonth = function(teacherId) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    return this.countDocuments({
        teacherId,
        status: 'completed',
        scheduledStart: { $gte: startOfMonth }
    });
};

module.exports = mongoose.model('Booking', bookingSchema);
