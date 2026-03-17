/**
 * crm/routes/crmBotRoutes.js
 * Rutas para ver conversaciones del bot Mía desde el CRM.
 */
const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../../middleware/authMiddleware');
const ctrl = require('../controllers/crmBotController');

router.use(protect, adminOnly);

router.get('/conversations', ctrl.list);
router.get('/conversations/by-lead/:leadId', ctrl.getByLead);
router.get('/conversations/:id', ctrl.getById);

console.log('[CRM] 🤖 Rutas del bot Mía cargadas');

module.exports = router;
