/**
 * crm/models/CrmConversion.js
 * Registro de conversiones con valor monetario, atribución y reporte a plataformas.
 * Cada evento de negocio relevante (pago, suscripción, demo) genera una conversión.
 */
const mongoose = require('mongoose');

const crmConversionSchema = new mongoose.Schema({
    // === LEAD ASOCIADO ===
    leadRef: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'CrmLead', 
        required: true,
        index: true
    },

    // === TIPO DE CONVERSIÓN ===
    type: {
        type: String,
        enum: [
            'lead_capture',        // Se registró
            'demo_scheduled',      // Agendó demo
            'demo_completed',      // Completó demo
            'first_class',         // Primera clase tomada/dada
            'subscription',        // Activó suscripción
            'kit_purchase',        // Compró Welcome Kit
            'class_purchase',      // Compró paquete de clases
            'referral'             // Refirió a alguien
        ],
        required: true
    },

    // === VALOR MONETARIO ===
    value: { type: Number, default: 0 },               // Centavos
    currency: { type: String, default: 'USD' },

    // === ATRIBUCIÓN ===
    campaignId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'CrmCampaign', 
        default: null 
    },
    attribution: {
        model: { 
            type: String, 
            enum: ['first_touch', 'last_touch', 'linear'],
            default: 'last_touch'
        },
        channel: { type: String, default: '' },
        touchpointCount: { type: Number, default: 0 }
    },

    // === REFERENCIA AL CORE DE PIANOLINK ===
    coreRef: {
        type: { type: String, default: '' },     // "booking", "payment", "subscription"
        id: { type: mongoose.Schema.Types.ObjectId, default: null }
    },

    // === REPORTE A PLATAFORMAS EXTERNAS ===
    reportedTo: {
        meta: { 
            sent: { type: Boolean, default: false },
            sentAt: { type: Date, default: null },
            eventId: { type: String, default: '' }
        },
        google: {
            sent: { type: Boolean, default: false },
            sentAt: { type: Date, default: null },
            conversionId: { type: String, default: '' }
        },
        ga4: {
            sent: { type: Boolean, default: false },
            sentAt: { type: Date, default: null }
        }
    },

    timestamp: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'crm_conversions'
});

// === ÍNDICES ===
crmConversionSchema.index({ campaignId: 1, timestamp: -1 });
crmConversionSchema.index({ type: 1, timestamp: -1 });
crmConversionSchema.index({ 'reportedTo.meta.sent': 1 });
crmConversionSchema.index({ 'reportedTo.google.sent': 1 });
crmConversionSchema.index({ 'reportedTo.ga4.sent': 1 });

// === STATICS ===

/**
 * Obtiene el valor total de conversiones en un periodo
 */
crmConversionSchema.statics.getTotalValue = async function(startDate, endDate, currency = 'USD') {
    const match = { currency };
    if (startDate || endDate) {
        match.timestamp = {};
        if (startDate) match.timestamp.$gte = new Date(startDate);
        if (endDate) match.timestamp.$lte = new Date(endDate);
    }

    const result = await this.aggregate([
        { $match: match },
        { $group: { 
            _id: null, 
            total: { $sum: '$value' },
            count: { $sum: 1 }
        }}
    ]);

    return result[0] || { total: 0, count: 0 };
};

/**
 * Conversiones por tipo con valor total
 */
crmConversionSchema.statics.getByType = async function(startDate, endDate) {
    const match = {};
    if (startDate || endDate) {
        match.timestamp = {};
        if (startDate) match.timestamp.$gte = new Date(startDate);
        if (endDate) match.timestamp.$lte = new Date(endDate);
    }

    return this.aggregate([
        { $match: match },
        { $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalValue: { $sum: '$value' }
        }},
        { $sort: { totalValue: -1 } }
    ]);
};

/**
 * Conversiones por campaña (para calcular ROAS)
 */
crmConversionSchema.statics.getByCampaign = async function(campaignId) {
    return this.aggregate([
        { $match: { campaignId: new mongoose.Types.ObjectId(campaignId) } },
        { $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalValue: { $sum: '$value' }
        }},
        { $sort: { count: -1 } }
    ]);
};

/**
 * Conversiones pendientes de reportar a plataformas
 */
crmConversionSchema.statics.getPendingReports = function(platform) {
    const query = {};
    if (platform === 'meta') query['reportedTo.meta.sent'] = false;
    if (platform === 'google') query['reportedTo.google.sent'] = false;
    if (platform === 'ga4') query['reportedTo.ga4.sent'] = false;
    
    return this.find(query)
        .populate('leadRef', 'externalIds')
        .sort({ timestamp: -1 })
        .limit(100);
};

module.exports = mongoose.model('CrmConversion', crmConversionSchema);
