/**
 * routes/clientRoutes.js
 * Rutas para el panel de clientes (estudiantes/apoderados)
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const User = require('../models/User');
const WelcomeKit = require('../models/WelcomeKit');
const Coupon = require('../models/Coupon');
const Enrollment = require('../models/Enrollment');
const StudentSubscription = require('../models/StudentSubscription');

/**
 * GET /api/client/me
 * Obtener datos del cliente autenticado
 */
router.get('/me', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('-password')
            .lean();

        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        // Calcular totales de clases
        let totalClassesRemaining = 0;
        let totalClassesUsed = 0;

        if (user.role === 'student') {
            // El usuario es estudiante directo
            totalClassesRemaining = user.classesRemaining || 0;
            totalClassesUsed = user.classesCompleted || 0;
        } else if (user.clientData?.managedStudents?.length > 0) {
            // El usuario es guardian/client con estudiantes gestionados
            user.clientData.managedStudents.forEach(student => {
                totalClassesRemaining += student.classesRemaining || 0;
                totalClassesUsed += student.classesUsed || 0;
            });
        }

        // Fallback: si es client sin managedStudents, usar sus propias clases
        if (user.role === 'client' && totalClassesRemaining === 0) {
            totalClassesRemaining = user.classesRemaining || 0;
            totalClassesUsed = user.classesCompleted || 0;
        }

        // Buscar enrollment activo (cualquier alumno con enrollment, no solo invitados)
        let enrollmentData = null;
        if (user.role === 'student' || user.role === 'client') {
            const enrollment = await Enrollment.findOne({
                studentId: user._id,
                status: 'active'
            }).populate('teacherId', 'name email teacherData.plan teacherData.hourlyRate').lean();

            if (enrollment) {
                // Si User.classesRemaining está en 0 pero enrollment tiene clases, sincronizar
                if (totalClassesRemaining === 0 && enrollment.classesRemaining > 0) {
                    totalClassesRemaining = enrollment.classesRemaining;
                    // Sincronizar en background para que BookingService las vea
                    User.updateOne({ _id: user._id }, { classesRemaining: enrollment.classesRemaining }).catch(err => {
                        console.error('[CLIENT] Error sincronizando classesRemaining desde enrollment:', err.message);
                    });
                }
                enrollmentData = {
                    id: enrollment._id,
                    source: enrollment.source,
                    classesRemaining: enrollment.classesRemaining,
                    preloadedClasses: enrollment.preloadedClasses,
                    teacher: enrollment.teacherId ? {
                        id: enrollment.teacherId._id,
                        name: enrollment.teacherId.name,
                        email: enrollment.teacherId.email,
                        plan: enrollment.teacherId.teacherData?.plan
                    } : null,
                    commission: enrollment.appliedCommission,
                    status: enrollment.status
                };
            } else {
                // Fallback a StudentSubscription (fuente de verdad moderna)
                const subscription = await StudentSubscription.findOne({
                    studentId: user._id,
                    status: { $in: ['active', 'paused'] },
                    classesRemaining: { $gt: 0 }
                }).sort({ classesRemaining: -1 })
                  .populate('teacherId', 'name email teacherData.plan teacherData.hourlyRate')
                  .lean();

                if (subscription) {
                    if (totalClassesRemaining === 0) {
                        totalClassesRemaining = subscription.classesRemaining;
                    }
                    // Sincronizar legacy fields en background para que admin/otros endpoints
                    // que leen User directamente vean el estado consistente
                    const syncOps = {};
                    if ((user.classesRemaining || 0) !== subscription.classesRemaining) {
                        syncOps.classesRemaining = subscription.classesRemaining;
                    }
                    if (subscription.teacherId && !user.studentData?.assignedTeacher) {
                        syncOps['studentData.assignedTeacher'] = subscription.teacherId._id;
                    }
                    if (Object.keys(syncOps).length > 0) {
                        User.updateOne({ _id: user._id }, { $set: syncOps }).catch(err => {
                            console.error('[CLIENT] Error sincronizando desde StudentSubscription:', err.message);
                        });
                    }
                    enrollmentData = {
                        id: subscription._id,
                        source: 'StudentSubscription',
                        classesRemaining: subscription.classesRemaining,
                        preloadedClasses: subscription.classesTotal,
                        teacher: subscription.teacherId ? {
                            id: subscription.teacherId._id,
                            name: subscription.teacherId.name,
                            email: subscription.teacherId.email,
                            plan: subscription.teacherId.teacherData?.plan
                        } : null,
                        status: subscription.status
                    };
                }
            }
        }

        res.json({
            ...user,
            enrollment: enrollmentData,
            summary: {
                totalClassesRemaining,
                totalClassesUsed,
                totalStudents: user.clientData?.managedStudents?.length || 0
            }
        });
    } catch (error) {
        console.error('[CLIENT] Error obteniendo datos:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

/**
 * GET /api/client/payments
 * Historial de pagos del cliente
 */
router.get('/payments', protect, async (req, res) => {
    try {
        // Buscar kits comprados por este usuario (clientId o por email)
        const kits = await WelcomeKit.find({
            $or: [
                { clientId: req.user._id },
                { clientEmail: req.user.email?.toLowerCase() }
            ]
        })
            .select('payment kitType createdAt')
            .sort({ createdAt: -1 })
            .lean();

        const payments = kits.map(kit => ({
            id: kit._id,
            date: kit.createdAt,
            type: 'Welcome Kit',
            kitType: kit.kitType,
            amount: kit.payment?.amount || 0,
            currency: kit.payment?.currency || 'USD',
            status: kit.payment?.status || 'unknown',
            provider: kit.payment?.provider || 'paypal',
            orderId: kit.payment?.externalOrderId
        }));

        res.json({
            payments,
            total: payments.length
        });
    } catch (error) {
        console.error('[CLIENT] Error obteniendo pagos:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

/**
 * GET /api/client/subscription
 * Estado de suscripción del cliente
 */
router.get('/subscription', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).lean();

        // Determinar estado de pago — prioridad: StudentSubscription → managedStudents → User legacy
        let totalClassesRemaining = 0;

        if (user.clientData?.managedStudents?.length > 0) {
            // Guardian con estudiantes gestionados
            user.clientData.managedStudents.forEach(student => {
                totalClassesRemaining += student.classesRemaining || 0;
            });
        }

        // Leer desde StudentSubscription (fuente de verdad moderna)
        if (totalClassesRemaining === 0) {
            const mongoose = require('mongoose');
            const subs = await StudentSubscription.aggregate([
                {
                    $match: {
                        studentId: new mongoose.Types.ObjectId(user._id),
                        status: { $in: ['active', 'paused'] },
                        classesRemaining: { $gt: 0 }
                    }
                },
                { $group: { _id: null, total: { $sum: '$classesRemaining' } } }
            ]);
            totalClassesRemaining = subs[0]?.total || 0;
        }

        // Fallback legacy
        if (totalClassesRemaining === 0) {
            totalClassesRemaining = user.classesRemaining || 0;
        }

        // Verificar si está en onboarding (tiene kit pero aún no completa)
        const WelcomeKit = require('../models/WelcomeKit');
        const activeKit = await WelcomeKit.findOne({
            $or: [{ clientId: user._id }, { clientEmail: user.email }],
            kitType: 'setup_only',
            overallStatus: { $ne: 'completed' }
        }).lean();

        const isOnboarding = !!activeKit;
        const paymentStatus = totalClassesRemaining > 0 ? 'active' : 'needs_payment';

        // Mensaje contextual según estado
        let message;
        if (isOnboarding) {
            message = totalClassesRemaining > 0
                ? `Tienes ${totalClassesRemaining} clase de prueba incluida en tu Kit. Se activará en el paso 4 del onboarding.`
                : 'Tu clase de prueba se activará al completar el onboarding.';
        } else {
            message = paymentStatus === 'active'
                ? `Tienes ${totalClassesRemaining} clase(s) disponible(s)`
                : 'No tienes clases disponibles. ¡Compra más clases!';
        }

        res.json({
            status: isOnboarding ? 'onboarding' : paymentStatus,
            classesRemaining: totalClassesRemaining,
            kitPurchased: user.kitPurchased || false,
            kitPurchaseDate: user.kitPurchaseDate || null,
            isOnboarding,
            message
        });
    } catch (error) {
        console.error('[CLIENT] Error obteniendo suscripción:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

/**
 * GET /api/client/orders
 * Obtener pedidos del cliente con tracking de envío
 */
router.get('/orders', protect, async (req, res) => {
    try {
        // Buscar kits por clientId O por email (solo los que tienen pago válido)
        // Priorizar clientId si existe, evitar traer kits de prueba sin pago
        const kits = await WelcomeKit.find({
            $or: [
                { clientId: req.user._id },
                { 
                    clientEmail: req.user.email?.toLowerCase(),
                    'payment.status': { $in: ['completed', 'paid'] } // Solo kits con pago completado
                }
            ]
        })
        .select('kitType products cable shipping setupSession payment createdAt clientId')
        .sort({ createdAt: -1 })
        .limit(10) // Limitar a los últimos 10 pedidos
        .lean();

        const orders = kits.map(kit => {
            // Determinar productos incluidos
            const products = [];
            
            // Productos del kit (nuevo sistema)
            if (kit.products?.length > 0) {
                kit.products.forEach(p => {
                    products.push({
                        name: p.name,
                        type: 'physical',
                        image: p.image,
                        priceAtPurchase: p.priceAtPurchase
                    });
                });
            } else if (kit.cable && kit.cable.type !== 'NONE' && !kit.cable.alreadyHasCable) {
                // Fallback: Cable MIDI legacy (solo si no hay productos nuevos)
                const cableNames = {
                    'USB_B': 'Cable USB Tipo B (estándar)',
                    'MIDI_5PIN': 'Interfaz MIDI 5 pines',
                    'MICRO_USB': 'Cable Micro USB',
                    'USB_C': 'Cable USB Tipo C'
                };
                products.push({
                    name: cableNames[kit.cable.type] || 'Cable MIDI',
                    type: 'physical',
                    keyboardModel: kit.cable.keyboardModel
                });
            }
            
            // Servicios incluidos
            products.push({
                name: 'Sesión de Setup (30 min)',
                type: 'service',
                status: kit.setupSession?.status || 'not_scheduled',
                scheduledAt: kit.setupSession?.scheduledAt
            });
            
            products.push({
                name: 'Clase de Prueba',
                type: 'service',
                status: 'included'
            });

            return {
                id: kit._id,
                orderDate: kit.createdAt,
                kitType: kit.kitType,
                products,
                shipping: kit.shipping ? {
                    status: kit.shipping.status,
                    carrier: kit.shipping.carrier,
                    trackingNumber: kit.shipping.trackingNumber,
                    trackingUrl: kit.shipping.trackingUrl,
                    shippedAt: kit.shipping.shippedAt,
                    estimatedDelivery: kit.shipping.estimatedDelivery,
                    deliveredAt: kit.shipping.deliveredAt,
                    clientConfirmedReceipt: kit.shipping.clientConfirmedReceipt || false,
                    address: kit.shipping.address ? {
                        city: kit.shipping.address.city,
                        country: kit.shipping.address.country
                    } : null
                } : null,
                payment: {
                    amount: kit.payment?.amount,
                    currency: kit.payment?.currency || 'USD',
                    paidAt: kit.payment?.paidAt
                }
            };
        });

        res.json({
            orders,
            total: orders.length
        });
    } catch (error) {
        console.error('[CLIENT] Error obteniendo pedidos:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

/**
 * GET /api/client/coupons
 * Obtener cupones activos del cliente
 */
router.get('/coupons', protect, async (req, res) => {
    try {
        const email = req.user.email?.toLowerCase();
        const userId = req.user._id;

        // Buscar cupones asignados por email o userId
        const coupons = await Coupon.find({
            $or: [
                { assignedToEmail: email },
                { assignedToUserId: userId }
            ]
        })
        .sort({ createdAt: -1 })
        .lean();

        // Formatear para el frontend
        const formatted = coupons.map(c => {
            const isExpired = c.expiresAt && new Date(c.expiresAt) < new Date();
            const isUsedUp = c.usesRemaining <= 0;
            let status = 'active';
            if (isExpired) status = 'expired';
            else if (isUsedUp) status = 'used';
            else if (!c.isActive) status = 'inactive';

            return {
                id: c._id,
                code: c.code,
                discountType: c.discountType,
                discountValue: c.discountValue,
                description: c.description,
                applicableTo: c.applicableTo,
                maxUses: c.maxUses,
                usesRemaining: c.usesRemaining,
                usesUsed: c.maxUses - c.usesRemaining,
                source: c.source,
                status,
                expiresAt: c.expiresAt,
                createdAt: c.createdAt
            };
        });

        res.json({
            success: true,
            coupons: formatted,
            total: formatted.length
        });
    } catch (error) {
        console.error('[CLIENT] Error obteniendo cupones:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

/**
 * POST /api/client/orders/:orderId/confirm-receipt
 * Confirmar recepción del pedido
 */
router.post('/orders/:orderId/confirm-receipt', protect, async (req, res) => {
    try {
        const kit = await WelcomeKit.findOne({
            _id: req.params.orderId,
            $or: [
                { clientId: req.user._id },
                { clientEmail: req.user.email?.toLowerCase() }
            ]
        });

        if (!kit) {
            return res.status(404).json({ message: 'Pedido no encontrado' });
        }

        // Actualizar estado
        kit.shipping.status = 'delivered';
        kit.shipping.clientConfirmedReceipt = true;
        kit.shipping.clientConfirmedAt = new Date();
        kit.shipping.deliveredAt = kit.shipping.deliveredAt || new Date();
        kit.overallStatus = 'delivered';
        await kit.save();

        // Notificar al admin por consola (se puede expandir a email/webhook)
        console.log(`[CLIENT] ✅ Cliente confirmó recepción: ${kit.clientName || req.user.name} - Pedido ${kit._id}`);

        // Opcional: Enviar email al admin
        try {
            const { Resend } = require('resend');
            const resend = new Resend(process.env.RESEND_API_KEY);
            
            await resend.emails.send({
                from: process.env.EMAIL_FROM || 'PianoLink <onboarding@resend.dev>',
                to: 'admin@pianolink.cl', // Cambiar por email real del admin
                subject: `✅ Pedido entregado - ${kit.clientName || 'Cliente'}`,
                html: `
                    <h2>📦 El cliente confirmó que recibió su pedido</h2>
                    <p><strong>Cliente:</strong> ${kit.clientName || req.user.name}</p>
                    <p><strong>Email:</strong> ${kit.clientEmail || req.user.email}</p>
                    <p><strong>Pedido ID:</strong> ${kit._id}</p>
                    <p><strong>Fecha confirmación:</strong> ${new Date().toLocaleString('es-CL')}</p>
                    <hr>
                    <p style="color: #22c55e;">✓ El estado del pedido ha sido actualizado a "Entregado"</p>
                `
            });
        } catch (emailError) {
            console.error('[CLIENT] Error enviando email de notificación:', emailError.message);
        }

        res.json({
            success: true,
            message: '¡Gracias por confirmar la recepción!'
        });
    } catch (error) {
        console.error('[CLIENT] Error confirmando recepción:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

// ==================== BITÁCORA DEL ALUMNO ====================
const LessonLog = require('../models/LessonLog');
const StudentEnrollment = require('../models/StudentEnrollment');

/**
 * GET /api/client/journal
 * Bitácora del alumno: entradas compartidas por sus profesores.
 * Filtra solo visibility: 'shared'.
 */
router.get('/journal', protect, async (req, res) => {
    try {
        const studentId = req.user._id;

        // Obtener enrollments activos del alumno
        const enrollments = await StudentEnrollment.find({
            student: studentId,
            status: { $in: ['active', 'paused'] }
        }).populate('teacher', 'name branding.profilePhotoUrl').lean();

        if (!enrollments.length) {
            return res.json({ success: true, entries: [], teachers: [] });
        }

        const enrollmentIds = enrollments.map(e => e._id);
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;

        const entries = await LessonLog.find({
            enrollment: { $in: enrollmentIds },
            visibility: 'shared'
        })
        .sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('enrollment', 'dependentName')
        .lean();

        const total = await LessonLog.countDocuments({
            enrollment: { $in: enrollmentIds },
            visibility: 'shared'
        });

        // Enriquecer con nombre del profesor
        const teacherMap = {};
        enrollments.forEach(e => {
            teacherMap[e._id.toString()] = {
                name: e.teacher?.name || 'Profesor',
                photo: e.teacher?.branding?.profilePhotoUrl || null
            };
        });

        const enrichedEntries = entries.map(e => ({
            ...e,
            teacherName: teacherMap[e.enrollment?._id?.toString()]?.name || 'Profesor',
            teacherPhoto: teacherMap[e.enrollment?._id?.toString()]?.photo || null,
            dependentName: e.enrollment?.dependentName || null
        }));

        res.json({
            success: true,
            entries: enrichedEntries,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        console.error('[CLIENT] Error journal:', error);
        res.status(500).json({ error: 'Error al obtener bitácora' });
    }
});

module.exports = router;
