/**
 * models/ClassRecord.js
 * Registro de Clase Individual - PianoLink v3.0
 * 
 * PROPÓSITO:
 * Se crea UN ClassRecord por cada participante al finalizar una clase.
 * Este documento es la fuente de verdad para billing y estadísticas.
 * 
 * RELACIONES:
 * - Session: datos de la clase completa (MIDI stats, duración, etc.)
 * - ClassRecord: registro individual por estudiante (billing, asistencia)
 * - LedgerEntry: referencia a ClassRecord para auditoría financiera
 */

const mongoose = require('mongoose');

const classRecordSchema = new mongoose.Schema({
    // === IDENTIFICACIÓN ===
    
    // Sesión de origen (Session model)
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session',
        required: true,
        index: true
    },

    // Sala donde ocurrió
    roomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: true
    },

    roomCode: {
        type: String,
        required: true,
        uppercase: true
    },

    // Booking asociado (si la clase fue agendada)
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        default: null
    },

    // === PROFESOR ===
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    teacherName: {
        type: String,
        required: true
    },

    // === ESTUDIANTE ===
    
    // Si es cliente registrado, tenemos su userId
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null  // NULL = invitado
    },

    // Nombre (siempre presente)
    studentName: {
        type: String,
        required: true
    },

    // Tipo de estudiante (CRÍTICO para billing)
    studentType: {
        type: String,
        enum: ['client', 'guest'],
        required: true
    },

    // Socket ID para tracking (temporal)
    studentSocketId: {
        type: String,
        required: true
    },

    // === TIEMPO ===
    
    classDate: {
        type: Date,
        required: true,
        default: Date.now
    },

    joinTime: {
        type: Date,
        required: true
    },

    leaveTime: {
        type: Date,
        required: true
    },

    // Duración en minutos (calculada)
    duration: {
        type: Number,
        required: true,
        min: 0
    },

    // === BILLING (Solo para studentType: 'client') ===
    
    billingType: {
        type: String,
        enum: [
            'platform',  // Cliente paga a través de PianoLink (genera transacción)
            'external',  // Profesor cobra directo (membresía del profesor)
            'none'       // Clase de práctica/demo (sin cobro)
        ],
        required: true
    },

    // Precios (solo si billingType = 'platform')
    price: {
        // Precio completo de la clase
        grossAmount: {
            type: Number,
            default: 0
        },
        
        // Comisión de PianoLink (20% por defecto)
        platformFee: {
            type: Number,
            default: 0
        },
        
        // Lo que recibe el profesor (80% por defecto)
        netAmount: {
            type: Number,
            default: 0
        },
        
        // Porcentaje aplicado al profesor
        teacherPercent: {
            type: Number,
            default: 80
        },
        
        // Moneda
        currency: {
            type: String,
            default: 'USD'
        }
    },

    // === ESTADO DE PROCESAMIENTO ===
    
    status: {
        type: String,
        enum: [
            'pending',      // Recién creado, esperando procesamiento
            'processed',    // Ledger entries creadas
            'disputed',     // En disputa (cliente reclama)
            'refunded',     // Reembolsado
            'voided'        // Anulado (error, duplicado, etc.)
        ],
        default: 'pending'
    },

    // Referencia al LedgerEntry generado
    ledgerEntryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LedgerEntry',
        default: null
    },

    // === MÉTRICAS DE LA CLASE (snapshot del Session) ===
    
    metrics: {
        // Actividad MIDI del estudiante
        notesPlayed: {
            type: Number,
            default: 0
        },
        
        // ¿Usó el chat?
        chatMessages: {
            type: Number,
            default: 0
        },
        
        // ¿Fue broadcaster en algún momento?
        wasBroadcaster: {
            type: Boolean,
            default: false
        },
        
        // Calidad de conexión promedio
        connectionQuality: {
            type: String,
            enum: ['excellent', 'good', 'fair', 'poor', 'unknown'],
            default: 'unknown'
        }
    },

    // === AUDITORÍA ===
    
    audit: {
        // Cómo se generó este registro
        createdBy: {
            type: String,
            enum: ['system', 'admin', 'teacher'],
            default: 'system'
        },
        
        // ID si fue creado manualmente
        createdByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        
        // Notas adicionales
        notes: {
            type: String,
            default: ''
        },
        
        // IP del estudiante (para auditoría)
        studentIp: String,
        
        // User Agent
        userAgent: String
    },

    createdAt: {
        type: Date,
        default: Date.now,
        immutable: true
    },

    updatedAt: {
        type: Date,
        default: Date.now
    }

}, {
    timestamps: { createdAt: false, updatedAt: true }
});

// === ÍNDICES ===
classRecordSchema.index({ teacherId: 1, classDate: -1 });
classRecordSchema.index({ studentId: 1, classDate: -1 });
classRecordSchema.index({ sessionId: 1 });
classRecordSchema.index({ bookingId: 1 });
classRecordSchema.index({ status: 1 });
classRecordSchema.index({ billingType: 1, status: 1 });
classRecordSchema.index({ 'price.currency': 1, classDate: -1 });

// === MÉTODOS ESTÁTICOS ===

/**
 * Crear registro para un cliente (con billing)
 */
classRecordSchema.statics.createForClient = async function(sessionData, studentData, priceConfig) {
    const grossAmount = priceConfig.classPrice || 0;
    const teacherPercent = priceConfig.teacherPercent || 80;
    const netAmount = grossAmount * (teacherPercent / 100);
    const platformFee = grossAmount - netAmount;

    return this.create({
        sessionId: sessionData.sessionId,
        roomId: sessionData.roomId,
        roomCode: sessionData.roomCode,
        bookingId: sessionData.bookingId || null,
        teacherId: sessionData.teacherId,
        teacherName: sessionData.teacherName,
        studentId: studentData.userId,
        studentName: studentData.name,
        studentType: 'client',
        studentSocketId: studentData.socketId,
        classDate: sessionData.startTime,
        joinTime: studentData.joinTime,
        leaveTime: studentData.leaveTime,
        duration: studentData.duration,
        billingType: 'platform',
        price: {
            grossAmount,
            platformFee,
            netAmount,
            teacherPercent,
            currency: priceConfig.currency || 'USD'
        },
        status: 'pending',
        metrics: studentData.metrics || {},
        audit: {
            createdBy: 'system',
            studentIp: studentData.ip,
            userAgent: studentData.userAgent
        }
    });
};

/**
 * Crear registro para un invitado (sin billing)
 */
classRecordSchema.statics.createForGuest = async function(sessionData, studentData) {
    return this.create({
        sessionId: sessionData.sessionId,
        roomId: sessionData.roomId,
        roomCode: sessionData.roomCode,
        teacherId: sessionData.teacherId,
        teacherName: sessionData.teacherName,
        studentId: null,  // No hay userId
        studentName: studentData.name,
        studentType: 'guest',
        studentSocketId: studentData.socketId,
        classDate: sessionData.startTime,
        joinTime: studentData.joinTime,
        leaveTime: studentData.leaveTime,
        duration: studentData.duration,
        billingType: 'external',  // Profesor cobra por su cuenta
        status: 'processed',  // No requiere procesamiento de billing
        metrics: studentData.metrics || {},
        audit: {
            createdBy: 'system',
            studentIp: studentData.ip,
            userAgent: studentData.userAgent,
            notes: 'Clase con invitado - pago externo/membresía del profesor'
        }
    });
};

/**
 * Marcar como procesado y vincular LedgerEntry
 */
classRecordSchema.statics.markAsProcessed = async function(recordId, ledgerEntryId) {
    return this.findByIdAndUpdate(recordId, {
        status: 'processed',
        ledgerEntryId,
        updatedAt: new Date()
    }, { new: true });
};

/**
 * Obtener resumen de clases por profesor
 */
classRecordSchema.statics.getTeacherSummary = async function(teacherId, startDate, endDate) {
    const match = { teacherId: new mongoose.Types.ObjectId(teacherId) };
    
    if (startDate || endDate) {
        match.classDate = {};
        if (startDate) match.classDate.$gte = startDate;
        if (endDate) match.classDate.$lte = endDate;
    }

    return this.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$studentType',
                totalClasses: { $sum: 1 },
                totalMinutes: { $sum: '$duration' },
                totalGross: { $sum: '$price.grossAmount' },
                totalNet: { $sum: '$price.netAmount' },
                totalFees: { $sum: '$price.platformFee' }
            }
        }
    ]);
};

/**
 * Obtener historial de un estudiante
 */
classRecordSchema.statics.getStudentHistory = async function(studentId, limit = 50) {
    return this.find({ studentId })
        .sort({ classDate: -1 })
        .limit(limit)
        .populate('teacherId', 'name email')
        .populate('sessionId', 'duration midiStats');
};

/**
 * Verificar si ya existe un registro para esta sesión y estudiante
 */
classRecordSchema.statics.existsForSession = async function(sessionId, studentSocketId) {
    const existing = await this.findOne({
        sessionId,
        studentSocketId
    });
    return !!existing;
};

// === MÉTODOS DE INSTANCIA ===

/**
 * Calcular y actualizar duración
 */
classRecordSchema.methods.calculateDuration = function() {
    if (this.joinTime && this.leaveTime) {
        this.duration = Math.round((this.leaveTime - this.joinTime) / 1000 / 60);
    }
    return this.duration;
};

/**
 * Verificar si la clase califica para billing
 */
classRecordSchema.methods.qualifiesForBilling = function() {
    // Mínimo 5 minutos para cobrar
    const MIN_DURATION = 5;
    
    return (
        this.studentType === 'client' &&
        this.billingType === 'platform' &&
        this.duration >= MIN_DURATION &&
        this.status === 'pending'
    );
};

module.exports = mongoose.model('ClassRecord', classRecordSchema);
