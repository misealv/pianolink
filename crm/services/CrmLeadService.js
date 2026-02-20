/**
 * crm/services/CrmLeadService.js
 * Servicio para gestión avanzada de leads CRM.
 * CRUD + scoring automático + segmentación + enriquecimiento.
 */
const CrmLead = require('../models/CrmLead');
const CrmInteraction = require('../models/CrmInteraction');
const Lead = require('../../models/Lead');

class CrmLeadService {

    // =========================================================================
    // CRUD
    // =========================================================================

    /**
     * Crea o recupera un CrmLead a partir del Lead original del core.
     * Idempotente: si ya existe, retorna el existente.
     */
    static async findOrCreateFromCoreLead(coreLeadId, enrichmentData = {}) {
        try {
            let crmLead = await CrmLead.findOne({ leadRef: coreLeadId });
            if (crmLead) {
                return { success: true, data: crmLead, created: false };
            }

            // Obtener datos del lead original para inferir defaults
            const coreLead = await Lead.findById(coreLeadId).lean();
            if (!coreLead) {
                return { success: false, message: 'Lead original no encontrado', status: 404 };
            }

            const crmLeadData = {
                leadRef: coreLeadId,
                score: 10, // Score base de entrada
                locale: enrichmentData.locale || 'es',
                currency: enrichmentData.currency || 'USD',
                lifecycleStage: 'lead',
                segment: 'cold',
                // Inicializar pipeline según tipo de lead (undefined para no-usado, evita error de validación enum)
                pipelineStudent: coreLead.type === 'client' ? 'lead' : undefined,
                pipelineTeacher: coreLead.type === 'teacher' ? 'lead' : undefined,
                tags: enrichmentData.tags || [],
                attribution: {
                    firstTouch: CrmLeadService._buildAttribution(enrichmentData),
                    lastTouch: CrmLeadService._buildAttribution(enrichmentData),
                    touchpoints: enrichmentData.channel ? [CrmLeadService._buildTouchpoint(enrichmentData)] : []
                },
                externalIds: {
                    fbClickId: enrichmentData.fbclid || '',
                    fbBrowserId: enrichmentData.fbp || '',
                    gClientId: enrichmentData.ga || '',
                    gClickId: enrichmentData.gclid || ''
                }
            };

            // Crear con manejo de race condition (E11000)
            try {
                crmLead = await CrmLead.create(crmLeadData);
            } catch (createErr) {
                if (createErr.code === 11000) {
                    // Race condition — otro proceso ya creó este CrmLead
                    console.log('[CRM] findOrCreateFromCoreLead: race condition detectada, buscando existente...');
                    crmLead = await CrmLead.findOne({ leadRef: coreLeadId });
                    if (crmLead) {
                        return { success: true, data: crmLead, created: false };
                    }
                }
                throw createErr;
            }

            // Registrar interacción de captura
            // Mapear channel de atribución a channel válido de CrmInteraction
            const interactionChannelMap = {
                'referral': 'web', 'organic': 'web', 'direct': 'web',
                'meta_ads': 'ads', 'google_ads': 'ads', 'social': 'web',
                'email': 'email', 'whatsapp': 'whatsapp', 'other': 'web'
            };
            const interactionChannel = interactionChannelMap[enrichmentData.channel] || enrichmentData.channel || 'web';
            // Validar contra enum permitido
            const validChannels = ['web', 'email', 'whatsapp', 'phone', 'in_app', 'ads', 'system'];
            const safeChannel = validChannels.includes(interactionChannel) ? interactionChannel : 'web';

            await CrmInteraction.create({
                leadRef: crmLead._id,
                type: 'form_submit',
                channel: safeChannel,
                metadata: {
                    pageUrl: enrichmentData.landingPage || '',
                    campaignId: enrichmentData.campaignId || null,
                    notes: 'Lead capturado automáticamente'
                },
                utmParams: {
                    source: enrichmentData.utmSource || '',
                    medium: enrichmentData.utmMedium || '',
                    campaign: enrichmentData.utmCampaign || ''
                }
            });

            console.log(`[CRM] Lead enriquecido creado para LeadRef: ${coreLeadId}`);
            return { success: true, data: crmLead, created: true };
        } catch (error) {
            console.error('[CRM] Error en findOrCreateFromCoreLead:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Obtiene un CrmLead por su ID con datos del lead original populados
     */
    static async getById(crmLeadId) {
        try {
            const lead = await CrmLead.findById(crmLeadId)
                .populate('leadRef', 'name email whatsapp whatsappLink type status availability country background')
                .lean();

            if (!lead) {
                return { success: false, message: 'CrmLead no encontrado', status: 404 };
            }

            return { success: true, data: lead };
        } catch (error) {
            console.error('[CRM] Error en getById:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Obtiene un CrmLead por referencia al Lead original
     */
    static async getByLeadRef(leadRefId) {
        try {
            const lead = await CrmLead.findOne({ leadRef: leadRefId })
                .populate('leadRef', 'name email whatsapp whatsappLink type status availability country background')
                .lean();

            if (!lead) {
                return { success: false, message: 'CrmLead no encontrado para este lead', status: 404 };
            }

            return { success: true, data: lead };
        } catch (error) {
            console.error('[CRM] Error en getByLeadRef:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Lista leads con filtros avanzados, paginación y ordenamiento
     */
    static async list(filters = {}) {
        try {
            const {
                segment,
                lista,
                lifecycleStage,
                tags,
                channel,
                minScore,
                maxScore,
                search,
                page = 1,
                limit = 25,
                sortBy = 'createdAt',
                sortOrder = 'desc'
            } = filters;

            const query = {};

            if (segment) query.segment = segment;
            if (lista) query.lista = lista;
            if (lifecycleStage) query.lifecycleStage = lifecycleStage;
            if (tags) query.tags = { $in: Array.isArray(tags) ? tags : [tags] };
            if (channel) query['attribution.firstTouch.channel'] = channel;
            if (minScore !== undefined) query.score = { ...query.score, $gte: Number(minScore) };
            if (maxScore !== undefined) query.score = { ...query.score, $lte: Number(maxScore) };

            const skip = (Number(page) - 1) * Number(limit);
            const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

            // Si hay búsqueda, buscar en el Lead original (nombre/email)
            let leadRefIds = null;
            if (search) {
                const coreLeads = await Lead.find({
                    $or: [
                        { name: { $regex: search, $options: 'i' } },
                        { email: { $regex: search, $options: 'i' } }
                    ]
                }).select('_id').lean();
                leadRefIds = coreLeads.map(l => l._id);
                query.leadRef = { $in: leadRefIds };
            }

            const [leads, total] = await Promise.all([
                CrmLead.find(query)
                    .populate('leadRef', 'name email whatsapp whatsappLink type status createdAt availability country background')
                    .sort(sort)
                    .skip(skip)
                    .limit(Number(limit))
                    .lean(),
                CrmLead.countDocuments(query)
            ]);

            return {
                success: true,
                data: leads,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit))
                }
            };
        } catch (error) {
            console.error('[CRM] Error en list:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Actualiza campos de un CrmLead
     */
    static async update(crmLeadId, updateData) {
        try {
            // Campos que no se pueden actualizar directamente
            const protectedFields = ['leadRef', '_id', 'scoreHistory', 'attribution', 'tasks'];
            protectedFields.forEach(f => delete updateData[f]);

            // Si se actualiza el lead core también (nombre, email, etc.)
            const coreFields = {};
            const coreAllowed = ['name', 'email', 'whatsapp', 'type', 'source', 'notes', 'background', 'country', 'timezone'];
            coreAllowed.forEach(f => {
                if (updateData[f] !== undefined) {
                    coreFields[f] = updateData[f];
                    delete updateData[f];
                }
            });

            const lead = await CrmLead.findByIdAndUpdate(
                crmLeadId,
                { $set: updateData },
                { new: true, runValidators: true }
            ).populate('leadRef', 'name email whatsapp whatsappLink type status availability country background');

            if (!lead) {
                return { success: false, message: 'CrmLead no encontrado', status: 404 };
            }

            // Propagar cambios al Lead core si hay campos del core
            if (Object.keys(coreFields).length > 0 && lead.leadRef?._id) {
                await Lead.findByIdAndUpdate(lead.leadRef._id, { $set: coreFields });
            }

            return { success: true, data: lead };
        } catch (error) {
            console.error('[CRM] Error en update:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    // =========================================================================
    // SCORING
    // =========================================================================

    /**
     * Calcula y actualiza el score de un lead basado en sus interacciones
     */
    static async recalculateScore(crmLeadId) {
        try {
            const crmLead = await CrmLead.findById(crmLeadId);
            if (!crmLead) {
                return { success: false, message: 'CrmLead no encontrado', status: 404 };
            }

            // Obtener conteo de interacciones por tipo
            const interactions = await CrmInteraction.aggregate([
                { $match: { leadRef: crmLead._id } },
                { $group: { _id: '$type', count: { $sum: 1 } } }
            ]);

            const counts = {};
            interactions.forEach(i => { counts[i._id] = i.count; });

            // Calcular score basado en reglas de negocio
            let score = 10; // Base
            const reasons = [];

            // Engagement con emails (+5 por open, +10 por click)
            if (counts.email_open) { score += Math.min(counts.email_open * 5, 15); reasons.push('email_opens'); }
            if (counts.email_click) { score += Math.min(counts.email_click * 10, 20); reasons.push('email_clicks'); }

            // Interés activo (+15 por demo, +20 por completada)
            if (counts.demo_scheduled) { score += 15; reasons.push('demo_scheduled'); }
            if (counts.demo_completed) { score += 20; reasons.push('demo_completed'); }

            // Visitas web (+2 por visita, max 10)
            if (counts.page_view) { score += Math.min(counts.page_view * 2, 10); reasons.push('page_views'); }

            // Pago completado = lead caliente
            if (counts.payment_received) { score += 25; reasons.push('payment_received'); }

            // Formularios (+5)
            if (counts.form_submit) { score += Math.min(counts.form_submit * 5, 10); reasons.push('form_submit'); }

            // Touchpoints múltiples (+3 por cada uno después del primero)
            const touchCount = crmLead.attribution.touchpoints.length;
            if (touchCount > 1) { score += Math.min((touchCount - 1) * 3, 9); reasons.push('multi_touch'); }

            // Lifecycle stage bonus
            const lifecycleBonus = {
                subscriber: 5, lead: 10, qualified: 20,
                opportunity: 30, customer: 40, evangelist: 50
            };
            if (crmLead.lifecycleStage && lifecycleBonus[crmLead.lifecycleStage]) {
                score += lifecycleBonus[crmLead.lifecycleStage];
                reasons.push('lifecycle_' + crmLead.lifecycleStage);
            }

            // Pipeline stage bonus (estudiantes)
            const studentPipelineBonus = {
                contacted: 5, demo_scheduled: 10, demo_completed: 15,
                trial_class: 20, enrolled: 30
            };
            if (crmLead.pipelineStudent && studentPipelineBonus[crmLead.pipelineStudent]) {
                score += studentPipelineBonus[crmLead.pipelineStudent];
                reasons.push('pipeline_student_' + crmLead.pipelineStudent);
            }

            // Pipeline stage bonus (profesores)
            const teacherPipelineBonus = {
                contacted: 5, application_review: 10, interview: 15,
                onboarding: 20, active: 30
            };
            if (crmLead.pipelineTeacher && teacherPipelineBonus[crmLead.pipelineTeacher]) {
                score += teacherPipelineBonus[crmLead.pipelineTeacher];
                reasons.push('pipeline_teacher_' + crmLead.pipelineTeacher);
            }

            score = Math.min(score, 100);
            const reason = reasons.join(', ') || 'recalculated';

            // Guardar score anterior ANTES de la mutación
            const previousScore = crmLead.score;
            await crmLead.updateScore(score, reason);

            return { success: true, data: { score, reason, previousScore } };
        } catch (error) {
            console.error('[CRM] Error en recalculateScore:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Incrementa score por una acción específica
     */
    static async incrementScore(crmLeadId, points, reason) {
        try {
            const crmLead = await CrmLead.findById(crmLeadId);
            if (!crmLead) return { success: false, message: 'CrmLead no encontrado', status: 404 };

            const newScore = Math.min(crmLead.score + points, 100);
            await crmLead.updateScore(newScore, reason);

            return { success: true, data: { score: newScore, reason } };
        } catch (error) {
            console.error('[CRM] Error en incrementScore:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    // =========================================================================
    // SEGMENTACIÓN Y TAGS
    // =========================================================================

    /**
     * Añade tags a un lead
     */
    static async addTags(crmLeadId, newTags) {
        try {
            const lead = await CrmLead.findByIdAndUpdate(
                crmLeadId,
                { $addToSet: { tags: { $each: Array.isArray(newTags) ? newTags : [newTags] } } },
                { new: true }
            );
            if (!lead) return { success: false, message: 'CrmLead no encontrado', status: 404 };
            return { success: true, data: lead.tags };
        } catch (error) {
            console.error('[CRM] Error en addTags:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Remueve tags de un lead
     */
    static async removeTags(crmLeadId, tagsToRemove) {
        try {
            const lead = await CrmLead.findByIdAndUpdate(
                crmLeadId,
                { $pullAll: { tags: Array.isArray(tagsToRemove) ? tagsToRemove : [tagsToRemove] } },
                { new: true }
            );
            if (!lead) return { success: false, message: 'CrmLead no encontrado', status: 404 };
            return { success: true, data: lead.tags };
        } catch (error) {
            console.error('[CRM] Error en removeTags:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Cambia el lifecycle stage de un lead
     */
    static async updateLifecycleStage(crmLeadId, newStage) {
        try {
            const validStages = ['subscriber', 'lead', 'mql', 'sql', 'opportunity', 'customer', 'evangelist'];
            if (!validStages.includes(newStage)) {
                return { success: false, message: `Stage inválido: ${newStage}`, status: 400 };
            }

            const updateData = { lifecycleStage: newStage };
            if (newStage === 'customer') {
                updateData.convertedAt = new Date();
                updateData.segment = 'customer';
            }

            const lead = await CrmLead.findByIdAndUpdate(crmLeadId, updateData, { new: true });
            if (!lead) return { success: false, message: 'CrmLead no encontrado', status: 404 };

            // Registrar interacción del cambio
            await CrmInteraction.create({
                leadRef: crmLeadId,
                type: 'status_changed',
                channel: 'system',
                metadata: { notes: `Lifecycle: ${newStage}` }
            });

            return { success: true, data: lead };
        } catch (error) {
            console.error('[CRM] Error en updateLifecycleStage:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    // =========================================================================
    // PIPELINE
    // =========================================================================

    /**
     * Avanza un lead a la siguiente etapa del pipeline
     * Registra interacción y recalcula score automáticamente
     */
    static async advancePipeline(crmLeadId, newStage, metadata = {}) {
        try {
            const crmLead = await CrmLead.findById(crmLeadId).populate('leadRef', 'type name');
            if (!crmLead) return { success: false, message: 'CrmLead no encontrado', status: 404 };

            const leadType = crmLead.leadRef?.type;
            const previousStage = crmLead.pipelineStudent || crmLead.pipelineTeacher || 'lead';

            // Inicializar pipeline si no existe (fix: leads creados sin pipeline asignado)
            if (crmLead.pipelineStudent == null && crmLead.pipelineTeacher == null) {
                if (leadType === 'teacher') {
                    crmLead.pipelineTeacher = 'lead';
                } else {
                    crmLead.pipelineStudent = 'lead';
                }
                await crmLead.save();
            }

            // Validar y avanzar según tipo
            await crmLead.advancePipeline(newStage);

            // Registrar interacción
            await CrmInteraction.create({
                leadRef: crmLeadId,
                type: 'status_changed',
                channel: 'system',
                metadata: { 
                    notes: `Pipeline ${leadType}: ${previousStage} → ${newStage}`,
                    ...metadata
                }
            });

            // Bonus de score por avance de pipeline
            const pipelineScoreMap = {
                // Estudiantes
                contacted: 5, demo_scheduled: 10, demo_completed: 15,
                trial_class: 20, enrolled: 25,
                // Profesores
                application_review: 5, interview: 10, onboarding: 15, active: 25
            };
            const bonus = pipelineScoreMap[newStage] || 0;
            if (bonus > 0) {
                const newScore = Math.min(crmLead.score + bonus, 100);
                await crmLead.updateScore(newScore, `pipeline_advance:${newStage}`);
            }

            return { success: true, data: crmLead, previousStage };
        } catch (error) {
            console.error('[CRM] Error en advancePipeline:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Marca un lead como perdido/rechazado
     */
    static async markLost(crmLeadId, reason, details = '') {
        try {
            const crmLead = await CrmLead.findById(crmLeadId).populate('leadRef', 'type');
            if (!crmLead) return { success: false, message: 'CrmLead no encontrado', status: 404 };

            // Inicializar pipeline si no existe (fix: leads creados sin pipeline asignado)
            if (crmLead.pipelineStudent == null && crmLead.pipelineTeacher == null) {
                const leadType = crmLead.leadRef?.type;
                if (leadType === 'teacher') {
                    crmLead.pipelineTeacher = 'lead';
                } else {
                    crmLead.pipelineStudent = 'lead';
                }
                await crmLead.save();
            }

            await crmLead.markLost(reason, details);

            await CrmInteraction.create({
                leadRef: crmLeadId,
                type: 'status_changed',
                channel: 'system',
                metadata: { notes: `Lead perdido: ${reason} - ${details}` }
            });

            return { success: true, data: crmLead };
        } catch (error) {
            console.error('[CRM] Error en markLost:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Obtiene distribución del pipeline por tipo de lead
     */
    static async getPipelineDistribution(leadType) {
        try {
            let data;
            if (leadType === 'client' || leadType === 'student') {
                data = await CrmLead.getStudentPipelineDistribution();
            } else {
                data = await CrmLead.getTeacherPipelineDistribution();
            }
            return { success: true, data };
        } catch (error) {
            console.error('[CRM] Error en getPipelineDistribution:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    // =========================================================================
    // TAREAS Y SEGUIMIENTO
    // =========================================================================

    /**
     * Agrega una tarea a un lead
     */
    static async addTask(crmLeadId, taskData) {
        try {
            const crmLead = await CrmLead.findById(crmLeadId);
            if (!crmLead) return { success: false, message: 'CrmLead no encontrado', status: 404 };

            await crmLead.addTask(taskData);

            // Registrar interacción
            await CrmInteraction.create({
                leadRef: crmLeadId,
                type: 'note_added',
                channel: 'system',
                metadata: { notes: `Tarea creada: ${taskData.title}` }
            });

            return { success: true, data: crmLead.tasks };
        } catch (error) {
            console.error('[CRM] Error en addTask:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Completa una tarea de un lead
     */
    static async completeTask(crmLeadId, taskId) {
        try {
            const crmLead = await CrmLead.findById(crmLeadId);
            if (!crmLead) return { success: false, message: 'CrmLead no encontrado', status: 404 };

            await crmLead.completeTask(taskId);

            return { success: true, data: crmLead.tasks };
        } catch (error) {
            console.error('[CRM] Error en completeTask:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Obtiene leads con tareas pendientes
     */
    static async getLeadsWithPendingTasks(limit = 50) {
        try {
            const leads = await CrmLead.getLeadsWithPendingTasks(limit);
            return { success: true, data: leads };
        } catch (error) {
            console.error('[CRM] Error en getLeadsWithPendingTasks:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Obtiene leads sin seguimiento activo (sin tareas pendientes)
     */
    static async getLeadsWithoutFollowUp(days = 7) {
        try {
            const leads = await CrmLead.getLeadsWithoutFollowUp(days);
            return { success: true, data: leads };
        } catch (error) {
            console.error('[CRM] Error en getLeadsWithoutFollowUp:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Obtiene las tareas de un lead específico
     */
    static async getLeadTasks(crmLeadId) {
        try {
            const lead = await CrmLead.findById(crmLeadId).select('tasks nextFollowUp').lean();
            if (!lead) return { success: false, message: 'CrmLead no encontrado', status: 404 };
            return { success: true, data: { tasks: lead.tasks || [], nextFollowUp: lead.nextFollowUp } };
        } catch (error) {
            console.error('[CRM] Error en getLeadTasks:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    // =========================================================================
    // ANALYTICS
    // =========================================================================

    /**
     * Distribución de segmentos para dashboard
     */
    static async getSegmentDistribution() {
        try {
            const distribution = await CrmLead.aggregate([
                { $group: { _id: '$segment', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);
            return { success: true, data: distribution };
        } catch (error) {
            console.error('[CRM] Error en getSegmentDistribution:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Distribución por lifecycle stage
     */
    static async getLifecycleDistribution() {
        try {
            const distribution = await CrmLead.aggregate([
                { $group: { _id: '$lifecycleStage', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);
            return { success: true, data: distribution };
        } catch (error) {
            console.error('[CRM] Error en getLifecycleDistribution:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Top leads por score
     */
    static async getTopLeads(limit = 10) {
        try {
            const leads = await CrmLead.find({ score: { $gt: 0 } })
                .populate('leadRef', 'name email whatsapp whatsappLink type')
                .sort({ score: -1 })
                .limit(limit)
                .lean();
            return { success: true, data: leads };
        } catch (error) {
            console.error('[CRM] Error en getTopLeads:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Leads captados por canal de atribución
     */
    static async getByChannel(startDate, endDate) {
        try {
            const match = {};
            if (startDate || endDate) {
                match.createdAt = {};
                if (startDate) match.createdAt.$gte = new Date(startDate);
                if (endDate) match.createdAt.$lte = new Date(endDate);
            }

            const data = await CrmLead.aggregate([
                { $match: match },
                { $group: {
                    _id: '$attribution.firstTouch.channel',
                    count: { $sum: 1 },
                    avgScore: { $avg: '$score' }
                }},
                { $sort: { count: -1 } }
            ]);

            return { success: true, data };
        } catch (error) {
            console.error('[CRM] Error en getByChannel:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Dashboard de reportes consolidado:
     * - Tasa de conversión por pipeline
     * - Tiempo promedio de conversión
     * - Leads sin seguimiento
     * - Tareas vencidas
     */
    static async getDashboardReport() {
        try {
            const [
                totalLeads,
                studentPipeline,
                teacherPipeline,
                segmentDist,
                overdueTasks,
                noFollowUp,
                conversionStats
            ] = await Promise.all([
                CrmLead.countDocuments({}),
                CrmLead.getStudentPipelineDistribution(),
                CrmLead.getTeacherPipelineDistribution(),
                CrmLead.getSegmentDistribution(),
                CrmLead.countDocuments({ 'tasks.status': 'overdue' }),
                CrmLead.countDocuments({
                    nextFollowUp: null,
                    segment: { $nin: ['customer', 'churned'] },
                    updatedAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                }),
                CrmLead.aggregate([
                    { $match: { convertedAt: { $ne: null } } },
                    { $project: {
                        conversionDays: {
                            $divide: [
                                { $subtract: ['$convertedAt', '$createdAt'] },
                                1000 * 60 * 60 * 24
                            ]
                        }
                    }},
                    { $group: {
                        _id: null,
                        avgDays: { $avg: '$conversionDays' },
                        count: { $sum: 1 }
                    }}
                ])
            ]);

            const convData = conversionStats[0] || { avgDays: 0, count: 0 };

            return {
                success: true,
                data: {
                    totalLeads,
                    studentPipeline,
                    teacherPipeline,
                    segmentDistribution: segmentDist,
                    overdueTasks,
                    leadsWithoutFollowUp: noFollowUp,
                    conversion: {
                        totalConverted: convData.count,
                        avgDaysToConvert: Math.round(convData.avgDays || 0),
                        conversionRate: totalLeads > 0 ? ((convData.count / totalLeads) * 100).toFixed(1) : '0.0'
                    }
                }
            };
        } catch (error) {
            console.error('[CRM] Error en getDashboardReport:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    // =========================================================================
    // MIGRACIÓN
    // =========================================================================

    /**
     * Script de migración: crea CrmLeads para todos los Leads existentes sin CrmLead
     */
    static async migrateExistingLeads() {
        try {
            // Obtener IDs de leads que ya tienen CrmLead
            const existingRefs = await CrmLead.find({}).select('leadRef').lean();
            const existingRefIds = existingRefs.map(c => c.leadRef.toString());

            // Obtener leads sin CrmLead
            const orphanLeads = await Lead.find({
                _id: { $nin: existingRefIds }
            }).lean();

            let created = 0;
            let errors = 0;

            for (const lead of orphanLeads) {
                try {
                    await CrmLead.create({
                        leadRef: lead._id,
                        score: 5,
                        locale: 'es',
                        currency: 'USD',
                        lifecycleStage: lead.status === 'converted' ? 'customer' : 'lead',
                        segment: lead.status === 'converted' ? 'customer' : 'cold',
                        // Inicializar pipeline según tipo
                        pipelineStudent: lead.type === 'client' ? (lead.status === 'converted' ? 'enrolled' : 'lead') : null,
                        pipelineTeacher: lead.type === 'teacher' ? (lead.status === 'converted' ? 'active' : 'lead') : null,
                        attribution: {
                            firstTouch: { channel: 'organic', timestamp: lead.createdAt || new Date() },
                            lastTouch: { channel: 'organic', timestamp: lead.createdAt || new Date() },
                            touchpoints: [{ channel: 'organic', timestamp: lead.createdAt || new Date() }]
                        }
                    });
                    created++;
                } catch (err) {
                    // Duplicado u otro error — continuar
                    errors++;
                }
            }

            console.log(`[CRM] Migración completada: ${created} creados, ${errors} errores, ${orphanLeads.length} total`);
            return { success: true, data: { created, errors, total: orphanLeads.length } };
        } catch (error) {
            console.error('[CRM] Error en migrateExistingLeads:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    // =========================================================================
    // HELPERS PRIVADOS
    // =========================================================================

    /**
     * Construye un objeto de atribución desde datos de enriquecimiento
     */
    static _buildAttribution(data) {
        return {
            channel: data.channel || 'organic',
            campaignId: data.campaignId || null,
            utmSource: data.utmSource || '',
            utmMedium: data.utmMedium || '',
            utmCampaign: data.utmCampaign || '',
            utmContent: data.utmContent || '',
            utmTerm: data.utmTerm || '',
            landingPage: data.landingPage || '',
            referrer: data.referrer || '',
            timestamp: new Date()
        };
    }

    /**
     * Construye un touchpoint desde datos de enriquecimiento
     */
    static _buildTouchpoint(data) {
        return {
            channel: data.channel || 'organic',
            campaignId: data.campaignId || null,
            timestamp: new Date(),
            pageUrl: data.landingPage || '',
            utmSource: data.utmSource || '',
            utmMedium: data.utmMedium || '',
            utmCampaign: data.utmCampaign || ''
        };
    }
}

module.exports = CrmLeadService;
