/**
 * crm/models/CrmConfig.js
 * Modelo para configuración del CRM (Meta Pixel, etc.)
 * 
 * Se guarda como documento único con key: 'settings'
 * 
 * COMPLETADO: Configuración centralizada del CRM
 */
const mongoose = require('mongoose');

const crmConfigSchema = new mongoose.Schema({
    key: { 
        type: String, 
        required: true, 
        unique: true,
        default: 'settings'
    },
    
    // === META PIXEL ===
    metaPixel: {
        enabled: { type: Boolean, default: false },
        pixelId: { type: String, default: '' },
        testEventCode: { type: String, default: '' }  // Para test events
    },
    
    // === GOOGLE ANALYTICS ===
    googleAnalytics: {
        enabled: { type: Boolean, default: false },
        measurementId: { type: String, default: '' }
    },
    
    // === EMAIL ===
    email: {
        fromName: { type: String, default: 'Miguel Antonio' },
        fromEmail: { type: String, default: 'hola@pianolink.net' },
        replyTo: { type: String, default: 'hola@pianolink.net' }
    },
    
    // === SITE ===
    site: {
        name: { type: String, default: 'PianoLink' },
        url: { type: String, default: 'https://pianolink.net' },
        logoUrl: { type: String, default: '' }
    },
    
    // === LANZAMIENTO DÍA 88 ===
    lanzamiento: {
        fechaLanzamiento: { type: Date, default: new Date('2026-03-29T09:00:00') },
        cuposDisponibles: { type: Number, default: 88 },
        precioKit: { type: Number, default: 4400 },  // centavos
        precioNormal: { type: Number, default: 9000 }  // centavos
    }
}, {
    timestamps: true,
    collection: 'crm_config'
});

// === MÉTODOS ESTÁTICOS ===

/**
 * Obtener la configuración (crear si no existe)
 */
crmConfigSchema.statics.getSettings = async function() {
    let config = await this.findOne({ key: 'settings' });
    if (!config) {
        config = await this.create({ key: 'settings' });
    }
    return config;
};

/**
 * Actualizar configuración
 */
crmConfigSchema.statics.updateSettings = async function(updates) {
    const config = await this.getSettings();
    
    // Merge profundo
    if (updates.metaPixel) Object.assign(config.metaPixel, updates.metaPixel);
    if (updates.googleAnalytics) Object.assign(config.googleAnalytics, updates.googleAnalytics);
    if (updates.email) Object.assign(config.email, updates.email);
    if (updates.site) Object.assign(config.site, updates.site);
    if (updates.lanzamiento) Object.assign(config.lanzamiento, updates.lanzamiento);
    
    return config.save();
};

/**
 * Obtener solo el pixel ID (útil para helpers)
 */
crmConfigSchema.statics.getMetaPixelId = async function() {
    const config = await this.getSettings();
    return config.metaPixel?.enabled ? config.metaPixel.pixelId : null;
};

module.exports = mongoose.model('CrmConfig', crmConfigSchema);
