/**
 * services/PaymentProviderResolver.js
 * Punto único de decisión para todos los checkouts de PianoLink.
 * 
 * Resuelve si usar MercadoPago o PayPal según el país del pagador.
 * Todos los checkouts (clases, membresías, kits, early bird) deben pasar por aquí.
 * 
 * Regla:
 *   - País ∈ {CL, MX, AR, CO, BR, PE, UY} → MercadoPago (moneda local)
 *   - Resto del mundo → PayPal (USD)
 */

const MpCredentials = require('../models/MpCredentials');

// Países soportados por MercadoPago
const MP_COUNTRIES = ['CL', 'MX', 'AR', 'CO', 'BR', 'PE', 'UY'];

// Mapeo país → moneda
const COUNTRY_CURRENCY = {
    CL: 'CLP',
    MX: 'MXN',
    AR: 'ARS',
    CO: 'COP',
    BR: 'BRL',
    PE: 'PEN',
    UY: 'UYU'
};

class PaymentProviderResolver {

    /**
     * Resolver proveedor de pago según país del pagador
     * @param {string} payerCountry - Código ISO del país (CL, MX, US, ES, etc.)
     * @param {Object} context - Contexto del checkout
     * @param {string} context.type - Tipo de checkout: 'class_payment', 'membership', 'kit_purchase', 'early_bird_kit'
     * @param {string} context.teacherCountry - País del profesor (para cobros de clases)
     * @returns {Object} { provider, currency, credentials, countryCode }
     */
    static async resolve(payerCountry, context = {}) {
        // Para cobros de clases: usar país del PROFESOR (no del alumno)
        // Para membresía: usar país del PROFESOR (él mismo paga)
        // Para kit: usar país del CLIENTE
        let effectiveCountry = payerCountry;
        
        if (context.type === 'class_payment' && context.teacherCountry) {
            effectiveCountry = context.teacherCountry;
        }

        const countryCode = (effectiveCountry || '').toUpperCase();

        // ¿País soportado por MercadoPago?
        if (MP_COUNTRIES.includes(countryCode)) {
            return await this._resolveMercadoPago(countryCode, context);
        }

        // Fallback: PayPal en USD
        return this._resolvePayPal(countryCode, context);
    }

    /**
     * Resolver para MercadoPago
     * @private
     */
    static async _resolveMercadoPago(countryCode, context) {
        try {
            // Buscar credenciales activas para el país
            const creds = await MpCredentials.getByCountry(countryCode);

            if (!creds) {
                // País de MP pero sin credenciales configuradas → fallback a PayPal
                console.warn(`[PaymentProviderResolver] País ${countryCode} es MP pero sin credenciales activas. Usando PayPal.`);
                return this._resolvePayPal(countryCode, context);
            }

            return {
                provider: 'mercadopago',
                currency: creds.currency,
                countryCode,
                credentials: {
                    accessToken: creds.accessToken,
                    publicKey: creds.publicKey,
                    collectorEmail: creds.collector?.email,
                    collectorUserId: creds.collector?.userId,
                    webhookSecret: creds.webhookSecret
                },
                payout: {
                    enabled: creds.payout?.enabled || false,
                    method: creds.payout?.method || 'account_money',
                    minAmount: creds.payout?.minPayoutAmount || 0,
                    maxAmount: creds.payout?.maxPayoutAmount || 0,
                    currency: creds.payout?.payoutCurrency || creds.currency
                }
            };
        } catch (error) {
            console.error(`[PaymentProviderResolver] Error resolviendo MP para ${countryCode}:`, error.message);
            // Fallback a PayPal en caso de error
            return this._resolvePayPal(countryCode, context);
        }
    }

    /**
     * Resolver para PayPal
     * @private
     */
    static _resolvePayPal(countryCode, context) {
        return {
            provider: 'paypal',
            currency: 'USD',
            countryCode,
            credentials: {
                clientId: process.env.PAYPAL_CLIENT_ID,
                clientSecret: process.env.PAYPAL_CLIENT_SECRET,
                mode: process.env.PAYPAL_MODE || 'sandbox'
            },
            payout: {
                enabled: true,
                method: 'paypal',
                currency: 'USD'
            }
        };
    }

    /**
     * Verificar si un país usa MercadoPago
     * @param {string} countryCode
     * @returns {boolean}
     */
    static isMpCountry(countryCode) {
        return MP_COUNTRIES.includes((countryCode || '').toUpperCase());
    }

    /**
     * Obtener moneda local de un país MP
     * @param {string} countryCode
     * @returns {string|null}
     */
    static getCurrency(countryCode) {
        return COUNTRY_CURRENCY[(countryCode || '').toUpperCase()] || null;
    }

    /**
     * Listar países MP soportados
     * @returns {string[]}
     */
    static getSupportedMpCountries() {
        return [...MP_COUNTRIES];
    }

    /**
     * Resolver proveedor para cobro de membresía de profesor
     * Shortcut: el pagador ES el profesor
     * @param {Object} teacher - Documento del profesor
     * @returns {Object} Resultado de resolve()
     */
    static async resolveForMembership(teacher) {
        const country = teacher.country || teacher.teacherData?.paymentInfo?.country || 'DEFAULT';
        return this.resolve(country, { type: 'membership' });
    }

    /**
     * Resolver proveedor para cobro de clase
     * @param {Object} teacher - Documento del profesor asignado
     * @returns {Object} Resultado de resolve()
     */
    static async resolveForClassPayment(teacher) {
        const teacherCountry = teacher.country || teacher.teacherData?.paymentInfo?.country || 'DEFAULT';
        return this.resolve(teacherCountry, { type: 'class_payment', teacherCountry });
    }

    /**
     * Resolver proveedor para kit
     * @param {string} clientCountry - País del cliente
     * @returns {Object} Resultado de resolve()
     */
    static async resolveForKit(clientCountry) {
        return this.resolve(clientCountry, { type: 'kit_purchase' });
    }

    /**
     * Resolver proveedor para Early Bird Kit (Fase 5 v5.0)
     * El país que determina el proveedor es el del lead (IP o selección en form)
     * @param {string} leadCountry - País del lead
     * @returns {Object} Resultado de resolve()
     */
    static async resolveForEarlyBird(leadCountry) {
        return this.resolve(leadCountry, { type: 'early_bird_kit' });
    }
}

module.exports = PaymentProviderResolver;
