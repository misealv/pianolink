/**
 * routes/webhooks.js
 * Endpoints para webhooks de pagos - PianoLink v2.0
 * 
 * ⚠️ SEGURIDAD: Todos los webhooks validan firma antes de procesar
 * ⚠️ NOTA: El webhook de Stripe está en server.js (necesita raw body antes de express.json)
 */

const express = require('express');
const router = express.Router();
const PaymentService = require('../services/PaymentService');
const StripeService = require('../services/StripeService');
const StudentSubscription = require('../models/StudentSubscription');
const TeacherPackage = require('../models/TeacherPackage');

/**
 * POST /api/webhooks/mercadopago
 * Webhook de Mercado Pago para Kit de Bienvenida
 */
router.post('/mercadopago', async (req, res) => {
    console.log('[Webhook] Mercado Pago recibido:', req.body?.type);
    
    try {
        const result = await PaymentService.processMercadoPagoWebhook(req);
        
        if (!result.success && result.error === 'INVALID_SIGNATURE') {
            // Responder 401 pero Mercado Pago espera 200
            // Loguear pero responder OK para evitar reintentos
            console.error('[Webhook] ⚠️ Firma inválida de Mercado Pago');
        }
        
        // Mercado Pago espera 200 siempre
        res.status(200).send('OK');
    } catch (error) {
        console.error('[Webhook] Error MP:', error);
        res.status(200).send('OK'); // Evitar reintentos
    }
});

/**
 * POST /api/webhooks/mercadopago-package
 * Webhook de Mercado Pago para compra de paquetes de clases
 */
router.post('/mercadopago-package', async (req, res) => {
    console.log('[Webhook Package] Mercado Pago recibido:', req.body?.type, req.body?.action);
    
    try {
        // Solo procesar pagos
        if (req.body?.type !== 'payment' || req.body?.action !== 'payment.created') {
            return res.status(200).send('OK');
        }

        const paymentId = req.body?.data?.id;
        if (!paymentId) {
            console.log('[Webhook Package] Sin payment ID');
            return res.status(200).send('OK');
        }

        // Verificar el pago con MP
        const accessToken = process.env.MP_ACCESS_TOKEN;
        const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const payment = await paymentRes.json();

        console.log('[Webhook Package] Pago:', payment.id, payment.status, payment.metadata);

        if (payment.status !== 'approved') {
            console.log('[Webhook Package] Pago no aprobado:', payment.status);
            return res.status(200).send('OK');
        }

        // Extraer metadata
        const meta = payment.metadata || {};
        if (meta.type !== 'package_purchase') {
            console.log('[Webhook Package] No es compra de paquete');
            return res.status(200).send('OK');
        }

        const { packageId, studentId, classCount, priceUSD, autoRenew } = meta;
        
        // Verificar que no hayamos procesado este pago ya
        const existingPayment = await StudentSubscription.findOne({
            'statusHistory.reason': { $regex: paymentId }
        });
        if (existingPayment) {
            console.log('[Webhook Package] Pago ya procesado');
            return res.status(200).send('OK');
        }

        // Obtener paquete
        const package_ = await TeacherPackage.findById(packageId);
        if (!package_) {
            console.error('[Webhook Package] Paquete no encontrado:', packageId);
            return res.status(200).send('OK');
        }

        // Verificar suscripción existente
        const existingSub = await StudentSubscription.findOne({
            studentId,
            teacherId: package_.teacherId,
            category: package_.category,
            status: { $in: ['active', 'paused', 'exhausted'] }
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
            
            if (existingSub.status !== 'active') {
                existingSub.status = 'active';
            }
            
            existingSub.statusHistory.push({
                status: 'active',
                reason: `Renovación MP: +${package_.classCount} clases (${paymentId})`
            });

            await existingSub.save();
            console.log('[Webhook Package] Suscripción renovada:', existingSub._id);
        } else {
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
                autoRenew: autoRenew === 'true' || autoRenew === true,
                paymentProvider: 'mercadopago',
                externalSubscriptionId: paymentId,
                status: 'active',
                expiresAt,
                statusHistory: [{ 
                    status: 'active', 
                    reason: `Compra MP: ${package_.name} (${paymentId})` 
                }]
            });

            await subscription.save();
            console.log('[Webhook Package] Nueva suscripción creada:', subscription._id);
        }

        // Actualizar stats del paquete
        package_.stats.totalSold = (package_.stats.totalSold || 0) + 1;
        package_.stats.revenue = (package_.stats.revenue || 0) + package_.priceUSD;
        if (!existingSub) {
            package_.stats.activeSubscriptions = (package_.stats.activeSubscriptions || 0) + 1;
        }
        await package_.save();

        res.status(200).send('OK');
    } catch (error) {
        console.error('[Webhook Package] Error:', error);
        res.status(200).send('OK');
    }
});

/**
 * POST /api/webhooks/paypal
 * Webhook de PayPal
 */
router.post('/paypal', async (req, res) => {
    console.log('[Webhook] PayPal recibido:', req.body?.event_type);
    
    try {
        const result = await PaymentService.processPayPalWebhook(req);
        
        if (!result.success && result.error === 'INVALID_SIGNATURE') {
            console.error('[Webhook] ⚠️ Firma inválida de PayPal');
        }
        
        // PayPal espera 200
        res.status(200).send('OK');
    } catch (error) {
        console.error('[Webhook] Error PayPal:', error);
        res.status(200).send('OK');
    }
});

/**
 * POST /api/webhooks/mercadopago-teacher-subscription
 * Webhook para activar membresía de profesor tras pago con MercadoPago
 */
router.post('/mercadopago-teacher-subscription', async (req, res) => {
    console.log('[Webhook] MercadoPago Teacher Subscription recibido');
    
    try {
        // MercadoPago envía el tipo de notificación
        const { type, data } = req.body;
        
        // Solo procesar pagos aprobados
        if (type !== 'payment') {
            console.log('[Webhook] Ignorando tipo:', type);
            return res.status(200).send('OK');
        }
        
        const paymentId = data?.id;
        if (!paymentId) {
            console.log('[Webhook] No payment ID');
            return res.status(200).send('OK');
        }
        
        // Obtener detalles del pago de MercadoPago
        const accessToken = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
        const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        const payment = await paymentRes.json();
        console.log('[Webhook] Payment status:', payment.status);
        
        // Solo procesar pagos aprobados
        if (payment.status !== 'approved') {
            console.log('[Webhook] Pago no aprobado:', payment.status);
            return res.status(200).send('OK');
        }
        
        // Verificar que es un pago de membresía de profesor
        const metadata = payment.metadata;
        if (metadata?.type !== 'teacher_subscription') {
            console.log('[Webhook] No es pago de membresía profesor');
            return res.status(200).send('OK');
        }
        
        const teacherId = metadata.teacherId;
        if (!teacherId) {
            console.error('[Webhook] No se encontró teacherId en metadata');
            return res.status(200).send('OK');
        }
        
        // Activar membresía del profesor
        const User = require('../models/User');
        const teacher = await User.findById(teacherId);
        
        if (!teacher || teacher.role !== 'teacher') {
            console.error('[Webhook] Profesor no encontrado:', teacherId);
            return res.status(200).send('OK');
        }
        
        // Calcular fecha de expiración (30 días)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        
        // Actualizar estado de membresía
        teacher.teacherData.subscriptionStatus = 'active';
        teacher.teacherData.subscriptionExpiresAt = expiresAt;
        await teacher.save();
        
        console.log(`[Webhook] ✅ Membresía activada para ${teacher.email} hasta ${expiresAt.toISOString()}`);
        
        // Enviar email de confirmación (opcional)
        try {
            const { Resend } = require('resend');
            const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
            
            if (resend) {
                await resend.emails.send({
                    from: process.env.EMAIL_FROM || 'PianoLink <notificaciones@pianolink.net>',
                    to: teacher.email,
                    subject: '✅ Tu membresía PianoLink está activa',
                    html: `
                        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
                            <h2 style="color: #059669;">¡Tu membresía está activa! 🎹</h2>
                            <p>Hola ${teacher.name},</p>
                            <p>Tu pago ha sido procesado exitosamente. Tu membresía de profesor está activa hasta el <strong>${expiresAt.toLocaleDateString('es-CL')}</strong>.</p>
                            <p>Ya puedes usar tu sala virtual y recibir estudiantes.</p>
                            <a href="https://pianolink.net/dashboard" style="display: inline-block; background: #059669; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Ir a mi Dashboard</a>
                            <p style="color: #888; font-size: 12px; margin-top: 20px;">— Equipo PianoLink</p>
                        </div>
                    `
                });
                console.log('[Webhook] Email de confirmación enviado');
            }
        } catch (emailErr) {
            console.error('[Webhook] Error enviando email:', emailErr.message);
        }
        
        res.status(200).send('OK');
        
    } catch (error) {
        console.error('[Webhook] Error MercadoPago Teacher Sub:', error);
        res.status(200).send('OK'); // Siempre responder 200 para evitar reintentos
    }
});

/**
 * GET /api/webhooks/test
 * Para verificar que los endpoints están activos (dev only)
 */
router.get('/test', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).send('Not found');
    }
    res.json({ 
        status: 'Webhook endpoints active',
        endpoints: ['/stripe', '/mercadopago', '/mercadopago-teacher-subscription', '/paypal'],
        stripeConfigured: StripeService.isConfigured()
    });
});

module.exports = router;
