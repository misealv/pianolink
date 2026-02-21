/**
 * crm/services/CrmEmailFollowUpService.js
 * Servicio de seguimiento automático basado en email engagement.
 *
 * Reglas:
 *  1. Email enviado hace >3 días sin abrir → tarea "Seguimiento: email no abierto"
 *  2. Email abierto pero sin interacción en 48h → tarea urgente "⚡ ABRIÓ EMAIL — Contactar YA"
 *  3. Abrió 3+ veces sin tarea existente → tarea "🔥🔥 SUPER INTERESADO"
 *  4. Bounce → tarea "Email rebotó — buscar otro canal" (ejecutada en tiempo real desde webhook)
 *
 * Se ejecuta como cron diario a las 09:00 hora Chile (12:00 UTC).
 */
const CrmLead = require('../models/CrmLead');
const CrmInteraction = require('../models/CrmInteraction');

class CrmEmailFollowUpService {

    /**
     * Punto de entrada principal — ejecutar todas las reglas.
     * Retorna resumen de tareas creadas.
     */
    static async runAll() {
        const start = Date.now();
        const results = { rule1: 0, rule2: 0, rule3: 0, errors: 0 };

        try {
            results.rule1 = await this._rule1_noAbierto();
        } catch (e) {
            console.error('[EmailFollowUp] Error regla 1:', e.message);
            results.errors++;
        }

        try {
            results.rule2 = await this._rule2_abrioSinRespuesta();
        } catch (e) {
            console.error('[EmailFollowUp] Error regla 2:', e.message);
            results.errors++;
        }

        try {
            results.rule3 = await this._rule3_superInteresado();
        } catch (e) {
            console.error('[EmailFollowUp] Error regla 3:', e.message);
            results.errors++;
        }

        results.duration = Date.now() - start;
        results.totalTasks = results.rule1 + results.rule2 + results.rule3;
        return results;
    }

    /**
     * Regla 1: Email enviado hace >3 días, sin abrir.
     * Condiciones:
     *   - emailEngagement.totalSent > 0
     *   - emailEngagement.totalOpened === 0
     *   - emailEngagement.lastSentAt < hace 3 días
     *   - No tiene tarea pendiente con título similar
     *   - emailPreferences.bounced !== true (ya tiene regla 4)
     */
    static async _rule1_noAbierto() {
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        let created = 0;

        const leads = await CrmLead.find({
            'emailEngagement.totalSent': { $gt: 0 },
            'emailEngagement.totalOpened': 0,
            'emailEngagement.lastSentAt': { $lte: threeDaysAgo },
            'emailPreferences.bounced': { $ne: true },
            'emailPreferences.unsubscribed': { $ne: true }
        })
        .select('_id tasks emailEngagement leadRef')
        .populate('leadRef', 'name whatsapp')
        .limit(200)
        .lean();

        for (const lead of leads) {
            // Verificar que no exista tarea pendiente similar
            const hasPendingTask = (lead.tasks || []).some(t =>
                t.status === 'pending' &&
                t.title && t.title.includes('email no abierto')
            );
            if (hasPendingTask) continue;

            try {
                await CrmLead.findByIdAndUpdate(lead._id, {
                    $push: {
                        tasks: {
                            title: '📧 Seguimiento: email no abierto (3+ días)',
                            type: 'follow_up',
                            dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // mañana
                            status: 'pending',
                            priority: 'medium',
                            notes: `Último email enviado: ${lead.emailEngagement.lastSentAt?.toISOString().split('T')[0] || '?'}. Nunca abrió.${lead.leadRef?.whatsapp ? ' Tiene WhatsApp disponible.' : ''}`
                        }
                    }
                });
                created++;
            } catch (e) {
                console.error(`[EmailFollowUp] Error creando tarea regla 1 para ${lead._id}:`, e.message);
            }
        }

        if (created > 0) console.log(`[EmailFollowUp] Regla 1: ${created} tareas creadas (email no abierto 3+ días)`);
        return created;
    }

    /**
     * Regla 2: Abrió email pero sin actividad de contacto en 48h.
     * Condiciones:
     *   - emailEngagement.totalOpened >= 1
     *   - emailEngagement.lastOpenedAt < hace 48h
     *   - Sin interacción de tipo contacto (call, whatsapp_sent, email_sent, demo_scheduled) después de lastOpenedAt
     *   - No tiene tarea pendiente similar
     */
    static async _rule2_abrioSinRespuesta() {
        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
        let created = 0;

        const leads = await CrmLead.find({
            'emailEngagement.totalOpened': { $gte: 1 },
            'emailEngagement.lastOpenedAt': { $lte: twoDaysAgo, $ne: null },
            'emailEngagement.engagementLevel': { $in: ['warm', 'hot', 'super_hot'] },
            'emailPreferences.unsubscribed': { $ne: true }
        })
        .select('_id tasks emailEngagement leadRef')
        .populate('leadRef', 'name')
        .limit(200)
        .lean();

        for (const lead of leads) {
            // Verificar que no exista tarea pendiente similar
            const hasPendingTask = (lead.tasks || []).some(t =>
                t.status === 'pending' &&
                t.title && (t.title.includes('ABRIÓ EMAIL') || t.title.includes('SUPER INTERESADO'))
            );
            if (hasPendingTask) continue;

            // Verificar que no hubo contacto después de la apertura
            const lastOpened = lead.emailEngagement.lastOpenedAt;
            const recentContact = await CrmInteraction.findOne({
                leadRef: lead._id,
                type: { $in: ['call', 'whatsapp_sent', 'whatsapp_received', 'email_reply', 'demo_scheduled', 'demo_completed'] },
                timestamp: { $gt: lastOpened }
            }).lean();

            if (recentContact) continue; // Ya hubo contacto, no crear tarea

            try {
                await CrmLead.findByIdAndUpdate(lead._id, {
                    $push: {
                        tasks: {
                            title: '⚡ ABRIÓ EMAIL — Contactar YA',
                            type: 'follow_up',
                            dueDate: new Date(), // hoy
                            status: 'pending',
                            priority: 'high',
                            notes: `Abrió ${lead.emailEngagement.totalOpened}x desde ${lastOpened?.toISOString().split('T')[0] || '?'}. Sin respuesta en 48h+. Engagement: ${lead.emailEngagement.engagementLevel}.`
                        }
                    }
                });
                created++;
            } catch (e) {
                console.error(`[EmailFollowUp] Error creando tarea regla 2 para ${lead._id}:`, e.message);
            }
        }

        if (created > 0) console.log(`[EmailFollowUp] Regla 2: ${created} tareas creadas (abrió sin respuesta 48h)`);
        return created;
    }

    /**
     * Regla 3: Abrió 3+ veces (super interesado) sin tarea existente.
     * Condiciones:
     *   - emailEngagement.totalOpened >= 3 OR totalClicked >= 1
     *   - engagementLevel === 'super_hot'
     *   - No tiene tarea pendiente con "SUPER INTERESADO"
     */
    static async _rule3_superInteresado() {
        let created = 0;

        const leads = await CrmLead.find({
            'emailEngagement.engagementLevel': 'super_hot',
            'emailPreferences.unsubscribed': { $ne: true }
        })
        .select('_id tasks emailEngagement leadRef')
        .populate('leadRef', 'name')
        .limit(200)
        .lean();

        for (const lead of leads) {
            // Verificar que no exista tarea pendiente similar
            const hasPendingTask = (lead.tasks || []).some(t =>
                t.status === 'pending' &&
                t.title && t.title.includes('SUPER INTERESADO')
            );
            if (hasPendingTask) continue;

            // Verificar que no tenga tarea completada reciente (evitar spam)
            const hasRecentCompleted = (lead.tasks || []).some(t =>
                t.title && t.title.includes('SUPER INTERESADO') &&
                t.completedAt && (Date.now() - new Date(t.completedAt).getTime()) < 7 * 24 * 60 * 60 * 1000
            );
            if (hasRecentCompleted) continue;

            try {
                const clicks = lead.emailEngagement.totalClicked || 0;
                const opens = lead.emailEngagement.totalOpened || 0;
                await CrmLead.findByIdAndUpdate(lead._id, {
                    $push: {
                        tasks: {
                            title: '🔥🔥 SUPER INTERESADO — Prioridad máxima',
                            type: 'follow_up',
                            dueDate: new Date(), // hoy
                            status: 'pending',
                            priority: 'high',
                            notes: `${opens} aperturas, ${clicks} clicks. Este lead mostró interés excepcional. ¡Contactar de inmediato!`
                        }
                    }
                });
                created++;
            } catch (e) {
                console.error(`[EmailFollowUp] Error creando tarea regla 3 para ${lead._id}:`, e.message);
            }
        }

        if (created > 0) console.log(`[EmailFollowUp] Regla 3: ${created} tareas creadas (super interesado)`);
        return created;
    }

    /**
     * Regla 4: Crear tarea al bounce (llamado desde webhook, no desde cron).
     * Se invoca directamente desde crmEmailTrackingController.
     */
    static async createBounceTask(crmLeadId, bounceType, leadRef) {
        try {
            const hasWa = leadRef?.whatsapp ? ' Tiene WhatsApp.' : '';
            const suggestion = leadRef?.whatsapp
                ? 'Intentar por WhatsApp.'
                : 'Sin WhatsApp — considerar pipeline → lost.';

            await CrmLead.findByIdAndUpdate(crmLeadId, {
                $push: {
                    tasks: {
                        title: '↩️ Email rebotó — buscar otro canal',
                        type: 'follow_up',
                        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // mañana
                        status: 'pending',
                        priority: 'high',
                        notes: `Tipo de bounce: ${bounceType || 'unknown'}.${hasWa} ${suggestion}`
                    }
                }
            });
            return true;
        } catch (e) {
            console.error(`[EmailFollowUp] Error creando tarea bounce para ${crmLeadId}:`, e.message);
            return false;
        }
    }

    /**
     * Regla 4b: Crear tarea al complaint (llamado desde webhook).
     */
    static async createComplaintTask(crmLeadId) {
        try {
            await CrmLead.findByIdAndUpdate(crmLeadId, {
                $push: {
                    tasks: {
                        title: '⚠️ Marcó SPAM — No enviar más emails',
                        type: 'review',
                        dueDate: new Date(),
                        status: 'pending',
                        priority: 'high',
                        notes: 'El contacto reportó el email como spam. Auto-desuscrito. Evaluar si contactar por otro canal con precaución.'
                    }
                }
            });
            return true;
        } catch (e) {
            console.error(`[EmailFollowUp] Error creando tarea complaint para ${crmLeadId}:`, e.message);
            return false;
        }
    }
}

module.exports = CrmEmailFollowUpService;
