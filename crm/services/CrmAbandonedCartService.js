/**
 * crm/services/CrmAbandonedCartService.js
 * 
 * Detecta leads que hicieron click en el CTA de oferta-madrugadores
 * pero NO completaron el pago dentro de los últimos 60 minutos.
 * 
 * Lógica:
 * 1. Busca CrmInteraction tipo 'email_click' donde pageUrl contiene 'oferta-madrugadores'
 * 2. Filtra los que ocurrieron hace más de triggerDelayMinutos (default 60)
 * 3. Cruza con órdenes/WelcomeKits para excluir los que SÍ pagaron
 * 4. Excluye leads que ya recibieron el email de carrito abandonado
 * 5. Envía el email trigger y registra la interacción
 * 
 * Se ejecuta desde CronService cada 15 minutos.
 */
const CrmEmailCampaign = require('../models/CrmEmailCampaign');
const CrmInteraction = require('../models/CrmInteraction');
const CrmLead = require('../models/CrmLead');

let CrmResendService = null;
function getResendService() {
    if (!CrmResendService) {
        try {
            const Service = require('./CrmResendService');
            CrmResendService = new Service();
        } catch (e) {
            console.warn('[AbandonedCart] CrmResendService no disponible:', e.message);
        }
    }
    return CrmResendService;
}

class CrmAbandonedCartService {

    /**
     * Procesa carritos abandonados.
     * @returns {{ checked: number, sent: number, errors: number }}
     */
    static async processAll() {
        const stats = { checked: 0, sent: 0, errors: 0 };

        try {
            // Buscar la campaña trigger de carrito abandonado activa
            const triggerCampaign = await CrmEmailCampaign.findOne({
                triggerEvento: 'click_sin_pago',
                estado: { $in: ['programado', 'borrador'] }
            });

            if (!triggerCampaign) {
                return stats;
            }

            const delayMinutos = triggerCampaign.triggerDelayMinutos || 60;
            const ahora = new Date();
            // Ventana: clicks que ocurrieron hace más de [delay] minutos pero menos de 24h
            // (para no procesar clicks muy viejos infinitamente)
            const limiteAntiguo = new Date(ahora.getTime() - (24 * 60 * 60 * 1000));
            const limiteReciente = new Date(ahora.getTime() - (delayMinutos * 60 * 1000));

            // 1. Buscar clicks al CTA de oferta-madrugadores en la ventana
            const clicksRelevantes = await CrmInteraction.find({
                type: 'email_click',
                'metadata.pageUrl': { $regex: /oferta-madrugadores/ },
                timestamp: {
                    $gte: limiteAntiguo,
                    $lte: limiteReciente
                }
            }).lean();

            if (clicksRelevantes.length === 0) {
                return stats;
            }

            // Obtener IDs únicos de leads que clickearon
            const leadIds = [...new Set(clicksRelevantes.map(c => c.leadRef.toString()))];
            stats.checked = leadIds.length;

            // 2. Excluir leads que ya recibieron este email de carrito abandonado
            const yaEnviados = await CrmInteraction.find({
                type: 'email_sent',
                leadRef: { $in: leadIds },
                'metadata.notes': 'abandoned_cart_trigger'
            }).lean();

            const yaEnviadosSet = new Set(yaEnviados.map(i => i.leadRef.toString()));

            // 3. Excluir leads que SÍ completaron el pago
            let compradores = new Set();
            try {
                const WelcomeKit = require('../../models/WelcomeKit');
                const kitsComprados = await WelcomeKit.find({
                    status: { $in: ['active', 'completed', 'interview_scheduled', 'interview_done'] }
                }).populate('leadRef', '_id').lean();

                // WelcomeKit tiene leadRef que apunta a Lead (no CrmLead)
                // Necesitamos cruzar Lead._id con CrmLead.leadRef
                const leadIdsConKit = kitsComprados
                    .filter(k => k.leadRef)
                    .map(k => k.leadRef._id.toString());

                if (leadIdsConKit.length > 0) {
                    const crmLeadsConPago = await CrmLead.find({
                        leadRef: { $in: leadIdsConKit }
                    }).lean();
                    compradores = new Set(crmLeadsConPago.map(cl => cl._id.toString()));
                }
            } catch (e) {
                // Intentar con Order como fallback
                try {
                    const Order = require('../../models/Order');
                    const ordenes = await Order.find({
                        'items.type': 'welcome-kit',
                        status: { $in: ['completed', 'paid', 'active'] }
                    }).lean();

                    const emailsConPago = ordenes.map(o => o.customerEmail).filter(Boolean);
                    if (emailsConPago.length > 0) {
                        const Lead = require('../../models/Lead');
                        const leadsConPago = await Lead.find({ email: { $in: emailsConPago } }).lean();
                        const leadIdsConPago = leadsConPago.map(l => l._id.toString());

                        const crmLeadsConPago = await CrmLead.find({
                            leadRef: { $in: leadIdsConPago }
                        }).lean();
                        compradores = new Set(crmLeadsConPago.map(cl => cl._id.toString()));
                    }
                } catch (e2) {
                    console.warn('[AbandonedCart] No se pudo verificar pagos:', e2.message);
                }
            }

            // 4. Filtrar leads pendientes de envío
            const leadsPendientes = leadIds.filter(id => 
                !yaEnviadosSet.has(id) && !compradores.has(id)
            );

            if (leadsPendientes.length === 0) {
                return stats;
            }

            console.log(`[AbandonedCart] 🛒 ${leadsPendientes.length} lead(s) con carrito abandonado detectados`);

            // 5. Enviar email trigger a cada lead
            const resend = getResendService();
            if (!resend) {
                console.warn('[AbandonedCart] Resend no disponible, no se pueden enviar emails');
                return stats;
            }

            // Obtener datos de los leads
            const crmLeads = await CrmLead.find({
                _id: { $in: leadsPendientes },
                'emailPreferences.unsubscribed': { $ne: true },
                'emailPreferences.bounced': { $ne: true }
            }).populate('leadRef', 'name email');

            for (const crmLead of crmLeads) {
                const lead = crmLead.leadRef;
                if (!lead || !lead.email) continue;

                try {
                    // Reemplazar variables en el HTML
                    let html = triggerCampaign.contenidoHtml;
                    html = html.replace(/\{\{nombre\}\}/gi, lead.name || 'amigo/a');

                    const result = await resend.sendEmail(
                        lead.email,
                        triggerCampaign.asunto.replace(/\{\{nombre\}\}/gi, lead.name || 'amigo/a'),
                        html,
                        { nombre: lead.name || 'amigo/a' }
                    );

                    if (result.success) {
                        stats.sent++;

                        // Registrar interacción para no re-enviar
                        await CrmInteraction.create({
                            leadRef: crmLead._id,
                            type: 'email_sent',
                            channel: 'email',
                            metadata: {
                                emailSubject: triggerCampaign.asunto,
                                notes: 'abandoned_cart_trigger',
                                campaignId: triggerCampaign._id
                            },
                            timestamp: new Date()
                        });

                        console.log(`[AbandonedCart] ✅ Email enviado a ${lead.email}`);
                    } else {
                        stats.errors++;
                    }
                } catch (sendError) {
                    stats.errors++;
                    console.error(`[AbandonedCart] ❌ Error enviando a ${lead.email}:`, sendError.message);
                }
            }

            // Actualizar métricas de la campaña
            await CrmEmailCampaign.updateOne(
                { _id: triggerCampaign._id },
                {
                    $inc: { 'metricas.totalEnviados': stats.sent },
                    $set: { fechaEnviado: new Date() }
                }
            );

        } catch (error) {
            console.error('[AbandonedCart] Error fatal:', error);
            stats.errors++;
        }

        return stats;
    }
}

module.exports = CrmAbandonedCartService;
