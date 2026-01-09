/**
 * models/Lead.js
 * Modelo para captura de leads (profesores interesados)
 * 
 * Pipeline de conversión:
 * new → contacted → qualified → converted → user
 */
const mongoose = require('mongoose');

const leadSchema = mongoose.Schema({
    // Datos de contacto
    name: { 
        type: String, 
        required: [true, 'El nombre es requerido'],
        trim: true,
        maxlength: [100, 'El nombre no puede exceder 100 caracteres']
    },
    email: { 
        type: String, 
        required: [true, 'El email es requerido'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Por favor ingrese un email válido']
    },
    whatsapp: { 
        type: String, 
        required: [true, 'El WhatsApp es requerido'],
        trim: true,
        match: [/^[\d\s\+\-\(\)]+$/, 'Por favor ingrese un número válido']
    },
    
    // Trayectoria del profesor (campo de postulación)
    background: {
        type: String,
        trim: true,
        maxlength: [1000, 'La trayectoria no puede exceder 1000 caracteres'],
        default: ''
    },
    
    // Metadata de captura
    source: {
        type: String,
        enum: ['landing', 'referral', 'social', 'other'],
        default: 'landing'
    },
    utmSource: { type: String, default: '' },
    utmMedium: { type: String, default: '' },
    utmCampaign: { type: String, default: '' },
    
    // Estado del lead
    status: {
        type: String,
        enum: ['new', 'contacted', 'qualified', 'converted', 'rejected'],
        default: 'new'
    },
    
    // Notas internas
    notes: { type: String, default: '' },
    
    // Conversión
    convertedToUserId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        default: null
    },
    
    // Timestamps
    createdAt: { type: Date, default: Date.now },
    contactedAt: { type: Date, default: null },
    convertedAt: { type: Date, default: null }
});

// Índices para búsqueda eficiente
leadSchema.index({ email: 1 });
leadSchema.index({ status: 1, createdAt: -1 });
leadSchema.index({ createdAt: -1 });

// Virtual para nombre formateado
leadSchema.virtual('displayName').get(function() {
    return this.name.split(' ')[0]; // Solo primer nombre
});

// Método para marcar como contactado
leadSchema.methods.markContacted = function() {
    this.status = 'contacted';
    this.contactedAt = new Date();
    return this.save();
};

// Método para convertir a usuario
leadSchema.methods.convertToUser = function(userId) {
    this.status = 'converted';
    this.convertedToUserId = userId;
    this.convertedAt = new Date();
    return this.save();
};

// Statics para reportes
leadSchema.statics.getStats = async function() {
    const stats = await this.aggregate([
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);
    
    return stats.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
    }, {});
};

module.exports = mongoose.model('Lead', leadSchema);
