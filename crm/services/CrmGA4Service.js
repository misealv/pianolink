/**
 * crm/services/CrmGA4Service.js
 * Integración con Google Analytics 4 Measurement Protocol.
 * 
 * Envía eventos server-side a GA4 para atribución cross-device
 * y métricas de conversión independientes de cookies del navegador.
 * 
 * DISEÑO RAM-FRIENDLY:
 * - Lazy-load, sin estado entre llamadas
 * - HTTP nativo, sin dependencias externas
 * - Lotes pequeños (GA4 acepta máx. 25 eventos por request)
 */
const https = require('https');

const BATCH_SIZE = 25; // Límite real de GA4 Measurement Protocol

class CrmGA4Service {

    /**
     * Verifica que las variables de entorno estén configuradas
     */
    static isConfigured() {
        return !!(process.env.GA4_MEASUREMENT_ID && process.env.GA4_API_SECRET);
    }

    /**
     * Envía un lote de conversiones a GA4.
     * @param {Array} conversions — CrmConversion con leadRef populado
     * @returns {Object} { sent, errors, details }
     */
    static async sendBatch(conversions) {
        if (!this.isConfigured()) {
            return { sent: 0, errors: 0, details: [], skipped: true, reason: 'GA4 no configurado' };
        }

        if (!conversions || conversions.length === 0) {
            return { sent: 0, errors: 0, details: [] };
        }

        const results = { sent: 0, errors: 0, details: [] };

        for (let i = 0; i < conversions.length; i += BATCH_SIZE) {
            const batch = conversions.slice(i, i + BATCH_SIZE);
            
            // GA4 Measurement Protocol requiere un client_id por request,
            // así que agrupamos por client_id (gClientId del lead)
            const grouped = this._groupByClient(batch);

            for (const [clientId, convs] of Object.entries(grouped)) {
                const events = convs
                    .map(conv => this._conversionToGA4Event(conv))
                    .filter(Boolean);

                if (events.length === 0) continue;

                try {
                    await this._postEvents(clientId, events);
                    results.sent += events.length;
                } catch (err) {
                    results.errors += events.length;
                    results.details.push({ clientId, error: err.message });
                    console.error('[CRM GA4] Error:', err.message);
                }
            }
        }

        return results;
    }

    /**
     * Envía un evento individual a GA4.
     */
    static async sendSingle(conversion) {
        if (!this.isConfigured()) {
            return { success: false, reason: 'GA4 no configurado' };
        }

        const event = this._conversionToGA4Event(conversion);
        if (!event) return { success: false, reason: 'Evento no mapeado' };

        const clientId = this._getClientId(conversion);

        try {
            await this._postEvents(clientId, [event]);
            return { success: true };
        } catch (err) {
            console.error('[CRM GA4] Error enviando evento:', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Agrupa conversiones por client_id de Google Analytics.
     * @private
     */
    static _groupByClient(conversions) {
        const groups = {};
        for (const conv of conversions) {
            const clientId = this._getClientId(conv);
            if (!groups[clientId]) groups[clientId] = [];
            groups[clientId].push(conv);
        }
        return groups;
    }

    /**
     * Extrae o genera un client_id para GA4.
     * @private
     */
    static _getClientId(conversion) {
        const lead = conversion.leadRef || {};
        const externalIds = lead.externalIds || {};
        // Usar gClientId si existe, sino generar uno basado en el ID del lead
        return externalIds.gClientId || `crm.${(lead._id || conversion.leadRef || 'unknown').toString()}`;
    }

    /**
     * Mapea CrmConversion a evento GA4.
     * @private
     */
    static _conversionToGA4Event(conversion) {
        const eventMap = {
            'lead_capture': 'generate_lead',
            'demo_scheduled': 'begin_checkout',
            'demo_completed': 'begin_checkout',
            'first_class': 'purchase',
            'subscription': 'purchase',
            'kit_purchase': 'purchase',
            'class_purchase': 'purchase',
            'referral': 'generate_lead'
        };

        const eventName = eventMap[conversion.type];
        if (!eventName) return null;

        const event = {
            name: eventName,
            params: {
                engagement_time_msec: 1, // Requerido por GA4
                session_id: conversion._id.toString().substring(0, 10),
                conversion_type: conversion.type,
                source: 'server'
            }
        };

        // Parámetros de valor (para purchase y subscribe)
        if (conversion.value > 0) {
            event.params.currency = conversion.currency || 'USD';
            event.params.value = conversion.value / 100;
        }

        // Parámetros de atribución
        if (conversion.campaignId) {
            event.params.campaign_id = conversion.campaignId.toString();
        }
        if (conversion.attribution) {
            event.params.attribution_model = conversion.attribution.model || 'last_touch';
            event.params.attribution_channel = conversion.attribution.channel || '';
        }

        return event;
    }

    /**
     * Envía eventos a GA4 Measurement Protocol via HTTPS.
     * @private
     */
    static _postEvents(clientId, events) {
        return new Promise((resolve, reject) => {
            const measurementId = process.env.GA4_MEASUREMENT_ID;
            const apiSecret = process.env.GA4_API_SECRET;

            const body = JSON.stringify({
                client_id: clientId,
                events: events,
                timestamp_micros: Date.now() * 1000
            });

            const path = `/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;

            const options = {
                hostname: 'www.google-analytics.com',
                port: 443,
                path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                },
                timeout: 10000
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    // GA4 Measurement Protocol devuelve 204 No Content en éxito
                    if (res.statusCode === 204 || res.statusCode === 200) {
                        resolve({ success: true });
                    } else {
                        reject(new Error(`GA4 API ${res.statusCode}: ${data.substring(0, 200)}`));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('GA4 API timeout (10s)')); });
            req.write(body);
            req.end();
        });
    }

    /**
     * Valida eventos contra el endpoint de debug de GA4.
     * Útil para testing — no envía datos reales.
     * @param {string} clientId
     * @param {Array} events
     * @returns {Object} Resultado de validación
     */
    static async validateEvents(clientId, events) {
        if (!this.isConfigured()) {
            return { success: false, reason: 'GA4 no configurado' };
        }

        return new Promise((resolve, reject) => {
            const measurementId = process.env.GA4_MEASUREMENT_ID;
            const apiSecret = process.env.GA4_API_SECRET;

            const body = JSON.stringify({
                client_id: clientId,
                events: events
            });

            const path = `/debug/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;

            const options = {
                hostname: 'www.google-analytics.com',
                port: 443,
                path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                },
                timeout: 10000
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        resolve({ raw: data });
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('GA4 debug timeout')); });
            req.write(body);
            req.end();
        });
    }
}

module.exports = CrmGA4Service;
