/**
 * crm/routes/crmLinkTrackingRoutes.js
 * Ruta pública GET /t/:hash — redirige al destino original
 * y registra el click en el sistema de tracking.
 *
 * Montado en server.js como: app.use('/t', require('./crm/routes/crmLinkTrackingRoutes'))
 */
const express = require('express');
const router = express.Router();

/**
 * GET /t/:hash
 * Busca el TrackedLink, registra click, actualiza engagement, redirige.
 * Si el hash no existe → redirect a pianolink.net (fallback seguro).
 */
router.get('/:hash', async (req, res) => {
    const { hash } = req.params;

    try {
        // Lazy-load para no romper si modelos CRM no existen
        const TrackedLink = require('../models/TrackedLink');
        const link = await TrackedLink.registerClick(hash);

        if (!link) {
            console.warn(`[LinkTracking] Hash no encontrado: ${hash}`);
            return res.redirect(302, 'https://pianolink.net');
        }

        // Redirect inmediato (no bloquear al usuario)
        res.redirect(302, link.destinationUrl);

        // Procesar tracking en background (fire-and-forget)
        processClick(link).catch(e =>
            console.error('[LinkTracking] Error procesando click:', e.message)
        );

    } catch (error) {
        console.error('[LinkTracking] Error en redirect:', error.message);
        // Fallback seguro
        res.redirect(302, 'https://pianolink.net');
    }
});

/**
 * Procesa el click: crea EmailTrackingEvent + actualiza emailEngagement.
 * Se ejecuta después del redirect (fire-and-forget).
 */
async function processClick(link) {
    const EmailTrackingEvent = require('../models/EmailTrackingEvent');
    const CrmLead = require('../models/CrmLead');

    // Crear evento de tracking
    await EmailTrackingEvent.create({
        crmLead: link.crmLead,
        emailInteractionId: link.emailInteractionId,
        resendEmailId: link.resendEmailId || '',
        eventType: 'clicked',
        recipient: '', // No tenemos el email aquí, pero el crmLead lo vincula
        clickedUrl: link.destinationUrl,
        timestamp: new Date()
    });

    // Actualizar engagement del lead
    const crmLead = await CrmLead.findById(link.crmLead);
    if (!crmLead) return;

    if (!crmLead.emailEngagement) {
        crmLead.emailEngagement = { totalClicked: 0, engagementLevel: 'none' };
    }

    const eng = crmLead.emailEngagement;
    eng.totalClicked = (eng.totalClicked || 0) + 1;
    eng.lastClickedAt = new Date();
    eng.engagementLevel = 'super_hot';

    // Score +20 en primer click propio (si no vino ya desde Resend webhook)
    if (eng.totalClicked === 1) {
        crmLead.score = Math.min(100, (crmLead.score || 0) + 20);
        if (!crmLead.scoreHistory) crmLead.scoreHistory = [];
        crmLead.scoreHistory.push({
            date: new Date(),
            change: 20,
            reason: `Click en link de email: ${link.destinationUrl.substring(0, 80)}`
        });
    }

    await crmLead.save();
    console.log(`[LinkTracking] 🔗 Click registrado — lead: ${link.crmLead}, url: ${link.destinationUrl.substring(0, 60)}`);
}

module.exports = router;
