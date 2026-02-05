/**
 * services/StripeService.js
 * Servicio de Pagos con Stripe - PianoLink v4.3
 * 
 * Maneja:
 * - Checkout Sessions para pagos de clases
 * - Payment Intents directos
 * - Webhooks de Stripe
 * - Connect accounts para profesores
 * - Payouts (retiros)
 */

const { stripe, stripeConfig, isStripeConfigured, getStripeClient } = require('../config/stripe');
const Payment = require('../models/Payment');
const WebhookLog = require('../models/WebhookLog');
const User = require('../models/User');
const GlobalConfig = require('../models/GlobalConfig');

class StripeService {

    // ============================================
    // VERIFICACIÓN DE CONFIGURACIÓN
    // ============================================

    static isConfigured() {
        return isStripeConfigured();
    }

    // ============================================
    // CHECKOUT SESSIONS (Para pagos de clases/paquetes)
    // ============================================

    /**
     * Crear Checkout Session para compra de clases
     * @param {Object} options - Opciones de la sesión
     * @returns {Object} - URL de checkout y session ID
     */
    static async createClassCheckoutSession({
        studentId,
        teacherId,
        classCount = 1,
        pricePerClass,  // en centavos
        currency = 'usd',
        successUrl,
        cancelUrl,
        metadata = {}
    }) {
        const client = getStripeClient();

        try {
            // Obtener datos del profesor y estudiante
            const [teacher, student] = await Promise.all([
                User.findById(teacherId).select('name email teacherData'),
                User.findById(studentId).select('name email')
            ]);

            if (!teacher) throw new Error('Profesor no encontrado');
            if (!student) throw new Error('Estudiante no encontrado');

            // Calcular totales
            const unitAmount = pricePerClass || stripeConfig.defaultPrices.singleClass;
            const totalAmount = unitAmount * classCount;

            // Aplicar descuentos por paquete
            let discount = 0;
            let discountDescription = '';
            if (classCount >= 10) {
                discount = 0.20;
                discountDescription = '20% descuento por paquete de 10+';
            } else if (classCount >= 5) {
                discount = 0.10;
                discountDescription = '10% descuento por paquete de 5+';
            }

            const discountedAmount = Math.round(totalAmount * (1 - discount));

            // Crear la sesión de checkout
            const session = await client.checkout.sessions.create({
                payment_method_types: ['card'],
                mode: 'payment',
                customer_email: student.email,
                
                line_items: [{
                    price_data: {
                        currency: currency,
                        product_data: {
                            name: `Clase${classCount > 1 ? 's' : ''} de Piano con ${teacher.name}`,
                            description: classCount > 1 
                                ? `Paquete de ${classCount} clases${discountDescription ? ` (${discountDescription})` : ''}`
                                : 'Clase individual de piano en vivo',
                            images: ['https://pianolink.app/img/class-product.png']
                        },
                        unit_amount: Math.round(discountedAmount / classCount),
                    },
                    quantity: classCount,
                }],

                // Comisión para PianoLink usando Connect
                payment_intent_data: {
                    // Si el profesor tiene cuenta Connect, dividir el pago
                    ...(teacher.teacherData?.stripeAccountId ? {
                        transfer_data: {
                            destination: teacher.teacherData.stripeAccountId,
                            amount: Math.round(discountedAmount * (stripeConfig.platformFee.teacherPercent / 100))
                        }
                    } : {}),
                    
                    metadata: {
                        [stripeConfig.metadataKeys.teacherId]: teacherId.toString(),
                        [stripeConfig.metadataKeys.studentId]: studentId.toString(),
                        classCount: classCount.toString(),
                        paymentType: stripeConfig.paymentModes.class,
                        ...metadata
                    }
                },

                success_url: successUrl || `${process.env.APP_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: cancelUrl || `${process.env.APP_URL}/payment/cancelled`,

                metadata: {
                    [stripeConfig.metadataKeys.teacherId]: teacherId.toString(),
                    [stripeConfig.metadataKeys.studentId]: studentId.toString(),
                    classCount: classCount.toString(),
                    originalAmount: totalAmount.toString(),
                    discountPercent: (discount * 100).toString(),
                    ...metadata
                },

                // Expiración en 30 minutos
                expires_at: Math.floor(Date.now() / 1000) + (stripeConfig.timing.paymentIntentTimeout * 60)
            });

            console.log(`[StripeService] ✅ Checkout session creada: ${session.id}`);

            return {
                success: true,
                sessionId: session.id,
                url: session.url,
                expiresAt: new Date(session.expires_at * 1000)
            };

        } catch (error) {
            console.error('[StripeService] Error creando checkout session:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ============================================
    // CONNECT ACCOUNTS (Onboarding de profesores)
    // ============================================

    /**
     * Crear cuenta Connect para un profesor
     */
    static async createConnectAccount(teacherId) {
        const client = getStripeClient();

        try {
            const teacher = await User.findById(teacherId);
            if (!teacher) throw new Error('Profesor no encontrado');

            // Verificar si ya tiene cuenta
            if (teacher.teacherData?.stripeAccountId) {
                return {
                    success: true,
                    accountId: teacher.teacherData.stripeAccountId,
                    alreadyExists: true
                };
            }

            // Crear cuenta Express
            const account = await client.accounts.create({
                type: 'express',
                email: teacher.email,
                capabilities: stripeConfig.connect.capabilities,
                metadata: {
                    [stripeConfig.metadataKeys.teacherId]: teacherId.toString(),
                    platform: 'pianolink'
                },
                business_profile: {
                    name: teacher.name,
                    product_description: 'Clases de piano en línea'
                }
            });

            // Guardar en el usuario
            await User.findByIdAndUpdate(teacherId, {
                'teacherData.stripeAccountId': account.id,
                'teacherData.stripeAccountStatus': 'pending'
            });

            console.log(`[StripeService] ✅ Cuenta Connect creada: ${account.id} para ${teacher.email}`);

            return {
                success: true,
                accountId: account.id
            };

        } catch (error) {
            console.error('[StripeService] Error creando cuenta Connect:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Generar link de onboarding para completar cuenta Connect
     */
    static async createAccountLink(teacherId) {
        const client = getStripeClient();

        try {
            const teacher = await User.findById(teacherId);
            if (!teacher?.teacherData?.stripeAccountId) {
                throw new Error('El profesor no tiene cuenta Connect');
            }

            const accountLink = await client.accountLinks.create({
                account: teacher.teacherData.stripeAccountId,
                refresh_url: `${process.env.APP_URL}/teacher/stripe/refresh`,
                return_url: `${process.env.APP_URL}/teacher/stripe/complete`,
                type: 'account_onboarding'
            });

            return {
                success: true,
                url: accountLink.url,
                expiresAt: new Date(accountLink.expires_at * 1000)
            };

        } catch (error) {
            console.error('[StripeService] Error creando account link:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Verificar estado de cuenta Connect
     */
    static async getAccountStatus(teacherId) {
        const client = getStripeClient();

        try {
            const teacher = await User.findById(teacherId);
            if (!teacher?.teacherData?.stripeAccountId) {
                return { success: true, status: 'not_connected' };
            }

            const account = await client.accounts.retrieve(teacher.teacherData.stripeAccountId);

            const status = {
                id: account.id,
                chargesEnabled: account.charges_enabled,
                payoutsEnabled: account.payouts_enabled,
                detailsSubmitted: account.details_submitted,
                requirements: account.requirements
            };

            // Actualizar en DB si cambió el estado
            let dbStatus = 'pending';
            if (account.charges_enabled && account.payouts_enabled) {
                dbStatus = 'active';
            } else if (account.details_submitted) {
                dbStatus = 'pending_verification';
            }

            await User.findByIdAndUpdate(teacherId, {
                'teacherData.stripeAccountStatus': dbStatus
            });

            return { success: true, status: dbStatus, details: status };

        } catch (error) {
            console.error('[StripeService] Error obteniendo estado de cuenta:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ============================================
    // PAYOUTS (Retiros para profesores)
    // ============================================

    /**
     * Crear payout a cuenta Connect del profesor
     */
    static async createPayout(teacherId, amount, currency = 'usd') {
        const client = getStripeClient();

        try {
            const teacher = await User.findById(teacherId);
            if (!teacher?.teacherData?.stripeAccountId) {
                throw new Error('Profesor sin cuenta Connect configurada');
            }

            // Verificar que la cuenta puede recibir pagos
            const accountStatus = await this.getAccountStatus(teacherId);
            if (accountStatus.status !== 'active') {
                throw new Error(`Cuenta Connect no activa: ${accountStatus.status}`);
            }

            // Crear transfer a la cuenta Connect
            const transfer = await client.transfers.create({
                amount: amount, // en centavos
                currency: currency,
                destination: teacher.teacherData.stripeAccountId,
                metadata: {
                    [stripeConfig.metadataKeys.teacherId]: teacherId.toString(),
                    type: 'teacher_payout'
                }
            });

            console.log(`[StripeService] ✅ Payout creado: ${transfer.id} - $${amount/100} ${currency.toUpperCase()}`);

            return {
                success: true,
                transferId: transfer.id,
                amount: transfer.amount,
                currency: transfer.currency
            };

        } catch (error) {
            console.error('[StripeService] Error creando payout:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ============================================
    // SUSCRIPCIONES DE PROFESORES
    // ============================================

    /**
     * Crear Checkout Session para suscripción de profesor
     * @param {Object} options - Opciones de la sesión
     * @returns {Object} - URL de checkout y session ID
     */
    static async createTeacherSubscriptionCheckout({
        teacherId,
        isFounder = false,
        successUrl,
        cancelUrl
    }) {
        const client = getStripeClient();

        try {
            const teacher = await User.findById(teacherId);
            if (!teacher) throw new Error('Profesor no encontrado');
            if (teacher.role !== 'teacher') throw new Error('El usuario no es profesor');

            // Verificar si ya tiene suscripción activa
            if (teacher.teacherData?.subscriptionStatus === 'active') {
                return {
                    success: false,
                    error: 'Ya tienes una suscripción activa'
                };
            }

            // Obtener o crear customer de Stripe
            let customerId = teacher.teacherData?.stripeCustomerId;
            
            if (!customerId) {
                const customer = await client.customers.create({
                    email: teacher.email,
                    name: teacher.name,
                    metadata: {
                        [stripeConfig.metadataKeys.teacherId]: teacherId.toString(),
                        role: 'teacher',
                        isFounder: isFounder.toString()
                    }
                });
                customerId = customer.id;
                
                // Guardar en el usuario
                await User.findByIdAndUpdate(teacherId, {
                    'teacherData.stripeCustomerId': customerId
                });
            }

            // Obtener precios desde la configuración global
            let config = await GlobalConfig.findOne({ isDefault: true });
            if (!config) {
                // Crear configuración por defecto si no existe
                config = await GlobalConfig.create({
                    isDefault: true,
                    teacherSubscription: {
                        regular: 20,
                        founder: 10
                    }
                });
            }

            // Determinar precio según si es fundador o no (convertir de USD a centavos)
            const priceInUSD = isFounder 
                ? config.teacherSubscription?.founder || 10 
                : config.teacherSubscription?.regular || 20;
            const priceAmount = Math.round(priceInUSD * 100); // en centavos
            
            // Crear o buscar el Price en Stripe
            const priceLookup = isFounder ? 'teacher_founder_monthly' : 'teacher_regular_monthly';
            let prices = await client.prices.list({
                lookup_keys: [priceLookup],
                limit: 1
            });

            let priceId;
            if (prices.data.length > 0) {
                priceId = prices.data[0].id;
            } else {
                // Primero crear el producto
                const productName = isFounder 
                    ? 'PianoLink Profesor Fundador - Membresía Mensual' 
                    : 'PianoLink Profesor - Membresía Mensual';
                
                const product = await client.products.create({
                    name: productName,
                    metadata: {
                        type: 'teacher_subscription',
                        isFounder: isFounder.toString()
                    }
                });

                // Luego crear el precio vinculado al producto
                const price = await client.prices.create({
                    unit_amount: priceAmount,
                    currency: 'usd',
                    recurring: { interval: 'month' },
                    product: product.id,
                    lookup_key: priceLookup
                });
                priceId = price.id;
            }

            // Crear la sesión de checkout para suscripción
            const session = await client.checkout.sessions.create({
                customer: customerId,
                payment_method_types: ['card'],
                mode: 'subscription',
                
                line_items: [{
                    price: priceId,
                    quantity: 1,
                }],

                subscription_data: {
                    metadata: {
                        [stripeConfig.metadataKeys.teacherId]: teacherId.toString(),
                        subscriptionType: 'teacher_platform',
                        isFounder: isFounder.toString()
                    }
                },

                success_url: successUrl || `${process.env.APP_URL}/teacher-dashboard?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: cancelUrl || `${process.env.APP_URL}/teacher-dashboard?subscription=cancelled`,

                metadata: {
                    [stripeConfig.metadataKeys.teacherId]: teacherId.toString(),
                    subscriptionType: 'teacher_platform',
                    isFounder: isFounder.toString()
                },

                // Permitir código promocional
                allow_promotion_codes: true,

                // Expiración en 30 minutos
                expires_at: Math.floor(Date.now() / 1000) + (30 * 60)
            });

            console.log(`[StripeService] ✅ Checkout de suscripción creado: ${session.id} para ${teacher.email}`);

            return {
                success: true,
                sessionId: session.id,
                url: session.url,
                expiresAt: new Date(session.expires_at * 1000)
            };

        } catch (error) {
            console.error('[StripeService] Error creando checkout de suscripción:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Cancelar suscripción de profesor
     */
    static async cancelTeacherSubscription(teacherId, immediately = false) {
        const client = getStripeClient();

        try {
            const teacher = await User.findById(teacherId);
            if (!teacher?.teacherData?.stripeSubscriptionId) {
                throw new Error('No hay suscripción activa');
            }

            const subscription = await client.subscriptions.update(
                teacher.teacherData.stripeSubscriptionId,
                { cancel_at_period_end: !immediately }
            );

            if (immediately) {
                await client.subscriptions.cancel(teacher.teacherData.stripeSubscriptionId);
            }

            // Actualizar estado en DB
            await User.findByIdAndUpdate(teacherId, {
                'teacherData.subscriptionStatus': immediately ? 'cancelled' : 'active'
            });

            console.log(`[StripeService] ✅ Suscripción ${immediately ? 'cancelada' : 'programada para cancelar'}`);

            return {
                success: true,
                cancelAtPeriodEnd: !immediately,
                currentPeriodEnd: new Date(subscription.current_period_end * 1000)
            };

        } catch (error) {
            console.error('[StripeService] Error cancelando suscripción:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Obtener portal de facturación para el profesor
     */
    static async getCustomerPortal(teacherId) {
        const client = getStripeClient();

        try {
            const teacher = await User.findById(teacherId);
            if (!teacher?.teacherData?.stripeCustomerId) {
                throw new Error('No hay cuenta de Stripe configurada');
            }

            const session = await client.billingPortal.sessions.create({
                customer: teacher.teacherData.stripeCustomerId,
                return_url: `${process.env.APP_URL}/teacher-dashboard`
            });

            return {
                success: true,
                url: session.url
            };

        } catch (error) {
            console.error('[StripeService] Error creando portal:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ============================================
    // WEBHOOKS
    // ============================================

    /**
     * Verificar firma del webhook
     */
    static verifyWebhookSignature(payload, signature) {
        const client = getStripeClient();
        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!endpointSecret) {
            console.error('[StripeService] STRIPE_WEBHOOK_SECRET no configurado');
            return null;
        }

        try {
            return client.webhooks.constructEvent(payload, signature, endpointSecret);
        } catch (error) {
            console.error('[StripeService] Error verificando webhook:', error.message);
            return null;
        }
    }

    /**
     * Procesar webhook de Stripe
     */
    static async processWebhook(req) {
        const signature = req.headers['stripe-signature'];
        const payload = req.body; // Debe ser el raw body

        // Log inicial
        const logData = {
            provider: 'stripe',
            endpoint: stripeConfig.webhookEndpoint,
            headers: req.headers,
            ipAddress: req.ip || req.connection?.remoteAddress,
            userAgent: req.headers['user-agent']
        };

        // Verificar firma
        const event = this.verifyWebhookSignature(payload, signature);
        
        if (!event) {
            logData.signatureValid = false;
            logData.processingResult = 'failed';
            logData.processingError = 'Invalid signature';
            await WebhookLog.create(logData);
            return { success: false, error: 'INVALID_SIGNATURE' };
        }

        logData.signatureValid = true;
        logData.body = event;

        console.log(`[StripeService] 📨 Webhook recibido: ${event.type}`);

        try {
            let result;

            switch (event.type) {
                case 'checkout.session.completed':
                    result = await this.handleCheckoutCompleted(event.data.object);
                    break;

                case 'payment_intent.succeeded':
                    result = await this.handlePaymentSucceeded(event.data.object);
                    break;

                case 'payment_intent.payment_failed':
                    result = await this.handlePaymentFailed(event.data.object);
                    break;

                case 'customer.subscription.created':
                    result = await this.handleSubscriptionCreated(event.data.object);
                    break;

                case 'customer.subscription.updated':
                    result = await this.handleSubscriptionUpdated(event.data.object);
                    break;

                case 'customer.subscription.deleted':
                    result = await this.handleSubscriptionDeleted(event.data.object);
                    break;

                case 'invoice.paid':
                    result = await this.handleInvoicePaid(event.data.object);
                    break;

                case 'invoice.payment_failed':
                    result = await this.handleInvoicePaymentFailed(event.data.object);
                    break;

                case 'account.updated':
                    result = await this.handleAccountUpdated(event.data.object);
                    break;

                case 'transfer.created':
                    result = await this.handleTransferCreated(event.data.object);
                    break;

                default:
                    console.log(`[StripeService] Evento no manejado: ${event.type}`);
                    result = { handled: false };
            }

            logData.processingResult = result.success !== false ? 'success' : 'failed';
            logData.processingError = result.error;

        } catch (error) {
            console.error('[StripeService] Error procesando webhook:', error.message);
            logData.processingResult = 'failed';
            logData.processingError = error.message;
        }

        await WebhookLog.create(logData);
        return { success: true, eventType: event.type };
    }

    // ============================================
    // HANDLERS DE EVENTOS
    // ============================================

    /**
     * Manejar checkout completado
     */
    static async handleCheckoutCompleted(session) {
        console.log(`[StripeService] 💳 Checkout completado: ${session.id}`);

        const metadata = session.metadata || {};
        const teacherId = metadata[stripeConfig.metadataKeys.teacherId];
        const studentId = metadata[stripeConfig.metadataKeys.studentId];
        const classCount = parseInt(metadata.classCount) || 1;

        if (!teacherId || !studentId) {
            console.error('[StripeService] Metadata incompleta en checkout');
            return { success: false, error: 'Missing metadata' };
        }

        try {
            // Registrar pago
            const payment = await Payment.create({
                provider: 'stripe',
                externalPaymentId: session.payment_intent,
                sessionId: session.id,
                amount: session.amount_total,
                currency: session.currency.toUpperCase(),
                status: 'approved',
                payer: {
                    email: session.customer_details?.email,
                    name: session.customer_details?.name
                },
                metadata: {
                    teacherId,
                    studentId,
                    classCount,
                    paymentType: metadata.paymentType
                },
                processedAt: new Date()
            });

            // Agregar clases al estudiante
            await User.findByIdAndUpdate(studentId, {
                $inc: { classesRemaining: classCount }
            });

            console.log(`[StripeService] ✅ ${classCount} clase(s) agregadas al estudiante ${studentId}`);

            return { success: true, paymentId: payment._id };

        } catch (error) {
            console.error('[StripeService] Error procesando checkout:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Manejar pago exitoso
     */
    static async handlePaymentSucceeded(paymentIntent) {
        console.log(`[StripeService] ✅ PaymentIntent exitoso: ${paymentIntent.id}`);
        
        // Actualizar pago si existe
        await Payment.findOneAndUpdate(
            { externalPaymentId: paymentIntent.id },
            { 
                status: 'approved',
                processedAt: new Date()
            }
        );

        return { success: true };
    }

    /**
     * Manejar pago fallido
     */
    static async handlePaymentFailed(paymentIntent) {
        console.log(`[StripeService] ❌ PaymentIntent fallido: ${paymentIntent.id}`);
        
        await Payment.findOneAndUpdate(
            { externalPaymentId: paymentIntent.id },
            { 
                status: 'failed',
                failureReason: paymentIntent.last_payment_error?.message
            }
        );

        return { success: true };
    }

    /**
     * Manejar actualización de cuenta Connect
     */
    static async handleAccountUpdated(account) {
        console.log(`[StripeService] 👤 Cuenta actualizada: ${account.id}`);

        // Buscar profesor con esta cuenta
        const teacher = await User.findOne({
            'teacherData.stripeAccountId': account.id
        });

        if (teacher) {
            let status = 'pending';
            if (account.charges_enabled && account.payouts_enabled) {
                status = 'active';
            } else if (account.details_submitted) {
                status = 'pending_verification';
            }

            await User.findByIdAndUpdate(teacher._id, {
                'teacherData.stripeAccountStatus': status
            });

            console.log(`[StripeService] Estado actualizado para ${teacher.email}: ${status}`);
        }

        return { success: true };
    }

    /**
     * Manejar transfer creado (payout a profesor)
     */
    static async handleTransferCreated(transfer) {
        console.log(`[StripeService] 💸 Transfer creado: ${transfer.id}`);
        // El WalletService maneja el registro en Ledger
        return { success: true };
    }

    // ============================================
    // HANDLERS DE SUSCRIPCIONES
    // ============================================

    /**
     * Manejar suscripción creada
     */
    static async handleSubscriptionCreated(subscription) {
        console.log(`[StripeService] 📋 Suscripción creada: ${subscription.id}`);

        const metadata = subscription.metadata || {};
        const teacherId = metadata[stripeConfig.metadataKeys.teacherId];
        const subscriptionType = metadata.subscriptionType;

        // Solo procesar suscripciones de profesores
        if (subscriptionType !== 'teacher_platform' || !teacherId) {
            console.log('[StripeService] Suscripción no es de profesor, ignorando');
            return { success: true, handled: false };
        }

        try {
            await User.findByIdAndUpdate(teacherId, {
                'teacherData.stripeSubscriptionId': subscription.id,
                'teacherData.stripePriceId': subscription.items?.data[0]?.price?.id,
                'teacherData.subscriptionStatus': this.mapStripeStatus(subscription.status),
                'teacherData.subscriptionExpiresAt': new Date(subscription.current_period_end * 1000)
            });

            console.log(`[StripeService] ✅ Suscripción activada para profesor ${teacherId}`);
            return { success: true };

        } catch (error) {
            console.error('[StripeService] Error procesando suscripción:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Manejar suscripción actualizada
     */
    static async handleSubscriptionUpdated(subscription) {
        console.log(`[StripeService] 🔄 Suscripción actualizada: ${subscription.id}`);

        try {
            // Buscar profesor por subscription ID
            const teacher = await User.findOne({
                'teacherData.stripeSubscriptionId': subscription.id
            });

            if (!teacher) {
                console.log('[StripeService] Profesor no encontrado para suscripción');
                return { success: true, handled: false };
            }

            await User.findByIdAndUpdate(teacher._id, {
                'teacherData.subscriptionStatus': this.mapStripeStatus(subscription.status),
                'teacherData.subscriptionExpiresAt': new Date(subscription.current_period_end * 1000)
            });

            console.log(`[StripeService] ✅ Estado actualizado para ${teacher.email}: ${subscription.status}`);
            return { success: true };

        } catch (error) {
            console.error('[StripeService] Error actualizando suscripción:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Manejar suscripción eliminada/cancelada
     */
    static async handleSubscriptionDeleted(subscription) {
        console.log(`[StripeService] ❌ Suscripción cancelada: ${subscription.id}`);

        try {
            const teacher = await User.findOne({
                'teacherData.stripeSubscriptionId': subscription.id
            });

            if (!teacher) {
                return { success: true, handled: false };
            }

            await User.findByIdAndUpdate(teacher._id, {
                'teacherData.subscriptionStatus': 'cancelled',
                'teacherData.stripeSubscriptionId': ''
            });

            console.log(`[StripeService] ✅ Suscripción cancelada para ${teacher.email}`);
            return { success: true };

        } catch (error) {
            console.error('[StripeService] Error cancelando suscripción:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Manejar factura pagada (renovación de suscripción)
     */
    static async handleInvoicePaid(invoice) {
        console.log(`[StripeService] 💰 Factura pagada: ${invoice.id}`);

        if (!invoice.subscription) {
            return { success: true, handled: false };
        }

        try {
            const teacher = await User.findOne({
                'teacherData.stripeSubscriptionId': invoice.subscription
            });

            if (!teacher) {
                return { success: true, handled: false };
            }

            // Registrar pago
            await Payment.create({
                provider: 'stripe',
                externalPaymentId: invoice.payment_intent,
                invoiceId: invoice.id,
                amount: invoice.amount_paid,
                currency: invoice.currency.toUpperCase(),
                status: 'approved',
                payer: {
                    email: invoice.customer_email,
                    name: teacher.name
                },
                metadata: {
                    teacherId: teacher._id.toString(),
                    subscriptionId: invoice.subscription,
                    paymentType: 'teacher_subscription'
                },
                processedAt: new Date()
            });

            // Actualizar fecha de expiración
            const client = getStripeClient();
            const subscription = await client.subscriptions.retrieve(invoice.subscription);
            
            await User.findByIdAndUpdate(teacher._id, {
                'teacherData.subscriptionStatus': 'active',
                'teacherData.subscriptionExpiresAt': new Date(subscription.current_period_end * 1000)
            });

            console.log(`[StripeService] ✅ Pago de suscripción registrado para ${teacher.email}`);
            return { success: true };

        } catch (error) {
            console.error('[StripeService] Error procesando factura:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Manejar fallo de pago de factura
     */
    static async handleInvoicePaymentFailed(invoice) {
        console.log(`[StripeService] ⚠️ Pago fallido: ${invoice.id}`);

        if (!invoice.subscription) {
            return { success: true, handled: false };
        }

        try {
            const teacher = await User.findOne({
                'teacherData.stripeSubscriptionId': invoice.subscription
            });

            if (!teacher) {
                return { success: true, handled: false };
            }

            // Marcar como past_due
            await User.findByIdAndUpdate(teacher._id, {
                'teacherData.subscriptionStatus': 'past_due'
            });

            // TODO: Enviar email de notificación
            console.log(`[StripeService] ⚠️ Pago fallido para ${teacher.email}`);
            return { success: true };

        } catch (error) {
            console.error('[StripeService] Error procesando fallo de pago:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Mapear estado de Stripe a estado interno
     */
    static mapStripeStatus(stripeStatus) {
        const statusMap = {
            'active': 'active',
            'past_due': 'past_due',
            'canceled': 'cancelled',
            'unpaid': 'expired',
            'incomplete': 'trial',
            'incomplete_expired': 'expired',
            'trialing': 'trial',
            'paused': 'expired'
        };
        return statusMap[stripeStatus] || 'expired';
    }

    // ============================================
    // UTILIDADES
    // ============================================

    /**
     * Obtener balance de la plataforma
     */
    static async getPlatformBalance() {
        const client = getStripeClient();

        try {
            const balance = await client.balance.retrieve();
            return {
                success: true,
                available: balance.available,
                pending: balance.pending
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Obtener historial de pagos de un cliente
     */
    static async getCustomerPayments(email, limit = 10) {
        const client = getStripeClient();

        try {
            // Buscar cliente por email
            const customers = await client.customers.list({ email, limit: 1 });
            
            if (customers.data.length === 0) {
                return { success: true, payments: [] };
            }

            const customerId = customers.data[0].id;
            const paymentIntents = await client.paymentIntents.list({
                customer: customerId,
                limit
            });

            return {
                success: true,
                payments: paymentIntents.data.map(pi => ({
                    id: pi.id,
                    amount: pi.amount,
                    currency: pi.currency,
                    status: pi.status,
                    created: new Date(pi.created * 1000)
                }))
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = StripeService;
