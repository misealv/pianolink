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
    
    // Suscripción usada para esta reserva (si aplica)
    subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StudentSubscription',
        default: null
    },
    
    // Nombre del estudiante (útil cuando es un managedStudent embebido)
    studentName: {
        type: String,
        default: ''
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
    
    // ==================== TIPO DE RESERVA ====================
    bookingType: {
        type: String,
        enum: ['regular', 'trial', 'package'],
        default: 'regular'
    },
    
    // ==================== PAGO (para trial y compras directas) ====================
    payment: {
        amountCents: { type: Number, default: 0 },
        currency: { type: String, default: 'USD' },
        stripePaymentIntentId: { type: String },
        stripeSessionId: { type: String },
        status: { 
            type: String, 
            enum: ['pending', 'authorized', 'captured', 'refunded', 'failed'],
            default: 'pending'
        },
        teacherPayoutCents: { type: Number, default: 0 }, // Lo que recibe el profesor
        paidAt: { type: Date }
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
        },
        // Cancelación tardía (<24h)
        isLateCancellation: {
            type: Boolean,
            default: false
        }
    },
    
    // ==================== CLASE ====================
    classConsumed: {
        type: Boolean,
        default: false  // ¿Se descontó del saldo?
    },

    // ==================== SOLICITUD DE RECUPERACIÓN ====================
    // Cuando el estudiante cancela tarde (<24h) o no se presenta,
    // puede solicitar recuperación. El PROFESOR decide.
    recoveryRequest: {
        status: {
            type: String,
            enum: ['none', 'pending', 'approved', 'denied'],
            default: 'none'
        },
        requestedAt: Date,
        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        reason: String,            // Motivo del estudiante
        respondedAt: Date,
        teacherNote: String,       // Nota del profesor al responder
        newBookingId: {            // Si se aprobó y reagendó, referencia a nueva reserva
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Booking'
        }
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
    
    // ==================== CLASE DE PRUEBA (TRIAL) ====================
    trialCompletedAt: Date,      // Cuando el profesor marcó como completada
    trialPendingRating: {        // Pendiente de calificación del estudiante
        type: Boolean,
        default: false
    },
    trialRatedAt: Date,          // Cuando el estudiante calificó
    
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
    
    // ==================== RECORDATORIOS ====================
    reminders: {
        sent24h: { type: Boolean, default: false },
        sent1h: { type: Boolean, default: false },
        sentFollowup: { type: Boolean, default: false }
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
    // Se puede cancelar si está pending o confirmed
    if (!['pending', 'confirmed'].includes(this.status)) {
        return false;
    }
    return true; // Siempre se puede cancelar, pero <24h es "tardía"
};

bookingSchema.methods.isLateCancellation = function() {
    // Devuelve true si faltan menos de 24h para la clase
    const hoursUntilClass = (this.scheduledStart - new Date()) / (1000 * 60 * 60);
    return hoursUntilClass < 24;
};

bookingSchema.methods.cancel = function(userId, reason, refundClasses = true) {
    const isLate = this.isLateCancellation();
    this.status = 'cancelled';
    this.cancellation = {
        cancelledAt: new Date(),
        cancelledBy: userId,
        reason,
        refundClasses: isLate ? false : refundClasses,
        isLateCancellation: isLate
    };
    // Si es cancelación tardía, el estudiante puede solicitar recuperación
    if (isLate) {
        this.recoveryRequest = { status: 'none' };
    }
};

// Solicitar recuperación de clase (estudiante)
bookingSchema.methods.requestRecovery = function(userId, reason) {
    if (!['cancelled', 'no_show'].includes(this.status)) {
        throw new Error('INVALID_STATUS_FOR_RECOVERY');
    }
    if (this.recoveryRequest?.status === 'pending') {
        throw new Error('RECOVERY_ALREADY_REQUESTED');
    }
    if (this.recoveryRequest?.status === 'approved') {
        throw new Error('RECOVERY_ALREADY_APPROVED');
    }
    this.recoveryRequest = {
        status: 'pending',
        requestedAt: new Date(),
        requestedBy: userId,
        reason
    };
};

// Responder a solicitud de recuperación (profesor)
bookingSchema.methods.respondRecovery = function(approved, teacherNote = '') {
    if (this.recoveryRequest?.status !== 'pending') {
        throw new Error('NO_PENDING_RECOVERY');
    }
    this.recoveryRequest.status = approved ? 'approved' : 'denied';
    this.recoveryRequest.respondedAt = new Date();
    this.recoveryRequest.teacherNote = teacherNote;
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
