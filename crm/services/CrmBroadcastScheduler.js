/**
 * crm/services/CrmBroadcastScheduler.js
 * 
 * Servicio que procesa broadcasts programados automáticamente.
 * Se ejecuta desde un cron cada 15 minutos.
 * 
 * Busca CrmEmailCampaign con:
 * - tipo: 'broadcast'
 * - estado: 'programado'
 * - fechaProgramada <= ahora
 * 
 * Y los envía a toda la lista de leads activos.
 */
const CrmEmailCampaign = require('../models/CrmEmailCampaign');
const CrmLead = require('../models/CrmLead');
const Lead = require('../../models/Lead');

let CrmResendService = null;
function getResendService() {
    if (!CrmResendService) {
        try {
            const Service = require('./CrmResendService');
            CrmResendService = new Service();
        } catch (e) {
            console.warn('[BroadcastScheduler] CrmResendService no disponible:', e.message);
        }
    }
    return CrmResendService;
}

class CrmBroadcastScheduler {

    /**
     * Procesa todos los broadcasts pendientes de envío.
     * Llamar desde cron cada 15 minutos.
     * 
     * @returns {{ processed: number, sent: number, errors: number }}
     */
    static async processAll() {
        const stats = { processed: 0, sent: 0, errors: 0 };

        try {
            // Buscar broadcasts programados cuya fecha ya pasó
            const pendientes = await CrmEmailCampaign.find({
                tipo: 'broadcast',
                estado: 'programado',
                fechaProgramada: { $lte: new Date() }
            });

            if (pendientes.length === 0) return stats;

            console.log(`[BroadcastScheduler] 📡 ${pendientes.length} broadcast(s) pendiente(s)`);

            for (const campaign of pendientes) {
                try {
                    await CrmBroadcastScheduler._sendBroadcast(campaign, stats);
                    stats.processed++;
                } catch (error) {
                    console.error(`[BroadcastScheduler] ❌ Error en broadcast "${campaign.nombre}":`, error.message);
                    stats.errors++;
                }
            }
        } catch (error) {
            console.error('[BroadcastScheduler] Error fatal:', error);
        }

        return stats;
    }

    /**
     * Envía un broadcast individual a todos los leads activos.
     */
    static async _sendBroadcast(campaign, stats) {
        const resend = getResendService();
        if (!resend) {
            console.warn('[BroadcastScheduler] Resend no configurado, simulando envío');
            campaign.estado = 'enviado';
            campaign.fechaEnviado = new Date();
            await campaign.save();
            return;
        }

        // Marcar como enviando para evitar duplicados
        campaign.estado = 'enviando';
        await campaign.save();

        console.log(`[BroadcastScheduler] 📧 Enviando "${campaign.nombre}"...`);

        try {
            // Obtener leads activos (no unsubscribed, no bounced)
            const crmLeads = await CrmLead.find({
                'emailPreferences.unsubscribed': { $ne: true },
                'emailPreferences.bounced': { $ne: true }
            }).populate('leadRef', 'name email');

            let enviados = 0;
            let errores = 0;
            const batchSize = 50;
            const batchDelay = 1500;

            for (let i = 0; i < crmLeads.length; i += batchSize) {
                const batch = crmLeads.slice(i, i + batchSize);

                for (const crmLead of batch) {
                    const lead = crmLead.leadRef;
                    if (!lead || !lead.email) continue;

                    try {
                        const result = await resend.sendEmail(
                            lead.email,
                            campaign.asunto,
                            campaign.contenidoHtml,
                            { nombre: lead.name || 'amigo/a' }
                        );

                        if (result.success) {
                            enviados++;
                            stats.sent++;
                        } else {
                            errores++;
                        }
                    } catch (sendError) {
                        errores++;
                        console.error(`[BroadcastScheduler] Error enviando a ${lead.email}:`, sendError.message);
                    }
                }

                // Rate limiting entre batches
                if (i + batchSize < crmLeads.length) {
                    await new Promise(r => setTimeout(r, batchDelay));
                }
            }

            // Actualizar métricas y estado
            campaign.estado = 'enviado';
            campaign.fechaEnviado = new Date();
            campaign.metricas = {
                ...campaign.metricas,
                totalEnviados: enviados
            };
            await campaign.save();

            console.log(`[BroadcastScheduler] ✅ "${campaign.nombre}" — ${enviados} enviados, ${errores} errores`);

        } catch (error) {
            // Si falla, volver a programado para reintentar
            campaign.estado = 'programado';
            await campaign.save();
            throw error;
        }
    }
}

module.exports = CrmBroadcastScheduler;
