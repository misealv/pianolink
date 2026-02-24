/**
 * models/Enrollment.js
 * Relación Alumno-Profesor - PianoLink v2.0
 * 
 * Determina qué alumnos están inscritos con qué profesores
 * y a qué sala tienen acceso.
 */

const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema({
    // Alumno inscrito
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Profesor asignado
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Sala donde estudia
    roomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: true
    },

    // Estado de la inscripción
    status: {
        type: String,
        enum: ['active', 'paused', 'cancelled'],
        default: 'active'
    },

    // Horario de clases programadas
    schedule: [{
        day: {
            type: String,
            enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        },
        time: String,           // '15:00'
        duration: {
            type: Number,
            default: 60         // minutos
        }
    }],

    // ==================== ORIGEN DEL ALUMNO (v5.0) ====================
    // Distingue si el alumno llegó por la plataforma o por invitación privada
    source: {
        type: String,
        enum: ['platform', 'private_invite'],
        default: 'platform'
    },

    // Código de invitación usado (si aplica)
    inviteCode: { type: String, default: '' },

    // Clases pre-pagadas al profesor fuera de la plataforma
    // Se asignan al registrar alumno con invitación privada
    preloadedClasses: { type: Number, default: 0, min: 0 },
    // ⚠️ DEPRECADO (Sprint 2): Usar StudentSubscription.classesRemaining como fuente de verdad.
    // Este campo se mantiene por retrocompatibilidad. Ver BalanceService.
    classesRemaining: { type: Number, default: 0, min: 0 },

    // Comisión aplicada en esta relación (se calcula al crear enrollment)
    appliedCommission: {
        platformPercent: { type: Number, default: 20 },   // % PianoLink (25, 15, o 0)
        teacherPercent: { type: Number, default: 80 },    // % profesor (75, 85, o 100)
        reason: { type: String, default: '' }              // Ej: 'free_plan_platform'
    },

    // Notas del profesor sobre este alumno
    notes: {
        type: String,
        default: ''
    },

    // Fecha de inicio y fin
    startDate: {
        type: Date,
        default: Date.now
    },
    
    endDate: Date,              // null = indefinido

    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Índices
enrollmentSchema.index({ studentId: 1, teacherId: 1 }, { unique: true });
enrollmentSchema.index({ teacherId: 1, status: 1 });
enrollmentSchema.index({ roomId: 1 });

// Verificar si el alumno puede acceder a la sala
enrollmentSchema.statics.canAccessRoom = async function(studentId, roomId) {
    const enrollment = await this.findOne({
        studentId,
        roomId,
        status: 'active'
    });
    return !!enrollment;
};

// Obtener todos los alumnos de un profesor
enrollmentSchema.statics.getStudentsByTeacher = function(teacherId) {
    return this.find({ teacherId, status: 'active' })
        .populate('studentId', 'name email')
        .populate('roomId', 'code name');
};

// Obtener el profesor de un alumno
enrollmentSchema.statics.getTeacherByStudent = function(studentId) {
    return this.findOne({ studentId, status: 'active' })
        .populate('teacherId', 'name email branding')
        .populate('roomId', 'code name');
};

module.exports = mongoose.model('Enrollment', enrollmentSchema);
