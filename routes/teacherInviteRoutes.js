/**
 * Rutas PÚBLICAS para el flujo de invitación de profesores.
 * No requieren autenticación — son consumidas por teacher-register.html
 * Montadas en: /api/teacher-invite
 */
const express = require('express');
const router  = express.Router();
const adminController = require('../controllers/adminController');

// Validar un código de invitación (GET /api/teacher-invite/validate/:code)
router.get('/validate/:code', adminController.validateTeacherInviteCode);

// Registrar profesor con código (POST /api/teacher-invite/register/:code)
router.post('/register/:code', adminController.registerTeacherWithCode);

module.exports = router;
