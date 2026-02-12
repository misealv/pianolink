/**
 * crm/routes/crmGrowthRoutes.js
 * Rutas del Growth Engine (Fase 3).
 * 
 * Endpoints:
 *   /api/crm/growth/attribution/*   — Dashboard de atribución
 *   /api/crm/growth/roi/*           — Calculadora de ROI
 *   /api/crm/growth/trends/*        — Tendencias de conversión
 *   /api/crm/growth/alerts/*        — Alertas automáticas
 *   /api/crm/growth/tracking/*      — Estado de tracking a plataformas
 *   /api/crm/growth/ads-sync/*      — Sincronización de gasto publicitario
 * 
 * Todos requieren auth admin.
 */
const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../../middleware/authMiddleware');
const ctrl = require('../controllers/crmGrowthController');

// Todas las rutas de growth requieren admin
router.use(protect, adminOnly);

// === ATTRIBUTION DASHBOARD ===
router.get('/attribution/touchpoints', ctrl.getTouchpointsByChannel);
router.get('/attribution/comparison', ctrl.getAttributionComparison);
router.get('/attribution/journey/:crmLeadId', ctrl.getLeadJourney);

// === ROI CALCULATOR ===
router.get('/roi/roas', ctrl.getROAS);
router.get('/roi/ltv-cac', ctrl.getLTVCAC);
router.get('/roi/platforms', ctrl.getPlatformPerformance);

// === TENDENCIAS ===
router.get('/trends/conversions', ctrl.getConversionTrend);
router.get('/trends/velocity', ctrl.getFunnelVelocity);

// === ALERTAS ===
router.get('/alerts', ctrl.getCurrentAlerts);
router.get('/alerts/thresholds', ctrl.getAlertThresholds);

// === TRACKING STATUS ===
router.get('/tracking/status', ctrl.getTrackingStatus);
router.post('/tracking/dispatch-now', ctrl.dispatchNow);

// === ADS SPEND SYNC ===
router.post('/ads-sync/run', ctrl.runAdsSync);

module.exports = router;
