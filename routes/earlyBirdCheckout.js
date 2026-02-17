/**
 * routes/earlyBirdCheckout.js
 * Checkout de la oferta Early Bird (Welcome Kit con descuento post-waitlist).
 * 
 * Fase 5 — v5.0
 * 
 * El lead acaba de registrarse en el waitlist y ve una oferta exclusiva
 * con countdown. Este checkout resuelve MP o PayPal según país del lead
 * y crea la orden de pago.
 * 
 * No requiere autenticación (el lead puede no tener cuenta aún).
 */

const express = require('express');
const router = express.Router();
const GlobalConfig = require('../models/GlobalConfig');
const Payment = require('../models/Payment');
const PaymentProviderResolver = require('../services/PaymentProviderResolver');
const PayPalService = require('../services/PayPalService');
const GeoIPService = require('../services/GeoIPService');
const MpCountryRouter = require('../services/MpCountryRouter');
const DiscountService = require('../services/DiscountService');

// Tasas de cambio aproximadas USD → moneda local (mismas que membershipCheckout)
const USD_RATES = {
    CLP: 950, MXN: 17.5, ARS: 900, COP: 4200,
    BRL: 5.0, PEN: 3.75, UYU: 40
};

/**
 * GET /api/early-bird/resolve-provider
 * Resuelve qué proveedor de pago usar según el país del lead.
 * Query: ?country=CL (opcional, si no se pasa se auto-detecta por IP)
 */
router.get('/resolve-provider', async (req, res) => {
    try {
        let country = (req.query.country || '').toUpperCase();

        // Si no se envía país, detectar por IP
        if (!country || country === 'DEFAULT') {
            country = await GeoIPService.detectFromRequest(req);
        }

        const resolved = await PaymentProviderResolver.resolve(country, { type: 'early_bird_kit' });

        // isMpCountry debe reflejar si REALMENTE hay credenciales MP activas,
        // no solo si el país está en la lista teórica
        const actuallyHasMp = resolved.provider === 'mercadopago';

        res.json({
            success: true,
            provider: resolved.provider,
            currency: resolved.currency,
            countryCode: resolved.countryCode,
            isMpCountry: actuallyHasMp
        });
    } catch (error) {
        console.error('[EarlyBirdCheckout] Error resolve-provider:', error.message);
        res.status(500).json({ success: false, error: 'Error al resolver proveedor' });
    }
});

/**
 * POST /api/early-bird/checkout
 * Crea orden de pago para el Welcome Kit early bird.
 * Body: { email: string, country?: string, provider?: 'mercadopago' | 'paypal' }
 */
router.post('/checkout', async (req, res) => {
    try {
        const { email, country: bodyCountry, provider: preferredProvider } = req.body;

        // Validar email
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, error: 'Email inválido' });
        }

        // Obtener configuración de la oferta
        const config = await GlobalConfig.findOne({ isDefault: true });
        const earlyBird = config?.memberships?.earlyBirdOffer;

        if (!earlyBird || !earlyBird.enabled) {
            return res.status(400).json({ success: false, error: 'La oferta no está disponible' });
        }

        const priceUSD = earlyBird.welcomeKitPriceUSD || 2900; // centavos
        const regularPriceUSD = earlyBird.welcomeKitRegularPriceUSD || 4400;

        // Buscar descuento automático (cupón waitlist)
        const discount = await DiscountService.getApplicableDiscount({
            email,
            purchaseType: 'early_bird_kit',
            amountCents: priceUSD
        });

        const finalPriceUSD = discount ? discount.finalAmountCents : priceUSD;

        // Resolver país
        let country = (bodyCountry || '').toUpperCase();
        if (!country || country === 'DEFAULT') {
            country = await GeoIPService.detectFromRequest(req);
        }

        // Resolver proveedor de pago
        const resolved = await PaymentProviderResolver.resolve(country, { type: 'early_bird_kit' });

        // Usar el proveedor que realmente resolvió el resolver (respeta fallback a PayPal
        // si no hay credenciales MP activas), pero permitir override a PayPal
        let useProvider = resolved.provider;
        if (preferredProvider === 'paypal') {
            useProvider = 'paypal'; // El lead puede elegir PayPal aunque MP esté disponible
        }

        const baseUrl = process.env.APP_URL || process.env.FRONTEND_URL || process.env.BASE_URL || 'https://pianolink.net';
        const successUrl = `${baseUrl}/success-waitlist?payment=success&email=${encodeURIComponent(email)}`;
        const cancelUrl = `${baseUrl}/success-waitlist?payment=cancelled&email=${encodeURIComponent(email)}`;

        let result;

        if (useProvider === 'mercadopago') {
            result = await _createMpEarlyBirdCheckout({
                email, country, priceUSD: finalPriceUSD, regularPriceUSD, resolved, successUrl, cancelUrl,
                discount
            });
        } else {
            result = await _createPayPalEarlyBirdCheckout({
                email, country, priceUSD: finalPriceUSD, regularPriceUSD, successUrl, cancelUrl,
                discount
            });
        }

        // Incluir info de descuento en la respuesta para el frontend
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
        console.error('[EarlyBirdCheckout] Error checkout:', error);
        res.status(500).json({ success: false, error: 'Error al crear checkout' });
    }
});

/**
 * POST /api/early-bird/capture-paypal
 * Captura un pago PayPal después de que el lead aprueba la orden.
 * Body: { orderId: string, email: string }
 */
router.post('/capture-paypal', async (req, res) => {
    try {
        const { orderId, email } = req.body;

        if (!orderId) {
            return res.status(400).json({ success: false, error: 'orderId requerido' });
        }

        const capture = await PayPalService.captureOrder(orderId);

        if (!capture.success) {
            console.error('[EarlyBirdCheckout] Error capturando PayPal:', capture);
            return res.status(400).json({ success: false, error: 'Error al capturar pago' });
        }

        // Obtener precio para auditoría
        const config = await GlobalConfig.findOne({ isDefault: true });
        const earlyBird = config?.memberships?.earlyBirdOffer;
        const priceUSD = earlyBird?.welcomeKitPriceUSD || 2900;
        const regularPriceUSD = earlyBird?.welcomeKitRegularPriceUSD || 4400;

        // Verificar si hay descuento aplicable
        const discount = await DiscountService.getApplicableDiscount({
            email,
            purchaseType: 'early_bird_kit',
            amountCents: priceUSD
        });

        const finalPriceUSD = discount ? discount.finalAmountCents : priceUSD;

        // Registrar pago en BD
        const payment = await Payment.create({
            type: 'early_bird_kit',
            provider: 'paypal',
            externalPaymentId: capture.captureId || orderId,
            amount: finalPriceUSD,
            currency: 'USD',
            status: 'approved',
            leadEmail: email || '',
            signatureValid: true,
            apiVerified: true,
            // Campos de descuento
            originalAmount: discount ? priceUSD : null,
            discountCode: discount?.couponCode || null,
            discountPercent: discount?.discountPercent || 0,
            couponId: discount?.couponId || null,
            webhookData: {
                source: 'waitlist_early_bird',
                orderId,
                captureId: capture.captureId
            },
            metadata: {
                source: 'waitlist_early_bird',
                regularPrice: regularPriceUSD,
                discountApplied: regularPriceUSD - priceUSD
            }
        });

        // Registrar uso del cupón si se aplicó descuento
        if (discount) {
            await DiscountService.recordUsage(
                discount.couponId, payment._id, 'early_bird_kit', priceUSD, finalPriceUSD
            );
        }

        console.log(`[EarlyBirdCheckout] ✅ Pago PayPal capturado para ${email}: ${orderId}${discount ? ` (descuento ${discount.discountPercent}%)` : ''}`);

        res.json({
            success: true,
            message: '¡Compra exitosa! Revisa tu email para los próximos pasos.',
            captureId: capture.captureId
        });
    } catch (error) {
        console.error('[EarlyBirdCheckout] Error capture-paypal:', error);
        res.status(500).json({ success: false, error: 'Error al procesar pago' });
    }
});

// ===================== FUNCIONES PRIVADAS =====================

/**
 * Crea preferencia de MercadoPago para el kit early bird.
 * Convierte USD a moneda local.
 */
async function _createMpEarlyBirdCheckout({ email, country, priceUSD, regularPriceUSD, resolved, successUrl, cancelUrl }) {
    const currency = resolved.currency || 'CLP';
    const rate = USD_RATES[currency] || 950;
    const localPrice = Math.round((priceUSD / 100) * rate);

    const externalRef = `early_bird_${email.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;

    const items = [{
        title: 'Welcome Kit PianoLink — Oferta Madrugadores',
        description: 'Kit de bienvenida con descuento exclusivo',
        quantity: 1,
        currency_id: currency,
        unit_price: localPrice
    }];

    const metadata = {
        type: 'early_bird_kit',
        leadEmail: email,
        priceUSD,
        regularPriceUSD,
        discountApplied: regularPriceUSD - priceUSD,
        source: 'waitlist_early_bird'
    };

    const options = {
        back_urls: {
            success: successUrl,
            failure: cancelUrl,
            pending: `${successUrl}&status=pending`
        },
        external_reference: externalRef,
        auto_return: 'approved',
        notification_url: process.env.MP_WEBHOOK_URL_EARLY_BIRD 
            || `${process.env.APP_URL || process.env.FRONTEND_URL || process.env.BASE_URL || 'https://pianolink.net'}/api/webhooks/mercadopago-early-bird`
    };

    const result = await MpCountryRouter.createPreference(country, items, metadata, options);

    return {
        success: true,
        provider: 'mercadopago',
        checkoutUrl: result.initPoint || result.sandboxInitPoint,
        preferenceId: result.preferenceId,
        currency,
        localPrice,
        priceUSD: priceUSD / 100
    };
}

/**
 * Crea orden PayPal para el kit early bird (USD directo).
 */
async function _createPayPalEarlyBirdCheckout({ email, country, priceUSD, regularPriceUSD, successUrl, cancelUrl }) {
    const externalRef = `early_bird_${email.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;

    const order = await PayPalService.createOrder({
        amount: priceUSD,
        description: 'Welcome Kit PianoLink — Oferta Madrugadores',
        externalReference: externalRef,
        returnUrl: successUrl,
        cancelUrl: cancelUrl,
        metadata: {
            type: 'early_bird_kit',
            leadEmail: email,
            countryCode: country,
            regularPrice: regularPriceUSD,
            discountApplied: regularPriceUSD - priceUSD
        }
    });

    return {
        success: true,
        provider: 'paypal',
        checkoutUrl: order.approveUrl,
        orderId: order.orderId,
        currency: 'USD',
        priceUSD: priceUSD / 100
    };
}

/**
 * POST /api/early-bird/verify
 * Verifica el pago Early Bird y devuelve datos del usuario + magic link.
 * Llamado por success-waitlist.html cuando payment=success.
 */
router.post('/verify', async (req, res) => {
    try {
        const { email, paymentId, externalReference } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email requerido' });
        }

        const cleanEmail = email.toLowerCase().trim();
        console.log(`[EarlyBird Verify] Verificando pago para: ${cleanEmail}`);

        // Buscar pago registrado por el webhook
        const existingPayment = await Payment.findOne({
            leadEmail: cleanEmail,
            'metadata.source': 'waitlist_early_bird',
            status: 'approved'
        }).sort({ createdAt: -1 });

        if (!existingPayment) {
            // El webhook puede no haber llegado aún — responder con pending
            return res.json({
                success: true,
                status: 'pending',
                message: 'Pago en proceso de verificación. Recibirás un email de confirmación.'
            });
        }

        // Buscar usuario creado por el webhook
        const User = require('../models/User');
        const user = await User.findOne({ email: cleanEmail });

        if (!user) {
            // Webhook registró el pago pero aún no creó el usuario (race condition)
            // Crear ahora
            const crypto = require('crypto');
            const Lead = require('../models/Lead');
            const { generateWelcomeKitEmail } = require('../templates/welcomeKitEmail');
            const EmailService = require('../services/EmailService');

            const lead = await Lead.findOne({ email: cleanEmail }).lean();
            const userName = lead?.name || cleanEmail.split('@')[0];

            const magicLinkToken = crypto.randomBytes(32).toString('hex');
            const magicLinkExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            const tempPassword = crypto.randomBytes(16).toString('hex');

            const newUser = await User.create({
                name: userName,
                email: cleanEmail,
                password: tempPassword,
                whatsapp: lead?.whatsapp || '',
                country: existingPayment.metadata?.countryCode || 'CL',
                role: 'student',
                classesRemaining: 1,
                classesCompleted: 0,
                studentData: { source: 'platform', level: 'beginner' },
                kitPurchased: true,
                kitPurchaseDate: new Date(),
                magicLinkToken,
                magicLinkExpires,
                mustChangePassword: true
            });

            const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://pianolink.net';
            const magicLinkUrl = `${frontendUrl}/acceso/${magicLinkToken}`;

            // Enviar email
            try {
                const emailHtml = generateWelcomeKitEmail({
                    clientName: userName,
                    clientEmail: cleanEmail,
                    magicLinkUrl,
                    students: [],
                    kitType: 'welcome_kit_v2',
                    totalPaid: existingPayment.amount / 100,
                    currency: 'USD',
                    orderId: existingPayment.externalPaymentId
                });

                await EmailService.sendSafe({
                    to: cleanEmail,
                    subject: '🎹 ¡Bienvenido a PianoLink! Activa tu cuenta',
                    html: emailHtml
                });
            } catch (emailErr) {
                console.error('[EarlyBird Verify] Error email:', emailErr.message);
            }

            return res.json({
                success: true,
                status: 'verified',
                user: { email: newUser.email, name: newUser.name },
                magicLinkUrl,
                message: 'Cuenta creada. Revisa tu email para activarla.'
            });
        }

        // Usuario ya existe — devolver datos
        const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://pianolink.net';
        const magicLinkUrl = user.magicLinkToken && user.magicLinkExpires > new Date()
            ? `${frontendUrl}/acceso/${user.magicLinkToken}`
            : null;

        return res.json({
            success: true,
            status: 'verified',
            user: { email: user.email, name: user.name },
            magicLinkUrl,
            message: magicLinkUrl
                ? 'Revisa tu email para activar tu cuenta.'
                : 'Ya tienes cuenta activa.'
        });

    } catch (error) {
        console.error('[EarlyBird Verify] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
