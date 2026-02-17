/**
 * crm/services/CrmLandingService.js
 * Lógica de negocio para landing pages del CRM.
 * 
 * Responsabilidades:
 * - CRUD de landings (crear, listar, obtener, actualizar, eliminar)
 * - Publicar/despublicar
 * - Duplicar landings
 * - Métricas e incrementos atómicos
 * - Procesamiento de formularios (captura de leads)
 */
const CrmLanding = require('../models/CrmLanding');
const CrmLead = require('../models/CrmLead');
const CrmInteraction = require('../models/CrmInteraction');
const CrmConversion = require('../models/CrmConversion');
const mongoose = require('mongoose');

class CrmLandingService {

    // =========================================================================
    // CRUD
    // =========================================================================

    /**
     * Listar landings con filtros opcionales.
     * @param {Object} query - { status, template, campaignId, page, limit }
     */
    static async list(query = {}) {
        try {
            const { status, template, campaignId, page = 1, limit = 20 } = query;
            const filter = {};

            if (status) filter.status = status;
            if (template) filter.template = template;
            if (campaignId) filter.campaignId = campaignId;

            const skip = (Number(page) - 1) * Number(limit);

            const [landings, total] = await Promise.all([
                CrmLanding.find(filter)
                    .sort({ updatedAt: -1 })
                    .skip(skip)
                    .limit(Number(limit))
                    .populate('createdBy', 'name email')
                    .populate('campaignId', 'name platform status')
                    .lean({ virtuals: true }),
                CrmLanding.countDocuments(filter)
            ]);

            return {
                success: true,
                data: landings,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit))
                }
            };
        } catch (error) {
            console.error('[CRM Landing] Error en list:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Obtener una landing por ID.
     */
    static async getById(id) {
        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return { success: false, error: 'ID inválido' };
            }

            const landing = await CrmLanding.findById(id)
                .populate('createdBy', 'name email')
                .populate('campaignId', 'name platform status');

            if (!landing) {
                return { success: false, error: 'Landing no encontrada' };
            }

            return { success: true, data: landing };
        } catch (error) {
            console.error('[CRM Landing] Error en getById:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Obtener landing para preview admin (cualquier status, sin incrementar métricas).
     * @param {string} id - ID de la landing
     */
    static async getForPreview(id) {
        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return { success: false, error: 'ID inválido' };
            }

            const landing = await CrmLanding.findById(id)
                .populate('campaignId', 'name platform status');

            if (!landing) {
                return { success: false, error: 'Landing no encontrada' };
            }

            return { success: true, data: landing };
        } catch (error) {
            console.error('[CRM Landing] Error en getForPreview:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Crear una nueva landing (siempre en draft).
     * @param {Object} data - Datos de la landing
     * @param {string} userId - ID del usuario creador
     */
    static async create(data, userId) {
        try {
            // Validar slug único
            const existing = await CrmLanding.findOne({ slug: data.slug });
            if (existing) {
                return { success: false, error: `El slug "${data.slug}" ya está en uso` };
            }

            const landing = await CrmLanding.create({
                ...data,
                status: 'draft',    // Siempre inicia en draft
                createdBy: userId
            });

            console.log(`[CRM Landing] ✅ Landing creada: "${landing.name}" → /l/${landing.slug}`);
            return { success: true, data: landing };
        } catch (error) {
            // Manejar errores de validación de Mongoose
            if (error.name === 'ValidationError') {
                const messages = Object.values(error.errors).map(e => e.message);
                return { success: false, error: messages.join(', ') };
            }
            console.error('[CRM Landing] Error en create:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Actualizar una landing (solo si no está published — o actualización parcial).
     * @param {string} id - ID de la landing
     * @param {Object} updates - Campos a actualizar
     */
    static async update(id, updates) {
        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return { success: false, error: 'ID inválido' };
            }

            const landing = await CrmLanding.findById(id);
            if (!landing) {
                return { success: false, error: 'Landing no encontrada' };
            }

            // Si cambia el slug, verificar unicidad
            if (updates.slug && updates.slug !== landing.slug) {
                const slugExists = await CrmLanding.findOne({ slug: updates.slug, _id: { $ne: id } });
                if (slugExists) {
                    return { success: false, error: `El slug "${updates.slug}" ya está en uso` };
                }
            }

            // No permitir cambiar status directo (usar publish/unpublish)
            delete updates.status;
            delete updates.metrics;   // No se manipulan manualmente

            Object.assign(landing, updates);
            await landing.save();

            console.log(`[CRM Landing] ✏️ Landing actualizada: "${landing.name}"`);
            return { success: true, data: landing };
        } catch (error) {
            if (error.name === 'ValidationError') {
                const messages = Object.values(error.errors).map(e => e.message);
                return { success: false, error: messages.join(', ') };
            }
            console.error('[CRM Landing] Error en update:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Eliminar una landing (solo draft o archived).
     */
    static async delete(id) {
        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return { success: false, error: 'ID inválido' };
            }

            const landing = await CrmLanding.findById(id);
            if (!landing) {
                return { success: false, error: 'Landing no encontrada' };
            }

            if (landing.status === 'published') {
                return { success: false, error: 'No se puede eliminar una landing publicada. Despublícala primero.' };
            }

            await CrmLanding.findByIdAndDelete(id);
            console.log(`[CRM Landing] 🗑️ Landing eliminada: "${landing.name}"`);
            return { success: true, message: 'Landing eliminada' };
        } catch (error) {
            console.error('[CRM Landing] Error en delete:', error.message);
            return { success: false, error: error.message };
        }
    }

    // =========================================================================
    // PUBLICACIÓN
    // =========================================================================

    /**
     * Cambiar el estado de una landing.
     * Flujo válido: draft → published, published → archived, archived → draft
     */
    static async changeStatus(id, newStatus) {
        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return { success: false, error: 'ID inválido' };
            }

            const validStatuses = ['draft', 'published', 'archived'];
            if (!validStatuses.includes(newStatus)) {
                return { success: false, error: `Estado inválido. Usa: ${validStatuses.join(', ')}` };
            }

            const landing = await CrmLanding.findById(id);
            if (!landing) {
                return { success: false, error: 'Landing no encontrada' };
            }

            // Validar transiciones permitidas
            const transitions = {
                'draft': ['published'],
                'published': ['draft', 'archived'],
                'archived': ['draft']
            };

            if (!transitions[landing.status]?.includes(newStatus)) {
                return { 
                    success: false, 
                    error: `Transición no permitida: ${landing.status} → ${newStatus}` 
                };
            }

            // Validar que tenga contenido mínimo antes de publicar
            if (newStatus === 'published') {
                const validation = this._validateForPublish(landing);
                if (!validation.valid) {
                    return { success: false, error: `No se puede publicar: ${validation.reason}` };
                }
                landing.publishedAt = new Date();
            }

            landing.status = newStatus;
            await landing.save();

            console.log(`[CRM Landing] 📋 Estado cambiado: "${landing.name}" → ${newStatus}`);
            return { success: true, data: landing };
        } catch (error) {
            console.error('[CRM Landing] Error en changeStatus:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Valida que una landing tenga el contenido mínimo para publicarse.
     * @private
     */
    static _validateForPublish(landing) {
        if (!landing.content?.hero?.headline) {
            return { valid: false, reason: 'Falta el headline del hero' };
        }
        if (!landing.content?.form?.fields?.length) {
            return { valid: false, reason: 'El formulario debe tener al menos un campo' };
        }
        // Verificar que haya un campo email en el form
        const hasEmail = landing.content.form.fields.some(f => f.type === 'email');
        if (!hasEmail) {
            return { valid: false, reason: 'El formulario debe tener un campo de tipo email' };
        }
        return { valid: true };
    }

    // =========================================================================
    // DUPLICAR
    // =========================================================================

    /**
     * Duplicar una landing en estado draft.
     */
    static async duplicate(id, userId) {
        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return { success: false, error: 'ID inválido' };
            }

            const original = await CrmLanding.findById(id).lean();
            if (!original) {
                return { success: false, error: 'Landing no encontrada' };
            }

            // Generar slug único
            let newSlug = `${original.slug}-copia`;
            let counter = 1;
            while (await CrmLanding.findOne({ slug: newSlug })) {
                newSlug = `${original.slug}-copia-${counter++}`;
            }

            // Crear copia sin métricas ni ID
            const copyData = {
                name: `${original.name} (copia)`,
                slug: newSlug,
                status: 'draft',
                template: original.template,
                content: original.content,
                campaignId: original.campaignId,
                utmParams: original.utmParams,
                seo: original.seo,
                createdBy: userId,
                metrics: { views: 0, uniqueVisitors: 0, formStarts: 0, formSubmissions: 0 },
                publishedAt: null
            };

            const copy = await CrmLanding.create(copyData);
            console.log(`[CRM Landing] 📋 Landing duplicada: "${copy.name}" → /l/${copy.slug}`);
            return { success: true, data: copy };
        } catch (error) {
            console.error('[CRM Landing] Error en duplicate:', error.message);
            return { success: false, error: error.message };
        }
    }

    // =========================================================================
    // RENDERIZADO PÚBLICO
    // =========================================================================

    /**
     * Obtiene una landing publicada por slug e incrementa vistas.
     * Usado por el renderer público GET /l/:slug
     * @param {string} slug
     * @returns {Promise<Object>}
     */
    static async getPublishedBySlug(slug) {
        try {
            const landing = await CrmLanding.findPublishedBySlug(slug);
            if (!landing) {
                return { success: false, error: 'Landing no encontrada' };
            }

            // Incrementar vistas atómicamente (no bloquea)
            CrmLanding.incrementMetric(landing._id, 'views').catch(() => {});

            return { success: true, data: landing };
        } catch (error) {
            console.error('[CRM Landing] Error en getPublishedBySlug:', error.message);
            return { success: false, error: error.message };
        }
    }

    // =========================================================================
    // PROCESAMIENTO DE FORMULARIOS
    // =========================================================================

    /**
     * Procesa un envío de formulario desde una landing pública.
     * - Crea o actualiza un Lead en el core
     * - Registra interacción form_submit
     * - Registra conversión lead_capture
     * - Incrementa métricas de la landing
     * 
     * @param {string} slug - Slug de la landing
     * @param {Object} formData - Datos del formulario
     * @param {Object} trackingData - { utmSource, utmMedium, utmCampaign, userAgent, ip }
     */
    static async processFormSubmission(slug, formData, trackingData = {}) {
        try {
            const landing = await CrmLanding.findPublishedBySlug(slug);
            if (!landing) {
                return { success: false, error: 'Landing no encontrada' };
            }

            // Validar campos requeridos del formulario
            const requiredFields = (landing.content?.form?.fields || [])
                .filter(f => f.required)
                .map(f => f.name);

            for (const field of requiredFields) {
                if (!formData[field] || !formData[field].toString().trim()) {
                    return { success: false, error: `Campo requerido: ${field}` };
                }
            }

            // Verificar email válido si existe
            if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
                return { success: false, error: 'Email inválido' };
            }

            // Intentar encontrar Lead existente por email o crear nuevo via core LeadService
            let crmLead = null;
            let needsAutoEnroll = false;
            if (formData.email) {
                const Lead = require('../../models/Lead');
                const CrmLeadService = require('./CrmLeadService');
                let coreLead = await Lead.findOne({ email: formData.email.toLowerCase().trim() }).lean();

                if (coreLead) {
                    // Buscar CrmLead; si no existe, crearlo explícitamente (bridge pudo fallar o lead pre-CRM)
                    crmLead = await CrmLead.findOne({ leadRef: coreLead._id });
                    if (!crmLead) {
                        const enrichment = {
                            channel: trackingData.utmSource ? 'referral' : 'organic',
                            utmSource: trackingData.utmSource || landing.utmParams?.source || '',
                            utmMedium: trackingData.utmMedium || landing.utmParams?.medium || '',
                            utmCampaign: trackingData.utmCampaign || landing.utmParams?.campaign || '',
                            landingPage: `/l/${slug}`,
                            tags: [`landing:${slug}`]
                        };
                        const bridgeResult = await CrmLeadService.findOrCreateFromCoreLead(coreLead._id, enrichment);
                        if (bridgeResult.success) {
                            crmLead = bridgeResult.data;
                            needsAutoEnroll = true;
                            console.log(`[CRM Landing] 🔗 CrmLead creado para lead existente: ${coreLead.email}`);
                        }
                    } else {
                        // CrmLead ya existe — verificar si tiene secuencias activas
                        const hasActiveSeqs = (crmLead.activeSequences || []).some(e => e.status === 'active');
                        if (!hasActiveSeqs) {
                            needsAutoEnroll = true;
                        }
                    }
                }

                // Si no existe lead en el core, crearlo via LeadService y luego crear CrmLead directamente
                if (!coreLead) {
                    try {
                        const LeadService = require('../../services/LeadService');
                        const result = await LeadService.createOrUpdate({
                            name: formData.name || formData.email.split('@')[0],
                            email: formData.email,
                            whatsapp: formData.phone || formData.whatsapp || '',
                            type: 'client',
                            utmSource: trackingData.utmSource || landing.utmParams?.source || '',
                            utmMedium: trackingData.utmMedium || landing.utmParams?.medium || '',
                            utmCampaign: trackingData.utmCampaign || landing.utmParams?.campaign || '',
                            notes: `Capturado desde landing: /l/${slug}`
                        }, false);
                        // Crear CrmLead directamente en vez de depender del bridge asíncrono
                        if (result.success && result.lead?._id) {
                            const enrichment = {
                                channel: trackingData.utmSource ? 'referral' : 'organic',
                                utmSource: trackingData.utmSource || landing.utmParams?.source || '',
                                utmMedium: trackingData.utmMedium || landing.utmParams?.medium || '',
                                utmCampaign: trackingData.utmCampaign || landing.utmParams?.campaign || '',
                                landingPage: `/l/${slug}`,
                                tags: [`landing:${slug}`]
                            };
                            const bridgeResult = await CrmLeadService.findOrCreateFromCoreLead(result.lead._id, enrichment);
                            if (bridgeResult.success) {
                                crmLead = bridgeResult.data;
                                needsAutoEnroll = true;
                            }
                        }
                    } catch (leadErr) {
                        console.error('[CRM Landing] Error creando lead desde landing form:', leadErr.message, leadErr.stack);
                    }
                }
            }

            // Registrar interacción form_submit (solo si tenemos un leadRef válido)
            if (crmLead?._id) {
                await CrmInteraction.create({
                    leadRef: crmLead._id,
                    type: 'form_submit',
                    channel: 'web',
                    metadata: {
                        pageUrl: `/l/${slug}`,
                        campaignId: landing.campaignId || null,
                        notes: JSON.stringify(formData)
                    },
                    utmParams: {
                        source: trackingData.utmSource || landing.utmParams?.source || '',
                        medium: trackingData.utmMedium || landing.utmParams?.medium || '',
                        campaign: trackingData.utmCampaign || landing.utmParams?.campaign || ''
                    },
                    timestamp: new Date()
                });
            }

            // Incrementar métricas (global + variante si aplica)
            await CrmLanding.incrementMetric(landing._id, 'formSubmissions', 1, trackingData.abVariant || null);

            // Crear cupón automático de waitlist (15% x 3 compras)
            // NOTA: El email de bienvenida se envía vía secuencia CRM (Email 1 inmediato),
            // NO como email transaccional aquí. Así se trackea correctamente.
            if (slug === 'waitlist' && formData.email) {
                try {
                    const DiscountService = require('../../services/DiscountService');
                    const result = await DiscountService.createWaitlistCoupon(formData.email);
                    if (result.created) {
                        console.log(`[CRM Landing] 🎁 Cupón waitlist creado: ${result.coupon.code} → ${formData.email}`);
                    }
                } catch (couponErr) {
                    console.error('[CRM Landing] Error creando cupón waitlist:', couponErr.message);
                    // No fallar el proceso si el cupón falla
                }
            }

            // Auto-enrollar en secuencias si el CrmLead no tiene secuencias activas
            // Esto cubre el caso de leads que ya existían pero no fueron enrollados
            if (needsAutoEnroll && crmLead?._id) {
                try {
                    const CrmBridgeService = require('./CrmBridgeService');
                    // Poblar leadRef si no está
                    if (!crmLead.leadRef || typeof crmLead.leadRef !== 'object') {
                        const Lead = require('../../models/Lead');
                        const populatedLead = await CrmLead.findById(crmLead._id).populate('leadRef');
                        if (populatedLead) crmLead = populatedLead;
                    }
                    await CrmBridgeService._tryAutoEnroll('lead.created', crmLead);
                    console.log(`[CRM Landing] 🔄 Auto-enroll ejecutado para ${formData.email}`);
                } catch (enrollErr) {
                    console.error('[CRM Landing] Error en auto-enroll:', enrollErr.message);
                }
            }

            console.log(`[CRM Landing] 📝 Form submit en /l/${slug} — email: ${formData.email || 'N/A'}${trackingData.abVariant ? ` (variante ${trackingData.abVariant})` : ''}`);

            return { 
                success: true, 
                message: landing.content?.form?.successMessage || '¡Gracias! Te contactaremos pronto.',
                redirectUrl: landing.content?.form?.redirectUrl || null
            };
        } catch (error) {
            console.error('[CRM Landing] Error en processFormSubmission:', error.message);
            return { success: false, error: 'Error al procesar el formulario' };
        }
    }

    // =========================================================================
    // MÉTRICAS
    // =========================================================================

    /**
     * Obtiene métricas agregadas de todas las landings.
     */
    static async getMetricsSummary() {
        try {
            const result = await CrmLanding.aggregate([
                { $match: { status: { $in: ['published', 'archived'] } } },
                { $group: {
                    _id: null,
                    totalLandings: { $sum: 1 },
                    totalViews: { $sum: '$metrics.views' },
                    totalSubmissions: { $sum: '$metrics.formSubmissions' },
                    avgConversionRate: { 
                        $avg: { 
                            $cond: [
                                { $gt: ['$metrics.views', 0] },
                                { $multiply: [{ $divide: ['$metrics.formSubmissions', '$metrics.views'] }, 100] },
                                0
                            ]
                        }
                    }
                }}
            ]);

            return {
                success: true,
                data: result[0] || {
                    totalLandings: 0,
                    totalViews: 0,
                    totalSubmissions: 0,
                    avgConversionRate: 0
                }
            };
        } catch (error) {
            console.error('[CRM Landing] Error en getMetricsSummary:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Incrementa form_starts (cuando el usuario empieza a llenar el formulario).
     * @param {string} slug
     * @param {string|null} variantName - Nombre de la variante A/B (null = control)
     */
    static async trackFormStart(slug, variantName = null) {
        try {
            const landing = await CrmLanding.findOne({ slug, status: 'published' });
            if (!landing) return { success: false, error: 'Landing no encontrada' };

            await CrmLanding.incrementMetric(landing._id, 'formStarts', 1, variantName);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = CrmLandingService;
