/**
 * _diagnose_inconsistencies.js
 * Diagnóstico profundo de TODAS las inconsistencias del CRM.
 * Identifica leads de prueba, datos huérfanos, y problemas de vinculación.
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
    const TrackedLink = require('./crm/models/TrackedLink');
    const Lead = mongoose.model('Lead');

    // ═══════════════════════════════════════════════════════
    // 1. IDENTIFICAR LEADS DE PRUEBA (miseal, test, admin)
    // ═══════════════════════════════════════════════════════
    console.log('═══ 1. LEADS SOSPECHOSOS DE SER PRUEBAS ═══\n');

    // Buscar por email del dueño y variantes
    const testPatterns = [
        /miseal/i, /test/i, /prueba/i, /admin/i, /demo/i, /pianolink/i,
        /example\.com/i, /localhost/i, /temp/i
    ];
    
    const allLeads = await Lead.find({}).lean();
    const allCrmLeads = await CrmLead.find({}).populate('leadRef', 'name email phone').lean();
    
    const suspectedTestLeads = [];
    for (const cl of allCrmLeads) {
        const email = cl.leadRef?.email || '';
        const name = cl.leadRef?.name || '';
        const isTest = testPatterns.some(p => p.test(email) || p.test(name));
        if (isTest) {
            const eng = cl.emailEngagement || {};
            suspectedTestLeads.push({
                id: cl._id,
                leadRefId: cl.leadRef?._id,
                name: cl.leadRef?.name,
                email: cl.leadRef?.email,
                score: cl.score,
                segment: cl.segment,
                engLevel: eng.engagementLevel,
                totalSent: eng.totalSent,
                totalOpened: eng.totalOpened,
                totalClicked: eng.totalClicked,
                tags: cl.tags,
                pipeline: cl.pipelineStudent || cl.pipelineTeacher
            });
        }
    }
    
    console.log(`Leads sospechosos de ser prueba (${suspectedTestLeads.length}):`);
    for (const t of suspectedTestLeads) {
        console.log(`  ⚠️  ${t.name} <${t.email}> | Score: ${t.score} | Seg: ${t.segment} | Eng: ${t.engLevel} | Opens: ${t.totalOpened} | Clicks: ${t.totalClicked}`);
    }

    // Leads super_hot para análisis manual
    console.log('\n═══ TODOS LOS SUPER_HOT (para que confirmes cuáles son pruebas) ═══\n');
    const superHots = allCrmLeads.filter(c => c.emailEngagement?.engagementLevel === 'super_hot');
    for (const sh of superHots) {
        const eng = sh.emailEngagement || {};
        const isAutoTest = testPatterns.some(p => p.test(sh.leadRef?.email || '') || p.test(sh.leadRef?.name || ''));
        console.log(`  ${isAutoTest ? '🧪' : '🔥'} ${sh.leadRef?.name || 'N/A'} <${sh.leadRef?.email || 'N/A'}> | Score: ${sh.score} | Opens: ${eng.totalOpened} | Clicks: ${eng.totalClicked} | Pipeline: ${sh.pipelineStudent || 'N/A'}`);
    }

    // ═══════════════════════════════════════════════════════
    // 2. INCONSISTENCIA: CrmInteraction.email_sent vs EmailTrackingEvent.sent
    // ═══════════════════════════════════════════════════════
    console.log('\n\n═══ 2. ANÁLISIS DE INCONSISTENCIA: ENVÍOS ═══\n');

    const interactionSentCount = await CrmInteraction.countDocuments({ type: 'email_sent' });
    const trackingEventSentCount = await EmailTrackingEvent.countDocuments({ eventType: 'sent' });
    console.log(`CrmInteraction (email_sent): ${interactionSentCount}`);
    console.log(`EmailTrackingEvent (sent): ${trackingEventSentCount}`);
    console.log(`Gap: ${interactionSentCount - trackingEventSentCount} interacciones extra`);

    // ¿Cuántos email_sent tienen emailId vacío?
    const sentNoEmailId = await CrmInteraction.countDocuments({ type: 'email_sent', 'metadata.emailId': { $in: ['', null] } });
    const sentWithEmailId = await CrmInteraction.countDocuments({ type: 'email_sent', 'metadata.emailId': { $nin: ['', null] } });
    console.log(`  email_sent CON emailId: ${sentWithEmailId}`);
    console.log(`  email_sent SIN emailId: ${sentNoEmailId}`);

    // Detectar duplicados: mismo lead + mismo emailSubject
    const dupCheck = await CrmInteraction.aggregate([
        { $match: { type: 'email_sent' } },
        { $group: { 
            _id: { lead: '$leadRef', subject: '$metadata.emailSubject' },
            count: { $sum: 1 },
            emailIds: { $addToSet: '$metadata.emailId' }
        }},
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
    ]);
    console.log(`\n  Envíos duplicados (mismo lead + mismo asunto): ${dupCheck.length} casos`);
    for (const d of dupCheck.slice(0, 5)) {
        console.log(`    Lead: ${d._id.lead} | Asunto: "${d._id.subject?.slice(0, 50)}" | x${d.count} | emailIds: ${d.emailIds.length} distintos`);
    }

    // ═══════════════════════════════════════════════════════
    // 3. INCONSISTENCIA: Opens sin emailId
    // ═══════════════════════════════════════════════════════
    console.log('\n\n═══ 3. CrmInteraction OPENS SIN emailId ═══\n');

    const openNoId = await CrmInteraction.countDocuments({ type: 'email_open', 'metadata.emailId': { $in: ['', null] } });
    const openWithId = await CrmInteraction.countDocuments({ type: 'email_open', 'metadata.emailId': { $nin: ['', null] } });
    console.log(`  Opens CON emailId: ${openWithId}`);
    console.log(`  Opens SIN emailId: ${openNoId}`);

    // ¿De dónde vienen los opens sin emailId? ¿Webhook de Resend?
    const recentOpenNoId = await CrmInteraction.find({
        type: 'email_open', 'metadata.emailId': { $in: ['', null] }
    }).sort({ createdAt: -1 }).limit(5).populate({ path: 'leadRef', populate: { path: 'leadRef', select: 'email' } }).lean();
    
    console.log('\n  Ejemplo de opens sin emailId (5 más recientes):');
    for (const o of recentOpenNoId) {
        console.log(`    ${new Date(o.createdAt).toISOString().slice(0,16)} | ${o.leadRef?.leadRef?.email || 'N/A'} | channel: ${o.channel} | subject: "${o.metadata?.emailSubject?.slice(0,40) || 'vacío'}" | rawMeta: ${JSON.stringify(o.metadata).slice(0, 120)}`);
    }

    // ═══════════════════════════════════════════════════════
    // 4. EmailTrackingEvent huérfanos (sin CrmInteraction correspondiente)
    // ═══════════════════════════════════════════════════════
    console.log('\n\n═══ 4. EmailTrackingEvent HUÉRFANOS ═══\n');

    // Contar eventos cuyo emailInteractionId no existe en CrmInteraction
    const allTrackingEvents = await EmailTrackingEvent.find({}).lean();
    const allInteractionIds = new Set(
        (await CrmInteraction.find({}, { _id: 1 }).lean()).map(i => i._id.toString())
    );
    
    let orphanedEvents = 0;
    const orphanedByType = {};
    for (const evt of allTrackingEvents) {
        if (!allInteractionIds.has(evt.emailInteractionId?.toString())) {
            orphanedEvents++;
            orphanedByType[evt.eventType] = (orphanedByType[evt.eventType] || 0) + 1;
        }
    }
    console.log(`  Eventos huérfanos (sin CrmInteraction válido): ${orphanedEvents} / ${allTrackingEvents.length}`);
    console.log(`  Por tipo:`, orphanedByType);

    // ═══════════════════════════════════════════════════════
    // 5. CAMPAÑAS: métricas en 0
    // ═══════════════════════════════════════════════════════
    console.log('\n\n═══ 5. CAMPAÑAS CON MÉTRICAS EN 0 ═══\n');
    
    const campaigns = await CrmEmailCampaign.find({}).lean();
    let campaignsWithZeroMetrics = 0;
    for (const c of campaigns) {
        const m = c.metricas || {};
        const allZero = (m.totalEnviados || 0) === 0 && (m.totalAbiertos || 0) === 0;
        if (allZero) campaignsWithZeroMetrics++;
        console.log(`  [${c.ordenSecuencia || '-'}] ${c.nombre} → Enviados: ${m.totalEnviados || 0} | Estado: ${c.estado || 'N/A'} | ID: ${c._id}`);
    }
    console.log(`\n  Campañas con métricas en 0: ${campaignsWithZeroMetrics}/${campaigns.length}`);

    // ¿Los CrmInteraction.email_sent hacen referencia a algún campaignId?
    const sentWithCampaign = await CrmInteraction.countDocuments({ 
        type: 'email_sent', 
        'metadata.campaignId': { $nin: [null, undefined] } 
    });
    console.log(`  CrmInteraction email_sent CON campaignId: ${sentWithCampaign}`);

    // ¿Hay campo metadata.emailSequenceId?
    const sentWithSequence = await CrmInteraction.countDocuments({
        type: 'email_sent',
        'metadata.emailSequenceId': { $nin: [null, undefined] }
    });
    console.log(`  CrmInteraction email_sent CON emailSequenceId: ${sentWithSequence}`);

    // ═══════════════════════════════════════════════════════
    // 6. SCORES INFLADOS (cuántos en 100)
    // ═══════════════════════════════════════════════════════
    console.log('\n\n═══ 6. DISTRIBUCIÓN DE SCORES ═══\n');
    
    const scoreDistro = await CrmLead.aggregate([
        { $bucket: {
            groupBy: '$score',
            boundaries: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 101],
            default: 'other',
            output: { count: { $sum: 1 } }
        }}
    ]);
    for (const b of scoreDistro) {
        const label = b._id === 'other' ? 'other' : `${b._id}-${b._id + 9}`;
        console.log(`  Score ${label}: ${b.count} leads`);
    }

    const score100 = await CrmLead.countDocuments({ score: 100 });
    console.log(`\n  Leads con score EXACTO 100: ${score100}`);

    // Leads con score 100 que tienen 0 opens y 0 clicks
    const score100noEngagement = await CrmLead.countDocuments({ 
        score: 100, 
        $or: [
            { 'emailEngagement.totalOpened': 0 },
            { 'emailEngagement.totalOpened': { $exists: false } }
        ]
    });
    console.log(`  Score 100 pero 0 opens: ${score100noEngagement}`);

    // ═══════════════════════════════════════════════════════
    // 7. UNSUBSCRIBE CHECK
    // ═══════════════════════════════════════════════════════
    console.log('\n\n═══ 7. SISTEMA DE UNSUBSCRIBE ═══\n');

    const totalUnsub = await CrmLead.countDocuments({ 'emailPreferences.unsubscribed': true });
    const totalBounced = await CrmLead.countDocuments({ 'emailPreferences.bounced': true });
    const bouncedEvents = await EmailTrackingEvent.countDocuments({ eventType: 'bounced' });
    console.log(`  Leads marcados unsubscribed: ${totalUnsub}`);
    console.log(`  Leads marcados bounced: ${totalBounced}`);
    console.log(`  EmailTrackingEvent bounced: ${bouncedEvents}`);

    // ¿Los bounced de EmailTrackingEvent actualizaron el lead?
    const bouncedEmails = await EmailTrackingEvent.find({ eventType: 'bounced' }, { recipient: 1, bounceType: 1, bounceMessage: 1, crmLead: 1 }).lean();
    console.log(`\n  Detalle de bounces:`);
    for (const b of bouncedEmails) {
        const lead = await CrmLead.findById(b.crmLead).populate('leadRef', 'email').lean();
        const isBounced = lead?.emailPreferences?.bounced || false;
        console.log(`    ${lead?.leadRef?.email || b.recipient} | Tipo: ${b.bounceType} | Lead bounced flag: ${isBounced} | ${!isBounced ? '⚠️ NO SINCRONIZADO' : '✅'}`);
    }

    // ═══════════════════════════════════════════════════════
    // 8. TrackedLinks - análisis
    // ═══════════════════════════════════════════════════════
    console.log('\n\n═══ 8. TRACKED LINKS ANÁLISIS ═══\n');

    const totalLinks = await TrackedLink.countDocuments();
    const linksWithClicks = await TrackedLink.countDocuments({ clickCount: { $gt: 0 } });
    const linksNoLead = await TrackedLink.countDocuments({ crmLead: null });
    console.log(`  Total tracked links: ${totalLinks}`);
    console.log(`  Con clicks: ${linksWithClicks}`);
    console.log(`  Sin crmLead vinculado: ${linksNoLead}`);

    // ═══════════════════════════════════════════════════════
    // 9. RESUMEN DE ACCIONES NECESARIAS
    // ═══════════════════════════════════════════════════════
    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('  RESUMEN: ACCIONES TÉCNICAS NECESARIAS');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('FIX 1 — Marcar leads de prueba:');
    console.log(`  ${suspectedTestLeads.length} leads detectados automáticamente (miseal, test, etc.)`);
    console.log('  Acción: Agregar tag "test_account", excluir de métricas reales\n');

    console.log('FIX 2 — Eliminar CrmInteraction duplicados:');
    console.log(`  ${dupCheck.length} combinaciones lead+asunto con envíos repetidos`);
    console.log('  Acción: Deduplicar conservando el que tiene emailId\n');

    console.log('FIX 3 — Vincular emailId en opens/clicks:');
    console.log(`  ${openNoId} opens sin emailId de ${openNoId + openWithId} totales`);
    console.log('  Acción: Cruzar EmailTrackingEvent.opened con CrmInteraction por lead+fecha\n');

    console.log('FIX 4 — Sincronizar métricas de campaña:');
    console.log(`  ${campaignsWithZeroMetrics}/${campaigns.length} campañas con métricas en 0`);
    console.log('  Acción: Recalcular metricas desde EmailTrackingEvent + CrmInteraction\n');

    console.log('FIX 5 — Sincronizar bounces en leads:');
    console.log(`  ${bouncedEvents} bounces pero solo ${totalBounced} leads marcados`);
    console.log('  Acción: Propagar emailPreferences.bounced = true\n');

    console.log('FIX 6 — Recalibrar scores:');
    console.log(`  ${score100} leads con score 100 (${score100noEngagement} sin opens)`);
    console.log('  Acción: Reset y recálculo basado en engagement real\n');

    console.log('FIX 7 — Limpiar EmailTrackingEvent huérfanos:');
    console.log(`  ${orphanedEvents} eventos sin CrmInteraction válido`);
    console.log('  Acción: Reasociar o eliminar\n');

    console.log('FIX 8 — Actualizar estado de campañas:');
    console.log('  Todas en "borrador" pero los emails se enviaron');
    console.log('  Acción: Marcar como enviado las que ya se usaron\n');

    console.log('FIX 9 — Recalcular emailEngagement de todos los leads:');
    console.log('  Engagement level debe reflejar datos reales post-limpieza');
    console.log('  Acción: Rebuild completo desde CrmInteraction limpios\n');

    await mongoose.disconnect();
    console.log('✅ Diagnóstico completo.');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
