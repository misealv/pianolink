/**
 * crm/services/CrmCampaignService.js
 * Servicio para gestión de campañas de marketing.
 * CRUD + métricas + vinculación con leads y conversiones.
 */
const CrmCampaign = require('../models/CrmCampaign');
const CrmConversion = require('../models/CrmConversion');
const CrmLead = require('../models/CrmLead');

class CrmCampaignService {

    // =========================================================================
    // CRUD
    // =========================================================================

    /**
     * Crea una nueva campaña
     */
    static async create(data) {
        try {
            // Generar UTM params automáticos si no se proveen
            if (!data.utmParams || !data.utmParams.campaign) {
                const slug = (data.name || 'campaign')
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '');
                data.utmParams = {
                    source: data.platform || 'organic',
                    medium: data.type === 'acquisition' ? 'cpc' : 'email',
                    campaign: slug,
                    content: data.utmParams?.content || '',
                    term: data.utmParams?.term || ''
                };
            }

            const campaign = await CrmCampaign.create(data);
            console.log(`[CRM] Campaña creada: ${campaign.name} (${campaign.platform})`);
            return { success: true, data: campaign };
        } catch (error) {
            console.error('[CRM] Error en create campaign:', error);
            if (error.name === 'ValidationError') {
                return { success: false, message: error.message, status: 400 };
            }
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Obtiene una campaña por ID con métricas calculadas
     */
    static async getById(campaignId) {
        try {
            const campaign = await CrmCampaign.findById(campaignId)
                .populate('createdBy', 'name email')
                .lean({ virtuals: true });

            if (!campaign) {
                return { success: false, message: 'Campaña no encontrada', status: 404 };
            }

            // Enriquecer con conversiones reales
            const conversions = await CrmConversion.getByCampaign(campaignId);
            campaign.conversionDetails = conversions;

            return { success: true, data: campaign };
        } catch (error) {
            console.error('[CRM] Error en getById campaign:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Lista campañas con filtros y paginación
     */
    static async list(filters = {}) {
        try {
            const {
                platform,
                status,
                type,
                targetAudience,
                page = 1,
                limit = 20,
                sortBy = 'createdAt',
                sortOrder = 'desc'
            } = filters;

            const query = {};
            if (platform) query.platform = platform;
            if (status) query.status = status;
            if (type) query.type = type;
            if (targetAudience) query.targetAudience = targetAudience;

            const skip = (Number(page) - 1) * Number(limit);
            const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

            const [campaigns, total] = await Promise.all([
                CrmCampaign.find(query)
                    .populate('createdBy', 'name')
                    .sort(sort)
                    .skip(skip)
                    .limit(Number(limit))
                    .lean({ virtuals: true }),
                CrmCampaign.countDocuments(query)
            ]);

            return {
                success: true,
                data: campaigns,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit))
                }
            };
        } catch (error) {
            console.error('[CRM] Error en list campaigns:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Actualiza una campaña
     */
    static async update(campaignId, updateData) {
        try {
            const protectedFields = ['_id', 'metrics', 'createdBy'];
            protectedFields.forEach(f => delete updateData[f]);

            const campaign = await CrmCampaign.findByIdAndUpdate(
                campaignId,
                { $set: updateData },
                { new: true, runValidators: true }
            );

            if (!campaign) {
                return { success: false, message: 'Campaña no encontrada', status: 404 };
            }

            return { success: true, data: campaign };
        } catch (error) {
            console.error('[CRM] Error en update campaign:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Cambia el estado de una campaña
     */
    static async updateStatus(campaignId, newStatus) {
        try {
            const valid = ['draft', 'active', 'paused', 'completed', 'archived'];
            if (!valid.includes(newStatus)) {
                return { success: false, message: `Estado inválido: ${newStatus}`, status: 400 };
            }

            const campaign = await CrmCampaign.findByIdAndUpdate(
                campaignId,
                { status: newStatus },
                { new: true }
            );

            if (!campaign) {
                return { success: false, message: 'Campaña no encontrada', status: 404 };
            }

            console.log(`[CRM] Campaña "${campaign.name}" → ${newStatus}`);
            return { success: true, data: campaign };
        } catch (error) {
            console.error('[CRM] Error en updateStatus campaign:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    // =========================================================================
    // MÉTRICAS
    // =========================================================================

    /**
     * Registra un nuevo lead en las métricas de campaña
     */
    static async registerLeadForCampaign(campaignId) {
        try {
            if (!campaignId) return { success: true, data: null };

            const campaign = await CrmCampaign.findById(campaignId);
            if (!campaign) return { success: false, message: 'Campaña no encontrada', status: 404 };

            await campaign.incrementMetric('leads');
            await campaign.recalculateMetrics();

            return { success: true, data: campaign.metrics };
        } catch (error) {
            console.error('[CRM] Error en registerLeadForCampaign:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Registra una conversión en las métricas de campaña
     */
    static async registerConversionForCampaign(campaignId, revenueInCents = 0) {
        try {
            if (!campaignId) return { success: true, data: null };

            // Usar $inc atómico para evitar race conditions con conversiones concurrentes
            const campaign = await CrmCampaign.findByIdAndUpdate(
                campaignId,
                { $inc: { 'metrics.conversions': 1, 'metrics.revenue': revenueInCents } },
                { new: true }
            );
            if (!campaign) return { success: false, message: 'Campaña no encontrada', status: 404 };

            await campaign.recalculateMetrics();

            return { success: true, data: campaign.metrics };
        } catch (error) {
            console.error('[CRM] Error en registerConversionForCampaign:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Resumen de rendimiento de todas las campañas activas
     */
    static async getActiveSummary() {
        try {
            const campaigns = await CrmCampaign.getActiveSummary();
            const totalSpent = campaigns.reduce((sum, c) => sum + (c.budget?.spent || 0), 0);
            const totalLeads = campaigns.reduce((sum, c) => sum + (c.metrics?.leads || 0), 0);
            const totalConversions = campaigns.reduce((sum, c) => sum + (c.metrics?.conversions || 0), 0);
            const totalRevenue = campaigns.reduce((sum, c) => sum + (c.metrics?.revenue || 0), 0);

            return {
                success: true,
                data: {
                    campaigns,
                    summary: {
                        activeCampaigns: campaigns.length,
                        totalSpent,
                        totalLeads,
                        totalConversions,
                        totalRevenue,
                        overallROAS: totalSpent > 0 ? Math.round((totalRevenue / totalSpent) * 100) : 0
                    }
                }
            };
        } catch (error) {
            console.error('[CRM] Error en getActiveSummary:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }

    /**
     * Gasto por plataforma para el dashboard
     */
    static async getSpendByPlatform(startDate, endDate) {
        try {
            const match = {};
            if (startDate || endDate) {
                match.createdAt = {};
                if (startDate) match.createdAt.$gte = new Date(startDate);
                if (endDate) match.createdAt.$lte = new Date(endDate);
            }

            const data = await CrmCampaign.aggregate([
                { $match: match },
                { $group: {
                    _id: '$platform',
                    totalSpent: { $sum: '$budget.spent' },
                    totalBudget: { $sum: '$budget.total' },
                    campaigns: { $sum: 1 },
                    totalLeads: { $sum: '$metrics.leads' },
                    totalConversions: { $sum: '$metrics.conversions' },
                    totalRevenue: { $sum: '$metrics.revenue' }
                }},
                { $sort: { totalSpent: -1 } }
            ]);

            return { success: true, data };
        } catch (error) {
            console.error('[CRM] Error en getSpendByPlatform:', error);
            return { success: false, message: error.message, status: 500 };
        }
    }
}

module.exports = CrmCampaignService;
