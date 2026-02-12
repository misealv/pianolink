/**
 * crm/services/CrmAdsSpendSyncService.js
 * Importación periódica de gasto publicitario desde Meta y Google APIs.
 * 
 * Sincroniza el campo budget.spent de CrmCampaign con el gasto real
 * reportado por las plataformas. Ejecutado por cron diario.
 * 
 * DISEÑO RAM-FRIENDLY:
 * - Lazy-load, ejecutado una vez al día
 * - Procesa una campaña a la vez (sin cargar todas en memoria)
 * - HTTP nativo, sin SDKs pesados
 * - Si las APIs no están configuradas, se salta silenciosamente
 */
const https = require('https');

const CrmCampaign = require('../models/CrmCampaign');

class CrmAdsSpendSyncService {

    /**
     * Sincroniza gasto de todas las campañas activas.
     * Ejecutado por CronService diariamente.
     * @returns {Object} { synced, errors, details }
     */
    static async syncAll() {
        const results = { synced: 0, errors: 0, details: [], skipped: [] };

        // Solo sincronizar campañas activas con IDs externos
        const campaigns = await CrmCampaign.find({
            status: 'active',
            $or: [
                { 'externalIds.metaCampaignId': { $nin: [null, ''] } },
                { 'externalIds.googleCampaignId': { $nin: [null, ''] } }
            ]
        })
        .select('name platform externalIds budget metrics')
        .lean();

        if (campaigns.length === 0) {
            return { ...results, message: 'No hay campañas activas con IDs externos' };
        }

        // Procesar una por una para proteger RAM
        for (const campaign of campaigns) {
            try {
                let syncResult = null;

                if (campaign.platform === 'meta' && campaign.externalIds?.metaCampaignId) {
                    syncResult = await this._syncMetaCampaign(campaign);
                } else if (campaign.platform === 'google' && campaign.externalIds?.googleCampaignId) {
                    syncResult = await this._syncGoogleCampaign(campaign);
                } else {
                    results.skipped.push({ id: campaign._id, name: campaign.name, reason: 'Sin ID externo para plataforma' });
                    continue;
                }

                if (syncResult && syncResult.success) {
                    results.synced++;
                    results.details.push({ id: campaign._id, name: campaign.name, ...syncResult.data });
                } else {
                    results.errors++;
                    results.details.push({ id: campaign._id, name: campaign.name, error: syncResult?.error || 'Sync falló' });
                }
            } catch (err) {
                results.errors++;
                results.details.push({ id: campaign._id, name: campaign.name, error: err.message });
                console.error(`[CRM Ads Sync] Error en "${campaign.name}":`, err.message);
            }
        }

        if (results.synced > 0) {
            console.log(`[CRM Ads Sync] ✅ ${results.synced} campañas sincronizadas, ${results.errors} errores`);
        }

        return results;
    }

    /**
     * Sincroniza datos de gasto de una campaña de Meta.
     * Usa la Marketing API de Meta para obtener insights.
     * @private
     */
    static async _syncMetaCampaign(campaign) {
        if (!process.env.META_ACCESS_TOKEN) {
            return { success: false, error: 'META_ACCESS_TOKEN no configurado' };
        }

        const campaignId = campaign.externalIds.metaCampaignId;

        try {
            const insights = await this._fetchMetaInsights(campaignId);

            if (!insights || insights.length === 0) {
                return { success: true, data: { message: 'Sin datos de gasto disponibles' } };
            }

            // Sumar gasto total del periodo
            const totals = insights.reduce((acc, day) => {
                acc.spend += Math.round(parseFloat(day.spend || 0) * 100); // A centavos
                acc.impressions += parseInt(day.impressions || 0);
                acc.clicks += parseInt(day.clicks || 0);
                return acc;
            }, { spend: 0, impressions: 0, clicks: 0 });

            // Actualizar campaña en BD
            await CrmCampaign.findByIdAndUpdate(campaign._id, {
                $set: {
                    'budget.spent': totals.spend,
                    'metrics.impressions': totals.impressions,
                    'metrics.clicks': totals.clicks
                }
            });

            // Recalcular métricas derivadas (CPL, CPA, ROAS)
            const updatedCampaign = await CrmCampaign.findById(campaign._id);
            if (updatedCampaign?.recalculateMetrics) {
                await updatedCampaign.recalculateMetrics();
            }

            return { success: true, data: totals };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Obtiene insights de gasto de Meta Marketing API.
     * @private
     */
    static _fetchMetaInsights(campaignId) {
        return new Promise((resolve, reject) => {
            const token = process.env.META_ACCESS_TOKEN;
            // Últimos 30 días de insights
            const fields = 'spend,impressions,clicks';
            const path = `/v19.0/${campaignId}/insights?fields=${fields}&date_preset=last_30d&access_token=${token}`;

            const options = {
                hostname: 'graph.facebook.com',
                port: 443,
                path,
                method: 'GET',
                timeout: 15000
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (res.statusCode >= 400) {
                            reject(new Error(`Meta Insights API ${res.statusCode}: ${parsed.error?.message || 'Error'}`));
                        } else {
                            resolve(parsed.data || []);
                        }
                    } catch {
                        reject(new Error('Meta Insights: respuesta inválida'));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Meta Insights timeout')); });
            req.end();
        });
    }

    /**
     * Sincroniza datos de gasto de una campaña de Google Ads.
     * @private
     */
    static async _syncGoogleCampaign(campaign) {
        if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN || !process.env.GOOGLE_ADS_REFRESH_TOKEN) {
            return { success: false, error: 'Google Ads API no configurada' };
        }

        const campaignId = campaign.externalIds.googleCampaignId;

        try {
            const accessToken = await this._getGoogleAccessToken();
            const metrics = await this._fetchGoogleCampaignMetrics(campaignId, accessToken);

            if (!metrics) {
                return { success: true, data: { message: 'Sin datos disponibles' } };
            }

            // Actualizar campaña en BD
            await CrmCampaign.findByIdAndUpdate(campaign._id, {
                $set: {
                    'budget.spent': metrics.spend,
                    'metrics.impressions': metrics.impressions,
                    'metrics.clicks': metrics.clicks
                }
            });

            const updatedCampaign = await CrmCampaign.findById(campaign._id);
            if (updatedCampaign?.recalculateMetrics) {
                await updatedCampaign.recalculateMetrics();
            }

            return { success: true, data: metrics };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Consulta métricas de una campaña de Google Ads usando GAQL.
     * @private
     */
    static _fetchGoogleCampaignMetrics(campaignId, accessToken) {
        return new Promise((resolve, reject) => {
            const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, '');

            const query = `
                SELECT campaign.id, metrics.cost_micros, metrics.impressions, metrics.clicks
                FROM campaign
                WHERE campaign.id = ${campaignId}
                AND segments.date DURING LAST_30_DAYS
            `.trim();

            const body = JSON.stringify({ query });

            const options = {
                hostname: 'googleads.googleapis.com',
                port: 443,
                path: `/v16/customers/${customerId}/googleAds:searchStream`,
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
                            reject(new Error(`Google Ads API ${res.statusCode}: ${parsed.error?.message || 'Error'}`));
                            return;
                        }

                        // Sumar métricas de todos los resultados
                        let spend = 0, impressions = 0, clicks = 0;
                        const results = parsed[0]?.results || parsed.results || [];
                        for (const row of results) {
                            const m = row.metrics || {};
                            spend += parseInt(m.costMicros || 0);
                            impressions += parseInt(m.impressions || 0);
                            clicks += parseInt(m.clicks || 0);
                        }

                        resolve({
                            spend: Math.round(spend / 10000), // micros → centavos
                            impressions,
                            clicks
                        });
                    } catch {
                        reject(new Error('Google Ads: respuesta inválida'));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Google Ads metrics timeout')); });
            req.write(body);
            req.end();
        });
    }

    /**
     * Obtiene access token de Google OAuth2.
     * @private
     */
    static _getGoogleAccessToken() {
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
                        if (parsed.access_token) resolve(parsed.access_token);
                        else reject(new Error(parsed.error_description || 'No access_token'));
                    } catch {
                        reject(new Error('OAuth2 respuesta inválida'));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('OAuth2 timeout')); });
            req.write(body);
            req.end();
        });
    }
}

module.exports = CrmAdsSpendSyncService;
