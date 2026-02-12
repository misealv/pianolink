/**
 * crm/controllers/crmLandingController.js
 * Controlador HTTP para landing pages del CRM.
 * Delega toda la lógica a CrmLandingService.
 */
const CrmLandingService = require('../services/CrmLandingService');

// === CRUD ===

/**
 * Listar landings con filtros opcionales (?status=published&template=generic)
 */
exports.list = async (req, res) => {
    try {
        const result = await CrmLandingService.list(req.query);
        res.status(result.success ? 200 : 500).json(result);
    } catch (error) {
        console.error('[CRM Landing Controller] Error en list:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

/**
 * Obtener detalle de una landing por ID
 */
exports.getById = async (req, res) => {
    try {
        const result = await CrmLandingService.getById(req.params.id);
        const status = result.success ? 200 : (result.error === 'Landing no encontrada' ? 404 : 500);
        res.status(status).json(result);
    } catch (error) {
        console.error('[CRM Landing Controller] Error en getById:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

/**
 * Crear nueva landing (siempre en draft)
 */
exports.create = async (req, res) => {
    try {
        const result = await CrmLandingService.create(req.body, req.user?._id);
        res.status(result.success ? 201 : 400).json(result);
    } catch (error) {
        console.error('[CRM Landing Controller] Error en create:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

/**
 * Actualizar landing
 */
exports.update = async (req, res) => {
    try {
        const result = await CrmLandingService.update(req.params.id, req.body);
        const status = result.success ? 200 : (result.error?.includes('no encontrada') ? 404 : 400);
        res.status(status).json(result);
    } catch (error) {
        console.error('[CRM Landing Controller] Error en update:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

/**
 * Eliminar landing (solo draft o archived)
 */
exports.remove = async (req, res) => {
    try {
        const result = await CrmLandingService.delete(req.params.id);
        const status = result.success ? 200 : (result.error?.includes('no encontrada') ? 404 : 400);
        res.status(status).json(result);
    } catch (error) {
        console.error('[CRM Landing Controller] Error en remove:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

// === ESTADO ===

/**
 * Cambiar estado de la landing (draft → published → archived)
 */
exports.changeStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ success: false, error: 'Campo "status" requerido' });
        }
        const result = await CrmLandingService.changeStatus(req.params.id, status);
        const httpStatus = result.success ? 200 : (result.error?.includes('no encontrada') ? 404 : 400);
        res.status(httpStatus).json(result);
    } catch (error) {
        console.error('[CRM Landing Controller] Error en changeStatus:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

// === DUPLICAR ===

/**
 * Duplicar una landing en draft
 */
exports.duplicate = async (req, res) => {
    try {
        const result = await CrmLandingService.duplicate(req.params.id, req.user?._id);
        res.status(result.success ? 201 : 400).json(result);
    } catch (error) {
        console.error('[CRM Landing Controller] Error en duplicate:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

// === MÉTRICAS ===

/**
 * Métricas agregadas de todas las landings
 */
exports.getMetrics = async (req, res) => {
    try {
        const result = await CrmLandingService.getMetricsSummary();
        res.status(result.success ? 200 : 500).json(result);
    } catch (error) {
        console.error('[CRM Landing Controller] Error en getMetrics:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

// === ENDPOINTS PÚBLICOS (sin auth) ===

/**
 * Procesar envío de formulario desde landing pública.
 * POST /api/crm/landings/public/:slug/submit
 */
exports.submitForm = async (req, res) => {
    try {
        const { slug } = req.params;
        const trackingData = {
            utmSource: req.body._utmSource || req.query.utm_source || '',
            utmMedium: req.body._utmMedium || req.query.utm_medium || '',
            utmCampaign: req.body._utmCampaign || req.query.utm_campaign || '',
            userAgent: req.headers['user-agent'] || '',
            ip: req.ip || ''
        };

        // Limpiar campos internos del body
        const formData = { ...req.body };
        delete formData._utmSource;
        delete formData._utmMedium;
        delete formData._utmCampaign;

        // A/B Testing: variante viene como campo oculto del form
        const abVariant = formData._abVariant || null;
        delete formData._abVariant;
        trackingData.abVariant = abVariant;

        const result = await CrmLandingService.processFormSubmission(slug, formData, trackingData);
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        console.error('[CRM Landing Controller] Error en submitForm:', error);
        res.status(500).json({ success: false, message: 'Error al procesar el formulario' });
    }
};

/**
 * Registrar inicio de formulario (tracking).
 * POST /api/crm/landings/public/:slug/form-start
 */
exports.trackFormStart = async (req, res) => {
    try {
        const abVariant = req.body?._abVariant || null;
        const result = await CrmLandingService.trackFormStart(req.params.slug, abVariant);
        res.status(200).json(result);
    } catch (error) {
        res.status(200).json({ success: false }); // No fallar por tracking
    }
};

// === PREVIEW (admin autenticado) ===

/**
 * Renderizar preview HTML de una landing (cualquier estado).
 * GET /api/crm/landings/:id/preview
 */
exports.preview = async (req, res) => {
    try {
        const { buildLandingHtml } = require('../views/landingRenderer');
        const result = await CrmLandingService.getForPreview(req.params.id);

        if (!result.success || !result.data) {
            return res.status(404).json({ success: false, error: result.error || 'Landing no encontrada' });
        }

        const landing = result.data;
        const html = buildLandingHtml(landing, {}, { preview: true });

        res.set('Cache-Control', 'no-store');
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (error) {
        console.error('[CRM Landing Controller] Error en preview:', error);
        res.status(500).json({ success: false, message: 'Error al generar preview' });
    }
};
