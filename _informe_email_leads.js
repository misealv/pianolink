/**
 * _informe_email_leads.js
 * Informe completo de desempeño de emails y probabilidad de compra de Kit.
 * Uso: node _informe_email_leads.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('✅ Conectado a MongoDB\n');

    require('./models/Lead');
    const Lead = mongoose.model('Lead');
    const CrmLead = require('./crm/models/CrmLead');
    const CrmInteraction = require('./crm/models/CrmInteraction');
    const EmailTrackingEvent = require('./crm/models/EmailTrackingEvent');
    const CrmEmailCampaign = require('./crm/models/CrmEmailCampaign');
    const CrmInboundEmail = require('./crm/models/CrmInboundEmail');

    // ═══════════════════════════════════════════════════════════════
    // 1. RESUMEN GLOBAL DE CAMPAÑAS
    // ═══════════════════════════════════════════════════════════════
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  INFORME COMPLETO — EMAIL MARKETING PIANOLINK           ║');
    console.log('║  Fecha: ' + new Date().toISOString().slice(0, 10) + '                                    ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    // --- Campañas ---
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  SECCIÓN 1: CAMPAÑAS REGISTRADAS Y MÉTRICAS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const campaigns = await CrmEmailCampaign.find({}).sort({ ordenSecuencia: 1 }).lean();
    let totalSentGlobal = 0, totalOpenGlobal = 0, totalClickGlobal = 0, totalBounceGlobal = 0;

    for (const c of campaigns) {
        const m = c.metricas || {};
        totalSentGlobal += m.totalEnviados || 0;
        totalOpenGlobal += m.totalAbiertos || 0;
        totalClickGlobal += m.totalClicks || 0;
        totalBounceGlobal += m.totalRebotes || 0;

        const openRate = m.totalEnviados > 0 ? ((m.totalAbiertos || 0) / m.totalEnviados * 100).toFixed(1) : '—';
        const ctr = m.totalEnviados > 0 ? ((m.totalClicks || 0) / m.totalEnviados * 100).toFixed(1) : '—';
        console.log(`\n📧 [#${c.ordenSecuencia || '?'}] ${c.nombre}`);
        console.log(`   Asunto: ${c.asunto}`);
        console.log(`   Estado: ${c.estado} | Tipo: ${c.tipo}`);
        console.log(`   Enviados: ${m.totalEnviados || 0} | Abiertos: ${m.totalAbiertos || 0} (${openRate}%) | Clicks: ${m.totalClicks || 0} (CTR ${ctr}%) | Rebotes: ${m.totalRebotes || 0}`);
    }

    console.log(`\n📊 TOTALES GLOBALES:`);
    console.log(`   Enviados: ${totalSentGlobal} | Abiertos: ${totalOpenGlobal} (${totalSentGlobal ? (totalOpenGlobal/totalSentGlobal*100).toFixed(1) : 0}%) | Clicks: ${totalClickGlobal} | Rebotes: ${totalBounceGlobal}`);

    // ═══════════════════════════════════════════════════════════════
    // 2. VERIFICACIÓN REAL VÍA TRACKING EVENTS (Resend webhooks)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  SECCIÓN 2: EVENTOS REALES DE RESEND (webhooks)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const eventCounts = await EmailTrackingEvent.aggregate([
        { $group: { _id: '$eventType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]);
    console.log('\nDistribución de eventos reales:');
    eventCounts.forEach(e => console.log(`   ${e._id}: ${e.count}`));

    // Clicks con URLs
    const clicksByUrl = await EmailTrackingEvent.aggregate([
        { $match: { eventType: 'clicked', clickedUrl: { $ne: null } } },
        { $group: { _id: '$clickedUrl', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 }
    ]);
    if (clicksByUrl.length) {
        console.log('\nTop URLs clickeadas:');
        clicksByUrl.forEach(u => console.log(`   ${u.count}x → ${u._id}`));
    }

    // Bounces por tipo
    const bounces = await EmailTrackingEvent.aggregate([
        { $match: { eventType: 'bounced' } },
        { $group: { _id: '$bounceType', count: { $sum: 1 } } }
    ]);
    if (bounces.length) {
        console.log('\nBounces por tipo:');
        bounces.forEach(b => console.log(`   ${b._id || 'desconocido'}: ${b.count}`));
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. ENGAGEMENT POR LEAD — distribución real
    // ═══════════════════════════════════════════════════════════════
    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  SECCIÓN 3: DISTRIBUCIÓN DE ENGAGEMENT DE LEADS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const engagementDist = await CrmLead.aggregate([
        { $match: { 'emailPreferences.unsubscribed': { $ne: true }, 'emailPreferences.bounced': { $ne: true } } },
        { $group: {
            _id: '$emailEngagement.engagementLevel',
            count: { $sum: 1 },
            avgScore: { $avg: '$score' },
            avgOpens: { $avg: '$emailEngagement.totalOpened' },
            avgClicks: { $avg: '$emailEngagement.totalClicked' },
            avgSent: { $avg: '$emailEngagement.totalSent' }
        }},
        { $sort: { count: -1 } }
    ]);
    console.log('\nNivel de engagement (leads activos, sin bounced ni unsub):');
    engagementDist.forEach(e => {
        console.log(`   ${(e._id || 'none').padEnd(10)} → ${e.count} leads | Score prom: ${e.avgScore?.toFixed(0)} | Opens prom: ${e.avgOpens?.toFixed(1)} | Clicks prom: ${e.avgClicks?.toFixed(1)} | Emails recibidos prom: ${e.avgSent?.toFixed(1)}`);
    });

    // Unsubscribed y bounced
    const unsubs = await CrmLead.countDocuments({ 'emailPreferences.unsubscribed': true });
    const bouncedLeads = await CrmLead.countDocuments({ 'emailPreferences.bounced': true });
    console.log(`\n⛔ Desuscritos: ${unsubs} | Rebotados (bounced): ${bouncedLeads}`);

    // ═══════════════════════════════════════════════════════════════
    // 4. EMAILS INBOUND — ¿QUIÉN RESPONDIÓ?
    // ═══════════════════════════════════════════════════════════════
    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  SECCIÓN 4: RESPUESTAS DE LEADS (CrmInboundEmail)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const totalInbound = await CrmInboundEmail.countDocuments({ direction: 'inbound' });
    const totalOutbound = await CrmInboundEmail.countDocuments({ direction: 'outbound' });
    console.log(`\n📬 Total emails inbound (respuestas): ${totalInbound}`);
    console.log(`📤 Total emails outbound (enviados desde CRM): ${totalOutbound}`);

    // Listar respuestas inbound con detalle
    const inboundEmails = await CrmInboundEmail.find({ direction: 'inbound' })
        .sort({ createdAt: -1 })
        .populate({ path: 'leadRef', populate: { path: 'leadRef', select: 'name email type phone' } })
        .lean();

    if (inboundEmails.length) {
        console.log('\n--- Detalle de respuestas recibidas ---');
        for (const email of inboundEmails) {
            const leadName = email.leadRef?.leadRef?.name || email.leadName || '(sin nombre)';
            const leadEmail = email.leadRef?.leadRef?.email || email.from;
            const score = email.leadRef?.score || '?';
            const engagement = email.leadRef?.emailEngagement?.engagementLevel || '?';
            const preview = (email.textBody || '').replace(/\s+/g, ' ').slice(0, 120);
            console.log(`\n  📩 De: ${leadName} <${leadEmail}>`);
            console.log(`     Asunto: ${email.subject}`);
            console.log(`     Fecha: ${email.createdAt?.toISOString?.() || '?'}`);
            console.log(`     Score: ${score} | Engagement: ${engagement}`);
            console.log(`     Preview: "${preview}..."`);
        }
    } else {
        console.log('\n⚠️  No se encontraron respuestas inbound en CrmInboundEmail.');
        console.log('   Verificando si hay interacciones tipo email_reply en CrmInteraction...');
        const replies = await CrmInteraction.find({
            type: { $in: ['email_reply', 'email_response', 'inbound_email'] }
        }).populate('leadRef').lean();
        console.log(`   Interacciones de tipo reply encontradas: ${replies.length}`);
    }

    // Threads con múltiples mensajes (conversaciones reales)
    const threads = await CrmInboundEmail.aggregate([
        { $match: { threadId: { $ne: '' } } },
        { $group: { _id: '$threadId', count: { $sum: 1 }, hasInbound: { $sum: { $cond: [{ $eq: ['$direction', 'inbound'] }, 1, 0] } } } },
        { $match: { hasInbound: { $gte: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
    ]);
    if (threads.length) {
        console.log(`\n📋 Threads con respuestas (top ${threads.length}):`);
        for (const t of threads) {
            const msgs = await CrmInboundEmail.find({ threadId: t._id })
                .sort({ createdAt: 1 })
                .populate({ path: 'leadRef', populate: { path: 'leadRef', select: 'name email' } })
                .lean();
            const leadName = msgs[0]?.leadRef?.leadRef?.name || msgs[0]?.from || '?';
            console.log(`   Thread "${t._id?.slice(0, 30)}..." → ${t.count} msgs (${t.hasInbound} inbound) — ${leadName}`);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 5. TOP LEADS MÁS PROPENSOS A COMPRAR KIT
    // ═══════════════════════════════════════════════════════════════
    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  SECCIÓN 5: LEADS CON MAYOR PROBABILIDAD DE COMPRA');
    console.log('  (Kit de Bienvenida)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Excluir test accounts, bounced, unsub
    const hotLeads = await CrmLead.find({
        'emailPreferences.unsubscribed': { $ne: true },
        'emailPreferences.bounced': { $ne: true },
        tags: { $nin: ['test_account'] },
        $or: [
            { 'emailEngagement.engagementLevel': { $in: ['super_hot', 'hot'] } },
            { 'emailEngagement.totalClicked': { $gte: 1 } },
            { score: { $gte: 20 } }
        ]
    })
    .populate({ path: 'leadRef', select: 'name email type phone city country createdAt source' })
    .sort({ score: -1 })
    .lean();

    // Enriquecer con data de clicks
    console.log(`\n🔥 Total leads hot/super_hot o con clicks o score>=20: ${hotLeads.length}\n`);

    const results = [];
    for (const lead of hotLeads) {
        if (!lead.leadRef) continue;

        // Contar clicks de este lead
        const clickCount = await EmailTrackingEvent.countDocuments({
            crmLead: lead._id,
            eventType: 'clicked'
        });

        // Última apertura
        const lastOpen = await EmailTrackingEvent.findOne({
            crmLead: lead._id,
            eventType: 'opened'
        }).sort({ timestamp: -1 }).lean();

        // Última interacción relevante
        const lastInteraction = await CrmInteraction.findOne({
            leadRef: lead._id,
            type: { $in: ['email_open', 'email_click', 'page_view', 'form_start'] }
        }).sort({ createdAt: -1 }).lean();

        // Tiene respuesta inbound?
        const hasReply = await CrmInboundEmail.countDocuments({
            leadRef: lead._id,
            direction: 'inbound'
        });

        // Calcular un "purchase likelihood score" propio
        let purchaseScore = 0;
        purchaseScore += Math.min(lead.score || 0, 40); // 40 pts máx del CRM score
        purchaseScore += clickCount * 15; // clicks pesan mucho
        purchaseScore += (lead.emailEngagement?.totalOpened || 0) * 3; // opens
        purchaseScore += hasReply * 25; // respondió = altísimo interés
        if (lastOpen) {
            const daysSinceOpen = (Date.now() - new Date(lastOpen.timestamp).getTime()) / 86400000;
            if (daysSinceOpen < 7) purchaseScore += 20;
            else if (daysSinceOpen < 30) purchaseScore += 10;
        }
        if (lead.pipelineStudent && lead.pipelineStudent !== 'lead' && lead.pipelineStudent !== 'lost') {
            purchaseScore += 15;
        }

        results.push({
            name: lead.leadRef.name || '(sin nombre)',
            email: lead.leadRef.email,
            type: lead.leadRef.type || '?',
            phone: lead.leadRef.phone || '',
            city: lead.leadRef.city || '',
            country: lead.leadRef.country || '',
            source: lead.leadRef.source || '',
            crmScore: lead.score,
            engagement: lead.emailEngagement?.engagementLevel || 'none',
            totalSent: lead.emailEngagement?.totalSent || 0,
            totalOpened: lead.emailEngagement?.totalOpened || 0,
            totalClicked: lead.emailEngagement?.totalClicked || 0,
            clickCount,
            hasReply: hasReply > 0,
            pipelineStudent: lead.pipelineStudent || '—',
            segment: lead.segment || 'cold',
            lastOpenDate: lastOpen?.timestamp?.toISOString?.()?.slice(0, 10) || '—',
            lastInteractionType: lastInteraction?.type || '—',
            lastInteractionDate: lastInteraction?.createdAt?.toISOString?.()?.slice(0, 10) || '—',
            tags: (lead.tags || []).join(', '),
            purchaseScore
        });
    }

    // Ordenar por purchase score
    results.sort((a, b) => b.purchaseScore - a.purchaseScore);

    // Mostrar top 40
    console.log('═══ RANKING DE PROBABILIDAD DE COMPRA (Top 40) ═══\n');
    console.log('Pos | PurchaseScore | CRM Score | Engagement | Opens | Clicks | Reply | Pipeline   | Nombre                         | Email                              | Teléfono       | Fuente      | Última apertura | Última interacción');
    console.log('─'.repeat(220));

    const top = results.slice(0, 40);
    top.forEach((r, i) => {
        console.log(
            `${String(i + 1).padStart(3)} | ${String(r.purchaseScore).padStart(13)} | ${String(r.crmScore).padStart(9)} | ${r.engagement.padEnd(10)} | ${String(r.totalOpened).padStart(5)} | ${String(r.clickCount).padStart(6)} | ${r.hasReply ? '  SÍ  ' : '  no  '} | ${(r.pipelineStudent).padEnd(10)} | ${r.name.slice(0, 30).padEnd(30)} | ${r.email.slice(0, 35).padEnd(35)} | ${r.phone.padEnd(14)} | ${r.source.slice(0, 11).padEnd(11)} | ${r.lastOpenDate.padEnd(15)} | ${r.lastInteractionType} (${r.lastInteractionDate})`
        );
    });

    // ═══════════════════════════════════════════════════════════════
    // 6. LEADS QUE RESPONDIERON (respuestas reales)
    // ═══════════════════════════════════════════════════════════════
    const respondedLeads = results.filter(r => r.hasReply);
    if (respondedLeads.length) {
        console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`  SECCIÓN 6: LEADS QUE RESPONDIERON EMAILS (${respondedLeads.length} leads)`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        for (const r of respondedLeads) {
            console.log(`\n  👤 ${r.name} <${r.email}> | Score: ${r.crmScore} | PurchaseScore: ${r.purchaseScore}`);
            console.log(`     Opens: ${r.totalOpened} | Clicks: ${r.clickCount} | Pipeline: ${r.pipelineStudent} | Segment: ${r.segment}`);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 7. RESUMEN EJECUTIVO
    // ═══════════════════════════════════════════════════════════════
    const totalLeads = await CrmLead.countDocuments({});
    const withEmail = await CrmLead.countDocuments({ 'emailEngagement.totalSent': { $gte: 1 } });
    const withOpens = await CrmLead.countDocuments({ 'emailEngagement.totalOpened': { $gte: 1 } });
    const withClicks = await CrmLead.countDocuments({ 'emailEngagement.totalClicked': { $gte: 1 } });

    console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║               RESUMEN EJECUTIVO                          ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`\n  Total CrmLeads en DB:              ${totalLeads}`);
    console.log(`  Leads que recibieron email:         ${withEmail} (${(withEmail/totalLeads*100).toFixed(1)}%)`);
    console.log(`  Leads que abrieron al menos 1:      ${withOpens} (${(withOpens/totalLeads*100).toFixed(1)}%)`);
    console.log(`  Leads que hicieron click:            ${withClicks} (${(withClicks/totalLeads*100).toFixed(1)}%)`);
    console.log(`  Desuscritos:                         ${unsubs}`);
    console.log(`  Bounced:                             ${bouncedLeads}`);
    console.log(`  Respuestas inbound:                  ${totalInbound}`);
    console.log(`  Leads calificados (score>=20):       ${results.length}`);
    console.log(`  Leads con clicks reales:             ${results.filter(r => r.clickCount > 0).length}`);
    console.log(`  Leads que respondieron:              ${respondedLeads.length}`);
    console.log(`\n  🏆 Top 5 candidatos a comprar Kit:`);
    results.slice(0, 5).forEach((r, i) => {
        console.log(`     ${i + 1}. ${r.name} <${r.email}> — PurchaseScore: ${r.purchaseScore} (CRM: ${r.crmScore}, Opens: ${r.totalOpened}, Clicks: ${r.clickCount}, Reply: ${r.hasReply ? 'SÍ' : 'no'})`);
    });

    console.log('\n✅ Informe completo generado.');
    await mongoose.disconnect();
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
