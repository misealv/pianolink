/**
 * crm/models/EmailTrackingEvent.js
 * Registro de eventos de tracking de emails (via webhooks de Resend).
 * Cada evento (sent, delivered, opened, clicked, bounced, complained)
 * se almacena aquí para historial y análisis de engagement.
 */
const mongoose = require('mongoose');

const emailTrackingEventSchema = new mongoose.Schema({
    // === VINCULACIÓN ===
    crmLead: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CrmLead',
        required: true,
        index: true
    },
    emailInteractionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CrmInteraction',
        required: true
    },
    resendEmailId: {
        type: String,
        required: true,
        index: true
    },

    // === EVENTO ===
    eventType: {
        type: String,
        enum: ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'delivery_delayed'],
        required: true
    },

    // === DATOS DEL EVENTO ===
    recipient: { type: String, required: true },
    clickedUrl: { type: String, default: null },
    bounceType: { type: String, default: null },    // 'hard' | 'soft'
    bounceMessage: { type: String, default: null },

    // === CONTEXTO ===
    userAgent: { type: String, default: '' },
    ipCountry: { type: String, default: '' },

    // === DEBUG ===
    rawEvent: { type: mongoose.Schema.Types.Mixed, default: {} },

    timestamp: { type: Date, default: Date.now }
}, {
    timestamps: false,
    collection: 'email_tracking_events'
});

// === ÍNDICES ===
emailTrackingEventSchema.index({ crmLead: 1, eventType: 1, timestamp: -1 });
emailTrackingEventSchema.index({ resendEmailId: 1, eventType: 1 });
// TTL: eliminar eventos de más de 2 años
emailTrackingEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 63072000 });

module.exports = mongoose.model('EmailTrackingEvent', emailTrackingEventSchema);
