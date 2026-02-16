/**
 * services/MpCountryRouter.js
 * Enruta checkouts, webhooks y payouts de MercadoPago por país.
 * 
 * Gestiona:
 * - Creación de preferencias de pago por país
 * - Validación de webhooks con secreto por país
 * - Transferencias/payouts a profesores con token del país correcto
 * - Cache de credenciales en memoria
 * - Consulta de saldos por país
 */

const axios = require('axios');
const MpCredentials = require('../models/MpCredentials');

class MpCountryRouter {

    // Cache de credenciales por país (TTL: 5 min)
    static _credentialsCache = new Map();
    static _cacheTTL = 5 * 60 * 1000;

    // ==================== CREDENCIALES ====================

    /**
     * Obtener credenciales de MP para un país (con cache)
     * @param {string} countryCode - Código ISO (CL, MX, AR, etc.)
     * @returns {Object|null} Credenciales o null si no está configurado
     */
    static async getCredentials(countryCode) {
        const code = (countryCode || '').toUpperCase();
        const now = Date.now();

        // Verificar cache
        const cached = this._credentialsCache.get(code);
        if (cached && cached.expiresAt > now) {
            return cached.data;
        }

        // Buscar en DB
        const creds = await MpCredentials.getByCountry(code);

        if (creds) {
            // Guardar en cache
            this._credentialsCache.set(code, {
                data: creds,
                expiresAt: now + this._cacheTTL
            });
        }

        return creds;
    }

    /**
     * Invalidar cache de credenciales (para recarga)
     * @param {string} countryCode - Código del país, o null para limpiar todo
     */
    static invalidateCache(countryCode = null) {
        if (countryCode) {
            this._credentialsCache.delete(countryCode.toUpperCase());
        } else {
            this._credentialsCache.clear();
        }
    }

    // ==================== COBROS (PREFERENCIAS) ====================

    /**
     * Crear preferencia de pago en MercadoPago para un país específico
     * @param {string} countryCode - País del checkout
     * @param {Array} items - Items del checkout [{title, quantity, unit_price, currency_id}]
     * @param {Object} metadata - Metadata adicional para la preferencia
     * @param {Object} options - back_urls, notification_url, external_reference, etc.
     * @returns {Object} Preferencia creada
     */
    static async createPreference(countryCode, items, metadata = {}, options = {}) {
        const creds = await this.getCredentials(countryCode);
        
        if (!creds) {
            throw new Error(`No hay credenciales MP activas para ${countryCode}`);
        }

        // Inyectar country en notification_url para que el webhook sepa qué token usar
        let notificationUrl = options.notification_url || process.env.MP_WEBHOOK_URL || '';
        if (notificationUrl && !notificationUrl.includes('country=')) {
            const separator = notificationUrl.includes('?') ? '&' : '?';
            notificationUrl = `${notificationUrl}${separator}country=${countryCode}`;
        }

        const preferenceData = {
            items: items.map(item => ({
                ...item,
                currency_id: item.currency_id || creds.currency
            })),
            metadata: {
                ...metadata,
                country: countryCode
            },
            back_urls: options.back_urls || {},
            notification_url: notificationUrl,
            external_reference: options.external_reference || '',
            auto_return: options.auto_return || 'approved',
            statement_descriptor: options.statement_descriptor || 'PIANOLINK'
        };

        try {
            const response = await axios.post(
                'https://api.mercadopago.com/checkout/preferences',
                preferenceData,
                {
                    headers: {
                        'Authorization': `Bearer ${creds.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log(`[MpCountryRouter] Preferencia creada para ${countryCode}: ${response.data.id}`);

            return {
                success: true,
                preferenceId: response.data.id,
                initPoint: response.data.init_point,
                sandboxInitPoint: response.data.sandbox_init_point,
                country: countryCode,
                currency: creds.currency
            };
        } catch (error) {
            const errorData = error.response?.data;
            console.error(`[MpCountryRouter] Error creando preferencia (${countryCode}):`, errorData || error.message);
            throw new Error(errorData?.message || error.message);
        }
    }

    // ==================== WEBHOOKS ====================

    /**
     * Validar firma de webhook de MercadoPago para un país
     * @param {string} countryCode - País del webhook (viene en ?country=XX)
     * @param {Object} req - Express request
     * @returns {boolean} true si la firma es válida
     */
    static async validateWebhook(countryCode, req) {
        const creds = await this.getCredentials(countryCode);
        
        if (!creds || !creds.webhookSecret) {
            // Sin secreto configurado → aceptar (legacy behavior)
            console.warn(`[MpCountryRouter] Sin webhookSecret para ${countryCode}, aceptando sin validar`);
            return true;
        }

        try {
            const crypto = require('crypto');
            const xSignature = req.headers['x-signature'];
            const xRequestId = req.headers['x-request-id'];

            if (!xSignature) return false;

            // Formato: ts=xxx,v1=xxx
            const parts = xSignature.split(',');
            const ts = parts.find(p => p.startsWith('ts='))?.split('=')[1];
            const v1 = parts.find(p => p.startsWith('v1='))?.split('=')[1];

            if (!ts || !v1) return false;

            const manifest = `id:${req.body?.data?.id || req.query?.['data.id'] || ''};request-id:${xRequestId || ''};ts:${ts};`;
            const hmac = crypto.createHmac('sha256', creds.webhookSecret).update(manifest).digest('hex');

            return hmac === v1;
        } catch (error) {
            console.error(`[MpCountryRouter] Error validando webhook (${countryCode}):`, error.message);
            return false;
        }
    }

    /**
     * Obtener datos de un pago de MP usando el token del país correcto
     * @param {string} countryCode
     * @param {string} paymentId
     * @returns {Object} Datos del pago
     */
    static async getPaymentDetails(countryCode, paymentId) {
        const creds = await this.getCredentials(countryCode);
        
        if (!creds) {
            // Fallback: intentar con token global de .env
            const globalToken = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
            if (!globalToken) {
                throw new Error(`Sin credenciales MP para ${countryCode}`);
            }
            
            const response = await axios.get(
                `https://api.mercadopago.com/v1/payments/${paymentId}`,
                { headers: { 'Authorization': `Bearer ${globalToken}` } }
            );
            return response.data;
        }

        const response = await axios.get(
            `https://api.mercadopago.com/v1/payments/${paymentId}`,
            { headers: { 'Authorization': `Bearer ${creds.accessToken}` } }
        );
        return response.data;
    }

    // ==================== PAYOUTS (TRANSFERENCIAS A PROFESORES) ====================

    /**
     * Transferir dinero a un profesor usando el token del país correcto
     * @param {string} countryCode - País del profesor
     * @param {Object} params
     * @param {string} params.recipientEmail - Email de cuenta MP del profesor
     * @param {number} params.amount - Monto en moneda local (unidades, NO centavos)
     * @param {string} params.currency - Moneda (CLP, MXN, etc.)
     * @param {string} params.reference - Referencia externa (payout ID)
     * @param {string} params.description - Descripción del pago
     * @returns {Object} Resultado de la transferencia
     */
    static async transferToTeacher(countryCode, { recipientEmail, amount, currency, reference, description }) {
        const creds = await this.getCredentials(countryCode);
        
        if (!creds) {
            throw new Error(`Sin credenciales MP activas para ${countryCode}`);
        }

        // Verificar que payouts están habilitados
        if (!creds.payout?.enabled) {
            throw new Error(`Payouts no habilitados para ${countryCode}`);
        }

        // Verificar límites
        const amountInLocalCurrency = amount; // Ya viene en unidades
        if (creds.payout.minPayoutAmount && amountInLocalCurrency < creds.payout.minPayoutAmount) {
            throw new Error(`Monto ${amountInLocalCurrency} menor al mínimo ${creds.payout.minPayoutAmount} para ${countryCode}`);
        }
        if (creds.payout.maxPayoutAmount && amountInLocalCurrency > creds.payout.maxPayoutAmount) {
            throw new Error(`Monto ${amountInLocalCurrency} mayor al máximo ${creds.payout.maxPayoutAmount} para ${countryCode}`);
        }

        try {
            const response = await axios.post(
                'https://api.mercadopago.com/v1/payments',
                {
                    transaction_amount: amountInLocalCurrency,
                    description: description || 'Pago PianoLink',
                    payment_method_id: creds.payout.method || 'account_money',
                    payer: { email: recipientEmail },
                    external_reference: reference,
                    additional_info: {
                        payer: { first_name: 'PianoLink', last_name: 'Platform' }
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${creds.accessToken}`,
                        'Content-Type': 'application/json',
                        'X-Idempotency-Key': `payout-${reference}-${Date.now()}`
                    }
                }
            );

            const result = response.data;
            console.log(`[MpCountryRouter] Payout ${countryCode}: ${result.id} → ${recipientEmail} (${amountInLocalCurrency} ${creds.currency})`);

            return {
                success: true,
                transferId: result.id.toString(),
                status: result.status,
                statusDetail: result.status_detail,
                amount: amountInLocalCurrency,
                currency: result.currency_id || creds.currency,
                recipient: recipientEmail,
                country: countryCode,
                createdAt: result.date_created,
                raw: result
            };
        } catch (error) {
            const errorData = error.response?.data;
            console.error(`[MpCountryRouter] Error en payout (${countryCode}):`, errorData || error.message);

            if (errorData?.cause) {
                const causes = errorData.cause.map(c => c.description || c.code).join(', ');
                throw new Error(`MercadoPago ${countryCode}: ${causes}`);
            }
            throw new Error(errorData?.message || error.message);
        }
    }

    /**
     * Consultar estado de una transferencia
     * @param {string} countryCode
     * @param {string} transferId
     * @returns {Object}
     */
    static async getPayoutStatus(countryCode, transferId) {
        const creds = await this.getCredentials(countryCode);
        
        if (!creds) {
            throw new Error(`Sin credenciales MP para ${countryCode}`);
        }

        const response = await axios.get(
            `https://api.mercadopago.com/v1/payments/${transferId}`,
            { headers: { 'Authorization': `Bearer ${creds.accessToken}` } }
        );

        return {
            success: true,
            status: response.data.status,
            statusDetail: response.data.status_detail,
            amount: response.data.transaction_amount,
            currency: response.data.currency_id,
            country: countryCode
        };
    }

    // ==================== UTILIDADES ====================

    /**
     * Obtener saldo de la cuenta PianoLink en un país
     * @param {string} countryCode
     * @returns {Object|null}
     */
    static async getAccountBalance(countryCode) {
        const creds = await this.getCredentials(countryCode);
        
        if (!creds) return null;

        try {
            const userResponse = await axios.get(
                'https://api.mercadopago.com/users/me',
                { headers: { 'Authorization': `Bearer ${creds.accessToken}` } }
            );

            const balanceResponse = await axios.get(
                `https://api.mercadopago.com/users/${userResponse.data.id}/mercadopago_account/balance`,
                { headers: { 'Authorization': `Bearer ${creds.accessToken}` } }
            );

            return {
                success: true,
                country: countryCode,
                currency: balanceResponse.data.currency_id,
                availableBalance: balanceResponse.data.available_balance,
                totalBalance: balanceResponse.data.total_amount
            };
        } catch (error) {
            console.error(`[MpCountryRouter] Error obteniendo saldo ${countryCode}:`, error.message);
            return null;
        }
    }

    /**
     * Listar países soportados con MP activo
     * @returns {Array} Lista de países con info resumida
     */
    static async getSupportedCountries() {
        return await MpCredentials.getActiveCountries();
    }

    /**
     * Listar países donde payouts están habilitados
     * @returns {Array}
     */
    static async getCountriesWithPayoutEnabled() {
        return await MpCredentials.getPayoutEnabledCountries();
    }

    /**
     * Convertir monto de moneda local a USD (aproximado)
     * Usa tasas de cambio estáticas — actualizar diariamente vía cron
     * @param {number} amount - Monto en moneda local
     * @param {string} currency - Código de moneda (CLP, MXN, etc.)
     * @returns {number} Monto equivalente en centavos USD
     */
    static convertToUSD(amount, currency) {
        // Tasas de cambio aproximadas (actualizar vía cron o API)
        // Guardadas como "cuántas unidades de moneda local = 1 USD"
        const rates = this._exchangeRates || {
            CLP: 950,
            MXN: 17.5,
            ARS: 900,
            COP: 4100,
            BRL: 5.0,
            PEN: 3.75,
            UYU: 40,
            USD: 1
        };

        const rate = rates[currency?.toUpperCase()];
        if (!rate) {
            console.warn(`[MpCountryRouter] Tasa de cambio no encontrada para ${currency}, usando 1:1`);
            return amount;
        }

        // Convertir a USD (centavos)
        return Math.round((amount / rate) * 100);
    }

    /**
     * Actualizar tasas de cambio
     * @param {Object} rates - Mapa { CLP: 950, MXN: 17.5, ... }
     */
    static updateExchangeRates(rates) {
        this._exchangeRates = rates;
        console.log('[MpCountryRouter] Tasas de cambio actualizadas:', Object.keys(rates).join(', '));
    }
}

module.exports = MpCountryRouter;
