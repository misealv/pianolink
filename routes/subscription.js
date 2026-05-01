/**
 * routes/subscription.js
 * API de Suscripciones - PianoLink v2.0
 *
 * @deprecated FASE 5 — Este módulo usa el modelo `Subscription` (viejo).
 *   El flujo activo es `routes/subscriptionRoutes.js` con `StudentSubscription`.
 *   Montado en /api/subscription (singular). Retiro planificado: 60 días.
 *   No agregar nuevas rutas aquí.
 */

const express = require('express');
const router = express.Router();
const { protect: auth } = require('../middleware/authMiddleware');
const SubscriptionService = require('../services/SubscriptionService');
const PaymentService = require('../services/PaymentService');
const Subscription = require('../models/Subscription');

/**
 * GET /api/subscription/my
 * Obtener mi suscripción activa (alumno)
 */
router.get('/my', auth, async (req, res) => {
    try {
        const subscription = await SubscriptionService.getActiveSubscription(req.user._id);
        
        if (!subscription) {
            return res.json({ 
                hasSubscription: false,
                message: 'No tienes suscripción activa'
            });
        }

        res.json({
            hasSubscription: true,
            subscription: {
                id: subscription._id,
                status: subscription.status,
                expiresAt: subscription.expiresAt,
                teacher: subscription.teacherId,
                isValid: subscription.isValid(),
                daysRemaining: Math.ceil((subscription.expiresAt - new Date()) / (1000 * 60 * 60 * 24))
            }
        });
    } catch (error) {
        console.error('[Subscription API] Error:', error);
        res.status(500).json({ error: 'Error obteniendo suscripción' });
    }
});

/**
 * GET /api/subscription/students
 * Obtener suscripciones de mis alumnos (profesor)
 */
router.get('/students', auth, async (req, res) => {
    try {
        if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Solo profesores' });
        }

        const subscriptions = await SubscriptionService.getSubscriptionsByTeacher(req.user._id);
        
        res.json({
            count: subscriptions.length,
            subscriptions: subscriptions.map(s => ({
                id: s._id,
                student: s.studentId,
                status: s.status,
                expiresAt: s.expiresAt,
                isValid: s.isValid(),
                amount: s.amount,
                currency: s.currency
            }))
        });
    } catch (error) {
        console.error('[Subscription API] Error:', error);
        res.status(500).json({ error: 'Error obteniendo suscripciones' });
    }
});

/**
 * POST /api/subscription/create
 * Crear suscripción (profesor registra alumno)
 */
router.post('/create', auth, async (req, res) => {
    try {
        if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Solo profesores' });
        }

        const { studentId, amount, currency, paymentProvider, daysValid } = req.body;

        if (!studentId || !amount) {
            return res.status(400).json({ error: 'studentId y amount requeridos' });
        }

        const subscription = await SubscriptionService.createSubscription({
            studentId,
            teacherId: req.user._id,
            amount,
            currency: currency || 'ARS',
            paymentProvider: paymentProvider || 'manual',
            daysValid: daysValid || 30
        });

        res.json({
            success: true,
            subscription: {
                id: subscription._id,
                expiresAt: subscription.expiresAt,
                status: subscription.status
            }
        });
    } catch (error) {
        console.error('[Subscription API] Error:', error);
        res.status(500).json({ error: 'Error creando suscripción' });
    }
});

/**
 * POST /api/subscription/:id/extend
 * Extender suscripción manualmente (profesor)
 */
router.post('/:id/extend', auth, async (req, res) => {
    try {
        if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Solo profesores' });
        }

        const { days } = req.body;
        const subscription = await SubscriptionService.extendSubscription(
            req.params.id, 
            days || 30
        );

        res.json({
            success: true,
            newExpiresAt: subscription.expiresAt
        });
    } catch (error) {
        console.error('[Subscription API] Error:', error);
        res.status(500).json({ error: 'Error extendiendo suscripción' });
    }
});

/**
 * POST /api/subscription/:id/payment
 * Registrar pago manual (profesor)
 */
router.post('/:id/payment', auth, async (req, res) => {
    try {
        if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Solo profesores' });
        }

        const { amount, currency, notes } = req.body;

        const payment = await PaymentService.createManualPayment({
            subscriptionId: req.params.id,
            amount,
            currency: currency || 'ARS',
            notes
        });

        res.json({
            success: true,
            payment: {
                id: payment._id,
                amount: payment.amount,
                createdAt: payment.createdAt
            }
        });
    } catch (error) {
        console.error('[Subscription API] Error:', error);
        res.status(500).json({ error: 'Error registrando pago' });
    }
});

/**
 * GET /api/subscription/:id/payments
 * Historial de pagos de una suscripción
 */
router.get('/:id/payments', auth, async (req, res) => {
    try {
        const payments = await PaymentService.getPaymentHistory(req.params.id);
        res.json({ payments });
    } catch (error) {
        console.error('[Subscription API] Error:', error);
        res.status(500).json({ error: 'Error obteniendo pagos' });
    }
});

/**
 * GET /api/subscription/expiring
 * Suscripciones por vencer (para enviar recordatorios)
 */
router.get('/expiring', auth, async (req, res) => {
    try {
        if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Solo profesores' });
        }

        const days = parseInt(req.query.days) || 5;
        const expiring = await SubscriptionService.getExpiringSoon(days);

        res.json({
            count: expiring.length,
            subscriptions: expiring
        });
    } catch (error) {
        console.error('[Subscription API] Error:', error);
        res.status(500).json({ error: 'Error obteniendo suscripciones' });
    }
});

module.exports = router;
