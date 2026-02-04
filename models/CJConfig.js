const mongoose = require('mongoose');

/**
 * Configuración de CJDropshipping
 * SKUs y preferencias se guardan en DB (editables desde admin)
 * API Key permanece en variables de entorno (más seguro)
 */
const CJConfigSchema = new mongoose.Schema({
    // Identificador único (solo habrá un documento)
    _id: {
        type: String,
        default: 'cj_config'
    },
    
    // Estado del servicio
    enabled: {
        type: Boolean,
        default: false
    },
    
    // Configuración DSers + AliExpress
    dsersConfig: {
        enabled: {
            type: Boolean,
            default: false
        },
        affiliateTrackingId: {
            type: String,
            default: ''
        },
        defaultMargin: {
            type: Number,
            default: 40
        }
    },
    
    // SKUs de cables por tipo
    skus: {
        USB_B: {
            type: String,
            default: ''
        },
        MIDI_5PIN: {
            type: String,
            default: ''
        },
        MICRO_USB: {
            type: String,
            default: ''
        },
        USB_C: {
            type: String,
            default: ''
        }
    },
    
    // Preferencias de warehouse por región
    warehousePreferences: {
        // Países que usan warehouse de USA
        useUSWarehouse: {
            type: [String],
            default: ['US', 'MX', 'CA']
        },
        // Por defecto usar China
        defaultWarehouse: {
            type: String,
            default: 'CN'
        }
    },
    
    // Preferencias de logística por región
    logisticsPreferences: {
        // Países de LATAM (CJPacket Ordinary)
        latam: {
            type: [String],
            default: ['CL', 'AR', 'CO', 'PE', 'EC', 'BO', 'PY', 'UY', 'VE', 'BR', 'MX', 'GT', 'HN', 'SV', 'NI', 'CR', 'PA', 'DO', 'CU', 'PR']
        },
        // Países de Europa (PostNL)
        europe: {
            type: [String],
            default: ['ES', 'FR', 'DE', 'IT', 'PT', 'NL', 'BE', 'AT', 'CH', 'GB', 'IE', 'PL', 'CZ', 'SE', 'NO', 'DK', 'FI']
        },
        // USA (USPS)
        usa: {
            type: [String],
            default: ['US']
        }
    },
    
    // Nombres de los métodos de envío en CJ
    logisticsMethods: {
        latam: {
            type: String,
            default: 'CJPacket Ordinary'
        },
        europe: {
            type: String,
            default: 'PostNL'
        },
        usa: {
            type: String,
            default: 'USPS'
        },
        default: {
            type: String,
            default: 'CJPacket Ordinary'
        }
    },
    
    // Configuración de precios dinámicos
    pricing: {
        // Usar precios dinámicos de CJ (true) o precios fijos (false)
        useDynamicPricing: {
            type: Boolean,
            default: true
        },
        // Margen de ganancia por defecto (%)
        defaultMarginPercent: {
            type: Number,
            default: 30
        },
        // Margen por categoría de producto
        marginByCategory: {
            cable: { type: Number, default: 40 },
            keyboard: { type: Number, default: 25 },
            stand: { type: Number, default: 35 },
            pedal: { type: Number, default: 40 },
            accessory: { type: Number, default: 35 },
            bundle: { type: Number, default: 20 }
        },
        // Precios fijos de servicios del Welcome Kit por país
        // Estos NO incluyen el costo del cable, que se calcula dinámicamente
        servicePricesByCountry: {
            type: Map,
            of: {
                setupSession: { type: Number, default: 15 },
                trialClass: { type: Number, default: 10 }
            },
            default: new Map([
                ['default', { setupSession: 15, trialClass: 10 }],
                ['CL', { setupSession: 15, trialClass: 10 }],
                ['US', { setupSession: 20, trialClass: 15 }],
                ['MX', { setupSession: 12, trialClass: 8 }],
                ['AR', { setupSession: 10, trialClass: 8 }],
                ['CO', { setupSession: 12, trialClass: 10 }],
                ['ES', { setupSession: 18, trialClass: 12 }]
            ])
        },
        // Cache de precios (minutos)
        priceCacheMinutes: {
            type: Number,
            default: 60
        }
    },
    
    // Notas/comentarios del admin
    notes: {
        type: String,
        default: ''
    },
    
    // Auditoría
    lastUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    _id: false,
    timestamps: false
});

// Método estático para obtener o crear configuración
CJConfigSchema.statics.getConfig = async function() {
    let config = await this.findById('cj_config');
    if (!config) {
        config = await this.create({ _id: 'cj_config' });
    }
    return config;
};

// Método para verificar si un SKU está configurado
CJConfigSchema.methods.hasSku = function(cableType) {
    return this.skus[cableType] && this.skus[cableType].trim() !== '';
};

// Método para obtener SKU de un tipo de cable
CJConfigSchema.methods.getSku = function(cableType) {
    return this.skus[cableType] || null;
};

// Método para determinar warehouse por país
CJConfigSchema.methods.getWarehouseForCountry = function(countryCode) {
    if (this.warehousePreferences.useUSWarehouse.includes(countryCode)) {
        return 'US';
    }
    return this.warehousePreferences.defaultWarehouse;
};

// Método para determinar método de logística por país
CJConfigSchema.methods.getLogisticsForCountry = function(countryCode) {
    if (this.logisticsPreferences.usa.includes(countryCode)) {
        return this.logisticsMethods.usa;
    }
    if (this.logisticsPreferences.europe.includes(countryCode)) {
        return this.logisticsMethods.europe;
    }
    if (this.logisticsPreferences.latam.includes(countryCode)) {
        return this.logisticsMethods.latam;
    }
    return this.logisticsMethods.default;
};

module.exports = mongoose.model('CJConfig', CJConfigSchema);
