/**
 * models/TeacherPackage.js
 * Paquetes de clases configurados por el profesor
 * 
 * Cada profesor puede tener múltiples paquetes por categoría (piano, teoría, armonía, etc.)
 * El estudiante compra un paquete y se crea una StudentSubscription
 */

const mongoose = require('mongoose');

const teacherPackageSchema = new mongoose.Schema({
    // Profesor dueño del paquete
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Categoría/Ramo del paquete
    category: {
        type: String,
        enum: ['piano', 'teoria', 'armonia', 'solfeo', 'composicion', 'improvisacion', 'otro'],
        default: 'piano'
    },
    categoryCustom: {
        type: String,
        default: ''  // Si category es 'otro'
    },

    // Nombre descriptivo del paquete
    name: {
        type: String,
        required: true,
        trim: true
    },

    description: {
        type: String,
        default: ''
    },

    // === CLASES ===
    classCount: {
        type: Number,
        required: true,
        min: 1
    },
    classDurationMinutes: {
        type: Number,
        default: 45,
        enum: [30, 45, 60, 90]
    },

    // === PRECIO (en centavos USD) ===
    priceUSD: {
        type: Number,
        required: true,
        min: 100  // Mínimo $1 USD
    },
    // Precio por clase calculado (para mostrar al estudiante)
    pricePerClassUSD: {
        type: Number,
        default: function() {
            return Math.round(this.priceUSD / this.classCount);
        }
    },

    // === VIGENCIA ===
    validityDays: {
        type: Number,
        required: true,
        default: 30,
        min: 7
    },

    // === COBRO RECURRENTE ===
    isRecurring: {
        type: Boolean,
        default: true
    },
    billingCycleDays: {
        type: Number,
        default: 30  // Cada cuántos días se cobra
    },

    // === VISIBILIDAD ===
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    isFeatured: {
        type: Boolean,
        default: false  // Destacado en el perfil del profesor
    },

    // === ESTADÍSTICAS ===
    stats: {
        totalSold: { type: Number, default: 0 },
        activeSubscriptions: { type: Number, default: 0 },
        revenue: { type: Number, default: 0 }  // Total generado en centavos
    }
}, {
    timestamps: true
});

// Índice compuesto para búsquedas
teacherPackageSchema.index({ teacherId: 1, isActive: 1 });
teacherPackageSchema.index({ category: 1, isActive: 1 });

// Virtual: Nombre completo de categoría
teacherPackageSchema.virtual('categoryName').get(function() {
    const names = {
        'piano': 'Clases de Piano',
        'teoria': 'Teoría Musical',
        'armonia': 'Armonía',
        'solfeo': 'Solfeo',
        'composicion': 'Composición',
        'improvisacion': 'Improvisación',
        'otro': this.categoryCustom || 'Otro'
    };
    return names[this.category] || this.category;
});

// Método: Calcular precio en moneda local
teacherPackageSchema.methods.getPriceInCurrency = function(currency, rate) {
    // rate es el tipo de cambio (ej: 950 para CLP)
    return Math.round(this.priceUSD * rate / 100);
};

// Pre-save: Recalcular precio por clase
teacherPackageSchema.pre('save', function(next) {
    if (this.classCount > 0) {
        this.pricePerClassUSD = Math.round(this.priceUSD / this.classCount);
    }
    next();
});

module.exports = mongoose.model('TeacherPackage', teacherPackageSchema);
