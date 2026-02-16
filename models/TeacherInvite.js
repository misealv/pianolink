/**
 * models/TeacherInvite.js
 * Invitaciones de Alumnos Particulares - PianoLink v5.0
 * 
 * Gestiona los enlaces de invitación que los profesores Premium/Founder
 * generan para invitar alumnos propios (comisión 0% PianoLink).
 * 
 * Solo profesores con plan premium o founder pueden crear invitaciones.
 * El middleware requirePermission('canInvitePrivateStudents') lo valida.
 */

const mongoose = require('mongoose');

const teacherInviteSchema = new mongoose.Schema({
    // Profesor que genera la invitación
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Código único de invitación (ej: 'prof-maria-xyz123')
    code: {
        type: String,
        required: true,
        unique: true
    },

    // Tipo de invitación (extensible a futuro)
    type: {
        type: String,
        enum: ['private_student'],
        default: 'private_student'
    },

    // Estado del enlace
    status: {
        type: String,
        enum: ['active', 'used', 'expired', 'revoked'],
        default: 'active'
    },

    // Alumno que usó el código (null si aún no se usa)
    usedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    // Fecha en que se usó
    usedAt: { type: Date },

    // Fecha de expiración del enlace
    expiresAt: {
        type: Date,
        required: true
    }
}, { timestamps: true });

// ==================== ÍNDICES ====================
teacherInviteSchema.index({ code: 1 }, { unique: true });
teacherInviteSchema.index({ teacherId: 1, status: 1 });
teacherInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL: auto-eliminar expiradas

// ==================== MÉTODOS ESTÁTICOS ====================

/**
 * Buscar invitación válida por código
 * Retorna null si no existe, está usada o expirada
 */
teacherInviteSchema.statics.findValidByCode = function(code) {
    return this.findOne({
        code,
        status: 'active',
        expiresAt: { $gt: new Date() }
    }).populate('teacherId', 'name email teacherData.plan');
};

/**
 * Obtener invitaciones activas de un profesor
 */
teacherInviteSchema.statics.getByTeacher = function(teacherId) {
    return this.find({ teacherId })
        .sort({ createdAt: -1 })
        .populate('usedBy', 'name email');
};

/**
 * Marcar invitación como usada
 */
teacherInviteSchema.methods.markAsUsed = function(studentId) {
    this.status = 'used';
    this.usedBy = studentId;
    this.usedAt = new Date();
    return this.save();
};

/**
 * Revocar invitación (profesor la cancela manualmente)
 */
teacherInviteSchema.methods.revoke = function() {
    this.status = 'revoked';
    return this.save();
};

/**
 * Generar código único para invitación
 * Formato: nombre-del-profesor-XXXXXX
 */
teacherInviteSchema.statics.generateCode = function(teacherName) {
    // Limpiar nombre: quitar acentos, espacios, caracteres especiales
    const cleanName = teacherName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // Quitar acentos
        .replace(/[^a-z0-9]/g, '-')       // Solo alfanuméricos y guiones
        .replace(/-+/g, '-')              // Colapsar guiones múltiples
        .replace(/^-|-$/g, '')            // Quitar guiones al inicio/fin
        .substring(0, 20);                // Limitar largo

    // Sufijo aleatorio de 6 caracteres
    const suffix = Math.random().toString(36).substring(2, 8);
    
    return `${cleanName}-${suffix}`;
};

module.exports = mongoose.model('TeacherInvite', teacherInviteSchema);
