/**
 * crm/services/CrmBridgeService.js
 * Puente de eventos: escucha eventos del core de PianoLink y los traduce
 * a acciones CRM (crear CrmLead, registrar interacción, registrar conversión).
 * 
 * Se registra como listener del EventService existente.
 * Principio: el core NO sabe que el CRM existe. Solo emite eventos.
 */
const CrmLead = require('../models/CrmLead');
const CrmInteraction = require('../models/CrmInteraction');
const CrmConversion = require('../models/CrmConversion');
const CrmLeadService = require('./CrmLeadService');
const CrmCampaignService = require('./CrmCampaignService');

// Lazy-load para evitar dependencia circular
let _CrmSequenceService = null;
function getCrmSequenceService() {
    if (!_CrmSequenceService) {
        try { _CrmSequenceService = require('./CrmSequenceService'); } catch (e) { /* no disponible */ }
    }
    return _CrmSequenceService;
}
let _CrmSequenceModel = null;
function getCrmSequenceModel() {
    if (!_CrmSequenceModel) {
        try { _CrmSequenceModel = require('../models/CrmSequence'); } catch (e) { /* no disponible */ }
    }
    return _CrmSequenceModel;
}

// Lazy-load: Dispatcher de tracking a Meta/Google/GA4 (Fase 3)
let _CrmTrackingDispatcher = null;
function getTrackingDispatcher() {
    if (!_CrmTrackingDispatcher) {
        try { _CrmTrackingDispatcher = require('./CrmTrackingDispatcher'); } catch (e) { /* no disponible */ }
    }
    return _CrmTrackingDispatcher;
}

class CrmBridgeService {

    /**
     * Registra todos los listeners del CRM en el EventService del core.
     * Llamar una sola vez al iniciar el servidor.
     */
    static registerListeners(eventService) {
        if (!eventService || !eventService.registerListener) {
            console.warn('[CRM Bridge] ⚠️ EventService no disponible, bridge desactivado');
            return;
        }

        // === LEAD EVENTS ===
        eventService.registerListener(
            'lead.created',
            (data) => CrmBridgeService._onLeadCreated(data),
            'CrmBridge:lead.created'
        );

        eventService.registerListener(
            'lead.statusChanged',
            (data) => CrmBridgeService._onLeadStatusChanged(data),
            'CrmBridge:lead.statusChanged'
        );

        // === BOOKING EVENTS ===
        eventService.registerListener(
            'booking.completed',
            (data) => CrmBridgeService._onBookingCompleted(data),
            'CrmBridge:booking.completed'
        );

        eventService.registerListener(
            'booking.created',
            (data) => CrmBridgeService._onBookingCreated(data),
            'CrmBridge:booking.created'
        );

        // === PAYMENT EVENTS ===
        eventService.registerListener(
            'payment.received',
            (data) => CrmBridgeService._onPaymentReceived(data),
            'CrmBridge:payment.received'
        );

        // === TEACHER EVENTS ===
        eventService.registerListener(
            'teacher.created',
            (data) => CrmBridgeService._onTeacherCreated(data),
            'CrmBridge:teacher.created'
        );

        console.log('[CRM Bridge] ✅ 6 listeners registrados en EventService');
    }

    // =========================================================================
    // HANDLERS DE EVENTOS
    // =========================================================================

    /**
     * Cuando se crea un lead en el core → crear CrmLead enriquecido
     */
    static async _onLeadCreated(data) {
        try {
            // El core emite { leadId, name, email, type, source, isManual }
            const leadId = data.leadId || data.lead?._id;
            if (!leadId) return;

            // Obtener datos completos del lead (UTMs, tracking, etc.) desde el core
            const Lead = require('../../models/Lead');
            const coreLead = await Lead.findById(leadId).lean();
            if (!coreLead) return;

            // Extraer UTMs y tracking del lead del core
            const utmParams = {
                source: coreLead.utmSource || data.utmSource || '',
                medium: coreLead.utmMedium || data.utmMedium || '',
                campaign: coreLead.utmCampaign || data.utmCampaign || '',
                content: data.utmContent || '',
                term: data.utmTerm || ''
            };
            const referrer = coreLead.trackingData?.referrer || data.referrer || '';
            const landingPage = data.landingPage || '';
            const fbclid = coreLead.trackingData?.fbClickId || data.fbclid || '';
            const gclid = coreLead.trackingData?.gClientId || data.gclid || '';
            const ga = data.ga || '';

            // Determinar canal de atribución
            let channel = 'organic';
            if (fbclid) channel = 'meta_ads';
            else if (gclid) channel = 'google_ads';
            else if (utmParams.source) {
                if (utmParams.source.includes('facebook') || utmParams.source.includes('meta')) channel = 'meta_ads';
                else if (utmParams.source.includes('google')) channel = 'google_ads';
                else if (utmParams.source.includes('email')) channel = 'email';
                else channel = 'referral';
            }
            else if (referrer) channel = 'referral';

            const enrichment = {
                channel,
                utmSource: utmParams.source,
                utmMedium: utmParams.medium,
                utmCampaign: utmParams.campaign,
                utmContent: utmParams.content,
                utmTerm: utmParams.term,
                landingPage,
                referrer,
                fbclid,
                gclid,
                ga,
                campaignId: data.campaignId || null,
                locale: data.locale || 'es',
                currency: data.currency || 'USD',
                tags: data.tags || []
            };

            const result = await CrmLeadService.findOrCreateFromCoreLead(leadId, enrichment);

            // Si tiene campaña, incrementar métricas
            if (result.success && result.created && data.campaignId) {
                await CrmCampaignService.registerLeadForCampaign(data.campaignId);
            }

            // Registrar conversión de captura
            if (result.success && result.created) {
                await CrmConversion.create({
                    leadRef: result.data._id,
                    type: 'lead_capture',
                    campaignId: data.campaignId || null,
                    attribution: {
                        model: 'first_touch',
                        channel,
                        touchpointCount: 1
                    }
                });
            }

            console.log(`[CRM Bridge] lead.created → CrmLead ${result.created ? 'creado' : 'existente'}`);

            // Auto-enroll en secuencias que tengan trigger 'lead.created'
            if (result.success && result.data) {
                await CrmBridgeService._tryAutoEnroll('lead.created', result.data);
            }
        } catch (error) {
            console.error('[CRM Bridge] Error en _onLeadCreated:', error);
        }
    }

    /**
     * Cuando un lead cambia de estado en el core → actualizar lifecycle
     */
    static async _onLeadStatusChanged(data) {
        try {
            const { lead, newStatus, oldStatus } = data;
            if (!lead || !lead._id) return;

            const crmLead = await CrmLead.findOne({ leadRef: lead._id });
            if (!crmLead) return;

            // Mapear estados del core a lifecycle stages del CRM
            const stageMap = {
                'new': 'lead',
                'contacted': 'mql',
                'interested': 'sql',
                'demo_scheduled': 'sql',
                'negotiation': 'opportunity',
                'converted': 'customer',
                'lost': 'lead'
            };

            const newStage = stageMap[newStatus];
            if (newStage && newStage !== crmLead.lifecycleStage) {
                await CrmLeadService.updateLifecycleStage(crmLead._id, newStage);

                // Incrementar score por avance en el funnel
                const scoreBonus = {
                    'mql': 10,
                    'sql': 15,
                    'opportunity': 20,
                    'customer': 25
                };
                if (scoreBonus[newStage]) {
                    await CrmLeadService.incrementScore(crmLead._id, scoreBonus[newStage], `lifecycle_${newStage}`);
                }
            }

            console.log(`[CRM Bridge] lead.statusChanged → ${oldStatus} → ${newStatus}`);

            // Auto-enroll en secuencias con trigger 'lead.statusChanged'
            await CrmBridgeService._tryAutoEnroll('lead.statusChanged', crmLead);
        } catch (error) {
            console.error('[CRM Bridge] Error en _onLeadStatusChanged:', error);
        }
    }

    /**
     * Cuando se crea una reserva → registrar interacción
     */
    static async _onBookingCreated(data) {
        try {
            const { booking, leadId } = data;
            if (!leadId) return;

            const crmLead = await CrmLead.findOne({ leadRef: leadId });
            if (!crmLead) return;

            await CrmInteraction.create({
                leadRef: crmLead._id,
                type: 'booking_created',
                channel: 'in_app',
                metadata: {
                    bookingId: booking?._id || null,
                    notes: `Booking creada: ${booking?.date || 'sin fecha'}`
                }
            });

            // Registrar conversión de demo agendada
            await CrmConversion.create({
                leadRef: crmLead._id,
                type: 'demo_scheduled',
                campaignId: crmLead.attribution?.firstTouch?.campaignId || null,
                attribution: {
                    model: 'first_touch',
                    channel: crmLead.attribution?.firstTouch?.channel || 'organic',
                    touchpointCount: crmLead.attribution?.touchpoints?.length || 0
                },
                coreRef: { type: 'booking', id: booking?._id || null }
            });

            await CrmLeadService.incrementScore(crmLead._id, 15, 'booking_created');

            // Auto-enroll en secuencias con trigger 'booking.created'
            await CrmBridgeService._tryAutoEnroll('booking.created', crmLead);

            console.log(`[CRM Bridge] booking.created → interacción y conversión registradas`);
        } catch (error) {
            console.error('[CRM Bridge] Error en _onBookingCreated:', error);
        }
    }

    /**
     * Cuando se completa una clase → registrar conversión
     */
    static async _onBookingCompleted(data) {
        try {
            const { booking, leadId } = data;
            if (!leadId) return;

            const crmLead = await CrmLead.findOne({ leadRef: leadId });
            if (!crmLead) return;

            await CrmInteraction.create({
                leadRef: crmLead._id,
                type: 'booking_completed',
                channel: 'in_app',
                metadata: {
                    bookingId: booking?._id || null,
                    duration: booking?.duration || null,
                    notes: 'Clase completada'
                }
            });

            // Si es la primera clase, registrar conversión especial
            const existingFirst = await CrmConversion.findOne({
                leadRef: crmLead._id,
                type: 'first_class'
            });

            if (!existingFirst) {
                const newConversion = await CrmConversion.create({
                    leadRef: crmLead._id,
                    type: 'first_class',
                    value: booking?.price || 0,
                    currency: crmLead.currency || 'USD',
                    campaignId: crmLead.attribution?.firstTouch?.campaignId || null,
                    attribution: {
                        model: 'first_touch',
                        channel: crmLead.attribution?.firstTouch?.channel || 'organic',
                        touchpointCount: crmLead.attribution?.touchpoints?.length || 0
                    },
                    coreRef: { type: 'booking', id: booking?._id || null }
                });

                // Actualizar valor del cliente
                crmLead.customerValue += (booking?.price || 0);
                await crmLead.save();

                // Fase 3: dispatch inmediato a Meta/Google/GA4
                CrmBridgeService._dispatchConversion(newConversion._id);
            }

            await CrmLeadService.incrementScore(crmLead._id, 20, 'booking_completed');

            // Auto-enroll en secuencias con trigger 'booking.completed'
            await CrmBridgeService._tryAutoEnroll('booking.completed', crmLead);

            console.log(`[CRM Bridge] booking.completed → clase registrada`);
        } catch (error) {
            console.error('[CRM Bridge] Error en _onBookingCompleted:', error);
        }
    }

    /**
     * Cuando se recibe un pago → registrar conversión con valor
     */
    static async _onPaymentReceived(data) {
        try {
            const { payment, leadId, userId } = data;
            const refId = leadId || userId;
            if (!refId) return;

            const crmLead = await CrmLead.findOne({ leadRef: refId });
            if (!crmLead) return;

            const amountCents = payment?.amount || 0;
            const currency = payment?.currency || crmLead.currency || 'USD';

            // Registrar interacción
            await CrmInteraction.create({
                leadRef: crmLead._id,
                type: 'payment_received',
                channel: 'system',
                metadata: {
                    paymentAmount: amountCents,
                    paymentCurrency: currency,
                    notes: `Pago recibido: ${amountCents} ${currency}`
                }
            });

            // Determinar tipo de conversión
            const convType = payment?.type === 'subscription' ? 'subscription' :
                             payment?.type === 'kit' ? 'kit_purchase' : 'class_purchase';

            const newConversion = await CrmConversion.create({
                leadRef: crmLead._id,
                type: convType,
                value: amountCents,
                currency: currency,
                campaignId: crmLead.attribution?.firstTouch?.campaignId || null,
                attribution: {
                    model: 'first_touch',
                    channel: crmLead.attribution?.firstTouch?.channel || 'organic',
                    touchpointCount: crmLead.attribution?.touchpoints?.length || 0
                },
                coreRef: { type: 'payment', id: payment?._id || null }
            });

            // Fase 3: dispatch inmediato a Meta/Google/GA4 (conversión de alto valor)
            CrmBridgeService._dispatchConversion(newConversion._id);

            // Actualizar LTV del lead
            crmLead.customerValue += amountCents;
            if (crmLead.lifecycleStage !== 'customer' && crmLead.lifecycleStage !== 'evangelist') {
                crmLead.lifecycleStage = 'customer';
                crmLead.segment = 'customer';
                crmLead.convertedAt = new Date();
            }
            await crmLead.save();

            // === Desuscribir de TODAS las secuencias activas (ya es cliente) ===
            const activeEnrollments = (crmLead.activeSequences || []).filter(s => s.status === 'active');
            if (activeEnrollments.length > 0) {
                const CrmSequenceService = require('./CrmSequenceService');
                for (const enrollment of activeEnrollments) {
                    await CrmSequenceService.unenrollLead(
                        enrollment.sequenceId.toString(),
                        crmLead._id
                    );
                }
                console.log(`[CRM Bridge] 🛑 Lead ${crmLead._id} desuscrito de ${activeEnrollments.length} secuencia(s) activa(s) por compra`);
            }

            // Actualizar métricas de campaña
            const campaignId = crmLead.attribution?.firstTouch?.campaignId;
            if (campaignId) {
                await CrmCampaignService.registerConversionForCampaign(campaignId, amountCents);
            }

            await CrmLeadService.incrementScore(crmLead._id, 25, 'payment_received');

            // Auto-enroll en secuencias con trigger 'payment.received'
            await CrmBridgeService._tryAutoEnroll('payment.received', crmLead);

            console.log(`[CRM Bridge] payment.received → ${amountCents} ${currency} (${convType})`);
        } catch (error) {
            console.error('[CRM Bridge] Error en _onPaymentReceived:', error);
        }
    }

    /**
     * Cuando se crea un profesor → crear CrmLead como customer convertido
     */
    static async _onTeacherCreated(data) {
        try {
            const { teacher, leadId } = data;
            if (!leadId && !teacher?._id) return;

            const refId = leadId || teacher._id;
            let crmLead = await CrmLead.findOne({ leadRef: refId });

            if (crmLead) {
                // Actualizar a customer
                crmLead.lifecycleStage = 'customer';
                crmLead.segment = 'customer';
                crmLead.convertedAt = new Date();
                if (!crmLead.tags.includes('teacher')) crmLead.tags.push('teacher');
                await crmLead.save();
            } else {
                // Crear nuevo CrmLead directamente como customer
                await CrmLeadService.findOrCreateFromCoreLead(refId, {
                    channel: 'organic',
                    tags: ['teacher'],
                    locale: teacher?.locale || 'es',
                    currency: teacher?.currency || 'USD'
                });

                crmLead = await CrmLead.findOne({ leadRef: refId });
                if (crmLead) {
                    crmLead.lifecycleStage = 'customer';
                    crmLead.segment = 'customer';
                    crmLead.convertedAt = new Date();
                    crmLead.score = 80;
                    await crmLead.save();
                }
            }

            console.log(`[CRM Bridge] teacher.created → CrmLead actualizado como teacher/customer`);
        } catch (error) {
            console.error('[CRM Bridge] Error en _onTeacherCreated:', error);
        }
    }

    // =========================================================================
    // AUTO-ENROLL EN SECUENCIAS POR TRIGGER
    // =========================================================================

    /**
     * Intenta inscribir automáticamente a un CrmLead en secuencias activas
     * cuyo trigger coincida con el evento recibido.
     * 
     * @param {string} eventName - Nombre del evento (ej. 'lead.created')
     * @param {Object} crmLead - Documento CrmLead (con leadRef populado o no)
     */
    static async _tryAutoEnroll(eventName, crmLead) {
        try {
            const SequenceModel = getCrmSequenceModel();
            const SequenceService = getCrmSequenceService();
            if (!SequenceModel || !SequenceService) return;

            // Buscar secuencias activas con este trigger
            const matchingSequences = await SequenceModel.getActiveByTrigger(eventName);
            if (!matchingSequences || matchingSequences.length === 0) return;

            for (const seq of matchingSequences) {
                try {
                    // Evaluar condiciones del trigger
                    const conditions = seq.trigger?.conditions || {};
                    
                    // Filtro por tipo de lead (teacher/client)
                    if (conditions.leadType && conditions.leadType !== '') {
                        const leadData = crmLead.leadRef;
                        const leadType = typeof leadData === 'object' ? leadData.type : null;
                        if (leadType && leadType !== conditions.leadType) continue;
                    }

                    // Filtro por segmento
                    if (conditions.segment && conditions.segment !== '' && crmLead.segment !== conditions.segment) {
                        continue;
                    }

                    // Filtro por tags (el lead debe tener TODOS los tags requeridos)
                    if (conditions.tags && conditions.tags.length > 0) {
                        const leadTags = crmLead.tags || [];
                        const hasAllTags = conditions.tags.every(t => leadTags.includes(t));
                        if (!hasAllTags) continue;
                    }

                    // Filtro por score mínimo
                    if (conditions.minScore && (crmLead.score || 0) < conditions.minScore) {
                        continue;
                    }

                    // Filtro por audiencia
                    if (seq.targetAudience && seq.targetAudience !== 'all') {
                        const leadData = crmLead.leadRef;
                        const leadType = typeof leadData === 'object' ? leadData.type : null;
                        if (seq.targetAudience === 'teachers' && leadType !== 'teacher') continue;
                        if (seq.targetAudience === 'students' && leadType !== 'client') continue;
                    }

                    // Inscribir (enrollLead ya verifica duplicados y unsubscribed)
                    const result = await SequenceService.enrollLead(seq._id.toString(), crmLead._id.toString());
                    if (result.success) {
                        console.log(`[CRM Bridge] Auto-enroll: lead ${crmLead._id} → secuencia "${seq.name}"`);
                    }
                } catch (seqError) {
                    console.error(`[CRM Bridge] Error auto-enrolling en secuencia ${seq._id}:`, seqError.message);
                }
            }
        } catch (error) {
            console.error('[CRM Bridge] Error en _tryAutoEnroll:', error.message);
        }
    }

    // =========================================================================
    // FASE 3: DISPATCH INMEDIATO A PLATAFORMAS
    // =========================================================================

    /**
     * Despacha una conversión de alto valor a Meta/Google/GA4 en segundo plano.
     * No bloquea el flujo principal — errores se loguean y no se propagan.
     * @param {ObjectId} conversionId
     */
    static _dispatchConversion(conversionId) {
        const dispatcher = getTrackingDispatcher();
        if (!dispatcher) return;

        // Fire-and-forget: no bloqueamos el handler del evento
        dispatcher.dispatchImmediate(conversionId).catch(err => {
            console.error('[CRM Bridge] Error en dispatch inmediato:', err.message);
        });
    }
}

module.exports = CrmBridgeService;
