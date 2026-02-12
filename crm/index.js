/**
 * crm/index.js
 * Punto de entrada del módulo CRM independiente.
 * Se monta como sub-router en server.js con: app.use('/api/crm', require('./crm'));
 * 
 * Principio: Si eliminas esta carpeta, el servidor arranca sin cambios.
 */
const express = require('express');
const router = express.Router();

// === Rutas del CRM ===
router.use('/leads', require('./routes/crmLeadRoutes'));
router.use('/campaigns', require('./routes/crmCampaignRoutes'));
router.use('/interactions', require('./routes/crmInteractionRoutes'));
router.use('/conversions', require('./routes/crmConversionRoutes'));
router.use('/funnel', require('./routes/crmFunnelRoutes'));
router.use('/tracking', require('./routes/crmTrackingRoutes'));
router.use('/dashboard', require('./routes/crmDashboardRoutes'));
router.use('/sequences', require('./routes/crmSequenceRoutes'));
router.use('/landings', require('./routes/crmLandingRoutes'));

// === Fase 3: Growth Engine ===
router.use('/growth', require('./routes/crmGrowthRoutes'));
router.use('/webhooks', require('./routes/crmWebhookRoutes'));

console.log('[CRM] ✅ Módulo CRM cargado — rutas bajo /api/crm/* (Fase 1-3)');

module.exports = router;
