/**
 * services/PayPalService.js
 * Servicio consolidado de PayPal para PianoLink.
 * 
 * Centraliza la lógica PayPal que estaba dispersa en:
 * - welcomeKitRoutes.js (getPayPalAccessToken, createOrder, captureOrder)
 * - PaymentService.js (webhook validation)
 * 
 * Un solo set de credenciales PayPal de PianoLink sirve para todo el mundo en USD.
 */

class PayPalService {

    /**
     * Obtener URL base según modo (sandbox/live)
     * @returns {string}
     */
    static getBaseUrl() {
        return process.env.PAYPAL_MODE === 'live'
            ? 'https://api-m.paypal.com'
            : 'https://api-m.sandbox.paypal.com';
    }

    /**
     * Verificar si PayPal está configurado
     * @returns {boolean}
     */
    static isConfigured() {
        return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
    }

    /**
     * Obtener access token de PayPal (OAuth2 Client Credentials)
     * @returns {string} Access token
     */
    static async getAccessToken() {
        if (!this.isConfigured()) {
            throw new Error('PayPal no está configurado. Faltan PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET');
        }

        const auth = Buffer.from(
            `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
        ).toString('base64');

        const baseUrl = this.getBaseUrl();

        const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`PayPal auth error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.access_token;
    }

    /**
     * Crear orden de pago en PayPal
     * @param {Object} params
     * @param {number} params.amount - Monto en centavos USD
     * @param {string} params.description - Descripción del item
     * @param {string} params.externalReference - Referencia externa
     * @param {string} params.returnUrl - URL de retorno tras pago exitoso
     * @param {string} params.cancelUrl - URL si el usuario cancela
     * @param {Object} params.metadata - Metadata adicional
     * @returns {Object} { orderId, approveUrl }
     */
    static async createOrder({ amount, description, externalReference, returnUrl, cancelUrl, metadata = {} }) {
        const accessToken = await this.getAccessToken();
        const baseUrl = this.getBaseUrl();
        
        // Convertir centavos a dólares con 2 decimales
        const amountUSD = (amount / 100).toFixed(2);

        const orderData = {
            intent: 'CAPTURE',
            purchase_units: [{
                reference_id: externalReference || `plink-${Date.now()}`,
                description: description || 'PianoLink',
                amount: {
                    currency_code: 'USD',
                    value: amountUSD
                },
                custom_id: JSON.stringify(metadata)
            }],
            application_context: {
                brand_name: 'PianoLink',
                landing_page: 'NO_PREFERENCE',
                user_action: 'PAY_NOW',
                ...(returnUrl && { return_url: returnUrl }),
                ...(cancelUrl && { cancel_url: cancelUrl })
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

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`PayPal createOrder error: ${response.status} - ${error}`);
        }

        const order = await response.json();

        // Extraer URL de aprobación
        const approveLink = order.links?.find(l => l.rel === 'approve');

        return {
            orderId: order.id,
            status: order.status,
            approveUrl: approveLink?.href || null,
            raw: order
        };
    }

    /**
     * Capturar pago de una orden aprobada
     * @param {string} orderId - ID de la orden PayPal
     * @returns {Object} Resultado de la captura
     */
    static async captureOrder(orderId) {
        const accessToken = await this.getAccessToken();
        const baseUrl = this.getBaseUrl();

        const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`PayPal captureOrder error: ${response.status} - ${error}`);
        }

        const capture = await response.json();
        const captureDetails = capture.purchase_units?.[0]?.payments?.captures?.[0];

        return {
            success: capture.status === 'COMPLETED',
            orderId: capture.id,
            status: capture.status,
            captureId: captureDetails?.id,
            amount: captureDetails?.amount?.value,
            currency: captureDetails?.amount?.currency_code || 'USD',
            raw: capture
        };
    }

    /**
     * Obtener detalles de una orden
     * @param {string} orderId
     * @returns {Object} Detalles de la orden
     */
    static async getOrderDetails(orderId) {
        const accessToken = await this.getAccessToken();
        const baseUrl = this.getBaseUrl();

        const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`PayPal getOrder error: ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Crear suscripción recurrente en PayPal
     * Para cobro mensual de membresía de profesor
     * @param {Object} params
     * @param {string} params.planId - ID del plan en PayPal (crear previamente en dashboard)
     * @param {string} params.subscriberEmail - Email del profesor
     * @param {string} params.returnUrl - URL de retorno
     * @param {string} params.cancelUrl - URL de cancelación
     * @param {Object} params.metadata - Datos adicionales
     * @returns {Object} { subscriptionId, approveUrl }
     */
    static async createSubscription({ planId, subscriberEmail, returnUrl, cancelUrl, metadata = {} }) {
        const accessToken = await this.getAccessToken();
        const baseUrl = this.getBaseUrl();

        const subscriptionData = {
            plan_id: planId,
            subscriber: {
                email_address: subscriberEmail
            },
            application_context: {
                brand_name: 'PianoLink',
                user_action: 'SUBSCRIBE_NOW',
                payment_method: {
                    payer_selected: 'PAYPAL',
                    payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED'
                },
                return_url: returnUrl,
                cancel_url: cancelUrl
            },
            custom_id: JSON.stringify(metadata)
        };

        const response = await fetch(`${baseUrl}/v1/billing/subscriptions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(subscriptionData)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`PayPal createSubscription error: ${response.status} - ${error}`);
        }

        const subscription = await response.json();
        const approveLink = subscription.links?.find(l => l.rel === 'approve');

        return {
            subscriptionId: subscription.id,
            status: subscription.status,
            approveUrl: approveLink?.href || null,
            raw: subscription
        };
    }

    /**
     * Verificar webhook de PayPal (validación de firma)
     * @param {Object} req - Express request
     * @returns {boolean} true si la firma es válida
     */
    static async verifyWebhook(req) {
        try {
            const accessToken = await this.getAccessToken();
            const baseUrl = this.getBaseUrl();
            const webhookId = process.env.PAYPAL_WEBHOOK_ID;

            if (!webhookId) {
                console.warn('[PayPalService] PAYPAL_WEBHOOK_ID no configurado, aceptando sin validar');
                return true;
            }

            const verifyData = {
                auth_algo: req.headers['paypal-auth-algo'],
                cert_url: req.headers['paypal-cert-url'],
                transmission_id: req.headers['paypal-transmission-id'],
                transmission_sig: req.headers['paypal-transmission-sig'],
                transmission_time: req.headers['paypal-transmission-time'],
                webhook_id: webhookId,
                webhook_event: req.body
            };

            const response = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(verifyData)
            });

            const result = await response.json();
            return result.verification_status === 'SUCCESS';
        } catch (error) {
            console.error('[PayPalService] Error verificando webhook:', error.message);
            return false;
        }
    }
}

module.exports = PayPalService;
