/**
 * crm/routes/crmLandingRoutes.js
 * Rutas para el módulo de landing pages del CRM.
 * Rutas admin requieren autenticación. Rutas públicas no.
 */
const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../../middleware/authMiddleware');
const ctrl = require('../controllers/crmLandingController');

// === RUTAS PÚBLICAS (sin auth) ===
// Formularios de captura desde landings públicas
router.post('/public/:slug/submit', ctrl.submitForm);          // POST /api/crm/landings/public/:slug/submit
router.post('/public/:slug/form-start', ctrl.trackFormStart);  // POST /api/crm/landings/public/:slug/form-start

// === RUTAS ADMIN (requieren auth) ===
router.use(protect, adminOnly);

// CRUD
router.get('/', ctrl.list);                         // GET /api/crm/landings
router.post('/', ctrl.create);                      // POST /api/crm/landings
router.get('/metrics', ctrl.getMetrics);            // GET /api/crm/landings/metrics
router.get('/:id', ctrl.getById);                   // GET /api/crm/landings/:id
router.put('/:id', ctrl.update);                    // PUT /api/crm/landings/:id
router.delete('/:id', ctrl.remove);                 // DELETE /api/crm/landings/:id

// Estado y acciones
router.patch('/:id/status', ctrl.changeStatus);     // PATCH /api/crm/landings/:id/status
router.post('/:id/duplicate', ctrl.duplicate);      // POST /api/crm/landings/:id/duplicate
router.get('/:id/preview', ctrl.preview);           // GET /api/crm/landings/:id/preview → HTML preview

module.exports = router;
