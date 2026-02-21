/**
 * models/StudentInvite.js
 * Invitaciones gratuitas para estudiantes — PianoLink CRM
 * 
 * Permite al admin enviar un link especial desde el CRM para que
 * un lead pueda crear su cuenta y comenzar el Welcome Kit sin pagar.
 * El kit se crea con provider 'gift_invite' y amount 0.
 */
const mongoose = require('mongoose');
const crypto = require('crypto');

const studentInviteSchema = new mongoose.Schema({
    // Referencia al CrmLead que recibe la invitación
    crmLeadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CrmLead',
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

    // Usuario creado al registrarse
    registeredUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    // WelcomeKit creado al registrarse
    welcomeKitId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WelcomeKit',
        default: null
    },

    // Seguimiento de tiempos
    sentAt: { type: Date },
    openedAt: { type: Date },
    registeredAt: { type: Date },
    expiresAt: {
        type: Date,
        required: true
    },

    // Metadata del envío
    emailMessageId: { type: String },
    campaignTag: { type: String, default: 'student_free_invite_v1' },

    // Nota opcional del admin
    adminNote: { type: String }

}, { timestamps: true });

// ==================== ÍNDICES ====================
studentInviteSchema.index({ recipientEmail: 1 });
studentInviteSchema.index({ status: 1 });
studentInviteSchema.index({ crmLeadId: 1 });
studentInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL automático

// ==================== ESTÁTICOS ====================

/**
 * Genera un token criptográficamente seguro
 */
studentInviteSchema.statics.generateToken = function () {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Busca una invitación válida por token (no expirada, no usada)
 */
studentInviteSchema.statics.findValidByToken = async function (token) {
    return this.findOne({
        token,
        status: { $in: ['pending', 'sent', 'opened'] },
        expiresAt: { $gt: new Date() }
    });
};

/**
 * Crea invitación para un CrmLead
 * Recibe objeto con { _id, email, name } (ya resueltos desde leadRef)
 */
studentInviteSchema.statics.createForCrmLead = async function (leadData, adminNote) {
    const email = leadData.email;
    const name = leadData.name || email.split('@')[0];

    // Verificar si ya tiene una invitación activa (evitar duplicados accidentales)
    const existing = await this.findOne({
        recipientEmail: email,
        status: { $in: ['pending', 'sent', 'opened'] },
        expiresAt: { $gt: new Date() }
    });
    if (existing) return existing;

    return this.create({
        crmLeadId: leadData._id,
        recipientName: name,
        recipientEmail: email,
        token: this.generateToken(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
        adminNote: adminNote || null
    });
};

// ==================== MÉTODOS DE INSTANCIA ====================

/**
 * Marca como enviado con el ID del email de Resend
 */
studentInviteSchema.methods.markAsSent = function (messageId) {
    this.status = 'sent';
    this.sentAt = new Date();
    if (messageId) this.emailMessageId = messageId;
    return this.save();
};

/**
 * Marca como abierto (cuando visitan el enlace)
 */
studentInviteSchema.methods.markAsOpened = function () {
    if (this.status === 'sent' || this.status === 'pending') {
        this.status = 'opened';
        this.openedAt = new Date();
        return this.save();
    }
    return this;
};

/**
 * Marca como registrado cuando el estudiante completa el formulario
 */
studentInviteSchema.methods.markAsRegistered = function (userId, welcomeKitId) {
    this.status = 'registered';
    this.registeredUserId = userId;
    this.welcomeKitId = welcomeKitId;
    this.registeredAt = new Date();
    return this.save();
};

module.exports = mongoose.model('StudentInvite', studentInviteSchema);
