/**
 * models/MpCredentials.js
 * Modelo de credenciales MercadoPago por país
 * 
 * Cada documento representa la cuenta de PianoLink en un país específico.
 * Se usa para enrutar cobros y payouts al accessToken correcto.
 * 
 * Países soportados: CL, MX, AR, CO, BR, PE, UY
 */

const mongoose = require('mongoose');

const mpCredentialsSchema = new mongoose.Schema({
    // Código ISO 3166-1 alpha-2
    countryCode: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        enum: ['CL', 'MX', 'AR', 'CO', 'BR', 'PE', 'UY'],
        index: true
    },

    countryName: {
        type: String,
        required: true
    },

    // Moneda local del país
    currency: {
        type: String,
        required: true,
        uppercase: true,
        enum: ['CLP', 'MXN', 'ARS', 'COP', 'BRL', 'PEN', 'UYU']
    },

    // === CREDENCIALES (tokens de la cuenta MP de PianoLink en ese país) ===
    accessToken: {
        type: String,
        required: true
    },

    publicKey: {
        type: String,
        required: true
    },

    // === CUENTA RECEPTORA (cobros a estudiantes) ===
    collector: {
        userId: { type: String, default: '' },    // User ID de MercadoPago
        email: { type: String, default: '' }       // Email de la cuenta MP receptora
    },

    // === PAYOUTS (pagos a profesores) ===
    payout: {
        enabled: { type: Boolean, default: false },
        method: {
            type: String,
            enum: ['account_money', 'bank_transfer'],
            default: 'account_money'
        },
        minPayoutAmount: { type: Number, default: 500 },     // Mínimo en moneda local (centavos)
        maxPayoutAmount: { type: Number, default: 50000000 }, // Máximo por transacción
        payoutCurrency: { type: String, default: '' },        // Misma que currency del país
        requiresManualApproval: { type: Boolean, default: false }
    },

    // === CONFIGURACIÓN ===
    isActive: {
        type: Boolean,
        default: false,
        index: true
    },

    // Secreto para validar webhooks de MP de ese país
    webhookSecret: {
        type: String,
        default: ''
    },

    // Última verificación exitosa del token
    lastTokenCheck: {
        type: Date,
        default: null
    },

    tokenStatus: {
        type: String,
        enum: ['valid', 'expired', 'unknown'],
        default: 'unknown'
    }
}, {
    timestamps: true
});

// Índices compuestos para consultas frecuentes
mpCredentialsSchema.index({ isActive: 1, countryCode: 1 });

/**
 * Método estático: obtener credenciales activas por país
 * Cacheable en memoria por el MpCountryRouter
 */
mpCredentialsSchema.statics.getByCountry = async function(countryCode) {
    return this.findOne({ countryCode: countryCode.toUpperCase(), isActive: true });
};

/**
 * Método estático: listar todos los países activos
 */
mpCredentialsSchema.statics.getActiveCountries = async function() {
    return this.find({ isActive: true }).select('countryCode countryName currency payout.enabled');
};

/**
 * Método estático: verificar si un país tiene MP disponible
 */
mpCredentialsSchema.statics.isAvailable = async function(countryCode) {
    const creds = await this.findOne({ countryCode: countryCode.toUpperCase(), isActive: true });
    return !!creds;
};

/**
 * Método estático: países con payout habilitado
 */
mpCredentialsSchema.statics.getPayoutEnabledCountries = async function() {
    return this.find({ isActive: true, 'payout.enabled': true })
        .select('countryCode countryName currency payout');
};

module.exports = mongoose.model('MpCredentials', mpCredentialsSchema, 'mp_credentials');
