/**
 * crm/controllers/crmConfigController.js
 * Controlador para configuración del CRM (Meta Pixel, etc.)
 * 
 * COMPLETADO: Panel de configuración de Meta Pixel
 */
const CrmConfig = require('../models/CrmConfig');
const { getPixelSnippet, EVENTOS_POR_PAGINA } = require('../helpers/metaPixelHelper');

/**
 * Obtener configuración completa
 * GET /api/crm/config
 */
exports.getConfig = async (req, res) => {
    try {
        const config = await CrmConfig.getSettings();
        res.json({ success: true, data: config });
    } catch (error) {
        console.error('[CRM Config] Error en getConfig:', error);
        res.status(500).json({ success: false, error: 'Error al obtener configuración' });
    }
};

/**
 * Actualizar configuración
 * PUT /api/crm/config
 */
exports.updateConfig = async (req, res) => {
    try {
        const updates = req.body;
        const config = await CrmConfig.updateSettings(updates);
        res.json({ success: true, data: config });
    } catch (error) {
        console.error('[CRM Config] Error en updateConfig:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar configuración' });
    }
};

// === META PIXEL ===

/**
 * Obtener configuración de Meta Pixel
 * GET /api/crm/pixel
 */
exports.getPixelConfig = async (req, res) => {
    try {
        const config = await CrmConfig.getSettings();
        
        // Obtener snippet de ejemplo
        const snippet = config.metaPixel?.enabled && config.metaPixel?.pixelId
            ? getPixelSnippet(config.metaPixel.pixelId)
            : null;
        
        res.json({ 
            success: true, 
            data: {
                ...config.metaPixel,
                snippet,
                eventosPorPagina: EVENTOS_POR_PAGINA
            }
        });
    } catch (error) {
        console.error('[CRM Config] Error en getPixelConfig:', error);
        res.status(500).json({ success: false, error: 'Error al obtener configuración de pixel' });
    }
};

/**
 * Actualizar configuración de Meta Pixel
 * PUT /api/crm/pixel
 */
exports.updatePixelConfig = async (req, res) => {
    try {
        const { enabled, pixelId, testEventCode } = req.body;
        
        const config = await CrmConfig.getSettings();
        
        if (enabled !== undefined) config.metaPixel.enabled = enabled;
        if (pixelId !== undefined) config.metaPixel.pixelId = pixelId;
        if (testEventCode !== undefined) config.metaPixel.testEventCode = testEventCode;
        
        await config.save();
        
        // Generar snippet actualizado
        const snippet = config.metaPixel.enabled && config.metaPixel.pixelId
            ? getPixelSnippet(config.metaPixel.pixelId)
            : null;
        
        res.json({ 
            success: true, 
            data: {
                ...config.metaPixel,
                snippet,
                eventosPorPagina: EVENTOS_POR_PAGINA
            }
        });
    } catch (error) {
        console.error('[CRM Config] Error en updatePixelConfig:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar configuración de pixel' });
    }
};

/**
 * Generar snippet del pixel para copiar
 * GET /api/crm/pixel/snippet
 */
exports.getPixelSnippet = async (req, res) => {
    try {
        const pixelId = await CrmConfig.getMetaPixelId();
        
        if (!pixelId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Meta Pixel no configurado o desactivado' 
            });
        }
        
        const { evento, pagina } = req.query;
        let datos = {};
        
        // Si se especifica una página, usar sus datos configurados
        if (pagina && EVENTOS_POR_PAGINA[pagina]) {
            const config = EVENTOS_POR_PAGINA[pagina].pageView;
            if (config) datos = config.datos;
        }
        
        const snippet = getPixelSnippet(pixelId, evento || 'PageView', datos);
        
        res.json({ success: true, snippet, pixelId });
    } catch (error) {
        console.error('[CRM Config] Error en getPixelSnippet:', error);
        res.status(500).json({ success: false, error: 'Error al generar snippet' });
    }
};
