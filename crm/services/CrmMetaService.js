/**
 * crm/services/CrmMetaService.js
 * Integración con Meta Conversions API (server-side tracking).
 * 
 * Envía conversiones directamente al servidor de Meta para evitar
 * pérdida por bloqueadores de anuncios y Safari ITP.
 * 
 * DISEÑO RAM-FRIENDLY:
 * - Se carga solo bajo demanda (lazy-load desde CrmTrackingDispatcher)
 * - Procesa en lotes de máx. BATCH_SIZE conversiones
 * - No mantiene estado en memoria entre ejecuciones
 * - HTTP nativo (https module) para evitar dependencias pesadas
 */
const crypto = require('crypto');
const https = require('https');

// Configuración
const BATCH_SIZE = 25; // Máximo de eventos por request a Meta (límite real: 1000)
const API_VERSION = 'v19.0';

class CrmMetaService {

    /**
     * Verifica que las variables de entorno estén configuradas
     */
    static isConfigured() {
        return !!(process.env.META_PIXEL_ID && process.env.META_ACCESS_TOKEN);
    }

    /**
     * Envía un lote de conversiones pendientes a Meta Conversions API.
     * @param {Array} conversions — Documentos CrmConversion con leadRef populado
     * @returns {Object} { sent: number, errors: number, details: Array }
     */
    static async sendBatch(conversions) {
        if (!this.isConfigured()) {
            return { sent: 0, errors: 0, details: [], skipped: true, reason: 'Meta API no configurada' };
        }

        if (!conversions || conversions.length === 0) {
            return { sent: 0, errors: 0, details: [] };
        }

        const results = { sent: 0, errors: 0, details: [] };

        // Procesar en sub-lotes para no exceder límites
        for (let i = 0; i < conversions.length; i += BATCH_SIZE) {
            const batch = conversions.slice(i, i + BATCH_SIZE);
            const events = batch
                .map(conv => this._conversionToMetaEvent(conv))
                .filter(Boolean);

            if (events.length === 0) continue;

            try {
                const response = await this._postEvents(events);
                
                if (response.events_received) {
                    results.sent += response.events_received;
                    // Marcar como enviadas
                    const ids = batch.slice(0, response.events_received).map(c => c._id);
                    results.details.push({ batch: Math.floor(i / BATCH_SIZE) + 1, sent: response.events_received });
                } else {
                    results.errors += batch.length;
                    results.details.push({ batch: Math.floor(i / BATCH_SIZE) + 1, error: response.error || 'Sin respuesta' });
                }
            } catch (err) {
                results.errors += batch.length;
                results.details.push({ batch: Math.floor(i / BATCH_SIZE) + 1, error: err.message });
                console.error(`[CRM Meta] Error en batch ${Math.floor(i / BATCH_SIZE) + 1}:`, err.message);
            }
        }

        return results;
    }

    /**
     * Envía un evento individual a Meta (para conversiones en tiempo real).
     * @param {Object} conversion — CrmConversion con leadRef populado
     * @returns {Object} { success, eventId?, error? }
     */
    static async sendSingle(conversion) {
        if (!this.isConfigured()) {
            return { success: false, reason: 'Meta API no configurada' };
        }

        const event = this._conversionToMetaEvent(conversion);
        if (!event) return { success: false, reason: 'Conversión no mapeada' };

        try {
            const response = await this._postEvents([event]);
            if (response.events_received === 1) {
                return { success: true, eventId: event.event_id };
            }
            return { success: false, error: response.error || 'No recibido' };
        } catch (err) {
            console.error('[CRM Meta] Error enviando evento individual:', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Mapea una CrmConversion al formato de evento de Meta Conversions API.
     * @private
     */
    static _conversionToMetaEvent(conversion) {
        // Mapear tipo de conversión a evento Meta
        const eventMap = {
            'lead_capture': 'Lead',
            'demo_scheduled': 'Schedule',
            'demo_completed': 'Schedule',
            'first_class': 'Purchase',
            'subscription': 'Subscribe',
            'kit_purchase': 'Purchase',
            'class_purchase': 'Purchase',
            'referral': 'Lead'
        };

        const eventName = eventMap[conversion.type];
        if (!eventName) return null;

        // Extraer datos del lead para user_data
        const lead = conversion.leadRef || {};
        const externalIds = lead.externalIds || {};

        // Construir user_data con hashing SHA-256 (requisito GDPR/Meta)
        const userData = {};

        // fbp y fbc no se hashean (son IDs de Meta)
        if (externalIds.fbBrowserId) userData.fbp = externalIds.fbBrowserId;
        if (externalIds.fbClickId) userData.fbc = externalIds.fbClickId;

        // Email y teléfono del Lead original (si está populado)
        if (lead.leadRef && typeof lead.leadRef === 'object') {
            if (lead.leadRef.email) {
                userData.em = [this._sha256(lead.leadRef.email.toLowerCase().trim())];
            }
            if (lead.leadRef.phone) {
                userData.ph = [this._sha256(lead.leadRef.phone.replace(/[^0-9]/g, ''))];
            }
            if (lead.leadRef.name) {
                const parts = lead.leadRef.name.trim().split(/\s+/);
                if (parts[0]) userData.fn = [this._sha256(parts[0].toLowerCase())];
                if (parts.length > 1) userData.ln = [this._sha256(parts[parts.length - 1].toLowerCase())];
            }
        }

        // Construir evento
        const event = {
            event_name: eventName,
            event_time: Math.floor(new Date(conversion.timestamp).getTime() / 1000),
            event_id: conversion._id.toString(), // Para deduplicación client/server
            action_source: 'website',
            user_data: userData
        };

        // Valor monetario (solo para Purchase y Subscribe)
        if (conversion.value > 0) {
            event.custom_data = {
                currency: conversion.currency || 'USD',
                value: conversion.value / 100 // Meta espera en unidades, no centavos
            };
        }

        return event;
    }

    /**
     * Envía eventos a la Meta Conversions API via HTTPS.
     * @private
     */
    static _postEvents(events) {
        return new Promise((resolve, reject) => {
            const pixelId = process.env.META_PIXEL_ID;
            const token = process.env.META_ACCESS_TOKEN;

            const body = JSON.stringify({
                data: events,
                access_token: token
            });

            const options = {
                hostname: 'graph.facebook.com',
                port: 443,
                path: `/${API_VERSION}/${pixelId}/events`,
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
                        const parsed = JSON.parse(data);
                        if (res.statusCode >= 400) {
                            reject(new Error(`Meta API ${res.statusCode}: ${parsed.error?.message || data}`));
                        } else {
                            resolve(parsed);
                        }
                    } catch {
                        reject(new Error(`Meta API respuesta inválida: ${data.substring(0, 200)}`));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Meta API timeout (10s)')); });
            req.write(body);
            req.end();
        });
    }

    /**
     * SHA-256 hash (requisito Meta para PII).
     * @private
     */
    static _sha256(value) {
        if (!value) return '';
        return crypto.createHash('sha256').update(value).digest('hex');
    }
}

module.exports = CrmMetaService;
