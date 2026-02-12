/**
 * crm/controllers/crmWebhookController.js
 * Controller para recibir webhooks de Meta y Google.
 * 
 * Recibe eventos push de las plataformas publicitarias
 * para sincronizar métricas sin esperar al cron.
 * 
 * Seguridad: signature verification en cada plataforma.
 * RAM-Friendly: lazy-load de servicios, procesamiento mínimo.
 */
const crypto = require('crypto');

// === Lazy loaders ===
let _CrmCampaign = null;
function getCrmCampaign() {
    if (!_CrmCampaign) _CrmCampaign = require('../models/CrmCampaign');
    return _CrmCampaign;
}

let _CrmConversion = null;
function getCrmConversion() {
    if (!_CrmConversion) _CrmConversion = require('../models/CrmConversion');
    return _CrmConversion;
}

let _CrmInteraction = null;
function getCrmInteraction() {
    if (!_CrmInteraction) _CrmInteraction = require('../models/CrmInteraction');
    return _CrmInteraction;
}

// =========================================================================
// META WEBHOOKS
// =========================================================================

/**
 * GET /api/crm/webhooks/meta
 * Verificación de webhook de Meta (challenge handshake).
 * Meta envía un GET con hub.mode, hub.verify_token, hub.challenge.
 */
exports.metaVerify = (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'pianolink_crm_meta';

    if (mode === 'subscribe' && token === verifyToken) {
        console.log('[CRM Webhook] ✅ Meta webhook verificado');
        return res.status(200).send(challenge);
    }

    console.warn('[CRM Webhook] ⚠️ Meta webhook verification failed');
    res.status(403).json({ error: 'Verification failed' });
};

/**
 * POST /api/crm/webhooks/meta
 * Recibir eventos de Meta (ads, lead forms, etc.).
 * 
 * Eventos soportados:
 * - leadgen: nuevo lead desde formulario de Meta Ads
 * - ad_account: cambios en campañas/ad sets
 */
exports.metaReceive = async (req, res) => {
    // Responder 200 inmediatamente (Meta espera <20s)
    res.status(200).json({ received: true });

    try {
        // Verificar firma si META_APP_SECRET está configurado
        if (process.env.META_APP_SECRET) {
            const signature = req.headers['x-hub-signature-256'];
            if (!signature) {
                console.warn('[CRM Webhook] Meta: sin firma en header');
                return;
            }

            const rawBody = JSON.stringify(req.body);
            const expectedSig = 'sha256=' + crypto
                .createHmac('sha256', process.env.META_APP_SECRET)
                .update(rawBody)
                .digest('hex');

            if (signature !== expectedSig) {
                console.warn('[CRM Webhook] Meta: firma inválida');
                return;
            }
        }

        const body = req.body;
        if (!body || !body.entry) return;

        // Procesar cada entrada
        for (const entry of body.entry) {
            if (!entry.changes) continue;

            for (const change of entry.changes) {
                await _processMetaChange(change);
            }
        }
    } catch (error) {
        console.error('[CRM Webhook] Error procesando evento Meta:', error.message);
    }
};

/**
 * Procesa un cambio individual de Meta.
 * @private
 */
async function _processMetaChange(change) {
    const field = change.field;
    const value = change.value;

    if (!value) return;

    switch (field) {
        case 'leadgen':
            // Nuevo lead desde formulario de Meta
            console.log(`[CRM Webhook] Meta leadgen: form_id=${value.form_id}, leadgen_id=${value.leadgen_id}`);
            // El lead se creará via el flujo normal (form submit → core → bridge)
            // Aquí solo registramos la interacción
            break;

        case 'ad_account':
            // Cambio en campaña (pausa, presupuesto, etc.)
            if (value.campaign_id) {
                const CrmCampaign = getCrmCampaign();
                await CrmCampaign.findOneAndUpdate(
                    { 'externalIds.metaCampaignId': value.campaign_id.toString() },
                    { $set: { updatedAt: new Date() } }
                );
                console.log(`[CRM Webhook] Meta ad_account change: campaign_id=${value.campaign_id}`);
            }
            break;

        case 'ads_insights':
            // Métricas actualizadas (spend, impressions, clicks)
            if (value.campaign_id) {
                const CrmCampaign = getCrmCampaign();
                const updateFields = {};
                if (value.spend !== undefined) updateFields['budget.spent'] = Math.round(parseFloat(value.spend) * 100);
                if (value.impressions !== undefined) updateFields['metrics.impressions'] = parseInt(value.impressions);
                if (value.clicks !== undefined) updateFields['metrics.clicks'] = parseInt(value.clicks);

                if (Object.keys(updateFields).length > 0) {
                    await CrmCampaign.findOneAndUpdate(
                        { 'externalIds.metaCampaignId': value.campaign_id.toString() },
                        { $set: updateFields }
                    );
                }
            }
            break;

        default:
            // Evento no procesado (silenciar para no llenar logs)
            break;
    }
}

// =========================================================================
// GOOGLE ADS WEBHOOKS
// =========================================================================

/**
 * POST /api/crm/webhooks/google
 * Recibir notificaciones de Google Ads (cambios de estado de campaña).
 * 
 * Google Ads no tiene un sistema de webhooks nativo como Meta.
 * Este endpoint es para uso con Google Cloud Pub/Sub notifications
 * o un proxy personalizado.
 */
exports.googleReceive = async (req, res) => {
    // Responder 200 inmediatamente
    res.status(200).json({ received: true });

    try {
        // Verificar token de autenticación
        const authToken = req.headers['authorization'];
        const expectedToken = process.env.GOOGLE_WEBHOOK_TOKEN;

        if (expectedToken && authToken !== `Bearer ${expectedToken}`) {
            console.warn('[CRM Webhook] Google: token inválido');
            return;
        }

        const body = req.body;
        if (!body) return;

        // Procesar según tipo de evento
        const eventType = body.type || body.eventType;

        switch (eventType) {
            case 'campaign_status_changed':
                if (body.campaignId) {
                    const CrmCampaign = getCrmCampaign();
                    const statusMap = {
                        'ENABLED': 'active',
                        'PAUSED': 'paused',
                        'REMOVED': 'archived'
                    };
                    const newStatus = statusMap[body.status] || null;
                    if (newStatus) {
                        await CrmCampaign.findOneAndUpdate(
                            { 'externalIds.googleCampaignId': body.campaignId.toString() },
                            { $set: { status: newStatus, updatedAt: new Date() } }
                        );
                        console.log(`[CRM Webhook] Google campaign ${body.campaignId} → ${newStatus}`);
                    }
                }
                break;

            case 'budget_spent':
                if (body.campaignId && body.costMicros !== undefined) {
                    const CrmCampaign = getCrmCampaign();
                    // Google reporta en micros (1 USD = 1,000,000 micros), convertimos a centavos
                    const spentCents = Math.round(parseInt(body.costMicros) / 10000);
                    await CrmCampaign.findOneAndUpdate(
                        { 'externalIds.googleCampaignId': body.campaignId.toString() },
                        { $set: { 'budget.spent': spentCents } }
                    );
                }
                break;

            case 'conversion_action':
                // Conversión registrada en Google Ads (confirmación)
                if (body.conversionActionId && body.orderId) {
                    const CrmConversion = getCrmConversion();
                    await CrmConversion.findOneAndUpdate(
                        { 'coreRef.id': body.orderId },
                        { $set: { 'reportedTo.google.sent': true, 'reportedTo.google.sentAt': new Date() } }
                    );
                }
                break;

            default:
                console.log(`[CRM Webhook] Google evento no procesado: ${eventType}`);
                break;
        }
    } catch (error) {
        console.error('[CRM Webhook] Error procesando evento Google:', error.message);
    }
};

// =========================================================================
// STATUS
// =========================================================================

/**
 * GET /api/crm/webhooks/status
 * Estado de configuración de los webhooks.
 */
exports.getWebhookStatus = (req, res) => {
    res.json({
        success: true,
        data: {
            meta: {
                configured: !!(process.env.META_PIXEL_ID && process.env.META_ACCESS_TOKEN),
                webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN ? '***configurado***' : 'usando default',
                signatureVerification: !!process.env.META_APP_SECRET
            },
            google: {
                configured: !!(process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_CUSTOMER_ID),
                webhookToken: process.env.GOOGLE_WEBHOOK_TOKEN ? '***configurado***' : 'no configurado'
            },
            ga4: {
                configured: !!(process.env.GA4_MEASUREMENT_ID && process.env.GA4_API_SECRET)
            }
        }
    });
};
