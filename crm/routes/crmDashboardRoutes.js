/**
 * crm/routes/crmDashboardRoutes.js
 * Rutas para el dashboard del CRM y vista HTML.
 * 
 * Endpoints:
 *   GET    /api/crm/dashboard/overview            — Datos completos del dashboard
 *   GET    /api/crm/dashboard/quick-stats          — KPIs rápidos
 *   GET    /api/crm/dashboard/view                 — Vista HTML del CRM
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const { protect, adminOnly } = require('../../middleware/authMiddleware');
const ctrl = require('../controllers/crmDashboardController');

// === API ENDPOINTS (protegidos) ===
router.get('/overview', protect, adminOnly, ctrl.getOverview);
router.get('/quick-stats', protect, adminOnly, ctrl.getQuickStats);

// === VISTA HTML (pública — el HTML carga, pero los datos API requieren token) ===
router.get('/view', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'crm-dashboard.html'));
});

console.log('[CRM] 📈 Rutas de dashboard cargadas');

module.exports = router;
