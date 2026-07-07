/**
 * _fix_crm_consistency.js
 * 
 * Script de reparación integral del CRM de PianoLink.
 * Corrige todas las inconsistencias detectadas en la auditoría.
 * 
 * EJECUTAR: node _fix_crm_consistency.js
 * MODO DRY-RUN: node _fix_crm_consistency.js --dry-run
 * 
 * FIX 1: Marcar leads de prueba con tag "test_account"
 * FIX 2: Eliminar CrmInteraction email_sent duplicados
 * FIX 3: Vincular emailId de Resend en CrmInteraction (opens/clicks/sent)
 * FIX 4: Sincronizar bounces → emailPreferences.bounced
 * FIX 5: Recalcular emailEngagement desde datos limpios
 * FIX 6: Recalibrar scores basados en engagement real
 * FIX 7: Sincronizar métricas de CrmEmailCampaign
 * FIX 8: Actualizar estado de campañas enviadas
 * FIX 9: Limpiar EmailTrackingEvent huérfanos
 */
require('dotenv').config();
const mongoose = require('mongoose');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log(`✅ Conectado a MongoDB ${DRY_RUN ? '(DRY RUN — sin cambios)' : '(MODO REAL)'}\n`);

    require('./models/Lead');
    const CrmLead = require('./crm/models/CrmLead');
    const CrmInteraction = require('./crm/models/CrmInteraction');
    const EmailTrackingEvent = require('./crm/models/EmailTrackingEvent');
    const CrmEmailCampaign = require('./crm/models/CrmEmailCampaign');
    const Lead = mongoose.model('Lead');

    const stats = {
        fix1_testLeadsTagged: 0,
        fix2_duplicatesRemoved: 0,
        fix3_emailIdsLinked: 0,
        fix4_bouncesFixed: 0,
        fix5_engagementRebuilt: 0,
        fix6_scoresRecalibrated: 0,
        fix7_campaignMetricsSynced: 0,
        fix8_campaignStatusUpdated: 0,
        fix9_orphansRemoved: 0
    };

    // ═══════════════════════════════════════════════════════
    // FIX 1: MARCAR LEADS DE PRUEBA
    // ═══════════════════════════════════════════════════════
    console.log('═══ FIX 1: Marcar leads de prueba ═══');

    // Emails conocidos del dueño / test
    const testEmails = [
        'miseal@gmail.com',
        'miseal@ug.uchile.cl',
        'onboarding@resend.dev',
        'testaronit@hotmail.com',
        'fine.temporum@gmail.com'
    ];

    for (const email of testEmails) {
        const coreLead = await Lead.findOne({ email }).lean();
        if (!coreLead) continue;

        const crmLead = await CrmLead.findOne({ leadRef: coreLead._id });
        if (!crmLead) continue;

        if (!crmLead.tags.includes('test_account')) {
            console.log(`  🧪 Marcando: ${email}`);
            if (!DRY_RUN) {
                crmLead.tags.addToSet('test_account');
                await crmLead.save();
            }
            stats.fix1_testLeadsTagged++;
        }
    }
    console.log(`  → ${stats.fix1_testLeadsTagged} leads de prueba marcados\n`);

    // ═══════════════════════════════════════════════════════
    // FIX 2: ELIMINAR email_sent DUPLICADOS
    // Conservar el que tiene emailId de Resend, o el primero
    // ═══════════════════════════════════════════════════════
    console.log('═══ FIX 2: Eliminar envíos duplicados ═══');

    const dupGroups = await CrmInteraction.aggregate([
        { $match: { type: 'email_sent' } },
        { $group: {
            _id: { lead: '$leadRef', subject: '$metadata.emailSubject' },
            count: { $sum: 1 },
            ids: { $push: {
                id: '$_id',
                emailId: '$metadata.emailId',
                createdAt: '$createdAt'
            }}
        }},
        { $match: { count: { $gt: 1 } } }
    ]);

    for (const group of dupGroups) {
        const items = group.ids;
        // Priorizar: el que tiene emailId no vacío, o el más antiguo
        items.sort((a, b) => {
            const aHas = a.emailId && a.emailId !== '';
            const bHas = b.emailId && b.emailId !== '';
            if (aHas && !bHas) return -1;
            if (!aHas && bHas) return 1;
            return new Date(a.createdAt) - new Date(b.createdAt);
        });

        // Conservar el primero, eliminar el resto
        const toDelete = items.slice(1).map(i => i.id);
        if (toDelete.length > 0) {
            if (!DRY_RUN) {
                await CrmInteraction.deleteMany({ _id: { $in: toDelete } });
            }
            stats.fix2_duplicatesRemoved += toDelete.length;
        }
    }
    console.log(`  → ${stats.fix2_duplicatesRemoved} interacciones duplicadas eliminadas\n`);

    // ═══════════════════════════════════════════════════════
    // FIX 3: VINCULAR emailId DE RESEND EN CrmInteraction
    // Para cada EmailTrackingEvent con resendEmailId, buscar
    // el CrmInteraction email_sent del mismo lead y vincular
    // ═══════════════════════════════════════════════════════
    console.log('═══ FIX 3: Vincular emailId en CrmInteraction ═══');

    // Paso 3a: Vincular email_sent que no tienen emailId
    const sentEvents = await EmailTrackingEvent.find({ eventType: 'sent' }).lean();
    for (const evt of sentEvents) {
        // Buscar CrmInteraction email_sent sin emailId para este lead
        const interaction = await CrmInteraction.findOne({
            leadRef: evt.crmLead,
            type: 'email_sent',
            'metadata.emailId': { $in: ['', null] }
        });

        if (interaction) {
            if (!DRY_RUN) {
                interaction.metadata.emailId = evt.resendEmailId;
                await interaction.save();
            }
            stats.fix3_emailIdsLinked++;
        }
    }

    // Paso 3b: Vincular opens con su emailId correspondiente
    // Cruzar por lead + timestamp cercano al EmailTrackingEvent opened
    const openEvents = await EmailTrackingEvent.find({ eventType: 'opened' }).lean();
    for (const evt of openEvents) {
        // Buscar CrmInteraction email_open sin emailId para este lead
        // que ocurrió en ventana de ±2 minutos del tracking event
        const windowStart = new Date(evt.timestamp.getTime() - 2 * 60 * 1000);
        const windowEnd = new Date(evt.timestamp.getTime() + 2 * 60 * 1000);

        const interaction = await CrmInteraction.findOne({
            leadRef: evt.crmLead,
            type: 'email_open',
            'metadata.emailId': { $in: ['', null] },
            createdAt: { $gte: windowStart, $lte: windowEnd }
        });

        if (interaction) {
            if (!DRY_RUN) {
                interaction.metadata.emailId = evt.resendEmailId;
                await interaction.save();
            }
            stats.fix3_emailIdsLinked++;
        }
    }

    console.log(`  → ${stats.fix3_emailIdsLinked} emailIds vinculados\n`);

    // ═══════════════════════════════════════════════════════
    // FIX 4: SINCRONIZAR EMAIL BOUNCES
    // ═══════════════════════════════════════════════════════
    console.log('═══ FIX 4: Sincronizar bounces ═══');

    const bounceEvents = await EmailTrackingEvent.find({ eventType: 'bounced' }).lean();
    for (const evt of bounceEvents) {
        const crmLead = await CrmLead.findById(evt.crmLead);
        if (!crmLead) continue;

        if (!crmLead.emailPreferences.bounced) {
            console.log(`  📛 Bounce no sincronizado: ${evt.recipient} (${evt.bounceType})`);
            if (!DRY_RUN) {
                crmLead.emailPreferences.bounced = true;
                crmLead.emailPreferences.bouncedAt = evt.timestamp;
                await crmLead.save();
            }
            stats.fix4_bouncesFixed++;
        }
    }
    console.log(`  → ${stats.fix4_bouncesFixed} bounces sincronizados\n`);

    // ═══════════════════════════════════════════════════════
    // FIX 5: RECONSTRUIR emailEngagement DESDE DATOS LIMPIOS
    // (Optimizado con aggregation pipelines)
    // ═══════════════════════════════════════════════════════
    console.log('═══ FIX 5: Reconstruir emailEngagement ═══');

    // Aggregar CrmInteraction por lead y tipo
    const pixelAgg = await CrmInteraction.aggregate([
        { $match: { type: { $in: ['email_sent', 'email_open', 'email_click'] } } },
        { $group: {
            _id: { lead: '$leadRef', type: '$type' },
            count: { $sum: 1 },
            lastAt: { $max: '$createdAt' }
        }}
    ]);
    // Aggregar EmailTrackingEvent por lead y tipo
    const resendAgg = await EmailTrackingEvent.aggregate([
        { $group: {
            _id: { lead: '$crmLead', type: '$eventType' },
            count: { $sum: 1 },
            lastAt: { $max: '$timestamp' }
        }}
    ]);

    // Construir mapas: leadId → { sent, opened, clicked, ... }
    const pixelMap = {}; // leadId → { email_sent: {count, lastAt}, email_open: ..., email_click: ... }
    for (const r of pixelAgg) {
        const lid = r._id.lead.toString();
        if (!pixelMap[lid]) pixelMap[lid] = {};
        pixelMap[lid][r._id.type] = { count: r.count, lastAt: r.lastAt };
    }
    const resendMap = {};
    for (const r of resendAgg) {
        const lid = r._id.lead.toString();
        if (!resendMap[lid]) resendMap[lid] = {};
        resendMap[lid][r._id.type] = { count: r.count, lastAt: r.lastAt };
    }

    const allCrmLeads = await CrmLead.find({}).lean();
    for (const lead of allCrmLeads) {
        const lid = lead._id.toString();
        const px = pixelMap[lid] || {};
        const rs = resendMap[lid] || {};

        const totalSent = px.email_sent?.count || 0;
        const totalOpened = Math.max(px.email_open?.count || 0, rs.opened?.count || 0);
        const totalClicked = Math.max(px.email_click?.count || 0, rs.clicked?.count || 0);
        const totalDelivered = rs.delivered?.count || 0;
        const totalBounced = rs.bounced?.count || 0;
        const complained = (rs.complained?.count || 0) > 0;

        let engagementLevel = 'none';
        if (totalSent > 0) engagementLevel = 'cold';
        if (totalOpened >= 1) engagementLevel = 'warm';
        if (totalOpened >= 2) engagementLevel = 'hot';
        if (totalClicked > 0 || totalOpened >= 3) engagementLevel = 'super_hot';

        const lastSentAt = px.email_sent?.lastAt || null;
        const lastOpenedAt = px.email_open?.lastAt || rs.opened?.lastAt || null;
        const lastClickedAt = px.email_click?.lastAt || rs.clicked?.lastAt || null;

        const newEngagement = {
            totalSent, totalDelivered, totalOpened, totalClicked, totalBounced,
            lastSentAt, lastOpenedAt, lastClickedAt,
            complained, engagementLevel
        };

        const curr = lead.emailEngagement || {};
        const changed = curr.totalOpened !== totalOpened ||
                        curr.totalClicked !== totalClicked ||
                        curr.totalSent !== totalSent ||
                        curr.engagementLevel !== engagementLevel ||
                        curr.totalBounced !== totalBounced;

        if (changed) {
            if (!DRY_RUN) {
                await CrmLead.updateOne(
                    { _id: lead._id },
                    { $set: { emailEngagement: newEngagement } }
                );
            }
            stats.fix5_engagementRebuilt++;
        }
    }
    console.log(`  → ${stats.fix5_engagementRebuilt} leads con engagement recalculado\n`);

    // ═══════════════════════════════════════════════════════
    // FIX 6: RECALIBRAR SCORES
    // Score = base (por fuente/antigüedad) + engagement real
    // ═══════════════════════════════════════════════════════
    console.log('═══ FIX 6: Recalibrar scores ═══');

    // Recargar con datos frescos
    const freshLeads = await CrmLead.find({}).populate('leadRef', 'source type tags createdAt').lean();

    for (const lead of freshLeads) {
        const coreLead = lead.leadRef;
        if (!coreLead) continue;

        let newScore = 0;

        // --- Base score por fuente/tipo (0-40) ---
        // Fuente del lead
        switch (coreLead.source) {
            case 'landing': newScore += 15; break;
            case 'kit_v2_checkout': newScore += 25; break;
            case 'referral': newScore += 20; break;
            case 'social': newScore += 10; break;
            case 'ex_alumno_resonancias': newScore += 20; break;
            case 'whatsapp_bot': newScore += 15; break;
            default: newScore += 5; break;
        }

        // Tipo (profesor vale más para el marketplace)
        if (coreLead.type === 'teacher') newScore += 10;

        // Tags de prioridad alta (resonancias reconvertibles)
        const tags = lead.tags || [];
        if (tags.includes('prioridad_alta')) newScore += 10;
        if (tags.includes('test_account')) {
            newScore = 0; // Test accounts → score 0
        }

        // --- Engagement score (0-50) ---
        const eng = lead.emailEngagement || {};
        const opened = eng.totalOpened || 0;
        const clicked = eng.totalClicked || 0;

        // Opens: +5 por open, max 20
        newScore += Math.min(opened * 5, 20);
        // Clicks: +10 por click, max 30
        newScore += Math.min(clicked * 10, 30);

        // --- Recency bonus (0-10) ---
        const lastActivity = eng.lastOpenedAt || eng.lastClickedAt;
        if (lastActivity) {
            const daysSince = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSince <= 3) newScore += 10;
            else if (daysSince <= 7) newScore += 7;
            else if (daysSince <= 14) newScore += 5;
            else if (daysSince <= 30) newScore += 2;
        }

        // --- Pipeline bonus ---
        if (lead.pipelineStudent === 'enrolled' || lead.pipelineStudent === 'trial_class') newScore += 15;
        if (lead.pipelineStudent === 'demo_completed') newScore += 10;
        if (lead.pipelineStudent === 'contacted') newScore += 5;

        // Cap a 100
        newScore = Math.min(newScore, 100);

        if (lead.score !== newScore) {
            if (!DRY_RUN) {
                await CrmLead.updateOne(
                    { _id: lead._id },
                    { $set: { score: newScore } }
                );
            }
            stats.fix6_scoresRecalibrated++;
        }
    }
    console.log(`  → ${stats.fix6_scoresRecalibrated} scores recalibrados\n`);

    // ═══════════════════════════════════════════════════════
    // FIX 7: SINCRONIZAR MÉTRICAS DE CAMPAÑAS
    // ═══════════════════════════════════════════════════════
    console.log('═══ FIX 7: Sincronizar métricas de campañas ═══');

    // Las campañas no tienen campaignId en CrmInteraction, pero sí
    // emailSequenceId. Mapear secuencia → emails de campaña por ordenSecuencia.
    // También calcular métricas globales desde EmailTrackingEvent.
    const campaigns = await CrmEmailCampaign.find({}).lean();

    // Métricas globales desde EmailTrackingEvent
    const globalSent = await EmailTrackingEvent.countDocuments({ eventType: 'sent' });
    const globalDelivered = await EmailTrackingEvent.countDocuments({ eventType: 'delivered' });
    const globalOpened = await EmailTrackingEvent.countDocuments({ eventType: 'opened' });
    const globalClicked = await EmailTrackingEvent.countDocuments({ eventType: 'clicked' });
    const globalBounced = await EmailTrackingEvent.countDocuments({ eventType: 'bounced' });

    // Las CrmInteraction con emailSequenceId nos dicen cuantos envíos por step
    const sentByStep = await CrmInteraction.aggregate([
        { $match: { type: 'email_sent', 'metadata.emailSequenceId': { $ne: null } } },
        { $group: { _id: '$metadata.emailStepNumber', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
    ]);
    const opensByStep = await CrmInteraction.aggregate([
        { $match: { type: 'email_open', 'metadata.emailSequenceId': { $ne: null } } },
        { $group: { _id: '$metadata.emailStepNumber', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
    ]);
    const clicksByStep = await CrmInteraction.aggregate([
        { $match: { type: 'email_click', 'metadata.emailSequenceId': { $ne: null } } },
        { $group: { _id: '$metadata.emailStepNumber', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
    ]);

    const sentMap = Object.fromEntries(sentByStep.map(s => [s._id, s.count]));
    const opensMap = Object.fromEntries(opensByStep.map(s => [s._id, s.count]));
    const clicksMap = Object.fromEntries(clicksByStep.map(s => [s._id, s.count]));

    for (const camp of campaigns) {
        const step = camp.ordenSecuencia;
        if (!step) continue; // Skip carrito abandonado (sin orden)

        const metricas = {
            totalEnviados: sentMap[step] || 0,
            totalAbiertos: opensMap[step] || 0,
            totalClicks: clicksMap[step] || 0,
            totalRebotes: 0, // No podemos saber bounces por step exacto
            totalDesuscripciones: 0
        };

        const curr = camp.metricas || {};
        if (curr.totalEnviados !== metricas.totalEnviados ||
            curr.totalAbiertos !== metricas.totalAbiertos ||
            curr.totalClicks !== metricas.totalClicks) {
            console.log(`  📊 [${step}] ${camp.nombre}: env=${metricas.totalEnviados} open=${metricas.totalAbiertos} click=${metricas.totalClicks}`);
            if (!DRY_RUN) {
                await CrmEmailCampaign.updateOne(
                    { _id: camp._id },
                    { $set: { metricas } }
                );
            }
            stats.fix7_campaignMetricsSynced++;
        }
    }
    console.log(`  → ${stats.fix7_campaignMetricsSynced} campañas actualizadas\n`);

    // ═══════════════════════════════════════════════════════
    // FIX 8: ACTUALIZAR ESTADO DE CAMPAÑAS
    // ═══════════════════════════════════════════════════════
    console.log('═══ FIX 8: Actualizar estado de campañas ═══');

    for (const camp of campaigns) {
        const step = camp.ordenSecuencia;
        const sent = sentMap[step] || 0;

        if (sent > 0 && camp.estado === 'borrador') {
            console.log(`  📧 [${step}] ${camp.nombre}: borrador → enviado (${sent} envíos)`);
            if (!DRY_RUN) {
                await CrmEmailCampaign.updateOne(
                    { _id: camp._id },
                    { $set: { estado: 'enviado', fechaEnviado: new Date() } }
                );
            }
            stats.fix8_campaignStatusUpdated++;
        }
    }
    console.log(`  → ${stats.fix8_campaignStatusUpdated} campañas marcadas como enviado\n`);

    // ═══════════════════════════════════════════════════════
    // FIX 9: LIMPIAR HUÉRFANOS
    // ═══════════════════════════════════════════════════════
    console.log('═══ FIX 9: Limpiar EmailTrackingEvent huérfanos ═══');

    const allTrackingEvents = await EmailTrackingEvent.find({}).lean();
    const allInteractionIds = new Set(
        (await CrmInteraction.find({}, { _id: 1 }).lean()).map(i => i._id.toString())
    );

    const orphanIds = [];
    for (const evt of allTrackingEvents) {
        if (!allInteractionIds.has(evt.emailInteractionId?.toString())) {
            orphanIds.push(evt._id);
        }
    }

    if (orphanIds.length > 0) {
        console.log(`  🗑️  ${orphanIds.length} eventos huérfanos encontrados`);
        if (!DRY_RUN) {
            await EmailTrackingEvent.deleteMany({ _id: { $in: orphanIds } });
        }
        stats.fix9_orphansRemoved = orphanIds.length;
    }
    console.log(`  → ${stats.fix9_orphansRemoved} huérfanos eliminados\n`);

    // ═══════════════════════════════════════════════════════
    // RESUMEN FINAL
    // ═══════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  RESUMEN ${DRY_RUN ? '(DRY RUN)' : '(APLICADO)'}`);
    console.log('═══════════════════════════════════════════════════════');
    for (const [key, val] of Object.entries(stats)) {
        console.log(`  ${key}: ${val}`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Reparación completada.');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
