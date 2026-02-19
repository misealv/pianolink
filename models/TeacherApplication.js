/**
 * models/TeacherApplication.js
 * Gestiona invitaciones para registro de profesores.
 * Flujo: Admin genera código → email al candidato → profesor se registra con código.
 */
const mongoose = require('mongoose');
const crypto = require('crypto');

const teacherApplicationSchema = new mongoose.Schema({
    // Datos del candidato (pre-cargados desde CRM o landing)
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    whatsapp: { type: String, default: '' },
    country: { type: String, default: '' },
    specialties: [{ type: String }],
    yearsExperience: { type: Number, default: null },
    background: { type: String, default: '' },

    // Código de invitación
    inviteCode: { type: String, unique: true, required: true, index: true },

    // Estado
    status: {
        type: String,
        enum: ['pending', 'sent', 'registered', 'expired', 'revoked'],
        default: 'pending'
    },

    // Referencias
    crmLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'CrmLead', default: null },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    registeredUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Control del email
    emailSentAt: { type: Date, default: null },
    emailResendCount: { type: Number, default: 0 },

    // Expiración (default 30 días)
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        index: { expireAfterSeconds: 0 }
    },

    // Notas del admin (de la entrevista)
    interviewNotes: { type: String, default: '' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, {
    timestamps: true,
    collection: 'teacher_applications'
});

// === Métodos estáticos ===

// Genera un código único tipo "prof-nombre-XXXX"
teacherApplicationSchema.statics.generateCode = function(name) {
    const slug = (name || 'prof')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 15);
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `prof-${slug}-${random}`;
};

// Busca código válido (no expirado, no usado, no revocado)
teacherApplicationSchema.statics.findValidByCode = async function(code) {
    return this.findOne({
        inviteCode: code,
        status: { $in: ['pending', 'sent'] },
        expiresAt: { $gt: new Date() }
    });
};

// Busca por email (para evitar duplicados)
teacherApplicationSchema.statics.findByEmail = async function(email) {
    return this.findOne({
        email: email.toLowerCase(),
        status: { $in: ['pending', 'sent'] },
        expiresAt: { $gt: new Date() }
    });
};

// === Métodos de instancia ===

// Marcar como enviado
teacherApplicationSchema.methods.markSent = function() {
    this.status = 'sent';
    this.emailSentAt = new Date();
    this.emailResendCount += 1;
    return this.save();
};

// Marcar como registrado
teacherApplicationSchema.methods.markRegistered = function(userId) {
    this.status = 'registered';
    this.registeredUserId = userId;
    return this.save();
};

// Revocar
teacherApplicationSchema.methods.revoke = function() {
    this.status = 'revoked';
    return this.save();
};

module.exports = mongoose.model('TeacherApplication', teacherApplicationSchema);
