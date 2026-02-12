/**
 * crm/routes/crmCampaignRoutes.js
 * Rutas para gestión de campañas de marketing.
 * 
 * Endpoints:
 *   GET    /api/crm/campaigns                    — Listar campañas
 *   POST   /api/crm/campaigns                    — Crear campaña
 *   GET    /api/crm/campaigns/summary             — Resumen de activas
 *   GET    /api/crm/campaigns/spend-by-platform   — Gasto por plataforma
 *   GET    /api/crm/campaigns/:id                 — Detalle campaña
 *   PUT    /api/crm/campaigns/:id                 — Actualizar campaña
 *   PATCH  /api/crm/campaigns/:id/status          — Cambiar estado
 */
const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../../middleware/authMiddleware');
const ctrl = require('../controllers/crmCampaignController');

router.use(protect, adminOnly);

// === ANALYTICS (antes de :id) ===
router.get('/summary', ctrl.getActiveSummary);
router.get('/spend-by-platform', ctrl.getSpendByPlatform);

// === CRUD ===
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.getById);
router.put('/:id', ctrl.update);
router.patch('/:id/status', ctrl.updateStatus);

console.log('[CRM] 📊 Rutas de campañas cargadas');

module.exports = router;
