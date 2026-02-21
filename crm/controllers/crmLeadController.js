/**
 * crm/controllers/crmLeadController.js
 * Controlador HTTP para leads del CRM.
 * Delega toda la lógica a CrmLeadService.
 */
const CrmLeadService = require('../services/CrmLeadService');
const CrmInteraction = require('../models/CrmInteraction');

// === CRUD ===

exports.list = async (req, res) => {
    try {
        const result = await CrmLeadService.list(req.query);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en list leads:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

// Vista guardada: Prospectos Piano Calificados
exports.pianoCalificados = async (req, res) => {
    try {
        const result = await CrmLeadService.listPianoCalificados(req.query);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en pianoCalificados:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.getById = async (req, res) => {
    try {
        const result = await CrmLeadService.getById(req.params.id);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en getById lead:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.getByLeadRef = async (req, res) => {
    try {
        const result = await CrmLeadService.getByLeadRef(req.params.leadRefId);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en getByLeadRef:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.update = async (req, res) => {
    try {
        const result = await CrmLeadService.update(req.params.id, req.body);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en update lead:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

// === SCORING ===

exports.recalculateScore = async (req, res) => {
    try {
        const result = await CrmLeadService.recalculateScore(req.params.id);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en recalculateScore:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.incrementScore = async (req, res) => {
    try {
        const { points, reason } = req.body;
        if (!points || !reason) {
            return res.status(400).json({ success: false, message: 'Se requieren points y reason' });
        }
        const result = await CrmLeadService.incrementScore(req.params.id, Number(points), reason);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en incrementScore:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

// === TAGS Y LIFECYCLE ===

exports.addTags = async (req, res) => {
    try {
        const { tags } = req.body;
        if (!tags) return res.status(400).json({ success: false, message: 'Se requiere campo tags' });
        const result = await CrmLeadService.addTags(req.params.id, tags);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en addTags:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.removeTags = async (req, res) => {
    try {
        const { tags } = req.body;
        if (!tags) return res.status(400).json({ success: false, message: 'Se requiere campo tags' });
        const result = await CrmLeadService.removeTags(req.params.id, tags);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en removeTags:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.updateLifecycleStage = async (req, res) => {
    try {
        const { stage } = req.body;
        if (!stage) return res.status(400).json({ success: false, message: 'Se requiere campo stage' });
        const result = await CrmLeadService.updateLifecycleStage(req.params.id, stage);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en updateLifecycleStage:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

// === TIMELINE ===

exports.getTimeline = async (req, res) => {
    try {
        const limit = Number(req.query.limit) || 50;
        const timeline = await CrmInteraction.getTimeline(req.params.id, limit);
        res.json({ success: true, data: timeline });
    } catch (error) {
        console.error('[CRM Controller] Error en getTimeline:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

// === PIPELINE ===

exports.advancePipeline = async (req, res) => {
    try {
        const { stage, metadata } = req.body;
        if (!stage) return res.status(400).json({ success: false, message: 'Se requiere campo stage' });
        const result = await CrmLeadService.advancePipeline(req.params.id, stage, metadata || {});
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en advancePipeline:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.markContactResult = async (req, res) => {
    try {
        const { result } = req.body;
        if (!result) return res.status(400).json({ success: false, message: 'Se requiere campo result' });
        const data = await CrmLeadService.markContactResult(req.params.id, result);
        res.status(data.success ? 200 : data.status || 500).json(data);
    } catch (error) {
        console.error('[CRM Controller] Error en markContactResult:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.markLost = async (req, res) => {
    try {
        const { reason, details } = req.body;
        if (!reason) return res.status(400).json({ success: false, message: 'Se requiere campo reason' });
        const result = await CrmLeadService.markLost(req.params.id, reason, details || '');
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en markLost:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.getPipelineDistribution = async (req, res) => {
    try {
        const leadType = req.query.type || 'client';
        const result = await CrmLeadService.getPipelineDistribution(leadType);
        res.json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en getPipelineDistribution:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

// === TAREAS ===

exports.getLeadTasks = async (req, res) => {
    try {
        const result = await CrmLeadService.getLeadTasks(req.params.id);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en getLeadTasks:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.addTask = async (req, res) => {
    try {
        const { title, type, dueDate, priority, notes } = req.body;
        if (!title || !dueDate) {
            return res.status(400).json({ success: false, message: 'Se requieren title y dueDate' });
        }
        const result = await CrmLeadService.addTask(req.params.id, { title, type, dueDate: new Date(dueDate), priority, notes });
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en addTask:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.completeTask = async (req, res) => {
    try {
        const result = await CrmLeadService.completeTask(req.params.id, req.params.taskId);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en completeTask:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.getLeadsWithPendingTasks = async (req, res) => {
    try {
        const limit = Number(req.query.limit) || 50;
        const result = await CrmLeadService.getLeadsWithPendingTasks(limit);
        res.json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en getLeadsWithPendingTasks:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.getLeadsWithoutFollowUp = async (req, res) => {
    try {
        const days = Number(req.query.days) || 7;
        const result = await CrmLeadService.getLeadsWithoutFollowUp(days);
        res.json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en getLeadsWithoutFollowUp:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.getDashboardReport = async (req, res) => {
    try {
        const result = await CrmLeadService.getDashboardReport();
        res.json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en getDashboardReport:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

// === ANALYTICS ===

exports.getSegmentDistribution = async (req, res) => {
    try {
        const result = await CrmLeadService.getSegmentDistribution();
        res.json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en getSegmentDistribution:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.getLifecycleDistribution = async (req, res) => {
    try {
        const result = await CrmLeadService.getLifecycleDistribution();
        res.json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en getLifecycleDistribution:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.getTopLeads = async (req, res) => {
    try {
        const limit = Number(req.query.limit) || 10;
        const result = await CrmLeadService.getTopLeads(limit);
        res.json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en getTopLeads:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.getByChannel = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const result = await CrmLeadService.getByChannel(startDate, endDate);
        res.json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en getByChannel:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

// === MIGRACIÓN ===

exports.migrateExistingLeads = async (req, res) => {
    try {
        const result = await CrmLeadService.migrateExistingLeads();
        res.json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en migrateExistingLeads:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};
