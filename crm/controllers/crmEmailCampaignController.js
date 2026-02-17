/**
 * crm/controllers/crmEmailCampaignController.js
 * Controlador HTTP para campañas de email marketing.
 * 
 * COMPLETADO: Controller de email marketing para lanzamiento Día 88
 */
const CrmEmailCampaign = require('../models/CrmEmailCampaign');
const { getInstance: getResendService } = require('../services/CrmResendService');

// === CRUD ===

/**
 * Listar campañas de email
 * GET /api/crm/emails
 */
exports.list = async (req, res) => {
    try {
        const { estado, tipo, page = 1, limit = 20 } = req.query;
        const filter = {};

        if (estado) filter.estado = estado;
        if (tipo) filter.tipo = tipo;

        const skip = (Number(page) - 1) * Number(limit);

        const [campaigns, total] = await Promise.all([
            CrmEmailCampaign.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('createdBy', 'name email')
                .lean(),
            CrmEmailCampaign.countDocuments(filter)
        ]);

        // Enriquecer campañas tipo "secuencia" con métricas reales de CrmSequence
        const seqCampaigns = campaigns.filter(c => c.tipo === 'secuencia' && c.ordenSecuencia);
        if (seqCampaigns.length > 0) {
            try {
                const CrmSequence = require('../models/CrmSequence');
                // Buscar la secuencia de lanzamiento activa
                const sequence = await CrmSequence.findOne({ status: 'active', 'trigger.event': 'lead.created' }).lean();
                if (sequence?.steps) {
                    for (const campaign of seqCampaigns) {
                        const step = sequence.steps.find(s => s.order === campaign.ordenSecuencia);
                        if (step?.metrics) {
                            campaign.metricas = {
                                ...campaign.metricas,
                                totalEnviados: step.metrics.sent || 0,
                                totalAbiertos: step.metrics.opened || 0,
                                totalClicks: step.metrics.clicked || 0,
                                totalRebotes: step.metrics.bounced || 0,
                                totalDesuscripciones: step.metrics.unsubscribed || 0
                            };
                        }
                    }
                }
            } catch (seqErr) {
                console.error('[Email Campaign Controller] Error enriqueciendo métricas:', seqErr.message);
            }
        }

        res.json({
            success: true,
            data: campaigns,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error) {
        console.error('[Email Campaign Controller] Error en list:', error);
        res.status(500).json({ success: false, error: 'Error al listar campañas' });
    }
};

/**
 * Obtener campaña por ID
 * GET /api/crm/emails/:id
 */
exports.getById = async (req, res) => {
    try {
        const campaign = await CrmEmailCampaign.findById(req.params.id)
            .populate('createdBy', 'name email');

        if (!campaign) {
            return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
        }

        res.json({ success: true, data: campaign });
    } catch (error) {
        console.error('[Email Campaign Controller] Error en getById:', error);
        res.status(500).json({ success: false, error: 'Error al obtener campaña' });
    }
};

/**
 * Crear nueva campaña
 * POST /api/crm/emails
 */
exports.create = async (req, res) => {
    try {
        const { nombre, asunto, previewText, contenidoHtml, tipo, targeting } = req.body;

        if (!nombre || !asunto || !contenidoHtml) {
            return res.status(400).json({ 
                success: false, 
                error: 'Campos requeridos: nombre, asunto, contenidoHtml' 
            });
        }

        const campaign = new CrmEmailCampaign({
            nombre,
            asunto,
            previewText: previewText || '',
            contenidoHtml,
            tipo: tipo || 'broadcast',
            targeting: targeting || {},
            createdBy: req.user?._id
        });

        await campaign.save();
        res.status(201).json({ success: true, data: campaign });
    } catch (error) {
        console.error('[Email Campaign Controller] Error en create:', error);
        res.status(500).json({ success: false, error: 'Error al crear campaña' });
    }
};

/**
 * Actualizar campaña
 * PUT /api/crm/emails/:id
 */
exports.update = async (req, res) => {
    try {
        const campaign = await CrmEmailCampaign.findById(req.params.id);

        if (!campaign) {
            return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
        }

        // Solo permitir edición en borrador o programado (si solo cambian estado)
        if (campaign.estado === 'enviado' || campaign.estado === 'enviando') {
            return res.status(400).json({ 
                success: false, 
                error: 'No se pueden editar campañas enviadas o en envío' 
            });
        }

        const allowedFields = ['nombre', 'asunto', 'previewText', 'contenidoHtml', 'tipo', 'ordenSecuencia', 'fechaProgramada', 'estado', 'targeting', 'notas', 'modoEnvio', 'triggerEvento', 'triggerDelayMinutos', 'diasDespuesRegistro', 'fechaLimiteEntrada', 'contenidoHtmlActivos', 'umbralEngagement'];
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                campaign[field] = req.body[field];
            }
        });

        // Triggers no necesitan fechaProgramada — limpiarla si se cambió a trigger
        const esTrigger = campaign.tipo === 'trigger' || campaign.modoEnvio === 'trigger';
        if (esTrigger && !campaign.fechaProgramada) {
            campaign.fechaProgramada = null;
        }

        await campaign.save();
        res.json({ success: true, data: campaign });
    } catch (error) {
        console.error('[Email Campaign Controller] Error en update:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar campaña' });
    }
};

/**
 * Eliminar campaña (solo borradores)
 * DELETE /api/crm/emails/:id
 */
exports.remove = async (req, res) => {
    try {
        const campaign = await CrmEmailCampaign.findById(req.params.id);

        if (!campaign) {
            return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
        }

        if (campaign.estado !== 'borrador') {
            return res.status(400).json({ 
                success: false, 
                error: 'Solo se pueden eliminar campañas en borrador' 
            });
        }

        await campaign.deleteOne();
        res.json({ success: true, message: 'Campaña eliminada' });
    } catch (error) {
        console.error('[Email Campaign Controller] Error en remove:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar campaña' });
    }
};

// === ACCIONES ===

/**
 * Enviar campaña ahora
 * POST /api/crm/emails/:id/enviar
 */
exports.send = async (req, res) => {
    try {
        const resendService = getResendService();
        const result = await resendService.sendCampaign(req.params.id);

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json(result);
    } catch (error) {
        console.error('[Email Campaign Controller] Error en send:', error);
        res.status(500).json({ success: false, error: 'Error al enviar campaña' });
    }
};

/**
 * Programar envío
 * POST /api/crm/emails/:id/programar
 * 
 * Para broadcasts/secuencias: requiere { fechaProgramada }
 * Para triggers (carrito abandonado, etc.): no requiere fecha, se activa por evento
 */
exports.schedule = async (req, res) => {
    try {
        const { fechaProgramada } = req.body;

        const campaign = await CrmEmailCampaign.findById(req.params.id);

        if (!campaign) {
            return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
        }

        if (campaign.estado !== 'borrador') {
            return res.status(400).json({ 
                success: false, 
                error: 'Solo se pueden programar campañas en borrador' 
            });
        }

        // Triggers no necesitan fecha — se disparan por evento
        const esTrigger = campaign.tipo === 'trigger' || campaign.modoEnvio === 'trigger';

        if (!esTrigger && !fechaProgramada) {
            return res.status(400).json({ success: false, error: 'Fecha requerida para campañas no-trigger' });
        }

        campaign.estado = 'programado';
        if (fechaProgramada) {
            campaign.fechaProgramada = new Date(fechaProgramada);
        }
        await campaign.save();

        const mensaje = esTrigger
            ? `Trigger "${campaign.nombre}" activado — se disparará por evento "${campaign.triggerEvento}" con ${campaign.triggerDelayMinutos} min de delay`
            : `Campaña "${campaign.nombre}" programada para ${campaign.fechaProgramada.toISOString()}`;

        res.json({ success: true, data: campaign, message: mensaje });
    } catch (error) {
        console.error('[Email Campaign Controller] Error en schedule:', error);
        res.status(500).json({ success: false, error: 'Error al programar campaña' });
    }
};

/**
 * Preview HTML de la campaña
 * GET /api/crm/emails/:id/preview
 */
exports.preview = async (req, res) => {
    try {
        const campaign = await CrmEmailCampaign.findById(req.params.id);

        if (!campaign) {
            return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
        }

        // Reemplazar variables con datos de ejemplo
        let html = campaign.contenidoHtml;
        html = html.replace(/\{\{nombre\}\}/g, 'Juan');
        html = html.replace(/\{\{email\}\}/g, 'juan@ejemplo.com');
        html = html.replace(/\{\{unsubscribe_url\}\}/g, '#');

        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (error) {
        console.error('[Email Campaign Controller] Error en preview:', error);
        res.status(500).json({ success: false, error: 'Error al previsualizar' });
    }
};

/**
 * Obtener estadísticas de la campaña
 * GET /api/crm/emails/:id/stats
 */
exports.stats = async (req, res) => {
    try {
        const campaign = await CrmEmailCampaign.findById(req.params.id).lean();

        if (!campaign) {
            return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
        }

        let metricas = { ...campaign.metricas };

        // Para campañas tipo secuencia, leer métricas reales de CrmSequence
        if (campaign.tipo === 'secuencia' && campaign.ordenSecuencia) {
            try {
                const CrmSequence = require('../models/CrmSequence');
                const sequence = await CrmSequence.findOne({ status: 'active', 'trigger.event': 'lead.created' }).lean();
                const step = sequence?.steps?.find(s => s.order === campaign.ordenSecuencia);
                if (step?.metrics) {
                    metricas.totalEnviados = step.metrics.sent || 0;
                    metricas.totalAbiertos = step.metrics.opened || 0;
                    metricas.totalClicks = step.metrics.clicked || 0;
                    metricas.totalRebotes = step.metrics.bounced || 0;
                    metricas.totalDesuscripciones = step.metrics.unsubscribed || 0;
                }
            } catch (seqErr) {
                console.error('[Email Campaign Controller] Error leyendo métricas secuencia:', seqErr.message);
            }
        }

        const stats = {
            ...metricas,
            tasaApertura: metricas.totalEnviados 
                ? ((metricas.totalAbiertos / metricas.totalEnviados) * 100).toFixed(2) 
                : 0,
            tasaClicks: metricas.totalEnviados 
                ? ((metricas.totalClicks / metricas.totalEnviados) * 100).toFixed(2) 
                : 0,
            tasaRebote: metricas.totalEnviados 
                ? ((metricas.totalRebotes / metricas.totalEnviados) * 100).toFixed(2) 
                : 0
        };

        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('[Email Campaign Controller] Error en stats:', error);
        res.status(500).json({ success: false, error: 'Error al obtener estadísticas' });
    }
};

/**
 * Duplicar campaña
 * POST /api/crm/emails/:id/duplicar
 */
exports.duplicate = async (req, res) => {
    try {
        const campaign = await CrmEmailCampaign.findById(req.params.id);

        if (!campaign) {
            return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
        }

        const copy = await campaign.duplicar();
        res.status(201).json({ success: true, data: copy });
    } catch (error) {
        console.error('[Email Campaign Controller] Error en duplicate:', error);
        res.status(500).json({ success: false, error: 'Error al duplicar campaña' });
    }
};

/**
 * Enviar email de prueba
 * POST /api/crm/emails/:id/test
 */
exports.sendTest = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, error: 'Email requerido' });
        }

        const campaign = await CrmEmailCampaign.findById(req.params.id);

        if (!campaign) {
            return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
        }

        const resendService = getResendService();
        const result = await resendService.sendEmail(
            email,
            `[TEST] ${campaign.asunto}`,
            campaign.contenidoHtml,
            { nombre: 'Prueba' }
        );

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json({ success: true, message: `Email de prueba enviado a ${email}` });
    } catch (error) {
        console.error('[Email Campaign Controller] Error en sendTest:', error);
        res.status(500).json({ success: false, error: 'Error al enviar prueba' });
    }
};

/**
 * Obtener leads con detalle de interacciones para una campaña de secuencia
 * GET /api/crm/emails/:id/leads
 */
exports.leads = async (req, res) => {
    try {
        const campaign = await CrmEmailCampaign.findById(req.params.id).lean();
        if (!campaign) {
            return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
        }

        if (campaign.tipo !== 'secuencia' || !campaign.ordenSecuencia) {
            return res.json({ success: true, data: [], message: 'Solo disponible para campañas de secuencia' });
        }

        const CrmSequence = require('../models/CrmSequence');
        const CrmInteraction = require('../models/CrmInteraction');
        const CrmLead = require('../models/CrmLead');

        // Buscar secuencia activa
        const sequence = await CrmSequence.findOne({ status: 'active', 'trigger.event': 'lead.created' }).lean();
        if (!sequence) {
            return res.json({ success: true, data: [] });
        }

        const seqId = sequence._id.toString();
        const stepNum = campaign.ordenSecuencia;

        // Buscar todas las interacciones de este step (sent, open, click)
        const interactions = await CrmInteraction.find({
            'metadata.emailSequenceId': sequence._id,
            'metadata.emailStepNumber': stepNum,
            type: { $in: ['email_sent', 'email_open', 'email_click'] }
        }).lean();

        // Agrupar por leadRef
        const leadMap = {};
        for (const inter of interactions) {
            const lid = inter.leadRef?.toString();
            if (!lid) continue;
            if (!leadMap[lid]) leadMap[lid] = { crmLeadId: lid, sent: false, opened: false, clicked: false, openedAt: null, clickedAt: null, sentAt: null };
            if (inter.type === 'email_sent') { leadMap[lid].sent = true; leadMap[lid].sentAt = inter.timestamp; }
            if (inter.type === 'email_open') { leadMap[lid].opened = true; leadMap[lid].openedAt = inter.timestamp; }
            if (inter.type === 'email_click') { leadMap[lid].clicked = true; leadMap[lid].clickedAt = inter.timestamp; }
        }

        // Poblar datos del lead (nombre, email)
        const crmLeadIds = Object.keys(leadMap);
        const crmLeads = await CrmLead.find({ _id: { $in: crmLeadIds } }).populate('leadRef', 'name email type').lean();
        const crmLeadMap = {};
        for (const cl of crmLeads) crmLeadMap[cl._id.toString()] = cl;

        const result = crmLeadIds.map(lid => {
            const info = leadMap[lid];
            const cl = crmLeadMap[lid];
            return {
                name: cl?.leadRef?.name || 'Sin nombre',
                email: cl?.leadRef?.email || '',
                type: cl?.leadRef?.type || '',
                sent: info.sent,
                opened: info.opened,
                clicked: info.clicked,
                sentAt: info.sentAt,
                openedAt: info.openedAt,
                clickedAt: info.clickedAt
            };
        });

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('[Email Campaign Controller] Error en leads:', error);
        res.status(500).json({ success: false, error: 'Error al obtener leads' });
    }
};
