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
const StudentEnrollment = require('../models/StudentEnrollment');
const { protect } = require('../middleware/authMiddleware');

// Constantes del marketplace
const MIN_HOURLY_RATE = 15; // USD mínimo por clase
const PLATFORM_COMMISSION = 0.20; // 20% para PianoLink

/**
 * GET /api/teacher-profile/my-rates
 * Obtener tarifa y paquetes del profesor autenticado
 */
router.get('/my-rates', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        
        if (!user || user.role !== 'teacher') {
            return res.status(403).json({ error: 'Solo profesores pueden acceder' });
        }
        
        const hourlyRate = user.teacherData?.hourlyRate || 25;
        const packages = user.teacherData?.packages || [];
        
        // Calcular precios para el estudiante (con comisión PL)
        const studentPrice = Math.round(hourlyRate / (1 - PLATFORM_COMMISSION) * 100) / 100;
        
        res.json({
            success: true,
            rates: {
                teacherEarns: hourlyRate,           // Lo que gana el profesor
                studentPays: studentPrice,          // Lo que paga el estudiante
                platformFee: PLATFORM_COMMISSION * 100, // 20%
                minRate: MIN_HOURLY_RATE,
                packages: packages.map(pkg => ({
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
        
        // Validar tarifa mínima
        if (hourlyRate < MIN_HOURLY_RATE) {
            return res.status(400).json({ 
                error: `La tarifa mínima es $${MIN_HOURLY_RATE} USD por clase` 
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
 */
router.get('/catalog', async (req, res) => {
    try {
        const { specialty, minPrice, maxPrice, language } = req.query;
        
        // Buscar profesores con perfil público y membresía activa
        const query = {
            role: 'teacher',
            'teacherData.profile.isPublic': { $ne: false },
            'teacherData.subscriptionStatus': 'active'
        };
        
        const teachers = await User.find(query)
            .select('name slug branding teacherData.hourlyRate teacherData.packages teacherData.profile')
            .lean();
        
        // Formatear para el catálogo
        let catalog = teachers.map(t => {
            const hourlyRate = t.teacherData?.hourlyRate || 25;
            const studentPrice = Math.round(hourlyRate / (1 - PLATFORM_COMMISSION) * 100) / 100;
            
            return {
                id: t._id,
                name: t.name,
                slug: t.slug,
                photo: t.branding?.profilePhotoUrl || '',
                country: t.branding?.country || '',
                bio: t.branding?.bio || '',
                specialties: t.teacherData?.profile?.specialties || [],
                languages: t.teacherData?.profile?.languages || ['español'],
                experience: t.teacherData?.profile?.experience || '',
                videoUrl: t.teacherData?.profile?.videoUrl || '',
                acceptsTrialClass: t.teacherData?.profile?.acceptsTrialClass !== false,
                pricePerClass: studentPrice,
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
 * Perfil público de un profesor específico
 */
router.get('/public/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        
        const teacher = await User.findOne({ 
            slug,
            role: 'teacher'
        }).select('name slug branding teacherData.hourlyRate teacherData.packages teacherData.profile teacherData.subscriptionStatus');
        
        if (!teacher) {
            return res.status(404).json({ error: 'Profesor no encontrado' });
        }
        
        // Verificar que el perfil sea público
        if (teacher.teacherData?.profile?.isPublic === false) {
            return res.status(404).json({ error: 'Perfil no disponible' });
        }
        
        const hourlyRate = teacher.teacherData?.hourlyRate || 25;
        const studentPrice = Math.round(hourlyRate / (1 - PLATFORM_COMMISSION) * 100) / 100;
        
        res.json({
            success: true,
            teacher: {
                name: teacher.name,
                slug: teacher.slug,
                photo: teacher.branding?.profilePhotoUrl || '',
                country: teacher.branding?.country || '',
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
