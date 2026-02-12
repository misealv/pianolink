/**
 * crm/models/CrmSequence.js
 * Modelo de Secuencias de Email Automatizadas.
 * 
 * Una secuencia es una serie de pasos (emails, esperas, condiciones)
 * que se ejecutan automáticamente cuando un lead cumple ciertas condiciones.
 * 
 * Ejemplo: Al crear un lead tipo "student" → enviar email de bienvenida (0h),
 *          esperar 48h, enviar email de beneficios, si no abrió → reenviar.
 */
const mongoose = require('mongoose');

// === SUB-SCHEMA: Paso de la secuencia ===
const sequenceStepSchema = new mongoose.Schema({
    order: { type: Number, required: true },
    
    // Delay respecto al paso anterior o al trigger
    delayHours: { type: Number, default: 0 },
    delayType: { 
        type: String, 
        enum: ['after_previous', 'after_trigger', 'specific_time'],
        default: 'after_previous'
    },

    // Tipo de acción
    action: { 
        type: String, 
        enum: ['send_email', 'wait', 'condition', 'update_tag', 'update_score'],
        required: true
    },

    // Para send_email
    email: {
        subject: { type: String, default: '' },
        bodyHtml: { type: String, default: '' },    // HTML con variables {{lead.name}}
        previewText: { type: String, default: '' }   // Texto de preview en inbox
    },

    // Para condition (branching)
    condition: {
        field: { type: String, default: '' },        // "emailOpened", "score", "tag", "segment"
        operator: { type: String, enum: ['gt', 'lt', 'eq', 'ne', 'contains', 'not_contains', ''], default: '' },
        value: { type: mongoose.Schema.Types.Mixed, default: null },
        ifTrueStep: { type: Number, default: -1 },  // -1 = siguiente paso
        ifFalseStep: { type: Number, default: -1 }   // -1 = siguiente paso
    },

    // Para update_tag
    tagAction: {
        action: { type: String, enum: ['add', 'remove', ''], default: '' },
        tag: { type: String, default: '' }
    },

    // Para update_score
    scoreAction: {
        delta: { type: Number, default: 0 },
        reason: { type: String, default: '' }
    },

    // Métricas del paso (se actualizan al ejecutar)
    metrics: {
        sent: { type: Number, default: 0 },
        opened: { type: Number, default: 0 },
        clicked: { type: Number, default: 0 },
        bounced: { type: Number, default: 0 },
        unsubscribed: { type: Number, default: 0 },
        skipped: { type: Number, default: 0 }
    }
}, { _id: true });

// === SCHEMA PRINCIPAL ===
const crmSequenceSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },

    type: { 
        type: String, 
        enum: ['onboarding_teacher', 'onboarding_student', 'nurturing', 'reactivation', 'post_demo', 'custom'],
        default: 'custom'
    },

    status: { 
        type: String, 
        enum: ['draft', 'active', 'paused', 'archived'],
        default: 'draft'
    },

    targetAudience: { 
        type: String, 
        enum: ['teachers', 'students', 'all'],
        default: 'all'
    },

    steps: [sequenceStepSchema],

    // Trigger de activación automática
    trigger: {
        event: { 
            type: String, 
            enum: ['lead.created', 'lead.statusChanged', 'booking.created', 'booking.completed', 'payment.received', 'manual', ''],
            default: 'manual'
        },
        conditions: {
            leadType: { type: String, default: '' },     // "teacher", "client", ""
            segment: { type: String, default: '' },       // "cold", "warm", etc.
            tags: [{ type: String }],                     // Lead debe tener estos tags
            minScore: { type: Number, default: 0 }
        }
    },

    // Estadísticas globales
    stats: {
        totalEnrolled: { type: Number, default: 0 },
        totalCompleted: { type: Number, default: 0 },
        totalUnsubscribed: { type: Number, default: 0 }
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, {
    timestamps: true,
    collection: 'crm_sequences'
});

// === ÍNDICES ===
crmSequenceSchema.index({ status: 1, 'trigger.event': 1 });
crmSequenceSchema.index({ type: 1, status: 1 });

// === STATICS ===

/**
 * Obtiene secuencias activas que coincidan con un evento trigger.
 * @param {string} eventName - Nombre del evento (ej. "lead.created")
 * @returns {Promise<CrmSequence[]>}
 */
crmSequenceSchema.statics.getActiveByTrigger = function(eventName) {
    return this.find({ 
        status: 'active', 
        'trigger.event': eventName 
    }).lean();
};

/**
 * Obtiene resumen de métricas de una secuencia.
 */
crmSequenceSchema.statics.getMetricsSummary = async function(sequenceId) {
    const seq = await this.findById(sequenceId).lean();
    if (!seq) return null;

    const totals = { sent: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 };
    for (const step of (seq.steps || [])) {
        if (step.action === 'send_email' && step.metrics) {
            totals.sent += step.metrics.sent || 0;
            totals.opened += step.metrics.opened || 0;
            totals.clicked += step.metrics.clicked || 0;
            totals.bounced += step.metrics.bounced || 0;
            totals.unsubscribed += step.metrics.unsubscribed || 0;
        }
    }

    return {
        sequenceId: seq._id,
        name: seq.name,
        status: seq.status,
        enrolled: seq.stats?.totalEnrolled || 0,
        completed: seq.stats?.totalCompleted || 0,
        ...totals,
        openRate: totals.sent > 0 ? Math.round((totals.opened / totals.sent) * 10000) / 100 : 0,
        clickRate: totals.opened > 0 ? Math.round((totals.clicked / totals.opened) * 10000) / 100 : 0
    };
};

module.exports = mongoose.model('CrmSequence', crmSequenceSchema);
