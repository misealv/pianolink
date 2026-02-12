/**
 * crm/controllers/crmSequenceController.js
 * Controlador HTTP para secuencias de email automatizadas.
 * Delega toda la lógica a CrmSequenceService.
 */
const CrmSequenceService = require('../services/CrmSequenceService');

// === CRUD ===

/**
 * Listar secuencias con filtros opcionales (?status=active&type=nurturing)
 */
exports.list = async (req, res) => {
    try {
        const result = await CrmSequenceService.list(req.query);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Sequence Controller] Error en list:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

/**
 * Obtener detalle de una secuencia por ID
 */
exports.getById = async (req, res) => {
    try {
        const result = await CrmSequenceService.getById(req.params.id);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Sequence Controller] Error en getById:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

/**
 * Crear nueva secuencia
 */
exports.create = async (req, res) => {
    try {
        const result = await CrmSequenceService.create(req.body, req.user?._id);
        res.status(result.success ? 201 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Sequence Controller] Error en create:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

/**
 * Actualizar secuencia (nombre, pasos, trigger, etc.)
 */
exports.update = async (req, res) => {
    try {
        const result = await CrmSequenceService.update(req.params.id, req.body);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Sequence Controller] Error en update:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

/**
 * Cambiar estado (draft → active → paused → archived)
 */
exports.updateStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ success: false, message: 'Se requiere campo status' });
        }
        const result = await CrmSequenceService.updateStatus(req.params.id, status);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Sequence Controller] Error en updateStatus:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

/**
 * Eliminar secuencia (solo si está en draft o archived)
 */
exports.remove = async (req, res) => {
    try {
        const result = await CrmSequenceService.remove(req.params.id);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Sequence Controller] Error en remove:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

// === ENROLLAMIENTO DE LEADS ===

/**
 * Inscribir un lead en una secuencia manualmente
 * Body: { crmLeadId: "..." }
 */
exports.enrollLead = async (req, res) => {
    try {
        const { crmLeadId } = req.body;
        if (!crmLeadId) {
            return res.status(400).json({ success: false, message: 'Se requiere crmLeadId' });
        }
        const result = await CrmSequenceService.enrollLead(req.params.id, crmLeadId);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Sequence Controller] Error en enrollLead:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

/**
 * Desinscribir un lead de una secuencia
 * Body: { crmLeadId: "..." }
 */
exports.unenrollLead = async (req, res) => {
    try {
        const { crmLeadId } = req.body;
        if (!crmLeadId) {
            return res.status(400).json({ success: false, message: 'Se requiere crmLeadId' });
        }
        const result = await CrmSequenceService.unenrollLead(req.params.id, crmLeadId);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Sequence Controller] Error en unenrollLead:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

/**
 * Listar leads inscritos en una secuencia
 */
exports.getEnrolledLeads = async (req, res) => {
    try {
        const result = await CrmSequenceService.getEnrolledLeads(req.params.id, req.query);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Sequence Controller] Error en getEnrolledLeads:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

// === MÉTRICAS ===

/**
 * Obtener métricas agregadas de una secuencia
 */
exports.getMetrics = async (req, res) => {
    try {
        const result = await CrmSequenceService.getMetrics(req.params.id);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Sequence Controller] Error en getMetrics:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

/**
 * Duplicar una secuencia (para iterar sin perder la original)
 */
exports.duplicate = async (req, res) => {
    try {
        const result = await CrmSequenceService.duplicate(req.params.id, req.user?._id);
        res.status(result.success ? 201 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Sequence Controller] Error en duplicate:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};
