/* routes/authRoutes.js */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');

const { 
    loginUser, 
    registerUser, 
    getTeachers,
    getStudents, // <--- Students endpoint
    getTeacherBySlug,
    deleteUser, // <--- Importante: Importar la nueva función
    updateProfile // <--- NUEVO: Importar updateProfile
} = require('../controllers/authController');

router.post('/login', loginUser);
router.post('/register', registerUser);
router.get('/teachers', getTeachers);
router.get('/students', getStudents); // <--- Students endpoint
router.get('/public/:slug', getTeacherBySlug);
router.delete('/delete/:id', deleteUser); // <--- La ruta nueva

// Ruta protegida para actualizar perfil (requiere autenticación)
router.put('/profile', protect, updateProfile);

module.exports = router;