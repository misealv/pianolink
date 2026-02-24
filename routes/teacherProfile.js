/**
 * routes/teacherProfile.js
 * 
 * Rutas para gestionar el perfil público del profesor:
 * - Tarifa por clase
 * - Paquetes con descuento
 * - Perfil público (especialidades, experiencia, etc.)
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const GlobalConfig = require('../models/GlobalConfig');
const CommissionService = require('../services/CommissionService');
const CurrencyHelper = require('../services/CurrencyHelper');
const StudentEnrollment = require('../models/StudentEnrollment');
const { protect } = require('../middleware/authMiddleware');

// Constantes dinámicas — se leen de GlobalConfig y CommissionService
// Ya NO se usan constantes hardcodeadas de MIN_HOURLY_RATE ni PLATFORM_COMMISSION

/**
 * Obtener config dinámica de tarifa mínima desde GlobalConfig (con cache)
 */
let _minRateCache = null;
let _minRateCacheExpiry = 0;
async function getMinHourlyRate() {
    const now = Date.now();
    if (_minRateCache !== null && _minRateCacheExpiry > now) return _minRateCache;
    try {
        const config = await GlobalConfig.findOne({});
        _minRateCache = config?.memberships?.minHourlyRate || 15;
        _minRateCacheExpiry = now + 5 * 60 * 1000; // Cache 5 min
        return _minRateCache;
    } catch {
        return 15; // Fallback seguro
    }
}

/**
 * GET /api/teacher-profile/my-rates
 * Obtener tarifa y paquetes del profesor autenticado
 * Comisión dinámica según plan del profesor (via CommissionService)
 */
router.get('/my-rates', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        
        if (!user || user.role !== 'teacher') {
            return res.status(403).json({ error: 'Solo profesores pueden acceder' });
        }
        
        const hourlyRate = user.teacherData?.hourlyRate || 25;
        
        // Comisión dinámica según plan del profesor
        const commission = await CommissionService.calculateCommission(req.user._id, 'platform');
        const platformPercent = commission.platformPercent / 100; // ej: 0.25 o 0.15
        const minRate = await getMinHourlyRate();
        
        // Calcular precio para el estudiante (con comisión dinámica)
        // hourlyRate está en DÓLARES, studentPrice también se devuelve en dólares para display
        const studentPriceCents = CurrencyHelper.studentPriceCents(hourlyRate, commission.teacherPercent);
        const studentPrice = CurrencyHelper.centsToDollars(studentPriceCents);
        
        res.json({
            success: true,
            rates: {
                teacherEarns: hourlyRate,           // Lo que gana el profesor
                studentPays: studentPrice,          // Lo que paga el estudiante
                platformFee: commission.platformPercent, // % comisión (ej: 25 o 15)
                teacherFee: commission.teacherPercent,   // % profesor (ej: 75 o 85)
                plan: commission.plan,                   // Plan efectivo del profesor
                minRate: minRate,
                packages: (user.teacherData?.packages || []).map(pkg => ({
                    ...pkg.toObject(),
                    teacherEarns: hourlyRate * pkg.classes * (1 - pkg.discountPercent / 100),
                    studentPays: studentPrice * pkg.classes * (1 - pkg.discountPercent / 100)
                }))
            }
        });
    } catch (error) {
        console.error('[TeacherProfile] Error obteniendo tarifas:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/teacher-profile/my-rates
 * Actualizar tarifa del profesor
 */
router.put('/my-rates', protect, async (req, res) => {
    try {
        const { hourlyRate } = req.body;
        
        const user = await User.findById(req.user._id);
        
        if (!user || user.role !== 'teacher') {
            return res.status(403).json({ error: 'Solo profesores pueden acceder' });
        }
        
        // Validar tarifa mínima desde GlobalConfig
        const minRate = await getMinHourlyRate();
        if (hourlyRate < minRate) {
            return res.status(400).json({ 
                error: `La tarifa mínima es $${minRate} USD por clase` 
            });
        }
        
        const oldRate = user.teacherData?.hourlyRate || 25;
        
        // Actualizar tarifa
        await User.findByIdAndUpdate(req.user._id, {
            'teacherData.hourlyRate': hourlyRate
        });
        
        console.log(`[TeacherProfile] ${user.email} cambió tarifa de $${oldRate} a $${hourlyRate}`);
        
        // Nota: La nueva tarifa solo aplica a NUEVOS estudiantes
        // Los estudiantes existentes mantienen su tarifa congelada (ver StudentEnrollment)
        
        res.json({
            success: true,
            message: 'Tarifa actualizada',
            hourlyRate,
            note: 'La nueva tarifa aplica solo a nuevos estudiantes. Los estudiantes actuales mantienen su tarifa congelada.'
        });
    } catch (error) {
        console.error('[TeacherProfile] Error actualizando tarifa:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/teacher-profile/packages
 * Actualizar paquetes de clases con descuento
 */
router.put('/packages', protect, async (req, res) => {
    try {
        const { packages } = req.body;
        
        const user = await User.findById(req.user._id);
        
        if (!user || user.role !== 'teacher') {
            return res.status(403).json({ error: 'Solo profesores pueden acceder' });
        }
        
        // Validar paquetes
        if (!Array.isArray(packages)) {
            return res.status(400).json({ error: 'Los paquetes deben ser un array' });
        }
        
        // Validar cada paquete
        for (const pkg of packages) {
            if (!pkg.classes || pkg.classes < 2) {
                return res.status(400).json({ error: 'Cada paquete debe tener al menos 2 clases' });
            }
            if (pkg.discountPercent < 0 || pkg.discountPercent > 50) {
                return res.status(400).json({ error: 'El descuento debe estar entre 0% y 50%' });
            }
        }
        
        // Actualizar paquetes
        await User.findByIdAndUpdate(req.user._id, {
            'teacherData.packages': packages.map(pkg => ({
                classes: pkg.classes,
                discountPercent: pkg.discountPercent || 0,
                validDays: pkg.validDays || 30,
                isActive: pkg.isActive !== false
            }))
        });
        
        console.log(`[TeacherProfile] ${user.email} actualizó ${packages.length} paquetes`);
        
        res.json({
            success: true,
            message: 'Paquetes actualizados',
            packages
        });
    } catch (error) {
        console.error('[TeacherProfile] Error actualizando paquetes:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/teacher-profile/my-profile
 * Obtener perfil público del profesor
 */
router.get('/my-profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        
        if (!user || user.role !== 'teacher') {
            return res.status(403).json({ error: 'Solo profesores pueden acceder' });
        }
        
        res.json({
            success: true,
            profile: {
                name: user.name,
                slug: user.slug,
                bio: user.branding?.bio || '',
                profilePhotoUrl: user.branding?.profilePhotoUrl || '',
                country: user.branding?.country || '',
                ...(user.teacherData?.profile || {}),
                hourlyRate: user.teacherData?.hourlyRate || 25,
                packages: user.teacherData?.packages || []
            }
        });
    } catch (error) {
        console.error('[TeacherProfile] Error obteniendo perfil:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/teacher-profile/my-profile
 * Actualizar perfil público del profesor
 */
router.put('/my-profile', protect, async (req, res) => {
    try {
        const { 
            isPublic, 
            specialties, 
            experience, 
            education, 
            languages, 
            videoUrl,
            acceptsTrialClass 
        } = req.body;
        
        const user = await User.findById(req.user._id);
        
        if (!user || user.role !== 'teacher') {
            return res.status(403).json({ error: 'Solo profesores pueden acceder' });
        }
        
        const profileUpdate = {};
        
        if (typeof isPublic === 'boolean') profileUpdate['teacherData.profile.isPublic'] = isPublic;
        if (specialties) profileUpdate['teacherData.profile.specialties'] = specialties;
        if (experience !== undefined) profileUpdate['teacherData.profile.experience'] = experience;
        if (education !== undefined) profileUpdate['teacherData.profile.education'] = education;
        if (languages) profileUpdate['teacherData.profile.languages'] = languages;
        if (videoUrl !== undefined) profileUpdate['teacherData.profile.videoUrl'] = videoUrl;
        if (typeof acceptsTrialClass === 'boolean') profileUpdate['teacherData.profile.acceptsTrialClass'] = acceptsTrialClass;
        
        await User.findByIdAndUpdate(req.user._id, profileUpdate);
        
        console.log(`[TeacherProfile] ${user.email} actualizó su perfil público`);
        
        res.json({
            success: true,
            message: 'Perfil actualizado'
        });
    } catch (error) {
        console.error('[TeacherProfile] Error actualizando perfil:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/teacher-profile/my-payment-info
 * Obtener información de pago del profesor
 */
router.get('/my-payment-info', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        
        if (!user || user.role !== 'teacher') {
            return res.status(403).json({ error: 'Solo profesores pueden acceder' });
        }
        
        res.json({
            success: true,
            paymentInfo: user.teacherData?.paymentInfo || {
                country: 'CL',
                method: 'mercadopago',
                mercadopago: { email: '', userId: '' },
                bankTransfer: {},
                paypal: { email: user.teacherData?.paypalEmail || '' },
                wise: {},
                isVerified: false,
                taxId: '',
                taxIdType: ''
            }
        });
    } catch (error) {
        console.error('[TeacherProfile] Error obteniendo payment info:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/teacher-profile/my-payment-info
 * Actualizar información de pago del profesor
 */
router.put('/my-payment-info', protect, async (req, res) => {
    try {
        const { country, method, mercadopago, bankTransfer, paypal, wise, taxId, taxIdType } = req.body;
        
        const user = await User.findById(req.user._id);
        
        if (!user || user.role !== 'teacher') {
            return res.status(403).json({ error: 'Solo profesores pueden acceder' });
        }
        
        // Validar que el método seleccionado tenga datos
        const validMethods = ['mercadopago', 'bank_transfer', 'paypal', 'wise'];
        if (method && !validMethods.includes(method)) {
            return res.status(400).json({ error: 'Método de pago no válido' });
        }
        
        // Construir actualización
        const update = {};
        
        if (country) update['teacherData.paymentInfo.country'] = country;
        if (method) update['teacherData.paymentInfo.method'] = method;
        
        if (mercadopago) {
            if (mercadopago.email) update['teacherData.paymentInfo.mercadopago.email'] = mercadopago.email;
            if (mercadopago.userId) update['teacherData.paymentInfo.mercadopago.userId'] = mercadopago.userId;
        }
        
        if (bankTransfer) {
            if (bankTransfer.bankName) update['teacherData.paymentInfo.bankTransfer.bankName'] = bankTransfer.bankName;
            if (bankTransfer.accountType) update['teacherData.paymentInfo.bankTransfer.accountType'] = bankTransfer.accountType;
            if (bankTransfer.accountNumber) update['teacherData.paymentInfo.bankTransfer.accountNumber'] = bankTransfer.accountNumber;
            if (bankTransfer.rut) update['teacherData.paymentInfo.bankTransfer.rut'] = bankTransfer.rut;
            if (bankTransfer.holderName) update['teacherData.paymentInfo.bankTransfer.holderName'] = bankTransfer.holderName;
        }
        
        if (paypal) {
            if (paypal.email) {
                update['teacherData.paymentInfo.paypal.email'] = paypal.email;
                // También actualizar campo legacy
                update['teacherData.paypalEmail'] = paypal.email;
            }
        }
        
        if (wise) {
            if (wise.email) update['teacherData.paymentInfo.wise.email'] = wise.email;
            if (wise.accountId) update['teacherData.paymentInfo.wise.accountId'] = wise.accountId;
        }
        
        if (taxId) update['teacherData.paymentInfo.taxId'] = taxId;
        if (taxIdType) update['teacherData.paymentInfo.taxIdType'] = taxIdType;
        
        // Marcar como no verificado si cambian datos críticos
        update['teacherData.paymentInfo.isVerified'] = false;
        
        await User.findByIdAndUpdate(req.user._id, update);
        
        console.log(`[TeacherProfile] ${user.email} actualizó su info de pago: ${method || 'sin cambio de método'}`);
        
        res.json({
            success: true,
            message: 'Información de pago actualizada'
        });
    } catch (error) {
        console.error('[TeacherProfile] Error actualizando payment info:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/teacher-profile/my-students
 * Obtener lista de estudiantes del profesor con sus tarifas congeladas
 */
router.get('/my-students', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        
        if (!user || user.role !== 'teacher') {
            return res.status(403).json({ error: 'Solo profesores pueden acceder' });
        }
        
        const enrollments = await StudentEnrollment.find({ 
            teacher: req.user._id,
            status: 'active'
        }).populate('student', 'name email branding.profilePhotoUrl');
        
        res.json({
            success: true,
            students: enrollments.map(e => ({
                id: e._id,
                student: e.student ? {
                    id: e.student._id,
                    name: e.student.name,
                    email: e.student.email,
                    photo: e.student.branding?.profilePhotoUrl
                } : null,
                dependentName: e.dependentName,
                frozenRate: e.frozenRate,
                rateFrozenAt: e.rateFrozenAt,
                rateLockedUntil: e.rateLockedUntil,
                canUpdateRate: e.canUpdateRate(),
                classesRemaining: e.classesRemaining,
                classesCompleted: e.classesCompleted,
                enrolledAt: e.enrolledAt,
                lastClassAt: e.lastClassAt,
                level: e.level,
                notes: e.teacherNotes
            }))
        });
    } catch (error) {
        console.error('[TeacherProfile] Error obteniendo estudiantes:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== RUTAS PÚBLICAS (sin auth) ====================

/**
 * GET /api/teacher-profile/catalog
 * Catálogo público de profesores para estudiantes
 * Incluye resumen de disponibilidad semanal y próximo slot libre
 */
router.get('/catalog', async (req, res) => {
    try {
        const { specialty, minPrice, maxPrice, language, country, day, sort, trialOnly, availableOnly } = req.query;
        const AvailabilityTemplate = require('../models/AvailabilityTemplate');
        
        // Buscar profesores con perfil público y membresía activa
        const query = {
            role: 'teacher',
            'teacherData.profile.isPublic': { $ne: false },
            'teacherData.subscriptionStatus': 'active'
        };
        
        // Si trialOnly=true, solo profesores que aceptan clase de prueba
        if (trialOnly === 'true') {
            query['teacherData.profile.acceptsTrialClass'] = { $ne: false };
        }
        
        const teachers = await User.find(query)
            .select('name lastName slug branding teacherData.hourlyRate teacherData.packages teacherData.profile teacherData.earnings teacherData.plan teacherData.subscriptionStatus isFoundingMember timezone')
            .lean();

        // Obtener disponibilidad de todos los profesores de una sola consulta
        const teacherIds = teachers.map(t => t._id);
        const templates = await AvailabilityTemplate.find({
            teacherId: { $in: teacherIds },
            isActive: true
        }).lean();

        // Mapa de disponibilidad por profesor
        const availabilityMap = {};
        templates.forEach(tmpl => {
            const tid = tmpl.teacherId.toString();
            const dayNames = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
            const activeDays = [...new Set(
                (tmpl.weeklySlots || [])
                    .filter(s => s.isActive)
                    .map(s => s.dayOfWeek)
            )].sort();
            
            availabilityMap[tid] = {
                activeDays,
                activeDayNames: activeDays.map(d => dayNames[d]),
                weeklySlots: (tmpl.weeklySlots || []).filter(s => s.isActive).map(s => ({
                    dayOfWeek: s.dayOfWeek,
                    startTime: s.startTime,
                    endTime: s.endTime
                })),
                timezone: tmpl.timezone
            };
        });
        
        // Obtener config de comisiones una sola vez para todos los profesores
        const configDoc = await GlobalConfig.findOne({});
        const teacherPlansConfig = configDoc?.memberships?.teacherPlans || {};
        
        // Formatear para el catálogo
        let catalog = teachers.map(t => {
            const hourlyRate = t.teacherData?.hourlyRate || 25;
            // Comisión dinámica según plan del profesor
            const teacherPlan = t.teacherData?.plan || 'free';
            const planCfg = teacherPlansConfig[teacherPlan] || teacherPlansConfig.free || { platformCommission: 25 };
            const platformFraction = (planCfg.platformCommission || 25) / 100;
            const studentPrice = Math.round(hourlyRate / (1 - platformFraction) * 100) / 100;
            const tid = t._id.toString();
            const availability = availabilityMap[tid] || { activeDays: [], activeDayNames: [], weeklySlots: [], timezone: 'America/Santiago' };
            const totalClasses = t.teacherData?.earnings?.totalClasses || 0;
            
            return {
                id: t._id,
                name: t.lastName ? `${t.name} ${t.lastName}` : t.name,
                slug: t.slug,
                photo: t.branding?.profilePhotoUrl || '',
                country: t.branding?.country || '',
                bio: t.branding?.bio || '',
                specialties: t.teacherData?.profile?.specialties || [],
                languages: t.teacherData?.profile?.languages || ['español'],
                experience: t.teacherData?.profile?.experience || '',
                education: t.teacherData?.profile?.education || '',
                videoUrl: t.teacherData?.profile?.videoUrl || '',
                acceptsTrialClass: t.teacherData?.profile?.acceptsTrialClass !== false,
                pricePerClass: studentPrice,
                totalClasses,
                availability,
                packages: (t.teacherData?.packages || [])
                    .filter(p => p.isActive)
                    .map(p => ({
                        classes: p.classes,
                        discountPercent: p.discountPercent,
                        pricePerClass: Math.round(studentPrice * (1 - p.discountPercent / 100) * 100) / 100,
                        total: Math.round(studentPrice * p.classes * (1 - p.discountPercent / 100) * 100) / 100
                    }))
            };
        });
        
        // Filtros
        if (specialty) {
            catalog = catalog.filter(t => 
                t.specialties.some(s => s.toLowerCase().includes(specialty.toLowerCase()))
            );
        }
        if (minPrice) {
            catalog = catalog.filter(t => t.pricePerClass >= parseFloat(minPrice));
        }
        if (maxPrice) {
            catalog = catalog.filter(t => t.pricePerClass <= parseFloat(maxPrice));
        }
        if (language) {
            catalog = catalog.filter(t => 
                t.languages.some(l => l.toLowerCase().includes(language.toLowerCase()))
            );
        }
        if (country) {
            catalog = catalog.filter(t =>
                t.country.toLowerCase().includes(country.toLowerCase())
            );
        }
        // Filtro: solo profesores con disponibilidad configurada
        if (availableOnly === 'true') {
            catalog = catalog.filter(t => t.availability.activeDays.length > 0);
        }
        // Filtro por día disponible (0-6)
        if (day !== undefined && day !== '') {
            const dayNum = parseInt(day);
            catalog = catalog.filter(t =>
                t.availability.activeDays.includes(dayNum)
            );
        }

        // Ordenamiento
        if (sort === 'price_asc') {
            catalog.sort((a, b) => a.pricePerClass - b.pricePerClass);
        } else if (sort === 'price_desc') {
            catalog.sort((a, b) => b.pricePerClass - a.pricePerClass);
        } else if (sort === 'classes') {
            catalog.sort((a, b) => b.totalClasses - a.totalClasses);
        } else if (sort === 'availability') {
            catalog.sort((a, b) => b.availability.activeDays.length - a.availability.activeDays.length);
        }
        
        res.json({
            success: true,
            count: catalog.length,
            teachers: catalog
        });
    } catch (error) {
        console.error('[TeacherProfile] Error obteniendo catálogo:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/teacher-profile/public/:slug
 * Perfil público de un profesor específico (con disponibilidad semanal)
 */
router.get('/public/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const AvailabilityTemplate = require('../models/AvailabilityTemplate');
        
        const teacher = await User.findOne({ 
            slug,
            role: 'teacher'
        }).select('name lastName slug country branding teacherData.hourlyRate teacherData.packages teacherData.profile teacherData.subscriptionStatus teacherData.earnings teacherData.paymentInfo.country timezone');
        
        if (!teacher) {
            return res.status(404).json({ error: 'Profesor no encontrado' });
        }
        
        // Verificar que el perfil sea público
        if (teacher.teacherData?.profile?.isPublic === false) {
            return res.status(404).json({ error: 'Perfil no disponible' });
        }
        
        const hourlyRate = teacher.teacherData?.hourlyRate || 25;
        // Comisión dinámica según plan del profesor
        const commission = await CommissionService.calculateCommission(teacher._id, 'platform');
        const platformFraction = commission.platformPercent / 100;
        const studentPrice = Math.round(hourlyRate / (1 - platformFraction) * 100) / 100;

        // Obtener disponibilidad semanal
        const template = await AvailabilityTemplate.findOne({
            teacherId: teacher._id,
            isActive: true
        }).lean();

        const dayNames = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
        let availability = { activeDays: [], activeDayNames: [], weeklySlots: [], timezone: teacher.timezone || 'America/Santiago' };
        
        if (template) {
            const activeDays = [...new Set(
                (template.weeklySlots || []).filter(s => s.isActive).map(s => s.dayOfWeek)
            )].sort();
            
            availability = {
                activeDays,
                activeDayNames: activeDays.map(d => dayNames[d]),
                weeklySlots: (template.weeklySlots || []).filter(s => s.isActive).map(s => ({
                    dayOfWeek: s.dayOfWeek,
                    startTime: s.startTime,
                    endTime: s.endTime
                })),
                timezone: template.timezone
            };
        }
        
        // País efectivo del profesor (para resolver proveedor de pago)
        const teacherCountry = teacher.teacherData?.paymentInfo?.country || teacher.country || teacher.branding?.country || '';
        
        // Mapeo país→moneda para informar al estudiante
        const MP_COUNTRIES_MAP = { CL: 'CLP', MX: 'MXN', AR: 'ARS', CO: 'COP', BR: 'BRL', PE: 'PEN', UY: 'UYU' };
        const isMPCountry = MP_COUNTRIES_MAP.hasOwnProperty(teacherCountry.toUpperCase());
        const paymentCurrency = isMPCountry ? MP_COUNTRIES_MAP[teacherCountry.toUpperCase()] : 'USD';
        const paymentProvider = isMPCountry ? 'mercadopago' : 'paypal';

        res.json({
            success: true,
            teacher: {
                id: teacher._id,
                name: teacher.lastName ? `${teacher.name} ${teacher.lastName}` : teacher.name,
                slug: teacher.slug,
                photo: teacher.branding?.profilePhotoUrl || '',
                country: teacherCountry,
                paymentCurrency,
                paymentProvider,
                bio: teacher.branding?.bio || '',
                colors: teacher.branding?.colors || {},
                specialties: teacher.teacherData?.profile?.specialties || [],
                languages: teacher.teacherData?.profile?.languages || ['español'],
                experience: teacher.teacherData?.profile?.experience || '',
                education: teacher.teacherData?.profile?.education || '',
                videoUrl: teacher.teacherData?.profile?.videoUrl || '',
                acceptsTrialClass: teacher.teacherData?.profile?.acceptsTrialClass !== false,
                isActive: teacher.teacherData?.subscriptionStatus === 'active',
                pricePerClass: studentPrice,
                totalClasses: teacher.teacherData?.earnings?.totalClasses || 0,
                availability,
                packages: (teacher.teacherData?.packages || [])
                    .filter(p => p.isActive)
                    .map(p => ({
                        classes: p.classes,
                        discountPercent: p.discountPercent,
                        pricePerClass: Math.round(studentPrice * (1 - p.discountPercent / 100) * 100) / 100,
                        total: Math.round(studentPrice * p.classes * (1 - p.discountPercent / 100) * 100) / 100
                    }))
            }
        });
    } catch (error) {
        console.error('[TeacherProfile] Error obteniendo perfil público:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
