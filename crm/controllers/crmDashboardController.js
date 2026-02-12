/**
 * crm/controllers/crmDashboardController.js
 * Controlador para el dashboard general del CRM.
 * Agrega datos de múltiples servicios para vista consolidada.
 */
const CrmLead = require('../models/CrmLead');
const CrmCampaign = require('../models/CrmCampaign');
const CrmConversion = require('../models/CrmConversion');
const CrmInteraction = require('../models/CrmInteraction');
const CrmLeadService = require('../services/CrmLeadService');
const CrmCampaignService = require('../services/CrmCampaignService');
const CrmFunnelService = require('../services/CrmFunnelService');

/**
 * Datos agregados para el dashboard principal del CRM
 */
exports.getOverview = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Calcular rango por defecto: últimos 30 días
        const end = endDate ? new Date(endDate) : new Date();
        const start = startDate ? new Date(startDate) : new Date(end - 30 * 24 * 60 * 60 * 1000);

        const dateFilter = { createdAt: { $gte: start, $lte: end } };
        const convDateFilter = { timestamp: { $gte: start, $lte: end } };

        // Todas las queries en paralelo para mínima latencia
        const [
            totalLeads,
            newLeadsInPeriod,
            segmentDist,
            lifecycleDist,
            topLeads,
            channelDist,
            activeCampaigns,
            conversionsByType,
            totalValue,
            recentActivity,
            funnelVelocity
        ] = await Promise.all([
            CrmLead.countDocuments({}),
            CrmLead.countDocuments(dateFilter),
            CrmLeadService.getSegmentDistribution(),
            CrmLeadService.getLifecycleDistribution(),
            CrmLeadService.getTopLeads(5),
            CrmLeadService.getByChannel(start, end),
            CrmCampaignService.getActiveSummary(),
            CrmConversion.getByType(start, end),
            CrmConversion.getTotalValue(start, end),
            CrmInteraction.getRecentActivity(24),
            CrmFunnelService.getFunnelVelocity(30)
        ]);

        res.json({
            success: true,
            data: {
                period: { start, end },
                kpis: {
                    totalLeads,
                    newLeadsInPeriod,
                    totalConversions: totalValue.count || 0,
                    totalRevenue: totalValue.total || 0,
                    avgDaysToConvert: funnelVelocity.data?.avgDaysToConvert || 'N/A'
                },
                segments: segmentDist.data || [],
                lifecycle: lifecycleDist.data || [],
                topLeads: topLeads.data || [],
                channels: channelDist.data || [],
                campaigns: activeCampaigns.data || {},
                conversions: conversionsByType || [],
                recentActivity: recentActivity || []
            }
        });
    } catch (error) {
        console.error('[CRM Controller] Error en getOverview:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

/**
 * KPIs rápidos para tarjetas del dashboard (lightweight)
 */
exports.getQuickStats = async (req, res) => {
    try {
        const now = new Date();
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

        const [
            totalLeads,
            leadsLast30,
            leadsLast7,
            hotLeads,
            totalConversions30d,
            activeCampaigns
        ] = await Promise.all([
            CrmLead.countDocuments({}),
            CrmLead.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
            CrmLead.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
            CrmLead.countDocuments({ segment: 'hot' }),
            CrmConversion.getTotalValue(thirtyDaysAgo, now),
            CrmCampaign.countDocuments({ status: 'active' })
        ]);

        res.json({
            success: true,
            data: {
                totalLeads,
                leadsLast30Days: leadsLast30,
                leadsLast7Days: leadsLast7,
                hotLeads,
                conversionsLast30Days: totalConversions30d.count || 0,
                revenueLast30Days: totalConversions30d.total || 0,
                activeCampaigns
            }
        });
    } catch (error) {
        console.error('[CRM Controller] Error en getQuickStats:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};
