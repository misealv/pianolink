/**
 * _fix_crm_part2.js — Fixes 5-9 (engagement, scores, campañas)
 * Optimizado con bulkWrite para evitar timeouts.
 * 
 * EJECUTAR: node _fix_crm_part2.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('✅ Conectado\n');

    require('./models/Lead');
    const CrmLead = require('./crm/models/CrmLead');
    const CrmInteraction = require('./crm/models/CrmInteraction');
    const EmailTrackingEvent = require('./crm/models/EmailTrackingEvent');
    const CrmEmailCampaign = require('./crm/models/CrmEmailCampaign');
    const Lead = mongoose.model('Lead');

    // ═══════════════════════════════════════════════════════
    // FIX 5: RECONSTRUIR emailEngagement (bulk)
    // ═══════════════════════════════════════════════════════
    console.log('═══ FIX 5: Reconstruir emailEngagement ═══');

    // Pre-agregar todo en memoria
    const pixelAgg = await CrmInteraction.aggregate([
        { $match: { type: { $in: ['email_sent', 'email_open', 'email_click'] } } },
        { $group: {
            _id: { lead: '$leadRef', type: '$type' },
            count: { $sum: 1 },
            lastAt: { $max: '$createdAt' }
        }}
    ]);
    const resendAgg = await EmailTrackingEvent.aggregate([
        { $group: {
            _id: { lead: '$crmLead', type: '$eventType' },
            count: { $sum: 1 },
            lastAt: { $max: '$timestamp' }
        }}
    ]);

    const pixelMap = {};
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

    const allCrmLeads = await CrmLead.find({}).populate('leadRef', 'source type createdAt').lean();
    const bulkOps = [];

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

        const newEngagement = {
            totalSent, totalDelivered, totalOpened, totalClicked, totalBounced,
            lastSentAt: px.email_sent?.lastAt || null,
            lastOpenedAt: px.email_open?.lastAt || rs.opened?.lastAt || null,
            lastClickedAt: px.email_click?.lastAt || rs.clicked?.lastAt || null,
            complained, engagementLevel
        };

        // ═══ FIX 6: Score ═══
        const coreLead = lead.leadRef;
        let newScore = 0;

        if (coreLead) {
            switch (coreLead.source) {
                case 'landing': newScore += 15; break;
                case 'kit_v2_checkout': newScore += 25; break;
                case 'referral': newScore += 20; break;
                case 'social': newScore += 10; break;
                case 'ex_alumno_resonancias': newScore += 20; break;
                case 'whatsapp_bot': newScore += 15; break;
                default: newScore += 5; break;
            }
            if (coreLead.type === 'teacher') newScore += 10;
        }

        const tags = lead.tags || [];
        if (tags.includes('prioridad_alta')) newScore += 10;
        if (tags.includes('test_account')) newScore = 0;

        newScore += Math.min(totalOpened * 5, 20);
        newScore += Math.min(totalClicked * 10, 30);

        const lastActivity = newEngagement.lastOpenedAt || newEngagement.lastClickedAt;
        if (lastActivity) {
            const daysSince = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSince <= 3) newScore += 10;
            else if (daysSince <= 7) newScore += 7;
            else if (daysSince <= 14) newScore += 5;
            else if (daysSince <= 30) newScore += 2;
        }

        if (lead.pipelineStudent === 'enrolled' || lead.pipelineStudent === 'trial_class') newScore += 15;
        if (lead.pipelineStudent === 'demo_completed') newScore += 10;
        if (lead.pipelineStudent === 'contacted') newScore += 5;

        newScore = Math.min(newScore, 100);

        bulkOps.push({
            updateOne: {
                filter: { _id: lead._id },
                update: { $set: { emailEngagement: newEngagement, score: newScore } }
            }
        });
    }

    // Ejecutar en batches de 500
    let processed = 0;
    for (let i = 0; i < bulkOps.length; i += 500) {
        const batch = bulkOps.slice(i, i + 500);
        await CrmLead.bulkWrite(batch);
        processed += batch.length;
        console.log(`  Batch ${Math.ceil(i/500)+1}: ${processed}/${bulkOps.length}`);
    }
    console.log(`  → ${bulkOps.length} leads actualizados (engagement + scores)\n`);

    // ═══════════════════════════════════════════════════════
    // FIX 7+8: CAMPAÑAS — métricas + estado
    // ═══════════════════════════════════════════════════════
    console.log('═══ FIX 7+8: Campañas métricas + estado ═══');

    const sentByStep = await CrmInteraction.aggregate([
        { $match: { type: 'email_sent', 'metadata.emailSequenceId': { $ne: null } } },
        { $group: { _id: '$metadata.emailStepNumber', count: { $sum: 1 } } }
    ]);
    const opensByStep = await CrmInteraction.aggregate([
        { $match: { type: 'email_open', 'metadata.emailSequenceId': { $ne: null } } },
        { $group: { _id: '$metadata.emailStepNumber', count: { $sum: 1 } } }
    ]);
    const clicksByStep = await CrmInteraction.aggregate([
        { $match: { type: 'email_click', 'metadata.emailSequenceId': { $ne: null } } },
        { $group: { _id: '$metadata.emailStepNumber', count: { $sum: 1 } } }
    ]);

    const sentMap = Object.fromEntries(sentByStep.map(s => [s._id, s.count]));
    const opensMap = Object.fromEntries(opensByStep.map(s => [s._id, s.count]));
    const clicksMap = Object.fromEntries(clicksByStep.map(s => [s._id, s.count]));

    const campaigns = await CrmEmailCampaign.find({}).lean();
    for (const camp of campaigns) {
        const step = camp.ordenSecuencia;
        if (!step) continue;

        const sent = sentMap[step] || 0;
        const metricas = {
            totalEnviados: sent,
            totalAbiertos: opensMap[step] || 0,
            totalClicks: clicksMap[step] || 0,
            totalRebotes: 0,
            totalDesuscripciones: 0
        };

        const update = { metricas };
        if (sent > 0 && camp.estado === 'borrador') {
            update.estado = 'enviado';
            update.fechaEnviado = new Date();
        }

        console.log(`  [${step}] ${camp.nombre}: env=${metricas.totalEnviados} open=${metricas.totalAbiertos} click=${metricas.totalClicks} | ${sent > 0 && camp.estado === 'borrador' ? 'borrador→enviado' : camp.estado}`);
        await CrmEmailCampaign.updateOne({ _id: camp._id }, { $set: update });
    }

    // ═══════════════════════════════════════════════════════
    // FIX 9: HUÉRFANOS
    // ═══════════════════════════════════════════════════════
    console.log('\n═══ FIX 9: Limpiar huérfanos ═══');
    const allEvents = await EmailTrackingEvent.find({}, { emailInteractionId: 1 }).lean();
    const allIntIds = new Set(
        (await CrmInteraction.find({}, { _id: 1 }).lean()).map(i => i._id.toString())
    );
    const orphans = allEvents.filter(e => !allIntIds.has(e.emailInteractionId?.toString()));
    if (orphans.length > 0) {
        await EmailTrackingEvent.deleteMany({ _id: { $in: orphans.map(o => o._id) } });
    }
    console.log(`  → ${orphans.length} huérfanos eliminados`);

    // ═══════════════════════════════════════════════════════
    // VERIFICACIÓN POST-FIX
    // ═══════════════════════════════════════════════════════
    console.log('\n═══ VERIFICACIÓN POST-FIX ═══\n');
    
    const engDistro = await CrmLead.aggregate([
        { $group: { _id: '$emailEngagement.engagementLevel', count: { $sum: 1 }, avgScore: { $avg: '$score' } } },
        { $sort: { count: -1 } }
    ]);
    console.log('Engagement:');
    engDistro.forEach(e => console.log(`  ${e._id || 'none'}: ${e.count} (avg score: ${e.avgScore?.toFixed(0)})`));

    const scoreDistro = await CrmLead.aggregate([
        { $bucket: {
            groupBy: '$score',
            boundaries: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 101],
            default: 'other',
            output: { count: { $sum: 1 } }
        }}
    ]);
    console.log('\nScores:');
    for (const b of scoreDistro) {
        const label = b._id === 'other' ? 'other' : `${b._id}-${b._id + 9}`;
        console.log(`  ${label}: ${b.count}`);
    }

    const score100 = await CrmLead.countDocuments({ score: 100 });
    const testAccounts = await CrmLead.countDocuments({ tags: 'test_account' });
    console.log(`\nScore 100: ${score100}`);
    console.log(`Test accounts: ${testAccounts}`);

    // Campañas verificación
    console.log('\nCampañas:');
    const postCamp = await CrmEmailCampaign.find({}).sort({ ordenSecuencia: 1 }).lean();
    for (const c of postCamp) {
        const m = c.metricas || {};
        if (c.ordenSecuencia) {
            const openRate = m.totalEnviados > 0 ? ((m.totalAbiertos / m.totalEnviados) * 100).toFixed(1) : '0';
            console.log(`  [${c.ordenSecuencia}] ${c.nombre} | ${c.estado} | env=${m.totalEnviados} open=${m.totalAbiertos} (${openRate}%) click=${m.totalClicks}`);
        }
    }

    await mongoose.disconnect();
    console.log('\n✅ Reparación parte 2 completada.');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
