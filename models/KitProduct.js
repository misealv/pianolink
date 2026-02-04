const mongoose = require('mongoose');

/**
 * Productos opcionales para el Welcome Kit
 * Configurables desde el panel de administración
 */
const KitProductSchema = new mongoose.Schema({
    // Información básica
    name: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    description: {
        type: String,
        default: ''
    },
    shortDescription: {
        type: String,
        maxlength: 150,
        default: ''
    },
    
    // Categoría del producto
    category: {
        type: String,
        enum: ['keyboard', 'stand', 'pedal', 'cable', 'accessory', 'bundle'],
        required: true
    },
    
    // Subcategoría para teclados
    subcategory: {
        type: String,
        enum: ['beginner', 'intermediate', 'digital-piano', 'midi-controller', null],
        default: null
    },
    
    // Imágenes
    images: [{
        url: String,
        alt: String,
        isPrimary: Boolean
    }],
    
    // URL de imagen principal (simplificado para DSers/AliExpress)
    imageUrl: {
        type: String,
        default: ''
    },
    
    // Precios por región (similar a WelcomeKit pricing)
    pricing: [{
        regionCode: {
            type: String,
            required: true
        },
        regionName: String,
        price: {
            type: Number,
            required: true
        },
        currency: {
            type: String,
            default: 'USD'
        },
        shippingIncluded: {
            type: Boolean,
            default: true
        },
        shippingCost: {
            type: Number,
            default: 0
        },
        estimatedDays: {
            type: String,
            default: '15-25 días'
        }
    }],
    
    // Precio por defecto (cuando no hay región específica)
    defaultPrice: {
        type: Number,
        required: true
    },
    defaultCurrency: {
        type: String,
        default: 'USD'
    },
    
    // Información de fulfillment
    fulfillment: {
        provider: {
            type: String,
            enum: ['cjdropshipping', 'aliexpress', 'manual', 'affiliate', 'local'],
            default: 'cjdropshipping'
        },
        // SKU en CJDropshipping
        cjSku: {
            type: String,
            default: ''
        },
        // URL directa de AliExpress
        aliexpressUrl: {
            type: String,
            default: ''
        },
        // ID del producto en DSers (para tracking)
        dsersProductId: {
            type: String,
            default: ''
        },
        // Link de afiliado (si es affiliate)
        affiliateUrl: {
            type: String,
            default: ''
        },
        // Costo del producto (para calcular margen)
        costPrice: {
            type: Number,
            default: 0
        },
        // Peso estimado en kg
        weight: {
            type: Number,
            default: 0
        },
        // Dimensiones
        dimensions: {
            length: Number,
            width: Number,
            height: Number
        }
    },
    
    // Especificaciones del producto
    specs: {
        brand: String,
        model: String,
        // Para teclados
        keys: Number,
        weighted: Boolean,
        touchSensitive: Boolean,
        sounds: Number,
        // Para soportes
        adjustable: Boolean,
        maxWeight: Number,
        // Otras especificaciones como objeto flexible
        other: mongoose.Schema.Types.Mixed
    },
    
    // Opciones/variantes (ej: color)
    variants: [{
        name: String,
        options: [String],
        priceModifier: Number // +/- al precio base
    }],
    
    // Productos relacionados/recomendados
    relatedProducts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'KitProduct'
    }],
    
    // Bundle: productos incluidos
    bundleItems: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'KitProduct'
        },
        quantity: {
            type: Number,
            default: 1
        }
    }],
    
    // Estado y visibilidad
    isActive: {
        type: Boolean,
        default: true
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    displayOrder: {
        type: Number,
        default: 0
    },
    
    // Tags para búsqueda/filtrado
    tags: [String],
    
    // Notas internas (solo admin)
    adminNotes: {
        type: String,
        default: ''
    },
    
    // Stock (si aplica)
    stock: {
        trackStock: {
            type: Boolean,
            default: false
        },
        quantity: {
            type: Number,
            default: 0
        },
        lowStockAlert: {
            type: Number,
            default: 5
        }
    }
}, {
    timestamps: true
});

// Índices
KitProductSchema.index({ category: 1, isActive: 1 });
KitProductSchema.index({ slug: 1 });
KitProductSchema.index({ 'pricing.regionCode': 1 });
KitProductSchema.index({ isFeatured: 1, displayOrder: 1 });

// Virtual para imagen principal
KitProductSchema.virtual('primaryImage').get(function() {
    const primary = this.images?.find(img => img.isPrimary);
    return primary?.url || this.images?.[0]?.url || '/img/product-placeholder.png';
});

// Método para obtener precio por región
KitProductSchema.methods.getPriceForRegion = function(regionCode) {
    const regionalPrice = this.pricing.find(p => p.regionCode === regionCode);
    if (regionalPrice) {
        return {
            price: regionalPrice.price,
            currency: regionalPrice.currency,
            shippingIncluded: regionalPrice.shippingIncluded,
            shippingCost: regionalPrice.shippingCost,
            estimatedDays: regionalPrice.estimatedDays
        };
    }
    
    // Buscar DEFAULT
    const defaultRegion = this.pricing.find(p => p.regionCode === 'DEFAULT');
    if (defaultRegion) {
        return {
            price: defaultRegion.price,
            currency: defaultRegion.currency,
            shippingIncluded: defaultRegion.shippingIncluded,
            shippingCost: defaultRegion.shippingCost,
            estimatedDays: defaultRegion.estimatedDays
        };
    }
    
    return {
        price: this.defaultPrice,
        currency: this.defaultCurrency,
        shippingIncluded: true,
        shippingCost: 0,
        estimatedDays: '15-30 días'
    };
};

// Método estático para obtener productos por categoría
KitProductSchema.statics.getByCategory = function(category, activeOnly = true) {
    const query = { category };
    if (activeOnly) query.isActive = true;
    return this.find(query).sort({ displayOrder: 1, createdAt: -1 });
};

// Método estático para obtener productos destacados
KitProductSchema.statics.getFeatured = function(limit = 6) {
    return this.find({ isActive: true, isFeatured: true })
        .sort({ displayOrder: 1 })
        .limit(limit);
};

// Pre-save: generar slug si no existe
KitProductSchema.pre('save', function(next) {
    if (!this.slug) {
        this.slug = this.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }
    next();
});

module.exports = mongoose.model('KitProduct', KitProductSchema);
