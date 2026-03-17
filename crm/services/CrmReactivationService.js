/**
 * crm/services/CrmReactivationService.js
 * Servicio de reactivación de leads fríos.
 * Envía emails en lotes de 500/día a leads que nunca recibieron email.
 * Leads que abren → auto-enroll en secuencia de nurturing (vía tracking hook).
 */
const CrmLead = require('../models/CrmLead');
const CrmSequence = require('../models/CrmSequence');
const CrmInteraction = require('../models/CrmInteraction');
const Lead = require('../../models/Lead');

// Lazy-load para evitar circular
let resendService = null;
function getResendService() {
    if (!resendService) {
        try { resendService = require('./CrmResendService'); } catch (e) { /* no disponible */ }
    }
    return resendService;
}

// Contenido del email de reactivación
const REACTIVATION_SUBJECT = '{{nombre}}, ¿sigues pensando en el piano? 🎹';
const REACTIVATION_HTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f5f0"><tr><td align="center" style="padding:30px 20px;">
<table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  <tr><td bgcolor="#0a0a0a" align="center" style="padding:28px 40px;">
    <span style="font-family:Georgia,serif;font-size:22px;color:#c9a84c;letter-spacing:2px;">🎹 PianoLink</span>
  </td></tr>
  <tr><td style="padding:48px 48px 32px;">
    <h1 style="font-family:Georgia,serif;font-size:28px;color:#0a0a0a;margin:0 0 28px;line-height:1.3;">{{nombre}}, ¿sigues pensando en el piano?</h1>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Hace un tiempo dejaste tus datos para aprender piano online. La vida se pone en medio, lo entiendo.</p>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Pero si esa idea sigue ahí — aunque sea en algún rincón — quiero que sepas que <strong>PianoLink sigue aquí para ti</strong>.</p>
    <div style="border-left:4px solid #c9a84c;background:#f5f5f0;padding:20px 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:16px;color:#333;margin:0;line-height:1.7;">Nuestro <strong>Kit de Bienvenida ($44 USD)</strong> incluye:</p>
      <ul style="font-size:15px;color:#333;line-height:1.8;margin:10px 0 0;">
        <li>Tu <strong>cable MIDI de regalo</strong> (lo enviamos a tu casa)</li>
        <li>Asesoría personalizada para elegir tu teclado ideal</li>
        <li>Setup guiado por videollamada</li>
        <li>Tu primera clase de prueba con un profesor real</li>
      </ul>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td align="center"><a href="https://pianolink.net/comenzar" style="background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:16px 40px;border-radius:4px;font-size:16px;font-weight:bold;display:inline-block;">Ver cómo funciona</a></td></tr></table>
    <p style="font-size:16px;color:#333;line-height:1.8;margin:0 0 20px;">Si tienes dudas, puedes escribirle a <strong>Mía</strong>, nuestra asesora, por WhatsApp:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td align="center"><a href="https://wa.me/15703788455?text=Hola%20M%C3%ADa" style="background:#25D366;color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:4px;font-size:16px;font-weight:bold;display:inline-block;">💬 Escribirle a Mía por WhatsApp</a></td></tr></table>
    <p style="font-size:16px;color:#333;margin:0;">Miguel Antonio<br><span style="color:#c9a84c;">Fundador, PianoLink</span></p>
  </td></tr>
  <tr><td bgcolor="#0a0a0a" style="padding:24px 48px;" align="center">
    <p style="color:#888;font-size:12px;margin:0 0 8px;">PianoLink · Clases de piano online 1 a 1</p>
    <p style="margin:0;"><a href="{{unsubscribe_url}}" style="color:#666;font-size:11px;">Cancelar suscripción</a></p>
    <p style="color:#555;font-size:11px;margin:8px 0 0;">© 2026 PianoLink · hola@pianolink.net</p>
  </td></tr></table></td></tr></table></body></html>`;

const DAILY_BATCH_SIZE = 500;
const TAG_SENT = 'reactivation-sent';

class CrmReactivationService {

    /**
     * Proceso diario: enviar a 500 leads fríos que no han recibido emails.
     * Llamado por CronService diariamente.
     */
    static async processDailyBatch() {
        const resend = getResendService();
        if (!resend || !resend.isConfigured()) {
            console.log('[Reactivation] Resend no configurado, saltando');
            return { sent: 0, errors: 0, skipped: 0 };
        }

        try {
            // Buscar leads fríos: sin tag de reactivación, no desuscritos, no rebotados
            const candidates = await CrmLead.find({
                tags: { $nin: [TAG_SENT, 'email_invalido', 'spam_complaint'] },
                'emailPreferences.unsubscribed': { $ne: true },
                'emailPreferences.bounced': { $ne: true },
                $or: [
                    { 'emailEngagement.totalSent': { $exists: false } },
                    { 'emailEngagement.totalSent': 0 },
                    { 'emailEngagement.totalSent': null }
                ]
            })
            .populate('leadRef', 'name email')
            .limit(DAILY_BATCH_SIZE)
            .lean();

            if (candidates.length === 0) {
                console.log('[Reactivation] No hay leads pendientes para reactivar');
                return { sent: 0, errors: 0, skipped: 0, remaining: 0 };
            }

            // Filtrar los que tienen email válido
            const leads = candidates.filter(l => l.leadRef?.email);
            console.log(`[Reactivation] 📤 Enviando a ${leads.length} leads fríos`);

            let sent = 0;
            let errors = 0;

            // Enviar en mini-batches de 50 (rate limit de Resend)
            const batches = [];
            for (let i = 0; i < leads.length; i += 50) {
                batches.push(leads.slice(i, i + 50));
            }

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];

                const promises = batch.map(async (lead) => {
                    try {
                        const nombre = lead.leadRef.name || 'amigo/a';
                        const subject = REACTIVATION_SUBJECT.replace('{{nombre}}', nombre);

                        const result = await resend.sendEmail(
                            lead.leadRef.email,
                            subject,
                            REACTIVATION_HTML,
                            { nombre }
                        );

                        if (result.success) {
                            // Tagear y registrar
                            await CrmLead.findByIdAndUpdate(lead._id, {
                                $addToSet: { tags: TAG_SENT },
                                $set: { 'emailEngagement.lastSentAt': new Date() },
                                $inc: { 'emailEngagement.totalSent': 1 }
                            });

                            // Interacción para vincular el emailId al lead
                            if (result.id) {
                                await CrmInteraction.create({
                                    leadRef: lead._id,
                                    type: 'email_sent',
                                    channel: 'email',
                                    direction: 'outbound',
                                    metadata: {
                                        emailId: result.id,
                                        emailSubject: subject,
                                        from: 'hola@pianolink.net',
                                        to: lead.leadRef.email,
                                        campaign: 'reactivation',
                                        notes: 'Email de reactivación automática'
                                    },
                                    timestamp: new Date()
                                });
                            }
                            return true;
                        }
                        return false;
                    } catch (err) {
                        console.error(`[Reactivation] Error con ${lead.leadRef?.email}:`, err.message);
                        return false;
                    }
                });

                const results = await Promise.all(promises);
                sent += results.filter(r => r).length;
                errors += results.filter(r => !r).length;

                // Rate limiting entre batches
                if (i < batches.length - 1) {
                    await new Promise(r => setTimeout(r, 1500));
                }
            }

            // Contar restantes
            const remaining = await CrmLead.countDocuments({
                tags: { $nin: [TAG_SENT, 'email_invalido', 'spam_complaint'] },
                'emailPreferences.unsubscribed': { $ne: true },
                'emailPreferences.bounced': { $ne: true },
                $or: [
                    { 'emailEngagement.totalSent': { $exists: false } },
                    { 'emailEngagement.totalSent': 0 },
                    { 'emailEngagement.totalSent': null }
                ]
            });

            console.log(`[Reactivation] ✅ Batch completado: ${sent} enviados, ${errors} errores, ${remaining} restantes`);
            return { sent, errors, skipped: candidates.length - leads.length, remaining };

        } catch (error) {
            console.error('[Reactivation] ❌ Error en batch diario:', error);
            return { sent: 0, errors: 0, error: error.message };
        }
    }

    /**
     * Auto-enroll: inscribir lead en secuencia de nurturing.
     * Llamado desde crmEmailTrackingController cuando un lead abre el email de reactivación.
     */
    static async autoEnrollInNurturing(crmLeadId) {
        try {
            const CrmSequenceService = require('./CrmSequenceService');

            // Buscar la secuencia activa de nurturing
            const sequence = await CrmSequence.findOne({
                status: 'active',
                'trigger.event': 'lead.created'
            });

            if (!sequence) {
                console.warn('[Reactivation] No hay secuencia activa para auto-enroll');
                return { success: false, reason: 'no_sequence' };
            }

            const result = await CrmSequenceService.enrollLead(sequence._id, crmLeadId);

            if (result.success) {
                console.log(`[Reactivation] ✅ Lead ${crmLeadId} auto-enrolled en secuencia "${sequence.name}"`);
                // Agregar tag
                await CrmLead.findByIdAndUpdate(crmLeadId, {
                    $addToSet: { tags: 'reactivation-engaged' }
                });
            } else {
                console.log(`[Reactivation] Auto-enroll no aplicado: ${result.message}`);
            }

            return result;
        } catch (error) {
            console.error('[Reactivation] ❌ Error en auto-enroll:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Estadísticas del proceso de reactivación.
     */
    static async getStats() {
        const [totalSent, totalEngaged, totalRemaining] = await Promise.all([
            CrmLead.countDocuments({ tags: TAG_SENT }),
            CrmLead.countDocuments({ tags: 'reactivation-engaged' }),
            CrmLead.countDocuments({
                tags: { $nin: [TAG_SENT, 'email_invalido', 'spam_complaint'] },
                'emailPreferences.unsubscribed': { $ne: true },
                'emailPreferences.bounced': { $ne: true },
                $or: [
                    { 'emailEngagement.totalSent': { $exists: false } },
                    { 'emailEngagement.totalSent': 0 },
                    { 'emailEngagement.totalSent': null }
                ]
            })
        ]);

        return { totalSent, totalEngaged, totalRemaining };
    }
}

module.exports = CrmReactivationService;
