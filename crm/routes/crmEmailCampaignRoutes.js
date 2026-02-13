/**
 * crm/routes/crmEmailCampaignRoutes.js
 * Rutas para gestión de campañas de email marketing.
 * 
 * Endpoints:
 *   GET    /api/crm/emails                 — Listar campañas
 *   POST   /api/crm/emails                 — Crear campaña
 *   GET    /api/crm/emails/:id             — Detalle campaña
 *   PUT    /api/crm/emails/:id             — Actualizar campaña
 *   DELETE /api/crm/emails/:id             — Eliminar campaña
 *   POST   /api/crm/emails/:id/enviar      — Enviar ahora
 *   POST   /api/crm/emails/:id/programar   — Programar envío
 *   GET    /api/crm/emails/:id/preview     — Preview HTML
 *   GET    /api/crm/emails/:id/stats       — Estadísticas
 *   POST   /api/crm/emails/:id/duplicar    — Duplicar
 *   POST   /api/crm/emails/:id/test        — Enviar prueba
 * 
 * COMPLETADO: Rutas de email marketing para lanzamiento Día 88
 */
const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../../middleware/authMiddleware');
const ctrl = require('../controllers/crmEmailCampaignController');

// Todas las rutas requieren autenticación admin
router.use(protect, adminOnly);

// === CRUD ===
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.getById);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

// === ACCIONES ===
router.post('/:id/enviar', ctrl.send);
router.post('/:id/programar', ctrl.schedule);
router.get('/:id/preview', ctrl.preview);
router.get('/:id/stats', ctrl.stats);
router.post('/:id/duplicar', ctrl.duplicate);
router.post('/:id/test', ctrl.sendTest);

console.log('[CRM] 📧 Rutas de email campaigns cargadas');

module.exports = router;
