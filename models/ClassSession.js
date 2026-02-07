/**
 * models/ClassSession.js
 * Registro de cada clase individual para validación y pago
 * 
 * Se crea al completar un Booking y requiere validación antes de pagar al profesor.
 * Implementa ventana de disputa y auditoría financiera completa.
 */

const mongoose = require('mongoose');

const classSessionSchema = new mongoose.Schema({
    // === REFERENCIAS ===
    subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StudentSubscription',
        required: true,
        index: true
    },
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true
    },
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // === TIEMPOS ===
    scheduledAt: {
        type: Date,
        required: true
    },
    startedAt: {
        type: Date
    },
    endedAt: {
        type: Date
    },
    durationMinutes: {
        type: Number,
        default: 0
    },

    // === ESTADO DE LA CLASE ===
    status: {
        type: String,
        enum: [
            'scheduled',      // Programada
            'in-progress',    // En curso
            'pending-validation', // Terminada, esperando confirmación
            'completed',      // Validada por ambos
            'student-noshow', // Estudiante no apareció
            'teacher-noshow', // Profesor no apareció
            'disputed',       // En disputa
            'cancelled',      // Cancelada
            'rescheduled'     // Reagendada
        ],
        default: 'scheduled',
        index: true
    },

    // === VALIDACIÓN ===
    teacherMarkedComplete: {
        type: Boolean,
        default: false
    },
    teacherMarkedAt: {
        type: Date
    },
    studentConfirmed: {
        type: Boolean,
        default: false
    },
    studentConfirmedAt: {
        type: Date
    },
    // Confirmación automática si estudiante no responde en X horas
    autoConfirmAt: {
        type: Date
    },
    validatedAt: {
        type: Date
    },
    validatedBy: {
        type: String,
        enum: ['teacher', 'student', 'auto', 'admin']
    },

    // === DISPUTA ===
    dispute: {
        isDisputed: { type: Boolean, default: false },
        raisedBy: { 
            type: String, 
            enum: ['student', 'teacher']
        },
        raisedAt: { type: Date },
        reason: { type: String, default: '' },
        // Resolución
        resolvedAt: { type: Date },
        resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        resolution: { 
            type: String, 
            enum: ['student-favor', 'teacher-favor', 'split', 'void']
        },
        resolutionNotes: { type: String, default: '' }
    },
    // Ventana de disputa (48 horas por defecto)
    disputeWindowEndsAt: {
        type: Date
    },

    // === FINANCIERO (en centavos USD) ===
    pricePerClassUSD: {
        type: Number,
        required: true
    },
    teacherPayoutUSD: {
        type: Number,
        required: true  // 80% del precio
    },
    platformFeeUSD: {
        type: Number,
        required: true  // 20% del precio
    },

    // Estado del pago al profesor
    payoutStatus: {
        type: String,
        enum: ['pending', 'included-in-batch', 'paid', 'withheld', 'void'],
        default: 'pending',
        index: true
    },
    payoutBatchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TeacherPayout',
        default: null
    },

    // === NOTAS Y FEEDBACK ===
    teacherNotes: {
        type: String,
        default: ''
    },
    studentNotes: {
        type: String,
        default: ''
    },
    studentRating: {
        type: Number,
        min: 1,
        max: 5,
        default: null
    },
    studentFeedback: {
        type: String,
        default: ''
    },

    // === METADATA ===
    category: {
        type: String,
        default: 'piano'
    },
    isCompensation: {
        type: Boolean,
        default: false  // Si es clase de compensación por no-show previo
    }
}, {
    timestamps: true
});

// Índices
classSessionSchema.index({ status: 1, scheduledAt: 1 });
classSessionSchema.index({ teacherId: 1, payoutStatus: 1 });
classSessionSchema.index({ disputeWindowEndsAt: 1, status: 1 });

// Virtual: ¿Está en ventana de disputa?
classSessionSchema.virtual('isInDisputeWindow').get(function() {
    if (!this.disputeWindowEndsAt) return false;
    return new Date() < this.disputeWindowEndsAt;
});

// Virtual: ¿Puede ser pagada?
classSessionSchema.virtual('isPayable').get(function() {
    return (
        this.status === 'completed' && 
        this.payoutStatus === 'pending' &&
        !this.dispute.isDisputed &&
        (!this.disputeWindowEndsAt || new Date() >= this.disputeWindowEndsAt)
    );
});

// Método: Profesor marca como completada
classSessionSchema.methods.teacherMarkComplete = async function(notes = '') {
    this.teacherMarkedComplete = true;
    this.teacherMarkedAt = new Date();
    this.teacherNotes = notes;
    this.status = 'pending-validation';
    
    // Confirmación automática en 48 horas si estudiante no responde
    const autoConfirmHours = 48;
    this.autoConfirmAt = new Date(Date.now() + autoConfirmHours * 60 * 60 * 1000);
    
    // Ventana de disputa: 48 horas después de auto-confirmación
    this.disputeWindowEndsAt = new Date(this.autoConfirmAt.getTime() + 48 * 60 * 60 * 1000);
    
    return this.save();
};

// Método: Estudiante confirma
classSessionSchema.methods.studentConfirm = async function(rating = null, feedback = '') {
    this.studentConfirmed = true;
    this.studentConfirmedAt = new Date();
    this.validatedAt = new Date();
    this.validatedBy = 'student';
    this.status = 'completed';
    
    if (rating) this.studentRating = rating;
    if (feedback) this.studentFeedback = feedback;
    
    return this.save();
};

// Método: Auto-confirmar (cron job)
classSessionSchema.methods.autoConfirm = async function() {
    if (this.status !== 'pending-validation') return this;
    
    this.studentConfirmed = true;
    this.studentConfirmedAt = new Date();
    this.validatedAt = new Date();
    this.validatedBy = 'auto';
    this.status = 'completed';
    
    return this.save();
};

// Método: Abrir disputa
classSessionSchema.methods.openDispute = async function(raisedBy, reason) {
    if (!this.isInDisputeWindow && this.status !== 'pending-validation') {
        throw new Error('Fuera de ventana de disputa');
    }
    
    this.dispute.isDisputed = true;
    this.dispute.raisedBy = raisedBy;
    this.dispute.raisedAt = new Date();
    this.dispute.reason = reason;
    this.status = 'disputed';
    this.payoutStatus = 'withheld';
    
    return this.save();
};

// Método: Resolver disputa (admin)
classSessionSchema.methods.resolveDispute = async function(adminId, resolution, notes = '') {
    this.dispute.resolvedAt = new Date();
    this.dispute.resolvedBy = adminId;
    this.dispute.resolution = resolution;
    this.dispute.resolutionNotes = notes;
    
    if (resolution === 'teacher-favor') {
        this.status = 'completed';
        this.payoutStatus = 'pending';
    } else if (resolution === 'student-favor') {
        this.status = 'cancelled';
        this.payoutStatus = 'void';
        // TODO: Devolver clase al estudiante
    } else if (resolution === 'void') {
        this.status = 'cancelled';
        this.payoutStatus = 'void';
    }
    
    return this.save();
};

// Método estático: Marcar no-show del estudiante
classSessionSchema.statics.markStudentNoShow = async function(sessionId, teacherId) {
    const session = await this.findById(sessionId);
    if (!session) throw new Error('Sesión no encontrada');
    if (session.teacherId.toString() !== teacherId.toString()) {
        throw new Error('No autorizado');
    }
    
    session.status = 'student-noshow';
    session.validatedAt = new Date();
    session.validatedBy = 'teacher';
    // El profesor cobra igual por no-show del estudiante
    session.payoutStatus = 'pending';
    
    return session.save();
};

// Método estático: Marcar no-show del profesor
classSessionSchema.statics.markTeacherNoShow = async function(sessionId, studentId) {
    const session = await this.findById(sessionId);
    if (!session) throw new Error('Sesión no encontrada');
    if (session.studentId.toString() !== studentId.toString()) {
        throw new Error('No autorizado');
    }
    
    session.status = 'teacher-noshow';
    session.validatedAt = new Date();
    session.validatedBy = 'student';
    // El profesor NO cobra y debe compensar
    session.payoutStatus = 'void';
    
    // Devolver clase + compensación a la suscripción
    const StudentSubscription = mongoose.model('StudentSubscription');
    const subscription = await StudentSubscription.findById(session.subscriptionId);
    if (subscription) {
        await subscription.refundClass(true);
    }
    
    return session.save();
};

module.exports = mongoose.model('ClassSession', classSessionSchema);
