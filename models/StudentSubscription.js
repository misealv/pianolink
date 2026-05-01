/**
 * models/StudentSubscription.js
 * Suscripción activa de un estudiante a un profesor
 * 
 * Contiene el estado de clases, escrow financiero y configuración de renovación.
 * Un estudiante puede tener múltiples suscripciones con diferentes profesores.
 */

const mongoose = require('mongoose');

const studentSubscriptionSchema = new mongoose.Schema({
    // === PARTES ===
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
    packageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TeacherPackage',
        required: true
    },

    // Categoría heredada del paquete (para filtros rápidos)
    category: {
        type: String,
        default: 'piano'
    },

    // === ESTADO DE CLASES ===
    classesTotal: {
        type: Number,
        required: true
    },
    classesRemaining: {
        type: Number,
        required: true
    },
    classesCompleted: {
        type: Number,
        default: 0
    },
    // No-shows del estudiante (consumidas sin clase)
    classesCancelledByStudent: {
        type: Number,
        default: 0
    },
    // No-shows del profesor (devueltas + compensación)
    classesCancelledByTeacher: {
        type: Number,
        default: 0
    },
    // Clases extra que el profesor debe por no-shows
    compensationClassesOwed: {
        type: Number,
        default: 0
    },

    // === FINANCIERO (ESCROW) - en centavos USD ===
    totalPaidUSD: {
        type: Number,
        default: 0
    },
    escrowBalanceUSD: {
        type: Number,
        default: 0  // Dinero pendiente de liberar
    },
    releasedToTeacherUSD: {
        type: Number,
        default: 0  // Ya pagado al profesor (80%)
    },
    platformFeeCollectedUSD: {
        type: Number,
        default: 0  // Comisión PianoLink cobrada (20%)
    },

    // === BILLING / COBRO RECURRENTE ===
    billingCycleDays: {
        type: Number,
        default: 30
    },
    nextBillingDate: {
        type: Date
    },
    autoRenew: {
        type: Boolean,
        default: true
    },
    // Token de pago para cobro automático
    paymentMethodToken: {
        type: String,
        default: ''
    },
    paymentProvider: {
        type: String,
        enum: ['mercadopago', 'stripe', 'paypal', 'manual'],
        default: 'mercadopago'
    },
    // ID de la suscripción en el proveedor (si usa preapproval)
    externalSubscriptionId: {
        type: String,
        default: ''
    },

    // === ESTADO ===
    status: {
        type: String,
        enum: [
            'pending',      // Pago pendiente
            'active',       // Activa con clases disponibles
            'paused',       // Pausada temporalmente
            'exhausted',    // Sin clases, pendiente renovación
            'cancelled',    // Cancelada por usuario
            'transferred'   // Transferida a otro profesor
        ],
        default: 'pending',
        index: true
    },
    pausedReason: {
        type: String,
        default: ''
    },
    pausedAt: {
        type: Date
    },

    // Si se transfirió a otro profesor (protección al estudiante)
    transferredToTeacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    transferredFromSubscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StudentSubscription',
        default: null
    },
    transferReason: {
        type: String,
        default: ''
    },

    // === TRIAL ===
    isTrialConversion: {
        type: Boolean,
        default: false  // Si viene de una clase de prueba (WelcomeKit)
    },
    welcomeKitId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WelcomeKit',
        default: null
    },

    // === FECHAS ===
    startsAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        required: true
    },

    // Historial de cambios de estado
    statusHistory: [{
        status: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reason: String
    }]
}, {
    timestamps: true
});

// Índices compuestos
studentSubscriptionSchema.index({ studentId: 1, status: 1 });
studentSubscriptionSchema.index({ teacherId: 1, status: 1 });
studentSubscriptionSchema.index({ status: 1, expiresAt: 1 });
studentSubscriptionSchema.index({ autoRenew: 1, nextBillingDate: 1 });

// Virtual: ¿Tiene clases disponibles?
studentSubscriptionSchema.virtual('hasClassesAvailable').get(function() {
    return this.classesRemaining > 0 && this.status === 'active';
});

// Virtual: Total de clases consumidas (incluyendo no-shows)
studentSubscriptionSchema.virtual('classesConsumed').get(function() {
    return this.classesCompleted + this.classesCancelledByStudent;
});

// Método: Consumir una clase
studentSubscriptionSchema.methods.consumeClass = async function(reason = 'completed') {
    if (this.classesRemaining <= 0) {
        throw new Error('No hay clases disponibles');
    }
    
    this.classesRemaining -= 1;
    
    if (reason === 'completed') {
        this.classesCompleted += 1;
    } else if (reason === 'student-noshow') {
        this.classesCancelledByStudent += 1;
    }
    
    // Si se agotaron las clases
    if (this.classesRemaining === 0 && this.status === 'active') {
        this.status = 'exhausted';
        this.statusHistory.push({
            status: 'exhausted',
            reason: 'Clases agotadas'
        });
    }
    
    return this.save();
};

// Método: Devolver una clase (por no-show del profesor)
studentSubscriptionSchema.methods.refundClass = async function(addCompensation = true) {
    this.classesRemaining += 1;
    this.classesCancelledByTeacher += 1;
    
    if (addCompensation) {
        this.compensationClassesOwed += 1;
    }
    
    // Si estaba agotada, reactivar
    if (this.status === 'exhausted') {
        this.status = 'active';
        this.statusHistory.push({
            status: 'active',
            reason: 'Clase devuelta por no-show del profesor'
        });
    }
    
    return this.save();
};

// Método: Renovar suscripción
studentSubscriptionSchema.methods.renew = async function(packageData) {
    this.classesTotal = packageData.classCount;
    this.classesRemaining += packageData.classCount;
    this.totalPaidUSD += packageData.priceUSD;
    this.escrowBalanceUSD += packageData.priceUSD;
    this.status = 'active';
    
    // Extender fecha de expiración
    const now = new Date();
    this.expiresAt = new Date(now.getTime() + (packageData.validityDays * 24 * 60 * 60 * 1000));
    this.nextBillingDate = new Date(now.getTime() + (this.billingCycleDays * 24 * 60 * 60 * 1000));
    
    this.statusHistory.push({
        status: 'active',
        reason: `Renovación automática: +${packageData.classCount} clases`
    });
    
    return this.save();
};

module.exports = mongoose.model('StudentSubscription', studentSubscriptionSchema);
