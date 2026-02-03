/**
 * models/Withdrawal.js
 * Sistema de Retiros para Profesores (Wallet)
 * 
 * Los profesores acumulan ganancias en User.teacherData.earnings.pending
 * Cuando solicitan retiro, se crea un Withdrawal y pasa a 'processing'
 * Una vez pagado, se mueve a 'completed' y el saldo a earnings.paid
 */
const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
    // Profesor que solicita
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // ==================== MONTO ====================
    amount: {
        type: Number,
        required: true,
        min: [10, 'Mínimo de retiro: $10 USD']
    },
    
    currency: {
        type: String,
        default: 'USD'
    },
    
    // Comisiones de transferencia (si aplica)
    transferFee: {
        type: Number,
        default: 0
    },
    
    // Monto neto que recibe el profesor
    netAmount: {
        type: Number
    },
    
    // ==================== MÉTODO DE PAGO ====================
    paymentMethod: {
        type: {
            type: String,
            enum: ['paypal', 'bank_transfer', 'wise', 'crypto'],
            required: true
        },
        
        // PayPal
        paypalEmail: { type: String },
        
        // Transferencia bancaria
        bankDetails: {
            bankName: String,
            accountNumber: String,
            accountType: String,  // 'checking', 'savings'
            routingNumber: String,
            swiftCode: String,
            country: String
        },
        
        // Wise
        wiseEmail: { type: String },
        
        // Crypto (futuro)
        cryptoAddress: { type: String },
        cryptoNetwork: { type: String }
    },
    
    // ==================== ESTADO ====================
    status: {
        type: String,
        enum: [
            'pending',      // Solicitado, esperando aprobación
            'approved',     // Aprobado, listo para procesar
            'processing',   // En proceso de transferencia
            'completed',    // Pagado exitosamente
            'rejected',     // Rechazado (fondos insuficientes, datos incorrectos)
            'cancelled'     // Cancelado por el profesor
        ],
        default: 'pending'
    },
    
    // ==================== TRACKING ====================
    requestedAt: {
        type: Date,
        default: Date.now
    },
    
    approvedAt: { type: Date },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'  // Admin que aprobó
    },
    
    processedAt: { type: Date },
    completedAt: { type: Date },
    
    // Referencia de la transferencia (para auditoría)
    transactionReference: { type: String },
    
    // ==================== NOTAS ====================
    teacherNotes: { type: String },  // Notas del profesor
    adminNotes: { type: String },    // Notas del admin
    
    // Razón de rechazo (si aplica)
    rejectionReason: { type: String },
    
    // ==================== CLASES INCLUIDAS ====================
    // IDs de las sesiones que generaron estas ganancias
    includedSessions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session'
    }],
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Índices
withdrawalSchema.index({ teacherId: 1 });
withdrawalSchema.index({ status: 1 });
withdrawalSchema.index({ requestedAt: -1 });

// Calcular netAmount antes de guardar
withdrawalSchema.pre('save', function(next) {
    this.netAmount = this.amount - (this.transferFee || 0);
    this.updatedAt = new Date();
    next();
});

// Método estático: Obtener balance disponible de un profesor
withdrawalSchema.statics.getAvailableBalance = async function(teacherId) {
    const User = mongoose.model('User');
    const user = await User.findById(teacherId);
    
    if (!user || user.role !== 'teacher') {
        throw new Error('Profesor no encontrado');
    }
    
    // Retiros pendientes (bloquean ese saldo)
    const pendingWithdrawals = await this.find({
        teacherId,
        status: { $in: ['pending', 'approved', 'processing'] }
    });
    
    const pendingAmount = pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0);
    const availableBalance = (user.teacherData?.earnings?.pending || 0) - pendingAmount;
    
    return {
        totalPending: user.teacherData?.earnings?.pending || 0,
        inWithdrawProcess: pendingAmount,
        availableForWithdrawal: Math.max(0, availableBalance),
        totalPaid: user.teacherData?.earnings?.paid || 0,
        totalClasses: user.teacherData?.earnings?.totalClasses || 0
    };
};

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
