/**
 * models/FounderInvite.js
 * Invitaciones para profesores a unirse como Fundadores — PianoLink
 * 
 * Genera tokens únicos que se envían por email a leads de profesores.
 * Al usar el enlace, el profesor puede crear su cuenta con beneficios
 * especiales y membresía congelada a $10 USD/mes de por vida.
 */
const mongoose = require('mongoose');
const crypto = require('crypto');

const founderInviteSchema = new mongoose.Schema({
    // Referencia al lead que recibe la invitación
    leadRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead',
        default: null
    },

    // Datos del destinatario (copiados del lead para independencia)
    recipientName: { type: String, required: true },
    recipientEmail: { type: String, required: true },

    // Token único para el enlace de invitación
    token: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // Estado de la invitación
    status: {
        type: String,
        enum: ['pending', 'sent', 'opened', 'registered', 'expired', 'revoked'],
        default: 'pending'
    },

    // Datos del profesor creado al registrarse
    registeredUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    // Seguimiento
    sentAt: { type: Date },
    openedAt: { type: Date },
    registeredAt: { type: Date },
    expiresAt: {
        type: Date,
        required: true
    },

    // Metadata del envío
    emailMessageId: { type: String },      // ID del email en Resend
    campaignTag: { type: String, default: 'founder_invite_v1' }

}, { timestamps: true });

// ==================== ÍNDICES ====================
founderInviteSchema.index({ recipientEmail: 1 });
founderInviteSchema.index({ status: 1 });
founderInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL automático

// ==================== ESTÁTICOS ====================

/**
 * Genera un token seguro
 */
founderInviteSchema.statics.generateToken = function () {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Busca una invitación válida por token
 */
founderInviteSchema.statics.findValidByToken = async function (token) {
    return this.findOne({
        token,
        status: { $in: ['pending', 'sent', 'opened'] },
        expiresAt: { $gt: new Date() }
    });
};

/**
 * Crea invitación para un lead
 */
founderInviteSchema.statics.createForLead = async function (lead) {
    // Verificar si ya tiene una invitación activa
    const existing = await this.findOne({
        recipientEmail: lead.email,
        status: { $in: ['pending', 'sent', 'opened'] },
        expiresAt: { $gt: new Date() }
    });
    if (existing) return existing;

    return this.create({
        leadRef: lead._id,
        recipientName: lead.name,
        recipientEmail: lead.email,
        token: this.generateToken(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 días
    });
};

// ==================== MÉTODOS DE INSTANCIA ====================

/**
 * Marca como enviado
 */
founderInviteSchema.methods.markAsSent = function (messageId) {
    this.status = 'sent';
    this.sentAt = new Date();
    if (messageId) this.emailMessageId = messageId;
    return this.save();
};

/**
 * Marca como abierto (cuando visitan el enlace)
 */
founderInviteSchema.methods.markAsOpened = function () {
    if (this.status === 'sent' || this.status === 'pending') {
        this.status = 'opened';
        this.openedAt = new Date();
        return this.save();
    }
    return this;
};

/**
 * Marca como registrado
 */
founderInviteSchema.methods.markAsRegistered = function (userId) {
    this.status = 'registered';
    this.registeredUserId = userId;
    this.registeredAt = new Date();
    return this.save();
};

module.exports = mongoose.model('FounderInvite', founderInviteSchema);
