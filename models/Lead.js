/**
 * models/Lead.js
 * Modelo para captura de leads (profesores y clientes)
 * 
 * Tipos de Lead:
 * - teacher: Profesor que quiere usar la plataforma (paga suscripción)
 * - client: Cliente que quiere clases (paga por clases)
 * 
 * Pipeline de conversión:
 * new → contacted → qualified → converted → user
 */
const mongoose = require('mongoose');

const leadSchema = mongoose.Schema({
    // ==================== TIPO DE LEAD ====================
    type: {
        type: String,
        enum: ['teacher', 'client'],
        default: 'teacher'
    },
    
    // Si es cliente, qué tipo
    clientType: {
        type: String,
        enum: ['adult_learner', 'guardian', null],  // adulto que estudia | apoderado
        default: null
    },
    
    // Beneficiarios (quiénes tomarán las clases)
    beneficiaries: [{
        name: { type: String, required: true },
        age: { type: Number },
        relationship: {
            type: String,
            enum: ['self', 'child', 'other'],
            default: 'self'
        },
        level: {
            type: String,
            enum: ['beginner', 'intermediate', 'advanced'],
            default: 'beginner'
        },
        instrument: { type: String, default: 'piano' }
    }],
    
    // ==================== DATOS DE CONTACTO ====================
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
        required: false,
        trim: true,
        default: ''
    },
    
    // Trayectoria del profesor (campo de postulación)
    background: {
        type: String,
        trim: true,
        maxlength: [1000, 'La trayectoria no puede exceder 1000 caracteres'],
        default: ''
    },
    
    // Zona horaria del lead (para programar demos correctamente)
    timezone: {
        type: String,
        default: 'America/Santiago', // GMT-3 (Chile) por defecto
        trim: true
    },
    country: {
        type: String,
        default: '',
        trim: true
    },
    
    // Metadata de captura
    source: {
        type: String,
        enum: ['landing', 'referral', 'social', 'kit_v2_checkout', 'other'],
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
    
    // Sistema de seguimiento
    nextFollowUp: { 
        type: Date, 
        default: null,
        index: true // Para queries eficientes de seguimientos pendientes
    },
    followUpHistory: [{
        date: { type: Date, default: Date.now },
        action: { type: String, required: true }, // 'call', 'email', 'whatsapp', 'meeting', 'note'
        notes: { type: String, default: '' },
        result: { type: String, default: '' }, // 'answered', 'no_answer', 'interested', 'not_interested'
        nextFollowUpSet: { type: Date }
    }],
    
    // Demo programada
    demoScheduled: {
        date: { type: Date, default: null },
        calendarEventId: { type: String, default: '' }, // ID del evento en Google Calendar
        meetingLink: { type: String, default: '' },
        status: { 
            type: String, 
            enum: ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'],
            default: 'pending'
        }
    },
    
    // Tracking pixels (para analytics)
    trackingData: {
        fbClickId: { type: String, default: '' }, // Facebook Click ID (fbclid)
        gClientId: { type: String, default: '' }, // Google Analytics Client ID
        landingPageViews: { type: Number, default: 0 },
        formStarted: { type: Boolean, default: false },
        referrer: { type: String, default: '' }
    },
    
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

// Método para agregar seguimiento
leadSchema.methods.addFollowUp = function(action, notes, result, nextDate) {
    this.followUpHistory.push({
        date: new Date(),
        action,
        notes,
        result,
        nextFollowUpSet: nextDate
    });
    
    if (nextDate) {
        this.nextFollowUp = nextDate;
    }
    
    return this.save();
};

// Método para programar demo
leadSchema.methods.scheduleDemo = function(demoDate, calendarEventId, meetingLink) {
    this.demoScheduled = {
        date: demoDate,
        calendarEventId,
        meetingLink,
        status: 'confirmed'
    };
    
    // Actualizar próximo seguimiento al día de la demo
    this.nextFollowUp = demoDate;
    
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

// Static para obtener leads que necesitan seguimiento hoy
leadSchema.statics.getFollowUpsDue = async function() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return this.find({
        nextFollowUp: { $gte: today, $lt: tomorrow },
        status: { $in: ['new', 'contacted', 'qualified'] }
    }).sort({ nextFollowUp: 1 });
};

// Static para obtener leads sin seguimiento programado
leadSchema.statics.getLeadsWithoutFollowUp = async function() {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    
    return this.find({
        $or: [
            { nextFollowUp: null },
            { nextFollowUp: { $lt: new Date() } }
        ],
        status: { $in: ['new', 'contacted'] },
        createdAt: { $lt: threeDaysAgo }
    }).sort({ createdAt: 1 });
};

module.exports = mongoose.model('Lead', leadSchema);
