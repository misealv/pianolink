/**
 * crm/routes/crmFunnelRoutes.js
 * Rutas para el embudo de ventas del CRM.
 * 
 * Endpoints:
 *   GET    /api/crm/funnel                        — Funnel general
 *   GET    /api/crm/funnel/velocity                — Velocidad de conversión
 *   GET    /api/crm/funnel/campaign/:campaignId    — Funnel por campaña
 */
const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../../middleware/authMiddleware');
const ctrl = require('../controllers/crmFunnelController');

router.use(protect, adminOnly);

router.get('/', ctrl.getFunnel);
router.get('/velocity', ctrl.getFunnelVelocity);
router.get('/campaign/:campaignId', ctrl.getFunnelByCampaign);

console.log('[CRM] 🔽 Rutas de funnel cargadas');

module.exports = router;
