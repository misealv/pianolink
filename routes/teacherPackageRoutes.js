/**
 * routes/teacherPackageRoutes.js
 * API para gestión de paquetes de clases del profesor
 * 
 * Endpoints:
 * - GET /api/teacher-packages/my - Paquetes del profesor logueado
 * - GET /api/teacher-packages/teacher/:teacherId - Paquetes públicos de un profesor
 * - POST /api/teacher-packages - Crear nuevo paquete
 * - PUT /api/teacher-packages/:id - Actualizar paquete
 * - DELETE /api/teacher-packages/:id - Desactivar paquete
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const TeacherPackage = require('../models/TeacherPackage');
const StudentSubscription = require('../models/StudentSubscription');
const User = require('../models/User');
const { protect: authMiddleware } = require('../middleware/authMiddleware');

// Categorías disponibles con nombres en español
const CATEGORIES = {
    'piano': 'Clases de Piano',
    'teoria': 'Teoría Musical',
    'armonia': 'Armonía',
    'solfeo': 'Solfeo y Lectura',
    'composicion': 'Composición',
    'improvisacion': 'Improvisación',
    'otro': 'Otro'
};

/**
 * GET /api/teacher-packages/categories
 * Obtener lista de categorías disponibles
 */
router.get('/categories', (req, res) => {
    res.json({
        success: true,
        categories: Object.entries(CATEGORIES).map(([key, name]) => ({
            key,
            name
        }))
    });
});

/**
 * GET /api/teacher-packages/my
 * Obtener paquetes del profesor logueado
 */
router.get('/my', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo profesores pueden ver sus paquetes' 
            });
        }

        const packages = await TeacherPackage.find({
            teacherId: req.user._id
        }).sort({ isActive: -1, isFeatured: -1, createdAt: -1 });

        res.json({
            success: true,
            packages,
            categories: CATEGORIES
        });
    } catch (error) {
        console.error('[TeacherPackages] Error:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * GET /api/teacher-packages/teacher/:teacherId
 * Obtener paquetes públicos de un profesor (para estudiantes)
 */
router.get('/teacher/:teacherId', async (req, res) => {
    try {
        const teacher = await User.findById(req.params.teacherId);
        if (!teacher || teacher.role !== 'teacher') {
            return res.status(404).json({ 
                success: false, 
                error: 'Profesor no encontrado' 
            });
        }

        let packages = await TeacherPackage.find({
            teacherId: req.params.teacherId,
            isActive: true,
            isManualOnly: { $ne: true }
        }).sort({ isFeatured: -1, priceUSD: 1 });

        // Fallback: si no hay paquetes en TeacherPackage, usar teacherData.packages
        if (packages.length === 0 && teacher.teacherData?.packages?.length > 0) {
            const CurrencyHelper = require('../services/CurrencyHelper');
            const hourlyRate = teacher.teacherData?.hourlyRate || 25;
            // Calcular precio al alumno: tarifa profesor / (teacherPercent/100) → en centavos USD
            const teacherFee = teacher.teacherData?.plan === 'founder' ? 85 : 75;
            const studentPricePerClass = CurrencyHelper.studentPriceCents(hourlyRate, teacherFee);
            
            packages = teacher.teacherData.packages
                .filter(p => p.isActive !== false)
                .map(p => ({
                    _id: p._id,
                    teacherId: teacher._id,
                    category: 'piano',
                    name: `Paquete ${p.classes} clases de Piano`,
                    description: p.discountPercent > 0 ? `${p.discountPercent}% de descuento` : '',
                    classCount: p.classes,
                    classDurationMinutes: 45,
                    priceUSD: Math.round(studentPricePerClass * p.classes * (1 - (p.discountPercent || 0) / 100)),
                    pricePerClassUSD: Math.round(studentPricePerClass * (1 - (p.discountPercent || 0) / 100)),
                    basePricePerClassUSD: studentPricePerClass, // precio base sin descuento (centavos)
                    discountPercent: p.discountPercent || 0,
                    validityDays: p.validDays || 30,
                    isRecurring: true,
                    billingCycleDays: 30,
                    isActive: true,
                    isFeatured: false,
                    stats: { totalSold: 0, activeSubscriptions: 0, revenue: 0 }
                }));
        }

        // Agrupar por categoría
        const byCategory = {};
        packages.forEach(pkg => {
            const cat = pkg.category;
            if (!byCategory[cat]) {
                byCategory[cat] = {
                    name: CATEGORIES[cat] || cat,
                    packages: []
                };
            }
            byCategory[cat].packages.push(pkg);
        });

        res.json({
            success: true,
            teacher: {
                _id: teacher._id,
                name: teacher.name,
                profile: teacher.teacherData?.profile || {}
            },
            packages,
            byCategory,
            categories: CATEGORIES
        });
    } catch (error) {
        console.error('[TeacherPackages] Error:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * GET /api/teacher-packages/available
 * Obtener todos los paquetes públicos de todos los profesores (para marketplace)
 */
router.get('/available', async (req, res) => {
    try {
        const packages = await TeacherPackage.find({
            isActive: true,
            isManualOnly: { $ne: true }
        })
        .populate('teacherId', 'name brandName slug branding teacherData')
        .sort({ isFeatured: -1, priceUSD: 1, createdAt: -1 });

        // Transformar para incluir datos del profesor
        const result = packages.map(pkg => ({
            _id: pkg._id,
            name: pkg.name,
            description: pkg.description,
            category: pkg.category,
            classCount: pkg.classCount,
            classDurationMinutes: pkg.classDurationMinutes,
            priceUSD: pkg.priceUSD,
            validityDays: pkg.validityDays,
            isRecurring: pkg.isRecurring,
            isFeatured: pkg.isFeatured,
            teacher: pkg.teacherId ? {
                _id: pkg.teacherId._id,
                name: pkg.teacherId.name,
                brandName: pkg.teacherId.brandName || pkg.teacherId.name,
                slug: pkg.teacherId.slug,
                specialties: pkg.teacherId.teacherData?.profile?.specialties || []
            } : null
        }));

        res.json(result);
    } catch (error) {
        console.error('[TeacherPackages] Error available:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/teacher-packages
 * Crear nuevo paquete
 */
router.post('/', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo profesores pueden crear paquetes' 
            });
        }

        const {
            category,
            categoryCustom,
            name,
            description,
            classCount,
            classDurationMinutes,
            priceUSD,
            validityDays,
            isRecurring,
            billingCycleDays,
            isFeatured
        } = req.body;

        // Validaciones
        if (!name || !classCount || !priceUSD) {
            return res.status(400).json({ 
                success: false, 
                error: 'Nombre, cantidad de clases y precio son requeridos' 
            });
        }

        if (classCount < 1 || classCount > 100) {
            return res.status(400).json({ 
                success: false, 
                error: 'Cantidad de clases debe ser entre 1 y 100' 
            });
        }

        // Precio mínimo $5 USD por clase
        const minPrice = classCount * 500; // 500 centavos = $5
        if (priceUSD < minPrice) {
            return res.status(400).json({ 
                success: false, 
                error: `Precio mínimo: $${(minPrice/100).toFixed(0)} USD ($5/clase)` 
            });
        }

        // Vigencia máxima 365 días (12 meses)
        const finalValidityDays = Math.min(Math.max(validityDays || 30, 7), 365);

        const package_ = new TeacherPackage({
            teacherId: req.user._id,
            category: category || 'piano',
            categoryCustom: categoryCustom || '',
            name,
            description: description || '',
            classCount,
            classDurationMinutes: classDurationMinutes || 45,
            priceUSD,
            validityDays: finalValidityDays,
            isRecurring: isRecurring !== false,
            billingCycleDays: billingCycleDays || 30,
            isFeatured: isFeatured || false,
            isActive: true
        });

        await package_.save();

        res.json({
            success: true,
            package: package_,
            message: 'Paquete creado exitosamente'
        });
    } catch (error) {
        console.error('[TeacherPackages] Error creando:', error);
        res.status(500).json({ success: false, error: 'Error creando paquete' });
    }
});

/**
 * PUT /api/teacher-packages/:id
 * Actualizar paquete existente
 */
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const package_ = await TeacherPackage.findById(req.params.id);
        
        if (!package_) {
            return res.status(404).json({ 
                success: false, 
                error: 'Paquete no encontrado' 
            });
        }

        // Verificar propiedad
        if (package_.teacherId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                error: 'No autorizado' 
            });
        }

        // Campos actualizables
        const updatableFields = [
            'category', 'categoryCustom', 'name', 'description',
            'classCount', 'classDurationMinutes', 'priceUSD',
            'validityDays', 'isRecurring', 'billingCycleDays',
            'isFeatured', 'isActive'
        ];

        updatableFields.forEach(field => {
            if (req.body[field] !== undefined) {
                package_[field] = req.body[field];
            }
        });

        await package_.save();

        res.json({
            success: true,
            package: package_,
            message: 'Paquete actualizado'
        });
    } catch (error) {
        console.error('[TeacherPackages] Error actualizando:', error);
        res.status(500).json({ success: false, error: 'Error actualizando paquete' });
    }
});

/**
 * DELETE /api/teacher-packages/:id
 * Desactivar paquete (soft delete)
 */
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const package_ = await TeacherPackage.findById(req.params.id);
        
        if (!package_) {
            return res.status(404).json({ 
                success: false, 
                error: 'Paquete no encontrado' 
            });
        }

        // Verificar propiedad
        if (package_.teacherId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                error: 'No autorizado' 
            });
        }

        // Verificar si tiene suscripciones activas
        const activeSubs = await StudentSubscription.countDocuments({
            packageId: package_._id,
            status: { $in: ['active', 'paused'] }
        });

        if (activeSubs > 0) {
            // Solo desactivar, no eliminar
            package_.isActive = false;
            await package_.save();

            return res.json({
                success: true,
                message: `Paquete desactivado. ${activeSubs} suscripciones activas mantienen acceso.`,
                hasActiveSubs: true
            });
        }

        // Si no tiene suscripciones, eliminar completamente
        await package_.deleteOne();

        res.json({
            success: true,
            message: 'Paquete eliminado',
            hasActiveSubs: false
        });
    } catch (error) {
        console.error('[TeacherPackages] Error eliminando:', error);
        res.status(500).json({ success: false, error: 'Error eliminando paquete' });
    }
});

/**
 * GET /api/teacher-packages/:id/stats
 * Estadísticas detalladas de un paquete
 */
router.get('/:id/stats', authMiddleware, async (req, res) => {
    try {
        const package_ = await TeacherPackage.findById(req.params.id);
        
        if (!package_) {
            return res.status(404).json({ 
                success: false, 
                error: 'Paquete no encontrado' 
            });
        }

        // Verificar propiedad
        if (package_.teacherId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                error: 'No autorizado' 
            });
        }

        // Obtener suscripciones de este paquete
        const subscriptions = await StudentSubscription.find({
            packageId: package_._id
        }).populate('studentId', 'name email');

        const stats = {
            totalSold: package_.stats.totalSold,
            activeSubscriptions: subscriptions.filter(s => s.status === 'active').length,
            pausedSubscriptions: subscriptions.filter(s => s.status === 'paused').length,
            exhaustedSubscriptions: subscriptions.filter(s => s.status === 'exhausted').length,
            cancelledSubscriptions: subscriptions.filter(s => s.status === 'cancelled').length,
            totalRevenue: package_.stats.revenue,
            totalRevenueFormatted: `$${(package_.stats.revenue / 100).toFixed(2)} USD`
        };

        res.json({
            success: true,
            package: package_,
            stats,
            subscriptions: subscriptions.map(s => ({
                _id: s._id,
                student: s.studentId,
                status: s.status,
                classesRemaining: s.classesRemaining,
                classesCompleted: s.classesCompleted,
                createdAt: s.createdAt
            }))
        });
    } catch (error) {
        console.error('[TeacherPackages] Error obteniendo stats:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

module.exports = router;
