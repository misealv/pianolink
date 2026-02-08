/**
 * models/WelcomeKit.js
 * Tracking del Kit de Bienvenida (cable MIDI + setup + clase prueba)
 */
const mongoose = require('mongoose');

const welcomeKitSchema = new mongoose.Schema({
    // Cliente que compró (puede ser null hasta verificar pago)
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
        default: null
    },
    
    // Datos del cliente (backup independiente del usuario)
    clientName: { type: String },
    clientEmail: { type: String },
    clientWhatsapp: { type: String },
    
    // Beneficiario (puede ser el mismo cliente o un hijo)
    beneficiaryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    
    // ==================== PAGO ====================
    payment: {
        provider: {
            type: String,
            enum: ['paypal', 'mercadopago', 'stripe'],
            required: true
        },
        externalOrderId: { type: String, required: true },
        amount: { type: Number, required: true },
        currency: { type: String, default: 'USD' },
        paidAt: { type: Date }
    },
    
    // ==================== TIPO DE KIT ====================
    kitType: {
        type: String,
        enum: ['full', 'setup_only'],  // 'full' = cable + setup + clase, 'setup_only' = solo setup + clase
        default: 'full'
    },
    
    // ==================== PRODUCTOS SELECCIONADOS ====================
    products: [{
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'KitProduct'
        },
        name: { type: String },
        image: { type: String },
        priceAtPurchase: { type: Number },
        quantity: { type: Number, default: 1 }
    }],
    
    // ==================== CABLE MIDI (legacy) ====================
    cable: {
        type: {
            type: String,
            enum: ['USB_B', 'MIDI_5PIN', 'MICRO_USB', 'USB_C', 'NONE'],
            default: 'USB_B'
        },
        keyboardModel: { type: String },  // Modelo del teclado del cliente
        costPrice: { type: Number },       // Costo del cable (para tracking interno)
        alreadyHasCable: { type: Boolean, default: false }
    },
    
    // ==================== ENVÍO FÍSICO ====================
    shipping: {
        status: {
            type: String,
            enum: ['pending_payment', 'processing', 'shipped', 'delivered', 'returned', 'lost', 'not_required'],
            default: 'pending_payment'
        },
        
        // Dirección
        address: {
            street: String,
            city: String,
            state: String,
            postalCode: String,
            country: { type: String, required: true }
        },
        
        // Fulfillment (CJDropshipping)
        fulfillment: {
            provider: { type: String }, // 'cjdropshipping', 'manual', etc.
            externalOrderId: { type: String },
            orderNumber: { type: String },
            shipmentOrderId: { type: String },
            status: { type: String }, // Estado en el proveedor
            costPrice: { type: Number }, // Costo real del fulfillment
            errorMessage: { type: String },
            requiresManualReview: { type: Boolean, default: false },
            createdAt: { type: Date },
            lastSync: { type: Date }
        },
        
        // Tracking del courier
        carrier: { type: String },  // 'chilexpress', 'correos_chile', 'fedex', etc.
        trackingNumber: { type: String },
        trackingUrl: { type: String },
        
        // Fechas
        shippedAt: { type: Date },
        estimatedDelivery: { type: Date },
        deliveredAt: { type: Date },
        
        // Confirmación del cliente
        clientConfirmedReceipt: { type: Boolean, default: false },
        clientConfirmedAt: { type: Date }
    },
    
    // ==================== SESIÓN DE SETUP ====================
    setupSession: {
        status: {
            type: String,
            enum: ['not_scheduled', 'scheduled', 'completed', 'no_show', 'rescheduled'],
            default: 'not_scheduled'
        },
        scheduledAt: { type: Date },
        completedAt: { type: Date },
        technicianNotes: { type: String },
        
        // Si hubo problemas técnicos
        issues: [{
            type: { type: String }, // 'cable_defective', 'browser_incompatible', 'midi_not_detected'
            description: String,
            resolved: { type: Boolean, default: false }
        }]
    },
    
    // ==================== CLASE DE PRUEBA ====================
    trialClass: {
        status: {
            type: String,
            enum: ['not_available', 'available', 'scheduled', 'completed', 'no_show_student', 'no_show_teacher'],
            default: 'not_available'
        },
        
        // Se habilita después del setup
        unlockedAt: { type: Date },
        
        // Profesor asignado para la prueba
        teacherId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        
        scheduledAt: { type: Date },
        completedAt: { type: Date },
        
        // Feedback post-clase
        studentRating: { type: Number, min: 1, max: 5 },
        studentFeedback: { type: String },
        teacherNotes: { type: String }
    },
    
    // ==================== ENTREVISTA DE BIENVENIDA ====================
    interview: {
        slotId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'OnboardingSlot'
        },
        scheduledAt: { type: Date },
        completedAt: { type: Date },
        notes: { type: String }
    },

    // ==================== ESTADO GENERAL ====================
    overallStatus: {
        type: String,
        enum: [
            'paid',              // Pagó, esperando envío (legacy)
            'entrevista_pendiente', // V2: Esperando entrevista técnica
            'entrevista_agendada',  // V2: Entrevista agendada por el cliente
            'esperando_equipo',  // V2: Email enviado, cliente comprando equipo
            'shipping',          // En camino (legacy)
            'delivered',         // Entregado, esperando confirmar (legacy)
            'setup_pending',     // Confirmó que tiene equipo, agendar setup
            'setup_scheduled',   // Setup agendado
            'trial_available',   // Setup completado, puede agendar prueba
            'trial_scheduled',   // Prueba agendada
            'trial_completed',   // Clase de prueba completada, pendiente calificación
            'completed',         // Todo el onboarding completado
            'refunded',          // Reembolsado
            'disputed'           // En disputa
        ],
        default: 'paid'
    },
    
    // ==================== CLASE DE PRUEBA ====================
    trialClass: {
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Booking'
        },
        teacherId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        completedAt: { type: Date },
        notes: { type: String },
        studentRating: { type: Number, min: 1, max: 5 },
        studentFeedback: { type: String },
        ratedAt: { type: Date }
    },
    
    // ==================== DISPUTAS / PROBLEMAS ====================
    dispute: {
        isActive: { type: Boolean, default: false },
        reason: {
            type: String,
            enum: ['never_received', 'defective', 'not_as_described', 'service_issue', 'other']
        },
        description: { type: String },
        openedAt: { type: Date },
        resolvedAt: { type: Date },
        resolution: { type: String } // 'refund', 'replacement', 'credit', 'rejected'
    },
    
    // ==================== CONVERSIÓN ====================
    // Si después de la prueba se convirtió en suscriptor
    convertedToSubscription: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription',
        default: null
    },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Índices
welcomeKitSchema.index({ clientId: 1 });
welcomeKitSchema.index({ 'payment.externalOrderId': 1 });
welcomeKitSchema.index({ overallStatus: 1 });
welcomeKitSchema.index({ 'shipping.trackingNumber': 1 });

// Actualizar updatedAt
welcomeKitSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Método: Avanzar al siguiente estado
welcomeKitSchema.methods.advanceStatus = function() {
    const transitions = {
        'entrevista_pendiente': 'entrevista_agendada',
        'entrevista_agendada': 'esperando_equipo',
        'paid': 'shipping',
        'shipping': 'delivered',
        'delivered': 'setup_pending',
        'setup_pending': 'setup_scheduled',
        'setup_scheduled': 'trial_available',
        'trial_available': 'trial_scheduled',
        'trial_scheduled': 'completed'
    };
    
    if (transitions[this.overallStatus]) {
        this.overallStatus = transitions[this.overallStatus];
        return true;
    }
    return false;
};

module.exports = mongoose.model('WelcomeKit', welcomeKitSchema);
