/**
 * crm/models/CrmInboundEmail.js
 * Almacena emails entrantes Y salientes para conversaciones completas.
 * Vincula automáticamente el remitente con el CrmLead si existe.
 */
const mongoose = require('mongoose');

const crmInboundEmailSchema = new mongoose.Schema({
    // === EMAIL ===
    from: { type: String, required: true, trim: true, index: true },
    to: { type: String, default: '' },
    subject: { type: String, default: '(sin asunto)' },
    textBody: { type: String, default: '' },
    htmlBody: { type: String, default: '' },

    // === DIRECCIÓN ===
    direction: {
        type: String,
        enum: ['inbound', 'outbound'],
        default: 'inbound',
        index: true
    },

    // === THREAD (conversación) ===
    threadId: { type: String, default: '', index: true },         // Agrupa mensajes de la misma conversación

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

    // === METADATA DEL WEBHOOK / ENVÍO ===
    resendEventId: { type: String, default: '' },
    resendEmailId: { type: String, default: '' },                 // ID del email enviado vía Resend
    rawHeaders: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
    timestamps: true,
    collection: 'crm_inbound_emails'
});

// Índice para ordenar por fecha y estado de lectura
crmInboundEmailSchema.index({ read: 1, createdAt: -1 });
crmInboundEmailSchema.index({ createdAt: -1 });
crmInboundEmailSchema.index({ threadId: 1, createdAt: 1 });

// === STATICS ===

/**
 * Obtiene los emails no leídos (solo inbound)
 */
crmInboundEmailSchema.statics.getUnreadCount = function() {
    return this.countDocuments({ read: false, direction: { $ne: 'outbound' } });
};

/**
 * Obtiene todos los mensajes de un thread ordenados cronológicamente
 */
crmInboundEmailSchema.statics.getThread = function(threadId) {
    return this.find({ threadId })
        .sort({ createdAt: 1 })
        .populate({
            path: 'leadRef',
            populate: { path: 'leadRef', select: 'name email type' }
        })
        .lean();
};

/**
 * Lista paginada agrupada por thread (muestra último mensaje de cada conversación)
 */
crmInboundEmailSchema.statics.listPaginated = async function(page = 1, limit = 30, filter = {}) {
    const skip = (page - 1) * limit;

    // Agregar filtro base: no mostrar outbound como conversaciones principales
    const matchFilter = { ...filter };

    // Agrupar por threadId, tomar el último mensaje de cada thread
    const pipeline = [
        { $match: matchFilter },
        { $sort: { createdAt: -1 } },
        {
            $group: {
                _id: {
                    $cond: {
                        if: { $and: [{ $ne: ['$threadId', null] }, { $ne: ['$threadId', ''] }] },
                        then: '$threadId',
                        else: { $toString: '$_id' }
                    }
                },
                lastMessage: { $first: '$$ROOT' },
                messageCount: { $sum: 1 },
                hasUnread: { $max: { $cond: [{ $and: [{ $eq: ['$read', false] }, { $ne: ['$direction', 'outbound'] }] }, true, false] } }
            }
        },
        { $sort: { 'lastMessage.createdAt': -1 } },
        { $skip: skip },
        { $limit: limit }
    ];

    const results = await this.aggregate(pipeline);

    // Populate leadRef manualmente
    const populated = await this.populate(results.map(r => r.lastMessage), [
        { path: 'leadRef', populate: { path: 'leadRef', select: 'name email type' } }
    ]);

    return results.map((r, i) => ({
        ...populated[i],
        _threadId: r._id,
        _messageCount: r.messageCount,
        _hasUnread: r.hasUnread
    }));
};

module.exports = mongoose.model('CrmInboundEmail', crmInboundEmailSchema);
