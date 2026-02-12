/**
 * crm/services/CrmFunnelService.js
 * Servicio de embudo de ventas y analytics.
 * Calcula métricas del funnel desde impresión → lead → demo → pago.
 */
const CrmLead = require('../models/CrmLead');
const CrmConversion = require('../models/CrmConversion');
const CrmInteraction = require('../models/CrmInteraction');
const CrmCampaign = require('../models/CrmCampaign');

class CrmFunnelService {

    /**
     * Genera la visualización completa del funnel.
     * Cada etapa muestra: cantidad, tasa de conversión vs etapa anterior, y valor.
     */
    static async getFunnelData(startDate, endDate) {
        try {
            const dateFilter = {};
            if (startDate || endDate) {
                dateFilter.createdAt = {};
                if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
                if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
            }

            const convDateFilter = {};
            if (startDate || endDate) {
                convDateFilter.timestamp = {};
                if (startDate) convDateFilter.timestamp.$gte = new Date(startDate);
                if (endDate) convDateFilter.timestamp.$lte = new Date(endDate);
            }

            // Obtener datos en paralelo
            const [
                totalLeads,
                leadsByStage,
                conversionsByType,
                totalValue
            ] = await Promise.all([
                CrmLead.countDocuments(dateFilter),
                CrmLead.aggregate([
                    { $match: dateFilter },
                    { $group: { _id: '$lifecycleStage', count: { $sum: 1 } } }
                ]),
                CrmConversion.aggregate([
                    { $match: convDateFilter },
                    { $group: {
                        _id: '$type',
                        count: { $sum: 1 },
                        value: { $sum: '$value' }
                    }}
                ]),
                CrmConversion.aggregate([
                    { $match: convDateFilter },
                    { $group: {
                        _id: null,
                        total: { $sum: '$value' },
                        count: { $sum: 1 }
                    }}
                ])
            ]);

            // Mapear stages a conteo
            const stageMap = {};
            leadsByStage.forEach(s => { stageMap[s._id] = s.count; });

            // Mapear conversiones a conteo
            const convMap = {};
            conversionsByType.forEach(c => { convMap[c._id] = c; });

            // Construir funnel
            const funnel = [
                {
                    stage: 'impressions',
                    label: 'Impresiones (Ads)',
                    count: await CrmFunnelService._getImpressions(dateFilter),
                    value: 0
                },
                {
                    stage: 'clicks',
                    label: 'Clicks / Visitas',
                    count: await CrmFunnelService._getClicks(dateFilter),
                    value: 0
                },
                {
                    stage: 'leads',
                    label: 'Leads Captados',
                    count: totalLeads,
                    value: 0
                },
                {
                    stage: 'mql',
                    label: 'Marketing Qualified',
                    count: (stageMap.mql || 0) + (stageMap.sql || 0) + (stageMap.opportunity || 0) + (stageMap.customer || 0),
                    value: 0
                },
                {
                    stage: 'demo_scheduled',
                    label: 'Demo Agendada',
                    count: convMap.demo_scheduled?.count || 0,
                    value: 0
                },
                {
                    stage: 'demo_completed',
                    label: 'Demo Completada',
                    count: convMap.demo_completed?.count || 0,
                    value: 0
                },
                {
                    stage: 'first_class',
                    label: 'Primera Clase Pagada',
                    count: convMap.first_class?.count || 0,
                    value: convMap.first_class?.value || 0
                },
                {
                    stage: 'subscription',
                    label: 'Suscripción Activa',
                    count: convMap.subscription?.count || 0,
                    value: convMap.subscription?.value || 0
                }
            ];

            // Calcular tasas de conversión entre etapas
            for (let i = 1; i < funnel.length; i++) {
                const prev = funnel[i - 1].count;
                const curr = funnel[i].count;
                funnel[i].conversionRate = prev > 0 ? ((curr / prev) * 100).toFixed(1) : '0.0';
                funnel[i].dropoff = prev > 0 ? (((prev - curr) / prev) * 100).toFixed(1) : '0.0';
            }
            funnel[0].conversionRate = '100.0';
            funnel[0].dropoff = '0.0';

            return {
                success: true,
                data: {
                    funnel,
                    summary: {
                        totalLeads,
                        totalConversions: totalValue[0]?.count || 0,
                        totalRevenue: totalValue[0]?.total || 0,
                        overallConversionRate: totalLeads > 0
                            ? ((totalValue[0]?.count || 0) / totalLeads * 100).toFixed(1)
                            : '0.0'
                    }
                }
            };
        } catch (error) {
            console.error('[CRM] Error en getFunnelData:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Datos del funnel segmentados por campaña
     */
    static async getFunnelByCampaign(campaignId) {
        try {
            const campaign = await CrmCampaign.findById(campaignId).lean();
            if (!campaign) {
                return { success: false, message: 'Campaña no encontrada', status: 404 };
            }

            // Leads atribuidos a esta campaña
            const leads = await CrmLead.find({
                'attribution.firstTouch.campaignId': campaignId
            }).lean();

            const leadIds = leads.map(l => l._id);

            // Conversiones de esos leads
            const conversions = await CrmConversion.aggregate([
                { $match: { leadRef: { $in: leadIds } } },
                { $group: {
                    _id: '$type',
                    count: { $sum: 1 },
                    value: { $sum: '$value' }
                }}
            ]);

            const convMap = {};
            conversions.forEach(c => { convMap[c._id] = c; });

            const funnel = [
                { stage: 'impressions', label: 'Impresiones', count: campaign.metrics?.impressions || 0 },
                { stage: 'clicks', label: 'Clicks', count: campaign.metrics?.clicks || 0 },
                { stage: 'leads', label: 'Leads', count: leads.length },
                { stage: 'demo_completed', label: 'Demo Completada', count: convMap.demo_completed?.count || 0, value: 0 },
                { stage: 'purchase', label: 'Compra', count: (convMap.first_class?.count || 0) + (convMap.subscription?.count || 0), value: (convMap.first_class?.value || 0) + (convMap.subscription?.value || 0) }
            ];

            // Calcular tasa entre etapas
            for (let i = 1; i < funnel.length; i++) {
                const prev = funnel[i - 1].count;
                const curr = funnel[i].count;
                funnel[i].conversionRate = prev > 0 ? ((curr / prev) * 100).toFixed(1) : '0.0';
            }
            funnel[0].conversionRate = '100.0';

            return {
                success: true,
                data: {
                    campaign: { name: campaign.name, platform: campaign.platform },
                    funnel,
                    roi: {
                        spent: campaign.budget?.spent || 0,
                        revenue: conversions.reduce((s, c) => s + (c.value || 0), 0),
                        roas: campaign.metrics?.roas || 0
                    }
                }
            };
        } catch (error) {
            console.error('[CRM] Error en getFunnelByCampaign:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Velocidad del funnel: tiempo promedio entre etapas
     */
    static async getFunnelVelocity(days = 30) {
        try {
            const since = new Date();
            since.setDate(since.getDate() - days);

            // Obtener leads que se convirtieron en el periodo
            const convertedLeads = await CrmLead.find({
                convertedAt: { $gte: since },
                lifecycleStage: 'customer'
            }).lean();

            if (convertedLeads.length === 0) {
                return { success: true, data: { avgDaysToConvert: 0, sampleSize: 0 } };
            }

            // Calcular tiempo promedio desde creación hasta conversión
            let totalDays = 0;
            convertedLeads.forEach(lead => {
                const created = new Date(lead.createdAt);
                const converted = new Date(lead.convertedAt);
                totalDays += (converted - created) / (1000 * 60 * 60 * 24);
            });

            return {
                success: true,
                data: {
                    avgDaysToConvert: (totalDays / convertedLeads.length).toFixed(1),
                    sampleSize: convertedLeads.length,
                    period: `${days} días`
                }
            };
        } catch (error) {
            console.error('[CRM] Error en getFunnelVelocity:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    // =========================================================================
    // HELPERS PRIVADOS
    // =========================================================================

    /**
     * Total de impresiones de ads en el periodo (desde métricas de campañas)
     */
    static async _getImpressions(dateFilter) {
        const result = await CrmCampaign.aggregate([
            { $match: { status: { $in: ['active', 'completed'] }, ...dateFilter } },
            { $group: { _id: null, total: { $sum: '$metrics.impressions' } } }
        ]);
        return result[0]?.total || 0;
    }

    /**
     * Total de clicks de ads en el periodo
     */
    static async _getClicks(dateFilter) {
        const result = await CrmCampaign.aggregate([
            { $match: { status: { $in: ['active', 'completed'] }, ...dateFilter } },
            { $group: { _id: null, total: { $sum: '$metrics.clicks' } } }
        ]);
        return result[0]?.total || 0;
    }
}

module.exports = CrmFunnelService;
