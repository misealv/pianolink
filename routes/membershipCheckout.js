/**
 * routes/membershipCheckout.js
 * 
 * Checkout de membresía de profesor (Premium $19/mes, Founder $10/mes).
 * Resuelve proveedor de pago según país del profesor:
 *   - País MP (CL, MX, AR, CO, BR, PE, UY) → MercadoPago
 *   - Resto → PayPal (USD)
 * 
 * Fase 4 — v5.0
 */

const express = require('express');
const router = express.Router();
const { protect, teacherOrAdmin } = require('../middleware/authMiddleware');
const PaymentProviderResolver = require('../services/PaymentProviderResolver');
const PlanPermissionService = require('../services/PlanPermissionService');
const GlobalConfig = require('../models/GlobalConfig');
const User = require('../models/User');
const MpCredentials = require('../models/MpCredentials');
const DiscountService = require('../services/DiscountService');
const PayPalService = require('../services/PayPalService');

// Intentar importar MercadoPago SDK si disponible
let MercadoPagoConfig, Preference;
try {
    const mp = require('mercadopago');
    MercadoPagoConfig = mp.MercadoPagoConfig;
    Preference = mp.Preference;
} catch (e) {
    console.warn('[MembershipCheckout] SDK MercadoPago no disponible. Solo PayPal estará habilitado.');
}

/**
 * GET /api/membership/resolve-provider
 * Devuelve qué proveedor de pago usar según el país del profesor autenticado.
 */
router.get('/resolve-provider', protect, teacherOrAdmin, async (req, res) => {
    try {
        const teacher = await User.findById(req.user._id);
        if (!teacher) return res.status(404).json({ error: 'Profesor no encontrado' });

        const resolved = await PaymentProviderResolver.resolveForMembership(teacher);

        // No exponemos credenciales sensibles al frontend
        res.json({
            success: true,
            provider: resolved.provider,
            currency: resolved.currency,
            countryCode: resolved.countryCode,
            // Solo para MP: publicKey para el frontend
            ...(resolved.provider === 'mercadopago' && {
                publicKey: resolved.credentials.publicKey
            })
        });
    } catch (error) {
        console.error('[MembershipCheckout] Error resolve-provider:', error);
        res.status(500).json({ error: 'Error al resolver proveedor de pago' });
    }
});

/**
 * GET /api/membership/founder-slots
 * Cupos restantes de fundadores (público, no requiere auth)
 */
router.get('/founder-slots', async (req, res) => {
    try {
        const MAX_FOUNDERS = 10;
        // Contar profesores marcados como founding member (límite de por vida)
        const currentFounders = await User.countDocuments({
            role: 'teacher',
            isFoundingMember: true
        });
        res.json({
            success: true,
            maxSlots: MAX_FOUNDERS,
            taken: currentFounders,
            remaining: Math.max(0, MAX_FOUNDERS - currentFounders)
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al consultar cupos' });
    }
});

/**
 * POST /api/membership/checkout/premium
 * Crea preferencia de pago para membresía Premium ($19 USD/mes).
 * Body: { returnUrl?: string }
 */
router.post('/checkout/premium', protect, teacherOrAdmin, async (req, res) => {
    try {
        const teacher = await User.findById(req.user._id);
        if (!teacher) return res.status(404).json({ error: 'Profesor no encontrado' });

        // Verificar que no sea ya premium o founder
        const currentPlan = teacher.teacherData?.plan || 'free';
        if (currentPlan === 'premium') {
            return res.status(400).json({ error: 'Ya tienes plan Premium activo' });
        }
        if (currentPlan === 'founder') {
            return res.status(400).json({ error: 'Ya tienes plan Fundador (mejor que Premium)' });
        }

        const config = await GlobalConfig.findOne();
        const planConfig = config?.memberships?.teacherPlans?.premium;
        const priceUSD = planConfig?.price || 1900; // centavos

        // Buscar descuento automático
        const discount = await DiscountService.getApplicableDiscount({
            email: teacher.email,
            userId: teacher._id,
            purchaseType: 'membership',
            amountCents: priceUSD
        });

        const finalPriceUSD = discount ? discount.finalAmountCents : priceUSD;
        const result = await _createCheckout(teacher, 'premium', finalPriceUSD, req.body.returnUrl, discount);

        if (discount) {
            result.discount = {
                code: discount.couponCode,
                percent: discount.discountPercent,
                originalPriceUSD: priceUSD / 100,
                finalPriceUSD: finalPriceUSD / 100,
                savedUSD: discount.discountCents / 100
            };
        }

        res.json(result);
    } catch (error) {
        console.error('[MembershipCheckout] Error checkout premium:', error);
        res.status(500).json({ error: 'Error al crear checkout' });
    }
});

/**
 * POST /api/membership/checkout/founder
 * Crea preferencia de pago para membresía Fundador ($10 USD/mes).
 * Disponible para cualquier profesor mientras haya cupos (máx 10).
 * Body: { returnUrl?: string }
 */
router.post('/checkout/founder', protect, teacherOrAdmin, async (req, res) => {
    try {
        const teacher = await User.findById(req.user._id);
        if (!teacher) return res.status(404).json({ error: 'Profesor no encontrado' });

        // Verificar cupos: máximo 10 fundadores en toda la plataforma
        const MAX_FOUNDERS = 10;
        const currentFounders = await User.countDocuments({
            role: 'teacher',
            isFoundingMember: true
        });
        // Si ya es founding member, no bloquear (ya se contó en el límite)
        if (currentFounders >= MAX_FOUNDERS && !teacher.isFoundingMember) {
            return res.status(400).json({ error: 'Los 10 cupos de fundador ya están ocupados' });
        }

        const currentPlan = teacher.teacherData?.plan || 'free';
        if (currentPlan === 'founder') {
            return res.status(400).json({ error: 'Ya tienes plan Fundador activo' });
        }

        const config = await GlobalConfig.findOne();
        const planConfig = config?.memberships?.teacherPlans?.founder;
        const priceUSD = planConfig?.price || 1000; // centavos

        // Buscar descuento automático
        const discount = await DiscountService.getApplicableDiscount({
            email: teacher.email,
            userId: teacher._id,
            purchaseType: 'membership',
            amountCents: priceUSD
        });

        const finalPriceUSD = discount ? discount.finalAmountCents : priceUSD;
        const result = await _createCheckout(teacher, 'founder', finalPriceUSD, req.body.returnUrl, discount);

        if (discount) {
            result.discount = {
                code: discount.couponCode,
                percent: discount.discountPercent,
                originalPriceUSD: priceUSD / 100,
                finalPriceUSD: finalPriceUSD / 100,
                savedUSD: discount.discountCents / 100
            };
        }

        res.json(result);
    } catch (error) {
        console.error('[MembershipCheckout] Error checkout founder:', error);
        res.status(500).json({ error: 'Error al crear checkout' });
    }
});

/**
 * POST /api/membership/activate
 * Activar plan después de pago exitoso (callback desde MP/PayPal).
 * Body: { plan, paymentId, provider }
 * 
 * Para PayPal: paymentId = orderId (token del URL de retorno).
 * Se captura la orden antes de activar para asegurar el cobro real.
 */
router.post('/activate', protect, teacherOrAdmin, async (req, res) => {
    try {
        const { plan, paymentId, provider } = req.body;

        if (!['premium', 'founder'].includes(plan)) {
            return res.status(400).json({ error: 'Plan inválido' });
        }

        if (!paymentId) {
            return res.status(400).json({ error: 'ID de pago requerido' });
        }

        const teacher = await User.findById(req.user._id);
        if (!teacher) return res.status(404).json({ error: 'Profesor no encontrado' });

        const options = {
            paymentProvider: provider || 'mercadopago'
        };

        // === PAYPAL: Capturar orden antes de activar ===
        if (provider === 'paypal') {
            console.log(`[MembershipCheckout] 🔄 Capturando orden PayPal ${paymentId} para ${teacher.email}`);

            if (!PayPalService.isConfigured()) {
                return res.status(503).json({ error: 'PayPal no está configurado' });
            }

            try {
                // Primero verificar estado actual de la orden
                const orderDetails = await PayPalService.getOrderDetails(paymentId);
                console.log(`[MembershipCheckout] 📦 Estado orden PayPal: ${orderDetails.status}`);

                if (orderDetails.status === 'COMPLETED') {
                    // Ya fue capturada previamente (ej: webhook o retry)
                    const captureId = orderDetails.purchase_units?.[0]?.payments?.captures?.[0]?.id;
                    console.log(`[MembershipCheckout] ✅ Orden ya capturada: ${captureId}`);
                    options.subscriptionId = captureId || paymentId;

                } else if (orderDetails.status === 'APPROVED') {
                    // Capturar el pago ahora
                    const capture = await PayPalService.captureOrder(paymentId);

                    if (!capture.success) {
                        console.error(`[MembershipCheckout] ❌ Error capturando PayPal:`, capture);
                        return res.status(402).json({ 
                            error: 'No se pudo completar el cobro en PayPal. Intenta de nuevo.',
                            status: capture.status
                        });
                    }

                    console.log(`[MembershipCheckout] ✅ PayPal capturado: ${capture.captureId} - $${capture.amount} ${capture.currency}`);
                    options.subscriptionId = capture.captureId || paymentId;

                } else {
                    // Estado inesperado (CREATED, VOIDED, etc.)
                    console.error(`[MembershipCheckout] ❌ Orden PayPal en estado inesperado: ${orderDetails.status}`);
                    return res.status(400).json({ 
                        error: `El pago no fue aprobado en PayPal (estado: ${orderDetails.status}). Intenta de nuevo.`
                    });
                }

                // Guardar referencia PayPal en teacherData
                options.paypalSubscriptionId = options.subscriptionId;

            } catch (paypalError) {
                console.error('[MembershipCheckout] ❌ Error PayPal capture:', paypalError.message);
                return res.status(500).json({ 
                    error: 'Error al verificar el pago con PayPal. Intenta de nuevo en unos minutos.'
                });
            }

        } else {
            // MercadoPago: se valida via webhook, aquí solo guardamos la referencia
            options.mpSubscriptionId = paymentId;
        }

        // Activar plan vía PlanPermissionService
        await PlanPermissionService.activatePlan(teacher._id, plan, options);

        // Recargar datos actualizados
        const updated = await User.findById(teacher._id).select('teacherData.plan teacherData.permissions teacherData.subscriptionStatus teacherData.subscriptionExpiresAt');

        console.log(`[MembershipCheckout] ✅ Plan ${plan} activado para ${teacher.email} (${provider}) - Pago verificado`);

        res.json({
            success: true,
            message: `Plan ${plan} activado exitosamente`,
            plan: updated.teacherData.plan,
            permissions: updated.teacherData.permissions,
            expiresAt: updated.teacherData.subscriptionExpiresAt
        });
    } catch (error) {
        console.error('[MembershipCheckout] Error activate:', error);
        res.status(500).json({ error: 'Error al activar plan' });
    }
});

/**
 * GET /api/membership/status
 * Estado actual de la membresía del profesor.
 */
router.get('/status', protect, teacherOrAdmin, async (req, res) => {
    try {
        const teacher = await User.findById(req.user._id)
            .select('teacherData.plan teacherData.permissions teacherData.subscriptionStatus teacherData.subscriptionExpiresAt teacherData.planActivatedAt teacherData.membershipPaymentProvider isFounder isFoundingMember country');

        if (!teacher) return res.status(404).json({ error: 'Profesor no encontrado' });

        const td = teacher.teacherData || {};
        const plan = td.plan || 'free';
        const daysUntilExpiry = td.subscriptionExpiresAt
            ? Math.ceil((new Date(td.subscriptionExpiresAt) - new Date()) / (1000 * 60 * 60 * 24))
            : null;

        res.json({
            success: true,
            plan,
            permissions: td.permissions || {},
            subscriptionStatus: td.subscriptionStatus || 'trial',
            expiresAt: td.subscriptionExpiresAt,
            activatedAt: td.planActivatedAt,
            daysUntilExpiry,
            paymentProvider: td.membershipPaymentProvider,
            isFounder: teacher.isFoundingMember || false,
            country: teacher.country
        });
    } catch (error) {
        console.error('[MembershipCheckout] Error status:', error);
        res.status(500).json({ error: 'Error al obtener estado' });
    }
});

// ===================== FUNCIONES PRIVADAS =====================

/**
 * Crea checkout para membresía según proveedor resuelto.
 */
async function _createCheckout(teacher, plan, priceUSD, returnUrl, discount = null) {
    const resolved = await PaymentProviderResolver.resolveForMembership(teacher);
    const baseUrl = process.env.BASE_URL || 'https://pianolink.cl';
    const successUrl = returnUrl || `${baseUrl}/dashboard.html?membership=success&plan=${plan}`;
    const failureUrl = `${baseUrl}/dashboard.html?membership=failed`;

    if (resolved.provider === 'mercadopago') {
        return await _createMpCheckout(teacher, plan, priceUSD, resolved, successUrl, failureUrl);
    } else {
        return await _createPayPalCheckout(teacher, plan, priceUSD, resolved, successUrl, failureUrl);
    }
}

/**
 * Crea preferencia de MercadoPago para membresía.
 * Convierte USD a moneda local usando tasa de cambio aproximada.
 */
async function _createMpCheckout(teacher, plan, priceUSD, resolved, successUrl, failureUrl) {
    if (!Preference) {
        throw new Error('SDK MercadoPago no disponible');
    }

    // Tasa de cambio aproximada USD → CLP (solo Chile usa MP)
    const USD_RATES = {
        CLP: 950
    };

    const currency = resolved.currency || 'CLP';
    const rate = USD_RATES[currency] || 950;
    const localPrice = Math.round((priceUSD / 100) * rate); // priceUSD está en centavos

    const planLabels = {
        premium: 'Membresía Premium PianoLink',
        founder: 'Membresía Fundador PianoLink'
    };

    const client = new MercadoPagoConfig({ accessToken: resolved.credentials.accessToken });
    const preference = new Preference(client);

    const prefData = {
        items: [{
            title: planLabels[plan] || 'Membresía PianoLink',
            description: `Plan ${plan} - 1 mes`,
            quantity: 1,
            currency_id: currency,
            unit_price: localPrice
        }],
        payer: {
            email: teacher.email,
            name: teacher.name
        },
        back_urls: {
            success: successUrl,
            failure: failureUrl,
            pending: `${successUrl}&status=pending`
        },
        auto_return: 'approved',
        external_reference: `membership_${plan}_${teacher._id}_${Date.now()}`,
        metadata: {
            type: 'teacher_membership',
            plan,
            teacherId: teacher._id.toString(),
            priceUSD
        }
    };

    const result = await preference.create({ body: prefData });

    return {
        success: true,
        provider: 'mercadopago',
        checkoutUrl: result.init_point || result.sandbox_init_point,
        preferenceId: result.id,
        currency,
        localPrice,
        priceUSD: priceUSD / 100
    };
}

/**
 * Crea orden PayPal para membresía (USD directo).
 */
async function _createPayPalCheckout(teacher, plan, priceUSD, resolved, successUrl, failureUrl) {
    const priceDecimal = (priceUSD / 100).toFixed(2);
    const planLabels = {
        premium: 'Membresía Premium PianoLink',
        founder: 'Membresía Fundador PianoLink'
    };

    // Crear orden PayPal vía API REST
    const auth = Buffer.from(`${resolved.credentials.clientId}:${resolved.credentials.clientSecret}`).toString('base64');
    const mode = resolved.credentials.mode === 'live' ? 'api-m' : 'api-m.sandbox';

    const response = await fetch(`https://${mode}.paypal.com/v2/checkout/orders`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            intent: 'CAPTURE',
            purchase_units: [{
                description: planLabels[plan] || 'Membresía PianoLink',
                custom_id: `membership_${plan}_${teacher._id}`,
                amount: {
                    currency_code: 'USD',
                    value: priceDecimal
                }
            }],
            application_context: {
                return_url: successUrl,
                cancel_url: failureUrl,
                brand_name: 'PianoLink',
                user_action: 'PAY_NOW'
            }
        })
    });

    const order = await response.json();

    if (!response.ok) {
        console.error('[MembershipCheckout] PayPal error:', order);
        throw new Error('Error al crear orden PayPal');
    }

    const approveLink = order.links?.find(l => l.rel === 'approve');

    return {
        success: true,
        provider: 'paypal',
        checkoutUrl: approveLink?.href,
        orderId: order.id,
        currency: 'USD',
        priceUSD: parseFloat(priceDecimal)
    };
}

module.exports = router;
