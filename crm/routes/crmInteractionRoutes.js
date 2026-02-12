/**
 * crm/routes/crmInteractionRoutes.js
 * Rutas para interacciones/eventos del CRM.
 * 
 * Endpoints:
 *   GET    /api/crm/interactions                  — Listar interacciones
 *   POST   /api/crm/interactions                  — Registrar interacción manual
 *   GET    /api/crm/interactions/by-type           — Conteo por tipo
 *   GET    /api/crm/interactions/recent            — Actividad reciente
 */
const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../../middleware/authMiddleware');
const CrmInteraction = require('../models/CrmInteraction');

router.use(protect, adminOnly);

// === ANALYTICS ===
router.get('/by-type', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const result = await CrmInteraction.countByType(startDate, endDate);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('[CRM] Error en interactions by-type:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

router.get('/recent', async (req, res) => {
    try {
        const hours = Number(req.query.hours) || 24;
        const result = await CrmInteraction.getRecentActivity(hours);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('[CRM] Error en interactions recent:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

// === CRUD ===
router.get('/', async (req, res) => {
    try {
        const { leadRef, type, channel, page = 1, limit = 50 } = req.query;
        const query = {};
        if (leadRef) query.leadRef = leadRef;
        if (type) query.type = type;
        if (channel) query.channel = channel;

        const skip = (Number(page) - 1) * Number(limit);

        const [interactions, total] = await Promise.all([
            CrmInteraction.find(query)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('performedBy', 'name')
                .lean(),
            CrmInteraction.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: interactions,
            pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
        });
    } catch (error) {
        console.error('[CRM] Error en list interactions:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

// Registrar interacción manual (ej: nota, llamada)
router.post('/', async (req, res) => {
    try {
        const { leadRef, type, channel, metadata } = req.body;
        if (!leadRef || !type) {
            return res.status(400).json({ success: false, message: 'Se requiere leadRef y type' });
        }

        const interaction = await CrmInteraction.create({
            leadRef,
            type,
            channel: channel || 'system',
            metadata: metadata || {},
            performedBy: req.user?._id || null
        });

        res.status(201).json({ success: true, data: interaction });
    } catch (error) {
        console.error('[CRM] Error en create interaction:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

console.log('[CRM] 📝 Rutas de interacciones cargadas');

module.exports = router;
