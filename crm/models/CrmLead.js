/**
 * crm/models/CrmLead.js
 * Lead enriquecido con scoring, atribución, segmentación e i18n.
 * Referencia al Lead original del core para no duplicar datos base.
 */
const mongoose = require('mongoose');

const touchpointSchema = new mongoose.Schema({
    channel: { 
        type: String, 
        enum: ['meta_ads', 'google_ads', 'organic', 'referral', 'email', 'whatsapp', 'direct', 'social', 'other'],
        required: true 
    },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'CrmCampaign', default: null },
    timestamp: { type: Date, default: Date.now },
    pageUrl: { type: String, default: '' },
    utmSource: { type: String, default: '' },
    utmMedium: { type: String, default: '' },
    utmCampaign: { type: String, default: '' },
    utmContent: { type: String, default: '' },
    utmTerm: { type: String, default: '' }
}, { _id: false });

const attributionSchema = new mongoose.Schema({
    channel: { type: String, default: '' },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'CrmCampaign', default: null },
    adSetId: { type: String, default: '' },
    adId: { type: String, default: '' },
    utmSource: { type: String, default: '' },
    utmMedium: { type: String, default: '' },
    utmCampaign: { type: String, default: '' },
    utmContent: { type: String, default: '' },
    utmTerm: { type: String, default: '' },
    landingPage: { type: String, default: '' },
    referrer: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const crmLeadSchema = new mongoose.Schema({
    // === REFERENCIA AL LEAD ORIGINAL ===
    leadRef: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Lead', 
        required: true,
        unique: true,
        index: true
    },

    // === SCORING ===
    score: { type: Number, default: 0, min: 0, max: 100 },
    scoreHistory: [{
        date: { type: Date, default: Date.now },
        score: { type: Number },
        reason: { type: String }  // "opened_email", "visited_pricing", "demo_completed"
    }],

    // === ATRIBUCIÓN ===
    attribution: {
        firstTouch: { type: attributionSchema, default: () => ({}) },
        lastTouch: { type: attributionSchema, default: () => ({}) },
        touchpoints: [touchpointSchema]
    },

    // === TRACKING IDS EXTERNOS ===
    externalIds: {
        fbClickId: { type: String, default: '' },    // fbclid
        fbBrowserId: { type: String, default: '' },   // _fbp cookie
        gClientId: { type: String, default: '' },     // Google Analytics _ga
        gClickId: { type: String, default: '' }       // gclid
    },

    // === SEGMENTACIÓN ===
    tags: [{ type: String, trim: true }],
    segment: { 
        type: String, 
        enum: ['cold', 'warm', 'hot', 'customer', 'churned'],
        default: 'cold'
    },

    // === SECUENCIAS DE EMAIL ===
    activeSequences: [{
        sequenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'CrmSequence' },
        currentStep: { type: Number, default: 0 },
        startedAt: { type: Date, default: Date.now },
        pausedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        status: { 
            type: String, 
            enum: ['active', 'paused', 'completed', 'unsubscribed'],
            default: 'active'
        }
    }],

    emailPreferences: {
        unsubscribed: { type: Boolean, default: false },
        unsubscribedAt: { type: Date, default: null },
        bounced: { type: Boolean, default: false },
        bouncedAt: { type: Date, default: null }
    },

    // === INTERNACIONALIZACIÓN ===
    locale: { type: String, default: 'es', trim: true },   // "es", "en", "pt"
    currency: { type: String, default: 'USD', trim: true }, // ISO 4217
    timezone: { type: String, default: 'America/Santiago', trim: true }, // IANA timezone

    // === LIFECYCLE ===
    lifecycleStage: {
        type: String,
        enum: ['subscriber', 'lead', 'mql', 'sql', 'opportunity', 'customer', 'evangelist'],
        default: 'lead'
    },
    
    // Valor de vida del cliente (centavos)
    customerValue: { type: Number, default: 0 },

    convertedAt: { type: Date, default: null }
}, {
    timestamps: true,
    collection: 'crm_leads'
});

// === ÍNDICES ===
crmLeadSchema.index({ segment: 1, createdAt: -1 });
crmLeadSchema.index({ lifecycleStage: 1 });
crmLeadSchema.index({ score: -1 });
crmLeadSchema.index({ 'attribution.firstTouch.channel': 1 });
crmLeadSchema.index({ tags: 1 });

// === MÉTODOS ===

/**
 * Actualiza el score y registra en historial
 */
crmLeadSchema.methods.updateScore = function(newScore, reason) {
    this.score = Math.max(0, Math.min(100, newScore));
    this.scoreHistory.push({ score: this.score, reason });
    
    // Auto-segmentar basado en score — NO sobreescribir 'customer' ni 'churned'
    const protectedSegments = ['customer', 'churned'];
    if (!protectedSegments.includes(this.segment)) {
        if (this.score >= 80) this.segment = 'hot';
        else if (this.score >= 50) this.segment = 'warm';
        else this.segment = 'cold';
    }
    
    return this.save();
};

/**
 * Registra un nuevo touchpoint de atribución
 */
crmLeadSchema.methods.addTouchpoint = function(touchpointData) {
    const touchpoint = { ...touchpointData, timestamp: new Date() };
    
    // Si es el primer touchpoint, establecer como firstTouch
    if (this.attribution.touchpoints.length === 0) {
        this.attribution.firstTouch = touchpoint;
    }
    
    // Siempre actualizar lastTouch
    this.attribution.lastTouch = touchpoint;
    
    // Agregar al historial
    this.attribution.touchpoints.push(touchpoint);
    
    return this.save();
};

// === STATICS ===

/**
 * Busca el CrmLead por referencia al Lead original
 */
crmLeadSchema.statics.findByLeadRef = function(leadId) {
    return this.findOne({ leadRef: leadId });
};

/**
 * Obtiene distribución de leads por segmento
 */
crmLeadSchema.statics.getSegmentDistribution = async function() {
    return this.aggregate([
        { $group: { _id: '$segment', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]);
};

/**
 * Obtiene los top leads por score
 */
crmLeadSchema.statics.getTopLeads = function(limit = 10) {
    return this.find({ score: { $gt: 0 } })
        .sort({ score: -1 })
        .limit(limit)
        .populate('leadRef', 'name email type status');
};

module.exports = mongoose.model('CrmLead', crmLeadSchema);
