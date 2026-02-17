/**
 * models/Coupon.js
 * Modelo de cupones de descuento.
 * 
 * Soporta cupones automáticos (ej: waitlist → 15% x 3 compras)
 * y cupones manuales creados por admin.
 * 
 * Los montos se manejan en centavos USD para consistencia.
 */

const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    // Código visible del cupón (ej: WL-A3F2, PROMO10, etc.)
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
        index: true
    },

    // Tipo de descuento
    discountType: {
        type: String,
        enum: ['percentage', 'fixed_amount'],
        required: true
    },

    // Valor del descuento (% o centavos USD según discountType)
    discountValue: {
        type: Number,
        required: true,
        min: 1
    },

    // Descripción interna para admin
    description: {
        type: String,
        default: ''
    },

    // ¿A qué tipos de compra aplica?
    applicableTo: [{
        type: String,
        enum: ['class_payment', 'kit_purchase', 'membership', 'early_bird_kit']
    }],

    // Límites de uso
    maxUses: {
        type: Number,
        default: 1,
        min: 1
    },
    usesRemaining: {
        type: Number,
        default: 1,
        min: 0
    },

    // Historial de usos
    usageHistory: [{
        usedAt: { type: Date, default: Date.now },
        paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
        purchaseType: String,
        originalAmount: Number,   // centavos
        discountedAmount: Number, // centavos
        savedAmount: Number       // centavos
    }],

    // Asignación (cupón personal vs genérico)
    assignedToEmail: {
        type: String,
        lowercase: true,
        trim: true,
        index: true
    },
    assignedToUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    // Origen del cupón
    source: {
        type: String,
        enum: ['waitlist', 'admin', 'referral', 'promotion', 'compensation'],
        default: 'admin'
    },

    // Estado
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },

    // Vigencia
    expiresAt: {
        type: Date,
        default: null,
        index: true
    },

    // Monto mínimo de compra para aplicar (centavos USD, 0 = sin mínimo)
    minPurchaseAmount: {
        type: Number,
        default: 0
    },

    // Monto máximo de descuento (centavos USD, 0 = sin tope)
    maxDiscountAmount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// === ÍNDICES ===
couponSchema.index({ assignedToEmail: 1, isActive: 1 });
couponSchema.index({ assignedToUserId: 1, isActive: 1 });
couponSchema.index({ source: 1 });
couponSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $ne: null } } });

// === MÉTODOS DE INSTANCIA ===

/**
 * Verificar si el cupón es válido para usarse
 */
couponSchema.methods.isValid = function(purchaseType = null, purchaseAmountCents = 0) {
    if (!this.isActive) return { valid: false, reason: 'Cupón inactivo' };
    if (this.usesRemaining <= 0) return { valid: false, reason: 'Cupón agotado' };
    if (this.expiresAt && this.expiresAt < new Date()) return { valid: false, reason: 'Cupón expirado' };
    if (purchaseType && this.applicableTo.length > 0 && !this.applicableTo.includes(purchaseType)) {
        return { valid: false, reason: `No aplica a ${purchaseType}` };
    }
    if (this.minPurchaseAmount > 0 && purchaseAmountCents < this.minPurchaseAmount) {
        return { valid: false, reason: `Monto mínimo: $${(this.minPurchaseAmount / 100).toFixed(2)}` };
    }
    return { valid: true };
};

/**
 * Calcular descuento en centavos USD
 */
couponSchema.methods.calculateDiscount = function(amountCents) {
    let discount = 0;

    if (this.discountType === 'percentage') {
        discount = Math.round(amountCents * this.discountValue / 100);
    } else {
        discount = this.discountValue; // ya en centavos
    }

    // Aplicar tope si existe
    if (this.maxDiscountAmount > 0 && discount > this.maxDiscountAmount) {
        discount = this.maxDiscountAmount;
    }

    // No puede ser mayor que el monto total
    if (discount > amountCents) {
        discount = amountCents;
    }

    return discount;
};

/**
 * Registrar un uso del cupón
 */
couponSchema.methods.recordUsage = async function(paymentId, purchaseType, originalAmountCents, discountedAmountCents) {
    this.usesRemaining = Math.max(0, this.usesRemaining - 1);
    this.usageHistory.push({
        paymentId,
        purchaseType,
        originalAmount: originalAmountCents,
        discountedAmount: discountedAmountCents,
        savedAmount: originalAmountCents - discountedAmountCents
    });

    // Desactivar si se agotaron los usos
    if (this.usesRemaining <= 0) {
        this.isActive = false;
    }

    return this.save();
};

// === MÉTODOS ESTÁTICOS ===

/**
 * Buscar cupón válido por email
 */
couponSchema.statics.findActiveByEmail = async function(email, purchaseType = null) {
    const filter = {
        assignedToEmail: email.toLowerCase(),
        isActive: true,
        usesRemaining: { $gt: 0 },
        $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
        ]
    };

    if (purchaseType) {
        filter.$or = [
            { applicableTo: { $size: 0 } },         // Aplica a todo
            { applicableTo: purchaseType },           // Aplica a este tipo
            ...(filter.$or || [])
        ];
        // Reestructurar para incluir ambas condiciones
        const expireCondition = [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
        ];
        const typeCondition = [
            { applicableTo: { $size: 0 } },
            { applicableTo: purchaseType }
        ];
        delete filter.$or;
        filter.$and = [
            { $or: expireCondition },
            { $or: typeCondition }
        ];
    }

    // Devolver el mejor cupón (mayor descuento primero)
    return this.findOne(filter).sort({ discountValue: -1 });
};

/**
 * Buscar cupón válido por userId
 */
couponSchema.statics.findActiveByUserId = async function(userId, purchaseType = null) {
    const filter = {
        assignedToUserId: userId,
        isActive: true,
        usesRemaining: { $gt: 0 }
    };

    const expireCondition = [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
    ];

    if (purchaseType) {
        const typeCondition = [
            { applicableTo: { $size: 0 } },
            { applicableTo: purchaseType }
        ];
        filter.$and = [
            { $or: expireCondition },
            { $or: typeCondition }
        ];
    } else {
        filter.$or = expireCondition;
    }

    return this.findOne(filter).sort({ discountValue: -1 });
};

/**
 * Buscar cupón por código
 */
couponSchema.statics.findByCode = async function(code) {
    return this.findOne({ code: code.toUpperCase().trim() });
};

/**
 * Generar código único para cupones automáticos
 */
couponSchema.statics.generateCode = function(prefix = 'WL') {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin I, O, 0, 1 para evitar confusión
    let suffix = '';
    for (let i = 0; i < 6; i++) {
        suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${prefix}-${suffix}`;
};

module.exports = mongoose.model('Coupon', couponSchema);
