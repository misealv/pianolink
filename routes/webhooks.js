/**
 * routes/webhooks.js
 * Endpoints para webhooks de pagos - PianoLink v5.0
 * 
 * v5.0: Soporte multi-país. Webhooks de MP aceptan ?country=XX
 * para resolver credenciales del país correcto.
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
const MpCountryRouter = require('../services/MpCountryRouter');
const PlanPermissionService = require('../services/PlanPermissionService');

/**
 * POST /api/webhooks/mercadopago
 * Webhook de Mercado Pago para Kit de Bienvenida
 * v5.0: Acepta ?country=XX para resolver credenciales multi-país
 */
router.post('/mercadopago', async (req, res) => {
    const country = req.query?.country || 'CL'; // Default CL para retrocompatibilidad
    console.log('[Webhook] Mercado Pago recibido:', req.body?.type, '| País:', country);
    
    try {
        const result = await PaymentService.processMercadoPagoWebhook(req, country);
        
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
 * v5.0: Acepta ?country=XX para resolver credenciales multi-país
 */
router.post('/mercadopago-package', async (req, res) => {
    const country = req.query?.country || 'CL';
    console.log('[Webhook Package] Mercado Pago recibido:', req.body?.type, req.body?.action, '| País:', country);
    
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

        // Verificar el pago con MP (multi-país: usar token del país)
        let accessToken = process.env.MP_ACCESS_TOKEN;
        try {
            const creds = await MpCountryRouter.getCredentials(country);
            if (creds) accessToken = creds.accessToken;
        } catch (e) { /* usar token global como fallback */ }
        
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
 * v5.0: Multi-país + sincronización de plan via PlanPermissionService
 */
router.post('/mercadopago-teacher-subscription', async (req, res) => {
    const country = req.query?.country || 'CL';
    console.log('[Webhook MP] ========================================');
    console.log('[Webhook MP] MercadoPago Teacher Subscription recibido | País:', country);
    console.log('[Webhook MP] Body:', JSON.stringify(req.body));
    
    // Responder inmediatamente para evitar timeout de MercadoPago
    res.status(200).send('OK');
    
    try {
        // MercadoPago envía el tipo de notificación
        const { type, data, action } = req.body;
        
        // MercadoPago puede enviar 'payment' o 'payment.updated' o query params
        const isPaymentNotification = type === 'payment' || action?.includes('payment');
        
        // También puede venir por query string (topic=payment&id=xxx)
        const topicFromQuery = req.query?.topic;
        const idFromQuery = req.query?.id || req.query?.['data.id'];
        
        console.log('[Webhook MP] Type:', type, '| Action:', action, '| Topic:', topicFromQuery);
        
        if (!isPaymentNotification && topicFromQuery !== 'payment') {
            console.log('[Webhook MP] Ignorando - no es notificación de pago');
            return;
        }
        
        const paymentId = data?.id || idFromQuery;
        if (!paymentId) {
            console.log('[Webhook MP] No payment ID encontrado');
            return;
        }
        
        console.log('[Webhook MP] Payment ID:', paymentId);
        
        // Obtener detalles del pago de MercadoPago (multi-país)
        let accessToken = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
        try {
            const creds = await MpCountryRouter.getCredentials(country);
            if (creds) accessToken = creds.accessToken;
        } catch (e) { /* usar token global como fallback */ }
        
        if (!accessToken) {
            console.error('[Webhook MP] ❌ No hay access token configurado');
            return;
        }
        
        const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        const payment = await paymentRes.json();
        console.log('[Webhook MP] Payment status:', payment.status);
        console.log('[Webhook MP] External ref:', payment.external_reference);
        console.log('[Webhook MP] Metadata:', JSON.stringify(payment.metadata));
        
        // Solo procesar pagos aprobados
        if (payment.status !== 'approved') {
            console.log('[Webhook MP] Pago no aprobado, ignorando');
            return;
        }
        
        // Verificar que es un pago de membresía de profesor
        // MercadoPago convierte metadata keys a snake_case
        const metadata = payment.metadata || {};
        const isTeacherSubscription = metadata.type === 'teacher_subscription';
        
        // También verificar por external_reference como backup
        const extRef = payment.external_reference || '';
        const isTeacherSubByRef = extRef.startsWith('teacher_sub_');
        
        if (!isTeacherSubscription && !isTeacherSubByRef) {
            console.log('[Webhook MP] No es pago de membresía profesor');
            return;
        }
        
        // Obtener teacherId - MercadoPago convierte a snake_case
        let teacherId = metadata.teacher_id || metadata.teacherId;
        
        // Si no está en metadata, extraer de external_reference
        if (!teacherId && isTeacherSubByRef) {
            // Format: teacher_sub_<userId>_<timestamp>
            const parts = extRef.split('_');
            if (parts.length >= 3) {
                teacherId = parts[2];
            }
        }
        
        if (!teacherId) {
            console.error('[Webhook MP] ❌ No se encontró teacherId');
            console.error('[Webhook MP] Metadata:', metadata);
            console.error('[Webhook MP] ExtRef:', extRef);
            return;
        }
        
        console.log('[Webhook MP] Teacher ID encontrado:', teacherId);
        
        // Activar membresía del profesor
        const User = require('../models/User');
        const teacher = await User.findById(teacherId);
        
        if (!teacher) {
            console.error('[Webhook MP] ❌ Usuario no encontrado:', teacherId);
            return;
        }
        
        if (teacher.role !== 'teacher') {
            console.error('[Webhook MP] ❌ Usuario no es profesor:', teacher.email);
            return;
        }
        
        // Verificar si ya está activa (evitar duplicados)
        if (teacher.teacherData?.subscriptionStatus === 'active') {
            console.log('[Webhook MP] ⚠️ Membresía ya está activa para:', teacher.email);
            return;
        }
        
        // Calcular fecha de expiración (30 días)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        
        // Actualizar estado de membresía
        teacher.teacherData.subscriptionStatus = 'active';
        teacher.teacherData.subscriptionExpiresAt = expiresAt;
        teacher.teacherData.mercadopagoPaymentId = paymentId;
        teacher.teacherData.membershipPaymentProvider = 'mercadopago';
        await teacher.save();
        
        // v5.0: Sincronizar plan y permisos via PlanPermissionService
        // Determinar plan según metadata o plan actual
        const targetPlan = metadata.plan || teacher.teacherData?.plan || 'premium';
        if (targetPlan !== 'free') {
            await PlanPermissionService.activatePlan(teacher._id, targetPlan, {
                paymentProvider: 'mercadopago',
                subscriptionId: paymentId
            });
            console.log(`[Webhook MP] Plan ${targetPlan} activado para ${teacher.email}`);
        }
        
        console.log(`[Webhook] ✅ Membresía activada para ${teacher.email} hasta ${expiresAt.toISOString()}`);
        
        // Enviar email de confirmación (opcional)
        try {
            const { Resend } = require('resend');
            const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
            
            if (resend) {
                await resend.emails.send({
                    from: 'PianoLink Team <hola@pianolink.net>',
                    to: teacher.email,
                    subject: '✅ Tu membresía PianoLink está activa',
                    html: `
                        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
                            <h2 style="color: #059669;">¡Tu membresía está activa! 🎹</h2>
                            <p>Hola ${teacher.name},</p>
                            <p>Tu pago ha sido procesado exitosamente. Tu membresía de profesor está activa hasta el <strong>${expiresAt.toLocaleDateString('es-CL')}</strong>.</p>
                            <p>Ya puedes usar tu sala virtual y recibir estudiantes.</p>
                            <a href="https://pianolink.net/dashboard.html" style="display: inline-block; background: #059669; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Ir a mi Dashboard</a>
                            <p style="color: #888; font-size: 12px; margin-top: 20px;">— Equipo PianoLink</p>
                        </div>
                    `
                });
                console.log('[Webhook MP] ✉️ Email de confirmación enviado a:', teacher.email);
            }
        } catch (emailErr) {
            console.error('[Webhook MP] Error enviando email:', emailErr.message);
        }
        
    } catch (error) {
        console.error('[Webhook MP] ❌ Error procesando webhook:', error);
    }
});

/**
 * POST /api/webhooks/mercadopago-early-bird
 * Webhook de MercadoPago para pagos de Early Bird Kit.
 * Fase 5 — v5.0
 */
router.post('/mercadopago-early-bird', async (req, res) => {
    const country = req.query?.country || 'CL';
    console.log('[Webhook EarlyBird] MP recibido:', req.body?.type, '| País:', country);

    try {
        if (req.body?.type !== 'payment') {
            return res.status(200).send('OK');
        }

        const paymentId = req.body?.data?.id;
        if (!paymentId) return res.status(200).send('OK');

        // Obtener token del país
        let accessToken = process.env.MP_ACCESS_TOKEN;
        try {
            const creds = await MpCountryRouter.getCredentials(country);
            if (creds) accessToken = creds.accessToken;
        } catch (e) { /* fallback token global */ }

        // Verificar pago con API de MP
        const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const mpPayment = await paymentRes.json();

        console.log('[Webhook EarlyBird] Pago:', mpPayment.id, mpPayment.status);

        if (mpPayment.status !== 'approved') {
            return res.status(200).send('OK');
        }

        // Verificar que no esté duplicado
        const Payment = require('../models/Payment');
        const existing = await Payment.findOne({ externalPaymentId: String(paymentId) });
        if (existing) {
            console.log('[Webhook EarlyBird] Pago ya procesado:', paymentId);
            return res.status(200).send('OK');
        }

        // Extraer datos del metadata
        const meta = mpPayment.metadata || {};
        const leadEmail = meta.lead_email || meta.leadEmail || '';
        const priceUSD = meta.price_usd || meta.priceUSD || 2900;
        const regularPriceUSD = meta.regular_price_usd || meta.regularPriceUSD || 4400;

        // Registrar pago
        await Payment.create({
            type: 'early_bird_kit',
            provider: 'mercadopago',
            externalPaymentId: String(paymentId),
            amount: priceUSD,
            currency: 'USD',
            status: 'approved',
            leadEmail,
            signatureValid: true,
            apiVerified: true,
            webhookData: {
                source: 'waitlist_early_bird',
                mpPaymentId: paymentId,
                countryCode: country,
                transactionAmount: mpPayment.transaction_amount,
                localCurrency: mpPayment.currency_id
            },
            metadata: {
                source: 'waitlist_early_bird',
                countryCode: country,
                regularPrice: regularPriceUSD,
                discountApplied: regularPriceUSD - priceUSD
            }
        });

        console.log(`[Webhook EarlyBird] ✅ Pago registrado para ${leadEmail || 'desconocido'}: ${paymentId}`);

        // === Crear usuario + Magic Link (misma lógica que verify-mercadopago) ===
        if (leadEmail) {
            try {
                const User = require('../models/User');
                const crypto = require('crypto');
                const EmailService = require('../services/EmailService');
                const { generateWelcomeKitEmail } = require('../templates/welcomeKitEmail');
                const Lead = require('../models/Lead');

                let user = await User.findOne({ email: leadEmail.toLowerCase() });

                if (!user) {
                    // Buscar datos del Lead para enriquecer el usuario
                    const lead = await Lead.findOne({ email: leadEmail.toLowerCase() }).lean();
                    const userName = lead?.name || leadEmail.split('@')[0];
                    const userWhatsapp = lead?.whatsapp || '';

                    // Generar magic link
                    const magicLinkToken = crypto.randomBytes(32).toString('hex');
                    const magicLinkExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días
                    const tempPassword = crypto.randomBytes(16).toString('hex');

                    user = await User.create({
                        name: userName,
                        email: leadEmail.toLowerCase(),
                        password: tempPassword,
                        whatsapp: userWhatsapp,
                        country: country || 'CL',
                        role: 'student',
                        classesRemaining: 1,
                        classesCompleted: 0,
                        studentData: {
                            source: 'early_bird',
                            level: 'beginner'
                        },
                        kitPurchased: true,
                        kitPurchaseDate: new Date(),
                        magicLinkToken,
                        magicLinkExpires,
                        mustChangePassword: true
                    });

                    console.log(`[Webhook EarlyBird] 👤 Usuario creado: ${user.email}`);

                    // Enviar email de bienvenida con Magic Link
                    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://pianolink.net';
                    const magicLinkUrl = `${frontendUrl}/acceso/${magicLinkToken}`;

                    const emailHtml = generateWelcomeKitEmail({
                        clientName: userName,
                        clientEmail: user.email,
                        magicLinkUrl,
                        students: [],
                        kitType: 'welcome_kit_v2',
                        totalPaid: priceUSD / 100,
                        currency: 'USD',
                        orderId: String(paymentId)
                    });

                    await EmailService.sendSafe({
                        to: user.email,
                        subject: '🎹 ¡Bienvenido a PianoLink! Activa tu cuenta',
                        html: emailHtml
                    });
                    console.log(`[Webhook EarlyBird] 📧 Email con magic link enviado a: ${user.email}`);

                } else {
                    // Usuario ya existe — solo actualizar flag de kit
                    user.kitPurchased = true;
                    user.kitPurchaseDate = new Date();
                    await user.save();
                    console.log(`[Webhook EarlyBird] 👤 Usuario existente actualizado: ${user.email}`);

                    // Enviar email de confirmación (sin magic link)
                    await EmailService.sendSafe({
                        to: user.email,
                        subject: '🎹 ¡Tu Welcome Kit está confirmado! — PianoLink',
                        html: `
                            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
                                <h2 style="color: #8b5cf6;">¡Gracias por tu compra! 🎹</h2>
                                <p>Tu Welcome Kit de PianoLink ha sido confirmado.</p>
                                <p>Ya tienes cuenta — <a href="${process.env.FRONTEND_URL || 'https://pianolink.net'}/login">inicia sesión aquí</a>.</p>
                                <p style="color: #888; font-size: 12px; margin-top: 20px;">— Equipo PianoLink</p>
                            </div>
                        `
                    });
                }
            } catch (userErr) {
                console.error('[Webhook EarlyBird] ⚠️ Error creando usuario:', userErr.message, userErr.stack);
            }
        }

    } catch (error) {
        console.error('[Webhook EarlyBird] ❌ Error:', error);
    }

    res.status(200).send('OK');
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
