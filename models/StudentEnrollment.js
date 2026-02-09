/**
 * models/StudentEnrollment.js
 * 
 * Representa la relación entre un estudiante y un profesor.
 * Guarda la tarifa congelada, clases compradas/usadas, y fechas importantes.
 * 
 * Política de tarifas:
 * - La tarifa se congela por 1 año desde la primera compra
 * - El profesor puede subir la tarifa a nuevos estudiantes inmediatamente
 * - A estudiantes existentes solo puede subir 1 vez al año
 */

const mongoose = require('mongoose');

const studentEnrollmentSchema = mongoose.Schema({
    // Estudiante (puede ser User con role 'student' o 'client')
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Profesor
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Si el estudiante es un dependiente (hijo), guardar su nombre
    dependentName: { type: String, default: '' },
    
    // ==================== TARIFA CONGELADA ====================
    // Tarifa por clase en USD (congelada al momento de inscripción)
    frozenRate: { 
        type: Number, 
        required: true 
    },
    
    // Fecha en que se congeló la tarifa
    rateFrozenAt: { 
        type: Date, 
        default: Date.now 
    },
    
    // Fecha hasta la cual la tarifa está congelada (1 año desde rateFrozenAt)
    rateLockedUntil: { 
        type: Date 
    },
    
    // Historial de cambios de tarifa (para auditoría)
    rateHistory: [{
        rate: { type: Number, required: true },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: String, default: 'system' } // 'teacher', 'admin', 'system'
    }],
    
    // ==================== CLASES ====================
    // Clases compradas (total histórico)
    classesPurchased: { type: Number, default: 0 },
    
    // Clases disponibles (por usar)
    classesRemaining: { type: Number, default: 0 },
    
    // Clases completadas
    classesCompleted: { type: Number, default: 0 },
    
    // Clases canceladas (con pérdida o sin)
    classesCancelled: { type: Number, default: 0 },
    
    // Fecha de expiración del paquete actual
    classesExpiresAt: { type: Date },
    
    // ==================== CLASE DE PRUEBA ====================
    // Si ya tomó clase de prueba con este profesor
    trialClassTaken: { type: Boolean, default: false },
    trialClassDate: { type: Date },
    
    // ==================== COMPRAS ====================
    // Historial de compras con este profesor
    purchases: [{
        date: { type: Date, default: Date.now },
        classes: { type: Number, required: true },
        pricePerClass: { type: Number, required: true }, // Precio que pagó el estudiante
        totalPaid: { type: Number, required: true },     // Total pagado (incluye comisión PL)
        teacherEarnings: { type: Number, required: true }, // 80% para el profesor
        platformFee: { type: Number, required: true },    // 20% para PianoLink
        packageDiscount: { type: Number, default: 0 },    // % descuento aplicado
        validDays: { type: Number, default: 30 },         // Días de vigencia del paquete
        expiresAt: { type: Date },                        // Fecha de expiración calculada
        stripePaymentId: { type: String },
        paypalOrderId: { type: String }
    }],
    
    // ==================== ESTADO ====================
    status: {
        type: String,
        enum: ['active', 'paused', 'completed', 'cancelled'],
        default: 'active'
    },
    
    // Notas del profesor sobre el estudiante
    teacherNotes: { type: String, default: '' },
    
    // Nivel del estudiante según el profesor
    level: {
        type: String,
        enum: ['beginner', 'elementary', 'intermediate', 'advanced', 'professional'],
        default: 'beginner'
    },
    
    // ==================== FECHAS ====================
    // Fecha de inscripción
    enrolledAt: { type: Date, default: Date.now },
    
    // Última clase tomada
    lastClassAt: { type: Date },
    
    // Próxima clase agendada
    nextClassAt: { type: Date },
    
    // ==================== AVISOS DE EXPIRACIÓN ====================
    // Tracking de emails de aviso enviados (evitar duplicados)
    expirationWarnings: {
        day7Sent: { type: Boolean, default: false },
        day3Sent: { type: Boolean, default: false },
        day1Sent: { type: Boolean, default: false },
        expiredSent: { type: Boolean, default: false }
    }
    
}, { timestamps: true });

// Índices para búsquedas rápidas
studentEnrollmentSchema.index({ student: 1, teacher: 1 }, { unique: true });
studentEnrollmentSchema.index({ teacher: 1, status: 1 });
studentEnrollmentSchema.index({ student: 1, status: 1 });
studentEnrollmentSchema.index({ classesExpiresAt: 1, classesRemaining: 1 }); // Para job de expiración

// Método para verificar si se puede subir la tarifa
studentEnrollmentSchema.methods.canUpdateRate = function() {
    if (!this.rateLockedUntil) return true;
    return new Date() > this.rateLockedUntil;
};

// Método para actualizar la tarifa (respetando política de 1 año)
studentEnrollmentSchema.methods.updateRate = async function(newRate, changedBy = 'teacher') {
    if (!this.canUpdateRate()) {
        throw new Error(`La tarifa está congelada hasta ${this.rateLockedUntil.toLocaleDateString()}`);
    }
    
    // Guardar en historial
    this.rateHistory.push({
        rate: this.frozenRate,
        changedAt: new Date(),
        changedBy
    });
    
    // Actualizar tarifa y congelar por otro año
    this.frozenRate = newRate;
    this.rateFrozenAt = new Date();
    this.rateLockedUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // +1 año
    
    return await this.save();
};

// Método para comprar clases
studentEnrollmentSchema.methods.purchaseClasses = async function(classes, pricePerClass, paymentDetails = {}) {
    const totalPaid = classes * pricePerClass;
    const teacherEarnings = totalPaid * 0.80;
    const platformFee = totalPaid * 0.20;
    
    this.purchases.push({
        classes,
        pricePerClass,
        totalPaid,
        teacherEarnings,
        platformFee,
        packageDiscount: paymentDetails.discountPercent || 0,
        stripePaymentId: paymentDetails.stripePaymentId,
        paypalOrderId: paymentDetails.paypalOrderId
    });
    
    this.classesPurchased += classes;
    this.classesRemaining += classes;
    
    return await this.save();
};

// Método para usar una clase
studentEnrollmentSchema.methods.useClass = async function() {
    if (this.classesRemaining <= 0) {
        throw new Error('No hay clases disponibles');
    }
    
    this.classesRemaining -= 1;
    this.classesCompleted += 1;
    this.lastClassAt = new Date();
    
    return await this.save();
};

// Pre-save: calcular rateLockedUntil si no existe
studentEnrollmentSchema.pre('save', function(next) {
    if (this.rateFrozenAt && !this.rateLockedUntil) {
        this.rateLockedUntil = new Date(this.rateFrozenAt.getTime() + 365 * 24 * 60 * 60 * 1000);
    }
    next();
});

module.exports = mongoose.model('StudentEnrollment', studentEnrollmentSchema);
