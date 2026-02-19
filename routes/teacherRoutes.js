/* routes/teacherRoutes.js */
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const Feedback = require('../models/Feedback');
// ---> LA IMPORTACIÓN QUE FALTABA:
const Message = require('../models/Message'); 
// ------------------------------------

console.log("\n⚡ CARGANDO RUTAS DE PROFESOR...");

// (Configuración de Cloudinary - IGUAL QUE ANTES)
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
const storage = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: 'pianolink_profiles', allowed_formats: ['jpg', 'png', 'jpeg'] } });
const upload = multer({ storage: storage });

// RUTA ME: Obtener datos
router.get('/me', async (req, res) => {
    try {
        const { email } = req.query; 
        const teacher = await User.findOne({ email }).select('-password');
        res.json(teacher);
    } catch (error) { res.status(500).json({ message: 'Error server' }); }
});

// RUTA UPDATE (Sin cambios)
router.post('/update', upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'photo', maxCount: 1 }]), async (req, res) => {
    try {
        const { email, bio, colorBase, colorBg, colorPanel } = req.body;
        let teacher = await User.findOne({ email });
        if (!teacher) return res.status(404).json({ message: 'Profesor no encontrado' });

        if (bio) teacher.branding.bio = bio;
        if (colorBase) teacher.branding.colors.base = colorBase;
        if (colorBg) teacher.branding.colors.bg = colorBg;
        if (colorPanel) teacher.branding.colors.panel = colorPanel;

        if (req.files && req.files['logo']) teacher.branding.logoUrl = req.files['logo'][0].path;
        if (req.files && req.files['photo']) teacher.branding.profilePhotoUrl = req.files['photo'][0].path;

        await teacher.save();
        res.json({ message: 'Perfil actualizado', branding: teacher.branding });
    } catch (error) { res.status(500).json({ message: error.message }); }
});

// RUTA FEEDBACK (Sin cambios)
router.post('/feedback', async (req, res) => {
    try {
        const { email, content } = req.body;
        if (!content) return res.status(400).json({ message: 'Contenido obligatorio' });
        const user = await User.findOne({ email });
        if (!user || !user.isFoundingMember) return res.status(403).json({ message: 'No autorizado' });

        await Feedback.create({ user: user._id, content: content, status: 'unread' });
        res.json({ success: true, message: 'Feedback guardado' });
    } catch (error) { res.status(500).json({ message: 'Error server' }); }
});

// RUTA MENSAJES (Ahora funcionará porque importamos Message arriba)
router.get('/my-messages', async (req, res) => {
    try {
        const { email } = req.query;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

        // Ahora Message está definido y funcionará
        const messages = await Message.find({ recipient: user._id }).sort({ createdAt: -1 });
        res.json(messages);
    } catch (error) {
        console.error("Error obteniendo mensajes:", error);
        res.status(500).json({ message: 'Error al obtener mensajes' });
    }
});

router.post('/my-messages/read/:id', async (req, res) => {
    try {
        await Message.findByIdAndUpdate(req.params.id, { isRead: true });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ message: 'Error' }); }
});


// ==================== FASE 4 v5.0: Dashboard & Plan ====================
const { protect, teacherOrAdmin } = require('../middleware/authMiddleware');
const StudentEnrollment = require('../models/StudentEnrollment');
const GlobalConfig = require('../models/GlobalConfig');
const UpsellService = require('../services/UpsellService');
const GeoIPService = require('../services/GeoIPService');

/**
 * GET /api/teacher/dashboard-data
 * Datos agregados para el dashboard del profesor: plan, permisos, ganancias, comisiones, alumnos.
 */
router.get('/dashboard-data', protect, teacherOrAdmin, async (req, res) => {
    try {
        const teacher = await User.findById(req.user._id).select('-password');
        if (!teacher) return res.status(404).json({ error: 'Profesor no encontrado' });

        const td = teacher.teacherData || {};
        const plan = td.plan || 'free';
        const permissions = td.permissions || {};

        // Contar alumnos activos
        const studentCounts = await StudentEnrollment.aggregate([
            { $match: { teacher: teacher._id, status: { $in: ['active', 'confirmed'] } } },
            { $group: { _id: '$source', count: { $sum: 1 } } }
        ]);

        const platformStudents = studentCounts.find(s => s._id !== 'private_invite')?.count || 0;
        const privateStudents = studentCounts.find(s => s._id === 'private_invite')?.count || 0;

        // Calcular comisiones del mes actual
        const config = await GlobalConfig.findOne();
        const plans = config?.memberships?.teacherPlans || {};
        const currentPlanConfig = plans[plan] || plans.free;

        // Verificar elegibilidad de upsell
        let upsell = null;
        if (plan === 'free') {
            const shouldShow = await UpsellService.shouldShowUpsell(teacher._id);
            if (shouldShow) {
                const eligibility = await UpsellService.checkEligibility(teacher._id);
                if (eligibility.eligible) {
                    upsell = eligibility.data;
                }
            }
        }

        const daysUntilExpiry = td.subscriptionExpiresAt
            ? Math.ceil((new Date(td.subscriptionExpiresAt) - new Date()) / (1000 * 60 * 60 * 24))
            : null;

        res.json({
            success: true,
            plan,
            permissions,
            subscriptionStatus: td.subscriptionStatus || 'trial',
            expiresAt: td.subscriptionExpiresAt,
            activatedAt: td.planActivatedAt,
            daysUntilExpiry,
            paymentProvider: td.membershipPaymentProvider,
            isFounder: teacher.isFounder || teacher.isFoundingMember || false,
            country: teacher.country,
            commission: {
                platform: currentPlanConfig.platformCommission,
                teacher: currentPlanConfig.teacherCommission,
                privateStudentCommission: currentPlanConfig.privateStudentCommission
            },
            students: {
                platform: platformStudents,
                private: privateStudents,
                total: platformStudents + privateStudents
            },
            earnings: td.earnings || { pending: 0, paid: 0, totalClasses: 0 },
            // Precios dinámicos para el dashboard
            minHourlyRate: config?.memberships?.minHourlyRate || 15,
            membershipPricing: {
                premium: (plans.premium?.price || 1900) / 100,
                founder: (plans.founder?.price || 1000) / 100
            },
            upsell
        });
    } catch (error) {
        console.error('[TeacherRoutes] Error dashboard-data:', error);
        res.status(500).json({ error: 'Error al obtener datos del dashboard' });
    }
});

/**
 * GET /api/teacher/commission-savings
 * Calculadora de ahorro para la página de pricing.
 */
router.get('/commission-savings', protect, teacherOrAdmin, async (req, res) => {
    try {
        const savings = await UpsellService.getSavingsForPricing(req.user._id);
        res.json({ success: true, savings });
    } catch (error) {
        console.error('[TeacherRoutes] Error commission-savings:', error);
        res.status(500).json({ error: 'Error al calcular ahorros' });
    }
});

/**
 * POST /api/teacher/upsell-shown
 * Registra que se mostró la notificación de upsell (para no repetir cada 7 días).
 */
router.post('/upsell-shown', protect, teacherOrAdmin, async (req, res) => {
    try {
        const { triggerType } = req.body;
        await UpsellService.logUpsellEvent(req.user._id, triggerType || 'dashboard_banner');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

/**
 * GET /api/teacher/detect-country
 * Detecta el país del profesor por IP (para registro / configuración).
 */
router.get('/detect-country', async (req, res) => {
    try {
        const country = await GeoIPService.detectFromRequest(req);
        res.json({ success: true, country });
    } catch (error) {
        res.json({ success: true, country: 'CL' }); // Fallback
    }
});

/**
 * POST /api/teacher/set-country
 * Establece el país del profesor (si no lo tiene configurado).
 */
router.post('/set-country', protect, teacherOrAdmin, async (req, res) => {
    try {
        const { country } = req.body;
        if (!country || country.length !== 2) {
            return res.status(400).json({ error: 'Código de país inválido (ISO 3166-1 alpha-2)' });
        }

        await User.findByIdAndUpdate(req.user._id, {
            country: country.toUpperCase(),
            'teacherData.paymentInfo.country': country.toUpperCase()
        });

        res.json({ success: true, country: country.toUpperCase() });
    } catch (error) {
        res.status(500).json({ error: 'Error al establecer país' });
    }
});

// ==================== FIN FASE 4 ====================

const teacherController = require('../controllers/teacherController'); // Asegurar importación
router.get('/conversation', teacherController.getMyConversation);

// Es pública, permite obtener la lista para el modal del login
router.get('/founders', teacherController.getFounders);


module.exports = router;