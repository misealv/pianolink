/**
 * crm/models/CrmEmailCampaign.js
 * Modelo de Campañas de Email Marketing con Resend.
 * 
 * Diferente de CrmSequence (automatización) - esto es para:
 * - Broadcasts masivos
 * - Secuencias manuales programadas
 * - Emails transaccionales templated
 * 
 * COMPLETADO: Modelo de email marketing para lanzamiento Día 88
 */
const mongoose = require('mongoose');

const crmEmailCampaignSchema = new mongoose.Schema({
    // === IDENTIFICACIÓN ===
    nombre: { 
        type: String, 
        required: [true, 'El nombre de la campaña es requerido'],
        trim: true,
        maxlength: 200
    },
    
    // === CONTENIDO DEL EMAIL ===
    asunto: { 
        type: String, 
        required: [true, 'El asunto es requerido'],
        trim: true,
        maxlength: 200
    },
    
    previewText: { 
        type: String, 
        default: '',
        maxlength: 200
    },
    
    contenidoHtml: { 
        type: String, 
        required: [true, 'El contenido HTML es requerido']
    },
    
    // === TIPO Y CONFIGURACIÓN ===
    tipo: { 
        type: String, 
        enum: ['secuencia', 'broadcast', 'transaccional'],
        default: 'broadcast'
    },
    
    ordenSecuencia: { 
        type: Number, 
        default: null 
    },
    
    estado: { 
        type: String, 
        enum: ['borrador', 'programado', 'enviando', 'enviado', 'cancelado'],
        default: 'borrador'
    },
    
    // === PROGRAMACIÓN ===
    fechaProgramada: { 
        type: Date, 
        default: null 
    },
    
    fechaEnviado: { 
        type: Date, 
        default: null 
    },
    
    // === MÉTRICAS ===
    metricas: {
        totalEnviados: { type: Number, default: 0 },
        totalAbiertos: { type: Number, default: 0 },
        totalClicks: { type: Number, default: 0 },
        totalRebotes: { type: Number, default: 0 },
        totalDesuscripciones: { type: Number, default: 0 }
    },
    
    // === INTEGRACIÓN RESEND ===
    resendBroadcastId: { 
        type: String, 
        default: null 
    },
    
    // === TARGETING ===
    targeting: {
        // Filtros para seleccionar suscriptores
        tags: [{ type: String }],
        segmentos: [{ type: String, enum: ['cold', 'warm', 'hot', 'customer'] }],
        fuentes: [{ type: String }], // "waitlist", "landing-profesores", etc.
        excludeUnsubscribed: { type: Boolean, default: true }
    },
    
    // === ADMIN ===
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        default: null 
    },
    
    notas: { 
        type: String, 
        default: '',
        maxlength: 2000
    }
}, {
    timestamps: true,
    collection: 'crm_email_campaigns'
});

// === ÍNDICES ===
crmEmailCampaignSchema.index({ estado: 1, tipo: 1 });
crmEmailCampaignSchema.index({ fechaProgramada: 1 });
crmEmailCampaignSchema.index({ createdAt: -1 });

// === VIRTUALS ===

/**
 * Tasa de apertura
 */
crmEmailCampaignSchema.virtual('tasaApertura').get(function() {
    if (!this.metricas.totalEnviados) return 0;
    return ((this.metricas.totalAbiertos / this.metricas.totalEnviados) * 100).toFixed(2);
});

/**
 * Tasa de clicks
 */
crmEmailCampaignSchema.virtual('tasaClicks').get(function() {
    if (!this.metricas.totalEnviados) return 0;
    return ((this.metricas.totalClicks / this.metricas.totalEnviados) * 100).toFixed(2);
});

// === MÉTODOS ESTÁTICOS ===

/**
 * Obtener campañas de una secuencia ordenadas
 */
crmEmailCampaignSchema.statics.getSecuencia = async function() {
    return this.find({ tipo: 'secuencia' })
        .sort({ ordenSecuencia: 1 })
        .lean();
};

/**
 * Obtener campañas pendientes de envío programado
 */
crmEmailCampaignSchema.statics.getPendientesEnvio = async function() {
    const ahora = new Date();
    return this.find({
        estado: 'programado',
        fechaProgramada: { $lte: ahora }
    }).lean();
};

// === MÉTODOS DE INSTANCIA ===

/**
 * Actualizar métricas atómicamente
 */
crmEmailCampaignSchema.methods.incrementarMetrica = async function(metrica, cantidad = 1) {
    const field = `metricas.${metrica}`;
    return mongoose.model('CrmEmailCampaign').findByIdAndUpdate(
        this._id,
        { $inc: { [field]: cantidad } },
        { new: true }
    );
};

/**
 * Marcar como enviado
 */
crmEmailCampaignSchema.methods.marcarEnviado = async function(totalEnviados) {
    this.estado = 'enviado';
    this.fechaEnviado = new Date();
    this.metricas.totalEnviados = totalEnviados;
    return this.save();
};

/**
 * Duplicar campaña como borrador
 */
crmEmailCampaignSchema.methods.duplicar = async function() {
    const CrmEmailCampaign = mongoose.model('CrmEmailCampaign');
    const copia = new CrmEmailCampaign({
        nombre: `${this.nombre} (copia)`,
        asunto: this.asunto,
        previewText: this.previewText,
        contenidoHtml: this.contenidoHtml,
        tipo: this.tipo,
        ordenSecuencia: null,
        estado: 'borrador',
        targeting: this.targeting,
        createdBy: this.createdBy
    });
    return copia.save();
};

// Configurar virtuals en JSON
crmEmailCampaignSchema.set('toJSON', { virtuals: true });
crmEmailCampaignSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('CrmEmailCampaign', crmEmailCampaignSchema);
