/**
 * crm/services/CrmGoogleAdsService.js
 * Integración con Google Ads Offline Conversions API.
 * 
 * Sube conversiones offline (pagos, suscripciones) a Google Ads
 * usando Enhanced Conversions para mejorar la atribución.
 * 
 * DISEÑO RAM-FRIENDLY:
 * - Lazy-load desde CrmTrackingDispatcher
 * - OAuth2 tokens se renuevan on-demand, no se cachean en memory
 * - Lotes de máx. BATCH_SIZE conversiones
 * - HTTP nativo (https module)
 */
const crypto = require('crypto');
const https = require('https');

const BATCH_SIZE = 50;

class CrmGoogleAdsService {

    /**
     * Verifica que las variables de entorno estén configuradas
     */
    static isConfigured() {
        return !!(
            process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
            process.env.GOOGLE_ADS_CUSTOMER_ID &&
            process.env.GOOGLE_ADS_CLIENT_ID &&
            process.env.GOOGLE_ADS_CLIENT_SECRET &&
            process.env.GOOGLE_ADS_REFRESH_TOKEN
        );
    }

    /**
     * Envía un lote de conversiones a Google Ads Offline Conversions.
     * @param {Array} conversions — CrmConversion con leadRef populado
     * @returns {Object} { sent, errors, details }
     */
    static async sendBatch(conversions) {
        if (!this.isConfigured()) {
            return { sent: 0, errors: 0, details: [], skipped: true, reason: 'Google Ads API no configurada' };
        }

        if (!conversions || conversions.length === 0) {
            return { sent: 0, errors: 0, details: [] };
        }

        const results = { sent: 0, errors: 0, details: [] };

        // Obtener access token fresco
        let accessToken;
        try {
            accessToken = await this._getAccessToken();
        } catch (err) {
            console.error('[CRM Google Ads] Error obteniendo access token:', err.message);
            return { sent: 0, errors: conversions.length, details: [{ error: 'Auth failed: ' + err.message }] };
        }

        // Procesar en sub-lotes
        for (let i = 0; i < conversions.length; i += BATCH_SIZE) {
            const batch = conversions.slice(i, i + BATCH_SIZE);
            const clickConversions = batch
                .map(conv => this._conversionToGoogleFormat(conv))
                .filter(Boolean);

            if (clickConversions.length === 0) continue;

            try {
                const response = await this._uploadConversions(clickConversions, accessToken);
                const successCount = response.results?.length || 0;
                results.sent += successCount;
                results.errors += (clickConversions.length - successCount);
                results.details.push({
                    batch: Math.floor(i / BATCH_SIZE) + 1,
                    sent: successCount,
                    partialErrors: response.partialFailureError || null
                });
            } catch (err) {
                results.errors += batch.length;
                results.details.push({ batch: Math.floor(i / BATCH_SIZE) + 1, error: err.message });
                console.error(`[CRM Google Ads] Error en batch ${Math.floor(i / BATCH_SIZE) + 1}:`, err.message);
            }
        }

        return results;
    }

    /**
     * Envía una conversión individual.
     */
    static async sendSingle(conversion) {
        if (!this.isConfigured()) {
            return { success: false, reason: 'Google Ads API no configurada' };
        }

        const formatted = this._conversionToGoogleFormat(conversion);
        if (!formatted) return { success: false, reason: 'Conversión no mapeada' };

        try {
            const accessToken = await this._getAccessToken();
            const response = await this._uploadConversions([formatted], accessToken);
            const success = (response.results?.length || 0) > 0;
            return { success, conversionId: conversion._id.toString() };
        } catch (err) {
            console.error('[CRM Google Ads] Error enviando conversión:', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Mapea CrmConversion al formato de Google Ads ClickConversion.
     * @private
     */
    static _conversionToGoogleFormat(conversion) {
        // Solo conversiones con valor o eventos clave
        const actionMap = {
            'lead_capture': 'PianoLink - Lead',
            'demo_scheduled': 'PianoLink - Demo',
            'first_class': 'PianoLink - Purchase',
            'subscription': 'PianoLink - Subscription',
            'kit_purchase': 'PianoLink - Purchase',
            'class_purchase': 'PianoLink - Purchase'
        };

        const conversionAction = actionMap[conversion.type];
        if (!conversionAction) return null;

        const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, '');
        const lead = conversion.leadRef || {};
        const externalIds = lead.externalIds || {};

        const clickConversion = {
            conversionAction: `customers/${customerId}/conversionActions/${conversionAction}`,
            conversionDateTime: this._formatGoogleDateTime(conversion.timestamp),
            orderId: conversion._id.toString()
        };

        // Si tenemos gclid, usarlo directamente (mejor atribución)
        if (externalIds.gClickId) {
            clickConversion.gclid = externalIds.gClickId;
        }

        // Enhanced Conversions: datos hasheados del usuario
        const userIdentifiers = [];
        if (lead.leadRef && typeof lead.leadRef === 'object') {
            if (lead.leadRef.email) {
                userIdentifiers.push({
                    hashedEmail: this._sha256(lead.leadRef.email.toLowerCase().trim())
                });
            }
            if (lead.leadRef.phone) {
                userIdentifiers.push({
                    hashedPhoneNumber: this._sha256('+' + lead.leadRef.phone.replace(/[^0-9]/g, ''))
                });
            }
        }

        if (userIdentifiers.length > 0) {
            clickConversion.userIdentifiers = userIdentifiers;
        }

        // Valor monetario
        if (conversion.value > 0) {
            clickConversion.conversionValue = conversion.value / 100;
            clickConversion.currencyCode = conversion.currency || 'USD';
        }

        return clickConversion;
    }

    /**
     * Formatea DateTime al formato esperado por Google Ads: "yyyy-mm-dd hh:mm:ss+|-hh:mm"
     * @private
     */
    static _formatGoogleDateTime(date) {
        const d = new Date(date);
        return d.toISOString().replace('T', ' ').replace('Z', '+00:00').substring(0, 25) + '00:00';
    }

    /**
     * Obtiene un access token fresco usando el refresh token.
     * No se cachea en memoria — cada ejecución del cron renueva.
     * @private
     */
    static _getAccessToken() {
        return new Promise((resolve, reject) => {
            const body = new URLSearchParams({
                client_id: process.env.GOOGLE_ADS_CLIENT_ID,
                client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
                refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
                grant_type: 'refresh_token'
            }).toString();

            const options = {
                hostname: 'oauth2.googleapis.com',
                port: 443,
                path: '/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(body)
                },
                timeout: 10000
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.access_token) {
                            resolve(parsed.access_token);
                        } else {
                            reject(new Error(parsed.error_description || 'No access_token en respuesta'));
                        }
                    } catch {
                        reject(new Error('Respuesta OAuth2 inválida'));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('OAuth2 timeout')); });
            req.write(body);
            req.end();
        });
    }

    /**
     * Sube conversiones click a Google Ads API.
     * @private
     */
    static _uploadConversions(clickConversions, accessToken) {
        return new Promise((resolve, reject) => {
            const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, '');
            const body = JSON.stringify({
                conversions: clickConversions,
                partialFailure: true
            });

            const options = {
                hostname: 'googleads.googleapis.com',
                port: 443,
                path: `/v16/customers/${customerId}:uploadClickConversions`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    'Authorization': `Bearer ${accessToken}`,
                    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
                    'login-customer-id': customerId
                },
                timeout: 15000
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (res.statusCode >= 400) {
                            reject(new Error(`Google Ads API ${res.statusCode}: ${parsed.error?.message || data.substring(0, 300)}`));
                        } else {
                            resolve(parsed);
                        }
                    } catch {
                        reject(new Error(`Google Ads API respuesta inválida: ${data.substring(0, 200)}`));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Google Ads API timeout (15s)')); });
            req.write(body);
            req.end();
        });
    }

    /**
     * SHA-256 hash.
     * @private
     */
    static _sha256(value) {
        if (!value) return '';
        return crypto.createHash('sha256').update(value).digest('hex');
    }
}

module.exports = CrmGoogleAdsService;
