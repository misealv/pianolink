/**
 * crm/models/CrmLanding.js
 * Modelo de Landing Pages dinámicas para el CRM.
 * 
 * Cada landing se define en JSON (contenido dinámico) y se renderiza
 * en GET /l/:slug. Permite crear páginas de captura de leads sin código
 * frontend, vinculadas a campañas CRM para tracking automático.
 * 
 * Ejemplo: /l/profesores-chile → landing con hero, beneficios, testimonios, formulario.
 */
const mongoose = require('mongoose');

// === SUB-SCHEMAS ===

const benefitSchema = new mongoose.Schema({
    icon: { type: String, default: '🎵' },
    title: { type: String, default: '' },
    description: { type: String, default: '' }
}, { _id: false });

const testimonialSchema = new mongoose.Schema({
    name: { type: String, default: '' },
    role: { type: String, default: '' },
    quote: { type: String, default: '' },
    avatar: { type: String, default: '' }
}, { _id: false });

const faqSchema = new mongoose.Schema({
    question: { type: String, default: '' },
    answer: { type: String, default: '' }
}, { _id: false });

const formFieldSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['text', 'email', 'phone', 'select', 'textarea', 'hidden'],
        default: 'text'
    },
    label: { type: String, default: '' },
    required: { type: Boolean, default: false },
    options: [{ type: String }],       // Para selects
    placeholder: { type: String, default: '' }
}, { _id: false });

const footerLinkSchema = new mongoose.Schema({
    label: { type: String, default: '' },
    url: { type: String, default: '' }
}, { _id: false });

// === SCHEMA PRINCIPAL ===
const crmLandingSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true, 
        trim: true, 
        maxlength: 200 
    },

    slug: { 
        type: String, 
        required: true, 
        unique: true, 
        trim: true, 
        lowercase: true,
        match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug inválido: solo letras minúsculas, números y guiones']
    },

    status: { 
        type: String, 
        enum: ['draft', 'published', 'archived'],
        default: 'draft'
    },

    // Plantilla base para estilos/layout
    template: { 
        type: String, 
        enum: ['teacher_signup', 'student_trial', 'webinar', 'generic'],
        default: 'generic'
    },

    // === CONTENIDO DINÁMICO (JSON) ===
    content: {
        // Sección Hero
        hero: {
            headline: { type: String, default: '' },
            subheadline: { type: String, default: '' },
            ctaText: { type: String, default: 'Comenzar ahora' },
            ctaColor: { type: String, default: '#4F46E5' },
            backgroundImage: { type: String, default: '' },
            videoUrl: { type: String, default: '' }
        },

        // Sección de beneficios
        benefits: [benefitSchema],

        // Testimonios
        testimonials: [testimonialSchema],

        // Preguntas frecuentes
        faq: [faqSchema],

        // Formulario de captura
        form: {
            fields: {
                type: [formFieldSchema],
                default: [
                    { name: 'name',  type: 'text',  label: 'Nombre completo', required: true },
                    { name: 'email', type: 'email', label: 'Email',           required: true },
                    { name: 'phone', type: 'phone', label: 'Teléfono',       required: false }
                ]
            },
            submitText: { type: String, default: 'Enviar' },
            successMessage: { type: String, default: '¡Gracias! Te contactaremos pronto.' },
            redirectUrl: { type: String, default: '' }     // URL de redirección post-submit (vacío = mostrar mensaje)
        },

        // Footer
        footer: {
            text: { type: String, default: '' },
            links: [footerLinkSchema]
        },

        // Colores y branding personalizados
        branding: {
            primaryColor: { type: String, default: '#4F46E5' },
            logoUrl: { type: String, default: '' },
            fontFamily: { type: String, default: '' }       // Vacío = fuente por defecto del template
        }
    },

    // === TRACKING / ATRIBUCIÓN ===
    campaignId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'CrmCampaign',
        default: null
    },
    utmParams: {
        source: { type: String, default: '' },
        medium: { type: String, default: '' },
        campaign: { type: String, default: '' }
    },

    // === SEO ===
    seo: {
        title: { type: String, default: '' },
        description: { type: String, default: '' },
        ogImage: { type: String, default: '' }
    },

    // === MÉTRICAS (actualizadas atómicamente) ===
    metrics: {
        views: { type: Number, default: 0 },
        uniqueVisitors: { type: Number, default: 0 },
        formStarts: { type: Number, default: 0 },
        formSubmissions: { type: Number, default: 0 }
    },

    // === A/B TESTING ===
    // Variantes alternativas para split testing. La landing base es variante "A" (control).
    // Cada variante sobreescribe solo los campos indicados en overrides.
    abTest: {
        enabled: { type: Boolean, default: false },
        variants: [{
            name: { type: String, required: true },          // "B", "C", etc.
            weight: { type: Number, default: 50 },            // Peso de distribución (0-100)
            // Sobreescribe solo campos específicos del content base
            overrides: {
                hero: {
                    headline: { type: String },
                    subheadline: { type: String },
                    ctaText: { type: String },
                    ctaColor: { type: String },
                    backgroundImage: { type: String },
                    videoUrl: { type: String }
                },
                form: {
                    submitText: { type: String },
                    successMessage: { type: String }
                }
            },
            // Métricas separadas por variante
            metrics: {
                views: { type: Number, default: 0 },
                formStarts: { type: Number, default: 0 },
                formSubmissions: { type: Number, default: 0 }
            },
            _id: false
        }]
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    publishedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, {
    timestamps: true,
    collection: 'crm_landings'
});

// === ÍNDICES ===
crmLandingSchema.index({ slug: 1 }, { unique: true });
crmLandingSchema.index({ status: 1 });
crmLandingSchema.index({ campaignId: 1 });

// === VIRTUALS ===

/**
 * Tasa de conversión del formulario (%).
 */
crmLandingSchema.virtual('conversionRate').get(function() {
    if (!this.metrics || this.metrics.views === 0) return 0;
    return Math.round((this.metrics.formSubmissions / this.metrics.views) * 10000) / 100;
});

/**
 * URL pública de la landing.
 */
crmLandingSchema.virtual('publicUrl').get(function() {
    return `/l/${this.slug}`;
});

// Incluir virtuals en JSON/Object
crmLandingSchema.set('toJSON', { virtuals: true });
crmLandingSchema.set('toObject', { virtuals: true });

// === STATICS ===

/**
 * Busca una landing publicada por su slug.
 * @param {string} slug
 * @returns {Promise<CrmLanding|null>}
 */
crmLandingSchema.statics.findPublishedBySlug = function(slug) {
    return this.findOne({ slug, status: 'published' });
};

/**
 * Incrementa atómicamente un contador de métricas.
 * @param {string} landingId
 * @param {string} field - "views", "uniqueVisitors", "formStarts", "formSubmissions"
 * @param {number} amount - Cantidad a incrementar (default 1)
 * @param {string|null} variantName - Nombre de la variante (null = control/base)
 */
crmLandingSchema.statics.incrementMetric = function(landingId, field, amount = 1, variantName = null) {
    const allowedFields = ['views', 'uniqueVisitors', 'formStarts', 'formSubmissions'];
    if (!allowedFields.includes(field)) return Promise.resolve(null);

    const incUpdate = { [`metrics.${field}`]: amount };

    // Si hay variante, también incrementar su métrica específica
    if (variantName) {
        // Excluir uniqueVisitors de variantes (no se trackea a nivel variante)
        if (field !== 'uniqueVisitors') {
            incUpdate[`abTest.variants.$[v].metrics.${field}`] = amount;
        }
        return this.findByIdAndUpdate(
            landingId,
            { $inc: incUpdate },
            { new: true, arrayFilters: [{ 'v.name': variantName }] }
        );
    }

    return this.findByIdAndUpdate(
        landingId,
        { $inc: incUpdate },
        { new: true }
    );
};

/**
 * Resumen de landings publicadas con métricas.
 * @returns {Promise<Array>}
 */
crmLandingSchema.statics.getPublishedSummary = async function() {
    return this.find({ status: 'published' })
        .select('name slug metrics campaignId publishedAt')
        .sort({ publishedAt: -1 })
        .lean();
};

module.exports = mongoose.model('CrmLanding', crmLandingSchema);
