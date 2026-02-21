/**
 * crm/controllers/crmSendEmailController.js
 * Controlador para envío de emails individuales desde el CRM.
 * Usa CrmResendService (Resend) para el envío real.
 * Registra la interacción en CrmInteraction y actualiza pipeline.
 */
const CrmLead = require('../models/CrmLead');
const Lead = require('../../models/Lead');
const CrmInteraction = require('../models/CrmInteraction');

// Link tracking (Fase 3A)
let linkTrackingService = null;
function getLinkTracking() {
    if (!linkTrackingService) {
        try { linkTrackingService = require('../services/CrmLinkTrackingService'); } catch (e) { /* no disponible */ }
    }
    return linkTrackingService;
}

/**
 * POST /api/crm/send-email
 * Body: { to, subject, body, crmLeadId }
 * Remitente fijo: Miguel Antonio Sepúlveda Alvarez <hola@pianolink.net>
 */
exports.sendEmail = async (req, res) => {
    try {
        const { to, subject, body, crmLeadId } = req.body;

        // Validaciones
        if (!to || !subject || !body) {
            return res.status(400).json({
                success: false,
                message: 'Campos requeridos: to, subject, body'
            });
        }

        // Obtener servicio Resend (singleton)
        const { getInstance } = require('../services/CrmResendService');
        const resendService = getInstance();

        // Convertir texto plano a HTML (preservar saltos de línea)
        // Convertir URLs de texto plano a <a> tags para que sean clickeables y trackeables
        function linkifyUrls(text) {
            return text.replace(
                /(https?:\/\/[^\s<>"')\]]+)/gi,
                '<a href="$1" style="color:#6c5ce7;">$1</a>'
            );
        }

        const htmlBody = body
            .split('\n')
            .map(line => {
                const linked = linkifyUrls(line);
                return `<p style="margin:0 0 8px 0;font-family:Georgia,serif;font-size:15px;line-height:1.6;color:#333;">${linked || '&nbsp;'}</p>`;
            })
            .join('');

        // Enviar con from fijo
        let sendResult;
        let trackedLinkIds = []; // IDs de links trackeados (Fase 3A)
        if (resendService.isConfigured()) {
            try {
                // Wrap links con tracking si está disponible (Fase 3A)
                let finalHtml = htmlBody;
                const lt = getLinkTracking();
                if (lt && crmLeadId) {
                    try {
                        const wrapped = await lt.wrapLinks(htmlBody, crmLeadId);
                        finalHtml = wrapped.html;
                        trackedLinkIds = wrapped.linkIds || [];
                    } catch (wrapErr) {
                        console.warn('[CRM Email] Link wrapping falló, enviando sin tracking:', wrapErr.message);
                    }
                }

                const response = await resendService.resend.emails.send({
                    from: 'Miguel Antonio Sepúlveda Alvarez <hola@pianolink.net>',
                    to: [to],
                    reply_to: 'hola@pianolink.net',
                    subject: subject,
                    html: finalHtml,
                    text: body
                });
                sendResult = { success: true, id: response.data?.id };
                console.log(`[CRM Email] ✅ Email enviado a ${to}, ID: ${response.data?.id}`);
            } catch (err) {
                console.error(`[CRM Email] ❌ Error enviando a ${to}:`, err.message);
                return res.status(500).json({
                    success: false,
                    message: `Error al enviar: ${err.message}`
                });
            }
        } else {
            // Modo simulación si no hay API key
            console.log(`[CRM Email] 📧 [SIMULADO] Email a: ${to} | Asunto: ${subject}`);
            sendResult = { success: true, simulated: true, id: `sim-${Date.now()}` };
        }

        // Registrar en MongoDB si tenemos crmLeadId
        if (crmLeadId) {
            try {
                const crmLead = await CrmLead.findById(crmLeadId).populate('leadRef');
                if (crmLead) {
                    // Actualizar pipeline a contactado
                    const currentPipeline = crmLead.pipelineStudent || 'lead';
                    if (currentPipeline === 'lead') {
                        crmLead.pipelineStudent = 'contacted';
                    }

                    // Agregar tag de canal usado
                    if (!crmLead.tags) crmLead.tags = [];
                    if (!crmLead.tags.includes('canal_email')) {
                        crmLead.tags.push('canal_email');
                    }
                    const dateTag = `email_${new Date().toISOString().slice(0, 10)}`;
                    if (!crmLead.tags.includes(dateTag)) {
                        crmLead.tags.push(dateTag);
                    }

                    // Agregar al scoreHistory
                    if (!crmLead.scoreHistory) crmLead.scoreHistory = [];
                    crmLead.scoreHistory.push({
                        date: new Date(),
                        change: 5,
                        reason: `Email enviado: ${subject}`
                    });
                    crmLead.score = (crmLead.score || 0) + 5;

                    // Actualizar Lead core
                    if (crmLead.leadRef) {
                        const leadId = crmLead.leadRef._id || crmLead.leadRef;
                        await Lead.findByIdAndUpdate(leadId, {
                            estadoPipeline: 'contactado',
                            $set: { 'metadata.canal_usado': 'email' }
                        });
                    }

                    // Actualizar emailEngagement
                    if (!crmLead.emailEngagement) {
                        crmLead.emailEngagement = { totalSent: 0, engagementLevel: 'none' };
                    }
                    crmLead.emailEngagement.totalSent = (crmLead.emailEngagement.totalSent || 0) + 1;
                    crmLead.emailEngagement.lastSentAt = new Date();
                    if (crmLead.emailEngagement.engagementLevel === 'none') {
                        crmLead.emailEngagement.engagementLevel = 'cold';
                    }
                    await crmLead.save();

                    // Crear CrmInteraction (leadRef es el campo correcto del schema)
                    const interaction = await CrmInteraction.create({
                        leadRef: crmLeadId,
                        type: 'email_sent',
                        channel: 'email',
                        direction: 'outbound',
                        metadata: {
                            emailId: sendResult.id,
                            emailSubject: subject,
                            simulated: sendResult.simulated || false,
                            from: 'hola@pianolink.net',
                            to: to,
                            notes: body.substring(0, 500)
                        }
                    });

                    // Crear EmailTrackingEvent tipo 'sent'
                    try {
                        const EmailTrackingEvent = require('../models/EmailTrackingEvent');
                        await EmailTrackingEvent.create({
                            crmLead: crmLeadId,
                            emailInteractionId: interaction._id,
                            resendEmailId: sendResult.id,
                            eventType: 'sent',
                            recipient: to,
                            timestamp: new Date()
                        });
                    } catch (trackErr) {
                        console.warn('[CRM Email] ⚠️ Error creando tracking event:', trackErr.message);
                    }

                    // Vincular TrackedLinks con resendEmailId e interactionId (Fase 3A)
                    if (trackedLinkIds.length > 0) {
                        try {
                            const lt = getLinkTracking();
                            if (lt) await lt.assignResendId(trackedLinkIds, sendResult.id, interaction._id);
                        } catch (ltErr) {
                            console.warn('[CRM Email] ⚠️ Error vinculando tracked links:', ltErr.message);
                        }
                    }
                }
            } catch (dbErr) {
                // No fallar el envío por error de DB
                console.error('[CRM Email] ⚠️ Error actualizando DB:', dbErr.message);
            }
        }

        return res.json({
            success: true,
            message: `Email enviado a ${to}`,
            emailId: sendResult.id,
            simulated: sendResult.simulated || false
        });

    } catch (error) {
        console.error('[CRM Email] Error general:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
};
