/* models/GlobalConfig.js */
const mongoose = require('mongoose');

const globalConfigSchema = new mongoose.Schema({
    // Usamos un ID fijo o un campo 'active' para asegurar que solo haya una configuración
    isDefault: { type: Boolean, default: true, unique: true },
    
    // ==================== PERFIL DEL ADMINISTRADOR ====================
    adminProfile: {
        name: { type: String, default: 'PianoLink' },
        whatsapp: { type: String, default: '+56959089770' },
        email: { type: String, default: 'hola@pianolink.net' },
        role: { type: String, default: 'Director Musical' },
        timezone: { type: String, default: 'America/Santiago' },
        meetingLink: { type: String, default: '' },              // Link por defecto para videollamadas
        socialMedia: {
            instagram: { type: String, default: '' },
            youtube: { type: String, default: '' },
            tiktok: { type: String, default: '' }
        },
        businessHours: { type: String, default: 'Lun-Vie 9:00-18:00 (Chile)' },
        signature: { type: String, default: '' }                 // Firma personalizada para emails
    },
    
    // ==================== KIT DE BIENVENIDA V2 ====================
    welcomeKitV2: {
        priceUSD: { type: Number, default: 44 },           // Precio base en USD (1 estudiante)
        extraChildPriceUSD: { type: Number, default: 15 }, // Precio por cada hijo adicional
        enabled: { type: Boolean, default: true }
    },
    
    // Tracking Pixels (Facebook Pixel & Google Analytics)
    trackingScripts: {
        facebookPixel: { type: String, default: "" },
        googleAnalytics: { type: String, default: "" }
    },
    
    // Google Calendar API
    googleCalendar: {
        clientId: { type: String, default: "" },
        clientSecret: { type: String, default: "" },
        redirectUri: { type: String, default: "https://pianolink-v4.fly.dev/api/calendar/oauth2callback" },
        refreshToken: { type: String, default: "" }
    },
    
    // ==================== PRECIOS REGIONALES ====================
    regionalPricing: {
        // Precio del Welcome Kit por región
        welcomeKit: [{
            regionCode: { type: String },  // 'CL', 'AR', 'ES', 'MX', 'US', 'DEFAULT'
            price: { type: Number },
            currency: { type: String },
            includesShipping: { type: Boolean, default: true },
            shippingDays: { type: String }  // '3-5 días hábiles'
        }],
        
        // Precio solo Setup + Clase (sin cable)
        setupOnly: [{
            regionCode: { type: String },
            price: { type: Number },        // Precio cuando ya tiene cable
            currency: { type: String }
        }],
        
        // Costos de envío por región (para cálculos internos)
        shippingCosts: [{
            regionCode: { type: String },
            cost: { type: Number },
            currency: { type: String }
        }]
    },
    
    // ==================== CATÁLOGO DE CABLES ====================
    cablesCatalog: [{
        code: { type: String },           // 'USB_B', 'MIDI_5PIN', 'MICRO_USB', 'USB_C'
        name: { type: String },           // 'USB-B (tipo impresora)'
        description: { type: String },    // 'Para Yamaha, Roland, Casio modernos'
        costPrice: { type: Number },      // Costo de compra (ej: $5)
        keyboards: [{ type: String }],    // ['Yamaha P-125', 'Roland FP-30', 'Casio CDP-S100']
        image: { type: String },          // URL de imagen
        isActive: { type: Boolean, default: true }
    }],
    
    // ==================== MEMBRESÍAS ====================
    memberships: {
        // Membresía mensual del ALUMNO (4 clases)
        studentMembership: [{
            regionCode: { type: String },
            price: { type: Number },
            currency: { type: String },
            classesIncluded: { type: Number, default: 4 }
        }],
        
        // Suscripción del PROFESOR (legacy — usar teacherPlans para nueva lógica)
        teacherSubscription: {
            regular: { type: Number, default: 20 },       // USD
            founder: { type: Number, default: 10 },       // USD (programa fundadores)
            currency: { type: String, default: 'USD' }
        },
        
        // ==================== TARIFA MÍNIMA POR CLASE ====================
        minHourlyRate: { type: Number, default: 15 },  // USD mínimo que un profesor puede cobrar
        
        // ==================== PLANES DE PROFESOR (v5.0) ====================
        // Reemplaza teacherSubscription como fuente de verdad para comisiones
        teacherPlans: {
            free: {
                price: { type: Number, default: 0 },                    // Centavos USD ($0)
                currency: { type: String, default: 'USD' },
                platformCommission: { type: Number, default: 25 },      // % que retiene PianoLink
                teacherCommission: { type: Number, default: 75 },       // % que gana el profesor
                privateStudentCommission: { type: Number, default: 0 }  // N/A — no puede invitar
            },
            premium: {
                price: { type: Number, default: 1900 },                 // Centavos USD ($19.00)
                currency: { type: String, default: 'USD' },
                platformCommission: { type: Number, default: 15 },
                teacherCommission: { type: Number, default: 85 },
                privateStudentCommission: { type: Number, default: 0 }  // 0% por alumnos propios
            },
            founder: {
                price: { type: Number, default: 1000 },                 // Centavos USD ($10.00)
                currency: { type: String, default: 'USD' },
                platformCommission: { type: Number, default: 15 },
                teacherCommission: { type: Number, default: 85 },
                privateStudentCommission: { type: Number, default: 0 }
            }
        },
        
        // =================================================
        // PAGO POR CLASE DE PRUEBA (Trial Class)
        // Este monto se paga íntegro al profesor por cada clase de prueba realizada
        // =================================================
        trialClassPayment: {
            amountUSD: { type: Number, default: 10 },     // Pago al profesor en USD
            currency: { type: String, default: 'USD' },
            enabled: { type: Boolean, default: true }      // Si está habilitado el pago
        },
        
        // Comisiones (legacy — usar teacherPlans para nueva lógica)
        platformCommission: { type: Number, default: 20 },  // % que retiene PianoLink
        teacherCommission: { type: Number, default: 80 },   // % que gana el profesor
        
        // ==================== OFERTA MADRUGADORES (v5.0) ====================
        earlyBirdOffer: {
            enabled: { type: Boolean, default: true },
            welcomeKitPriceUSD: { type: Number, default: 2900 },         // Centavos ($29.00)
            welcomeKitRegularPriceUSD: { type: Number, default: 4400 },  // Centavos ($44.00) — se muestra tachado
            headline: { type: String, default: '¡Oferta exclusiva para madrugadores!' },
            subtitle: { type: String, default: 'Por registrarte hoy, accede al Welcome Kit con descuento único' },
            ctaText: { type: String, default: 'Comprar Welcome Kit — $29 USD' },
            expiresAfterMinutes: { type: Number, default: 30 }           // Countdown (0 = sin límite)
        }
    },
    
    // ==================== POLÍTICAS ====================
    policies: {
        // Cancelación de clase
        cancellation: {
            freeHoursBefore: { type: Number, default: 24 },  // Cancelar gratis hasta 24h antes
            lateCancelPenalty: { type: Number, default: 50 } // % de penalización si cancela tarde
        },
        
        // No-show
        noShow: {
            studentPenalty: { type: String, default: 'lose_class' },  // Pierde la clase
            teacherPenalty: { type: String, default: 'free_class' },  // Clase gratis para alumno
            teacherStrikesBeforeSuspension: { type: Number, default: 3 }
        },
        
        // Retiros
        withdrawal: {
            minimumAmount: { type: Number, default: 10 },  // USD mínimo para retirar
            processingDays: { type: Number, default: 5 }   // Días para procesar
        }
    },
    
    // Configuración extra
    maintenanceMode: { type: Boolean, default: false }
}, { timestamps: true });

// Método: Obtener precio para una región
globalConfigSchema.methods.getPriceForRegion = function(priceType, regionCode) {
    const pricing = this.regionalPricing[priceType];
    if (!pricing || !Array.isArray(pricing)) return null;
    
    // Buscar precio específico de la región
    let price = pricing.find(p => p.regionCode === regionCode);
    
    // Si no existe, buscar DEFAULT
    if (!price) {
        price = pricing.find(p => p.regionCode === 'DEFAULT');
    }
    
    return price || null;
};

// Método estático: Obtener perfil del administrador para emails
globalConfigSchema.statics.getAdminProfile = async function() {
    const config = await this.findOne({ isDefault: true }).select('adminProfile').lean();
    const defaults = {
        name: 'PianoLink',
        whatsapp: '+56959089770',
        email: 'hola@pianolink.net',
        role: 'Director Musical',
        timezone: 'America/Santiago',
        meetingLink: '',
        socialMedia: { instagram: '', youtube: '', tiktok: '' },
        businessHours: 'Lun-Vie 9:00-18:00 (Chile)',
        signature: ''
    };
    return { ...defaults, ...(config?.adminProfile || {}) };
};

module.exports = mongoose.model('GlobalConfig', globalConfigSchema);