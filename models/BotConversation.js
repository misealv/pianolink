/**
 * models/BotConversation.js
 * Historial de conversaciones del bot de WhatsApp (Mía).
 * Un documento por número de teléfono.
 */
const mongoose = require('mongoose');

const botConversationSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true, index: true },

    // Referencia al Lead (se llena cuando se detecta LEAD_DATA)
    leadRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },

    messages: [{
        role: { type: String, enum: ['user', 'assistant'], required: true },
        content: { type: String, required: true },
        hasImage: { type: Boolean, default: false },
        timestamp: { type: Date, default: Date.now }
    }],

    // Datos extraídos del lead (si se completó el flujo)
    leadData: { type: mongoose.Schema.Types.Mixed, default: null },

    lastActivity: { type: Date, default: Date.now },
    messageCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true,
    collection: 'bot_conversations'
});

botConversationSchema.index({ lastActivity: -1 });
botConversationSchema.index({ leadRef: 1 });

module.exports = mongoose.model('BotConversation', botConversationSchema);
