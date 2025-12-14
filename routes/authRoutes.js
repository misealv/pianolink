/* routes/authRoutes.js */
const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
router.get('/platform-public', adminController.getPublicPlatformConfig);

const { 
    loginUser, 
    registerUser, 
    getTeachers, 
    getTeacherBySlug,
    deleteUser // <--- Importante: Importar la nueva función
} = require('../controllers/authController');

router.post('/login', loginUser);
router.post('/register', registerUser);
router.get('/teachers', getTeachers);
router.get('/public/:slug', getTeacherBySlug);
router.delete('/delete/:id', deleteUser); // <--- La ruta nueva

module.exports = router;