/**
 * _audit_email_campaign.js
 * Auditoría completa de la campaña de emails de PianoLink.
 * Extrae métricas reales de la base de datos para validar engagement.
 * 
 * Uso: node _audit_email_campaign.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('✅ Conectado a MongoDB\n');

    // Registrar modelo Lead primero (requerido por populate)
    require('./models/Lead');
    const CrmLead = require('./crm/models/CrmLead');
    const CrmInteraction = require('./crm/models/CrmInteraction');
    const EmailTrackingEvent = require('./crm/models/EmailTrackingEvent');
    const CrmEmailCampaign = require('./crm/models/CrmEmailCampaign');
    const TrackedLink = require('./crm/models/TrackedLink');

    // ═══════════════════════════════════════════════════════════════
    // 1. RESUMEN GENERAL DE CAMPAÑAS
    // ═══════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  1. CAMPAÑAS DE EMAIL REGISTRADAS');
    console.log('═══════════════════════════════════════════════════════════');
    
    const campaigns = await CrmEmailCampaign.find({}).sort({ ordenSecuencia: 1 }).lean();
    for (const c of campaigns) {
        const m = c.metricas || {};
        console.log(`\n📧 [${c.ordenSecuencia || '-'}] ${c.nombre}`);
        console.log(`   Asunto: ${c.asunto}`);
        console.log(`   Tipo: ${c.tipo} | Modo: ${c.modoEnvio} | Estado: ${c.estado || 'N/A'}`);
        console.log(`   Métricas DB → Enviados: ${m.totalEnviados || 0} | Abiertos: ${m.totalAbiertos || 0} | Clicks: ${m.totalClicks || 0} | Rebotes: ${m.totalRebotes || 0} | Unsub: ${m.totalDesuscripciones || 0}`);
        if (m.totalEnviados > 0) {
            console.log(`   Tasas → Open: ${((m.totalAbiertos || 0) / m.totalEnviados * 100).toFixed(1)}% | CTR: ${((m.totalClicks || 0) / m.totalEnviados * 100).toFixed(1)}% | Bounce: ${((m.totalRebotes || 0) / m.totalEnviados * 100).toFixed(1)}%`);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. EVENTOS DE TRACKING REALES (Resend Webhooks)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('  2. EVENTOS DE TRACKING REALES (EmailTrackingEvent)');
    console.log('═══════════════════════════════════════════════════════════');

    const eventCounts = await EmailTrackingEvent.aggregate([
        { $group: { _id: '$eventType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]);
    console.log('\nDistribución de eventos:');
    eventCounts.forEach(e => console.log(`   ${e._id}: ${e.count}`));

    const totalEvents = eventCounts.reduce((s, e) => s + e.count, 0);
    console.log(`\n   TOTAL EVENTOS: ${totalEvents}`);

    // ═══════════════════════════════════════════════════════════════
    // 3. INTERACCIONES DE EMAIL (CrmInteraction)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('  3. INTERACCIONES DE EMAIL (CrmInteraction)');
    console.log('═══════════════════════════════════════════════════════════');

    const emailInteractions = await CrmInteraction.aggregate([
        { $match: { type: { $regex: /^email_/ } } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]);
    console.log('\nTipos de interacción email:');
    emailInteractions.forEach(e => console.log(`   ${e._id}: ${e.count}`));

    // ═══════════════════════════════════════════════════════════════
    // 4. ENGAGEMENT DE LEADS (real desde emailEngagement)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('  4. ENGAGEMENT DE LEADS');
    console.log('═══════════════════════════════════════════════════════════');

    const engagementDistro = await CrmLead.aggregate([
        { $match: { 'emailEngagement.totalSent': { $gt: 0 } } },
        { $group: { 
            _id: '$emailEngagement.engagementLevel', 
            count: { $sum: 1 },
            avgScore: { $avg: '$score' },
            avgOpens: { $avg: '$emailEngagement.totalOpened' },
            avgClicks: { $avg: '$emailEngagement.totalClicked' }
        }},
        { $sort: { count: -1 } }
    ]);
    console.log('\nDistribución por nivel de engagement:');
    engagementDistro.forEach(e => {
        console.log(`   ${e._id || 'none'}: ${e.count} leads (avg score: ${e.avgScore?.toFixed(0)}, avg opens: ${e.avgOpens?.toFixed(1)}, avg clicks: ${e.avgClicks?.toFixed(1)})`);
    });

    // Total con email enviado
    const totalWithEmail = await CrmLead.countDocuments({ 'emailEngagement.totalSent': { $gt: 0 } });
    const totalOpened = await CrmLead.countDocuments({ 'emailEngagement.totalOpened': { $gt: 0 } });
    const totalClicked = await CrmLead.countDocuments({ 'emailEngagement.totalClicked': { $gt: 0 } });
    const totalBounced = await CrmLead.countDocuments({ 'emailEngagement.totalBounced': { $gt: 0 } });
    const totalUnsub = await CrmLead.countDocuments({ 'emailPreferences.unsubscribed': true });
    const totalComplained = await CrmLead.countDocuments({ 'emailEngagement.complained': true });
    
    console.log(`\n   Total leads con email enviado: ${totalWithEmail}`);
    console.log(`   Abrieron al menos 1: ${totalOpened} (${(totalOpened/totalWithEmail*100).toFixed(1)}%)`);
    console.log(`   Clickearon al menos 1: ${totalClicked} (${(totalClicked/totalWithEmail*100).toFixed(1)}%)`);
    console.log(`   Rebotaron: ${totalBounced} (${(totalBounced/totalWithEmail*100).toFixed(1)}%)`);
    console.log(`   Desuscritos: ${totalUnsub}`);
    console.log(`   Complaints: ${totalComplained}`);

    // ═══════════════════════════════════════════════════════════════
    // 5. LEADS HOT Y SUPER_HOT (los que están respondiendo)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('  5. LEADS HOT & SUPER_HOT (leads que responden)');
    console.log('═══════════════════════════════════════════════════════════');

    const hotLeads = await CrmLead.find({
        'emailEngagement.engagementLevel': { $in: ['hot', 'super_hot'] }
    }).populate('leadRef', 'name email type phone country').sort({ score: -1 }).lean();

    console.log(`\nTotal leads calientes: ${hotLeads.length}`);
    for (const lead of hotLeads) {
        const ref = lead.leadRef || {};
        const eng = lead.emailEngagement || {};
        console.log(`\n  🔥 ${ref.name || 'Sin nombre'} <${ref.email || 'N/A'}>`);
        console.log(`     Tipo: ${ref.type || 'N/A'} | País: ${ref.country || 'N/A'} | Tel: ${ref.phone || 'N/A'}`);
        console.log(`     Score: ${lead.score} | Segment: ${lead.segment} | Pipeline: ${lead.pipelineStudent || lead.pipelineTeacher || 'N/A'}`);
        console.log(`     Email → Enviados: ${eng.totalSent} | Abiertos: ${eng.totalOpened} | Clicks: ${eng.totalClicked}`);
        console.log(`     Último open: ${eng.lastOpenedAt ? new Date(eng.lastOpenedAt).toISOString().slice(0,10) : 'nunca'} | Último click: ${eng.lastClickedAt ? new Date(eng.lastClickedAt).toISOString().slice(0,10) : 'nunca'}`);
        console.log(`     Level: ${eng.engagementLevel} | Tags: [${(lead.tags || []).join(', ')}]`);
    }

    // ═══════════════════════════════════════════════════════════════
    // 6. LEADS WARM (oportunidad de calentamiento)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('  6. LEADS WARM (oportunidad intermedia)');
    console.log('═══════════════════════════════════════════════════════════');

    const warmLeads = await CrmLead.find({
        'emailEngagement.engagementLevel': 'warm'
    }).populate('leadRef', 'name email type phone country').sort({ score: -1 }).lean();

    console.log(`\nTotal leads warm: ${warmLeads.length}`);
    for (const lead of warmLeads) {
        const ref = lead.leadRef || {};
        const eng = lead.emailEngagement || {};
        console.log(`  🌡️  ${ref.name || 'Sin nombre'} <${ref.email || 'N/A'}> | Score: ${lead.score} | Opens: ${eng.totalOpened} | Clicks: ${eng.totalClicked} | Último open: ${eng.lastOpenedAt ? new Date(eng.lastOpenedAt).toISOString().slice(0,10) : '-'}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // 7. TRACKED LINKS - CLICKS REALES
    // ═══════════════════════════════════════════════════════════════
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('  7. TRACKED LINKS - CLICKS REALES');
    console.log('═══════════════════════════════════════════════════════════');

    const trackedLinks = await TrackedLink.find({ clickCount: { $gt: 0 } })
        .populate('crmLead')
        .sort({ clickCount: -1 })
        .lean();
    
    console.log(`\nLinks con al menos 1 click: ${trackedLinks.length}`);
    for (const link of trackedLinks.slice(0, 30)) {
        console.log(`  🔗 ${link.destinationUrl?.slice(0, 80)} → ${link.clickCount} clicks | First: ${link.firstClickAt ? new Date(link.firstClickAt).toISOString().slice(0,10) : '-'} | Last: ${link.lastClickAt ? new Date(link.lastClickAt).toISOString().slice(0,10) : '-'}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // 8. VALIDACIÓN: ¿ALUCINACIÓN O REAL?
    // ═══════════════════════════════════════════════════════════════
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('  8. VALIDACIÓN DE DATOS (¿es real o alucinación?)');
    console.log('═══════════════════════════════════════════════════════════');

    // Verificar si hay opens sin emailId real (podrían ser bots)
    const opensWithoutEmailId = await CrmInteraction.countDocuments({
        type: 'email_open',
        'metadata.emailId': { $in: ['', null] }
    });
    const totalOpens = await CrmInteraction.countDocuments({ type: 'email_open' });
    console.log(`\nOpens totales: ${totalOpens} | Sin emailId vinculado: ${opensWithoutEmailId}`);

    // Verificar EmailTrackingEvent vs CrmInteraction consistency
    const trackingSent = eventCounts.find(e => e._id === 'sent')?.count || 0;
    const trackingOpened = eventCounts.find(e => e._id === 'opened')?.count || 0;
    const trackingClicked = eventCounts.find(e => e._id === 'clicked')?.count || 0;
    const trackingDelivered = eventCounts.find(e => e._id === 'delivered')?.count || 0;

    const interactionSends = emailInteractions.find(e => e._id === 'email_sent')?.count || 0;
    const interactionOpens = emailInteractions.find(e => e._id === 'email_open')?.count || 0;
    const interactionClicks = emailInteractions.find(e => e._id === 'email_click')?.count || 0;

    console.log('\n--- Comparación de fuentes ---');
    console.log(`   EmailTrackingEvent (webhooks Resend): sent=${trackingSent} delivered=${trackingDelivered} opened=${trackingOpened} clicked=${trackingClicked}`);
    console.log(`   CrmInteraction (sistema interno):     sent=${interactionSends} opened=${interactionOpens} clicked=${interactionClicks}`);
    
    if (trackingOpened > 0 && interactionOpens > 0) {
        const ratio = (interactionOpens / trackingOpened).toFixed(2);
        console.log(`\n   Ratio opens (Interaction/Tracking): ${ratio} — ${ratio > 1.5 ? '⚠️ POSIBLE INFLACIÓN' : ratio < 0.5 ? '⚠️ TRACKING INCOMPLETO' : '✅ CONSISTENTE'}`);
    }

    // Opens recientes (últimos 30 días) para validar actividad real
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentOpens = await EmailTrackingEvent.countDocuments({ 
        eventType: 'opened', 
        timestamp: { $gte: thirtyDaysAgo } 
    });
    const recentClicks = await EmailTrackingEvent.countDocuments({ 
        eventType: 'clicked', 
        timestamp: { $gte: thirtyDaysAgo } 
    });
    console.log(`\n   Últimos 30 días → Opens: ${recentOpens} | Clicks: ${recentClicks}`);

    // Detectar opens de bots (múltiples opens en <2s suelen ser bots/proxies)
    const suspiciousOpens = await EmailTrackingEvent.aggregate([
        { $match: { eventType: 'opened' } },
        { $group: { 
            _id: '$resendEmailId', 
            count: { $sum: 1 }, 
            firstOpen: { $min: '$timestamp' },
            lastOpen: { $max: '$timestamp' }
        }},
        { $addFields: { 
            diffMs: { $subtract: ['$lastOpen', '$firstOpen'] }
        }},
        { $match: { count: { $gte: 3 }, diffMs: { $lt: 5000 } } }
    ]);
    console.log(`   Opens sospechosos (3+ opens en <5s mismo email): ${suspiciousOpens.length} emails`);
    
    // ═══════════════════════════════════════════════════════════════
    // 9. TIMELINE DE ACTIVIDAD RECIENTE
    // ═══════════════════════════════════════════════════════════════
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('  9. ACTIVIDAD RECIENTE (últimos 14 días)');
    console.log('═══════════════════════════════════════════════════════════');

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const recentActivity = await CrmInteraction.find({
        type: { $in: ['email_open', 'email_click', 'email_reply'] },
        createdAt: { $gte: fourteenDaysAgo }
    }).populate({
        path: 'leadRef',
        populate: { path: 'leadRef', select: 'name email' }
    }).sort({ createdAt: -1 }).limit(50).lean();

    console.log(`\nActividad email últimos 14 días: ${recentActivity.length} eventos`);
    for (const act of recentActivity) {
        const leadName = act.leadRef?.leadRef?.name || act.leadRef?.leadRef?.email || 'Lead desconocido';
        const date = new Date(act.createdAt).toISOString().slice(0, 16).replace('T', ' ');
        console.log(`  ${date} | ${act.type.padEnd(15)} | ${leadName} | ${act.metadata?.emailSubject?.slice(0, 50) || ''}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // 10. SEGMENTO GENERAL DE LEADS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('  10. SEGMENTACIÓN GENERAL');
    console.log('═══════════════════════════════════════════════════════════');

    const segmentDistro = await CrmLead.aggregate([
        { $group: { _id: '$segment', count: { $sum: 1 }, avgScore: { $avg: '$score' } } },
        { $sort: { count: -1 } }
    ]);
    console.log('\nSegmentos:');
    segmentDistro.forEach(s => console.log(`   ${s._id}: ${s.count} leads (avg score: ${s.avgScore?.toFixed(0)})`));

    const totalLeads = await CrmLead.countDocuments();
    console.log(`\n   TOTAL LEADS CRM: ${totalLeads}`);

    // Unsubscribes detalle
    const unsubList = await CrmLead.find({ 'emailPreferences.unsubscribed': true })
        .populate('leadRef', 'name email')
        .lean();
    if (unsubList.length > 0) {
        console.log(`\n   📛 Desuscritos (${unsubList.length}):`);
        unsubList.forEach(u => console.log(`      ${u.leadRef?.email || 'N/A'} — ${u.emailPreferences?.unsubscribedAt ? new Date(u.emailPreferences.unsubscribedAt).toISOString().slice(0,10) : 'fecha desconocida'}`));
    }

    console.log('\n\n✅ Auditoría completada.');
    await mongoose.disconnect();
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
