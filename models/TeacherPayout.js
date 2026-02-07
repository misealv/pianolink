/**
 * models/TeacherPayout.js
 * Pagos mensuales a profesores
 * 
 * Agrupa todas las ClassSessions validadas de un período y procesa el pago.
 * Incluye auditoría completa y estados de aprobación.
 */

const mongoose = require('mongoose');

const teacherPayoutSchema = new mongoose.Schema({
    // Profesor que recibe el pago
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // === PERÍODO ===
    periodStart: {
        type: Date,
        required: true
    },
    periodEnd: {
        type: Date,
        required: true
    },
    periodLabel: {
        type: String,
        default: ''  // Ej: "Enero 2026"
    },

    // === RESUMEN DE CLASES ===
    classesCompleted: {
        type: Number,
        default: 0
    },
    classesStudentNoShow: {
        type: Number,
        default: 0  // También se pagan
    },
    classesTeacherNoShow: {
        type: Number,
        default: 0  // No se pagan
    },
    classesDisputed: {
        type: Number,
        default: 0
    },
    totalClassesPaid: {
        type: Number,
        default: 0
    },

    // === MONTOS (en centavos USD) ===
    grossAmountUSD: {
        type: Number,
        default: 0  // Total antes de comisión
    },
    platformFeeUSD: {
        type: Number,
        default: 0  // 20% para PianoLink
    },
    netPayoutUSD: {
        type: Number,
        default: 0  // 80% para el profesor
    },

    // Ajustes manuales (bonos, descuentos, etc.)
    adjustments: [{
        description: String,
        amountUSD: Number,  // Positivo = bono, Negativo = descuento
        createdAt: { type: Date, default: Date.now },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    totalAdjustmentsUSD: {
        type: Number,
        default: 0
    },
    finalPayoutUSD: {
        type: Number,
        default: 0  // netPayoutUSD + totalAdjustmentsUSD
    },

    // === ESTADO ===
    status: {
        type: String,
        enum: [
            'calculating',      // Agregando sesiones
            'pending-review',   // Listo para revisión admin
            'approved',         // Aprobado, pendiente de pago
            'processing',       // Pago en proceso
            'paid',             // Pagado exitosamente
            'failed',           // Error en el pago
            'cancelled'         // Cancelado
        ],
        default: 'calculating',
        index: true
    },

    // === APROBACIÓN ===
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewedAt: {
        type: Date
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedAt: {
        type: Date
    },
    approvalNotes: {
        type: String,
        default: ''
    },

    // === PAGO ===
    paymentProvider: {
        type: String,
        enum: ['mercadopago', 'stripe', 'paypal', 'bank_transfer', 'manual'],
        default: 'mercadopago'
    },
    paymentMethod: {
        type: String,
        default: ''  // Ej: "cuenta bancaria", "paypal email"
    },
    paymentDestination: {
        type: String,
        default: ''  // Email o datos de cuenta (parcialmente ocultos)
    },
    externalPaymentId: {
        type: String,
        default: ''
    },
    paidAt: {
        type: Date
    },
    paymentErrorMessage: {
        type: String,
        default: ''
    },

    // === DOCUMENTO TRIBUTARIO ===
    // Genérico para: Boleta de honorarios (Chile), Factura (AR/MX/ES), Invoice (USA), etc.
    invoice: {
        // Tipo de documento
        type: {
            type: String,
            enum: ['boleta_honorarios', 'factura', 'invoice', 'recibo', 'otro'],
            default: 'boleta_honorarios'
        },
        // Número o folio del documento
        number: {
            type: String,
            default: ''
        },
        // Fecha de emisión
        issueDate: {
            type: Date
        },
        // Monto en el documento (debe coincidir con finalPayoutUSD)
        amount: {
            type: Number,
            default: 0
        },
        // Moneda del documento
        currency: {
            type: String,
            default: 'USD'
        },
        // URL del documento (si se sube en futuro)
        documentUrl: {
            type: String,
            default: ''
        },
        // Estado del documento
        status: {
            type: String,
            enum: ['not_submitted', 'submitted', 'verified', 'rejected'],
            default: 'not_submitted'
        },
        // Cuándo el profesor lo envió
        submittedAt: {
            type: Date
        },
        // Notas del profesor al enviar
        submittedNotes: {
            type: String,
            default: ''
        },
        // Verificación por admin
        verifiedAt: {
            type: Date
        },
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        // Si fue rechazado
        rejectedAt: {
            type: Date
        },
        rejectedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        rejectionReason: {
            type: String,
            default: ''
        }
    },

    // === SESIONES INCLUIDAS ===
    sessions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassSession'
    }],

    // === AUDITORÍA ===
    statusHistory: [{
        status: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        notes: String
    }],

    // Metadata para debugging
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

// Índices
teacherPayoutSchema.index({ status: 1, periodEnd: 1 });
teacherPayoutSchema.index({ teacherId: 1, periodStart: 1 });

// Virtual: Monto en dólares formateado
teacherPayoutSchema.virtual('finalPayoutFormatted').get(function() {
    return `$${(this.finalPayoutUSD / 100).toFixed(2)} USD`;
});

// Método: Agregar sesión al payout
teacherPayoutSchema.methods.addSession = async function(session) {
    if (this.sessions.includes(session._id)) return this;
    
    this.sessions.push(session._id);
    this.grossAmountUSD += session.pricePerClassUSD;
    this.platformFeeUSD += session.platformFeeUSD;
    this.netPayoutUSD += session.teacherPayoutUSD;
    
    if (session.status === 'completed') {
        this.classesCompleted += 1;
    } else if (session.status === 'student-noshow') {
        this.classesStudentNoShow += 1;
    }
    
    this.totalClassesPaid = this.classesCompleted + this.classesStudentNoShow;
    this.finalPayoutUSD = this.netPayoutUSD + this.totalAdjustmentsUSD;
    
    return this.save();
};

// Método: Agregar ajuste
teacherPayoutSchema.methods.addAdjustment = async function(description, amountUSD, adminId) {
    this.adjustments.push({
        description,
        amountUSD,
        createdBy: adminId
    });
    
    this.totalAdjustmentsUSD = this.adjustments.reduce((sum, adj) => sum + adj.amountUSD, 0);
    this.finalPayoutUSD = this.netPayoutUSD + this.totalAdjustmentsUSD;
    
    return this.save();
};

// Método: Aprobar payout
teacherPayoutSchema.methods.approve = async function(adminId, notes = '') {
    this.status = 'approved';
    this.approvedBy = adminId;
    this.approvedAt = new Date();
    this.approvalNotes = notes;
    
    this.statusHistory.push({
        status: 'approved',
        changedBy: adminId,
        notes
    });
    
    return this.save();
};

// Método: Marcar como pagado
teacherPayoutSchema.methods.markPaid = async function(externalPaymentId, provider) {
    this.status = 'paid';
    this.paidAt = new Date();
    this.externalPaymentId = externalPaymentId;
    this.paymentProvider = provider;
    
    this.statusHistory.push({
        status: 'paid',
        notes: `Pago procesado: ${externalPaymentId}`
    });
    
    // Marcar todas las sesiones como pagadas
    const ClassSession = mongoose.model('ClassSession');
    await ClassSession.updateMany(
        { _id: { $in: this.sessions } },
        { 
            payoutStatus: 'paid',
            payoutBatchId: this._id
        }
    );
    
    return this.save();
};

// Método estático: Crear o obtener payout del período actual
teacherPayoutSchema.statics.getOrCreateForPeriod = async function(teacherId, periodStart, periodEnd) {
    let payout = await this.findOne({
        teacherId,
        periodStart: { $gte: periodStart },
        periodEnd: { $lte: periodEnd },
        status: { $in: ['calculating', 'pending-review'] }
    });
    
    if (!payout) {
        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const month = months[periodStart.getMonth()];
        const year = periodStart.getFullYear();
        
        payout = new this({
            teacherId,
            periodStart,
            periodEnd,
            periodLabel: `${month} ${year}`,
            status: 'calculating'
        });
        await payout.save();
    }
    
    return payout;
};

module.exports = mongoose.model('TeacherPayout', teacherPayoutSchema);
