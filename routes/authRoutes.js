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
// Retorna campos adicionales según rol (Sprint 2 — fix API GAP)
router.get('/me', protect, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'No autenticado' });
        }

        // Campos base (comunes a todos los roles)
        const userData = {
            _id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            slug: req.user.slug,
            branding: req.user.branding,
            isFoundingMember: req.user.isFoundingMember
        };

        // Campos adicionales según rol — NUNCA exponer password, tokens ni secrets
        const role = req.user.role;

        if (role === 'teacher') {
            // Re-fetch para obtener teacherData completo (protect solo trae select limitado)
            const full = await require('../models/User').findById(req.user._id)
                .select('teacherData classesRemaining classesCompleted')
                .lean();
            if (full) {
                userData.teacherData = {
                    hourlyRate: full.teacherData?.hourlyRate,
                    trialPrice: full.teacherData?.trialPrice,
                    earnings: full.teacherData?.earnings,
                    plan: full.teacherData?.plan,
                    subscriptionStatus: full.teacherData?.subscriptionStatus,
                    profile: full.teacherData?.profile,
                    permissions: full.teacherData?.permissions,
                    packages: full.teacherData?.packages,
                    paymentInfo: full.teacherData?.paymentInfo
                        ? { country: full.teacherData.paymentInfo.country, method: full.teacherData.paymentInfo.method, isVerified: full.teacherData.paymentInfo.isVerified }
                        : undefined
                };
            }
        } else if (role === 'student') {
            const full = await require('../models/User').findById(req.user._id)
                .select('studentData classesRemaining classesCompleted')
                .lean();
            if (full) {
                userData.studentData = full.studentData;
                userData.classesRemaining = full.classesRemaining;
                userData.classesCompleted = full.classesCompleted;
            }
        } else if (role === 'client') {
            const full = await require('../models/User').findById(req.user._id)
                .select('clientData classesRemaining classesCompleted')
                .lean();
            if (full) {
                userData.clientData = full.clientData;
                userData.classesRemaining = full.classesRemaining;
                userData.classesCompleted = full.classesCompleted;
            }
        }
        // admin: no necesita campos extra

        res.json({
            success: true,
            user: userData
        });
    } catch (error) {
        console.error('[Auth] Error en /me:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

module.exports = router;