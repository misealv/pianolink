/**
 * models/Product.js
 * Modelo para productos/planes de PayPal gestionados desde admin
 */

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    // Identificación
    name: {
        type: String,
        required: true
    },
    slug: {
        type: String,
        required: true,
        unique: true
    },
    description: {
        type: String,
        default: ''
    },
    
    // Tipo de producto
    type: {
        type: String,
        enum: ['one-time', 'subscription'],
        required: true
    },
    
    // Para quién es
    targetRole: {
        type: String,
        enum: ['student', 'teacher', 'any'],
        default: 'any'
    },
    
    // Precio
    price: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'USD'
    },
    
    // Frecuencia (solo para suscripciones)
    billingInterval: {
        type: String,
        enum: ['MONTH', 'YEAR', 'WEEK', 'DAY', null],
        default: null
    },
    billingIntervalCount: {
        type: Number,
        default: 1
    },
    
    // IDs de PayPal
    paypalProductId: {
        type: String,
        default: null
    },
    paypalPlanId: {
        type: String,
        default: null
    },
    
    // Estado
    isActive: {
        type: Boolean,
        default: true
    },
    
    // Restricciones
    requiresFounder: {
        type: Boolean,
        default: false
    },
    requiresKitPurchased: {
        type: Boolean,
        default: false
    },
    
    // Beneficios (para mostrar en UI)
    benefits: [{
        type: String
    }],
    
    // Metadatos
    metadata: {
        sessionsIncluded: { type: Number, default: 0 },
        sessionDuration: { type: Number, default: 0 }, // minutos
        includesCable: { type: Boolean, default: false },
        includesSetup: { type: Boolean, default: false }
    },
    
    // Estadísticas
    stats: {
        totalSales: { type: Number, default: 0 },
        totalRevenue: { type: Number, default: 0 },
        activeSubscriptions: { type: Number, default: 0 }
    },
    
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Actualizar updatedAt antes de guardar
productSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Métodos estáticos
productSchema.statics.findActiveBySlug = function(slug) {
    return this.findOne({ slug, isActive: true });
};

productSchema.statics.findActiveByRole = function(role) {
    return this.find({ 
        isActive: true,
        $or: [
            { targetRole: role },
            { targetRole: 'any' }
        ]
    });
};

productSchema.statics.incrementSales = async function(productId, amount) {
    return this.findByIdAndUpdate(productId, {
        $inc: {
            'stats.totalSales': 1,
            'stats.totalRevenue': amount
        }
    });
};

module.exports = mongoose.model('Product', productSchema);
