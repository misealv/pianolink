/**
 * crm/controllers/crmCampaignController.js
 * Controlador HTTP para campañas de marketing del CRM.
 */
const CrmCampaignService = require('../services/CrmCampaignService');

// === CRUD ===

exports.create = async (req, res) => {
    try {
        req.body.createdBy = req.user?._id || null;
        const result = await CrmCampaignService.create(req.body);
        res.status(result.success ? 201 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en create campaign:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.getById = async (req, res) => {
    try {
        const result = await CrmCampaignService.getById(req.params.id);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en getById campaign:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.list = async (req, res) => {
    try {
        const result = await CrmCampaignService.list(req.query);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en list campaigns:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.update = async (req, res) => {
    try {
        const result = await CrmCampaignService.update(req.params.id, req.body);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en update campaign:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.updateStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ success: false, message: 'Se requiere campo status' });
        const result = await CrmCampaignService.updateStatus(req.params.id, status);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en updateStatus campaign:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

// === MÉTRICAS ===

exports.getActiveSummary = async (req, res) => {
    try {
        const result = await CrmCampaignService.getActiveSummary();
        res.json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en getActiveSummary:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.getSpendByPlatform = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const result = await CrmCampaignService.getSpendByPlatform(startDate, endDate);
        res.json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en getSpendByPlatform:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};
