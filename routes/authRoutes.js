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

// Ruta para verificar sesión - funciona para cualquier tipo de usuario
router.get('/me', protect, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'No autenticado' });
        }
        res.json({
            success: true,
            user: {
                _id: req.user._id,
                name: req.user.name,
                email: req.user.email,
                role: req.user.role
            }
        });
    } catch (error) {
        console.error('[Auth] Error en /me:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

module.exports = router;