/**
 * Script diagnóstico para verificar estado de leads y usuarios
 * para dastorga.consultoria@yahoo.com y danielaastorga@gmail.com
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
    await mongoose.connect(process.env.MONGO_URI);
    
    const Lead = require('./models/Lead');
    const User = require('./models/User');
    const CrmLead = require('./crm/models/CrmLead');
    
    const emails = [
        'dastorga.consultoria@yahoo.com',
        'danielaastorga@gmail.com'
    ];
    
    for (const email of emails) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📧 DIAGNÓSTICO: ${email}`);
        console.log('='.repeat(60));
        
        // 1. Buscar en Lead (core)
        const lead = await Lead.findOne({ email: email.toLowerCase() });
        console.log('\n--- LEAD (core) ---');
        if (lead) {
            console.log('  ID:', lead._id);
            console.log('  Nombre:', lead.name);
            console.log('  Email:', lead.email);
            console.log('  Tipo:', lead.type);
            console.log('  Status:', lead.status);
            console.log('  WhatsApp:', lead.whatsapp);
            console.log('  Source:', lead.source);
            console.log('  UTM Source:', lead.utmSource);
            console.log('  UTM Medium:', lead.utmMedium);
            console.log('  UTM Campaign:', lead.utmCampaign);
            console.log('  Country:', lead.country);
            console.log('  Timezone:', lead.timezone);
            console.log('  Tracking Data:', JSON.stringify(lead.trackingData));
            console.log('  Creado:', lead.createdAt);
            console.log('  Actualizado:', lead.updatedAt);
        } else {
            console.log('  ❌ NO encontrado en colección Lead');
        }
        
        // 2. Buscar en CrmLead
        let crmLead = null;
        if (lead) {
            crmLead = await CrmLead.findOne({ leadRef: lead._id });
        }
        // También buscar por email directamente en CrmLead si tiene campo email
        const crmLeadByEmail = await CrmLead.findOne({ 'cachedData.email': email.toLowerCase() }).catch(() => null);
        
        console.log('\n--- CRM LEAD ---');
        if (crmLead) {
            console.log('  ID:', crmLead._id);
            console.log('  LeadRef:', crmLead.leadRef);
            console.log('  Score:', crmLead.score);
            console.log('  Segment:', crmLead.segment);
            console.log('  Lifecycle:', crmLead.lifecycleStage);
            console.log('  Pipeline Student:', JSON.stringify(crmLead.pipelineStudent));
            console.log('  Pipeline Teacher:', JSON.stringify(crmLead.pipelineTeacher));
            console.log('  Attribution:', JSON.stringify(crmLead.attribution));
            console.log('  Creado:', crmLead.createdAt);
        } else if (crmLeadByEmail) {
            console.log('  Encontrado por email cached:', crmLeadByEmail._id);
            console.log('  LeadRef:', crmLeadByEmail.leadRef);
        } else {
            console.log('  ❌ NO encontrado en colección CrmLead');
        }
        
        // 3. Buscar en User
        const user = await User.findOne({ email: email.toLowerCase() });
        console.log('\n--- USER ---');
        if (user) {
            console.log('  ID:', user._id);
            console.log('  Nombre:', user.name, user.lastName);
            console.log('  Email:', user.email);
            console.log('  Rol:', user.role);
            console.log('  Kit Purchased:', user.kitPurchased);
            console.log('  Classes Remaining:', user.classesRemaining);
            console.log('  Stripe Customer:', user.stripeCustomerId);
            console.log('  Subscription Status:', user.teacherData?.subscriptionStatus);
            console.log('  Creado:', user.createdAt);
        } else {
            console.log('  ❌ NO encontrado en colección User');
        }
    }
    
    // 4. Verificar últimos leads creados
    console.log(`\n${'='.repeat(60)}`);
    console.log('📋 ÚLTIMOS 10 LEADS CREADOS');
    console.log('='.repeat(60));
    const recentLeads = await Lead.find().sort({ createdAt: -1 }).limit(10);
    recentLeads.forEach((l, i) => {
        console.log(`  ${i+1}. ${l.email} | tipo: ${l.type} | status: ${l.status} | ${l.createdAt?.toISOString()}`);
    });
    
    // 5. Verificar últimos CrmLeads creados
    console.log(`\n${'='.repeat(60)}`);
    console.log('📋 ÚLTIMOS 10 CRM LEADS CREADOS');
    console.log('='.repeat(60));
    const recentCrmLeads = await CrmLead.find().sort({ createdAt: -1 }).limit(10).populate('leadRef');
    recentCrmLeads.forEach((cl, i) => {
        const email = cl.leadRef?.email || cl.cachedData?.email || 'N/A';
        console.log(`  ${i+1}. ${email} | score: ${cl.score} | segment: ${cl.segment} | ${cl.createdAt?.toISOString()}`);
    });
    
    await mongoose.disconnect();
}

check().catch(e => { console.error(e); process.exit(1); });
