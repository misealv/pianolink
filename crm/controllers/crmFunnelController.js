/**
 * crm/controllers/crmFunnelController.js
 * Controlador HTTP para embudo de ventas y analytics del CRM.
 */
const CrmFunnelService = require('../services/CrmFunnelService');

exports.getFunnel = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const result = await CrmFunnelService.getFunnelData(startDate, endDate);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en getFunnel:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.getFunnelByCampaign = async (req, res) => {
    try {
        const result = await CrmFunnelService.getFunnelByCampaign(req.params.campaignId);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en getFunnelByCampaign:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

exports.getFunnelVelocity = async (req, res) => {
    try {
        const days = Number(req.query.days) || 30;
        const result = await CrmFunnelService.getFunnelVelocity(days);
        res.status(result.success ? 200 : result.status || 500).json(result);
    } catch (error) {
        console.error('[CRM Controller] Error en getFunnelVelocity:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};
