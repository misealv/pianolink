/**
 * crm/routes/crmSendEmailRoutes.js
 * Ruta para envío de emails individuales desde el CRM.
 * 
 * POST /api/crm/send-email — Enviar email a un contacto
 */
const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../../middleware/authMiddleware');
const ctrl = require('../controllers/crmSendEmailController');

// Requiere auth admin
router.use(protect, adminOnly);

// Enviar email individual
router.post('/', ctrl.sendEmail);

console.log('[CRM] 📧 Ruta send-email cargada');

module.exports = router;
