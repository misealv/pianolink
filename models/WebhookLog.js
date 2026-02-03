/**
 * models/WebhookLog.js
 * Log de todos los webhooks recibidos - PianoLink v2.0
 * 
 * Guarda TODOS los webhooks (válidos e inválidos) para auditoría.
 * Útil para debugging y detectar ataques.
 */

const mongoose = require('mongoose');

const webhookLogSchema = new mongoose.Schema({
    // Proveedor
    provider: {
        type: String,
        enum: ['mercadopago', 'paypal', 'unknown'],
        required: true
    },

    // Endpoint que recibió el webhook
    endpoint: {
        type: String,
        required: true
    },

    // === REQUEST DATA ===
    headers: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    body: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    queryParams: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    // === VALIDACIÓN ===
    signatureReceived: String,
    signatureCalculated: String,
    signatureValid: Boolean,

    timestampReceived: Date,
    timestampValid: Boolean,

    // === PROCESAMIENTO ===
    processed: {
        type: Boolean,
        default: false
    },

    processingResult: {
        type: String,
        enum: ['success', 'failed', 'skipped', 'duplicate'],
        default: 'skipped'
    },

    processingError: String,

    // Pago creado (si fue exitoso)
    paymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payment'
    },

    // === META ===
    ipAddress: String,
    userAgent: String,

    createdAt: {
        type: Date,
        default: Date.now,
        expires: 60 * 60 * 24 * 90  // TTL: 90 días auto-delete
    }
});

// Índices
webhookLogSchema.index({ provider: 1, createdAt: -1 });
webhookLogSchema.index({ signatureValid: 1, createdAt: -1 });
webhookLogSchema.index({ processingResult: 1 });
webhookLogSchema.index({ ipAddress: 1, createdAt: -1 });

// Obtener webhooks sospechosos (firmas inválidas de la misma IP)
webhookLogSchema.statics.getSuspiciousActivity = async function(hours = 24) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);
    
    return this.aggregate([
        {
            $match: {
                signatureValid: false,
                createdAt: { $gte: cutoff }
            }
        },
        {
            $group: {
                _id: '$ipAddress',
                count: { $sum: 1 },
                lastAttempt: { $max: '$createdAt' }
            }
        },
        {
            $match: { count: { $gte: 3 } }  // 3+ intentos fallidos
        },
        {
            $sort: { count: -1 }
        }
    ]);
};

// Estadísticas de webhooks
webhookLogSchema.statics.getStats = async function(hours = 24) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);
    
    return this.aggregate([
        {
            $match: { createdAt: { $gte: cutoff } }
        },
        {
            $group: {
                _id: {
                    provider: '$provider',
                    result: '$processingResult'
                },
                count: { $sum: 1 }
            }
        }
    ]);
};

module.exports = mongoose.model('WebhookLog', webhookLogSchema);
