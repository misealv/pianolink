/**
 * crm/controllers/crmGrowthController.js
 * Controller del Growth Engine (Fase 3).
 * 
 * Endpoints para Attribution Dashboard, ROI Calculator,
 * Alertas automáticas y estado del tracking a plataformas.
 * 
 * Lazy-load de servicios para proteger RAM (512 MB Render).
 */

// === Lazy loaders (cada servicio se carga solo cuando se usa) ===
let _attributionService = null;
function getAttributionService() {
    if (!_attributionService) _attributionService = require('../services/CrmAttributionService');
    return _attributionService;
}

let _alertService = null;
function getAlertService() {
    if (!_alertService) _alertService = require('../services/CrmAlertService');
    return _alertService;
}

let _trackingDispatcher = null;
function getTrackingDispatcher() {
    if (!_trackingDispatcher) _trackingDispatcher = require('../services/CrmTrackingDispatcher');
    return _trackingDispatcher;
}

let _adsSpendSyncService = null;
function getAdsSpendSyncService() {
    if (!_adsSpendSyncService) _adsSpendSyncService = require('../services/CrmAdsSpendSyncService');
    return _adsSpendSyncService;
}

// =========================================================================
// ATTRIBUTION DASHBOARD
// =========================================================================

/**
 * GET /api/crm/growth/attribution/touchpoints
 * Touchpoints agrupados por canal (cuántos touchpoints aporta cada canal).
 */
exports.getTouchpointsByChannel = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const result = await getAttributionService().getTouchpointsByChannel(startDate, endDate);
        if (!result.success) return res.status(result.status || 500).json(result);
        res.json(result);
    } catch (error) {
        console.error('[CRM Growth] Error en touchpoints:', error);
        res.status(500).json({ success: false, message: 'Error obteniendo touchpoints' });
    }
};

/**
 * GET /api/crm/growth/attribution/comparison
 * Comparación first-touch vs last-touch por canal.
 */
exports.getAttributionComparison = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const result = await getAttributionService().getAttributionComparison(startDate, endDate);
        if (!result.success) return res.status(result.status || 500).json(result);
        res.json(result);
    } catch (error) {
        console.error('[CRM Growth] Error en comparison:', error);
        res.status(500).json({ success: false, message: 'Error obteniendo comparación de atribución' });
    }
};

/**
 * GET /api/crm/growth/attribution/journey/:crmLeadId
 * Customer journey completo de un lead (touchpoints + interacciones + conversiones).
 */
exports.getLeadJourney = async (req, res) => {
    try {
        const result = await getAttributionService().getLeadJourney(req.params.crmLeadId);
        if (!result.success) return res.status(result.status || 500).json(result);
        res.json(result);
    } catch (error) {
        console.error('[CRM Growth] Error en journey:', error);
        res.status(500).json({ success: false, message: 'Error obteniendo journey del lead' });
    }
};

// =========================================================================
// ROI CALCULATOR
// =========================================================================

/**
 * GET /api/crm/growth/roi/roas
 * ROAS (Return on Ad Spend) por campaña.
 */
exports.getROAS = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const result = await getAttributionService().getROASByCampaign(startDate, endDate);
        if (!result.success) return res.status(result.status || 500).json(result);
        res.json(result);
    } catch (error) {
        console.error('[CRM Growth] Error en ROAS:', error);
        res.status(500).json({ success: false, message: 'Error calculando ROAS' });
    }
};

/**
 * GET /api/crm/growth/roi/ltv-cac
 * LTV/CAC ratio (salud del negocio de adquisición).
 */
exports.getLTVCAC = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const result = await getAttributionService().getLTVCAC(startDate, endDate);
        if (!result.success) return res.status(result.status || 500).json(result);
        res.json(result);
    } catch (error) {
        console.error('[CRM Growth] Error en LTV/CAC:', error);
        res.status(500).json({ success: false, message: 'Error calculando LTV/CAC' });
    }
};

/**
 * GET /api/crm/growth/roi/platforms
 * Rendimiento comparativo por plataforma (Meta vs Google vs Orgánico).
 */
exports.getPlatformPerformance = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const result = await getAttributionService().getPlatformPerformance(startDate, endDate);
        if (!result.success) return res.status(result.status || 500).json(result);
        res.json(result);
    } catch (error) {
        console.error('[CRM Growth] Error en platforms:', error);
        res.status(500).json({ success: false, message: 'Error obteniendo rendimiento por plataforma' });
    }
};

// =========================================================================
// TENDENCIAS
// =========================================================================

/**
 * GET /api/crm/growth/trends/conversions
 * Tendencia de conversiones en el tiempo (day/week/month).
 */
exports.getConversionTrend = async (req, res) => {
    try {
        const { startDate, endDate, granularity } = req.query;
        const result = await getAttributionService().getConversionTrend(startDate, endDate, granularity || 'day');
        if (!result.success) return res.status(result.status || 500).json(result);
        res.json(result);
    } catch (error) {
        console.error('[CRM Growth] Error en trends:', error);
        res.status(500).json({ success: false, message: 'Error obteniendo tendencias' });
    }
};

/**
 * GET /api/crm/growth/trends/velocity
 * Velocidad del funnel (tiempo promedio entre etapas).
 */
exports.getFunnelVelocity = async (req, res) => {
    try {
        const result = await getAttributionService().getFunnelVelocity();
        if (!result.success) return res.status(result.status || 500).json(result);
        res.json(result);
    } catch (error) {
        console.error('[CRM Growth] Error en velocity:', error);
        res.status(500).json({ success: false, message: 'Error obteniendo velocidad del funnel' });
    }
};

// =========================================================================
// ALERTAS
// =========================================================================

/**
 * GET /api/crm/growth/alerts
 * Alertas activas de campañas (CPA alto, ROAS bajo, presupuesto agotado, etc.).
 */
exports.getCurrentAlerts = async (req, res) => {
    try {
        const result = await getAlertService().getCurrentAlerts();
        if (!result.success) return res.status(result.status || 500).json(result);
        res.json(result);
    } catch (error) {
        console.error('[CRM Growth] Error en alerts:', error);
        res.status(500).json({ success: false, message: 'Error obteniendo alertas' });
    }
};

/**
 * GET /api/crm/growth/alerts/thresholds
 * Umbrales de alerta configurados (para mostrar en UI de configuración).
 */
exports.getAlertThresholds = async (req, res) => {
    try {
        const thresholds = getAlertService().getThresholds();
        res.json({ success: true, data: thresholds });
    } catch (error) {
        console.error('[CRM Growth] Error en thresholds:', error);
        res.status(500).json({ success: false, message: 'Error obteniendo umbrales' });
    }
};

// =========================================================================
// TRACKING STATUS (estado de envío a plataformas)
// =========================================================================

/**
 * GET /api/crm/growth/tracking/status
 * Conversiones pendientes de reportar a Meta/Google/GA4.
 */
exports.getTrackingStatus = async (req, res) => {
    try {
        const stats = await getTrackingDispatcher().getPendingStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('[CRM Growth] Error en tracking status:', error);
        res.status(500).json({ success: false, message: 'Error obteniendo estado del tracking' });
    }
};

/**
 * POST /api/crm/growth/tracking/dispatch-now
 * Forzar despacho inmediato de conversiones pendientes (manual trigger).
 */
exports.dispatchNow = async (req, res) => {
    try {
        const result = await getTrackingDispatcher().processAll();
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('[CRM Growth] Error en dispatch:', error);
        res.status(500).json({ success: false, message: 'Error despachando conversiones' });
    }
};

/**
 * POST /api/crm/growth/ads-sync/run
 * Forzar sincronización de gasto publicitario (manual trigger).
 */
exports.runAdsSync = async (req, res) => {
    try {
        const result = await getAdsSpendSyncService().syncAll();
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('[CRM Growth] Error en ads sync:', error);
        res.status(500).json({ success: false, message: 'Error sincronizando gasto publicitario' });
    }
};
