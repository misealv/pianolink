/**
 * crm/routes/crmTrackingRoutes.js
 * Rutas para tracking y captura de eventos client-side.
 * 
 * NOTA: En Fase 3 se añadirán endpoints de reporting a Meta/Google APIs.
 * Por ahora, captura UTMs y tracking IDs del frontend.
 * 
 * Endpoints:
 *   POST   /api/crm/tracking/pageview             — Registrar pageview
 *   POST   /api/crm/tracking/event                 — Registrar evento custom
 *   POST   /api/crm/tracking/identify              — Asociar tracking IDs a un lead
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const CrmLead = require('../models/CrmLead');
const CrmInteraction = require('../models/CrmInteraction');

// Estos endpoints NO requieren auth (son del frontend público)
// pero están rate-limited por el middleware general de Express

/**
 * Registrar pageview desde el frontend.
 * Cuerpo: { leadRef?, pageUrl, utmSource?, utmMedium?, utmCampaign?, fbclid?, gclid? }
 */
router.post('/pageview', async (req, res) => {
    try {
        const { crmLeadId, pageUrl, utmSource, utmMedium, utmCampaign } = req.body;

        // Si no hay leadRef, solo registrar para analytics general (Fase 3)
        if (!crmLeadId) {
            return res.json({ success: true, message: 'Pageview registrado (anónimo)' });
        }

        // Hashear IP para GDPR
        const ipHash = crypto.createHash('sha256')
            .update(req.ip || 'unknown')
            .digest('hex')
            .substring(0, 16);

        await CrmInteraction.create({
            leadRef: crmLeadId,
            type: 'page_view',
            channel: 'web',
            metadata: {
                pageUrl: pageUrl || '',
                userAgent: (req.headers['user-agent'] || '').substring(0, 200),
                ipHash
            },
            utmParams: {
                source: utmSource || '',
                medium: utmMedium || '',
                campaign: utmCampaign || ''
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('[CRM Tracking] Error en pageview:', error);
        res.status(500).json({ success: false, message: 'Error de tracking' });
    }
});

/**
 * Registrar evento custom desde el frontend
 * Cuerpo: { crmLeadId, eventType, metadata? }
 */
router.post('/event', async (req, res) => {
    try {
        const { crmLeadId, eventType, channel, metadata } = req.body;
        if (!crmLeadId || !eventType) {
            return res.status(400).json({ success: false, message: 'Se requiere crmLeadId y eventType' });
        }

        await CrmInteraction.create({
            leadRef: crmLeadId,
            type: eventType,
            channel: channel || 'web',
            metadata: metadata || {}
        });

        res.json({ success: true });
    } catch (error) {
        console.error('[CRM Tracking] Error en event:', error);
        res.status(500).json({ success: false, message: 'Error de tracking' });
    }
});

/**
 * Asociar tracking IDs (cookies, fbclid, gclid) a un CrmLead existente.
 * Se llama cuando el usuario se identifica después de navegar anónimamente.
 * Cuerpo: { crmLeadId, fbclid?, fbp?, gclid?, ga? }
 */
router.post('/identify', async (req, res) => {
    try {
        const { crmLeadId, fbclid, fbp, gclid, ga } = req.body;
        if (!crmLeadId) {
            return res.status(400).json({ success: false, message: 'Se requiere crmLeadId' });
        }

        const updateData = {};
        if (fbclid) updateData['externalIds.fbClickId'] = fbclid;
        if (fbp) updateData['externalIds.fbBrowserId'] = fbp;
        if (gclid) updateData['externalIds.gClickId'] = gclid;
        if (ga) updateData['externalIds.gClientId'] = ga;

        if (Object.keys(updateData).length === 0) {
            return res.json({ success: true, message: 'No hay IDs para actualizar' });
        }

        await CrmLead.findByIdAndUpdate(crmLeadId, { $set: updateData });

        res.json({ success: true, message: 'Tracking IDs asociados' });
    } catch (error) {
        console.error('[CRM Tracking] Error en identify:', error);
        res.status(500).json({ success: false, message: 'Error de tracking' });
    }
});

// =========================================================================
// EMAIL ANALYTICS — Open / Click / Unsubscribe tracking
// Fase 2: Tracking de opens (pixel 1x1), clicks (redirect) y unsub.
// Los IDs de tracking se generan en CrmSequenceRunner al enviar email.
// Formato del trackingId: base64url( JSON({lid, sid, step}) )
// =========================================================================

/**
 * GIF transparente de 1x1 pixel para tracking de opens.
 * Generado una sola vez, reutilizado en memoria (~43 bytes).
 */
const TRACKING_PIXEL = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'
);

/**
 * Decodifica un trackingId base64url → { lid (crmLeadId), sid (sequenceId), step (stepOrder) }
 * @param {string} trackingId
 * @returns {Object|null}
 */
function decodeTrackingId(trackingId) {
    try {
        // base64url → base64 estándar
        const b64 = trackingId.replace(/-/g, '+').replace(/_/g, '/');
        const json = Buffer.from(b64, 'base64').toString('utf-8');
        const data = JSON.parse(json);
        if (!data.lid || !data.sid) return null;
        return data;
    } catch {
        return null;
    }
}

/**
 * GET /api/crm/tracking/email/open/:trackingId
 * Devuelve un pixel 1x1 transparente y registra email_open.
 * Se inyecta como <img> en el HTML del email.
 */
router.get('/email/open/:trackingId', async (req, res) => {
    // Responder inmediatamente con el pixel (no bloquear al usuario)
    res.set({
        'Content-Type': 'image/gif',
        'Content-Length': TRACKING_PIXEL.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    res.end(TRACKING_PIXEL);

    // Registrar open en background (fire & forget)
    try {
        const data = decodeTrackingId(req.params.trackingId);
        if (!data) return;

        const { lid, sid, step } = data;

        // Evitar duplicados: buscar si ya se registró open para este lead+seq+step
        const existing = await CrmInteraction.findOne({
            leadRef: lid,
            type: 'email_open',
            'metadata.emailSequenceId': sid,
            'metadata.emailStepNumber': step
        });

        if (existing) return; // Ya registrado, ignorar

        // Registrar interacción
        await CrmInteraction.create({
            leadRef: lid,
            type: 'email_open',
            channel: 'email',
            metadata: {
                emailSequenceId: sid,
                emailStepNumber: step,
                userAgent: (req.headers['user-agent'] || '').substring(0, 200),
                ipHash: crypto.createHash('sha256').update(req.ip || 'unknown').digest('hex').substring(0, 16)
            },
            timestamp: new Date()
        });

        // Actualizar métricas del paso en la secuencia
        const CrmSequence = require('../models/CrmSequence');
        await CrmSequence.updateOne(
            { _id: sid },
            { $inc: { [`steps.$[s].metrics.opened`]: 1 } },
            { arrayFilters: [{ 's.order': step }] }
        );

        // Incrementar score del lead (+5 por abrir email) — usar updateScore para respetar cap y auto-segmentar
        const leadToUpdate = await CrmLead.findById(lid);
        if (leadToUpdate) {
            const newScore = Math.min((leadToUpdate.score || 0) + 5, 100);
            await leadToUpdate.updateScore(newScore, 'email_opened');
        }

    } catch (err) {
        console.error('[CRM Tracking] Error registrando email open:', err.message);
    }
});

/**
 * GET /api/crm/tracking/email/click/:trackingId?url=<destino>
 * Redirige al destino y registra email_click.
 * Se inyecta envolviendo links del HTML del email.
 */
router.get('/email/click/:trackingId', async (req, res) => {
    const targetUrl = req.query.url || '/';

    // Redirigir inmediatamente
    res.redirect(302, targetUrl);

    // Registrar click en background
    try {
        const data = decodeTrackingId(req.params.trackingId);
        if (!data) return;

        const { lid, sid, step } = data;

        await CrmInteraction.create({
            leadRef: lid,
            type: 'email_click',
            channel: 'email',
            metadata: {
                emailSequenceId: sid,
                emailStepNumber: step,
                pageUrl: targetUrl,
                userAgent: (req.headers['user-agent'] || '').substring(0, 200),
                ipHash: crypto.createHash('sha256').update(req.ip || 'unknown').digest('hex').substring(0, 16)
            },
            timestamp: new Date()
        });

        // Actualizar métricas del paso
        const CrmSequence = require('../models/CrmSequence');
        await CrmSequence.updateOne(
            { _id: sid },
            { $inc: { [`steps.$[s].metrics.clicked`]: 1 } },
            { arrayFilters: [{ 's.order': step }] }
        );

        // Incrementar score (+10 por click en email) — usar updateScore para respetar cap y auto-segmentar
        const leadToScore = await CrmLead.findById(lid);
        if (leadToScore) {
            const newScore = Math.min((leadToScore.score || 0) + 10, 100);
            await leadToScore.updateScore(newScore, 'email_clicked');
        }

    } catch (err) {
        console.error('[CRM Tracking] Error registrando email click:', err.message);
    }
});

/**
 * GET /api/crm/tracking/email/unsubscribe/:trackingId
 * Desuscribe al lead de la secuencia y muestra página de confirmación.
 */
router.get('/email/unsubscribe/:trackingId', async (req, res) => {
    try {
        const data = decodeTrackingId(req.params.trackingId);
        if (!data) {
            return res.status(400).send(buildUnsubPageHtml(false, 'Enlace inválido'));
        }

        const { lid, sid } = data;

        // Marcar preferencia global de unsub
        await CrmLead.findByIdAndUpdate(lid, {
            $set: {
                'emailPreferences.unsubscribed': true,
                'emailPreferences.unsubscribedAt': new Date()
            }
        });

        // Marcar enrollment específico como unsubscribed
        await CrmLead.updateOne(
            { _id: lid, 'activeSequences.sequenceId': sid },
            { $set: { 'activeSequences.$.status': 'unsubscribed' } }
        );

        // Actualizar stats de la secuencia
        const CrmSequence = require('../models/CrmSequence');
        await CrmSequence.findByIdAndUpdate(sid, {
            $inc: { 'stats.totalUnsubscribed': 1 }
        });

        // Registrar interacción
        await CrmInteraction.create({
            leadRef: lid,
            type: 'email_unsubscribe',
            channel: 'email',
            metadata: { emailSequenceId: sid },
            timestamp: new Date()
        });

        res.send(buildUnsubPageHtml(true));
    } catch (err) {
        console.error('[CRM Tracking] Error en unsubscribe:', err.message);
        res.status(500).send(buildUnsubPageHtml(false, 'Error interno'));
    }
});

/**
 * Genera HTML minimalista para la página de unsub.
 */
function buildUnsubPageHtml(success, errorMsg) {
    const title = success ? 'Desuscripción exitosa' : 'Error';
    const body = success
        ? '<h1>✅ Te has desuscrito</h1><p>No recibirás más emails de esta secuencia.</p><p style="color:#9ca3af;margin-top:2rem;font-size:0.875rem">Si esto fue un error, contacta a soporte.</p>'
        : `<h1>⚠️ ${errorMsg || 'Error'}</h1><p>No pudimos procesar tu solicitud.</p>`;

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;
min-height:100vh;margin:0;background:#f9fafb;color:#374151;text-align:center}h1{margin-bottom:0.5rem}</style>
</head><body><div>${body}</div></body></html>`;
}

console.log('[CRM] 🔍 Rutas de tracking cargadas (+ email analytics)');

module.exports = router;
