/**
 * crm/services/CrmTrackingDispatcher.js
 * Orquestador central de reporte de conversiones a plataformas externas.
 * 
 * Lee conversiones pendientes de CrmConversion (reportedTo.*.sent === false)
 * y las despacha a Meta, Google Ads y GA4 en lotes controlados.
 * 
 * DISEÑO RAM-FRIENDLY:
 * - Lazy-load de cada servicio de plataforma (solo se carga cuando se necesita)
 * - Cursor-based pagination con limit para no cargar todo en memoria
 * - Procesa una plataforma a la vez (secuencial, no paralelo)
 * - Libera referencias después de cada lote
 * - Ejecutado por CronService cada 15 min (offset vs secuencias cada 10 min)
 */
const CrmConversion = require('../models/CrmConversion');

// === Lazy loaders — cada servicio solo se carga cuando hay env vars configuradas ===
let _metaService = null;
let _googleAdsService = null;
let _ga4Service = null;

function getMetaService() {
    if (!_metaService) {
        try { _metaService = require('./CrmMetaService'); } catch (e) { /* no disponible */ }
    }
    return _metaService;
}

function getGoogleAdsService() {
    if (!_googleAdsService) {
        try { _googleAdsService = require('./CrmGoogleAdsService'); } catch (e) { /* no disponible */ }
    }
    return _googleAdsService;
}

function getGA4Service() {
    if (!_ga4Service) {
        try { _ga4Service = require('./CrmGA4Service'); } catch (e) { /* no disponible */ }
    }
    return _ga4Service;
}

// Máximo de conversiones a procesar por ejecución del cron (protección RAM)
const MAX_PER_RUN = 100;
// Tamaño de cada lote de lectura de BD
const PAGE_SIZE = 25;

class CrmTrackingDispatcher {

    /**
     * Procesa todas las conversiones pendientes de reportar.
     * Se ejecuta desde CronService cada 15 minutos.
     * @returns {Object} { meta: {...}, google: {...}, ga4: {...}, duration }
     */
    static async processAll() {
        const start = Date.now();
        const results = {
            meta: { sent: 0, errors: 0, skipped: false },
            google: { sent: 0, errors: 0, skipped: false },
            ga4: { sent: 0, errors: 0, skipped: false }
        };

        try {
            // Procesar secuencialmente para no saturar RAM
            results.meta = await this._processPlatform('meta');
            results.google = await this._processPlatform('google');
            results.ga4 = await this._processGA4();
        } catch (err) {
            console.error('[CRM Dispatcher] Error general:', err.message);
        }

        results.duration = Date.now() - start;

        const totalSent = results.meta.sent + results.google.sent + results.ga4.sent;
        if (totalSent > 0) {
            console.log(`[CRM Dispatcher] ✅ Enviadas: Meta=${results.meta.sent}, Google=${results.google.sent}, GA4=${results.ga4.sent} (${results.duration}ms)`);
        }

        return results;
    }

    /**
     * Procesa conversiones pendientes para una plataforma (Meta o Google Ads).
     * Usa cursor pagination para no cargar todo en memoria.
     * @private
     */
    static async _processPlatform(platform) {
        const service = platform === 'meta' ? getMetaService() : getGoogleAdsService();
        if (!service || !service.isConfigured()) {
            return { sent: 0, errors: 0, skipped: true, reason: `${platform} no configurado` };
        }

        const fieldSent = `reportedTo.${platform}.sent`;
        const fieldSentAt = `reportedTo.${platform}.sentAt`;
        const fieldEventId = platform === 'meta' ? 'reportedTo.meta.eventId' : 'reportedTo.google.conversionId';

        let totalSent = 0;
        let totalErrors = 0;
        let processed = 0;

        // Paginación basada en cursor (skip costoso en Mongo, pero con índice en sent:1 es eficiente)
        while (processed < MAX_PER_RUN) {
            const pending = await CrmConversion.find({ [fieldSent]: false })
                .populate({
                    path: 'leadRef',
                    select: 'externalIds leadRef',
                    populate: { path: 'leadRef', select: 'email phone name', model: 'Lead' }
                })
                .sort({ timestamp: -1 })
                .limit(PAGE_SIZE)
                .lean();

            if (pending.length === 0) break;

            const result = await service.sendBatch(pending);
            totalSent += result.sent;
            totalErrors += result.errors;

            // Marcar como enviadas: usar successIds si el servicio los retorna,
            // sino solo marcar todo si no hubo errores (evitar marca posicional incorrecta)
            if (result.sent > 0) {
                let sentIds;
                if (result.successIds && Array.isArray(result.successIds)) {
                    // El servicio retornó IDs específicos de las conversiones exitosas
                    sentIds = result.successIds;
                } else if (result.errors === 0) {
                    // Sin errores: todo el lote fue exitoso
                    sentIds = pending.map(c => c._id);
                } else {
                    // Hubo errores pero no sabemos cuáles fallaron: reintentar todo en el próximo ciclo
                    sentIds = [];
                }

                if (sentIds.length > 0) {
                    await CrmConversion.updateMany(
                        { _id: { $in: sentIds } },
                        {
                            $set: {
                                [fieldSent]: true,
                                [fieldSentAt]: new Date(),
                                [fieldEventId]: 'batch_' + Date.now()
                            }
                        }
                    );
                }
            }

            // Si hubo errores, marcar para no reintentar infinitamente
            // (se reintentarán en la próxima ejecución del cron)
            processed += pending.length;

            // Si el lote fue menor al PAGE_SIZE, no hay más pendientes
            if (pending.length < PAGE_SIZE) break;
        }

        return { sent: totalSent, errors: totalErrors };
    }

    /**
     * Procesa conversiones pendientes para GA4.
     * Usa su propio campo reportedTo.ga4.sent (independiente de Meta/Google).
     * Paginación cursor-based igual que _processPlatform.
     * @private
     */
    static async _processGA4() {
        const ga4 = getGA4Service();
        if (!ga4 || !ga4.isConfigured()) {
            return { sent: 0, errors: 0, skipped: true, reason: 'GA4 no configurado' };
        }

        let totalSent = 0;
        let totalErrors = 0;
        let processed = 0;

        while (processed < MAX_PER_RUN) {
            const pending = await CrmConversion.find({ 'reportedTo.ga4.sent': { $ne: true } })
                .populate({
                    path: 'leadRef',
                    select: 'externalIds leadRef',
                    populate: { path: 'leadRef', select: 'email phone name', model: 'Lead' }
                })
                .sort({ timestamp: -1 })
                .limit(PAGE_SIZE)
                .lean();

            if (pending.length === 0) break;

            const result = await ga4.sendBatch(pending);
            totalSent += (result.sent || 0);
            totalErrors += (result.errors || 0);

            // Marcar como enviadas a GA4
            if (result.sent > 0) {
                const sentIds = pending.slice(0, result.sent).map(c => c._id);
                await CrmConversion.updateMany(
                    { _id: { $in: sentIds } },
                    { $set: { 'reportedTo.ga4.sent': true, 'reportedTo.ga4.sentAt': new Date() } }
                );
            }

            processed += pending.length;
            if (pending.length < PAGE_SIZE) break;
        }

        return { sent: totalSent, errors: totalErrors };
    }

    /**
     * Envía una conversión inmediatamente a todas las plataformas configuradas.
     * Se llama desde CrmBridgeService cuando ocurre un evento importante.
     * @param {string} conversionId — ID de CrmConversion
     * @returns {Object} { meta?, google?, ga4? }
     */
    static async dispatchImmediate(conversionId) {
        const results = {};

        try {
            const conversion = await CrmConversion.findById(conversionId)
                .populate({
                    path: 'leadRef',
                    select: 'externalIds leadRef',
                    populate: { path: 'leadRef', select: 'email phone name', model: 'Lead' }
                })
                .lean();

            if (!conversion) return { error: 'Conversión no encontrada' };

            // Solo conversiones de alto valor se envían inmediatamente
            const immediateTypes = ['first_class', 'subscription', 'kit_purchase', 'class_purchase'];
            if (!immediateTypes.includes(conversion.type)) {
                return { queued: true, message: 'Se enviará en el próximo ciclo del cron' };
            }

            // Enviar a cada plataforma en paralelo (acá sí es seguro porque son HTTP calls independientes)
            const promises = [];

            const meta = getMetaService();
            if (meta && meta.isConfigured() && !conversion.reportedTo?.meta?.sent) {
                promises.push(
                    meta.sendSingle(conversion).then(r => {
                        results.meta = r;
                        if (r.success) {
                            return CrmConversion.findByIdAndUpdate(conversionId, {
                                $set: {
                                    'reportedTo.meta.sent': true,
                                    'reportedTo.meta.sentAt': new Date(),
                                    'reportedTo.meta.eventId': r.eventId || ''
                                }
                            });
                        }
                    })
                );
            }

            const googleAds = getGoogleAdsService();
            if (googleAds && googleAds.isConfigured() && !conversion.reportedTo?.google?.sent) {
                promises.push(
                    googleAds.sendSingle(conversion).then(r => {
                        results.google = r;
                        if (r.success) {
                            return CrmConversion.findByIdAndUpdate(conversionId, {
                                $set: {
                                    'reportedTo.google.sent': true,
                                    'reportedTo.google.sentAt': new Date(),
                                    'reportedTo.google.conversionId': r.conversionId || ''
                                }
                            });
                        }
                    })
                );
            }

            const ga4 = getGA4Service();
            if (ga4 && ga4.isConfigured() && !conversion.reportedTo?.ga4?.sent) {
                promises.push(
                    ga4.sendSingle(conversion).then(r => {
                        results.ga4 = r;
                        if (r.success) {
                            return CrmConversion.findByIdAndUpdate(conversionId, {
                                $set: {
                                    'reportedTo.ga4.sent': true,
                                    'reportedTo.ga4.sentAt': new Date()
                                }
                            });
                        }
                    })
                );
            }

            if (promises.length > 0) {
                await Promise.allSettled(promises);
            }

        } catch (err) {
            console.error('[CRM Dispatcher] Error en dispatch inmediato:', err.message);
            results.error = err.message;
        }

        return results;
    }

    /**
     * Estadísticas de conversiones pendientes por plataforma.
     * Para el dashboard de estado.
     */
    static async getPendingStats() {
        const [metaPending, googlePending, ga4Pending] = await Promise.all([
            CrmConversion.countDocuments({ 'reportedTo.meta.sent': false }),
            CrmConversion.countDocuments({ 'reportedTo.google.sent': false }),
            CrmConversion.countDocuments({ 'reportedTo.ga4.sent': { $ne: true } })
        ]);

        return {
            meta: {
                pending: metaPending,
                configured: getMetaService()?.isConfigured() || false
            },
            google: {
                pending: googlePending,
                configured: getGoogleAdsService()?.isConfigured() || false
            },
            ga4: {
                pending: ga4Pending,
                configured: getGA4Service()?.isConfigured() || false
            }
        };
    }
}

module.exports = CrmTrackingDispatcher;
