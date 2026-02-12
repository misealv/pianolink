/**
 * crm/routes/crmSequenceRoutes.js
 * Rutas para el módulo de secuencias de email automatizadas.
 * Todas las rutas requieren autenticación admin.
 */
const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../../middleware/authMiddleware');
const ctrl = require('../controllers/crmSequenceController');

// Todas las rutas requieren admin
router.use(protect, adminOnly);

// === CRUD ===
router.get('/', ctrl.list);                         // GET /api/crm/sequences
router.post('/', ctrl.create);                      // POST /api/crm/sequences
router.get('/:id', ctrl.getById);                   // GET /api/crm/sequences/:id
router.put('/:id', ctrl.update);                    // PUT /api/crm/sequences/:id
router.patch('/:id/status', ctrl.updateStatus);     // PATCH /api/crm/sequences/:id/status
router.delete('/:id', ctrl.remove);                 // DELETE /api/crm/sequences/:id

// === ENROLLAMIENTO ===
router.post('/:id/enroll', ctrl.enrollLead);        // POST /api/crm/sequences/:id/enroll
router.post('/:id/unenroll', ctrl.unenrollLead);    // POST /api/crm/sequences/:id/unenroll
router.get('/:id/leads', ctrl.getEnrolledLeads);    // GET /api/crm/sequences/:id/leads

// === MÉTRICAS ===
router.get('/:id/metrics', ctrl.getMetrics);        // GET /api/crm/sequences/:id/metrics
router.post('/:id/duplicate', ctrl.duplicate);      // POST /api/crm/sequences/:id/duplicate

module.exports = router;
