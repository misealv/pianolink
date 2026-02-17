/**
 * crm/routes/crmWebhookRoutes.js
 * Rutas para recibir webhooks de plataformas publicitarias y email.
 * 
 * Endpoints:
 *   GET  /api/crm/webhooks/meta              — Verificación de challenge (Meta)
 *   POST /api/crm/webhooks/meta              — Recibir eventos de Meta
 *   POST /api/crm/webhooks/google            — Recibir eventos de Google
 *   POST /api/crm/webhooks/resend/inbound    — Recibir emails entrantes (Resend)
 *   GET  /api/crm/webhooks/status            — Estado de configuración (admin)
 * 
 * NOTA: Los endpoints de Meta, Google y Resend NO requieren auth (son llamados por las plataformas).
 * Solo /status requiere admin auth.
 */
const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../../middleware/authMiddleware');
const ctrl = require('../controllers/crmWebhookController');
const inboundCtrl = require('../controllers/crmInboundEmailController');

// === META (sin auth — llamado por Meta directamente) ===
router.get('/meta', ctrl.metaVerify);
router.post('/meta', ctrl.metaReceive);

// === GOOGLE (sin auth estándar — usa su propio token) ===
router.post('/google', ctrl.googleReceive);

// === RESEND INBOUND (sin auth — llamado por Resend directamente) ===
router.post('/resend/inbound', inboundCtrl.receiveInbound);

// === STATUS (requiere admin) ===
router.get('/status', protect, adminOnly, ctrl.getWebhookStatus);

module.exports = router;
