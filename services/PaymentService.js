/**
 * services/PaymentService.js
 * Procesamiento de Pagos y Webhooks - PianoLink v2.0
 * 
 * ⚠️ SEGURIDAD: Siempre validar firmas antes de procesar
 */

const crypto = require('crypto');
const Payment = require('../models/Payment');
const WebhookLog = require('../models/WebhookLog');
const Subscription = require('../models/Subscription');
const SubscriptionService = require('./SubscriptionService');

class PaymentService {
    
    // ============================================
    // MERCADO PAGO
    // ============================================

    /**
     * Validar firma de webhook de Mercado Pago
     * @returns {boolean} true si la firma es válida
     */
    static validateMercadoPagoSignature(req) {
        try {
            const signature = req.headers['x-signature'];
            const requestId = req.headers['x-request-id'];
            
            if (!signature || !requestId) {
                console.error('[PaymentService] MP: Headers de firma faltantes');
                return false;
            }

            // Parsear signature: "ts=1704067200,v1=abc123..."
            const parts = {};
            signature.split(',').forEach(part => {
                const [key, value] = part.split('=');
                parts[key] = value;
            });

            const timestamp = parts['ts'];
            const receivedHash = parts['v1'];

            if (!timestamp || !receivedHash) {
                console.error('[PaymentService] MP: Formato de firma inválido');
                return false;
            }

            // Verificar timestamp (±5 minutos)
            const webhookTime = parseInt(timestamp) * 1000;
            const now = Date.now();
            const TOLERANCE = 5 * 60 * 1000;

            if (Math.abs(now - webhookTime) > TOLERANCE) {
                console.error('[PaymentService] MP: Timestamp fuera de rango');
                return false;
            }

            // Reconstruir manifest
            const dataId = req.query['data.id'] || req.body?.data?.id;
            const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;

            // Calcular HMAC
            const secret = process.env.MP_WEBHOOK_SECRET;
            if (!secret) {
                console.error('[PaymentService] MP: MP_WEBHOOK_SECRET no configurado');
                return false;
            }

            const calculatedHash = crypto
                .createHmac('sha256', secret)
                .update(manifest)
                .digest('hex');

            // Comparar (timing-safe)
            const isValid = crypto.timingSafeEqual(
                Buffer.from(calculatedHash, 'hex'),
                Buffer.from(receivedHash, 'hex')
            );

            return isValid;
        } catch (error) {
            console.error('[PaymentService] MP: Error validando firma:', error.message);
            return false;
        }
    }

    /**
     * Verificar pago con API de Mercado Pago
     */
    static async verifyMercadoPagoPayment(paymentId) {
        try {
            const accessToken = process.env.MP_ACCESS_TOKEN;
            if (!accessToken) {
                throw new Error('MP_ACCESS_TOKEN no configurado');
            }

            const response = await fetch(
                `https://api.mercadopago.com/v1/payments/${paymentId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`API respondió ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[PaymentService] MP: Error verificando pago:', error.message);
            return null;
        }
    }

    /**
     * Procesar webhook de Mercado Pago
     */
    static async processMercadoPagoWebhook(req) {
        const logData = {
            provider: 'mercadopago',
            endpoint: '/api/webhooks/mercadopago',
            headers: req.headers,
            body: req.body,
            queryParams: req.query,
            ipAddress: req.ip || req.connection?.remoteAddress,
            userAgent: req.headers['user-agent']
        };

        // 1. Validar firma
        const signatureValid = this.validateMercadoPagoSignature(req);
        logData.signatureValid = signatureValid;
        logData.signatureReceived = req.headers['x-signature'];

        if (!signatureValid) {
            logData.processingResult = 'failed';
            logData.processingError = 'Invalid signature';
            await WebhookLog.create(logData);
            return { success: false, error: 'INVALID_SIGNATURE' };
        }

        // 2. Extraer datos
        const { type, data } = req.body;
        const paymentId = data?.id;

        if (type !== 'payment' || !paymentId) {
            logData.processingResult = 'skipped';
            logData.processingError = 'Not a payment notification';
            await WebhookLog.create(logData);
            return { success: true, skipped: true };
        }

        // 3. Verificar duplicado
        const alreadyProcessed = await Payment.alreadyProcessed(paymentId);
        if (alreadyProcessed) {
            logData.processingResult = 'duplicate';
            await WebhookLog.create(logData);
            return { success: true, duplicate: true };
        }

        // 4. Verificar con API de MP
        const mpPayment = await this.verifyMercadoPagoPayment(paymentId);
        logData.apiVerified = !!mpPayment;
        logData.apiResponse = mpPayment;

        if (!mpPayment) {
            logData.processingResult = 'failed';
            logData.processingError = 'API verification failed';
            await WebhookLog.create(logData);
            return { success: false, error: 'API_VERIFICATION_FAILED' };
        }

        // 5. Procesar según status
        if (mpPayment.status === 'approved') {
            const result = await this.processApprovedPayment({
                provider: 'mercadopago',
                externalPaymentId: paymentId,
                amount: mpPayment.transaction_amount,
                currency: mpPayment.currency_id,
                externalReference: mpPayment.external_reference,
                payerEmail: mpPayment.payer?.email,
                webhookData: req.body,
                signatureValid: true
            });

            logData.processingResult = result.success ? 'success' : 'failed';
            logData.paymentId = result.payment?._id;
            if (!result.success) logData.processingError = result.error;
        } else {
            logData.processingResult = 'skipped';
            logData.processingError = `Payment status: ${mpPayment.status}`;
        }

        await WebhookLog.create(logData);
        return { success: true, status: mpPayment.status };
    }

    // ============================================
    // PAYPAL
    // ============================================

    /**
     * Validar firma de webhook de PayPal
     */
    static async validatePayPalSignature(req) {
        try {
            const webhookId = process.env.PAYPAL_WEBHOOK_ID;
            const clientId = process.env.PAYPAL_CLIENT_ID;
            const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
            const mode = process.env.PAYPAL_MODE || 'sandbox';

            if (!webhookId || !clientId || !clientSecret) {
                console.error('[PaymentService] PayPal: Credenciales no configuradas');
                return false;
            }

            const baseUrl = mode === 'live' 
                ? 'https://api-m.paypal.com'
                : 'https://api-m.sandbox.paypal.com';

            // Obtener access token
            const authResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: 'grant_type=client_credentials'
            });

            const authData = await authResponse.json();
            const accessToken = authData.access_token;

            // Verificar webhook
            const verifyResponse = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    auth_algo: req.headers['paypal-auth-algo'],
                    cert_url: req.headers['paypal-cert-url'],
                    transmission_id: req.headers['paypal-transmission-id'],
                    transmission_sig: req.headers['paypal-transmission-sig'],
                    transmission_time: req.headers['paypal-transmission-time'],
                    webhook_id: webhookId,
                    webhook_event: req.body
                })
            });

            const verifyData = await verifyResponse.json();
            return verifyData.verification_status === 'SUCCESS';
        } catch (error) {
            console.error('[PaymentService] PayPal: Error validando firma:', error.message);
            return false;
        }
    }

    /**
     * Procesar webhook de PayPal
     */
    static async processPayPalWebhook(req) {
        const logData = {
            provider: 'paypal',
            endpoint: '/api/webhooks/paypal',
            headers: req.headers,
            body: req.body,
            ipAddress: req.ip || req.connection?.remoteAddress,
            userAgent: req.headers['user-agent']
        };

        // 1. Validar firma
        const signatureValid = await this.validatePayPalSignature(req);
        logData.signatureValid = signatureValid;

        if (!signatureValid) {
            logData.processingResult = 'failed';
            logData.processingError = 'Invalid signature';
            await WebhookLog.create(logData);
            return { success: false, error: 'INVALID_SIGNATURE' };
        }

        // 2. Extraer datos
        const eventType = req.body.event_type;
        const resource = req.body.resource;

        // Eventos de pago de suscripción
        if (eventType === 'PAYMENT.SALE.COMPLETED') {
            const paymentId = resource.id;
            const subscriptionId = resource.billing_agreement_id;
            
            // Verificar duplicado
            const alreadyProcessed = await Payment.alreadyProcessed(paymentId);
            if (alreadyProcessed) {
                logData.processingResult = 'duplicate';
                await WebhookLog.create(logData);
                return { success: true, duplicate: true };
            }

            const result = await this.processApprovedPayment({
                provider: 'paypal',
                externalPaymentId: paymentId,
                amount: parseFloat(resource.amount?.total || 0),
                currency: resource.amount?.currency || 'USD',
                externalReference: subscriptionId,
                webhookData: req.body,
                signatureValid: true
            });

            logData.processingResult = result.success ? 'success' : 'failed';
            logData.paymentId = result.payment?._id;
        } else {
            logData.processingResult = 'skipped';
            logData.processingError = `Event type: ${eventType}`;
        }

        await WebhookLog.create(logData);
        return { success: true };
    }

    // ============================================
    // COMÚN
    // ============================================

    /**
     * Procesar pago aprobado (ambos proveedores)
     */
    static async processApprovedPayment(data) {
        try {
            const {
                provider,
                externalPaymentId,
                amount,
                currency,
                externalReference,
                payerEmail,
                webhookData,
                signatureValid
            } = data;

            // Buscar suscripción por external reference o email
            let subscription = await Subscription.findOne({ 
                externalSubscriptionId: externalReference 
            });

            if (!subscription && payerEmail) {
                // Buscar por email del usuario
                const User = require('../models/User');
                const user = await User.findOne({ email: payerEmail });
                if (user) {
                    subscription = await Subscription.findOne({ studentId: user._id });
                }
            }

            if (!subscription) {
                console.error('[PaymentService] No se encontró suscripción para:', externalReference || payerEmail);
                return { success: false, error: 'SUBSCRIPTION_NOT_FOUND' };
            }

            // Crear registro de pago
            const payment = await Payment.create({
                subscriptionId: subscription._id,
                provider,
                externalPaymentId,
                amount,
                currency,
                status: 'approved',
                webhookData,
                signatureValid,
                apiVerified: true
            });

            // Extender suscripción 30 días
            await subscription.extend(30);

            console.log(`[PaymentService] Pago procesado: ${externalPaymentId}, suscripción extendida`);
            return { success: true, payment, subscription };
        } catch (error) {
            console.error('[PaymentService] Error procesando pago:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Crear pago manual (profesor registra pago en efectivo/transferencia)
     */
    static async createManualPayment(data) {
        const { subscriptionId, amount, currency = 'ARS', notes } = data;

        const payment = await Payment.create({
            subscriptionId,
            provider: 'manual',
            externalPaymentId: `MANUAL-${Date.now()}`,
            amount,
            currency,
            status: 'approved',
            signatureValid: true,
            apiVerified: true,
            webhookData: { notes, manualEntry: true }
        });

        // Extender suscripción
        await SubscriptionService.extendSubscription(subscriptionId, 30);

        return payment;
    }

    /**
     * Obtener historial de pagos
     */
    static async getPaymentHistory(subscriptionId) {
        return Payment.getBySubscription(subscriptionId);
    }

    /**
     * Obtener estadísticas de webhooks (para admin)
     */
    static async getWebhookStats(hours = 24) {
        return WebhookLog.getStats(hours);
    }

    /**
     * Obtener actividad sospechosa
     */
    static async getSuspiciousActivity(hours = 24) {
        return WebhookLog.getSuspiciousActivity(hours);
    }
}

module.exports = PaymentService;
