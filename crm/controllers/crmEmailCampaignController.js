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

        // Solo permitir edición en borrador
        if (campaign.estado !== 'borrador') {
            return res.status(400).json({ 
                success: false, 
                error: 'Solo se pueden editar campañas en borrador' 
            });
        }

        const allowedFields = ['nombre', 'asunto', 'previewText', 'contenidoHtml', 'tipo', 'ordenSecuencia', 'fechaProgramada', 'targeting', 'notas'];
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                campaign[field] = req.body[field];
            }
        });

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
 */
exports.schedule = async (req, res) => {
    try {
        const { fechaProgramada } = req.body;

        if (!fechaProgramada) {
            return res.status(400).json({ success: false, error: 'Fecha requerida' });
        }

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

        campaign.estado = 'programado';
        campaign.fechaProgramada = new Date(fechaProgramada);
        await campaign.save();

        res.json({ success: true, data: campaign });
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

        const metricas = campaign.metricas;
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
