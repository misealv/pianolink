/**
 * routes/subscriptionRoutes.js
 * API para gestión de suscripciones estudiante-profesor
 * 
 * Endpoints:
 * - GET /api/subscriptions/my - Suscripciones del estudiante logueado
 * - GET /api/subscriptions/teacher/:teacherId - Suscripción con un profesor específico
 * - POST /api/subscriptions/purchase - Comprar paquete y crear suscripción
 * - POST /api/subscriptions/:id/pause - Pausar suscripción
 * - POST /api/subscriptions/:id/resume - Reanudar suscripción
 * - POST /api/subscriptions/:id/cancel - Cancelar suscripción
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const StudentSubscription = require('../models/StudentSubscription');
const TeacherPackage = require('../models/TeacherPackage');
const ClassSession = require('../models/ClassSession');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

// Comisión de PianoLink (20%)
const PLATFORM_FEE_PERCENT = 20;

/**
 * GET /api/subscriptions/my
 * Obtener todas las suscripciones del estudiante logueado
 */
router.get('/my', authMiddleware, async (req, res) => {
    try {
        const subscriptions = await StudentSubscription.find({
            studentId: req.user._id,
            status: { $nin: ['cancelled'] }
        })
        .populate('teacherId', 'name email teacherData.profile')
        .populate('packageId', 'name category classCount priceUSD')
        .sort({ updatedAt: -1 });

        // Agregar info de próxima clase para cada suscripción
        const enriched = await Promise.all(subscriptions.map(async (sub) => {
            const nextClass = await ClassSession.findOne({
                subscriptionId: sub._id,
                status: 'scheduled',
                scheduledAt: { $gte: new Date() }
            }).sort({ scheduledAt: 1 });

            return {
                ...sub.toObject(),
                nextClass: nextClass ? {
                    scheduledAt: nextClass.scheduledAt,
                    status: nextClass.status
                } : null
            };
        }));

        res.json({
            success: true,
            subscriptions: enriched
        });
    } catch (error) {
        console.error('[Subscriptions] Error obteniendo suscripciones:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * GET /api/subscriptions/teacher/:teacherId
 * Obtener suscripción activa con un profesor específico
 */
router.get('/teacher/:teacherId', authMiddleware, async (req, res) => {
    try {
        const subscription = await StudentSubscription.findOne({
            studentId: req.user._id,
            teacherId: req.params.teacherId,
            status: { $in: ['active', 'paused', 'exhausted'] }
        })
        .populate('teacherId', 'name email')
        .populate('packageId');

        if (!subscription) {
            return res.json({
                success: true,
                subscription: null,
                hasSubscription: false
            });
        }

        // Obtener historial de clases
        const sessions = await ClassSession.find({
            subscriptionId: subscription._id
        })
        .sort({ scheduledAt: -1 })
        .limit(10);

        res.json({
            success: true,
            subscription,
            sessions,
            hasSubscription: true
        });
    } catch (error) {
        console.error('[Subscriptions] Error:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/subscriptions/purchase
 * Crear suscripción comprando un paquete
 * Body: { packageId, paymentProvider, externalPaymentId }
 */
router.post('/purchase', authMiddleware, async (req, res) => {
    try {
        const { packageId, paymentProvider, externalPaymentId, isTrialConversion, welcomeKitId } = req.body;

        // Validar paquete
        const package_ = await TeacherPackage.findById(packageId);
        if (!package_ || !package_.isActive) {
            return res.status(404).json({ 
                success: false, 
                error: 'Paquete no encontrado o no disponible' 
            });
        }

        // Verificar si ya tiene suscripción activa con este profesor en esta categoría
        const existingSub = await StudentSubscription.findOne({
            studentId: req.user._id,
            teacherId: package_.teacherId,
            category: package_.category,
            status: { $in: ['active', 'paused'] }
        });

        if (existingSub) {
            // Agregar clases a suscripción existente (renovación)
            existingSub.classesRemaining += package_.classCount;
            existingSub.classesTotal += package_.classCount;
            existingSub.totalPaidUSD += package_.priceUSD;
            existingSub.escrowBalanceUSD += package_.priceUSD;
            
            // Extender expiración
            const newExpiry = new Date(Math.max(
                existingSub.expiresAt.getTime(),
                Date.now()
            ) + (package_.validityDays * 24 * 60 * 60 * 1000));
            existingSub.expiresAt = newExpiry;
            
            if (existingSub.status === 'exhausted') {
                existingSub.status = 'active';
            }
            
            existingSub.statusHistory.push({
                status: 'active',
                reason: `Renovación: +${package_.classCount} clases`
            });

            await existingSub.save();

            // Actualizar stats del paquete
            package_.stats.totalSold += 1;
            package_.stats.revenue += package_.priceUSD;
            await package_.save();

            return res.json({
                success: true,
                subscription: existingSub,
                isRenewal: true,
                message: `Se agregaron ${package_.classCount} clases a tu suscripción`
            });
        }

        // Crear nueva suscripción
        const expiresAt = new Date(Date.now() + (package_.validityDays * 24 * 60 * 60 * 1000));
        const nextBilling = package_.isRecurring 
            ? new Date(Date.now() + (package_.billingCycleDays * 24 * 60 * 60 * 1000))
            : null;

        const subscription = new StudentSubscription({
            studentId: req.user._id,
            teacherId: package_.teacherId,
            packageId: package_._id,
            category: package_.category,
            
            classesTotal: package_.classCount,
            classesRemaining: package_.classCount,
            
            totalPaidUSD: package_.priceUSD,
            escrowBalanceUSD: package_.priceUSD,
            
            billingCycleDays: package_.billingCycleDays,
            nextBillingDate: nextBilling,
            autoRenew: package_.isRecurring,
            paymentProvider: paymentProvider || 'mercadopago',
            externalSubscriptionId: externalPaymentId || '',
            
            status: 'active',
            expiresAt,
            
            isTrialConversion: !!isTrialConversion,
            welcomeKitId: welcomeKitId || null,
            
            statusHistory: [{
                status: 'active',
                reason: `Compra inicial: ${package_.name}`
            }]
        });

        await subscription.save();

        // Actualizar stats del paquete
        package_.stats.totalSold += 1;
        package_.stats.activeSubscriptions += 1;
        package_.stats.revenue += package_.priceUSD;
        await package_.save();

        // Populate para respuesta
        await subscription.populate('teacherId', 'name email');
        await subscription.populate('packageId', 'name category');

        res.json({
            success: true,
            subscription,
            isRenewal: false,
            message: `Suscripción creada con ${package_.classCount} clases`
        });

    } catch (error) {
        console.error('[Subscriptions] Error en compra:', error);
        res.status(500).json({ success: false, error: 'Error procesando compra' });
    }
});

/**
 * POST /api/subscriptions/:id/pause
 * Pausar una suscripción
 */
router.post('/:id/pause', authMiddleware, async (req, res) => {
    try {
        const subscription = await StudentSubscription.findOne({
            _id: req.params.id,
            studentId: req.user._id,
            status: 'active'
        });

        if (!subscription) {
            return res.status(404).json({ 
                success: false, 
                error: 'Suscripción no encontrada' 
            });
        }

        subscription.status = 'paused';
        subscription.pausedAt = new Date();
        subscription.pausedReason = req.body.reason || 'Pausada por el estudiante';
        subscription.statusHistory.push({
            status: 'paused',
            changedBy: req.user._id,
            reason: subscription.pausedReason
        });

        await subscription.save();

        res.json({
            success: true,
            subscription,
            message: 'Suscripción pausada'
        });
    } catch (error) {
        console.error('[Subscriptions] Error pausando:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/subscriptions/:id/resume
 * Reanudar una suscripción pausada
 */
router.post('/:id/resume', authMiddleware, async (req, res) => {
    try {
        const subscription = await StudentSubscription.findOne({
            _id: req.params.id,
            studentId: req.user._id,
            status: 'paused'
        });

        if (!subscription) {
            return res.status(404).json({ 
                success: false, 
                error: 'Suscripción no encontrada o no está pausada' 
            });
        }

        subscription.status = subscription.classesRemaining > 0 ? 'active' : 'exhausted';
        subscription.pausedAt = null;
        subscription.pausedReason = '';
        subscription.statusHistory.push({
            status: subscription.status,
            changedBy: req.user._id,
            reason: 'Reanudada por el estudiante'
        });

        await subscription.save();

        res.json({
            success: true,
            subscription,
            message: 'Suscripción reanudada'
        });
    } catch (error) {
        console.error('[Subscriptions] Error reanudando:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * POST /api/subscriptions/:id/cancel
 * Cancelar una suscripción
 */
router.post('/:id/cancel', authMiddleware, async (req, res) => {
    try {
        const subscription = await StudentSubscription.findOne({
            _id: req.params.id,
            studentId: req.user._id,
            status: { $in: ['active', 'paused', 'exhausted'] }
        });

        if (!subscription) {
            return res.status(404).json({ 
                success: false, 
                error: 'Suscripción no encontrada' 
            });
        }

        subscription.status = 'cancelled';
        subscription.autoRenew = false;
        subscription.statusHistory.push({
            status: 'cancelled',
            changedBy: req.user._id,
            reason: req.body.reason || 'Cancelada por el estudiante'
        });

        await subscription.save();

        // Decrementar contador en el paquete
        await TeacherPackage.findByIdAndUpdate(subscription.packageId, {
            $inc: { 'stats.activeSubscriptions': -1 }
        });

        // TODO: Si tiene saldo en escrow, procesar reembolso proporcional

        res.json({
            success: true,
            subscription,
            message: 'Suscripción cancelada. Las clases restantes no serán reembolsadas.'
        });
    } catch (error) {
        console.error('[Subscriptions] Error cancelando:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * GET /api/subscriptions/:id/sessions
 * Historial de clases de una suscripción
 */
router.get('/:id/sessions', authMiddleware, async (req, res) => {
    try {
        const subscription = await StudentSubscription.findOne({
            _id: req.params.id,
            $or: [
                { studentId: req.user._id },
                { teacherId: req.user._id }
            ]
        });

        if (!subscription) {
            return res.status(404).json({ 
                success: false, 
                error: 'Suscripción no encontrada' 
            });
        }

        const sessions = await ClassSession.find({
            subscriptionId: subscription._id
        })
        .populate('bookingId', 'scheduledStart scheduledEnd')
        .sort({ scheduledAt: -1 });

        res.json({
            success: true,
            sessions,
            summary: {
                total: subscription.classesTotal,
                remaining: subscription.classesRemaining,
                completed: subscription.classesCompleted,
                studentNoShows: subscription.classesCancelledByStudent,
                teacherNoShows: subscription.classesCancelledByTeacher
            }
        });
    } catch (error) {
        console.error('[Subscriptions] Error obteniendo sesiones:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

module.exports = router;
