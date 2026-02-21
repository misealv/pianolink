/**
 * crm/services/CrmLinkTrackingService.js
 * Reemplaza URLs en HTML de emails con links trackeados cortos (/t/{hash}).
 *
 * Uso:
 *   const { wrapLinks } = require('./CrmLinkTrackingService');
 *   const { html, linkIds } = await wrapLinks(htmlBody, crmLeadId);
 *   // Enviar html con Resend...
 *   // Después del envío, vincular resendEmailId:
 *   await assignResendId(linkIds, resendEmailId, interactionId);
 */
const TrackedLink = require('../models/TrackedLink');

// Base URL de la app (misma lógica que CrmSequenceRunner)
function getBaseUrl() {
    return process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'https://pianolink-v4.fly.dev';
}

/**
 * Reemplaza todos los <a href="URL"> en el HTML con links trackeados /t/{hash}.
 * Excepciones: mailto:, tel:, #anchors, links de tracking/unsubscribe propios.
 *
 * @param {string} html - HTML del email
 * @param {string} crmLeadId - ID del CrmLead destinatario
 * @returns {Object} { html: string, linkIds: string[] } — HTML procesado + IDs de TrackedLink creados
 */
async function wrapLinks(html, crmLeadId) {
    if (!html || !crmLeadId) return { html, linkIds: [] };

    const baseUrl = getBaseUrl();
    const linkIds = [];

    // Regex para capturar <a href="URL"> (mismo patrón que CrmSequenceRunner)
    const linkRegex = /<a\s([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi;

    // Recoger todas las URLs a trackear
    const matches = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
        const url = match[2];
        // No envolver: mailto, tel, anchors, links de tracking propios, links ya trackeados
        if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('#') ||
            url.includes('/api/crm/tracking/') || url.includes('/t/')) {
            continue;
        }
        matches.push({
            fullMatch: match[0],
            before: match[1],
            url: url,
            after: match[3],
            index: match.index
        });
    }

    if (matches.length === 0) return { html, linkIds: [] };

    // Crear TrackedLinks en bulk
    const trackedLinks = [];
    for (const m of matches) {
        try {
            const link = await TrackedLink.createTrackedLink(m.url, crmLeadId);
            trackedLinks.push({ ...m, hash: link.hash, linkId: link._id });
            linkIds.push(link._id);
        } catch (e) {
            console.error(`[LinkTracking] Error creando link para ${m.url}:`, e.message);
            // Mantener URL original si falla
            trackedLinks.push({ ...m, hash: null });
        }
    }

    // Reemplazar URLs en el HTML (de atrás hacia adelante para no romper índices)
    let result = html;
    for (let i = trackedLinks.length - 1; i >= 0; i--) {
        const t = trackedLinks[i];
        if (!t.hash) continue; // Falló, mantener original

        const trackedUrl = `${baseUrl}/t/${t.hash}`;
        const newTag = `<a ${t.before}href="${trackedUrl}"${t.after}>`;
        result = result.substring(0, t.index) + newTag + result.substring(t.index + t.fullMatch.length);
    }

    return { html: result, linkIds };
}

/**
 * Después de enviar el email, vincular el resendEmailId a todos los TrackedLinks creados.
 * @param {string[]} linkIds - IDs de TrackedLink
 * @param {string} resendEmailId - ID del email en Resend
 * @param {ObjectId} interactionId - ID de la CrmInteraction
 */
async function assignResendId(linkIds, resendEmailId, interactionId = null) {
    if (!linkIds || linkIds.length === 0) return;
    const update = { resendEmailId };
    if (interactionId) update.emailInteractionId = interactionId;
    await TrackedLink.updateMany(
        { _id: { $in: linkIds } },
        { $set: update }
    );
}

module.exports = { wrapLinks, assignResendId, getBaseUrl };
