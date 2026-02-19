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
const { protect: authMiddleware } = require('../middleware/authMiddleware');

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
        .populate('teacherId', 'name brandName email slug branding teacherData.profile')
        .populate('packageId', 'name category classCount priceUSD validityDays')
        .sort({ updatedAt: -1 });

        // Agregar info de próxima clase para cada suscripción
        const enriched = await Promise.all(subscriptions.map(async (sub) => {
            const nextClass = await ClassSession.findOne({
                subscriptionId: sub._id,
                status: 'scheduled',
                scheduledAt: { $gte: new Date() }
            }).sort({ scheduledAt: 1 });

            return {
                _id: sub._id,
                status: sub.status,
                classesRemaining: sub.classesRemaining,
                classesUsed: sub.classesUsed,
                expiresAt: sub.expiresAt,
                autoRenew: sub.autoRenew,
                escrowBalanceUSD: sub.escrowBalanceUSD,
                compensationClassesOwed: sub.compensationClassesOwed,
                teacher: sub.teacherId ? {
                    _id: sub.teacherId._id,
                    name: sub.teacherId.name,
                    brandName: sub.teacherId.brandName || sub.teacherId.name,
                    slug: sub.teacherId.slug
                } : null,
                package: sub.packageId ? {
                    name: sub.packageId.name,
                    category: sub.packageId.category,
                    classCount: sub.packageId.classCount
                } : null,
                nextClass: nextClass ? {
                    scheduledAt: nextClass.scheduledAt,
                    status: nextClass.status
                } : null
            };
        }));

        // Retornar array directo para compatibilidad con cliente
        res.json(enriched);
    } catch (error) {
        console.error('[Subscriptions] Error obteniendo suscripciones:', error);
        res.status(500).json([]);
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
 * Crear preferencia de MercadoPago para comprar un paquete
 * Body: { packageId, autoRenew }
 */
router.post('/purchase', authMiddleware, async (req, res) => {
    try {
        const { packageId, autoRenew } = req.body;

        // Validar paquete — buscar primero en TeacherPackage, luego fallback a teacherData.packages
        let package_ = await TeacherPackage.findById(packageId).populate('teacherId', 'name brandName teacherData');
        let teacher = package_?.teacherId;

        // Fallback: buscar en teacherData.packages del User (sistema antiguo)
        if (!package_ || !package_.isActive) {
            teacher = await User.findOne({
                role: 'teacher',
                'teacherData.packages._id': packageId
            }).select('name brandName teacherData');

            if (teacher) {
                const embeddedPkg = teacher.teacherData.packages.find(
                    p => p._id.toString() === packageId && p.isActive !== false
                );
                if (embeddedPkg) {
                    // Calcular precio al alumno desde hourlyRate + descuento
                    const hourlyRate = teacher.teacherData?.hourlyRate || 25;
                    const teacherFee = teacher.teacherData?.plan === 'founder' ? 85 : 75;
                    const studentPricePerClass = Math.round((hourlyRate / (teacherFee / 100)) * 100); // centavos USD
                    const totalPrice = Math.round(studentPricePerClass * embeddedPkg.classes * (1 - (embeddedPkg.discountPercent || 0) / 100));

                    // Construir objeto compatible con TeacherPackage
                    package_ = {
                        _id: embeddedPkg._id,
                        teacherId: teacher,
                        category: 'piano',
                        name: `Paquete ${embeddedPkg.classes} clases de Piano`,
                        classCount: embeddedPkg.classes,
                        classDurationMinutes: 45,
                        priceUSD: totalPrice,
                        validityDays: embeddedPkg.validDays || 30,
                        isActive: true,
                        isRecurring: true
                    };
                }
            }
        }

        if (!package_) {
            return res.status(404).json({ 
                success: false, 
                error: 'Paquete no encontrado o no disponible' 
            });
        }

        // Obtener datos del estudiante
        const student = req.user;
        
        // Configurar MercadoPago
        const accessToken = process.env.MP_ACCESS_TOKEN;
        if (!accessToken) {
            return res.status(500).json({ 
                success: false, 
                error: 'Sistema de pagos no disponible' 
            });
        }

        // Convertir precio USD (centavos) a CLP
        const USD_TO_CLP = 950;
        const priceInCLP = Math.round((package_.priceUSD / 100) * USD_TO_CLP);
        
        const teacherName = package_.teacherId?.brandName || package_.teacherId?.name || 'Profesor';
        const externalRef = `pkg_${package_._id}_${student._id}_${Date.now()}`;
        const baseUrl = process.env.FRONTEND_URL || 'https://www.pianolink.net';

        // Separar nombre
        const nameParts = student.name.trim().split(/\s+/);
        const firstName = nameParts[0] || student.name;
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : student.name;

        // Crear preferencia de MercadoPago
        const preference = {
            items: [{
                id: `PKG-${package_._id}`,
                title: `${package_.classCount} Clases - ${package_.name}`,
                description: `Paquete con ${teacherName}. Válido por ${package_.validityDays} días.`,
                category_id: 'services',
                quantity: 1,
                currency_id: 'CLP',
                unit_price: priceInCLP
            }],
            payer: {
                email: student.email,
                first_name: firstName,
                last_name: lastName
            },
            back_urls: {
                success: `${baseUrl}/cliente.html?package_success=1&pkg=${package_._id}`,
                failure: `${baseUrl}/cliente.html?package_error=1`,
                pending: `${baseUrl}/cliente.html?package_pending=1`
            },
            auto_return: 'approved',
            external_reference: externalRef,
            notification_url: `${baseUrl}/api/webhooks/mercadopago-package`,
            statement_descriptor: 'PIANOLINK',
            metadata: {
                type: 'package_purchase',
                packageId: package_._id.toString(),
                studentId: student._id.toString(),
                teacherId: package_.teacherId?._id?.toString(),
                classCount: package_.classCount,
                priceUSD: package_.priceUSD,
                autoRenew: autoRenew || false
            }
        };

        const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(preference)
        });

        const data = await response.json();

        if (data.id) {
            console.log('[Package Purchase] Preferencia MP creada:', data.id);
            
            res.json({
                success: true,
                paymentUrl: data.init_point,
                preferenceId: data.id
            });
        } else {
            console.error('[Package Purchase] Error MP:', data);
            res.status(500).json({ 
                success: false, 
                error: data.message || 'Error creando preferencia de pago' 
            });
        }

    } catch (error) {
        console.error('[Subscriptions] Error en compra:', error);
        res.status(500).json({ success: false, error: 'Error procesando compra' });
    }
});

/**
 * POST /api/subscriptions/confirm-purchase
 * Confirmar compra después de pago exitoso (llamado por webhook o manualmente)
 */
router.post('/confirm-purchase', async (req, res) => {
    try {
        const { packageId, studentId, paymentId, autoRenew } = req.body;

        const package_ = await TeacherPackage.findById(packageId);
        if (!package_) {
            return res.status(404).json({ success: false, error: 'Paquete no encontrado' });
        }

        // Verificar si ya tiene suscripción activa
        const existingSub = await StudentSubscription.findOne({
            studentId,
            teacherId: package_.teacherId,
            category: package_.category,
            status: { $in: ['active', 'paused'] }
        });

        if (existingSub) {
            // Renovar suscripción existente
            existingSub.classesRemaining += package_.classCount;
            existingSub.classesTotal += package_.classCount;
            existingSub.totalPaidUSD += package_.priceUSD;
            existingSub.escrowBalanceUSD += package_.priceUSD;
            
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
                reason: `Renovación: +${package_.classCount} clases (pago: ${paymentId})`
            });

            await existingSub.save();
            package_.stats.totalSold += 1;
            package_.stats.revenue += package_.priceUSD;
            await package_.save();

            return res.json({ success: true, subscription: existingSub, isRenewal: true });
        }

        // Crear nueva suscripción
        const expiresAt = new Date(Date.now() + (package_.validityDays * 24 * 60 * 60 * 1000));

        const subscription = new StudentSubscription({
            studentId,
            teacherId: package_.teacherId,
            packageId: package_._id,
            category: package_.category,
            classesTotal: package_.classCount,
            classesRemaining: package_.classCount,
            totalPaidUSD: package_.priceUSD,
            escrowBalanceUSD: package_.priceUSD,
            autoRenew: autoRenew || false,
            paymentProvider: 'mercadopago',
            externalSubscriptionId: paymentId || '',
            status: 'active',
            expiresAt,
            statusHistory: [{ status: 'active', reason: `Compra: ${package_.name}` }]
        });

        await subscription.save();
        package_.stats.totalSold += 1;
        package_.stats.activeSubscriptions += 1;
        package_.stats.revenue += package_.priceUSD;
        await package_.save();

        res.json({ success: true, subscription, isRenewal: false });
    } catch (error) {
        console.error('[Subscriptions] Error confirmando compra:', error);
        res.status(500).json({ success: false, error: 'Error procesando' });
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
