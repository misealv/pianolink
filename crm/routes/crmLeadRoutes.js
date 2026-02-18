/**
 * crm/routes/crmLeadRoutes.js
 * Rutas para gestión de leads CRM.
 * 
 * Endpoints:
 *   GET    /api/crm/leads                         — Listar leads con filtros
 *   GET    /api/crm/leads/analytics/segments       — Distribución por segmento
 *   GET    /api/crm/leads/analytics/lifecycle       — Distribución por lifecycle
 *   GET    /api/crm/leads/analytics/top             — Top leads por score
 *   GET    /api/crm/leads/analytics/channels        — Leads por canal
 *   GET    /api/crm/leads/analytics/pipeline        — Distribución de pipeline
 *   GET    /api/crm/leads/analytics/report          — Dashboard report consolidado
 *   GET    /api/crm/leads/tasks/pending             — Leads con tareas pendientes
 *   GET    /api/crm/leads/tasks/no-followup         — Leads sin seguimiento
 *   POST   /api/crm/leads/migrate                   — Migrar leads existentes
 *   GET    /api/crm/leads/by-ref/:leadRefId         — Buscar por lead original
 *   GET    /api/crm/leads/:id                       — Detalle de un lead
 *   PUT    /api/crm/leads/:id                       — Actualizar lead
 *   POST   /api/crm/leads/:id/score/recalculate     — Recalcular score
 *   POST   /api/crm/leads/:id/score/increment       — Incrementar score
 *   POST   /api/crm/leads/:id/tags/add              — Añadir tags
 *   POST   /api/crm/leads/:id/tags/remove           — Remover tags
 *   PUT    /api/crm/leads/:id/lifecycle              — Cambiar lifecycle stage
 *   POST   /api/crm/leads/:id/pipeline/advance       — Avanzar pipeline
 *   POST   /api/crm/leads/:id/pipeline/lost          — Marcar como perdido
 *   GET    /api/crm/leads/:id/tasks                  — Tareas del lead
 *   POST   /api/crm/leads/:id/tasks                  — Crear tarea
 *   POST   /api/crm/leads/:id/tasks/:taskId/complete — Completar tarea
 *   GET    /api/crm/leads/:id/timeline               — Timeline de interacciones
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
router.get('/analytics/pipeline', ctrl.getPipelineDistribution);
router.get('/analytics/report', ctrl.getDashboardReport);

// === TAREAS GLOBALES ===
router.get('/tasks/pending', ctrl.getLeadsWithPendingTasks);
router.get('/tasks/no-followup', ctrl.getLeadsWithoutFollowUp);

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

// === PIPELINE ===
router.post('/:id/pipeline/advance', ctrl.advancePipeline);
router.post('/:id/pipeline/lost', ctrl.markLost);

// === TAREAS POR LEAD ===
router.get('/:id/tasks', ctrl.getLeadTasks);
router.post('/:id/tasks', ctrl.addTask);
router.post('/:id/tasks/:taskId/complete', ctrl.completeTask);

// === TIMELINE ===
router.get('/:id/timeline', ctrl.getTimeline);

console.log('[CRM] 📋 Rutas de leads cargadas');

module.exports = router;
