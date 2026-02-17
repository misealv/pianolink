/**
 * crm/models/CrmInboundEmail.js
 * Almacena emails entrantes (respuestas) recibidos vía webhook de Resend.
 * Vincula automáticamente el remitente con el CrmLead si existe.
 */
const mongoose = require('mongoose');

const crmInboundEmailSchema = new mongoose.Schema({
    // === EMAIL RECIBIDO ===
    from: { type: String, required: true, trim: true, index: true },
    to: { type: String, default: '' },
    subject: { type: String, default: '(sin asunto)' },
    textBody: { type: String, default: '' },
    htmlBody: { type: String, default: '' },

    // === HEADERS RELEVANTES ===
    messageId: { type: String, default: '', index: true },       // Message-ID del email
    inReplyTo: { type: String, default: '' },                     // In-Reply-To header
    references: { type: String, default: '' },                    // References header

    // === VINCULACIÓN CON LEAD ===
    leadRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CrmLead',
        default: null,
        index: true
    },
    leadName: { type: String, default: '' },                      // Cache del nombre para UI rápida

    // === ESTADO DE LECTURA ===
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    readBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // === NOTAS INTERNAS ===
    notes: { type: String, default: '' },

    // === METADATA DEL WEBHOOK ===
    resendEventId: { type: String, default: '' },
    rawHeaders: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
    timestamps: true,
    collection: 'crm_inbound_emails'
});

// Índice para ordenar por fecha y estado de lectura
crmInboundEmailSchema.index({ read: 1, createdAt: -1 });
crmInboundEmailSchema.index({ createdAt: -1 });

// === STATICS ===

/**
 * Obtiene los emails no leídos
 */
crmInboundEmailSchema.statics.getUnreadCount = function() {
    return this.countDocuments({ read: false });
};

/**
 * Lista paginada con populate del lead
 */
crmInboundEmailSchema.statics.listPaginated = function(page = 1, limit = 30, filter = {}) {
    const skip = (page - 1) * limit;
    return this.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
            path: 'leadRef',
            populate: { path: 'leadRef', select: 'name email type' }
        })
        .lean();
};

module.exports = mongoose.model('CrmInboundEmail', crmInboundEmailSchema);
