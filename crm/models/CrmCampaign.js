/**
 * crm/models/CrmCampaign.js
 * Campañas de marketing con presupuesto, métricas y atribución.
 * Soporta Meta Ads, Google Ads, email y orgánico.
 */
const mongoose = require('mongoose');

const crmCampaignSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: [true, 'El nombre de la campaña es requerido'],
        trim: true,
        maxlength: 200
    },
    
    platform: { 
        type: String, 
        enum: ['meta', 'google', 'email', 'organic', 'referral', 'other'],
        required: true
    },
    
    status: { 
        type: String, 
        enum: ['draft', 'active', 'paused', 'completed', 'archived'],
        default: 'draft'
    },
    
    type: {
        type: String,
        enum: ['acquisition', 'retargeting', 'nurturing', 'brand', 'other'],
        default: 'acquisition'
    },

    // === TARGETING ===
    targetAudience: {
        type: String,
        enum: ['teachers', 'students', 'both'],
        default: 'both'
    },
    targetCountries: [{ type: String, trim: true }],  // ["CL", "AR", "GB"]

    // === IDS EXTERNOS (plataformas de ads) ===
    externalIds: {
        metaCampaignId: { type: String, default: '' },
        metaAdSetId: { type: String, default: '' },
        googleCampaignId: { type: String, default: '' }
    },

    // === UTM TRACKING ===
    utmParams: {
        source: { type: String, default: '' },
        medium: { type: String, default: '' },
        campaign: { type: String, default: '' },
        content: { type: String, default: '' },
        term: { type: String, default: '' }
    },

    // === PRESUPUESTO (centavos para precisión) ===
    budget: {
        total: { type: Number, default: 0 },        // Presupuesto total en centavos
        spent: { type: Number, default: 0 },         // Ya gastado en centavos
        currency: { type: String, default: 'USD' },
        dailyLimit: { type: Number, default: 0 }
    },

    // === MÉTRICAS (actualizadas vía sync o manual) ===
    metrics: {
        impressions: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 },
        leads: { type: Number, default: 0 },
        conversions: { type: Number, default: 0 },
        revenue: { type: Number, default: 0 },        // Ingresos en centavos
        cpl: { type: Number, default: 0 },             // Costo por lead (centavos)
        cpa: { type: Number, default: 0 },             // Costo por adquisición (centavos)
        roas: { type: Number, default: 0 }             // Return On Ad Spend (ratio x100)
    },

    // === LANDING PAGE ASOCIADA ===
    landingPageId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'CrmLanding', 
        default: null 
    },

    // === FECHAS ===
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },

    // === ADMIN ===
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, default: '', maxlength: 2000 }
}, {
    timestamps: true,
    collection: 'crm_campaigns'
});

// === ÍNDICES ===
crmCampaignSchema.index({ platform: 1, status: 1 });
crmCampaignSchema.index({ 'utmParams.campaign': 1 });
crmCampaignSchema.index({ status: 1, createdAt: -1 });

// === VIRTUALS ===

/**
 * CTR (Click-Through Rate)
 */
crmCampaignSchema.virtual('ctr').get(function() {
    if (!this.metrics.impressions) return 0;
    return ((this.metrics.clicks / this.metrics.impressions) * 100).toFixed(2);
});

/**
 * Tasa de conversión de leads
 */
crmCampaignSchema.virtual('leadConversionRate').get(function() {
    if (!this.metrics.leads) return 0;
    return ((this.metrics.conversions / this.metrics.leads) * 100).toFixed(2);
});

// === MÉTODOS ===

/**
 * Recalcula métricas derivadas (CPL, CPA, ROAS)
 */
crmCampaignSchema.methods.recalculateMetrics = function() {
    const m = this.metrics;
    const spent = this.budget.spent;

    m.cpl = m.leads > 0 ? Math.round(spent / m.leads) : 0;
    m.cpa = m.conversions > 0 ? Math.round(spent / m.conversions) : 0;
    m.roas = spent > 0 ? Math.round((m.revenue / spent) * 100) : 0;  // ratio * 100

    return this.save();
};

/**
 * Incrementa métricas atómicamente
 */
crmCampaignSchema.methods.incrementMetric = function(metric, value = 1) {
    const validMetrics = ['impressions', 'clicks', 'leads', 'conversions', 'revenue'];
    if (!validMetrics.includes(metric)) return Promise.resolve(this);
    
    this.metrics[metric] += value;
    return this.save();
};

// === STATICS ===

/**
 * Obtiene campañas activas con resumen de rendimiento
 */
crmCampaignSchema.statics.getActiveSummary = async function() {
    return this.find({ status: 'active' })
        .select('name platform metrics budget startDate')
        .sort({ createdAt: -1 })
        .lean();
};

/**
 * Obtiene el gasto total por plataforma
 */
crmCampaignSchema.statics.getSpendByPlatform = async function() {
    return this.aggregate([
        { $match: { status: { $in: ['active', 'completed'] } } },
        { $group: {
            _id: '$platform',
            totalSpent: { $sum: '$budget.spent' },
            totalRevenue: { $sum: '$metrics.revenue' },
            totalLeads: { $sum: '$metrics.leads' },
            totalConversions: { $sum: '$metrics.conversions' },
            campaignCount: { $sum: 1 }
        }},
        { $sort: { totalSpent: -1 } }
    ]);
};

module.exports = mongoose.model('CrmCampaign', crmCampaignSchema);
