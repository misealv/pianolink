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

// === Email Marketing (Lanzamiento Día 88) ===
router.use('/emails', require('./routes/crmEmailCampaignRoutes'));

// === Inbox — Emails entrantes (respuestas de leads) ===
router.use('/inbound', require('./routes/crmInboundEmailRoutes'));

// === Envío individual de email desde CRM ===
router.use('/send-email', require('./routes/crmSendEmailRoutes'));

// === Email tracking — timeline y stats (admin) ===
const { protect: _protect, adminOnly: _adminOnly } = require('../middleware/authMiddleware');
const emailTrackingCtrl = require('./controllers/crmEmailTrackingController');
router.get('/tracking/email/timeline/:crmLeadId', _protect, _adminOnly, emailTrackingCtrl.getEmailTimeline);
router.get('/tracking/email/stats', _protect, _adminOnly, emailTrackingCtrl.getEmailStats);

// === Configuración (Meta Pixel, etc.) ===
router.use('/config', require('./routes/crmConfigRoutes'));

// === Fase 3: Growth Engine ===
router.use('/growth', require('./routes/crmGrowthRoutes'));
router.use('/webhooks', require('./routes/crmWebhookRoutes'));

console.log('[CRM] ✅ Módulo CRM cargado — rutas bajo /api/crm/* (Fase 1-3)');

module.exports = router;
