/**
 * crm/routes/crmInboundEmailRoutes.js
 * Rutas para gestión de emails entrantes (respuestas de leads).
 *
 * Endpoints:
 *   GET    /api/crm/inbound                — Listar conversaciones (paginado)
 *   GET    /api/crm/inbound/unread-count   — Conteo no leídos (badge)
 *   PATCH  /api/crm/inbound/mark-all-read  — Marcar todos como leídos
 *   GET    /api/crm/inbound/thread/:threadId — Obtener conversación completa
 *   GET    /api/crm/inbound/:id            — Ver email (auto-marca leído)
 *   PATCH  /api/crm/inbound/:id/read       — Toggle leído/no leído
 *   POST   /api/crm/inbound/:id/reply      — Responder email
 *
 * Todos requieren admin auth.
 */
const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../../middleware/authMiddleware');
const ctrl = require('../controllers/crmInboundEmailController');

// Rutas estáticas primero (antes de :id)
router.get('/unread-count', protect, adminOnly, ctrl.unreadCount);
router.patch('/mark-all-read', protect, adminOnly, ctrl.markAllRead);
router.get('/thread/:threadId', protect, adminOnly, ctrl.getThread);

// Rutas con parámetro
router.get('/', protect, adminOnly, ctrl.list);
router.get('/:id', protect, adminOnly, ctrl.getById);
router.patch('/:id/read', protect, adminOnly, ctrl.toggleRead);
router.post('/:id/reply', protect, adminOnly, ctrl.reply);

module.exports = router;
