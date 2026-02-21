/**
 * crm/models/TrackedLink.js
 * Almacena links trackeados para emails individuales del CRM.
 * Cada link tiene un hash corto que redirige al destino original,
 * registrando el click en EmailTrackingEvent + actualizando engagement.
 *
 * Ruta pública: GET /t/:hash → redirect 302 al destino.
 * TTL: 6 meses (links de emails viejos se auto-eliminan).
 */
const mongoose = require('mongoose');
const crypto = require('crypto');

const trackedLinkSchema = new mongoose.Schema({
    // Hash corto para la URL (8 chars, hex)
    hash: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // URL destino original
    destinationUrl: {
        type: String,
        required: true
    },

    // Vinculación al lead y email
    crmLead: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CrmLead',
        required: true,
        index: true
    },

    // ID del email en Resend (para vincular con EmailTrackingEvent)
    resendEmailId: {
        type: String,
        default: null
    },

    // Interacción CRM asociada al envío
    emailInteractionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CrmInteraction',
        default: null
    },

    // Conteo de clicks
    clickCount: {
        type: Number,
        default: 0
    },

    // Primer y último click
    firstClickAt: {
        type: Date,
        default: null
    },
    lastClickAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true,
    collection: 'tracked_links'
});

// TTL: 6 meses
trackedLinkSchema.index({ createdAt: 1 }, { expireAfterSeconds: 15552000 });

/**
 * Generar hash único para un link.
 * Usa crmLeadId + url + timestamp para garantizar unicidad.
 */
trackedLinkSchema.statics.generateHash = function() {
    return crypto.randomBytes(4).toString('hex'); // 8 chars hex
};

/**
 * Crear link trackeado.
 * @param {string} url - URL destino
 * @param {string} crmLeadId - ID del CrmLead
 * @param {string} resendEmailId - ID del email en Resend (puede asignarse después)
 * @returns {Object} { hash, shortUrl }
 */
trackedLinkSchema.statics.createTrackedLink = async function(url, crmLeadId, resendEmailId = null) {
    // Reintentar si hay colisión de hash (extremadamente raro con 4 bytes)
    for (let i = 0; i < 3; i++) {
        try {
            const hash = this.generateHash();
            const link = await this.create({
                hash,
                destinationUrl: url,
                crmLead: crmLeadId,
                resendEmailId
            });
            return link;
        } catch (e) {
            if (e.code === 11000 && i < 2) continue; // Duplicado, reintentar
            throw e;
        }
    }
};

/**
 * Registrar un click y retornar la URL destino.
 * @param {string} hash - Hash del link
 * @returns {Object|null} { destinationUrl, crmLead, resendEmailId, ... } o null
 */
trackedLinkSchema.statics.registerClick = async function(hash) {
    const link = await this.findOneAndUpdate(
        { hash },
        {
            $inc: { clickCount: 1 },
            $set: { lastClickAt: new Date() },
            $setOnInsert: { firstClickAt: new Date() }
        },
        { new: true }
    );

    // Si es primer click, setear firstClickAt
    if (link && !link.firstClickAt) {
        link.firstClickAt = new Date();
        await link.save();
    }

    return link;
};

module.exports = mongoose.model('TrackedLink', trackedLinkSchema);
