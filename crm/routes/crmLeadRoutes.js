/**
 * crm/routes/crmLeadRoutes.js
 * Rutas para gestión de leads CRM.
 * 
 * Endpoints:
 *   GET    /api/crm/leads              — Listar leads con filtros
 *   GET    /api/crm/leads/analytics/segments     — Distribución por segmento
 *   GET    /api/crm/leads/analytics/lifecycle     — Distribución por lifecycle
 *   GET    /api/crm/leads/analytics/top           — Top leads por score
 *   GET    /api/crm/leads/analytics/channels      — Leads por canal
 *   POST   /api/crm/leads/migrate                 — Migrar leads existentes
 *   GET    /api/crm/leads/by-ref/:leadRefId       — Buscar por lead original
 *   GET    /api/crm/leads/:id                     — Detalle de un lead
 *   PUT    /api/crm/leads/:id                     — Actualizar lead
 *   POST   /api/crm/leads/:id/score/recalculate   — Recalcular score
 *   POST   /api/crm/leads/:id/score/increment     — Incrementar score
 *   POST   /api/crm/leads/:id/tags/add            — Añadir tags
 *   POST   /api/crm/leads/:id/tags/remove         — Remover tags
 *   PUT    /api/crm/leads/:id/lifecycle            — Cambiar lifecycle stage
 *   GET    /api/crm/leads/:id/timeline             — Timeline de interacciones
 */
const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../../middleware/authMiddleware');
const ctrl = require('../controllers/crmLeadController');

// Todas las rutas requieren auth de admin
router.use(protect, adminOnly);

// === ANALYTICS (antes de :id para evitar conflicto) ===
router.get('/analytics/segments', ctrl.getSegmentDistribution);
router.get('/analytics/lifecycle', ctrl.getLifecycleDistribution);
router.get('/analytics/top', ctrl.getTopLeads);
router.get('/analytics/channels', ctrl.getByChannel);

// === MIGRACIÓN ===
router.post('/migrate', ctrl.migrateExistingLeads);

// === BÚSQUEDA POR REF ===
router.get('/by-ref/:leadRefId', ctrl.getByLeadRef);

// === CRUD ===
router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.put('/:id', ctrl.update);

// === SCORING ===
router.post('/:id/score/recalculate', ctrl.recalculateScore);
router.post('/:id/score/increment', ctrl.incrementScore);

// === TAGS Y LIFECYCLE ===
router.post('/:id/tags/add', ctrl.addTags);
router.post('/:id/tags/remove', ctrl.removeTags);
router.put('/:id/lifecycle', ctrl.updateLifecycleStage);

// === TIMELINE ===
router.get('/:id/timeline', ctrl.getTimeline);

console.log('[CRM] 📋 Rutas de leads cargadas');

module.exports = router;
