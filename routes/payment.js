/**
 * routes/payment.js
 * Rutas para generar links de pago de PayPal y Stripe
 */

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const User = require('../models/User');
const GlobalConfig = require('../models/GlobalConfig');
const { protect } = require('../middleware/authMiddleware');
const StripeService = require('../services/StripeService');

// Obtener access token de PayPal
async function getPayPalAccessToken() {
    const auth = Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
    ).toString('base64');

    const baseUrl = process.env.PAYPAL_MODE === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';

    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });

    const data = await response.json();
    return data.access_token;
}

// ============================================
// 1. KIT DE BIENVENIDA (Pago único)
// ============================================
router.post('/create-kit-payment', async (req, res) => {
    try {
        const { email, name } = req.body;

        if (!email || !name) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email y nombre son requeridos' 
            });
        }

        const accessToken = await getPayPalAccessToken();
        const baseUrl = process.env.PAYPAL_MODE === 'live'
            ? 'https://api-m.paypal.com'
            : 'https://api-m.sandbox.paypal.com';

        // Crear orden de pago único
        const orderData = {
            intent: 'CAPTURE',
            purchase_units: [{
                reference_id: `kit_${Date.now()}`,
                description: 'Kit de Bienvenida PianoLink - Cable MIDI + Setup + Clase prueba',
                custom_id: email, // Para identificar al usuario
                amount: {
                    currency_code: 'USD',
                    value: '15.00',
                    breakdown: {
                        item_total: {
                            currency_code: 'USD',
                            value: '15.00'
                        }
                    }
                },
                items: [{
                    name: 'Kit de Bienvenida PianoLink',
                    description: 'Cable MIDI + Sesión setup + Clase prueba 30min',
                    unit_amount: {
                        currency_code: 'USD',
                        value: '15.00'
                    },
                    quantity: '1',
                    category: 'DIGITAL_GOODS'
                }]
            }],
            application_context: {
                brand_name: 'PianoLink',
                locale: 'es-AR',
                user_action: 'PAY_NOW',
                return_url: `${process.env.FRONTEND_URL}/welcome-kit/success?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`,
                cancel_url: `${process.env.FRONTEND_URL}/kit-bienvenida`
            }
        };

        const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderData)
        });

        const order = await response.json();

        if (order.id) {
            const approveLink = order.links?.find(link => link.rel === 'approve')?.href;
            res.json({
                success: true,
                orderId: order.id,
                approveLink: approveLink
            });
        } else {
            console.error('[PayPal] Error creando orden:', order);
            res.status(500).json({ 
                success: false, 
                error: 'Error creando orden de pago' 
            });
        }
    } catch (error) {
        console.error('[PayPal] Error en create-kit-payment:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============================================
// 1c. KIT DE BIENVENIDA CON MERCADOPAGO
// ============================================
router.post('/create-kit-payment-mercadopago', async (req, res) => {
    try {
        const { email, name, country, kitType, cableType, totalUSD, childrenCount } = req.body;

        console.log('[MercadoPago Kit] ========================================');
        console.log('[MercadoPago Kit] Datos recibidos:', JSON.stringify(req.body));
        console.log('[MercadoPago Kit] ========================================');

        if (!email || !name) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email y nombre son requeridos' 
            });
        }

        const accessToken = process.env.MP_ACCESS_TOKEN;
        if (!accessToken) {
            return res.status(500).json({ 
                success: false, 
                error: 'MercadoPago no está configurado' 
            });
        }

        // Leer precio desde admin (GlobalConfig)
        const config = await GlobalConfig.findOne({ isDefault: true });
        const countryCode = (country || 'CL').toUpperCase();
        const includesCable = kitType === 'full';
        
        // Detectar si es el nuevo Kit V2
        const isV2 = kitType === 'welcome_kit_v2' || totalUSD;
        
        let servicePrice, cablePrice, currency;
        
        if (isV2) {
            // Kit V2: usar totalUSD del frontend si viene (ya incluye hijos extra)
            // Si no, calcularlo desde config
            if (totalUSD && typeof totalUSD === 'number') {
                servicePrice = totalUSD;
                console.log('[MercadoPago Kit] Usando totalUSD del frontend:', totalUSD);
            } else {
                const basePrice = config?.welcomeKitV2?.priceUSD || 44;
                const extraChildPrice = config?.welcomeKitV2?.extraChildPriceUSD || 15;
                const extraChildren = Math.max(0, (childrenCount || 1) - 1);
                servicePrice = basePrice + (extraChildren * extraChildPrice);
                console.log('[MercadoPago Kit] Calculando precio:', basePrice, '+', extraChildren, 'x', extraChildPrice, '=', servicePrice);
            }
            cablePrice = 0;
            currency = 'USD';
        } else {
            // Kit legacy: usar config
            const setupPricing = config?.regionalPricing?.setupOnly?.find(p => p.regionCode === countryCode) ||
                                config?.regionalPricing?.setupOnly?.find(p => p.regionCode === 'DEFAULT');
            
            servicePrice = setupPricing?.price || 10;
            currency = setupPricing?.currency || 'USD';
            
            // Precio del cable (desde config o default)
            const cablePricing = config?.regionalPricing?.welcomeKit?.find(p => p.regionCode === countryCode) ||
                                config?.regionalPricing?.welcomeKit?.find(p => p.regionCode === 'DEFAULT');
            cablePrice = includesCable ? (cablePricing?.cablePrice || 4) : 0;
        }
        
        // MercadoPago Chile SOLO acepta CLP
        // Si el precio está en USD, convertir a CLP
        if (countryCode === 'CL' && currency === 'USD') {
            const USD_TO_CLP = 950; // Tipo de cambio aproximado
            servicePrice = Math.round(servicePrice * USD_TO_CLP);
            cablePrice = Math.round(cablePrice * USD_TO_CLP);
            currency = 'CLP';
        }
        
        const totalPrice = servicePrice + cablePrice;
        
        // Nombre y descripción del producto (isV2 ya está definido arriba)
        let productName, productDescription;
        
        if (isV2) {
            productName = 'Kit de Bienvenida PianoLink';
            productDescription = '✓ Asesoría técnica personalizada (~20 min) - Te orientamos sobre cable MIDI y accesorios | ✓ Sesión de Setup Técnico (~20 min) - Configuración de conexión MIDI, audio y software | ✓ Clase de Prueba con Profesor (30 min) - Tu primera clase real con tecnología MIDI';
        } else {
            productName = includesCable 
                ? 'Kit Completo PianoLink - Día 88'
                : 'Setup + Clase de Prueba PianoLink';
            productDescription = includesCable
                ? 'Cable MIDI Premium + Setup Técnico Guiado + Clase de Prueba + Acceso Plataforma'
                : 'Setup Técnico Guiado + Clase de Prueba + Acceso Plataforma';
        }

        console.log('[MercadoPago Kit] kitType:', kitType);
        console.log('[MercadoPago Kit] includesCable:', includesCable);
        console.log('[MercadoPago Kit] Precio servicio:', servicePrice, currency);
        console.log('[MercadoPago Kit] Precio cable:', cablePrice, currency);
        console.log('[MercadoPago Kit] TOTAL:', totalPrice, currency);

        // Mapeo de monedas para MercadoPago
        const mpCurrency = currency === 'CLP' ? 'CLP' : 
                          currency === 'ARS' ? 'ARS' : 
                          currency === 'MXN' ? 'MXN' : 'CLP';

        // Separar nombre y apellido para MercadoPago
        const nameParts = name.trim().split(/\s+/);
        const firstName = nameParts[0] || name;
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : name;
        const externalRef = `kit_${Date.now()}_${email}`;
        const baseUrl = process.env.FRONTEND_URL || 'https://pianolink-v4.fly.dev';

        // Crear preferencia de pago con todos los campos requeridos por MP
        const preference = {
            items: [{
                id: includesCable ? 'KIT-FULL-DIA88' : 'SETUP-CLASE-PRUEBA',
                title: productName,
                description: productDescription,
                category_id: 'services',
                quantity: 1,
                currency_id: mpCurrency,
                unit_price: totalPrice
            }],
            payer: {
                email: email,
                first_name: firstName,
                last_name: lastName
            },
            back_urls: {
                success: `${baseUrl}/welcome-kit/success?provider=mercadopago&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`,
                failure: `${baseUrl}/welcome-kit?error=payment_failed`,
                pending: `${baseUrl}/welcome-kit/success?status=pending&email=${encodeURIComponent(email)}`
            },
            auto_return: 'approved',
            external_reference: externalRef,
            notification_url: `${baseUrl}/api/webhooks/mercadopago`,
            statement_descriptor: 'PIANOLINK',
            metadata: {
                type: 'kit_purchase',
                customerName: name,
                customerEmail: email,
                country: country || 'CL',
                kitType: includesCable ? 'full' : 'setup_only',
                cableType: cableType || 'NONE'
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
            console.log('[MercadoPago Kit] Preferencia creada:', data.id);
            console.log('[MercadoPago Kit] URL Producción:', data.init_point);
            console.log('[MercadoPago Kit] URL Sandbox:', data.sandbox_init_point);
            
            res.json({
                success: true,
                preferenceId: data.id,
                checkoutUrl: data.init_point, // Producción
                sandboxUrl: data.sandbox_init_point // Test
            });
        } else {
            console.error('[MercadoPago Kit] Error:', data);
            res.status(500).json({ 
                success: false, 
                error: data.message || 'Error creando preferencia' 
            });
        }

    } catch (error) {
        console.error('[MercadoPago] Error en create-kit-payment:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============================================
// 1b. KIT DE BIENVENIDA CON STRIPE
// ============================================
router.post('/create-kit-payment-stripe', async (req, res) => {
    try {
        const { email, name, country, kitType, cableType, studentCount = 1, studentNames = [] } = req.body;
        
        // Precio por estudiante adicional
        const EXTRA_STUDENT_PRICE = 15;

        console.log('[Stripe Kit] ========================================');
        console.log('[Stripe Kit] Datos recibidos:', JSON.stringify(req.body));
        console.log('[Stripe Kit] Estudiantes:', studentCount, studentNames);
        console.log('[Stripe Kit] ========================================');

        if (!email || !name) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email y nombre son requeridos' 
            });
        }

        // Leer precio del Kit V2 desde GlobalConfig
        const config = await GlobalConfig.findOne({ isDefault: true });
        
        // Detectar si es el nuevo Kit V2
        const isV2 = kitType === 'welcome_kit_v2' || req.body.totalUSD;
        
        // Determinar si incluye cable (legacy)
        const includesCable = kitType === 'full';
        const countryCode = (country || 'US').toUpperCase();
        
        let totalPrice, setupPrice, cablePrice, extraStudentsPrice = 0;
        
        // Calcular precio por estudiantes adicionales
        const numStudents = parseInt(studentCount) || 1;
        if (numStudents > 1) {
            extraStudentsPrice = (numStudents - 1) * EXTRA_STUDENT_PRICE;
        }
        
        if (isV2) {
            // Kit V2: leer precio desde config o usar default $44 USD
            totalPrice = config?.welcomeKitV2?.priceUSD || 44;
            setupPrice = totalPrice;
            cablePrice = 0;
        } else {
            // Legacy pricing
            setupPrice = 35;
            cablePrice = includesCable ? 4 : 0;
            totalPrice = setupPrice + cablePrice;
        }
        
        // Sumar estudiantes adicionales
        totalPrice += extraStudentsPrice;
        
        const currency = 'usd';
        const priceInCents = Math.round(totalPrice * 100);
        
        console.log('[Stripe Kit] kitType:', kitType);
        console.log('[Stripe Kit] isV2:', isV2);
        console.log('[Stripe Kit] Precio servicio: $' + setupPrice);
        console.log('[Stripe Kit] Precio cable: $' + cablePrice);
        console.log('[Stripe Kit] Estudiantes adicionales: $' + extraStudentsPrice);
        console.log('[Stripe Kit] TOTAL: $' + totalPrice);
        
        let productName, productDescription;
        
        if (isV2) {
            productName = 'Kit de Bienvenida PianoLink';
            productDescription = numStudents > 1 
                ? `✓ ${numStudents} estudiantes | ✓ Asesoría técnica | ✓ Setup Técnico | ✓ Clase de Prueba para cada uno`
                : '✓ Asesoría técnica personalizada (~20 min) | ✓ Sesión de Setup Técnico (~20 min) | ✓ Clase de Prueba con Profesor (30 min)';
        } else {
            productName = numStudents > 1
                ? `Kit Completo PianoLink - ${numStudents} estudiantes`
                : (includesCable ? 'Kit Completo PianoLink - Día 88' : 'Setup + Clase de Prueba PianoLink');
            productDescription = numStudents > 1
                ? `Cable MIDI + Setup Técnico + ${numStudents} clases de prueba`
                : (includesCable
                    ? 'Cable MIDI Premium + Setup Técnico Guiado + Clase de Prueba + Acceso Plataforma'
                    : 'Setup Técnico Guiado + Clase de Prueba + Acceso Plataforma');
        }

        const { getStripeClient } = require('../config/stripe');
        const stripe = getStripeClient();
        
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            customer_email: email,
            line_items: [{
                price_data: {
                    currency: currency,
                    product_data: {
                        name: productName,
                        description: productDescription,
                        images: ['https://pianolink-v4.fly.dev/img/kit-bienvenida.png']
                    },
                    unit_amount: priceInCents,
                },
                quantity: 1,
            }],
            metadata: {
                type: 'kit_purchase',
                customerName: name,
                customerEmail: email,
                country: countryCode,
                kitType: includesCable ? 'full' : 'setup_only',
                cableType: cableType || 'NONE',
                setupPrice: setupPrice.toString(),
                cablePrice: cablePrice.toString(),
                extraStudentsPrice: extraStudentsPrice.toString(),
                studentCount: numStudents.toString(),
                studentNames: JSON.stringify(studentNames || []),
                totalPrice: totalPrice.toString(),
                currency: 'USD'
            },
            success_url: `${process.env.FRONTEND_URL || 'https://pianolink-v4.fly.dev'}/welcome-kit/success?session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`,
            cancel_url: `${process.env.FRONTEND_URL || 'https://pianolink-v4.fly.dev'}/welcome-kit`
        });

        console.log('[Stripe Kit] Sesión creada:', session.id, '- URL:', session.url);

        res.json({
            success: true,
            sessionId: session.id,
            checkoutUrl: session.url
        });

    } catch (error) {
        console.error('[Stripe] Error en create-kit-payment:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Verificar pago del kit con Stripe
router.post('/verify-kit-payment-stripe', async (req, res) => {
    try {
        const { sessionId } = req.body;

        if (!sessionId) {
            return res.status(400).json({ 
                success: false, 
                error: 'sessionId es requerido' 
            });
        }

        const stripe = StripeService.stripe;
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status === 'paid') {
            const email = session.customer_email || session.metadata.customerEmail;
            const name = session.metadata.customerName;

            // Verificar si el usuario ya existe
            let user = await User.findOne({ email });

            if (!user) {
                // Crear nuevo usuario
                const [firstName, ...lastNameParts] = name.split(' ');
                const lastName = lastNameParts.join(' ') || firstName;

                user = await User.create({
                    name: firstName,
                    lastName: lastName,
                    email: email,
                    password: Math.random().toString(36).slice(-8), // Password temporal
                    role: 'student',
                    kitPurchased: true,
                    kitPurchaseDate: new Date(),
                    stripeSessionId: sessionId
                });

                console.log(`[Kit-Stripe] Usuario creado: ${user.email}`);
            } else {
                // Usuario ya existe, actualizar flag de kit
                user.kitPurchased = true;
                user.kitPurchaseDate = new Date();
                user.stripeSessionId = sessionId;
                await user.save();
                console.log(`[Kit-Stripe] Usuario actualizado: ${user.email}`);
            }

            res.json({
                success: true,
                user: {
                    id: user._id,
                    email: user.email,
                    name: `${user.name} ${user.lastName || ''}`.trim(),
                    kitPurchased: true
                }
            });
        } else {
            res.status(400).json({ 
                success: false, 
                error: 'Pago no completado',
                status: session.payment_status
            });
        }
    } catch (error) {
        console.error('[Stripe] Error en verify-kit-payment:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Verificar pago del kit y crear usuario
router.post('/verify-kit-payment', async (req, res) => {
    try {
        const { orderId, email, name } = req.body;

        if (!orderId || !email || !name) {
            return res.status(400).json({ 
                success: false, 
                error: 'Datos incompletos' 
            });
        }

        const accessToken = await getPayPalAccessToken();
        const baseUrl = process.env.PAYPAL_MODE === 'live'
            ? 'https://api-m.paypal.com'
            : 'https://api-m.sandbox.paypal.com';

        // Verificar la orden en PayPal
        const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const order = await response.json();

        if (order.status === 'COMPLETED') {
            // Verificar si el usuario ya existe
            let user = await User.findOne({ email });

            if (!user) {
                // Crear nuevo usuario
                const [firstName, ...lastNameParts] = name.split(' ');
                const lastName = lastNameParts.join(' ') || firstName;

                user = await User.create({
                    name: firstName,
                    lastName: lastName,
                    email: email,
                    password: Math.random().toString(36).slice(-8), // Password temporal
                    role: 'student',
                    kitPurchased: true,
                    kitPurchaseDate: new Date(),
                    paypalOrderId: orderId
                });

                // TODO: Enviar email con instrucciones y password temporal
                console.log(`[Kit] Usuario creado: ${user.email}`);
            } else {
                // Usuario ya existe, actualizar flag de kit
                user.kitPurchased = true;
                user.kitPurchaseDate = new Date();
                user.paypalOrderId = orderId;
                await user.save();
            }

            res.json({
                success: true,
                user: {
                    id: user._id,
                    email: user.email,
                    name: `${user.name} ${user.lastName}`,
                    kitPurchased: true
                }
            });
        } else {
            res.status(400).json({ 
                success: false, 
                error: 'Pago no completado' 
            });
        }
    } catch (error) {
        console.error('[PayPal] Error en verify-kit-payment:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============================================
// 2. MEMBRESÍA PROFESOR FUNDADOR
// ============================================
router.post('/create-teacher-subscription', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        if (!user || user.role !== 'teacher') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo profesores pueden acceder' 
            });
        }

        // Verificar si es profesor fundador
        if (!user.isFounder) {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo profesores fundadores pueden acceder a esta membresía' 
            });
        }

        const accessToken = await getPayPalAccessToken();
        const baseUrl = process.env.PAYPAL_MODE === 'live'
            ? 'https://api-m.paypal.com'
            : 'https://api-m.sandbox.paypal.com';

        const subscriptionData = {
            plan_id: process.env.PAYPAL_PLAN_TEACHER,
            subscriber: {
                email_address: user.email,
                name: {
                    given_name: user.name,
                    surname: user.lastName
                }
            },
            application_context: {
                brand_name: 'PianoLink',
                locale: 'es-AR',
                shipping_preference: 'NO_SHIPPING',
                user_action: 'SUBSCRIBE_NOW',
                return_url: `${process.env.FRONTEND_URL}/teacher-dashboard?subscription=success`,
                cancel_url: `${process.env.FRONTEND_URL}/teacher-dashboard?subscription=cancelled`
            },
            custom_id: `teacher_${userId}`
        };

        const response = await fetch(`${baseUrl}/v1/billing/subscriptions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(subscriptionData)
        });

        const subscription = await response.json();

        if (subscription.id) {
            const approveLink = subscription.links?.find(link => link.rel === 'approve')?.href;
            res.json({
                success: true,
                subscriptionId: subscription.id,
                approveLink: approveLink
            });
        } else {
            console.error('[PayPal] Error creando suscripción profesor:', subscription);
            res.status(500).json({ 
                success: false, 
                error: 'Error creando suscripción' 
            });
        }
    } catch (error) {
        console.error('[PayPal] Error en create-teacher-subscription:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============================================
// 3. MEMBRESÍA CLASES DE PIANO (Alumno)
// ============================================
router.post('/create-student-subscription', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        if (!user || user.role !== 'student') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo alumnos pueden acceder' 
            });
        }

        const accessToken = await getPayPalAccessToken();
        const baseUrl = process.env.PAYPAL_MODE === 'live'
            ? 'https://api-m.paypal.com'
            : 'https://api-m.sandbox.paypal.com';

        const subscriptionData = {
            plan_id: process.env.PAYPAL_PLAN_STUDENT,
            subscriber: {
                email_address: user.email,
                name: {
                    given_name: user.name,
                    surname: user.lastName
                }
            },
            application_context: {
                brand_name: 'PianoLink',
                locale: 'es-AR',
                shipping_preference: 'NO_SHIPPING',
                user_action: 'SUBSCRIBE_NOW',
                return_url: `${process.env.FRONTEND_URL}/student-dashboard?subscription=success`,
                cancel_url: `${process.env.FRONTEND_URL}/student-dashboard?subscription=cancelled`
            },
            custom_id: `student_${userId}`
        };

        const response = await fetch(`${baseUrl}/v1/billing/subscriptions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(subscriptionData)
        });

        const subscription = await response.json();

        if (subscription.id) {
            const approveLink = subscription.links?.find(link => link.rel === 'approve')?.href;
            res.json({
                success: true,
                subscriptionId: subscription.id,
                approveLink: approveLink
            });
        } else {
            console.error('[PayPal] Error creando suscripción alumno:', subscription);
            res.status(500).json({ 
                success: false, 
                error: 'Error creando suscripción' 
            });
        }
    } catch (error) {
        console.error('[PayPal] Error en create-student-subscription:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============================================
// 4. SUSCRIPCIÓN PROFESOR CON STRIPE
// ============================================

/**
 * POST /api/payment/stripe/teacher-subscription
 * Crear checkout de suscripción para profesor con Stripe
 */
router.post('/stripe/teacher-subscription', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        if (!user || user.role !== 'teacher') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo profesores pueden acceder' 
            });
        }

        // Verificar que Stripe esté configurado
        if (!StripeService.isConfigured()) {
            return res.status(503).json({
                success: false,
                error: 'Stripe no está configurado'
            });
        }

        const result = await StripeService.createTeacherSubscriptionCheckout({
            teacherId: userId.toString(),
            isFounder: user.isFoundingMember || false,
            successUrl: req.body.successUrl,
            cancelUrl: req.body.cancelUrl
        });

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }

        res.json({
            success: true,
            sessionId: result.sessionId,
            checkoutUrl: result.url,
            expiresAt: result.expiresAt
        });

    } catch (error) {
        console.error('[Stripe] Error en teacher-subscription:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============================================
// MEMBRESÍA PROFESOR CON MERCADOPAGO
// ============================================
/**
 * POST /api/payment/mercadopago/teacher-subscription
 * Crear checkout de membresía para profesor con MercadoPago
 */
router.post('/mercadopago/teacher-subscription', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        if (!user || user.role !== 'teacher') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo profesores pueden acceder' 
            });
        }

        // Verificar MercadoPago configurado
        const accessToken = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
        if (!accessToken) {
            return res.status(503).json({
                success: false,
                error: 'MercadoPago no está configurado'
            });
        }

        // Obtener configuración de precios
        const config = await GlobalConfig.findOne();
        const isFounder = user.isFoundingMember || false;
        
        // Precio en USD
        const priceUSD = isFounder 
            ? (config?.teacherSubscription?.founder || 10)
            : (config?.teacherSubscription?.regular || 20);
        
        // Convertir a CLP (MercadoPago Chile solo acepta CLP)
        const usdToClp = config?.exchangeRates?.usdToClp || 950;
        const priceCLP = Math.round(priceUSD * usdToClp);

        const baseUrl = process.env.FRONTEND_URL || 'https://pianolink-v4.fly.dev';
        const externalRef = `teacher_sub_${userId}_${Date.now()}`;

        // Crear preferencia de pago
        const preference = {
            items: [{
                id: isFounder ? 'TEACHER-FOUNDER-MONTHLY' : 'TEACHER-REGULAR-MONTHLY',
                title: isFounder 
                    ? 'Membresía Profesor Fundador - PianoLink' 
                    : 'Membresía Profesor - PianoLink',
                description: 'Membresía mensual para profesores de PianoLink. Acceso completo a la plataforma.',
                category_id: 'services',
                quantity: 1,
                currency_id: 'CLP',
                unit_price: priceCLP
            }],
            payer: {
                email: user.email,
                first_name: user.name?.split(' ')[0] || user.name,
                last_name: user.name?.split(' ').slice(1).join(' ') || ''
            },
            back_urls: {
                success: `${baseUrl}/dashboard?subscription=success&provider=mercadopago`,
                failure: `${baseUrl}/dashboard?subscription=failed`,
                pending: `${baseUrl}/dashboard?subscription=pending`
            },
            auto_return: 'approved',
            external_reference: externalRef,
            notification_url: `${baseUrl}/api/webhooks/mercadopago-teacher-subscription`,
            statement_descriptor: 'PIANOLINK',
            metadata: {
                type: 'teacher_subscription',
                teacherId: userId.toString(),
                isFounder: isFounder,
                priceUSD: priceUSD,
                priceCLP: priceCLP
            }
        };

        console.log('[MercadoPago Teacher Sub] Creando preferencia para:', user.email);
        console.log('[MercadoPago Teacher Sub] Precio:', priceCLP, 'CLP (~', priceUSD, 'USD)');

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
            console.log('[MercadoPago Teacher Sub] Preferencia creada:', data.id);
            
            res.json({
                success: true,
                preferenceId: data.id,
                checkoutUrl: data.init_point,
                sandboxUrl: data.sandbox_init_point,
                price: {
                    usd: priceUSD,
                    clp: priceCLP
                }
            });
        } else {
            console.error('[MercadoPago Teacher Sub] Error:', data);
            res.status(500).json({ 
                success: false, 
                error: data.message || 'Error creando preferencia' 
            });
        }

    } catch (error) {
        console.error('[MercadoPago] Error en teacher-subscription:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * POST /api/payment/stripe/cancel-subscription
 * Cancelar suscripción de profesor
 */
router.post('/stripe/cancel-subscription', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        if (!user || user.role !== 'teacher') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo profesores pueden acceder' 
            });
        }

        const immediately = req.body.immediately || false;
        const result = await StripeService.cancelTeacherSubscription(userId.toString(), immediately);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }

        res.json({
            success: true,
            cancelAtPeriodEnd: result.cancelAtPeriodEnd,
            currentPeriodEnd: result.currentPeriodEnd
        });

    } catch (error) {
        console.error('[Stripe] Error cancelando suscripción:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * GET /api/payment/stripe/customer-portal
 * Obtener URL del portal de facturación de Stripe
 */
router.get('/stripe/customer-portal', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        if (!user || user.role !== 'teacher') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo profesores pueden acceder' 
            });
        }

        const result = await StripeService.getCustomerPortal(userId.toString());

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }

        res.json({
            success: true,
            portalUrl: result.url
        });

    } catch (error) {
        console.error('[Stripe] Error obteniendo portal:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * GET /api/payment/stripe/subscription-status
 * Obtener estado de suscripción del profesor
 */
router.get('/stripe/subscription-status', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId).select('teacherData role isFoundingMember');

        if (!user || user.role !== 'teacher') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo profesores pueden acceder' 
            });
        }

        res.json({
            success: true,
            subscription: {
                status: user.teacherData?.subscriptionStatus || 'trial',
                expiresAt: user.teacherData?.subscriptionExpiresAt,
                isFounder: user.isFoundingMember || false,
                hasStripeSubscription: !!user.teacherData?.stripeSubscriptionId,
                stripeCustomerId: user.teacherData?.stripeCustomerId || null
            }
        });

    } catch (error) {
        console.error('[Stripe] Error obteniendo estado:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * POST /api/payment/stripe/sync-by-email
 * Buscar y activar suscripciones existentes por email
 * Útil cuando el usuario recreó su cuenta pero ya había pagado
 */
router.post('/stripe/sync-by-email', protect, async (req, res) => {
    console.log('[Stripe] 🔄 Solicitud de sincronización por email');
    
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        if (!user || user.role !== 'teacher') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo profesores pueden acceder' 
            });
        }

        if (!StripeService.isConfigured()) {
            return res.status(503).json({
                success: false,
                error: 'Stripe no está configurado'
            });
        }

        const { stripe } = require('../config/stripe');
        
        // Buscar customers con este email
        const customers = await stripe.customers.list({
            email: user.email,
            limit: 5
        });
        
        console.log('[Stripe] 📧 Buscando customers con email:', user.email);
        console.log('[Stripe] 👥 Customers encontrados:', customers.data.length);
        
        if (customers.data.length === 0) {
            return res.json({
                success: false,
                error: 'No se encontraron suscripciones asociadas a tu email'
            });
        }
        
        // Buscar suscripciones activas
        for (const customer of customers.data) {
            const subscriptions = await stripe.subscriptions.list({
                customer: customer.id,
                status: 'active',
                limit: 1
            });
            
            if (subscriptions.data.length > 0) {
                const subscription = subscriptions.data[0];
                console.log('[Stripe] ✅ Suscripción activa encontrada:', subscription.id);
                
                // Activar la membresía
                await User.findByIdAndUpdate(userId, {
                    'teacherData.stripeCustomerId': customer.id,
                    'teacherData.stripeSubscriptionId': subscription.id,
                    'teacherData.stripePriceId': subscription.items?.data[0]?.price?.id,
                    'teacherData.subscriptionStatus': 'active',
                    'teacherData.subscriptionExpiresAt': new Date(subscription.current_period_end * 1000)
                });
                
                console.log(`[Stripe] ✅ Membresía sincronizada para: ${user.email}`);
                
                return res.json({
                    success: true,
                    message: '¡Membresía sincronizada exitosamente!',
                    subscription: {
                        status: subscription.status,
                        expiresAt: new Date(subscription.current_period_end * 1000)
                    }
                });
            }
        }
        
        return res.json({
            success: false,
            error: 'No se encontraron suscripciones activas para tu email'
        });

    } catch (error) {
        console.error('[Stripe] Error sincronizando por email:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * POST /api/payment/stripe/activate-from-session
 * Activar membresía usando session_id de Stripe Checkout
 * (Funciona aunque el webhook no esté configurado)
 */
router.post('/stripe/activate-from-session', protect, async (req, res) => {
    console.log('[Stripe] 🎯 Solicitud de activación desde session_id recibida');
    console.log('[Stripe] 👤 Usuario:', req.user?.email);
    console.log('[Stripe] 📦 Body:', JSON.stringify(req.body));
    
    try {
        const userId = req.user._id;
        const { sessionId } = req.body;

        if (!sessionId) {
            console.log('[Stripe] ❌ Falta session_id');
            return res.status(400).json({
                success: false,
                error: 'Session ID requerido'
            });
        }

        console.log('[Stripe] 🔍 Buscando usuario:', userId);
        const user = await User.findById(userId);

        if (!user || user.role !== 'teacher') {
            console.log('[Stripe] ❌ Usuario no válido o no es profesor:', user?.role);
            return res.status(403).json({ 
                success: false, 
                error: 'Solo profesores pueden acceder' 
            });
        }

        if (!StripeService.isConfigured()) {
            console.log('[Stripe] ❌ Stripe no configurado');
            return res.status(503).json({
                success: false,
                error: 'Stripe no está configurado'
            });
        }

        // Obtener la sesión de Stripe
        console.log('[Stripe] 📡 Consultando sesión en Stripe:', sessionId);
        const { stripe } = require('../config/stripe');
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        console.log('[Stripe] ✅ Sesión encontrada, payment_status:', session.payment_status);
        console.log('[Stripe] 📧 Email del cliente en Stripe:', session.customer_details?.email);
        console.log('[Stripe] 👤 Email del usuario actual:', user.email);

        // Verificar que la sesión sea del profesor correcto
        // Nota: la clave en metadata es 'pianolink_teacher_id' (ver config/stripe.js)
        const teacherIdInSession = session.metadata?.pianolink_teacher_id;
        const customerEmail = session.customer_details?.email?.toLowerCase();
        const userEmail = user.email?.toLowerCase();
        
        console.log('[Stripe] 🔍 Comparando - ID Sesión:', teacherIdInSession, '| ID Usuario:', userId.toString());
        console.log('[Stripe] 🔍 Comparando - Email Cliente:', customerEmail, '| Email Usuario:', userEmail);
        
        // Verificar por ID O por email (para casos donde el usuario recreó la cuenta)
        const matchById = teacherIdInSession === userId.toString();
        const matchByEmail = customerEmail && userEmail && customerEmail === userEmail;
        
        if (!matchById && !matchByEmail) {
            console.log('[Stripe] ❌ Ni ID ni Email coinciden');
            return res.status(403).json({
                success: false,
                error: 'Esta sesión no pertenece a tu cuenta'
            });
        }
        
        console.log('[Stripe] ✅ Verificación exitosa por:', matchById ? 'ID' : 'Email');

        // Verificar que el pago fue exitoso
        if (session.payment_status !== 'paid') {
            console.log('[Stripe] ❌ Pago no completado:', session.payment_status);
            return res.status(400).json({
                success: false,
                error: 'El pago no ha sido completado'
            });
        }

        // Obtener la suscripción
        const subscriptionId = session.subscription;
        console.log('[Stripe] 📋 Subscription ID:', subscriptionId);
        if (!subscriptionId) {
            console.log('[Stripe] ❌ No hay suscripción en la sesión');
            return res.status(400).json({
                success: false,
                error: 'No se encontró suscripción en la sesión'
            });
        }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        // Activar la membresía
        await User.findByIdAndUpdate(userId, {
            'teacherData.stripeSubscriptionId': subscription.id,
            'teacherData.stripePriceId': subscription.items?.data[0]?.price?.id,
            'teacherData.subscriptionStatus': StripeService.mapStripeStatus(subscription.status),
            'teacherData.subscriptionExpiresAt': new Date(subscription.current_period_end * 1000)
        });

        console.log(`[Stripe] ✅ Membresía activada desde session_id para: ${user.email}`);

        res.json({
            success: true,
            message: '¡Membresía activada exitosamente!',
            subscription: {
                status: subscription.status,
                expiresAt: new Date(subscription.current_period_end * 1000)
            }
        });

    } catch (error) {
        console.error('[Stripe] Error activando desde session:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * POST /api/payment/stripe/sync-subscription
 * Sincronizar estado de suscripción desde Stripe
 * (Para desarrollo o cuando el webhook falla)
 */
router.post('/stripe/sync-subscription', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        if (!user || user.role !== 'teacher') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo profesores pueden acceder' 
            });
        }

        if (!StripeService.isConfigured()) {
            return res.status(503).json({
                success: false,
                error: 'Stripe no está configurado'
            });
        }

        const stripeSubscriptionId = user.teacherData?.stripeSubscriptionId;
        
        if (!stripeSubscriptionId) {
            return res.status(404).json({
                success: false,
                error: 'No tienes una suscripción en Stripe'
            });
        }

        // Obtener estado actual desde Stripe
        const { stripe } = require('../config/stripe');
        const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

        // Actualizar en base de datos
        await User.findByIdAndUpdate(userId, {
            'teacherData.subscriptionStatus': StripeService.mapStripeStatus(subscription.status),
            'teacherData.subscriptionExpiresAt': new Date(subscription.current_period_end * 1000)
        });

        res.json({
            success: true,
            message: 'Estado sincronizado desde Stripe',
            subscription: {
                status: subscription.status,
                currentPeriodEnd: new Date(subscription.current_period_end * 1000)
            }
        });

    } catch (error) {
        console.error('[Stripe] Error sincronizando:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * POST /api/payment/stripe/simulate-active (SOLO DESARROLLO)
 * Simular membresía activa para pruebas
 */
router.post('/stripe/simulate-active', protect, async (req, res) => {
    try {
        // Solo permitir en entorno de desarrollo
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({
                success: false,
                error: 'Esta ruta solo está disponible en desarrollo'
            });
        }

        const userId = req.user._id;
        const user = await User.findById(userId);

        if (!user || user.role !== 'teacher') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo profesores pueden acceder' 
            });
        }

        // Simular membresía activa
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);

        await User.findByIdAndUpdate(userId, {
            'teacherData.subscriptionStatus': 'active',
            'teacherData.subscriptionExpiresAt': expiresAt
        });

        res.json({
            success: true,
            message: '✅ Membresía simulada como activa (solo desarrollo)',
            subscription: {
                status: 'active',
                expiresAt: expiresAt
            }
        });

    } catch (error) {
        console.error('[Stripe] Error simulando:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

module.exports = router;
