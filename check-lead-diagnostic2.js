/**
 * Script diagnóstico extendido - buscar leads con nombre parcial "astorga"
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
    await mongoose.connect(process.env.MONGO_URI);
    
    const Lead = require('./models/Lead');
    const User = require('./models/User');
    const CrmLead = require('./crm/models/CrmLead');
    
    // Buscar por regex todos los emails con "astorga"
    console.log('=== LEADS con "astorga" en email ===');
    const leads = await Lead.find({ email: { $regex: /astorga/i } });
    leads.forEach(l => {
        console.log(`  ${l.email} | tipo: ${l.type} | status: ${l.status} | creado: ${l.createdAt?.toISOString()}`);
        console.log(`    ID: ${l._id} | name: ${l.name} | whatsapp: ${l.whatsapp}`);
        console.log(`    trackingData: ${JSON.stringify(l.trackingData)}`);
    });
    
    console.log('\n=== USERS con "astorga" en email ===');
    const users = await User.find({ email: { $regex: /astorga/i } });
    users.forEach(u => {
        console.log(`  ${u.email} | rol: ${u.role} | name: ${u.name} ${u.lastName}`);
        console.log(`    ID: ${u._id} | kitPurchased: ${u.kitPurchased} | stripeCustomerId: ${u.stripeCustomerId}`);
        console.log(`    creado: ${u.createdAt?.toISOString()}`);
    });
    
    console.log('\n=== CRM LEADS con "astorga" en cachedData.email ===');
    const crmLeads = await CrmLead.find({ 'cachedData.email': { $regex: /astorga/i } });
    crmLeads.forEach(cl => {
        console.log(`  CrmLead ID: ${cl._id}`);
        console.log(`    leadRef: ${cl.leadRef}`);
        console.log(`    cachedData: ${JSON.stringify(cl.cachedData)}`);
        console.log(`    score: ${cl.score} | segment: ${cl.segment} | lifecycle: ${cl.lifecycleStage}`);
        console.log(`    pipelineStudent: ${JSON.stringify(cl.pipelineStudent)}`);
        console.log(`    pipelineTeacher: ${JSON.stringify(cl.pipelineTeacher)}`);
        console.log(`    creado: ${cl.createdAt?.toISOString()}`);
    });
    
    // Verificar el CrmLead con ID 6994f160bc760c972f52d4ab
    console.log('\n=== CRM LEAD 6994f160bc760c972f52d4ab (detalle) ===');
    const specificCrm = await CrmLead.findById('6994f160bc760c972f52d4ab');
    if (specificCrm) {
        console.log(JSON.stringify(specificCrm.toObject(), null, 2));
    } else {
        console.log('  No encontrado');
    }
    
    // Verificar lead 6973ca6d4a345ddd7787f4e5
    console.log('\n=== LEAD core 6973ca6d4a345ddd7787f4e5 (detalle) ===');
    const specificLead = await Lead.findById('6973ca6d4a345ddd7787f4e5');
    if (specificLead) {
        console.log(JSON.stringify(specificLead.toObject(), null, 2));
    } else {
        console.log('  No encontrado (posiblemente eliminado)');
    }
    
    // Buscar CrmLeads que referencíen a los leads de astorga
    console.log('\n=== CRM LEADS que apuntan a leads "astorga" ===');
    for (const lead of leads) {
        const crm = await CrmLead.findOne({ leadRef: lead._id });
        if (crm) {
            console.log(`  Lead ${lead.email} (${lead._id}) → CrmLead ${crm._id} | score: ${crm.score}`);
        } else {
            console.log(`  Lead ${lead.email} (${lead._id}) → ❌ SIN CrmLead`);
        }
    }
    
    // Verificar WelcomeKits
    const WelcomeKit = require('./models/WelcomeKit');
    console.log('\n=== WELCOME KITS con "astorga" ===');
    const kits = await WelcomeKit.find({ clientEmail: { $regex: /astorga/i } });
    kits.forEach(k => {
        console.log(`  ${k.clientEmail} | tipo: ${k.kitType} | status: ${k.overallStatus}`);
        console.log(`    clientName: ${k.clientName} | payment: ${JSON.stringify(k.payment)}`);
        console.log(`    creado: ${k.createdAt?.toISOString()}`);
    });
    
    await mongoose.disconnect();
}

check().catch(e => { console.error(e); process.exit(1); });
