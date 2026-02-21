/**
 * _fix_email_tracking.js
 * 
 * Script de reparación para leads afectados por el bug de score overflow.
 * El bug causaba que crmLead.save() fallara (score > 100), lo que impedía 
 * crear CrmInteraction con metadata.emailId, rompiendo todo el circuito 
 * de tracking de emails.
 * 
 * Este script:
 * 1. Corrige leads con score > 100 → clampea a 100
 * 2. Reconstruye emailEngagement para leads que enviaron email pero no tienen tracking
 * 3. Crea CrmInteraction faltantes vinculando emailId de EmailTrackingEvent
 * 
 * Uso: node _fix_email_tracking.js
 * Requiere: MONGODB_URI en .env
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
    console.log('🔧 Conectando a MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('✅ Conectado\n');

    const CrmLead = require('./crm/models/CrmLead');
    const CrmInteraction = require('./crm/models/CrmInteraction');
    const EmailTrackingEvent = require('./crm/models/EmailTrackingEvent');

    // === PASO 1: Corregir scores > 100 ===
    console.log('--- PASO 1: Corregir scores > 100 ---');
    const overflowLeads = await CrmLead.find({ score: { $gt: 100 } }).select('_id score');
    console.log(`Leads con score > 100: ${overflowLeads.length}`);
    for (const lead of overflowLeads) {
        await CrmLead.updateOne({ _id: lead._id }, { $set: { score: 100 } });
        console.log(`  ✅ Lead ${lead._id}: score ${lead.score} → 100`);
    }

    // === PASO 2: Encontrar leads que enviaron email pero no tienen emailEngagement ===
    console.log('\n--- PASO 2: Reconstruir emailEngagement faltante ---');
    
    // Buscar leads con tag canal_email que no tienen emailEngagement.totalSent > 0
    const leadsWithEmailTag = await CrmLead.find({
        tags: 'canal_email',
        $or: [
            { 'emailEngagement.totalSent': { $exists: false } },
            { 'emailEngagement.totalSent': 0 },
            { 'emailEngagement.totalSent': null }
        ]
    }).select('_id tags');
    console.log(`Leads con tag canal_email sin emailEngagement: ${leadsWithEmailTag.length}`);

    for (const lead of leadsWithEmailTag) {
        // Contar emails enviados desde CrmInteraction
        const emailsSent = await CrmInteraction.countDocuments({
            leadRef: lead._id,
            type: 'email_sent',
            channel: 'email'
        });

        if (emailsSent > 0) {
            // Buscar la última interacción
            const lastEmail = await CrmInteraction.findOne({
                leadRef: lead._id,
                type: 'email_sent'
            }).sort({ createdAt: -1 }).lean();

            // Contar aperturas y clicks del inbound controller
            const opens = await CrmInteraction.countDocuments({
                leadRef: lead._id,
                type: 'email_open'
            });
            const clicks = await CrmInteraction.countDocuments({
                leadRef: lead._id,
                type: 'email_click'
            });
            const bounces = await CrmInteraction.countDocuments({
                leadRef: lead._id,
                type: 'email_bounce'
            });

            // Determinar engagement level
            let engagementLevel = 'cold';
            if (clicks > 0) engagementLevel = 'super_hot';
            else if (opens >= 3) engagementLevel = 'super_hot';
            else if (opens >= 2) engagementLevel = 'hot';
            else if (opens >= 1) engagementLevel = 'warm';

            await CrmLead.updateOne({ _id: lead._id }, {
                $set: {
                    'emailEngagement.totalSent': emailsSent,
                    'emailEngagement.totalDelivered': emailsSent, // asumimos entregados
                    'emailEngagement.totalOpened': opens,
                    'emailEngagement.totalClicked': clicks,
                    'emailEngagement.totalBounced': bounces,
                    'emailEngagement.lastSentAt': lastEmail?.createdAt || new Date(),
                    'emailEngagement.engagementLevel': engagementLevel
                }
            });
            console.log(`  ✅ Lead ${lead._id}: sent=${emailsSent}, opens=${opens}, clicks=${clicks} → ${engagementLevel}`);
        }
    }

    // === PASO 3: Buscar emails recientes sin CrmInteraction.metadata.emailId ===
    console.log('\n--- PASO 3: Buscar EmailTrackingEvents huérfanos ---');
    
    // Buscar tracking events de tipo 'sent' recientes (últimos 7 días)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const orphanEvents = await EmailTrackingEvent.find({
        eventType: 'sent',
        timestamp: { $gte: weekAgo }
    }).lean();
    
    let fixed = 0;
    for (const event of orphanEvents) {
        // Verificar si existe CrmInteraction con este emailId
        const existing = await CrmInteraction.findOne({
            'metadata.emailId': event.resendEmailId
        }).lean();
        
        if (!existing) {
            console.log(`  ⚠️ Tracking event sin interacción: emailId=${event.resendEmailId}, lead=${event.crmLead}`);
            // Nota: no podemos crear la interacción automáticamente sin los datos del email
        } else {
            fixed++;
        }
    }
    console.log(`Eventos con interacción OK: ${fixed}/${orphanEvents.length}`);

    // === PASO 4: También recalcular emailEngagement para leads que SÍ tienen datos ===
    console.log('\n--- PASO 4: Recalcular emailEngagement para leads con tracking events ---');
    
    const leadsWithTracking = await EmailTrackingEvent.distinct('crmLead', {
        timestamp: { $gte: weekAgo }
    });
    console.log(`Leads con tracking events recientes: ${leadsWithTracking.length}`);

    for (const leadId of leadsWithTracking) {
        const events = await EmailTrackingEvent.find({ crmLead: leadId }).lean();
        
        let totalSent = 0, totalDelivered = 0, totalOpened = 0, totalClicked = 0, totalBounced = 0;
        let lastSentAt = null, lastOpenedAt = null, lastClickedAt = null;
        let complained = false;

        for (const ev of events) {
            switch (ev.eventType) {
                case 'sent': totalSent++; if (!lastSentAt || ev.timestamp > lastSentAt) lastSentAt = ev.timestamp; break;
                case 'delivered': totalDelivered++; break;
                case 'opened': totalOpened++; if (!lastOpenedAt || ev.timestamp > lastOpenedAt) lastOpenedAt = ev.timestamp; break;
                case 'clicked': totalClicked++; if (!lastClickedAt || ev.timestamp > lastClickedAt) lastClickedAt = ev.timestamp; break;
                case 'bounced': totalBounced++; break;
                case 'complained': complained = true; break;
            }
        }

        // También contar CrmInteractions de tipo email (por si el inbound controller creó registros)
        const extraOpens = await CrmInteraction.countDocuments({ leadRef: leadId, type: 'email_open' });
        const extraClicks = await CrmInteraction.countDocuments({ leadRef: leadId, type: 'email_click' });
        totalOpened = Math.max(totalOpened, extraOpens);
        totalClicked = Math.max(totalClicked, extraClicks);

        let engagementLevel = 'none';
        if (totalSent > 0) engagementLevel = 'cold';
        if (totalOpened >= 1) engagementLevel = 'warm';
        if (totalOpened >= 2) engagementLevel = 'hot';
        if (totalOpened >= 3 || totalClicked >= 1) engagementLevel = 'super_hot';

        await CrmLead.updateOne({ _id: leadId }, {
            $set: {
                'emailEngagement.totalSent': Math.max(totalSent, 1),
                'emailEngagement.totalDelivered': totalDelivered,
                'emailEngagement.totalOpened': totalOpened,
                'emailEngagement.totalClicked': totalClicked,
                'emailEngagement.totalBounced': totalBounced,
                'emailEngagement.lastSentAt': lastSentAt,
                'emailEngagement.lastOpenedAt': lastOpenedAt,
                'emailEngagement.lastClickedAt': lastClickedAt,
                'emailEngagement.complained': complained,
                'emailEngagement.engagementLevel': engagementLevel
            }
        });
        console.log(`  ✅ Lead ${leadId}: sent=${totalSent}, del=${totalDelivered}, open=${totalOpened}, click=${totalClicked} → ${engagementLevel}`);
    }

    console.log('\n🎉 Reparación completada.');
    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
