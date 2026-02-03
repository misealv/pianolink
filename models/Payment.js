/**
 * models/Payment.js
 * Historial de Pagos - PianoLink v2.0
 * 
 * Registra cada transacción para auditoría y contabilidad.
 */

const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    // Suscripción asociada
    subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription',
        required: true
    },

    // Proveedor de pago
    provider: {
        type: String,
        enum: ['mercadopago', 'paypal', 'manual'],
        required: true
    },

    // ID de la transacción en el proveedor
    externalPaymentId: {
        type: String,
        required: true
    },

    // Monto
    amount: {
        type: Number,
        required: true
    },

    currency: {
        type: String,
        default: 'ARS'
    },

    // Estado del pago
    status: {
        type: String,
        enum: ['approved', 'pending', 'rejected', 'refunded', 'cancelled'],
        required: true
    },

    // === SEGURIDAD - Guardar todo para auditoría ===
    webhookData: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    // Firma recibida del webhook
    webhookSignature: String,

    // ¿Pasó validación de firma?
    signatureValid: {
        type: Boolean,
        default: false
    },

    // Timestamp del webhook vs timestamp validado
    webhookTimestamp: Date,
    timestampValid: Boolean,

    // === VERIFICACIÓN API ===
    apiVerified: {
        type: Boolean,
        default: false
    },
    
    apiResponse: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    // Errores de procesamiento
    processingError: String,

    // IP del webhook (para detectar ataques)
    sourceIp: String,

    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Índices
paymentSchema.index({ subscriptionId: 1 });
paymentSchema.index({ externalPaymentId: 1 }, { unique: true });
paymentSchema.index({ provider: 1, status: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ signatureValid: 1 });

// Obtener historial de pagos de una suscripción
paymentSchema.statics.getBySubscription = function(subscriptionId) {
    return this.find({ subscriptionId }).sort({ createdAt: -1 });
};

// Obtener pagos fallidos (posibles ataques)
paymentSchema.statics.getInvalidSignatures = function(hours = 24) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);
    
    return this.find({
        signatureValid: false,
        createdAt: { $gte: cutoff }
    }).sort({ createdAt: -1 });
};

// Verificar si un pago ya fue procesado (evitar duplicados)
paymentSchema.statics.alreadyProcessed = async function(externalPaymentId) {
    const existing = await this.findOne({ externalPaymentId });
    return !!existing;
};

module.exports = mongoose.model('Payment', paymentSchema);
