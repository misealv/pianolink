/**
 * crm/models/CrmInteraction.js
 * Log de interacciones del lead con la plataforma y campañas.
 * Cada acción del usuario genera un registro aquí para análisis.
 */
const mongoose = require('mongoose');

const crmInteractionSchema = new mongoose.Schema({
    // === LEAD ASOCIADO ===
    leadRef: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'CrmLead', 
        required: true,
        index: true
    },

    // === TIPO DE INTERACCIÓN ===
    type: { 
        type: String, 
        enum: [
            'page_view', 'form_start', 'form_submit',
            'email_sent', 'email_open', 'email_click', 'email_bounce', 'email_unsubscribe', 'email_reply',
            'demo_scheduled', 'demo_completed', 'demo_no_show',
            'booking_created', 'booking_completed', 'booking_cancelled',
            'payment_received', 'subscription_created', 'subscription_cancelled',
            'call', 'whatsapp_sent', 'whatsapp_received',
            'note_added', 'status_changed', 'tag_added',
            'ad_click', 'ad_impression'
        ],
        required: true
    },

    // === CANAL ===
    channel: {
        type: String,
        enum: ['web', 'email', 'whatsapp', 'phone', 'in_app', 'ads', 'system'],
        default: 'web'
    },

    // === METADATA CONTEXTUAL ===
    metadata: {
        pageUrl: { type: String, default: '' },
        emailSubject: { type: String, default: '' },
        emailSequenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'CrmSequence', default: null },
        emailStepNumber: { type: Number, default: null },
        bookingId: { type: mongoose.Schema.Types.ObjectId, default: null },
        paymentAmount: { type: Number, default: null },       // Centavos
        paymentCurrency: { type: String, default: '' },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'CrmCampaign', default: null },
        notes: { type: String, default: '' },
        duration: { type: Number, default: null },             // Segundos (calls/demos)
        userAgent: { type: String, default: '' },
        ipHash: { type: String, default: '' }                  // SHA-256 para GDPR
    },

    // === UTM DE LA INTERACCIÓN ===
    utmParams: {
        source: { type: String, default: '' },
        medium: { type: String, default: '' },
        campaign: { type: String, default: '' }
    },

    // === QUIÉN REGISTRÓ ===
    performedBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        default: null 
    },

    timestamp: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'crm_interactions'
});

// === ÍNDICES ===
crmInteractionSchema.index({ leadRef: 1, timestamp: -1 });
crmInteractionSchema.index({ type: 1, timestamp: -1 });
crmInteractionSchema.index({ 'metadata.campaignId': 1 });
crmInteractionSchema.index({ channel: 1 });

// TTL: eliminar interacciones de más de 2 años (costo de storage)
crmInteractionSchema.index({ timestamp: 1 }, { expireAfterSeconds: 63072000 }); // 730 días

// === STATICS ===

/**
 * Obtiene el timeline de un lead
 */
crmInteractionSchema.statics.getTimeline = function(crmLeadId, limit = 50) {
    return this.find({ leadRef: crmLeadId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .populate('performedBy', 'name')
        .lean();
};

/**
 * Cuenta interacciones por tipo en un rango de fechas
 */
crmInteractionSchema.statics.countByType = async function(startDate, endDate) {
    const match = {};
    if (startDate || endDate) {
        match.timestamp = {};
        if (startDate) match.timestamp.$gte = new Date(startDate);
        if (endDate) match.timestamp.$lte = new Date(endDate);
    }

    return this.aggregate([
        { $match: match },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]);
};

/**
 * Obtiene las interacciones más recientes del sistema.
 * @param {number} hours — Ventana de horas hacia atrás (por defecto 24).
 */
crmInteractionSchema.statics.getRecentActivity = function(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.find({ timestamp: { $gte: since } })
        .sort({ timestamp: -1 })
        .limit(100)
        .populate('leadRef', 'leadRef score segment')
        .populate('performedBy', 'name')
        .lean();
};

module.exports = mongoose.model('CrmInteraction', crmInteractionSchema);
