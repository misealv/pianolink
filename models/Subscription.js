/**
 * models/Subscription.js
 * Sistema de Suscripciones - PianoLink v2.0
 * 
 * Controla el acceso del alumno basado en pagos.
 * El Gatekeeper verifica expiresAt antes de permitir acceso.
 */

const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    // Alumno que paga
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Profesor al que le paga
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Proveedor de pago
    paymentProvider: {
        type: String,
        enum: ['mercadopago', 'paypal', 'manual'],
        required: true
    },

    // Estado de la suscripción
    status: {
        type: String,
        enum: ['active', 'expired', 'pending', 'cancelled'],
        default: 'pending'
    },

    // ID externo de la suscripción en el proveedor
    externalSubscriptionId: String,

    // === FECHAS CRÍTICAS ===
    lastPaymentAt: Date,
    
    // ⚠️ GATEKEEPER VERIFICA ESTO
    expiresAt: {
        type: Date,
        required: true
    },

    // Período de gracia después de vencimiento (días)
    gracePeriodDays: {
        type: Number,
        default: 3
    },

    // === MONTO ===
    amount: {
        type: Number,
        required: true
    },

    currency: {
        type: String,
        default: 'ARS'
    },

    // Metadata adicional del proveedor
    providerMetadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
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
subscriptionSchema.index({ studentId: 1, teacherId: 1 });
subscriptionSchema.index({ expiresAt: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ externalSubscriptionId: 1 });

// Actualizar updatedAt en cada save
subscriptionSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

/**
 * ⚠️ MÉTODO CRÍTICO - Usado por Gatekeeper
 * Verifica si la suscripción permite acceso
 */
subscriptionSchema.methods.isValid = function() {
    if (this.status !== 'active') return false;
    
    const now = new Date();
    const expiresWithGrace = new Date(this.expiresAt);
    expiresWithGrace.setDate(expiresWithGrace.getDate() + this.gracePeriodDays);
    
    return now <= expiresWithGrace;
};

/**
 * Extender suscripción por N días (después de pago exitoso)
 */
subscriptionSchema.methods.extend = function(days = 30) {
    const now = new Date();
    
    // Si ya expiró, extender desde hoy
    // Si no, extender desde la fecha de expiración actual
    const baseDate = this.expiresAt > now ? this.expiresAt : now;
    
    this.expiresAt = new Date(baseDate);
    this.expiresAt.setDate(this.expiresAt.getDate() + days);
    this.lastPaymentAt = now;
    this.status = 'active';
    
    return this.save();
};

/**
 * Verificar si un alumno tiene suscripción activa con un profesor
 */
subscriptionSchema.statics.isActiveForStudent = async function(studentId, teacherId) {
    const subscription = await this.findOne({
        studentId,
        teacherId,
        status: 'active'
    });
    
    if (!subscription) return false;
    return subscription.isValid();
};

/**
 * Obtener suscripción activa de un alumno
 */
subscriptionSchema.statics.getActiveSubscription = function(studentId) {
    return this.findOne({
        studentId,
        status: 'active',
        expiresAt: { $gte: new Date() }
    }).populate('teacherId', 'name email');
};

/**
 * Obtener suscripciones por vencer (para notificaciones)
 */
subscriptionSchema.statics.getExpiringSoon = function(days = 5) {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);
    
    return this.find({
        status: 'active',
        expiresAt: { $gte: now, $lte: future }
    }).populate('studentId', 'name email');
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
