/**
 * crm/routes/crmConversionRoutes.js
 * Rutas para conversiones del CRM.
 * 
 * Endpoints:
 *   GET    /api/crm/conversions                   — Listar conversiones
 *   GET    /api/crm/conversions/by-type            — Agrupadas por tipo
 *   GET    /api/crm/conversions/total-value         — Valor total
 *   GET    /api/crm/conversions/by-campaign/:id     — Por campaña
 *   GET    /api/crm/conversions/pending-reports     — Pendientes de reportar a Meta/Google
 */
const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../../middleware/authMiddleware');
const CrmConversion = require('../models/CrmConversion');

router.use(protect, adminOnly);

// === ANALYTICS ===
router.get('/by-type', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const result = await CrmConversion.getByType(startDate, endDate);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('[CRM] Error en conversions by-type:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

router.get('/total-value', async (req, res) => {
    try {
        const { startDate, endDate, currency } = req.query;
        const result = await CrmConversion.getTotalValue(startDate, endDate, currency || 'USD');
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('[CRM] Error en conversions total-value:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

router.get('/by-campaign/:id', async (req, res) => {
    try {
        const result = await CrmConversion.getByCampaign(req.params.id);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('[CRM] Error en conversions by-campaign:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

router.get('/pending-reports', async (req, res) => {
    try {
        const { platform } = req.query;
        const result = await CrmConversion.getPendingReports(platform);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('[CRM] Error en conversions pending-reports:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

// === LISTADO ===
router.get('/', async (req, res) => {
    try {
        const { leadRef, type, campaignId, page = 1, limit = 50 } = req.query;
        const query = {};
        if (leadRef) query.leadRef = leadRef;
        if (type) query.type = type;
        if (campaignId) query.campaignId = campaignId;

        const skip = (Number(page) - 1) * Number(limit);

        const [conversions, total] = await Promise.all([
            CrmConversion.find(query)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('campaignId', 'name platform')
                .lean(),
            CrmConversion.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: conversions,
            pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
        });
    } catch (error) {
        console.error('[CRM] Error en list conversions:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

console.log('[CRM] 💰 Rutas de conversiones cargadas');

module.exports = router;
