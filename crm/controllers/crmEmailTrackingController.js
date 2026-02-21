/**
 * crm/controllers/crmEmailTrackingController.js
 * Recibe webhooks de Resend (eventos de email) y actualiza
 * el engagement del lead en MongoDB.
 *
 * Eventos procesados: sent, delivered, opened, clicked, bounced, complained.
 * Vinculación: Resend email_id → CrmInteraction.metadata.emailId → crmLead.
 */
const crypto = require('crypto');
const CrmLead = require('../models/CrmLead');
const CrmInteraction = require('../models/CrmInteraction');
const EmailTrackingEvent = require('../models/EmailTrackingEvent');

/**
 * POST /api/crm/webhooks/resend/events
 * Recibe eventos de Resend. SIN AUTH — Resend llama directamente.
 * Siempre responde 200 (Resend reintenta si no).
 */
exports.receiveResendEvent = async (req, res) => {
    // Responder 200 inmediatamente (fire-and-forget para no bloquear)
    res.status(200).json({ received: true });

    try {
        const payload = req.body;
        if (!payload || !payload.type) {
            console.warn('[Email Tracking] Webhook sin tipo, ignorando');
            return;
        }

        // Verificar firma si tenemos el secret configurado
        const secret = process.env.RESEND_WEBHOOK_SECRET;
        if (secret) {
            const svixId = req.headers['svix-id'];
            const svixTimestamp = req.headers['svix-timestamp'];
            const svixSignature = req.headers['svix-signature'];

            if (svixId && svixTimestamp && svixSignature) {
                const toSign = `${svixId}.${svixTimestamp}.${JSON.stringify(req.body)}`;
                // Resend usa base64-encoded secret con prefijo "whsec_"
                const secretBytes = Buffer.from(secret.replace('whsec_', ''), 'base64');
                const expectedSig = crypto
                    .createHmac('sha256', secretBytes)
                    .update(toSign)
                    .digest('base64');

                const signatures = svixSignature.split(' ').map(s => s.replace('v1,', ''));
                const isValid = signatures.some(sig => sig === expectedSig);

                if (!isValid) {
                    console.warn('[Email Tracking] ⚠️ Firma inválida del webhook, procesando de todas formas');
                }
            }
        } else {
            console.warn('[Email Tracking] RESEND_WEBHOOK_SECRET no configurado — procesando sin verificación');
        }

        // Extraer datos del evento
        // Resend envía: { type: "email.opened", created_at, data: { email_id, to, ... } }
        const eventType = payload.type.replace('email.', ''); // "email.opened" → "opened"
        const data = payload.data || {};
        const resendEmailId = data.email_id;

        if (!resendEmailId) {
            console.warn('[Email Tracking] Evento sin email_id, ignorando:', payload.type);
            return;
        }

        const validTypes = ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'delivery_delayed'];
        if (!validTypes.includes(eventType)) {
            console.log(`[Email Tracking] Evento desconocido: ${eventType}, ignorando`);
            return;
        }

        console.log(`[Email Tracking] 📬 Evento: ${eventType} | email_id: ${resendEmailId}`);

        // Buscar la interacción original por emailId
        const interaction = await CrmInteraction.findOne({
            'metadata.emailId': resendEmailId
        }).lean();

        if (!interaction) {
            // Puede ser un email de campaña masiva u otro origen — ignorar
            console.log(`[Email Tracking] No se encontró interacción para email_id: ${resendEmailId}`);
            return;
        }

        const crmLeadId = interaction.leadRef;
        if (!crmLeadId) {
            console.warn('[Email Tracking] Interacción sin leadRef:', interaction._id);
            return;
        }

        // Crear evento de tracking
        await EmailTrackingEvent.create({
            crmLead: crmLeadId,
            emailInteractionId: interaction._id,
            resendEmailId: resendEmailId,
            eventType: eventType,
            recipient: Array.isArray(data.to) ? data.to[0] : (data.to || ''),
            clickedUrl: data.click?.link || data.url || null,
            bounceType: data.bounce?.type || null,
            bounceMessage: data.bounce?.message || null,
            userAgent: data.click?.userAgent || data.open?.userAgent || '',
            ipCountry: data.click?.ipAddress ? '' : '', // No guardar IP por GDPR
            rawEvent: payload,
            timestamp: data.created_at ? new Date(data.created_at) : new Date()
        });

        // Actualizar emailEngagement en CrmLead
        const crmLead = await CrmLead.findById(crmLeadId);
        if (!crmLead) {
            console.warn(`[Email Tracking] CrmLead no encontrado: ${crmLeadId}`);
            return;
        }

        // Inicializar si no existe
        if (!crmLead.emailEngagement) {
            crmLead.emailEngagement = {
                totalSent: 0, totalDelivered: 0, totalOpened: 0,
                totalClicked: 0, totalBounced: 0,
                engagementLevel: 'none'
            };
        }

        const eng = crmLead.emailEngagement;

        switch (eventType) {
            case 'delivered':
                eng.totalDelivered = (eng.totalDelivered || 0) + 1;
                if (eng.engagementLevel === 'none') {
                    eng.engagementLevel = 'cold';
                }
                break;

            case 'opened':
                eng.totalOpened = (eng.totalOpened || 0) + 1;
                eng.lastOpenedAt = new Date();

                if (eng.totalOpened >= 3) {
                    eng.engagementLevel = 'super_hot';
                    // Score +15 solo al pasar a super_hot por primera vez
                    if (crmLead.emailEngagement.engagementLevel !== 'super_hot') {
                        crmLead.score = Math.min(100, (crmLead.score || 0) + 15);
                        if (!crmLead.scoreHistory) crmLead.scoreHistory = [];
                        crmLead.scoreHistory.push({
                            date: new Date(),
                            change: 15,
                            reason: `Email abierto ${eng.totalOpened} veces (super_hot)`
                        });
                    }
                } else if (eng.totalOpened >= 2) {
                    eng.engagementLevel = 'hot';
                } else {
                    eng.engagementLevel = 'warm';
                    // Score +10 en primera apertura
                    crmLead.score = Math.min(100, (crmLead.score || 0) + 10);
                    if (!crmLead.scoreHistory) crmLead.scoreHistory = [];
                    crmLead.scoreHistory.push({
                        date: new Date(),
                        change: 10,
                        reason: 'Email abierto por primera vez'
                    });
                }
                break;

            case 'clicked':
                eng.totalClicked = (eng.totalClicked || 0) + 1;
                eng.lastClickedAt = new Date();
                eng.engagementLevel = 'super_hot';
                // Score +20 en primer click
                if (eng.totalClicked === 1) {
                    crmLead.score = Math.min(100, (crmLead.score || 0) + 20);
                    if (!crmLead.scoreHistory) crmLead.scoreHistory = [];
                    crmLead.scoreHistory.push({
                        date: new Date(),
                        change: 20,
                        reason: `Click en link de email: ${data.click?.link || 'link'}`
                    });
                }
                break;

            case 'bounced':
                eng.totalBounced = (eng.totalBounced || 0) + 1;
                // Marcar email como inválido
                if (!crmLead.emailPreferences) crmLead.emailPreferences = {};
                crmLead.emailPreferences.bounced = true;
                crmLead.emailPreferences.bouncedAt = new Date();
                // Score -10
                crmLead.score = Math.max(0, (crmLead.score || 0) - 10);
                if (!crmLead.scoreHistory) crmLead.scoreHistory = [];
                crmLead.scoreHistory.push({
                    date: new Date(),
                    change: -10,
                    reason: `Email rebotó (${data.bounce?.type || 'unknown'})`
                });
                // Tag de email inválido
                if (!crmLead.tags) crmLead.tags = [];
                if (!crmLead.tags.includes('email_invalido')) {
                    crmLead.tags.push('email_invalido');
                }
                // Crear CrmInteraction de bounce (visible en timeline general)
                await CrmInteraction.create({
                    leadRef: crmLeadId,
                    type: 'email_bounce',
                    channel: 'email',
                    metadata: {
                        emailId: resendEmailId,
                        bounceType: data.bounce?.type || 'unknown',
                        bounceMessage: data.bounce?.message || '',
                        notes: `Email rebotó: ${data.bounce?.message || 'sin detalle'}`
                    },
                    timestamp: new Date()
                });
                console.log(`[Email Tracking] ↩️ Bounce registrado para lead ${crmLeadId}`);
                break;

            case 'complained':
                eng.complained = true;
                if (!crmLead.emailPreferences) crmLead.emailPreferences = {};
                crmLead.emailPreferences.unsubscribed = true;
                crmLead.emailPreferences.unsubscribedAt = new Date();
                // Tag
                if (!crmLead.tags) crmLead.tags = [];
                if (!crmLead.tags.includes('spam_complaint')) {
                    crmLead.tags.push('spam_complaint');
                }
                console.log(`[Email Tracking] ⚠️ Spam complaint para lead ${crmLeadId}`);
                break;

            case 'delivery_delayed':
                console.log(`[Email Tracking] ⏳ Delivery delayed para email ${resendEmailId}`);
                break;
        }

        await crmLead.save();
        console.log(`[Email Tracking] ✅ Lead ${crmLeadId} actualizado — engagement: ${eng.engagementLevel}`);

    } catch (error) {
        // No fallar nunca — solo loggear
        console.error('[Email Tracking] ❌ Error procesando webhook:', error.message);
    }
};

/**
 * GET /api/crm/tracking/email/timeline/:crmLeadId
 * Retorna el historial de tracking de emails para un lead.
 * Agrupado por resendEmailId (cada email enviado agrupa sus eventos).
 */
exports.getEmailTimeline = async (req, res) => {
    try {
        const { crmLeadId } = req.params;

        const events = await EmailTrackingEvent.find({ crmLead: crmLeadId })
            .sort({ timestamp: -1 })
            .limit(200)
            .lean();

        // Agrupar por resendEmailId
        const grouped = {};
        for (const ev of events) {
            const key = ev.resendEmailId;
            if (!grouped[key]) {
                grouped[key] = {
                    resendEmailId: key,
                    recipient: ev.recipient,
                    events: []
                };
            }
            grouped[key].events.push({
                type: ev.eventType,
                timestamp: ev.timestamp,
                clickedUrl: ev.clickedUrl,
                bounceType: ev.bounceType,
                bounceMessage: ev.bounceMessage
            });
        }

        // Ordenar grupos por el evento más reciente
        const timeline = Object.values(grouped).sort((a, b) => {
            const aTime = a.events[0]?.timestamp || 0;
            const bTime = b.events[0]?.timestamp || 0;
            return new Date(bTime) - new Date(aTime);
        });

        return res.json({
            success: true,
            total: events.length,
            emails: timeline
        });

    } catch (error) {
        console.error('[Email Tracking] Error en timeline:', error.message);
        return res.status(500).json({ success: false, message: 'Error obteniendo timeline' });
    }
};

/**
 * GET /api/crm/tracking/email/stats
 * Métricas generales de email tracking (para dashboard).
 */
exports.getEmailStats = async (req, res) => {
    try {
        // Estadísticas de la última semana
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const stats = await EmailTrackingEvent.aggregate([
            { $match: { timestamp: { $gte: weekAgo } } },
            { $group: { _id: '$eventType', count: { $sum: 1 } } }
        ]);

        const result = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 };
        for (const s of stats) {
            if (result.hasOwnProperty(s._id)) {
                result[s._id] = s.count;
            }
        }

        // Tasa de apertura
        result.openRate = result.delivered > 0
            ? Math.round((result.opened / result.delivered) * 1000) / 10
            : 0;

        // Leads calientes (abrieron esta semana)
        const hotLeads = await CrmLead.countDocuments({
            'emailEngagement.lastOpenedAt': { $gte: weekAgo },
            'emailEngagement.engagementLevel': { $in: ['hot', 'super_hot'] }
        });
        result.hotLeads = hotLeads;

        return res.json({ success: true, period: 'last_7_days', stats: result });

    } catch (error) {
        console.error('[Email Tracking] Error en stats:', error.message);
        return res.status(500).json({ success: false, message: 'Error obteniendo estadísticas' });
    }
};
