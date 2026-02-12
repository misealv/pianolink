/**
 * crm/services/CrmAlertService.js
 * Servicio de alertas automáticas para métricas de campañas publicitarias.
 * 
 * Funcionalidades:
 * - Alerta cuando CPA excede umbral configurado
 * - Alerta cuando presupuesto supera el 90%
 * - Alerta cuando ROAS cae debajo del mínimo saludable
 * - Alerta cuando una campaña lleva días sin conversiones
 * 
 * DISEÑO RAM-FRIENDLY:
 * - Lazy-load, ejecutado 1 vez al día vía cron
 * - Queries lean() con select() mínimo
 * - No almacena alertas en memoria (escribe a BD y sale)
 * - Sin SDKs externos, notifica vía console.log + campo en campaña
 */
const CrmCampaign = require('../models/CrmCampaign');
const CrmConversion = require('../models/CrmConversion');

// === UMBRALES POR DEFECTO (configurables via env) ===
const DEFAULTS = {
    // CPA máximo aceptable en centavos (default: $50 USD = 5000 centavos)
    MAX_CPA: parseInt(process.env.CRM_ALERT_MAX_CPA) || 5000,
    // ROAS mínimo aceptable (ratio, 1.0 = break-even)
    MIN_ROAS: parseFloat(process.env.CRM_ALERT_MIN_ROAS) || 1.0,
    // Porcentaje de presupuesto que dispara alerta (0-100)
    BUDGET_THRESHOLD: parseInt(process.env.CRM_ALERT_BUDGET_PCT) || 90,
    // Días sin conversiones para alertar
    DAYS_NO_CONVERSIONS: parseInt(process.env.CRM_ALERT_NO_CONV_DAYS) || 7,
    // Máximo de campañas a evaluar por ejecución
    MAX_CAMPAIGNS: 50
};

class CrmAlertService {

    /**
     * Ejecuta todas las verificaciones de alertas.
     * Llamado por CronService diariamente.
     * @returns {Object} { alerts: Array, checked: number, duration: number }
     */
    static async runAll() {
        const start = Date.now();
        const alerts = [];

        try {
            // Obtener campañas activas con métricas (lean para RAM)
            const campaigns = await CrmCampaign.find({ status: 'active' })
                .select('name platform budget metrics externalIds startDate')
                .limit(DEFAULTS.MAX_CAMPAIGNS)
                .lean();

            if (campaigns.length === 0) {
                return { alerts: [], checked: 0, duration: Date.now() - start };
            }

            // Ejecutar checks secuencialmente para proteger RAM
            for (const campaign of campaigns) {
                const campaignAlerts = this._checkCampaign(campaign);
                if (campaignAlerts.length > 0) {
                    alerts.push(...campaignAlerts);
                }
            }

            // Check de campañas sin conversiones recientes (query separada)
            const noConvAlerts = await this._checkNoConversions(campaigns);
            alerts.push(...noConvAlerts);

            // Registrar alertas en notas de la campaña (persistir sin modelo nuevo)
            if (alerts.length > 0) {
                await this._persistAlerts(alerts);
                console.log(`[CRM Alerts] ⚠️ ${alerts.length} alertas generadas para ${campaigns.length} campañas`);
            }

        } catch (err) {
            console.error('[CRM Alerts] Error general:', err.message);
        }

        return {
            alerts,
            checked: campaigns.length,
            duration: Date.now() - start
        };
    }

    /**
     * Chequea una campaña individual contra todos los umbrales.
     * Operación síncrona (cálculos en memoria sobre datos ya cargados).
     * @private
     */
    static _checkCampaign(campaign) {
        const alerts = [];
        const spent = campaign.budget?.spent || 0;
        const total = campaign.budget?.total || 0;
        const conversions = campaign.metrics?.conversions || 0;
        const revenue = campaign.metrics?.revenue || 0;
        const leads = campaign.metrics?.leads || 0;

        // 1. CPA excede umbral
        if (conversions > 0 && spent > 0) {
            const cpa = Math.round(spent / conversions);
            if (cpa > DEFAULTS.MAX_CPA) {
                alerts.push({
                    campaignId: campaign._id,
                    campaignName: campaign.name,
                    type: 'high_cpa',
                    severity: 'warning',
                    message: `CPA de ${(cpa / 100).toFixed(2)} USD excede el umbral de ${(DEFAULTS.MAX_CPA / 100).toFixed(2)} USD`,
                    data: { cpa, threshold: DEFAULTS.MAX_CPA }
                });
            }
        }

        // 2. ROAS debajo del mínimo
        if (spent > 0) {
            const roas = revenue / spent;
            if (roas < DEFAULTS.MIN_ROAS && conversions > 0) {
                alerts.push({
                    campaignId: campaign._id,
                    campaignName: campaign.name,
                    type: 'low_roas',
                    severity: roas < 0.5 ? 'critical' : 'warning',
                    message: `ROAS de ${roas.toFixed(2)}x está debajo del mínimo ${DEFAULTS.MIN_ROAS}x`,
                    data: { roas: Math.round(roas * 100) / 100, threshold: DEFAULTS.MIN_ROAS }
                });
            }
        }

        // 3. Presupuesto casi agotado
        if (total > 0) {
            const pct = Math.round((spent / total) * 100);
            if (pct >= DEFAULTS.BUDGET_THRESHOLD) {
                alerts.push({
                    campaignId: campaign._id,
                    campaignName: campaign.name,
                    type: 'budget_exhausted',
                    severity: pct >= 100 ? 'critical' : 'warning',
                    message: `Presupuesto al ${pct}% (${(spent / 100).toFixed(2)} de ${(total / 100).toFixed(2)} USD)`,
                    data: { spent, total, pct }
                });
            }
        }

        // 4. Gasto sin leads (dinero tirado)
        if (spent > 1000 && leads === 0) { // Más de $10 USD gastados sin un solo lead
            alerts.push({
                campaignId: campaign._id,
                campaignName: campaign.name,
                type: 'spend_no_leads',
                severity: 'critical',
                message: `${(spent / 100).toFixed(2)} USD gastados sin generar ningún lead`,
                data: { spent, leads: 0 }
            });
        }

        return alerts;
    }

    /**
     * Verifica campañas que llevan días sin nuevas conversiones.
     * Usa una query agrupada para no cargar conversiones individuales.
     * @private
     */
    static async _checkNoConversions(campaigns) {
        const alerts = [];
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - DEFAULTS.DAYS_NO_CONVERSIONS);

        // Obtener última conversión por campaña en una sola query
        const recentConversions = await CrmConversion.aggregate([
            {
                $match: {
                    campaignId: { $in: campaigns.map(c => c._id) },
                    timestamp: { $gte: cutoff }
                }
            },
            { $group: { _id: '$campaignId', lastConversion: { $max: '$timestamp' }, count: { $sum: 1 } } }
        ]);

        const recentMap = new Map(recentConversions.map(r => [r._id.toString(), r]));

        for (const campaign of campaigns) {
            const recent = recentMap.get(campaign._id.toString());
            // Si no tiene conversiones recientes Y ya lleva días activa
            const daysActive = campaign.startDate
                ? Math.floor((Date.now() - new Date(campaign.startDate).getTime()) / (1000 * 60 * 60 * 24))
                : 0;

            if (!recent && daysActive >= DEFAULTS.DAYS_NO_CONVERSIONS) {
                alerts.push({
                    campaignId: campaign._id,
                    campaignName: campaign.name,
                    type: 'no_recent_conversions',
                    severity: 'warning',
                    message: `Sin conversiones en los últimos ${DEFAULTS.DAYS_NO_CONVERSIONS} días (${daysActive} días activa)`,
                    data: { daysActive, daysSinceConversion: DEFAULTS.DAYS_NO_CONVERSIONS }
                });
            }
        }

        return alerts;
    }

    /**
     * Persiste alertas añadiéndolas a las notas de cada campaña.
     * No crea modelo nuevo — reutiliza campo notes de CrmCampaign.
     * @private
     */
    static async _persistAlerts(alerts) {
        const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        // Agrupar por campaña para hacer un solo update cada una
        const byCampaign = {};
        for (const alert of alerts) {
            const key = alert.campaignId.toString();
            if (!byCampaign[key]) byCampaign[key] = [];
            byCampaign[key].push(alert);
        }

        for (const [campaignId, campaignAlerts] of Object.entries(byCampaign)) {
            const alertLine = `\n[ALERTA ${now}] ` + campaignAlerts.map(a => `${a.type}: ${a.message}`).join(' | ');
            try {
                // Leer notas actuales, concatenar alertas, y actualizar con lastAlertDate en una sola operación
                const campaign = await CrmCampaign.findById(campaignId).select('notes').lean();
                const currentNotes = campaign?.notes || '';
                const newNotes = (currentNotes + alertLine).slice(-1800); // Mantener últimas alertas
                await CrmCampaign.findByIdAndUpdate(campaignId, {
                    $set: {
                        notes: newNotes,
                        'metrics.lastAlertDate': new Date()
                    }
                });
            } catch (err) {
                console.error(`[CRM Alerts] Error persistiendo alerta para ${campaignId}:`, err.message);
            }
        }
    }

    /**
     * Obtiene alertas actuales para todas las campañas activas.
     * Para mostrar en el dashboard sin reejecutar los checks completos.
     * @returns {Object} { success, data: alerts[] }
     */
    static async getCurrentAlerts() {
        try {
            const campaigns = await CrmCampaign.find({ status: 'active' })
                .select('name platform budget metrics startDate')
                .limit(DEFAULTS.MAX_CAMPAIGNS)
                .lean();

            const alerts = [];
            for (const campaign of campaigns) {
                const campaignAlerts = this._checkCampaign(campaign);
                alerts.push(...campaignAlerts);
            }

            return {
                success: true,
                data: alerts,
                thresholds: {
                    maxCPA: DEFAULTS.MAX_CPA,
                    minROAS: DEFAULTS.MIN_ROAS,
                    budgetPct: DEFAULTS.BUDGET_THRESHOLD,
                    noConvDays: DEFAULTS.DAYS_NO_CONVERSIONS
                }
            };
        } catch (error) {
            console.error('[CRM Alerts] Error en getCurrentAlerts:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Obtiene los umbrales configurados (para UI de configuración).
     */
    static getThresholds() {
        return {
            maxCPA: DEFAULTS.MAX_CPA,
            minROAS: DEFAULTS.MIN_ROAS,
            budgetPct: DEFAULTS.BUDGET_THRESHOLD,
            noConvDays: DEFAULTS.DAYS_NO_CONVERSIONS
        };
    }
}

module.exports = CrmAlertService;
