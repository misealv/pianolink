/**
 * crm/services/CrmAttributionService.js
 * Servicio de atribución avanzada, ROI Calculator y métricas de crecimiento.
 * 
 * Funcionalidades:
 * - Attribution Dashboard: touchpoints, modelos first/last/linear
 * - ROI Calculator: ROAS por campaña, CPA, LTV/CAC ratio
 * - Métricas de crecimiento: tendencias, velocidad del funnel
 * 
 * DISEÑO RAM-FRIENDLY:
 * - Todas las queries usan aggregation pipeline (procesamiento en MongoDB)
 * - No carga documentos completos en memoria
 * - Resultados paginados/limitados
 */
const CrmLead = require('../models/CrmLead');
const CrmCampaign = require('../models/CrmCampaign');
const CrmConversion = require('../models/CrmConversion');
const CrmInteraction = require('../models/CrmInteraction');

class CrmAttributionService {

    // =========================================================================
    // ATTRIBUTION DASHBOARD
    // =========================================================================

    /**
     * Análisis de touchpoints por canal.
     * Muestra qué canales aportan más touchpoints y en qué etapa del funnel.
     */
    static async getTouchpointsByChannel(startDate, endDate) {
        try {
            const match = {};
            if (startDate || endDate) {
                match['attribution.touchpoints.timestamp'] = {};
                if (startDate) match['attribution.touchpoints.timestamp'].$gte = new Date(startDate);
                if (endDate) match['attribution.touchpoints.timestamp'].$lte = new Date(endDate);
            }

            const result = await CrmLead.aggregate([
                { $match: match },
                { $unwind: '$attribution.touchpoints' },
                { $group: {
                    _id: '$attribution.touchpoints.channel',
                    count: { $sum: 1 },
                    uniqueLeads: { $addToSet: '$_id' },
                    campaigns: { $addToSet: '$attribution.touchpoints.campaignId' }
                }},
                { $project: {
                    channel: '$_id',
                    count: 1,
                    uniqueLeads: { $size: '$uniqueLeads' },
                    campaigns: { $size: '$campaigns' }
                }},
                { $sort: { count: -1 } },
                { $limit: 20 }
            ]);

            return { success: true, data: result };
        } catch (error) {
            console.error('[CRM Attribution] Error en touchpointsByChannel:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Análisis de atribución por modelo (first touch vs last touch).
     * Compara qué canales se llevan el crédito según el modelo elegido.
     */
    static async getAttributionComparison(startDate, endDate) {
        try {
            const dateFilter = {};
            if (startDate || endDate) {
                dateFilter.createdAt = {};
                if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
                if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
            }

            const [firstTouch, lastTouch] = await Promise.all([
                CrmLead.aggregate([
                    { $match: { ...dateFilter, 'attribution.firstTouch.channel': { $ne: '' } } },
                    { $group: {
                        _id: '$attribution.firstTouch.channel',
                        leads: { $sum: 1 },
                        avgScore: { $avg: '$score' }
                    }},
                    { $sort: { leads: -1 } },
                    { $limit: 10 }
                ]),
                CrmLead.aggregate([
                    { $match: { ...dateFilter, 'attribution.lastTouch.channel': { $ne: '' } } },
                    { $group: {
                        _id: '$attribution.lastTouch.channel',
                        leads: { $sum: 1 },
                        avgScore: { $avg: '$score' }
                    }},
                    { $sort: { leads: -1 } },
                    { $limit: 10 }
                ])
            ]);

            return {
                success: true,
                data: {
                    firstTouch: firstTouch.map(r => ({ channel: r._id, leads: r.leads, avgScore: Math.round(r.avgScore) })),
                    lastTouch: lastTouch.map(r => ({ channel: r._id, leads: r.leads, avgScore: Math.round(r.avgScore) }))
                }
            };
        } catch (error) {
            console.error('[CRM Attribution] Error en comparison:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Customer Journey de un lead específico.
     * Timeline completa de touchpoints + conversiones.
     */
    static async getLeadJourney(crmLeadId) {
        try {
            const [lead, interactions, conversions] = await Promise.all([
                CrmLead.findById(crmLeadId)
                    .select('attribution score segment lifecycleStage tags customerValue')
                    .lean(),
                CrmInteraction.find({ leadRef: crmLeadId })
                    .select('type channel metadata.pageUrl metadata.emailSubject timestamp')
                    .sort({ timestamp: 1 })
                    .limit(100)
                    .lean(),
                CrmConversion.find({ leadRef: crmLeadId })
                    .select('type value currency timestamp attribution')
                    .sort({ timestamp: 1 })
                    .lean()
            ]);

            if (!lead) {
                return { success: false, message: 'Lead no encontrado', status: 404 };
            }

            return {
                success: true,
                data: {
                    lead: {
                        score: lead.score,
                        segment: lead.segment,
                        lifecycle: lead.lifecycleStage,
                        tags: lead.tags,
                        ltv: lead.customerValue || 0
                    },
                    touchpoints: lead.attribution?.touchpoints || [],
                    interactions: interactions.map(i => ({
                        type: i.type,
                        channel: i.channel,
                        url: i.metadata?.pageUrl || '',
                        emailSubject: i.metadata?.emailSubject || '',
                        timestamp: i.timestamp
                    })),
                    conversions: conversions.map(c => ({
                        type: c.type,
                        value: c.value,
                        currency: c.currency,
                        channel: c.attribution?.channel || '',
                        timestamp: c.timestamp
                    }))
                }
            };
        } catch (error) {
            console.error('[CRM Attribution] Error en leadJourney:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    // =========================================================================
    // ROI CALCULATOR
    // =========================================================================

    /**
     * ROAS (Return on Ad Spend) por campaña.
     * Retorna cada campaña con su gasto, revenue y ROAS.
     */
    static async getROASByCampaign(startDate, endDate) {
        try {
            const dateFilter = {};
            if (startDate || endDate) {
                dateFilter.createdAt = {};
                if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
                if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
            }

            // Obtener campañas con gasto
            const campaigns = await CrmCampaign.find(dateFilter)
                .select('name platform budget.spent budget.currency metrics.leads metrics.conversions metrics.revenue status')
                .sort({ 'budget.spent': -1 })
                .limit(50)
                .lean();

            // Enriquecer con ROAS calculado
            const data = campaigns.map(c => {
                const spent = c.budget?.spent || 0;
                const revenue = c.metrics?.revenue || 0;
                const leads = c.metrics?.leads || 0;
                const conversions = c.metrics?.conversions || 0;

                return {
                    id: c._id,
                    name: c.name,
                    platform: c.platform,
                    status: c.status,
                    spent,
                    revenue,
                    leads,
                    conversions,
                    roas: spent > 0 ? Math.round((revenue / spent) * 100) / 100 : 0,
                    cpl: leads > 0 ? Math.round(spent / leads) : 0,
                    cpa: conversions > 0 ? Math.round(spent / conversions) : 0
                };
            });

            // Totales
            const totals = data.reduce((acc, c) => {
                acc.spent += c.spent;
                acc.revenue += c.revenue;
                acc.leads += c.leads;
                acc.conversions += c.conversions;
                return acc;
            }, { spent: 0, revenue: 0, leads: 0, conversions: 0 });

            totals.roas = totals.spent > 0 ? Math.round((totals.revenue / totals.spent) * 100) / 100 : 0;
            totals.cpl = totals.leads > 0 ? Math.round(totals.spent / totals.leads) : 0;
            totals.cpa = totals.conversions > 0 ? Math.round(totals.spent / totals.conversions) : 0;

            return { success: true, data: { campaigns: data, totals } };
        } catch (error) {
            console.error('[CRM Attribution] Error en ROAS:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * LTV/CAC ratio.
     * LTV = customer_value promedio de leads convertidos.
     * CAC = gasto total / conversiones totales.
     */
    static async getLTVCAC(startDate, endDate) {
        try {
            const dateFilter = {};
            if (startDate || endDate) {
                dateFilter.createdAt = {};
                if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
                if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
            }

            const [ltvData, spendData] = await Promise.all([
                // LTV promedio de clientes
                CrmLead.aggregate([
                    { $match: { ...dateFilter, lifecycleStage: 'customer', customerValue: { $gt: 0 } } },
                    { $group: {
                        _id: null,
                        avgLTV: { $avg: '$customerValue' },
                        medianValues: { $push: '$customerValue' },
                        totalCustomers: { $sum: 1 },
                        totalLTV: { $sum: '$customerValue' }
                    }}
                ]),
                // CAC = total spend / total conversions tipo customer
                CrmCampaign.aggregate([
                    { $match: dateFilter },
                    { $group: {
                        _id: null,
                        totalSpent: { $sum: '$budget.spent' },
                        totalConversions: { $sum: '$metrics.conversions' }
                    }}
                ])
            ]);

            const ltv = ltvData[0]?.avgLTV || 0;
            const totalCustomers = ltvData[0]?.totalCustomers || 0;
            const totalSpent = spendData[0]?.totalSpent || 0;
            const totalConversions = spendData[0]?.totalConversions || 0;
            const cac = totalConversions > 0 ? Math.round(totalSpent / totalConversions) : 0;

            return {
                success: true,
                data: {
                    ltv: Math.round(ltv),
                    cac,
                    ltvCacRatio: cac > 0 ? Math.round((ltv / cac) * 100) / 100 : 0,
                    totalCustomers,
                    totalLTV: ltvData[0]?.totalLTV || 0,
                    totalSpent,
                    totalConversions,
                    healthy: cac > 0 ? (ltv / cac) >= 3 : null // LTV/CAC >= 3x es saludable
                }
            };
        } catch (error) {
            console.error('[CRM Attribution] Error en LTV/CAC:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Métricas de rendimiento por plataforma publicitaria.
     * Compara Meta vs Google vs Orgánico en un periodo.
     */
    static async getPlatformPerformance(startDate, endDate) {
        try {
            const dateFilter = {};
            if (startDate || endDate) {
                dateFilter.createdAt = {};
                if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
                if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
            }

            const data = await CrmCampaign.aggregate([
                { $match: dateFilter },
                { $group: {
                    _id: '$platform',
                    campaigns: { $sum: 1 },
                    activeCampaigns: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
                    totalSpent: { $sum: '$budget.spent' },
                    totalBudget: { $sum: '$budget.total' },
                    totalLeads: { $sum: '$metrics.leads' },
                    totalConversions: { $sum: '$metrics.conversions' },
                    totalRevenue: { $sum: '$metrics.revenue' },
                    totalImpressions: { $sum: '$metrics.impressions' },
                    totalClicks: { $sum: '$metrics.clicks' }
                }},
                { $project: {
                    platform: '$_id',
                    campaigns: 1,
                    activeCampaigns: 1,
                    totalSpent: 1,
                    budgetUtilization: {
                        $cond: [
                            { $gt: ['$totalBudget', 0] },
                            { $multiply: [{ $divide: ['$totalSpent', '$totalBudget'] }, 100] },
                            0
                        ]
                    },
                    totalLeads: 1,
                    totalConversions: 1,
                    totalRevenue: 1,
                    cpl: { $cond: [{ $gt: ['$totalLeads', 0] }, { $divide: ['$totalSpent', '$totalLeads'] }, 0] },
                    cpa: { $cond: [{ $gt: ['$totalConversions', 0] }, { $divide: ['$totalSpent', '$totalConversions'] }, 0] },
                    roas: { $cond: [{ $gt: ['$totalSpent', 0] }, { $divide: ['$totalRevenue', '$totalSpent'] }, 0] },
                    ctr: { $cond: [{ $gt: ['$totalImpressions', 0] }, { $multiply: [{ $divide: ['$totalClicks', '$totalImpressions'] }, 100] }, 0] }
                }},
                { $sort: { totalRevenue: -1 } }
            ]);

            // Redondear valores
            data.forEach(d => {
                d.budgetUtilization = Math.round(d.budgetUtilization);
                d.cpl = Math.round(d.cpl);
                d.cpa = Math.round(d.cpa);
                d.roas = Math.round(d.roas * 100) / 100;
                d.ctr = Math.round(d.ctr * 100) / 100;
            });

            return { success: true, data };
        } catch (error) {
            console.error('[CRM Attribution] Error en platform performance:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    // =========================================================================
    // TENDENCIAS Y VELOCIDAD
    // =========================================================================

    /**
     * Tendencia de conversiones por día/semana/mes.
     * Para gráficos de línea en el dashboard.
     */
    static async getConversionTrend(startDate, endDate, granularity = 'day') {
        try {
            const match = {};
            if (startDate || endDate) {
                match.timestamp = {};
                if (startDate) match.timestamp.$gte = new Date(startDate);
                if (endDate) match.timestamp.$lte = new Date(endDate);
            }

            // Definir agrupación temporal
            const dateGroup = {
                day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
                week: { $dateToString: { format: '%Y-W%V', date: '$timestamp' } },
                month: { $dateToString: { format: '%Y-%m', date: '$timestamp' } }
            };

            const data = await CrmConversion.aggregate([
                { $match: match },
                { $group: {
                    _id: dateGroup[granularity] || dateGroup.day,
                    conversions: { $sum: 1 },
                    revenue: { $sum: '$value' },
                    types: { $push: '$type' }
                }},
                { $project: {
                    period: '$_id',
                    conversions: 1,
                    revenue: 1,
                    // Contar tipos más comunes
                    leads: { $size: { $filter: { input: '$types', cond: { $eq: ['$$this', 'lead_capture'] } } } },
                    purchases: { $size: { $filter: { input: '$types', cond: { $in: ['$$this', ['first_class', 'subscription', 'kit_purchase', 'class_purchase']] } } } }
                }},
                { $sort: { _id: 1 } },
                { $limit: 90 } // Máximo 90 puntos de datos
            ]);

            return { success: true, data };
        } catch (error) {
            console.error('[CRM Attribution] Error en trend:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Velocidad del funnel: tiempo promedio entre etapas.
     * Calcula cuántos días tarda un lead en pasar de una etapa a otra.
     */
    static async getFunnelVelocity() {
        try {
            // Calcular tiempo promedio lead → demo → payment usando conversiones
            const velocityData = await CrmConversion.aggregate([
                { $sort: { leadRef: 1, timestamp: 1 } },
                { $group: {
                    _id: '$leadRef',
                    events: { $push: { type: '$type', ts: '$timestamp' } }
                }},
                { $match: { 'events.1': { $exists: true } } }, // Al menos 2 eventos
                { $limit: 500 }, // Limitar para no saturar
                { $project: {
                    firstEvent: { $arrayElemAt: ['$events', 0] },
                    lastEvent: { $arrayElemAt: ['$events', -1] },
                    eventCount: { $size: '$events' },
                    // Buscar transiciones específicas
                    leadCapture: { $filter: { input: '$events', cond: { $eq: ['$$this.type', 'lead_capture'] } } },
                    demoScheduled: { $filter: { input: '$events', cond: { $eq: ['$$this.type', 'demo_scheduled'] } } },
                    firstPurchase: { $filter: { input: '$events', cond: { $in: ['$$this.type', ['first_class', 'subscription', 'kit_purchase']] } } }
                }}
            ]);

            // Calcular promedios
            let leadToDemo = [];
            let demoToPurchase = [];
            let leadToPurchase = [];

            for (const lead of velocityData) {
                const captureDate = lead.leadCapture?.[0]?.ts;
                const demoDate = lead.demoScheduled?.[0]?.ts;
                const purchaseDate = lead.firstPurchase?.[0]?.ts;

                if (captureDate && demoDate) {
                    const days = (new Date(demoDate) - new Date(captureDate)) / (1000 * 60 * 60 * 24);
                    if (days >= 0 && days < 365) leadToDemo.push(days);
                }
                if (demoDate && purchaseDate) {
                    const days = (new Date(purchaseDate) - new Date(demoDate)) / (1000 * 60 * 60 * 24);
                    if (days >= 0 && days < 365) demoToPurchase.push(days);
                }
                if (captureDate && purchaseDate) {
                    const days = (new Date(purchaseDate) - new Date(captureDate)) / (1000 * 60 * 60 * 24);
                    if (days >= 0 && days < 365) leadToPurchase.push(days);
                }
            }

            const avg = arr => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;

            return {
                success: true,
                data: {
                    leadToDemo: { avgDays: avg(leadToDemo), sampleSize: leadToDemo.length },
                    demoToPurchase: { avgDays: avg(demoToPurchase), sampleSize: demoToPurchase.length },
                    leadToPurchase: { avgDays: avg(leadToPurchase), sampleSize: leadToPurchase.length }
                }
            };
        } catch (error) {
            console.error('[CRM Attribution] Error en funnel velocity:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }
}

module.exports = CrmAttributionService;
