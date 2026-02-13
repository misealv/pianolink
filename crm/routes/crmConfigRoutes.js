/**
 * crm/routes/crmConfigRoutes.js
 * Rutas para configuración del CRM (Meta Pixel, etc.)
 * 
 * Endpoints:
 *   GET    /api/crm/config           — Obtener configuración completa
 *   PUT    /api/crm/config           — Actualizar configuración
 *   GET    /api/crm/pixel            — Config de Meta Pixel
 *   PUT    /api/crm/pixel            — Actualizar Meta Pixel
 *   GET    /api/crm/pixel/snippet    — Generar snippet para copiar
 * 
 * COMPLETADO: Rutas de configuración CRM
 */
const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../../middleware/authMiddleware');
const ctrl = require('../controllers/crmConfigController');

// Todas las rutas requieren autenticación admin
router.use(protect, adminOnly);

// === CONFIGURACIÓN GENERAL ===
router.get('/', ctrl.getConfig);
router.put('/', ctrl.updateConfig);

// === META PIXEL ===
router.get('/pixel', ctrl.getPixelConfig);
router.put('/pixel', ctrl.updatePixelConfig);
router.get('/pixel/snippet', ctrl.getPixelSnippet);

console.log('[CRM] ⚙️ Rutas de configuración cargadas');

module.exports = router;
